/**
 * Kiosk Builder › start (owner, 2026-11-13): the business's kiosk configurations. A new one is made in two steps —
 * give it a name, then choose its builder (Easy or Picture) — and then opens in that builder (/kiosk-builder/:id).
 * "Put on my kiosk" publishes one; the kiosk shows the one marked "On your kiosk now".
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Upload } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

interface ConfigRow { id: number; name: string; source: "saved" | "imported"; builder: "easy" | "picture"; live: boolean; updatedAt: string }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || d.message || "Something went wrong");
  return d as T;
}

export const BUILDERS = {
  easy: { name: "Easy builder", about: "Certxa draws the screens from your services. You choose what shows and change the words and colours. Prices stay up to date by themselves." },
  picture: { name: "Picture builder", about: "You design the screens as pictures (in Canva or any design app) and place tap spots on them. Full control of the look." },
} as const;

export default function KioskConfigsHome() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<ConfigRow[] | null>(null);
  const [error, setError] = useState("");
  // New configuration: step 1 the name, step 2 the builder.
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; action: string; run: () => Promise<void> }>(null);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const load = () => api<{ configs: ConfigRow[] }>("/api/kiosk-builder/configs").then((d) => setConfigs(d.configs)).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);

  const create = async (builder: "easy" | "picture") => {
    setCreating(true);
    try {
      const { config } = await api<{ config: ConfigRow }>("/api/kiosk-builder/configs", { method: "POST", body: JSON.stringify({ name, builder }) });
      navigate(`/kiosk-builder/${config.id}`);
    } catch (e: any) {
      toast({ title: "Couldn't make it", description: e.message, variant: "destructive" });
      setCreating(false);
    }
  };
  const importFile = async (f: File) => {
    try {
      let file: unknown;
      try { file = JSON.parse(await f.text()); } catch { throw new Error("This isn't a Certxa kiosk configuration file."); }
      const r = await api<{ config: ConfigRow; unmatched: { services: string[]; addons: string[] } }>("/api/kiosk-builder/configs/import", { method: "POST", body: JSON.stringify({ file }) });
      const missing = [...r.unmatched.services, ...r.unmatched.addons];
      toast({ title: `Imported "${r.config.name}"`, description: missing.length ? `Not on your menu, left off: ${missing.join(", ")}` : undefined });
      await load();
    } catch (e: any) { toast({ title: "Couldn't import the file", description: e.message, variant: "destructive" }); }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/settings/kiosk" className="text-slate-500 hover:text-slate-800" aria-label="Back"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Your kiosk configurations</h1>
            <p className="text-sm text-slate-500">A configuration is one design of your check-in kiosk. Make as many as you like; your kiosk shows the one you put on it.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setName(""); setStep(1); }} className="gap-1.5" data-testid="config-new"><Plus className="w-4 h-4" /> New kiosk configuration</Button>
          <Button variant="outline" className="gap-1.5" onClick={() => importRef.current?.click()}><Upload className="w-4 h-4" /> Import a file</Button>
          <input ref={importRef} type="file" accept=".json,application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
        {configs == null ? <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {configs.map((c) => (
              <div key={c.id} className={`rounded-2xl border bg-white p-4 space-y-3 ${c.live ? "border-slate-900" : "border-slate-200"}`} data-testid="config-card">
                {renaming?.id === c.id ? (
                  <div className="flex gap-2">
                    <Input value={renaming.name} maxLength={60} autoFocus onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
                      onKeyDown={async (e) => {
                        if (e.key === "Escape") setRenaming(null);
                        if (e.key === "Enter" && renaming.name.trim()) { await api(`/api/kiosk-builder/configs/${c.id}`, { method: "PATCH", body: JSON.stringify({ name: renaming.name }) }); setRenaming(null); void load(); }
                      }} />
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                      {c.live && <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-900 text-white" data-testid="config-live">On your kiosk now</span>}
                    </div>
                    <p className="text-xs text-slate-500">{BUILDERS[c.builder].name} · changed {new Date(c.updatedAt).toLocaleString()}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => navigate(`/kiosk-builder/${c.id}`)} data-testid="config-edit">Edit</Button>
                  {!c.live && (
                    <Button size="sm" variant="outline" data-testid="config-put" onClick={() => setConfirm({
                      title: `Put "${c.name}" on your kiosk?`, action: "Put on my kiosk",
                      body: "Your kiosk switches to it the next time no one is using it. You can switch back any time.",
                      run: async () => { await api(`/api/kiosk-builder/configs/${c.id}/publish`, { method: "POST", body: "{}" }); toast({ title: `"${c.name}" is on your kiosk` }); await load(); },
                    })}>Put on my kiosk</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={async () => { await api(`/api/kiosk-builder/configs/${c.id}/duplicate`, { method: "POST", body: "{}" }); void load(); }}>Copy</Button>
                  <Button size="sm" variant="ghost" asChild><a href={`/api/kiosk-builder/configs/${c.id}/export`} download>Export</a></Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenaming({ id: c.id, name: c.name })}>Rename</Button>
                  {!c.live && (
                    <Button size="sm" variant="ghost" onClick={() => setConfirm({
                      title: `Delete "${c.name}"?`, action: "Delete", body: "This configuration is deleted. Your kiosk doesn't change.",
                      run: async () => { await api(`/api/kiosk-builder/configs/${c.id}`, { method: "DELETE" }); await load(); },
                    })}>Delete</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── New kiosk configuration: 1 name, 2 builder ── */}
      <Dialog open={step > 0} onOpenChange={(o) => { if (!o && !creating) setStep(0); }}>
        <DialogContent className="sm:max-w-2xl" data-testid="config-new-dialog">
          <DialogHeader>
            <DialogTitle>{step === 1 ? "New kiosk configuration" : `Choose a builder for "${name.trim()}"`}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">Step {step} of 2</p>
          {step === 1 ? (
            <div className="space-y-3">
              <label className="block text-sm text-slate-700">
                Give it a name
                <Input className="mt-1" autoFocus maxLength={60} placeholder="For example: Spring menu" value={name} data-testid="config-new-name"
                  onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) setStep(2); }} />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setStep(0)}>Cancel</Button>
                <Button disabled={!name.trim()} onClick={() => setStep(2)} data-testid="config-new-next">Next</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                {(["easy", "picture"] as const).map((b) => (
                  <button key={b} type="button" disabled={creating} onClick={() => void create(b)} data-testid={`config-new-${b}`}
                    className="text-left rounded-2xl border-2 border-slate-200 hover:border-slate-900 p-5 space-y-2 disabled:opacity-60">
                    <p className="text-lg font-semibold text-slate-900">{BUILDERS[b].name}</p>
                    <p className="text-sm text-slate-600">{BUILDERS[b].about}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">A configuration keeps its builder. To try the other one, make another configuration.</p>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)} disabled={creating}>Back</Button>
                {creating && <span className="inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Making it…</span>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              const c = confirm; setConfirm(null);
              try { await c?.run(); } catch (e: any) { toast({ title: "Something went wrong", description: e.message, variant: "destructive" }); }
            }}>{confirm?.action}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
