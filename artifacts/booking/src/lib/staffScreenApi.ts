/**
 * The staff-screen routes for the screen this page is (2026-11-02): /barber reaches the shared ticket engine through
 * /api/barber/… and the server lets a barbershop in only that way (nailTickets.staffScreenAllowed); /nail and the
 * rest use /api/nail/…. Code shared by both screens builds its addresses with this — calling /api/nail/… from a
 * barbershop was refused ("This staff screen is not available for this store"), so the manager PIN 2026 read as wrong.
 */
export function staffApi(path: string): string {
  const onBarber = typeof window !== "undefined" && /^\/barber(\/|$)/.test(window.location?.pathname ?? "");
  return `${onBarber ? "/api/barber" : "/api/nail"}${path.startsWith("/") ? path : `/${path}`}`;
}
