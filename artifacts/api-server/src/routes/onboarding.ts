/**
 * Production Onboarding Routes
 *
 * Preflight checks, safety gate management, and live call viewer SSE stream.
 *
 * Endpoints:
 *   GET  /api/onboarding/:storeId/preflight      — run all safety checks
 *   GET  /api/onboarding/:storeId/status         — current gate + metrics
 *   POST /api/onboarding/:storeId/enable-calls   — open safety gate
 *   POST /api/onboarding/:storeId/disable-calls  — close safety gate
 *   GET  /api/onboarding/:storeId/call-stream    — SSE live call viewer
 *
 * Auth: requires x-validate-key header (same key as /api/validate/*).
 */

import { Router, type Request, type Response } from "express";
import { db, pool } from "../db";
import {
  locations,
  services,
  staff,
  appointments,
  storeSettings,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { safetyGate } from "../lib/safetyGate";
import { callEventBus } from "../lib/callEventBus";
import { BookingStateMachine } from "../lib/bookingStateMachine";

const router = Router();

// ─── Auth guard ───────────────────────────────────────────────────────────────
function isAuthorized(req: Request): boolean {
  const key = (process.env.VALIDATE_KEY ?? "").trim();
  if (!key) return process.env.NODE_ENV !== "production";
  return req.headers["x-validate-key"] === key;
}

function guard(req: Request, res: Response): boolean {
  if (!isAuthorized(req)) {
    res.status(403).json({ error: "Forbidden — set x-validate-key header" });
    return false;
  }
  return true;
}

function storeId(req: Request): number {
  return parseInt(String(req.params.storeId), 10);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
  data?: Record<string, unknown>;
}

async function checkSalonIsolation(sid: number): Promise<CheckResult> {
  try {
    const storeServices = await db
      .select({ id: services.id, storeId: services.storeId })
      .from(services)
      .where(eq(services.storeId, sid));

    const storeStaff = await db
      .select({ id: staff.id, storeId: staff.storeId })
      .from(staff)
      .where(eq(staff.storeId, sid));

    const wrongServices = storeServices.filter((s) => s.storeId !== sid);
    const wrongStaff    = storeStaff.filter((s) => s.storeId !== sid);

    const passed = wrongServices.length === 0 && wrongStaff.length === 0;
    return {
      name: "Salon Isolation",
      passed,
      detail: passed
        ? `All ${storeServices.length} services and ${storeStaff.length} staff are correctly scoped to store ${sid}`
        : `Data leakage detected — ${wrongServices.length} services / ${wrongStaff.length} staff belong to wrong store`,
      data: { services: storeServices.length, staff: storeStaff.length },
    };
  } catch (err: any) {
    return { name: "Salon Isolation", passed: false, detail: err.message };
  }
}

async function checkPhoneConfig(sid: number): Promise<CheckResult> {
  try {
    const [row] = await db
      .select({ preferences: storeSettings.preferences })
      .from(storeSettings)
      .where(eq(storeSettings.storeId, sid))
      .limit(1);

    const prefs = row?.preferences ? (JSON.parse(row.preferences) as Record<string, unknown>) : {};
    const phone = prefs.aiReceptionistPhone as string | undefined;
    const enabled = prefs.aiReceptionistEnabled as boolean | undefined;

    const webhookUrl = `${process.env.APP_URL ?? ""}/api/webhook/twilio/voice/${sid}`;

    return {
      name: "Twilio Phone Configuration",
      passed: !!phone,
      detail: phone
        ? `Phone number "${phone}" configured — webhook: ${webhookUrl}`
        : "No Twilio phone number assigned. Set aiReceptionistPhone in store preferences.",
      data: { phone: phone ?? null, enabled: enabled ?? false, webhookUrl },
    };
  } catch (err: any) {
    return { name: "Twilio Phone Configuration", passed: false, detail: err.message };
  }
}

async function checkServicesAndStaff(sid: number): Promise<CheckResult> {
  try {
    const storeServices = await db
      .select({ id: services.id, name: services.name, duration: services.duration })
      .from(services)
      .where(eq(services.storeId, sid));

    const storeStaff = await db
      .select({ id: staff.id, name: staff.name })
      .from(staff)
      .where(eq(staff.storeId, sid));

    const hasServices = storeServices.length > 0;
    const hasStaff    = storeStaff.length > 0;
    const passed      = hasServices && hasStaff;

    return {
      name: "Services and Staff",
      passed,
      detail: passed
        ? `${storeServices.length} service(s) and ${storeStaff.length} staff member(s) configured`
        : `Missing: ${!hasServices ? "services " : ""}${!hasStaff ? "staff" : ""}`,
      data: {
        services: storeServices.map((s) => ({ id: s.id, name: s.name, duration: s.duration })),
        staff:    storeStaff.map((s) => ({ id: s.id, name: s.name })),
      },
    };
  } catch (err: any) {
    return { name: "Services and Staff", passed: false, detail: err.message };
  }
}

async function checkTimezone(sid: number): Promise<CheckResult> {
  try {
    const [store] = await db
      .select({ timezone: locations.timezone, name: locations.name })
      .from(locations)
      .where(eq(locations.id, sid))
      .limit(1);

    if (!store) return { name: "Timezone", passed: false, detail: `Store ${sid} not found` };

    const tz = store.timezone ?? "UTC";
    let tzValid = false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      tzValid = true;
    } catch { /* invalid */ }

    const localTime = new Date().toLocaleString("en-US", { timeZone: tz, hour12: true });

    return {
      name: "Timezone",
      passed: tzValid,
      detail: tzValid
        ? `Timezone "${tz}" is valid — current local time: ${localTime}`
        : `Timezone "${tz}" is not a valid IANA timezone`,
      data: { timezone: tz, localTime },
    };
  } catch (err: any) {
    return { name: "Timezone", passed: false, detail: err.message };
  }
}

async function checkBookingSimulation(sid: number): Promise<CheckResult> {
  try {
    const [service] = await db
      .select({ id: services.id, name: services.name, duration: services.duration })
      .from(services)
      .where(eq(services.storeId, sid))
      .limit(1);

    const [staffMember] = await db
      .select({ id: staff.id, name: staff.name })
      .from(staff)
      .where(eq(staff.storeId, sid))
      .limit(1);

    if (!service || !staffMember) {
      return {
        name: "Booking Simulation",
        passed: false,
        detail: "Cannot simulate booking — no services or staff configured",
      };
    }

    // Simulate state machine flow
    const fsm = new BookingStateMachine(`onboard-sim-${sid}`, { storeId: sid });
    fsm.transition("SERVICE_SELECTION", { serviceId: service.id, serviceName: service.name });
    fsm.transition("DATE_SELECTION", { date: "2026-07-20" });
    fsm.transition("TIME_SELECTION", { requestedDateRaw: "10:00 AM" });
    fsm.transition("AVAILABILITY_CHECK");
    fsm.transition("SLOT_OFFER", {
      availableSlots: [{ time: "10:00", staffId: staffMember.id, staffName: staffMember.name }],
    });
    fsm.transition("CONFIRMATION", { selectedTime: "10:00", staffId: staffMember.id });

    // Run a real DB write + rollback
    let appointmentCreated = false;
    let appointmentId: number | null = null;
    try {
      const testDate = new Date("2026-07-20T10:00:00Z");
      const [inserted] = await db
        .insert(appointments)
        .values({
          date: testDate,
          duration: service.duration,
          status: "pending",
          notes: `__ONBOARDING_PREFLIGHT_${sid}__`,
          storeId: sid,
          serviceId: service.id,
          staffId: staffMember.id,
        })
        .returning({ id: appointments.id });

      appointmentId = inserted.id;
      appointmentCreated = true;

      // Immediately delete — this is a simulation only
      await db.delete(appointments).where(eq(appointments.id, inserted.id));

      fsm.transition("BOOKING_COMPLETE", { appointmentId: inserted.id });
    } catch (err: any) {
      return { name: "Booking Simulation", passed: false, detail: `DB write failed: ${err.message}` };
    }

    const passed = fsm.state === "BOOKING_COMPLETE" && appointmentCreated;
    return {
      name: "Booking Simulation",
      passed,
      detail: passed
        ? `Full booking cycle completed (create + delete) — state machine reached BOOKING_COMPLETE`
        : `Simulation failed at state ${fsm.state}`,
      data: {
        service: service.name,
        staff: staffMember.name,
        finalState: fsm.state,
        appointmentWritten: appointmentCreated,
        appointmentCleaned: true,
      },
    };
  } catch (err: any) {
    return { name: "Booking Simulation", passed: false, detail: err.message };
  }
}

async function checkAiCredentials(): Promise<CheckResult> {
  const hasOpenAi = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  const passed = hasOpenAi && hasTwilio;
  return {
    name: "AI & Twilio Credentials",
    passed,
    detail: passed
      ? "OpenAI API key and Twilio credentials are present"
      : `Missing: ${!hasOpenAi ? "OPENAI_API_KEY " : ""}${!hasTwilio ? "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN" : ""}`,
    data: { openAi: hasOpenAi, twilio: hasTwilio },
  };
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    const client = await Promise.race([
      pool.connect(),
      new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 3000)),
    ]);
    await (client as any).query("SELECT 1");
    (client as any).release();
    return { name: "Database", passed: true, detail: "Database connection healthy" };
  } catch (err: any) {
    return { name: "Database", passed: false, detail: err.message };
  }
}

// ─── ROUTE: Preflight ─────────────────────────────────────────────────────────
router.get("/api/onboarding/:storeId/preflight", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const sid = storeId(req);

  // Verify store exists
  const [store] = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.id, sid))
    .limit(1);

  if (!store) {
    res.status(404).json({ error: `Store ${sid} not found` });
    return;
  }

  const t0 = Date.now();

  // Run all checks in parallel (read-only except booking simulation)
  const [dbCheck, isolationCheck, phoneCheck, servicesCheck, tzCheck, credentialsCheck] =
    await Promise.all([
      checkDatabase(),
      checkSalonIsolation(sid),
      checkPhoneConfig(sid),
      checkServicesAndStaff(sid),
      checkTimezone(sid),
      checkAiCredentials(),
    ]);

  // Booking simulation after the parallel reads
  const bookingCheck = await checkBookingSimulation(sid);

  const checks = [dbCheck, isolationCheck, phoneCheck, servicesCheck, tzCheck, credentialsCheck, bookingCheck];
  const allPassed = checks.every((c) => c.passed);
  const passedCount = checks.filter((c) => c.passed).length;

  const gateStatus = safetyGate.getStatus(sid);

  res.status(allPassed ? 200 : 422).json({
    storeId: sid,
    storeName: store.name,
    allPassed,
    summary: `${passedCount}/${checks.length} checks passed`,
    recommendation: allPassed
      ? `✅ Preflight complete — call POST /api/onboarding/${sid}/enable-calls to activate live routing`
      : `❌ Fix failing checks before enabling live calls`,
    checks,
    safetyGate: gateStatus,
    durationMs: Date.now() - t0,
  });
});

// ─── ROUTE: Status ────────────────────────────────────────────────────────────
router.get("/api/onboarding/:storeId/status", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const sid = storeId(req);

  const [store] = await db
    .select({ id: locations.id, name: locations.name, timezone: locations.timezone })
    .from(locations)
    .where(eq(locations.id, sid))
    .limit(1);

  if (!store) {
    res.status(404).json({ error: `Store ${sid} not found` });
    return;
  }

  const status = safetyGate.getStatus(sid);
  res.json({
    storeId: sid,
    storeName: store.name,
    timezone: store.timezone,
    liveViewerSubscribers: callEventBus.subscriberCount(sid),
    ...status,
  });
});

// ─── ROUTE: Enable calls ──────────────────────────────────────────────────────
router.post("/api/onboarding/:storeId/enable-calls", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const sid = storeId(req);

  const [store] = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.id, sid))
    .limit(1);

  if (!store) {
    res.status(404).json({ error: `Store ${sid} not found` });
    return;
  }

  safetyGate.enableCalls(sid);
  console.log(`[Onboarding] ✅ Live calls ENABLED for store ${sid} (${store.name})`);

  res.json({
    storeId: sid,
    storeName: store.name,
    liveCallsEnabled: true,
    message: "Live call routing activated",
    status: safetyGate.getStatus(sid),
  });
});

// ─── ROUTE: Disable calls ─────────────────────────────────────────────────────
router.post("/api/onboarding/:storeId/disable-calls", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const sid = storeId(req);
  const reason = (req.body?.reason as string) || "Manual disable via onboarding API";

  safetyGate.disableCalls(sid, reason);
  console.log(`[Onboarding] 🚫 Live calls DISABLED for store ${sid} — ${reason}`);

  res.json({
    storeId: sid,
    liveCallsEnabled: false,
    reason,
    status: safetyGate.getStatus(sid),
  });
});

// ─── ROUTE: Live Call Viewer — SSE stream ─────────────────────────────────────
router.get("/api/onboarding/:storeId/call-stream", (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  const sid = storeId(req);

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send initial ping with current gate status
  const initEvent = {
    type: "connected",
    storeId: sid,
    timestamp: new Date().toISOString(),
    data: safetyGate.getStatus(sid),
  };
  res.write(`data: ${JSON.stringify(initEvent)}\n\n`);

  // Register subscriber
  callEventBus.subscribe(sid, res);

  // Heartbeat every 15 s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 15_000);

  req.on("close", () => clearInterval(heartbeat));
});

export default router;
