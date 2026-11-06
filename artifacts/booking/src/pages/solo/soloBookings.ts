/**
 * The Solo dashboard's calendar data, read the way the Certxa Pro app reads it (contexts/BookingContext.tsx):
 * the owner's own bookings from the app's API (lib/soloApi.ts), priced and labelled the same.
 */
import type { QueryClient } from "@tanstack/react-query";
import { dayOf, minutesIn } from "./soloTime";

export type ApiAppointment = {
  id: number; date: string; duration: number | null; status: string | null; notes?: string | null;
  visitAt?: string | null; clientAddress?: { line1?: string; line2?: string; city?: string; state?: string; postcode?: string } | null;
  travelFee?: number | null; paymentStatus?: string | null; calendarHidden?: boolean | null; depositCollected?: number | null;
  customLines?: { label?: string; price?: number }[] | null; appointmentAddons?: { addon?: { name?: string; price?: number } }[] | null;
  totalPaid?: number | null; refundedCents?: number | null;
  customer?: { id?: number; name?: string | null; phone?: string | null; email?: string | null } | null;
  service?: { id?: number | null; name?: string | null; price?: number | null } | null;
};

export type Booking = {
  id: number;
  dateIso: string;
  day: string;
  /** Minutes after the business day's midnight it starts. */
  start: number;
  duration: number;
  /** "paid" for a completed booking (as the app shows it). */
  status: string;
  name: string;
  service: string;
  serviceId: number | null;
  customerId: number | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  /** The whole visit: service, add-ons, further services and a house call's travel fee. */
  amountCents: number;
  travelFeeCents: number;
  depositDue: boolean;
  depositPaidCents: number;
  paidCents: number | null;
  lines: { label: string; cents: number }[];
  address: string | null;
};

const cents = (n: unknown) => Math.round((Number(n ?? 0) || 0) * 100);

export function toBooking(a: ApiAppointment, tz: string): Booking {
  const addons = (a.appointmentAddons ?? []).map((r) => ({ label: String(r?.addon?.name ?? "Add-on"), cents: cents(r?.addon?.price) }));
  const extras = (Array.isArray(a.customLines) ? a.customLines : []).filter((l) => l?.label).map((l) => ({ label: String(l.label), cents: cents(l.price) }));
  const travelFeeCents = cents(a.travelFee);
  const serviceCents = cents(a.service?.price);
  const amountCents = serviceCents + addons.reduce((s, l) => s + l.cents, 0) + extras.reduce((s, l) => s + l.cents, 0) + travelFeeCents;
  const others = [...extras, ...addons];
  const addr = a.visitAt === "client" && a.clientAddress?.line1
    ? [a.clientAddress.line1, a.clientAddress.line2, a.clientAddress.city, [a.clientAddress.state, a.clientAddress.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : null;
  return {
    id: a.id,
    dateIso: new Date(a.date).toISOString(),
    day: dayOf(a.date, tz),
    start: minutesIn(a.date, tz),
    duration: Number(a.duration) > 0 ? Number(a.duration) : 60,
    status: a.status === "completed" ? "paid" : a.status || "pending",
    name: a.customer?.name || "Walk-in",
    service: a.service?.name || "Service",
    serviceId: a.service?.id ?? null,
    customerId: a.customer?.id ? a.customer.id : null,
    phone: a.customer?.phone ?? null,
    email: a.customer?.email ?? null,
    notes: a.notes ?? null,
    amountCents,
    travelFeeCents,
    depositDue: a.paymentStatus === "awaiting_payment",
    depositPaidCents: a.paymentStatus === "awaiting_payment" ? 0 : cents(a.depositCollected),
    paidCents: a.totalPaid != null ? cents(a.totalPaid) - Number(a.refundedCents ?? 0) : null,
    lines: others.length || travelFeeCents
      ? [{ label: a.service?.name || "Service", cents: serviceCents }, ...others, ...(travelFeeCents ? [{ label: "Travel fee", cents: travelFeeCents }] : [])]
      : [],
    address: addr,
  };
}

/** A booking paid in full by its deposit is "done", not paid again (the app's prepaid rule). */
export const isPrepaid = (b: Booking) => b.depositPaidCents > 0 && b.depositPaidCents >= b.amountCents;
export const isOpen = (b: Booking) => !["paid", "cancelled", "no_show"].includes(b.status);

export const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** After any change: every Solo page reads fresh (Home's "Taken today" too). */
export const refreshSolo = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ["solo"] });
