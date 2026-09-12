/**
 * tenant-page-urls.ts
 *
 * Stable, zero-migration slug helpers for auto-mode service/team subpages.
 *
 * Neither `services` nor `staff` has a `slug` column, and the plan explicitly
 * discourages adding schema just for SEO pages. Instead we use an id-prefixed
 * slug (e.g. "42-gel-x-manicure") — the same pattern Stripe/Airbnb/Etsy use for
 * URLs. The numeric id is authoritative; the trailing text is cosmetic. If a
 * service/staff name changes, the old URL keeps resolving (no 404, no
 * duplicate page) because only the id after the leading digits is read.
 */

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";
}

export function idSlugPath(id: number, name: string): string {
  return `${id}-${slugify(name)}`;
}

/** Parses the leading numeric id out of a path segment like "42-gel-x-manicure". Returns null if absent/invalid. */
export function parseIdFromSlugParam(param: string | undefined | null): number | null {
  if (!param) return null;
  const match = /^(\d+)/.exec(param);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}
