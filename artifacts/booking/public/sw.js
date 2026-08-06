const CACHE_NAME = "certxa-app-v4";

function shouldSkip(pathname) {
  return (
    pathname.startsWith("/api/") ||
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
  if (shouldSkip(url.pathname)) return;

  event.respondWith(
    // Network-first: always try to get fresh content
    fetch(request)
      .then((response) => {
        // Cache only full, cacheable responses.
        // Avoid 206 Partial Content (range requests), which throws in cache.put.
        const isPartial = response.status === 206;
        const hasRangeRequest = request.headers.has("range");

        if (response.ok && !isPartial && !hasRangeRequest) {
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, clone))
            .catch(() => {
              // Non-fatal cache write failure; keep network response flowing.
            });
        }
        return response;
      })
      .catch(async () => {
        // Network failed — serve from cache
        const cached = await caches.match(request);
        if (cached) return cached;

        // SPA fallback: for page navigations (any URL like /booking/new, /calendar)
        // serve the cached root HTML so React can boot and handle routing
        if (request.mode === "navigate") {
          const root = await caches.match("/");
          if (root) return root;
        }

        return Response.error();
      })
  );
});
