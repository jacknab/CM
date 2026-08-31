/**
 * AgentAccountsManager — Admin page for creating and managing agent accounts
 * that can log in to the /isTeam back office.
 *
 * The login email (…@certxa.com) is auto-generated from the agent's name and
 * their own database record number, so it only exists after the account is
 * created. The admin supplies the agent's real email address separately —
 * that's where the generated login and a freshly generated strong password
 * are sent.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Loader2, Copy, Check, ToggleLeft, ToggleRight, KeyRound,
  ShieldCheck, UserCog, Mail, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentAccount {
  id: number;
  name: string | null;
  email: string | null;
  personalEmail: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface CredentialsResult {
  id: number;
  name: string | null;
  email: string | null;
  temporaryPassword: string;
  emailSent: boolean;
  emailError?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ─── Copy-to-clipboard field ───────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable — ignore */ }
  };
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1 font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-sm bg-gray-100 border border-gray-200 rounded px-3 py-2 font-mono text-gray-900 break-all">
          {value}
        </code>
        <Button size="sm" variant="outline" onClick={copy} className="flex-shrink-0">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  );
}

// ─── Create form ────────────────────────────────────────────────────────────────

function CreateAgentForm({
  onCreate,
  isLoading,
}: {
  onCreate: (data: { name: string; personalEmail: string; role: string }) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [role, setRole] = useState("agent");

  const canSubmit = name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail.trim());

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1 font-medium">Agent Name *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jamie Rivera"
            className="bg-white border-gray-300 text-gray-900"
          />
          <p className="text-xs text-gray-400 mt-0.5">Their @certxa.com login is generated from this + their record number.</p>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1 font-medium">Role</label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="bg-white border-gray-300 text-gray-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-1 font-medium">Agent's Real Email Address *</label>
        <Input
          type="email"
          value={personalEmail}
          onChange={(e) => setPersonalEmail(e.target.value)}
          placeholder="agent@example.com"
          className="bg-white border-gray-300 text-gray-900"
        />
        <p className="text-xs text-gray-400 mt-0.5">Their generated login + a temporary password are emailed here.</p>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button
          className="bg-violet-600 hover:bg-violet-500 text-white"
          onClick={() => onCreate({ name: name.trim(), personalEmail: personalEmail.trim(), role })}
          disabled={isLoading || !canSubmit}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
          Create Agent Account
        </Button>
      </div>
    </div>
  );
}

// ─── Agent row ────────────────────────────────────────────────────────────────

function AgentRow({
  agent,
  onToggleActive,
  onResetPassword,
  isBusy,
}: {
  agent: AgentAccount;
  onToggleActive: (agent: AgentAccount) => void;
  onResetPassword: (agent: AgentAccount) => void;
  isBusy: boolean;
}) {
  return (
    <Card className={`bg-white border border-gray-200 shadow-sm ${!agent.isActive ? "opacity-60" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${agent.isActive ? "bg-emerald-500" : "bg-gray-300"}`} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-gray-900 font-semibold">{agent.name || "(unnamed)"}</span>
              <Badge variant={agent.role === "admin" ? "default" : "secondary"} className={agent.role === "admin" ? "bg-violet-600" : ""}>
                {agent.role === "admin" ? <ShieldCheck className="w-3 h-3 mr-1" /> : <UserCog className="w-3 h-3 mr-1" />}
                {agent.role}
              </Badge>
              {!agent.isActive && (
                <span className="text-xs text-gray-400 border border-gray-200 bg-gray-50 px-1.5 py-0.5 rounded">Deactivated</span>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
              <span className="font-mono text-gray-700">{agent.email || "(pending)"}</span>
              {agent.personalEmail && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" /> {agent.personalEmail}
                </span>
              )}
              <span>Last login: {formatDate(agent.lastLoginAt)}</span>
              <span>Created: {formatDate(agent.createdAt)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-500 hover:text-gray-800 hover:bg-gray-100 h-8 px-2 text-xs gap-1"
              onClick={() => onResetPassword(agent)}
              disabled={isBusy || !agent.personalEmail}
              title={agent.personalEmail ? "Reset password" : "No personal email on file"}
            >
              <KeyRound className="w-3.5 h-3.5" />
              Reset Password
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className={`h-8 px-2 ${agent.isActive ? "text-gray-400 hover:text-amber-500 hover:bg-amber-50" : "text-gray-300 hover:text-emerald-600 hover:bg-emerald-50"}`}
              onClick={() => onToggleActive(agent)}
              disabled={isBusy}
              title={agent.isActive ? "Deactivate" : "Activate"}
            >
              {agent.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function AgentAccountsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [credentials, setCredentials] = useState<CredentialsResult | null>(null);

  const { data: agents = [], isLoading } = useQuery<AgentAccount[]>({
    queryKey: ["/api/admin/agents"],
    queryFn: () => apiFetch("/api/admin/agents"),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; personalEmail: string; role: string }) =>
      apiFetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (result: CredentialsResult) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents"] });
      setShowCreateForm(false);
      setCredentials(result);
      toast({
        title: "Agent account created",
        description: result.emailSent ? `Credentials emailed to the agent.` : "Account created, but the credentials email failed to send — copy the details below.",
      });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (agent: AgentAccount) =>
      apiFetch(`/api/admin/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !agent.isActive }),
      }),
    onMutate: (agent) => setBusyId(agent.id),
    onSettled: () => setBusyId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/agents"] }),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (agent: AgentAccount) => apiFetch(`/api/admin/agents/${agent.id}/reset-password`, { method: "POST" }),
    onMutate: (agent) => setBusyId(agent.id),
    onSettled: () => setBusyId(null),
    onSuccess: (result: { temporaryPassword: string; emailSent: boolean; emailError?: string }, agent) => {
      setCredentials({ id: agent.id, name: agent.name, email: agent.email, ...result });
      toast({
        title: "Password reset",
        description: result.emailSent ? "New password emailed to the agent." : "Password reset, but the email failed to send — copy the details below.",
      });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const activeAgents = agents.filter((a) => a.isActive);
  const inactiveAgents = agents.filter((a) => !a.isActive);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Accounts</h1>
          <p className="text-gray-500 text-sm mt-1">
            {activeAgents.length} active · {inactiveAgents.length} deactivated — manage who can log in to /isTeam
          </p>
        </div>
        <Button
          className="bg-violet-600 hover:bg-violet-500 text-white"
          onClick={() => setShowCreateForm((v) => !v)}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Agent
        </Button>
      </div>

      {showCreateForm && (
        <Card className="bg-white border border-violet-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-gray-900 text-base">Create Agent Account</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <CreateAgentForm
              onCreate={(data) => createMutation.mutate(data)}
              isLoading={createMutation.isPending}
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        </div>
      ) : agents.length === 0 ? (
        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-8 text-center">
            <UserCog className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No agent accounts yet</p>
            <p className="text-gray-400 text-sm mt-1">Create one above to give someone access to /isTeam.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {activeAgents.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold px-1">Active</p>
              {activeAgents.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  onToggleActive={(a) => toggleMutation.mutate(a)}
                  onResetPassword={(a) => resetPasswordMutation.mutate(a)}
                  isBusy={busyId === agent.id}
                />
              ))}
            </div>
          )}

          {inactiveAgents.length > 0 && (
            <div className="space-y-2 mt-4">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold px-1">Deactivated</p>
              {inactiveAgents.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  onToggleActive={(a) => toggleMutation.mutate(a)}
                  onResetPassword={(a) => resetPasswordMutation.mutate(a)}
                  isBusy={busyId === agent.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!credentials} onOpenChange={(open) => { if (!open) setCredentials(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agent Credentials</DialogTitle>
          </DialogHeader>
          {credentials && (
            <div className="space-y-4">
              {!credentials.emailSent && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-700 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>The credentials email failed to send{credentials.emailError ? ` (${credentials.emailError})` : ""}. Share these details with {credentials.name || "the agent"} manually.</span>
                </div>
              )}
              <CopyField label="Login Email" value={credentials.email || ""} />
              <CopyField label="Temporary Password" value={credentials.temporaryPassword} />
              <p className="text-xs text-gray-400">This password is shown only once — the agent should change it after logging in at /isTeam/login.</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredentials(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
