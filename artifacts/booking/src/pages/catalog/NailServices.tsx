import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Check, X, ChevronDown, PowerOff, ImagePlus, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useNailVocab,
  useNailServices,
  useServiceNailConfig,
  useSaveServiceNailConfig,
  useNailVocabMutations,
  type NailVocabKind,
  type NailVocabRow,
  type JunctionInput,
} from "@/hooks/use-nail-config";

const money = (v: string | number) => `$${Number(v || 0).toFixed(2)}`;
const signed = (v: string | number) => {
  const n = Number(v || 0);
  return n === 0 ? "$0" : n > 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
};

export default function NailServices() {
  const services = useNailServices();
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Fake Nail Services</h1>
          <p className="text-muted-foreground">
            Configure nail length, shape and art — with per-service pricing — for your extension and fill services.
          </p>
        </div>

        <VocabLibrary />

        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Services</h2>
          {services.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : (services.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No services have nail configuration yet. Nail-salon accounts get this set up automatically for
                acrylic, hard-gel, dip-with-tips and Gel-X full sets &amp; fills.
              </CardContent>
            </Card>
          ) : (
            (services.data ?? []).map((s) => (
              <Card key={s.serviceId}>
                <button
                  className="w-full text-left"
                  onClick={() => setEditingId(editingId === s.serviceId ? null : s.serviceId)}
                >
                  <CardHeader className="flex-row items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        {s.name}
                        <span className="text-sm font-normal text-muted-foreground">{money(s.price)}</span>
                        {!s.isEnabled && <Badge variant="outline" className="text-[10px]">off</Badge>}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.enabledSizes} lengths · {s.enabledShapes} shapes · {s.enabledApplications} art applications ·{" "}
                        {s.enabledEffects} effects
                      </p>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${
                        editingId === s.serviceId ? "rotate-180" : ""
                      }`}
                    />
                  </CardHeader>
                </button>
                {editingId === s.serviceId && (
                  <CardContent className="border-t pt-4">
                    <ServiceConfigEditor serviceId={s.serviceId} basePrice={s.price} />
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ── Effect / vocabulary library ────────────────────────────────────────────

const KIND_META: Record<NailVocabKind, { label: string; field: "sizes" | "shapes" | "applications" | "effects" }> = {
  size: { label: "Lengths", field: "sizes" },
  shape: { label: "Shapes", field: "shapes" },
  application: { label: "Art applications", field: "applications" },
  effect: { label: "Effect library", field: "effects" },
};

function VocabLibrary() {
  const vocab = useNailVocab();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button className="w-full text-left" onClick={() => setOpen((o) => !o)}>
        <CardHeader className="flex-row items-center justify-between py-3">
          <CardTitle className="text-base">Vocabulary &amp; effect library</CardTitle>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </CardHeader>
      </button>
      {open && (
        <CardContent className="border-t pt-4 space-y-5">
          {(["size", "shape", "application", "effect"] as NailVocabKind[]).map((kind) => (
            <VocabGroup key={kind} kind={kind} rows={(vocab.data?.[KIND_META[kind].field] ?? []) as NailVocabRow[]} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function VocabGroup({ kind, rows }: { kind: NailVocabKind; rows: NailVocabRow[] }) {
  const { create, update, remove } = useNailVocabMutations();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  // Length / shape / effect cards show a photo on the check-in kiosk.
  const showImageUpload = kind === "size" || kind === "shape" || kind === "effect";

  const uploadImage = async (id: number, file: File) => {
    setUploadingId(id);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const r = await fetch(`/api/nail-vocab/${kind}/${id}/image`, { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "Upload failed");
      await qc.invalidateQueries({ queryKey: ["/api/nail-vocab"] });
      await qc.invalidateQueries({ queryKey: ["/api/nail-services"] });
    } catch (e: any) {
      toast({ title: "Image upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{KIND_META[kind].label}</h3>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <span
            key={r.id}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
              r.isActive ? "bg-background" : "opacity-40 line-through"
            }`}
          >
            {editId === r.id ? (
              <>
                <Input
                  className="h-6 w-28 text-xs"
                  value={editName}
                  autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editName.trim())
                      update.mutate(
                        { kind, id: r.id, name: editName.trim() },
                        { onSuccess: () => setEditId(null) },
                      );
                    if (e.key === "Escape") setEditId(null);
                  }}
                />
                <button
                  className="text-teal-600"
                  onClick={() =>
                    editName.trim() &&
                    update.mutate({ kind, id: r.id, name: editName.trim() }, { onSuccess: () => setEditId(null) })
                  }
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button className="text-slate-400" onClick={() => setEditId(null)}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                {showImageUpload && (
                  <label
                    className="cursor-pointer shrink-0 inline-flex"
                    title={r.imageUrl ? "Replace photo" : "Add a photo for the kiosk"}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) uploadImage(r.id, f);
                      }}
                    />
                    {uploadingId === r.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    ) : r.imageUrl ? (
                      <img src={r.imageUrl} alt="" className="w-5 h-5 rounded object-cover border" />
                    ) : (
                      <ImagePlus className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700" />
                    )}
                  </label>
                )}
                <span className="font-medium">{r.name}</span>
                {r.isQuote && <Badge variant="secondary" className="text-[9px] px-1 py-0">quote</Badge>}
                <button
                  className="text-slate-400 hover:text-slate-700"
                  title="Rename"
                  onClick={() => {
                    setEditId(r.id);
                    setEditName(r.name);
                  }}
                >
                  <Pencil className="w-3 h-3" />
                </button>
                {r.isActive && (
                  <button
                    className="text-slate-400 hover:text-amber-600"
                    title="Deactivate"
                    onClick={() =>
                      remove.mutate(
                        { kind, id: r.id },
                        { onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }) },
                      )
                    }
                  >
                    <PowerOff className="w-3 h-3" />
                  </button>
                )}
                {!r.isActive && (
                  <button className="text-teal-600 hover:text-teal-800" title="Reactivate" onClick={() => update.mutate({ kind, id: r.id, isActive: true })}>
                    <Check className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
          </span>
        ))}
        {adding && (
          <span className="inline-flex items-center gap-1 rounded-md border border-teal-300 bg-teal-50/50 px-2 py-1">
            <Input
              className="h-6 w-32 text-xs"
              placeholder={kind === "effect" ? "Chrome" : kind === "size" ? "XXXL" : "New"}
              value={newName}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim())
                  create.mutate(
                    { kind, name: newName.trim(), sortOrder: rows.length },
                    { onSuccess: () => { setNewName(""); setAdding(false); } },
                  );
                if (e.key === "Escape") { setNewName(""); setAdding(false); }
              }}
            />
            <button
              className="text-teal-600"
              onClick={() =>
                newName.trim() &&
                create.mutate(
                  { kind, name: newName.trim(), sortOrder: rows.length },
                  { onSuccess: () => { setNewName(""); setAdding(false); } },
                )
              }
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button className="text-slate-400" onClick={() => { setNewName(""); setAdding(false); }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Per-service matrix editor ──────────────────────────────────────────────

type Row = { vocabId: number; name: string; enabled: boolean; price: string; isDefault: boolean; isQuote?: boolean };

function buildRows(
  vocab: NailVocabRow[],
  junctions: { name: string; priceAdjustment: string; isEnabled: boolean; isDefault?: boolean; isQuote?: boolean;
    nailSizeId?: number; nailShapeId?: number; nailArtApplicationId?: number; nailArtEffectId?: number }[],
  fk: "nailSizeId" | "nailShapeId" | "nailArtApplicationId" | "nailArtEffectId",
): Row[] {
  const byId = new Map<number, (typeof junctions)[number]>();
  for (const j of junctions) byId.set((j as any)[fk], j);
  return vocab
    .filter((v) => v.isActive || byId.has(v.id))
    .map((v) => {
      const j = byId.get(v.id);
      return {
        vocabId: v.id,
        name: v.name,
        enabled: j ? j.isEnabled : false,
        price: j ? String(j.priceAdjustment) : "0.00",
        isDefault: j?.isDefault ?? false,
        isQuote: v.isQuote,
      };
    });
}

function toInput(rows: Row[], withDefault: boolean): JunctionInput[] {
  return rows
    .filter((r) => r.enabled)
    .map((r, i) => ({
      vocabId: r.vocabId,
      priceAdjustment: r.price === "" ? "0" : r.price,
      isEnabled: true,
      ...(withDefault ? { isDefault: r.isDefault } : {}),
      sortOrder: i,
    })) as JunctionInput[];
}

type EditorState = { sizes: Row[]; shapes: Row[]; applications: Row[]; effects: Row[]; artRequired: boolean };
type DimKey = "sizes" | "shapes" | "applications" | "effects";

function ServiceConfigEditor({ serviceId, basePrice }: { serviceId: number; basePrice: string }) {
  const cfg = useServiceNailConfig(serviceId);
  const vocab = useNailVocab();
  const save = useSaveServiceNailConfig();
  const { toast } = useToast();

  const initial = useMemo<EditorState | null>(() => {
    if (!cfg.data || !vocab.data) return null;
    return {
      sizes: buildRows(vocab.data.sizes, cfg.data.sizes as any, "nailSizeId"),
      shapes: buildRows(vocab.data.shapes, cfg.data.shapes as any, "nailShapeId"),
      applications: buildRows(vocab.data.applications, cfg.data.applications as any, "nailArtApplicationId"),
      effects: buildRows(vocab.data.effects, cfg.data.effects as any, "nailArtEffectId"),
      artRequired: cfg.data.config.artRequired,
    };
  }, [cfg.data, vocab.data]);

  const [state, setState] = useState<EditorState | null>(null);
  useEffect(() => {
    if (initial) setState(initial);
  }, [initial]);

  if (cfg.isLoading || vocab.isLoading || !state) {
    return <p className="text-sm text-muted-foreground py-4">Loading configuration…</p>;
  }
  if (!cfg.data) {
    return <p className="text-sm text-muted-foreground py-4">This service has no nail configuration.</p>;
  }

  const patch = (key: DimKey, idx: number, upd: Partial<Row>) =>
    setState((s) => {
      if (!s) return s;
      let rows = s[key].map((r, i) => (i === idx ? { ...r, ...upd } : r));
      if (upd.isDefault && (key === "sizes" || key === "shapes")) {
        rows = rows.map((r, i) => ({ ...r, isDefault: i === idx }));
      }
      return { ...s, [key]: rows };
    });

  const preview = (() => {
    const pick = (rows: Row[]) => rows.find((r) => r.enabled && r.isDefault) ?? rows.find((r) => r.enabled);
    const size = pick(state.sizes);
    const shape = pick(state.shapes);
    const app = state.applications.find((r) => r.enabled && !r.isQuote);
    const eff = state.effects.find((r) => r.enabled);
    const parts = [Number(basePrice)];
    if (size) parts.push(Number(size.price));
    if (shape) parts.push(Number(shape.price));
    if (app) parts.push(Number(app.price));
    if (eff) parts.push(Number(eff.price));
    const total = parts.reduce((a, b) => a + b, 0);
    return { size, shape, app, eff, total };
  })();

  const onSave = () =>
    save.mutate(
      {
        serviceId,
        artRequired: state.artRequired,
        sizes: toInput(state.sizes, true),
        shapes: toInput(state.shapes, true),
        applications: toInput(state.applications, false),
        effects: toInput(state.effects, false),
      },
      {
        onSuccess: () => toast({ title: "Nail configuration saved" }),
        onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
      },
    );

  return (
    <div className="space-y-5">
      <DimensionGrid title="Length" rows={state.sizes} onChange={(i, u) => patch("sizes", i, u)} showDefault />
      <DimensionGrid title="Shape" rows={state.shapes} onChange={(i, u) => patch("shapes", i, u)} showDefault />
      <DimensionGrid
        title="Art — application"
        rows={state.applications}
        onChange={(i, u) => patch("applications", i, u)}
      />
      <DimensionGrid title="Art — effects" rows={state.effects} onChange={(i, u) => patch("effects", i, u)} compact />

      <div className="rounded-lg bg-muted/50 border p-3 text-sm">
        <span className="text-muted-foreground">Sample: </span>
        {money(basePrice)}
        {preview.size && <> + {preview.size.name} {signed(preview.size.price)}</>}
        {preview.shape && <> + {preview.shape.name} {signed(preview.shape.price)}</>}
        {preview.app && <> + {preview.app.name} {signed(preview.app.price)}</>}
        {preview.eff && <> + {preview.eff.name} {signed(preview.eff.price)}</>}
        {" = "}
        <strong>{money(preview.total)}</strong>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={state.artRequired} onCheckedChange={(v) => setState((s) => (s ? { ...s, artRequired: v } : s))} />
          Art selection required
        </label>
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function DimensionGrid({
  title,
  rows,
  onChange,
  showDefault,
  compact,
}: {
  title: string;
  rows: Row[];
  onChange: (idx: number, upd: Partial<Row>) => void;
  showDefault?: boolean;
  compact?: boolean;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</h4>
      <div className={`grid gap-2 ${compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
        {rows.map((r, i) => (
          <div
            key={r.vocabId}
            className={`rounded-lg border p-2 text-xs transition-colors ${
              r.enabled ? "bg-background" : "bg-muted/40 opacity-60"
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-medium truncate" title={r.name}>{r.name}</span>
              <Switch checked={r.enabled} onCheckedChange={(v) => onChange(i, { enabled: v })} />
            </div>
            {r.isQuote ? (
              <p className="text-muted-foreground mt-1">priced at booking</p>
            ) : (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-muted-foreground">+$</span>
                <Input
                  className="h-6 text-xs px-1"
                  type="number"
                  step="0.01"
                  value={r.price}
                  disabled={!r.enabled}
                  onChange={(e) => onChange(i, { price: e.target.value })}
                />
              </div>
            )}
            {showDefault && (
              <label className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground">
                <input
                  type="radio"
                  checked={r.isDefault}
                  disabled={!r.enabled}
                  onChange={() => onChange(i, { isDefault: true })}
                />
                default
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
