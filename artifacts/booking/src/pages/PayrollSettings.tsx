import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Save, Banknote, CalendarDays, Info, Clock, Percent,
  Lock, AlertTriangle, CheckCircle2, ShieldAlert,
} from "lucide-react";

const FREQUENCY_OPTIONS = [
  { value: "weekly",      label: "Weekly",       desc: "Every 7 days" },
  { value: "biweekly",    label: "Bi-Weekly",    desc: "Every 2 weeks" },
  { value: "semimonthly", label: "Semi-Monthly", desc: "Twice per month" },
  { value: "monthly",     label: "Monthly",      desc: "Once per month" },
];

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1,
  label: `${ordinalSuffix(i + 1)} of the month`,
}));

export type PayrollSettingsData = {
  frequency: string;
  weekStartDay: number;
  monthStartDay: number;
  semiMonthlyDay1: number;
  semiMonthlyDay2: number;
  enableSalaryHourly: boolean;
  enableCommissions: boolean;
  isConfigured?: boolean;
  configuredAt?: string | null;
};

const DEFAULTS: PayrollSettingsData = {
  frequency: "monthly",
  weekStartDay: 1,
  monthStartDay: 1,
  semiMonthlyDay1: 1,
  semiMonthlyDay2: 15,
  enableSalaryHourly: false,
  enableCommissions: false,
  isConfigured: false,
};

function periodPreview(s: PayrollSettingsData): string {
  switch (s.frequency) {
    case "weekly":
      return `Periods run ${DAYS_OF_WEEK[s.weekStartDay]?.label} → ${DAYS_OF_WEEK[(s.weekStartDay + 6) % 7]?.label}`;
    case "biweekly":
      return `14-day periods starting each ${DAYS_OF_WEEK[s.weekStartDay]?.label}`;
    case "semimonthly":
      return `Period 1: ${ordinalSuffix(s.semiMonthlyDay1)}–${ordinalSuffix(s.semiMonthlyDay2 - 1)} · Period 2: ${ordinalSuffix(s.semiMonthlyDay2)}–end of month`;
    case "monthly":
      return `${ordinalSuffix(s.monthStartDay)} of the month through ${ordinalSuffix(s.monthStartDay - 1 || 31)} of the following month`;
    default:
      return "";
  }
}

function FrequencyLabel({ f }: { f: string }) {
  const opt = FREQUENCY_OPTIONS.find(o => o.value === f);
  return <span>{opt?.label ?? f}</span>;
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function PayrollSettings() {
  const navigate = useNavigate();
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [local, setLocal] = useState<PayrollSettingsData | null>(null);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");

  const { data, isLoading } = useQuery<PayrollSettingsData>({
    queryKey: ["/api/payroll-settings", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return DEFAULTS;
      const res = await fetch(`/api/payroll-settings/${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) return DEFAULTS;
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const current = local ?? data ?? DEFAULTS;
  const isConfigured = data?.isConfigured === true;

  const set = <K extends keyof PayrollSettingsData>(key: K, value: PayrollSettingsData[K]) => {
    setLocal(prev => ({ ...(prev ?? data ?? DEFAULTS), [key]: value }));
  };

  const { mutate: save, isPending } = useMutation({
    mutationFn: async (body: PayrollSettingsData) => {
      const res = await fetch(`/api/payroll-settings/${selectedStore?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Earnings settings saved & locked" });
      setLocal(null);
      setConfirmSaveOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/payroll-settings", selectedStore?.id] });
      qc.invalidateQueries({ queryKey: ["/api/stores", selectedStore?.id] });
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: "destructive" });
      setConfirmSaveOpen(false);
    },
  });

  const { mutate: resetEarnings, isPending: resetting } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/payroll-settings/${selectedStore?.id}/reset`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to reset");
      return res.json();
    },
    onSuccess: (data: any) => {
      const count = data?.deleted ?? 0;
      toast({
        title: "Earnings data deleted",
        description: `${count} earnings run${count !== 1 ? "s" : ""} deleted. Settings are now unlocked.`,
      });
      setResetDialogOpen(false);
      setResetConfirmText("");
      qc.invalidateQueries({ queryKey: ["/api/payroll-settings", selectedStore?.id] });
      qc.invalidateQueries({ queryKey: ["/api/payroll-runs", selectedStore?.id] });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const isDirty = local !== null;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Back to hub */}
      <div style={{ position:"sticky",top:0,zIndex:40,background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"10px 24px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 3px 0 rgb(0 0 0/.06)",marginLeft:-32,marginRight:-32,marginTop:-24,marginBottom:16 }}>
        <button onClick={()=>navigate("/payouts/contractors")} style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",cursor:"pointer",fontSize:".82rem",fontWeight:600,color:"#374151",whiteSpace:"nowrap" }}>
          ← Staff &amp; Earnings
        </button>
        <div style={{ width:1,height:18,background:"#e5e7eb",flexShrink:0 }} />
        <span style={{ fontSize:".92rem",fontWeight:700,color:"#1c1917" }}>Earnings Settings</span>
      </div>
      {/* ── Page header ── */}
      <div className="sticky top-0 z-20 bg-background border-b px-6 py-4 -mx-6 -mt-6 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold flex items-center gap-2">
            Earnings Settings
            {isConfigured && <Lock className="w-4 h-4 text-amber-500" />}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isConfigured
              ? "Settings are locked — pay periods are now being tracked automatically"
              : "Set pay frequency and period dates used for commission tracking"}
          </p>
        </div>
        {!isConfigured && (
          <Button
            onClick={() => setConfirmSaveOpen(true)}
            disabled={isPending || !isDirty}
            className="bg-[#1a1f36] hover:bg-[#2d3452] text-white font-semibold px-6"
          >
            <Save className="w-4 h-4 mr-2" />
            {isPending ? "Saving…" : "Save & Lock Settings"}
          </Button>
        )}
      </div>

      <div className="max-w-2xl space-y-6">

        {/* ── LOCKED STATE ── */}
        {isConfigured ? (
          <>
            {/* Lock Banner */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <CheckCircle2 className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-amber-900 text-sm">Earnings settings are locked</p>
                <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                  Changing pay frequency or period dates mid-year would corrupt historical earnings records.
                  If you need to change these settings, you must delete all earnings data first — which is not recommended.
                </p>
              </div>
            </div>

            {/* Read-only summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Banknote className="w-4 h-4" />
                  Configured Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ReadOnlyRow label="Pay Frequency" value={FREQUENCY_OPTIONS.find(o => o.value === current.frequency)?.label ?? current.frequency} />
                {(current.frequency === "weekly" || current.frequency === "biweekly") && (
                  <ReadOnlyRow label="Period Starts On" value={DAYS_OF_WEEK[current.weekStartDay]?.label ?? ""} />
                )}
                {current.frequency === "monthly" && (
                  <ReadOnlyRow label="Period Starts On" value={ordinalSuffix(current.monthStartDay) + " of the month"} />
                )}
                {current.frequency === "semimonthly" && (
                  <>
                    <ReadOnlyRow label="First Period Starts" value={ordinalSuffix(current.semiMonthlyDay1) + " of the month"} />
                    <ReadOnlyRow label="Second Period Starts" value={ordinalSuffix(current.semiMonthlyDay2) + " of the month"} />
                  </>
                )}
                <ReadOnlyRow label="Salary / Hourly Pay" value={current.enableSalaryHourly ? "Enabled" : "Disabled"} />
                <ReadOnlyRow label="Commission Pay" value={current.enableCommissions ? "Enabled" : "Disabled"} />
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground border border-dashed">
                  <CalendarDays className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{periodPreview(current)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-destructive">
                  <ShieldAlert className="w-4 h-4" />
                  Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start justify-between gap-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                  <div>
                    <p className="font-semibold text-sm">Reset All Earnings Data</p>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      Permanently deletes <strong>all earnings runs and records</strong> for this location and unlocks settings.
                      This action cannot be undone. We strongly recommend exporting your data first.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setResetDialogOpen(true)}
                    className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                    Reset Data
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* ── EDITABLE STATE ── */}

            {/* Warning banner for first-time setup */}
            <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-blue-900 text-sm">Configure once, then lock</p>
                <p className="text-sm text-blue-700 mt-1 leading-relaxed">
                  Once you save these settings, they will be <strong>locked</strong>. Changing pay frequency or
                  period dates mid-year would corrupt historical records. Set these carefully before running your first earnings period.
                </p>
              </div>
            </div>

            {/* Pay Types */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Banknote className="w-4 h-4" />
                  Pay Types
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Choose which pay structures are available for your staff members.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                      <Clock className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Salary / Hourly Pay</p>
                      <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                        Pay staff a fixed salary or an hourly rate based on hours tracked via the Timeclock.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={current.enableSalaryHourly}
                    onCheckedChange={(v) => set("enableSalaryHourly", v)}
                    className="shrink-0 mt-1"
                  />
                </div>

                <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                      <Percent className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Commission Pay</p>
                      <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                        Pay staff a percentage of the services and retail they perform each pay period.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={current.enableCommissions}
                    onCheckedChange={(v) => set("enableCommissions", v)}
                    className="shrink-0 mt-1"
                  />
                </div>

                {!current.enableSalaryHourly && !current.enableCommissions && (
                  <p className="text-xs text-muted-foreground px-1">
                    Enable at least one pay type to begin processing earnings runs.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Pay Frequency */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="w-4 h-4" />
                  Pay Frequency
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>How often do you run earnings?</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {FREQUENCY_OPTIONS.map(opt => {
                      const active = current.frequency === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => set("frequency", opt.value)}
                          className={[
                            "flex flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left transition-all",
                            active
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border hover:border-muted-foreground/40",
                          ].join(" ")}
                        >
                          <span className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>
                            {opt.label}
                          </span>
                          <span className="text-xs text-muted-foreground">{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(current.frequency === "weekly" || current.frequency === "biweekly") && (
                  <div className="space-y-2 border-t pt-4">
                    <Label>Pay period starts on</Label>
                    <Select
                      value={String(current.weekStartDay)}
                      onValueChange={v => set("weekStartDay", Number(v))}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map(d => (
                          <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {current.frequency === "monthly" && (
                  <div className="space-y-2 border-t pt-4">
                    <Label>Pay period starts on the</Label>
                    <Select
                      value={String(current.monthStartDay)}
                      onValueChange={v => set("monthStartDay", Number(v))}
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_DAYS.map(d => (
                          <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      The period ends the day before the same date the following month.
                    </p>
                  </div>
                )}

                {current.frequency === "semimonthly" && (
                  <div className="space-y-4 border-t pt-4">
                    <div className="space-y-2">
                      <Label>First period starts on the</Label>
                      <Select
                        value={String(current.semiMonthlyDay1)}
                        onValueChange={v => set("semiMonthlyDay1", Number(v))}
                      >
                        <SelectTrigger className="w-52">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTH_DAYS.slice(0, 14).map(d => (
                            <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Second period starts on the</Label>
                      <Select
                        value={String(current.semiMonthlyDay2)}
                        onValueChange={v => set("semiMonthlyDay2", Number(v))}
                      >
                        <SelectTrigger className="w-52">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTH_DAYS.filter(d => d.value > current.semiMonthlyDay1).map(d => (
                            <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground border border-dashed">
                  <CalendarDays className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{periodPreview(current)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Info className="w-4 h-4" />
                  How Pay Periods Work
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                  <li>Pay periods are automatically calculated from your frequency settings.</li>
                  <li>At the end of each period, a manager or owner must <strong className="text-foreground">approve and finalize</strong> the run before checks are issued.</li>
                  <li>Finalizing a period automatically sends data to the <strong className="text-foreground">Check Printer</strong> and <strong className="text-foreground">Contractor Payouts</strong>.</li>
                  <li>
                    The <strong className="text-foreground">Commission Report</strong> auto-sets dates based on your pay period.{" "}
                    <Badge variant="secondary" className="text-xs">Current Pay Period</Badge>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ── First-save confirmation dialog ── */}
      <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" />
              Lock Earnings Settings?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Once saved, these settings will be <strong>locked</strong>. You will not be able to change the
                pay frequency or period dates without deleting all earnings data.
              </span>
              <span className="block mt-2">
                <strong>Pay Frequency:</strong> {FREQUENCY_OPTIONS.find(o => o.value === current.frequency)?.label}
                <br />
                <strong>Pay Types:</strong>{" "}
                {[current.enableSalaryHourly && "Salary/Hourly", current.enableCommissions && "Commissions"]
                  .filter(Boolean).join(" & ") || "None selected"}
              </span>
              <span className="block mt-2 text-amber-700 font-medium">
                Make sure these are correct before saving.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => save(current)}
              disabled={isPending}
              className="bg-[#1a1f36] hover:bg-[#2d3452]"
            >
              {isPending ? "Saving…" : "Yes, Lock Settings"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reset confirmation dialog ── */}
      <AlertDialog open={resetDialogOpen} onOpenChange={(o) => { setResetDialogOpen(o); if (!o) setResetConfirmText(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete All Earnings Data?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                This will permanently delete <strong>all earnings runs, commission records, and pay period history</strong> for this location.
                This action <strong>cannot be undone</strong>.
              </span>
              <span className="block text-destructive font-medium">
                We strongly recommend exporting your data before proceeding.
              </span>
              <span className="block">
                Type <strong>DELETE</strong> below to confirm:
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Input
              value={resetConfirmText}
              onChange={e => setResetConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="font-mono"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetEarnings()}
              disabled={resetConfirmText !== "DELETE" || resetting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {resetting ? "Deleting…" : "Delete All Earnings Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
