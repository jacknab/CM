import { useMemo, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, Printer } from "lucide-react";
import { format, startOfWeek, startOfMonth, endOfMonth, subMonths, subDays, startOfYear } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The frame every report page shares (owner, 2026-10-29: each report its own page): a way back to Reports, the title,
 * and one toolbar — date presets or a custom range, compare with the period before, CSV export, print. The range and
 * compare live in the address (?from&to&compare=1), so a report can be bookmarked or sent.
 */
export type Preset = "today" | "yesterday" | "this-week" | "last-7" | "this-month" | "last-month" | "last-30" | "last-90" | "this-year" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" }, { id: "this-week", label: "This week" },
  { id: "last-7", label: "Last 7 days" }, { id: "this-month", label: "This month" }, { id: "last-month", label: "Last month" },
  { id: "last-30", label: "Last 30 days" }, { id: "last-90", label: "Last 90 days" }, { id: "this-year", label: "This year" },
  { id: "custom", label: "Custom range" },
];
const day = (d: Date) => format(d, "yyyy-MM-dd");

export function presetRange(p: Preset, now = new Date()): { from: string; to: string } {
  switch (p) {
    case "today": return { from: day(now), to: day(now) };
    case "yesterday": { const y = subDays(now, 1); return { from: day(y), to: day(y) }; }
    case "this-week": return { from: day(startOfWeek(now)), to: day(now) };
    case "last-7": return { from: day(subDays(now, 6)), to: day(now) };
    case "last-month": { const m = subMonths(now, 1); return { from: day(startOfMonth(m)), to: day(endOfMonth(m)) }; }
    case "last-30": return { from: day(subDays(now, 29)), to: day(now) };
    case "last-90": return { from: day(subDays(now, 89)), to: day(now) };
    case "this-year": return { from: day(startOfYear(now)), to: day(now) };
    case "this-month": default: return { from: day(startOfMonth(now)), to: day(now) };
  }
}

/** The report's range and compare switch, kept in the page address. */
export function useReportRange() {
  const [params, setParams] = useSearchParams();
  const preset = (params.get("range") as Preset) || "this-month";
  const base = preset === "custom" ? null : presetRange(preset);
  const from = params.get("from") || base?.from || presetRange("this-month").from;
  const to = params.get("to") || base?.to || presetRange("this-month").to;
  const compare = params.get("compare") !== "0";
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v == null ? next.delete(k) : next.set(k, v);
    setParams(next, { replace: true });
  };
  return {
    preset, from, to, compare,
    setPreset: (p: Preset) => set(p === "custom" ? { range: p, from, to } : { range: p, from: null, to: null }),
    setCustom: (f: string, t: string) => set({ range: "custom", from: f, to: t }),
    setCompare: (c: boolean) => set({ compare: c ? null : "0" }),
  };
}

/** A Money report's data from the server. */
export function useMoneyReport<T>(report: string, from: string, to: string, compare: boolean) {
  return useQuery<T>({
    queryKey: ["/api/reports/money", report, from, to, compare],
    queryFn: async () => {
      const res = await fetch(`/api/reports/money/${report}?from=${from}&to=${to}${compare ? "&compare=1" : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Could not load the report");
      return res.json();
    },
    enabled: from <= to,
  });
}

export const money = (n: number) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pctChange = (now: number, before: number | undefined | null): number | null =>
  before == null || before === 0 ? null : Math.round(((now - before) / Math.abs(before)) * 1000) / 10;

/** Downloads rows as a CSV file. */
export function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([[header, ...rows].map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** One headline number, with the change from the period before when compared. */
export function Kpi({ label, value, change, sub, invert }: { label: string; value: string; change?: number | null; sub?: string; invert?: boolean }) {
  const good = change != null && (invert ? change <= 0 : change >= 0);
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
        {change != null && (
          <p className={cn("text-xs font-medium mt-1", good ? "text-green-600" : "text-red-600")}>
            {change >= 0 ? "+" : ""}{change}% vs previous period
          </p>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function ReportFrame({ title, description, range, onCsv, loading, error, children }: {
  title: string; description: string; range: ReturnType<typeof useReportRange>;
  onCsv?: () => void; loading?: boolean; error?: string | null; children: ReactNode;
}) {
  const navigate = useNavigate();
  const label = useMemo(() => PRESETS.find((p) => p.id === range.preset)?.label ?? "This month", [range.preset]);
  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 space-y-6 print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" className="-ml-2 mb-1 gap-1 print:hidden" onClick={() => navigate("/reports")} data-testid="report-back">
              <ArrowLeft className="h-4 w-4" /> Reports
            </Button>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            <p className="hidden print:block text-sm mt-1">{label}: {range.from} to {range.to}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden" data-testid="report-toolbar">
            <Select value={range.preset} onValueChange={(v) => range.setPreset(v as Preset)}>
              <SelectTrigger className="w-[160px]" data-testid="report-range"><SelectValue /></SelectTrigger>
              <SelectContent>{PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
            {range.preset === "custom" && (
              <>
                <Input type="date" className="w-[150px]" value={range.from} max={range.to} onChange={(e) => e.target.value && range.setCustom(e.target.value, range.to)} data-testid="report-from" />
                <span className="text-sm text-muted-foreground">to</span>
                <Input type="date" className="w-[150px]" value={range.to} min={range.from} onChange={(e) => e.target.value && range.setCustom(range.from, e.target.value)} data-testid="report-to" />
              </>
            )}
            <label className="flex items-center gap-1.5 text-sm px-2">
              <input type="checkbox" checked={range.compare} onChange={(e) => range.setCompare(e.target.checked)} data-testid="report-compare" />
              Compare
            </label>
            {onCsv && <Button variant="outline" size="sm" className="gap-1.5" onClick={onCsv} data-testid="report-csv"><Download className="h-4 w-4" /> CSV</Button>}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Building the report…</div>
        ) : error ? (
          <p className="py-24 text-center text-sm text-destructive">{error}</p>
        ) : children}
      </div>
    </AppLayout>
  );
}
