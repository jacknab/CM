/**
 * A salon website's facts as plain readable text inside <div id="root">, sent with the page before the template's
 * JavaScript runs — what crawlers that don't run JavaScript read. The template's React app clears #root when it first
 * draws, so visitors see the website exactly as before. Same idea as the booking pages' summary (salonSeo.ts).
 *
 * Only what the salon's records hold: name, city and state (street only when public — tenant-data.ts already blanks a
 * private one), phone, hours, public services and prices. Nothing for a test salon or a website whose store is gone.
 */
import type { TenantData } from "./tenant-data";
import { TEST_STORE_IDS } from "./salonSitemap";
import { displayPhone, toE164 } from "./tenant-seo";

export const SITE_SUMMARY_ATTR = "data-site-summary";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** As the Bloom template shows a time: "9:00 AM", "7:30 PM". */
function formatTime(t: string): string {
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10), m = parseInt(mm ?? "0", 10);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function siteSummaryHtml(td: TenantData, storeId: number): string {
  const b = td.business;
  if (!b?.name?.trim() || TEST_STORE_IDS.has(storeId)) return "";

  const cityState = [b.city?.trim(), b.state?.trim()].filter(Boolean).join(", ");
  const where = [b.address?.trim(), cityState, b.postcode?.trim()].filter(Boolean).join(", ");
  const phone = displayPhone(b.phone) || "";
  const tel = toE164(b.phone);

  // Monday first, as the template lists them.
  const hours = [...td.hours]
    .sort((x, y) => (x.day_of_week || 7) - (y.day_of_week || 7))
    .filter((h) => DAY_NAMES[h.day_of_week] && (h.is_closed || (h.open_time && h.close_time)))
    .map((h) => `<li>${DAY_NAMES[h.day_of_week]}: ${h.is_closed ? "Closed" : `${formatTime(h.open_time)} – ${formatTime(h.close_time)}`}</li>`);

  // Services by category, in the salon's category order; a price only when it is set (the template shows "$45").
  const groups: { name: string | null; items: string[] }[] = [];
  const byCat = new Map<number | null, string[]>();
  let priced = false;
  for (const s of td.services) {
    const price = typeof s.price === "string" ? parseFloat(s.price) : s.price;
    if (price > 0) priced = true;
    const li = `<li>${esc(s.name)}${price > 0 ? ` — $${price}` : ""}</li>`;
    const key = td.serviceCategories.some((c) => c.id === s.category_id) ? s.category_id : null;
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(li);
  }
  for (const c of td.serviceCategories) if (byCat.has(c.id)) groups.push({ name: c.name, items: byCat.get(c.id)! });
  if (byCat.has(null)) groups.push({ name: null, items: byCat.get(null)! });
  const services = groups.map((g) => g.name && groups.length > 1
    ? `<h3>${esc(g.name)}</h3><ul>${g.items.join("")}</ul>`
    : `<ul>${g.items.join("")}</ul>`).join("");

  return `<main ${SITE_SUMMARY_ATTR} style="max-width:720px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
<h1>${esc(b.name.trim())}</h1>
${phone ? `<p>Call ${tel ? `<a href="tel:${esc(tel)}">${esc(phone)}</a>` : esc(phone)}</p>` : ""}
${where ? `<h2>Location</h2><p>${esc(where)}</p>` : ""}
${hours.length ? `<h2>Hours</h2><ul>${hours.join("")}</ul>` : ""}
${services ? `<h2>Services${priced ? " and prices" : ""}</h2>${services}` : ""}
</main>`;
}
