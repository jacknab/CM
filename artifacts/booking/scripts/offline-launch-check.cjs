// Offline cold-launch simulation for the staff screens (Phase 4).
//
//   1. node scripts/offline-launch-static-server.cjs <built app dir> &      (serves a LOCAL build on :47813, never production)
//   2. node scripts/offline-launch-check.cjs <empty profile dir> http://localhost:47813 <pid of 1> /nail /nail
//
// It opens the screen once with the server up (a tablet's first ever run), closes the browser, kills the server
// (a real outage — the browser's own "offline" switch does not stop the service worker's requests), then starts a
// new browser on the same profile and checks the screen draws with no files missing.
// Needs playwright-core and a Chromium build; neither is a dependency of this repo — adjust the two paths below.
// This is a desktop Chromium simulation. It is NOT a test on an Android tablet.
const { chromium } = require("/root/.npm/_npx/705bc6b22212b352/node_modules/playwright-core");
const exe = "/root/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const [profile, BASE, pid, firstRoute, coldRoute] = process.argv.slice(2);
(async () => {
  // The tablet's FIRST EVER run online: one load, no reload. Then the app is closed.
  const ctx = await chromium.launchPersistentContext(profile, { executablePath: exe, headless: true, args: ["--no-sandbox"] });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${firstRoute}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(7000);
  const kept = await page.evaluate(async () => ({ shell: !!(await (await caches.open("certxa-shell-v1")).match("/__offline_shell__")), files: (await (await caches.open("certxa-app-v7")).keys()).length }));
  await ctx.close();
  require("child_process").execSync(`kill ${pid}`);          // the outage: the server address stops answering
  await new Promise((r) => setTimeout(r, 600));
  // Cold launch with no server at all.
  const cold = await chromium.launchPersistentContext(profile, { executablePath: exe, headless: true, args: ["--no-sandbox"] });
  const p2 = await cold.newPage();
  const errors = []; p2.on("pageerror", (e) => errors.push(e.message.slice(0, 100)));
  const missing = []; p2.on("requestfailed", (r) => { if (r.url().includes("/assets/")) missing.push(r.url().split("/assets/")[1]); });
  let nav = "ok";
  try { await p2.goto(`${BASE}${coldRoute}`, { waitUntil: "load", timeout: 20000 }); } catch (e) { nav = "FAILED " + e.message.slice(0, 80); }
  await p2.waitForTimeout(5000);
  const state = await p2.evaluate(() => ({ title: document.title, rendered: (document.getElementById("root")?.innerHTML.length ?? 0) > 200, path: location.pathname })).catch((e) => ({ evalError: e.message }));
  console.log(JSON.stringify({ first: firstRoute, cold: coldRoute, kept, nav, ...state, missingFiles: missing.length, pageErrors: errors.slice(0, 2) }));
  await cold.close();
})().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
