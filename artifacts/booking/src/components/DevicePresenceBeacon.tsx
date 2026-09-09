import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Reports self-check-in kiosk (/kiosk/:slug) and front-desk display
 * (/frontdesk/:slug) screens to isTeam → Live Visitors → "Kiosk & Front Desk".
 * These pages have no user session, so the beacon identifies the device by its
 * store booking slug; the server resolves that to a store. Renders nothing.
 * Mounted once, globally, in App.tsx (outside the authenticated-route tree).
 */

const PING_MS = 25_000;
// /kiosk/<slug> or /frontdesk/<slug> (also matches /kiosk/<slug>/ticket/<token>).
const DEVICE_RE = /^\/(kiosk|frontdesk)\/([a-z0-9][a-z0-9-]*)/i;

export default function DevicePresenceBeacon() {
  const { pathname, search } = useLocation();
  const idRef = useRef<string>("");

  const m = pathname.match(DEVICE_RE);
  const kind = m ? (m[1].toLowerCase() as "kiosk" | "frontdesk") : null;
  const slug = m ? m[2].toLowerCase() : null;
  const path = pathname + search;

  useEffect(() => {
    if (!kind || !slug) return;
    const vid = `${kind}_${slug}`;
    idRef.current = vid;

    function ping() {
      try {
        fetch("/api/live-chat/visitor/ping", {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            app: kind,
            slug,
            visitorId: vid,
            url: path,
            title: typeof document !== "undefined" ? document.title : "",
          }),
        }).catch(() => {});
      } catch { /* offline / blocked — ignore */ }
    }

    ping();
    const iv = setInterval(ping, PING_MS);
    const onVis = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [kind, slug, path]);

  useEffect(() => {
    function leave() {
      const vid = idRef.current;
      if (!vid) return;
      try {
        navigator.sendBeacon(
          "/api/live-chat/visitor/leave",
          new Blob([JSON.stringify({ visitorId: vid })], { type: "application/json" }),
        );
      } catch { /* ignore */ }
    }
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, []);

  return null;
}
