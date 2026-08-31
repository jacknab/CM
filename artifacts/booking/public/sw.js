const CACHE_NAME = "certxa-app-v7";

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
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
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
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(
        () =>
          new Response(
            "<!doctype html><meta charset=utf-8><title>Offline</title>" +
              "<body style=\"font-family:system-ui;background:#0f0f10;color:#e5e5e7;" +
              "display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">" +
              "<div style=\"text-align:center\"><p style=\"font-size:15px\">You're offline.</p>" +
              "<p style=\"font-size:13px;color:#8e8e93\">Reconnect and reload.</p></div>",
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
          )
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
