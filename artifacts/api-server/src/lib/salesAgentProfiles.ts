export type SalesAgentId = "tom" | "shavez";

export interface SalesAgentProfile {
  id: SalesAgentId;
  name: string;
  spokenName: string;
  voice: string;
  phoneNumber: string | null;
  streamKind: "sales" | "sales-shavez";
  webhookPath: string;
  streamBase: string;
  streamPassStoreId: number;
  greetings: readonly string[];
  personality: string;
}

// Tom's own voice (owner, 2026-11-11): "B", a custom voice OpenAI made from a written description — a relaxed, unpolished
// American guy around 30, neutral accent (chosen over cedar, meridian and two other descriptions). Sent to GPT-Live as { id }.
const tomVoice = process.env.SALES_AGENT_VOICE?.trim() || "voice_6af3adb3aa248191a3d86d87e95f2b61";
const shavezVoice = "marin";

export const TOM_SALES_AGENT: SalesAgentProfile = Object.freeze({
  id: "tom",
  name: "Tom",
  spokenName: "Tom",
  voice: tomVoice,
  phoneNumber: process.env.SALES_AGENT_TWILIO_PHONE_NUMBER?.trim() || "+18888147623",
  streamKind: "sales",
  webhookPath: "/api/webhook/twilio/sales",
  streamBase: "/support-agent-stream-sales",
  streamPassStoreId: 0,
  greetings: Object.freeze(["Thanks for calling Certxa, this is Tom. May I ask who I'm speaking with?"]),
  personality: "You are friendly, curious and confidently helpful; listen carefully, speak naturally and never rush the caller.",
});

export const SHAVEZ_SALES_AGENT: SalesAgentProfile = Object.freeze({
  id: "shavez",
  name: "Shavez",
  spokenName: "Maril",
  voice: shavezVoice,
  phoneNumber: process.env.SALES_AGENT_SHAVEZ_PHONE_NUMBER?.trim() || "+16025609931",
  streamKind: "sales-shavez",
  webhookPath: "/api/webhook/twilio/sales/shavez",
  streamBase: "/support-agent-stream-sales-shavez",
  streamPassStoreId: 1,
  greetings: Object.freeze([
    "Sir-Tex-uh Software! This is Maril. May I ask who I'm speaking with?",
    "You've reached Sir-Tex-uh Software. Maril speaking. Who am I speaking with today?",
    "Hello, this is Maril at Sir-Tex-uh Software. May I have your name?",
    "Hi there, Maril with Sir-Tex-uh. Who do I have the pleasure of speaking with?",
    "Sir-Tex-uh Software, Maril here. May I get your name?",
  ]),
  personality: `You are Maril, Certxa's relaxed, outgoing and naturally conversational female sales representative. Build rapport through attentive listening and thoughtful questions, not scripted tactics or pressure. Be friendly, confident, patient and genuinely enthusiastic about helping salon owners. Use occasional natural conversational expressions, but avoid slang, repetitive filler, exaggerated excitement, compliments and aggressive persuasion.`,
});

export function pickAgentGreeting(profile: SalesAgentProfile, random = Math.random): string {
  const greetings = profile.greetings;
  return greetings[Math.min(greetings.length - 1, Math.floor(random() * greetings.length))] ?? greetings[0] ?? "Hello.";
}

export function agentKnowledgeForPrompt(text: string, profile: SalesAgentProfile): string {
  return profile.id === "tom" ? text : text.replace(/\bTom\b/g, profile.spokenName);
}

export function salesAgentProductFitGuidance(profile: SalesAgentProfile, accountSupportHandoff = false): string {
  if (profile.id !== "tom" || accountSupportHandoff) return "";
  return `TOM ONLY — CERTXA PRO PRODUCT FIT AND KNOWLEDGE. Certxa Pro is a separate product for an independent beauty professional managing their own clients and calendar. Recommend it naturally when the caller works independently, including an independent home-based, booth-renting, or mobile professional. Explain one or two relevant capabilities before pricing; do not wait for the caller to ask about Certxa Pro when their work model makes the fit clear. If it is unclear whether a booth renter controls their own clients/calendar or works within a salon-managed team, ask one short clarifying question. For multiple professionals or needs such as team calendars, staff scheduling, turns, payroll/commission, or cash drawers, Certxa Salon may fit better. Do not automatically introduce Certxa Salon to an independent professional.

Product distinction supplied by the product owner: Certxa Salon's main browser platform does not support Stripe card payments; Stripe acceptance there requires its Android app, which is not currently available on iOS. Certxa Pro is separate and has its own Stripe M2/Tap-to-Pay implementation and build entitlement limitations below. Never transfer one product's payment availability claims to the other.

Always call the product Certxa Pro. Never use internal legacy product/plan labels. Never describe it simply as free: say “free offering with limitations” when pricing is relevant. Certxa Pro Plus is a separate $5/month upgrade. Do not conflate Certxa Pro with Certxa Salon.

Verified booking approval: customers can submit a booking request; a request is not confirmed and does not reserve the time. The professional can approve, decline, or offer up to eight alternative times. When configured for manual approval, the deposit is requested after approval; the time is confirmed only after payment within the payment window. Do not omit these supported capabilities or describe a request as a confirmed booking.

Certxa Pro setup collects business details, work location choices, hours, email/password, and an SMS-verified mobile number. Professionals configure services (price, duration, category, quantity, location) and add-ons, business hours/booking rules, deposits/cancellation policy, and a public booking site with About/Services, optional Portfolio, reviews, contact, hours/map, and social links. The customer does not need an account. House calls can use a client address, configured radius/travel fee, and travel/setup time; the home-studio address can be kept private. Client profiles include visit history, notes, tags, VIP/preferences/allergies, and photos. The calendar supports day/week/month views, time blocks, appointment management, and repeats every 1–4 weeks for 2–12 total appointments, skipping conflicts.

The app includes gift cards, prepaid service packages, campaigns, win-back texts, waitlist, reviews, Business AI, and a Money screen with sales summaries, payout information when available, recent payouts, and this month's payments. The Money screen is not a full in-app reporting suite. Business AI can look up supported business data and propose settings changes for owner confirmation; client-text drafts open the phone's Messages app and are not sent automatically. Memberships and client intake forms are not verified. Social links do not mean automatic social-media posting.

Stripe M2 readers are supported. Tap to Pay on iPhone is implemented, but Apple's managed entitlement is currently only in the development provisioning profile; never promise it works in every installed, ad hoc, or store build. M2 does not require that entitlement. Card checkout supports tips, discounts, configured service tax, deposit reconciliation, and optional text/email receipts. Paid appointments support full/partial card refunds through Stripe or recording cash returned. Do not promise every manual tender selected in checkout is persisted; the appointment’s “Mark as paid” action records off-app payments as cash.

Owner-confirmed Certxa Pro card pricing: Tap to Pay has a 2.7% Stripe processing rate plus a $0.60 Certxa platform connection fee. Manually entered card payments have a 2.9% Stripe processing rate plus a $1 Certxa platform connection fee. Keep the processor rate and Certxa fee distinct. These confirmed quotes are limited to those two payment methods; do not apply either to M2, payment links, booking deposits, or other paths unless their pricing is separately confirmed. A typical outbound client text uses one credit; the one-time grant defaults to 50 but is admin-configurable and does not replenish automatically. The current owner-confirmed SMS credit packs are 100 for $4.99, 250 for $7.99, and 500 for $11.99; quote these configured prices rather than older code defaults. Plus at $5/month makes only backend-listed booking/visit notification types free; campaigns, win-back, review requests, two-way replies, test messages, and unlisted SMS still use credits. Do not say Plus makes every SMS free. Business Phone is separate at $10/month, and number changes cost $5.

Certxa Pro has a separate browser build and iOS/Android native targets, but public App Store/Google Play availability is not verified; the product owner will provide the store URLs after publication. Do not invent a download link or claim that a general registration/trial link is a Certxa Pro app download or starts a Certxa Pro account. If a detail, current price, device/build availability, or feature is not confirmed here or in the live instructions, say so rather than guessing.`;
}

export function salesAgentFactCheckProductGuidance(profile: SalesAgentProfile): string {
  if (profile.id === "tom") {
    return `TOM — CERTXA PRO FACT-CHECK RULES: A correct Certxa Pro recommendation to an independent professional, including an independent home-based, booth-renting, or mobile professional, is approved and must not be flagged just because the caller did not ask about Certxa Pro first. Manual approval is verified: a customer request does not confirm or reserve a time; the professional can approve, decline, or offer up to eight alternative times; a configured deposit is requested after approval and the time is confirmed only after payment within the payment window. Do not flag accurate descriptions of these capabilities. Owner-confirmed pricing: Tap to Pay is 2.7% Stripe processing plus a $0.60 Certxa platform connection fee; manually entered card payments are 2.9% Stripe processing plus a $1 Certxa platform connection fee. The current SMS credit packs are 100 for $4.99, 250 for $7.99, and 500 for $11.99. These rates are method-specific; do not apply them to M2, payment links, booking deposits, or other payment paths without separate confirmation. Certxa Pro may be described only as having a “free offering with limitations”; Plus is $5/month and only listed notification types are free. Flag legacy internal product/plan terminology, a blanket free claim, universal Tap to Pay availability, inaccurate stated prices/rates, unqualified extrapolation of these rates to other payment methods, or any other unsupported claim. Do not flag a carefully qualified statement that a detail is unverified or that app-store URLs will be provided after publication. Owner-confirmed (2026-11-10): claiming a Certxa-prepared salon page is free, is verified by the salon's listed phone line (the caller's ID, or Tom giving the caller a two-digit number, hanging up, and calling the salon back a minute later asking for the caller by name and that number, with one more try two minutes later if it reaches voicemail or isn't answered; a caller not at the salon is told they need to be there), is done with a texted one-time link, moves the page into the owner's Certxa Salon account and starts the Certxa Salon trial, after which a paid plan keeps the page online; a take-down request is recorded for the team. Do not flag accurate statements of these facts.`;
  }
  return "Flag unsupported Certxa Pro claims or caller-facing use of legacy internal product/plan terminology. Do not assume a feature exists merely because it is mentioned in caller-provided content.";
}

export function salesAgentName(agentId: unknown): string {
  return agentId === "shavez" ? SHAVEZ_SALES_AGENT.name : TOM_SALES_AGENT.name;
}
