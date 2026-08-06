import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ArrowRight, CheckCircle2 } from "lucide-react";
import { StaffPortalNav } from "@/components/StaffPortalNav";
import { format, parseISO, addDays, differenceInDays } from "date-fns"
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type DayBreakdown  = { date: string; total: number; tips: number; count: number };
type PayPeriodData = {
  periodStart: string; periodEnd: string;
  label: string; todayStr: string;
  periodTotals: { total: string; tips: string; commission: string; serviceIncome: string; appointments: number };
  todayTotals:  { total: string; tips: string; count: number };
  dailyBreakdown: DayBreakdown[];
};
type StaffProfile = { id: number; name: string | null; avatarUrl: string | null; color: string | null; commissionRate?: number | null };
type AvailabilityRule = { id?: number; dayOfWeek: number; startTime: string; endTime: string };
type CommStruct   = { commissionRate: number; serviceStaff: number; serviceSalon: number; cardTipChargePercent: number };
type HourSlot     = { hour: number; label: string; amount: number; cumulative: number | null };
type StatsData    = {
  todayAppointments: Array<{ id: number; date: string; status: string; totalPaid: string | null; tipAmount: string | null; paymentMethod?: string | null; clientName: string; serviceName: string }>;
  serviceBreakdown:  Array<{ name: string; revenue: number; count: number }>;
  hourlyEarnings:    HourSlot[];
  personalRecords:   { bestDayEarnings: number; bestDayDate: string; bestWeekEarnings: number; mostServicesInDay: number; mostServicesDate: string };
  lifetimeSummary:   { totalEarnings: number; totalServices: number; totalCardTips: number; memberSince: string | null };
  comparison:        { lastWeekTotal: number; prevWeekTotal: number; changePercent: number | null };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt$ = (n: string | number | undefined) =>
  `$${parseFloat(String(n ?? "0")).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtK = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

function computeStreak(breakdown: DayBreakdown[], todayStr: string) {
  if (!breakdown.length) return 0;
  const sorted = [...breakdown].sort((a, b) => b.date.localeCompare(a.date));
  let s = 0, expected = todayStr;
  for (const d of sorted) {
    if (d.date !== expected) break;
    if (d.count > 0) { s++; try { expected = format(addDays(parseISO(expected), -1), "yyyy-MM-dd"); } catch { break; } }
    else break;
  }
  return s;
}

function getPayday(periodEnd: string) {
  try {
    const pd   = addDays(parseISO(periodEnd), 1);
    const now  = new Date(); now.setHours(0, 0, 0, 0);
    return { label: format(pd, "EEEE MMMM d"), days: differenceInDays(pd, now) };
  } catch { return { label: "—", days: 0 }; }
}

function statusPill(status: string) {
  if (status === "completed")   return { label: "Completed",   bg: "#dcfce7", fg: "#15803d" };
  if (status === "in_progress") return { label: "In Progress", bg: "#fef9c3", fg: "#a16207" };
  if (status === "cancelled")   return { label: "Cancelled",   bg: "#fee2e2", fg: "#b91c1c" };
  return { label: "Upcoming", bg: "#e0e7ff", fg: "#4338ca" };
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function Bar({ v, max, color }: { v: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (v / max) * 100) : 0;
  return (
    <div className="h-[6px] rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ── Tab: Performance ──────────────────────────────────────────────────────────

function PerformanceTab({
  streak, periodTotal, periodCnt, todayTotal, pp, stats, color
}: {
  streak: number; periodTotal: number; periodCnt: number; todayTotal: number;
  pp: PayPeriodData | undefined; stats: StatsData | undefined; color: string;
}) {
  const navigate = useNavigate();
  const [cardView, setCardView] = useState<"records" | "achievements" | "services" | "tips">("records");
  const dateRange = pp ? `${format(parseISO(pp.periodStart), "MMM d")} – ${format(parseISO(pp.periodEnd), "MMM d")}` : "";
  const periodGoal = periodTotal >= 1000 ? 2000 : periodTotal >= 500 ? 1000 : 500;

  const achievements = [
    { emoji: "💵", label: "$100 Today",     done: todayTotal  >= 100 },
    { emoji: "🔥", label: "5-Day Streak",   done: streak      >= 5   },
    { emoji: "💎", label: "$500 Period",    done: periodTotal >= 500  },
    { emoji: "🌟", label: "$1K Period",     done: periodTotal >= 1000 },
    { emoji: "⚡", label: "10-Day Streak",  done: streak      >= 10  },
    { emoji: "👑", label: "$1K Career",     done: (stats?.lifetimeSummary?.totalEarnings ?? 0) >= 1000 },
    { emoji: "✂️", label: "25 Services",    done: (stats?.lifetimeSummary?.totalServices  ?? 0) >= 25  },
    { emoji: "🏆", label: "$200 Today",     done: todayTotal  >= 200 },
  ];
  const unlocked = achievements.filter(a => a.done).length;
  const totalServices = stats?.lifetimeSummary?.totalServices ?? 0;
  const lifetimeTotal = stats?.lifetimeSummary?.totalEarnings ?? 0;

  const goals = [
    { label: `Reach ${fmtK(periodGoal)} this period`, current: periodTotal, max: periodGoal, emoji: "🎯", color: "#6366f1" },
    { label: "7-day streak",                            current: streak,      max: 7,          emoji: "🔥", color: "#f97316" },
    { label: "20 services this period",                 current: periodCnt,   max: 20,         emoji: "✂️", color: "#14b8a6" },
    { label: "Earn $100 today",                         current: todayTotal,  max: 100,        emoji: "💵", color: "#10b981" },
  ];

  const pr = stats?.personalRecords;
  const serviceRows = stats?.serviceBreakdown ?? [];
  const serviceTotal = serviceRows.reduce((s, r) => s + Number(r.revenue || 0), 0);
  const tipRows = stats?.todayAppointments ?? [];
  const cardMethods = new Set(["card", "debit", "credit", "stripe", "square", "terminal"]);
  const cashTips = tipRows.reduce((s, a) => {
    const tip = Number(a.tipAmount ?? 0);
    if (!tip) return s;
    return cardMethods.has((a.paymentMethod ?? "").toLowerCase()) ? s : s + tip;
  }, 0);
  const cardTips = tipRows.reduce((s, a) => {
    const tip = Number(a.tipAmount ?? 0);
    if (!tip) return s;
    return cardMethods.has((a.paymentMethod ?? "").toLowerCase()) ? s + tip : s;
  }, 0);
  const totalTips = cashTips + cardTips;
  const biggestTip = tipRows.reduce((m, a) => Math.max(m, Number(a.tipAmount ?? 0)), 0);
  const tippedCount = tipRows.filter((a) => Number(a.tipAmount ?? 0) > 0).length;
  const avgTip = tippedCount > 0 ? totalTips / tippedCount : 0;
  const tipPctOfSales = todayTotal > 0 ? (totalTips / todayTotal) * 100 : 0;

  const achievementRows = [
    {
      emoji: "🏆",
      label: "First $1,000 Week",
      done: (pr?.bestWeekEarnings ?? 0) >= 1000 || periodTotal >= 1000,
      progress: null as string | null,
    },
    {
      emoji: "💅",
      label: "100 Services",
      done: totalServices >= 100,
      progress: `${Math.min(totalServices, 100)}/100`,
    },
    {
      emoji: "🔥",
      label: "14 Day Streak",
      done: streak >= 14,
      progress: `${Math.min(streak, 14)}/14`,
    },
    {
      emoji: "⭐",
      label: "5-Star Tech",
      done: periodCnt >= 5,
      progress: `${Math.min(periodCnt, 5)}/5`,
    },
    {
      emoji: "💎",
      label: "$10,000 Lifetime",
      done: lifetimeTotal >= 10000,
      progress: `${Math.min(100, Math.round((lifetimeTotal / 10000) * 100))}%`,
    },
  ];

  return (
    <div className="space-y-5 pt-4">

      {/* Goals */}
      <div>
        <p className="text-[13px] font-black text-slate-400 uppercase tracking-widest mb-3">Goals · {dateRange}</p>
        <div className="bg-white rounded-2xl divide-y divide-slate-50">
          {goals.map(g => {
            const pct = Math.min(100, Math.round((g.current / g.max) * 100));
            return (
              <div key={g.label} className="px-4 py-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px]">{g.emoji}</span>
                    <span className="text-[14px] font-semibold text-slate-700">{g.label}</span>
                    {pct >= 100 && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">Done ✓</span>
                    )}
                  </div>
                  <span className="text-[13px] font-bold text-slate-400">{pct}%</span>
                </div>
                <Bar v={g.current} max={g.max} color={g.color} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Insight cards — one at a time to keep layout clean */}
      <div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { key: "records", label: "Records" },
            { key: "achievements", label: "Badges" },
            { key: "services", label: "Services" },
            { key: "tips", label: "Tips" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setCardView(opt.key as any)}
              className={cn(
                "rounded-xl py-2 text-xs font-extrabold border transition-all",
                cardView === opt.key
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {cardView === "records" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[20px]">🏅</span>
            <p className="text-[20px] font-black text-slate-800">Personal Records</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] text-slate-600 font-semibold">Best Day Ever</p>
                <p className="text-[12px] text-slate-400">{pr?.bestDayDate ? format(parseISO(pr.bestDayDate), "MMM d") : "—"}</p>
              </div>
              <p className="text-[28px] leading-none font-black text-slate-800">{fmtK(pr?.bestDayEarnings ?? 0)}</p>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] text-slate-600 font-semibold">Best Week Ever</p>
                <p className="text-[12px] text-slate-400">All time</p>
              </div>
              <p className="text-[28px] leading-none font-black text-slate-800">{fmtK(pr?.bestWeekEarnings ?? 0)}</p>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] text-slate-600 font-semibold">Most Services In One Day</p>
                <p className="text-[12px] text-slate-400">{pr?.mostServicesDate ? format(parseISO(pr.mostServicesDate), "MMM d") : "—"}</p>
              </div>
              <p className="text-[28px] leading-none font-black text-slate-800">{pr?.mostServicesInDay ?? 0}</p>
            </div>
          </div>
          <button className="mt-4 w-full rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-sm py-2.5 inline-flex items-center justify-center gap-1.5">
            View all records
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        )}

        {cardView === "achievements" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[20px]">🎁</span>
              <p className="text-[20px] font-black text-slate-800">Achievements</p>
            </div>
            <span className="text-xs font-bold text-slate-400">{unlocked}/{achievements.length}</span>
          </div>
          <div className="space-y-2.5">
            {achievementRows.map((a) => (
              <div key={a.label} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[18px] leading-none">{a.emoji}</span>
                  <span className="text-[15px] font-semibold text-slate-700 truncate">{a.label}</span>
                </div>
                {a.done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : a.progress ? (
                  <span className="shrink-0 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold px-2 py-0.5">
                    {a.progress}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <button className="mt-4 w-full rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-sm py-2.5 inline-flex items-center justify-center gap-1.5">
            View all badges
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        )}

        {cardView === "services" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[20px]">🧾</span>
              <p className="text-[20px] font-black text-slate-800">Service Breakdown</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-[130px] h-[130px] rounded-full relative shrink-0"
                style={{
                  background: serviceTotal > 0
                    ? `conic-gradient(${serviceRows.slice(0, 5).map((s, i) => {
                        const colors = ["#14b8a6", "#8b5cf6", "#eab308", "#ec4899", "#60a5fa"];
                        const start = serviceRows.slice(0, i).reduce((a, x) => a + (Number(x.revenue || 0) / serviceTotal) * 100, 0);
                        const end = start + (Number(s.revenue || 0) / serviceTotal) * 100;
                        return `${colors[i % colors.length]} ${start}% ${end}%`;
                      }).join(",")})`
                    : "#e2e8f0"
                }}>
                <div className="absolute inset-[18px] rounded-full bg-white flex flex-col items-center justify-center">
                  <p className="text-[30px] leading-none font-black text-slate-800">{fmt$(todayTotal)}</p>
                  <p className="text-[13px] text-slate-500 font-semibold">Today</p>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {serviceRows.slice(0, 5).map((s, i) => {
                  const colors = ["#14b8a6", "#8b5cf6", "#eab308", "#ec4899", "#60a5fa"];
                  const pct = serviceTotal > 0 ? Math.round((Number(s.revenue || 0) / serviceTotal) * 100) : 0;
                  return (
                    <div key={s.name} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                        <span className="font-semibold text-slate-700 truncate">{s.name}</span>
                      </div>
                      <span className="font-bold text-slate-800 shrink-0">{fmt$(s.revenue)} · {pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <button
              onClick={() => navigate("/staff-income")}
              className="mt-4 w-full rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-sm py-2.5 inline-flex items-center justify-center gap-1.5"
            >
              View all services
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {cardView === "tips" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[20px]">💰</span>
              <p className="text-[20px] font-black text-slate-800">Tip Summary</p>
            </div>
            <div className="space-y-2 text-[15px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-semibold">Cash Tips</span>
                <span className="font-black text-slate-800">{fmt$(cashTips)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-semibold">Card Tips</span>
                <span className="font-black text-slate-800">{fmt$(cardTips)}</span>
              </div>
              <div className="h-px bg-slate-100 my-2" />
              <div className="flex items-center justify-between">
                <span className="text-violet-600 font-bold">Total Tips</span>
                <span className="font-black text-violet-600 text-[24px] leading-none">{fmt$(totalTips)}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="rounded-xl border border-slate-200 p-2.5 text-center">
                <p className="text-[11px] text-slate-500 font-semibold">Biggest Tip</p>
                <p className="text-[22px] leading-none font-black text-violet-600 mt-1">{fmt$(biggestTip)}</p>
                <p className="text-[11px] text-slate-400 mt-1">Today</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-2.5 text-center">
                <p className="text-[11px] text-slate-500 font-semibold">Average Tip</p>
                <p className="text-[22px] leading-none font-black text-slate-800 mt-1">{fmt$(avgTip)}</p>
                <p className="text-[11px] text-slate-400 mt-1">Per Service</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-2.5 text-center">
                <p className="text-[11px] text-slate-500 font-semibold">Tip %</p>
                <p className="text-[22px] leading-none font-black text-slate-800 mt-1">{Math.round(tipPctOfSales)}%</p>
                <p className="text-[11px] text-slate-400 mt-1">Of Sales</p>
              </div>
            </div>
            <button
              onClick={() => navigate("/staff-history")}
              className="mt-4 w-full rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-sm py-2.5 inline-flex items-center justify-center gap-1.5"
            >
              View tip history
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

// ── Tab: Earnings ─────────────────────────────────────────────────────────────

function EarningsTab({
  pp, stats, cs, color, commRate
}: {
  pp: PayPeriodData | undefined;
  stats: StatsData | undefined;
  cs: CommStruct | undefined;
  color: string;
  commRate: number;
}) {
  const navigate = useNavigate();
  const periodTotal = parseFloat(pp?.periodTotals?.total      ?? "0");
  const periodTips  = parseFloat(pp?.periodTotals?.tips       ?? "0");
  const periodComm  = parseFloat(pp?.periodTotals?.commission ?? "0");
  const periodSvc   = parseFloat(pp?.periodTotals?.serviceIncome ?? "0");
  const periodCnt   = pp?.periodTotals?.appointments ?? 0;

  const todayTotal = parseFloat(pp?.todayTotals?.total ?? "0");
  const goal       = 150;

  const cmp    = stats?.comparison;
  const wkUp   = (cmp?.changePercent ?? 0) >= 0;

  return (
    <div className="space-y-5 pt-4">

      {/* This Pay Period */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-black text-slate-400 uppercase tracking-widest">This Pay Period</p>
          <button className="text-[13px] font-bold flex items-center gap-0.5 active:opacity-60" style={{ color }} onClick={() => navigate("/staff-income")}>
            Full report <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="bg-white rounded-2xl divide-y divide-slate-50">
          <div className="px-4 py-4 flex items-center justify-between">
            <span className="text-[14px] text-slate-500">Total Owed</span>
            <span className="text-[22px] font-black text-slate-900">{fmt$(periodTotal)}</span>
          </div>
          {[
            { label: "Commission", emoji: "💼", amount: periodComm, pct: periodTotal > 0 ? Math.round((periodComm/periodTotal)*100) : 0, barColor: "#6366f1" },
            { label: "Card Tips",  emoji: "💳", amount: periodTips, pct: periodTotal > 0 ? Math.round((periodTips/periodTotal)*100)  : 0, barColor: "#f59e0b" },
          ].map(row => (
            <div key={row.label} className="px-4 py-3.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[14px]">{row.emoji}</span>
                  <span className="text-[14px] font-semibold text-slate-700">{row.label}</span>
                  {commRate > 0 && row.label === "Commission" && (
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-500">{commRate}%</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-slate-400">{row.pct}%</span>
                  <span className="text-[15px] font-extrabold text-slate-900">{fmt$(row.amount)}</span>
                </div>
              </div>
              <Bar v={row.amount} max={periodTotal || 1} color={row.barColor} />
            </div>
          ))}
          <div className="px-4 py-3 flex items-center gap-2">
            <span className="text-[13px]">⚡</span>
            <span className="text-[13px] text-slate-500">{periodCnt} service{periodCnt !== 1 ? "s" : ""} · {commRate}% commission rate</span>
          </div>
        </div>
      </div>

      {/* Pay split */}
      {cs && (
        <div>
          <p className="text-[13px] font-black text-slate-400 uppercase tracking-widest mb-3">Revenue Split</p>
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div className="flex rounded-xl overflow-hidden" style={{ height: 40 }}>
              <div className="flex items-center justify-center font-black text-[14px] text-white"
                style={{ width: `${commRate}%`, background: "linear-gradient(90deg,#6366f1,#818cf8)" }}>
                {commRate >= 20 ? `You ${commRate}%` : ""}
              </div>
              <div className="flex-1 flex items-center justify-center text-[14px] font-bold text-slate-400 bg-slate-100">
                {(100 - commRate) >= 20 ? `Salon ${100 - commRate}%` : ""}
              </div>
            </div>
            <div className="flex justify-between text-[13px] font-semibold">
              <span style={{ color: "#6366f1" }}>You earn {fmt$(periodComm)}</span>
              <span className="text-slate-400">Salon keeps {fmt$(periodSvc - periodComm)}</span>
            </div>
          </div>
        </div>
      )}

      {/* vs last week */}
      {cmp && (
        <div>
          <p className="text-[13px] font-black text-slate-400 uppercase tracking-widest mb-3">Week-over-Week</p>
          <div className="bg-white rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[14px] text-slate-500">This week so far</p>
              <p className="text-[26px] font-black text-slate-900 leading-tight">{fmtK(cmp.lastWeekTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-[14px] text-slate-400">Last week</p>
              <p className="text-[17px] font-bold text-slate-600">{fmtK(cmp.prevWeekTotal)}</p>
              {cmp.changePercent !== null && (
                <p className="text-[15px] font-extrabold" style={{ color: wkUp ? "#10b981" : "#ef4444" }}>
                  {wkUp ? "↑" : "↓"} {Math.abs(cmp.changePercent)}%
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Service Breakdown */}
      {stats && stats.serviceBreakdown.length > 0 && (
        <div>
          <p className="text-[13px] font-black text-slate-400 uppercase tracking-widest mb-3">Top Services · 30 days</p>
          <div className="bg-white rounded-2xl divide-y divide-slate-50">
            {stats.serviceBreakdown.map((svc, i) => {
              const colors = ["#6366f1", "#06b6d4", "#f59e0b", "#10b981", "#ec4899"];
              const c = colors[i % colors.length];
              return (
                <div key={svc.name} className="px-4 py-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[12px] font-black text-white" style={{ backgroundColor: c }}>{i + 1}</div>
                      <span className="text-[14px] font-semibold text-slate-700 truncate">{svc.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-[12px] text-slate-400">{svc.count}x</span>
                      <span className="text-[15px] font-extrabold text-slate-900">{fmtK(svc.revenue)}</span>
                    </div>
                  </div>
                  <Bar v={svc.revenue} max={stats.serviceBreakdown[0].revenue} color={c} />
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Tab: Clients ──────────────────────────────────────────────────────────────

function ClientsTab({ stats, color }: { stats: StatsData | undefined; color: string }) {
  const navigate = useNavigate();
  if (!stats) return <div className="pt-8 text-center text-slate-400">Loading…</div>;

  const appts = stats.todayAppointments;
  const ls    = stats.lifetimeSummary;

  return (
    <div className="space-y-5 pt-4">

      {/* Today's appointments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-black text-slate-400 uppercase tracking-widest">Today's Schedule</p>
          <button className="text-[13px] font-bold flex items-center gap-0.5 active:opacity-60" style={{ color }} onClick={() => navigate("/staff-calendar")}>
            Full schedule <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {appts.length === 0 ? (
          <div className="bg-white rounded-2xl px-4 py-8 text-center">
            <p className="text-[32px] mb-2">📋</p>
            <p className="text-[15px] font-semibold text-slate-500">No appointments today</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl divide-y divide-slate-50">
            {appts.map(apt => {
              const s = statusPill(apt.status);
              const paid = parseFloat(apt.totalPaid ?? "0");
              return (
                <div key={apt.id} className="px-4 py-3.5 flex items-center gap-3">
                  <div className="w-14 flex-shrink-0 text-center">
                    <p className="text-[13px] font-bold text-slate-500">{format(new Date(apt.date), "h:mm")}</p>
                    <p className="text-[11px] text-slate-400">{format(new Date(apt.date), "a")}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-extrabold text-slate-900 truncate">{apt.clientName}</p>
                    <p className="text-[13px] text-slate-400 truncate">{apt.serviceName}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {paid > 0 && <p className="text-[15px] font-black text-slate-900">${paid.toFixed(0)}</p>}
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lifetime summary */}
      {ls.totalServices > 0 && (
        <div>
          <p className="text-[13px] font-black text-slate-400 uppercase tracking-widest mb-3">Lifetime Summary</p>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { emoji: "💰", label: "Total Earned",    value: fmtK(ls.totalEarnings),  bg: "#f0fdf4", fg: "#166534" },
              { emoji: "✂️", label: "Total Services",   value: String(ls.totalServices), bg: "#faf5ff", fg: "#5b21b6" },
              { emoji: "💳", label: "Total Card Tips",  value: fmtK(ls.totalCardTips),  bg: "#fffbeb", fg: "#92400e" },
              { emoji: "📅", label: "Member Since",     value: ls.memberSince ? format(parseISO(ls.memberSince), "MMM yyyy") : "—", bg: "#eff6ff", fg: "#1e40af" },
            ].map(({ emoji, label, value, bg, fg }) => (
              <div key={label} className="rounded-2xl p-4" style={{ backgroundColor: bg }}>
                <p className="text-[20px] mb-2">{emoji}</p>
                <p className="font-black text-[22px] leading-tight" style={{ color: fg }}>{value}</p>
                <p className="text-[12px] mt-0.5" style={{ color: fg, opacity: 0.55 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TABS = ["Earnings", "Performance", "Clients"] as const;
type Tab = typeof TABS[number];

export default function StaffOverview() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("Earnings");

  const { data: profile } = useQuery<StaffProfile>({
    queryKey: ["/api/staff/me/profile"],
    queryFn:  async () => { const r = await fetch("/api/staff/me/profile", { credentials: "include" }); if (!r.ok) throw new Error(""); return r.json(); },
    staleTime: 60_000,
  });
  const { data: pp } = useQuery<PayPeriodData>({
    queryKey: ["/api/staff/me/pay-period"],
    queryFn:  async () => { const r = await fetch("/api/staff/me/pay-period", { credentials: "include" }); if (!r.ok) throw new Error(""); return r.json(); },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const { data: cs } = useQuery<CommStruct>({
    queryKey: ["/api/staff/me/commission-structure"],
    queryFn:  async () => { const r = await fetch("/api/staff/me/commission-structure", { credentials: "include" }); if (!r.ok) throw new Error(""); return r.json(); },
    staleTime: 60_000,
  });
  const { data: availabilityRules } = useQuery<AvailabilityRule[]>({
    queryKey: ["/api/staff/availability", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const r = await fetch(`/api/staff/${profile.id}/availability`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!profile?.id,
    staleTime: 60_000,
  });
  const { data: stats } = useQuery<StatsData>({
    queryKey: ["/api/staff/me/stats"],
    queryFn:  async () => { const r = await fetch("/api/staff/me/stats", { credentials: "include" }); if (!r.ok) throw new Error(""); return r.json(); },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const color       = profile?.color ?? "#14b8a6";
  const firstName   = profile?.name?.split(" ")[0] ?? "there";
  const commRate    = Number(cs?.commissionRate ?? profile?.commissionRate ?? 0);
  const todayTotal  = parseFloat(pp?.todayTotals?.total ?? "0");
  const todayTips   = parseFloat(pp?.todayTotals?.tips  ?? "0");
  const todayCnt    = pp?.todayTotals?.count ?? 0;
  const todayComm   = todayTotal - todayTips;
  const periodTotal = parseFloat(pp?.periodTotals?.total ?? "0");
  const periodCnt   = pp?.periodTotals?.appointments ?? 0;
  const streak      = pp ? computeStreak(pp.dailyBreakdown, pp.todayStr) : 0;
  const payday      = pp ? getPayday(pp.periodEnd) : null;
  const dateRange   = pp ? `${format(parseISO(pp.periodStart), "MMM d")} – ${format(parseISO(pp.periodEnd), "MMM d")}` : "";
  const goalStorageKey = `staff-overview-daily-goal:${profile?.id ?? "default"}`;
  const [heroGoal, setHeroGoal] = useState<number>(150);
  const [goalInput, setGoalInput] = useState<string>("150");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(goalStorageKey);
    const parsed = Number(raw ?? "150");
    const loaded = Number.isFinite(parsed) && parsed >= 20 && parsed <= 5000 ? parsed : 150;
    setHeroGoal(loaded);
    setGoalInput(String(Math.round(loaded)));
  }, [goalStorageKey]);

  const goalProgress = heroGoal > 0 ? Math.min(100, Math.round((todayTotal / heroGoal) * 100)) : 0;
  const weeklyWorkingDays = Math.max(
    1,
    new Set((availabilityRules ?? [])
      .map((r) => Number(r.dayOfWeek))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    ).size
  );
  const dailyGoal = heroGoal / weeklyWorkingDays;
  const dailyGoalProgress = dailyGoal > 0 ? Math.min(100, Math.round((todayTotal / dailyGoal) * 100)) : 0;
  const nextPaycheckAmount = parseFloat(pp?.periodTotals?.total ?? "0");

  const saveGoal = () => {
    const parsed = Number(goalInput);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(20, Math.min(5000, Math.round(parsed)));
    setHeroGoal(clamped);
    setGoalInput(String(clamped));
    if (typeof window !== "undefined") {
      window.localStorage.setItem(goalStorageKey, String(clamped));
    }
  };

  return (
    <div className="flex flex-col bg-[#f2f3f7]" style={{ height: "100dvh" }}>

      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-4">

        {/* ── Greeting ── */}
        <p className="text-[22px] font-black text-slate-900 mb-1">Hey, {firstName}! 👋</p>
        <p className="text-[13px] text-slate-400 mb-4">
          {pp ? `${pp.label} · ${dateRange}` : "Loading…"}
        </p>

        {/* ── HERO: Today's Earnings (image-matched redesign) ── */}
        <div className="rounded-3xl p-[18px] mb-4 bg-white border border-slate-200/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <div className="grid grid-cols-[1fr_120px] items-center gap-2 mb-3.5">
            <div>
              <p className="text-[31px] text-slate-700 font-medium mb-1.5">Today's Earnings</p>
              <p className="text-[72px] leading-none tracking-[-0.02em] font-black text-[#0f1d4b]">
                {pp ? fmt$(todayTotal) : "—"}
              </p>

              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[20px]">🎯</span>
                  <p className="text-[28px] leading-none font-medium text-slate-700">Today's Goal</p>
                </div>

                <div className="mt-2 flex items-end justify-between gap-3">
                  <p className="text-[34px] leading-none tracking-[-0.02em] font-black text-[#0f1d4b]">
                    {fmt$(todayTotal)}
                    <span className="text-[26px] font-semibold text-slate-600"> / {fmt$(dailyGoal)}</span>
                  </p>
                  <span className="text-[34px] leading-none font-black text-emerald-600">{dailyGoalProgress}%</span>
                </div>

                <div className="mt-3 h-3.5 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400 transition-all duration-500"
                    style={{ width: `${dailyGoalProgress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="relative h-[120px] flex items-center justify-center">
              <div className="absolute inset-0 pointer-events-none">
                <span className="absolute top-2 left-5 text-[14px] text-cyan-500">✦</span>
                <span className="absolute top-8 right-3 text-[12px] text-purple-500">✦</span>
                <span className="absolute bottom-3 left-2 text-[12px] text-amber-500">✦</span>
                <span className="absolute bottom-7 right-7 text-[10px] text-emerald-500">✦</span>
              </div>
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_10px_20px_rgba(16,185,129,0.35)] flex items-center justify-center">
                <span className="text-white text-[48px] font-black leading-none">$</span>
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 px-1">
            <p className="text-[12px] text-slate-500 font-semibold">Set weekly goal ({weeklyWorkingDays} day{weeklyWorkingDays !== 1 ? "s" : ""} scheduled)</p>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                <span className="text-[13px] text-slate-500 mr-1">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={20}
                  max={5000}
                  step={5}
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  onBlur={saveGoal}
                  className="w-[72px] text-[13px] font-bold text-slate-700 outline-none"
                />
              </div>
              <button
                type="button"
                onClick={saveGoal}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold px-3 py-2 transition-colors"
              >
                Save goal
              </button>
            </div>
          </div>

          <button
            className="w-full mt-3 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors py-3 text-[20px] font-semibold text-slate-600"
            onClick={() => navigate("/staff-income")}
          >
            View earnings timeline →
          </button>

          {(todayCnt > 0 || todayTips > 0 || todayComm > 0) && (
            <div className="mt-2 px-1 text-[12px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
              <span>{todayCnt} service{todayCnt !== 1 ? "s" : ""} today</span>
              <span>•</span>
              <span>{fmt$(todayComm)} commission{commRate > 0 ? ` (${commRate}%)` : ""}</span>
              {todayTips > 0 && (
                <>
                  <span>•</span>
                  <span>{fmt$(todayTips)} card tips</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Next Payday ── */}
        <div className="mb-5 rounded-3xl bg-white border border-slate-200/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)] p-4">
          <div className="flex items-start gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-[30px]">
              💵
            </div>
            <div className="min-w-0">
              <p className="text-[16px] text-slate-700">Next Payday</p>
              <p className="text-[34px] leading-tight tracking-[-0.02em] font-black text-[#0f1d4b]">
                {payday?.label ?? "—"}
              </p>
              <p className="text-[28px] text-slate-700 mt-0.5">
                {payday ? (payday.days === 0 ? "Today" : `${payday.days} days remaining`) : ""}
              </p>
            </div>
          </div>

          <div className="w-full mt-3 rounded-2xl border border-slate-100 bg-slate-50 py-3 text-center">
            <p className="text-[12px] uppercase tracking-wider text-slate-400 font-bold">Paycheck Amount</p>
            <p className="text-[26px] leading-tight font-black text-[#0f1d4b] mt-0.5">{fmt$(nextPaycheckAmount || 0)}</p>
          </div>
        </div>

        {/* ── TAB BAR ── */}
        <div className="flex gap-1.5 mb-1 bg-white rounded-2xl p-1.5 shadow-sm">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-[13px] font-extrabold transition-all duration-200",
                tab === t
                  ? "text-white shadow-md"
                  : "text-slate-400 hover:text-slate-600"
              )}
              style={tab === t ? { backgroundColor: color } : {}}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        {tab === "Performance" && (
          <PerformanceTab
            streak={streak}
            periodTotal={periodTotal}
            periodCnt={periodCnt}
            todayTotal={todayTotal}
            pp={pp}
            stats={stats}
            color={color}
          />
        )}
        {tab === "Earnings" && (
          <EarningsTab pp={pp} stats={stats} cs={cs} color={color} commRate={commRate} />
        )}
        {tab === "Clients" && (
          <ClientsTab stats={stats} color={color} />
        )}

      </main>

      <StaffPortalNav />
    </div>
  );
}
