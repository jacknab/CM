/**
 * Loads the built marketplace SSR bundle (artifacts/marketplace's
 * `build:ssr` output) and its client asset manifest, and assembles the full
 * HTML page around what entry-server.tsx's render() returns.
 *
 * Both build outputs are optional at module-load time (a fresh checkout
 * before anyone has run the marketplace builds) — callers get `null` and
 * should fall through rather than crash; a warning is logged once.
 */

import path from "path";
import fs from "fs";
import { logger } from "./logger";

const _cjsDirname: string | undefined = (globalThis as any).__dirname;

function apiServerDistDir(): string {
  return _cjsDirname ?? path.resolve(process.cwd(), "dist");
}

function marketplacePackageDistDir(): string {
  const candidates = [
    _cjsDirname ? path.resolve(_cjsDirname, "..", "..", "marketplace", "dist") : null,
    path.resolve(process.cwd(), "artifacts/marketplace/dist"),
    path.resolve(process.cwd(), "../marketplace/dist"),
  ].filter((c): c is string => !!c);
  return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
}

interface SsrRenderResult {
  html: string;
  headTags: string;
  statusCode: number;
  redirectTo?: string;
  dehydratedState: unknown;
}

interface GeoCity {
  city: string;
  state: string;
  citySlug: string;
  stateSlug: string;
}

interface SsrModule {
  render: (url: string, apiOrigin: string, publicOrigin: string, geo?: GeoCity | null) => Promise<SsrRenderResult>;
}

let _ssrModule: SsrModule | null = null;
let _ssrLoadAttempted = false;

async function loadSsrModule(): Promise<SsrModule | null> {
  if (_ssrModule || _ssrLoadAttempted) return _ssrModule;
  _ssrLoadAttempted = true;
  const entryPath = path.join(marketplacePackageDistDir(), "server", "entry-server.js");
  if (!fs.existsSync(entryPath)) {
    logger.warn({ entryPath }, "[marketplaceSsr] SSR bundle not found — run `pnpm --filter @workspace/marketplace run build:ssr`");
    return null;
  }
  try {
    _ssrModule = (await import(entryPath)) as SsrModule;
    logger.info("[marketplaceSsr] SSR bundle loaded");
    return _ssrModule;
  } catch (err) {
    logger.error({ err }, "[marketplaceSsr] failed to load SSR bundle");
    return null;
  }
}

interface ClientAssets { js: string; css: string[] }

let _clientAssets: ClientAssets | null = null;
let _assetsLoadAttempted = false;

function loadClientAssets(): ClientAssets | null {
  if (_clientAssets || _assetsLoadAttempted) return _clientAssets;
  _assetsLoadAttempted = true;
  const manifestPath = path.join(apiServerDistDir(), "public", "mp-assets", ".vite", "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    logger.warn({ manifestPath }, "[marketplaceSsr] client asset manifest not found — run `pnpm --filter @workspace/marketplace run build`");
    return null;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, { file: string; css?: string[] }>;
    const entry = manifest["src/main.tsx"];
    if (!entry) {
      logger.warn({ manifestPath }, "[marketplaceSsr] manifest missing src/main.tsx entry");
      return null;
    }
    _clientAssets = { js: entry.file, css: entry.css ?? [] };
    return _clientAssets;
  } catch (err) {
    logger.error({ err }, "[marketplaceSsr] failed to parse client manifest");
    return null;
  }
}

function escapeScript(json: string): string {
  return json.replace(/</g, "\\u003c");
}

export interface RenderedPage {
  html: string;
  statusCode: number;
  redirectTo?: string;
}

/**
 * `originalUrl` — the request path+query (req.originalUrl).
 * `internalApiOrigin` — loopback address this same process listens on, used
 * for the SSR entry's own server-to-server data prefetch.
 * `geo` — IP-resolved visitor city (see lib/geoLookup.ts), resolved from the
 * *real* incoming request before this internal loopback call — the SSR
 * entry's own data prefetch can't determine this itself since it only ever
 * sees this process's own address, not the original visitor's.
 */
export async function renderMarketplacePage(
  originalUrl: string,
  internalApiOrigin: string,
  geo: GeoCity | null = null,
): Promise<RenderedPage | null> {
  const ssr = await loadSsrModule();
  const assets = loadClientAssets();
  if (!ssr || !assets) return null;

  const result = await ssr.render(originalUrl, internalApiOrigin, "https://certxa.com", geo);

  if (result.redirectTo) {
    return { html: "", statusCode: result.statusCode || 302, redirectTo: result.redirectTo };
  }

  const cssLinks = assets.css.map((href) => `<link rel="stylesheet" href="/mp-assets/${href}">`).join("\n");
  const stateScript = `<script>window.__CERTXA_QUERY_STATE__ = ${escapeScript(JSON.stringify(result.dehydratedState))};</script>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.svg" sizes="any">
${result.headTags}
${cssLinks}
</head>
<body>
<div id="root">${result.html}</div>
${stateScript}
<script type="module" src="/mp-assets/${assets.js}"></script>
</body>
</html>`;

  return { html, statusCode: result.statusCode };
}
