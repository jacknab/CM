import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { format, parseISO } from "date-fns";
import {
  Calendar, Clock, Zap, CheckCircle2, AlertCircle, ChevronRight, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Frequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

interface PayrollSchedule {
  enabled: boolean;
  frequency: Frequency;
  anchorDate: string | null;
  autoApproveDelayHours: number;
}

const FREQ_OPTIONS: Array<{ value: Frequency; label: string; desc: string }> = [
  { value: "weekly",      label: "Weekly",       desc: "7-day periods, same day each week" },
  { value: "biweekly",    label: "Bi-weekly",    desc: "14-day periods every two weeks" },
  { value: "semimonthly", label: "Semi-monthly", desc: "1st–15th and 16th–end of month" },
  { value: "monthly",     label: "Monthly",      desc: "Full calendar month" },
];

// ─── Period preview (mirrors server logic) ─────────────────────────────────────

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getUpcomingPeriods(
  frequency: Frequency,
  anchorDate: string | null,
  count = 4
): Array<{ periodStart: string; periodEnd: string }> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const results: Array<{ periodStart: string; periodEnd: string }> = [];

  if (frequency === "monthly") {
    const y = now.getFullYear(), m = now.getMonth();
    for (let i = 0; i < count; i++) {
      const mo = (m + i) % 12;
      const yr = y + Math.floor((m + i) / 12);
      results.push({
        periodStart: fmtDate(new Date(yr, mo, 1)),
        periodEnd:   fmtDate(new Date(yr, mo + 1, 0)),
      });
    }
    return results;
  }

  if (frequency === "semimonthly") {
    const y = now.getFullYear(), m = now.getMonth();
    const pool: typeof results = [];
    for (let mi = 0; mi < 4; mi++) {
      const mo = (m + mi) % 12;
      const yr = y + Math.floor((m + mi) / 12);
      pool.push({ periodStart: fmtDate(new Date(yr, mo, 1)),  periodEnd: fmtDate(new Date(yr, mo, 15)) });
      pool.push({ periodStart: fmtDate(new Date(yr, mo, 16)), periodEnd: fmtDate(new Date(yr, mo + 1, 0)) });
    }
    const today = fmtDate(now);
    return pool.filter(p => p.periodEnd >= today).slice(0, count);
  }

  if (frequency === "weekly" || frequency === "biweekly") {
    if (!anchorDate) return [];
    const anchor = new Date(anchorDate + "T00:00:00");
    anchor.setHours(0, 0, 0, 0);
    const periodLen = frequency === "weekly" ? 7 : 14;
    const diffDays = Math.floor((now.getTime() - anchor.getTime()) / 86_400_000);
    const currentPeriodIdx = Math.max(0, Math.floor(diffDays / periodLen));
    for (let i = 0; i < count; i++) {
      const p = currentPeriodIdx + i;
      results.push({
        periodStart: fmtDate(new Date(anchor.getTime() + p * periodLen * 86_400_000)),
        periodEnd:   fmtDate(new Date(anchor.getTime() + ((p + 1) * periodLen - 1) * 86_400_000)),
      });
    }
    return results;
  }

  return [];
}

function formatPeriod(start: string, end: string) {
  try {
    return `${format(parseISO(start), "MMM d")} – ${format(parseISO(end), "MMM d, yyyy")}`;
  } catch {
    return `${start} – ${end}`;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PayoutsSchedule() {
  const { selectedStore } = useSelectedStore();
  const qc = useQueryClient();
  const storeId = selectedStore?.id;

  const [form, setForm] = useState<PayrollSchedule>({
    enabled: false,
    frequency: "biweekly",
    anchorDate: null,
    autoApproveDelayHours: 48,
  });
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery<PayrollSchedule>({
    queryKey: ["/api/contractor-payouts/payroll-schedule", storeId],
    queryFn: async () => {
      const res = await fetch(
        `/api/contractor-payouts/payroll-schedule?storeId=${storeId}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load schedule");
      return res.json();
    },
    enabled: !!storeId,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: PayrollSchedule & { storeId: number }) => {
      const res = await fetch("/api/contractor-payouts/payroll-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/payroll-schedule", storeId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSave = () => {
    if (!storeId) return;
    saveMutation.mutate({ ...form, storeId });
  };

  const needsAnchor  = form.frequency === "weekly" || form.frequency === "biweekly";
  const upcomingPeriods = form.enabled
    ? getUpcomingPeriods(form.frequency, form.anchorDate)
    : [];

  const delayLabel =
    form.autoApproveDelayHours === 0
      ? "Approve immediately — no review window"
      : form.autoApproveDelayHours === 48
      ? "48 hours (2 days)"
      : form.autoApproveDelayHours === 72
      ? "72 hours (3 days)"
      : form.autoApproveDelayHours === 168
      ? "168 hours (1 week)"
      : `${form.autoApproveDelayHours} hours`;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[0, 1].map(i => (
          <div key={i} className="h-40 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Payroll Schedule</h1>
        <p className="text-sm text-gray-500 mt-1">
          Automatically create draft payout runs when each pay period closes.
          You get a configurable review window before they self-approve.
        </p>
      </div>

      {/* ── Main settings card ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Auto pay periods</CardTitle>
              <CardDescription className="text-sm mt-0.5">
                Drafts are created automatically at the close of each period
              </CardDescription>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))}
            />
          </div>
        </CardHeader>

        {form.enabled && (
          <CardContent className="space-y-5 pt-0 border-t border-gray-100">
            {/* Frequency */}
            <div className="pt-4 space-y-2">
              <Label className="text-sm font-medium">Pay frequency</Label>
              <div className="grid grid-cols-2 gap-2">
                {FREQ_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, frequency: opt.value }))}
                    className={[
                      "flex flex-col items-start p-3 rounded-lg border text-left transition-colors",
                      form.frequency === opt.value
                        ? "border-teal-600 bg-teal-50"
                        : "border-gray-200 hover:border-gray-300 bg-white",
                    ].join(" ")}
                  >
                    <span className={[
                      "text-sm font-medium",
                      form.frequency === opt.value ? "text-teal-700" : "text-gray-800",
                    ].join(" ")}>
                      {opt.label}
                    </span>
                    <span className="text-xs text-gray-500 mt-0.5">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Anchor date — only for weekly / bi-weekly */}
            {needsAnchor && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Anchor date</Label>
                <p className="text-xs text-gray-500">
                  The start date of your first pay period. All future periods
                  are calculated from this date.
                </p>
                <Input
                  type="date"
                  value={form.anchorDate ?? ""}
                  onChange={e => setForm(f => ({ ...f, anchorDate: e.target.value || null }))}
                  className="w-48"
                />
                {!form.anchorDate && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Required for {form.frequency} schedules
                  </p>
                )}
              </div>
            )}

            {/* Review window */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Review window</Label>
              <p className="text-xs text-gray-500">
                Hours you have to review or cancel a draft before it auto-approves.
                Set to 0 to approve immediately.
              </p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={336}
                  step={1}
                  value={form.autoApproveDelayHours}
                  onChange={e =>
                    setForm(f => ({ ...f, autoApproveDelayHours: Math.max(0, parseInt(e.target.value) || 0) }))
                  }
                  className="w-24"
                />
                <span className="text-sm text-gray-500">hours</span>
                <span className="text-xs text-gray-400">{delayLabel}</span>
              </div>
            </div>

            {/* Info banner */}
            <div className="flex gap-2.5 rounded-lg bg-blue-50 border border-blue-100 p-3">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 leading-relaxed">
                Draft runs appear on the <strong>Run Payouts</strong> page as soon as
                a period closes. You can edit, cancel, or manually approve them before the
                {form.autoApproveDelayHours > 0
                  ? ` ${form.autoApproveDelayHours}-hour review window expires.`
                  : " run is immediately approved."}
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Upcoming periods preview ───────────────────────────────────────── */}
      {form.enabled && upcomingPeriods.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" />
              Upcoming pay periods
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 divide-y divide-gray-100">
            {upcomingPeriods.map((p, i) => {
              const closeDate = parseISO(p.periodEnd);
              closeDate.setDate(closeDate.getDate() + 1);
              const approveDate = form.autoApproveDelayHours > 0
                ? new Date(closeDate.getTime() + form.autoApproveDelayHours * 3_600_000)
                : null;

              return (
                <div key={i} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {formatPeriod(p.periodStart, p.periodEnd)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Draft created {format(closeDate, "MMM d")}
                      {approveDate && (
                        <>
                          <ChevronRight className="w-3 h-3 text-gray-300" />
                          <Zap className="w-3 h-3 text-amber-400" />
                          auto-approves {format(approveDate, "MMM d 'at' h:mm a")}
                        </>
                      )}
                      {!approveDate && (
                        <>
                          <ChevronRight className="w-3 h-3 text-gray-300" />
                          <Zap className="w-3 h-3 text-amber-400" />
                          auto-approves immediately
                        </>
                      )}
                    </p>
                  </div>
                  {i === 0 && (
                    <Badge className="bg-teal-50 text-teal-700 border-0 text-xs">Current</Badge>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Save ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={
            saveMutation.isPending ||
            (form.enabled && needsAnchor && !form.anchorDate)
          }
          className="bg-teal-600 hover:bg-teal-700 text-white"
        >
          {saveMutation.isPending ? "Saving…" : "Save schedule"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="w-4 h-4" /> Saved
          </span>
        )}
        {saveMutation.isError && (
          <span className="flex items-center gap-1.5 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" /> Failed to save
          </span>
        )}
      </div>
    </div>
  );
}
