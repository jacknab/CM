/**
 * Solo dashboard › Home (owner, 2026-11-06): the Certxa Pro app's Home on the website — a greeting, what was taken
 * today, what needs an answer, the next appointment and today's appointments. Everything in the business's time zone
 * and only the owner's own calendar; the data and rules are the app's (lib/soloApi.ts → routes/certxaPro.ts), so
 * POS quick sales (kept off the calendar) count in "Taken today" too.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { Loader2 } from "lucide-react";
import { soloApi } from "@/lib/soloApi";
import { SOLO_COLORS, useSolo } from "./SoloLayout";

type Ticket = {
  id: number; date: string; duration: number | null; status: string | null;
  totalPaid?: number | string | null; refundedCents?: number | null; calendarHidden?: boolean | null;
  customer?: { name?: string | null } | null; service?: { name?: string | null } | null;
};
type BookingRequest = { id: number; status: string; clientName: string; serviceName: string; startsAt: string };
type Conversation = { clientPhone: string; clientName: string | null; lastMessage: string; lastMessageAt: string; unreadCount: number };

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pretty = (n: string) => { const d = n.replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n; };
const STATUS_TEXT: Record<string, string> = { completed: "Paid", paid: "Paid", started: "In progress", pending: "Booked", confirmed: "Booked", cancelled: "Cancelled", no_show: "No-show" };
const DONE = ["completed", "paid", "no_show"];

function dayRange(now: Date, tz: string) {
  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const from = fromZonedTime(`${today}T00:00:00`, tz);
  const next = new Date(`${today}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const to = new Date(fromZonedTime(`${next.toISOString().slice(0, 10)}T00:00:00`, tz).getTime() - 1);
  return { today, from, to };
}
const minutesOf = (d: Date | string, tz: string) => {
  const [h, m] = formatInTimeZone(new Date(d), tz, "H:m").split(":").map(Number);
  return h * 60 + m;
};

export default function SoloHome() {
  const { store, user } = useSolo();
  const tz = store.timezone || "America/Los_Angeles";
  // Ticks each minute so "next up" moves on and the greeting follows the time of day.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const { today, from, to } = dayRange(now, tz);

  const tickets = useQuery<Ticket[]>({
    queryKey: ["solo", "today", store.id, today],
    queryFn: () => soloApi<Ticket[]>(`/api/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
    refetchInterval: 60_000,
  });
  const requests = useQuery<BookingRequest[]>({
    queryKey: ["solo", "booking-requests", store.id],
    queryFn: () => soloApi<BookingRequest[]>("/api/booking-requests"),
    refetchInterval: 60_000,
  });
  const conversations = useQuery<Conversation[]>({
    queryKey: ["solo", "sms-inbox", store.id],
    queryFn: () => soloApi<Conversation[]>("/api/sms-inbox/conversations"),
    refetchInterval: 60_000,
  });

  const rows = Array.isArray(tickets.data) ? tickets.data : [];
  const nowMinutes = minutesOf(now, tz);
  const hour = Math.floor(nowMinutes / 60);
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = typeof user.firstName === "string" ? user.firstName.trim() : "";

  const paid = rows.filter((t) => t.status === "completed" || t.status === "paid");
  const takenCents = paid.reduce((sum, t) => sum + Math.round(Number(t.totalPaid ?? 0) * 100) - Number(t.refundedCents ?? 0), 0);
  const appointments = useMemo(() => rows
    .filter((t) => !t.calendarHidden && t.status !== "cancelled")
    .sort((a, b) => +new Date(a.date) - +new Date(b.date)), [rows]);
  const nextUp = appointments.find((t) => !DONE.includes(String(t.status)) && minutesOf(t.date, tz) + Number(t.duration ?? 60) > nowMinutes);
  const left = appointments.filter((t) => !DONE.includes(String(t.status))).length;

  const waiting = (Array.isArray(requests.data) ? requests.data : [])
    .filter((r) => r.status === "requested").sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const unread = (Array.isArray(conversations.data) ? conversations.data : [])
    .filter((c) => c.unreadCount > 0).sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));
  const attention = [
    ...waiting.slice(0, 5).map((r) => ({
      key: `r${r.id}`, title: `Booking request · ${r.clientName}`,
      sub: `${r.serviceName} · ${formatInTimeZone(new Date(r.startsAt), tz, "EEE, MMM d")}, ${formatInTimeZone(new Date(r.startsAt), tz, "h:mm a")}`,
    })),
    ...unread.slice(0, 5).map((c) => ({
      key: `t${c.clientPhone}`, title: `${c.unreadCount > 1 ? `${c.unreadCount} texts` : "Text"} from ${c.clientName || pretty(c.clientPhone)}`,
      sub: c.lastMessage,
    })),
  ];

  const card = "rounded-2xl border bg-white";
  const border = { borderColor: SOLO_COLORS.border };
  const time = (d: string) => formatInTimeZone(new Date(d), tz, "h:mm a");
  const name = (t: Ticket) => t.customer?.name || "Walk-in";

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 md:px-8 md:pt-10">
      <p className="text-[11px] font-bold tracking-[0.12em]" style={{ color: SOLO_COLORS.primary }}>
        {formatInTimeZone(now, tz, "EEEE, MMMM d").toUpperCase()}
      </p>
      <h1 className="mt-1 text-[28px] font-semibold tracking-tight">{greeting}{firstName ? `, ${firstName}` : ""}</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl p-5 text-white" style={{ background: SOLO_COLORS.primary }} data-testid="solo-takings">
            <p className="text-xs font-semibold opacity-85">Taken today</p>
            <p className="mt-1 text-[32px] font-bold tracking-tight">{tickets.isLoading ? "—" : money(takenCents)}</p>
            <p className="mt-1.5 text-xs font-medium opacity-85">
              {paid.length} paid {paid.length === 1 ? "visit" : "visits"} · {left} {left === 1 ? "appointment" : "appointments"} still to go
            </p>
          </section>

          {nextUp && (
            <section className={`${card} p-4`} style={border} data-testid="solo-next-up">
              <p className="text-[10px] font-bold tracking-[0.14em]" style={{ color: SOLO_COLORS.primary }}>NEXT UP</p>
              <p className="mb-1 mt-1.5 text-[22px] font-bold">{time(nextUp.date)}</p>
              <p className="text-sm font-semibold">{name(nextUp)}</p>
              <p className="mt-0.5 text-xs" style={{ color: SOLO_COLORS.muted }}>{nextUp.service?.name || "Appointment"} · {Number(nextUp.duration ?? 60)} min</p>
            </section>
          )}

          <h2 className="pt-3 text-base font-semibold">Today's appointments</h2>
          {tickets.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : tickets.error ? (
            <p className="text-sm text-red-600">{(tickets.error as Error).message}</p>
          ) : appointments.length === 0 ? (
            <div className={`${card} flex min-h-[110px] items-center justify-center text-sm`} style={{ ...border, color: SOLO_COLORS.muted }}>Nothing booked today.</div>
          ) : (
            <ul className={`${card} divide-y overflow-hidden`} style={border} data-testid="solo-appointments">
              {appointments.map((t) => {
                const done = t.status === "completed" || t.status === "paid";
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3" style={{ borderColor: SOLO_COLORS.border }}>
                    <span className="w-[72px] shrink-0 text-[13px] font-bold" style={{ color: nextUp?.id === t.id ? SOLO_COLORS.primary : SOLO_COLORS.text }}>{time(t.date)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{name(t)}</p>
                      <p className="truncate text-xs" style={{ color: SOLO_COLORS.muted }}>{t.service?.name || "Appointment"}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${done ? "bg-[#EDE7FB] text-[#5B21B6]" : "bg-[#F2F1F7] text-[#6B6F86]"}`}>
                      {STATUS_TEXT[String(t.status)] ?? "Booked"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {attention.length > 0 && (
          <aside className="min-w-0">
            <h2 className="mb-2.5 text-base font-semibold">Needs your attention</h2>
            <ul className={`${card} divide-y overflow-hidden`} style={border} data-testid="solo-attention">
              {attention.map((item) => (
                <li key={item.key} className="flex items-center gap-3 px-4 py-3" style={{ borderColor: SOLO_COLORS.border }}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SOLO_COLORS.primary }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <p className="truncate text-xs" style={{ color: SOLO_COLORS.muted }}>{item.sub}</p>
                  </div>
                </li>
              ))}
            </ul>
            {(waiting.length > 5 || unread.length > 5) && (
              <p className="mt-2 text-xs" style={{ color: SOLO_COLORS.muted }}>
                {waiting.length > 5 ? `${waiting.length} requests` : ""}{waiting.length > 5 && unread.length > 5 ? " · " : ""}{unread.length > 5 ? `${unread.length} unread conversations` : ""}
              </p>
            )}
            <p className="mt-2 text-xs" style={{ color: SOLO_COLORS.muted }}>Answer these in the Certxa Pro app.</p>
          </aside>
        )}
      </div>
    </div>
  );
}
