import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useServices, useUpdateService, useDeleteService, useDeleteAllServices } from "@/hooks/use-services";
import { useServiceCategories } from "@/hooks/use-addons";
import {
  Plus, Search, PenLine, Check, Loader2, MoreHorizontal,
  Power, PowerOff, ChevronDown, ChevronRight, Layers, Trash2, EyeOff, Sparkles, AlertTriangle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { ServiceForm } from "./ServiceForm";
import type { ServiceWithOptions } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Pastel colour map for category dots ──────────────────────────────────────
const PASTEL: Record<string, string> = {
  lavender:   "#c4b5fd",
  periwinkle: "#818cf8",
  peach:      "#fdba74",
  teal:       "#2dd4bf",
  lemon:      "#fde047",
  sky:        "#7dd3fc",
  mint:       "#6ee7b7",
};

// ── Local draft shape ─────────────────────────────────────────────────────────
interface Draft { name: string; duration: string; price: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function fmtPrice(p: string | number) {
  return `$${Number(p).toFixed(2)}`;
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ServicesList() {
  const { data: services, isLoading } = useServices();
  const { data: categories = [] } = useServiceCategories();
  const { mutate: updateService } = useUpdateService();
  const { mutate: deleteService } = useDeleteService();
  const { mutate: deleteAllServices, isPending: isDeletingAll } = useDeleteAllServices();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery]   = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editMode, setEditMode]         = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState("");

  // Bulk AI description generation
  const [bulkGenerating, setBulkGenerating] = useState(false);

  // Per-service id: draft values (only populated when edit mode is on)
  const [drafts, setDrafts]   = useState<Record<number, Draft>>({});
  // Currently saving
  const [saving, setSaving]   = useState<Set<number>>(new Set());
  // Recently saved — flash a checkmark
  const [saved, setSaved]     = useState<Set<number>>(new Set());
  // Expanded option rows
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // Services marked for deletion in edit mode
  const [pendingDeletes, setPendingDeletes] = useState<Set<number>>(new Set());

  // Sheet state
  const [createOpen, setCreateOpen]     = useState(false);
  const [createCatId, setCreateCatId]   = useState<number | undefined>();
  const [editServiceId, setEditServiceId] = useState<number | null>(null);

  const all: ServiceWithOptions[] = services || [];
  const inactiveCount = all.filter((s) => (s as any).isActive === false).length;
  const activeCount = all.length - inactiveCount;

  const filtered = all
    .filter((s) => showInactive || (s as any).isActive !== false)
    .filter((s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.category || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

  // Group by category (preserve category sort order)
  const catMap = new Map<number | null, typeof filtered>();
  for (const svc of filtered) {
    const key = svc.categoryId ?? null;
    if (!catMap.has(key)) catMap.set(key, []);
    catMap.get(key)!.push(svc);
  }

  // Build ordered groups
  const orderedCats = [...(categories as any[])]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  type Group = { id: number | null; name: string; color: string | null; services: ServiceWithOptions[] };
  const groups: Group[] = [];
  for (const cat of orderedCats) {
    const svcs = catMap.get(cat.id);
    if (svcs && svcs.length > 0) groups.push({ id: cat.id, name: cat.name, color: cat.color ?? null, services: svcs });
  }
  // Uncategorised fallback
  const uncategorised = catMap.get(null);
  if (uncategorised && uncategorised.length > 0) {
    groups.push({ id: null, name: "Uncategorised", color: null, services: uncategorised });
  }

  const editService = editServiceId ? all.find((s) => s.id === editServiceId) : null;

  // ── Edit mode toggle ────────────────────────────────────────────────────────
  function toggleEditMode() {
    if (!editMode) {
      // Seed drafts from current service data
      const initial: Record<number, Draft> = {};
      for (const s of all) {
        initial[s.id] = {
          name:     s.name,
          duration: String(s.duration),
          price:    Number(s.price).toFixed(2),
        };
      }
      setDrafts(initial);
      setPendingDeletes(new Set());
    }
    setEditMode((v) => !v);
  }

  // ── Save editing: delete checked services then exit edit mode ───────────────
  const [deleting, setDeleting] = useState(false);

  async function saveEditing() {
    const toDelete = [...pendingDeletes];
    if (toDelete.length === 0) {
      setEditMode(false);
      return;
    }
    setDeleting(true);
    let failed = 0;
    for (const id of toDelete) {
      await new Promise<void>((resolve) => {
        deleteService(id, {
          onSuccess: () => resolve(),
          onError:   () => { failed++; resolve(); },
        });
      });
    }
    setDeleting(false);
    setPendingDeletes(new Set());
    setEditMode(false);
    if (failed > 0) {
      toast({ title: `${failed} service${failed > 1 ? "s" : ""} could not be deleted`, variant: "destructive" });
    } else {
      toast({ title: `${toDelete.length} service${toDelete.length > 1 ? "s" : ""} deleted` });
    }
  }

  // All visible service IDs (for select-all)
  const allVisibleIds = filtered.map((s) => s.id);
  const allChecked = allVisibleIds.length > 0 && allVisibleIds.every((id) => pendingDeletes.has(id));
  const someChecked = !allChecked && allVisibleIds.some((id) => pendingDeletes.has(id));

  function toggleSelectAll() {
    if (allChecked) {
      setPendingDeletes(new Set());
    } else {
      setPendingDeletes(new Set(allVisibleIds));
    }
  }

  function togglePendingDelete(id: number) {
    setPendingDeletes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Inline save ─────────────────────────────────────────────────────────────
  const savedTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const commitField = useCallback(
    (serviceId: number, field: keyof Draft, rawValue: string) => {
      const original = all.find((s) => s.id === serviceId);
      if (!original) return;

      let value = rawValue.trim();
      const origVal =
        field === "name"     ? original.name :
        field === "duration" ? String(original.duration) :
        Number(original.price).toFixed(2);

      // Validation
      if (field === "name") {
        if (!value) {
          setDrafts((p) => ({ ...p, [serviceId]: { ...p[serviceId], name: original.name } }));
          return;
        }
      }
      if (field === "duration") {
        const n = parseInt(value, 10);
        if (isNaN(n) || n < 1) {
          setDrafts((p) => ({ ...p, [serviceId]: { ...p[serviceId], duration: origVal } }));
          return;
        }
        value = String(n);
      }
      if (field === "price") {
        const n = parseFloat(value);
        if (isNaN(n) || n < 0) {
          setDrafts((p) => ({ ...p, [serviceId]: { ...p[serviceId], price: origVal } }));
          return;
        }
        value = n.toFixed(2);
        setDrafts((p) => ({ ...p, [serviceId]: { ...p[serviceId], price: value } }));
      }

      // No change — skip the network call
      if (value === origVal) return;

      const payload: Record<string, unknown> = { id: serviceId };
      if (field === "name")     payload.name     = value;
      if (field === "duration") payload.duration = parseInt(value, 10);
      if (field === "price")    payload.price    = value;

      setSaving((p) => new Set([...p, serviceId]));

      updateService(payload as any, {
        onSuccess: () => {
          setSaving((p) => { const s = new Set(p); s.delete(serviceId); return s; });
          setSaved((p) => new Set([...p, serviceId]));
          clearTimeout(savedTimers.current[serviceId]);
          savedTimers.current[serviceId] = setTimeout(() => {
            setSaved((p) => { const s = new Set(p); s.delete(serviceId); return s; });
          }, 1800);
        },
        onError: () => {
          setSaving((p) => { const s = new Set(p); s.delete(serviceId); return s; });
          setDrafts((p) => ({ ...p, [serviceId]: { ...p[serviceId], [field]: origVal } }));
          toast({ title: "Save failed", variant: "destructive" });
        },
      });
    },
    [all, updateService, toast]
  );

  // ── Status toggle ───────────────────────────────────────────────────────────
  function handleToggleActive(service: ServiceWithOptions) {
    updateService(
      { id: service.id, isActive: !(service as any).isActive } as any,
      {
        onSuccess: () => toast({ title: (service as any).isActive ? "Service deactivated" : "Service activated" }),
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      }
    );
  }

  // ── Hidden from public toggle ────────────────────────────────────────────────
  function handleToggleHidden(service: ServiceWithOptions) {
    const nowHidden = !(service as any).hiddenFromPublic;
    updateService(
      { id: service.id, hiddenFromPublic: nowHidden } as any,
      {
        onSuccess: () => toast({ title: nowHidden ? "Hidden from public booking & kiosk" : "Now visible to public" }),
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      }
    );
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  function handleDelete(id: number) {
    deleteService(id, {
      onSuccess: () => toast({ title: "Service deleted" }),
      onError: () => toast({ title: "Error deleting service", variant: "destructive" }),
    });
  }

  function handleDeleteAll() {
    if (deleteAllConfirmation !== "DELETE ALL") return;
    deleteAllServices(undefined, {
      onSuccess: ({ deleted }) => {
        setDeleteAllOpen(false);
        setDeleteAllConfirmation("");
        setEditMode(false);
        setPendingDeletes(new Set());
        toast({
          title: deleted === 0 ? "No active services to delete" : "All services deleted",
          description: deleted > 0
            ? `${deleted} service${deleted === 1 ? " was" : "s were"} removed from this location.`
            : undefined,
        });
      },
      onError: (error) => toast({
        title: "Services could not be deleted",
        description: error.message,
        variant: "destructive",
      }),
    });
  }

  // ── Bulk AI description generation ──────────────────────────────────────────
  const missingDescCount = all.filter((s) => !(s as any).description?.trim()).length;

  async function handleBulkGenerate() {
    if (missingDescCount === 0) return;
    setBulkGenerating(true);
    try {
      const res = await fetch("/api/services/bulk-generate-descriptions", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Request failed");
      await queryClient.invalidateQueries({ queryKey: [api.services.list.path] });
      if (data.updated === 0) {
        toast({ title: "All services already have descriptions." });
      } else {
        toast({
          title: `✨ ${data.updated} description${data.updated !== 1 ? "s" : ""} generated`,
          description: data.failed
            ? `${data.failed} service${data.failed !== 1 ? "s" : ""} could not be processed.`
            : "All missing descriptions have been filled in.",
        });
      }
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setBulkGenerating(false);
    }
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search services…"
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {inactiveCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Hide inactive" : `Show inactive (${inactiveCount})`}
          </Button>
        )}

        {/* Edit mode toggle */}
        <Button
          variant={editMode ? "default" : "outline"}
          size="sm"
          onClick={editMode ? saveEditing : toggleEditMode}
          disabled={deleting}
          className={editMode ? "bg-primary text-primary-foreground" : ""}
        >
          {deleting ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Deleting…</>
          ) : editMode ? (
            <><Check className="h-4 w-4 mr-1.5" />Save Editing{pendingDeletes.size > 0 ? ` (delete ${pendingDeletes.size})` : ""}</>
          ) : (
            <><PenLine className="h-4 w-4 mr-1.5" />Edit Mode</>
          )}
        </Button>

        {/* Auto-generate descriptions for services that have none */}
        {missingDescCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkGenerate}
            disabled={bulkGenerating}
            title={`Generate AI descriptions for ${missingDescCount} service${missingDescCount !== 1 ? "s" : ""} missing one`}
          >
            {bulkGenerating ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1.5" />Auto-describe ({missingDescCount})</>
            )}
          </Button>
        )}

        {activeCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteAllOpen(true)}
            disabled={editMode || isDeletingAll}
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete all
          </Button>
        )}

        <Button size="sm" onClick={() => { setCreateCatId(undefined); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Service
        </Button>
      </div>

      {/* ── Edit mode hint banner ── */}
      {editMode && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/8 border border-primary/20 px-4 py-2.5 text-sm text-primary">
          <PenLine className="h-4 w-4 shrink-0" />
          <span>
            Click any <strong>name</strong>, <strong>duration</strong>, or <strong>price</strong> to edit — saves automatically.
            {" "}Check the box on the left of any service to mark it for deletion, then click <strong>Save Editing</strong>.
          </span>
        </div>
      )}
      {/* ── Pending delete warning ── */}
      {editMode && pendingDeletes.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-2.5 text-sm text-destructive">
          <Trash2 className="h-4 w-4 shrink-0" />
          <span><strong>{pendingDeletes.size} service{pendingDeletes.size > 1 ? "s" : ""}</strong> will be permanently deleted when you click Save Editing.</span>
        </div>
      )}

      {/* ── Table ── */}
      {groups.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {all.length === 0
            ? "No services yet. Click Add Service to get started."
            : "No services match your search."}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            {/* Column header */}
            <thead>
              <tr className="border-b bg-muted/30">
                {editMode && (
                  <th className="py-2.5 pl-3 pr-1 w-[40px]">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked; }}
                      onChange={toggleSelectAll}
                      title="Select all for deletion"
                      className="h-4 w-4 rounded border-input cursor-pointer accent-destructive"
                    />
                  </th>
                )}
                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Service</th>
                <th className="text-center py-2.5 px-3 font-medium text-muted-foreground w-[130px]">Duration</th>
                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground w-[110px]">Price</th>
                <th className="text-center py-2.5 px-3 font-medium text-muted-foreground w-[72px]">Active</th>
                <th className="text-center py-2.5 px-3 font-medium text-muted-foreground w-[100px]">
                  <span className="flex items-center justify-center gap-1"><EyeOff className="h-3.5 w-3.5" />Hidden</span>
                </th>
                <th className="w-[48px]" />
              </tr>
            </thead>

            <tbody className="divide-y">
              {groups.map((group) => {
                const dot = group.color ? PASTEL[group.color] ?? "#94a3b8" : "#94a3b8";
                return (
                  <>
                    {/* ── Category header row ── */}
                    <tr key={`cat-${group.id}`} className="bg-muted/20">
                      {editMode && <td className="py-2 pl-3 pr-1" />}
                      <td colSpan={4} className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: dot }}
                          />
                          <span className="font-semibold text-foreground">{group.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {group.services.length} service{group.services.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title={`Add service to ${group.name}`}
                          onClick={() => {
                            setCreateCatId(group.id ?? undefined);
                            setCreateOpen(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>

                    {/* ── Service rows ── */}
                    {group.services.map((service) => {
                      const isActive   = (service as any).isActive !== false;
                      const draft      = drafts[service.id];
                      const isSaving   = saving.has(service.id);
                      const isSaved    = saved.has(service.id);
                      const opts       = service.options ?? [];
                      const isExpanded = expanded.has(service.id);
                      const isMarked   = pendingDeletes.has(service.id);

                      return (
                        <>
                          <tr
                            key={service.id}
                            className={`group/row hover:bg-muted/20 transition-colors ${!isActive ? "opacity-50" : ""} ${isMarked ? "bg-destructive/5" : ""}`}
                          >
                            {/* ── Delete checkbox (edit mode only) ── */}
                            {editMode && (
                              <td className="py-2.5 pl-3 pr-1 w-[40px]">
                                <input
                                  type="checkbox"
                                  checked={isMarked}
                                  onChange={() => togglePendingDelete(service.id)}
                                  title="Mark for deletion"
                                  className="h-4 w-4 rounded border-input cursor-pointer accent-destructive"
                                />
                              </td>
                            )}

                            {/* Name */}
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2 min-w-0">
                                {/* Options expand toggle */}
                                {opts.length > 0 && (
                                  <button
                                    onClick={() => setExpanded((p) => {
                                      const n = new Set(p);
                                      n.has(service.id) ? n.delete(service.id) : n.add(service.id);
                                      return n;
                                    })}
                                    className="text-muted-foreground hover:text-foreground shrink-0"
                                  >
                                    {isExpanded
                                      ? <ChevronDown className="h-3.5 w-3.5" />
                                      : <ChevronRight className="h-3.5 w-3.5" />}
                                  </button>
                                )}

                                {editMode && draft ? (
                                  <input
                                    className={`flex-1 min-w-0 rounded-md border px-2 py-1 text-sm font-medium outline-none ring-0 focus:ring-2 focus:ring-primary/50 focus:border-primary transition ${isMarked ? "border-destructive/40 bg-destructive/5 line-through text-muted-foreground" : "border-input bg-background"}`}
                                    value={draft.name}
                                    onChange={(e) =>
                                      setDrafts((p) => ({ ...p, [service.id]: { ...p[service.id], name: e.target.value } }))
                                    }
                                    onBlur={(e) => commitField(service.id, "name", e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                    disabled={isMarked}
                                  />
                                ) : (
                                  <span className="font-medium truncate">{service.name}</span>
                                )}

                                {opts.length > 0 && (
                                  <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                                    <Layers className="h-3 w-3" />
                                    {opts.length}
                                  </Badge>
                                )}
                              </div>
                            </td>

                            {/* Duration */}
                            <td className="py-2.5 px-3 text-center">
                              {editMode && draft ? (
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    min={1}
                                    className="w-16 rounded-md border border-input bg-background px-2 py-1 text-sm text-center outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                                    value={draft.duration}
                                    onChange={(e) =>
                                      setDrafts((p) => ({ ...p, [service.id]: { ...p[service.id], duration: e.target.value } }))
                                    }
                                    onBlur={(e) => commitField(service.id, "duration", e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                  />
                                  <span className="text-xs text-muted-foreground">min</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">
                                  {opts.length > 0
                                    ? `from ${fmtDuration(Math.min(...opts.map((o) => o.durationMinutes)))}`
                                    : fmtDuration(service.duration)}
                                </span>
                              )}
                            </td>

                            {/* Price */}
                            <td className="py-2.5 px-4 text-right">
                              {editMode && draft ? (
                                <div className="flex items-center justify-end gap-0.5">
                                  <span className="text-muted-foreground text-sm">$</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm text-right outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                                    value={draft.price}
                                    onChange={(e) =>
                                      setDrafts((p) => ({ ...p, [service.id]: { ...p[service.id], price: e.target.value } }))
                                    }
                                    onBlur={(e) => commitField(service.id, "price", e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                  />
                                </div>
                              ) : (
                                <span className="font-medium">
                                  {opts.length > 0
                                    ? `from ${fmtPrice(Math.min(...opts.map((o) => Number(o.price))))}`
                                    : fmtPrice(service.price)}
                                </span>
                              )}
                            </td>

                            {/* Active toggle */}
                            <td className="py-2.5 px-3 text-center">
                              <Switch
                                checked={isActive}
                                onCheckedChange={() => handleToggleActive(service)}
                                aria-label="Toggle active"
                              />
                            </td>

                            {/* Hidden from public toggle */}
                            <td className="py-2.5 px-3 text-center">
                              <Switch
                                checked={(service as any).hiddenFromPublic || false}
                                onCheckedChange={() => handleToggleHidden(service)}
                                aria-label="Hidden from public"
                              />
                            </td>

                            {/* Actions: saving indicator + ⋯ menu */}
                            <td className="py-2.5 px-2 text-center">
                              {isSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
                              ) : isSaved ? (
                                <Check className="h-4 w-4 text-green-500 mx-auto" />
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 opacity-0 group-hover/row:opacity-100 transition-opacity"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setEditServiceId(service.id)}>
                                      Edit full details
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleToggleActive(service)}>
                                      {isActive
                                        ? <><PowerOff className="h-4 w-4 mr-2" />Deactivate</>
                                        : <><Power className="h-4 w-4 mr-2" />Activate</>}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => handleDelete(service.id)}
                                    >
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </td>
                          </tr>

                          {/* ── Expanded options rows ── */}
                          {isExpanded && opts.map((opt) => (
                            <tr key={`opt-${opt.id}`} className="bg-muted/10 border-t border-dashed">
                              {editMode && <td className="py-2 pl-3 pr-1" />}
                              <td className="py-2 pl-12 pr-4">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <span className="text-xs">↳</span>
                                  <span className="text-xs font-medium">{opt.name}</span>
                                  {opt.isDefault && <Badge variant="outline" className="text-[10px] h-4 px-1">Default</Badge>}
                                  {opt.description && (
                                    <span className="text-xs text-muted-foreground/70 truncate max-w-[200px]">{opt.description}</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-center text-xs text-muted-foreground">
                                {fmtDuration(opt.durationMinutes)}
                              </td>
                              <td className="py-2 px-4 text-right text-xs font-medium">
                                {fmtPrice(opt.price)}
                              </td>
                              <td colSpan={3} />
                            </tr>
                          ))}
                        </>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Sheet ── */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Service</SheetTitle>
            <SheetDescription>Add a service offered at your salon.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <ServiceForm
              categories={categories}
              initialCategoryId={createCatId}
              onSuccess={() => setCreateOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Edit Sheet ── */}
      <Sheet open={!!editServiceId} onOpenChange={(open) => !open && setEditServiceId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Service</SheetTitle>
            <SheetDescription>Update service details and options.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {editService && (
              <ServiceForm
                categories={categories}
                initialData={editService}
                onSuccess={() => setEditServiceId(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Delete all confirmation ── */}
      <AlertDialog
        open={deleteAllOpen}
        onOpenChange={(open) => {
          if (!isDeletingAll) {
            setDeleteAllOpen(open);
            if (!open) setDeleteAllConfirmation("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete all {activeCount} services?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes every active service from this location’s service menu, online booking,
              kiosk, and future appointments. Historical appointments and reports remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-2">
            <label htmlFor="delete-all-services-confirmation" className="text-sm font-medium text-foreground">
              Type <span className="font-mono font-semibold">DELETE ALL</span> to confirm
            </label>
            <Input
              id="delete-all-services-confirmation"
              value={deleteAllConfirmation}
              onChange={(event) => setDeleteAllConfirmation(event.target.value)}
              placeholder="DELETE ALL"
              autoComplete="off"
              disabled={isDeletingAll}
              className="font-mono"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingAll}>Keep services</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleDeleteAll();
              }}
              disabled={deleteAllConfirmation !== "DELETE ALL" || isDeletingAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingAll ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Deleting…</>
              ) : (
                `Delete all ${activeCount} services`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
