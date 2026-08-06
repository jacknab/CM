import path from "path";
import fs from "fs";
import http from "http";
import { execSync } from "child_process";
import { eq } from "drizzle-orm";
import { db, templatesTable } from "@workspace/db";
import { logger } from "./logger";

const THUMBNAILS_DIR = path.resolve(process.cwd(), "thumbnails-storage");

function ensureThumbnailsDir() {
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
  }
}

function findProjectDir(templateDir: string, depth = 0): string {
  // If this directory has a package.json, it IS the project dir
  if (fs.existsSync(path.join(templateDir, "package.json"))) {
    return templateDir;
  }
  // Recurse up to 4 levels deep: some zips wrap with extra subdirectories
  if (depth < 4) {
    const entries = fs.readdirSync(templateDir).filter((e) => e !== "__MACOSX" && e !== "node_modules");
    if (entries.length === 1) {
      const candidate = path.join(templateDir, entries[0]);
      if (fs.statSync(candidate).isDirectory()) {
        return findProjectDir(candidate, depth + 1);
      }
    }
  }
  return templateDir;
}

function createStaticServer(rootDir: string): { server: http.Server; port: number } {
  const server = http.createServer((req, res) => {
    let urlPath = req.url?.split("?")[0] ?? "/";
    if (urlPath === "/") urlPath = "/index.html";

    let filePath = path.join(rootDir, decodeURIComponent(urlPath));

    // Prevent path traversal
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
        const html = fs.readFileSync(fallback);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
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

export async function buildAndScreenshot(templateId: number, templateDir: string): Promise<void> {
  logger.info({ templateId, templateDir }, "Starting build and screenshot for template");
  ensureThumbnailsDir();

  await db
    .update(templatesTable)
    .set({ buildStatus: "building", buildError: null })
    .where(eq(templatesTable.id, templateId));

  const projectDir = findProjectDir(templateDir);
  logger.info({ projectDir }, "Resolved project directory");

  // Remove template-local package manager config files that may inject
  // workspace-specific or unsupported CLI options during our sandboxed build.
  const packageManagerConfigFiles = [
    ".npmrc",
    ".npmrc.local",
    "pnpm-workspace.yaml",
    ".pnpmfile.cjs",
    ".pnpmfile.js",
  ];
  // ── Env sanitisation ────────────────────────────────────────────────────────
  // Templates frequently use env vars like VITE_SUPABASE_URL that:
  //   1. Might be missing entirely  → module throws 'Missing Supabase URL or key'
  //   2. Might use the real project URL → we don't want real credentials in a preview
  //   3. Might be set to a plain string like 'placeholder' → createClient() throws
  //      because the Supabase SDK calls `new URL(value)` internally
  //
  // Strategy: replace known external-service vars with structurally-valid stubs
  // so the SDK initialises without throwing, then every network call just fails
  // gracefully (the apps all catch those errors and show empty / loading states).
  //
  // VITE_SUPABASE_ANON_KEY must be a parseable JWT — the SDK decodes it to
  // extract `role`/`exp` etc.  We use a pre-signed but inert placeholder.
  const STUB_SUPABASE_URL = "https://placeholder.supabase.co";
  const STUB_SUPABASE_ANON_KEY =
    // header.payload.sig — "anon" role, exp far in the future, never valid on any real project
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MjUwMDAwMDAwMH0" +
    ".placeholder-sig-not-valid";

  /** Replace or add a key=value in an env file string */
  function upsertEnvVar(content: string, key: string, value: string): string {
    const lines = content.split("\n");
    let found = false;
    const updated = lines.map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith(`${key}=`) || trimmed.startsWith(`${key} =`)) {
        found = true;
        return `${key}=${value}`;
      }
      return line;
    });
    if (!found) updated.push(`${key}=${value}`);
    return updated.join("\n");
  }

  // Patch all .env* files in the project root that might contain service credentials
  const envFileCandidates = [".env", ".env.local", ".env.development", ".env.development.local"];
  const SUPABASE_URL_PATTERN = /SUPABASE_URL$/;
  const SUPABASE_KEY_PATTERN = /SUPABASE_(ANON_)?KEY$/;
  let didWriteEnv = false;

  for (const candidate of envFileCandidates) {
    const fp = path.join(projectDir, candidate);
    if (!fs.existsSync(fp)) continue;
    let content = fs.readFileSync(fp, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      const [rawKey] = line.split("=");
      const key = rawKey?.trim().replace(/^export\s+/, "");
      if (!key) continue;
      if (SUPABASE_URL_PATTERN.test(key)) content = upsertEnvVar(content, key, STUB_SUPABASE_URL);
      if (SUPABASE_KEY_PATTERN.test(key)) content = upsertEnvVar(content, key, STUB_SUPABASE_ANON_KEY);
      if (key.includes("STRIPE") || key.includes("API_KEY") || key.includes("API_SECRET")) {
        content = upsertEnvVar(content, key, "placeholder-not-used-in-preview");
      }
    }
    fs.writeFileSync(fp, content, "utf-8");
    didWriteEnv = true;
  }

  // If no .env exists at all, create one with the standard Supabase stubs so
  // templates that check for these vars don't throw at module-init time.
  const primaryEnv = path.join(projectDir, ".env");
  if (!fs.existsSync(primaryEnv)) {
    fs.writeFileSync(
      primaryEnv,
      `VITE_SUPABASE_URL=${STUB_SUPABASE_URL}\nVITE_SUPABASE_ANON_KEY=${STUB_SUPABASE_ANON_KEY}\n`,
      "utf-8"
    );
    didWriteEnv = true;
  }

  // Also ensure .env.example vars get stubs written to .env (some templates read example for reference)
  const envExample = path.join(projectDir, ".env.example");
  if (fs.existsSync(envExample)) {
    const exLines = fs.readFileSync(envExample, "utf-8").split("\n");
    let envContent = fs.existsSync(primaryEnv) ? fs.readFileSync(primaryEnv, "utf-8") : "";
    for (const line of exLines) {
      const [rawKey] = line.split("=");
      const key = rawKey?.trim().replace(/^export\s+/, "");
      if (!key || key.startsWith("#")) continue;
      if (SUPABASE_URL_PATTERN.test(key)) envContent = upsertEnvVar(envContent, key, STUB_SUPABASE_URL);
      if (SUPABASE_KEY_PATTERN.test(key)) envContent = upsertEnvVar(envContent, key, STUB_SUPABASE_ANON_KEY);
    }
    fs.writeFileSync(primaryEnv, envContent, "utf-8");
  }

  logger.info({ didWriteEnv }, "Env stubs applied for template build");

  // Copy the project to a temp directory OUTSIDE the workspace to avoid pnpm/npm
  // workspace contamination (pnpm virtual store at /apps/CM/node_modules/.pnpm causes
  // npm arborist to crash when it walks up and tries to parse it).
  const buildTmpDir = fs.mkdtempSync(path.join("/tmp", "template-build-"));
  const isolatedProjectDir = path.join(buildTmpDir, "project");

  const buildEnv = {
    ...process.env,
    // Do NOT set NODE_ENV=production during install — npm skips devDependencies
    // when NODE_ENV=production, which would exclude vite and other build tools.
    NODE_ENV: "development",
    CI: "false",
    // Silence telemetry / analytics that could hang the build
    VITE_DISABLE_TELEMETRY: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    // Isolate npm cache to temp directory to avoid workspace conflicts
    npm_config_cache: path.join(buildTmpDir, ".npm-cache"),
    NPM_CONFIG_CACHE: path.join(buildTmpDir, ".npm-cache"),
    // Prevent npm/pnpm from traversing up to the workspace root
    npm_config_userconfig: "/dev/null",
    NPM_CONFIG_USERCONFIG: "/dev/null",
  };

  try {
    // Copy project files to isolated temp dir outside the pnpm workspace
    logger.info({ projectDir, isolatedProjectDir }, "Copying template to isolated build directory");
    execSync(`cp -r "${projectDir}" "${isolatedProjectDir}"`, { stdio: "pipe" });

    // findProjectDir only goes one level deep — recurse to find the dir with package.json
    // e.g. isolatedProjectDir may contain a "project/" subdir with the actual package.json
    let isolatedNpmDir = isolatedProjectDir;
    const findPackageJson = (dir: string, depth = 0): string => {
      if (fs.existsSync(path.join(dir, "package.json"))) return dir;
      if (depth >= 3) return dir;
      const entries = fs.readdirSync(dir).filter((e) => e !== "__MACOSX" && e !== "node_modules");
      if (entries.length === 1) {
        const candidate = path.join(dir, entries[0]);
        if (fs.statSync(candidate).isDirectory()) return findPackageJson(candidate, depth + 1);
      }
      return dir;
    };
    isolatedNpmDir = findPackageJson(isolatedProjectDir);
    logger.info({ isolatedNpmDir }, "Resolved npm project dir in isolated copy");

    // Remove any existing node_modules in the copy
    const isolatedNodeModules = path.join(isolatedNpmDir, "node_modules");
    if (fs.existsSync(isolatedNodeModules)) {
      fs.rmSync(isolatedNodeModules, { recursive: true, force: true });
    }
    // Sanitise only the isolated copy. Never mutate the catalogued template
    // source while preparing a preview build.
    for (const configFile of packageManagerConfigFiles) {
      const configPath = path.join(isolatedNpmDir, configFile);
      if (fs.existsSync(configPath)) {
        fs.rmSync(configPath, { force: true });
        logger.info({ configPath }, "Removed package manager config from isolated template copy");
      }
    }
    // Remove package-lock.json to force fresh resolution
    const isolatedLockFile = path.join(isolatedNpmDir, "package-lock.json");
    if (fs.existsSync(isolatedLockFile)) {
      fs.rmSync(isolatedLockFile);
    }

    logger.info({ isolatedNpmDir }, "Installing template dependencies (npm install)");
    execSync("npm install --no-fund --no-audit", {
      cwd: isolatedNpmDir,
      stdio: "pipe",
      timeout: 240_000,
      env: buildEnv,
    });
    logger.info({ isolatedNpmDir }, "Dependencies installed");

    logger.info({ isolatedNpmDir }, "Building template (npm run build)");
    execSync("npm run build", {
      cwd: isolatedNpmDir,
      stdio: "pipe",
      timeout: 240_000,
      env: { ...buildEnv, NODE_ENV: "production" },
    });
    logger.info({ isolatedNpmDir }, "Build complete");

    // Copy the built dist back to the original project directory (relative to isolatedNpmDir → projectDir)
    const relNpmDir = path.relative(isolatedProjectDir, isolatedNpmDir);
    const originalNpmDir = path.join(projectDir, relNpmDir);
    const possibleDistNames = ["dist", "build", "out", "public", ".output/public"];
    for (const d of possibleDistNames) {
      const builtDist = path.join(isolatedNpmDir, d);
      if (fs.existsSync(builtDist) && fs.existsSync(path.join(builtDist, "index.html"))) {
        const destDist = path.join(originalNpmDir, d);
        fs.mkdirSync(originalNpmDir, { recursive: true });
        if (fs.existsSync(destDist)) fs.rmSync(destDist, { recursive: true, force: true });
        execSync(`cp -r "${builtDist}" "${destDist}"`, { stdio: "pipe" });
        logger.info({ destDist }, "Copied built output to original project dir");
        break;
      }
    }
  } catch (buildErr: unknown) {
    const err = buildErr as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const stderr = err.stderr?.toString() ?? "";
    const stdout = err.stdout?.toString() ?? "";
    logger.error({ templateId, stderr: stderr.slice(-2000), stdout: stdout.slice(-2000) }, "Build failed for template");

    // Clean up temp build dir on failure
    try { fs.rmSync(buildTmpDir, { recursive: true, force: true }); } catch {}

    const buildErrMsg = (stderr + stdout + (err.message ?? "")).slice(-500) || "Build failed";
    await db
      .update(templatesTable)
      .set({ thumbnail: null, buildStatus: "failed", buildError: buildErrMsg })
      .where(eq(templatesTable.id, templateId));
    return;
  }

  // Clean up temp build dir on success
  try { fs.rmSync(buildTmpDir, { recursive: true, force: true }); } catch {}

  // Locate the built output directory
  const possibleDist = ["dist", "build", "out", "public", ".output/public"];
  let distDir: string | null = null;
  for (const d of possibleDist) {
    const candidate = path.join(projectDir, d);
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, "index.html"))) {
      distDir = candidate;
      break;
    }
  }

  if (!distDir) {
    logger.error({ projectDir, templateId }, "No dist/index.html found after build");
    await db
      .update(templatesTable)
      .set({ buildStatus: "failed", buildError: "No dist/index.html found after build" })
      .where(eq(templatesTable.id, templateId));
    return;
  }

  logger.info({ distDir, templateId }, "Serving built template for screenshot");

  const { server, port } = createStaticServer(distDir);

  try {
    const puppeteer = await import("puppeteer");

    // Prefer the NixOS system Chromium (which has all required shared libs wrapped
    // correctly) over the bundled Puppeteer Chrome, which lacks them in this env.
    const SYSTEM_CHROMIUM = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";
    const { execFileSync } = await import("child_process");
    let executablePath: string | undefined;
    try {
      execFileSync(SYSTEM_CHROMIUM, ["--version"], { timeout: 5000 });
      executablePath = SYSTEM_CHROMIUM;
      logger.info({ executablePath }, "Using system Chromium for screenshot");
    } catch {
      logger.warn("System Chromium not available, falling back to bundled Chrome");
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
        // NOTE: --single-process and --no-zygote are intentionally omitted —
        // they prevent V8 from executing page scripts in NixOS headless environments.
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

      // Intercept requests: serve local assets normally; stub external XHR/fetch with
      // an empty 200 JSON response so the React app can hydrate instead of hanging.
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
          // Return a neutral empty response so data-fetching hooks resolve quickly
          // PostgREST (Supabase's backend) returns bare arrays for SELECT queries.
          // Returning an object would cause `.map is not a function` errors in templates.
          request.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([]),
          });
        } else {
          request.continue();
        }
      });

      // Capture browser console output for debugging
      page.on("console", (msg) => {
        logger.debug({ templateId, consoleType: msg.type(), consoleText: msg.text() }, "Browser console");
      });
      page.on("pageerror", (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ templateId, pageError: msg }, "Browser page error");
      });

      logger.info({ port, templateId }, "Navigating to template for screenshot");

      try {
        await page.goto(`http://127.0.0.1:${port}`, {
          waitUntil: "networkidle2",
          timeout: 30_000,
        });
      } catch {
        // networkidle2 can time out if the SPA keeps polling — fall back to load
        logger.warn({ templateId }, "networkidle2 timed out, falling back to load event");
        await page.goto(`http://127.0.0.1:${port}`, {
          waitUntil: "load",
          timeout: 20_000,
        });
      }

      // Wait for React to hydrate: #root must have at least one child element.
      // Use a string expression so TypeScript server config (no DOM lib) doesn't complain.
      try {
        await page.waitForFunction(
          "document.getElementById('root') && document.getElementById('root').children.length > 0",
          { timeout: 15_000 }
        );
        logger.info({ templateId }, "#root has children — React rendered successfully");
      } catch {
        logger.warn({ templateId }, "#root children wait timed out, snapping whatever is visible");
      }

      // Allow CSS animations and lazy images to settle
      await new Promise((r) => setTimeout(r, 3000));

      const thumbnailFilename = `template-${templateId}-${Date.now()}.png`;
      const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename);

      await page.screenshot({
        path: thumbnailPath,
        clip: { x: 0, y: 0, width: 1440, height: 900 },
      });

      logger.info({ thumbnailPath, templateId }, "Screenshot captured successfully");

      await db
        .update(templatesTable)
        .set({ thumbnail: `/api/templates/thumbnails/${thumbnailFilename}`, buildStatus: "ready", buildError: null })
        .where(eq(templatesTable.id, templateId));

      logger.info({ templateId }, "Template thumbnail URL saved to database");
    } finally {
      await browser.close();
    }
  } catch (screenshotErr) {
    logger.error({ screenshotErr, templateId }, "Screenshot step failed");
    const screenshotErrMsg = screenshotErr instanceof Error ? screenshotErr.message : String(screenshotErr);
    await db
      .update(templatesTable)
      .set({ buildStatus: "failed", buildError: `Screenshot failed: ${screenshotErrMsg}`.slice(0, 500) })
      .where(eq(templatesTable.id, templateId));
  } finally {
    server.close();
  }
}
