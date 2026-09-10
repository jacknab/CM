import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Globe, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { useInSettingsShell } from "@/lib/settings-shell-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Store, BusinessHours } from "@shared/schema";

// ── Timezone options (US) + a friendly label for anything else ──────────────
const US_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York",    label: "Eastern Time — New York" },
  { value: "America/Chicago",     label: "Central Time — Chicago" },
  { value: "America/Denver",      label: "Mountain Time — Denver" },
  { value: "America/Phoenix",     label: "Arizona — no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific Time — Los Angeles" },
  { value: "America/Anchorage",   label: "Alaska Time — Anchorage" },
  { value: "Pacific/Honolulu",    label: "Hawaii Time — Honolulu" },
  { value: "America/Puerto_Rico", label: "Atlantic Time — Puerto Rico" },
];

function tzLabel(tz: string): string {
  const known = US_TIMEZONES.find((o) => o.value === tz);
  if (known) return known.label;
  if (!tz || tz === "UTC") return "UTC";
  return tz.replace(/_/g, " ").replace(/\//g, " / ");
}

function currentTimeIn(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
    }).format(new Date());
  } catch {
    return "";
  }
}

// ── Weekly schedule model ──────────────────────────────────────────────────
type DayHours = { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean };

// Monday-first display order; values are the JS convention (Sun=0).
const WEEK: { dow: number; name: string }[] = [
  { dow: 1, name: "Monday" },
  { dow: 2, name: "Tuesday" },
  { dow: 3, name: "Wednesday" },
  { dow: 4, name: "Thursday" },
  { dow: 5, name: "Friday" },
  { dow: 6, name: "Saturday" },
  { dow: 0, name: "Sunday" },
];

const DEFAULT_HOURS: DayHours[] = WEEK.map(({ dow }) => ({
  dayOfWeek: dow,
  openTime: "09:00",
  closeTime: "17:00",
  isClosed: dow === 0, // closed Sundays by default
}));

const minutesOf = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// ── Page ───────────────────────────────────────────────────────────────────
export default function BusinessHoursPage() {
  const { selectedStore } = useSelectedStore();
  const inShell = useInSettingsShell();

  const { data: store, isLoading } = useQuery<Store>({
    queryKey: ["/api/stores", selectedStore?.id],
    enabled: !!selectedStore?.id,
  });

  if (isLoading || !store) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
        {!inShell && (
          <header className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Business Hours</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your weekly opening times. Clients can only book while you're open.
            </p>
          </header>
        )}
        <HoursCard store={store} />
      </div>
    </AppLayout>
  );
}

// ── The single card: timezone + 7 day rows + save ──────────────────────────
function HoursCard({ store }: { store: Store }) {
  const { toast } = useToast();

  // ── timezone ────────────────────────────────────────────────────────────
  const savedTz = store.timezone ?? "UTC";
  const [tz, setTz] = useState(savedTz);
  useEffect(() => setTz(store.timezone ?? "UTC"), [store.timezone]);

  const [now, setNow] = useState(() => currentTimeIn(savedTz));
  useEffect(() => {
    setNow(currentTimeIn(tz));
    const id = setInterval(() => setNow(currentTimeIn(tz)), 30_000);
    return () => clearInterval(id);
  }, [tz]);

  const saveTz = useMutation({
    mutationFn: (timezone: string) => apiRequest("PATCH", `/api/stores/${store.id}`, { timezone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stores", store.id] });
      toast({ title: "Time zone updated", description: `Now using ${tzLabel(tz)}.` });
    },
    onError: () => {
      setTz(savedTz);
      toast({ title: "Couldn't update time zone", variant: "destructive" });
    },
  });

  const tzOptions = US_TIMEZONES.some((o) => o.value === savedTz)
    ? US_TIMEZONES
    : [{ value: savedTz, label: tzLabel(savedTz) }, ...US_TIMEZONES];
  const tzDirty = tz !== savedTz;

  // ── weekly hours ────────────────────────────────────────────────────────
  const { data: saved } = useQuery<BusinessHours[]>({
    queryKey: ["/api/business-hours", store.id],
    queryFn: async () => {
      const res = await fetch(`/api/business-hours?storeId=${store.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load business hours");
      return res.json();
    },
    enabled: !!store.id,
  });

  const [hours, setHours] = useState<DayHours[]>(DEFAULT_HOURS);
  const [baseline, setBaseline] = useState<DayHours[]>(DEFAULT_HOURS);

  useEffect(() => {
    if (!saved) return;
    const byDow = new Map(saved.map((h) => [h.dayOfWeek, h]));
    const next = WEEK.map(({ dow }) => {
      const h = byDow.get(dow);
      return h
        ? {
            dayOfWeek: dow,
            openTime: (h.openTime ?? "09:00").slice(0, 5),
            closeTime: (h.closeTime ?? "17:00").slice(0, 5),
            isClosed: !!h.isClosed,
          }
        : DEFAULT_HOURS.find((d) => d.dayOfWeek === dow)!;
    });
    setHours(next);
    setBaseline(next);
  }, [saved]);

  const dirty = useMemo(() => JSON.stringify(hours) !== JSON.stringify(baseline), [hours, baseline]);

  const invalidDay = hours.find((h) => !h.isClosed && minutesOf(h.closeTime) <= minutesOf(h.openTime));

  const update = (dow: number, patch: Partial<DayHours>) =>
    setHours((prev) => prev.map((h) => (h.dayOfWeek === dow ? { ...h, ...patch } : h)));

  const copyMondayToWeekdays = () => {
    const mon = hours.find((h) => h.dayOfWeek === 1);
    if (!mon) return;
    setHours((prev) =>
      prev.map((h) =>
        [2, 3, 4, 5].includes(h.dayOfWeek)
          ? { ...h, openTime: mon.openTime, closeTime: mon.closeTime, isClosed: mon.isClosed }
          : h,
      ),
    );
  };

  const saveHours = useMutation({
    mutationFn: (data: DayHours[]) => apiRequest("PUT", "/api/business-hours", { storeId: store.id, hours: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-hours", store.id] });
      setBaseline(hours);
      toast({ title: "Hours saved" });
    },
    onError: () => toast({ title: "Couldn't save hours", variant: "destructive" }),
  });

  const monday = hours.find((h) => h.dayOfWeek === 1);

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Time zone */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border p-4 md:p-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
          <Globe className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time zone</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <select
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              data-testid="select-timezone"
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-[15px] font-medium outline-none"
            >
              {tzOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {tzDirty && (
              <Button size="sm" onClick={() => saveTz.mutate(tz)} disabled={saveTz.isPending}>
                {saveTz.isPending ? "Saving…" : "Save"}
              </Button>
            )}
          </div>
          {now && <div className="mt-1 text-xs text-muted-foreground">Currently {now}</div>}
        </div>
      </div>

      {/* Day rows */}
      <div className="divide-y divide-border">
        {WEEK.map(({ dow, name }) => {
          const h = hours.find((x) => x.dayOfWeek === dow)!;
          const bad = !h.isClosed && minutesOf(h.closeTime) <= minutesOf(h.openTime);
          return (
            <div key={dow} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 md:px-5">
              <div className="flex w-32 shrink-0 items-center gap-2.5">
                <Switch
                  checked={!h.isClosed}
                  onCheckedChange={(open) => update(dow, { isClosed: !open })}
                  data-testid={`toggle-day-${dow}`}
                />
                <span className={cn("text-[15px] font-medium", h.isClosed && "text-muted-foreground")}>{name}</span>
              </div>

              {h.isClosed ? (
                <span className="text-[15px] text-muted-foreground">Closed</span>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={h.openTime}
                    onChange={(e) => update(dow, { openTime: e.target.value })}
                    data-testid={`open-${dow}`}
                    className={cn(
                      "rounded-lg border bg-background px-2.5 py-1.5 text-[15px] outline-none",
                      bad ? "border-destructive" : "border-border",
                    )}
                  />
                  <span className="text-muted-foreground">–</span>
                  <input
                    type="time"
                    value={h.closeTime}
                    onChange={(e) => update(dow, { closeTime: e.target.value })}
                    data-testid={`close-${dow}`}
                    className={cn(
                      "rounded-lg border bg-background px-2.5 py-1.5 text-[15px] outline-none",
                      bad ? "border-destructive" : "border-border",
                    )}
                  />
                  {bad && <span className="text-xs text-destructive">End must be after start</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 md:p-5">
        <button
          type="button"
          onClick={copyMondayToWeekdays}
          disabled={!monday || monday.isClosed}
          className="text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
        >
          Apply Monday's hours to Tue–Fri
        </button>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Button
            onClick={() => saveHours.mutate(hours)}
            disabled={!dirty || !!invalidDay || saveHours.isPending}
            data-testid="save-hours"
          >
            {saveHours.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
