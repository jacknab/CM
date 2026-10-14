import { syncEngine } from "./sync-engine";

/**
 * No tap on the salon screens may hang waiting for a server that cannot be reached.
 *
 * With the salon's Wi-Fi up and the internet down, a request does not fail — it waits, sometimes a minute or
 * more, before the browser gives up, and every offline fallback behind it waits too. On the salon screens
 * (/nail, /barber, /kiosk, /frontdesk) every request to our own API therefore:
 *  - fails at once while the server is known to be unreachable, so the caller's offline path runs straight away;
 *  - is given a deadline otherwise, after which it fails like a dropped connection and the tablet is marked offline.
 * A request that timed out may still have reached the server; the offline paths resend under the same
 * idempotency key, so nothing is done twice.
 *
 * Not given a deadline: the card reader's server steps (a card may be mid-charge) and the cash drawer / Day Close
 * (its report can be slow on a busy server, and must not be abandoned halfway). The heartbeat has its own.
 */
const READ_DEADLINE_MS = 12_000;
const WRITE_DEADLINE_MS = 20_000;
const SALON_SCREENS = /^\/(nail|barber|kiosk|frontdesk)(\/|$)/;
const NO_SHORTCUT = /^\/api\/sync\/heartbeat/;
const NO_DEADLINE = /^\/api\/(sync\/heartbeat|payments\/|cash-drawer)/;

/**
 * 502 / 503 / 504 from nginx: the app behind it is not running. Our own app's answers are JSON (including its
 * own 503s, which mean "try again" and are treated the same way by the offline paths); nginx's are HTML.
 */
export function isGatewayFailure(res: Response): boolean {
  return res.status >= 502 && res.status <= 504 && !(res.headers.get("content-type") ?? "").includes("application/json");
}

/** The path of a request to this app's own API, or null for anything else. */
function apiPath(input: RequestInfo | URL): string | null {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/") ? url.pathname : null;
  } catch {
    return null;
  }
}

let installed = false;

export function installRequestDeadline(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = apiPath(input);
    if (!path || !SALON_SCREENS.test(window.location.pathname)) return original(input, init);
    if (!NO_SHORTCUT.test(path) && syncEngine.isOffline()) {
      return Promise.reject(new TypeError("The server cannot be reached"));
    }
    if (NO_DEADLINE.test(path)) return original(input, init);

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const ctrl = new AbortController();
    // A caller's own cancel still cancels.
    const outer = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason);
      else outer.addEventListener("abort", () => ctrl.abort(outer.reason), { once: true });
    }
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, method === "GET" ? READ_DEADLINE_MS : WRITE_DEADLINE_MS);
    return original(input, { ...init, signal: ctrl.signal }).then(
      (res) => {
        clearTimeout(timer);
        // The web server in front of the app answering for it (the app is down, restarting, or the VPS is still
        // booting): that is the server being unreachable, not an answer — work from the device.
        if (isGatewayFailure(res)) {
          syncEngine.noteUnreachable();
          throw new TypeError(`The server is not answering (${res.status})`);
        }
        return res;
      },
      (err) => {
        clearTimeout(timer);
        if (timedOut) {
          syncEngine.noteUnreachable();
          throw new TypeError("The server did not answer in time");
        }
        if (err instanceof TypeError) syncEngine.noteUnreachable();
        throw err;
      },
    );
  };
}
