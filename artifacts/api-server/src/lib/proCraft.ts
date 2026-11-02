/**
 * How a Solo-plan professional is described to search and AI engines (owner, 2026-11-02). A Solo account is an
 * independent beauty pro — renting a booth or suite, working from a home studio, or going to the client's home — not
 * a salon. Their page says what they do in their own name: "Toby's nails", "Toby's buzzcuts", "Toby's haircuts"; the
 * keywords are the craft and the pro ("nail tech near me", "mobile barber Denver"), never "nail salon".
 */

export interface Craft {
  /** What they do, as it follows their name: "Toby's nails". */
  work: string;
  /** The professional: "nail tech", "barber". */
  pro: string;
}

/** The craft for a business type (the salon category: "Nail Salon", "Barbershop", "Hair Salon", …). */
export function craftFor(category: string | null | undefined): Craft {
  const c = String(category ?? "").toLowerCase();
  if (/nail/.test(c)) return { work: "nails", pro: "nail tech" };
  if (/barber/.test(c)) return { work: "buzzcuts", pro: "barber" };
  if (/hair|haircut|stylist/.test(c)) return { work: "haircuts", pro: "hair stylist" };
  if (/lash/.test(c)) return { work: "lashes", pro: "lash artist" };
  if (/brow/.test(c)) return { work: "brows", pro: "brow artist" };
  if (/wax/.test(c)) return { work: "waxing", pro: "wax specialist" };
  if (/makeup|make-up/.test(c)) return { work: "makeup", pro: "makeup artist" };
  if (/esthetic|skin|facial/.test(c)) return { work: "skin care", pro: "esthetician" };
  if (/massage/.test(c)) return { work: "massage", pro: "massage therapist" };
  if (/tattoo/.test(c)) return { work: "tattoos", pro: "tattoo artist" };
  return { work: "beauty services", pro: "beauty pro" };
}

const cap = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());

/** Where a Solo pro works: their own place ("salon": a booth or suite; "home": a home studio; "none") and house calls. */
export interface SoloPlaces { ownPlace: string | null; houseCalls: boolean; radiusMiles: number | null }

/** "Home studio and house calls." / "House calls only." / "In a salon suite." — or "" when not known. */
export function placesSentence(p: SoloPlaces): string {
  const own = p.ownPlace === "home" ? "home studio" : p.ownPlace === "salon" ? "salon suite" : null;
  if (own && p.houseCalls) return `${own.charAt(0).toUpperCase()}${own.slice(1)} and house calls.`;
  if (p.houseCalls) return "House calls only.";
  if (own) return p.ownPlace === "home" ? "Home studio." : "In a salon suite.";
  return "";
}

/** "Nails" for a title: "Toby's | Nails in Denver, CO". */
export const craftTitle = (c: Craft) => cap(c.work);

/** Keywords for a Solo pro: the craft and the pro in their city, near me, mobile when they do house calls. */
export function soloKeywords(c: Craft, city: string | null, p: SoloPlaces): string[] {
  return [
    city ? `${c.work} ${city}` : c.work,
    city ? `${c.pro} ${city}` : c.pro,
    `${c.pro} near me`,
    ...(p.houseCalls ? [`mobile ${c.pro}`, city ? `${c.work} at home ${city}` : `${c.work} at home`] : []),
    ...(p.ownPlace === "home" ? [`home studio ${c.pro}`] : []),
    ...(p.ownPlace === "salon" ? [`independent ${c.pro}`] : []),
  ];
}
