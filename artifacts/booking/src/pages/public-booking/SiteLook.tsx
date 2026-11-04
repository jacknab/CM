/**
 * The business's own look on its booking page (<slug>.certxa.com), set in the Certxa Pro app's website setup:
 * accent colour, cover photo, profile photo or logo, about text, Instagram and Facebook. Every theme uses these:
 *  - siteStyle(): CSS variables on the theme's root. --primary recolours the Tailwind primary colour (Simple,
 *    Classic); --site-accent / --site-accent-dark are used where a theme has its own colours (Bloom, Mobile).
 *  - <SiteHeader>: a slim bar with the photo, name, city, Instagram and Facebook for the themes that have no header
 *    of their own (owner, 2026-11-04: phones first, no cover banner).
 */
import type { CSSProperties } from "react";
import { Facebook, Instagram } from "lucide-react";
import type { BookingSiteLook, StoreData } from "./types";

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

function hslTriple([r, g, b]: [number, number, number]): string {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function darker([r, g, b]: [number, number, number]): string {
  const f = (v: number) => Math.round(v * 0.82).toString(16).padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}

/** CSS variables for the business's accent colour; nothing when it hasn't picked one. */
export function siteStyle(site: BookingSiteLook | null | undefined): CSSProperties {
  const rgb = site?.accent ? hexToRgb(site.accent) : null;
  if (!rgb) return {};
  const light = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.65;
  return {
    ["--site-accent" as any]: site!.accent,
    ["--site-accent-dark" as any]: darker(rgb),
    ["--primary" as any]: hslTriple(rgb),
    ["--primary-foreground" as any]: light ? "0 0% 10%" : "0 0% 100%",
  };
}

export function facebookUrl(site: BookingSiteLook | null | undefined): string | null {
  // Saved as a page name or "profile.php?id=123" (routes/bookingSite.ts checks it).
  const page = site?.facebook ?? "";
  return /^[A-Za-z0-9.\-]{1,80}$/.test(page) || /^profile\.php\?id=\d{1,30}$/.test(page) ? `https://facebook.com/${page}` : null;
}

export function instagramUrl(site: BookingSiteLook | null | undefined): string | null {
  return site?.instagram ? `https://instagram.com/${encodeURIComponent(site.instagram)}` : null;
}

/** Cover photo, profile photo or logo, name, about text and Instagram, at the top of the page. */
export function SiteHeader({ store }: { store: StoreData }) {
  const site = store.bookingSite ?? {};
  const insta = instagramUrl(site);
  const fb = facebookUrl(site);
  const place = [store.city, store.state].filter(Boolean).join(", ");
  return (
    <>
      {/* Stays at the top. On phones the body's own 56px top padding (index.css) makes the room; larger screens use the spacer. */}
      <header data-testid="site-header" className="fixed inset-x-0 top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2.5 px-4">
          {site.logoImage ? <img src={site.logoImage} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold leading-tight text-gray-900">{store.name}</h1>
            {place ? <p className="truncate text-xs text-gray-500">{place}</p> : null}
          </div>
          {insta ? <a href={insta} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="grid h-10 w-10 shrink-0 place-items-center text-gray-700"><Instagram className="h-5 w-5" /></a> : null}
          {fb ? <a href={fb} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="grid h-10 w-10 shrink-0 place-items-center text-gray-700"><Facebook className="h-5 w-5" /></a> : null}
        </div>
      </header>
      <div className="hidden h-14 md:block" aria-hidden="true" />
    </>
  );
}
