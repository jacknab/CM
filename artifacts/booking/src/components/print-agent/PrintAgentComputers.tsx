/**
 * Print Checks → Settings — the salon's check-printing computers (Certxa Print Agent).
 *
 * "Add Computer" generates a one-time setup code the owner types into the Print Agent on the salon
 * PC. The code lasts 5 minutes, works once, and only from the same internet connection it was
 * generated on (the server enforces all of that — see api-server/src/routes/printAgent.ts).
 * Each paired computer is listed with its printer and status and can be revoked.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor, Plus, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// Zipped: a much smaller download, and browsers hold up a bare .exe far longer than a .zip.
const INSTALLER_URL = "/downloads/CertxaPrintAgentSetup.zip";

type Agent = {
  id: number; machineName: string | null; printerName: string | null; printerStatus: string | null;
  agentVersion: string | null; lastSeenAt: string | null; pairedAt: string; revokedAt: string | null; online: boolean; bankReady: boolean; isDefault: boolean;
};
type Enrollment = { id: string; status: "PENDING" | "USED" | "EXPIRED" | "LOCKED" | "CANCELLED"; expiresAt: string; pairedDeviceId: number | null };
type Status = { storeName: string | null; agents: Agent[]; enrollment: Enrollment | null };

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} minute${Math.floor(s / 60) === 1 ? "" : "s"} ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour${Math.floor(s / 3600) === 1 ? "" : "s"} ago`;
  return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) === 1 ? "" : "s"} ago`;
}

/** "4:59" until the code expires; "" once it has. */
function useCountdown(expiresAt: string | null): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return "";
  const left = Math.floor((new Date(expiresAt).getTime() - now) / 1000);
  if (left <= 0) return "";
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

export function PrintAgentComputers() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [setup, setSetup] = useState<{ enrollmentId: string; code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const status = useQuery<Status>({
    queryKey: ["/api/print-agent/status"],
    queryFn: async () => {
      const res = await fetch("/api/print-agent/status", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not load your printers.");
      return res.json();
    },
    // Quick while a setup code is on screen (so the page flips to "connected" by itself), relaxed otherwise.
    refetchInterval: setup ? 2000 : 15000,
    retry: false,
  });

  const active = (status.data?.agents ?? []).filter((a) => !a.revokedAt);
  const revoked = (status.data?.agents ?? []).filter((a) => a.revokedAt);
  const enrollment = setup && status.data?.enrollment?.id === setup.enrollmentId ? status.data.enrollment : null;
  const countdown = useCountdown(setup?.expiresAt ?? null);
  const codeState: "live" | "used" | "locked" | "expired" =
    enrollment?.status === "USED" ? "used"
    : enrollment?.status === "LOCKED" ? "locked"
    : enrollment && enrollment.status !== "PENDING" ? "expired"
    : setup && !countdown ? "expired" : "live";

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/print-agent/enrollments", { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not create a setup code.");
      setSetup(body);
      qc.invalidateQueries({ queryKey: ["/api/print-agent/status"] });
    } catch (e: any) {
      toast({ title: "Couldn't create a setup code", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function revoke(agent: Agent) {
    const name = agent.machineName ?? "this computer";
    if (!window.confirm(`Revoke ${name}? It will stop receiving checks to print right away. To use it again you would add it as a new computer.`)) return;
    const res = await fetch(`/api/print-agent/agents/${agent.id}/revoke`, { method: "POST", credentials: "include" });
    if (!res.ok) { toast({ title: "Couldn't revoke that computer", variant: "destructive" }); return; }
    toast({ title: `${name} revoked` });
    qc.invalidateQueries({ queryKey: ["/api/print-agent/status"] });
  }

  async function makeDefault(agent: Agent) {
    const res = await fetch(`/api/print-agent/agents/${agent.id}/default`, { method: "POST", credentials: "include" });
    if (!res.ok) { toast({ title: "Couldn't change the check-printing computer", variant: "destructive" }); return; }
    toast({ title: `${agent.machineName ?? "That computer"} will print your checks` });
    qc.invalidateQueries({ queryKey: ["/api/print-agent/status"] });
  }

  function closeAdd() { setAdding(false); setSetup(null); }

  return (
    <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-5" data-testid="print-agent-computers">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Check-printing computers</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            A computer with the Certxa Print Agent prints the checks you send from Print Checks on its own printer.
            Your bank's routing and account numbers are kept on that computer, not by Certxa.
          </p>
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)} className="shrink-0 gap-2" data-testid="printers-add-computer">
            <Plus className="h-4 w-4" /> Add Computer
          </Button>
        )}
      </div>

      {status.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {status.isError && <p className="text-sm text-red-700">{(status.error as Error).message}</p>}

      {status.data && active.length === 0 && !adding && (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No computer is connected yet. Choose Add Computer to set one up — it takes about a minute.
        </p>
      )}

      {active.length > 1 && (
        <p className="text-[13px] text-muted-foreground">
          {active.some((a) => a.isDefault)
            ? "Checks you send from Print Checks go to the computer marked \"Prints your checks\". Choose \"Print checks here\" on another computer to switch."
            : "More than one computer is connected and none is chosen, so a check goes to whichever is on. Choose \"Print checks here\" on the one you want."}
        </p>
      )}

      {active.map((a) => (
        <div key={a.id} className="rounded-lg border border-border p-4" data-testid={`printer-computer-${a.id}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex items-start gap-3">
              <Monitor className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">{status.data?.storeName ? `${status.data.storeName} — ` : ""}{a.machineName ?? "Salon computer"}</div>
                {active.length > 1 && a.isDefault && (
                  <div className="mt-0.5 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    Prints your checks
                  </div>
                )}
                <div className={`mt-0.5 flex items-center gap-1.5 text-sm ${a.online ? "text-emerald-700" : "text-amber-700"}`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${a.online ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {a.online ? "Online" : "Offline"}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-8 sm:shrink-0 sm:pl-0">
              {/* Only a choice when there is more than one computer. */}
              {active.length > 1 && !a.isDefault && (
                <Button variant="outline" size="sm" onClick={() => makeDefault(a)} data-testid={`printer-computer-default-${a.id}`}>
                  Print checks here
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => revoke(a)} className="text-red-700 hover:text-red-800">
                Revoke Computer
              </Button>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pl-8 text-sm">
            <dt className="text-muted-foreground">Printer</dt>
            <dd>{a.printerName ? `${a.printerName}${a.printerStatus && a.printerStatus !== "Ready" ? ` (${a.printerStatus})` : ""}` : "Not chosen yet"}</dd>
            <dt className="text-muted-foreground">Bank details</dt>
            <dd className={a.bankReady ? "" : "text-amber-700"}>
              {a.bankReady ? "Saved on this computer only" : "Not set up — open the Print Agent on this computer and choose Bank Details"}
            </dd>
            <dt className="text-muted-foreground">Print Agent</dt>
            <dd>{a.agentVersion ? `v${a.agentVersion}` : "—"}</dd>
            <dt className="text-muted-foreground">Last connected</dt>
            <dd>{ago(a.lastSeenAt)}</dd>
          </dl>
        </div>
      ))}

      {adding && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4" data-testid="printers-add-panel">
          <ol className="space-y-3 text-sm">
            <li>
              <span className="font-medium">1. Install the Print Agent</span> on the Windows computer connected to your printer: download it, open the zip, and run CertxaPrintAgentSetup.exe.
              <div className="mt-2">
                <a href={INSTALLER_URL} download className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted">
                  <Download className="h-4 w-4" /> Download Certxa Print Agent (.zip)
                </a>
              </div>
            </li>
            <li>
              <span className="font-medium">2. Get a setup code</span> and type it into the Print Agent.
              <p className="mt-1 text-[13px] text-muted-foreground">
                Do this on the same internet connection as that computer — ideally in a browser on the computer itself.
              </p>
            </li>
          </ol>

          {!setup && (
            <Button onClick={generate} disabled={busy} data-testid="printers-generate-code">
              {busy ? "Generating…" : "Generate Setup Code"}
            </Button>
          )}

          {setup && codeState === "live" && (
            <div className="rounded-lg border border-border bg-background p-4 text-center">
              <div className="text-[13px] text-muted-foreground">Your setup code</div>
              <div className="my-1 font-mono text-3xl font-semibold tracking-[0.2em]" data-testid="printers-setup-code">{setup.code}</div>
              <div className="text-[13px] text-muted-foreground">Expires in {countdown} · works once</div>
            </div>
          )}
          {setup && codeState === "used" && (
            <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Computer connected. Now choose its printer in the Print Agent.</p>
          )}
          {setup && codeState === "locked" && (
            <p className="flex items-start gap-2 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> That code was entered incorrectly too many times and has been cancelled. Generate a new one.</p>
          )}
          {setup && codeState === "expired" && (
            <p className="flex items-start gap-2 text-sm text-amber-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> That code is no longer valid. Generate a new one.</p>
          )}

          <div className="flex gap-2">
            {setup && (codeState === "locked" || codeState === "expired") && (
              <Button onClick={generate} disabled={busy}>Generate Setup Code</Button>
            )}
            <Button variant="outline" onClick={closeAdd}>{codeState === "used" ? "Done" : "Cancel"}</Button>
          </div>
        </div>
      )}

      {revoked.length > 0 && (
        <div className="border-t border-border pt-4">
          <h3 className="text-[13px] font-medium text-muted-foreground">Revoked</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {revoked.map((a) => (
              <li key={a.id}>{a.machineName ?? "Salon computer"} — revoked {ago(a.revokedAt)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
