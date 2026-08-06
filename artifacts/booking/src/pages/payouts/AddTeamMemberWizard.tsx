import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneInput } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Loader2, Check, ChevronRight, ChevronLeft,
  User, Briefcase, CalendarDays, DollarSign,
  Scissors, Building2, UserCog, Crown, HelpCircle,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

export const EMPLOYMENT_TYPES = [
  { value: "nail_tech",            label: "Nail Technician" },
  { value: "senior_nail_tech",     label: "Senior Nail Technician" },
  { value: "nail_artist",          label: "Nail Artist" },
  { value: "acrylic_specialist",   label: "Acrylic Specialist" },
  { value: "gel_specialist",       label: "Gel Specialist" },
  { value: "pedicure_specialist",  label: "Pedicure Specialist" },
  { value: "manicurist",           label: "Manicurist" },
  { value: "esthetician",          label: "Esthetician" },
  { value: "waxing_specialist",    label: "Waxing Specialist" },
  { value: "lash_technician",      label: "Lash Technician" },
  { value: "brow_technician",      label: "Brow Technician" },
  { value: "salon_manager",        label: "Salon Manager" },
  { value: "receptionist",         label: "Front Desk / Receptionist" },
  { value: "assistant",            label: "Assistant" },
  { value: "booth_renter",         label: "Booth Renter" },
  { value: "owner",                label: "Owner" },
];

type CommissionStructure = {
  id: number;
  name: string;
  description: string | null;
  employeePercent: string;
  housePercent: string;
  isDefault: boolean;
};

type MemberRole = "commission_provider" | "self_employed" | "assistant" | "manager" | "owner";
type AccessLevel = "staff" | "manager" | "admin" | "limited";

const MEMBER_ROLES: Array<{
  value: MemberRole;
  label: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    value: "commission_provider",
    label: "Service Provider (Commission)",
    description: "Earns a percentage split of each service",
    icon: Scissors,
  },
  {
    value: "self_employed",
    label: "Service Provider (Self-Employed)",
    description: "Rents a booth or station independently",
    icon: Building2,
  },
  {
    value: "assistant",
    label: "Assistant",
    description: "Assists other providers, paid hourly",
    icon: HelpCircle,
  },
  {
    value: "manager",
    label: "Manager",
    description: "Manages the salon, salaried",
    icon: UserCog,
  },
  {
    value: "owner",
    label: "Owner",
    description: "Business owner — no pay config",
    icon: Crown,
  },
];

// ─── Wizard Data ──────────────────────────────────────────────────────────────

interface WizardData {
  // Step 1 — Legal / W9
  legalName: string;
  businessName: string;
  ssnTaxId: string;
  address: string;

  // Step 2 — Profile
  email: string;
  phone: string;
  jobTitle: string;
  accessLevel: AccessLevel;
  memberRole: MemberRole | null;
  commissionStructureId: number | null;

  // Step 3 — Booking
  canBeBookedOnline: boolean;
  showInCalendar: boolean;

  // Step 4 — Pay (role-specific)
  productCommissionPercent: string;
  tipsEnabled: boolean;
  boothRentAmount: string;
  boothRentFrequency: "weekly" | "monthly";
  selfEmployedCommission: boolean;
  hourlyRate: string;
  overtimeEnabled: boolean;
  salary: string;
  bonusEligible: boolean;
}

const DEFAULT_DATA: WizardData = {
  legalName: "",
  businessName: "",
  ssnTaxId: "",
  address: "",
  email: "",
  phone: "",
  jobTitle: "nail_tech",
  accessLevel: "staff",
  memberRole: null,
  commissionStructureId: null,
  canBeBookedOnline: true,
  showInCalendar: true,
  productCommissionPercent: "10",
  tipsEnabled: true,
  boothRentAmount: "",
  boothRentFrequency: "weekly",
  selfEmployedCommission: false,
  hourlyRate: "",
  overtimeEnabled: false,
  salary: "",
  bonusEligible: false,
};

// ─── Progress Bar ─────────────────────────────────────────────────────────────

const STEP_META = [
  { label: "Legal Info",  icon: User          },
  { label: "Profile",     icon: Briefcase     },
  { label: "Booking",     icon: CalendarDays  },
  { label: "Pay Setup",   icon: DollarSign    },
];

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-0 mb-1">
      {STEP_META.slice(0, total).map((meta, i) => {
        const n = i + 1;
        const done    = n < step;
        const current = n === step;
        const Icon    = meta.icon;
        return (
          <div key={n} className="flex-1 flex flex-col items-center relative">
            {/* connector line left */}
            {i > 0 && (
              <div className={cn(
                "absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2",
                done || current ? "bg-teal-500" : "bg-gray-200",
              )} />
            )}
            {/* circle */}
            <div className={cn(
              "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
              done    && "border-teal-500 bg-teal-500 text-white",
              current && "border-teal-600 bg-teal-50 text-teal-700",
              !done && !current && "border-gray-200 bg-white text-gray-400",
            )}>
              {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
            </div>
            <span className={cn(
              "mt-1 text-[10px] font-medium text-center leading-tight",
              current ? "text-teal-700" : done ? "text-teal-500" : "text-gray-400",
            )}>
              {meta.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1 — Legal / W9 ─────────────────────────────────────────────────────

function Step1({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
          Legal &amp; Tax Information
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">Used for W9 and payroll records. Stored securely.</p>
      </div>

      <div className="space-y-2">
        <Label>Legal Name <span className="text-red-400">*</span></Label>
        <Input
          value={data.legalName}
          onChange={e => update({ legalName: e.target.value })}
          placeholder="Jane Smith"
          className="rounded-xl"
          autoFocus
        />
        <p className="text-[11px] text-gray-400">Full legal name as it appears on government ID</p>
      </div>

      <div className="space-y-2">
        <Label>Business Name <span className="text-gray-400 text-xs">(optional)</span></Label>
        <Input
          value={data.businessName}
          onChange={e => update({ businessName: e.target.value })}
          placeholder="Jane's Nail Studio LLC"
          className="rounded-xl"
        />
      </div>

      <div className="space-y-2">
        <Label>SSN / Tax ID <span className="text-gray-400 text-xs">(optional)</span></Label>
        <Input
          type="password"
          value={data.ssnTaxId}
          onChange={e => update({ ssnTaxId: e.target.value })}
          placeholder="•••-••-••••"
          className="rounded-xl"
          autoComplete="off"
        />
        <p className="text-[11px] text-gray-400">Encrypted at rest — never displayed after entry</p>
      </div>

      <div className="space-y-2">
        <Label>Address <span className="text-gray-400 text-xs">(optional)</span></Label>
        <Input
          value={data.address}
          onChange={e => update({ address: e.target.value })}
          placeholder="123 Main St, Miami, FL 33101"
          className="rounded-xl"
        />
      </div>

      {/* Signature placeholder */}
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-600">W9 E-Signature</p>
          <p className="text-[11px] text-gray-400">Electronic signature collection — coming soon</p>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2 — Basic Profile ───────────────────────────────────────────────────

function Step2({ data, update, storeId: _storeId, structures = [] }: {
  data: WizardData;
  update: (p: Partial<WizardData>) => void;
  storeId?: number;
  structures?: CommissionStructure[];
}) {
  const isCommission = data.memberRole === "commission_provider";
  const structuresLoading = false; // structures are pre-fetched by parent

  // Auto-select default structure when structures load and none is chosen yet
  useEffect(() => {
    if (!isCommission || data.commissionStructureId !== null) return;
    const def = structures.find(s => s.isDefault) ?? structures[0];
    if (def) update({ commissionStructureId: def.id });
  }, [structures, isCommission]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
          Team Profile
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">Contact info, job title, and role in the business.</p>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Email</Label>
          <Input
            type="email"
            value={data.email}
            onChange={e => update({ email: e.target.value })}
            placeholder="jane@example.com"
            className="rounded-xl text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Phone</Label>
          <Input
            value={data.phone}
            onChange={e => {
              const f = formatPhoneInput(e.target.value);
              e.currentTarget.value = f;
              update({ phone: f });
            }}
            placeholder="(555) 000-0000"
            className="rounded-xl text-sm"
          />
        </div>
      </div>

      {/* Job title + access */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Job Title</Label>
          <Select value={data.jobTitle} onValueChange={v => update({ jobTitle: v })}>
            <SelectTrigger className="rounded-xl text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EMPLOYMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Access Level</Label>
          <Select value={data.accessLevel} onValueChange={v => update({ accessLevel: v as AccessLevel })}>
            <SelectTrigger className="rounded-xl text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="limited">Limited Access</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Member role — radio cards */}
      <div className="space-y-2">
        <Label className="text-xs">Member Role <span className="text-red-400">*</span></Label>
        <p className="text-[11px] text-gray-400 -mt-1">This controls booking, scheduling, and pay logic.</p>
        <div className="grid gap-2">
          {MEMBER_ROLES.map(r => {
            const Icon = r.icon;
            const selected = data.memberRole === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => update({
                  memberRole: r.value,
                  // Clear structure selection when switching away from commission role
                  commissionStructureId: r.value === "commission_provider" ? data.commissionStructureId : null,
                })}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all",
                  selected
                    ? "border-teal-500 bg-teal-50 ring-1 ring-teal-400"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50",
                )}
              >
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                  selected ? "bg-teal-500 text-white" : "bg-gray-100 text-gray-400",
                )}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn("text-sm font-medium leading-tight", selected ? "text-teal-800" : "text-gray-800")}>
                    {r.label}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{r.description}</div>
                </div>
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                  selected ? "border-teal-500 bg-teal-500" : "border-gray-300",
                )}>
                  {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Commission structure — only for commission_provider */}
      {isCommission && (
        <div className="space-y-2">
          <Label className="text-xs">Commission Structure <span className="text-red-400">*</span></Label>
          <p className="text-[11px] text-gray-400 -mt-1">Select one of your salon's commission structures.</p>

          {structuresLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading structures…
            </div>
          ) : structures.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-4 py-4 text-center space-y-1.5">
              <p className="text-xs text-gray-500 font-medium">No commission structures yet</p>
              <p className="text-[11px] text-gray-400">
                Create one in{" "}
                <a href="/payouts/commission-structures" className="text-teal-600 underline" target="_blank" rel="noreferrer">
                  Payouts → Commission Structures
                </a>
                {" "}first, then come back to add this team member.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {structures.map(s => {
                const selected = data.commissionStructureId === s.id;
                const emp = Number(s.employeePercent);
                const salon = Number(s.housePercent);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => update({ commissionStructureId: s.id })}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all",
                      selected
                        ? "border-teal-500 bg-teal-50 ring-1 ring-teal-400"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50",
                    )}
                  >
                    {/* Split pill */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={cn("text-base font-bold tabular-nums", selected ? "text-teal-700" : "text-gray-800")}>
                        {emp}%
                      </span>
                      <span className="text-gray-300 text-sm">/</span>
                      <span className={cn("text-base font-medium tabular-nums", selected ? "text-teal-500" : "text-gray-500")}>
                        {salon}%
                      </span>
                    </div>
                    {/* Name + description */}
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-sm font-medium leading-tight truncate", selected ? "text-teal-800" : "text-gray-800")}>
                        {s.name}
                        {s.isDefault && (
                          <span className="ml-1.5 text-[10px] font-medium bg-teal-100 text-teal-700 rounded px-1 py-0.5">Default</span>
                        )}
                      </div>
                      {s.description && (
                        <div className="text-[11px] text-gray-400 mt-0.5 truncate">{s.description}</div>
                      )}
                    </div>
                    {/* Radio dot */}
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                      selected ? "border-teal-500 bg-teal-500" : "border-gray-300",
                    )}>
                      {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step 3 — Booking & Availability ─────────────────────────────────────────

function Step3({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const isServiceProvider = data.memberRole === "commission_provider" || data.memberRole === "self_employed";

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
          Booking &amp; Availability
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">How this team member appears in booking and the calendar.</p>
      </div>

      {/* Auto-defaults notice */}
      <div className="rounded-xl bg-teal-50 border border-teal-100 px-4 py-3 space-y-1.5">
        <p className="text-xs font-semibold text-teal-800">Auto-configured defaults</p>
        <div className="flex items-center gap-2 text-[11px] text-teal-700">
          <Check className="w-3 h-3 shrink-0" />
          <span>Availability set to salon business hours</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-teal-700">
          <Check className="w-3 h-3 shrink-0" />
          <span>All salon services automatically assigned</span>
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <ToggleRow
          label="Can be booked online"
          description="Clients can book this provider from the public booking page"
          checked={data.canBeBookedOnline}
          onChange={v => update({ canBeBookedOnline: v })}
          defaultOn={isServiceProvider}
        />
        <ToggleRow
          label="Appears in booking calendar"
          description="Shown on the internal salon calendar for staff scheduling"
          checked={data.showInCalendar}
          onChange={v => update({ showInCalendar: v })}
          defaultOn={isServiceProvider}
        />
      </div>

      {data.memberRole === "owner" && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
          <p className="text-xs font-medium text-amber-800">Owner role — no pay configuration needed.</p>
          <p className="text-[11px] text-amber-600 mt-0.5">Clicking "Add Team Member" will complete setup.</p>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label, description, checked, onChange, defaultOn,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  defaultOn: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-800">{label}</p>
          {defaultOn && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700">default ON</span>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0 mt-0.5" />
    </div>
  );
}

// ─── Step 4 — Pay Configuration ───────────────────────────────────────────────

function Step4({ data, update, structures = [] }: { data: WizardData; update: (p: Partial<WizardData>) => void; structures?: CommissionStructure[] }) {
  const role = data.memberRole;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
          Pay Configuration
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">All settings can be updated later from the contractor profile.</p>
      </div>

      {role === "commission_provider" && <CommissionPayFields data={data} update={update} structures={structures} />}
      {role === "self_employed"       && <SelfEmployedPayFields data={data} update={update} />}
      {role === "assistant"           && <AssistantPayFields data={data} update={update} />}
      {role === "manager"             && <ManagerPayFields data={data} update={update} />}
    </div>
  );
}

function CommissionPayFields({ data, update, structures = [] }: { data: WizardData; update: (p: Partial<WizardData>) => void; structures?: CommissionStructure[] }) {
  const selected = structures.find(s => s.id === data.commissionStructureId);
  return (
    <div className="space-y-4">
      {/* Commission structure summary */}
      {selected && (
        <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 flex items-center gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-teal-700">{Number(selected.employeePercent)}%</div>
            <div className="text-[11px] text-teal-600">Provider</div>
          </div>
          <div className="flex-1 text-center text-gray-400 text-lg font-light">/</div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-500">{Number(selected.housePercent)}%</div>
            <div className="text-[11px] text-gray-400">Salon</div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-teal-800">{selected.name}</p>
            <p className="text-[11px] text-teal-600 mt-0.5">Service commission</p>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Product Commission %</Label>
        <div className="relative">
          <Input
            type="number"
            min={0}
            max={100}
            value={data.productCommissionPercent}
            onChange={e => update({ productCommissionPercent: e.target.value })}
            className="rounded-xl pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
        </div>
        <p className="text-[11px] text-gray-400">Applied to retail product sales (default 10%)</p>
      </div>

      <ToggleRow
        label="Tips enabled"
        description="Allow clients to add tips for this provider"
        checked={data.tipsEnabled}
        onChange={v => update({ tipsEnabled: v })}
        defaultOn={true}
      />
    </div>
  );
}

function SelfEmployedPayFields({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Booth Rent Amount</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
            <Input
              type="number"
              min={0}
              value={data.boothRentAmount}
              onChange={e => update({ boothRentAmount: e.target.value })}
              placeholder="0.00"
              className="rounded-xl pl-7"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Frequency</Label>
          <Select value={data.boothRentFrequency} onValueChange={v => update({ boothRentFrequency: v as "weekly" | "monthly" })}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ToggleRow
        label="Optional commission"
        description="Also earn a % on services on top of booth rent"
        checked={data.selfEmployedCommission}
        onChange={v => update({ selfEmployedCommission: v })}
        defaultOn={false}
      />
    </div>
  );
}

function AssistantPayFields({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Hourly Rate</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
          <Input
            type="number"
            min={0}
            step={0.25}
            value={data.hourlyRate}
            onChange={e => update({ hourlyRate: e.target.value })}
            placeholder="15.00"
            className="rounded-xl pl-7"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">/hr</span>
        </div>
      </div>

      <ToggleRow
        label="Overtime eligible"
        description="Earn 1.5× rate after 40 hours per week"
        checked={data.overtimeEnabled}
        onChange={v => update({ overtimeEnabled: v })}
        defaultOn={false}
      />

      <ToggleRow
        label="Tips enabled"
        description="Allow clients to add tips for this assistant"
        checked={data.tipsEnabled}
        onChange={v => update({ tipsEnabled: v })}
        defaultOn={false}
      />
    </div>
  );
}

function ManagerPayFields({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Annual Salary</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
          <Input
            type="number"
            min={0}
            value={data.salary}
            onChange={e => update({ salary: e.target.value })}
            placeholder="45000"
            className="rounded-xl pl-7"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">/yr</span>
        </div>
      </div>

      <ToggleRow
        label="Bonus eligible"
        description="Eligible for performance-based bonuses"
        checked={data.bonusEligible}
        onChange={v => update({ bonusEligible: v })}
        defaultOn={false}
      />
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function AddTeamMemberWizard({
  storeId,
  onSuccess,
}: {
  storeId?: number;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(DEFAULT_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (patch: Partial<WizardData>) => setData(d => ({ ...d, ...patch }));

  // Lift commission structures here so Step2 and Step4 share the same cached fetch
  const { data: structures = [] } = useQuery<CommissionStructure[]>({
    queryKey: ["/api/contractor-payouts/commission-structures", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/commission-structures?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!storeId,
  });

  // Owners skip step 4
  const totalSteps = data.memberRole === "owner" ? 3 : 4;

  const canProceed = (): boolean => {
    if (step === 1) return data.legalName.trim().length > 0;
    if (step === 2) {
      if (!data.memberRole) return false;
      if (data.memberRole === "commission_provider" && !data.commissionStructureId) return false;
      return true;
    }
    return true;
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const nameParts = data.legalName.trim().split(/\s+/);
      const firstName = nameParts[0] ?? "Staff";
      const lastName  = nameParts.slice(1).join(" ") || "Member";

      const productCommissionRate = data.productCommissionPercent || "10";
      const payoutMethod          = "check";

      // Encode extra pay & booking settings into notes for future use
      const notes = JSON.stringify({
        memberRole: data.memberRole,
        bookingSettings: {
          canBeBookedOnline: data.canBeBookedOnline,
          showInCalendar: data.showInCalendar,
          availableDuringBusinessHours: true,
          services: "inherit_from_salon",
        },
        paySettings: buildPaySettings(data),
        ...(data.businessName ? { businessName: data.businessName } : {}),
        ...(data.address      ? { address: data.address }           : {}),
      });

      const res = await fetch("/api/contractor-payouts/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          storeId,
          firstName,
          lastName,
          email: data.email.trim().toLowerCase() || null,
          phone: data.phone || null,
          role: data.jobTitle,
          accessLevel: data.accessLevel,
          payoutMethod,
          // Only send structure ID for commission providers — backend resolves the rate from it
          commissionStructureId: data.memberRole === "commission_provider" ? (data.commissionStructureId ?? null) : null,
          productCommissionRate,
          taxClassification: "individual",
          notes,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create team member");
      }

      toast({
        title: "Team member added!",
        description: `${data.legalName} has been added to your team.`,
      });
      onSuccess();
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const next = () => {
    if (!canProceed()) return;
    const isLastStep = step === totalSteps || (step === 3 && data.memberRole === "owner");
    if (isLastStep) {
      handleSubmit();
    } else {
      setStep(s => s + 1);
    }
  };

  const back = () => setStep(s => Math.max(1, s - 1));

  const isLastStep = step === totalSteps || (step === 3 && data.memberRole === "owner");

  return (
    <div className="space-y-5">
      <ProgressBar step={step} total={totalSteps} />

      <div className="min-h-[320px]">
        {step === 1 && <Step1 data={data} update={update} />}
        {step === 2 && <Step2 data={data} update={update} storeId={storeId} structures={structures} />}
        {step === 3 && <Step3 data={data} update={update} />}
        {step === 4 && data.memberRole !== "owner" && <Step4 data={data} update={update} structures={structures} />}
      </div>

      {/* Navigation */}
      <div className="flex gap-2 pt-1">
        {step > 1 && (
          <Button
            type="button"
            variant="outline"
            onClick={back}
            disabled={isSubmitting}
            className="rounded-xl gap-1.5 flex-1"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
        )}
        <Button
          type="button"
          onClick={next}
          disabled={!canProceed() || isSubmitting}
          className="rounded-xl gap-1.5 flex-1 bg-teal-600 hover:bg-teal-700 text-white"
        >
          {isSubmitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</>
          ) : isLastStep ? (
            <><Check className="w-4 h-4" /> Add Team Member</>
          ) : (
            <>Next <ChevronRight className="w-4 h-4" /></>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPaySettings(data: WizardData): Record<string, unknown> {
  const role = data.memberRole;
  if (role === "commission_provider") {
    return {
      type: "commission",
      commissionStructureId: data.commissionStructureId,
      productCommissionPercent: Number(data.productCommissionPercent),
      tipsEnabled: data.tipsEnabled,
    };
  }
  if (role === "self_employed") {
    return {
      type: "booth_rent",
      boothRentAmount: Number(data.boothRentAmount) || 0,
      boothRentFrequency: data.boothRentFrequency,
      commissionEnabled: data.selfEmployedCommission,
    };
  }
  if (role === "assistant") {
    return {
      type: "hourly",
      hourlyRate: Number(data.hourlyRate) || 0,
      overtimeEnabled: data.overtimeEnabled,
      tipsEnabled: data.tipsEnabled,
    };
  }
  if (role === "manager") {
    return {
      type: "salary",
      annualSalary: Number(data.salary) || 0,
      bonusEligible: data.bonusEligible,
    };
  }
  return { type: "none" };
}
