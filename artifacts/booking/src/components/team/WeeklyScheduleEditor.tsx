import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

export interface DayRule {
  dayOfWeek: number; // JS convention: Sun=0 … Sat=6
  startTime: string; // "HH:MM"
  endTime: string;
}

const WEEK: { dow: number; name: string }[] = [
  { dow: 1, name: "Monday" },
  { dow: 2, name: "Tuesday" },
  { dow: 3, name: "Wednesday" },
  { dow: 4, name: "Thursday" },
  { dow: 5, name: "Friday" },
  { dow: 6, name: "Saturday" },
  { dow: 0, name: "Sunday" },
];

const minutesOf = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function defaultWeek(): DayRule[] {
  return WEEK.map(({ dow }) => ({
    dayOfWeek: dow,
    startTime: "09:00",
    endTime: "17:00",
  })).filter((r) => r.dayOfWeek !== 0); // Sunday off by default
}

/**
 * `rules` holds only the days the person works. A day with no rule = off.
 * Controlled — parent owns the array.
 */
export function WeeklyScheduleEditor({
  rules,
  onChange,
}: {
  rules: DayRule[];
  onChange: (rules: DayRule[]) => void;
}) {
  const byDow = new Map(rules.map((r) => [r.dayOfWeek, r]));

  const setDay = (dow: number, on: boolean) => {
    if (on) {
      onChange([...rules, { dayOfWeek: dow, startTime: "09:00", endTime: "17:00" }]);
    } else {
      onChange(rules.filter((r) => r.dayOfWeek !== dow));
    }
  };
  const patch = (dow: number, p: Partial<DayRule>) =>
    onChange(rules.map((r) => (r.dayOfWeek === dow ? { ...r, ...p } : r)));

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {WEEK.map(({ dow, name }) => {
        const r = byDow.get(dow);
        const bad = r ? minutesOf(r.endTime) <= minutesOf(r.startTime) : false;
        return (
          <div key={dow} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="flex w-32 shrink-0 items-center gap-2.5">
              <Switch checked={!!r} onCheckedChange={(on) => setDay(dow, on)} data-testid={`sched-${dow}`} />
              <span className={cn("text-[15px] font-medium", !r && "text-muted-foreground")}>{name}</span>
            </div>
            {r ? (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={r.startTime}
                  onChange={(e) => patch(dow, { startTime: e.target.value })}
                  className={cn(
                    "rounded-lg border bg-background px-2.5 py-1.5 text-[15px] outline-none",
                    bad ? "border-destructive" : "border-border",
                  )}
                />
                <span className="text-muted-foreground">–</span>
                <input
                  type="time"
                  value={r.endTime}
                  onChange={(e) => patch(dow, { endTime: e.target.value })}
                  className={cn(
                    "rounded-lg border bg-background px-2.5 py-1.5 text-[15px] outline-none",
                    bad ? "border-destructive" : "border-border",
                  )}
                />
                {bad && <span className="text-xs text-destructive">End after start</span>}
              </div>
            ) : (
              <span className="text-[15px] text-muted-foreground">Off</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function scheduleHasError(rules: DayRule[]): boolean {
  return rules.some((r) => minutesOf(r.endTime) <= minutesOf(r.startTime));
}
