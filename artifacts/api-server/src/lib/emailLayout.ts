/**
 * The one look for every Certxa e-mail (owner, 2026-10-30).
 *
 *   brandedEmail({ heading, body, ... })   the whole e-mail: dark Certxa header with the app icon, white card, footer
 *   emailText / emailButton / emailCode / emailDetails / emailNote / emailDivider / emailCallout
 *                                           the pieces bodies are built from, so every e-mail reads the same
 *
 * E-mails a salon sends to its own clients (confirmation, reminder, receipt, review request, campaigns) use
 * `from: { business: "<salon name>" }`: the salon's name heads the e-mail and the footer says it was sent with Certxa.
 *
 * mail.ts sendEmail wraps any HTML that is not already a full document, so nothing goes out unbranded.
 * Built for e-mail clients: tables and inline styles only, no flexbox, no web fonts, no icons or emoji.
 */

const SITE = () => (process.env.APP_URL || "https://certxa.com").replace(/\/+$/, "");

export const EMAIL_COLORS = {
  brand: "#6D4AE0",
  ink: "#16131F",
  text: "#3B3748",
  muted: "#7C7889",
  line: "#E8E5EF",
  page: "#F4F2F8",
  panel: "#F8F7FB",
  header: "#0D0B1A",
  warning: "#B45309",
  danger: "#B42318",
  success: "#067647",
} as const;

export type EmailTone = "brand" | "warning" | "danger" | "success";
const toneColor = (tone: EmailTone = "brand") => EMAIL_COLORS[tone];

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** True when the HTML is already a whole e-mail (has its own <html>). */
export function isFullEmailDocument(html: string): boolean {
  return /<html[\s>]/i.test(html);
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

/** A paragraph. `html` is trusted markup (escape any user text first). */
export function emailText(html: string, opts: { muted?: boolean; size?: number; center?: boolean } = {}): string {
  const color = opts.muted ? EMAIL_COLORS.muted : EMAIL_COLORS.text;
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:${opts.size ?? 15}px;line-height:1.65;color:${color};${opts.center ? "text-align:center;" : ""}">${html}</p>`;
}

export function emailButton(label: string, url: string, tone: EmailTone = "brand"): string {
  const bg = toneColor(tone);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>
  <td style="border-radius:999px;background:${bg};">
    <a href="${escapeEmailHtml(url)}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeEmailHtml(label)}</a>
  </td></tr></table>`;
}

/** A one-time code, large and easy to copy. */
export function emailCode(code: string, caption?: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;"><tr>
  <td align="center" style="background:${EMAIL_COLORS.panel};border:1px solid ${EMAIL_COLORS.line};border-radius:14px;padding:26px 16px;">
    <div style="font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:${EMAIL_COLORS.ink};">${escapeEmailHtml(code)}</div>
    ${caption ? `<div style="margin-top:10px;font-family:${FONT};font-size:13px;color:${EMAIL_COLORS.muted};">${escapeEmailHtml(caption)}</div>` : ""}
  </td></tr></table>`;
}

/** Label / value rows (an appointment, a payment, a balance). Values are trusted markup; labels are escaped. */
export function emailDetails(rows: Array<[label: string, valueHtml: string] | null | false | undefined>, opts: { emphasizeLast?: boolean } = {}): string {
  const list = rows.filter(Boolean) as Array<[string, string]>;
  if (!list.length) return "";
  const cells = list.map(([label, value], i) => {
    const last = i === list.length - 1;
    const strong = opts.emphasizeLast && last;
    const border = last ? "" : `border-bottom:1px solid ${EMAIL_COLORS.line};`;
    return `<tr>
      <td style="padding:12px 16px;${border}font-family:${FONT};font-size:14px;color:${EMAIL_COLORS.muted};${strong ? `font-weight:600;color:${EMAIL_COLORS.ink};` : ""}">${escapeEmailHtml(label)}</td>
      <td align="right" style="padding:12px 16px;${border}font-family:${FONT};font-size:14px;font-weight:600;color:${EMAIL_COLORS.ink};${strong ? "font-size:16px;" : ""}">${value}</td>
    </tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;background:${EMAIL_COLORS.panel};border:1px solid ${EMAIL_COLORS.line};border-radius:14px;border-collapse:separate;">${cells}</table>`;
}

/** Small grey print under the main message. */
export function emailNote(html: string): string {
  return `<p style="margin:0 0 12px;font-family:${FONT};font-size:13px;line-height:1.6;color:${EMAIL_COLORS.muted};">${html}</p>`;
}

export function emailDivider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:8px 0 24px;"><div style="height:1px;line-height:1px;font-size:1px;background:${EMAIL_COLORS.line};">&nbsp;</div></td></tr></table>`;
}

/** A highlighted message (a warning, a failed payment). A thin coloured edge, no fill colours or icons. */
export function emailCallout(html: string, tone: EmailTone = "warning"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;"><tr>
  <td style="border-left:3px solid ${toneColor(tone)};background:${EMAIL_COLORS.panel};border-radius:0 10px 10px 0;padding:14px 16px;font-family:${FONT};font-size:14px;line-height:1.6;color:${EMAIL_COLORS.text};">${html}</td>
  </tr></table>`;
}

/** "Hi Name," with the name escaped. */
export function emailGreeting(firstName: string | null | undefined): string {
  return emailText(`Hi ${escapeEmailHtml((firstName || "").trim() || "there")},`);
}

// ─── The whole e-mail ─────────────────────────────────────────────────────────

export interface BrandedEmailOptions {
  /** Main message. Trusted markup built from the pieces above. */
  body: string;
  /** Big title at the top of the card. Leave out when the body brings its own. */
  heading?: string;
  /** The <title>; defaults to the heading. */
  title?: string;
  /** The grey line inbox lists show after the subject. */
  preheader?: string;
  /** A coloured line across the top of the card for warnings and failures. */
  tone?: EmailTone;
  /** Who it is from: Certxa (default), or a salon writing to its own client. */
  from?: { business: string };
  unsubscribeUrl?: string;
  unsubscribeLabel?: string;
}

export function brandedEmail(opts: BrandedEmailOptions): string {
  const business = opts.from?.business?.trim();
  const title = escapeEmailHtml(opts.title || opts.heading || (business ?? "Certxa"));
  const year = new Date().getFullYear();
  const stripe = opts.tone && opts.tone !== "brand"
    ? `<tr><td style="height:4px;line-height:4px;font-size:4px;background:${toneColor(opts.tone)};">&nbsp;</td></tr>`
    : "";

  const header = business
    ? `<tr><td class="cx-pad" style="padding:26px 36px 22px;border-bottom:1px solid ${EMAIL_COLORS.line};">
        <div style="font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:-0.2px;color:${EMAIL_COLORS.ink};">${escapeEmailHtml(business)}</div>
      </td></tr>`
    : `<tr><td class="cx-pad" style="background:${EMAIL_COLORS.header};padding:20px 36px;border-radius:18px 18px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:middle;padding-right:12px;"><img src="${SITE()}/images/email/certxa-logo.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:9px;"></td>
          <td style="vertical-align:middle;font-family:${FONT};font-size:19px;font-weight:700;letter-spacing:0.3px;color:#ffffff;">Certxa</td>
        </tr></table>
      </td></tr>`;

  const heading = opts.heading
    ? `<h1 style="margin:0 0 18px;font-family:${FONT};font-size:23px;line-height:1.3;font-weight:700;letter-spacing:-0.3px;color:${EMAIL_COLORS.ink};">${escapeEmailHtml(opts.heading)}</h1>`
    : "";

  const footerLines = business
    ? [`Sent by ${escapeEmailHtml(business)} with <a href="${SITE()}" style="color:${EMAIL_COLORS.muted};text-decoration:underline;">Certxa</a>`]
    : [
        `Certxa &middot; Booking, payments and front desk for salons`,
        `Questions? <a href="mailto:support@certxa.com" style="color:${EMAIL_COLORS.brand};text-decoration:none;">support@certxa.com</a>`,
        `&copy; ${year} Certxa`,
      ];
  if (opts.unsubscribeUrl) {
    footerLines.push(`<a href="${escapeEmailHtml(opts.unsubscribeUrl)}" style="color:${EMAIL_COLORS.muted};text-decoration:underline;">${escapeEmailHtml(opts.unsubscribeLabel || "Unsubscribe")}</a>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
<style>
  @media only screen and (max-width: 480px) {
    .cx-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .cx-outer { padding: 16px 10px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${EMAIL_COLORS.page};-webkit-text-size-adjust:100%;">
${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${EMAIL_COLORS.page};">${escapeEmailHtml(opts.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_COLORS.page};">
<tr><td align="center" class="cx-outer" style="padding:32px 14px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;border:1px solid ${EMAIL_COLORS.line};border-collapse:separate;">
    ${header}
    ${stripe}
    <tr><td class="cx-pad" style="padding:34px 36px 18px;font-family:${FONT};font-size:15px;line-height:1.65;color:${EMAIL_COLORS.text};">
      ${heading}
      ${opts.body}
    </td></tr>
  </table>
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    <tr><td align="center" style="padding:22px 24px 8px;font-family:${FONT};font-size:12px;line-height:1.8;color:${EMAIL_COLORS.muted};">
      ${footerLines.join("<br>")}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
