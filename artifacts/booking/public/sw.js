const CACHE_NAME = "certxa-app-v7";

// ── Starting the staff screens with no network ───────────────────────────────
// The app page is still ALWAYS fetched from the network when there is one (see below). The copy kept here is
// only ever used when that fetch fails outright, and only for the staff screens a salon tablet opens. It is
// the page this device last loaded, so the script files it names are the ones this device already has cached.
const SHELL_CACHE = "certxa-shell-v1";
const SHELL_KEY = "/__offline_shell__";
// The kiosk and the customer screen too: a kiosk-locked tablet restarting (3 AM) while the server is down
// must come back as the kiosk, working through the POS tablet, not as a "You're offline" page.
const OFFLINE_START = ["/app-login", "/nail", "/barber", "/calendar", "/kiosk", "/frontdesk"];
const startsOffline = (pathname) => OFFLINE_START.some((p) => pathname === p || pathname.startsWith(p + "/"));

// Keep a copy of the current app page and the script/style files it names. Done when this worker takes over
// and whenever the page asks: without it the page was only kept on a navigation that happened AFTER the
// worker was already in charge, so a tablet had no usable copy until its second launch (found by test:
// roughly every other first run could not start offline).
async function keepStartPage() {
  const response = await fetch("/app-login", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return;
  const html = await response.clone().text();
  await (await caches.open(SHELL_CACHE)).put(SHELL_KEY, response);
  const named = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  await keepFiles(named);
}
// Only this site's own built files: their names carry a content hash, so a kept copy can never be out of date.
async function keepFiles(urls) {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all([...new Set(urls)].map(async (u) => {
    const url = new URL(u, self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith("/assets/")) return;
    if (await cache.match(url.pathname)) return;
    const res = await fetch(url.pathname).catch(() => null);
    if (res && res.ok) await cache.put(url.pathname, res);
  }));
}
// The page lists the files it actually loaded (including the screen it is on), so they are kept too.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "CERTXA_KEEP_FOR_OFFLINE" || !Array.isArray(data.urls)) return;
  event.waitUntil(Promise.all([keepFiles(data.urls.slice(0, 400)), keepStartPage().catch(() => {})]).catch(() => {}));
});

function shouldSkip(pathname) {
  return (
    pathname.startsWith("/api/") ||
    // Administrative shells must always come from the network so a deployment
    // cannot leave admins running an obsolete hashed JavaScript bundle.
    pathname.startsWith("/isadmin") ||
    pathname.startsWith("/isTeam") ||
    pathname.startsWith("/uploads/") ||
    pathname.startsWith("/media-stream") ||
    pathname.startsWith("/ws") ||
    pathname === "/_vite_hmr_ping" ||
    pathname.startsWith("/videos/") ||
    pathname.startsWith("/checkin-kiosk") ||
    pathname.startsWith("/kiosk/") ||
    // Website builder & template previews are server-rendered — never SW-cache them
    pathname.startsWith("/website-builder/") ||
    pathname.startsWith("/templates/") ||
    // Public salon websites served at /b/:slug — dynamic, not SPA routes
    pathname.startsWith("/b/")
  );
}

// Is this a request for an app HTML shell (navigation or an .html document)?
function isHtmlShell(request, url) {
  return (
    request.mode === "navigate" ||
    (request.destination === "" && request.headers.get("accept")?.includes("text/html")) ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html")
  );
}

// Activate immediately on install — don't wait for old tabs to close
self.addEventListener("install", () => self.skipWaiting());

// Take control of all clients, clean up stale caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== SHELL_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => keepStartPage().catch(() => {}))
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin GET requests over HTTP(S)
  if (request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;
  if (url.origin !== self.location.origin) return;
  if (shouldSkip(url.pathname)) return;

  // ── HTML shells: network-ONLY. Never cache and never serve a stale index.html.
  //    A stale shell references hashed /assets/*.js that the next deploy deletes,
  //    which 404s the whole app. Better to fail loudly (or show a tiny offline
  //    notice) than to boot an obsolete shell.
  if (isHtmlShell(request, url)) {
    // A staff screen with no server: the page it last loaded. "No server" also means no answer within 8 s (the
    // server powered off can leave a load hanging) and nginx answering 502–504 (the app not running behind it,
    // e.g. while the VPS boots after maintenance).
    const staffScreen = request.mode === "navigate" && startsOffline(url.pathname);
    const load = staffScreen
      ? new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("no answer")), 8000);
          fetch(request, { cache: "no-store" }).then((r) => {
            clearTimeout(timer);
            if (r.status >= 502 && r.status <= 504 && !(r.headers.get("content-type") || "").includes("application/json")) reject(new Error(`gateway ${r.status}`));
            else resolve(r);
          }, (e) => { clearTimeout(timer); reject(e); });
        })
      : fetch(request, { cache: "no-store" });
    event.respondWith(
      load.then((response) => {
        if (request.mode === "navigate" && startsOffline(url.pathname) && response.ok &&
            (response.headers.get("content-type") || "").includes("text/html")) {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_KEY, copy)).catch(() => {});
        }
        return response;
      }).catch(
        async () => {
          if (request.mode === "navigate" && startsOffline(url.pathname)) {
            const kept = await caches.open(SHELL_CACHE).then((cache) => cache.match(SHELL_KEY)).catch(() => undefined);
            if (kept) return kept;
          }
          return new Response(
            "<!doctype html><meta charset=utf-8><title>Offline</title>" +
              "<body style=\"font-family:system-ui;background:#0f0f10;color:#e5e5e7;" +
              "display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">" +
              "<div style=\"text-align:center\"><p style=\"font-size:15px\">You're offline.</p>" +
              "<p style=\"font-size:13px;color:#8e8e93\">This screen will come back by itself when the connection returns.</p></div>" +
              // Nobody is there to tap reload at 3 AM: check quietly and reload once the server answers.
              "<script>setInterval(function(){fetch(location.href,{cache:'no-store'}).then(function(r){if(r.ok)location.reload()}).catch(function(){})},15000)</script>",
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
          );
        }
      )
    );
    return;
  }

  // ── Everything else (hashed assets, fonts, images): network-first, cache-fill.
  //    Hashed asset URLs are immutable, so a cache hit is always correct.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const isPartial = response.status === 206;
        const hasRangeRequest = request.headers.has("range");
        if (response.ok && !isPartial && !hasRangeRequest) {
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, clone))
            .catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return Response.error();
      })
  );
});
