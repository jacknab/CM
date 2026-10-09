import { EMPTY_ARRAY } from "@/lib/empty";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery } from "@tanstack/react-query";
import { formatInTz } from "@/lib/timezone";
import { buildZReportHtml, canNativePrint, nativePrintZReport, printZReportHtml } from "@/components/reports/ZReportPrint";
import type { CashDrawerSessionWithActions } from "@shared/schema";

/** A calendar date ("2026-10-08") written out, with no timezone able to shift the day. */
function longDate(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/**
 * Day Close report for a chosen day. A Day Close belongs to the salon-local day it was run on — the same
 * "business date" the report itself prints — and the report shown is the very one that printed that night.
 */
export default function DayCloseReports() {
  const { selectedStore } = useSelectedStore();
  const timezone = selectedStore?.timezone || "UTC";
  const [day, setDay] = useState(() => formatInTz(new Date(), timezone, "yyyy-MM-dd"));
  // The salon's timezone arrives after first paint: start on the salon's today unless a day was already chosen.
  const [picked, setPicked] = useState(false);
  useEffect(() => { if (!picked) setDay(formatInTz(new Date(), timezone, "yyyy-MM-dd")); }, [timezone, picked]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const { data: sessions = EMPTY_ARRAY, isLoading: sessionsLoading } = useQuery<CashDrawerSessionWithActions[]>({
    queryKey: [`/api/cash-drawer/sessions?storeId=${selectedStore?.id}`],
    enabled: !!selectedStore,
  });

  // Every Day Close, newest first, with the salon-local day it was run on.
  const closes = useMemo(() => sessions
    .filter((s) => s.status === "closed" && s.closedAt)
    .map((s) => ({ id: s.id, closedAt: new Date(s.closedAt!), day: formatInTz(new Date(s.closedAt!), timezone, "yyyy-MM-dd") }))
    .sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime()), [sessions, timezone]);
  const onDay = useMemo(() => closes.filter((c) => c.day === day), [closes, day]);
  const previous = useMemo(() => closes.find((c) => c.day < day), [closes, day]);

  // Show the day's last close; a day closed more than once offers each one below.
  useEffect(() => { setSessionId(onDay[0]?.id ?? null); setPrintError(null); }, [onDay]);

  const { data: result, isLoading: reportLoading } = useQuery<{ report?: any; message?: string }>({
    queryKey: [`/api/cash-drawer/sessions/${sessionId}/z-report-full`],
    queryFn: async () => {
      const res = await fetch(`/api/cash-drawer/sessions/${sessionId}/z-report-full`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      return res.ok ? { report: body } : { message: body.message || "Could not load the Day Close report." };
    },
    enabled: !!sessionId,
  });
  const report = sessionId ? result?.report : null;
  const html = useMemo(() => (report ? buildZReportHtml(report) : ""), [report]);

  const print = async () => {
    setPrintError(null);
    if (canNativePrint() && report) {
      setPrinting(true);
      const r = await nativePrintZReport(report);
      setPrinting(false);
      if (!r.ok) setPrintError(r.error || "The printer did not respond.");
      return;
    }
    if (html) printZReportHtml(html);
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Day Close</h1>
            <p className="text-sm text-muted-foreground mt-1">The Day Close report for the day you choose.</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={day} max={formatInTz(new Date(), timezone, "yyyy-MM-dd")} className="w-44"
              onChange={(e) => { if (e.target.value) { setPicked(true); setDay(e.target.value); } }} data-testid="day-close-report-date" />
            <Button variant="outline" onClick={print} disabled={!html || printing} data-testid="day-close-report-print">
              {printing ? "Printing…" : "Print"}
            </Button>
          </div>
        </div>

        {onDay.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap text-sm" data-testid="day-close-report-closes">
            <span className="text-muted-foreground">Closed {onDay.length} times this day:</span>
            {onDay.map((c) => (
              <Button key={c.id} size="sm" variant={c.id === sessionId ? "default" : "outline"} onClick={() => setSessionId(c.id)}>
                {formatInTz(c.closedAt, timezone, "h:mm a")}
              </Button>
            ))}
          </div>
        )}

        {printError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{printError}</div>}

        <div className="rounded-xl border border-border bg-muted/40 flex justify-center py-6 min-h-[320px]" data-testid="day-close-report">
          {sessionsLoading || (sessionId && reportLoading) ? (
            <p className="self-center text-sm text-muted-foreground">Loading…</p>
          ) : !sessionId ? (
            <div className="self-center text-center px-6 space-y-3">
              <p className="text-sm text-muted-foreground">No Day Close was run on {longDate(day)}.</p>
              {previous && (
                <Button variant="outline" size="sm" onClick={() => { setPicked(true); setDay(previous.day); }} data-testid="day-close-report-previous">
                  Show the one before it — {longDate(previous.day)}
                </Button>
              )}
            </div>
          ) : !html ? (
            <p className="self-center text-sm text-red-600 px-6 text-center">{result?.message || "Could not load the Day Close report."}</p>
          ) : (
            <iframe title="Day Close report" srcDoc={html} className="bg-white shadow-sm border border-border" style={{ width: 340, height: "70vh" }} />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
