/**
 * CommissionsSetupWizard
 *
 * Step 1 — choose structure type: By Member | By Tiers
 * Step 2 — name + pick staff + set individual rates (member) OR define tiers (tiered)
 * On save  — show a success overlay, then redirect
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import {
  Users, BarChart2, Search, Plus, Trash2, ChevronRight,
  ArrowLeft, X, Percent, Sparkles, BadgeCheck, Settings2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type WizardType = "member" | "tiered";

interface StaffMember {
  id: number;
  name: string;
  role: string;
  color?: string;
  commissionEnabled?: boolean;
  commissionRate?: string;
}

interface MemberRate {
  staffId: number;
  enabled: boolean;
  rate: string;
}

interface TierRow {
  id: string;
  from: string;
  to: string;
  rate: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

function uid() {
  return Math.random().toString(36).slice(2);
}

// ── Step 1: Type chooser ───────────────────────────────────────────────────────

function StepChooseType({
  value, onChange,
}: { value: WizardType | null; onChange: (v: WizardType) => void }) {
  const options = [
    {
      id: "member" as WizardType,
      icon: Users,
      title: "By Member",
      desc: "Set a custom commission rate for each team member individually.",
      badge: "Most popular",
    },
    {
      id: "tiered" as WizardType,
      icon: BarChart2,
      title: "By Tiers",
      desc: "Reward higher sales with higher rates — define revenue brackets.",
    },
  ];

  return (
    <div className="space-y-3">
      {options.map(({ id, icon: Icon, title, desc, badge }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            "w-full flex items-start gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-all duration-150",
            value === id
              ? "border-gray-900 bg-gray-50"
              : "border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50"
          )}
        >
          <div className={cn(
            "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center mt-0.5",
            value === id ? "bg-gray-900" : "bg-gray-100"
          )}>
            <Icon size={18} className={value === id ? "text-white" : "text-gray-500"} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-semibold text-gray-900">{title}</p>
              {badge && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-900 text-white">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-[13px] text-gray-500 mt-0.5 leading-snug">{desc}</p>
          </div>
          <div className={cn(
            "flex-shrink-0 w-5 h-5 rounded-full border-2 mt-1 flex items-center justify-center",
            value === id ? "border-gray-900 bg-gray-900" : "border-gray-300 bg-white"
          )}>
            {value === id && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Step 2a: By Member ─────────────────────────────────────────────────────────

function StepByMember({
  staff, memberRates, setMemberRates, onCustomize,
}: {
  staff: StaffMember[];
  memberRates: Record<number, MemberRate>;
  setMemberRates: (r: Record<number, MemberRate>) => void;
  onCustomize: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [bulkRate, setBulkRate] = useState("50");

  const filtered = useMemo(() =>
    staff.filter(s => s.name.toLowerCase().includes(search.toLowerCase())),
    [staff, search]
  );

  const patchMember = (id: number, patch: Partial<MemberRate>) =>
    setMemberRates({ ...memberRates, [id]: { ...memberRates[id], ...patch } });

  const applyBulk = () => {
    const next = { ...memberRates };
    staff.forEach(s => { next[s.id] = { ...next[s.id], rate: bulkRate }; });
    setMemberRates(next);
  };

  const allEnabled = staff.length > 0 && staff.every(s => memberRates[s.id]?.enabled);
  const someEnabled = staff.some(s => memberRates[s.id]?.enabled) && !allEnabled;

  const toggleAll = () => {
    const next = { ...memberRates };
    staff.forEach(s => { next[s.id] = { ...next[s.id], enabled: !allEnabled }; });
    setMemberRates(next);
  };

  const ROLE_LABELS: Record<string, string> = {
    stylist: "Stylist", booth_renter: "Booth Renter", receptionist: "Receptionist",
    assistant: "Assistant", manager: "Manager", marketer: "Marketer",
    accountant: "Accountant", owner: "Owner", custom: "Custom",
  };

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-gray-600 leading-relaxed">
        Choose which team members to include and set their individual commission rates.
      </p>

      {/* Search + bulk apply */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="pl-9 rounded-full bg-gray-50 border-gray-200 text-[13px] h-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number" min={0} max={100}
            value={bulkRate}
            onChange={e => setBulkRate(e.target.value)}
            className="w-16 rounded-xl text-center text-[13px] h-9"
          />
          <span className="text-[13px] text-gray-500">%</span>
          <button
            onClick={applyBulk}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            Apply all
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[32px_1fr_130px_100px] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <button onClick={toggleAll} className="flex items-center justify-center">
            <div className={cn(
              "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
              allEnabled
                ? "bg-gray-900 border-gray-900"
                : someEnabled
                  ? "bg-gray-400 border-gray-400"
                  : "border-gray-300 bg-white"
            )}>
              {(allEnabled || someEnabled) && (
                <div className="w-1.5 h-1.5 rounded-sm bg-white" />
              )}
            </div>
          </button>
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Name</span>
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Commission</span>
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Actions</span>
        </div>

        {/* Rows */}
        {filtered.length === 0 && (
          <div className="py-8 text-center text-[13px] text-gray-400">No staff found</div>
        )}
        {filtered.map((s, i) => {
          const mr = memberRates[s.id] ?? { staffId: s.id, enabled: true, rate: "50" };
          const roleLabel = ROLE_LABELS[s.role ?? "stylist"] ?? s.role ?? "Staff";
          return (
            <div
              key={s.id}
              className={cn(
                "grid grid-cols-[32px_1fr_130px_100px] gap-3 items-center px-4 py-3",
                i < filtered.length - 1 && "border-b border-gray-100"
              )}
            >
              {/* Checkbox */}
              <button
                onClick={() => patchMember(s.id, { enabled: !mr.enabled })}
                className="flex items-center justify-center"
              >
                <div className={cn(
                  "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                  mr.enabled ? "bg-gray-900 border-gray-900" : "border-gray-300 bg-white"
                )}>
                  {mr.enabled && (
                    <svg viewBox="0 0 10 8" className="w-2.5 h-2.5">
                      <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </button>

              {/* Name + role */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                  style={{ background: s.color ?? "#d8b4fe" }}
                >
                  {initials(s.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-gray-900 leading-tight truncate">{s.name}</p>
                  <p className="text-[11px] text-gray-500">{roleLabel}</p>
                </div>
              </div>

              {/* Rate input */}
              <div className="relative">
                <Input
                  type="number" min={0} max={100}
                  value={mr.rate}
                  onChange={e => patchMember(s.id, { rate: e.target.value })}
                  disabled={!mr.enabled}
                  placeholder="Rate"
                  className="pr-8 rounded-xl text-[13px] h-9 disabled:opacity-40"
                />
                <Percent size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              {/* Customize */}
              <button
                onClick={() => onCustomize(s.id)}
                disabled={!mr.enabled}
                className="flex items-center gap-1 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-full px-3 py-1.5 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                <Settings2 size={11} />
                Customize
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 2b: By Tiers ──────────────────────────────────────────────────────────

function StepByTiers({
  tiers, setTiers,
}: { tiers: TierRow[]; setTiers: (t: TierRow[]) => void }) {
  const addTier = () =>
    setTiers([...tiers, { id: uid(), from: "", to: "", rate: "" }]);
  const removeTier = (id: string) =>
    setTiers(tiers.filter(t => t.id !== id));
  const patchTier = (id: string, patch: Partial<TierRow>) =>
    setTiers(tiers.map(t => t.id === id ? { ...t, ...patch } : t));

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-gray-600 leading-relaxed">
        Define revenue brackets. Staff earn the corresponding rate for completed appointments that fall in each range.
      </p>

      <div className="grid grid-cols-[1fr_1fr_1fr_32px] gap-3">
        {["From ($)", "To ($)", "Rate (%)", ""].map((h, i) => (
          <span key={i} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">{h}</span>
        ))}
      </div>

      <div className="space-y-2">
        {tiers.map((tier, i) => (
          <div key={tier.id} className="grid grid-cols-[1fr_1fr_1fr_32px] gap-3 items-center">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[13px] pointer-events-none">$</span>
              <Input type="number" min={0} value={tier.from} onChange={e => patchTier(tier.id, { from: e.target.value })} placeholder="0" className="pl-6 rounded-xl text-[13px]" />
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[13px] pointer-events-none">$</span>
              <Input type="number" min={0} value={tier.to} onChange={e => patchTier(tier.id, { to: e.target.value })} placeholder={i === tiers.length - 1 ? "∞" : ""} className="pl-6 rounded-xl text-[13px]" />
            </div>
            <div className="relative">
              <Input type="number" min={0} max={100} value={tier.rate} onChange={e => patchTier(tier.id, { rate: e.target.value })} placeholder="e.g. 45" className="pr-8 rounded-xl text-[13px]" />
              <Percent size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <button
              onClick={() => removeTier(tier.id)}
              disabled={tiers.length <= 1}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addTier}
        className="flex items-center gap-2 text-[13px] font-medium text-gray-700 hover:text-gray-900 transition-colors"
      >
        <Plus size={15} />
        Add tier
      </button>

      {tiers.some(t => t.from !== "" && t.rate !== "") && (
        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4 space-y-2">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Preview</p>
          {tiers.map(t => (
            <div key={t.id} className="flex items-center gap-3">
              <div className="h-1.5 flex-1 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full rounded-full bg-gray-900" style={{ width: `${Math.min(100, Number(t.rate) || 0)}%`, opacity: 0.7 }} />
              </div>
              <span className="text-[12px] text-gray-600 whitespace-nowrap">
                {t.from ? `$${Number(t.from).toLocaleString()}` : "$0"} – {t.to ? `$${Number(t.to).toLocaleString()}` : "∞"} → <span className="font-semibold text-gray-900">{t.rate || "–"}%</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sidebar hints ──────────────────────────────────────────────────────────────

function SidebarHint({ step, type }: { step: number; type: WizardType | null }) {
  if (step === 1) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
          <p className="text-[13px] font-semibold text-gray-800 mb-1">By Member</p>
          <p className="text-[12px] text-gray-600 leading-relaxed">
            Perfect for mixed-experience teams. Each person gets their own rate — a senior earns 60% while a junior earns 45%.
          </p>
        </div>
        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
          <p className="text-[13px] font-semibold text-gray-800 mb-1">By Tiers</p>
          <p className="text-[12px] text-gray-600 leading-relaxed">
            Great for performance incentives. Staff automatically earn higher rates as they hit revenue milestones each month.
          </p>
        </div>
      </div>
    );
  }
  if (type === "member") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
          <p className="text-[13px] font-semibold text-gray-800 mb-2.5">Typical commission rates</p>
          <div className="space-y-2">
            {[
              ["Entry-level", "35 – 45%"],
              ["Mid-level",   "45 – 55%"],
              ["Senior",      "55 – 65%"],
              ["Booth renter","60 – 70%"],
            ].map(([label, range]) => (
              <div key={label} className="flex justify-between text-[12px]">
                <span className="text-gray-600">{label}</span>
                <span className="font-semibold text-gray-900">{range}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
          <p className="text-[12px] text-amber-800 leading-relaxed">
            <span className="font-semibold">Tip:</span> Use "Apply all" to set a base rate, then fine-tune individual members who deserve different rates.
          </p>
        </div>
      </div>
    );
  }
  if (type === "tiered") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
          <p className="text-[13px] font-semibold text-gray-800 mb-2.5">Example tier structure</p>
          <div className="space-y-2">
            {[
              ["$0 – $2,000",    "40%"],
              ["$2,001 – $5,000","50%"],
              ["$5,001+",        "60%"],
            ].map(([range, rate]) => (
              <div key={range} className="flex justify-between text-[12px]">
                <span className="text-gray-600">{range}</span>
                <span className="font-semibold text-gray-900">{rate}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
          <p className="text-[12px] text-amber-800 leading-relaxed">
            <span className="font-semibold">Tip:</span> Leave the "To" field blank on the last tier to mean "and above."
          </p>
        </div>
      </div>
    );
  }
  return null;
}

// ── Success Overlay ────────────────────────────────────────────────────────────

function SuccessOverlay({ onDone }: { onDone: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 px-10 py-12 max-w-sm w-full mx-4 flex flex-col items-center text-center">
        {/* Icon circle */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full border-2 border-gray-200 flex items-center justify-center bg-gray-50">
            <BadgeCheck size={44} className="text-gray-900" />
          </div>
          <span className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
            <Sparkles size={14} className="text-white" />
          </span>
        </div>

        <h2 className="text-[22px] font-bold text-gray-900 leading-tight mb-2">
          Commission structure saved!
        </h2>
        <p className="text-[14px] text-gray-500 leading-relaxed mb-8">
          Your team is set up and ready to start earning.
        </p>

        <Button
          onClick={onDone}
          className="rounded-full bg-gray-900 hover:bg-gray-800 text-white px-8 py-2.5 text-[15px] font-semibold"
        >
          Got it!
        </Button>
      </div>
    </div>
  );
}

// ── Main Wizard ────────────────────────────────────────────────────────────────

export default function CommissionsSetupWizard() {
  const navigate  = useNavigate();
  const { toast } = useToast();
  const qc        = useQueryClient();
  const { selectedStore } = useSelectedStore();

  const [step, setStep] = useState<1 | 2>(1);
  const [wizardType, setWizardType] = useState<WizardType | null>(null);
  const [structureName, setStructureName] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const [memberRates, setMemberRates] = useState<Record<number, MemberRate>>({});
  const [tiers, setTiers] = useState<TierRow[]>([
    { id: uid(), from: "0",    to: "2000", rate: "40" },
    { id: uid(), from: "2001", to: "5000", rate: "50" },
    { id: uid(), from: "5001", to: "",     rate: "60" },
  ]);

  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return [];
      const res = await fetch(`/api/staff?storeId=${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      const init: Record<number, MemberRate> = {};
      (data as StaffMember[]).forEach(s => {
        init[s.id] = {
          staffId: s.id,
          enabled: s.commissionEnabled ?? true,
          rate: s.commissionRate ? String(Math.round(Number(s.commissionRate))) : "50",
        };
      });
      setMemberRates(prev => ({ ...init, ...prev }));
      return data;
    },
    enabled: !!selectedStore?.id,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedStore?.id) throw new Error("No store selected");
      const name = structureName.trim() || (wizardType === "member" ? "Member Commission" : "Tiered Commission");
      const baseRate = wizardType === "tiered"
        ? Number(tiers[0]?.rate || 0)
        : Math.max(...Object.values(memberRates).filter(m => m.enabled).map(m => Number(m.rate) || 0), 0);
      const houseRate = 100 - baseRate;

      const csRes = await fetch("/api/contractor-payouts/commission-structures", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStore.id, name,
          description: wizardType === "tiered"
            ? `Tiered: ${tiers.map(t => `$${t.from}–${t.to || "∞"} @ ${t.rate}%`).join(", ")}`
            : "Per-member commission rates",
          employeePercent: baseRate, housePercent: houseRate,
          appliesTo: "both", isDefault: true,
          structureType: wizardType,
          tiers: wizardType === "tiered" ? tiers : null,
        }),
      });
      if (!csRes.ok) throw new Error((await csRes.json()).error ?? "Failed to create structure");
      const cs = await csRes.json();

      if (wizardType === "member") {
        const updates = Object.values(memberRates).filter(m => m.enabled);
        await Promise.all(updates.map(m =>
          fetch(`/api/staff/${m.staffId}/pay-rate`, {
            method: "PUT", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              commissionEnabled: true,
              commissionRate: String(parseFloat(m.rate) || 0),
              commissionStructureId: cs.id,
            }),
          })
        ));
      }
      return cs;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/commission-structures", selectedStore?.id] });
      setShowSuccess(true);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canNext = step === 1 && wizardType !== null;
  const canSave = step === 2 && (
    wizardType === "member"
      ? Object.values(memberRates).some(m => m.enabled)
      : tiers.every(t => t.from !== "" && t.rate !== "")
  );

  const stepLabels = ["Choose type", wizardType === "member" ? "Set member rates" : "Define tiers"];

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* ── Success overlay ────────────────────────────────────────────── */}
      {showSuccess && (
        <SuccessOverlay onDone={() => navigate("/commissions", { replace: true })} />
      )}

      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between h-14 px-6 border-b border-gray-200 flex-shrink-0">
        <button
          onClick={() => navigate("/commissions")}
          className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-800 font-medium transition-colors"
        >
          <X size={15} />
          Cancel
        </button>

        {/* Title + progress dots */}
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-[14px] font-bold text-gray-900 tracking-tight">New commission structure</p>
          <div className="flex items-center gap-1.5">
            {stepLabels.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i + 1 === step ? "w-6 bg-gray-900" : i + 1 < step ? "w-4 bg-gray-400" : "w-4 bg-gray-200"
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-800 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft size={14} />
              Back
            </button>
          )}
          {step === 1 ? (
            <Button
              onClick={() => setStep(2)}
              disabled={!canNext}
              className="bg-gray-900 hover:bg-gray-800 text-white px-5 rounded-full text-[13px] font-semibold flex items-center gap-1"
            >
              Next <ChevronRight size={14} />
            </Button>
          ) : (
            <Button
              onClick={() => save.mutate()}
              disabled={!canSave || save.isPending}
              className="bg-gray-900 hover:bg-gray-800 text-white px-5 rounded-full text-[13px] font-semibold"
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto px-6 py-10">

            {step === 1 && (
              <>
                <h2 className="text-[22px] font-bold text-gray-900 mb-1 tracking-tight">
                  What structure fits your team?
                </h2>
                <p className="text-[14px] text-gray-500 mb-6">
                  You can create multiple structures for different groups of staff.
                </p>
                <StepChooseType value={wizardType} onChange={setWizardType} />
              </>
            )}

            {step === 2 && (
              <>
                {/* Structure name */}
                <div className="mb-6">
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-2">
                    Structure name
                  </label>
                  <Input
                    value={structureName}
                    onChange={e => setStructureName(e.target.value)}
                    placeholder={wizardType === "member" ? "e.g. Team Commission Plan" : "e.g. Performance Tiers"}
                    className="rounded-xl text-[14px] font-medium"
                  />
                </div>

                {wizardType === "member" ? (
                  <StepByMember
                    staff={staffList}
                    memberRates={memberRates}
                    setMemberRates={setMemberRates}
                    onCustomize={id => navigate(`/team/${id}`)}
                  />
                ) : (
                  <StepByTiers tiers={tiers} setTiers={setTiers} />
                )}
              </>
            )}

          </div>
        </div>

        {/* Right helper sidebar */}
        <div className="hidden lg:block w-72 flex-shrink-0 border-l border-gray-100 bg-gray-50/50 overflow-y-auto">
          <div className="px-6 py-10">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Helpful to know
            </p>
            <SidebarHint step={step} type={wizardType} />
          </div>
        </div>

      </div>
    </div>
  );
}
