import FormData from "form-data";
import Mailgun from "mailgun.js";
import { storage } from "./storage";
import { pool } from "./db";
import type { AppointmentWithDetails } from "@shared/schema";
import { formatInTimeZone } from "date-fns-tz";
import { brandedEmail, isFullEmailDocument, emailDetails, emailText, escapeEmailHtml } from "./lib/emailLayout";

const mailgun = new Mailgun(FormData);

function getMailgunClient(apiKey: string, domain: string) {
  if (!apiKey || !domain) {
    return null;
  }
  return mailgun.client({ key: apiKey, username: "api" });
}

const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Fills {name} placeholders. For the HTML version (html: true) the values are escaped: a client's name comes from
 *  the public booking form and must not be able to put markup into an e-mail sent in the salon's name. */
function interpolateTemplate(
  template: string,
  vars: Record<string, string>,
  html = false,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const v = html ? escapeHtml(value) : value;
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), () => v);
  }
  return result;
}

export async function sendEmail(
  storeId: number,
  to: string,
  subject: string,
  html: string,
  text?: string,
  from?: string,
  /** business: a salon writing to its own client — its name heads the e-mail (lib/emailLayout.ts). */
  layout?: { business?: string | null; preheader?: string },
): Promise<{ success: boolean; id?: string; error?: string; skipped?: boolean }> {
  // Every e-mail goes out in the Certxa layout: HTML that is not already a whole e-mail is wrapped in it.
  if (!isFullEmailDocument(html)) {
    html = brandedEmail({
      body: html,
      title: subject,
      preheader: layout?.preheader,
      from: layout?.business ? { business: layout.business } : undefined,
    });
  }
  // Always use platform-level .env credentials — never per-store keys
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  if (!apiKey || !domain) {
    console.warn(`Email skipped for store ${storeId}: MAILGUN_API_KEY or MAILGUN_DOMAIN not set in .env`);
    return { success: false, error: "Mailgun not configured (check MAILGUN_API_KEY and MAILGUN_DOMAIN in .env)" };
  }

  const client = getMailgunClient(apiKey, domain);
  if (!client) {
    return { success: false, error: "Mailgun credentials invalid" };
  }

  const senderEmail = from || process.env.MAILGUN_FROM_EMAIL || `noreply@${domain}`;

  try {
    const response = await client.messages.create(domain, {
      from: senderEmail,
      to: to,
      subject: subject,
      html: html,
      ...(text && { text: text }),
    });

    // Log successful send to email_log (fire-and-forget)
    void pool.query(
      `INSERT INTO email_log (store_id, recipient, subject, status, mailgun_id) VALUES ($1,$2,$3,$4,$5)`,
      [storeId, to, subject, "sent", response.id ?? null]
    ).catch(() => {});
    return { success: true, id: response.id };
  } catch (err: any) {
    const errorMessage = err.message || "Unknown error";
    console.error(`Email send failed for store ${storeId}:`, errorMessage);
    // Log failed send to email_log (fire-and-forget)
    void pool.query(
      `INSERT INTO email_log (store_id, recipient, subject, status, error) VALUES ($1,$2,$3,$4,$5)`,
      [storeId, to, subject, "failed", errorMessage]
    ).catch(() => {});
    return { success: false, error: errorMessage };
  }
}

/** The client's e-mail address for an appointment. The client record loaded with an appointment has no e-mail
 *  (addresses live in client_emails), so it is looked up: the primary address, else the newest one. */
async function clientEmailOf(appointment: AppointmentWithDetails): Promise<string | null> {
  const loaded = (appointment.customer as any)?.email;
  if (loaded) return String(loaded);
  const clientId = appointment.customer?.id ?? (appointment as any).customerId;
  if (!clientId) return null;
  const r = await pool.query<{ email_address: string }>(
    `SELECT email_address FROM client_emails WHERE client_id = $1 AND email_address <> '' ORDER BY is_primary DESC, id DESC LIMIT 1`,
    [clientId],
  );
  return r.rows[0]?.email_address ?? null;
}

/** Date, time, service and stylist of an appointment, in the e-mail's details panel. */
function appointmentDetails(appointment: AppointmentWithDetails): string {
  const tz = appointment.store?.timezone || "UTC";
  const staffName = (appointment.staff as any)?.name;
  return emailDetails([
    ["Date", escapeEmailHtml(formatInTimeZone(appointment.date, tz, "EEEE, MMMM d, yyyy"))],
    ["Time", escapeEmailHtml(formatInTimeZone(appointment.date, tz, "h:mm a"))],
    appointment.service?.name ? ["Service", escapeEmailHtml(appointment.service.name)] : null,
    staffName ? ["With", escapeEmailHtml(staffName)] : null,
  ]);
}

export async function sendBookingConfirmationEmail(
  appointment: AppointmentWithDetails
): Promise<void> {
  const to = await clientEmailOf(appointment);
  if (!to || !appointment.storeId) return;

  const settings = await storage.getMailSettings(appointment.storeId);
  // Only skip if a settings row exists AND confirmation is explicitly disabled.
  // If no row exists yet (new store), default to sending.
  if (settings && settings.bookingConfirmationEnabled === false) return;

  const timezone = appointment.store?.timezone || "UTC";
  const template =
    settings?.confirmationTemplate ||
    `<p>Hi {customerName},</p>
<p>Your appointment at {storeName} is confirmed for {appointmentDate} at {appointmentTime}.</p>
<p>See you then!</p>`;

  const bodyHtml = interpolateTemplate(template, {
    customerName: (appointment.customer as any)?.fullName || appointment.customer?.name || "there",
    storeName: appointment.store?.name || "our salon",
    appointmentDate: formatInTimeZone(
      appointment.date,
      timezone,
      "MMMM dd, yyyy"
    ),
    appointmentTime: formatInTimeZone(appointment.date, timezone, "h:mm a"),
    serviceName: appointment.service?.name || "your service",
  }, true);

  const qrData = encodeURIComponent(`BK:${appointment.id}`);
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${qrData}`;

  const qrBlock = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;"><tr><td align="center">
  <p style="margin:0 0 12px;font-size:13px;color:#7C7889;">Show this code at check-in</p>
  <img src="${qrImageUrl}" alt="Check-in QR code" width="160" height="160"
    style="display:block;border:1px solid #E8E5EF;border-radius:12px;padding:6px;background:#fff;" />
  <p style="margin:10px 0 0;font-size:12px;color:#7C7889;">Appointment #${appointment.id}</p>
</td></tr></table>`;

  const html = bodyHtml + appointmentDetails(appointment) + qrBlock;

  const plainText = interpolateTemplate(
    settings?.confirmationTemplate
      ? settings.confirmationTemplate.replace(/<[^>]*>/g, "")
      : `Hi {customerName}, your appointment at {storeName} is confirmed for {appointmentDate} at {appointmentTime}. See you then!`,
    {
      customerName: (appointment.customer as any)?.fullName || appointment.customer?.name || "there",
      storeName: appointment.store?.name || "our salon",
      appointmentDate: formatInTimeZone(
        appointment.date,
        timezone,
        "MMMM dd, yyyy"
      ),
      appointmentTime: formatInTimeZone(appointment.date, timezone, "h:mm a"),
      serviceName: appointment.service?.name || "your service",
    }
  );

  await sendEmail(
    appointment.storeId,
    to,
    `Appointment Confirmation - ${appointment.store?.name || "Your Appointment"}`,
    html,
    plainText,
    undefined,
    { business: appointment.store?.name },
  );
}

export async function sendReminderEmail(
  appointment: AppointmentWithDetails
): Promise<void> {
  const to = await clientEmailOf(appointment);
  if (!to || !appointment.storeId) return;

  const settings = await storage.getMailSettings(appointment.storeId);
  if (!settings?.reminderEnabled) return;

  const timezone = appointment.store?.timezone || "UTC";
  const template =
    settings.reminderTemplate ||
    `<p>Hi {customerName},</p>
<p>This is a reminder of your appointment at {storeName} on {appointmentDate} at {appointmentTime}.</p>
<p>Reply to this email to confirm or cancel.</p>`;

  const html = interpolateTemplate(template, {
    customerName: (appointment.customer as any)?.fullName || appointment.customer?.name || "there",
    storeName: appointment.store?.name || "our salon",
    appointmentDate: formatInTimeZone(
      appointment.date,
      timezone,
      "MMMM dd, yyyy"
    ),
    appointmentTime: formatInTimeZone(appointment.date, timezone, "h:mm a"),
    serviceName: appointment.service?.name || "your service",
  }, true);

  const reminderHtml = html + appointmentDetails(appointment);

  const plainText = interpolateTemplate(
    settings.reminderTemplate
      ? settings.reminderTemplate.replace(/<[^>]*>/g, "")
      : `Hi {customerName}, this is a reminder of your appointment at {storeName} on {appointmentDate} at {appointmentTime}.`,
    {
      customerName: (appointment.customer as any)?.fullName || appointment.customer?.name || "there",
      storeName: appointment.store?.name || "our salon",
      appointmentDate: formatInTimeZone(
        appointment.date,
        timezone,
        "MMMM dd, yyyy"
      ),
      appointmentTime: formatInTimeZone(appointment.date, timezone, "h:mm a"),
      serviceName: appointment.service?.name || "your service",
    }
  );

  await sendEmail(
    appointment.storeId,
    to,
    `Appointment Reminder - ${appointment.store?.name || "Your Appointment"}`,
    reminderHtml,
    plainText,
    undefined,
    { business: appointment.store?.name },
  );
}

export async function sendReviewRequestEmail(
  appointment: AppointmentWithDetails
): Promise<{ sent: boolean; reason?: string }> {
  const to = await clientEmailOf(appointment);
  if (!to || !appointment.storeId) return { sent: false, reason: "no store or customer email" };

  const settings = await storage.getMailSettings(appointment.storeId);
  if (!settings?.reviewRequestEnabled) return { sent: false, reason: "review requests are disabled in mail settings" };

  const { createReviewToken, hasOptedOutOfReviewRequests, hasEmailedReviewRequest, markReviewTokenEmailed } =
    await import("./lib/reviewLinks");

  if (await hasOptedOutOfReviewRequests(appointment.customer?.id)) {
    return { sent: false, reason: "customer opted out of review requests" };
  }
  if (await hasEmailedReviewRequest(appointment.id)) {
    return { sent: false, reason: "already emailed for this appointment" };
  }

  // Same certxa.com/review/<token> link the SMS sender uses (shared,
  // per-appointment token — see sms.ts's sendReviewRequest for why the
  // destination is resolved at click time rather than known here).
  const customerName = (appointment.customer as any)?.fullName || appointment.customer?.name || null;
  const token = await createReviewToken({
    storeId: appointment.storeId,
    appointmentId: appointment.id,
    customerId: appointment.customer?.id ?? null,
    customerName,
    customerPhone: null,
  });
  const reviewUrl = `${process.env.APP_URL ?? "https://certxa.com"}/review/${token}`;

  const template =
    settings.reviewTemplate ||
    `<p>Hi {customerName},</p>
<p>Thank you for visiting {storeName}! We'd love your feedback.</p>
<p><a href="{reviewUrl}">Leave us a review</a></p>`;

  const html = interpolateTemplate(template, {
    customerName: customerName || "there",
    storeName: appointment.store?.name || "our salon",
    reviewUrl,
  }, true);

  const plainText = interpolateTemplate(
    settings.reviewTemplate
      ? settings.reviewTemplate.replace(/<[^>]*>/g, "")
      : `Hi {customerName}, thank you for visiting {storeName}! We'd love your feedback. {reviewUrl}`,
    {
      customerName: customerName || "there",
      storeName: appointment.store?.name || "our salon",
      reviewUrl,
    }
  );

  await sendEmail(
    appointment.storeId,
    to,
    `We'd love your feedback - ${appointment.store?.name || "Your Salon"}`,
    html,
    plainText,
    undefined,
    { business: appointment.store?.name },
  );
  await markReviewTokenEmailed(appointment.id);
  return { sent: true };
}

let emailReminderIntervalId: ReturnType<typeof setInterval> | null = null;

export function startEmailReminderScheduler(): void {
  if (emailReminderIntervalId) return;

  console.log("[Email] Reminder scheduler started (checks every 5 minutes)");

  emailReminderIntervalId = setInterval(async () => {
    try {
      await processEmailReminders();
      await processEmailReviewRequests();
    } catch (err) {
      console.error("[Email] Scheduler error:", err);
    }
  }, 5 * 60 * 1000);

  // Run once on startup after a short delay
  setTimeout(() => {
    processEmailReminders().catch(console.error);
    processEmailReviewRequests().catch(console.error);
  }, 15_000);
}

async function processEmailReminders(): Promise<void> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const { storage } = await import("./storage");
  const upcomingAppointments = await storage.getAppointmentsNeedingReminders(in24h, in25h);

  for (const appt of upcomingAppointments) {
    try {
      // The window is an hour wide and this runs every 5 minutes, so each appointment is claimed once.
      // (A claimed appointment with no client e-mail or with reminders off simply sends nothing.)
      const claimed = await pool.query(
        `UPDATE appointments SET reminder_email_sent_at = now() WHERE id = $1 AND reminder_email_sent_at IS NULL RETURNING id`,
        [appt.id],
      );
      if (!claimed.rowCount) continue;
      await sendReminderEmail(appt);
    } catch (err) {
      console.error(`[Email] Reminder error for appointment ${appt.id}:`, err);
    }
  }

  if (upcomingAppointments.length > 0) {
    console.log(`[Email] Processed ${upcomingAppointments.length} reminder(s)`);
  }
}

async function processEmailReviewRequests(): Promise<void> {
  const now = new Date();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const ninetyMinAgo = new Date(now.getTime() - 90 * 60 * 1000);

  const { storage } = await import("./storage");
  const completedAppointments = await storage.getRecentlyCompletedAppointments(ninetyMinAgo, thirtyMinAgo);

  let sent = 0;
  for (const appt of completedAppointments) {
    try {
      const result = await sendReviewRequestEmail(appt);
      if (result.sent) sent++;
    } catch (err) {
      console.error(`[Email] Review request error for appointment ${appt.id}:`, err);
    }
  }

  if (sent > 0) {
    console.log(`[Email] Sent ${sent} review request(s)`);
  }
}

export function stopEmailReminderScheduler(): void {
  if (emailReminderIntervalId) {
    clearInterval(emailReminderIntervalId);
    emailReminderIntervalId = null;
  }
}

export async function sendPOSReceiptEmail(
  storeId: number,
  to: string,
  opts: {
    storeName: string;
    clientName: string;
    items: { name: string; price: number; addons?: { name: string; price: number }[] }[];
    subtotal: number;
    tipAmount: number;
    taxAmount?: number;
    discountAmount?: number;
    grandTotal: number;
    paymentMethod: string;
    transactionId: string;
    dateStr: string;
    timeStr: string;
  }
): Promise<{ success: boolean; error?: string }> {
  // Everything here can come from the request, so it is escaped before it goes into the HTML.
  const esc = escapeEmailHtml;
  const money = (v: unknown) => `$${(Number(v) || 0).toFixed(2)}`;
  const rawStoreName = String(opts.storeName ?? "");
  const lines: Array<[string, string]> = [];
  for (const item of Array.isArray(opts.items) ? opts.items : []) {
    lines.push([String(item?.name ?? ""), esc(money(item?.price))]);
    for (const a of Array.isArray(item?.addons) ? item.addons : []) {
      lines.push([`+ ${String(a?.name ?? "")}`, esc(money(a?.price))]);
    }
  }
  const html = [
    emailText(`Hi ${esc(opts.clientName || "there")}, thank you for your visit. Here is your receipt.`),
    emailText(`${esc(opts.dateStr)} at ${esc(opts.timeStr)}`, { muted: true, size: 13 }),
    emailDetails(lines),
    emailDetails([
      ["Subtotal", esc(money(opts.subtotal))],
      (opts.discountAmount ?? 0) > 0 ? ["Discount", `-${esc(money(opts.discountAmount))}`] : null,
      (opts.taxAmount ?? 0) > 0 ? ["Tax", esc(money(opts.taxAmount))] : null,
      opts.tipAmount > 0 ? ["Tip", esc(money(opts.tipAmount))] : null,
      ["Total", esc(money(opts.grandTotal))],
    ], { emphasizeLast: true }),
    emailText(`Payment: ${esc(opts.paymentMethod)} &middot; Ref #${esc(opts.transactionId)}`, { muted: true, size: 13 }),
  ].join("");

  return sendEmail(storeId, to, `Your receipt from ${rawStoreName}`, html, undefined, undefined, { business: rawStoreName });
}
