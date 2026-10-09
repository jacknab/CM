/**
 * Artwork for the nail-salon kiosk (the check-in kiosk's nail-salon look).
 *
 * Every picture the kiosk can show has a slot here. The slots are seeded into the admin Illustration
 * library as the "Nail Kiosk" group, empty; an admin uploads a picture into each, and the kiosk shows it
 * (a stand-in is drawn until then). One list, so the admin library and the kiosk can never disagree
 * about which pictures exist or what they are called.
 */
export const KIOSK_ART_INDUSTRY = "NAIL_KIOSK";

/** "Ombré / Baby Boomer" → "ombre-baby-boomer" */
export function kioskArtKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export type KioskArtKind = "shape" | "length" | "design" | "hand" | "decor";
export const kioskArtSlug = (kind: KioskArtKind, name: string) => `kiosk-nail-${kind}-${kioskArtKey(name)}`;

const SHAPES = ["Square", "Squoval", "Round", "Oval", "Almond", "Coffin", "Ballerina", "Stiletto", "Lipstick", "Flare", "Mountain Peak"];
const LENGTHS = ["Short", "Medium", "Long", "XL", "XXL", "XXXL"];
const DESIGNS = ["Plain", "French Tips", "Ombré / Baby Boomer", "Chrome", "Mirror Chrome", "Mermaid Chrome", "Glazed Donut", "Pearl Finish", "Cat Eye", "Velvet Cat Eye",
  "Magnetic", "Aurora", "Holographic", "Unicorn", "Mermaid Powder", "Glitter", "Foil", "Marble", "Airbrush", "Stamping", "Hand Painted", "3D Art", "Rhinestones"];
const HANDS = ["Short Fingers", "Long Fingers", "Wide Hands", "Slim Hands", "Petite Hands", "Large Hands"];

const CARD = "Portrait, about 600 × 700 px, cropped close, on the cream background (#f7ede6). Fills the left of the card.";
const HAND = "Back of the hand, fingers up. Portrait, about 400 × 600 px, transparent or cream (#f7ede6) background.";

export interface KioskArtSlot { slug: string; name: string; description: string; sortOrder: number }

export const KIOSK_ART_SLOTS: KioskArtSlot[] = [
  ...SHAPES.map((n) => ({ slug: kioskArtSlug("shape", n), name: `Shape — ${n}`, description: `Nail shape step: one fingertip with a ${n.toLowerCase()} nail. ${CARD}` })),
  ...LENGTHS.map((n) => ({ slug: kioskArtSlug("length", n), name: `Length — ${n}`, description: `Nail length step: one fingertip showing the ${n} length. ${CARD}` })),
  ...DESIGNS.map((n) => ({ slug: kioskArtSlug("design", n), name: `Design — ${n}`, description: n === "Plain"
    ? `Nail design step, the "Plain, no design" card: a plain polished nail. ${CARD}`
    : `Nail design step: a nail with the ${n} finish. ${CARD}` })),
  ...HANDS.map((n) => ({ slug: kioskArtSlug("hand", n), name: `Hand — ${n}`, description: `"Need help choosing?" guide, the ${n} card. ${HAND}` })),
  { slug: kioskArtSlug("decor", "Corner top left"), name: "Decor — Corner, top left", description: "Flowers or a blossom branch for the top-left corner of the nail steps. Transparent PNG, about 500 × 500 px." },
  { slug: kioskArtSlug("decor", "Corner bottom left"), name: "Decor — Corner, bottom left", description: "Flowers for the bottom-left corner of the nail steps. Transparent PNG, about 600 × 500 px." },
  { slug: kioskArtSlug("decor", "Corner bottom right"), name: "Decor — Corner, bottom right", description: "Stones and flowers for the bottom-right corner of the nail steps. Transparent PNG, about 700 × 500 px." },
  { slug: kioskArtSlug("decor", "Background"), name: "Decor — Background", description: "A very soft cream texture behind the nail steps, drawn at about half strength. 1920 × 1200 px." },
].map((s, i) => ({ ...s, sortOrder: (i + 1) * 10 }));
