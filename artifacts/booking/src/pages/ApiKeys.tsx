import { useState } from "react";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Key, Plus, Trash2, Copy, Eye, EyeOff, CheckCircle, BookOpen } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";

type ApiKeyRow = {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string;
  isActive: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
};

export default function ApiKeys() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys = [], isLoading } = useQuery<ApiKeyRow[]>({
    queryKey: ["/api/api-keys", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return [];
      const res = await fetch(`/api/api-keys?storeId=${selectedStore.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore?.id, name }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ key: string }>;
    },
    onSuccess: (data) => {
      setNewKey(data.key);
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys", selectedStore?.id] });
      setKeyName("");
    },
    onError: (e: any) => toast({ title: "Failed to create key", description: e.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/api-keys/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore?.id }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      toast({ title: "API key revoked" });
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys", selectedStore?.id] });
    },
    onError: () => toast({ title: "Failed to revoke key", variant: "destructive" }),
  });

  const copyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="w-6 h-6 text-primary" />
            API Keys
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Use API keys to access your salon data programmatically
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New API Key
        </Button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-800">
        <strong>Keep your API keys secret.</strong> Each key grants read access to your store's appointments, clients, and services. Revoke any key you no longer need.
      </div>

      <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-violet-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-violet-900">Elite API — Integration Guide</p>
            <p className="text-xs text-violet-700 mt-0.5">Authentication, rate limits, available endpoints, webhooks, and code examples.</p>
          </div>
        </div>
        <Link
          to="/elite-api-docs"
          className="shrink-0 text-xs font-semibold text-violet-700 hover:text-violet-900 underline underline-offset-2 whitespace-nowrap"
        >
          View Documentation →
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading…</div>
      ) : keys.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed rounded-xl">
          <Key className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-1">No API keys</h3>
          <p className="text-muted-foreground text-sm mb-4">Create an API key to integrate with external tools</p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create API Key
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <div key={k.id} className="border rounded-xl p-4 bg-card flex items-center gap-4">
              <Key className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">{k.name}</span>
                  <Badge variant={k.isActive ? "default" : "outline"} className="text-xs">
                    {k.isActive ? "Active" : "Revoked"}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                  <span>{k.keyPrefix}••••••••</span>
                  {k.lastUsedAt && (
                    <span>Last used {format(new Date(k.lastUsedAt), "MMM d, yyyy")}</span>
                  )}
                  <span>Created {format(new Date(k.createdAt), "MMM d, yyyy")}</span>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive shrink-0"
                onClick={() => revokeMutation.mutate(k.id)}
                disabled={!k.isActive}
                title="Revoke key"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) setNewKey(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{newKey ? "API Key Created" : "Create API Key"}</DialogTitle>
          </DialogHeader>

          {newKey ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Copy this key now — it won't be shown again.
              </p>
              <div className="flex items-center gap-2 bg-muted p-3 rounded-lg">
                <code className="flex-1 text-xs break-all font-mono select-all">{newKey}</code>
                <Button size="icon" variant="ghost" onClick={copyKey}>
                  {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <Button className="w-full" onClick={() => { setShowCreate(false); setNewKey(null); }}>
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Key Name</Label>
                <Input
                  placeholder="e.g. Zapier Integration"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">A descriptive name to identify this key.</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button
                  onClick={() => createMutation.mutate(keyName)}
                  disabled={!keyName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating…" : "Create Key"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
