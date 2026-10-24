/**
 * Payroll → 1099s (plans/1099-filing-taxbandits.md, 2026-10-24): the salon's details as payer, each contractor's total
 * for the tax year and what is missing, buying a filing package (Stripe), and each filed form's status (TaxBandits).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChevronLeft, Loader2, RefreshCw } from "lucide-react";

interface Contractor {
  staffId: number; name: string; legalName: string | null; workerType: string | null; amount: number;
  overThreshold: boolean; missing: string[]; ready: boolean;
  filing: { orderId: number; federalStatus: string | null; copyStatus: string | null } | null;
}
interface Summary {
  year: number; threshold: number; pricePerFormCents: number; mailPerFormCents: number;
  payerReady: boolean; filingAvailable: boolean; sandbox: boolean; contractors: Contractor[];
}
interface Payer {
  storageReady: boolean; legalName: string; einLast4: string | null; address1: string; address2: string; city: string; state: string; zip: string;
  contactFirstName: string; contactLastName: string; phone: string; email: string;
}
interface OrderForm { id: number; staff_id: number; recipient_name: string; amount: string; federal_status: string | null; state_status: string | null; copy_status: string | null; errors: any; canRefile: boolean; refile_count: number; status_checked_at: string | null }
interface Order { id: number; status: string; form_count: number; mail_copies: boolean; total_cents: number; paid_at: string | null; filed_at: string | null; last_error: string | null; forms: OrderForm[] }

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const errorText = (e: any) => { const raw = String(e?.message ?? "").replace(/^\d+:\s*/, ""); try { const j = JSON.parse(raw); return j.problems?.length ? `${j.error} ${j.problems.join(" · ")}` : j.error ?? raw; } catch { return raw || "Something went wrong"; } };
const STATUS_TEXT: Record<string, string> = {
  CREATED: "Created", TRANSMITTED: "Sent to the IRS", ORDER_RECEIVED: "Received", UNDER_PROCESS: "Being processed",
  SENT_TO_AGENCY: "Sent to the IRS", ACCEPTED: "Accepted by the IRS", REJECTED: "Rejected — needs a fix", ERROR: "Not filed — needs a fix",
  ORDER_CREATED: "Copy being prepared",
};
const statusText = (s: string | null) => (s ? STATUS_TEXT[s] ?? s.replace(/_/g, " ").toLowerCase() : "—");

export default function TeamTax1099() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const thisYear = new Date().getFullYear();
  // In January–April the 1099s being filed are for last year.
  const defaultYear = new Date().getMonth() <= 3 ? thisYear - 1 : thisYear;
  const year = Number(params.get("year")) || defaultYear;

  const summary = useQuery<Summary>({
    queryKey: ["/api/tax-filing/summary", year],
    queryFn: async () => { const r = await fetch(`/api/tax-filing/summary?year=${year}`, { credentials: "include" }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Couldn't load"); return r.json(); },
  });
  const orders = useQuery<{ orders: Order[] }>({
    queryKey: ["/api/tax-filing/orders", year],
    queryFn: async () => (await fetch(`/api/tax-filing/orders?year=${year}`, { credentials: "include" })).json(),
  });
  const payerQ = useQuery<Payer>({
    queryKey: ["/api/tax-filing/payer"],
    queryFn: async () => (await fetch(`/api/tax-filing/payer`, { credentials: "include" })).json(),
  });

  // Back from Stripe: confirm the payment (files the forms) and show the order.
  useEffect(() => {
    const orderId = params.get("order");
    if (!orderId) return;
    void apiRequest("POST", `/api/tax-filing/orders/${orderId}/confirm`).finally(() => {
      setTimeout(() => { qc.invalidateQueries({ queryKey: ["/api/tax-filing/orders", year] }); qc.invalidateQueries({ queryKey: ["/api/tax-filing/summary", year] }); }, 2500);
      const next = new URLSearchParams(params); next.delete("order"); setParams(next, { replace: true });
      toast({ title: "Payment received — filing your 1099s" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── payer form ──
  const [payer, setPayer] = useState<Payer | null>(null);
  const [ein, setEin] = useState("");
  const [savingPayer, setSavingPayer] = useState(false);
  useEffect(() => { if (payerQ.data) { setPayer(payerQ.data); setEin(""); } }, [payerQ.data]);
  const savePayer = async () => {
    if (!payer) return;
    setSavingPayer(true);
    try {
      await apiRequest("PUT", "/api/tax-filing/payer", { ...payer, ...(ein.trim() ? { ein } : {}) });
      await qc.invalidateQueries({ queryKey: ["/api/tax-filing/payer"] });
      await qc.invalidateQueries({ queryKey: ["/api/tax-filing/summary", year] });
      toast({ title: "Salon details saved" });
    } catch (e) { toast({ title: errorText(e), variant: "destructive" }); } finally { setSavingPayer(false); }
  };

  // ── choosing and buying ──
  const s = summary.data;
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [mailCopies, setMailCopies] = useState(false);
  const [buying, setBuying] = useState(false);
  useEffect(() => {
    // Everyone ready, over the threshold and not filed yet is chosen to start with.
    if (s) setChosen(new Set(s.contractors.filter((c) => c.ready && c.overThreshold && !c.filing).map((c) => c.staffId)));
  }, [s]);
  const total = useMemo(() => (s ? chosen.size * (s.pricePerFormCents + (mailCopies ? s.mailPerFormCents : 0)) / 100 : 0), [s, chosen, mailCopies]);
  const buy = async () => {
    setBuying(true);
    try {
      const r = await apiRequest("POST", "/api/tax-filing/checkout", { year, staffIds: [...chosen], mailCopies });
      const d = await r.json();
      if (d.url) window.location.href = d.url;
    } catch (e) { toast({ title: errorText(e), variant: "destructive" }); setBuying(false); }
  };
  const [refiling, setRefiling] = useState<number | null>(null);
  const refile = async (formId: number) => {
    setRefiling(formId);
    try {
      const d = await (await apiRequest("POST", `/api/tax-filing/forms/${formId}/refile`)).json();
      toast({ title: d.federalStatus === "ERROR" ? "Still has a problem — see below" : "Sent again", variant: d.federalStatus === "ERROR" ? "destructive" : undefined });
      await qc.invalidateQueries({ queryKey: ["/api/tax-filing/orders", year] });
    } catch (e) { toast({ title: errorText(e), variant: "destructive" }); } finally { setRefiling(null); }
  };
  const refresh = async (orderId: number) => {
    try { await apiRequest("POST", `/api/tax-filing/orders/${orderId}/refresh`); await qc.invalidateQueries({ queryKey: ["/api/tax-filing/orders", year] }); }
    catch (e) { toast({ title: errorText(e), variant: "destructive" }); }
  };

  const field = (label: string, node: React.ReactNode) => <div className="space-y-1.5"><label className="text-[15px] font-medium">{label}</label>{node}</div>;
  const set = <K extends keyof Payer>(k: K, v: Payer[K]) => setPayer((p) => (p ? { ...p, [k]: v } : p));

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 space-y-6">
        <div>
          <button onClick={() => navigate("/payroll")} className="mb-3 flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <ChevronLeft className="h-4 w-4" /> Payroll
          </button>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">1099s for {year}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Contractors paid {s ? money(s.threshold) : "$2,000"} or more in {year} need a 1099-NEC, due to them and the IRS by January 31.
              </p>
            </div>
            <div className="flex gap-1">
              {[thisYear - 1, thisYear].map((y) => (
                <Button key={y} variant={y === year ? "default" : "outline"} size="sm" onClick={() => setParams({ year: String(y) })}>{y}</Button>
              ))}
            </div>
          </header>
          {s?.sandbox && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Test mode: forms go to the TaxBandits sandbox, not the IRS.</p>}
        </div>

        {/* Salon (payer) */}
        <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Your salon's details</h2>
            <p className="text-sm text-muted-foreground">Printed on every 1099 as the payer. Use the name and EIN the IRS has for your business.</p>
          </div>
          {!payer ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
            <>
              {field("Legal business name", <Input value={payer.legalName} onChange={(e) => set("legalName", e.target.value)} className="text-[15px]" />)}
              {field("EIN", <Input value={ein} onChange={(e) => setEin(e.target.value)} autoComplete="off" disabled={!payer.storageReady}
                placeholder={payer.einLast4 ? `On file: ending ${payer.einLast4} — type to replace` : "12-3456789"} className="text-[15px]" />)}
              {field("Address", <Input value={payer.address1} onChange={(e) => set("address1", e.target.value)} className="text-[15px]" />)}
              {field("Suite / unit", <Input value={payer.address2} onChange={(e) => set("address2", e.target.value)} className="text-[15px]" />)}
              <div className="grid gap-4 sm:grid-cols-[1fr_6rem_8rem]">
                {field("City", <Input value={payer.city} onChange={(e) => set("city", e.target.value)} className="text-[15px]" />)}
                {field("State", <Input value={payer.state} maxLength={2} onChange={(e) => set("state", e.target.value.toUpperCase())} className="text-[15px]" />)}
                {field("ZIP", <Input value={payer.zip} maxLength={10} onChange={(e) => set("zip", e.target.value)} className="text-[15px]" />)}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("Contact first name", <Input value={payer.contactFirstName} onChange={(e) => set("contactFirstName", e.target.value)} className="text-[15px]" />)}
                {field("Contact last name", <Input value={payer.contactLastName} onChange={(e) => set("contactLastName", e.target.value)} className="text-[15px]" />)}
                {field("Phone", <Input type="tel" value={payer.phone} onChange={(e) => set("phone", e.target.value)} className="text-[15px]" />)}
                {field("Email", <Input type="email" value={payer.email} onChange={(e) => set("email", e.target.value)} className="text-[15px]" />)}
              </div>
              <div className="flex justify-end"><Button onClick={savePayer} disabled={savingPayer}>{savingPayer ? "Saving…" : "Save"}</Button></div>
            </>
          )}
        </section>

        {/* Contractors */}
        <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Contractors</h2>
          {summary.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : !s || s.contractors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one was paid through payroll in {year}.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {s.contractors.map((c) => (
                <div key={c.staffId} className="flex items-start gap-3 px-3 py-3">
                  <Checkbox className="mt-1" checked={chosen.has(c.staffId)} disabled={!c.ready || !!c.filing}
                    onCheckedChange={(v) => setChosen((cur) => { const n = new Set(cur); v ? n.add(c.staffId) : n.delete(c.staffId); return n; })} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <button type="button" onClick={() => navigate(`/team/${c.staffId}`)} className="text-[15px] font-medium hover:underline">{c.legalName || c.name}</button>
                      <span className="text-[15px] font-semibold tabular-nums">{money(c.amount)}</span>
                    </div>
                    {c.filing ? (
                      <p className="text-sm text-emerald-700">1099 ordered · {statusText(c.filing.federalStatus)}</p>
                    ) : c.missing.length ? (
                      <p className="text-sm text-amber-700">Missing: {c.missing.join(" · ")} — <button type="button" className="underline" onClick={() => navigate(`/team/${c.staffId}`)}>fix on Payroll &amp; Tax</button></p>
                    ) : !c.overThreshold ? (
                      <p className="text-sm text-muted-foreground">Under {money(s.threshold)} — a 1099 isn't required</p>
                    ) : <p className="text-sm text-muted-foreground">Ready to file</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {s && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[15px] font-medium">Mail each contractor a paper copy</p>
                  <p className="text-sm text-muted-foreground">Every contractor gets an email to view their 1099 online. A mailed copy is {money(s.mailPerFormCents / 100)} more each.</p>
                </div>
                <Switch checked={mailCopies} onCheckedChange={setMailCopies} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[15px]">{chosen.size} form{chosen.size === 1 ? "" : "s"} × {money((s.pricePerFormCents + (mailCopies ? s.mailPerFormCents : 0)) / 100)} = <span className="font-semibold">{money(total)}</span></p>
                <Button onClick={buy} disabled={buying || chosen.size === 0 || !s.payerReady || !s.filingAvailable} data-testid="tax1099-buy">
                  {buying ? "Checking the forms…" : "Buy and file"}
                </Button>
              </div>
              {!s.payerReady && <p className="text-sm text-amber-700">Fill in and save your salon's details above first.</p>}
              {!s.filingAvailable && <p className="text-sm text-amber-700">1099 filing isn't available right now.</p>}
            </div>
          )}
        </section>

        {/* Orders */}
        {(orders.data?.orders?.length ?? 0) > 0 && (
          <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">Filed</h2>
            {orders.data!.orders.map((o) => (
              <div key={o.id} className="rounded-lg border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <p className="text-sm font-medium">
                    {o.form_count} form{o.form_count === 1 ? "" : "s"} · {money(o.total_cents / 100)}
                    {o.status === "filing" ? " · filing…" : o.status === "failed" ? " · not filed" : ""}
                  </p>
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void refresh(o.id)} title="Statuses are also checked automatically every hour"><RefreshCw className="h-3.5 w-3.5" /> Update status</Button>
                </div>
                {o.last_error && <p className="px-3 pt-2 text-sm text-red-700">{o.last_error}</p>}
                <div className="divide-y divide-border">
                  {o.forms.map((f) => (
                    <div key={f.id} className="px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>{f.recipient_name} · {money(Number(f.amount))}</span>
                        <span className={f.federal_status === "ACCEPTED" ? "text-emerald-700" : f.federal_status === "REJECTED" || f.federal_status === "ERROR" ? "text-red-700" : "text-muted-foreground"}>
                          {statusText(f.federal_status)}{f.copy_status ? ` · copy: ${statusText(f.copy_status)}` : ""}
                        </span>
                      </div>
                      {/* A rejected form: what was wrong, where to fix it, and send it again (no new charge). */}
                      {f.canRefile && (
                        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                          {(Array.isArray(f.errors) ? f.errors : f.errors ? [f.errors] : []).map((e: any, i: number) => (
                            <p key={i}>{String(e?.Message ?? e?.message ?? e?.Name ?? "There is a problem with this form.")}</p>
                          ))}
                          <p className="mt-1">
                            Fix the details on <button type="button" className="underline" onClick={() => navigate(`/team/${f.staff_id}`)}>{f.recipient_name}'s Payroll &amp; Tax tab</button> or in your salon's details above, then send it again. There's no extra charge.
                          </p>
                          <Button size="sm" className="mt-2" onClick={() => void refile(f.id)} disabled={refiling === f.id} data-testid={`tax1099-refile-${f.id}`}>
                            {refiling === f.id ? "Sending…" : "Send again"}
                          </Button>
                        </div>
                      )}
                      {f.refile_count > 0 && !f.canRefile && <p className="mt-1 text-xs text-muted-foreground">Sent again {f.refile_count} time{f.refile_count === 1 ? "" : "s"}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </AppLayout>
  );
}
