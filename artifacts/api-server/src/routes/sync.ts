import { Router } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { appointments, waitlist, locations, services, staff } from "@shared/schema";
import { clients, clientPhones, clientEmails, clientNotes } from "@shared/schema/clients";
import { eq as eqOp, and as andOp, sql as sqlOp, isNull as isNullOp } from "drizzle-orm";
import { eq, and, isNotNull } from "drizzle-orm";
import { broadcastSyncEvent } from "../notifications";
import { logAuditEntry, getAuditLog, getAuditStats } from "../lib/sync-audit";

const router = Router();

const SYNC_PROTOCOL_VERSION = "1.0";
const COMPATIBLE_PROTOCOL_MAJOR = 1;

type ActionType =
  | "CREATE_BOOKING"
  | "UPDATE_BOOKING"
  | "CANCEL_BOOKING"
  | "CHECKIN"
  | "CHECKOUT"
  | "WALKIN"
  | "ASSIGN_STAFF"
  | "CREATE_CLIENT"
  | "UPDATE_CLIENT";

type SyncAction = {
  id: string;
  type: ActionType;
  entity_temp_id: string;
  payload: Record<string, unknown>;
  timestamp: number;
  idempotency_key: string;
  device_id: string;
  sequence_index: number;
  order_index?: number;
  entity_fingerprint?: string;
  snapshot_version?: number;
};

type ActionResult = {
  actionId: string;
  type: ActionType;
  status: "applied" | "duplicate" | "conflict" | "skipped" | "error" | "rejected";
  realId?: number;
  conflict?: string;
  order_index?: number;
};

const syncIdempotencyStore = new Map<string, { ts: number; realId?: number }>();
const SYNC_IDEMPOTENCY_TTL = 48 * 60 * 60 * 1000;

const fingerprintStore = new Map<string, { ts: number; realId: number }>();
const FINGERPRINT_TTL_MS = 4 * 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  const idempotencyCutoff = now - SYNC_IDEMPOTENCY_TTL;
  const fpCutoff = now - FINGERPRINT_TTL_MS;
  for (const [k, v] of syncIdempotencyStore) {
    if (v.ts < idempotencyCutoff) syncIdempotencyStore.delete(k);
  }
  for (const [k, v] of fingerprintStore) {
    if (v.ts < fpCutoff) fingerprintStore.delete(k);
  }
}, 60 * 60 * 1000);

const STATUS_PRIORITY: Record<string, number> = {
  completed: 3,
  started: 2,
  checked_in: 2,
  pending: 1,
  cancelled: 0,
};

function statusPriority(s: string | null | undefined): number {
  return STATUS_PRIORITY[s ?? ""] ?? 0;
}

function hasTimeOverlap(
  aStart: Date, aDurationMin: number,
  bStart: Date, bDurationMin: number
): boolean {
  const aEnd = new Date(aStart.getTime() + aDurationMin * 60_000);
  const bEnd = new Date(bStart.getTime() + bDurationMin * 60_000);
  return aStart < bEnd && bStart < aEnd;
}

function isCompatibleProtocol(version?: string): boolean {
  if (!version) return true;
  const [major] = version.split(".").map(Number);
  return major === COMPATIBLE_PROTOCOL_MAJOR;
}

function fpKey(storeId: number, fingerprint: string): string {
  return `${storeId}:${fingerprint}`;
}

function makeBatchResponse(
  batchId: string,
  lastIndex: number,
  mappings: Record<string, number>,
  results: ActionResult[],
  conflicts: { actionId: string; type: string; detail: string }[]
) {
  return {
    batch_id: batchId,
    protocol_version: SYNC_PROTOCOL_VERSION,
    last_successfully_processed_index: lastIndex,
    mappings,
    results,
    conflicts,
  };
}

router.get("/heartbeat", (_req, res) => {
  res.json({ ok: true, ts: Date.now(), protocol_version: SYNC_PROTOCOL_VERSION });
});

router.get("/audit", isAuthenticated, async (req, res) => {
  const userId = (req.session as any)?.userId;
  const [userStore] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.userId, userId))
    .limit(1);
  if (!userStore) return res.status(404).json({ message: "Store not found" });

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const entries = getAuditLog(userStore.id, limit);
  const stats = getAuditStats(userStore.id);
  return res.json({ entries, stats });
});

router.post("/queue", isAuthenticated, async (req, res) => {
  const {
    storeId: bodyStoreId,
    actions,
    batch_id,
    sync_protocol_version,
    snapshot_version,
  }: {
    storeId?: number;
    actions: SyncAction[];
    batch_id?: string;
    sync_protocol_version?: string;
    snapshot_version?: number;
  } = req.body;

  const userId = (req.session as any)?.userId;

  if (!isCompatibleProtocol(sync_protocol_version)) {
    return res.status(409).json({
      message: "Incompatible sync protocol version",
      version_mismatch: true,
      server_protocol_version: SYNC_PROTOCOL_VERSION,
    });
  }

  if (!Array.isArray(actions) || actions.length === 0) {
    return res.status(400).json({ message: "actions array required" });
  }

  const userStore = await db
    .select()
    .from(locations)
    .where(eq(locations.userId, userId))
    .limit(1);
  if (!userStore.length) return res.status(404).json({ message: "Store not found" });
  const storeId = bodyStoreId ?? userStore[0].id;
  const effectiveBatchId = batch_id ?? `server_${Date.now()}`;

  const sorted = [...actions].sort(
    (a, b) =>
      (a.order_index ?? a.sequence_index) -
        (b.order_index ?? b.sequence_index) ||
      a.timestamp - b.timestamp
  );

  const mappings: Record<string, number> = {};
  const results: ActionResult[] = [];
  const conflicts: { actionId: string; type: string; detail: string }[] = [];
  let lastSuccessIndex = -1;

  for (const action of sorted) {
    const orderIndex = action.order_index ?? action.sequence_index;
    try {
      const cached = syncIdempotencyStore.get(action.idempotency_key);
      if (cached && Date.now() - cached.ts < SYNC_IDEMPOTENCY_TTL) {
        if (action.entity_temp_id && cached.realId) {
          mappings[action.entity_temp_id] = cached.realId;
        }
        const r: ActionResult = {
          actionId: action.id,
          type: action.type,
          status: "duplicate",
          realId: cached.realId,
          order_index: orderIndex,
        };
        results.push(r);
        lastSuccessIndex = orderIndex;
        continue;
      }

      if (action.entity_fingerprint) {
        const key = fpKey(storeId, action.entity_fingerprint);
        const existing = fingerprintStore.get(key);
        if (existing && Date.now() - existing.ts < FINGERPRINT_TTL_MS) {
          if (action.entity_temp_id) mappings[action.entity_temp_id] = existing.realId;
          const r: ActionResult = {
            actionId: action.id,
            type: action.type,
            status: "duplicate",
            realId: existing.realId,
            conflict: `Cross-device duplicate detected via fingerprint → merged to ID ${existing.realId}`,
            order_index: orderIndex,
          };
          results.push(r);
          conflicts.push({ actionId: action.id, type: action.type, detail: r.conflict! });
          logAuditEntry({
            ts: Date.now(), storeId,
            deviceId: action.device_id,
            batchId: effectiveBatchId,
            actionId: action.id,
            actionType: action.type,
            status: "merged",
            entityId: existing.realId,
            resolution: r.conflict,
          });
          lastSuccessIndex = orderIndex;
          continue;
        }
      }

      let result: ActionResult | null = null;

      if (action.type === "CREATE_BOOKING") {
        result = await handleCreateBooking(action, storeId, mappings);
      } else if (action.type === "UPDATE_BOOKING") {
        result = await handleUpdateBooking(action, storeId, mappings);
      } else if (action.type === "CANCEL_BOOKING") {
        result = await handleCancelBooking(action, storeId, mappings);
      } else if (action.type === "CHECKIN") {
        result = await handleCheckin(action, storeId, mappings);
      } else if (action.type === "CHECKOUT") {
        result = await handleCheckout(action, storeId, mappings);
      } else if (action.type === "WALKIN") {
        result = await handleWalkin(action, storeId, mappings);
      } else if (action.type === "ASSIGN_STAFF") {
        result = await handleAssignStaff(action, storeId, mappings);
      } else if (action.type === "CREATE_CLIENT") {
        result = await handleCreateClient(action, storeId, mappings);
      } else if (action.type === "UPDATE_CLIENT") {
        result = await handleUpdateClient(action, storeId, mappings);
      }

      if (result) {
        result.order_index = orderIndex;
        syncIdempotencyStore.set(action.idempotency_key, {
          ts: Date.now(),
          realId: result.realId,
        });

        if (result.realId && action.entity_temp_id) {
          mappings[action.entity_temp_id] = result.realId;
        }
        if (result.realId && action.entity_fingerprint) {
          const key = fpKey(storeId, action.entity_fingerprint);
          fingerprintStore.set(key, { ts: Date.now(), realId: result.realId });
        }
        if (result.conflict) {
          conflicts.push({ actionId: action.id, type: action.type, detail: result.conflict });
        }

        logAuditEntry({
          ts: Date.now(), storeId,
          deviceId: action.device_id,
          batchId: effectiveBatchId,
          actionId: action.id,
          actionType: action.type,
          status: result.status as any,
          entityId: result.realId,
          resolution: result.conflict,
        });

        results.push(result);
        if (result.status !== "error") lastSuccessIndex = orderIndex;
      }
    } catch (err) {
      console.error(`[sync] Action ${action.id} (${action.type}) failed:`, err);
      const r: ActionResult = {
        actionId: action.id,
        type: action.type,
        status: "error",
        order_index: orderIndex,
      };
      results.push(r);
      logAuditEntry({
        ts: Date.now(), storeId,
        deviceId: action.device_id,
        batchId: effectiveBatchId,
        actionId: action.id,
        actionType: action.type,
        status: "error",
        detail: String(err),
      });
    }
  }

  return res.json(makeBatchResponse(effectiveBatchId, lastSuccessIndex, mappings, results, conflicts));
});

async function validateService(
  serviceId: number | null | undefined,
  storeId: number
): Promise<boolean> {
  if (!serviceId) return true;
  const [svc] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.storeId, storeId)))
    .limit(1);
  return !!svc;
}

async function handleCreateBooking(
  action: SyncAction,
  storeId: number,
  mappings: Record<string, number>
): Promise<ActionResult> {
  const p = action.payload as any;
  const date = new Date(p.date);
  const duration = Number(p.duration) || 30;
  const customerId = p.customerId ? Number(p.customerId) : null;
  const serviceId = p.serviceId ? Number(p.serviceId) : null;
  const resolvedStaffId = p.staffId ? resolveId(p.staffId, mappings) : null;

  if (serviceId) {
    const valid = await validateService(serviceId, storeId);
    if (!valid) {
      return {
        actionId: action.id, type: action.type, status: "rejected",
        conflict: `Service ID ${serviceId} not found for this store (snapshot version mismatch?)`,
      };
    }
  }

  const existingApts = await storage.getAppointments({ storeId });

  if (customerId) {
    const duplicate = existingApts.find((apt) => {
      if (apt.customerId !== customerId) return false;
      if (apt.status === "cancelled") return false;
      return hasTimeOverlap(new Date(apt.date), apt.duration, date, duration);
    });
    if (duplicate) {
      broadcastSyncEvent({ type: "booking_created", storeId, appointmentId: duplicate.id, source: "sync_dedup" });
      return {
        actionId: action.id, type: action.type, status: "duplicate",
        realId: duplicate.id,
        conflict: `Duplicate booking merged → ID ${duplicate.id}`,
      };
    }
  }

  if (resolvedStaffId) {
    const staffConflict = existingApts.find((apt) => {
      if (apt.staffId !== resolvedStaffId) return false;
      if (apt.status === "cancelled" || apt.status === "completed") return false;
      return hasTimeOverlap(new Date(apt.date), apt.duration, date, duration);
    });
    if (staffConflict) {
      return {
        actionId: action.id, type: action.type, status: "conflict",
        conflict: `Staff already booked at this time (appointment #${staffConflict.id})`,
      };
    }
  }

  const apt = await storage.createAppointment({
    date, duration,
    status: p.status || "pending",
    notes: p.notes || null,
    serviceId,
    staffId: resolvedStaffId,
    customerId,
    storeId,
    depositRequired: p.depositRequired || false,
    depositPaid: p.depositPaid || false,
  } as any);

  broadcastSyncEvent({ type: "booking_created", storeId, appointmentId: apt.id, source: "sync" });
  return { actionId: action.id, type: action.type, status: "applied", realId: apt.id };
}

async function handleUpdateBooking(
  action: SyncAction,
  storeId: number,
  mappings: Record<string, number>
): Promise<ActionResult> {
  const p = action.payload as any;
  const realId = resolveId(p.appointmentId ?? action.entity_temp_id, mappings);
  if (!realId) return { actionId: action.id, type: action.type, status: "skipped", conflict: "No resolved ID" };

  const existing = await storage.getAppointment(realId);
  if (!existing) {
    return { actionId: action.id, type: action.type, status: "conflict", realId, conflict: "Booking not found — may have been deleted server-side" };
  }

  const updates: Record<string, unknown> = {};
  if (p.notes !== undefined) updates.notes = p.notes;
  if (p.date !== undefined) updates.date = new Date(p.date);
  if (p.duration !== undefined) updates.duration = Number(p.duration);
  if (p.serviceId !== undefined) {
    const valid = await validateService(Number(p.serviceId), storeId);
    if (valid) updates.serviceId = Number(p.serviceId);
  }
  if (p.staffId !== undefined) updates.staffId = resolveId(p.staffId, mappings);

  await storage.updateAppointment(realId, updates as any);
  broadcastSyncEvent({ type: "booking_updated", storeId, appointmentId: realId, changes: Object.keys(updates) });
  return { actionId: action.id, type: action.type, status: "applied", realId };
}

async function handleCancelBooking(
  action: SyncAction,
  storeId: number,
  mappings: Record<string, number>
): Promise<ActionResult> {
  const p = action.payload as any;
  const realId = resolveId(p.appointmentId ?? action.entity_temp_id, mappings);
  if (!realId) return { actionId: action.id, type: action.type, status: "skipped", conflict: "No resolved ID" };

  await storage.updateAppointment(realId, { status: "cancelled", cancellationReason: p.reason || "Cancelled offline" } as any);
  broadcastSyncEvent({ type: "booking_deleted", storeId, appointmentId: realId });
  return { actionId: action.id, type: action.type, status: "applied", realId };
}

async function handleCheckin(
  action: SyncAction,
  storeId: number,
  mappings: Record<string, number>
): Promise<ActionResult> {
  const p = action.payload as any;
  const realId = resolveId(p.appointmentId ?? action.entity_temp_id, mappings);
  if (!realId) return { actionId: action.id, type: action.type, status: "skipped" };

  const existing = await storage.getAppointment(realId);
  if (!existing) return { actionId: action.id, type: action.type, status: "error", realId };

  if (statusPriority(existing.status) >= statusPriority("completed")) {
    return {
      actionId: action.id, type: action.type, status: "conflict", realId,
      conflict: `Server already at "${existing.status}" — CHECKOUT wins`,
    };
  }

  await storage.updateAppointment(realId, { status: "started", startedAt: new Date() } as any);
  broadcastSyncEvent({ type: "booking_updated", storeId, appointmentId: realId, changes: ["status", "startedAt"] });
  return { actionId: action.id, type: action.type, status: "applied", realId };
}

async function handleCheckout(
  action: SyncAction,
  storeId: number,
  mappings: Record<string, number>
): Promise<ActionResult> {
  const p = action.payload as any;
  const realId = resolveId(p.appointmentId ?? action.entity_temp_id, mappings);
  if (!realId) return { actionId: action.id, type: action.type, status: "skipped" };

  const updates: any = { status: "completed", completedAt: new Date() };
  if (p.totalPaid !== undefined) updates.totalPaid = String(p.totalPaid);
  if (p.paymentMethod !== undefined) updates.paymentMethod = p.paymentMethod;
  if (p.tipAmount !== undefined) updates.tipAmount = String(p.tipAmount);

  await storage.updateAppointment(realId, updates);
  broadcastSyncEvent({ type: "booking_updated", storeId, appointmentId: realId, changes: ["status", "completedAt"] });
  return { actionId: action.id, type: action.type, status: "applied", realId };
}

async function handleWalkin(
  action: SyncAction,
  storeId: number,
  mappings: Record<string, number>
): Promise<ActionResult> {
  const p = action.payload as any;

  if (action.entity_fingerprint) {
    const key = fpKey(storeId, action.entity_fingerprint);
    const cached = fingerprintStore.get(key);
    if (cached && Date.now() - cached.ts < FINGERPRINT_TTL_MS) {
      return {
        actionId: action.id, type: action.type, status: "duplicate",
        realId: cached.realId,
        conflict: `Duplicate walk-in merged → ID ${cached.realId}`,
      };
    }
  }

  const [entry] = await db.insert(waitlist).values({
    storeId,
    customerName: p.customerName,
    customerPhone: p.customerPhone || null,
    notes: p.notes || null,
    serviceId: p.serviceId ? Number(p.serviceId) : null,
    staffId: p.staffId ? resolveId(p.staffId, mappings) : null,
    customerId: p.customerId ? Number(p.customerId) : null,
    status: "waiting",
  }).returning();

  return { actionId: action.id, type: action.type, status: "applied", realId: entry.id };
}

async function handleAssignStaff(
  action: SyncAction,
  storeId: number,
  mappings: Record<string, number>
): Promise<ActionResult> {
  const p = action.payload as any;
  const realId = resolveId(p.appointmentId ?? action.entity_temp_id, mappings);
  if (!realId) return { actionId: action.id, type: action.type, status: "skipped" };

  const existing = await storage.getAppointment(realId);
  if (!existing) return { actionId: action.id, type: action.type, status: "error" };

  const existingWithUpdatedAt = existing as typeof existing & { updatedAt?: Date | string | null };
  const serverUpdatedAt = existingWithUpdatedAt.updatedAt
    ? new Date(existingWithUpdatedAt.updatedAt).getTime()
    : 0;
  if (serverUpdatedAt > action.timestamp) {
    return {
      actionId: action.id, type: action.type, status: "conflict", realId,
      conflict: "Server staff assignment is newer — server wins",
    };
  }

  const resolvedStaffId = resolveId(p.staffId, mappings);
  if (!resolvedStaffId) return { actionId: action.id, type: action.type, status: "skipped" };

  await storage.updateAppointment(realId, { staffId: resolvedStaffId } as any);
  broadcastSyncEvent({ type: "staff_assigned", storeId, appointmentId: realId, staffId: resolvedStaffId });
  return { actionId: action.id, type: action.type, status: "applied", realId };
}

async function handleCreateClient(
  action: SyncAction,
  storeId: number,
  mappings: Record<string, number>
): Promise<ActionResult> {
  const p = action.payload as any;

  // Check for duplicate by phone in client_phones
  let dupId: number | null = null;
  if (p.phone) {
    const digits = String(p.phone).replace(/\D/g, "").slice(-10);
    const dupRows = await db.execute(
      sqlOp`SELECT cl.id FROM clients cl JOIN client_phones cp ON cp.client_id = cl.id WHERE cl.store_id = ${storeId} AND RIGHT(REGEXP_REPLACE(cp.phone_number_e164, '[^0-9]', '', 'g'), 10) = ${digits} LIMIT 1`
    );
    if ((dupRows.rows as any[]).length > 0) dupId = Number((dupRows.rows as any[])[0].id);
  }
  if (!dupId && p.name) {
    const dupRows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(andOp(eqOp(clients.storeId, storeId), eqOp(clients.fullName, p.name)))
      .limit(1);
    if (dupRows.length > 0) dupId = dupRows[0].id;
  }

  if (dupId) {
    if (p.tempId) mappings[p.tempId] = dupId;
    return {
      actionId: action.id, type: action.type, status: "applied", realId: dupId,
      conflict: "Duplicate client — returning existing record",
    };
  }

  const nameParts = (p.name ?? "Unknown").split(" ");
  const [newClient] = await db
    .insert(clients)
    .values({
      storeId,
      fullName: p.name ?? "Unknown",
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" ") || "",
      loyaltyPoints: 0,
    })
    .returning({ id: clients.id });
  // `notes` is not a column on `clients` — it lives in `client_notes`.
  if (p.notes && String(p.notes).trim()) {
    await db.insert(clientNotes).values({
      clientId: newClient.id,
      storeId,
      noteContent: String(p.notes).trim(),
    });
  }

  if (p.phone) {
    await db.insert(clientPhones).values({ clientId: newClient.id, displayPhone: p.phone, phoneNumberE164: `+1${String(p.phone).replace(/\D/g, "").slice(-10)}`, isPrimary: true, smsOptIn: false });
  }
  if (p.email) {
    await db.insert(clientEmails).values({ clientId: newClient.id, emailAddress: p.email, isPrimary: true });
  }

  const realId = newClient.id;
  if (p.tempId) mappings[p.tempId] = realId;

  return { actionId: action.id, type: action.type, status: "applied", realId };
}

async function handleUpdateClient(
  action: SyncAction,
  storeId: number,
  mappings: Record<string, number>
): Promise<ActionResult> {
  const p = action.payload as any;
  const realId = resolveId(p.clientId ?? action.entity_temp_id, mappings);
  if (!realId) return { actionId: action.id, type: action.type, status: "skipped" };

  const updates: Record<string, unknown> = {};
  if (p.name !== undefined) { updates.fullName = p.name; updates.firstName = p.name.split(" ")[0]; updates.lastName = p.name.split(" ").slice(1).join(" ") || null; }
  if (p.notes !== undefined) updates.notes = p.notes;

  if (Object.keys(updates).length > 0) {
    await db.update(clients).set(updates).where(andOp(eqOp(clients.id, realId), eqOp(clients.storeId, storeId)));
  }
  if (p.phone !== undefined) {
    await db.execute(
      sqlOp`UPDATE client_phones SET display_phone = ${p.phone} WHERE client_id = ${realId} AND is_primary = true`
    );
  }
  if (p.email !== undefined) {
    await db.execute(
      sqlOp`UPDATE client_emails SET email_address = ${p.email} WHERE client_id = ${realId} AND is_primary = true`
    );
  }

  return { actionId: action.id, type: action.type, status: "applied", realId };
}

function resolveId(value: unknown, mappings: Record<string, number>): number | null {
  if (value == null) return null;
  const num = Number(value);
  if (!isNaN(num) && num > 0) return num;
  const str = String(value);
  return mappings[str] ?? null;
}

export default router;
