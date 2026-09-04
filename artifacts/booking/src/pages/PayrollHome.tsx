import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Zap, AlertTriangle, CheckCircle2, Clock, XCircle, ChevronRight,
  Users, UserCircle, DollarSign, ClipboardList, Percent, FileText,
  Receipt, Landmark, Loader2, RefreshCw,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type Frequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

interface Schedule {
  enabled: boolean;
  frequency: Frequency;
  anchorDate: string | null;
  autoApproveDelayHours: number;
}

interface Person {
  type: "contractor" | "employee";
  id: number;
  staffId: number | null;
  name: string;
  commissionRate: string | null;
  accruedPending: number;
  payoutMethod: string | null;
  status: "ready" | "needs_bank" | "in_progress" | "restricted" | "no_rate";
}

interface HubSummary {
  people: Person[];
  totals: { accruedPending: number; contractorCount: number; employeeCount: number };
  alerts: { needsBank: number; restricted: number; noRate: number };
}

const STATUS_INFO: Record<Person["status"], { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  ready:       { label: "Ready",          color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle2 },
  needs_bank:  { label: "Needs bank",     color: "text-amber-600",   bg: "bg-amber-50",   icon: AlertTriangle },
  in_progress: { label: "In progress",    color: "text-amber-600",   bg: "bg-amber-50",   icon: Clock },
  restricted:  { label: "Restricted",     color: "text-red-600",     bg: "bg-red-50",     icon: XCircle },
  no_rate:     { label: "No rate set",    color: "text-gray-500",    bg: "bg-gray-50",    icon: AlertTriangle },
};

const FREQ_LABEL: Record<Frequency, string> = {
  weekly: "Weekly", biweekly: "Bi-weekly", semimonthly: "Semi-monthly", monthly: "Monthly",
};

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Drill-down destinations (kept as full pages — reachable only from here) ──
const DRILLDOWNS = [
  { label: "Run history",         icon: ClipboardList, to: "/payouts/run" },
  { label: "Employee payroll",    icon: Users,          to: "/payroll/employees" },
  { label: "Commission rules",    icon: Percent,        to: "/commissions/new" },
  { label: "Team members",        icon: UserCircle,     to: "/team" },
  { label: "Contractors & bank",  icon: Landmark,        to: "/payouts/contractors" },
  { label: "Deductions",          icon: DollarSign,     to: "/payouts/deductions" },
  { label: "Tax docs / 1099s",    icon: FileText,       to: "/payouts/tax-docs" },
  { label: "Reports",             icon: Receipt,        to: "/payouts/reports" },
];

export default function PayrollHome() {
  const navigate = useNavigate();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "contractor" | "employee" | "attention">("all");

  const { data: summary, isLoading: summaryLoading } = useQuery<HubSummary>({
    queryKey: ["/api/contractor-payouts/hub-summary", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/hub-summary?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load payroll summary");
      return res.json();
    },
    enabled: !!storeId,
    refetchInterval: 60_000,
  });

  const { data: schedule } = useQuery<Schedule>({
    queryKey: ["/api/contractor-payouts/payroll-schedule", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/payroll-schedule?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load schedule");
      return res.json();
    },
    enabled: !!storeId,
  });

  const [localSchedule, setLocalSchedule] = useState<Schedule | null>(null);
  useEffect(() => { if (schedule) setLocalSchedule(schedule); }, [schedule]);

  const saveSchedule = useMutation({
    mutationFn: async (next: Schedule) => {
      const res = await fetch("/api/contractor-payouts/payroll-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...next, storeId }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/payroll-schedule", storeId] }),
  });

  const people = summary?.people ?? [];
  const filtered = people.filter((p) => {
    if (filter === "contractor") return p.type === "contractor";
    if (filter === "employee") return p.type === "employee";
    if (filter === "attention") return p.status !== "ready";
    return true;
  });

  const totalAlerts = (summary?.alerts.needsBank ?? 0) + (summary?.alerts.restricted ?? 0) + (summary?.alerts.noRate ?? 0);

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-4 pb-8">
        {/* ── Header ── */}
        <div className="px-1">
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>Payroll</h1>
          <p className="text-sm text-gray-500 mt-0.5">Everything for paying your team, in one place.</p>
        </div>

        {/* ── Accrued total ── */}
        <Card className="rounded-2xl shadow-sm border-gray-100 overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Accrued this period</p>
                <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums" style={{ fontFamily: "Outfit, sans-serif" }}>
                  {summaryLoading ? <Loader2 className="w-6 h-6 animate-spin text-gray-300" /> : money(summary?.totals.accruedPending ?? 0)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {summary?.totals.contractorCount ?? 0} contractors · {summary?.totals.employeeCount ?? 0} employees
                </p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-5 h-5 text-teal-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Alerts ── */}
        {totalAlerts > 0 && (
          <Card className="rounded-2xl shadow-sm border-amber-100 bg-amber-50/60">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 space-y-0.5">
                {(summary?.alerts.needsBank ?? 0) > 0 && <p>{summary!.alerts.needsBank} contractor{summary!.alerts.needsBank !== 1 ? "s" : ""} need bank info</p>}
                {(summary?.alerts.restricted ?? 0) > 0 && <p>{summary!.alerts.restricted} contractor{summary!.alerts.restricted !== 1 ? "s" : ""} restricted — action needed</p>}
                {(summary?.alerts.noRate ?? 0) > 0 && <p>{summary!.alerts.noRate} employee{summary!.alerts.noRate !== 1 ? "s" : ""} have no commission rate set</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Automation ── */}
        <Card className="rounded-2xl shadow-sm border-gray-100">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-teal-600" />
                <p className="font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>Auto payroll</p>
              </div>
              <Switch
                checked={!!localSchedule?.enabled}
                disabled={!localSchedule}
                onCheckedChange={(v) => {
                  if (!localSchedule) return;
                  const next = { ...localSchedule, enabled: v };
                  setLocalSchedule(next);
                  saveSchedule.mutate(next);
                }}
              />
            </div>

            {localSchedule?.enabled && (
              <div className="space-y-3 pt-1">
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Runs are created automatically</p>
                  <Select
                    value={localSchedule.frequency}
                    onValueChange={(v: Frequency) => {
                      const next = { ...localSchedule, frequency: v };
                      setLocalSchedule(next);
                      saveSchedule.mutate(next);
                    }}
                  >
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FREQ_LABEL) as Frequency[]).map((f) => (
                        <SelectItem key={f} value={f}>{FREQ_LABEL[f]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-xs text-gray-500">Auto-approve & pay contractor runs</span>
                  <Switch
                    checked={(localSchedule.autoApproveDelayHours ?? 0) > 0}
                    onCheckedChange={(v) => {
                      const next = { ...localSchedule, autoApproveDelayHours: v ? 48 : 0 };
                      setLocalSchedule(next);
                      saveSchedule.mutate(next);
                    }}
                  />
                </label>
                {(localSchedule.autoApproveDelayHours ?? 0) > 0 && (
                  <p className="text-xs text-gray-400">
                    Review window: {localSchedule.autoApproveDelayHours}h after a run is created, then it pays automatically.
                  </p>
                )}
              </div>
            )}

            <Button
              variant="outline"
              className="w-full rounded-xl gap-2"
              onClick={() => navigate("/payouts/schedule")}
            >
              <ChevronRight className="w-4 h-4" /> Advanced schedule settings
            </Button>
          </CardContent>
        </Card>

        {/* ── Run now ── */}
        <div className="grid grid-cols-2 gap-3">
          <Button className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white h-12 gap-2" onClick={() => navigate("/payouts/run")}>
            <Landmark className="w-4 h-4" /> Pay contractors
          </Button>
          <Button variant="outline" className="rounded-xl h-12 gap-2" onClick={() => navigate("/payroll/employees")}>
            <Users className="w-4 h-4" /> Run employee payroll
          </Button>
        </div>

        {/* ── People ── */}
        <div>
          <div className="flex items-center gap-2 px-1 mb-2 overflow-x-auto no-scrollbar">
            {([
              { key: "all", label: "All" },
              { key: "attention", label: "Needs attention" },
              { key: "contractor", label: "Contractors" },
              { key: "employee", label: "Employees" },
            ] as const).map((c) => (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === c.key ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {summaryLoading && (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
            )}
            {!summaryLoading && filtered.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No one here yet.</p>
            )}
            {filtered.map((p) => {
              const s = STATUS_INFO[p.status];
              return (
                <button
                  key={`${p.type}-${p.id}`}
                  className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-gray-100 shadow-sm text-left active:scale-[0.99] transition-transform"
                  onClick={() => navigate(p.type === "contractor" ? `/payouts/contractors/${p.id}` : `/team/${p.staffId}`)}
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-gray-500">
                    {p.name.slice(0, 1).toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{p.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{p.type === "contractor" ? "Contractor" : "Employee"}</Badge>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${s.color}`}>
                        <s.icon className="w-3 h-3" /> {s.label}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-gray-900 tabular-nums">{money(p.accruedPending)}</p>
                    <p className="text-[11px] text-gray-400">accrued</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Drill-downs ── */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium px-1 mb-2">Manage</p>
          <div className="grid grid-cols-2 gap-2">
            {DRILLDOWNS.map((d) => (
              <button
                key={d.to}
                onClick={() => navigate(d.to)}
                className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-white border border-gray-100 shadow-sm text-left active:scale-[0.99] transition-transform"
              >
                <d.icon className="w-4 h-4 text-teal-600 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-700 truncate">{d.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/hub-summary", storeId] })}
          className="flex items-center justify-center gap-1.5 text-xs text-gray-400 w-full py-2"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
    </AppLayout>
  );
}
