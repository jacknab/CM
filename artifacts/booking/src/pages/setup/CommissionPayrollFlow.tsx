/**
 * /setup/payroll — Contractor, booth renter & commission onboarding.
 *
 * This flow intentionally uses the modern contractor-payouts system. It does
 * not configure employee withholding, W-2s, or the legacy payroll settings.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, Banknote, Building2, Check, CheckCircle2, ChevronRight,
  CircleAlert, Clock3, ExternalLink, FileCheck2, Loader2, Mail, Plus,
  Receipt, ShieldCheck, Sparkles, Users, WalletCards,
} from "lucide-react";
import { FlowShell, type FlowStep } from "./FlowShell";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";

type Scope = "commission" | "booth" | "mixed" | "tracking";
type DeductionDraft = { name: string; type: "fixed" | "percentage"; amount: string };
type Contractor = {
  id: number; name: string; email: string | null; role: string | null;
  payoutMethod: string | null; onboardingStatus: string | null;
  bankVerified: boolean; commissionStructureId: number | null; w9Complete: boolean;
};
type Structure = {
  id: number; name: string; employeePercent: string; housePercent: string; appliesTo: string;
};
type Readiness = {
  ready: boolean;
  blockers: Array<{ code: string; label: string; detail: string; count?: number }>;
  warnings: Array<{ code: string; label: string; detail: string }>;
  contractors: Contractor[];
  structures: Structure[];
  deductionRules: Array<{ id: number; name: string; type: string; amount: string; appliesTo: string | null }>;
  schedule: { enabled: boolean; frequency: string; anchorDate: string | null; autoApproveDelayHours: number };
  ownerPayoutAccount: { connected: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean };
  missingStructure: Array<{ id: number; name: string }>;
  missingW9: Array<{ id: number; name: string }>;
  missingPayoutSetup: Array<{ id: number; name: string; status: string | null }>;
};

const STEPS: FlowStep[] = [
  { key: "scope", label: "Choose your setup" },
  { key: "team", label: "Review your team" },
  { key: "commission", label: "Commission rules" },
  { key: "deductions", label: "Deductions" },
  { key: "schedule", label: "Payout schedule" },
  { key: "readiness", label: "Review & preview" },
];

const SCOPE_OPTIONS: Array<{ id: Scope; title: string; description: string; icon: typeof Users }> = [
  { id: "commission", title: "Commission providers", description: "Track service and product commission for independent providers.", icon: Receipt },
  { id: "booth", title: "Booth renters", description: "Track independent renters and recurring booth or supply deductions.", icon: Building2 },
  { id: "mixed", title: "A mix of both", description: "Use commission splits for some providers and booth-renter rules for others.", icon: Users },
  { id: "tracking", title: "Commission tracking only", description: "Track earnings now and decide on payout timing after your team is set up.", icon: Banknote },
];

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "semimonthly", label: "Twice a month" },
  { value: "monthly", label: "Monthly" },
];

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error ?? "Something went wrong. Please try again.");
  }
  return res.json() as Promise<T>;
}

export default function CommissionPayrollFlow() {
  const navigate = useNavigate();
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const storeId = selectedStore?.id;
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState<Scope>("commission");
  const [loadedState, setLoadedState] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newContractor, setNewContractor] = useState({ firstName: "", lastName: "", email: "", role: "stylist", payoutMethod: "ach" });
  const [structure, setStructure] = useState({ name: "Standard Commission", employeePercent: "60", appliesTo: "contractor" });
  const [deductions, setDeductions] = useState<DeductionDraft[]>([]);
  const [schedule, setSchedule] = useState({ enabled: true, frequency: "biweekly", anchorDate: "", autoApproveDelayHours: 48 });
  const [preview, setPreview] = useState<{ id: number; totalNet: string; contractorCount: number } | null>(null);
  const [invitingId, setInvitingId] = useState<number | null>(null);

  const { data: readiness, isLoading: loadingReadiness, refetch } = useQuery<Readiness>({
    queryKey: ["/api/contractor-payouts/onboarding/status", storeId],
    queryFn: async () => readJson(await fetch("/api/contractor-payouts/onboarding/status", { credentials: "include" })),
    enabled: !!storeId,
    staleTime: 0,
  });

  const { data: progress } = useQuery<{ flows: Array<{ key: string; state?: Record<string, unknown>; status: string }> }>({
    queryKey: ["setup-progress", storeId],
    queryFn: async () => readJson(await fetch("/api/setup/progress", { credentials: "include" })),
    enabled: !!storeId,
    staleTime: 0,
  });

  const savedFlow = progress?.flows?.find((flow) => flow.key === "commission_payroll");
  useEffect(() => {
    if (!savedFlow || loadedState) return;
    const state = savedFlow.state ?? {};
    if (typeof state.scope === "string" && ["commission", "booth", "mixed", "tracking"].includes(state.scope)) setScope(state.scope as Scope);
    if (typeof state.step === "number") setStep(Math.min(STEPS.length - 1, Math.max(0, state.step)));
    if (state.schedule && typeof state.schedule === "object") setSchedule((current) => ({ ...current, ...(state.schedule as object) }));
    if (Array.isArray(state.deductions)) setDeductions(state.deductions as DeductionDraft[]);
    setLoadedState(true);
  }, [savedFlow, loadedState]);

  useEffect(() => {
    setLoadedState(false);
    setStep(0);
    setPreview(null);
  }, [storeId]);

  const saveState = async (nextStep: number, status: "in_progress" | "complete" = "in_progress") => {
    if (!storeId) return;
    await readJson(await fetch("/api/setup/progress/commission_payroll", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        status,
        state: { scope, step: nextStep, schedule, deductions },
      }),
    }));
  };

  const goNext = async (nextStep: number, action?: () => Promise<void>) => {
    setSaving(true);
    try {
      await action?.();
      await saveState(nextStep);
      setStep(nextStep);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save", description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const createContractor = async () => {
    if (!newContractor.firstName.trim() || !newContractor.lastName.trim()) throw new Error("Enter a first and last name.");
    await readJson(await fetch("/api/contractor-payouts/contractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ storeId, ...newContractor }),
    }));
    setNewContractor({ firstName: "", lastName: "", email: "", role: "stylist", payoutMethod: "ach" });
    await refetch();
    toast({ title: "Contractor added", description: "Their secure payout onboarding can be completed from the invite." });
  };

  const createStructure = async () => {
    const employeePercent = Math.min(100, Math.max(0, Number(structure.employeePercent) || 0));
    if (!structure.name.trim()) throw new Error("Name your commission structure.");
    const existing = readiness?.structures?.find((item) =>
      item.name.trim().toLowerCase() === structure.name.trim().toLowerCase()
      && Number(item.employeePercent) === employeePercent
      && item.appliesTo === structure.appliesTo
    );
    if (existing) return;
    await readJson(await fetch("/api/contractor-payouts/commission-structures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        storeId, name: structure.name.trim(), employeePercent,
        housePercent: 100 - employeePercent, appliesTo: structure.appliesTo,
        isDefault: true,
      }),
    }));
    await refetch();
  };

  const assignStructure = async (contractorId: number, commissionStructureId: number) => {
    await readJson(await fetch(`/api/contractor-payouts/contractors/${contractorId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ commissionStructureId }),
    }));
    await refetch();
  };

  const saveDeductions = async () => {
    for (const deduction of deductions.filter((item) => item.name.trim() && Number(item.amount) >= 0)) {
      await readJson(await fetch("/api/contractor-payouts/deduction-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, name: deduction.name.trim(), type: deduction.type, amount: Number(deduction.amount), appliesTo: "all" }),
      }));
    }
    await refetch();
  };

  const saveSchedule = async () => {
    if ((schedule.frequency === "weekly" || schedule.frequency === "biweekly") && !schedule.anchorDate) {
      throw new Error("Choose the first day of your payout cycle.");
    }
    await readJson(await fetch("/api/contractor-payouts/payroll-schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ storeId, ...schedule }),
    }));
    await refetch();
  };

  const sendInvite = async (contractorId: number) => {
    setInvitingId(contractorId);
    try {
      await readJson(await fetch(`/api/contractor-payouts/contractors/${contractorId}/send-onboarding-email`, {
        method: "POST", credentials: "include",
      }));
      toast({ title: "Secure invite sent", description: "The contractor can enter W-9 and payout details through their private portal." });
    } catch (error) {
      toast({ variant: "destructive", title: "Invite not sent", description: (error as Error).message });
    } finally {
      setInvitingId(null);
    }
  };

  const createPreview = async () => {
    setSaving(true);
    try {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const end = today.toISOString().slice(0, 10);
      const run = await readJson<{ id: number; totalNet: string; contractorCount: number }>(await fetch("/api/contractor-payouts/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, periodStart: start, periodEnd: end, notes: "Onboarding dry-run preview" }),
      }));
      setPreview(run);
      toast({ title: "Draft preview created", description: "Nothing was sent. Review it later from Payout Runs." });
    } catch (error) {
      toast({ variant: "destructive", title: "Preview unavailable", description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    if (!readiness?.ready) return;
    setSaving(true);
    try {
      await saveState(STEPS.length - 1, "complete");
      toast({ title: "Contractor payouts are ready", description: "Your first payout can be previewed before anything is sent." });
      navigate("/payouts");
    } catch (error) {
      toast({ variant: "destructive", title: "Could not complete setup", description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const activeStructure = readiness?.structures?.find((item) => item.appliesTo === "contractor" || item.appliesTo === "both");
  const completion = useMemo(() => {
    if (!readiness) return 0;
    const checks = [
      readiness.contractors.length > 0,
      readiness.structures.length > 0,
      readiness.schedule.enabled,
      readiness.missingW9.length === 0,
      readiness.missingPayoutSetup.length === 0,
      !readiness.blockers.some((item) => item.code === "missing_owner_payout_account"),
    ];
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  }, [readiness]);

  const renderScope = () => (
    <StepIntro icon={Sparkles} color="bg-violet-100 text-violet-700" title="How do you pay independent providers?" description="This setup tracks contractor earnings and payout readiness. It does not configure employee withholding or W-2 payroll.">
      <div className="grid gap-3 sm:grid-cols-2">
        {SCOPE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = scope === option.id;
          return <button key={option.id} onClick={() => setScope(option.id)} className={`text-left rounded-2xl border-2 p-4 transition-all ${selected ? "border-[#1A0333] bg-[#1A0333]/5 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}>
            <div className="flex items-start gap-3">
              <div className={`rounded-xl p-2 ${selected ? "bg-[#1A0333] text-white" : "bg-slate-100 text-slate-500"}`}><Icon className="h-5 w-5" /></div>
              <div><p className="font-semibold text-slate-800">{option.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p></div>
            </div>
          </button>;
        })}
      </div>
      <InfoNote>Contractors enter their own W-9 and bank details through a secure portal. You will never need to type their full banking information here.</InfoNote>
    </StepIntro>
  );

  const renderTeam = () => (
    <StepIntro icon={Users} color="bg-blue-100 text-blue-700" title="Review your payout team" description="Staff profiles are mirrored into contractor payout profiles automatically. Add a contractor here if they are not in your team yet.">
      <div className="space-y-3">
        {(readiness?.contractors ?? []).map((contractor) => (
          <div key={contractor.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1A0333]/10 font-bold text-[#1A0333]">{contractor.name.charAt(0)}</div>
            <div className="min-w-[170px] flex-1"><p className="text-sm font-semibold text-slate-800">{contractor.name}</p><p className="text-xs text-slate-500">{contractor.email ?? "No email"} · {contractor.payoutMethod === "check" ? "Check" : "Electronic payout"}</p></div>
            <StatusPill ok={contractor.w9Complete} label={contractor.w9Complete ? "W-9 ready" : "W-9 needed"} />
            <StatusPill ok={contractor.onboardingStatus === "complete" || contractor.payoutMethod === "check"} label={contractor.onboardingStatus === "complete" || contractor.payoutMethod === "check" ? "Payout ready" : "Invite needed"} />
            {!contractor.w9Complete && contractor.email && <button onClick={() => sendInvite(contractor.id)} disabled={invitingId === contractor.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-[#1A0333] hover:bg-slate-50 disabled:opacity-50">{invitingId === contractor.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Send invite</button>}
          </div>
        ))}
        {(readiness?.contractors ?? []).length === 0 && <EmptyPanel text="No active contractor profiles yet." />}
      </div>
      <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-800">Add a contractor or booth renter</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={newContractor.firstName} onChange={(e) => setNewContractor({ ...newContractor, firstName: e.target.value })} placeholder="First name" />
          <Input value={newContractor.lastName} onChange={(e) => setNewContractor({ ...newContractor, lastName: e.target.value })} placeholder="Last name" />
          <Input value={newContractor.email} onChange={(e) => setNewContractor({ ...newContractor, email: e.target.value })} placeholder="Email for secure invite" type="email" />
          <select value={newContractor.payoutMethod} onChange={(e) => setNewContractor({ ...newContractor, payoutMethod: e.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="ach">ACH / direct deposit</option><option value="instant">Instant payout</option><option value="check">Printed check</option></select>
        </div>
        <button onClick={() => goNext(1, createContractor)} disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[#1A0333]/20 px-4 py-2 text-sm font-semibold text-[#1A0333] hover:bg-white disabled:opacity-50"><Plus className="h-4 w-4" /> Add contractor</button>
      </div>
      <InlineLink onClick={() => navigate("/payouts/contractors")} label="Open full contractor management" />
    </StepIntro>
  );

  const renderCommission = () => (
    <StepIntro icon={Receipt} color="bg-amber-100 text-amber-700" title="Set your commission rules" description="Create a reusable split and assign it to providers. For example, a 60/40 split gives the provider 60% and the salon 40% of eligible service revenue.">
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Structure name"><Input value={structure.name} onChange={(e) => setStructure({ ...structure, name: e.target.value })} placeholder="Standard Commission" /></Field>
          <Field label="Provider share"><div className="relative"><Input type="number" min="0" max="100" value={structure.employeePercent} onChange={(e) => setStructure({ ...structure, employeePercent: e.target.value })} className="pr-8" /><span className="absolute right-3 top-2.5 text-sm text-slate-400">%</span></div></Field>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-teal-500" style={{ width: `${Math.min(100, Math.max(0, Number(structure.employeePercent) || 0))}%` }} /></div>
        <div className="mt-1 flex justify-between text-xs text-slate-500"><span>Provider {Math.min(100, Math.max(0, Number(structure.employeePercent) || 0))}%</span><span>Salon {100 - Math.min(100, Math.max(0, Number(structure.employeePercent) || 0))}%</span></div>
      </div>
      {readiness?.structures?.length ? <div className="mt-4 space-y-2"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Assign a structure</p>{readiness.contractors.map((contractor) => <div key={contractor.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5"><span className="flex-1 text-sm font-medium text-slate-700">{contractor.name}</span><select value={contractor.commissionStructureId ?? ""} onChange={(e) => e.target.value && assignStructure(contractor.id, Number(e.target.value))} className="max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"><option value="">Choose structure</option>{readiness.structures.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.employeePercent}/{item.housePercent}</option>)}</select></div>)}</div> : <InfoNote>Create the first structure to see assignment controls.</InfoNote>}
    </StepIntro>
  );

  const renderDeductions = () => (
    <StepIntro icon={WalletCards} color="bg-rose-100 text-rose-700" title="Add recurring deductions" description="Deductions apply to future draft payout runs only. Common examples are booth rent, supplies, or a processing fee.">
      <div className="space-y-2">{deductions.map((deduction, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_150px_120px]"><Input value={deduction.name} onChange={(e) => setDeductions(deductions.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} placeholder="Booth rent" /><select value={deduction.type} onChange={(e) => setDeductions(deductions.map((item, i) => i === index ? { ...item, type: e.target.value as DeductionDraft["type"] } : item))} className="rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="fixed">Fixed dollars</option><option value="percentage">Percentage</option></select><Input type="number" min="0" value={deduction.amount} onChange={(e) => setDeductions(deductions.map((item, i) => i === index ? { ...item, amount: e.target.value } : item))} placeholder={deduction.type === "fixed" ? "500" : "5"} /></div>)}</div>
      <button onClick={() => setDeductions([...deductions, { name: "", type: "fixed", amount: "" }])} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1A0333]"><Plus className="h-4 w-4" /> Add deduction</button>
      {readiness?.deductionRules?.length ? <div className="mt-5 rounded-xl bg-slate-50 p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Saved rules</p>{readiness.deductionRules.map((rule) => <div key={rule.id} className="flex justify-between py-1 text-sm text-slate-600"><span>{rule.name}</span><span>{rule.type === "percentage" ? `${rule.amount}%` : `$${rule.amount}`}</span></div>)}</div> : <InfoNote>No deductions is okay. You can add them later from Payouts → Deductions.</InfoNote>}
    </StepIntro>
  );

  const renderSchedule = () => (
    <StepIntro icon={Clock3} color="bg-indigo-100 text-indigo-700" title="Choose a payout schedule" description="The review window gives you time to inspect a draft payout run before any funds move.">
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" checked={schedule.enabled} onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })} className="h-4 w-4 accent-[#1A0333]" /><span><span className="block text-sm font-semibold text-slate-800">Enable scheduled payout reminders</span><span className="block text-xs text-slate-500">You still review every draft before approval.</span></span></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Pay frequency"><select value={schedule.frequency} onChange={(e) => setSchedule({ ...schedule, frequency: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>{(schedule.frequency === "weekly" || schedule.frequency === "biweekly") && <Field label="First cycle starts"><Input type="date" value={schedule.anchorDate} onChange={(e) => setSchedule({ ...schedule, anchorDate: e.target.value })} /></Field>}<Field label="Review window"><select value={schedule.autoApproveDelayHours} onChange={(e) => setSchedule({ ...schedule, autoApproveDelayHours: Number(e.target.value) })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value={24}>24 hours</option><option value={48}>48 hours</option><option value={72}>72 hours</option><option value={0}>Manual approval only</option></select></Field></div>
      <InfoNote>Nothing is sent automatically from this wizard. A payout run is created as a draft, and approval remains a separate owner action.</InfoNote>
    </StepIntro>
  );

  const renderReadiness = () => (
    <StepIntro icon={ShieldCheck} color="bg-emerald-100 text-emerald-700" title="Review your payout readiness" description="We check the live payout records for this location. Fix blockers now, or return later — your progress is saved.">
      <div className="mb-5 flex items-center gap-4 rounded-2xl bg-slate-50 p-4"><div className="relative h-16 w-16"><svg className="h-16 w-16 -rotate-90"><circle cx="32" cy="32" r="27" fill="none" stroke="#e2e8f0" strokeWidth="6" /><circle cx="32" cy="32" r="27" fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${completion * 1.696} 170`} /></svg><span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800">{completion}%</span></div><div><p className="font-semibold text-slate-800">{readiness?.ready ? "Ready for a draft payout" : "A few items need attention"}</p><p className="text-sm text-slate-500">{readiness?.ready ? "You can preview earnings without sending money." : `${readiness?.blockers.length ?? 0} blocker${(readiness?.blockers.length ?? 0) === 1 ? "" : "s"} remain.`}</p></div></div>
      {loadingReadiness ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking live payout records…</div> : <div className="space-y-2">{(readiness?.blockers ?? []).map((item) => <ReadinessRow key={item.code} ok={false} label={item.label} detail={item.detail} />)}{(readiness?.warnings ?? []).map((item) => <ReadinessRow key={item.code} ok detail={item.detail} label={item.label} />)}{readiness?.ready && <ReadinessRow ok label="Core payout setup is ready" detail="The first payout can be reviewed as a draft before approval." />}</div>}
      <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => navigate("/payouts/contractors")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Manage contractors <ExternalLink className="h-3.5 w-3.5" /></button><button onClick={() => navigate("/manage/payment-settings")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Owner payout account <ExternalLink className="h-3.5 w-3.5" /></button>{readiness?.ready && <button onClick={createPreview} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#1A0333] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d0554] disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} Preview draft payout</button>}</div>
      {preview && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Draft preview #{preview.id} created</p><p className="mt-1 text-sm text-emerald-700">{preview.contractorCount} contractor{preview.contractorCount === 1 ? "" : "s"} · estimated net {preview.totalNet}</p><button onClick={() => navigate(`/payouts/run?runId=${preview.id}`)} className="mt-2 text-sm font-semibold text-emerald-800 underline">Review draft payout →</button></div>}
    </StepIntro>
  );

  const content = [renderScope, renderTeam, renderCommission, renderDeductions, renderSchedule, renderReadiness][step]();
  return <FlowShell flowKey="commission_payroll" title="Contractor Payout Setup" subtitle="Commission tracking and contractor payouts" steps={STEPS} currentStep={step} onBack={step > 0 ? () => setStep(step - 1) : undefined} onNext={step === 0 ? () => goNext(1) : step === 1 ? () => goNext(2) : step === 2 ? () => goNext(3, createStructure) : step === 3 ? () => goNext(4, saveDeductions) : step === 4 ? () => goNext(5, saveSchedule) : undefined} nextLabel={saving ? "Saving…" : step === 2 ? "Save commission rules" : step === 3 ? "Save deductions" : step === 4 ? "Save schedule" : "Continue"} nextDisabled={saving || (step === 2 && !structure.name.trim()) || (step === 5 && !readiness?.ready)} onComplete={finish} completeLabel={readiness?.ready ? "Finish setup" : "Finish when ready"}>{content}</FlowShell>;
}

function StepIntro({ icon: Icon, color, title, description, children }: { icon: typeof Users; color: string; title: string; description: string; children: React.ReactNode }) {
  return <div><div className="mb-6 flex items-start gap-3"><div className={`rounded-xl p-2.5 ${color}`}><Icon className="h-5 w-5" /></div><div><h2 className="text-lg font-bold text-slate-800">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-500">{description}</p></div></div>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>; }
function InfoNote({ children }: { children: React.ReactNode }) { return <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-700"><span className="font-semibold">Good to know: </span>{children}</div>; }
function EmptyPanel({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">{text}</div>; }
function StatusPill({ ok, label }: { ok: boolean; label: string }) { return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{ok ? "✓ " : ""}{label}</span>; }
function ReadinessRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) { return <div className={`flex items-start gap-3 rounded-xl border p-3 ${ok ? "border-emerald-100 bg-emerald-50/50" : "border-amber-100 bg-amber-50/50"}`}><div className="mt-0.5">{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CircleAlert className="h-4 w-4 text-amber-600" />}</div><div><p className="text-sm font-semibold text-slate-800">{label}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p></div></div>; }
function InlineLink({ onClick, label }: { onClick: () => void; label: string }) { return <button onClick={onClick} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#1A0333] hover:underline">{label} <ArrowRight className="h-3.5 w-3.5" /></button>; }
function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#1A0333] focus:ring-2 focus:ring-[#1A0333]/10 ${className}`} />; }