import FormData from "form-data";
import Mailgun from "mailgun.js";
import { storage } from "./storage";
import { pool } from "./db";
import type { AppointmentWithDetails } from "@shared/schema";
import { formatInTimeZone } from "date-fns-tz";

const mailgun = new Mailgun(FormData);

function getMailgunClient(apiKey: string, domain: string) {
  if (!apiKey || !domain) {
    return null;
  }
  return mailgun.client({ key: apiKey, username: "api" });
}

function interpolateTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

export async function sendEmail(
  storeId: number,
  to: string,
  subject: string,
  html: string,
  text?: string,
  from?: string
): Promise<{ success: boolean; id?: string; error?: string; skipped?: boolean }> {
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

export async function sendBookingConfirmationEmail(
  appointment: AppointmentWithDetails
): Promise<void> {
  if (!appointment.customer?.email || !appointment.storeId) return;

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
    appointmentTime: formatInTimeZone(appointment.date, timezone, "HH:mm a"),
    serviceName: appointment.service?.name || "your service",
  });

  const qrData = encodeURIComponent(`BK:${appointment.id}`);
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${qrData}`;

  const qrBlock = `
<div style="text-align:center;margin-top:24px;margin-bottom:8px;">
  <p style="font-size:13px;color:#6b7280;margin:0 0 12px 0;font-family:sans-serif;">Show this code at check-in</p>
  <img src="${qrImageUrl}" alt="Check-in QR code" width="180" height="180"
    style="display:inline-block;border:1px solid #e5e7eb;border-radius:8px;padding:4px;background:#fff;" />
  <p style="font-size:11px;color:#9ca3af;margin:10px 0 0 0;font-family:sans-serif;">Appointment #${appointment.id}</p>
</div>`;

  const html = bodyHtml + qrBlock;

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
      appointmentTime: formatInTimeZone(appointment.date, timezone, "HH:mm a"),
      serviceName: appointment.service?.name || "your service",
    }
  );

  await sendEmail(
    appointment.storeId,
    appointment.customer.email,
    `Appointment Confirmation - ${appointment.store?.name || "Your Appointment"}`,
    html,
    plainText
  );
}

export async function sendReminderEmail(
  appointment: AppointmentWithDetails
): Promise<void> {
  if (!appointment.customer?.email || !appointment.storeId) return;

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
    appointmentTime: formatInTimeZone(appointment.date, timezone, "HH:mm a"),
    serviceName: appointment.service?.name || "your service",
  });

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
      appointmentTime: formatInTimeZone(appointment.date, timezone, "HH:mm a"),
      serviceName: appointment.service?.name || "your service",
    }
  );

  await sendEmail(
    appointment.storeId,
    appointment.customer.email,
    `Appointment Reminder - ${appointment.store?.name || "Your Appointment"}`,
    html,
    plainText
  );
}

export async function sendReviewRequestEmail(
  appointment: AppointmentWithDetails
): Promise<void> {
  if (!appointment.customer?.email || !appointment.storeId) return;

  const settings = await storage.getMailSettings(appointment.storeId);
  if (!settings?.reviewRequestEnabled) return;

  const template =
    settings.reviewTemplate ||
    `<p>Hi {customerName},</p>
<p>Thank you for visiting {storeName}! We'd love your feedback.</p>
<p><a href="{reviewUrl}">Leave us a review</a></p>`;

  const html = interpolateTemplate(template, {
    customerName: (appointment.customer as any)?.fullName || appointment.customer?.name || "there",
    storeName: appointment.store?.name || "our salon",
    reviewUrl: settings.googleReviewUrl || "#",
  });

  const plainText = interpolateTemplate(
    settings.reviewTemplate
      ? settings.reviewTemplate.replace(/<[^>]*>/g, "")
      : `Hi {customerName}, thank you for visiting {storeName}! We'd love your feedback. {reviewUrl}`,
    {
      customerName: (appointment.customer as any)?.fullName || appointment.customer?.name || "there",
      storeName: appointment.store?.name || "our salon",
      reviewUrl: settings.googleReviewUrl || "",
    }
  );

  await sendEmail(
    appointment.storeId,
    appointment.customer.email,
    `We'd love your feedback - ${appointment.store?.name || "Your Salon"}`,
    html,
    plainText
  );
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
      await sendReviewRequestEmail(appt);
      sent++;
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
    grandTotal: number;
    paymentMethod: string;
    transactionId: string;
    dateStr: string;
    timeStr: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const itemRows = opts.items.map(item => {
    const addonRows = (item.addons || []).map(a =>
      `<tr><td style="padding:4px 0 4px 16px;color:#666;font-size:13px;">+ ${a.name}</td><td style="padding:4px 0;text-align:right;color:#666;font-size:13px;">$${a.price.toFixed(2)}</td></tr>`
    ).join("");
    return `<tr><td style="padding:6px 0;font-size:14px;">${item.name}</td><td style="padding:6px 0;text-align:right;font-size:14px;font-weight:600;">$${item.price.toFixed(2)}</td></tr>${addonRows}`;
  }).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fff;">
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="margin:0;font-size:20px;color:#111;">${opts.storeName}</h2>
        <p style="margin:4px 0 0;color:#888;font-size:13px;">Receipt — ${opts.dateStr} at ${opts.timeStr}</p>
      </div>
      <p style="font-size:14px;color:#333;">Hi ${opts.clientName}, thank you for your visit! Here's your receipt.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead>
          <tr style="border-bottom:2px solid #eee;">
            <th style="text-align:left;padding:8px 0;font-size:13px;color:#888;font-weight:500;">Service</th>
            <th style="text-align:right;padding:8px 0;font-size:13px;color:#888;font-weight:500;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr style="border-top:1px solid #eee;">
            <td style="padding:8px 0;font-size:13px;color:#666;">Subtotal</td>
            <td style="padding:8px 0;text-align:right;font-size:13px;color:#666;">$${opts.subtotal.toFixed(2)}</td>
          </tr>
          ${opts.tipAmount > 0 ? `<tr><td style="padding:4px 0;font-size:13px;color:#666;">Tip</td><td style="padding:4px 0;text-align:right;font-size:13px;color:#666;">$${opts.tipAmount.toFixed(2)}</td></tr>` : ""}
          <tr style="border-top:2px solid #111;">
            <td style="padding:10px 0;font-size:16px;font-weight:700;">Total</td>
            <td style="padding:10px 0;text-align:right;font-size:16px;font-weight:700;">$${opts.grandTotal.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      <p style="font-size:13px;color:#666;margin:0;">Payment: ${opts.paymentMethod} &nbsp;·&nbsp; Ref #${opts.transactionId}</p>
      <p style="font-size:11px;color:#bbb;margin-top:24px;text-align:center;">Powered by Certxa</p>
    </div>`;

  return sendEmail(storeId, to, `Your receipt from ${opts.storeName}`, html);
}
