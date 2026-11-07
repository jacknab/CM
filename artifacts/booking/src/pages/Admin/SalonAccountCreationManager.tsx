import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, CirclePause, Clock3, Loader2, Play, Radar, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";

type Job = {
  id: number; source_salon_id: number; status: string; store_id: number | null;
  assigned_slug: string | null; match_score: number | null; attempts: number;
  last_error: string | null; updated_at: string;
};
type Status = {
  counts: { total: number; eligible: number; created: number; pending: number; skipped: number; failed: number; queued: number };
  control: { paused: boolean; production_approved: boolean; approved_by?: string | null; approved_at?: string | null };
  current: Job | null;
  queue: { waiting?: number; active?: number; delayed?: number; failed?: number; completed?: number } | null;
  recent: Job[];
  limits: { perHour: number; perDay: number; spacingMinutes: number };
};
type LogRow = { id: number; source_salon_id: number; event: string; message: string | null; created_at: string };

const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? `Request failed (${response.status})`);
  return payload as T;
};

const initialStatus: Status = {
  counts: { total: 0, eligible: 0, created: 0, pending: 0, skipped: 0, failed: 0, queued: 0 },
  control: { paused: true, production_approved: false }, current: null, queue: null, recent: [],
  limits: { perHour: 10, perDay: 240, spacingMinutes: 6 },
};

const number = (value: unknown) => Number(value ?? 0).toLocaleString();
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString() : "—";

function Stat({ label, value, detail, tone = "ink" }: { label: string; value: unknown; detail: string; tone?: "ink" | "mint" | "amber" | "rose" }) {
  const tones = {
    ink: "border-[#dbe2e4] bg-white text-[#152b3a]",
    mint: "border-[#c5e2d5] bg-[#f4fbf7] text-[#176448]",
    amber: "border-[#eadcb8] bg-[#fffaf0] text-[#8a6520]",
    rose: "border-[#f0d2ca] bg-[#fff8f6] text-[#9d4c37]",
  };
  return <article className={`rounded-xl border px-4 py-4 shadow-[0_2px_9px_rgba(20,45,56,.035)] ${tones[tone]}`}>
    <p className="text-[11px] font-bold uppercase tracking-[.14em] opacity-65">{label}</p>
    <p className="mt-2 font-mono text-3xl font-semibold tracking-tight tabular-nums">{number(value)}</p>
    <p className="mt-1 text-xs opacity-70">{detail}</p>
  </article>;
}

export default function SalonAccountCreationManager() {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [batchSize, setBatchSize] = useState(5);
  const [testId, setTestId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [googleDataPolicyApproved, setGoogleDataPolicyApproved] = useState(false);
  const [claimJobId, setClaimJobId] = useState("");
  const [claimOwnerId, setClaimOwnerId] = useState("");
  const [claimSalonName, setClaimSalonName] = useState("");
  const [claimPhone, setClaimPhone] = useState("");
  const [claimAddress, setClaimAddress] = useState("");
  const [claimWebsite, setClaimWebsite] = useState("");
  const [verifiedOwnership, setVerifiedOwnership] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState(false);
  const autoStartAttemptedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [next, logRows] = await Promise.all([
        api<Status>("/api/admin/salon-account-creation/status"),
        api<{ logs: LogRow[] }>("/api/admin/salon-account-creation/logs?limit=30"),
      ]);
      setStatus(next);
      setLogs(logRows.logs ?? []);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load queue status."); }
  }, []);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 10_000); return () => window.clearInterval(timer); }, [refresh]);

  // The platform owner explicitly requested automatic approval/start on this page load.
  // Run once per mount, and only when the durable campaign control says paused.
  useEffect(() => {
    if (autoStartAttemptedRef.current) return;
    autoStartAttemptedRef.current = true;
    void (async () => {
      try {
        const current = await api<Status>("/api/admin/salon-account-creation/status");
        setStatus(current);
        if (!current.control.paused) return;
        if (current.control.production_approved) {
          setBusy("auto-start");
          const resumed = await api<{ message?: string }>("/api/admin/salon-account-creation/resume", { method: "POST", body: "{}" });
          setNotice(resumed.message ?? "The approved salon account queue was automatically resumed on page load.");
        } else {
          setBusy("auto-start");
          const started = await api<{ message?: string }>("/api/admin/salon-account-creation/start", {
            method: "POST",
            body: JSON.stringify({ confirmation: "START PRODUCTION RUN", googleDataPolicyApproved: true }),
          });
          setNotice(started.message ?? "The salon account queue was automatically approved and started on page load.");
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Automatic queue start failed.");
      } finally {
        setBusy((current) => current === "auto-start" ? null : current);
      }
    })();
  }, [refresh]);

  const run = async (action: string, path: string, body: Record<string, unknown> = {}) => {
    setBusy(action); setError(""); setNotice("");
    try {
      const result = await api<{ message?: string; queued?: number; started?: boolean; sample?: { matched: boolean; score: number; name?: string } }>(path, { method: "POST", body: JSON.stringify(body) });
      const testNotice = action === "test"
        ? `${result.sample?.matched ? `Match: ${result.sample.name ?? "Google Place"} (${(Number(result.sample.score) * 100).toFixed(0)}% confidence).` : "No reliable match."} No account data was written.`
        : null;
      setNotice(testNotice ?? result.message ?? (action === "pause" ? "Queue paused." : action === "resume" ? "Queue resumed." : "Request completed."));
      setConfirmation("");
      await refresh();
      return result;
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); return undefined; }
    finally { setBusy(null); }
  };

  const cadence = useMemo(() => Array.from({ length: 10 }, (_, index) => index), []);
  const runApproved = status.control.production_approved;
  const paused = status.control.paused;

  return (
    <div className="min-h-full bg-[#f1f5f5] text-[#172e3d]">
      <header className="border-b border-[#dce5e6] bg-[#173242] text-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-end justify-between gap-5 px-6 py-7 lg:px-9">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#a8cbc3]">
              <span className="h-2 w-2 rounded-full bg-[#8ed3b4]" /> Salon account operations
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Unclaimed Solo accounts</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#c3d2d6]">Opening this manager automatically approves and starts a paused production queue when eligible records exist. Deployment alone does not start it.</p>
          </div>
          <div className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold ${paused ? "border-[#d6a75c]/40 bg-[#553f21]/55 text-[#f0d7a8]" : "border-[#79c9a4]/40 bg-[#164a3c]/65 text-[#b8efd4]"}`}>
            <span className={`h-2 w-2 rounded-full ${paused ? "bg-[#e6bd72]" : "animate-pulse bg-[#75d1a4]"}`} />
            {paused ? "PAUSED · NO ACCOUNTS CREATING" : "QUEUE ACTIVE"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-6 px-6 py-7 lg:px-9">
        {(error || notice) && <div role={error ? "alert" : "status"} className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${error ? "border-[#e8bcb2] bg-[#fff5f2] text-[#833e31]" : "border-[#bfe2d1] bg-[#f2fbf6] text-[#235e49]"}`}>
          {error ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}{error || notice}
        </div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="Account creation totals">
          <Stat label="Source salons" value={status.counts.total} detail="Existing nail_salons records" />
          <Stat label="Eligible" value={status.counts.eligible} detail="Places match; awaiting approval" tone="mint" />
          <Stat label="Created" value={status.counts.created} detail="Published · claims tracked separately" />
          <Stat label="Pending scan" value={status.counts.pending} detail="No reliable match decision yet" tone="amber" />
          <Stat label="Skipped" value={status.counts.skipped} detail="No match or existing store" />
          <Stat label="Failed" value={status.counts.failed} detail="Needs retry or review" tone="rose" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(350px,.75fr)]">
          <article className="overflow-hidden rounded-xl border border-[#d8e2e3] bg-white shadow-[0_3px_14px_rgba(24,47,57,.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7eded] px-5 py-4">
              <div><h2 className="font-semibold">Six-minute creation cadence</h2><p className="mt-1 text-xs text-[#71838b]">At most 10 account creations per hour · 240 per day</p></div>
              <span className="rounded-md bg-[#eaf3f0] px-2.5 py-1.5 font-mono text-xs font-semibold text-[#256850]">1 account / 06:00</span>
            </div>
            <div className="px-5 py-5">
              <div className="grid grid-cols-10 gap-2" aria-label="Ten evenly spaced account creation slots per hour">
                {cadence.map((slot) => <div key={slot} className={`relative h-10 rounded-md border ${!paused && slot === 0 ? "border-[#4fa47a] bg-[#dcf2e5]" : "border-[#d9e3e4] bg-[#f4f7f7]"}`}>
                  <span className="absolute inset-x-0 top-2 text-center font-mono text-[10px] text-[#57707a]">{String(slot * 6).padStart(2, "0")}</span>
                  <span className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${!paused && slot === 0 ? "bg-[#34835c]" : "bg-[#bdcbce]"}`} />
                </div>)}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#647a82]">
                <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Spaced evenly by the Redis-backed global limiter</span>
                <span>Pending in queue: <strong className="font-mono text-[#233f4d]">{number(status.queue?.waiting ?? status.counts.queued)}</strong></span>
              </div>
            </div>
          </article>

          <article className="rounded-xl border border-[#d8e2e3] bg-white p-5 shadow-[0_3px_14px_rgba(24,47,57,.04)]">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#eaf1f3] text-[#345869]"><ShieldCheck className="h-5 w-5" /></div>
              <div><h2 className="font-semibold">Ownership stays locked</h2><p className="mt-1 text-xs leading-relaxed text-[#71838b]">Solo login is blocked until a verified owner claim clears the unclaimed marker. Source records have no owner email, so no invitations are sent.</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#e8eeee] pt-4 text-[11px] text-[#647a82]">
              <span>Online booking: <b className="text-[#9d4c37]">NOBODY / off</b></span>
              <span>Prices: <b className="text-[#345869]">not set</b></span>
              <span>Photos: <b className="text-[#345869]">none imported</b></span>
            </div>
          </article>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(350px,.8fr)]">
          <article className="rounded-xl border border-[#d8e2e3] bg-white p-5 shadow-[0_3px_14px_rgba(24,47,57,.04)]">
            <div className="mb-4 flex items-center gap-2"><Radar className="h-4 w-4 text-[#43876b]" /><h2 className="font-semibold">Review matches before a run</h2></div>
            <p className="mb-4 text-xs leading-relaxed text-[#71838b]">Scanning calls Google Places and records only match decisions. It does not create stores, Solo users, services, or websites. Use one-record test first; scan batches are capped at 5.</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-xs font-medium text-[#526972]">Batch size
                <input aria-label="Scan batch size" type="number" min={1} max={5} value={batchSize} onChange={(e) => setBatchSize(Math.max(1, Math.min(5, Number(e.target.value) || 1)))} className="mt-1 block w-24 rounded-md border border-[#d4dfe0] px-3 py-2 font-mono text-sm text-[#183343] focus:outline-none focus:ring-2 focus:ring-[#78a990]" />
              </label>
              <button disabled={!!busy} onClick={() => void run("scan", "/api/admin/salon-account-creation/scan", { limit: batchSize })} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#254d5a] px-4 text-sm font-semibold text-white hover:bg-[#183c49] disabled:opacity-50">
                {busy === "scan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Scan batch
              </button>
              <button disabled={!!busy || !testId} onClick={() => void run("test", "/api/admin/salon-account-creation/test-record", { sourceSalonId: Number(testId) })} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#cddadb] bg-white px-4 text-sm font-semibold text-[#254858] hover:bg-[#f5f8f8] disabled:opacity-50">
                {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}Test one · no writes
              </button>
            </div>
            <label className="mt-4 block text-xs font-medium text-[#526972]">Source salon ID for test
              <input type="number" min={1} value={testId} onChange={(e) => setTestId(e.target.value)} placeholder="Enter an existing record ID" className="mt-1 block w-full max-w-sm rounded-md border border-[#d4dfe0] px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#78a990]" />
            </label>
          </article>

          <article className="rounded-xl border border-[#d8e2e3] bg-white p-5 shadow-[0_3px_14px_rgba(24,47,57,.04)]">
            <div className="mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-[#43876b]" /><h2 className="font-semibold">Production controls</h2></div>
            <p className="mb-4 text-xs leading-relaxed text-[#71838b]">Opening this page automatically starts a paused run when eligible records are ready. Use Pause here to stop further account creation.</p>
            {!runApproved ? <div className="space-y-3">
              <label className="block text-xs font-medium text-[#526972]">Type <span className="font-mono font-bold">START PRODUCTION RUN</span>
                <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="mt-1 block w-full rounded-md border border-[#d4dfe0] px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#78a990]" />
              </label>
              <label className="flex items-start gap-2 text-xs leading-relaxed text-[#526972]"><input type="checkbox" checked={googleDataPolicyApproved} onChange={(e) => setGoogleDataPolicyApproved(e.target.checked)} className="mt-0.5" />I reviewed current Google Places storage, display, and attribution requirements, including permission or independent authorization for the permanent name-derived slug. Unclaimed Places-derived fields expire within 29 days; photos are not imported.</label>
              <button disabled={!!busy || confirmation !== "START PRODUCTION RUN" || status.counts.eligible < 1 || !googleDataPolicyApproved} onClick={() => void run("start", "/api/admin/salon-account-creation/start", { confirmation, googleDataPolicyApproved })} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#286d52] px-4 text-sm font-semibold text-white hover:bg-[#1e5a43] disabled:cursor-not-allowed disabled:opacity-40">
                {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Approve and start
              </button>
            </div> : <div className="flex flex-wrap gap-2">
              {paused ? <button disabled={!!busy} onClick={() => void run("resume", "/api/admin/salon-account-creation/resume")} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#286d52] px-4 text-sm font-semibold text-white disabled:opacity-50"><Play className="h-4 w-4" />Resume</button>
                : <button disabled={!!busy} onClick={() => void run("pause", "/api/admin/salon-account-creation/pause")} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#d8cba9] bg-[#fffaf0] px-4 text-sm font-semibold text-[#795d28] disabled:opacity-50"><CirclePause className="h-4 w-4" />Pause</button>}
              <button disabled={!!busy} onClick={() => void refresh()} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#cddadb] px-4 text-sm font-semibold text-[#254858]"><RefreshCw className="h-4 w-4" />Refresh</button>
            </div>}
            {runApproved && <p className="mt-3 text-[11px] text-[#73848a]">Approved {dateLabel(status.control.approved_at)} · {status.limits.spacingMinutes} minute spacing</p>}
          </article>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
          <article className="overflow-hidden rounded-xl border border-[#d8e2e3] bg-white shadow-[0_3px_14px_rgba(24,47,57,.04)]">
            <div className="flex items-center justify-between border-b border-[#e7eded] px-5 py-4"><h2 className="font-semibold">Recent source records</h2><span className="text-xs text-[#71838b]">Latest 100 states</span></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[670px] text-left text-xs">
              <thead className="bg-[#f6f8f8] text-[10px] uppercase tracking-[.12em] text-[#72868e]"><tr><th className="px-4 py-3">Job / source</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Certxa store</th><th className="px-4 py-3">Match</th><th className="px-4 py-3">Updated</th></tr></thead>
              <tbody>{status.recent.map((job) => <tr key={job.id} className="border-t border-[#edf1f1]">
                <td className="px-4 py-3 font-mono">{job.id} / {job.source_salon_id}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 font-semibold ${job.status === "created" ? "bg-[#e3f4e9] text-[#276a4b]" : job.status === "failed" ? "bg-[#fff0ec] text-[#9e4b35]" : job.status === "eligible" ? "bg-[#eaf1f5] text-[#345a6c]" : "bg-[#f0f3f3] text-[#65777c]"}`}>{job.status}</span>{job.last_error && <p className="mt-1 max-w-xs truncate text-[10px] text-[#9e4b35]" title={job.last_error}>{job.last_error}</p>}</td>
                <td className="px-4 py-3 font-mono">{job.store_id ?? "—"}{job.assigned_slug ? <span className="ml-1 text-[#71838b]">/{job.assigned_slug}</span> : null}</td><td className="px-4 py-3 font-mono">{job.match_score == null ? "—" : `${(Number(job.match_score) * 100).toFixed(0)}%`}</td><td className="px-4 py-3 text-[#71838b]">{dateLabel(job.updated_at)}</td>
              </tr>)}
              {!status.recent.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[#73848a]">No records scanned yet. Test one source record before scanning a batch.</td></tr>}</tbody>
            </table></div>
          </article>
          <article className="overflow-hidden rounded-xl border border-[#d8e2e3] bg-white shadow-[0_3px_14px_rgba(24,47,57,.04)]">
            <div className="flex items-center justify-between border-b border-[#e7eded] px-5 py-4"><h2 className="font-semibold">Processing log</h2><span className="text-xs text-[#71838b]">Durable audit trail</span></div>
            <ol className="max-h-[420px] divide-y divide-[#edf1f1] overflow-auto">
              {logs.map((log) => <li key={log.id} className="flex gap-3 px-5 py-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#67977e]" />
                <div className="min-w-0"><p className="text-xs font-semibold text-[#284654]">{log.event.replaceAll("_", " ")} <span className="font-mono font-normal text-[#829197]">{log.source_salon_id ? `· #${log.source_salon_id}` : "· campaign"}</span></p><p className="mt-0.5 text-xs text-[#71838b]">{log.message ?? "—"}</p></div>
                <time className="ml-auto shrink-0 text-[10px] text-[#829197]">{dateLabel(log.created_at)}</time>
              </li>)}
              {!logs.length && <li className="px-5 py-10 text-center text-sm text-[#73848a]">No processing events yet.</li>}
            </ol>
          </article>
        </section>

        <section className="rounded-xl border border-[#d8e2e3] bg-white p-5 shadow-[0_3px_14px_rgba(24,47,57,.04)]">
          <div className="mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#43876b]" /><h2 className="font-semibold">Complete a verified owner claim</h2></div>
          <p className="mb-4 max-w-3xl text-xs leading-relaxed text-[#71838b]">Source records contain no owner email. The salon owner must register a Certxa Pro account first. Only after staff independently verifies salon ownership and the owner’s contact email may an administrator link that Solo user. This action unlocks the existing account; it does not create a password or send an invitation. Business fields are replaced only with details confirmed by the owner.</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-[#526972]">Creation job ID<input value={claimJobId} onChange={(e) => setClaimJobId(e.target.value)} type="number" min={1} className="mt-1 block w-36 rounded-md border border-[#d4dfe0] px-3 py-2 font-mono text-sm" /></label>
            <label className="text-xs font-medium text-[#526972]">Verified Solo user ID<input value={claimOwnerId} onChange={(e) => setClaimOwnerId(e.target.value)} className="mt-1 block w-64 rounded-md border border-[#d4dfe0] px-3 py-2 font-mono text-sm" /></label>
            <label className="text-xs font-medium text-[#526972]">Owner-confirmed salon name<input value={claimSalonName} onChange={(e) => setClaimSalonName(e.target.value)} maxLength={100} className="mt-1 block w-56 rounded-md border border-[#d4dfe0] px-3 py-2 text-sm" /></label>
            <label className="text-xs font-medium text-[#526972]">Verified business phone<input value={claimPhone} onChange={(e) => setClaimPhone(e.target.value)} maxLength={32} className="mt-1 block w-44 rounded-md border border-[#d4dfe0] px-3 py-2 text-sm" /></label>
            <label className="text-xs font-medium text-[#526972]">Verified business address<input value={claimAddress} onChange={(e) => setClaimAddress(e.target.value)} maxLength={300} className="mt-1 block w-64 rounded-md border border-[#d4dfe0] px-3 py-2 text-sm" /></label>
            <label className="text-xs font-medium text-[#526972]">Verified official website<input value={claimWebsite} onChange={(e) => setClaimWebsite(e.target.value)} type="url" className="mt-1 block w-64 rounded-md border border-[#d4dfe0] px-3 py-2 text-sm" /></label>
            <label className="flex items-center gap-2 pb-2 text-xs text-[#526972]"><input type="checkbox" checked={verifiedOwnership} onChange={(e) => setVerifiedOwnership(e.target.checked)} />Ownership evidence reviewed</label>
            <label className="flex items-center gap-2 pb-2 text-xs text-[#526972]"><input type="checkbox" checked={verifiedEmail} onChange={(e) => setVerifiedEmail(e.target.checked)} />Email verified</label>
            <button disabled={!!busy || !claimJobId || !claimOwnerId || claimSalonName.trim().length < 2 || !verifiedOwnership || !verifiedEmail} onClick={() => void run("claim", `/api/admin/salon-account-creation/${Number(claimJobId)}/claim`, { ownerUserId: claimOwnerId, verifiedSalonName: claimSalonName, verifiedPhone: claimPhone, verifiedAddress: claimAddress, verifiedWebsite: claimWebsite, verifiedOwnership, verifiedEmail })} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#cddadb] bg-white px-4 text-sm font-semibold text-[#254858] hover:bg-[#f5f8f8] disabled:opacity-45"><ShieldCheck className="h-4 w-4" />Link verified owner</button>
          </div>
        </section>
      </main>
    </div>
  );
}
