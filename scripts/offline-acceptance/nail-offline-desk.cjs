// /nail offline, in a real (headless) browser against the ISOLATED test server (reset.sh) — never production:
// load /nail online, open the register, then take the server away and check in a NEW number by name, add a
// service, save the ticket and START it. Mode "kill" = server gone (connection refused, like the VPS off);
// "freeze" = server takes connections but never answers (Wi-Fi up, internet down), then comes back and the
// script waits for everything made offline to be sent.
//   bash reset.sh; (turn the lock screen off and clock staff 1 and 2 in through the API, see README)
//   node nail-offline-desk.cjs <test-server pid> freeze
// Needs playwright-core and a Chromium headless shell (paths below); S= is the scratch folder of the run.
const { chromium } = require("/root/.npm/_npx/705bc6b22212b352/node_modules/playwright-core");
const fs = require("fs");
const S = "/tmp/claude-0/-apps-CM/ca730288-4e83-4f29-a3a4-75c70e0853f0/scratchpad";
const BASE = "http://localhost:9291";
const exe = "/root/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const serverPid = process.argv[2];
const t0 = Date.now(); const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const log = (...a) => { const line = [ts(), ...a].join(" "); console.log(line); fs.appendFileSync(S + "/e2e/run.log", line + "\n"); };
(async () => {
  const ctx = await chromium.launchPersistentContext(`${S}/e2e/profile-${Date.now()}`, { executablePath: exe, headless: true, args: ["--no-sandbox"], viewport: { width: 1280, height: 800 } });
  const cookies = fs.readFileSync(`${S}/e2e/cookie`, "utf8").trim().split(/;\s*/).filter(Boolean).map((p) => { const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), domain: "localhost", path: "/", httpOnly: true, secure: false }; });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160)); });
  const shot = (n) => page.screenshot({ path: `${S}/e2e/shots/${n}.png`, timeout: 4000 }).catch(() => {});
  await page.goto(`${BASE}/nail`, { waitUntil: "load" });
  await page.waitForSelector('[data-testid="nail-home"]', { timeout: 60000 });
  log("nail loaded online"); await page.waitForTimeout(4000);
  // The morning "Open Register" prompt: open the drawer with $100, as the salon would.
  const openBtn = page.getByRole("button", { name: "Open Register" });
  if (await openBtn.count()) {
    await page.locator('input').first().fill("100");
    await openBtn.click(); log("register opened");
  }
  await page.waitForTimeout(12000); await shot("01-online");
  // The outage.
  const mode = process.argv[3] || "kill";
  // "freeze": the server takes connections but never answers — the salon's Wi-Fi up, the internet down.
  process.kill(Number(serverPid), mode === "freeze" ? "SIGSTOP" : "SIGKILL"); log(mode === "freeze" ? "server frozen" : "server killed");
  await page.waitForTimeout(3000);
  // ── New number, checked in by name ──
  await page.click('[data-testid="nail-nav-check-in"]');
  await page.waitForSelector('[data-testid="nail-checkin-sheet"]', { timeout: 10000 });
  for (const d of "6024310177") await page.click(`[data-testid="nail-checkin-key-${d}"]`);
  log("phone typed");
  try { await page.waitForSelector('[data-testid="nail-name-entry"]', { timeout: 20000 }); log("name keyboard shown"); }
  catch { log("NO name keyboard"); await shot("02-no-name"); }
  for (const k of ["j", "a", "n", "e"]) await page.click(`[data-testid="kb-${k}"]`);
  await shot("03-name-typed");
  await page.click('[data-testid="nail-checkin-save"]'); log("save tapped");
  let saved = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const txt = await page.locator('[data-testid="nail-checkin-sheet"]').innerText().catch(() => "(sheet gone)");
    if (/checked in|sheet gone/i.test(txt)) { saved = true; log("check-in result:", txt.replace(/\s+/g, " ").slice(0, 120)); break; }
    if (/error|could not|try again/i.test(txt)) { log("check-in ERROR:", txt.replace(/\s+/g, " ").slice(0, 160)); break; }
  }
  if (!saved) log("check-in did NOT finish in 20s");
  await shot("04-after-save");
  await page.waitForTimeout(3000); await shot("05-after-checkin");
  // ── A ticket for her, then START ──
  const svc = page.locator(".pos-key-service").first();
  if (!(await svc.count())) { const grp = page.locator(".pos-key:not(.pos-key-empty):not(.pos-key-nav)").first(); if (await grp.count()) await grp.click(); }
  await page.waitForTimeout(500);
  if (await page.locator(".pos-key-service").count()) { await page.locator(".pos-key-service").first().click(); log("service added"); } else log("NO service key on screen");
  await shot("06-service");
  const submit = page.locator('[data-testid="nail-submit-ticket"]');
  log("submit button:", await submit.innerText().catch(() => "missing"), "enabled:", await submit.isEnabled().catch(() => false));
  await submit.click().catch((e) => log("submit click failed", e.message.slice(0, 80)));
  try { await page.waitForSelector('[data-testid="nail-started-notice"]', { timeout: 20000 }); log("saved popup:", (await page.locator('[data-testid="nail-started-notice"]').innerText()).replace(/\s+/g, " ").slice(0, 140)); }
  catch { log("NO saved popup within 20s"); }
  await shot("07-saved");
  const start = page.locator('[data-testid="nail-saved-start"]');
  if (await start.count()) {
    await start.first().click(); log("Start Service tapped");
    await page.waitForTimeout(1500);
    log("button now:", await start.first().innerText().catch(() => "(popup closed)"));
    await shot("08-started");
    await page.waitForTimeout(3500);
    log("popup after 5s:", (await page.locator('[data-testid="nail-started-notice"]').count()) ? "still open" : "closed");
  } else log("NO Start Service button (ticket went to no technician?)");
  const alive = await Promise.race([page.evaluate(() => Date.now()).then(() => "responsive"), new Promise((r) => setTimeout(() => r("PAGE NOT RESPONDING"), 5000))]);
  log("page check:", alive);
  await page.click('[data-testid="nail-nav-queue"]', { timeout: 8000 }).then(() => log("queue tab opened")).catch((e) => log("queue click failed:", e.message.split("\n")[0]));
  await page.waitForTimeout(1500); await shot("09-queue"); log("after queue shot");
  const cards = await page.locator('[data-testid^="nail-queue-"]').evaluateAll((els) => els.filter((e) => e.getAttribute("data-state")).map((e) => `${e.getAttribute("data-testid")}=${e.getAttribute("data-state")} ${e.innerText.replace(/\s+/g, " ").slice(0, 70)}`)).catch(() => []);
  log("queue cards:", JSON.stringify(cards));
  log("footer:", await page.locator('[data-testid="nail-live"]').innerText().catch(() => "?"));
  if (process.argv[3] === "freeze") {
    // The internet comes back: everything made offline is sent.
    process.kill(Number(serverPid), "SIGCONT"); log("server back");
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(5000);
      const f = await page.locator('[data-testid="nail-live"]').innerText().catch(() => "?");
      const notSent = await page.locator('[data-testid="nail-queue-not-sent"]').count();
      if (/connected/i.test(f) && notSent === 0) { log("synced; footer:", f); break; }
      if (i === 23) log("NOT synced after 2 min; footer:", f, "not-sent cards:", notSent);
    }
  }
  log("page errors:", JSON.stringify(errors.filter((e) => !/WebSocket|ERR_CONNECTION_REFUSED|Failed to load resource/.test(e)).slice(0, 6)));
  await ctx.close();
})().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
