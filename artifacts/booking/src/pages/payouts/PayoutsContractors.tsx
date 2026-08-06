import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { PERMISSIONS } from "@shared/permissions";
import { formatDistanceToNow } from "date-fns";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatPhoneInput } from "@/lib/utils";
import { AddTeamMemberWizard, EMPLOYMENT_TYPES } from "./AddTeamMemberWizard";
import {
  Users, Search, MoreHorizontal, ChevronRight,
  CheckCircle2, Clock, AlertCircle, XCircle, Zap, Building2,
  CreditCard, Mail, Phone, Edit2, UserX, ExternalLink, Link2, Copy,
  AlertTriangle, Send, Hourglass, Loader2, Plus, Smartphone,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

type Contractor = {
  id: number; firstName: string; lastName: string; email: string | null;
  phone: string | null; role: string | null; commissionRate: string;
  productCommissionRate: string; payoutMethod: string; onboardingStatus: string;
  bankVerified: boolean; isActive: boolean; stripeAccountId: string | null;
  avatarThumbUrl: string | null; avatarUrl: string | null;
  bankAccounts: Array<{ id: number; accountLast4: string | null; bankName: string | null; isDefault: boolean }>;
  // Populated by list API join — null when no commission structure is assigned
  commissionStructureName: string | null;
  commissionStructureEmployeePercent: string | null;
};

type CommissionStructure = {
  id: number;
  name: string;
  description: string | null;
  employeePercent: string;
  housePercent: string;
  appliesTo: string;
  isDefault: boolean;
  isActive: boolean;
};

type TokenStatus = {
  active: boolean;
  createdAt: string | null;
  expiresAt: string | null;
  lastExpiredCreatedAt: string | null;
  lastExpiredExpiresAt: string | null;
};

type StaffOption = {
  id: number;
  name: string;
  email?: string | null;
  status?: string | null;
};

const STATUS_INFO: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  complete:       { label: "Ready",           icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  in_progress:    { label: "Onboarding",      icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50"   },
  pending:        { label: "Not Started",     icon: AlertCircle,  color: "text-gray-500",    bg: "bg-gray-50"    },
  invite_pending: { label: "Invite pending",  icon: Hourglass,    color: "text-blue-600",    bg: "bg-blue-50"    },
  restricted:     { label: "Restricted",      icon: XCircle,      color: "text-red-600",     bg: "bg-red-50"     },
};

function effectiveStatus(onboardingStatus: string, tokenStatus: TokenStatus | undefined): string {
  if (onboardingStatus === "pending" && tokenStatus?.active === true) return "invite_pending";
  return onboardingStatus;
}

const PAYOUT_METHOD_LABEL: Record<string, string> = {
  ach:     "ACH Direct Deposit",
  instant: "Instant Payout",
  check:   "Check",
};


function fmt$(n: string | number) {
  return `${Number(n).toFixed(1)}%`;
}

export default function PayoutsContractors() {
  const { selectedStore } = useSelectedStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [copyingId, setCopyingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [sentId, setSentId] = useState<number | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  async function copyInviteLink(contractorId: number, e: React.MouseEvent) {
    e.stopPropagation();
    setCopyingId(contractorId);
    try {
      const res = await fetch(`/api/contractor-payouts/contractors/${contractorId}/portal-link`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to get link");
      const data = await res.json();
      await navigator.clipboard.writeText(data.url);
      setCopiedId(contractorId);
      toast({ title: "Invite link copied!", description: "Share this link with the contractor to complete onboarding." });
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/contractors/onboarding-token-statuses", selectedStore?.id] });
      setTimeout(() => setCopiedId(null), 3000);
    } catch (err: unknown) {
      toast({ title: "Could not copy link", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setCopyingId(null);
    }
  }

  const { data: contractors = [], isLoading } = useQuery<Contractor[]>({
    queryKey: ["/api/contractor-payouts/contractors", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/contractors?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const { data: tokenStatuses = {} } = useQuery<Record<number, TokenStatus>>({
    queryKey: ["/api/contractor-payouts/contractors/onboarding-token-statuses", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/contractors/onboarding-token-statuses?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const deactivate = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contractor-payouts/contractors/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/contractors", selectedStore?.id] });
      toast({ title: "Contractor deactivated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resendInvite = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contractor-payouts/contractors/${id}/send-onboarding-email`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to send invite");
      return res.json();
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/contractors/onboarding-token-statuses", selectedStore?.id] });
      toast({ title: "Invite sent!", description: "A new onboarding link has been emailed to the contractor." });
      setSentId(id);
      setTimeout(() => setSentId(null), 3000);
    },
    onError: (e: Error) => toast({ title: "Could not send invite", description: e.message, variant: "destructive" }),
  });

  const setupDirectDeposit = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contractor-payouts/contractors/${id}/onboarding-link`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to get onboarding link");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => window.open(data.url, "_blank"),
    onError: (e: Error) => toast({ title: "Could not open setup", description: e.message, variant: "destructive" }),
  });

  const filtered = contractors.filter(c => {
    const q = search.toLowerCase();
    return !q || `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) || (c.role ?? "").toLowerCase().includes(q);
  });

  const active = filtered.filter(c => c.isActive);
  const inactive = filtered.filter(c => !c.isActive);

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
            Team Members
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {contractors.filter(c => c.isActive).length} active team member{contractors.filter(c => c.isActive).length !== 1 ? "s" : ""} at {selectedStore?.name}
          </p>
        </div>

        {can(PERMISSIONS.STAFF_MANAGE) && (
          <div className="flex flex-wrap gap-2">
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs rounded-xl">
                  <Smartphone className="w-3.5 h-3.5" /> Invite by SMS
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Invite a team member</DialogTitle></DialogHeader>
                <InviteForm
                  storeId={selectedStore?.id}
                  onSuccess={() => {
                    setIsInviteOpen(false);
                    qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/contractors", selectedStore?.id] });
                  }}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 text-xs rounded-xl" style={{ background: "#0f172a", color: "#fff" }}>
                  <Plus className="w-3.5 h-3.5" /> Add Team Member
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle style={{ fontFamily: "Outfit, sans-serif" }}>Add Team Member</DialogTitle>
                </DialogHeader>
                <AddTeamMemberWizard
                  storeId={selectedStore?.id}
                  onSuccess={() => {
                    setIsAddOpen(false);
                    qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/contractors", selectedStore?.id] });
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search team by name, email, or role…"
          className="pl-9 rounded-xl border-gray-200 bg-white" />
      </div>

      {/* Contractor grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-48 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : active.length === 0 && inactive.length === 0 ? (
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-teal-600" />
            </div>
            <p className="text-base font-medium text-gray-700" style={{ fontFamily: "Outfit, sans-serif" }}>
              No team members yet
            </p>
            <p className="text-sm text-gray-400 mt-1 mb-4">Add your first staff member to get started.</p>
            {can(PERMISSIONS.STAFF_MANAGE) && (
              <Button size="sm" onClick={() => setIsAddOpen(true)}
                className="rounded-xl gap-2" style={{ background: "#0f172a", color: "#fff" }}>
                <Plus className="w-4 h-4" /> Add Team Member
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {active.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {active.map(c => {
                const ts = tokenStatuses[c.id];
                const effStatus = effectiveStatus(c.onboardingStatus, ts);
                const statusInfo = STATUS_INFO[effStatus] ?? STATUS_INFO.pending;
                const StatusIcon = statusInfo.icon;
                const defaultBank = c.bankAccounts?.find(b => b.isDefault);
                return (
                  <Card key={c.id} className="rounded-2xl border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => navigate(`/payouts/contractors/${c.id}`)}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {c.avatarThumbUrl || c.avatarUrl ? (
                            <img
                              src={c.avatarThumbUrl ?? c.avatarUrl ?? ""}
                              alt={[c.firstName, c.lastName].filter(Boolean).join(" ") || "Team member"}
                              className="w-10 h-10 rounded-xl object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                              {c.firstName?.[0] ?? "?"}{c.lastName?.[0] ?? ""}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-gray-900 leading-tight">{c.firstName} {c.lastName}</div>
                            <div className="text-xs text-gray-400 capitalize">{(c.role ?? "stylist").replace(/_/g, " ")}</div>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <button className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                              <MoreHorizontal className="w-4 h-4 text-gray-400" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); navigate(`/payouts/contractors/${c.id}`); }}>
                              <Edit2 className="w-4 h-4 mr-2" /> View Details
                            </DropdownMenuItem>
                            {/* Set Up Direct Deposit — only when Stripe not yet connected */}
                            {!c.stripeAccountId && (
                              <DropdownMenuItem
                                disabled={setupDirectDeposit.isPending && setupDirectDeposit.variables === c.id}
                                onClick={e => { e.stopPropagation(); setupDirectDeposit.mutate(c.id); }}>
                                <Zap className="w-4 h-4 mr-2 text-teal-600" />
                                {setupDirectDeposit.isPending && setupDirectDeposit.variables === c.id ? "Opening…" : "Set Up Direct Deposit"}
                              </DropdownMenuItem>
                            )}
                            {/* Copy invite link — when onboarding not yet complete */}
                            {c.onboardingStatus !== "complete" && (
                              <DropdownMenuItem
                                disabled={copyingId === c.id}
                                onClick={e => copyInviteLink(c.id, e)}>
                                {copiedId === c.id
                                  ? <><Copy className="w-4 h-4 mr-2 text-emerald-600" /><span className="text-emerald-600">Copied!</span></>
                                  : copyingId === c.id
                                    ? <><Link2 className="w-4 h-4 mr-2" /> Getting link…</>
                                    : <><Link2 className="w-4 h-4 mr-2" /> Copy Invite Link</>
                                }
                              </DropdownMenuItem>
                            )}
                            {/* Send Invite Email — when email exists and onboarding not complete */}
                            {c.email && c.onboardingStatus !== "complete" && (
                              <DropdownMenuItem
                                disabled={resendInvite.isPending && resendInvite.variables === c.id}
                                onClick={e => { e.stopPropagation(); resendInvite.mutate(c.id); }}>
                                <Send className="w-4 h-4 mr-2" />
                                {sentId === c.id
                                  ? <span className="text-emerald-600">Sent ✓</span>
                                  : resendInvite.isPending && resendInvite.variables === c.id
                                    ? "Sending…"
                                    : "Send Invite Email"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-red-600"
                              onClick={e => { e.stopPropagation(); deactivate.mutate(c.id); }}>
                              <UserX className="w-4 h-4 mr-2" /> Deactivate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="space-y-2 mt-4">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Commission</span>
                          <span className="font-medium text-gray-700">
                            {c.commissionStructureName
                              ? `${Number(c.commissionStructureEmployeePercent ?? 0).toFixed(0)}% (${c.commissionStructureName})`
                              : `${fmt$(c.commissionRate ?? 0)} services · ${fmt$(c.productCommissionRate ?? 0)} products`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Payout method</span>
                          <span className="font-medium text-gray-700">{PAYOUT_METHOD_LABEL[c.payoutMethod] ?? c.payoutMethod}</span>
                        </div>
                        {defaultBank && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Bank</span>
                            <span className="font-medium text-gray-700">
                              {defaultBank.bankName ?? "Bank"} ···{defaultBank.accountLast4 ?? ""}
                            </span>
                          </div>
                        )}
                      </div>

                      {(() => {
                        if (ts && ts.active && ts.createdAt) {
                          return (
                            <div className="mt-3 flex items-center gap-1.5 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-2.5 py-1.5">
                              <Send className="w-3.5 h-3.5 shrink-0 text-teal-500" />
                              <span>Invite sent {formatDistanceToNow(new Date(ts.createdAt), { addSuffix: true })}</span>
                            </div>
                          );
                        }
                        if (ts && !ts.active && ts.lastExpiredCreatedAt) {
                          const isSending = resendInvite.isPending && resendInvite.variables === c.id;
                          const wasSent = sentId === c.id;
                          return (
                            <div className="mt-3 flex items-center justify-between gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5">
                              <span className="flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                                Invite expired {formatDistanceToNow(new Date(ts.lastExpiredCreatedAt), { addSuffix: true })}
                              </span>
                              <button
                                onClick={e => { e.stopPropagation(); if (!isSending && !wasSent) resendInvite.mutate(c.id); }}
                                disabled={isSending || wasSent}
                                className={`flex items-center gap-1 font-medium px-2 py-0.5 rounded-full transition-colors ${
                                  wasSent
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-800 hover:bg-amber-200 cursor-pointer"
                                } disabled:cursor-default`}
                              >
                                {isSending
                                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Sending…</>
                                  : wasSent
                                    ? <><CheckCircle2 className="w-3 h-3" /> Sent ✓</>
                                    : "Resend"
                                }
                              </button>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
                        {effStatus === "invite_pending" ? (() => {
                          const isSending = resendInvite.isPending && resendInvite.variables === c.id;
                          const wasSent = sentId === c.id;
                          return (
                            <button
                              onClick={e => { e.stopPropagation(); if (!isSending && !wasSent) resendInvite.mutate(c.id); }}
                              disabled={isSending || wasSent}
                              title="Click to resend invite"
                              className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${
                                wasSent
                                  ? "bg-emerald-50 text-emerald-600"
                                  : "bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer"
                              } disabled:cursor-default`}
                            >
                              {isSending
                                ? <><Loader2 className="w-3 h-3 animate-spin" /> Sending…</>
                                : wasSent
                                  ? <><CheckCircle2 className="w-3 h-3" /> Sent ✓</>
                                  : <><Hourglass className="w-3 h-3" /> Invite pending · Resend</>
                              }
                            </button>
                          );
                        })() : (
                          <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${statusInfo.bg} ${statusInfo.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusInfo.label}
                          </span>
                        )}
                        {c.bankVerified && (
                          <span className="text-xs text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Bank verified
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {inactive.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Inactive ({inactive.length})</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 opacity-60">
                {inactive.map(c => (
                  <Card key={c.id} className="rounded-2xl border-gray-100 shadow-sm">
                    <CardContent className="p-5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-semibold shrink-0">
                        {c.firstName?.[0] ?? "?"}{c.lastName?.[0] ?? ""}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-600">{c.firstName} {c.lastName}</div>
                        <div className="text-xs text-gray-400">Inactive</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Invite Form ──────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  name: z.string().min(1, "Name required"),
  phone: z.string().min(10, "Valid phone required"),
  employmentType: z.string().default("stylist"),
});
type InviteFormValues = z.infer<typeof inviteSchema>;

function InviteForm({ storeId, onSuccess }: { storeId?: number; onSuccess: () => void }) {
  const { toast } = useToast();
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema) as Resolver<InviteFormValues>,
    defaultValues: { name: "", phone: "", employmentType: "stylist" },
  });

  const onSubmit = useCallback(async (data: InviteFormValues) => {
    const res = await fetch("/api/team/invite", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ ...data, role: "staff", storeId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: err.message || "Failed to send invite", variant: "destructive" });
      return;
    }
    toast({ title: "Invite sent via SMS" });
    onSuccess();
  }, [storeId, onSuccess, toast]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Full Name *</Label>
        <Input {...register("name")} placeholder="Team member name" className="rounded-xl" />
        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
      </div>
      <div className="space-y-2">
        <Label>Mobile Phone *</Label>
        <Input {...register("phone")}
          onChange={e => { const f = formatPhoneInput(e.target.value); e.currentTarget.value = f; setValue("phone", f); }}
          placeholder="(555) 000-0000" className="rounded-xl" />
        {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
      </div>
      <div className="space-y-2">
        <Label>Job Title</Label>
        <Select value={watch("employmentType")} onValueChange={v => setValue("employmentType", v)}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EMPLOYMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full rounded-xl" style={{ background: "#0f172a", color: "#fff" }}>
        {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</> : "Send Invite"}
      </Button>
    </form>
  );
}
