/**
 * CheckPDFDownload — lazy wrapper around @react-pdf/renderer for one check sheet.
 *
 * Loaded only on the client (via React.lazy / Suspense in the parent) so
 * @react-pdf/renderer's heavy bundle doesn't block the initial render.
 *
 * Renders two actions for the same PDF:
 *   • Download PDF
 *   • Send to Printer — asks Certxa to build the check and print it on the salon's own printer through
 *     the Certxa Print Agent (a small Windows app on the salon PC; api-server/src/routes/printAgent.ts).
 *     The bank details for that PDF come from the salon computer, never from this page.
 *
 * Both include the salon's authorized signature when one is on file. Computers are paired and revoked
 * on the Print Checks page's Settings tab (components/print-agent/PrintAgentComputers.tsx). CheckSendToPrinter is also exported
 * for the Print Checks page's own "Send to Printer" button (one check or the whole run).
 */
import { useEffect, useState } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckDocumentPDF, type CheckPDFProps, type CheckPDFSignature } from "./CheckDocumentPDF";
import { Download, Printer, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type CheckPDFDownloadProps = CheckPDFProps & {
  filename?: string;
  /** Leave out the "Send to Printer" button (the page shows its own next to it). */
  hideSend?: boolean;
};

// ─── Signature ────────────────────────────────────────────────────────────────

type SignaturePlacement = { offsetPx: number; scale: number };
const DEFAULT_PLACEMENT: SignaturePlacement = { offsetPx: 0, scale: 1 };

/**
 * The salon's check signature, ready for the PDF. Uses the same query keys (and so the same cached
 * data) as the on-screen/printed check in PrintChecks.tsx — keep the two query functions in step.
 * `ready` is false until we know whether there is a signature, so a PDF is never made without one
 * just because it was still loading.
 */
function useCheckPdfSignature(): { signature: CheckPDFSignature | null; ready: boolean } {
  const image = useQuery<string | null>({
    queryKey: ["/api/check-signature"],
    queryFn: async () => {
      const res = await fetch("/api/check-signature", { credentials: "include", cache: "no-store" });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) return null;
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  const placement = useQuery<SignaturePlacement>({
    queryKey: ["/api/check-signature/placement"],
    queryFn: async () => {
      const res = await fetch("/api/check-signature/placement", { credentials: "include", cache: "no-store" });
      if (!res.ok) return DEFAULT_PLACEMENT;
      return res.json();
    },
    staleTime: Infinity,
    retry: false,
  });

  const src = image.data ?? null;
  // The PDF needs the image's proportions to fit it on the signature line.
  const [measured, setMeasured] = useState<{ src: string; aspect: number } | null>(null);
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setMeasured({ src, aspect: img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 0 }); };
    img.onerror = () => { if (!cancelled) setMeasured({ src, aspect: 0 }); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);

  if (image.isLoading || placement.isLoading) return { signature: null, ready: false };
  if (!src) return { signature: null, ready: true };
  if (!measured || measured.src !== src) return { signature: null, ready: false };
  const p = placement.data ?? DEFAULT_PLACEMENT;
  return { signature: { src, aspect: measured.aspect, offsetPx: p.offsetPx, scale: p.scale }, ready: true };
}

const ACTION_CLASS =
  "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60";

// ─── Send to the salon printer ────────────────────────────────────────────────

type PrintAgentInfo = { id: number; machineName: string | null; printerName: string | null; printerStatus: string | null; online: boolean; revokedAt: string | null; bankReady: boolean; isDefault: boolean };
type PrintJobInfo = { id: string; title: string; status: string; statusMessage: string | null };
type PrintAgentStatus = { agents: PrintAgentInfo[]; jobs: PrintJobInfo[] };

const JOB_DONE = new Set(["PRINTED", "FAILED", "CANCELLED", "EXPIRED", "UNCONFIRMED"]);

function jobLine(job: PrintJobInfo | null): { text: string; tone: "busy" | "good" | "bad" | "warn" } {
  if (!job) return { text: "Sending…", tone: "busy" };
  switch (job.status) {
    case "QUEUED":      return { text: "Waiting for the salon computer…", tone: "busy" };
    case "SENT":        return { text: "The salon computer is preparing it…", tone: "busy" };
    // The salon computer says what the printer is waiting on (paper, a jam, being offline); the check
    // stays queued there and prints once that is fixed.
    case "PRINTING":    return job.statusMessage
      ? { text: `Waiting for the printer — ${job.statusMessage}. It will print as soon as that is fixed.`, tone: "warn" }
      : { text: "Printing…", tone: "busy" };
    case "PRINTED":     return { text: "Printed.", tone: "good" };
    case "UNCONFIRMED": return { text: `Sent to the printer, but the printer never confirmed it finished. Check the paper before sending it again. ${job.statusMessage ?? ""}`, tone: "warn" };
    case "CANCELLED":   return { text: "Cancelled before printing.", tone: "warn" };
    case "EXPIRED":     return { text: job.statusMessage ?? "The salon computer never picked it up, so it was not printed.", tone: "bad" };
    default:            return { text: `Not printed. ${job.statusMessage ?? ""}`, tone: "bad" };
  }
}

/**
 * What Certxa stores for a check transaction: the check WITHOUT bank details. The routing and account
 * numbers and the bank's name/address are kept only on the salon computer (in the Print Agent) and are
 * added by the server for the one PDF it builds; the signature is added by the server from the one on
 * file. So none of those are sent from here — and the server drops them if they ever were.
 */
function checkWithoutBankDetails(p: CheckPDFProps) {
  const { routing: _r, account: _a, bankName: _n, bankAddress: _ad, bankCity: _c, bankPhone: _p, signature: _s, ...check } = p;
  return check;
}

/**
 * "Send to Printer" for one check or several. Each check is its own transaction; they are sent one
 * after another, in order, so they come out of the printer in check-number order.
 */
export function CheckSendToPrinter({ checks, label, className }: { checks: CheckPDFProps[]; label?: string; className?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  // One id per check, made when the dialog opens: a double click or a retry reuses it, so it can never print twice.
  const [requestIds, setRequestIds] = useState<string[]>([]);
  const [jobIds, setJobIds] = useState<(string | null)[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = useQuery<PrintAgentStatus>({
    queryKey: ["/api/print-agent/status"],
    queryFn: async () => {
      const res = await fetch("/api/print-agent/status", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not reach the salon printer service.");
      return res.json();
    },
    enabled: open,
    refetchInterval: open ? 2000 : false,
    retry: false,
  });

  const connected = (status.data?.agents ?? []).filter((a) => !a.revokedAt);
  // The check goes to the computer chosen on the Settings tab (or the only one). Show just that one;
  // with several and none chosen, any of them may print it, so show them all.
  const target = connected.find((a) => a.isDefault) ?? (connected.length === 1 ? connected[0] : null);
  const agents = target ? [target] : connected;
  const ready = agents.some((a) => a.online && a.bankReady && a.printerName);
  const jobOf = (id: string | null) => (id ? status.data?.jobs.find((j) => j.id === id) ?? null : null);
  const started = jobIds.length > 0;
  const allDone = started && jobIds.length === checks.length && jobIds.every((id) => { const j = jobOf(id); return !!j && JOB_DONE.has(j.status); });

  function openDialog() {
    setRequestIds(checks.map(() => crypto.randomUUID()));
    setJobIds([]); setError(null); setOpen(true);
  }
  function close() { setOpen(false); setJobIds([]); setError(null); setSending(false); }

  // One at a time: start the next check only when the previous one has finished (or failed).
  async function send() {
    setSending(true); setError(null);
    try {
      const ids: (string | null)[] = [];
      for (let i = 0; i < checks.length; i++) {
        const res = await fetch("/api/print-agent/checks", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientRequestId: requestIds[i], check: checkWithoutBankDetails(checks[i]) }),
        });
        const reply = await res.json().catch(() => null);
        if (!res.ok) throw new Error(reply?.error ?? "Could not send the check to the salon printer.");
        ids.push(reply.id);
        setJobIds([...ids]);
        if (i === checks.length - 1) break;
        // Wait for this one to finish before sending the next. Stop the batch if it did not print.
        let finished: PrintJobInfo | null = null;
        for (let waited = 0; waited < 520 && !finished; waited++) {   // up to ~13 min: the printer may be waiting on paper or a jam
          await new Promise((r) => setTimeout(r, 1500));
          const s = await fetch("/api/print-agent/status", { credentials: "include", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          const job = s?.jobs?.find((j: PrintJobInfo) => j.id === reply.id);
          if (job && JOB_DONE.has(job.status)) finished = job;
        }
        if (!finished || finished.status !== "PRINTED") {
          setError(`Stopped after Check #${checks[i].checkNumber} did not print. The remaining ${checks.length - i - 1} were not sent.`);
          break;
        }
      }
      qc.invalidateQueries({ queryKey: ["/api/print-agent/status"] });
    } catch (e: any) { setError(e.message); } finally { setSending(false); }
  }

  const tone = { busy: "text-slate-600", good: "text-emerald-700", bad: "text-red-700", warn: "text-amber-700" };
  const many = checks.length > 1;

  return (
    <>
      <button
        type="button"
        disabled={checks.length === 0}
        title="Print on the salon's printer through the Certxa Print Agent"
        className={className ?? ACTION_CLASS}
        onClick={openDialog}
        data-testid="check-send-to-printer"
      >
        <Printer className="h-4 w-4" />
        {label ?? "Send to Printer"}
      </button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send to the salon printer</DialogTitle>
          </DialogHeader>

          {status.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Checking the salon computer…</p>
          ) : status.isError ? (
            <p className="text-sm text-red-700">{(status.error as Error).message}</p>
          ) : (
            <div className="space-y-4 text-sm text-slate-700">
              {agents.length === 0 && (
                <p>
                  No salon computer is connected yet. Add one in{" "}
                  <a href="/print-checks?tab=settings" className="font-medium text-slate-900 underline">Print Checks → Settings</a>, then come back and send {many ? "these checks" : "this check"}.
                </p>
              )}

              {agents.map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="font-medium text-slate-900">{a.machineName ?? "Salon computer"}</div>
                  <div className="text-slate-500">{a.printerName ?? "No printer chosen in the Print Agent yet"}</div>
                  <div className={a.online ? "text-emerald-700" : "text-amber-700"}>
                    {a.online ? "Online" : "Offline — turn this computer on. A check waits up to 5 minutes, then is cancelled."}
                  </div>
                  {!a.bankReady && (
                    <div className="text-amber-700">Bank details are not set up on this computer. Open the Print Agent there and choose Bank Details.</div>
                  )}
                </div>
              ))}

              {connected.length > 1 && (
                <p className="text-xs text-slate-500">
                  {target ? "This is the computer chosen to print checks. " : "No computer is chosen to print checks, so whichever is on will print it. "}
                  <a href="/print-checks?tab=settings" className="underline">Change it in Settings</a>.
                </p>
              )}

              {agents.length > 0 && !started && (
                <div className="space-y-2">
                  <p>
                    {many
                      ? <>Send <span className="font-medium">{checks.length} checks</span> (#{checks[0].checkNumber}–#{checks[checks.length - 1].checkNumber}) to the salon printer?</>
                      : <>Send <span className="font-medium">Check #{checks[0]?.checkNumber}</span> for <span className="font-medium">{checks[0]?.payee}</span> to the salon printer?</>}
                    {" "}Make sure check paper is loaded.
                  </p>
                  <p className="text-xs text-slate-500">
                    Your bank's routing and account numbers stay on the salon computer. Certxa asks it for them for each check and does not keep them.
                  </p>
                </div>
              )}

              {started && (
                <ul className="space-y-1.5" data-testid="print-agent-job-status">
                  {checks.map((c, i) => {
                    const sent = i < jobIds.length;
                    const line = sent ? jobLine(jobOf(jobIds[i])) : { text: "Waiting its turn", tone: "busy" as const };
                    return (
                      <li key={c.checkNumber + i} className={`flex items-start gap-2 ${tone[line.tone]}`}>
                        {!sent ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                          : line.tone === "busy" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                          : line.tone === "good" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                          : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                        <span><span className="font-medium">#{c.checkNumber}</span> {c.payee} — {line.text}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {error && <p className="text-red-700">{error}</p>}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={close} className="rounded-xl">{allDone || (started && !sending) ? "Done" : "Close"}</Button>
            {agents.length > 0 && !started && (
              <Button onClick={send} disabled={sending || !ready} className="rounded-xl gap-2 bg-slate-800 hover:bg-slate-700">
                <Printer className="h-4 w-4" /> {many ? `Send ${checks.length} Checks` : "Send Check"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Exported wrapper ─────────────────────────────────────────────────────────

export function CheckPDFDownload({ filename, hideSend, ...props }: CheckPDFDownloadProps) {
  const defaultFilename = `check-${props.checkNumber}-${props.payee.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  const { signature, ready } = useCheckPdfSignature();

  return (
    <>
      {/* key: rebuild the PDF once the signature has loaded */}
      <PDFDownloadLink
        key={signature ? "signed" : "unsigned"}
        document={<CheckDocumentPDF {...props} signature={signature} />}
        fileName={filename ?? defaultFilename}
      >
        {({ loading, error }) => (
          <button
            disabled={loading || !!error || !ready}
            title={error ? "PDF generation failed" : "Download check as PDF"}
            className={ACTION_CLASS}
          >
            <Download className="h-4 w-4" />
            {loading || !ready ? "Generating…" : error ? "PDF error" : "Download PDF"}
          </button>
        )}
      </PDFDownloadLink>
      {!hideSend && <CheckSendToPrinter checks={[props]} />}
    </>
  );
}
