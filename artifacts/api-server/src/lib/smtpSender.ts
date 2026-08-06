/**
 * lib/smtpSender.ts
 *
 * Sends outbound support replies via SMTP using support@certxa.com
 * (Namecheap Private Email — mail.privateemail.com:587 STARTTLS).
 *
 * Uses the same IMAP_PASSWORD secret as the IMAP poller.
 * Gracefully no-ops (throws) when IMAP_PASSWORD is not configured.
 */

import nodemailer from "nodemailer";

const SMTP_HOST = "mail.privateemail.com";
const SMTP_PORT = 587;
const SMTP_USER = "support@certxa.com";
const FROM_NAME = "Certxa Support";

export interface SendReplyOptions {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string;
  agentName?: string;
}

export interface SendReplyResult {
  messageId: string;
}

function createTransport() {
  const password = process.env.IMAP_PASSWORD;
  if (!password) throw new Error("IMAP_PASSWORD not set — SMTP sending disabled");

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    requireTLS: true,
    auth: { user: SMTP_USER, pass: password },
    tls: { minVersion: "TLSv1.2" },
  });
}

export async function sendSupportReply(opts: SendReplyOptions): Promise<SendReplyResult> {
  const transport = createTransport();

  const replySubject = opts.subject.match(/^Re:/i) ? opts.subject : `Re: ${opts.subject}`;

  const headers: Record<string, string> = {};
  if (opts.inReplyTo) headers["In-Reply-To"] = opts.inReplyTo;
  if (opts.references)  headers["References"]   = opts.references;

  const info = await transport.sendMail({
    from: `"${FROM_NAME}" <${SMTP_USER}>`,
    to: opts.to,
    subject: replySubject,
    text: opts.text,
    headers,
  });

  return { messageId: info.messageId };
}

export function smtpAvailable(): boolean {
  return !!process.env.IMAP_PASSWORD;
}
