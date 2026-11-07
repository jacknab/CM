export interface SalonMatchInput {
  name: string;
  address?: string | null;
}

export interface SalonMatchCandidate {
  name: string;
  address?: string | null;
}

const LEGAL_SUFFIXES = new Set([
  "llc", "llp", "pllc", "inc", "incorporated", "corp", "corporation",
  "ltd", "limited", "company", "co",
]);

export function normalizeSalonText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function salonNameTokens(value: string): string[] {
  const tokens = normalizeSalonText(value).split(" ").filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens;
}

export function slugBaseForSalon(name: string): string {
  const tokens = salonNameTokens(name);
  let base = tokens.join("-") || "salon";
  // Keep readable word boundaries and leave room for the deterministic suffix.
  if (base.length > 24) {
    const kept: string[] = [];
    for (const token of tokens) {
      const next = [...kept, token].join("-");
      if (next.length > 24) break;
      kept.push(token);
    }
    base = kept.join("-") || base.slice(0, 24).replace(/-+$/g, "");
  }
  return base.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "salon";
}

export function uniqueSlugCandidate(name: string, sourceId: number, attempt = 0): string {
  const suffix = `${Math.max(0, sourceId).toString(36).padStart(5, "0").slice(-5)}${attempt ? `-${attempt.toString(36)}` : ""}`;
  const tail = `-${suffix}`;
  const base = slugBaseForSalon(name).slice(0, Math.max(1, 30 - tail.length)).replace(/-+$/g, "") || "salon";
  return `${base}${tail}`.toLowerCase();
}

export const SALON_CREATION_DEFAULTS = Object.freeze({
  onlineBookingMode: "off" as const, // Calendar Settings → Who can book online → Nobody
  bookingPaymentPolicy: "none" as const,
  bookingTheme: "solo" as const,
  userAccountType: "certxa_pro" as const,
  perHour: 10,
  perDay: 240,
  spacingMinutes: 6,
});

export function internalUnclaimedEmail(sourceSalonId: number): string {
  return `salon-source-${Math.max(0, Math.floor(sourceSalonId))}@unclaimed.invalid`;
}

function tokenSimilarity(a: string, b: string): number {
  const aa = new Set(salonNameTokens(a));
  const bb = new Set(salonNameTokens(b));
  if (!aa.size || !bb.size) return 0;
  let intersection = 0;
  for (const token of aa) if (bb.has(token)) intersection++;
  return intersection / new Set([...aa, ...bb]).size;
}

function addressAnchors(raw: string | null | undefined) {
  const value = String(raw ?? "");
  const chunks = value.split(",").map((part) => part.trim()).filter(Boolean);
  const postal = value.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? null;
  const state = value.match(/(?:^|[\s,])([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/i)?.[1]?.toLowerCase() ?? null;
  const city = chunks.length >= 3 ? normalizeSalonText(chunks[chunks.length - 2]) : null;
  const streetNumber = normalizeSalonText(chunks[0] ?? value).match(/^([0-9]+)/)?.[1] ?? null;
  return { postal, state, city, streetNumber };
}

function addressesCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return true;
  const aa = addressAnchors(a);
  const bb = addressAnchors(b);
  if (aa.postal && bb.postal && aa.postal !== bb.postal) return false;
  if (aa.state && bb.state && aa.state !== bb.state) return false;
  if (aa.city && bb.city && aa.city !== bb.city) return false;
  if (aa.streetNumber && bb.streetNumber && aa.streetNumber !== bb.streetNumber) return false;
  return true;
}

export function scoreSalonMatch(source: SalonMatchInput, candidate: SalonMatchCandidate): number {
  const nameScore = tokenSimilarity(source.name, candidate.name);
  const sourceAddress = normalizeSalonText(source.address);
  const candidateAddress = normalizeSalonText(candidate.address);
  if (!sourceAddress || !candidateAddress) return nameScore;
  const addressScore = tokenSimilarity(sourceAddress, candidateAddress);
  return Math.round((nameScore * 0.78 + addressScore * 0.22) * 10000) / 10000;
}

export function qualifiesSalonMatch(source: SalonMatchInput, candidate: SalonMatchCandidate): boolean {
  const nameScore = tokenSimilarity(source.name, candidate.name);
  const score = scoreSalonMatch(source, candidate);
  if (!addressesCompatible(source.address, candidate.address)) return false;
  return source.address?.trim() && candidate.address?.trim()
    ? nameScore >= 0.70 && score >= 0.76
    : nameScore >= 0.90 && score >= 0.90;
}

export function isSafeExternalWebsite(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export const DRAFT_NAIL_CATALOG = [
  { category: "Manicures", name: "Classic Manicure", duration: 30 },
  { category: "Manicures", name: "Gel Manicure", duration: 45 },
  { category: "Manicures", name: "Dip Powder Manicure", duration: 60 },
  { category: "Pedicures", name: "Classic Pedicure", duration: 45 },
  { category: "Pedicures", name: "Gel Pedicure", duration: 60 },
  { category: "Nail Enhancements", name: "Acrylic Full Set", duration: 90 },
  { category: "Nail Enhancements", name: "Acrylic Fill", duration: 60 },
  { category: "Nail Enhancements", name: "Gel X Full Set", duration: 90 },
  { category: "Nail Enhancements", name: "Nail Extension Removal", duration: 30 },
  { category: "Nail Art & Polish", name: "Nail Art", duration: 30 },
  { category: "Nail Art & Polish", name: "Polish Change", duration: 20 },
  { category: "Nail Art & Polish", name: "Nail Repair", duration: 15 },
] as const;
