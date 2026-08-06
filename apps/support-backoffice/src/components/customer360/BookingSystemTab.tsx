import { useQuery } from "@tanstack/react-query";
import {
  Calendar, Users, Wrench, Link2, TrendingUp,
  CheckCircle2, XCircle, AlertTriangle, Clock,
  ExternalLink, Copy, DollarSign,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";

interface BookingData {
  bookingSlug: string | null;
  stats: {
    total_30d: number;
    completed_30d: number;
    cancelled_30d: number;
    no_show_30d: number;
    upcoming: number;
    revenue_30d: number;
  };
  recentAppointments: {
    id: number;
    date: string;
    status: string;
    total_paid: number | null;
    payment_method: string | null;
    service_name: string | null;
    staff_name: string | null;
    client_name: string | null;
  }[];
  upcomingAppointments: {
    date: string;
    service_name: string | null;
    staff_name: string | null;
    client_name: string | null;
  }[];
  services: { count: number; active: number };
  staff: { count: number };
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  completed:  { label: "Completed",  cls: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 size={10} /> },
  confirmed:  { label: "Confirmed",  cls: "bg-indigo-100 text-indigo-700",   icon: <CheckCircle2 size={10} /> },
  pending:    { label: "Pending",    cls: "bg-amber-100 text-amber-700",     icon: <Clock size={10} /> },
  cancelled:  { label: "Cancelled",  cls: "bg-red-100 text-red-700",         icon: <XCircle size={10} /> },
  "no-show":  { label: "No-Show",    cls: "bg-rose-100 text-rose-700",       icon: <AlertTriangle size={10} /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: "bg-slate-100 text-slate-600", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.cls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export default function BookingSystemTab({ accountId }: { accountId: number }) {
  const { data, isLoading, error } = useQuery<BookingData>({
    queryKey: ["booking-tab", accountId],
    queryFn: () => api.accounts.booking(accountId),
    staleTime: 60_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-48 text-sm text-slate-400">
      Failed to load booking data
    </div>
  );

  const { stats, recentAppointments, upcomingAppointments, services, staff, bookingSlug } = data;
  const completionRate = stats.total_30d > 0
    ? Math.round((stats.completed_30d / stats.total_30d) * 100) : 0;
  const noShowRate = stats.total_30d > 0
    ? Math.round((stats.no_show_30d / stats.total_30d) * 100) : 0;
  const bookingUrl = bookingSlug ? `https://book.certxa.com/${bookingSlug}` : null;

  return (
    <div className="p-6 space-y-5 max-w-6xl">

      {/* ── KPI Strip ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: "Appts (30d)",   value: stats.total_30d,     icon: <Calendar size={15} />,     color: "text-indigo-600",  bg: "bg-indigo-50" },
          { label: "Completed",     value: stats.completed_30d,  icon: <CheckCircle2 size={15} />, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Cancelled",     value: stats.cancelled_30d,  icon: <XCircle size={15} />,      color: "text-red-600",     bg: "bg-red-50" },
          { label: "No-Shows",      value: stats.no_show_30d,    icon: <AlertTriangle size={15} />,color: "text-amber-600",   bg: "bg-amber-50" },
          { label: "Upcoming",      value: stats.upcoming,       icon: <Clock size={15} />,        color: "text-sky-600",     bg: "bg-sky-50" },
          { label: "Revenue (30d)", value: `$${stats.revenue_30d.toFixed(0)}`, icon: <DollarSign size={15} />, color: "text-violet-600", bg: "bg-violet-50" },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`w-7 h-7 rounded-lg ${m.bg} flex items-center justify-center ${m.color} mb-2`}>
              {m.icon}
            </div>
            <div className="text-xl font-bold text-slate-800">{m.value}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left: Config card ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Booking Configuration</h3>
            </div>
            <div className="p-4 space-y-3">
              {/* Booking URL */}
              {bookingUrl ? (
                <div className="bg-indigo-50 rounded-xl p-3">
                  <div className="text-[10px] text-indigo-600 font-semibold mb-1.5 uppercase tracking-wide">Booking URL</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-700 flex-1 truncate">{bookingUrl}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(bookingUrl)}
                      className="p-1.5 text-indigo-500 hover:bg-indigo-100 rounded transition"
                      title="Copy"
                    >
                      <Copy size={12} />
                    </button>
                    <a href={bookingUrl} target="_blank" rel="noreferrer"
                      className="p-1.5 text-indigo-500 hover:bg-indigo-100 rounded transition"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-700">No booking URL configured</p>
                </div>
              )}

              {[
                { label: "Active Services",  value: `${services.active} of ${services.count}` },
                { label: "Active Staff",     value: String(staff.count) },
                { label: "Completion Rate",  value: `${completionRate}%` },
                { label: "No-Show Rate",     value: `${noShowRate}%` },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-xs text-slate-500">{row.label}</span>
                  <span className="text-xs font-semibold text-slate-700">{row.value}</span>
                </div>
              ))}

              {/* Rate bars */}
              <div className="pt-1">
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-slate-400">Completion rate</span>
                  <span className="text-[10px] font-semibold text-emerald-600">{completionRate}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${completionRate}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Upcoming Appointments</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Next 5 scheduled</p>
            </div>
            <div className="divide-y divide-slate-50">
              {upcomingAppointments.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <Calendar size={20} className="text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No upcoming appointments</p>
                </div>
              ) : upcomingAppointments.map((a, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <Calendar size={14} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{a.client_name ?? "Unknown Client"}</p>
                    <p className="text-[10px] text-slate-500 truncate">{a.service_name ?? "—"} · {a.staff_name ?? "—"}</p>
                    <p className="text-[10px] text-indigo-600 font-medium mt-0.5">
                      {format(parseISO(a.date), "MMM d, h:mm a")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Recent Appointments ─────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Recent Appointments</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Last 15 records</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Completed</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Cancelled</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> No-Show</span>
            </div>
          </div>
          {recentAppointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Calendar size={32} className="text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">No appointment history</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Date & Time</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Service</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Staff</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide text-right">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentAppointments.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {format(parseISO(a.date), "MMM d, h:mm a")}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium text-slate-800 max-w-[120px] truncate">
                        {a.client_name ?? <span className="text-slate-400 italic">Unknown</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[120px] truncate">
                        {a.service_name ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[100px] truncate">
                        {a.staff_name ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium text-slate-700 text-right tabular-nums">
                        {a.total_paid != null ? `$${Number(a.total_paid).toFixed(2)}` : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
