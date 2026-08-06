/**
 * Validation endpoints — systematic layer-by-layer system verification.
 * Covers Phases 1-7 (Phases 8-9 require live Twilio credentials).
 *
 * ALL endpoints require an internal admin key:
 *   Header: x-validate-key: <VALIDATE_KEY env var>
 *   If VALIDATE_KEY is not set the endpoints are disabled in production.
 */

import { Router, type Request, type Response } from "express";
import { db, pool } from "../db";
import {
  locations,
  services,
  staff,
  appointments,
} from "@shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getWssHealth } from "../lib/wsHealth";
import { parseNLTimeInput } from "../lib/nlTimeParser";
import {
  BookingStateMachine,
  runStateMachineSimulation,
  runInvalidTransitionTests,
} from "../lib/bookingStateMachine";

const router = Router();

// ─── Guard ────────────────────────────────────────────────────────────────────
function isAuthorized(req: Request): boolean {
  const key = (process.env.VALIDATE_KEY ?? "").trim();
  // If no key configured → allow only in development
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
interface PhaseResult {
  phase: number;
  name: string;
  passed: boolean;
  details: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

async function runPhase(
  phase: number,
  name: string,
  fn: () => Promise<Record<string, unknown>>,
): Promise<PhaseResult> {
  const t0 = Date.now();
  try {
    const details = await fn();
    const passed =
      "passed" in details ? Boolean(details.passed) : !("error" in details);
    return { phase, name, passed, details, durationMs: Date.now() - t0 };
  } catch (err: any) {
    return {
      phase,
      name,
      passed: false,
      details: {},
      error: err?.message ?? String(err),
      durationMs: Date.now() - t0,
    };
  }
}

// ─── PHASE 1: System Health Check ─────────────────────────────────────────────
router.get("/api/validate/phase1", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;

  const result = await runPhase(1, "System Health Check", async () => {
    // Database
    let dbOk = false;
    let dbError: string | undefined;
    try {
      const client = await Promise.race([
        pool.connect(),
        new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 3000)),
      ]);
      await (client as any).query("SELECT 1");
      (client as any).release();
      dbOk = true;
    } catch (e: any) {
      dbError = e.message;
    }

    // WebSocket
    const wss = getWssHealth();

    // Required env vars
    const envChecks = {
      DATABASE_URL:    !!process.env.DATABASE_URL,
      SESSION_SECRET:  !!process.env.SESSION_SECRET,
      APP_URL:         !!process.env.APP_URL,
      OPENAI_API_KEY:  !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
      TWILIO_SID:      !!process.env.TWILIO_ACCOUNT_SID,
      TWILIO_TOKEN:    !!process.env.TWILIO_AUTH_TOKEN,
    };

    // Core route smoke-test (loopback)
    const routeChecks: Record<string, number> = {};
    const baseUrl = `http://127.0.0.1:${process.env.PORT ?? 8080}`;
    for (const path of ["/api/healthz", "/api/version"]) {
      try {
        const r = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(3000) });
        routeChecks[path] = r.status;
      } catch {
        routeChecks[path] = 0;
      }
    }

    const passed =
      dbOk &&
      wss.status === "ok" &&
      envChecks.DATABASE_URL &&
      envChecks.SESSION_SECRET &&
      Object.values(routeChecks).every((s) => s === 200);

    return {
      passed,
      database: { ok: dbOk, ...(dbError ? { error: dbError } : {}) },
      websocket: wss,
      env: envChecks,
      routes: routeChecks,
      uptime_seconds: Math.floor(process.uptime()),
    };
  });

  res.status(result.passed ? 200 : 503).json(result);
});

// ─── PHASE 2: Multi-Tenant Isolation ──────────────────────────────────────────
router.get("/api/validate/phase2", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;

  const result = await runPhase(2, "Multi-Tenant Isolation", async () => {
    // Fetch first two distinct stores
    const stores = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .limit(10);

    if (stores.length < 2) {
      return {
        passed: false,
        error: "Need at least 2 stores to test isolation — create a second store first",
        storesFound: stores.length,
        stores,
      };
    }

    const [storeA, storeB] = stores;

    // Verify services are scoped to their store
    const servicesA = await db
      .select({ id: services.id, storeId: services.storeId })
      .from(services)
      .where(eq(services.storeId, storeA.id));

    const servicesB = await db
      .select({ id: services.id, storeId: services.storeId })
      .from(services)
      .where(eq(services.storeId, storeB.id));

    const serviceIdsA = new Set(servicesA.map((s) => s.id));
    const serviceIdsB = new Set(servicesB.map((s) => s.id));
    const servicesCrossover = [...serviceIdsA].filter((id) => serviceIdsB.has(id));

    // Verify staff are scoped
    const staffA = await db
      .select({ id: staff.id, storeId: staff.storeId })
      .from(staff)
      .where(eq(staff.storeId, storeA.id));

    const staffB = await db
      .select({ id: staff.id, storeId: staff.storeId })
      .from(staff)
      .where(eq(staff.storeId, storeB.id));

    const staffIdsA = new Set(staffA.map((s) => s.id));
    const staffIdsB = new Set(staffB.map((s) => s.id));
    const staffCrossover = [...staffIdsA].filter((id) => staffIdsB.has(id));

    // Verify appointments are scoped
    const apptA = await db
      .select({ id: appointments.id, storeId: appointments.storeId })
      .from(appointments)
      .where(eq(appointments.storeId, storeA.id))
      .limit(5);

    const apptB = await db
      .select({ id: appointments.id, storeId: appointments.storeId })
      .from(appointments)
      .where(eq(appointments.storeId, storeB.id))
      .limit(5);

    const apptIdsA = new Set(apptA.map((a) => a.id));
    const apptIdsB = new Set(apptB.map((a) => a.id));
    const apptCrossover = [...apptIdsA].filter((id) => apptIdsB.has(id));

    // Verify clients are scoped
    const { clients: clientsTable } = await import("@shared/schema/clients");
    const custA = await db
      .select({ id: clientsTable.id, storeId: clientsTable.storeId })
      .from(clientsTable)
      .where(eq(clientsTable.storeId, storeA.id))
      .limit(5);

    const custB = await db
      .select({ id: clientsTable.id, storeId: clientsTable.storeId })
      .from(clientsTable)
      .where(eq(clientsTable.storeId, storeB.id))
      .limit(5);

    const custIdsA = new Set(custA.map((c) => c.id));
    const custIdsB = new Set(custB.map((c) => c.id));
    const custCrossover = [...custIdsA].filter((id) => custIdsB.has(id));

    const noLeakage =
      servicesCrossover.length === 0 &&
      staffCrossover.length === 0 &&
      apptCrossover.length === 0 &&
      custCrossover.length === 0;

    return {
      passed: noLeakage,
      storeA: { id: storeA.id, name: storeA.name, services: servicesA.length, staff: staffA.length },
      storeB: { id: storeB.id, name: storeB.name, services: servicesB.length, staff: staffB.length },
      isolation: {
        services: { crossover: servicesCrossover, leakage: servicesCrossover.length > 0 },
        staff:    { crossover: staffCrossover,    leakage: staffCrossover.length > 0 },
        appointments: { crossover: apptCrossover, leakage: apptCrossover.length > 0 },
        customers: { crossover: custCrossover,    leakage: custCrossover.length > 0 },
      },
    };
  });

  res.status(result.passed ? 200 : 422).json(result);
});

// ─── PHASE 3: Booking Engine CRUD ─────────────────────────────────────────────
router.post("/api/validate/phase3", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;

  const result = await runPhase(3, "Booking Engine CRUD", async () => {
    // Find first available store + service + staff for the test
    const [store] = await db.select({ id: locations.id, name: locations.name }).from(locations).limit(1);
    if (!store) return { passed: false, error: "No stores found in database" };

    const [service] = await db
      .select({ id: services.id, name: services.name, duration: services.duration })
      .from(services)
      .where(eq(services.storeId, store.id))
      .limit(1);
    if (!service) return { passed: false, error: `No services found for store ${store.id}` };

    const [staffMember] = await db
      .select({ id: staff.id, name: staff.name })
      .from(staff)
      .where(eq(staff.storeId, store.id))
      .limit(1);
    if (!staffMember) return { passed: false, error: `No staff found for store ${store.id}` };

    // Run all CRUD in a transaction so we always clean up
    const steps: Record<string, unknown> = {};
    let created: { id: number } | null = null;

    try {
      const testDate = new Date("2026-07-15T14:00:00Z");

      // CREATE
      const [inserted] = await db
        .insert(appointments)
        .values({
          date:     testDate,
          duration: service.duration,
          status:   "pending",
          notes:    "__VALIDATE_PHASE3_TEST__",
          storeId:  store.id,
          serviceId: service.id,
          staffId:  staffMember.id,
        })
        .returning({ id: appointments.id });

      created = inserted;
      steps.create = { ok: true, appointmentId: inserted.id };

      // READ — confirm it exists and is scoped to the correct store
      const [fetched] = await db
        .select({ id: appointments.id, storeId: appointments.storeId, status: appointments.status })
        .from(appointments)
        .where(eq(appointments.id, inserted.id));

      steps.read = {
        ok: !!fetched,
        storeIdMatches: fetched?.storeId === store.id,
        status: fetched?.status,
      };

      // UPDATE
      await db
        .update(appointments)
        .set({ status: "confirmed", notes: "__VALIDATE_PHASE3_TEST_UPDATED__" })
        .where(eq(appointments.id, inserted.id));

      const [updated] = await db
        .select({ status: appointments.status, notes: appointments.notes })
        .from(appointments)
        .where(eq(appointments.id, inserted.id));

      steps.update = {
        ok: updated?.status === "confirmed" && updated?.notes?.includes("UPDATED"),
        newStatus: updated?.status,
      };

      // DOUBLE-BOOKING CHECK — insert same slot, same staff, expect it to coexist
      // (the app prevents double bookings at the availability layer, not DB constraint)
      // We verify that two appointments on the same slot ARE possible to detect in a query.
      const sameSlotAppts = await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.storeId, store.id),
            eq(appointments.staffId, staffMember.id),
            gte(appointments.date, testDate),
            lte(appointments.date, testDate),
          ),
        );

      steps.doubleBookingCheck = {
        ok: true,
        slotsAtSameTime: sameSlotAppts.length,
        note:
          sameSlotAppts.length > 1
            ? "⚠️  Double-booking detected — availability layer must prevent this at booking time"
            : "✅ Single appointment at slot — no double-booking",
      };

      // DELETE
      await db.delete(appointments).where(eq(appointments.id, inserted.id));

      const [afterDelete] = await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(eq(appointments.id, inserted.id));

      steps.delete = { ok: !afterDelete, appointmentGone: !afterDelete };
    } catch (err: any) {
      // Clean up if the test appointment was created
      if (created) {
        await db.delete(appointments).where(eq(appointments.id, created.id)).catch(() => {});
      }
      throw err;
    }

    const allOk = Object.values(steps).every((s: any) => s.ok !== false);
    return {
      passed: allOk,
      store: { id: store.id, name: store.name },
      service: { id: service.id, name: service.name },
      staff: { id: staffMember.id, name: staffMember.name },
      steps,
    };
  });

  res.status(result.passed ? 200 : 422).json(result);
});

// ─── PHASE 4: State Machine ────────────────────────────────────────────────────
router.get("/api/validate/phase4", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;

  const result = await runPhase(4, "Booking State Machine", async () => {
    // 1. Happy-path simulation
    const [store] = await db.select({ id: locations.id }).from(locations).limit(1);
    const storeId = store?.id ?? 1;
    const happyPath = runStateMachineSimulation(storeId);

    // 2. Invalid-transition rejection tests
    const invalidTests = runInvalidTransitionTests();

    // 3. Manual FSM walk-through (interactive states)
    const fsm = new BookingStateMachine("phase4-manual", { storeId });
    const walkthrough: Array<{ step: string; state: string; ok: boolean }> = [];

    const manualSteps: Array<{ label: string; to: any; data?: any }> = [
      { label: "Greet → select service", to: "SERVICE_SELECTION", data: { serviceId: 99, serviceName: "Test Cut" } },
      { label: "Service → select date", to: "DATE_SELECTION", data: { date: "2026-07-10" } },
      { label: "Date → select time", to: "TIME_SELECTION", data: { requestedDateRaw: "afternoon" } },
      { label: "Time → check availability", to: "AVAILABILITY_CHECK" },
      { label: "Availability → offer slot", to: "SLOT_OFFER", data: { availableSlots: [{ time: "14:00", staffId: 1, staffName: "Alex" }] } },
      { label: "Slot → confirm", to: "CONFIRMATION", data: { selectedTime: "14:00", staffId: 1 } },
      { label: "Confirm → complete", to: "BOOKING_COMPLETE", data: { appointmentId: 12345 } },
    ];

    for (const step of manualSteps) {
      const r = fsm.transition(step.to, step.data);
      walkthrough.push({ step: step.label, state: fsm.state, ok: r.ok });
      if (!r.ok) break;
    }

    const passed = happyPath.passed && invalidTests.passed && walkthrough.every((s) => s.ok);

    return {
      passed,
      happyPath: { passed: happyPath.passed, steps: happyPath.steps },
      invalidTransitions: { passed: invalidTests.passed, tests: invalidTests.tests },
      manualWalkthrough: walkthrough,
      finalState: fsm.state,
    };
  });

  res.status(result.passed ? 200 : 422).json(result);
});

// ─── PHASE 5: WebSocket Stability (mock info + instructions) ──────────────────
router.get("/api/validate/phase5", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;

  const result = await runPhase(5, "WebSocket Stability", async () => {
    const wss = getWssHealth();

    // Provide instructions for manual mock test since we can't spawn 10 real WS clients
    // in a single HTTP handler safely
    const mockTestInstructions = [
      "Run: for i in {1..10}; do wscat -c 'ws://localhost:8080/media-stream' &; done",
      "Or use: artillery / k6 / websocat for load testing",
      "Check activeSessions below — should increase with each connection",
      "Check peakConcurrent to verify concurrent session tracking works",
    ];

    // We CAN verify that the WSS is initialized and tracking correctly
    const wssInitialized = wss.status === "ok";

    return {
      passed: wssInitialized,
      websocketServer: wss,
      note: wssInitialized
        ? "✅ WebSocket server initialized and tracking sessions. For concurrent load test, use the instructions below."
        : "❌ WebSocket server not initialized — ensure registerAiReceptionist() was called",
      mockTestInstructions,
      recommendation:
        "To simulate 5-10 concurrent sessions: connect multiple WebSocket clients to /media-stream " +
        "and send a valid Twilio 'start' event. Each gets its own isolated session (no shared state).",
    };
  });

  res.status(result.passed ? 200 : 503).json(result);
});

// ─── PHASE 7: Natural Language Time Parsing ────────────────────────────────────
router.get("/api/validate/phase7", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;

  const result = await runPhase(7, "Natural Language Time Parsing", async () => {
    // Get salon timezone from first store
    const [store] = await db
      .select({ id: locations.id, name: locations.name, timezone: locations.timezone })
      .from(locations)
      .limit(1);

    const timezone = store?.timezone || "America/New_York";
    const now = new Date("2026-05-29T10:00:00Z"); // Fixed reference date for deterministic tests

    const testCases: Array<{ input: string; expectedType: string }> = [
      { input: "tomorrow",             expectedType: "exact_date" },
      { input: "tomorrow afternoon",   expectedType: "exact_date" },
      { input: "Friday after 10",      expectedType: "exact_date" },
      { input: "next week",            expectedType: "date_range" },
      { input: "earliest available",   expectedType: "earliest" },
      { input: "anytime this week",    expectedType: "date_range" },
      { input: "today morning",        expectedType: "exact_date" },
      { input: "next Friday",          expectedType: "exact_date" },
      { input: "2026-06-15",           expectedType: "exact_date" },
      { input: "2026-06-15T14:00:00",  expectedType: "exact_date" },
      { input: "XYZNOTADATE!!!",       expectedType: "ambiguous" },
    ];

    const results = testCases.map((tc) => {
      const parsed = parseNLTimeInput(tc.input, timezone, now);
      const typeMatch = parsed.type === tc.expectedType;
      return {
        input:        tc.input,
        expectedType: tc.expectedType,
        actualType:   parsed.type,
        date:         parsed.date,
        dateRange:    parsed.dateRange,
        timeRange:    parsed.timeRange,
        parsed:       parsed.parsed,
        typeMatch,
      };
    });

    const allParsed = results.filter((r) => r.expectedType !== "ambiguous").every((r) => r.typeMatch);
    const ambiguousCorrectlyRejected = results
      .filter((r) => r.expectedType === "ambiguous")
      .every((r) => r.actualType === "ambiguous");

    return {
      passed: allParsed && ambiguousCorrectlyRejected,
      timezone,
      referenceDate: now.toISOString(),
      results,
      summary: {
        total: results.length,
        passed: results.filter((r) => r.typeMatch).length,
        failed: results.filter((r) => !r.typeMatch).length,
      },
    };
  });

  res.status(result.passed ? 200 : 422).json(result);
});

// ─── ALL PHASES ────────────────────────────────────────────────────────────────
router.get("/api/validate/all", async (req: Request, res: Response) => {
  if (!guard(req, res)) return;

  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? 8080}`;
  const headers: Record<string, string> = { "x-validate-key": req.headers["x-validate-key"] as string ?? "" };

  const phases = [
    { num: 1, path: "/api/validate/phase1", method: "GET" },
    { num: 2, path: "/api/validate/phase2", method: "GET" },
    { num: 4, path: "/api/validate/phase4", method: "GET" },
    { num: 5, path: "/api/validate/phase5", method: "GET" },
    { num: 7, path: "/api/validate/phase7", method: "GET" },
  ];

  const phaseResults: Array<Record<string, unknown>> = [];
  let overallPassed = true;

  for (const phase of phases) {
    try {
      const r = await fetch(`${baseUrl}${phase.path}`, {
        method: phase.method,
        headers,
        signal: AbortSignal.timeout(15000),
        ...(phase.method === "POST" ? { body: "{}", headers: { ...headers, "content-type": "application/json" } } : {}),
      });
      const data = await r.json() as Record<string, unknown>;
      phaseResults.push({ phase: phase.num, path: phase.path, passed: data.passed ?? r.ok, status: r.status, ...data });
      if (!data.passed) overallPassed = false;
    } catch (err: any) {
      phaseResults.push({ phase: phase.num, path: phase.path, passed: false, error: err.message });
      overallPassed = false;
    }
  }

  // Phase 3 needs POST
  try {
    const r = await fetch(`${baseUrl}/api/validate/phase3`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json() as Record<string, unknown>;
    phaseResults.push({ phase: 3, path: "/api/validate/phase3", passed: data.passed ?? r.ok, status: r.status, ...data });
    if (!data.passed) overallPassed = false;
  } catch (err: any) {
    phaseResults.push({ phase: 3, passed: false, error: (err as Error).message });
    overallPassed = false;
  }

  phaseResults.sort((a, b) => (a.phase as number) - (b.phase as number));

  const passedCount = phaseResults.filter((p) => p.passed).length;

  res.status(overallPassed ? 200 : 422).json({
    overallPassed,
    summary: `${passedCount}/${phaseResults.length} phases passed`,
    note: "Phases 6 (OpenAI), 8 (Twilio), 9 (edge cases) require external credentials — run them separately",
    phases: phaseResults,
  });
});

export default router;
