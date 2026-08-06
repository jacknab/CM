import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  clientIntelligence,
  staffIntelligence,
  growthScoreSnapshots,
  intelligenceInterventions,
  deadSeatPatterns,
} from "../../shared/schema/intelligence";
import { users } from "../../shared/schema";
import { runDemoEngines } from "../intelligence/demo-runner";
import { runIntelligenceForStore } from "../intelligence/orchestrator";
import { seedTesterStore } from "../intelligence/tester-seeder";

// ── Helper: load the authenticated user from the session ──────────────────────
async function getSessionUser(req: any) {
  const userId = req.session?.userId;
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user ?? null;
}

// ── Check if a user is allowed to access demo / intelligence launch ───────────
function isDemoAllowed(user: any): boolean {
  if (!user) return false;
  if (user.accountType === "tester") return true;
  return DEMO_EMAILS.has(user.email);
}

const router = Router();

// ── All demo account emails ───────────────────────────────────────────────────
export const DEMO_EMAILS = new Set([
  "nail-demo@certxa.com",
  "hair-demo@certxa.com",
  "spa-demo@certxa.com",
  "barber-demo@certxa.com",
]);

// ── Business-type → demo email map (used by the public /enter/:type endpoint) ─
const DEMO_TYPE_EMAIL: Record<string, string> = {
  nail:   "nail-demo@certxa.com",
  hair:   "hair-demo@certxa.com",
  spa:    "spa-demo@certxa.com",
  barber: "barber-demo@certxa.com",
};

// ── GET /enter/:type — public auto-login for demo landing page ────────────────
// Accepts: nail | hair | spa | barber
// Creates a real session for the matching demo account and redirects to
// /intelligence/launch so the prospect lands directly in the live demo.
router.get("/enter/:type", async (req: any, res) => {
  const email = DEMO_TYPE_EMAIL[req.params.type?.toLowerCase()];
  if (!email) {
    return res.status(400).send(
      "Unknown demo type. Valid options: nail, hair, spa, barber"
    );
  }

  try {
    // Look up the demo user from the database
    const [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user) {
      console.error(`[DemoEnter] Demo account not found: ${email}`);
      return res.status(503).send(
        `Demo account not ready (${email}). ` +
        "Ask your admin to run: npm run seed:demo"
      );
    }

    // Set the session the same way the regular login endpoint does
    (req.session as any).userId = user.id;

    // Keep the demo session alive for 2 hours — long enough for any prospect
    req.session.cookie.maxAge = 2 * 60 * 60 * 1000;

    req.session.save((err: any) => {
      if (err) {
        console.error("[DemoEnter] Session save failed:", err);
        return res.status(500).send("Session error — please try again.");
      }
      console.log(`[DemoEnter] Auto-login: ${email} → /intelligence/launch`);
      res.redirect("/intelligence/launch");
    });
  } catch (err: any) {
    console.error("[DemoEnter] DB error:", err.message);
    res.status(500).send("Server error — please try again.");
  }
});

// Map each demo email to its reseed script
const RESEED_SCRIPTS: Record<string, string> = {
  "nail-demo@certxa.com":   "scripts/reseed-nail-demo.ts",
  "hair-demo@certxa.com":   "scripts/reseed-hair-demo.ts",
  "spa-demo@certxa.com":    "scripts/reseed-spa-demo.ts",
  "barber-demo@certxa.com": "scripts/reseed-barber-demo.ts",
};

const RESET_DELAY_MS = 90 * 60 * 1000; // 90 minutes after engines finish

// esbuild injects __dirname in CJS bundles. In ESM dev (tsx), use process.cwd().
const _cjsDirname: string | undefined = (globalThis as any).__dirname;
const ROOT = _cjsDirname
  ? path.resolve(_cjsDirname, "..", "..")
  : path.resolve(process.cwd());
const TSX  = path.join(ROOT, "node_modules/.bin/tsx");

// ── In-memory state per store ─────────────────────────────────────────────────
// running   → engines are animating right now
// resetAt   → engines done, 90-min countdown in progress
// reseeding → 90-min timer fired, full reseed running in background
// email     → the demo user who launched (determines which reseed script to run)
interface DemoState {
  running:   boolean;
  resetAt?:  number;
  reseeding?: boolean;
  email:     string;
}
const demoState = new Map<number, DemoState>();

// ── Full reseed + silent engine run in background ─────────────────────────────
// After every reseed the intelligence engines are run automatically so the
// dashboard is fully populated before the next visitor even clicks anything.
// When engines finish a new 90-min cooldown starts and the cycle repeats —
// one human click is all that's ever needed.
function spawnFullReseedAndRunEngines(storeId: number, email: string): void {
  const script = RESEED_SCRIPTS[email];
  if (!script) {
    console.error(`[DemoReset] No reseed script for ${email} — clearing state`);
    demoState.delete(storeId);
    return;
  }

  console.log(`[DemoReset] Spawning reseed for store ${storeId} (${email}) …`);
  demoState.set(storeId, { running: false, reseeding: true, email });

  const child = spawn(TSX, [path.join(ROOT, script)], {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env },
  });

  child.stdout?.on("data", (d) => process.stdout.write(`[DemoReseed] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[DemoReseed:err] ${d}`));

  child.on("close", async (code) => {
    if (code !== 0) {
      console.error(`[DemoReset] Reseed exited ${code} for store ${storeId} — clearing state`);
      demoState.delete(storeId);
      return;
    }

    console.log(`[DemoReset] Reseed done for store ${storeId} — running engines silently…`);
    // Mark as running so the dashboard banner shows if anyone is watching
    demoState.set(storeId, { running: true, email });

    try {
      await runIntelligenceForStore(storeId);
      console.log(`[DemoReset] Silent engines done for store ${storeId} — starting new 90-min cooldown`);
    } catch (err: any) {
      console.error(`[DemoReset] Silent engine error for store ${storeId}:`, err.message);
    }

    // Whether engines succeeded or errored, start a new cooldown cycle
    const resetAt = Date.now() + RESET_DELAY_MS;
    demoState.set(storeId, { running: false, resetAt, email });
    setTimeout(() => spawnFullReseedAndRunEngines(storeId, email), RESET_DELAY_MS);
    console.log(`[DemoReset] Next reseed scheduled for store ${storeId} in 90 min`);
  });

  child.on("error", (err) => {
    console.error(`[DemoReset] Spawn error for store ${storeId}:`, err.message);
    demoState.delete(storeId);
  });
}

// ── GET /status ───────────────────────────────────────────────────────────────
router.get("/status", async (req: any, res) => {
  const user = await getSessionUser(req);
  if (!isDemoAllowed(user)) {
    return res.status(403).json({ error: "Demo account only." });
  }

  const storeId = parseInt(req.query.storeId as string);
  if (!storeId || isNaN(storeId)) {
    return res.status(400).json({ error: "storeId is required" });
  }

  const state = demoState.get(storeId);

  if (!state) return res.json({ status: "ready" });

  if (state.running) return res.json({ status: "running" });

  if (state.reseeding) {
    return res.json({ status: "cooldown", msLeft: 90_000 });
  }

  if (state.resetAt) {
    const msLeft = state.resetAt - Date.now();
    if (msLeft > 0) return res.json({ status: "cooldown", resetAt: state.resetAt, msLeft });
    // Timer already fired but child hasn't started — kick off reseed now
    spawnFullReseedAndRunEngines(storeId, state.email);
    return res.json({ status: "cooldown", msLeft: 90_000 });
  }

  return res.json({ status: "ready" });
});

// ── Reseed synchronously inside an SSE stream ────────────────────────────────
// Always uses the inline seedTesterStore seeder, regardless of account type.
//
// WHY: The shell-script reseed path (reseed-nail-demo.ts etc.) deletes and
// recreates the user + store records with NEW database IDs. This breaks the
// active SSE session because the storeId the client sent in the query-string
// now points to a deleted row — so every engine write goes nowhere and the
// dashboard shows zero data when the user lands back on /intelligence.
//
// The inline seeder is correct for the live-launch flow:
//   • It targets the EXISTING storeId (the one the client passed)
//   • It only clears clients + appointments (not the store or user record)
//   • It uses whatever services/staff already exist in the store (nail-demo
//     already has nail-specific services, so the seeded data is still themed)
//   • The session stays valid throughout
//
// The full shell-script reseed is still used by spawnFullReseedAndRunEngines
// (the background 90-minute cycle) where no live session is active.
function reseedForLaunch(
  _email: string,
  storeId: number,
  send: (data: object) => void
): Promise<void> {
  return seedTesterStore(storeId, send)
    .then(() => {
      send({
        phase: "seed",
        status: "done",
        logLine: "[SEED] ✓ Demo data ready — launching intelligence engines...",
      });
    })
    .catch((err: Error) => {
      console.error("[DemoLaunch] Seed error for store", storeId, err);
      send({
        phase: "seed",
        status: "done",
        logLine: `[SEED] ⚠ Seed error: ${err.message} — proceeding with existing data`,
      });
    });
}

// ── GET /launch (SSE) ─────────────────────────────────────────────────────────
router.get("/launch", async (req: any, res) => {
  const user = await getSessionUser(req);
  if (!isDemoAllowed(user)) {
    return res.status(403).json({ error: "This endpoint is only available for demo accounts." });
  }

  const storeId = parseInt(req.query.storeId as string);
  if (!storeId || isNaN(storeId)) {
    return res.status(400).json({ error: "storeId is required" });
  }

  const current = demoState.get(storeId);
  if (current?.running) {
    return res.status(409).json({ error: "Engines are already running for this store." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Disable Nagle's algorithm on the Express↔proxy socket so each
  // res.write() is sent as its own TCP segment without coalescing.
  (req as any).socket?.setNoDelay(true);

  demoState.set(storeId, { running: true, email: user!.email });

  // Pre-built 4 KB comment padding — most reverse proxies (including Replit's)
  // buffer chunked SSE until they accumulate ~4 KB before forwarding.
  // Prefixing every event with this comment fills the buffer immediately,
  // forcing the proxy to flush the data event along with it.
  const SSE_PAD = `: ${"x".repeat(4080)}\n`;

  const send = (data: object) => {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    // Write padding + payload as one chunk so proxy flushes both together
    res.write(SSE_PAD + payload);
    if (typeof (res as any).flush === "function") (res as any).flush();
  };

  // Send a ping every second to keep the connection alive through idle gaps
  // and to push any residual proxy buffer between engine sleeps.
  const keepAlive = setInterval(() => {
    res.write(SSE_PAD + ": keepalive\n\n");
    if (typeof (res as any).flush === "function") (res as any).flush();
  }, 1_000);

  let enginesCompleted = false;
  try {
    // ── Step 1: reseed the store with fresh demo data ──────────────────────
    await reseedForLaunch(user!.email, storeId, send);

    // ── Step 2: short pause so the UI can transition to "launching" ────────
    await new Promise<void>((r) => setTimeout(r, 800));

    // ── Step 3: run all 8 intelligence engines ─────────────────────────────
    await runDemoEngines(storeId, (event) => send(event));
    enginesCompleted = true;
    send({ phase: "complete", status: "done", label: "All Systems Online" });
  } catch (err: any) {
    send({ phase: "error", status: "error", label: "Engine Error", error: err.message });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }

  if (enginesCompleted) {
    const resetAt = Date.now() + RESET_DELAY_MS;
    demoState.set(storeId, { running: false, resetAt, email: user!.email });
    setTimeout(() => spawnFullReseedAndRunEngines(storeId, user!.email), RESET_DELAY_MS);
    console.log(`[DemoReset] Auto-reseed+engines scheduled for store ${storeId} (${user!.email}) in 90 min`);
  } else {
    demoState.delete(storeId);
  }
});

export default router;
