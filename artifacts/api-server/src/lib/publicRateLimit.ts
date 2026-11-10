/**
 * Which /api/public requests are a booking page's read-only loads (index.ts gives them their own, larger rate limit).
 * Paths are relative to /api/public. Only GET/HEAD: booking, house-call checks, waitlist sign-ups, shop orders and
 * every other write keep the stricter limit.
 */
const PUBLIC_BOOKING_READS =
  /^\/(?:store\/[^/]+(?:\/(?:services|team|reviews|gallery|service-reviews|shop|service-pages|staff|availability|available-days|pro-pricing|pro-times|ai-site))?|booking-payment-policy\/[^/]+)\/?$/;

export function isPublicBookingRead(method: string, path: string): boolean {
  return (method === "GET" || method === "HEAD") && PUBLIC_BOOKING_READS.test(path);
}
