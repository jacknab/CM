/**
 * The /barber staff screens' short labels — English only (owner, 2026-11-02: /barber is not translated). The same
 * keys as /nail's i18n.ts, so the screens copied from /nail read their labels the same way.
 */
export type NailLang = "en";

const T = {
  // lock screen
  enter: "ENTER",
  mySlip: "MY SLIP",
  mySlipFirst: "MY SLIP — type your ID first",
  turnQueue: "Turn Queue",
  noneClockedIn: "No barbers clocked in",
  turn: "turn",
  turns: "turns",
  techId: "Barber ID",
  // bottom tabs
  queue: "Queue",
  techs: "Barbers",
  ticketNo: "Ticket#",
  checkIn: "Check-In",
  more: "More",
  connected: "Connected",
  offline: "Offline",
  sending: "Sending",
  needsAttention: "Needs attention",
  signInNeeded: "Sign in needed",
  storageProblem: "Storage problem",
  // technician cards
  inService: "IN SERVICE",
  assigned: "ASSIGNED",
  available: "AVAILABLE",
  onBreak: "ON BREAK",
  notClockedIn: "NOT CLOCKED IN",
  free: "FREE",
  clientWaiting: "CLIENT WAITING",
  inChair: "IN CHAIR",
  tapToClockIn: "Tap to clock in",
  clientsToday: "CLIENTS TODAY",
  currentService: "Current Service",
  nextUp: "Next Up",
  next: "NEXT",
  inTurn: "in turn",
  clockedOut: "Clocked Out",
  clockedInTab: "Clocked In",
  // ticket buttons
  start: "START",
  done: "DONE",
  assign: "ASSIGN",
  checkout: "PAY", // the ticket popup button (was CHECKOUT, owner 2026-10-30)
  reassign: "REASSIGN",
  ticket: "TICKET",
  textReady: "TEXT READY",
  cancel: "CANCEL",
  // checkout
  cash: "CASH",
  card: "CARD",
  giftCard: "GIFT CARD",
  services: "SERVICES",
  payCheckout: "PAY / CHECKOUT",
  back: "BACK",
  exit: "EXIT",
  subtotal: "SUBTOTAL",
  discount: "DISCOUNT",
  tax: "TAX",
  tip: "TIP",
  total: "TOTAL",
  balanceDue: "BALANCE DUE",
  changeDue: "CHANGE DUE",
  paidInFull: "PAID IN FULL",
  paid: "PAID ✓",
  saving: "SAVING…",
} as const;

export type NailTextKey = keyof typeof T;

/** The labels, in English. */
export function useNailText() {
  const t = (key: NailTextKey): string => T[key];
  return { lang: "en" as NailLang, t, setLang: (_next: NailLang) => {} };
}
