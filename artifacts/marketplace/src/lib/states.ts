/**
 * Shared between entry-server.tsx (SSR) and App.tsx (client render) so both
 * build /listings/{city}--{state} URLs the same way. Was previously defined
 * only in entry-server.tsx; App.tsx's own "Nearby salons → See all" link
 * built the state part directly from the raw 2-letter code (salon.state,
 * e.g. "va") instead of expanding it to the full name first — the actual
 * /listings/:citySlug--:stateSlug route only recognizes full-name slugs
 * (e.g. "virginia", per salonData.ts's toStateSlug(stateName) on the
 * backend), so every one of those links 404'd. Import STATE_NAMES here and
 * expand before slugifying, exactly as entry-server.tsx already did
 * correctly.
 */
export const STATE_NAMES: Record<string, string> = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California", CO:"Colorado",
  CT:"Connecticut", DE:"Delaware", FL:"Florida", GA:"Georgia", HI:"Hawaii", ID:"Idaho",
  IL:"Illinois", IN:"Indiana", IA:"Iowa", KS:"Kansas", KY:"Kentucky", LA:"Louisiana",
  ME:"Maine", MD:"Maryland", MA:"Massachusetts", MI:"Michigan", MN:"Minnesota", MS:"Mississippi",
  MO:"Missouri", MT:"Montana", NE:"Nebraska", NV:"Nevada", NH:"New Hampshire", NJ:"New Jersey",
  NM:"New Mexico", NY:"New York", NC:"North Carolina", ND:"North Dakota", OH:"Ohio", OK:"Oklahoma",
  OR:"Oregon", PA:"Pennsylvania", RI:"Rhode Island", SC:"South Carolina", SD:"South Dakota",
  TN:"Tennessee", TX:"Texas", UT:"Utah", VT:"Vermont", VA:"Virginia", WA:"Washington",
  WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming", DC:"Washington DC",
};

export const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Full state name for a 2-letter code, falling back to the input unchanged if it's already a full name or unrecognized. */
export const stateNameFor = (stateCodeOrName: string) => STATE_NAMES[stateCodeOrName] || stateCodeOrName;
