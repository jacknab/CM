/**
 * Certxa's global hairstyle library (Last Cut Formula Engine, Phase 4): 200 curated barbershop / men's grooming styles.
 * Imported into hairstyle_templates with store_id NULL by artifacts/api-server/src/lib/hairstyleCatalogImport.ts
 * (idempotent; keyed by slug). Each style's default spec is a REFERENCE DEFAULT for the barber, never applied to a
 * client by itself, and it passes the same validation as a saved haircut (shared/haircutFormula.ts checkSpecForSave).
 *
 * Every entry is a structurally different cut (tests refuse two styles with the same spec, the same name, or an alias
 * that is another style's name), so marketing synonyms ("bald fade" = "skin fade") are aliases, not extra styles.
 *
 * Spec shorthand (one clause per ";", parsed by catalogSpec below):
 *   sides #1 #2 1in clipper-over-comb   fade skin mid #0-#2   back #1 disconnected   left #0  right #4
 *   top 2in|#3 scissor texturize forward longer   neck tapered,natural   burns short tapered   beard #2 lineup blend short-boxed
 *   line natural (line-up with that hairline shape)   methods scissor,clipper   hair curly thick
 *   tex locs retwist parts:square   finish matte:clay,paste
 * Suits (hair texture the style suits): s = straight, w = wavy, c = curly, k = coily.
 */
import { SPEC_VERSION, type HaircutSpec } from "./haircutFormula";

export type CatalogCategory =
  | "fades-and-tapers" | "buzz-cuts-and-military" | "classic-and-professional" | "crops-and-fringe" | "pompadours-and-undercuts"
  | "curly-and-textured" | "afros-waves-twists-and-locs" | "mohawks-mullets-and-alternative" | "medium-and-long" | "specialty-and-custom";

export type CatalogStyle = {
  slug: string; name: string; category: CatalogCategory; description: string; aliases: string[];
  spec: HaircutSpec; suits: ("straight" | "wavy" | "curly" | "coily")[];
};

/** The categories already seeded by migration 0356 that the catalog uses ("childrens" stays empty for now). */
export const CATALOG_CATEGORIES: CatalogCategory[] = [
  "fades-and-tapers", "buzz-cuts-and-military", "classic-and-professional", "crops-and-fringe", "pompadours-and-undercuts",
  "curly-and-textured", "afros-waves-twists-and-locs", "mohawks-mullets-and-alternative", "medium-and-long", "specialty-and-custom",
];

const GUARD = /^(#(0|0\.5|1|1\.5|2|2\.5|3|4|5|6|7|8)|foil)$/;
const LEN = /^(\d+(?:\.\d+)?)(in|mm)$/;
const words = (list: readonly string[]) => new Set(list);
const SIDE_TECH = words(["clipper-over-comb", "scissor-over-comb", "razor"]);
const FADES = words(["none", "skin", "low", "mid", "high", "taper", "drop", "burst", "temple", "shadow"]);
const HEIGHTS = words(["low", "mid", "high"]);
const TOP_TECH = words(["scissor", "clipper", "razor", "freehand"]);
const TEXTURES = words(["texturize", "thin", "point-cut"]);
const DIRS = words(["forward", "back", "up", "side-part-left", "side-part-right", "middle-part", "natural"]);
const BLENDS = words(["seamless", "visible-line", "disconnected"]);
const NECKS = words(["natural", "squared", "rounded", "tapered", "faded-out"]);
const BURN_LEN = words(["short", "mid", "long"]);
const BURN_SHAPE = words(["tapered", "natural", "squared"]);
const HAIRLINES = words(["natural", "squared", "rounded", "recessed-follow"]);
const METHODS = words(["clipper", "scissor", "razor", "shear-over-comb", "freehand"]);
const HAIR_TEX = words(["straight", "wavy", "curly", "coily"]);
const DENSITY = words(["fine", "medium", "thick"]);
const TEXTURED = words(["braids", "locs", "twists", "waves", "afro", "coils"]);
const LOOKS = words(["matte", "natural", "shine"]);

/** The shorthand above → a spec v1. Throws on anything it doesn't know, so a typo can't slip into the catalog. */
export function catalogSpec(src: string, notes: string): HaircutSpec {
  const spec: any = { v: SPEC_VERSION };
  const bad = (clause: string, t: string) => { throw new Error(`catalog spec: "${t}" in "${clause}"`); };
  const length = (t: string) => { const m = t.match(LEN); return m ? { value: Number(m[1]), unit: m[2] } : null; };
  for (const clause of src.split(";").map((c) => c.trim()).filter(Boolean)) {
    const [key, ...toks] = clause.split(/\s+/);
    switch (key) {
      case "sides": case "left": case "right": {
        const target = key === "sides" ? (spec.sides ??= {}) : ((spec.sides ??= {})[key] ??= { guard: [] });
        for (const t of toks) {
          if (GUARD.test(t)) (target.guard ??= []).push(t);
          else if (key === "sides" && length(t)) target.length = length(t);
          else if (key === "sides" && SIDE_TECH.has(t)) (target.technique ??= []).push(t);
          else bad(clause, t);
        }
        break;
      }
      case "fade": {
        const f: any = (spec.fade = {});
        for (const t of toks) {
          if (!f.type && FADES.has(t)) f.type = t;
          else if (HEIGHTS.has(t)) f.height = t;
          else if (/^#[\d.]+-#[\d.]+$/.test(t)) { const [a, b] = t.split("-"); f.start = { guard: a }; f.end = { guard: b }; }
          else if (t === "foil") f.foil = true;
          else bad(clause, t);
        }
        break;
      }
      case "back": for (const t of toks) { if (GUARD.test(t)) ((spec.back ??= {}).guard ??= []).push(t); else if (BLENDS.has(t)) (spec.back ??= {}).blend = t; else bad(clause, t); } break;
      case "top": {
        const top: any = (spec.top = {});
        for (const t of toks) {
          if (length(t)) top.length = length(t);
          else if (/^#[\d.]+$/.test(t)) top.length = { value: Number(t.slice(1)), unit: "guard" };
          else if (TOP_TECH.has(t)) (top.technique ??= []).push(t);
          else if (TEXTURES.has(t)) (top.texture ??= []).push(t);
          else if (DIRS.has(t)) top.direction = t;
          else if (t === "longer") top.leaveLonger = true;
          else bad(clause, t);
        }
        break;
      }
      case "neck": spec.neckline = { shape: toks.join(",").split(",").filter(Boolean).map((t) => (NECKS.has(t) ? t : bad(clause, t))) }; break;
      case "burns": for (const t of toks) { const b = (spec.sideburns ??= {}); if (BURN_LEN.has(t)) b.length = t; else if (BURN_SHAPE.has(t)) (b.shape ??= []).push(t); else bad(clause, t); } break;
      case "beard": {
        const b: any = (spec.beard = {});
        for (const t of toks) { if (GUARD.test(t) && t !== "foil") b.guard = t; else if (t === "lineup") b.lineUp = true; else if (t === "blend") b.blendIntoFade = true; else if (/^[a-z-]+$/.test(t)) b.shape = t; else bad(clause, t); }
        break;
      }
      case "line": spec.hairline = { lineUp: true, ...(toks[0] ? { shape: HAIRLINES.has(toks[0]) ? toks[0] : bad(clause, toks[0]) } : {}) }; break;
      case "methods": spec.methods = toks.join(",").split(",").filter(Boolean).map((t) => (METHODS.has(t) ? t : bad(clause, t))); break;
      case "hair": for (const t of toks) { const h = (spec.hair ??= {}); if (HAIR_TEX.has(t)) h.texture = t; else if (DENSITY.has(t)) h.density = t; else bad(clause, t); } break;
      case "tex": {
        const [style, ...rest] = toks;
        if (!TEXTURED.has(style)) bad(clause, style);
        const parts = rest.find((t) => t.startsWith("parts:"));
        const maint = rest.filter((t) => !t.startsWith("parts:")).join(" ");
        spec.textured = { style, ...(maint ? { maintenance: maint.replace(/-/g, " ") } : {}), ...(parts ? { parts: parts.slice(6).replace(/-/g, " ") } : {}) };
        break;
      }
      case "finish": {
        const [look, products] = toks.join(" ").split(":");
        if (!LOOKS.has(look)) bad(clause, look);
        spec.finish = { look, ...(products ? { products: products.split(",").map((p) => p.replace(/-/g, " ").trim()).filter(Boolean) } : {}) };
        break;
      }
      default: bad(clause, key);
    }
  }
  if (notes) spec.instructions = notes;
  return spec as HaircutSpec;
}

const SUITS = { s: "straight", w: "wavy", c: "curly", k: "coily" } as const;
const slugify = (name: string) => name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Row = [name: string, description: string, aliases: string, spec: string, notes: string, suits: string];
const ROWS: Record<CatalogCategory, Row[]> = {
  "fades-and-tapers": [
    ["Low Skin Fade", "Clippered to bare skin just above the ears and nape, blending up into a short top.", "low bald fade|low zero fade|low skin", "sides #0; fade skin low #0-#2; top 1.5in scissor texturize; neck faded-out; burns short tapered", "Keep the blend below the temple line. Matte paste, pushed forward or messy.", "swck"],
    ["Mid Skin Fade", "Skin at the bottom with the blend reaching the middle of the head, around the temples.", "mid bald fade|mid zero fade|mid skin", "sides #0; fade skin mid #0-#2; top 1.5in scissor; neck faded-out; burns short tapered", "Blend through #0.5, #1 and #1.5 before the #2. Clean line-up optional.", "swck"],
    ["High Skin Fade", "Skin taken high up the sides so the top stands out as a defined block.", "high bald fade|high zero fade|high skin", "sides #0; fade skin high #0-#2; top 1in scissor; neck faded-out; burns short tapered", "Blend right up to the parietal ridge. Keep the top tidy and even.", "swck"],
    ["Low Fade", "A soft fade starting from a short guard, not skin, kept low around the ears.", "low guard fade|low zero point five fade", "sides #0.5; fade low low #0.5-#2; top 2in scissor; neck tapered; burns mid tapered", "No bare skin: start the fade at #0.5. Good for clients who don't want skin showing.", "swck"],
    ["Mid Fade", "Guard fade from a short length up to mid height, a balanced everyday cut.", "medium fade|mid guard fade", "sides #0.5; fade mid mid #0.5-#3; top 2in scissor; neck tapered; burns short tapered", "Start at #0.5, finish the blend into #3 at the temples.", "swck"],
    ["High Fade", "Guard fade taken high on the head, short and sharp without bare skin.", "high guard fade", "sides #0.5; fade high high #0.5-#3; top 1.5in scissor; neck tapered; burns short tapered", "Blend high to the crown corners; keep the top short to match.", "swck"],
    ["Low Taper", "Length tapered only at the sideburns and nape, leaving the sides fuller.", "taper fade low|low taper fade", "sides #3; fade taper low #1-#3; top 2in scissor; neck tapered; burns mid tapered", "Taper only the hairline edges; the rest of the sides stay at #3.", "swck"],
    ["Mid Taper", "A taper climbing to mid height at the temples and nape with more length kept above.", "mid taper fade|medium taper", "sides #2; fade taper mid #1-#3; top 2in scissor; neck tapered; burns short tapered", "Keep it soft: no skin, just a clean graduation.", "swck"],
    ["High Taper", "Taper carried high at the temples and back for a cleaner, shorter outline.", "high taper fade", "sides #2; fade taper high #0.5-#2; top 1.5in scissor; neck tapered; burns short tapered", "Taper reaches above the ear; top stays short and neat.", "swck"],
    ["Skin Taper", "Taper that goes to skin only at the sideburns and nape for a crisp edge.", "bald taper|skin taper fade", "sides #3; fade taper low #0-#2; top 2in scissor; neck faded-out; burns short tapered", "Skin only at the very edges; the sides above stay fuller.", "swck"],
    ["Neck Taper", "No fade on the sides; only the nape is tapered for a clean, natural finish.", "nape taper|neckline taper|tapered neckline", "sides #3 clipper-over-comb; top 2.5in scissor; neck tapered; burns mid natural", "Clipper-over-comb the nape from short to the sides' length.", "swck"],
    ["Temple Fade", "Fade only around the temples and sideburns with a sharp front hairline.", "temp fade|brooklyn fade|temple taper", "sides #3; fade temple low #0-#2; top 2in scissor; line natural; burns short tapered", "Fade the temple and sideburn area only, then line up the front.", "swck"],
    ["Drop Fade", "A fade that dips down behind the ear toward the nape, curving with the head.", "drop taper|curved fade", "sides #0; fade drop mid #0-#2; top 2in scissor texturize; neck faded-out; burns short tapered", "Follow the occipital bone: high at the temple, dropping behind the ear.", "swck"],
    ["Burst Fade", "A semicircular fade around the ear that leaves length at the nape.", "south of france fade|ear burst|burst taper", "sides #3; fade burst low #0-#2; top 2.5in scissor; neck natural; burns short tapered", "Fade radiates around the ear only; leave the back and nape full.", "swck"],
    ["Shadow Fade", "Subtle fade that never reaches skin, keeping a darker, softer shadow on the sides.", "soft fade|shadow taper", "sides #1; fade shadow mid #1-#3; top 2in scissor; neck tapered; burns mid tapered", "Lowest guard #1: shows a shadow, never scalp.", "swck"],
    ["Razor Fade", "Skin fade finished with a razor for the smoothest possible bottom.", "foil fade|razor skin fade|shaved fade", "sides foil razor; fade skin mid #0-#2 foil; top 1.5in scissor; neck faded-out; burns short tapered", "Foil or razor the bottom after the clipper blend. Use a pre-shave gel.", "swck"],
    ["Scissor Fade", "Fade made entirely with scissors over comb for a soft, natural graduation.", "shear fade|scissor over comb taper", "methods scissor,shear-over-comb; sides 1in scissor-over-comb; fade taper mid; top 2.5in scissor; neck natural", "No clippers: shear-over-comb from the hairline up.", "swc"],
    ["Hard Part Fade", "Low fade with a shaved line marking the part for a sharp, defined side part.", "shaved part|surgical part|part line fade", "sides #0.5; fade low low #0.5-#2; top 3in scissor side-part-left; line natural; burns short tapered", "Razor a thin hard part along the natural part.", "swc"],
    ["Beard Fade", "Skin fade that runs down the sideburns and blends into the beard.", "fade into beard|beard blend fade", "sides #0; fade skin low #0-#2; top 2in scissor; neck faded-out; burns short tapered; beard #3 blend lineup", "Blend sideburn into beard with no step; line up the cheek line.", "swck"],
    ["Reverse Fade", "Graduates the opposite way: shortest around the crown edge, longer toward the nape.", "reverse taper|upside down fade", "sides #4; back #1 visible-line; top #2 clipper; neck natural; burns long natural", "Keep the nape and lower back longer than the area above it.", "swck"],
  ],
  "buzz-cuts-and-military": [
    ["Buzz Cut Line-Up", "Even buzz finished with a sharp squared line-up at the front and temples.", "buzz with edge up|buzz shape up", "top #2 clipper; sides #2; line squared; neck squared; burns short squared", "Buzz first, then razor-sharp corners at the temples.", "ck"],
    ["Induction Cut", "The shortest even clipper cut, one very short guard all over.", "induction buzz|number one all over", "methods clipper; top #1 clipper; sides #1; neck natural", "One guard everywhere; tidy the neckline only.", "swck"],
    ["Peach Fuzz", "Barely-there even length with a half guard all over.", "half guard buzz|zero point five buzz", "methods clipper; top #0.5 clipper; sides #0.5; neck natural", "Half guard all over; check for an even finish against the grain.", "swck"],
    ["Buzz Cut", "Classic even clipper cut with a short guard all over.", "burr cut|number two buzz|clipper cut", "methods clipper; top #2 clipper; sides #2; neck squared", "One guard all over; square or round the neckline as preferred.", "swck"],
    ["Long Buzz Cut", "A softer buzz with more length on top and slightly shorter sides.", "longer buzz", "methods clipper; top #6 clipper; sides #4; neck rounded", "Top at #6, sides at #4, blend the corners.", "swck"],
    ["Butch Cut", "Even buzz a little longer than a standard buzz, uniform across the top.", "butch", "methods clipper; top #4 clipper; sides #4; neck squared", "Uniform #4; keep the top flat to the head shape.", "swck"],
    ["Faded Buzz Cut", "Short buzz on top with a skin fade on the sides.", "buzz fade|skin fade buzz", "top #2 clipper; sides #0; fade skin low #0-#2; neck faded-out", "Fade from skin into the top's guard.", "swck"],
    ["High Fade Buzz Cut", "Buzzed top with a high skin fade for a short, sharp outline.", "high buzz fade", "top #1.5 clipper; sides #0; fade skin high #0-#1.5; neck faded-out", "Fade high, matching the top's guard at the crest.", "swck"],
    ["Taper Buzz Cut", "Even buzz with only the edges tapered for a neat grow-out.", "buzz taper", "top #3 clipper; sides #3; fade taper low #1-#3; neck tapered", "Taper sideburns and nape only.", "swck"],
    ["Burst Fade Buzz Cut", "Buzz with a burst fade around the ears.", "buzz burst", "top #2 clipper; sides #2; fade burst low #0-#2; neck natural", "Burst around the ears; leave the nape at the top's length.", "swck"],
    ["Buzz Cut with Hard Part", "Even buzz with a shaved side part for definition.", "buzz part|buzz with line", "top #2 clipper; sides #1; fade low low #0.5-#2; line natural; neck tapered", "Razor a short hard part on the client's natural side.", "swck"],
    ["Shaved Head", "Clean head shave with a razor for a fully smooth scalp.", "bald shave|head shave|clean shave head", "methods razor; sides foil razor; neck natural", "Hot towel, pre-shave oil, shave with then against the grain.", "swck"],
    ["Brush Cut", "Short top standing straight up like brush bristles, with short sides.", "brush top", "top 0.5in clipper up; sides #2; fade taper mid #1-#2; neck squared", "Cut the top flat-ish so it stands up; light wax.", "swck"],
    ["Crew Cut", "Short tapered sides with a slightly longer top that can be brushed up or to the side.", "crewcut|tapered crew", "top 1in scissor up; sides #2 clipper-over-comb; fade taper mid #1-#2; neck tapered; burns short tapered", "Front slightly longer than the crown.", "swck"],
    ["Skin Fade Crew Cut", "Crew cut with a skin fade instead of a taper on the sides.", "faded crew cut|crew cut fade", "top 1in scissor up; sides #0; fade skin mid #0-#2; neck faded-out; burns short tapered", "Skin fade, then a crew-length top graduating front to back.", "swck"],
    ["Long Crew Cut", "Crew cut with extra length at the front for a soft brush-up or side sweep.", "long crewcut", "top 2in scissor side-part-left; sides #3; fade taper mid #1-#3; neck tapered", "Front up to 2 inches, crown shorter.", "swc"],
    ["Ivy League", "Longer crew cut with enough length on top for a neat side part.", "harvard clip|princeton cut|ivy league cut", "top 1.5in scissor side-part-left; sides #3; fade taper mid #1-#3; neck tapered; burns mid tapered", "Part on the natural side; light cream for a natural finish.", "swc"],
    ["High and Tight", "Military cut: very short top and sides faded high and tight to the skin.", "jarhead|marine cut|high n tight", "top #4 clipper; sides #0; fade skin high #0-#1; neck faded-out; burns short squared", "Fade to skin high, top kept to one even guard.", "swck"],
    ["High and Tight Recon", "Military recon: sides and back shaved high, small strip of short hair on top.", "recon cut|recon", "top #3 clipper; sides foil razor; fade skin high #0-#1 foil; neck faded-out", "Shave sides and back high; leave a defined patch on top.", "swck"],
    ["Flattop", "Top cut flat into a level platform, with tapered sides.", "flat top|flattop fade", "top 1in clipper freehand up; sides #1; fade taper high #0.5-#2; neck squared; burns short squared", "Use a flattop comb and level; stand the hair straight up first.", "ck"],
    ["Regulation Cut", "Conservative short cut with a side part, inside military grooming rules.", "regs|regulation haircut|service cut", "top 2in scissor side-part-left; sides #2 clipper-over-comb; fade taper mid #1-#2; neck tapered; burns short natural", "Keep off the ears and collar; neat part.", "sw"],
  ],
  "classic-and-professional": [
    ["Short Brushed Back", "Short top brushed back off the face with a matte, natural finish.", "brushed back|short swept back", "top 2in scissor texturize back; sides #2; fade taper mid #1-#2; neck tapered; finish matte:cream", "Blow-dry back with a vent brush; no shine.", "sw"],
    ["Short Back and Sides", "Traditional cut: short, neat back and sides with a longer top.", "short back n sides|sbs", "sides #2 clipper-over-comb; top 2in scissor; neck tapered; burns mid natural", "Clipper-over-comb the back and sides, scissor the top.", "swc"],
    ["Classic Side Part", "Timeless side part with tapered sides and a groomed top.", "executive contour|hollywood side part|mad men cut", "top 2.5in scissor side-part-left; sides #4 scissor-over-comb; fade taper low #2-#4; neck tapered; burns mid tapered; finish shine:pomade", "Comb the part on the natural side; pomade or cream.", "sw"],
    ["Textured Side Part", "Relaxed side part with a messy, matte finish.", "messy side part|casual side part", "top 3in scissor point-cut side-part-left; sides #3; fade taper mid #1-#3; neck tapered; finish matte:clay", "Point-cut the top for movement; rough-dry with clay.", "swc"],
    ["Skin Fade Side Part", "Side part paired with a mid skin fade for a sharp modern contrast.", "faded side part", "top 3in scissor side-part-left; sides #0; fade skin mid #0-#2; neck faded-out; burns short tapered", "Optional hard part; keep the fade clean.", "swc"],
    ["Gentleman's Cut", "Polished business cut with a soft taper and a neat, rounded outline.", "business cut|professional cut|gentlemans haircut", "top 2in scissor side-part-right; sides #3 scissor-over-comb; neck rounded; burns mid natural", "Rounded neckline, light product.", "sw"],
    ["Comb Over", "Top combed across from a side part, sides scissor-tapered.", "combover|side sweep", "top 3in scissor side-part-left; sides #3 scissor-over-comb; neck tapered; burns mid natural", "Comb over from the part; blow-dry the direction in.", "sw"],
    ["Comb Over Fade", "Comb over with a low fade on the sides.", "low fade comb over|combover fade", "top 3in scissor side-part-left; sides #0.5; fade low low #0.5-#2; neck tapered; burns short tapered", "Low fade, then comb the top over from the part.", "sw"],
    ["Mid Fade Comb Over", "Comb over with the fade reaching mid height.", "mid fade combover", "top 3in scissor side-part-right; sides #0.5; fade mid mid #0.5-#3; neck tapered", "Mid fade; volume at the front of the comb over.", "sw"],
    ["High Skin Fade Comb Over", "Comb over with a high skin fade for strong contrast.", "high fade comb over|skin fade combover", "top 3.5in scissor side-part-left; sides #0; fade skin high #0-#2; neck faded-out", "High skin fade; blow-dry the top over with volume.", "sw"],
    ["Taper Comb Over", "Comb over with a soft taper only at the edges.", "tapered comb over", "top 3in scissor side-part-left; sides #3; fade taper low #1-#3; neck tapered; burns mid tapered", "Keep the sides full and tidy.", "sw"],
    ["Slick Back", "Top combed straight back with a glossy finish and tapered sides.", "slicked back hair|swept back", "top 4in scissor back; sides #3; fade taper mid #1-#3; neck tapered; finish shine:pomade", "Comb straight back with pomade; no part.", "sw"],
    ["Slick Back Skin Fade", "Slick back with a skin fade on the sides.", "faded slick back", "top 4in scissor back; sides #0; fade skin mid #0-#2; neck faded-out; finish shine:pomade", "Skin fade; slick the top back with a fine comb.", "sw"],
    ["Scissor Cut", "All-scissor classic cut with natural, soft edges and no clipper lines.", "all scissor cut|scissor-only haircut", "methods scissor; sides 1in scissor-over-comb; top 2.5in scissor natural; neck natural; burns mid natural", "Scissor-over-comb everywhere; keep weight natural.", "swc"],
    ["Short Layered Cut", "Even short layers all over for a soft, low-maintenance shape.", "layered short cut|uniform layers", "methods scissor; sides 1.5in scissor-over-comb; top 2in scissor point-cut natural; neck rounded", "Layer at a consistent elevation; point-cut to soften.", "swc"],
    ["Duck Tail", "1950s style with the sides combed back to meet in a point at the nape.", "da cut|ducktail", "top 3in scissor back; sides 1.5in scissor-over-comb; neck rounded; burns long squared; finish shine:pomade", "Sides combed back to meet at the nape like a tail.", "sw"],
    ["Blocked Nape Cut", "Classic cut finished with a squared, blocked neckline.", "blocked neckline|squared neckline cut", "top 2in scissor; sides #3 clipper-over-comb; neck squared; burns mid squared", "Square the neckline straight across with clean corners.", "swck"],
  ],
  "crops-and-fringe": [
    ["Caesar Fade", "Caesar cut with a skin fade instead of a taper.", "faded caesar|caesar skin fade", "top 1in scissor forward; sides #0; fade skin mid #0-#1; neck faded-out; line squared; burns short squared", "Short even top brushed forward; skin fade.", "swck"],
    ["Emo Fringe", "Long side fringe swept over one eye with shorter layered back.", "side bangs|scene fringe", "top 5in scissor razor point-cut side-part-right; sides 2in scissor-over-comb; neck natural; burns long natural", "Razor-cut the fringe; flat-iron straight.", "s"],
    ["French Crop", "Short textured top pushed forward to a blunt fringe, with a skin fade.", "french crop fade|crop top", "sides #0; fade skin mid #0-#2; top 1.5in scissor texturize point-cut forward; line squared; neck faded-out", "Blunt fringe line across the forehead; matte paste.", "swc"],
    ["Textured Crop", "Choppy forward top with a low fade, relaxed and modern.", "choppy crop|messy crop", "sides #0.5; fade low low #0.5-#2; top 2in scissor texturize point-cut forward; neck tapered; finish matte:paste", "Point-cut deep for texture; rough-dry forward.", "swc"],
    ["High Fade Crop", "Crop with a high fade, short and very low maintenance.", "high crop", "sides #0.5; fade high high #0.5-#2; top 1.5in scissor texturize forward; neck tapered", "Keep the fringe short and choppy.", "swc"],
    ["Taper Crop", "Crop with a soft taper instead of a fade.", "tapered crop", "sides #3; fade taper low #1-#3; top 2in scissor texturize forward; neck tapered; burns mid tapered", "Taper edges only; fringe slightly irregular.", "swc"],
    ["Burst Fade Crop", "Textured crop with a burst fade around the ears.", "crop burst", "sides #3; fade burst low #0-#2; top 2in scissor texturize forward; neck natural", "Burst around the ears, nape left fuller.", "swc"],
    ["Caesar Cut", "Short, even top brushed forward to a straight, short fringe.", "caesar|roman cut", "top 1in scissor forward; sides #2; fade taper low #1-#2; neck squared; line squared; burns short squared", "Fringe cut straight across; even length on top.", "swck"],
    ["Edgar Cut", "High fade with a straight, blunt clipper line across the forehead.", "edgar|takuache|chili bowl fade", "sides #0; fade high high #0-#2; top 1.5in clipper forward; line squared; neck faded-out", "Clipper the fringe dead straight; crisp line-up.", "swc"],
    ["Short Fringe", "Fringe falling onto the forehead with scissor-tapered sides.", "fringe haircut|bangs cut", "top 3in scissor point-cut forward; sides #3 scissor-over-comb; neck natural; burns mid natural", "Fringe sits just above the brows.", "sw"],
    ["Side Swept Fringe", "Fringe swept to one side from a soft part.", "swept fringe|side fringe", "top 3.5in scissor point-cut side-part-left; sides #3; fade taper low #1-#3; neck tapered", "Blow-dry the fringe across; light cream.", "sw"],
    ["Messy Fringe", "Longer, tousled forward fringe with a mid taper.", "tousled fringe|shaggy fringe", "top 3in scissor texturize point-cut forward; sides #3; fade taper mid #1-#3; neck tapered; finish matte:sea-salt-spray", "Rough-dry with salt spray for separation.", "swc"],
    ["Drop Fade Fringe", "Forward fringe with a drop fade curving behind the ears.", "fringe drop fade", "top 3in scissor point-cut forward; sides #0; fade drop mid #0-#2; neck faded-out", "Drop fade, then a soft forward fringe.", "swc"],
    ["Bowl Cut", "Even scissor length all around, cut to a rounded line like a bowl.", "classic bowl|pudding bowl cut", "methods scissor; top 4in scissor forward; sides 3in scissor-over-comb; neck rounded", "One even line all round; heavy fringe.", "sw"],
    ["Modern Bowl Cut", "Rounded heavy top over a short undercut or fade.", "mushroom cut|undercut bowl", "top 4in scissor point-cut forward; sides #1; fade low low #1-#2; back #1 disconnected; neck natural", "Rounded weight line on top; short underneath.", "sw"],
    ["Short Spiky Hair", "Short top spiked up with texture and tapered sides.", "spikes|spiky haircut", "top 1.5in scissor texturize up; sides #2; fade taper mid #1-#2; neck tapered; finish matte:wax", "Twist small sections into spikes with wax.", "sw"],
  ],
  "pompadours-and-undercuts": [
    ["Pompadour Undercut", "Tall pompadour over a disconnected undercut.", "disconnected pompadour|undercut pompadour", "top 4.5in scissor back up; sides #1; back #1 disconnected; neck natural; finish shine:pomade", "No blend between the undercut and the pomp.", "sw"],
    ["Classic Pompadour", "Voluminous top swept up and back with tapered, combed sides.", "pomp|pompadour", "top 4in scissor back up; sides #3 scissor-over-comb; fade taper low #2-#3; neck tapered; burns mid squared; finish shine:pomade", "Blow-dry up and back with a round brush; high-shine pomade.", "sw"],
    ["Modern Pompadour", "Pompadour volume with a skin fade and a natural finish.", "faded pompadour|pompadour fade", "top 4in scissor back up; sides #0; fade skin mid #0-#2; neck faded-out; finish natural:cream", "Skin fade; softer, matte-to-natural finish than a classic pomp.", "sw"],
    ["Short Pompadour", "Smaller pompadour with less height for everyday wear.", "mini pompadour|short pomp", "top 2.5in scissor back up; sides #2; fade taper mid #1-#2; neck tapered", "Lift the front only; light cream.", "sw"],
    ["Rockabilly Pompadour", "Tall 1950s pompadour with longer sides and sideburns.", "rockabilly|greaser pompadour", "top 5in scissor back up; sides 1in scissor-over-comb; neck rounded; burns long squared; finish shine:pomade", "Maximum height at the front; long squared sideburns.", "sw"],
    ["Side Part Pompadour", "Pompadour lifted from a side part.", "parted pompadour", "top 4in scissor side-part-left up; sides #0.5; fade low low #0.5-#2; neck tapered", "Part, then lift and sweep the front back.", "sw"],
    ["Burst Fade Pompadour", "Pompadour with a burst fade around the ears.", "pomp burst", "top 4in scissor back up; sides #3; fade burst low #0-#2; neck natural; finish natural:cream", "Burst only around the ears.", "sw"],
    ["Quiff", "Front lifted up and slightly back with texture, short sides.", "textured quiff|modern quiff", "top 3.5in scissor texturize up; sides #2; fade taper mid #1-#2; neck tapered; finish matte:clay", "Blow-dry the front up; clay for a matte finish.", "sw"],
    ["Skin Fade Quiff", "Quiff with a skin fade for sharper contrast.", "faded quiff|quiff fade", "top 3.5in scissor texturize up; sides #0; fade skin mid #0-#2; neck faded-out; finish matte:clay", "Skin fade; lift the front.", "sw"],
    ["Long Quiff", "Quiff with extra length and movement at the front.", "big quiff", "top 5in scissor point-cut up; sides #3; fade taper low #2-#3; neck tapered; finish natural:cream", "Keep length at the front; layer the back of the top.", "sw"],
    ["Brush Up", "Short top brushed straight up with texture.", "brushed up|brush-up", "top 2.5in scissor texturize up; sides #0.5; fade low low #0.5-#2; neck tapered", "Brush up while blow-drying; light paste.", "sw"],
    ["Undercut", "Long top over sides and back clippered short, disconnected with no blend.", "disconnected undercut|undercut haircut", "top 4in scissor natural; sides #1; back #1 disconnected; neck natural", "Clipper the sides and back to one guard; no blending to the top.", "sw"],
    ["Slicked Back Undercut", "Disconnected undercut with the long top slicked back.", "slick back undercut", "top 5in scissor back; sides #1; back #1 disconnected; neck natural; finish shine:pomade", "Comb back with pomade; sharp disconnection.", "sw"],
    ["Side Part Undercut", "Disconnected undercut with the top combed into a side part.", "parted undercut", "top 4in scissor side-part-left; sides #0.5; back #0.5 disconnected; neck natural", "Part on the natural side; comb across.", "sw"],
    ["Fringe Undercut", "Disconnected undercut with the top falling forward as a fringe.", "undercut fringe", "top 4in scissor point-cut forward; sides #1.5; back #1.5 disconnected; neck natural", "Point-cut the fringe; rough-dry forward.", "sw"],
    ["Textured Undercut", "Undercut with a choppy, textured top.", "messy undercut", "top 3.5in scissor texturize point-cut natural; sides #2; back #2 disconnected; neck natural; finish matte:clay", "Deep point-cut; clay.", "swc"],
  ],
  "curly-and-textured": [
    ["Curly Top Taper", "Natural curls left on top with a mid taper on the sides.", "curly taper|curls with taper", "top 3in scissor natural; sides #2; fade taper mid #0.5-#2; neck tapered; hair curly", "Cut curls dry, curl by curl; leave shape round.", "c"],
    ["Curly Low Fade", "Defined curls on top with a low fade.", "curly fade low", "top 3in scissor natural; sides #0.5; fade low low #0.5-#2; neck tapered; hair curly", "Low fade; define curls with cream.", "c"],
    ["Curly High Skin Fade", "Curls on top with a high skin fade for strong contrast.", "curly high fade", "top 2.5in scissor natural; sides #0; fade skin high #0-#2; neck faded-out; hair curly", "High skin fade; shape the curls into a rounded top.", "ck"],
    ["Curly Burst Fade", "Curls with a burst fade around the ears and length at the nape.", "curls burst fade", "top 3in scissor natural; sides #3; fade burst low #0-#2; neck natural; hair curly", "Burst around the ears only.", "ck"],
    ["Curly Drop Fade", "Curly top with a drop fade curving down behind the ears.", "curls drop fade", "top 3in scissor natural; sides #0; fade drop mid #0-#2; neck faded-out; hair curly", "Follow the head shape with the drop.", "ck"],
    ["Curly Fringe", "Curls falling forward as a fringe with a low fade.", "curly bangs|curly crop", "top 3in scissor point-cut forward; sides #0.5; fade low low #0.5-#2; neck tapered; hair curly", "Leave the front longest; scrunch forward.", "c"],
    ["Curly Undercut", "Longer curls on top over a disconnected short undercut.", "undercut curls", "top 4in scissor natural; sides #1; back #1 disconnected; neck natural; hair curly", "Keep the curl length; sharp disconnection.", "c"],
    ["Curly Quiff", "Curls lifted up at the front with tapered sides.", "curly pompadour", "top 3.5in scissor up; sides #2; fade taper mid #1-#2; neck tapered; hair curly; finish natural:curl-cream", "Diffuse upward at the front.", "c"],
    ["Curly Side Part", "Curls styled to one side from a soft part.", "curls side part", "top 3in scissor side-part-left; sides #3; fade taper low #1-#3; neck tapered; hair curly", "Soft part; leave curls defined.", "c"],
    ["Curly Slick Back", "Longer curls pushed back off the face.", "curls pushed back", "top 4in scissor back; sides #3; fade taper mid #1-#3; neck tapered; hair curly; finish shine:gel", "Push back with a light hold gel; don't flatten the curl.", "c"],
    ["Curly Bowl Cut", "Rounded curly shape all around.", "curly mushroom", "methods scissor; top 4in scissor natural; sides 2in scissor-over-comb; neck rounded; hair curly", "Cut dry to a rounded silhouette.", "c"],
    ["Curly Mullet", "Short curly sides and top with longer curls at the back.", "mullet curls", "top 2.5in scissor natural; sides #2; fade taper low #1-#2; neck natural; burns short tapered; hair curly", "Leave 3 to 5 inches of curls at the back.", "c"],
    ["Curly Shag", "Layered, choppy curls with volume all around.", "shaggy curls", "methods scissor; top 4in scissor razor point-cut natural; sides 3in scissor-over-comb; neck natural; hair curly", "Heavy layering; curls left loose.", "c"],
    ["Curly Curtains", "Longer curls parted in the middle and falling to the sides.", "curly middle part", "top 4in scissor middle-part; sides 2in scissor-over-comb; neck natural; hair curly", "Middle part; leave length around the face.", "c"],
    ["Curly Faux Hawk", "Curls pushed toward the center with shorter sides.", "curly fohawk", "top 3in scissor up; sides #1; fade mid mid #1-#2; neck tapered; hair curly", "Shape the curls into a center ridge.", "c"],
    ["Short Curly Taper", "Short natural curls all over with a tidy taper.", "short curls", "top 1.5in scissor natural; sides #2; neck tapered; burns short tapered; hair curly", "Even short curls; taper the edges.", "ck"],
    ["Wavy Textured Cut", "Natural waves left with texture and soft, scissor-cut sides.", "wavy haircut|textured waves", "top 3in scissor texturize natural; sides 1in scissor-over-comb; neck natural; hair wavy", "Thin out bulk; let the wave fall.", "w"],
    ["Textured Perm Top", "Permed curls on top with a mid taper.", "mens perm|perm top", "top 3in scissor point-cut natural; sides #1; fade taper mid #1-#2; neck tapered; hair curly; finish natural:curl-cream", "Cut after the perm settles; keep curl length.", "sw"],
  ],
  "afros-waves-twists-and-locs": [
    ["Afro with Part", "Short afro with a shaved hard part.", "afro hard part|parted afro", "top 1.5in scissor freehand side-part-left; sides #2; fade taper low #1-#2; line natural; neck tapered; hair coily; tex afro", "Razor the part after shaping the afro.", "k"],
    ["Twist Out", "Defined curls from unravelled two-strand twists.", "twistout|twist-out curls", "top 3in scissor natural; sides #2; fade taper low #1-#2; neck tapered; hair coily; tex twists twist-out", "Twist on damp hair, dry fully, then unravel.", "k"],
    ["Flat Twists", "Twists lying flat against the scalp in rows.", "flat twist|two strand flat twists", "top 4in freehand back; neck natural; hair coily; tex twists flat parts:straight-back", "Twist flat along the part, adding hair as you go.", "k"],
    ["Bantu Knots", "Small coiled knots across the head.", "bantu knot|zulu knots", "top 3in freehand natural; neck natural; hair coily; tex twists bantu-knots parts:triangle", "Even sections; coil each one around itself.", "k"],
    ["Semi-Freeform Locs", "Locs that are separated and lightly guided, without full retwists.", "semi freeform|semi-freeform dreads", "top 6in freehand natural; neck natural; hair coily; tex locs semi-freeform", "Separate roots, palm-roll only when needed.", "k"],
    ["Fishbone Cornrows", "Cornrows angled in a fishbone pattern toward the center.", "fishbone braids|herringbone cornrows", "top 4in freehand back; neck natural; hair coily; tex braids cornrows parts:fishbone", "Angle each row toward a center braid.", "ck"],
    ["Short Afro", "Short, rounded natural afro with a clean line-up.", "twa|teeny weeny afro|short natural", "top 1.5in scissor freehand natural; sides #3; line natural; neck natural; hair coily; tex afro", "Pick out evenly; shape round with scissors.", "k"],
    ["Medium Afro", "Mid-length afro picked out into a round shape.", "medium natural|afro", "top 3in scissor freehand natural; sides 2in scissor-over-comb; neck natural; hair coily; tex afro", "Shape round; keep the sides balanced with the top.", "k"],
    ["Large Afro", "Full, long afro shaped with scissors and a pick.", "big afro|full afro", "methods scissor,freehand; top 5in scissor freehand natural; sides 4in; neck natural; hair coily; tex afro", "Pick out fully before shaping.", "k"],
    ["Tapered Afro", "Afro on top with a low taper at the sides and nape.", "afro taper|taper afro", "top 3in scissor freehand natural; sides #2; fade taper low #1-#3; neck tapered; hair coily; tex afro", "Taper the edges; round the top.", "k"],
    ["Afro Skin Fade", "Rounded afro over a mid skin fade.", "afro fade|afro with skin fade", "top 3in scissor freehand natural; sides #0; fade skin mid #0-#2; neck faded-out; hair coily; tex afro", "Fade first, then shape the afro.", "k"],
    ["Afro Burst Fade", "Afro with a burst fade around the ears.", "burst afro", "top 3in scissor freehand natural; sides #3; fade burst low #0-#2; neck natural; hair coily; tex afro", "Burst around the ears, nape full.", "k"],
    ["Afro Drop Fade", "Afro with a drop fade curving down behind the ears.", "drop afro", "top 3in scissor freehand natural; sides #0; fade drop mid #0-#2; neck faded-out; hair coily; tex afro", "Drop behind the ears; shape the afro round.", "k"],
    ["Blowout Taper", "Blown-out top with a temple taper and a crisp line-up.", "blowout|temple taper blowout", "top 3in freehand up; sides #3; fade temple low #0-#2; line natural; hair coily; finish natural:blow-dry", "Blow-dry out, then shape; line up the front.", "ck"],
    ["High Top Fade", "Tall flat top over a high skin fade.", "high top|hi-top fade", "top 3in clipper freehand up; sides #0; fade skin high #0-#1; neck squared; line squared; hair coily; tex afro", "Pick up, cut the top flat and level, square corners.", "k"],
    ["360 Waves", "Short cut brushed into waves all around the head.", "360s|wave cut|waves", "top #1 clipper; sides #1; line natural; neck natural; tex waves brush-daily", "Cut with the grain; brush daily and wear a durag.", "ck"],
    ["180 Waves", "Waves brushed in at the front only.", "front waves|180s", "top #1.5 clipper; sides #1.5; line natural; neck natural; tex waves front-only", "Brush forward and down at the front; let the back stay natural.", "ck"],
    ["Wave Taper", "Waves on top with a low taper to keep the edges clean.", "waves taper", "top #1.5 clipper; sides #1; fade taper low #0.5-#1.5; line natural; neck tapered; tex waves", "Keep top length even for the pattern.", "ck"],
    ["Waves with Skin Fade", "Waves on top with a skin fade.", "wave fade|waves skin fade", "top #1 clipper; sides #0; fade skin mid #0-#1; line natural; neck faded-out; tex waves", "Don't fade too high or the pattern gets cut off.", "ck"],
    ["Wolfing Waves", "Grown-out waves left longer to deepen the pattern.", "wolfing|wolf waves", "top 0.5in clipper; sides #2; neck natural; tex waves grow-out", "Only line up and tidy; let the top grow.", "ck"],
    ["Sponge Twists", "Short coils twisted with a sponge, with a mid taper.", "sponge curls|twist sponge", "top 2in scissor natural; sides #1; fade taper mid #0.5-#2; neck tapered; hair coily; tex twists sponge", "Leave 1.5 to 2 inches; sponge in circles.", "k"],
    ["Twists with Skin Fade", "Twists on top with a skin fade on the sides.", "twist fade|twists fade", "top 3in scissor natural; sides #0; fade skin mid #0-#2; neck faded-out; hair coily; tex twists", "Fade, then twist the top.", "k"],
    ["Two-Strand Twists", "Defined twists made from two strands, medium length.", "two strand twists|twists", "top 4in scissor natural; sides #3; fade taper low #1-#3; neck natural; hair coily; tex twists two-strand parts:square", "Square parts; twist with cream.", "k"],
    ["Comb Coils", "Small coils made with a comb on short natural hair.", "finger coils|comb twists", "top 2in scissor natural; sides #2; fade taper low #1-#2; neck tapered; hair coily; tex coils comb-coil", "Coil each section from root to tip.", "k"],
    ["Starter Locs", "First stage of locs from coils or twists on short hair.", "baby locs|starter dreads", "top 2in scissor natural; sides #2; fade taper low #1-#2; neck tapered; hair coily; tex locs starter parts:square", "Even parts; don't wash too often in the first weeks.", "k"],
    ["Freeform Locs", "Locs formed naturally without parting or retwisting.", "freeform dreads|organic locs", "top 6in freehand natural; neck natural; hair coily; tex locs freeform", "Separate occasionally; no retwist.", "k"],
    ["Microlocs", "Many very small locs from tiny, precise parts.", "micro locs|micro dreads", "top 5in freehand natural; neck natural; hair coily; tex locs micro parts:small-grid", "Small grid parts; interlock maintenance.", "k"],
    ["Loc Retwist", "Maintenance retwist of existing locs at the new growth.", "retwist|loc maintenance", "top 6in freehand natural; neck natural; hair coily; tex locs retwist palm-roll", "Palm-roll new growth; clip each loc while drying.", "k"],
    ["Interlocked Locs", "Locs maintained by interlocking the new growth with a tool.", "interlocking|interlock locs", "top 6in freehand natural; neck natural; hair coily; tex locs interlock", "Interlock at the root; no product build-up.", "k"],
    ["Loc Taper", "Locs on top with a low taper on the sides.", "locs taper|dread taper", "top 5in freehand natural; sides #2; fade taper low #0.5-#2; neck tapered; hair coily; tex locs retwist", "Taper the edges, retwist the top.", "k"],
    ["Loc Skin Fade", "Locs on top with a mid skin fade.", "locs fade|dreads skin fade", "top 5in freehand natural; sides #0; fade skin mid #0-#2; neck faded-out; hair coily; tex locs", "Fade, then neaten the loc line.", "k"],
    ["Loc Burst Fade", "Locs with a burst fade around the ears.", "locs burst|dread burst", "top 5in freehand natural; sides #3; fade burst low #0-#2; neck natural; hair coily; tex locs", "Burst around the ears; locs over the nape.", "k"],
    ["High Top Locs", "Locs gathered high on top with high faded sides.", "high top dreads", "top 5in freehand up; sides #0; fade skin high #0-#1; neck faded-out; hair coily; tex locs", "Fade high; locs stand up or tie up.", "k"],
    ["Loc Mohawk", "Locs in a strip down the center with short sides.", "dread mohawk|loc hawk", "top 6in freehand up; sides foil razor; fade skin mid #0-#1; neck faded-out; hair coily; tex locs", "Shave or fade the sides; locs in the center strip.", "k"],
    ["Barrel Twist Locs", "Locs twisted together in large barrel twists.", "barrel twists|loc barrel twist", "top 6in freehand back; neck natural; hair coily; tex locs barrel-twist", "Twist groups of locs together toward the back.", "k"],
    ["Two-Strand Loc Twists", "Locs paired and twisted together in two strands.", "loc twists|twisted locs", "top 6in freehand natural; neck natural; hair coily; tex locs two-strand-twist", "Pair locs evenly; twist down.", "k"],
    ["Loc Updo", "Locs gathered up into a bun or knot on top.", "loc bun|dread updo", "top 8in freehand up; neck natural; hair coily; tex locs updo", "Secure with a soft tie; keep tension low.", "k"],
    ["Loc Ponytail", "Locs pulled back into a ponytail at the crown or nape.", "dread ponytail|locs tied back", "top 8in freehand back; neck natural; hair coily; tex locs ponytail", "Tie loosely; vary the position to protect edges.", "k"],
    ["Crochet Locs", "Instant locs created with a crochet hook.", "instant locs|crochet dreads", "top 4in freehand natural; neck natural; hair coily; tex locs crochet", "Crochet each section until firm.", "k"],
    ["Box Braids", "Individual braids from square parts.", "individual braids|singles", "top 4in freehand natural; neck natural; hair coily; tex braids box parts:square", "Even square parts; light tension at the edges.", "ck"],
    ["Cornrows", "Braids close to the scalp in straight-back rows.", "cornrow braids|straight backs", "top 4in freehand back; neck natural; hair coily; tex braids cornrows parts:straight-back", "Clean straight parts; braid tight but not painful.", "ck"],
    ["Cornrows with Fade", "Cornrows on top with low faded sides.", "braids with fade|cornrow fade", "top 4in freehand back; sides #0.5; fade low low #0.5-#2; neck tapered; hair coily; tex braids cornrows parts:straight-back", "Fade first; braid the top straight back.", "ck"],
    ["Stitch Braids", "Cornrows with neat horizontal stitch marks along each braid.", "stitch cornrows", "top 4in freehand back; neck natural; hair coily; tex braids stitch parts:straight-back", "Use the nail to make even stitches.", "ck"],
    ["Zigzag Cornrows", "Cornrows with zigzag parts.", "zig zag braids|zigzag part braids", "top 4in freehand back; neck natural; hair coily; tex braids cornrows parts:zigzag", "Draw the zigzag parts with the comb tail first.", "ck"],
    ["Two Feed-In Braids", "Two thick feed-in braids running back.", "two braids|double braids", "top 4in freehand back; neck natural; hair coily; tex braids feed-in parts:middle", "Middle part; feed in hair gradually.", "ck"],
    ["Braids with Burst Fade", "Braids on top with a burst fade around the ears.", "burst fade braids", "top 4in freehand back; sides #3; fade burst low #0-#2; neck natural; hair coily; tex braids cornrows", "Burst around the ears; braid back.", "ck"],
    ["Cornrow Man Bun", "Cornrows braided up into a bun at the crown.", "braided bun|cornrow bun", "top 6in freehand up; neck natural; hair coily; tex braids cornrows bun", "Braid upward toward the crown; bun.", "ck"],
  ],
  "mohawks-mullets-and-alternative": [
    ["Mohawk", "Sides shaved with a long strip of hair down the center, spiked up.", "mohican|mohawk haircut", "top 5in scissor up; sides foil razor; neck natural; finish matte:gel", "Shave the sides; spike the strip with strong gel.", "swck"],
    ["Short Mohawk", "Short center strip over shaved or faded sides.", "mini mohawk|short hawk", "top 1.5in scissor texturize up; sides #0; fade skin mid #0-#1; neck faded-out", "Keep the strip about two fingers wide.", "swck"],
    ["Mohawk Taper", "Mohawk strip with tapered, not shaved, sides.", "taper mohawk", "top 3in scissor up; sides #2; fade taper mid #1-#2; neck tapered", "Taper the sides; keep the strip defined.", "swck"],
    ["Faux Hawk", "Top pushed to a center ridge with shorter faded sides, no shaving.", "fohawk|euro hawk", "top 3in scissor texturize up; sides #0.5; fade mid mid #0.5-#2; neck tapered; finish matte:paste", "Push sides of the top toward the center.", "swc"],
    ["Burst Fade Mohawk", "Burst fade around the ears with a mohawk strip on top.", "burst mohawk", "top 2.5in scissor up; sides #3; fade burst mid #0-#2; neck natural", "Burst around the ears; the strip runs to the nape.", "swck"],
    ["Frohawk", "Afro-textured hair shaped into a mohawk.", "afro mohawk|fro hawk", "top 3in freehand up; sides #0; fade skin mid #0-#2; neck faded-out; hair coily; tex afro", "Pick up the center and shape it.", "k"],
    ["Liberty Spikes", "Long center hair set into tall separate spikes.", "punk spikes", "top 8in scissor up; sides foil razor; neck natural; finish matte:strong-gel", "Set each spike with strong gel and a dryer.", "sw"],
    ["Classic Mullet", "Short on the front and sides, long at the back.", "mullet|business in front", "top 2in scissor; sides #3 scissor-over-comb; neck natural; burns mid natural", "Leave 4 to 6 inches at the back.", "sw"],
    ["Modern Mullet", "Textured mullet with a burst fade and a forward top.", "burst fade mullet|modern mullet fade", "top 2.5in scissor texturize forward; sides #3; fade burst low #0-#2; neck natural", "Burst around the ears; keep the back length.", "swc"],
    ["Taper Mullet", "Mullet with a low taper instead of a burst.", "tapered mullet", "top 3in scissor texturize natural; sides #2; fade taper low #0.5-#2; neck natural", "Taper the sides; long at the back.", "swc"],
    ["Skin Fade Mullet", "Mullet with high skin-faded sides for contrast.", "high fade mullet", "top 2.5in scissor texturize forward; sides #0; fade skin high #0-#2; neck natural", "Fade the sides high; leave the back long.", "swc"],
    ["Mohawk Mullet", "Mohawk strip on top that carries into a long mullet back.", "mohawk mullet|mohullet", "top 3in scissor up; sides #0; fade burst high #0-#2; neck natural", "Connect the strip to the long back.", "swc"],
    ["Wolf Cut", "Shaggy layered cut between a mullet and a shag.", "wolfcut|shullet", "methods scissor,razor; top 4in razor point-cut natural; sides 2in; neck natural", "Heavy choppy layers; volume at the crown.", "swc"],
    ["Rat Tail", "Short cut with a thin tail of long hair left at the nape.", "rattail|tail cut", "top 1.5in scissor; sides #2; fade taper mid #1-#2; neck natural", "Leave a narrow tail at the center nape.", "swck"],
    ["Side Undercut", "One side shaved short, the other side and top left longer.", "one side undercut|asymmetric undercut", "top 4in scissor side-part-right; left #0.5; right #6; back #2 visible-line; neck natural", "Shave one side only, from the part down.", "sw"],
  ],
  "medium-and-long": [
    ["Long Slick Back", "Long hair combed straight back with a polished finish.", "long slicked back hair", "top 6in scissor back; sides 4in scissor-over-comb; neck natural; finish shine:pomade", "Comb back with pomade; tuck behind the ears.", "sw"],
    ["Middle Part Undercut", "Curtain middle part over a disconnected undercut.", "e-boy haircut|curtains undercut", "top 4in scissor point-cut middle-part; sides #2; back #2 disconnected; neck natural", "Middle part; short undercut beneath.", "sw"],
    ["Shoulder-Length Layers", "Layered hair to the shoulders for movement and lighter weight.", "shoulder length|layered long hair", "methods scissor; top 6in scissor point-cut natural; sides 5in; neck natural", "Long layers; keep the perimeter weight.", "swc"],
    ["Long Layered Hair", "Long hair past the shoulders with long layers.", "long hair men|long layers", "methods scissor; top 10in scissor point-cut natural; sides 9in; neck natural", "Trim ends; long layers for shape.", "swc"],
    ["Long Wavy Layers", "Longer waves layered to show the natural movement.", "long waves", "methods scissor; top 7in scissor point-cut natural; sides 6in; neck natural; hair wavy", "Cut dry or damp; don't over-thin waves.", "w"],
    ["Surfer Hair", "Medium tousled hair with a beachy, messy finish.", "beach hair|messy medium hair", "top 5in scissor texturize natural; sides 3in scissor-over-comb; neck natural; hair wavy; finish matte:sea-salt-spray", "Salt spray, rough-dry.", "sw"],
    ["Flow", "Medium-long hair swept back that flows out at the nape.", "hockey flow|bro flow|lettuce", "top 5in scissor back; sides 3in scissor-over-comb; neck natural; burns mid natural", "Keep weight at the back; blow-dry back.", "sw"],
    ["Curtains", "Middle-parted medium hair falling to both sides of the face.", "curtain haircut|middle part|90s curtains", "top 4in scissor point-cut middle-part; sides 2in scissor-over-comb; neck natural", "Middle part; soften the front with point-cutting.", "sw"],
    ["Shag", "Choppy layered medium cut with lots of texture.", "shag haircut|shaggy cut", "methods scissor,razor; top 5in scissor razor texturize point-cut natural; sides 3in; neck natural", "Razor the layers; matte texture.", "sw"],
    ["Long Curly Dry Cut", "Long curls cut dry, curl by curl, to shape the natural pattern.", "curl by curl cut|dry cut curls", "methods scissor; top 6in scissor natural; sides 5in; neck natural; hair curly", "Cut dry, one curl at a time.", "c"],
    ["Chin-Length Cut", "Medium hair cut to chin length, often tucked behind the ears.", "mens bob|chin length hair", "methods scissor; top 5in scissor natural; sides 4in scissor-over-comb; neck rounded", "One length to the chin; light layers.", "sw"],
    ["Long Side-Swept Cut", "Longer top swept to one side with medium sides.", "long side swept", "top 6in scissor point-cut side-part-left; sides 3in scissor-over-comb; neck natural", "Blow-dry across from the part.", "sw"],
    ["Man Bun", "Long hair tied back into a bun.", "manbun|bun", "top 8in scissor back; sides 7in; neck natural", "Keep length even enough to tie.", "swc"],
    ["Top Knot Undercut", "Long top tied into a knot over a short undercut.", "top knot|undercut man bun", "top 7in scissor back; sides #1; back #1 disconnected; neck natural", "Clipper the undercut; tie the top at the crown.", "swc"],
    ["Half-Up Bun", "Top section tied back in a small bun, rest left down.", "half up|half bun", "top 7in scissor back; sides 6in; neck natural; finish natural:leave-in", "Tie only the top section.", "swc"],
    ["Viking Braid Undercut", "Long braided top over shaved sides.", "viking braid|braided undercut", "top 8in freehand back; sides #0.5; back #0.5 disconnected; neck natural; tex braids single-plait", "Braid the top back from the forehead.", "sw"],
    ["Shaved Nape Undercut", "Long hair with a hidden undercut at the nape.", "nape undercut|hidden undercut", "top 6in scissor natural; sides 5in; back #1 disconnected; neck natural", "Clipper the nape under the long hair only.", "swc"],
  ],
  "specialty-and-custom": [
    ["Mustache Trim", "Mustache shaped and trimmed above the lip line.", "mustache shape|moustache trim", "beard #1 mustache", "Trim along the lip line; comb and shape.", "swck"],
    ["Clean Face Shave", "Hot-towel straight-razor face shave.", "hot towel shave|straight razor shave", "beard clean-shaven", "Hot towel, pre-shave oil, two passes, cold towel.", "swck"],
    ["Line-Up", "Sharp edge-up of the hairline, temples, sideburns and nape.", "edge up|shape up|lineup", "line squared; neck squared; burns short squared", "Trimmer and razor for crisp corners; follow the natural hairline.", "swck"],
    ["Receding Hairline Line-Up", "Line-up that follows a receding hairline without pushing it back.", "natural recession line up", "line recessed-follow; neck natural; burns short natural", "Never cut past the natural hairline.", "swck"],
    ["Freehand Hair Design", "Custom freehand artwork cut into a fade.", "hair art|freestyle design|hair tattoo", "sides #0; fade skin low #0-#1; top 1in scissor; neck faded-out", "Sketch with a trimmer, refine with a razor.", "swck"],
    ["Geometric Line Design", "Straight-line geometric pattern cut into the sides.", "line design|parallel lines", "sides #1; fade low low #0.5-#1; top 1.5in scissor; neck tapered", "Measure spacing; keep lines parallel.", "swck"],
    ["Double Hard Part", "Two shaved part lines for a bold detail.", "two hard parts|double part", "top 2.5in scissor side-part-left; sides #0.5; fade mid mid #0.5-#2; line natural; neck tapered", "Space the two lines evenly.", "swck"],
    ["V-Shaped Neckline Cut", "Nape finished in a sharp V shape.", "v neckline|v cut nape", "top 2in scissor; sides #1; fade low low #0.5-#2; neck faded-out; back #1 visible-line", "Mark the V from the center nape.", "swck"],
    ["Beard Shape-Up", "Clean outline of the beard and cheek lines.", "beard line up|beard edge up", "beard lineup", "Line the cheek and neck lines; keep length.", "swck"],
    ["Full Beard Sculpt", "Full beard trimmed and shaped with a faded transition.", "beard sculpt|beard trim", "beard #3 lineup blend full", "Fade the sideburn into the beard; shape the bottom.", "swck"],
    ["Short Boxed Beard", "Short beard with crisp, squared lines.", "boxed beard|corporate beard", "beard #2 lineup short-boxed", "Square the cheek and neck lines.", "swck"],
    ["Goatee Shape", "Chin and mustache shaped into a clean goatee.", "goatee|van dyke", "beard #1 lineup goatee", "Clean the cheeks; define the chin.", "swck"],
    ["Eyebrow Slit", "One or two thin shaved lines in the eyebrow.", "eyebrow cut|brow slits", "line natural", "Mark with a pencil; shave lightly with a trimmer.", "swck"],
  ],
};

export const HAIRSTYLE_CATALOG: CatalogStyle[] = Object.entries(ROWS).flatMap(([category, rows]) =>
  rows.map(([name, description, aliases, spec, notes, suits]) => ({
    slug: slugify(name), name, category: category as CatalogCategory, description,
    aliases: aliases.split("|").map((a) => a.trim()).filter(Boolean),
    spec: { ...catalogSpec(spec, notes), custom: { suits: [...suits].map((s) => SUITS[s as keyof typeof SUITS]).join(", ") } },
    suits: [...suits].map((s) => SUITS[s as keyof typeof SUITS]),
  })));
