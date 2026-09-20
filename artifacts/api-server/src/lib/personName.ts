/**
 * Normalises a person's name typed on a kiosk keyboard (which is all capitals).
 * Single-case input ("ZED", "mary-ann o'brien") becomes Title Case; a name that
 * already mixes cases ("McDonald", "DeShawn") was typed deliberately and is kept.
 */
export function normalizePersonName(raw: string | null | undefined): string {
  const collapsed = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  const hasUpper = /\p{Lu}/u.test(collapsed);
  const hasLower = /\p{Ll}/u.test(collapsed);
  if (hasUpper && hasLower) return collapsed;
  return collapsed
    .toLocaleLowerCase()
    .replace(/(^|[\s\-'’.])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase());
}
