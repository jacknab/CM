import path from "path";
import http from "http";
import fs from "fs";
import { logger } from "./logger";

export interface ContentField {
  id: string;
  label: string;
  original: string;
  current: string;
  elementType: string;
}

export interface WebsiteContent {
  fields: ContentField[];
}

function createStaticServer(rootDir: string): { server: http.Server; port: number } {
  const server = http.createServer((req, res) => {
    let urlPath = req.url?.split("?")[0] ?? "/";
    if (urlPath === "/") urlPath = "/index.html";

    let filePath = path.join(rootDir, decodeURIComponent(urlPath));
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (!fs.existsSync(filePath) || !path.extname(filePath)) {
      filePath = path.join(rootDir, "index.html");
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript",
      ".mjs": "application/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".json": "application/json",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        "Content-Type": mimeMap[ext] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(content);
    } catch {
      const fallback = path.join(rootDir, "index.html");
      if (fs.existsSync(fallback)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(fallback));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    }
  });

  server.listen(0);
  const port = (server.address() as { port: number }).port;
  return { server, port };
}

export async function extractTextFields(
  distDir: string,
  templateId: number
): Promise<ContentField[]> {
  logger.info({ distDir, templateId }, "Extracting text fields from template");

  const { server, port } = createStaticServer(distDir);

  try {
    const puppeteer = await import("puppeteer");
    const SYSTEM_CHROMIUM =
      "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

    const { execFileSync } = await import("child_process");
    let executablePath: string | undefined;
    try {
      execFileSync(SYSTEM_CHROMIUM, ["--version"], { timeout: 5000 });
      executablePath = SYSTEM_CHROMIUM;
    } catch {
      logger.warn("System Chromium not available, falling back to bundled");
    }

    const browser = await puppeteer.default.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-web-security",
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });

      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const url = request.url();
        const type = request.resourceType();
        const isLocal =
          url.startsWith(`http://127.0.0.1:${port}`) ||
          url.startsWith(`http://localhost:${port}`);

        if (isLocal) {
          request.continue();
        } else if (type === "websocket") {
          request.abort();
        } else if (["xhr", "fetch"].includes(type)) {
          request.respond({ status: 200, contentType: "application/json", body: "[]" });
        } else {
          request.continue();
        }
      });

      try {
        await page.goto(`http://127.0.0.1:${port}`, {
          waitUntil: "networkidle2",
          timeout: 30_000,
        });
      } catch {
        await page.goto(`http://127.0.0.1:${port}`, {
          waitUntil: "load",
          timeout: 20_000,
        });
      }

      try {
        await page.waitForFunction(
          "document.getElementById('root') && document.getElementById('root').children.length > 0",
          { timeout: 15_000 }
        );
      } catch {
        logger.warn({ templateId }, "Root wait timed out, extracting whatever is visible");
      }

      await new Promise((r) => setTimeout(r, 2000));

      // Extract all visible text nodes from the rendered page
      const fields = await page.evaluate(() => {
        // Broad selector — include span/div so nav titles and hero overlaid text are captured
        const SELECTOR =
          "h1, h2, h3, h4, h5, h6, p, button, a, span, li, td, th, figcaption, blockquote, label, [class*='title'], [class*='heading'], [class*='hero'], [class*='name'], [class*='slogan'], [class*='tagline']";
        // This callback runs in browser context via page.evaluate() — DOM globals are valid at runtime
        // @ts-ignore: document is a browser global, not visible to Node.js tsconfig
        const elements = document.querySelectorAll(SELECTOR); // eslint-disable-line no-undef
        const seen = new Set<string>();
        const results: Array<{
          id: string;
          label: string;
          original: string;
          current: string;
          elementType: string;
        }> = [];
        let idx = 0;

        // @ts-ignore: Element is a browser global
        elements.forEach((el) => {
          // For spans/divs only take direct text (no nested block children) to avoid duplicates
          const tag = el.tagName.toLowerCase();
          const isInline = tag === 'span' || tag === 'div';
          if (isInline) {
            const hasBlockChild = el.querySelector('p,h1,h2,h3,h4,h5,h6,div,section,article');
            if (hasBlockChild) return;
          }

          // Only pick up elements that have meaningful direct text (not just child elements)
          const text = (el.textContent ?? "").trim();
          if (!text || text.length < 2 || text.length > 400) return;

          // Skip pure-number or symbol strings (phone numbers etc. keep — they're useful)
          if (/^[^a-zA-Z]+$/.test(text) && text.length < 4) return;

          // Skip duplicates
          if (seen.has(text)) return;
          seen.add(text);

          const snippet = text.slice(0, 45) + (text.length > 45 ? "…" : "");
          const label = `${tag.toUpperCase()} — ${snippet}`;

          results.push({
            id: `field-${idx++}`,
            label,
            original: text,
            current: text,
            elementType: tag,
          });
        });

        return results;
      });

      logger.info({ templateId, count: fields.length }, "Text fields extracted");
      return fields;
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
}
