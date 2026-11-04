/**
 * Settings › Online Check-In for barbershops and haircut studios (plans/online-checkin-line.md): the shop's link, and
 * how its line behaves — when phone check-in closes, how long the line may get, when "head over now" is texted, how
 * late clients are handled, and whether clients may pick a barber. Shown in place of the older queue settings.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

export interface LineSettings {
  enabled: boolean; closesBeforeMin: number; maxLine: number; leadMin: number; lateHoldMin: number; lateMoveBack: boolean;
  barberChoice: boolean; avgMinutes: number; paused: { reason: string; until: string | null } | null;
}
export const LINE_SETTINGS_KEY = ["/api/online-line/settings"];

async function saveLine(body: Partial<Omit<LineSettings, "paused">> | { paused: { reason: string; minutes: number | null } | null }) {
  const res = await fetch("/api/online-line/settings", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Could not save");
  return data as { settings: LineSettings };
}
export const useSaveLine = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: saveLine, onSuccess: () => qc.invalidateQueries({ queryKey: LINE_SETTINGS_KEY }) });
};

function Num({ label, help, value, min, max, unit, onSave }: { label: string; help: string; value: number; min: number; max: number; unit: string; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => { const n = Math.round(Number(v)); if (Number.isFinite(n) && n >= min && n <= max && n !== value) onSave(n); else setV(String(value)); };
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-t first:border-t-0">
      <div><div className="font-semibold">{label}</div><p className="text-sm text-muted-foreground mt-0.5">{help}</p></div>
      <label className="flex items-center gap-2 shrink-0">
        <input type="number" min={min} max={max} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()}
          className="w-20 px-2 py-1.5 rounded-lg border bg-background text-right" aria-label={label} />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </label>
    </div>
  );
}
function Toggle({ label, help, on, onChange, testId }: { label: string; help: string; on: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-t first:border-t-0">
      <div><div className="font-semibold">{label}</div><p className="text-sm text-muted-foreground mt-0.5">{help}</p></div>
      <Switch checked={on} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}

export default function OnlineLineSettings() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ settings: LineSettings; link: string }>({ queryKey: LINE_SETTINGS_KEY });
  const save = useSaveLine();
  const set = (body: Parameters<typeof saveLine>[0]) => save.mutate(body, {
    onSuccess: () => toast({ title: "Saved" }),
    onError: (e: any) => toast({ title: "Not saved", description: e?.message, variant: "destructive" }),
  });
  if (isLoading || !data) return <div className="p-8 text-muted-foreground">Loading…</div>;
  const s = data.settings;
  const display = `${data.link}/display`;
  const copy = (v: string) => { void navigator.clipboard?.writeText(v); toast({ title: "Link copied" }); };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6" data-testid="online-line-settings">
      <div>
        <h1 className="text-2xl font-bold">Online Check-In</h1>
        <p className="text-muted-foreground mt-1">Clients join your walk-in line from their phone, see the live wait, and get a text when it's time to head over. They show on the front desk's Queue as ON THE WAY until they arrive.</p>
      </div>

      {s.paused && (
        <div className="rounded-xl border p-4 flex items-center justify-between gap-4">
          <div><div className="font-semibold">Paused{s.paused.until ? ` until ${new Date(s.paused.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</div>
            {s.paused.reason && <p className="text-sm text-muted-foreground">"{s.paused.reason}"</p>}</div>
          <button className="px-3 py-2 rounded-lg border font-semibold" onClick={() => set({ paused: null })}>Open again</button>
        </div>
      )}

      <section className="rounded-xl border p-5">
        <Toggle label="Take online check-ins" help="Your check-in page is open during your business hours." on={s.enabled} onChange={(v) => set({ enabled: v })} testId="line-enabled" />
        <div className="py-4 border-t space-y-3">
          {[["Check-in page", data.link], ["Lobby screen", display]].map(([label, url]) => (
            <div key={label}>
              <div className="text-sm font-semibold mb-1">{label}</div>
              <div className="flex gap-2">
                <input readOnly value={url} className="flex-1 px-3 py-2 rounded-lg border bg-muted text-sm font-mono" onFocus={(e) => e.target.select()} />
                <button className="px-3 py-2 rounded-lg border" onClick={() => copy(url)} aria-label={`Copy the ${label} link`}><Copy className="w-4 h-4" /></button>
                <a className="px-3 py-2 rounded-lg border" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open the ${label}`}><ExternalLink className="w-4 h-4" /></a>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border p-5">
        <Num label="Stop online check-in before closing" help="No new phone check-ins this close to closing time." value={s.closesBeforeMin} min={0} max={240} unit="min" onSave={(n) => set({ closesBeforeMin: n })} />
        <Num label="Longest line" help="Phone check-in pauses by itself once this many people are waiting." value={s.maxLine} min={1} max={200} unit="people" onSave={(n) => set({ maxLine: n })} />
        <Num label={'"Head over now" text'} help="Clients get a text when their wait is down to this." value={s.leadMin} min={5} max={120} unit="min" onSave={(n) => set({ leadMin: n })} />
        <Num label="Usual cut length" help="Used for the wait until your shop has enough real cut times (then those are used)." value={s.avgMinutes} min={5} max={180} unit="min" onSave={(n) => set({ avgMinutes: n })} />
      </section>

      <section className="rounded-xl border p-5">
        <Num label="Hold a late client's spot" help="When it's their turn and they aren't here yet, their spot is kept this long (they get a text)." value={s.lateHoldMin} min={0} max={60} unit="min" onSave={(n) => set({ lateHoldMin: n })} />
        <Toggle label="Then move them to the back once" help="Off: they come off the line when the hold runs out. On: they go to the back of the line once, and come off if they miss their turn again." on={s.lateMoveBack} onChange={(v) => set({ lateMoveBack: v })} testId="line-move-back" />
      </section>

      <section className="rounded-xl border p-5">
        <Toggle label="Clients can choose a barber" help={'"Any barber" is always first and fastest. Each barber shows their own wait.'} on={s.barberChoice} onChange={(v) => set({ barberChoice: v })} testId="line-barber-choice" />
      </section>
    </div>
  );
}
