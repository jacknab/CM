import { useQuery } from "@tanstack/react-query";
import { supportApi, type BookingOverview } from "@/lib/support-api";
import { format, parseISO } from "date-fns";
import { Calendar, CheckCircle2, XCircle, UserX, Clock, DollarSign, Scissors, Users, ExternalLink } from "lucide-react";

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  completed:  { label: "Completed",  color: "text-emerald-700", bg: "bg-emerald-50" },
  cancelled:  { label: "Cancelled",  color: "text-red-700",     bg: "bg-red-50"     },
  "no-show":  { label: "No-Show",    color: "text-orange-700",  bg: "bg-orange-50"  },
  pending:    { label: "Pending",    color: "text-blue-700",    bg: "bg-blue-50"    },
  confirmed:  { label: "Confirmed",  color: "text-indigo-700",  bg: "bg-indigo-50"  },
  serving:    { label: "Serving",    color: "text-violet-700",  bg: "bg-violet-50"  },
  checked_in: { label: "Checked In", color: "text-teal-700",    bg: "bg-teal-50"    },
};

function fmtDate(d: string) {
  try { return format(parseISO(d), "MMM d, yyyy h:mm a"); } catch { return d; }
}
function fmtShort(d: string) {
  try { return format(parseISO(d), "MMM d, h:mm a"); } catch { return d; }
}

interface Props { accountId: number; bookingSlug: string | null }

export default function BookingSystemTab({ accountId, bookingSlug }: Props) {
  const { data, isLoading, error } = useQuery<BookingOverview>({
    queryKey: ["support-booking", accountId],
    queryFn: () => supportApi.accounts.booking(accountId),
    staleTime: 60_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-slate-400 text-sm">Failed to load booking data.</p>
    </div>
  );

  const { stats, recentAppointments, upcomingAppointments, services, staff } = data;
  const slug = bookingSlug ?? data.bookingSlug;

  const kpis = [
    { icon: Calendar,      label: "Total (30d)",    value: stats.total_30d,     color: "text-indigo-600", bg: "bg-indigo-50" },
    { icon: CheckCircle2,  label: "Completed",      value: stats.completed_30d, color: "text-emerald-600",bg: "bg-emerald-50" },
    { icon: XCircle,       label: "Cancelled",      value: stats.cancelled_30d, color: "text-red-600",    bg: "bg-red-50"     },
    { icon: UserX,         label: "No-Shows",       value: stats.no_show_30d,   color: "text-orange-600", bg: "bg-orange-50"  },
    { icon: Clock,         label: "Upcoming",       value: stats.upcoming,      color: "text-blue-600",   bg: "bg-blue-50"    },
    { icon: DollarSign,    label: "Revenue (30d)",  value: `$${(stats.revenue_30d ?? 0).toFixed(2)}`, color: "text-violet-600", bg: "bg-violet-50" },
  ];

  return (
    <div className="p-6 space-y-5">

      {/* Booking URL */}
      {slug && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Booking URL:</span>
          <a
            href={`https://book.certxa.com/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-indigo-600 hover:underline font-medium"
          >
            book.certxa.com/{slug}
            <ExternalLink size={11} />
          </a>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-xl ${k.bg} p-3 flex flex-col gap-1`}>
            <k.icon size={14} className={k.color} />
            <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-slate-500 leading-tight">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left column: Upcoming + Counts */}
        <div className="space-y-4">

          {/* Service & Staff counts */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Catalog</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Scissors size={13} className="text-slate-400" />
                  Services
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-slate-800">{services.active}</span>
                  <span className="text-xs text-slate-400"> / {services.count} total</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Users size={13} className="text-slate-400" />
                  Active Staff
                </div>
                <span className="text-sm font-semibold text-slate-800">{staff.count}</span>
              </div>
            </div>
          </div>

          {/* Upcoming appointments */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Next Up ({upcomingAppointments.length})
            </h3>
            {upcomingAppointments.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No upcoming appointments</p>
            ) : (
              <div className="space-y-2.5">
                {upcomingAppointments.map((a, i) => (
                  <div key={i} className="text-xs border-l-2 border-indigo-200 pl-2.5 space-y-0.5">
                    <div className="font-medium text-slate-800">{a.client_name ?? "—"}</div>
                    <div className="text-slate-500">{a.service_name ?? "—"} · {a.staff_name ?? "—"}</div>
                    <div className="text-slate-400">{fmtShort(a.date)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right two-thirds: Recent appointments table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Recent Appointments (last 15)
            </h3>
          </div>
          {recentAppointments.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-xs text-slate-400">No appointments on record</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Date</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Client</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Service</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Staff</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-500">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentAppointments.map((a) => {
                    const cfg = statusConfig[a.status] ?? { label: a.status, color: "text-slate-600", bg: "bg-slate-50" };
                    return (
                      <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(a.date)}</td>
                        <td className="px-4 py-2.5 text-slate-700 font-medium">{a.client_name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-slate-600">{a.service_name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-slate-600">{a.staff_name ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.bg} ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-700 font-medium">
                          {a.total_paid != null ? `$${Number(a.total_paid).toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
