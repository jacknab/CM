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

const tomVoice = process.env.SALES_AGENT_VOICE?.trim() || "cedar";
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
  greetings: Object.freeze(["Thanks for calling Certxa, this is Tom. How can I help you today?"]),
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
    "Sir Text uh Software! This is Maril. May I ask who I'm speaking with?",
    "You've reached Sir Text uh Software. Maril speaking. Who am I speaking with today?",
    "Hello, this is Maril at Sir Text uh Software. May I have your name?",
    "Hi there, Maril with Sir Text uh. Who do I have the pleasure of speaking with?",
    "Sir Text uh Software, Maril here. May I get your name?",
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

export function salesAgentName(agentId: unknown): string {
  return agentId === "shavez" ? SHAVEZ_SALES_AGENT.name : TOM_SALES_AGENT.name;
}
