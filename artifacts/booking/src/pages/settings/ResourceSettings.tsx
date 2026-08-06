import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Resource = {
  id: number;
  storeId: number;
  type: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
};

const TYPE_META: Record<string, { label: string; emoji: string; description: string }> = {
  station: { label: "Nail Station",     emoji: "💅", description: "Manicure tables and nail stations" },
  chair:   { label: "Pedicure Chair",   emoji: "🪑", description: "Pedicure spa chairs" },
  room:    { label: "Treatment Room",   emoji: "🚪", description: "Private treatment rooms" },
  other:   { label: "Other",            emoji: "🛋️", description: "Custom resource types" },
};

export default function ResourceSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showAdd, setShowAdd]       = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [editName, setEditName]     = useState("");
  const [newType, setNewType]       = useState("station");
  const [newName, setNewName]       = useState("");

  const { data: resources = [], isLoading } = useQuery<Resource[]>({
    queryKey: ["/api/resources"],
    queryFn: async () => {
      const res = await fetch("/api/resources", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/resources"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: newType, name: newName.trim() }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      return res.json();
    },
    onSuccess: () => { invalidate(); setShowAdd(false); setNewName(""); toast({ title: "Resource added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Record<string, any>) => {
      const res = await fetch(`/api/resources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      return res.json();
    },
    onSuccess: () => { invalidate(); setEditingId(null); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/resources/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
    },
    onSuccess: () => { invalidate(); toast({ title: "Resource removed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const grouped = Object.keys(TYPE_META).reduce<Record<string, Resource[]>>((acc, t) => {
    acc[t] = resources.filter(r => r.type === t);
    return acc;
  }, {});

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stations &amp; Chairs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Assign appointments to specific stations or chairs. They appear as columns in the Resources calendar view.
          </p>
        </div>
        <Button onClick={() => { setShowAdd(true); }} disabled={showAdd} className="flex-shrink-0">
          <Plus className="w-4 h-4 mr-1.5" /> Add
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card className="border-teal-200 bg-teal-50/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">New Resource</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Type</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_META).map(([v, { label, emoji }]) => (
                      <SelectItem key={v} value={v}>{emoji} {label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Name</Label>
                <Input
                  className="h-9 text-sm"
                  placeholder={newType === "station" ? "Station 1" : newType === "chair" ? "Chair A" : "Room 1"}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && newName.trim()) createMutation.mutate(); if (e.key === "Escape") { setShowAdd(false); setNewName(""); }}}
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setNewName(""); }}>Cancel</Button>
              <Button
                size="sm"
                disabled={!newName.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? "Adding…" : "Add Resource"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resource list */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
      ) : resources.length === 0 && !showAdd ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <span className="text-5xl">💅</span>
            <div>
              <p className="font-semibold text-base">No resources yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Add your stations and chairs so staff can be assigned a specific spot per appointment.
              </p>
            </div>
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Add first resource
            </Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(TYPE_META).map(([type, { label, emoji, description }]) => {
          const list = grouped[type] ?? [];
          if (list.length === 0) return null;
          return (
            <Card key={type}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className="text-xl leading-none">{emoji}</span>
                  {label}
                  <Badge variant="secondary" className="ml-auto text-xs font-medium">{list.length}</Badge>
                </CardTitle>
                <CardDescription className="text-xs">{description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-1 space-y-1.5">
                {list.map(r => (
                  <div
                    key={r.id}
                    className={`flex items-center gap-3 rounded-lg border bg-white px-3 py-2 transition-opacity ${!r.isActive ? "opacity-40" : ""}`}
                  >
                    {editingId === r.id ? (
                      <>
                        <Input
                          className="h-7 text-sm flex-1"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && editName.trim()) patchMutation.mutate({ id: r.id, name: editName.trim() });
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                        />
                        <button
                          title="Save"
                          className="text-teal-600 hover:text-teal-800 transition-colors"
                          onClick={() => { if (editName.trim()) patchMutation.mutate({ id: r.id, name: editName.trim() }); }}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          title="Cancel"
                          className="text-slate-400 hover:text-slate-600 transition-colors"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium leading-snug">{r.name}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Switch
                            checked={r.isActive}
                            onCheckedChange={checked => patchMutation.mutate({ id: r.id, isActive: checked })}
                            aria-label={r.isActive ? "Active" : "Inactive"}
                          />
                          <button
                            title="Rename"
                            className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
                            onClick={() => { setEditingId(r.id); setEditName(r.name); }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            title="Delete"
                            className="text-slate-400 hover:text-red-500 transition-colors p-0.5"
                            onClick={() => { if (window.confirm(`Remove "${r.name}"? Existing appointments won't be affected.`)) deleteMutation.mutate(r.id); }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Calendar tip */}
      {resources.length > 0 && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900 leading-relaxed">
          <strong>Tip:</strong> On the calendar, click the <strong>Layers</strong> icon to switch to the <strong>Resources view</strong> — each station or chair becomes its own column. Appointment cards in staff view show a badge when a resource is assigned.
        </div>
      )}
    </div>
  );
}
