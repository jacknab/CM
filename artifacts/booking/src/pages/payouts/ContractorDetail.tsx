import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow, differenceInHours, differenceInMinutes } from "date-fns";
import {
  ArrowLeft, Zap, CheckCircle2, Clock, AlertCircle, XCircle,
  Mail, Phone, CreditCard, Plus, DollarSign,
  BookOpen, Calendar, Edit2, Save, X, Percent, Link, Copy, Check, Hourglass, SlidersHorizontal,
  Scissors, Trash2, MapPin, Smartphone, KeyRound, RefreshCw, ChevronDown, Send, Camera, User, Loader2,
  AlertTriangle, ShieldCheck, Banknote, Sun,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useStaffAvailability, useSetStaffAvailability, useDeleteStaffAvailabilityRule, useStaffServices, useSetStaffServices,
} from "@/hooks/use-staff";
import { useServices } from "@/hooks/use-services";
import { useServiceCategories } from "@/hooks/use-addons";
import type { StaffAvailability, Service } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSelectedStore } from "@/hooks/use-store";
import {
  type CommissionStructure,
  SplitBar,
  CommissionStructureDialog,
  COMMISSION_PRESETS,
} from "./commissionComponents";

type ContractorDetail = {
  id: number; storeId: number; firstName: string; lastName: string;
  email: string | null; phone: string | null; role: string | null;
  commissionRate: string; productCommissionRate: string; payoutMethod: string;
  taxClassification: string | null;
  onboardingStatus: string; bankVerified: boolean; isActive: boolean;
  stripeAccountId: string | null; notes: string | null;
  commissionStructureId: number | null; staffId: number | null;
  bio: string | null; color: string | null; showOnCalendar: boolean | null;
  avatarUrl: string | null; avatarThumbUrl: string | null;
  bankAccounts: Array<{ id: number; accountLast4: string | null; bankName: string | null;
    routingLast4: string | null; accountType: string; verificationStatus: string; isDefault: boolean }>;
  w9Records: Array<{ id: number; year: number; legalName: string; taxClassification: string; certifiedAt: string | null }>;
  recentPayouts: Array<{ id: number; payoutRunId: number; netAmount: string; grossAmount: string;
    status: string; paidAt: string | null; periodStart: string | null; periodEnd: string | null }>;
};

const STATUS_INFO: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  complete:       { label: "Ready",          icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  in_progress:    { label: "Onboarding",     icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50"   },
  pending:        { label: "Not Started",    icon: AlertCircle,  color: "text-gray-500",    bg: "bg-gray-50"    },
  invite_pending: { label: "Invite pending", icon: Hourglass,    color: "text-blue-600",    bg: "bg-blue-50"    },
  restricted:     { label: "Restricted",     icon: XCircle,      color: "text-red-600",     bg: "bg-red-50"     },
};

function fmt$(n: string | number) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type BankFormStep = "form" | "confirm" | "processing" | "success";

function AddBankDialog({
  open, onClose, contractorId, existingAccounts,
}: {
  open: boolean;
  onClose: () => void;
  contractorId: number;
  existingAccounts: ContractorDetail["bankAccounts"];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState<BankFormStep>("form");
  const [form, setForm] = useState({
    legalName: "",
    routingNumber: "",
    accountNumber: "",
    accountType: "checking",
    accountHolderType: "individual",
  });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [savedLast4, setSavedLast4] = useState("");

  // Fetch Stripe publishable key once the dialog opens
  const { data: tokenConfig, isLoading: configLoading } = useQuery({
    queryKey: ["/api/contractor-payouts/bank-token-config"],
    queryFn: async () => {
      const res = await fetch("/api/contractor-payouts/bank-token-config", { credentials: "include" });
      if (!res.ok) throw new Error("Stripe not configured");
      return res.json() as Promise<{ publishableKey: string }>;
    },
    enabled: open,
    retry: false,
  });

  const hasExisting = existingAccounts.length > 0;

  function validate() {
    const e: Partial<typeof form> = {};
    if (!form.legalName.trim())                  e.legalName      = "Required";
    if (!/^\d{9}$/.test(form.routingNumber))     e.routingNumber  = "Must be exactly 9 digits";
    if (!form.accountNumber.trim())              e.accountNumber  = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmitForm() {
    if (!validate()) return;
    // If there's already a bank account on file, ask for confirmation first
    if (hasExisting) { setStep("confirm"); return; }
    void tokenizeAndSave();
  }

  async function tokenizeAndSave() {
    if (!tokenConfig?.publishableKey) {
      toast({ title: "Stripe is not configured on this server", variant: "destructive" });
      return;
    }
    setStep("processing");
    try {
      // Dynamic import keeps Stripe.js out of the initial bundle
      const { loadStripe } = await import("@stripe/stripe-js");
      const stripe = await loadStripe(tokenConfig.publishableKey);
      if (!stripe) throw new Error("Stripe.js failed to load");

      // Tokenize client-side — raw numbers never leave the browser
      const { token, error } = await stripe.createToken("bank_account", {
        country:              "US",
        currency:             "usd",
        routing_number:       form.routingNumber,
        account_number:       form.accountNumber,
        account_holder_name:  form.legalName,
        account_holder_type:  form.accountHolderType as "individual" | "company",
      });

      if (error || !token) {
        toast({ title: error?.message ?? "Tokenization failed — check your routing and account numbers.", variant: "destructive" });
        setStep("form");
        return;
      }

      const res = await fetch(`/api/contractor-payouts/contractors/${contractorId}/bank-accounts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripeToken:       token.id,
          accountType:       form.accountType,
          accountHolderType: form.accountHolderType,
          accountHolderName: form.legalName,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? "Failed to save");
      }

      const saved = await res.json();
      setSavedLast4(saved.accountLast4 ?? "");
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/contractor-detail", contractorId] });
      setStep("success");
    } catch (e: any) {
      toast({ title: e?.message ?? "Error saving bank account", variant: "destructive" });
      setStep("form");
    }
  }

  function handleClose() {
    // Reset state on close
    setForm({ legalName: "", routingNumber: "", accountNumber: "", accountType: "checking", accountHolderType: "individual" });
    setErrors({});
    setStep("form");
    setSavedLast4("");
    onClose();
  }

  const f = (k: keyof typeof form) => (v: string) => {
    setForm(p => ({ ...p, [k]: v }));
    setErrors(p => ({ ...p, [k]: undefined }));
  };

  // ── Success state ────────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <Dialog open={open} onOpenChange={v => !v && handleClose()}>
        <DialogContent className="max-w-sm rounded-2xl">
          <div className="flex flex-col items-center py-6 text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>Bank account saved!</p>
              {savedLast4 && (
                <p className="text-sm text-gray-500 mt-1">Account ending in ···{savedLast4}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">Verification is pending. Payouts will be enabled once Stripe confirms the account.</p>
            </div>
            <Button onClick={handleClose} className="rounded-xl mt-1 bg-teal-600 hover:bg-teal-700 text-white">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Confirm replace state ────────────────────────────────────────────────────
  if (step === "confirm") {
    const existing = existingAccounts.find(b => b.isDefault) ?? existingAccounts[0];
    return (
      <Dialog open={open} onOpenChange={v => !v && handleClose()}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Outfit, sans-serif" }}>Replace existing account?</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                There is already a bank account on file
                {existing?.accountLast4 ? ` ending in ···${existing.accountLast4}` : ""}. Adding a new one will make it the default for future payouts.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep("form")} className="rounded-xl">Back</Button>
            <Button onClick={() => void tokenizeAndSave()} className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white">
              Yes, replace it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Processing state ─────────────────────────────────────────────────────────
  if (step === "processing") {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm rounded-2xl">
          <div className="flex flex-col items-center py-8 gap-3 text-center">
            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            <p className="text-sm text-gray-500">Securely tokenizing your bank details…</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Main form ────────────────────────────────────────────────────────────────
  const isReady = !configLoading && !!tokenConfig?.publishableKey;

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Outfit, sans-serif" }}>Add Direct Deposit Account</DialogTitle>
        </DialogHeader>

        {/* Security notice */}
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100">
          <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">Bank details are encrypted by Stripe before leaving your device. We never store your routing or account numbers.</p>
        </div>

        <div className="space-y-4 py-1">
          {/* Legal name */}
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Full Legal Name <span className="text-red-500">*</span></Label>
            <Input
              value={form.legalName}
              onChange={e => f("legalName")(e.target.value)}
              className={`rounded-xl ${errors.legalName ? "border-red-400" : ""}`}
              placeholder="As it appears on your bank account"
            />
            {errors.legalName && <p className="text-xs text-red-500 mt-1">{errors.legalName}</p>}
          </div>

          {/* Account holder type + Account type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">Account Holder Type</Label>
              <Select value={form.accountHolderType} onValueChange={f("accountHolderType")}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">Account Type</Label>
              <Select value={form.accountType} onValueChange={f("accountType")}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Routing number */}
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Routing Number <span className="text-red-500">*</span></Label>
            <Input
              value={form.routingNumber}
              onChange={e => f("routingNumber")(e.target.value.replace(/\D/g, "").slice(0, 9))}
              className={`rounded-xl font-mono ${errors.routingNumber ? "border-red-400" : ""}`}
              placeholder="9-digit routing number"
              maxLength={9}
              inputMode="numeric"
            />
            {errors.routingNumber
              ? <p className="text-xs text-red-500 mt-1">{errors.routingNumber}</p>
              : <p className="text-xs text-gray-400 mt-1">Found at the bottom-left of a check</p>
            }
          </div>

          {/* Account number */}
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Account Number <span className="text-red-500">*</span></Label>
            <Input
              value={form.accountNumber}
              onChange={e => f("accountNumber")(e.target.value.replace(/\D/g, ""))}
              className={`rounded-xl font-mono ${errors.accountNumber ? "border-red-400" : ""}`}
              placeholder="Bank account number"
              inputMode="numeric"
            />
            {errors.accountNumber && <p className="text-xs text-red-500 mt-1">{errors.accountNumber}</p>}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} className="rounded-xl">Cancel</Button>
          <Button
            onClick={handleSubmitForm}
            disabled={!isReady}
            className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white gap-2"
          >
            {configLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
            ) : (
              <><Banknote className="w-4 h-4" /> Save Bank Account</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TokenStatus = { active: boolean; createdAt: string | null; expiresAt: string | null; lastExpiredCreatedAt: string | null; lastExpiredExpiresAt: string | null } | null;

function buildInviteTooltip(tokenStatus: TokenStatus): string | null {
  if (!tokenStatus?.active || !tokenStatus.createdAt || !tokenStatus.expiresAt) return null;
  const sentAt = new Date(tokenStatus.createdAt);
  const expiresAt = new Date(tokenStatus.expiresAt);
  const now = new Date();
  const sentAgo = formatDistanceToNow(sentAt, { addSuffix: true });
  const hoursLeft = differenceInHours(expiresAt, now);
  const minutesLeft = differenceInMinutes(expiresAt, now) % 60;
  let expiryStr: string;
  if (hoursLeft > 0) {
    expiryStr = minutesLeft > 0
      ? `expires in ${hoursLeft}h ${minutesLeft}m`
      : `expires in ${hoursLeft}h`;
  } else if (minutesLeft > 0) {
    expiryStr = `expires in ${minutesLeft}m`;
  } else {
    expiryStr = "expiring soon";
  }
  return `Last sent ${sentAgo} · ${expiryStr}`;
}

function InviteButtonWithTooltip({
  tokenStatus, isPending, inviteSent, onSend,
}: {
  tokenStatus: TokenStatus;
  isPending: boolean;
  inviteSent: boolean;
  onSend: () => void;
}) {
  const hasActive = tokenStatus?.active === true;
  const tooltipText = buildInviteTooltip(tokenStatus);
  const label = inviteSent
    ? "Invite sent ✓"
    : isPending
    ? "Sending…"
    : hasActive
    ? "Resend invite"
    : "Send Invite Email";

  return (
    <div className="relative group">
      <Button
        size="sm"
        variant="outline"
        onClick={onSend}
        disabled={isPending || inviteSent}
        className="rounded-xl gap-2"
      >
        <Mail className="w-4 h-4" />
        {label}
      </Button>
      {tooltipText && !inviteSent && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-1.5 whitespace-nowrap shadow-lg">
            {tooltipText}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

type Adjustment = {
  id: number;
  contractorId: number;
  amount: string;
  category: string;
  description: string;
  date: string;
  createdAt: string;
  createdBy: string | null;
};

// ─── Staff Portal Access Code ──────────────────────────────────────────────
function StaffAccessCodeCard({ staffId, staffName }: { staffId: number; staffName: string }) {
  const { toast } = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/staff/${staffId}/access-code`, { credentials: "include" })
      .then(r => r.json())
      .then(data => { if (cancelled) return; if (data.code) { setCode(data.code); setExpiresAt(data.expiresAt); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [staffId]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/staff/${staffId}/generate-access-code`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to generate code");
      setCode(data.code); setExpiresAt(data.expiresAt); setCopied(false);
    } catch (err: any) {
      toast({ title: err.message || "Failed to generate access code", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <Card className="rounded-2xl border-gray-100 shadow-sm">
      <CardHeader className="border-b border-gray-50 py-4 px-6">
        <CardTitle className="flex items-center gap-2 text-base" style={{ fontFamily: "Outfit, sans-serif" }}>
          <Smartphone className="w-4 h-4" /> Staff Portal Access Code
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <p className="text-sm text-gray-400">
          Generate a one-time code for <span className="font-medium text-gray-700">{staffName}</span> to sign
          in to the staff portal. Each code can only be used once and expires after 24 hours.
        </p>
        {loading ? (
          <p className="text-sm text-gray-400">Checking for existing code…</p>
        ) : code ? (
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-6 py-5 flex flex-col items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Active Access Code</p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-4xl font-bold tracking-[0.25em] text-teal-700 select-all">{code}</span>
              <button type="button" onClick={handleCopy} className="p-2 rounded-lg hover:bg-teal-100 transition-colors" title="Copy code">
                {copied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-teal-600" />}
              </button>
            </div>
            {expiryLabel && <p className="text-xs text-gray-400">Expires {expiryLabel} · one-time use only</p>}
            <Button variant="outline" size="sm" onClick={generate} disabled={generating} className="mt-1 rounded-xl">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${generating ? "animate-spin" : ""}`} />
              {generating ? "Generating…" : "Generate New Code"}
            </Button>
          </div>
        ) : (
          <Button onClick={generate} disabled={generating} className="rounded-xl gap-2">
            <KeyRound className="w-4 h-4" />
            {generating ? "Generating…" : "Generate Access Code"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Timeclock PIN Card ───────────────────────────────────────────────────────
function TimeclockPinCard({ staffId, storeId, staffName }: { staffId: number; storeId: number; staffName: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [newPin, setNewPin]       = useState("");
  const [showPin, setShowPin]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [removing, setRemoving]   = useState(false);
  const [confirm, setConfirm]     = useState(false);

  const { data, isLoading, isError } = useQuery<{ pin: string | null; hasPin: boolean }>({
    queryKey: ["timeclock-pin", staffId, storeId],
    queryFn: async () => {
      const res = await fetch(`/api/timeclock/pin/${staffId}?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch PIN");
      return res.json();
    },
  });

  const handleSave = async () => {
    if (!/^\d{4}$/.test(newPin)) {
      toast({ title: "PIN must be exactly 4 digits", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/timeclock/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ staffId, storeId, pin: newPin }),
      });
      let body: any = {};
      try { body = await res.json(); } catch { /* non-JSON body */ }
      if (res.status === 409) {
        toast({ title: "PIN already in use", description: "This PIN is already assigned to another team member. Choose a different 4-digit PIN.", variant: "destructive" });
        return;
      }
      if (!res.ok) throw new Error(body.error || `Server error (${res.status})`);
      toast({ title: "Time clock PIN updated" });
      setNewPin("");
      qc.invalidateQueries({ queryKey: ["timeclock-pin", staffId, storeId] });
    } catch (err: any) {
      toast({ title: err.message || "Failed to save PIN", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/timeclock/pin/${staffId}?storeId=${storeId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove PIN");
      toast({ title: "Time clock PIN removed" });
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ["timeclock-pin", staffId, storeId] });
    } catch (err: any) {
      toast({ title: err.message || "Failed to remove PIN", variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card className="rounded-2xl border-gray-100 shadow-sm">
      <CardHeader className="border-b border-gray-50 py-4 px-6">
        <CardTitle className="flex items-center gap-2 text-base" style={{ fontFamily: "Outfit, sans-serif" }}>
          <Clock className="w-4 h-4" /> Time Clock PIN
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <p className="text-sm text-gray-400">
          Set a 4-digit PIN for <span className="font-medium text-gray-700">{staffName}</span> to clock in and out
          at the POS terminal. Each PIN must be unique across your team.
        </p>

        {isLoading ? (
          <p className="text-sm text-gray-400">Loading PIN status…</p>
        ) : isError ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Could not load PIN status. Check your connection and refresh the page.
          </div>
        ) : data?.hasPin ? (
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                <Clock className="w-4 h-4 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-teal-800">PIN is set</p>
                <p className="text-xs text-teal-600 mt-0.5 font-mono tracking-widest">
                  {showPin ? data.pin : "••••"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPin(v => !v)}
                className="text-xs text-teal-600 hover:text-teal-800 underline underline-offset-2"
              >
                {showPin ? "Hide" : "Reveal"}
              </button>
              {!confirm ? (
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setConfirm(true)}
                  className="rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Remove PIN?</span>
                  <Button
                    variant="destructive" size="sm"
                    onClick={handleRemove} disabled={removing}
                    className="rounded-xl h-7 px-3 text-xs"
                  >
                    {removing ? "Removing…" : "Confirm"}
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setConfirm(false)}
                    className="rounded-xl h-7 px-2 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            No PIN set — use the form below to assign one.
          </div>
        )}

        {/* Set / change PIN form */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="text-xs text-gray-500 mb-1 block">
              {data?.hasPin ? "New PIN (overwrite)" : "Set PIN"}
            </Label>
            <Input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder="4-digit PIN"
              value={newPin}
              onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="rounded-xl font-mono tracking-widest text-lg w-36"
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || newPin.length !== 4}
            className="rounded-xl gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : data?.hasPin ? "Update PIN" : "Set PIN"}
          </Button>
        </div>
        <p className="text-xs text-gray-400">
          The PIN is used at the POS terminal to clock in and out. It cannot be the same as another team member's PIN.
        </p>
      </CardContent>
    </Card>
  );
}

function AdjustmentsTab({ contractorId }: { contractorId: number }) {
  const { data, isLoading } = useQuery<Adjustment[]>({
    queryKey: ["contractor-adjustments", contractorId],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/contractors/${contractorId}/adjustments`);
      if (!res.ok) throw new Error("Failed to fetch adjustments");
      return res.json();
    },
    enabled: !!contractorId,
  });

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardContent className="py-10 text-center text-sm text-gray-400">Loading adjustments…</CardContent>
      </Card>
    );
  }

  const adjustments = data ?? [];
  const net = adjustments.reduce((s, a) => s + Number(a.amount), 0);

  return (
    <Card className="rounded-2xl border-gray-100 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b border-gray-50 py-4 px-6">
        <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Outfit, sans-serif" }}>
          <SlidersHorizontal className="w-4 h-4 text-purple-500" />
          Ledger Adjustments
        </CardTitle>
        {adjustments.length > 0 && (
          <span className={`text-sm font-semibold ${net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            Net: {net >= 0 ? "+" : ""}{fmt$(net)}
          </span>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {adjustments.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No adjustments on record for this contractor.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/50 text-xs font-medium text-gray-400 uppercase tracking-wide">
                <th className="text-left px-6 py-3">Date</th>
                <th className="text-left px-6 py-3">Category</th>
                <th className="text-left px-6 py-3">Description</th>
                <th className="text-right px-6 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map(adj => {
                const amt = Number(adj.amount);
                return (
                  <tr key={adj.id} className="border-t border-gray-50 hover:bg-gray-50/40">
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{adj.date}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                        {adj.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{adj.description}</td>
                    <td className={`px-6 py-4 text-right font-semibold ${amt >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {amt >= 0 ? "+" : ""}{fmt$(amt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Day constants ────────────────────────────────────────────────────────────
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "M", "T", "W", "T", "F", "Sat"];

// ─── Schedule Tab ─────────────────────────────────────────────────────────────
/** Convert "HH:MM" 24-hour string → "h:MM AM/PM" */
function fmt12(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/** Generate "HH:MM" slots every 30 min from openTime to closeTime (inclusive) */
function gen30MinSlots(openTime: string, closeTime: string): string[] {
  const [oh, om] = (openTime || "09:00").split(":").map(Number);
  const [ch, cm] = (closeTime || "17:00").split(":").map(Number);
  const startMins = oh * 60 + om;
  const endMins   = ch * 60 + cm;
  const slots: string[] = [];
  for (let mins = startMins; mins <= endMins; mins += 30) {
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(mins % 60).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

interface DaySetting {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

type BizHour = { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean };

function ContractorScheduleTab({ staffId }: { staffId: number }) {
  const { selectedStore } = useSelectedStore();
  const { data: rules = [], isLoading: rulesLoading } = useStaffAvailability(staffId);
  const { data: bizHoursRaw = [] } = useQuery<BizHour[]>({
    queryKey: [`/api/business-hours?storeId=${selectedStore?.id}`],
    enabled: !!selectedStore?.id,
    queryFn: async () => {
      const res = await fetch(`/api/business-hours?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
  const { mutate: setAvailability, isPending: isSaving } = useSetStaffAvailability();
  const { toast } = useToast();

  // dayOfWeek → salon business hours
  const bizHours = useMemo(() => {
    const map = new Map<number, BizHour>();
    for (const bh of bizHoursRaw) map.set(bh.dayOfWeek, bh);
    return map;
  }, [bizHoursRaw]);

  // Per-day editable state (index = dayOfWeek 0–6)
  const [days, setDays] = useState<DaySetting[]>(() =>
    Array.from({ length: 7 }, () => ({ enabled: false, startTime: "09:00", endTime: "17:00" }))
  );

  // Sync when rules or business hours load
  useEffect(() => {
    if (rulesLoading) return;
    setDays(
      Array.from({ length: 7 }, (_, dow) => {
        const rule = (rules as StaffAvailability[]).find(r => r.dayOfWeek === dow);
        const bh   = bizHours.get(dow);
        return {
          enabled:   !!rule,
          startTime: rule?.startTime ?? bh?.openTime  ?? "09:00",
          endTime:   rule?.endTime   ?? bh?.closeTime ?? "17:00",
        };
      })
    );
  }, [rules, bizHours, rulesLoading]);

  const persist = (updated: DaySetting[]) => {
    const newRules = updated
      .flatMap((d, dow) =>
        d.enabled ? [{ dayOfWeek: dow, startTime: d.startTime, endTime: d.endTime }] : []
      );
    setAvailability({ staffId, rules: newRules }, {
      onError: () => toast({ title: "Failed to save schedule", variant: "destructive" }),
    });
  };

  // Debounced persist — coalesces rapid toggles/dropdown changes into one PUT
  const pendingDays  = useRef<DaySetting[] | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePersist = (updated: DaySetting[]) => {
    pendingDays.current = updated;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (pendingDays.current) {
        persist(pendingDays.current);
        pendingDays.current = null;
      }
    }, 600);
  };

  // Clean up on unmount
  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  const [salonCopied, setSalonCopied] = useState(false);

  const copySalonHours = () => {
    if (bizHoursRaw.length === 0) return;
    const next = Array.from({ length: 7 }, (_, dow): DaySetting => {
      const bh = bizHours.get(dow);
      if (!bh || bh.isClosed) return { enabled: false, startTime: "09:00", endTime: "17:00" };
      return { enabled: true, startTime: bh.openTime, endTime: bh.closeTime };
    });
    setDays(next);
    // Intentional full-replace — skip debounce, fire immediately
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    persist(next);
    setSalonCopied(true);
    setTimeout(() => setSalonCopied(false), 2000);
  };

  const toggleDay = (dow: number) => {
    setDays(prev => {
      const next = prev.map((d, i) => i === dow ? { ...d, enabled: !d.enabled } : d);
      schedulePersist(next);
      return next;
    });
  };

  const updateTime = (dow: number, field: "startTime" | "endTime", value: string) => {
    setDays(prev => {
      const next = prev.map((d, i) => i === dow ? { ...d, [field]: value } : d);
      schedulePersist(next);
      return next;
    });
  };

  return (
    <Card className="rounded-2xl border-gray-100 shadow-sm">
      <CardHeader className="border-b border-gray-50 py-4 px-6">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Outfit, sans-serif" }}>
              <Clock className="w-4 h-4 text-teal-600" />
              Working Hours
            </CardTitle>
            <p className="text-sm text-gray-400 mt-0.5">Set which days and hours this team member is available.</p>
          </div>
          <div className="flex items-center gap-3">
            {isSaving && <Loader2 className="w-4 h-4 animate-spin text-teal-500" />}
            <button
              type="button"
              onClick={copySalonHours}
              disabled={bizHoursRaw.length === 0 || isSaving}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {salonCopied
                ? <><Check className="w-3.5 h-3.5" /> Copied!</>
                : <><Copy className="w-3.5 h-3.5" /> Copy salon hours</>
              }
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {rulesLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {DAY_NAMES.map((dayName, dow) => {
              const bh          = bizHours.get(dow);
              const salonClosed = bh?.isClosed ?? false;
              const d           = days[dow] ?? { enabled: false, startTime: "09:00", endTime: "17:00" };
              const allSlots    = gen30MinSlots(bh?.openTime ?? "09:00", bh?.closeTime ?? "17:00");
              // Start slots = everything except the last slot (can't start at close time)
              const startSlots  = allSlots.slice(0, -1);
              // End slots = everything after the currently selected start time
              const endSlots    = allSlots.filter(s => s > d.startTime);

              return (
                <div key={dow} className="flex items-center gap-4 px-6 py-4 min-h-[64px]">
                  {/* Checkbox */}
                  <Checkbox
                    checked={d.enabled}
                    disabled={salonClosed}
                    onCheckedChange={() => !salonClosed && toggleDay(dow)}
                    className="h-5 w-5 flex-shrink-0 rounded-md border-2 data-[state=checked]:bg-teal-600 data-[state=checked]:border-teal-600"
                  />

                  {/* Day name */}
                  <span
                    className="w-28 flex-shrink-0 text-sm font-medium"
                    style={{ color: salonClosed ? "#d1d5db" : d.enabled ? "#111827" : "#9ca3af" }}
                  >
                    {dayName}
                  </span>

                  {/* Right-side content */}
                  {salonClosed ? (
                    <span className="text-xs text-gray-300 italic">Salon closed</span>
                  ) : d.enabled ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Start time pill */}
                      <div className="flex items-center gap-1.5 border border-gray-200 rounded-full px-3 py-1.5 bg-white shadow-sm hover:border-teal-300 transition-colors">
                        <Sun className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <select
                          value={d.startTime}
                          onChange={e => updateTime(dow, "startTime", e.target.value)}
                          className="text-sm text-gray-700 bg-transparent border-0 outline-none cursor-pointer appearance-none"
                        >
                          {startSlots.map(s => (
                            <option key={s} value={s}>{fmt12(s)}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      </div>

                      <span className="text-sm text-gray-400 select-none">to</span>

                      {/* End time pill */}
                      <div className="flex items-center gap-1.5 border border-gray-200 rounded-full px-3 py-1.5 bg-white shadow-sm hover:border-teal-300 transition-colors">
                        <Sun className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <select
                          value={endSlots.includes(d.endTime) ? d.endTime : endSlots[endSlots.length - 1] ?? d.endTime}
                          onChange={e => updateTime(dow, "endTime", e.target.value)}
                          className="text-sm text-gray-700 bg-transparent border-0 outline-none cursor-pointer appearance-none"
                        >
                          {endSlots.map(s => (
                            <option key={s} value={s}>{fmt12(s)}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      </div>
                    </div>
                  ) : (
                    <span className="px-4 py-1.5 bg-gray-100 text-gray-400 text-sm rounded-full select-none">
                      Closed
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Services Tab ─────────────────────────────────────────────────────────────
function ContractorServicesTab({ staffId }: { staffId: number }) {
  const { data: staffServiceLinks = [], isLoading: isLoadingLinks } = useStaffServices(staffId);
  const { data: allServices = [], isLoading: isLoadingServices } = useServices();
  const { data: categories = [] } = useServiceCategories();
  const { mutate: setServices, isPending } = useSetStaffServices();
  const { toast } = useToast();

  // Local selection mirrors server state; null means "not yet diverged from server"
  const assignedServiceIds = new Set((staffServiceLinks as any[]).map((ss: any) => ss.serviceId));
  const [localSelection, setLocalSelection] = useState<Set<number> | null>(null);
  const selection = localSelection ?? assignedServiceIds;

  // Auto-save whenever the selection changes; reconcile to server state on completion
  const applyAndSave = (newSet: Set<number>) => {
    setLocalSelection(newSet);
    setServices({ staffId, serviceIds: Array.from(newSet) }, {
      // Clear local override so UI reflects fresh server data
      onSuccess: () => setLocalSelection(null),
      // Roll back to server state on failure and show toast
      onError: () => {
        setLocalSelection(null);
        toast({ title: "Failed to save services", variant: "destructive" });
      },
    });
  };

  const toggleService = (serviceId: number) => {
    const newSet = new Set(selection);
    if (newSet.has(serviceId)) newSet.delete(serviceId); else newSet.add(serviceId);
    applyAndSave(newSet);
  };

  const toggleCategory = (categoryServices: Service[]) => {
    const newSet = new Set(selection);
    const allSelected = categoryServices.every(s => newSet.has(s.id));
    categoryServices.forEach(s => { if (allSelected) newSet.delete(s.id); else newSet.add(s.id); });
    applyAndSave(newSet);
  };

  const isLoading = isLoadingLinks || isLoadingServices;

  const categorizedGroups = (categories as any[]).map((cat: any) => ({
    category: cat,
    services: (allServices as Service[]).filter(
      (s: Service) => s.categoryId === cat.id || s.category === cat.name,
    ),
  })).filter((g: any) => g.services.length > 0);

  const uncategorized = (allServices as Service[]).filter(
    (s: Service) => !(categories as any[]).some(
      (cat: any) => s.categoryId === cat.id || s.category === cat.name,
    ),
  );

  const totalSelected = selection.size;
  const totalServices = (allServices as Service[]).length;

  return (
    <Card className="rounded-2xl border-gray-100 shadow-sm">
      <CardHeader className="border-b border-gray-50 py-4 px-6">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Outfit, sans-serif" }}>
              <Scissors className="w-4 h-4 text-violet-600" />
              Assigned Services
            </CardTitle>
            <p className="text-sm text-gray-400 mt-0.5">Changes save automatically.</p>
          </div>
          <div className="flex items-center gap-2">
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-500" />}
            {!isLoading && totalServices > 0 && (
              <span className="text-xs text-gray-400 tabular-nums">
                {totalSelected} / {totalServices} selected
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading services…
          </div>
        ) : totalServices === 0 ? (
          <div className="px-6 py-10 text-center">
            <Scissors className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-500">No services yet</p>
            <p className="text-xs text-gray-400 mt-0.5">Add services from the Services menu first.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* ── Categorised groups ── */}
            {categorizedGroups.map((group: any) => {
              const allSelected  = group.services.every((s: Service) => selection.has(s.id));
              const someSelected = group.services.some((s: Service) => selection.has(s.id));
              const selectedCount = group.services.filter((s: Service) => selection.has(s.id)).length;

              return (
                <div key={group.category.id}>
                  {/* Category header row */}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => toggleCategory(group.services)}
                    className="w-full flex items-center gap-3 px-6 py-3 bg-gray-50/70 hover:bg-gray-100/60 transition-colors text-left"
                  >
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={() => toggleCategory(group.services)}
                      onClick={e => e.stopPropagation()}
                      disabled={isPending}
                      className="shrink-0"
                    />
                    <span className="flex-1 text-sm font-semibold text-gray-800">{group.category.name}</span>
                    <span className="text-xs text-gray-400 tabular-nums">
                      {selectedCount} / {group.services.length}
                    </span>
                  </button>

                  {/* Service rows */}
                  <div className="divide-y divide-gray-50">
                    {group.services.map((service: Service) => (
                      <label
                        key={service.id}
                        className="flex items-center gap-3 px-6 py-3 pl-14 cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <Checkbox
                          checked={selection.has(service.id)}
                          onCheckedChange={() => toggleService(service.id)}
                          disabled={isPending}
                          className="shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{service.name}</p>
                          <p className="text-xs text-gray-400">
                            {service.duration} min · ${Number(service.price).toFixed(2)}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* ── Uncategorised ── */}
            {uncategorized.length > 0 && (
              <div>
                <div className="flex items-center gap-3 px-6 py-3 bg-gray-50/70">
                  <span className="flex-1 text-sm font-semibold text-gray-800">Other</span>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {uncategorized.filter(s => selection.has(s.id)).length} / {uncategorized.length}
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {uncategorized.map((service: Service) => (
                    <label
                      key={service.id}
                      className="flex items-center gap-3 px-6 py-3 pl-14 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <Checkbox
                        checked={selection.has(service.id)}
                        onCheckedChange={() => toggleService(service.id)}
                        disabled={isPending}
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{service.name}</p>
                        <p className="text-xs text-gray-400">
                          {service.duration} min · ${Number(service.price).toFixed(2)}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Commission Tab ───────────────────────────────────────────────────────────
function ContractorCommissionTab({
  contractorId, storeId, currentStructureId,
}: { contractorId: number; storeId: number; currentStructureId: number | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { selectedStore } = useSelectedStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: structures = [], isLoading } = useQuery<CommissionStructure[]>({
    queryKey: ["/api/contractor-payouts/commission-structures", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/commission-structures?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const assign = useMutation({
    mutationFn: async (structureId: number | null) => {
      const res = await fetch(`/api/contractor-payouts/contractors/${contractorId}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionStructureId: structureId }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/contractor-detail", contractorId] });
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/commission-structures", storeId] });
    },
    onError: () => toast({ title: "Failed to update commission", variant: "destructive" }),
  });

  const activeStructures = structures.filter(s => s.isActive !== false);
  const inactiveStructures = structures.filter(s => s.isActive === false);
  const assigned = structures.find(s => s.id === currentStructureId);

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardContent className="py-10 flex items-center justify-center">
          <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  // Empty state — no structures exist at all
  if (structures.length === 0) {
    return (
      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
            <Percent className="w-7 h-7 text-teal-300" />
          </div>
          <p className="font-semibold text-gray-800 mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>
            No commission structures yet
          </p>
          <p className="text-sm text-gray-400 mb-5 max-w-xs">
            Create a split structure — like 60/40 — and it will be assigned here instantly.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {COMMISSION_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => setDialogOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 border border-gray-200 hover:border-teal-400 hover:text-teal-700 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}
            className="rounded-xl gap-2 bg-teal-600 hover:bg-teal-700 text-white">
            <Plus className="w-4 h-4" /> Create Structure
          </Button>
          {selectedStore?.id && (
            <CommissionStructureDialog
              open={dialogOpen}
              onClose={() => setDialogOpen(false)}
              storeId={selectedStore.id}
              editing={null}
              onCreated={(s) => assign.mutate(s.id)}
            />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Currently assigned — prominent display */}
      {assigned && (
        <Card className="rounded-2xl border-teal-200 ring-1 ring-teal-100 shadow-sm bg-teal-50/40">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full">
                    ✓ Assigned
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 text-[15px] mt-1" style={{ fontFamily: "Outfit, sans-serif" }}>
                  {assigned.name}
                </h3>
                {assigned.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{assigned.description}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl font-bold text-teal-700" style={{ fontFamily: "Outfit, sans-serif" }}>
                  {Number(assigned.employeePercent).toFixed(0)}/{Number(assigned.housePercent).toFixed(0)}
                </p>
                <p className="text-xs text-teal-500">employee / house</p>
              </div>
            </div>
            <SplitBar emp={Number(assigned.employeePercent)} house={Number(assigned.housePercent)} />
            <div className="flex justify-between text-xs mt-2 mb-4">
              <span className="text-teal-700 font-medium">Employee {Number(assigned.employeePercent).toFixed(0)}%</span>
              <span className="text-slate-500 font-medium">House {Number(assigned.housePercent).toFixed(0)}%</span>
            </div>
            <Button
              size="sm" variant="outline"
              onClick={() => assign.mutate(null)}
              disabled={assign.isPending}
              className="rounded-xl text-gray-500 hover:text-red-600 hover:border-red-200"
            >
              Remove Assignment
            </Button>
          </CardContent>
        </Card>
      )}

      {/* All available structures — click to assign */}
      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-50 py-4 px-6">
          <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Outfit, sans-serif" }}>
            <Percent className="w-4 h-4 text-violet-500" />
            {assigned ? "Switch Structure" : "Choose a Structure"}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} className="rounded-xl gap-1">
            <Plus className="w-4 h-4" /> New Structure
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activeStructures.map(s => {
              const isAssigned = s.id === currentStructureId;
              const emp = Number(s.employeePercent);
              const house = Number(s.housePercent);
              return (
                <button
                  key={s.id}
                  onClick={() => !isAssigned && assign.mutate(s.id)}
                  disabled={assign.isPending}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    isAssigned
                      ? "border-teal-300 bg-teal-50/60 cursor-default ring-1 ring-teal-200"
                      : "border-gray-200 hover:border-teal-400 hover:bg-teal-50/30 cursor-pointer"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0">
                      <p className="font-semibold text-[13px] text-gray-900 truncate">{s.name}</p>
                      {s.description && <p className="text-xs text-gray-400 truncate mt-0.5">{s.description}</p>}
                    </div>
                    <span className="text-lg font-bold text-gray-700 shrink-0" style={{ fontFamily: "Outfit, sans-serif" }}>
                      {emp}/{house}
                    </span>
                  </div>
                  <SplitBar emp={emp} house={house} />
                  <div className="flex justify-between text-[11px] mt-1.5">
                    <span className="text-teal-600 font-medium">Employee {emp}%</span>
                    <span className="text-slate-400">House {house}%</span>
                  </div>
                  {isAssigned && (
                    <p className="text-[11px] text-teal-600 font-semibold mt-2">✓ Currently assigned</p>
                  )}
                </button>
              );
            })}
          </div>

          {inactiveStructures.length > 0 && (
            <p className="text-xs text-gray-400 mt-3 px-1">
              {inactiveStructures.length} inactive structure{inactiveStructures.length !== 1 ? "s" : ""} hidden — manage them under Payouts → Commissions.
            </p>
          )}
        </CardContent>
      </Card>

      {selectedStore?.id && (
        <CommissionStructureDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          storeId={selectedStore.id}
          editing={null}
          onCreated={(s) => assign.mutate(s.id)}
        />
      )}
    </div>
  );
}

// ─── Mailing Address Tab ──────────────────────────────────────────────────────
type TaxInfoData = {
  mailingAddress1: string; mailingAddress2: string;
  mailingCity: string; mailingState: string; mailingZip: string; mailingCountry: string;
};

function ContractorMailingAddressTab({ staffId, staffName }: { staffId: number; staffName: string }) {
  const { data, isLoading } = useQuery<TaxInfoData>({
    queryKey: ["/api/staff", staffId, "tax-info"],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${staffId}/tax-info`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tax info");
      return res.json();
    },
  });

  const hasAddress = data && (data.mailingAddress1 || data.mailingCity || data.mailingState || data.mailingZip);

  return (
    <Card className="rounded-2xl border-gray-100 shadow-sm">
      <CardHeader className="border-b border-gray-50 py-4 px-6">
        <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Outfit, sans-serif" }}>
          <MapPin className="w-4 h-4 text-blue-600" />
          1099 Mailing Address — {staffName}
        </CardTitle>
        <p className="text-sm text-gray-400 mt-0.5">Address on file for tax document delivery.</p>
      </CardHeader>
      <CardContent className="p-6">
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : hasAddress ? (
          <div className="space-y-1 text-sm text-gray-700">
            {data!.mailingAddress1 && <p>{data!.mailingAddress1}</p>}
            {data!.mailingAddress2 && <p>{data!.mailingAddress2}</p>}
            <p>{[data!.mailingCity, data!.mailingState, data!.mailingZip].filter(Boolean).join(", ")}</p>
            {data!.mailingCountry && data!.mailingCountry !== "US" && <p>{data!.mailingCountry}</p>}
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            No mailing address on file yet. {staffName} can add it from their staff portal under <strong>1099 Info</strong>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const ROLE_OPTIONS = [
  { value: "stylist",            label: "Stylist" },
  { value: "nail_tech",          label: "Nail Technician" },
  { value: "barber",             label: "Barber" },
  { value: "esthetician",        label: "Esthetician" },
  { value: "massage_therapist",  label: "Massage Therapist" },
  { value: "booth_renter",       label: "Booth Renter" },
  { value: "other",              label: "Other" },
];


export default function ContractorDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { selectedStore } = useSelectedStore();
  const [editing, setEditing] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ContractorDetail>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const contractorId = parseInt(id!);

  const { data: c, isLoading } = useQuery<ContractorDetail>({
    // NOTE: use "contractor-detail" as the second segment so this key never
    // collides with the list query key ["/api/contractor-payouts/contractors", storeId]
    // when contractorId === storeId (both can be 2). A collision caused React Query
    // to serve the single-object detail response to the list page, breaking .filter().
    queryKey: ["/api/contractor-payouts/contractor-detail", contractorId],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/contractors/${contractorId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(contractorId),
  });

  const { data: commissionStructures = [] } = useQuery<CommissionStructure[]>({
    queryKey: ["/api/contractor-payouts/commission-structures", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return [];
      const res = await fetch(`/api/contractor-payouts/commission-structures?storeId=${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  useEffect(() => {
    if (c) setEditForm(c);
  }, [c]);

  const update = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contractor-payouts/contractors/${contractorId}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/contractor-detail", contractorId] });
      toast({ title: "Contractor updated" });
      setEditing(false);
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  // Store-level Stripe Express settings — used to show a disabled notice on the Bank tab
  const { data: expressSettings } = useQuery<{
    contractorExpressEnabled: boolean;
    contractorPayoutMode: string;
    stripeConnected: boolean;
  }>({
    queryKey: ["/api/payments/stripe/express-settings"],
    queryFn: async () => {
      const res = await fetch("/api/payments/stripe/express-settings", { credentials: "include" });
      if (!res.ok) return { contractorExpressEnabled: false, contractorPayoutMode: "manual", stripeConnected: false };
      return res.json();
    },
  });

  const { data: tokenStatus, refetch: refetchTokenStatus } = useQuery<{
    active: boolean;
    createdAt: string | null;
    expiresAt: string | null;
    lastExpiredCreatedAt: string | null;
    lastExpiredExpiresAt: string | null;
  }>({
    queryKey: ["/api/contractor-payouts/contractors", contractorId, "onboarding-token-status"],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/contractors/${contractorId}/onboarding-token-status`, { credentials: "include" });
      if (!res.ok) return { active: false, createdAt: null, expiresAt: null, lastExpiredCreatedAt: null, lastExpiredExpiresAt: null };
      return res.json();
    },
    enabled: !isNaN(contractorId),
  });

  const [stripeNotConfigured, setStripeNotConfigured] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const isStripeNotConfiguredError = (msg: string) =>
    msg.toLowerCase().includes("stripe is not configured");

  const sendInvite = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contractor-payouts/contractors/${contractorId}/send-onboarding-email`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
    },
    onSuccess: () => {
      setInviteSent(true);
      refetchTokenStatus();
      toast({ title: "Invite sent!", description: "The contractor will receive an email with their onboarding link." });
    },
    onError: (e: Error) => toast({ title: "Could not send invite", description: e.message, variant: "destructive" }),
  });

  const copyLink = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contractor-payouts/contractors/${contractorId}/portal-link`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json() as Promise<{ url: string; expiresAt: string }>;
    },
    onSuccess: async (data) => {
      try {
        await navigator.clipboard.writeText(data.url);
        setLinkCopied(true);
        toast({ title: "Link copied!", description: "Paste it anywhere — expires in 48 hours." });
        setTimeout(() => setLinkCopied(false), 3000);
      } catch {
        toast({ title: "Here's the invite link", description: data.url });
      }
    },
    onError: (e: Error) => toast({ title: "Could not get invite link", description: e.message, variant: "destructive" }),
  });

  const onboard = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contractor-payouts/contractors/${contractorId}/onboarding-link`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => window.open(data.url, "_blank"),
    onError: (e: Error) => {
      if (isStripeNotConfiguredError(e.message)) {
        setStripeNotConfigured(true);
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  const syncStripe = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contractor-payouts/contractors/${contractorId}/sync-stripe`, { method: "POST", credentials: "include" });
      const payload = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const err = new Error(payload?.error ?? "Failed to sync") as Error & { code?: string; status?: number };
        err.code = payload?.code;
        err.status = res.status;
        throw err;
      }
      return payload;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/contractor-detail", contractorId] });
      toast({ title: `Status: ${data.status}`, description: data.bankVerified ? "Bank verified ✓" : "Bank not yet verified" });
    },
    onError: (e: Error & { code?: string; status?: number }) => {
      if (isStripeNotConfiguredError(e.message)) {
        setStripeNotConfigured(true);
      } else if (e.code === "STRIPE_ACCOUNT_ACCESS_LOST" || e.status === 409) {
        qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/contractor-detail", contractorId] });
        toast({
          title: "Stripe needs reconnection",
          description: "Your old Stripe account link is no longer valid. Opening a fresh onboarding link now.",
        });
        onboard.mutate();
      } else {
        toast({ title: "Failed to sync Stripe", description: e.message, variant: "destructive" });
      }
    },
  });

  const ef = (k: keyof ContractorDetail) => (v: string) => setEditForm(p => ({ ...p, [k]: v }));

  const uploadAvatar = async (file: File) => {
    if (!c?.staffId) { toast({ title: "No staff profile linked", variant: "destructive" }); return; }
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch(`/api/staff/${c.staffId}/avatar`, { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      toast({ title: "Photo updated" });
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/contractor-detail", contractorId] });
    } catch {
      toast({ title: "Photo upload failed", variant: "destructive" });
    } finally {
      setAvatarUploading(false);
    }
  };

  useEffect(() => {
    const onboarding = searchParams.get("onboarding");
    if (!onboarding) return;

    const cleaned = new URLSearchParams(searchParams);
    cleaned.delete("onboarding");
    setSearchParams(cleaned, { replace: true });

    if (onboarding === "complete") {
      toast({ title: "Onboarding complete!", description: "Syncing your Stripe status…" });
      syncStripe.mutate(undefined, {
        onSuccess: () => toast({ title: "Stripe status updated", description: "Your payout account is ready." }),
      });
    } else if (onboarding === "refresh") {
      toast({ title: "Onboarding link expired", description: "Opening a fresh link — please complete onboarding." });
      onboard.mutate();
    }
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 max-w-[900px] mx-auto space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
      </div>
    );
  }
  if (!c) return <div className="p-6 text-gray-400">Contractor not found.</div>;

  const effStatus = (c.onboardingStatus === "pending" && tokenStatus?.active === true)
    ? "invite_pending"
    : c.onboardingStatus;
  const statusInfo = STATUS_INFO[effStatus] ?? STATUS_INFO.pending;
  const StatusIcon = statusInfo.icon;
  const totalPaid = (c.recentPayouts ?? []).filter(p => p.status === "paid").reduce((s, p) => s + Number(p.netAmount), 0);

  const viewStructure = commissionStructures.find(s => s.id === c.commissionStructureId);

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-5">
      <Dialog open={stripeNotConfigured} onOpenChange={setStripeNotConfigured}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="w-5 h-5 text-amber-500" />
              Stripe Connect not configured
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 leading-relaxed">
            Contractor payouts require Stripe Connect, but no Stripe keys have been added to this server yet.
            To enable payouts, add your <strong>STRIPE_SECRET_KEY</strong> and <strong>STRIPE_CONNECT_CLIENT_ID</strong> in{" "}
            <strong>Settings</strong>.
          </p>
          <p className="text-xs text-gray-400">
            Once the keys are saved, return here to start the contractor&rsquo;s Stripe onboarding.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStripeNotConfigured(false)}>Dismiss</Button>
            <Button onClick={() => { setStripeNotConfigured(false); navigate("/settings"); }}>
              Go to Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <button onClick={() => navigate("/payouts/contractors")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Contractors
      </button>

      {/* Header card */}
      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 cursor-pointer" onClick={() => editing && fileRef.current?.click()}>
                {(c.avatarThumbUrl ?? c.avatarUrl) ? (
                  <img src={c.avatarThumbUrl ?? c.avatarUrl!} alt={c.firstName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white text-xl font-bold">
                    {c.firstName?.[0] ?? "?"}{c.lastName?.[0] ?? ""}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                    {c.firstName} {c.lastName}
                  </h2>
                  <span className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.bg} ${statusInfo.color}`}>
                    <StatusIcon className="w-3 h-3" /> {statusInfo.label}
                  </span>
                </div>
                <div className="text-sm text-gray-400 capitalize mt-0.5">{(c.role ?? "stylist").replace(/_/g, " ")}</div>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                  {c.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{c.email}</span>}
                  {c.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{c.phone}</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap items-center">
              {c.stripeAccountId ? (
                <Button variant="outline" size="sm" onClick={() => syncStripe.mutate()} disabled={syncStripe.isPending} className="rounded-xl gap-2">
                  <Zap className="w-4 h-4" /> Sync Status
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="rounded-xl gap-2">
                      Actions <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl min-w-[200px]">
                    <DropdownMenuItem
                      disabled={onboard.isPending}
                      onClick={() => onboard.mutate()}>
                      <Zap className="w-4 h-4 mr-2 text-teal-600" />
                      {onboard.isPending ? "Opening…" : "Set Up Direct Deposit"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={copyLink.isPending}
                      onClick={() => copyLink.mutate()}>
                      {linkCopied
                        ? <Check className="w-4 h-4 mr-2 text-emerald-600" />
                        : <Copy className="w-4 h-4 mr-2" />}
                      {linkCopied ? "Copied!" : copyLink.isPending ? "Getting link…" : "Copy Invite Link"}
                    </DropdownMenuItem>
                    {c.email && (
                      <DropdownMenuItem
                        disabled={sendInvite.isPending || inviteSent}
                        onClick={() => sendInvite.mutate()}>
                        <Send className="w-4 h-4 mr-2" />
                        {inviteSent ? "Invite Sent ✓" : sendInvite.isPending ? "Sending…" : "Send Invite Email"}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {editing ? (
                <>
                  <Button size="sm" onClick={() => update.mutate()} disabled={update.isPending}
                    className="rounded-xl gap-1 bg-teal-600 hover:bg-teal-700 text-white">
                    <Save className="w-4 h-4" /> Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(false); setEditForm(c); }} className="rounded-xl gap-1">
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => { setEditing(true); setEditForm(c); }} className="rounded-xl gap-1">
                  <Edit2 className="w-4 h-4" /> Edit
                </Button>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {[
              { label: "Lifetime Earned", value: fmt$(totalPaid), icon: DollarSign, color: "text-teal-600", bg: "bg-teal-50" },
              { label: "Service Commission",
                value: viewStructure
                  ? `${Number(viewStructure.employeePercent ?? 0).toFixed(0)}% (${viewStructure.name})`
                  : `${Number(c.commissionRate ?? 0).toFixed(1)}%`,
                icon: Percent, color: "text-violet-600", bg: "bg-violet-50" },
              { label: "Payout Method", value: c.payoutMethod === "ach" ? "ACH" : c.payoutMethod === "instant" ? "Instant" : "Check", icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Onboarding", value: statusInfo.label, icon: Calendar, color: statusInfo.color.replace("text-","text-"), bg: statusInfo.bg },
            ].map(s => (
              <div key={s.label} className={`flex items-center gap-3 p-3.5 rounded-xl ${s.bg}`}>
                <s.icon className={`w-4 h-4 shrink-0 ${s.color}`} />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-gray-900 truncate">{s.value}</div>
                  <div className="text-xs text-gray-500">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs — tab= query param controls the active tab (e.g. ?tab=schedule from Calendar "Set hours" link) */}
      <Tabs
        value={searchParams.get("tab") ?? "details"}
        onValueChange={(v) => setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", v); return next; }, { replace: true })}
      >
        <TabsList className="rounded-xl bg-gray-100 p-1">
          <TabsTrigger value="details" className="rounded-lg text-sm">Details</TabsTrigger>
          <TabsTrigger value="commission" className="rounded-lg text-sm">Commission</TabsTrigger>
          <TabsTrigger value="schedule" className="rounded-lg text-sm">Schedule</TabsTrigger>
          <TabsTrigger value="services" className="rounded-lg text-sm">Services</TabsTrigger>
          <TabsTrigger value="bank" className="rounded-lg text-sm">Bank Accounts</TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg text-sm">Payout History</TabsTrigger>
          <TabsTrigger value="adjustments" className="rounded-lg text-sm">Adjustments</TabsTrigger>
          <TabsTrigger value="tax" className="rounded-lg text-sm">Tax Records</TabsTrigger>
        </TabsList>

        {/* Details tab */}
        <TabsContent value="details" className="space-y-4">
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-6 space-y-4">
              {editing ? (
                <div className="grid grid-cols-2 gap-4">
                  {/* Photo upload row */}
                  <div className="col-span-2 flex items-center gap-4">
                    <div
                      className="relative w-14 h-14 rounded-2xl overflow-hidden cursor-pointer shrink-0 ring-2 ring-offset-2 ring-transparent hover:ring-teal-400 transition-all"
                      onClick={() => fileRef.current?.click()}
                    >
                      {(c.avatarThumbUrl ?? c.avatarUrl) ? (
                        <img src={c.avatarThumbUrl ?? c.avatarUrl!} alt={c.firstName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white text-lg font-bold">
                          {c.firstName?.[0] ?? "?"}{c.lastName?.[0] ?? ""}
                        </div>
                      )}
                      {avatarUploading && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                      >
                        {(c.avatarThumbUrl ?? c.avatarUrl) ? "Change photo" : "Upload photo"}
                      </button>
                      <p className="text-xs text-gray-400 mt-0.5">JPG, PNG or WebP — auto-converted</p>
                    </div>
                    <input
                      ref={fileRef} type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }}
                    />
                  </div>

                  {/* Name */}
                  {([
                    { label: "First Name", key: "firstName" as const, type: "text" },
                    { label: "Last Name",  key: "lastName"  as const, type: "text" },
                    { label: "Email",      key: "email"     as const, type: "email" },
                    { label: "Phone",      key: "phone"     as const, type: "tel" },
                  ]).map(field => (
                    <div key={field.key}>
                      <Label className="text-xs text-gray-500 mb-1">{field.label}</Label>
                      <Input type={field.type} value={(editForm as any)[field.key] ?? ""}
                        onChange={e => ef(field.key)(e.target.value)} className="rounded-xl" />
                    </div>
                  ))}

                  <div>
                    <Label className="text-xs text-gray-500 mb-1">Role</Label>
                    <Select value={editForm.role ?? "stylist"} onValueChange={ef("role")}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map(r => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 mb-1">Payout Method</Label>
                    <Select value={editForm.payoutMethod ?? "ach"} onValueChange={ef("payoutMethod")}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ach">ACH Direct Deposit</SelectItem>
                        <SelectItem value="instant">Instant Payout</SelectItem>
                        <SelectItem value="check">Paper Check</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-gray-500 mb-1">Bio</Label>
                    <textarea
                      value={(editForm.bio ?? "")}
                      onChange={e => ef("bio")(e.target.value)}
                      rows={3}
                      placeholder="Short bio shown on the booking page…"
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-gray-500 mb-1">Notes</Label>
                    <Input value={editForm.notes ?? ""} onChange={e => ef("notes")(e.target.value)} className="rounded-xl" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-y-5 gap-x-8">
                  {([
                    { label: "Full Name",     value: [c.firstName, c.lastName].filter(Boolean).join(" ") || "—" },
                    { label: "Role",          value: (c.role ?? "stylist").replace(/_/g, " ") },
                    { label: "Email",         value: c.email ?? "—",   plain: true },
                    { label: "Phone",         value: c.phone ?? "—",   plain: true },
                    { label: "Payout Method", value: c.payoutMethod === "ach" ? "ACH Direct Deposit" : c.payoutMethod === "instant" ? "Instant Payout" : "Paper Check" },
                    { label: "Onboarding",    value: statusInfo.label },
                    { label: "Bank Verified", value: c.bankVerified ? "Yes ✓" : "No" },
                    { label: "Notes",         value: c.notes ?? "—",   plain: true },
                  ] as Array<{ label: string; value: string; plain?: boolean }>).map(r => (
                    <div key={r.label}>
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">{r.label}</div>
                      <div className={`text-sm text-gray-800 ${r.plain ? "" : "capitalize"}`}>{r.value}</div>
                    </div>
                  ))}
                  {c.bio && (
                    <div className="col-span-2">
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Bio</div>
                      <div className="text-sm text-gray-800">{c.bio}</div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mailing Address — always present, auto-synced from staff record */}
          <ContractorMailingAddressTab staffId={c.staffId!} staffName={[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"} />

          {/* Staff Portal Access Code */}
          {c.staffId != null && (
            <StaffAccessCodeCard staffId={c.staffId} staffName={[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"} />
          )}

          {/* Time Clock PIN */}
          {c.staffId != null && (
            <TimeclockPinCard
              staffId={c.staffId}
              storeId={c.storeId}
              staffName={[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
            />
          )}
        </TabsContent>

        {/* Commission tab */}
        <TabsContent value="commission">
          <ContractorCommissionTab
            contractorId={contractorId}
            storeId={c.storeId}
            currentStructureId={c.commissionStructureId}
          />
        </TabsContent>

        {/* Bank Accounts tab */}
        <TabsContent value="bank" className="space-y-4">

          {/* ── Store-level Express disabled notice ───────────────────────── */}
          {expressSettings && !expressSettings.contractorExpressEnabled && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">Stripe Express payouts are disabled</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  Instant contractor payouts are turned off for this location. Enable them in{" "}
                  <button
                    className="underline font-medium hover:text-amber-900"
                    onClick={() => navigate("/manage/payment-settings")}
                  >
                    Settings → Payment Processing
                  </button>
                  {" "}to allow contractors to receive payouts instantly after each client payment.
                </p>
              </div>
            </div>
          )}

          {expressSettings?.contractorExpressEnabled && expressSettings.contractorPayoutMode === "manual" && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-200">
              <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-1" />
              <p className="text-sm text-blue-700">
                <span className="font-semibold">Manual payout mode:</span> Stripe Express is enabled but set to manual. Contractors will be paid via payout runs, not instantly after each payment. Change this in{" "}
                <button className="underline font-medium hover:text-blue-900" onClick={() => navigate("/manage/payment-settings")}>
                  Payment Processing settings
                </button>.
              </p>
            </div>
          )}

          {/* ── Payout Account & Verification (GlossGenius-style) ─────────── */}
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="px-6 pt-5 pb-1">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base" style={{ fontFamily: "Outfit, sans-serif" }}>
                    Payout Account &amp; Verification
                  </CardTitle>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {expressSettings?.contractorExpressEnabled && expressSettings.contractorPayoutMode === "instant"
                      ? "Contractor receives earnings via Stripe Express — instant after each payment."
                      : "Stripe Express account status and verification details."}
                  </p>
                </div>
                {c.stripeAccountId && (
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => syncStripe.mutate()}
                    disabled={syncStripe.isPending}
                    className="rounded-xl gap-1.5 text-gray-400 hover:text-gray-700 shrink-0"
                  >
                    <Zap className={`w-3.5 h-3.5 ${syncStripe.isPending ? "animate-pulse" : ""}`} />
                    {syncStripe.isPending ? "Syncing…" : "Sync"}
                  </Button>
                )}
              </div>
            </CardHeader>

            {/* Action-required banner */}
            {c.stripeAccountId && !c.bankVerified && (
              <div className="mx-6 mt-3 flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">Action required!</p>
                  <p className="text-xs text-amber-700 mt-0.5">Complete onboarding to enable instant payouts.</p>
                </div>
              </div>
            )}

            <CardContent className="px-6 pb-5 pt-2">
              {c.stripeAccountId ? (
                <div className="divide-y divide-gray-50">

                  {/* Row 1: Payment processing */}
                  <div className="flex items-center justify-between py-4 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        c.bankVerified ? "bg-emerald-50" : "bg-amber-50"
                      }`}>
                        <Zap className={`w-4 h-4 ${c.bankVerified ? "text-emerald-600" : "text-amber-500"}`} />
                      </div>
                      <p className="text-sm font-medium text-gray-800">Payment processing</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {c.bankVerified ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-3 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-3 py-0.5 text-xs font-medium text-amber-700">Inactive</span>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Identity verification */}
                  <div className="flex items-center justify-between py-4 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        c.onboardingStatus === "complete" ? "bg-emerald-50" : "bg-amber-50"
                      }`}>
                        <ShieldCheck className={`w-4 h-4 ${c.onboardingStatus === "complete" ? "text-emerald-600" : "text-amber-500"}`} />
                      </div>
                      <p className="text-sm font-medium text-gray-800">Identity verification</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {c.onboardingStatus === "complete" ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-3 py-0.5 text-xs font-medium text-emerald-700">Verified</span>
                      ) : c.onboardingStatus === "restricted" ? (
                        <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-3 py-0.5 text-xs font-medium text-red-700">Restricted</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-3 py-0.5 text-xs font-medium text-amber-700">Info required</span>
                      )}
                      {c.onboardingStatus !== "complete" && (
                        <Button size="sm" variant="outline" className="rounded-xl text-xs gap-1"
                          onClick={() => onboard.mutate()} disabled={onboard.isPending}
                        >
                          {onboard.isPending ? "Opening…" : "Edit ↗"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Payout account (bank) */}
                  <div className="flex items-center justify-between py-4 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        c.bankVerified ? "bg-emerald-50" : "bg-gray-100"
                      }`}>
                        <Banknote className={`w-4 h-4 ${c.bankVerified ? "text-emerald-600" : "text-gray-400"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">Payout account</p>
                        {c.stripeAccountId && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {c.payoutMethod === "instant" ? "Instant payout" : "ACH direct deposit"} · acct ···{c.stripeAccountId.slice(-6)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {c.bankVerified ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-3 py-0.5 text-xs font-medium text-emerald-700">Connected</span>
                      ) : (
                        <Button size="sm" className="rounded-xl text-xs gap-1 bg-teal-600 hover:bg-teal-700 text-white"
                          onClick={() => onboard.mutate()} disabled={onboard.isPending}
                        >
                          <Zap className="w-3 h-3" />
                          {onboard.isPending ? "Opening…" : "Add"}
                        </Button>
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                /* No Stripe account yet */
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                    <CreditCard className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="font-medium text-gray-700 mb-1">Payout account not set up</p>
                  <p className="text-sm text-gray-400 mb-4 max-w-xs">
                    {c.firstName || "This contractor"} hasn't completed Stripe onboarding yet. Once set up, they'll receive
                    their earnings instantly after every client payment.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => onboard.mutate()}
                      disabled={onboard.isPending}
                      className="rounded-xl gap-2 bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      <Zap className="w-4 h-4" />
                      {onboard.isPending ? "Opening…" : "Set Up Payout Account"}
                    </Button>
                    {c.email && (
                      <div className="flex flex-col items-start gap-1">
                        <InviteButtonWithTooltip
                          tokenStatus={tokenStatus ?? null}
                          isPending={sendInvite.isPending}
                          inviteSent={inviteSent}
                          onSend={() => sendInvite.mutate()}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── On-file bank records (for check / reference) ─────────────── */}
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-gray-50 py-4 px-6">
              <div>
                <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Outfit, sans-serif" }}>
                  <BookOpen className="w-4 h-4 text-blue-500" />
                  On-file Bank Records
                </CardTitle>
                <p className="text-xs text-gray-400 mt-0.5">Manually recorded accounts — used for check payments or reference.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setBankOpen(true)} className="rounded-xl gap-1">
                <Plus className="w-4 h-4" /> Add Record
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {(c.bankAccounts ?? []).length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No manual records on file.
                </div>
              ) : (c.bankAccounts ?? []).map(b => (
                <div key={b.id} className="flex items-center justify-between px-6 py-4 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">
                        {b.bankName ?? "Bank"} — {b.accountType} ···{b.accountLast4 ?? ""}
                      </div>
                      <div className="text-xs text-gray-400">
                        Routing ···{b.routingLast4 ?? ""} · {b.verificationStatus}
                        {b.isDefault && " · Default"}
                      </div>
                    </div>
                  </div>
                  {b.verificationStatus === "verified" ? (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600">Pending</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payout History tab */}
        <TabsContent value="history">
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-0">
              {(c.recentPayouts ?? []).length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No payout history yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/50 text-xs font-medium text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-6 py-3">Period</th>
                      <th className="text-right px-6 py-3">Gross</th>
                      <th className="text-right px-6 py-3">Net</th>
                      <th className="text-left px-6 py-3">Paid</th>
                      <th className="text-left px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(c.recentPayouts ?? []).map(p => (
                      <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50/40">
                        <td className="px-6 py-4 text-gray-700">
                          {p.periodStart ?? "—"} – {p.periodEnd ?? "—"}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-500">{fmt$(p.grossAmount)}</td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-900">{fmt$(p.netAmount)}</td>
                        <td className="px-6 py-4 text-gray-400 text-xs">
                          {p.paidAt ? format(new Date(p.paidAt), "MMM d, yyyy") : "—"}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize
                            ${p.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Adjustments tab */}
        <TabsContent value="adjustments">
          <AdjustmentsTab contractorId={contractorId} />
        </TabsContent>

        {/* Tax Records tab */}
        <TabsContent value="tax">
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-gray-50 py-4 px-6">
              <CardTitle className="text-base" style={{ fontFamily: "Outfit, sans-serif" }}>W9 Records</CardTitle>
              <Button size="sm" variant="outline" onClick={() => navigate(`/payouts/tax-docs?contractorId=${c.id}`)} className="rounded-xl gap-1">
                <Plus className="w-4 h-4" /> Add W9
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {(c.w9Records ?? []).length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No W9 records on file.</div>
              ) : (c.w9Records ?? []).map(w => (
                <div key={w.id} className="flex items-center justify-between px-6 py-4 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{w.legalName} — {w.year}</div>
                      <div className="text-xs text-gray-400 capitalize">{w.taxClassification.replace(/_/g, " ")}</div>
                    </div>
                  </div>
                  {w.certifiedAt ? (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Certified
                    </span>
                  ) : (
                    <Badge variant="outline" className="text-xs">Pending</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schedule tab */}
        <TabsContent value="schedule">
          <ContractorScheduleTab staffId={c.staffId!} />
        </TabsContent>

        {/* Services tab */}
        <TabsContent value="services">
          <ContractorServicesTab staffId={c.staffId!} />
        </TabsContent>

      </Tabs>

      <AddBankDialog open={bankOpen} onClose={() => setBankOpen(false)} contractorId={contractorId} existingAccounts={c?.bankAccounts ?? []} />
    </div>
  );
}
