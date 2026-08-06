import { db } from "../db";
import { sql, eq, and, lte, isNull, inArray } from "drizzle-orm";
import { sendSms } from "../sms";
import { sendEmail } from "../mail";
import { storage } from "../storage";
import { locations } from "@shared/schema";

let schedulerInterval: NodeJS.Timeout | null = null;

// ─── Shared AI system prompt ──────────────────────────────────────────────────
const AI_REVIEW_SYSTEM_PROMPT = `You are a compliance officer for a salon appointment booking platform. Your sole job is to review marketing messages BEFORE they are sent to consumers via SMS or email, and determine whether they comply with applicable regulations and carrier policies.

Regulations you enforce:
- TCPA (Telephone Consumer Protection Act)
- CTIA Messaging Principles and Best Practices
- FCC commercial messaging regulations
- CAN-SPAM Act
- FTC truth-in-advertising standards

REJECT the message (approved: false) if it:
• References cannabis, marijuana, THC, CBD products, or controlled substances
• Contains adult content, sexual services, or escort/hookup references
• Promotes firearms, weapons, or ammunition
• Contains gambling, betting, lottery, or casino content
• Uses deceptive prize language ("you've won", "claim your free gift" with false urgency)
• Makes misleading income/financial opportunity claims
• Contains phishing language or requests for sensitive personal data
• Promotes prescription drugs outside a licensed pharmacy context
• Contains hate speech, slurs, or discriminatory language
• Impersonates government agencies, law enforcement, or major brands
• Contains threats, intimidation, or coercive language
• Appears designed to deceive, defraud, or harm consumers

APPROVE the message (approved: true) if it is:
• A legitimate re-engagement message for a salon, spa, or beauty business
• An appointment reminder or booking invitation
• A loyalty, thank-you, or seasonal promotion for beauty/wellness services
• Honest business marketing with clear, accurate claims
• A win-back or special offer from a real local business

Important: Merge tags like {{firstName}}, {{businessName}}, {{bookingLink}} are legitimate personalization placeholders — ignore them when assessing compliance.

Respond ONLY with a JSON object — no markdown, no extra text:
{"approved": true, "reason": "One sentence explaining why it's compliant"}
or
{"approved": false, "reason": "Clear, professional explanation of the specific violation. This will be shown directly to the salon owner so it must be understandable to a non-legal audience."}`;

// ─── Shared send logic ────────────────────────────────────────────────────────
async function sendCampaignMessages(
  campaign: {
    id: number;
    storeId: number;
    channel: string;
    audience: string;
    messageTemplate: string;
  }
): Promise<{ sentCount: number; failedCount: number }> {
  const { campaigns } = await import("@shared/schema/campaigns");
  const { clients } = await import("@shared/schema/clients");
  const now = new Date();
  const storeId = campaign.storeId;
  const store = await storage.getStore(storeId);
  const bookingLink = store?.bookingSlug
    ? `${process.env.APP_URL || process.env.REPLIT_DEV_DOMAIN || ""}/book/${store.bookingSlug}`
    : "";

  let targetCustomers: { name: string; phone: string | null; email: string | null }[] = [];

  if (campaign.audience === "all") {
    targetCustomers = await db
      .select({
        name: clients.fullName,
        phone: sql<string>`(SELECT display_phone FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
        email: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
      })
      .from(clients)
      .where(and(eq(clients.storeId, storeId), isNull(clients.archivedAt)));
  } else if (campaign.audience.startsWith("lapsed_")) {
    const days = parseInt(campaign.audience.split("_")[1]) || 90;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    targetCustomers = await db
      .select({
        name: clients.fullName,
        phone: sql<string>`(SELECT display_phone FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
        email: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
      })
      .from(clients)
      .where(
        and(
          eq(clients.storeId, storeId),
          isNull(clients.archivedAt),
          sql`(
            SELECT MAX(date) FROM appointments
            WHERE customer_id = clients.id
              AND store_id = ${storeId}
              AND status IN ('completed', 'started')
          ) < ${cutoff.toISOString()}
          OR NOT EXISTS (
            SELECT 1 FROM appointments
            WHERE customer_id = clients.id
              AND store_id = ${storeId}
              AND status IN ('completed', 'started')
          )`
        )
      );
  } else {
    targetCustomers = await db
      .select({
        name: clients.fullName,
        phone: sql<string>`(SELECT display_phone FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
        email: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
      })
      .from(clients)
      .where(and(eq(clients.storeId, storeId), isNull(clients.archivedAt)));
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const customer of targetCustomers) {
    const firstName = (customer.name || "").split(" ")[0];
    const message = campaign.messageTemplate
      .replace(/\{\{firstName\}\}/g, firstName)
      .replace(/\{\{businessName\}\}/g, store?.name || "")
      .replace(/\{\{bookingLink\}\}/g, bookingLink);

    if (campaign.channel === "sms" || campaign.channel === "both") {
      if (customer.phone) {
        const phone = customer.phone.replace(/\D/g, "");
        const e164 = phone.startsWith("1") ? `+${phone}` : `+1${phone}`;
        const result = await sendSms(storeId, e164, message, "campaign");
        if (result.success || result.skipped) sentCount++;
        else failedCount++;
      }
    }
    if (campaign.channel === "email" || campaign.channel === "both") {
      if (customer.email) {
        try {
          await sendEmail(
            storeId,
            customer.email,
            `Message from ${store?.name || "your salon"}`,
            `<p>${message.replace(/\n/g, "<br>")}</p>`
          );
          sentCount++;
        } catch {
          failedCount++;
        }
      }
    }
  }

  // Mark as sent
  await db
    .update(campaigns)
    .set({ status: "sent", sentAt: now, sentCount, failedCount })
    .where(eq(campaigns.id, campaign.id));

  return { sentCount, failedCount };
}

// ─── Scheduled campaigns (due date reached) ──────────────────────────────────
async function processScheduledCampaigns(): Promise<void> {
  try {
    const { campaigns } = await import("@shared/schema/campaigns");
    const now = new Date();

    const due = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.status, "scheduled"), lte(campaigns.scheduledAt!, now)));

    if (due.length === 0) return;

    console.log(`[CampaignScheduler] ${due.length} scheduled campaign(s) due`);

    for (const campaign of due) {
      try {
        // Scheduled campaigns were already user-approved when saved — send directly.
        await db
          .update(campaigns)
          .set({ status: "sending" })
          .where(eq(campaigns.id, campaign.id));

        const { sentCount, failedCount } = await sendCampaignMessages(campaign);
        console.log(`[CampaignScheduler] Campaign ${campaign.id} sent — ${sentCount} delivered, ${failedCount} failed`);
      } catch (err) {
        console.error(`[CampaignScheduler] Error sending campaign ${campaign.id}:`, err);
        await db
          .update(campaigns)
          .set({ status: "draft" })
          .where(eq(campaigns.id, campaign.id))
          .catch(() => {});
      }
    }
  } catch (err) {
    console.error("[CampaignScheduler] Error checking scheduled campaigns:", err);
  }
}

// ─── Pre-flight prohibited patterns (mirrors the routes.ts submission check) ─
// These run in the scheduler too so that campaigns already in pending_review
// (submitted before a pattern was added, or when OpenAI was unavailable) can
// still be rejected without needing the AI.
const PREFLIGHT_PROHIBITED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /\b(cannabis|marijuana|marihuana|\bweed\b|thc\b|hemp\s+oil|delta-?8|delta-?9|cbd\s+oil|edibles?|hash\b)\b/i,
    reason: "Message references cannabis or controlled substances, which SMS carriers prohibit in commercial messages.",
  },
  {
    re: /\b(xxx|pornograph|adult\s+content|escort\s+service|hookup\s+site|only\s*fans|sex\s+chat|webcam\s+girls?)\b/i,
    reason: "Message contains adult content references, which are prohibited in commercial SMS and email marketing.",
  },
  {
    re: /\b(firearm|handgun|\brifle\b|shotgun|\bpistol\b|\bammo\b|ammunition|buy\s+(a\s+)?guns?|suppressor|silencer)\b/i,
    reason: "Message promotes firearms or weapons, which is prohibited by SMS carrier policies.",
  },
  {
    re: /\b(online\s+casino|gambl(e|ing)|jackpot|bet\s+now|online\s+betting|sports\s+bet(ting)?|lottery\s+winner|poker\s+bonus)\b/i,
    reason: "Message contains gambling or betting content, which violates carrier SMS guidelines.",
  },
  {
    re: /\b(click\s+here\s+to\s+claim|you('ve|\s+have)\s+(won|been\s+selected)|(congratulations|congrats),?\s+you('re|\s+are)?\s+a?\s+winner)\b/i,
    reason: "Message uses deceptive prize or sweepstakes language that violates FTC regulations.",
  },
  {
    re: /\b(make\s+\$[\d,]+\s+(a\s+)?(day|week|month)|earn\s+\$[\d,]+\s+(daily|weekly|per\s+day)|get\s+rich\s+quick|unlimited\s+income)\b/i,
    reason: "Message contains misleading income or financial opportunity claims that violate consumer protection laws.",
  },
  {
    re: /\b(verify\s+your\s+(account|identity|password|ssn|social\s+security)|enter\s+your\s+(credit\s+card|account)\s+number|bank\s+login)\b/i,
    reason: "Message contains language associated with phishing or credential theft, which is prohibited.",
  },
  {
    re: /\b(buy\s+(viagra|cialis|oxycontin|xanax|adderall)|no\s+prescription\s+(needed|required)|cheap\s+meds?)\b/i,
    reason: "Message promotes prescription medications without a licensed pharmacy context, which is prohibited.",
  },
  {
    re: /\b(n[i1]gg[e3]r|f[a@]gg[o0]t|ch[i1]nk|sp[i1]c|k[i1]ke|cr[a@]cker|wh[o0]re|c[u\*]nt)\b/i,
    reason: "Message contains hate speech or slurs, which are strictly prohibited.",
  },
  {
    re: /\b(b[i1]tch(es|ing)?|f+u+c+k+(ing|er|s)?|sh[i1]t(ty|ter|s)?|a[s$]{2}h[o0]le|d[i1]ck(head|s)?|c[o0]ck(s|sucker)?|p[u\*][s$]{2}y|p[e3]n[i1]s|b[o0]{2}b(s|job)?|j[i1]zz|c[u\*]mshot|motherf[u\*]ck)\b/i,
    reason: "Message contains profanity or vulgar language, which is prohibited in commercial marketing messages by carrier policies.",
  },
  {
    re: /\b(sexy\s+(girl|ladies|woman|babe|hot|body|thing)|hot\s+(girl|babe|body|chick|ladies)|sugar\s+babe?|get\s+laid|booty\s+call|dirty\s+girl|naughty\s+girl|come\s+get\s+some|come\s+satisfy)\b/i,
    reason: "Message contains sexually suggestive language, which is inappropriate for commercial SMS/email marketing.",
  },
];

// ─── Pending-review campaigns (waiting for AI to become available) ────────────
//
// Campaigns land here when the user submitted them and pre-flight passed but the
// AI review could not run (no key, API error, bad JSON). This function runs on
// the same 5-minute cadence as the scheduled-campaign check and:
//   1. First re-runs the prohibited-content patterns (catches violations that
//      slipped through an older pre-flight list or were added after submission).
//   2. Then runs AI compliance review when a key is available.
//   3. If the AI is still unavailable, leaves the campaign as pending_review to
//      retry next cycle — it is NEVER auto-approved without explicit AI sign-off.
async function processPendingReviewCampaigns(): Promise<void> {
  try {
    const { campaigns } = await import("@shared/schema/campaigns");

    // Only pick up campaigns that are genuinely waiting (reviewedAt is null means
    // pre-flight passed but AI never ran). Campaigns where reviewedAt is set have
    // already been reviewed (sent or somehow stuck in sending — ignore those).
    const pending = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.status, "pending_review"), isNull(campaigns.reviewedAt)));

    if (pending.length === 0) return;

    console.log(`[CampaignScheduler] ${pending.length} campaign(s) awaiting review`);

    const openaiKey = process.env.OPENAI_API_KEY;
    const OpenAI = openaiKey ? (await import("openai")).default : null;
    const openai = OpenAI && openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

    for (const campaign of pending) {
      try {
        const storeId = campaign.storeId;

        // Re-check account status — it may have changed since submission.
        const [storeRow] = await db
          .select({ accountStatus: locations.accountStatus })
          .from(locations)
          .where(eq(locations.id, storeId))
          .limit(1);

        const acctStatus = (storeRow?.accountStatus ?? "Active").toLowerCase();
        if (acctStatus === "suspended" || acctStatus === "canceled" || acctStatus === "cancelled") {
          await db.update(campaigns).set({
            status: "rejected",
            rejectionReason: `Your account is currently ${acctStatus}. Campaign sending is disabled for inactive accounts. Please contact support to reactivate.`,
            reviewedAt: new Date(),
          }).where(eq(campaigns.id, campaign.id));
          console.log(`[CampaignScheduler] Campaign ${campaign.id} rejected — account ${acctStatus}`);
          continue;
        }

        const msg = (campaign.messageTemplate || "").trim();

        // ── Step 0: Timeout — reject campaigns stuck > 24 h ─────────────────
        // If a campaign has been pending for more than 24 hours it means the AI
        // review could not complete (no key, repeated errors). Tell the owner
        // clearly so they can edit and resubmit rather than wait indefinitely.
        const ageMs = Date.now() - (campaign.createdAt ? new Date(campaign.createdAt).getTime() : 0);
        const TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
        if (ageMs > TIMEOUT_MS && !openai) {
          await db.update(campaigns).set({
            status: "rejected",
            rejectionReason:
              "Compliance review could not be completed within 24 hours because the AI review service is not yet configured. " +
              "Please edit your campaign message and resubmit — it will go through the review process again.",
            reviewedAt: new Date(),
          }).where(eq(campaigns.id, campaign.id));
          console.log(`[CampaignScheduler] Campaign ${campaign.id} timed out after 24 h — rejected with edit prompt`);
          continue;
        }

        // ── Step 1: Re-run prohibited-content patterns ───────────────────────
        // This catches anything that slipped through the original pre-flight
        // (e.g. newly-added patterns, or campaigns submitted before this check
        // existed). Rejection here is immediate — no AI call needed.
        let preflightRejected = false;
        for (const { re, reason } of PREFLIGHT_PROHIBITED_PATTERNS) {
          if (re.test(msg)) {
            await db.update(campaigns).set({
              status: "rejected",
              rejectionReason: `Pre-flight check failed: ${reason}`,
              reviewedAt: new Date(),
            }).where(eq(campaigns.id, campaign.id));
            console.log(`[CampaignScheduler] Campaign ${campaign.id} rejected by pre-flight pattern: ${reason}`);
            preflightRejected = true;
            break;
          }
        }
        if (preflightRejected) continue;

        // ── Step 2: AI compliance review ──────────────────────────────────────
        if (!openai) {
          // No OpenAI key configured — cannot complete AI review.
          // Leave as pending_review and silently wait for the key to be set.
          continue;
        }

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: AI_REVIEW_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Campaign: "${campaign.name}"\nChannel: ${campaign.channel}\nAudience: ${campaign.audience}\n\nMessage:\n---\n${msg}\n---`,
            },
          ],
          temperature: 0,
          max_tokens: 300,
          response_format: { type: "json_object" },
        });

        const raw = completion.choices[0]?.message?.content ?? "";
        let aiResult: { approved: boolean; reason: string } | null = null;
        try {
          aiResult = JSON.parse(raw);
        } catch {
          // Bad JSON this cycle — leave pending and retry next cycle.
          console.warn(`[CampaignScheduler] Campaign ${campaign.id}: AI returned non-JSON, will retry`);
          continue;
        }

        if (!aiResult || aiResult.approved === false) {
          // AI rejected it — persist and stop retrying.
          await db.update(campaigns).set({
            status: "rejected",
            rejectionReason: `Compliance review failed: ${aiResult?.reason ?? "The message did not pass AI compliance review."}`,
            reviewedAt: new Date(),
          }).where(eq(campaigns.id, campaign.id));
          console.log(`[CampaignScheduler] Campaign ${campaign.id} rejected by AI: ${aiResult?.reason}`);
          continue;
        }

        // AI approved — mark sending and dispatch messages.
        console.log(`[CampaignScheduler] Campaign ${campaign.id} approved by AI — sending now`);

        await db.update(campaigns).set({
          status: "sending",
          reviewedAt: new Date(),
          rejectionReason: null,
        }).where(eq(campaigns.id, campaign.id));

        const { sentCount, failedCount } = await sendCampaignMessages(campaign);
        console.log(`[CampaignScheduler] Campaign ${campaign.id} sent — ${sentCount} delivered, ${failedCount} failed`);

      } catch (err: any) {
        // Per-campaign error (likely AI still unavailable) — leave as pending_review.
        console.warn(`[CampaignScheduler] Campaign ${campaign.id}: AI review failed, will retry —`, err?.message ?? err);
        // Do not update the campaign — it stays pending_review for the next cycle.
      }
    }
  } catch (err) {
    console.error("[CampaignScheduler] Error in pending-review sweep:", err);
  }
}

export function startCampaignScheduler(): void {
  if (schedulerInterval) return;

  const tick = async () => {
    await processScheduledCampaigns();
    await processPendingReviewCampaigns();
  };

  schedulerInterval = setInterval(tick, 5 * 60 * 1000);
  // Run once shortly after startup to catch anything left pending from a restart.
  setTimeout(tick, 15_000);

  console.log("[CampaignScheduler] Started (checks every 5 minutes for due and pending-review campaigns)");
}

export function stopCampaignScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
