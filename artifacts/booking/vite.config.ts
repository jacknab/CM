import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT ?? "4173";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  // In dev, intercept bare "/" before Vite serves the React SPA and redirect
  // it to /overview, which the proxy (below) forwards to the API → PHP page.
  // This mirrors the production behaviour where the Express server itself
  // issues the same 302 redirect.
  plugins: [
    react(),
    tailwindcss(),
    // Vite adds crossorigin="anonymous" to every <link rel="stylesheet"> it
    // emits.  This forces CORS mode on what is really a same-origin load.
    // Android WebView can send Origin: null for WebView-context requests;
    // Chrome/Chromium treats Access-Control-Allow-Origin: null as a mismatch
    // and silently blocks the stylesheet — hence the "no CSS" symptom.
    // Removing crossorigin makes the browser fetch stylesheets in no-cors mode,
    // which always succeeds for same-origin resources.
    // Strip crossorigin from BOTH <link rel="stylesheet"> and <script type="module">.
    // Android WebView sends Origin: null for local/file-context requests; Chrome
    // treats Access-Control-Allow-Origin: null as a mismatch and silently blocks
    // the resource.  Same-origin resources are always accessible in no-cors mode,
    // so removing crossorigin is safe and fixes CSS/JS not loading on older tablets.
    {
      name: "remove-crossorigin",
      transformIndexHtml: {
        order: "post",
        handler(html: string) {
          // Strip from <link ...> tags (stylesheets, preload, etc.)
          let out = html.replace(
            /<link([^>]*?)>/g,
            (_m: string, attrs: string) =>
              `<link${attrs.replace(/\s+crossorigin(?:="[^"]*")?/gi, "")}>`,
          );
          // Strip from <script ...> tags (type="module" and others)
          out = out.replace(
            /<script([^>]*?)>/g,
            (_m: string, attrs: string) =>
              `<script${attrs.replace(/\s+crossorigin(?:="[^"]*")?/gi, "")}>`,
          );
          return out;
        },
      },
    },
  ],
  optimizeDeps: {
    exclude: ["@react-pdf/renderer"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "..", "..", "shared"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom", "zod", "drizzle-orm", "drizzle-zod"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "../../artifacts/api-server/dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "SOURCEMAP_ERROR") return;
        warn(warning);
      },
      output: {
        // Split large vendor libraries into separate cacheable chunks.
        // When only app code changes, browsers re-use cached vendor chunks —
        // reducing repeat-visit payload significantly.
        manualChunks(id) {
          // React core — changes rarely, cache for a long time
          if (id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/react-router") ||
              id.includes("node_modules/scheduler/")) {
            return "vendor-react";
          }
          // TanStack Query — data-fetching layer
          if (id.includes("node_modules/@tanstack/")) {
            return "vendor-query";
          }
          // Radix UI primitives — large but stable
          if (id.includes("node_modules/@radix-ui/")) {
            return "vendor-radix";
          }
          // Lucide icons — large (tree-shaken but still significant)
          if (id.includes("node_modules/lucide-react/")) {
            return "vendor-icons";
          }
          // Date utilities
          if (id.includes("node_modules/date-fns")) {
            return "vendor-date";
          }
          // Form libraries
          if (id.includes("node_modules/react-hook-form/") ||
              id.includes("node_modules/@hookform/") ||
              id.includes("node_modules/zod/")) {
            return "vendor-forms";
          }
          // react-pdf — already excluded from optimizeDeps; keep isolated
          if (id.includes("node_modules/@react-pdf/") ||
              id.includes("node_modules/pdf-lib/")) {
            return "vendor-pdf";
          }
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: (() => {
      const api = process.env.API_PROXY_TARGET ?? "http://localhost:8080";

      // PHP marketing-site paths served by the API server's built-in PHP proxy.
      // These must be forwarded to the API server so direct browser navigation
      // lands on the PHP page rather than the React SPA.
      const phpPaths = [
        "/overview",
        "/pricing",
        "/about",
        "/blog",
        "/hair-salon-software",
        "/nail-salon-software",
        "/barbershop-software",
        "/checkin-kiosk",
        "/autumn",
        "/online-booking",
        "/data-transfer",
        "/waitlist",
        "/booth-renters",
        "/card-reader-pos",
        "/case-studies",
        "/client-management",
        "/client-notifications",
        "/client-reviews",
        "/custom-website-builder",
        "/payment-processing",
        "/payments",
        "/privacy",
        "/terms",
        "/google-business-profile",
        "/revenue-intelligence",
        "/salonos",
        "/solo-professionals",
        "/vs-glossgenius",
        "/vs-vagaro",
        // PHP static/asset prefixes
        "/assets",
        "/videos",
        "/launchsite",
        "/editor",
        "/templates",
        "/lib",
        // Salon directory (server-rendered by Express)
        "/nail-salons",
        "/salon",
        // PHP root files
        "/sitemap.xml",
        "/robots.txt",
        "/favicon.svg",
      ];

      const phpProxyEntry = { target: api, changeOrigin: true };
      const phpEntries = Object.fromEntries(phpPaths.map((p) => [p, phpProxyEntry]));

      // Tell Express that every proxied request arrived over HTTPS.
      // Without this header, express-session sees req.secure=false (plain HTTP
      // on the loopback) and silently drops the Secure cookie, breaking login.
      const httpsHeaders = { "x-forwarded-proto": "https" };

      return {
        "/__mockup": {
          target: "http://localhost:8080",
          changeOrigin: true,
          ws: true,
        },
        "/api": { target: api, changeOrigin: true, headers: httpsHeaders },
        "/app": { target: api, changeOrigin: true, headers: httpsHeaders },
        "/website-builder": { target: api, changeOrigin: true, headers: httpsHeaders },
        "/uploads": { target: api, changeOrigin: true, headers: httpsHeaders },
        "/media-stream": { target: api, changeOrigin: true, ws: true, headers: httpsHeaders },
        "/ws": { target: api, changeOrigin: true, ws: true, headers: httpsHeaders },
        // "^/$" is a RegExp proxy key that matches ONLY the bare root path.
        // The API server redirects "/" → "/overview", and the "/overview"
        // entry below then forwards that to PHP — matching production routing.
        "^/$": { target: api, changeOrigin: true, headers: httpsHeaders },
        ...phpEntries,
      };
    })(),
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
