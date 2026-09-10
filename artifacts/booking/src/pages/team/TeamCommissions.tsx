import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

interface StaffRow {
  id: number;
  name: string;
  role: string | null;
  employmentType: string | null;
  status: string | null;
  commissionEnabled: boolean | null;
  commissionRate: string | null;
  productCommissionRate: string | null;
}

type Tab = "services" | "products";

export default function TeamCommissions() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { selectedStore } = useSelectedStore();
  const [tab, setTab] = useState<Tab>("services");

  const { data: staff = [], isLoading } = useQuery<StaffRow[]>({
    queryKey: ["/api/staff", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch("/api/staff", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load staff");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const people = useMemo(
    () => staff.filter((s) => (s.status ?? "active") !== "removed" && (s.status ?? "active") !== "deactivated"),
    [staff],
  );

  // local edit buffer keyed by staffId
  const [draft, setDraft] = useState<Record<number, { service: string; product: string }>>({});
  useEffect(() => {
    const next: Record<number, { service: string; product: string }> = {};
    for (const s of people) {
      next[s.id] = {
        service: s.commissionRate ?? "0",
        product: s.productCommissionRate ?? "0",
      };
    }
    setDraft(next);
  }, [people]);

  const save = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/staff/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/staff", selectedStore?.id] }),
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  const field = tab === "services" ? "service" : "product";
  const dirtyIds = people
    .filter((s) => {
      const d = draft[s.id];
      if (!d) return false;
      const saved = tab === "services" ? (s.commissionRate ?? "0") : (s.productCommissionRate ?? "0");
      return Number(d[field]) !== Number(saved);
    })
    .map((s) => s.id);

  const saveAll = async () => {
    for (const id of dirtyIds) {
      const d = draft[id];
      const body =
        tab === "services"
          ? { commissionRate: clampPct(d.service), commissionEnabled: Number(d.service) > 0 || undefined }
          : { productCommissionRate: clampPct(d.product) };
      await save.mutateAsync({ id, body });
    }
    toast({ title: "Commission rates saved" });
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Commissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The percentage each team member earns on the sales they ring up.
          </p>
        </header>

        <div className="mb-4 flex gap-1 border-b border-border">
          {(["services", "products"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-[15px] font-medium capitalize transition-colors",
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : people.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Add team members first — then set their commission rates here.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Team member</span>
              <span>{tab === "services" ? "Service" : "Product"} commission</span>
            </div>
            {people.map((s) => {
              const d = draft[s.id] ?? { service: "0", product: "0" };
              return (
                <div key={s.id} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {s.role || s.employmentType || "staff"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      value={d[field]}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [s.id]: { ...prev[s.id], [field]: e.target.value } }))
                      }
                      className="w-20 text-right text-[15px]"
                      data-testid={`commission-${tab}-${s.id}`}
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-3">
          {dirtyIds.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {dirtyIds.length} unsaved
            </span>
          )}
          <Button onClick={saveAll} disabled={dirtyIds.length === 0 || save.isPending} data-testid="save-commissions">
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

function clampPct(v: string): string {
  const n = Math.max(0, Math.min(100, Number(v) || 0));
  return n.toFixed(2);
}
