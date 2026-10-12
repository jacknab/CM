import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installNativeViewportLock } from "./lib/nativeViewportLock";
import { cleanHardRefreshParam } from "./lib/hard-refresh";
import { reloadForNewBuild } from "./lib/staleBuild";

installNativeViewportLock();
cleanHardRefreshParam();

// A page chunk from an older build is gone after a deploy — reload once onto the current build
// instead of letting the error screen show (see lib/staleBuild.ts).
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewBuild()) event.preventDefault();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    // So a tablet can start with no network: on the staff screens, hand the service worker the list of this
    // site's built files the page has actually loaded (including the screen's own lazily loaded parts), to
    // keep alongside the app page. Asked again after a while, once the screen has loaded what it needs.
    const keepForOffline = () => {
      if (!/^\/(app-login|nail|barber|calendar|frontdesk|kiosk)(\/|$)/.test(window.location.pathname)) return;
      const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.startsWith(window.location.origin + "/assets/"));
      void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: "CERTXA_KEEP_FOR_OFFLINE", urls })).catch(() => {});
    };
    setTimeout(keepForOffline, 4_000);
    setTimeout(keepForOffline, 30_000);
  });
}

const rootEl = document.getElementById("root")!;

createRoot(rootEl).render(<App />);
