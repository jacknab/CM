/**
 * A name or address line written the way the U.S. Postal Service reads it best through an envelope window (owner,
 * 2026-10-24): capitals, no punctuation, single spaces, and the standard USPS abbreviations for street suffixes,
 * directions and unit types (Publication 28). "1825 Logan Street, Apartment #305" → "1825 LOGAN ST APT 305";
 * "Denver, CO 80203" → "DENVER CO 80203".
 */
const ABBREVIATIONS: Record<string, string> = {
  // street suffixes
  AVENUE: "AVE", BOULEVARD: "BLVD", CIRCLE: "CIR", COURT: "CT", DRIVE: "DR", EXPRESSWAY: "EXPY", FREEWAY: "FWY",
  HIGHWAY: "HWY", LANE: "LN", PARKWAY: "PKWY", PLACE: "PL", PLAZA: "PLZ", ROAD: "RD", SQUARE: "SQ", STREET: "ST",
  TERRACE: "TER", TRAIL: "TRL", WAY: "WAY", ALLEY: "ALY", CROSSING: "XING", POINT: "PT",
  // directions
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW",
  // unit types
  APARTMENT: "APT", SUITE: "STE", BUILDING: "BLDG", FLOOR: "FL", UNIT: "UNIT", ROOM: "RM", DEPARTMENT: "DEPT",
  "P.O.": "PO",
};

/** The street line: capitals, no punctuation, USPS abbreviations. */
export function postalStreet(text: string | null | undefined): string {
  if (!text) return "";
  let s = String(text).toUpperCase();
  s = s.replace(/\bP\.?\s*O\.?\s+BOX\b/g, "PO BOX");
  // "#305" on its own after a unit word ("APT #305") just loses the sign; a bare "#305" stays as "# 305" per USPS.
  s = s.replace(/\b(APT|APARTMENT|STE|SUITE|UNIT|RM|ROOM)\s*#\s*/g, "$1 ");
  s = s.replace(/#\s*/g, "# ");
  s = s.replace(/[.,;:'"()]/g, " ");
  s = s.replace(/\s+-\s+/g, " ");
  const words = s.split(/\s+/).filter(Boolean).map((w) => ABBREVIATIONS[w] ?? w);
  return words.join(" ");
}

/** A name or the city line: capitals, no punctuation, single spaces — words are never abbreviated
 *  ("North Las Vegas" stays NORTH LAS VEGAS). A hyphen or apostrophe inside a word ("Smith-Jones", "O'Neil", ZIP+4) is kept. */
export function postalPlain(text: string | null | undefined): string {
  if (!text) return "";
  return String(text).toUpperCase().replace(/[.,;:"()#]/g, " ").replace(/\s+-\s+/g, " ").split(/\s+/).filter(Boolean).join(" ");
}
