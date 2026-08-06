export type ImageCategory =
  | "hero"
  | "nails"
  | "hair"
  | "barber"
  | "interior"
  | "team"
  | "bullet";

export interface SalonImage {
  id: string;
  alt: string;
  category: ImageCategory;
  thumb: string;
  full: string;
}

function unsplash(id: string, w: number, h: number): string {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;
}

export const IMAGE_CATEGORIES: { id: ImageCategory; label: string; icon: string }[] = [
  { id: "hero",     label: "Hero Banners",    icon: "🖼" },
  { id: "nails",    label: "Nails & Manicure", icon: "💅" },
  { id: "hair",     label: "Hair & Styling",   icon: "✂️" },
  { id: "barber",   label: "Barber & Fades",   icon: "💈" },
  { id: "interior", label: "Salon Interior",   icon: "🏠" },
  { id: "team",     label: "Team & Staff",     icon: "👤" },
  { id: "bullet",   label: "Icons & Details",  icon: "⬡" },
];

export const SALON_IMAGES: SalonImage[] = [
  // ── Hero / wide landscape ─────────────────────────────────────────────────
  { id: "h1", category: "hero", alt: "Luxury nail salon interior", thumb: unsplash("1560869713-7d0a29430803", 400, 225), full: unsplash("1560869713-7d0a29430803", 1440, 900) },
  { id: "h2", category: "hero", alt: "Hair salon styling station", thumb: unsplash("1522337360788-8b13dee7a37e", 400, 225), full: unsplash("1522337360788-8b13dee7a37e", 1440, 900) },
  { id: "h3", category: "hero", alt: "Classic barbershop interior", thumb: unsplash("1503951914875-452162b0f3f1", 400, 225), full: unsplash("1503951914875-452162b0f3f1", 1440, 900) },
  { id: "h4", category: "hero", alt: "Modern barbershop chairs", thumb: unsplash("1621605815971-fbc98d665033", 400, 225), full: unsplash("1621605815971-fbc98d665033", 1440, 900) },
  { id: "h5", category: "hero", alt: "Salon mirrors and styling chairs", thumb: unsplash("1560066984-138dadbf474d", 400, 225), full: unsplash("1560066984-138dadbf474d", 1440, 900) },
  { id: "h6", category: "hero", alt: "Nail technician at work", thumb: unsplash("1604654894610-df63bc536371", 400, 225), full: unsplash("1604654894610-df63bc536371", 1440, 900) },

  // ── Nails & Manicure ──────────────────────────────────────────────────────
  { id: "n1", category: "nails", alt: "Gel manicure close-up", thumb: unsplash("1604654894610-df63bc536371", 400, 400), full: unsplash("1604654894610-df63bc536371", 800, 800) },
  { id: "n2", category: "nails", alt: "Nail art design", thumb: unsplash("1519415510736-c70a34de2bd8", 400, 400), full: unsplash("1519415510736-c70a34de2bd8", 800, 800) },
  { id: "n3", category: "nails", alt: "Acrylic nail set", thumb: unsplash("1604072366595-e75dc92d6bdc", 400, 400), full: unsplash("1604072366595-e75dc92d6bdc", 800, 800) },
  { id: "n4", category: "nails", alt: "Pedicure and foot care", thumb: unsplash("1527960669566-bc4b02a6cb50", 400, 400), full: unsplash("1527960669566-bc4b02a6cb50", 800, 800) },
  { id: "n5", category: "nails", alt: "Nail salon manicure", thumb: unsplash("1526045612212-70cbbcb58f90", 400, 400), full: unsplash("1526045612212-70cbbcb58f90", 800, 800) },
  { id: "n6", category: "nails", alt: "French manicure", thumb: unsplash("1610992015732-f449dc27c475", 400, 400), full: unsplash("1610992015732-f449dc27c475", 800, 800) },

  // ── Hair & Styling ────────────────────────────────────────────────────────
  { id: "s1", category: "hair", alt: "Balayage hair color", thumb: unsplash("1560066984-138dadbf474d", 400, 400), full: unsplash("1560066984-138dadbf474d", 800, 800) },
  { id: "s2", category: "hair", alt: "Women's haircut and style", thumb: unsplash("1521590832167-7bcbfaa6381f", 400, 400), full: unsplash("1521590832167-7bcbfaa6381f", 800, 800) },
  { id: "s3", category: "hair", alt: "Hair coloring treatment", thumb: unsplash("1522337360788-8b13dee7a37e", 400, 400), full: unsplash("1522337360788-8b13dee7a37e", 800, 800) },
  { id: "s4", category: "hair", alt: "Blowout and hair styling", thumb: unsplash("1571781926291-c477ebfd024b", 400, 400), full: unsplash("1571781926291-c477ebfd024b", 800, 800) },
  { id: "s5", category: "hair", alt: "Hair highlights", thumb: unsplash("1596704685636-7a1c9b5d3c5c", 400, 400), full: unsplash("1596704685636-7a1c9b5d3c5c", 800, 800) },
  { id: "s6", category: "hair", alt: "Professional hair styling", thumb: unsplash("1518496538-1b1e443fed2a", 400, 400), full: unsplash("1518496538-1b1e443fed2a", 800, 800) },

  // ── Barber & Fades ────────────────────────────────────────────────────────
  { id: "b1", category: "barber", alt: "Classic fade haircut", thumb: unsplash("1503951914875-452162b0f3f1", 400, 400), full: unsplash("1503951914875-452162b0f3f1", 800, 800) },
  { id: "b2", category: "barber", alt: "Modern barbershop fade", thumb: unsplash("1621605815971-fbc98d665033", 400, 400), full: unsplash("1621605815971-fbc98d665033", 800, 800) },
  { id: "b3", category: "barber", alt: "Beard trim and shave", thumb: unsplash("1532710093739-c56dba4c9f5a", 400, 400), full: unsplash("1532710093739-c56dba4c9f5a", 800, 800) },
  { id: "b4", category: "barber", alt: "Buzz cut close-up", thumb: unsplash("1567894340315-702c2e34e8da", 400, 400), full: unsplash("1567894340315-702c2e34e8da", 800, 800) },
  { id: "b5", category: "barber", alt: "Men's precision haircut", thumb: unsplash("1541654583758-6a1fa97a6e56", 400, 400), full: unsplash("1541654583758-6a1fa97a6e56", 800, 800) },
  { id: "b6", category: "barber", alt: "Straight razor shave", thumb: unsplash("1614854262240-87da72b35c98", 400, 400), full: unsplash("1614854262240-87da72b35c98", 800, 800) },

  // ── Salon Interior ────────────────────────────────────────────────────────
  { id: "i1", category: "interior", alt: "Nail salon reception area", thumb: unsplash("1560869713-7d0a29430803", 400, 300), full: unsplash("1560869713-7d0a29430803", 1000, 750) },
  { id: "i2", category: "interior", alt: "Hair salon styling chairs", thumb: unsplash("1560066984-138dadbf474d", 400, 300), full: unsplash("1560066984-138dadbf474d", 1000, 750) },
  { id: "i3", category: "interior", alt: "Modern salon mirrors", thumb: unsplash("1522337360788-8b13dee7a37e", 400, 300), full: unsplash("1522337360788-8b13dee7a37e", 1000, 750) },
  { id: "i4", category: "interior", alt: "Luxury salon entrance", thumb: unsplash("1567422338-df12e0e6c4fc", 400, 300), full: unsplash("1567422338-df12e0e6c4fc", 1000, 750) },
  { id: "i5", category: "interior", alt: "Salon treatment room", thumb: unsplash("1615729947596-a598e5de0ab3", 400, 300), full: unsplash("1615729947596-a598e5de0ab3", 1000, 750) },

  // ── Team & Staff ──────────────────────────────────────────────────────────
  { id: "t1", category: "team", alt: "Professional female stylist", thumb: unsplash("1494790108377-be9c29b29330", 400, 500), full: unsplash("1494790108377-be9c29b29330", 600, 750) },
  { id: "t2", category: "team", alt: "Male barber professional", thumb: unsplash("1507003211169-0a1dd7228f2d", 400, 500), full: unsplash("1507003211169-0a1dd7228f2d", 600, 750) },
  { id: "t3", category: "team", alt: "Nail technician portrait", thumb: unsplash("1580489944761-15a19d654956", 400, 500), full: unsplash("1580489944761-15a19d654956", 600, 750) },
  { id: "t4", category: "team", alt: "Hair colorist professional", thumb: unsplash("1568602471122-9df24c8f6f7b", 400, 500), full: unsplash("1568602471122-9df24c8f6f7b", 600, 750) },
  { id: "t5", category: "team", alt: "Salon owner headshot", thumb: unsplash("1544005313-94ddf0286df2", 400, 500), full: unsplash("1544005313-94ddf0286df2", 600, 750) },
  { id: "t6", category: "team", alt: "Beauty professional portrait", thumb: unsplash("1531746020798-e6953c6e8e04", 400, 500), full: unsplash("1531746020798-e6953c6e8e04", 600, 750) },

  // ── Bullet / Icon / Detail ────────────────────────────────────────────────
  { id: "d1", category: "bullet", alt: "Nail polish bottle detail", thumb: unsplash("1604072366595-e75dc92d6bdc", 200, 200), full: unsplash("1604072366595-e75dc92d6bdc", 300, 300) },
  { id: "d2", category: "bullet", alt: "Scissors hair styling tool", thumb: unsplash("1503951914875-452162b0f3f1", 200, 200), full: unsplash("1503951914875-452162b0f3f1", 300, 300) },
  { id: "d3", category: "bullet", alt: "Manicure tools detail", thumb: unsplash("1604654894610-df63bc536371", 200, 200), full: unsplash("1604654894610-df63bc536371", 300, 300) },
  { id: "d4", category: "bullet", alt: "Razor barber tool", thumb: unsplash("1532710093739-c56dba4c9f5a", 200, 200), full: unsplash("1532710093739-c56dba4c9f5a", 300, 300) },
  { id: "d5", category: "bullet", alt: "Hair color brush", thumb: unsplash("1560066984-138dadbf474d", 200, 200), full: unsplash("1560066984-138dadbf474d", 300, 300) },
  { id: "d6", category: "bullet", alt: "Salon product detail", thumb: unsplash("1526045612212-70cbbcb58f90", 200, 200), full: unsplash("1526045612212-70cbbcb58f90", 300, 300) },
];

// ── Category detection heuristics (mirrors the bridge script logic) ──────────

export function detectCategory(
  src: string,
  alt: string,
  displayWidth: number,
  displayHeight: number
): ImageCategory {
  const w = displayWidth, h = displayHeight;
  const text = (src + " " + alt).toLowerCase();

  if (w <= 80 || h <= 80) return "bullet";
  const ratio = w / (h || 1);
  if (ratio > 2.0 && w > 400) return "hero";

  if (/nail|manicure|pedicure|gel|acrylic/.test(text)) return "nails";
  if (/barber|fade|buzz|shave|beard/.test(text)) return "barber";
  if (/hair|color|dye|style|cut|blow/.test(text)) return "hair";
  if (/interior|salon|reception|chair|mirror/.test(text)) return "interior";
  if (/person|staff|team|portrait|headshot/.test(text)) return "team";

  // Fallback by size
  if (ratio > 1.5) return "interior";
  if (w < 150) return "bullet";
  return "nails";
}
