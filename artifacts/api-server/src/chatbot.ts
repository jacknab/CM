/**
 * AI Chatbot API
 *
 * Provides a clean REST interface for any AI chatbot (or external system) to:
 *   - Look up a customer's upcoming appointments by phone number
 *   - Confirm an appointment
 *   - Cancel an appointment
 *   - Reschedule an appointment to a new date/time
 *   - Check available time slots before rescheduling
 *
 * All endpoints are under /api/chatbot
 * Authentication is via a shared API key supplied in the X-Chatbot-Key header.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "./storage";
import { sendSms } from "./sms";
import { format, addMinutes, isAfter, isBefore, startOfDay, endOfDay, parseISO } from "date-fns";
import { db } from "./db";
import { staff as staffTable, appointments } from "@shared/schema";
import { eq, and, gte, lte, ne } from "drizzle-orm";

const router = Router();

// ---------------------------------------------------------------------------
// Auth guard — requires X-Chatbot-Key header matching CHATBOT_API_KEY env var
// ---------------------------------------------------------------------------
function chatbotAuth(req: Request, res: Response, next: () => void) {
  const apiKey = process.env.CHATBOT_API_KEY;
  if (!apiKey) {
    return next();
  }
  const provided = req.headers["x-chatbot-key"];
  if (provided !== apiKey) {
    return res.status(401).json({ error: "Unauthorized: invalid or missing X-Chatbot-Key header" });
  }
  next();
}

router.use(chatbotAuth);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAppointment(appt: any) {
  return {
    id: appt.id,
    date: appt.date,
    dateFormatted: format(new Date(appt.date), "EEEE, MMMM d 'at' h:mm a"),
    duration: appt.duration,
    status: appt.status,
    notes: appt.notes,
    cancellationReason: appt.cancellationReason,
    service: appt.service
      ? { id: appt.service.id, name: appt.service.name, price: appt.service.price }
      : null,
    staff: appt.staff
      ? { id: appt.staff.id, name: appt.staff.name }
      : null,
    customer: appt.customer
      ? { id: appt.customer.id, name: (appt.customer as any).fullName || appt.customer.name, phone: appt.customer.phone, email: appt.customer.email }
      : null,
    store: appt.store
      ? { id: appt.store.id, name: appt.store.name, phone: appt.store.phone }
      : null,
  };
}

// ---------------------------------------------------------------------------
// POST /api/chatbot/lookup
// Body: { phone: string, storeId?: number, upcomingOnly?: boolean }
//
// Returns all appointments for the customer with the given phone number.
// Pass upcomingOnly: true (default) to filter to future appointments only.
// ---------------------------------------------------------------------------
router.post("/lookup", async (req: Request, res: Response) => {
  const schema = z.object({
    phone: z.string().min(7, "Phone number too short"),
    storeId: z.number().int().positive().optional(),
    upcomingOnly: z.boolean().default(true),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten().fieldErrors });
  }

  const { phone, storeId, upcomingOnly } = parse.data;

  try {
    let appts = await storage.getAppointmentsByCustomerPhone(phone, storeId);

    if (upcomingOnly) {
      const now = new Date();
      appts = appts.filter(
        (a) => isAfter(new Date(a.date), now) && a.status !== "cancelled" && a.status !== "completed"
      );
    }

    appts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return res.json({
      count: appts.length,
      appointments: appts.map(formatAppointment),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Failed to look up appointments" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/chatbot/confirm
// Body: { appointmentId: number, notifyCustomer?: boolean }
//
// Sets the appointment status to "confirmed".
// ---------------------------------------------------------------------------
router.post("/confirm", async (req: Request, res: Response) => {
  const schema = z.object({
    appointmentId: z.number().int().positive(),
    notifyCustomer: z.boolean().default(true),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten().fieldErrors });
  }

  const { appointmentId, notifyCustomer } = parse.data;

  try {
    const appt = await storage.getAppointment(appointmentId);
    if (!appt) return res.status(404).json({ error: "Appointment not found" });

    if (appt.status === "cancelled" || appt.status === "completed") {
      return res.status(400).json({
        error: `Cannot confirm an appointment with status "${appt.status}"`,
      });
    }

    const updated = await storage.updateAppointment(appointmentId, { status: "confirmed" });

    if (notifyCustomer && appt.customer?.phone && appt.storeId) {
      const dateStr = format(new Date(appt.date), "EEEE, MMMM d 'at' h:mm a");
      const svcName = appt.service?.name ?? "your appointment";
      const body = `✅ Your ${svcName} on ${dateStr} is confirmed! We look forward to seeing you. Reply STOP to opt out.`;
      await sendSms(appt.storeId, appt.customer.phone, body, "chatbot_confirm", appointmentId, appt.customer.id).catch(() => null);
    }

    return res.json({ success: true, appointment: formatAppointment({ ...appt, ...updated }) });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Failed to confirm appointment" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/chatbot/cancel
// Body: { appointmentId: number, reason?: string, notifyCustomer?: boolean }
//
// Sets the appointment status to "cancelled" with an optional reason.
// ---------------------------------------------------------------------------
router.post("/cancel", async (req: Request, res: Response) => {
  const schema = z.object({
    appointmentId: z.number().int().positive(),
    reason: z.string().optional(),
    notifyCustomer: z.boolean().default(true),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten().fieldErrors });
  }

  const { appointmentId, reason, notifyCustomer } = parse.data;

  try {
    const appt = await storage.getAppointment(appointmentId);
    if (!appt) return res.status(404).json({ error: "Appointment not found" });

    if (appt.status === "cancelled") {
      return res.status(400).json({ error: "Appointment is already cancelled" });
    }
    if (appt.status === "completed") {
      return res.status(400).json({ error: "Cannot cancel a completed appointment" });
    }

    const updated = await storage.updateAppointment(appointmentId, {
      status: "cancelled",
      cancellationReason: reason ?? "Cancelled via chatbot",
    });

    if (notifyCustomer && appt.customer?.phone && appt.storeId) {
      const dateStr = format(new Date(appt.date), "EEEE, MMMM d 'at' h:mm a");
      const svcName = appt.service?.name ?? "your appointment";
      const body = `❌ Your ${svcName} on ${dateStr} has been cancelled. ${reason ? `Reason: ${reason}. ` : ""}Please contact us to rebook. Reply STOP to opt out.`;
      await sendSms(appt.storeId, appt.customer.phone, body, "chatbot_cancel", appointmentId, appt.customer.id).catch(() => null);
    }

    return res.json({ success: true, appointment: formatAppointment({ ...appt, ...updated }) });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Failed to cancel appointment" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/chatbot/reschedule
// Body: { appointmentId: number, newDate: string (ISO), notifyCustomer?: boolean }
//
// Moves the appointment to newDate. newDate must be an ISO 8601 datetime string.
// ---------------------------------------------------------------------------
router.post("/reschedule", async (req: Request, res: Response) => {
  const schema = z.object({
    appointmentId: z.number().int().positive(),
    newDate: z.string().datetime({ message: "newDate must be a valid ISO 8601 datetime string" }),
    notifyCustomer: z.boolean().default(true),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten().fieldErrors });
  }

  const { appointmentId, newDate, notifyCustomer } = parse.data;

  try {
    const appt = await storage.getAppointment(appointmentId);
    if (!appt) return res.status(404).json({ error: "Appointment not found" });

    if (appt.status === "cancelled" || appt.status === "completed") {
      return res.status(400).json({
        error: `Cannot reschedule an appointment with status "${appt.status}"`,
      });
    }

    const newDateObj = parseISO(newDate);
    if (isBefore(newDateObj, new Date())) {
      return res.status(400).json({ error: "newDate must be in the future" });
    }

    const updated = await storage.updateAppointment(appointmentId, {
      date: newDateObj,
      status: "confirmed",
    });

    if (notifyCustomer && appt.customer?.phone && appt.storeId) {
      const oldDateStr = format(new Date(appt.date), "EEEE, MMMM d 'at' h:mm a");
      const newDateStr = format(newDateObj, "EEEE, MMMM d 'at' h:mm a");
      const svcName = appt.service?.name ?? "your appointment";
      const body = `📅 Your ${svcName} has been rescheduled from ${oldDateStr} to ${newDateStr}. Reply STOP to opt out.`;
      await sendSms(appt.storeId, appt.customer.phone, body, "chatbot_reschedule", appointmentId, appt.customer.id).catch(() => null);
    }

    return res.json({ success: true, appointment: formatAppointment({ ...appt, ...updated }) });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Failed to reschedule appointment" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/chatbot/availability
// Query: storeId (required), date (YYYY-MM-DD), staffId?, serviceId?, slotDuration?
//
// Returns available time slots on the given date for the given store.
// Slots are 30-minute windows by default; pass slotDuration (minutes) to override.
// ---------------------------------------------------------------------------
router.get("/availability", async (req: Request, res: Response) => {
  const schema = z.object({
    storeId: z.coerce.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    staffId: z.coerce.number().int().positive().optional(),
    slotDuration: z.coerce.number().int().min(15).max(240).default(30),
  });

  const parse = schema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten().fieldErrors });
  }

  const { storeId, date, staffId, slotDuration } = parse.data;

  try {
    const store = await storage.getStore(storeId);
    if (!store) return res.status(404).json({ error: "Store not found" });

    const targetDate = new Date(date + "T00:00:00");
    const dayStart = startOfDay(targetDate);
    const dayEnd = endOfDay(targetDate);

    const calSettings = await storage.getCalendarSettings(storeId) as any;
    const openHour = calSettings?.startHour ?? 9;
    const closeHour = calSettings?.endHour ?? 17;

    const openTime = new Date(targetDate);
    openTime.setHours(openHour, 0, 0, 0);
    const closeTime = new Date(targetDate);
    closeTime.setHours(closeHour, 0, 0, 0);

    const existingConditions: any[] = [
      eq(appointments.storeId, storeId),
      gte(appointments.date, dayStart),
      lte(appointments.date, dayEnd),
      ne(appointments.status as any, "cancelled"),
    ];
    if (staffId) existingConditions.push(eq(appointments.staffId, staffId));

    const existingAppts = await db
      .select({ date: appointments.date, duration: appointments.duration, staffId: appointments.staffId })
      .from(appointments)
      .where(and(...existingConditions));

    const bookedRanges = existingAppts.map((a) => ({
      start: new Date(a.date),
      end: addMinutes(new Date(a.date), a.duration ?? slotDuration),
    }));

    const slots: { time: string; available: boolean }[] = [];
    let cursor = new Date(openTime);

    while (isBefore(addMinutes(cursor, slotDuration), closeTime) || addMinutes(cursor, slotDuration).getTime() === closeTime.getTime()) {
      const slotEnd = addMinutes(cursor, slotDuration);
      const overlaps = bookedRanges.some(
        (r) => isBefore(cursor, r.end) && isAfter(slotEnd, r.start)
      );
      slots.push({
        time: cursor.toISOString(),
        available: !overlaps,
      });
      cursor = addMinutes(cursor, slotDuration);
    }

    return res.json({
      storeId,
      date,
      slotDuration,
      openHour,
      closeHour,
      slots,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Failed to fetch availability" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/chatbot/appointment/:id
// Returns a single appointment by ID with full details.
// ---------------------------------------------------------------------------
router.get("/appointment/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid appointment id" });

  try {
    const appt = await storage.getAppointment(id);
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    return res.json(formatAppointment(appt));
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Failed to fetch appointment" });
  }
});

export default router;
