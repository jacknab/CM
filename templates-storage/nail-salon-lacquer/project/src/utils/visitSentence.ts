/**
 * The Visit Us sentence (owner, 2026-11-07): one of a few equivalent ones, picked by the salon's name, so the same
 * sentence isn't on every salon's site.
 */
export function visitSentence(salonName: string, canBookOnline: boolean): string {
  const on = [
    'Walk-ins welcome based on availability, but booking ahead guarantees your spot.',
    'Book online to hold your time, or stop by and we will fit you in when we can.',
    'Plan your visit with the hours and map below, then book a time that suits you.',
    'Use the map for directions, and book ahead online to skip the wait.',
    'Stop in when you are nearby, or book online in a few taps.',
  ];
  const off = [
    'Online booking is not available here, so please call ahead to confirm services and opening times.',
    'Call the salon before you visit to check today\u2019s openings and the services you would like.',
    'Give the salon a call to confirm details, or use the map below to find your way.',
    'Questions about a service or today\u2019s hours? Call the salon before you stop by.',
    'Use the map below for directions, and call ahead to confirm the services you need.',
  ];
  const list = canBookOnline ? on : off;
  let h = 0;
  for (const ch of salonName) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}
