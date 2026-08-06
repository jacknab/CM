import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "../db";
import { googleBusinessProfiles, locations, users } from "@shared/schema";
import { sendSms } from "../sms";
import { sendEmail } from "../mail";
import { getGbpPostcardReminderStage } from "./gbp-onboarding-reminder-policy";

const DAY = 24 * 60 * 60 * 1000;
let intervalId: ReturnType<typeof setInterval> | null = null;

export async function processGbpPostcardReminders(now = new Date()): Promise<number> {
  const rows = await db
    .select({
      profileId: googleBusinessProfiles.id,
      storeId: googleBusinessProfiles.storeId,
      status: googleBusinessProfiles.onboardingStatus,
      postcardSentAt: googleBusinessProfiles.postcardSentAt,
      firstSentAt: googleBusinessProfiles.postcardReminderSentAt,
      secondSentAt: googleBusinessProfiles.postcardSecondReminderSentAt,
      isConnected: googleBusinessProfiles.isConnected,
      abandonedAt: googleBusinessProfiles.onboardingAbandonedAt,
      storeName: locations.name,
      phone: locations.phone,
      storeEmail: locations.email,
      ownerEmail: users.email,
    })
    .from(googleBusinessProfiles)
    .innerJoin(locations, eq(locations.id, googleBusinessProfiles.storeId))
    .leftJoin(users, eq(users.id, locations.userId))
    .where(and(
      eq(googleBusinessProfiles.isConnected, false),
      isNull(googleBusinessProfiles.onboardingAbandonedAt),
      or(
        eq(googleBusinessProfiles.onboardingStatus, "postcard_sent"),
        eq(googleBusinessProfiles.onboardingStatus, "verification_pending"),
      ),
      lte(googleBusinessProfiles.postcardSentAt, new Date(now.getTime() - 7 * DAY)),
    ));

  let processed = 0;
  for (const row of rows) {
    if (!row.postcardSentAt) continue;
    const stage = getGbpPostcardReminderStage(row, now);
    if (!stage) continue;
    const second = stage === "day_10";

    const text = "Hi from Certxa 👋 Your Google salon verification postcard should have arrived. Enter the code when you receive it so customers can find your salon on Google.";
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><p>Your Google verification postcard should arrive soon.</p><p>Once verified, Certxa can help your salon:</p><p>⭐ Get more 5-star reviews<br>🤖 Respond to Google reviews automatically<br>📸 Show customer reviews on your booking website<br>📈 Help customers discover your salon</p></div>`;

    if (row.phone) {
      await sendSms(row.storeId, row.phone, text, second ? "gbp_postcard_day_10" : "gbp_postcard_day_7", undefined, undefined, {
        skipCreditDeduction: true,
        smsSource: "platform",
      }).catch((error) => console.warn("[GBP onboarding] SMS reminder failed:", error));
    }
    const email = row.ownerEmail || row.storeEmail;
    if (email) {
      await sendEmail(row.storeId, email, "Your Google salon verification postcard", html, text)
        .catch((error) => console.warn("[GBP onboarding] Email reminder failed:", error));
    }

    await db.update(googleBusinessProfiles)
      .set(second ? { postcardSecondReminderSentAt: now, updatedAt: now } : { postcardReminderSentAt: now, updatedAt: now })
      .where(and(
        eq(googleBusinessProfiles.id, row.profileId),
        eq(googleBusinessProfiles.isConnected, false),
        isNull(googleBusinessProfiles.onboardingAbandonedAt),
      ));
    processed++;
  }
  return processed;
}

export function startGbpOnboardingReminderScheduler(): void {
  if (intervalId) return;
  const run = () => processGbpPostcardReminders().then((count) => {
    if (count) console.log(`[GBP onboarding] Processed ${count} postcard reminder(s)`);
  }).catch((error) => console.error("[GBP onboarding] Reminder sweep failed:", error));
  intervalId = setInterval(run, 60 * 60 * 1000);
  setTimeout(run, 20_000);
}
