/**
 * Deterministic booking state machine.
 * Backend is the SOLE source of truth — AI only suggests transitions.
 *
 * States:
 *   GREETING → SERVICE_SELECTION → DATE_SELECTION → TIME_SELECTION
 *   → AVAILABILITY_CHECK → SLOT_OFFER → CONFIRMATION → BOOKING_COMPLETE
 *
 * Any step can transition to FAILED; FAILED can restart at GREETING.
 */

export type BookingState =
  | "GREETING"
  | "SERVICE_SELECTION"
  | "DATE_SELECTION"
  | "TIME_SELECTION"
  | "AVAILABILITY_CHECK"
  | "SLOT_OFFER"
  | "CONFIRMATION"
  | "BOOKING_COMPLETE"
  | "FAILED";

export interface AvailabilitySlot {
  time: string;
  staffId: number;
  staffName: string;
}

export interface BookingData {
  storeId?: number;
  serviceId?: number;
  serviceName?: string;
  staffId?: number;
  staffName?: string;
  requestedDateRaw?: string;
  date?: string;
  timeRange?: { start: string; end: string };
  selectedTime?: string;
  availableSlots?: AvailabilitySlot[];
  appointmentId?: number;
  callerPhone?: string;
  callerName?: string;
  errorMessage?: string;
}

interface TransitionRecord {
  from: BookingState;
  to: BookingState;
  at: string;
  dataSnapshot: Partial<BookingData>;
}

const VALID_TRANSITIONS: Record<BookingState, BookingState[]> = {
  GREETING:           ["SERVICE_SELECTION", "FAILED"],
  SERVICE_SELECTION:  ["DATE_SELECTION", "FAILED"],
  DATE_SELECTION:     ["TIME_SELECTION", "FAILED"],
  TIME_SELECTION:     ["AVAILABILITY_CHECK", "FAILED"],
  AVAILABILITY_CHECK: ["SLOT_OFFER", "DATE_SELECTION", "FAILED"],
  SLOT_OFFER:         ["CONFIRMATION", "DATE_SELECTION", "FAILED"],
  CONFIRMATION:       ["BOOKING_COMPLETE", "SERVICE_SELECTION", "FAILED"],
  BOOKING_COMPLETE:   [],
  FAILED:             ["GREETING"],
};

export class BookingStateMachine {
  public state: BookingState = "GREETING";
  public data: BookingData = {};
  private history: TransitionRecord[] = [];
  public readonly sessionId: string;
  public readonly createdAt: string;

  constructor(sessionId: string, initialData?: Partial<BookingData>) {
    this.sessionId = sessionId;
    this.createdAt = new Date().toISOString();
    if (initialData) Object.assign(this.data, initialData);
  }

  /** Attempt a state transition. Returns ok:true on success, ok:false with error on invalid. */
  transition(
    to: BookingState,
    data?: Partial<BookingData>,
  ): { ok: boolean; error?: string } {
    const allowed = VALID_TRANSITIONS[this.state];
    if (!allowed.includes(to)) {
      return {
        ok: false,
        error: `Invalid transition: ${this.state} → ${to}. Allowed next states: [${allowed.join(", ") || "none"}]`,
      };
    }

    this.history.push({
      from: this.state,
      to,
      at: new Date().toISOString(),
      dataSnapshot: { ...data },
    });

    this.state = to;
    if (data) Object.assign(this.data, data);
    return { ok: true };
  }

  /** Validate that the machine can progress (no missing data for current state). */
  validateCurrentState(): { valid: boolean; missingFields: string[] } {
    const missing: string[] = [];

    switch (this.state) {
      case "DATE_SELECTION":
        if (!this.data.serviceId) missing.push("serviceId");
        break;
      case "TIME_SELECTION":
        if (!this.data.serviceId) missing.push("serviceId");
        if (!this.data.date) missing.push("date");
        break;
      case "AVAILABILITY_CHECK":
        if (!this.data.serviceId) missing.push("serviceId");
        if (!this.data.date) missing.push("date");
        break;
      case "CONFIRMATION":
        if (!this.data.serviceId) missing.push("serviceId");
        if (!this.data.date) missing.push("date");
        if (!this.data.selectedTime) missing.push("selectedTime");
        break;
    }

    return { valid: missing.length === 0, missingFields: missing };
  }

  /** Full serializable snapshot for logging / debugging. */
  toJSON() {
    return {
      sessionId: this.sessionId,
      state: this.state,
      data: this.data,
      history: this.history,
      createdAt: this.createdAt,
    };
  }
}

/** Run a deterministic simulation of the full happy-path booking flow for testing. */
export function runStateMachineSimulation(storeId: number): {
  passed: boolean;
  steps: Array<{ from: BookingState; to: BookingState; ok: boolean; error?: string }>;
} {
  const fsm = new BookingStateMachine(`sim-${Date.now()}`, { storeId });
  const steps: Array<{ from: BookingState; to: BookingState; ok: boolean; error?: string }> = [];

  const plan: Array<{ to: BookingState; data?: Partial<BookingData> }> = [
    { to: "SERVICE_SELECTION", data: { serviceId: 1, serviceName: "Haircut" } },
    { to: "DATE_SELECTION",    data: { date: "2026-06-10" } },
    { to: "TIME_SELECTION",    data: { requestedDateRaw: "tomorrow afternoon" } },
    { to: "AVAILABILITY_CHECK" },
    {
      to: "SLOT_OFFER",
      data: { availableSlots: [{ time: "14:00", staffId: 1, staffName: "Alex" }] },
    },
    { to: "CONFIRMATION", data: { selectedTime: "14:00", staffId: 1, staffName: "Alex" } },
    { to: "BOOKING_COMPLETE", data: { appointmentId: 99999 } },
  ];

  for (const step of plan) {
    const from = fsm.state;
    const result = fsm.transition(step.to, step.data);
    steps.push({ from, to: step.to, ok: result.ok, error: result.error });
    if (!result.ok) break;
  }

  const passed = steps.every((s) => s.ok) && fsm.state === "BOOKING_COMPLETE";
  return { passed, steps };
}

/** Test that invalid transitions are correctly rejected. */
export function runInvalidTransitionTests(): {
  passed: boolean;
  tests: Array<{ description: string; ok: boolean }>;
} {
  const tests: Array<{ description: string; ok: boolean }> = [];

  // GREETING cannot jump to BOOKING_COMPLETE
  const fsm1 = new BookingStateMachine("test-invalid-1");
  const r1 = fsm1.transition("BOOKING_COMPLETE");
  tests.push({
    description: "GREETING → BOOKING_COMPLETE should be rejected",
    ok: !r1.ok,
  });

  // BOOKING_COMPLETE is terminal (no transitions)
  const fsm2 = new BookingStateMachine("test-invalid-2");
  fsm2.state = "BOOKING_COMPLETE";
  const r2 = fsm2.transition("GREETING");
  tests.push({
    description: "BOOKING_COMPLETE → GREETING should be rejected",
    ok: !r2.ok,
  });

  // FAILED can restart at GREETING
  const fsm3 = new BookingStateMachine("test-invalid-3");
  fsm3.state = "FAILED";
  const r3 = fsm3.transition("GREETING");
  tests.push({
    description: "FAILED → GREETING should be allowed (restart)",
    ok: r3.ok,
  });

  // Skipping DATE_SELECTION from SERVICE_SELECTION directly to CONFIRMATION is invalid
  const fsm4 = new BookingStateMachine("test-invalid-4");
  fsm4.transition("SERVICE_SELECTION");
  const r4 = fsm4.transition("CONFIRMATION");
  tests.push({
    description: "SERVICE_SELECTION → CONFIRMATION (skipping steps) should be rejected",
    ok: !r4.ok,
  });

  const passed = tests.every((t) => t.ok);
  return { passed, tests };
}
