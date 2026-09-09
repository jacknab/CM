import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useSelectedStore } from "@/hooks/use-store";

/**
 * Beacons a lightweight "I'm signed in and on this page" heartbeat to the
 * live-chat visitor-presence endpoint while a user is logged into the booking
 * app. Surfaces on the isTeam → Live Visitors → "Booking App Users" tab.
 * Renders nothing. Mounted once, globally, in App.tsx.
 */

const PING_MS = 25_000;

// Pre-auth / kiosk / full-screen operational surfaces we don't want to report.
const HIDDEN_PREFIXES = [
  "/isTeam", "/isadmin", "/kiosk", "/frontdesk", "/queue-display", "/checkin",
  "/auth", "/app-login", "/staff-auth", "/forgot-password", "/reset-password",
  "/staff-forgot-password", "/staff-reset-password", "/onboarding", "/setup",
  "/book/", "/widget", "/review/", "/b/",
];

export default function BookingPresenceBeacon() {
  const { user } = useAuth();
  const { selectedStore } = useSelectedStore();
  const location = useLocation();
  const idRef = useRef<string>("");

  const userId = (user as any)?.id != null ? String((user as any).id) : "";
  const hidden = HIDDEN_PREFIXES.some(
    (p) => location.pathname === p || location.pathname.startsWith(p),
  );
  const storeId = selectedStore?.id ?? null;
  const storeName = selectedStore?.name ?? null;
  const path = location.pathname + location.search;

  useEffect(() => {
    if (!userId || hidden) return;
    const vid = `app_${userId}`;
    idRef.current = vid;

    function ping() {
      try {
        fetch("/api/live-chat/visitor/ping", {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            app: "booking",
            visitorId: vid,
            url: path,
            title: typeof document !== "undefined" ? document.title : "",
            storeId,
            storeName,
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
  }, [userId, hidden, storeId, storeName, path]);

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
