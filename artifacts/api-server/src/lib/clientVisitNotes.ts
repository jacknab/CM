/**
 * clientVisitNotes.ts — automatic per-visit history + AI client profile note.
 *
 * Two layers, both stored in the existing `client_notes` table (migration
 * 0179 added `appointment_id` to support this):
 *
 *   - "visit_auto" rows — one per completed appointment, `visibility: "system"`.
 *     Detailed source data for the AI. Never surfaced to staff (no route
 *     returns rows of this noteType).
 *   - "ai_profile_summary" — at most one per client, `visibility: "internal"`,
 *     `pinned: true`. The human-readable summary shown on the client profile,
 *     regenerated from the accumulated visit_auto rows.
 *
 * Idempotent the same way commissionAccrual.ts is: a unique index on
 * appointment_id makes a duplicate visit-note insert a harmless no-op rather
 * than something callers need to pre-check for.
 */
import { db } from "../db";
import { clientNotes, appointments, appointmentNailSelection, type AppointmentWithDetails } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { formatInSalonTime } from "./timezone";
import { storage } from "../storage";

function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/** First token of a full name (e.g. "Bihn Kim" -> "Bihn"), for casual staff/client references in notes. */
function firstName(fullName: string | null | undefined): string | undefined {
  const trimmed = (fullName ?? "").trim();
  return trimmed ? trimmed.split(/\s+/)[0] : undefined;
}

function buildVisitNoteContent(apt: AppointmentWithDetails, nail: typeof appointmentNailSelection.$inferSelect | undefined, timezone: string): string {
  const dateStr = formatInSalonTime(new Date(apt.date), timezone, "MMM d, yyyy");
  const staffFirst = firstName(apt.staff?.name);
  const serviceLabel = apt.service?.name ?? "Service";

  if (apt.status === "no_show") {
    return `${dateStr} — No-show for a ${serviceLabel} appointment${staffFirst ? ` with ${staffFirst}` : ""}.`;
  }

  const parts: string[] = [];
  const addonNames = (apt.appointmentAddons ?? []).map((a) => a.addon?.name).filter(Boolean);
  parts.push(`${dateStr} — ${serviceLabel}${addonNames.length ? ` (+ ${addonNames.join(", ")})` : ""}${staffFirst ? ` with ${staffFirst}` : ""}.`);

  if (nail) {
    const nailBits = [nail.lengthNameSnapshot, nail.shapeNameSnapshot, nail.artApplicationNameSnapshot, nail.artEffectNameSnapshot].filter(Boolean);
    if (nailBits.length) parts.push(`Nail: ${nailBits.join(", ")}.`);
  }

  const paid = apt.totalPaid != null ? Number(apt.totalPaid) : apt.servicePrice != null ? Number(apt.servicePrice) : apt.service?.price != null ? Number(apt.service.price) : null;
  if (paid != null && Number.isFinite(paid)) parts.push(`Paid $${paid.toFixed(2)}.`);

  if (apt.notes) parts.push(`Staff note: ${apt.notes}`);

  return parts.join(" ");
}

/** Idempotent: safe to call more than once for the same appointment. Logs both completed visits and no-shows. */
export async function createVisitNoteForAppointment(appointmentId: number): Promise<void> {
  try {
    const apt = await storage.getAppointment(appointmentId);
    if (!apt || (apt.status !== "completed" && apt.status !== "no_show") || !apt.customerId || !apt.storeId) return;

    const [nail] = await db.select().from(appointmentNailSelection).where(eq(appointmentNailSelection.appointmentId, appointmentId));

    const store = await storage.getStore(apt.storeId);
    const timezone = store?.timezone || "UTC";

    await db.insert(clientNotes).values({
      clientId: apt.customerId,
      storeId: apt.storeId,
      createdByUserId: null,
      noteType: "visit_auto",
      visibility: "system",
      noteContent: buildVisitNoteContent(apt, nail, timezone),
      pinned: false,
      appointmentId,
    });
  } catch (err) {
    if (isUniqueViolation(err)) return; // already logged for this appointment
    console.error("[clientVisitNotes] failed to create visit note for appointment", appointmentId, err);
  }
}

/** Backfills a visit_auto note for any of this client's completed/no-show appointments that don't have one yet. */
export async function backfillVisitNotesForClient(clientId: number, storeId: number): Promise<void> {
  const completedAppointments = (await storage.getAppointments({ customerId: clientId, storeId })).filter((a) => a.status === "completed" || a.status === "no_show");
  if (completedAppointments.length === 0) return;

  const existing = await db
    .select({ appointmentId: clientNotes.appointmentId })
    .from(clientNotes)
    .where(and(eq(clientNotes.clientId, clientId), eq(clientNotes.noteType, "visit_auto")));
  const alreadyLogged = new Set(existing.map((r) => r.appointmentId));

  const missing = completedAppointments.filter((a) => !alreadyLogged.has(a.id));
  for (const apt of missing) {
    await createVisitNoteForAppointment(apt.id);
  }
}

export async function regenerateAiProfileNote(clientId: number, storeId: number): Promise<{ noteContent: string } | null> {
  try {
    await backfillVisitNotesForClient(clientId, storeId);

    // Ordered by the underlying appointment's actual date, not clientNotes.createdAt —
    // backfilled historical rows are all inserted "now", so sorting by insert time would
    // scramble chronology (a years-old no-show could look more recent than last week's visit).
    const visitNotes = await db
      .select({ noteContent: clientNotes.noteContent, status: appointments.status })
      .from(clientNotes)
      .innerJoin(appointments, eq(clientNotes.appointmentId, appointments.id))
      .where(and(eq(clientNotes.clientId, clientId), eq(clientNotes.noteType, "visit_auto")))
      .orderBy(appointments.date)
      .limit(30);

    if (visitNotes.length === 0) return null;

    // Computed directly rather than left for the model to infer from scanning
    // the log — with several no-shows scattered through history, an LLM can
    // misjudge which one was actually most recent.
    const mostRecentWasNoShow = visitNotes[visitNotes.length - 1].status === "no_show";

    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("[clientVisitNotes] AI features not configured — skipping profile note regeneration");
      return null;
    }

    const client = await storage.getCustomer(clientId);
    const clientFirst = firstName(client?.name) ?? "This client";

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({
      apiKey,
      ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL } : {}),
    });

    // These notes are read by nail techs between clients, often on a small
    // screen, right before the client sits down — write for that moment, not
    // for a business-analytics dashboard.
    const prompt = [
      `You are writing a client note for a nail tech at a nail salon, to read in the seconds before a client sits down.`,
      `The client's first name is "${clientFirst}".`,
      ``,
      `Visit log (oldest to newest; a "No-show" entry means they booked but didn't come in):`,
      ...visitNotes.map((n) => `- ${n.noteContent}`),
      ``,
      `FACT (already verified, do not re-derive it from the log yourself — just use it): ${clientFirst}'s most recent`,
      `appointment ${mostRecentWasNoShow ? "WAS a no-show." : "was NOT a no-show — do not say or imply that it was, even though there may be earlier no-shows in the log above."}`,
      ``,
      `Write a 2-4 sentence note. Rules:`,
      `- Refer to the client by their first name (${clientFirst}), never as "the client" or "this client".`,
      `- Refer to any staff/technician mentioned in the visit log by first name only — never a full name.`,
      `- The most useful thing you can tell the tech is what ${clientFirst} actually likes: call out preferred nail`,
      `  length/size, shape, and any art/effect preferences BY NAME, but ONLY when a "Nail:" detail actually appears`,
      `  in one or more visit log entries above — quote what it literally says. If no entry has a "Nail:" line, do`,
      `  NOT mention nail length, shape, or art at all — never guess or infer a size/shape/effect from the service`,
      `  name, price, or anything else. A wrong guess here is worse than saying nothing, since the tech will trust it.`,
      `  When real "Nail:" data does exist, this is the single most important content in the note — lead with it.`,
      `- Use the FACT above to decide whether to mention a no-show. If it says their most recent appointment WAS a`,
      `  no-show, say so plainly near the start of the note (e.g. "${clientFirst} no-showed their last appointment").`,
      `  If it says it was NOT a no-show, do not claim otherwise — you may still mention an older no-show only as part`,
      `  of a genuine recurring pattern (e.g. "has no-showed a few times before"), never as if it just happened.`,
      `- Mention other genuinely useful recurring patterns if present: preferred technician, visit frequency, price`,
      `  sensitivity, special requests. Skip anything you don't have real evidence for.`,
      `- Do NOT just restate the most recent visit in isolation — synthesize across the whole history. If there's only`,
      `  one visit, say there isn't a pattern yet and describe what happened.`,
      `- Plain, direct, spoken-language sentences a busy tech can scan in 3 seconds. No marketing tone.`,
      ``,
      `Return a JSON object with exactly one string field: "summary". No markdown, no extra text.`,
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 220,
      temperature: 0.5,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw);
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    if (!summary) return null;

    const [existingProfileNote] = await db
      .select({ id: clientNotes.id })
      .from(clientNotes)
      .where(and(eq(clientNotes.clientId, clientId), eq(clientNotes.noteType, "ai_profile_summary")));

    if (existingProfileNote) {
      await db.update(clientNotes).set({ noteContent: summary, updatedAt: new Date() }).where(eq(clientNotes.id, existingProfileNote.id));
    } else {
      await db.insert(clientNotes).values({
        clientId,
        storeId,
        createdByUserId: null,
        noteType: "ai_profile_summary",
        visibility: "internal",
        noteContent: summary,
        pinned: true,
      });
    }

    return { noteContent: summary };
  } catch (err) {
    console.error("[clientVisitNotes] failed to regenerate AI profile note for client", clientId, err);
    return null;
  }
}
