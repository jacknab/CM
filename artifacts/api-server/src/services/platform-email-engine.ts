import { createHmac, timingSafeEqual } from "crypto";
import { pool } from "../db";
import { sendEmail } from "../mail";

const APP_URL = process.env.APP_URL || "https://app.certxa.com";
const BRAND_COLOR = "#6d5dfc";
const MAX_BATCH = 100;

type CampaignSeed = {
  campaignKey: string;
  name: string;
  description: string;
  category: string;
  triggerEvent: string;
  audienceRule?: Record<string, unknown>;
  steps: Array<{
    delayMinutes: number;
    subject: string;
    previewText: string;
    htmlTemplate: string;
    textTemplate: string;
    ctaLabel?: string;
    ctaUrl?: string;
  }>;
};

type Recipient = {
  userId: string;
  email: string;
  firstName: string | null;
  businessName: string;
  accountStatus: string | null;
  setupComplete: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function appUrl(path = ""): string {
  return `${APP_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function tokenFor(value: string): string {
  const secret = process.env.SESSION_SECRET || "certxa-email-engine-secret";
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function verifyPlatformToken(value: string, token: string): boolean {
  try {
    const expected = tokenFor(value);
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"));
  } catch {
    return false;
  }
}

export function platformUnsubscribeUrl(userId: string): string {
  const value = `unsubscribe:${userId}`;
  return `${appUrl("/api/platform-emails/unsubscribe")}?uid=${encodeURIComponent(userId)}&token=${tokenFor(value)}`;
}

export function platformOpenUrl(deliveryId: number): string {
  const value = `open:${deliveryId}`;
  return `${appUrl(`/api/platform-emails/track/open/${deliveryId}`)}?token=${tokenFor(value)}`;
}

export function platformClickUrl(deliveryId: number, destination: string): string {
  const value = `click:${deliveryId}:${destination}`;
  return `${appUrl(`/api/platform-emails/track/click/${deliveryId}`)}?url=${encodeURIComponent(destination)}&token=${tokenFor(value)}`;
}

function wrapEmail(title: string, body: string, unsubscribeUrl: string, previewText?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  ${previewText ? `<span style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(previewText)}</span>` : ""}
</head>
<body style="margin:0;background:#f4f5f8;color:#1f2430;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:620px;margin:0 auto;padding:28px 16px">
    <div style="background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(23,25,35,.08)">
      <div style="padding:26px 34px;background:#171923;color:#fff">
        <div style="font-size:21px;letter-spacing:.22em;font-weight:700">CERTXA</div>
        <div style="margin-top:10px;color:#c7c9d5;font-size:12px">Tools for businesses that are ready to grow</div>
      </div>
      <div style="padding:36px 34px">${body}</div>
      <div style="padding:22px 34px;border-top:1px solid #ececf1;color:#7b7f8c;font-size:12px;line-height:1.6">
        <div>Questions? Reply to this email or visit <a href="${appUrl("/support")}" style="color:${BRAND_COLOR}">Certxa Support</a>.</div>
        <div style="margin-top:10px"><a href="${unsubscribeUrl}" style="color:#7b7f8c">Unsubscribe from Certxa marketing emails</a></div>
        <div style="margin-top:8px">© ${new Date().getFullYear()} Certxa</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function defaultSeeds(): CampaignSeed[] {
  const button = (label: string, url = "/onboarding") =>
    `<a href="{{ctaUrl}}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:700">${label}</a>`;
  const paragraph = (text: string) => `<p style="font-size:16px;line-height:1.65;margin:0 0 18px">${text}</p>`;
  return [
    {
      campaignKey: "welcome-and-first-win",
      name: "Welcome + first win",
      description: "A high-touch welcome sequence that gets new owners from signup to their first setup milestone.",
      category: "onboarding",
      triggerEvent: "signup",
      steps: [
        {
          delayMinutes: 0,
          subject: "Welcome to Certxa — your 60-day trial starts now",
          previewText: "Your business has a new operating system. Let’s make your first win happen today.",
          htmlTemplate: `${paragraph("Hi {{firstName}},")} ${paragraph("Welcome to Certxa. Your 60-day trial is live, and you already have everything you need to turn more searches into booked appointments.")}${paragraph("<strong>Your first win:</strong> publish your services and booking link so a new client can book without calling or downloading an app.")}${button("Set up my booking page")}`,
          textTemplate: "Hi {{firstName}}, welcome to Certxa. Your 60-day trial is live. Set up your booking page: {{ctaUrl}}",
          ctaLabel: "Set up my booking page",
          ctaUrl: "/onboarding",
        },
        {
          delayMinutes: 1440,
          subject: "Your next best move in Certxa",
          previewText: "Three quick steps can turn your profile into a booking engine.",
          htmlTemplate: `${paragraph("Hi {{firstName}},")} ${paragraph("The businesses that get momentum fastest do three things first: add their highest-value services, set working hours, and share their booking link.")}${paragraph("You can do all three in a few minutes. Once it is live, clients can discover and book you while you are busy working.")}${button("Finish my setup")}`,
          textTemplate: "Hi {{firstName}}, add services, working hours, and your booking link to start getting bookings: {{ctaUrl}}",
          ctaLabel: "Finish my setup",
          ctaUrl: "/setup",
        },
        {
          delayMinutes: 2880,
          subject: "Your booking page should be working for you",
          previewText: "Keep your phone free while clients find a time that works.",
          htmlTemplate: `${paragraph("Hi {{firstName}},")} ${paragraph("Your booking page is more than a profile. It is your always-on front desk: clients can see your work, choose a service, and book in seconds.")}${paragraph("Make sure your page is ready before your next busy day.")}${button("Open my booking page")}`,
          textTemplate: "Hi {{firstName}}, your booking page can act as your always-on front desk. Open setup: {{ctaUrl}}",
          ctaLabel: "Open my booking page",
          ctaUrl: "/booking-settings",
        },
      ],
    },
    {
      campaignKey: "trial-growth-playbook",
      name: "Trial growth playbook",
      description: "Educational and product-led nudges during the free trial.",
      category: "engagement",
      triggerEvent: "signup",
      audienceRule: { subscriptionStatuses: ["trial"] },
      steps: [
        {
          delayMinutes: 10080,
          subject: "New clients are looking for you — can they find you?",
          previewText: "A polished booking page helps you turn curiosity into appointments.",
          htmlTemplate: `${paragraph("Hi {{firstName}},")} ${paragraph("People are searching for great local service businesses every day. Your Certxa profile gives them a clear next step: book with you.")}${paragraph("Add your services, photos, and policies so your page feels as good as the experience you deliver.")}${button("Make my page irresistible")}`,
          textTemplate: "Hi {{firstName}}, help new clients find and book you by completing your profile: {{ctaUrl}}",
          ctaLabel: "Complete my profile",
          ctaUrl: "/business-settings",
        },
        {
          delayMinutes: 20160,
          subject: "Keep clients coming back without more follow-up",
          previewText: "Turn one appointment into a repeat relationship.",
          htmlTemplate: `${paragraph("Hi {{firstName}},")} ${paragraph("The easiest appointment to book is the next one. Certxa helps you keep client history, reminders, loyalty, and rebooking in one place.")}${paragraph("Set up your client experience now and future-you will thank you.")}${button("Explore client tools")}`,
          textTemplate: "Hi {{firstName}}, explore the client tools that make repeat bookings easier: {{ctaUrl}}",
          ctaLabel: "Explore client tools",
          ctaUrl: "/features",
        },
        {
          delayMinutes: 43200,
          subject: "Make your busiest day feel more organized",
          previewText: "Calendar, staff, payments, and clients—one calm view.",
          htmlTemplate: `${paragraph("Hi {{firstName}},")} ${paragraph("Certxa is designed to take the scramble out of a busy day. Your calendar, team, payments, and client notes stay connected so you can focus on the work.")}${paragraph("See what is included in your account and choose the next tool that will save you the most time.")}${button("See what I can unlock")}`,
          textTemplate: "Hi {{firstName}}, see the tools available in Certxa for a calmer busy day: {{ctaUrl}}",
          ctaLabel: "See my tools",
          ctaUrl: "/features",
        },
      ],
    },
    {
      campaignKey: "trial-expiring-7",
      name: "Trial ending in 7 days",
      description: "A clear, helpful conversion sequence for trial accounts nearing expiration.",
      category: "conversion",
      triggerEvent: "trial_expiring_7",
      audienceRule: { subscriptionStatuses: ["trial"] },
      steps: [
        {
          delayMinutes: 0,
          subject: "One week left to keep your Certxa setup",
          previewText: "Your booking page and business data are ready when you are.",
          htmlTemplate: `${paragraph("Hi {{firstName}},")} ${paragraph("Your Certxa trial ends in about a week. You have already put time into your services, business details, and client workflow—keep that momentum going.")}${paragraph("Choose a plan to keep your account active and your booking experience live.")}${button("Keep my account active")}`,
          textTemplate: "Hi {{firstName}}, your trial ends in about a week. Keep your account active: {{ctaUrl}}",
          ctaLabel: "Keep my account active",
          ctaUrl: "/billing",
        },
      ],
    },
    {
      campaignKey: "trial-expiring-1",
      name: "Trial ending tomorrow",
      description: "Last-day conversion reminder with a direct path to billing.",
      category: "conversion",
      triggerEvent: "trial_expiring_1",
      audienceRule: { subscriptionStatuses: ["trial"] },
      steps: [
        {
          delayMinutes: 0,
          subject: "Your Certxa trial ends tomorrow",
          previewText: "Don’t lose the booking page and progress you built.",
          htmlTemplate: `${paragraph("Hi {{firstName}},")} ${paragraph("Your free trial ends tomorrow. Without an active plan, your account will be deactivated and clients may no longer be able to book through your Certxa page.")}${paragraph("Activate your plan now and keep everything exactly where you left it.")}${button("Choose my plan")}`,
          textTemplate: "Hi {{firstName}}, your Certxa trial ends tomorrow. Choose a plan to keep your account active: {{ctaUrl}}",
          ctaLabel: "Choose my plan",
          ctaUrl: "/billing",
        },
      ],
    },
    {
      campaignKey: "trial-expired-reactivation",
      name: "Trial expired / reactivation",
      description: "A reactivation email for accounts that have been deactivated after trial.",
      category: "reactivation",
      triggerEvent: "trial_expired",
      steps: [
        {
          delayMinutes: 0,
          subject: "Your Certxa account is paused — your progress is safe",
          previewText: "Reactivate your account and pick up where you left off.",
          htmlTemplate: `${paragraph("Hi {{firstName}},")} ${paragraph("Your free trial ended, so your Certxa account has been paused. The work you completed and the information you added are still here.")}${paragraph("Reactivate when you are ready and get back to your booking page, calendar, and client tools.")}${button("Reactivate my account")}`,
          textTemplate: "Hi {{firstName}}, your Certxa account is paused but your progress is safe. Reactivate: {{ctaUrl}}",
          ctaLabel: "Reactivate my account",
          ctaUrl: "/billing",
        },
      ],
    },
    {
      campaignKey: "payment-failed-recovery",
      name: "Payment recovery",
      description: "Account-safe payment recovery messages.",
      category: "billing",
      triggerEvent: "payment_failed",
      steps: [
        {
          delayMinutes: 0,
          subject: "Action required: update your Certxa payment method",
          previewText: "Update your payment details to keep your account active.",
          htmlTemplate: `${paragraph("Hi {{firstName}},")} ${paragraph("We could not process your latest Certxa payment. Please update your payment method so your booking page and business tools stay active.")}${button("Update payment details", "/billing")}`,
          textTemplate: "Hi {{firstName}}, update your Certxa payment method to keep your account active: {{ctaUrl}}",
          ctaLabel: "Update payment details",
          ctaUrl: "/billing",
        },
      ],
    },
    {
      campaignKey: "account-suspended",
      name: "Account suspended",
      description: "A direct account-status notice with a recovery path.",
      category: "account",
      triggerEvent: "account_suspended",
      steps: [
        {
          delayMinutes: 0,
          subject: "Your Certxa account needs attention",
          previewText: "Your account is currently paused. Here is how to get back online.",
          htmlTemplate: `${paragraph("Hi {{firstName}},")} ${paragraph("Your Certxa account is currently paused. Your data is safe, but clients may not be able to book until the account is restored.")}${paragraph("Review your account status or contact support if you need help.")}${button("Review my account", "/billing")}`,
          textTemplate: "Hi {{firstName}}, your Certxa account is paused. Review your account: {{ctaUrl}}",
          ctaLabel: "Review my account",
          ctaUrl: "/billing",
        },
      ],
    },
    {
      campaignKey: "subscription-started",
      name: "Subscription started",
      description: "A celebratory confirmation after an owner becomes a paying subscriber.",
      category: "billing",
      triggerEvent: "subscription_started",
      steps: [
        {
          delayMinutes: 0,
          subject: "You’re all set with Certxa",
          previewText: "Your account is active. Let’s build your next chapter.",
          htmlTemplate: `${paragraph("Hi {{firstName}},")} ${paragraph("Your Certxa subscription is active. Thank you for choosing us to help run your business.")}${paragraph("Keep building: add your team, turn on reminders, and make your booking experience unmistakably yours.")}${button("Open Certxa")}`,
          textTemplate: "Hi {{firstName}}, your Certxa subscription is active. Open your account: {{ctaUrl}}",
          ctaLabel: "Open Certxa",
          ctaUrl: "/overview",
        },
      ],
    },
    {
      campaignKey: "account-reactivated",
      name: "Account reactivated",
      description: "A warm confirmation after an account returns from suspension or expiration.",
      category: "account",
      triggerEvent: "account_reactivated",
      steps: [
        {
          delayMinutes: 0,
          subject: "Welcome back — your Certxa account is live",
          previewText: "Your business tools and booking experience are ready.",
          htmlTemplate: `${paragraph("Hi {{firstName}},")} ${paragraph("Your Certxa account is active again. Your setup and business data are ready for you.")}${paragraph("Take a quick look at your booking page and make sure your next client sees the best version of your business.")}${button("Open my account")}`,
          textTemplate: "Hi {{firstName}}, your Certxa account is active again. Open it here: {{ctaUrl}}",
          ctaLabel: "Open my account",
          ctaUrl: "/overview",
        },
      ],
    },
  ];
}

export async function ensurePlatformEmailCampaigns(): Promise<void> {
  for (const seed of defaultSeeds()) {
    // Insert only if the campaign_key doesn't exist yet — admin edits to name,
    // description, status, or steps must never be overwritten by the seed.
    await pool.query(
      `INSERT INTO platform_email_campaigns
        (campaign_key, name, description, category, trigger_event, status, audience_rule, from_name)
       VALUES ($1,$2,$3,$4,$5,'active',$6::jsonb,'Certxa')
       ON CONFLICT (campaign_key) DO NOTHING`,
      [seed.campaignKey, seed.name, seed.description, seed.category, seed.triggerEvent, JSON.stringify(seed.audienceRule ?? {})],
    );
    const existing = await pool.query<{ id: number }>(
      `SELECT id FROM platform_email_campaigns WHERE campaign_key=$1 LIMIT 1`,
      [seed.campaignKey],
    );
    const campaignId = existing.rows[0]?.id;
    if (!campaignId) continue;
    for (let i = 0; i < seed.steps.length; i++) {
      const step = seed.steps[i];
      await pool.query(
        `INSERT INTO platform_email_steps
          (campaign_id, step_order, delay_minutes, subject, preview_text, html_template, text_template, cta_label, cta_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (campaign_id, step_order) DO NOTHING`,
        [campaignId, i + 1, step.delayMinutes, step.subject, step.previewText, step.htmlTemplate, step.textTemplate, step.ctaLabel ?? null, step.ctaUrl ?? null],
      );
    }
  }
}

async function getRecipient(userId: string): Promise<Recipient | null> {
  const result = await pool.query<Recipient>(
    `SELECT u.id AS "userId", u.email, u.first_name AS "firstName",
            COALESCE(l.name, 'your business') AS "businessName",
            l.account_status AS "accountStatus", COALESCE(l.setup_complete, FALSE) AS "setupComplete",
            u.subscription_status AS "subscriptionStatus",
            u.trial_ends_at AS "trialEndsAt"
       FROM users u
       LEFT JOIN locations l ON l.user_id = u.id
      WHERE u.id = $1
      ORDER BY l.id ASC NULLS LAST
      LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

function matchesAudience(recipient: Recipient, rule: Record<string, any>): boolean {
  if (Array.isArray(rule.subscriptionStatuses) && rule.subscriptionStatuses.length > 0 &&
      !rule.subscriptionStatuses.includes(recipient.subscriptionStatus)) return false;
  if (rule.onboardingIncomplete === true && recipient.setupComplete) return false;
  if (rule.accountStatuses && Array.isArray(rule.accountStatuses) &&
      !rule.accountStatuses.includes(recipient.accountStatus)) return false;
  return true;
}

function renderTemplate(template: string, recipient: Recipient, deliveryId: number, ctaUrl: string | null): string {
  const destination = ctaUrl ? (ctaUrl.startsWith("http") ? ctaUrl : appUrl(ctaUrl)) : appUrl("/overview");
  const values: Record<string, string> = {
    firstName: escapeHtml(recipient.firstName || "there"),
    businessName: escapeHtml(recipient.businessName),
    email: escapeHtml(recipient.email),
    accountStatus: escapeHtml(recipient.accountStatus || "Active"),
    ctaUrl: platformClickUrl(deliveryId, destination),
    appUrl: appUrl(),
    trialEndsAt: recipient.trialEndsAt ? escapeHtml(new Date(recipient.trialEndsAt).toLocaleDateString()) : "",
  };
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[key] ?? "");
}

function renderText(template: string | null, recipient: Recipient, deliveryId: number, ctaUrl: string | null): string {
  const fallback = "Open Certxa: {{ctaUrl}}";
  return renderTemplate(template || fallback, recipient, deliveryId, ctaUrl).replace(/<[^>]+>/g, "");
}

export async function emitPlatformEmailEvent(
  eventName: string,
  userId: string,
  metadata: Record<string, unknown> = {},
  eventKey = `${eventName}:${userId}`,
): Promise<number> {
  await ensurePlatformEmailCampaigns();
  const inserted = await pool.query(
    `INSERT INTO platform_email_event_log (event_key, user_id, event_name, metadata)
     VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (event_key) DO NOTHING RETURNING id`,
    [eventKey, userId, eventName, JSON.stringify(metadata)],
  );
  if (!inserted.rowCount) return 0;

  const campaigns = await pool.query<{ id: number }>(
    `SELECT id FROM platform_email_campaigns
      WHERE trigger_event=$1 AND status='active'`,
    [eventName],
  );
  let enrolled = 0;
  for (const campaign of campaigns.rows) {
    const firstStep = await pool.query<{ delay_minutes: number }>(
      `SELECT delay_minutes FROM platform_email_steps
        WHERE campaign_id=$1 AND is_active=TRUE ORDER BY step_order ASC LIMIT 1`,
      [campaign.id],
    );
    const delay = firstStep.rows[0]?.delay_minutes ?? 0;
    const result = await pool.query(
      `INSERT INTO platform_email_enrollments
        (campaign_id,user_id,status,current_step,next_send_at,last_event_at)
       VALUES ($1,$2,'active',1,NOW() + ($3 || ' minutes')::interval,NOW())
       ON CONFLICT (campaign_id,user_id) DO NOTHING`,
      [campaign.id, userId, delay],
    );
    enrolled += result.rowCount ?? 0;
  }
  return enrolled;
}

async function syncLifecycleEvents(): Promise<void> {
  const windows = [
    { name: "trial_expiring_7", min: 6.5, max: 7.5 },
    { name: "trial_expiring_1", min: 0.5, max: 1.5 },
  ];
  for (const window of windows) {
    const result = await pool.query<{ id: string; trial_ends_at: string }>(
      `SELECT id, trial_ends_at FROM users
        WHERE role IN ('owner','admin') AND subscription_status='trial'
          AND trial_ends_at BETWEEN NOW() + ($1 || ' days')::interval
                                AND NOW() + ($2 || ' days')::interval`,
      [window.min, window.max],
    );
    for (const user of result.rows) {
      const day = new Date(user.trial_ends_at).toISOString().slice(0, 10);
      await emitPlatformEmailEvent(window.name, user.id, { trialEndsAt: user.trial_ends_at }, `${window.name}:${user.id}:${day}`);
    }
  }

  const expired = await pool.query<{ id: string; trial_ends_at: string }>(
    `SELECT id, trial_ends_at FROM users
      WHERE role IN ('owner','admin') AND subscription_status IN ('expired','canceled')
        AND trial_ends_at IS NOT NULL AND trial_ends_at < NOW()`,
  );
  for (const user of expired.rows) {
    await emitPlatformEmailEvent("trial_expired", user.id, { trialEndsAt: user.trial_ends_at });
  }
}

export async function processPlatformEmailCampaigns(): Promise<{ processed: number; sent: number; failed: number }> {
  await ensurePlatformEmailCampaigns();
  await syncLifecycleEvents();
  const due = await pool.query<{ id: number; campaign_id: number; user_id: string; current_step: number }>(
    `SELECT id, campaign_id, user_id, current_step
       FROM platform_email_enrollments
      WHERE status='active' AND next_send_at <= NOW()
      ORDER BY next_send_at ASC
      LIMIT $1`,
    [MAX_BATCH],
  );
  let sent = 0;
  let failed = 0;
  for (const enrollment of due.rows) {
    const claimed = await pool.query(
      `UPDATE platform_email_enrollments SET status='sending'
        WHERE id=$1 AND status='active' RETURNING id`,
      [enrollment.id],
    );
    if (!claimed.rowCount) continue;
    const recipient = await getRecipient(enrollment.user_id);
    const stepResult = await pool.query<any>(
      `SELECT c.*, s.* FROM platform_email_campaigns c
        JOIN platform_email_steps s ON s.campaign_id=c.id
       WHERE c.id=$1 AND s.step_order=$2 AND s.is_active=TRUE`,
      [enrollment.campaign_id, enrollment.current_step],
    );
    const step = stepResult.rows[0];
    if (!recipient || !step) {
      await pool.query(`UPDATE platform_email_enrollments SET status='completed', completed_at=NOW() WHERE id=$1`, [enrollment.id]);
      continue;
    }
    const campaignRule = (await pool.query<{ audience_rule: Record<string, unknown> }>(
      `SELECT audience_rule FROM platform_email_campaigns WHERE id=$1`,
      [enrollment.campaign_id],
    )).rows[0]?.audience_rule || {};
    if (!matchesAudience(recipient, campaignRule)) {
      await pool.query(`UPDATE platform_email_enrollments SET status='canceled', completed_at=NOW() WHERE id=$1`, [enrollment.id]);
      continue;
    }
    const suppressed = await pool.query(`SELECT 1 FROM platform_email_suppressions WHERE user_id=$1 OR lower(email)=lower($2) LIMIT 1`, [recipient.userId, recipient.email]);
    const delivery = await pool.query<{ id: number }>(
      `INSERT INTO platform_email_deliveries
        (campaign_id,step_id,user_id,to_email,subject,status)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (campaign_id,step_id,user_id) DO NOTHING RETURNING id`,
      [enrollment.campaign_id, step.id, recipient.userId, recipient.email, step.subject, suppressed.rowCount ? "suppressed" : "queued"],
    );
    const deliveryId = delivery.rows[0]?.id;
    if (!deliveryId || suppressed.rowCount) {
      await pool.query(`UPDATE platform_email_enrollments SET status='suppressed', completed_at=NOW() WHERE id=$1`, [enrollment.id]);
      continue;
    }
    const body = renderTemplate(step.html_template, recipient, deliveryId, step.cta_url);
    const html = wrapEmail(step.subject, `${body}<img src="${platformOpenUrl(deliveryId)}" width="1" height="1" alt="" style="display:block;border:0" />`, platformUnsubscribeUrl(recipient.userId), step.preview_text);
    const text = renderText(step.text_template, recipient, deliveryId, step.cta_url);
    const result = await sendEmail(0, recipient.email, step.subject, html, text, step.from_name ? `${step.from_name} <${process.env.MAILGUN_FROM_EMAIL || "noreply@certxa.com"}>` : undefined);
    if (!result.success) {
      failed++;
      await pool.query(`UPDATE platform_email_deliveries SET status='failed', error=$2 WHERE id=$1`, [deliveryId, result.error || "Email delivery failed"]);
      await pool.query(`UPDATE platform_email_enrollments SET status='active', next_send_at=NOW() + INTERVAL '15 minutes', last_error=$2 WHERE id=$1`, [enrollment.id, result.error || "Email delivery failed"]);
      continue;
    }
    sent++;
    await pool.query(`UPDATE platform_email_deliveries SET status='sent', provider_id=$2, sent_at=NOW() WHERE id=$1`, [deliveryId, result.id || null]);
    const nextStep = await pool.query<{ step_order: number; delay_minutes: number }>(
      `SELECT step_order, delay_minutes FROM platform_email_steps
        WHERE campaign_id=$1 AND step_order>$2 AND is_active=TRUE ORDER BY step_order ASC LIMIT 1`,
      [enrollment.campaign_id, enrollment.current_step],
    );
    if (nextStep.rows[0]) {
      await pool.query(
        `UPDATE platform_email_enrollments
            SET status='active', current_step=$2, next_send_at=NOW() + ($3 || ' minutes')::interval,
                last_error=NULL WHERE id=$1`,
        [enrollment.id, nextStep.rows[0].step_order, nextStep.rows[0].delay_minutes],
      );
    } else {
      await pool.query(`UPDATE platform_email_enrollments SET status='completed', completed_at=NOW(), last_error=NULL WHERE id=$1`, [enrollment.id]);
    }
  }
  return { processed: due.rows.length, sent, failed };
}

export function startPlatformEmailScheduler(): void {
  const tick = () => processPlatformEmailCampaigns()
    .then((result) => {
      if (result.processed) console.log(`[PlatformEmail] processed=${result.processed} sent=${result.sent} failed=${result.failed}`);
    })
    .catch((error) => console.error("[PlatformEmail] scheduler error:", error));
  setTimeout(tick, 20_000);
  setInterval(tick, 5 * 60 * 1000);
  console.log("[PlatformEmail] Lifecycle campaign scheduler started");
}

export async function getPlatformEmailCampaigns() {
  const result = await pool.query(
    `SELECT c.*,
      COUNT(DISTINCT s.id)::int AS step_count,
      COUNT(DISTINCT e.id)::int AS enrollment_count,
      COUNT(DISTINCT d.id) FILTER (WHERE d.status='sent')::int AS sent_count,
      COUNT(DISTINCT d.id) FILTER (WHERE d.opened_at IS NOT NULL)::int AS opened_count,
      COUNT(DISTINCT d.id) FILTER (WHERE d.clicked_at IS NOT NULL)::int AS clicked_count
     FROM platform_email_campaigns c
     LEFT JOIN platform_email_steps s ON s.campaign_id=c.id
     LEFT JOIN platform_email_enrollments e ON e.campaign_id=c.id
     LEFT JOIN platform_email_deliveries d ON d.campaign_id=c.id
     GROUP BY c.id ORDER BY c.updated_at DESC`,
  );
  return result.rows;
}

export async function getPlatformEmailCampaign(id: number) {
  const campaign = await pool.query(`SELECT * FROM platform_email_campaigns WHERE id=$1`, [id]);
  if (!campaign.rows[0]) return null;
  const steps = await pool.query(`SELECT * FROM platform_email_steps WHERE campaign_id=$1 ORDER BY step_order`, [id]);
  return { ...campaign.rows[0], steps: steps.rows };
}

export async function launchPlatformEmailCampaign(id: number, userIds?: string[]) {
  const campaign = await pool.query<{ trigger_event: string }>(`SELECT trigger_event FROM platform_email_campaigns WHERE id=$1`, [id]);
  if (!campaign.rows[0]) throw new Error("Campaign not found");
  const users = userIds?.length
    ? await pool.query<{ id: string }>(`SELECT id FROM users WHERE id = ANY($1::varchar[])`, [userIds])
    : await pool.query<{ id: string }>(`SELECT id FROM users WHERE role IN ('owner','admin') AND email IS NOT NULL`);
  let enrolled = 0;
  for (const user of users.rows) {
    const result = await pool.query(
      `INSERT INTO platform_email_enrollments (campaign_id,user_id,status,current_step,next_send_at)
       VALUES ($1,$2,'active',1,NOW()) ON CONFLICT (campaign_id,user_id) DO UPDATE SET status='active', next_send_at=NOW()
       RETURNING id`,
      [id, user.id],
    );
    enrolled += result.rowCount ?? 0;
  }
  await pool.query(`UPDATE platform_email_campaigns SET last_run_at=NOW(), updated_at=NOW() WHERE id=$1`, [id]);
  return { enrolled };
}

export async function suppressPlatformEmail(userId: string, email: string, reason = "unsubscribe") {
  await pool.query(
    `INSERT INTO platform_email_suppressions (user_id,email,reason)
     VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET email=EXCLUDED.email, reason=EXCLUDED.reason`,
    [userId, email, reason],
  );
  await pool.query(`UPDATE platform_email_enrollments SET status='suppressed', completed_at=NOW() WHERE user_id=$1 AND status IN ('active','sending')`, [userId]);
}

export { appUrl };