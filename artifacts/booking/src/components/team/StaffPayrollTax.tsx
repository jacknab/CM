/**
 * Staff details → Payroll & Tax tab (owner, 2026-10-24): legal name and mailing address (both printed on the
 * staff member's paychecks), start and end dates, and tax paperwork — W-4 and I-9 for a W-2 employee, W-9 for a
 * 1099 contractor. Saved through /api/staff-employment/:staffId. The Social Security / tax ID number and the I-9
 * document number are never sent back to the browser: only their last 4 digits show, and typing a new one replaces it.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

interface Employment {
  storageReady: boolean;
  legalName: string;
  mailingAddress1: string; mailingAddress2: string; mailingCity: string; mailingState: string; mailingZip: string;
  startDate: string | null; endDate: string | null;
  workerType: "w2" | "1099" | null;
  taxIdType: "ssn" | "ein" | null; taxIdLast4: string | null;
  w4FilingStatus: string | null; w4MultipleJobs: boolean;
  w4DependentsAmount: string | null; w4OtherIncome: string | null; w4Deductions: string | null; w4ExtraWithholding: string | null;
  w4Exempt: boolean; w4SignedDate: string | null;
  w9BusinessName: string; w9TaxClassification: string | null; w9SignedDate: string | null;
  i9CitizenshipStatus: string | null; i9WorkAuthExpires: string | null;
  i9DocumentTitle: string; i9DocumentLast4: string | null;
  i9DocumentExpires: string | null; i9VerifiedDate: string | null; i9VerifiedBy: string;
}

const FILING = [
  ["single", "Single or married filing separately"],
  ["married_joint", "Married filing jointly"],
  ["head_of_household", "Head of household"],
] as const;
const W9_CLASS = [
  ["individual", "Individual / sole proprietor"],
  ["c_corp", "C corporation"],
  ["s_corp", "S corporation"],
  ["partnership", "Partnership"],
  ["trust", "Trust / estate"],
  ["llc_c", "LLC taxed as C corporation"],
  ["llc_s", "LLC taxed as S corporation"],
  ["llc_p", "LLC taxed as partnership"],
  ["other", "Other"],
] as const;
const CITIZENSHIP = [
  ["citizen", "U.S. citizen"],
  ["noncitizen_national", "Noncitizen national of the U.S."],
  ["permanent_resident", "Lawful permanent resident"],
  ["authorized_alien", "Noncitizen authorized to work"],
] as const;

const money = (v: string | null) => (v == null || v === "" ? "" : String(Number(v)));

export function StaffPayrollTax({ staffId }: { staffId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ["/api/staff-employment", staffId];
  const { data, isLoading, error } = useQuery<Employment>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/staff-employment/${staffId}`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't load");
      return body;
    },
  });

  const [f, setF] = useState<Employment | null>(null);
  const [taxId, setTaxId] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setF(data); setTaxId(""); setDocNumber(""); } }, [data]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (error || !f) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{(error as Error)?.message ?? "Couldn't load"}</p>;
  }

  const set = <K extends keyof Employment>(k: K, v: Employment[K]) => setF((p) => (p ? { ...p, [k]: v } : p));
  const isW2 = f.workerType === "w2";
  const is1099 = f.workerType === "1099";
  const idType = isW2 ? "ssn" : (f.taxIdType ?? "ssn");

  const save = async () => {
    if (f.startDate && f.endDate && f.endDate < f.startDate) {
      toast({ title: "The end date is before the start date", variant: "destructive" });
      return;
    }
    if (taxId.trim() && taxId.replace(/\D/g, "").length !== 9) {
      toast({ title: `${idType === "ein" ? "An EIN" : "A Social Security number"} has 9 digits`, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("PUT", `/api/staff-employment/${staffId}`, {
        ...f,
        taxIdType: idType,
        ...(taxId.trim() ? { taxId } : {}),
        ...(docNumber.trim() ? { i9DocumentNumber: docNumber } : {}),
      });
      await qc.invalidateQueries({ queryKey: key });
      toast({ title: "Saved" });
    } catch (e: any) {
      const raw = String(e?.message ?? "").replace(/^\d+:\s*/, "");
      let msg = "Couldn't save";
      try { msg = JSON.parse(raw).error ?? msg; } catch { /* not JSON */ }
      toast({ title: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <div className="space-y-1.5">
      <label className="text-[15px] font-medium">{label}</label>
      {node}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  const dateInput = (k: keyof Employment) => (
    <Input type="date" value={(f[k] as string | null) ?? ""} onChange={(e) => set(k, (e.target.value || null) as any)} className="text-[15px]" />
  );
  const moneyInput = (k: keyof Employment) => (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">$</span>
      <Input type="number" min={0} step="0.01" value={money(f[k] as string | null)} onChange={(e) => set(k, e.target.value as any)} className="w-32 text-right text-[15px]" />
    </div>
  );
  const select = (k: keyof Employment, options: readonly (readonly [string, string])[], placeholder = "Choose") => (
    <Select value={(f[k] as string | null) ?? undefined} onValueChange={(v) => set(k, v as any)}>
      <SelectTrigger className="text-[15px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
  const secret = (value: string, onChange: (v: string) => void, last4: string | null, placeholder: string) => (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={last4 ? `On file: ending ${last4} — type to replace` : placeholder}
      autoComplete="off"
      inputMode={placeholder.includes("-") ? "numeric" : undefined}
      disabled={!f.storageReady}
      className="text-[15px]"
    />
  );

  return (
    <div className="space-y-8">
      {/* Legal name & mailing address */}
      <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Legal name and mailing address</h2>
          <p className="text-sm text-muted-foreground">Printed on this staff member's paychecks.</p>
        </div>
        {field("Legal name", <Input value={f.legalName} onChange={(e) => set("legalName", e.target.value)} className="text-[15px]" />)}
        {field("Address", <Input value={f.mailingAddress1} onChange={(e) => set("mailingAddress1", e.target.value)} className="text-[15px]" />)}
        {field("Apt, suite, unit", <Input value={f.mailingAddress2} onChange={(e) => set("mailingAddress2", e.target.value)} className="text-[15px]" />)}
        <div className="grid gap-4 sm:grid-cols-[1fr_6rem_8rem]">
          {field("City", <Input value={f.mailingCity} onChange={(e) => set("mailingCity", e.target.value)} className="text-[15px]" />)}
          {field("State", <Input value={f.mailingState} maxLength={2} onChange={(e) => set("mailingState", e.target.value.toUpperCase())} className="text-[15px]" />)}
          {field("ZIP", <Input value={f.mailingZip} inputMode="numeric" maxLength={10} onChange={(e) => set("mailingZip", e.target.value)} className="text-[15px]" />)}
        </div>
      </section>

      {/* Employment */}
      <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Employment</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("Start date", dateInput("startDate"))}
          {field("End date", dateInput("endDate"))}
        </div>
        {field("Worker type", (
          <div className="grid grid-cols-2 gap-2">
            {([["w2", "W-2 employee"], ["1099", "1099 contractor"]] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => set("workerType", v)}
                className={`rounded-lg border px-3 py-2.5 text-[15px] font-medium transition-colors ${f.workerType === v ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50"}`}
              >
                {l}
              </button>
            ))}
          </div>
        ))}
      </section>

      {!f.storageReady && (isW2 || is1099) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tax ID numbers can't be saved yet: secure storage isn't set up on the server. Everything else on this page saves.
        </p>
      )}

      {/* W-2 employee: W-4 */}
      {isW2 && (
        <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Tax information (W-4)</h2>
            <p className="text-sm text-muted-foreground">From the employee's Form W-4.</p>
          </div>
          {field("Social Security number", secret(taxId, setTaxId, f.taxIdType === "ssn" ? f.taxIdLast4 : null, "123-45-6789"))}
          {field("Filing status", select("w4FilingStatus", FILING))}
          <label className="flex cursor-pointer items-center gap-3">
            <Checkbox checked={f.w4MultipleJobs} onCheckedChange={(v) => set("w4MultipleJobs", v === true)} />
            <span className="text-[15px]">Multiple jobs or spouse works (Step 2)</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("Dependents amount (Step 3)", moneyInput("w4DependentsAmount"))}
            {field("Other income (Step 4a)", moneyInput("w4OtherIncome"))}
            {field("Deductions (Step 4b)", moneyInput("w4Deductions"))}
            {field("Extra withholding per pay period (Step 4c)", moneyInput("w4ExtraWithholding"))}
          </div>
          <label className="flex cursor-pointer items-center gap-3">
            <Checkbox checked={f.w4Exempt} onCheckedChange={(v) => set("w4Exempt", v === true)} />
            <span className="text-[15px]">Claims exemption from withholding</span>
          </label>
          {field("Date signed", dateInput("w4SignedDate"))}
        </section>
      )}

      {/* W-2 employee: I-9 */}
      {isW2 && (
        <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Employment eligibility (I-9)</h2>
            <p className="text-sm text-muted-foreground">From the employee's Form I-9.</p>
          </div>
          {field("Citizenship or immigration status", select("i9CitizenshipStatus", CITIZENSHIP))}
          {f.i9CitizenshipStatus === "authorized_alien" && field("Work authorization expires", dateInput("i9WorkAuthExpires"))}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("Document title", <Input value={f.i9DocumentTitle} onChange={(e) => set("i9DocumentTitle", e.target.value)} placeholder="e.g. U.S. Passport" className="text-[15px]" />)}
            {field("Document number", secret(docNumber, setDocNumber, f.i9DocumentLast4, "Document number"))}
            {field("Document expires", dateInput("i9DocumentExpires"))}
            {field("Verified on", dateInput("i9VerifiedDate"))}
          </div>
          {field("Verified by", <Input value={f.i9VerifiedBy} onChange={(e) => set("i9VerifiedBy", e.target.value)} className="text-[15px]" />)}
        </section>
      )}

      {/* 1099 contractor: W-9 */}
      {is1099 && (
        <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Tax information (W-9)</h2>
            <p className="text-sm text-muted-foreground">From the contractor's Form W-9.</p>
          </div>
          {field("Business name", <Input value={f.w9BusinessName} onChange={(e) => set("w9BusinessName", e.target.value)} className="text-[15px]" />, "Only if different from the legal name")}
          {field("Tax classification", select("w9TaxClassification", W9_CLASS))}
          {field("Tax ID type", (
            <div className="grid grid-cols-2 gap-2">
              {([["ssn", "Social Security number"], ["ein", "EIN"]] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set("taxIdType", v)}
                  className={`rounded-lg border px-3 py-2.5 text-[15px] font-medium transition-colors ${idType === v ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          ))}
          {field(idType === "ein" ? "EIN" : "Social Security number",
            secret(taxId, setTaxId, f.taxIdType === idType ? f.taxIdLast4 : null, idType === "ein" ? "12-3456789" : "123-45-6789"))}
          {field("Date signed", dateInput("w9SignedDate"))}
        </section>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy} data-testid="save-staff-payroll-tax">
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
