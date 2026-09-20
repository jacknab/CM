import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Pencil, MoreHorizontal, Pause, Play, Archive, Tag, Loader2 } from "lucide-react";
import { useDeals, useUpdateDeal } from "@/hooks/use-deals";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { DealForm } from "./DealForm";
import type { DealWithDetails } from "@shared/schema";

const money = (n: number | string) => `$${Number(n).toFixed(2)}`;

const availabilityStyle: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  "sold-out": "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-slate-100 text-slate-500 border-slate-200",
  paused: "bg-slate-100 text-slate-500 border-slate-200",
  archived: "bg-slate-100 text-slate-400 border-slate-200",
};

export function DealsList() {
  const { data: deals, isLoading } = useDeals();
  const { mutate: updateDeal } = useUpdateDeal();
  const { pick } = useLanguage();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DealWithDetails | null>(null);

  const t = {
    newDeal: pick({ en: "New Deal", vi: "Ưu đãi mới", es: "Nueva oferta", fr: "Nouvelle offre" }),
    empty: pick({ en: "No deals yet — turn a package into a limited-time offer for the marketplace.", vi: "Chưa có ưu đãi nào — biến một gói thành ưu đãi có thời hạn trên chợ ứng dụng.", es: "Aún no hay ofertas: convierte un paquete en una oferta por tiempo limitado para el mercado.", fr: "Aucune offre pour l'instant — transformez un forfait en offre à durée limitée pour la marketplace." }),
    sold: pick({ en: "sold", vi: "đã bán", es: "vendidos", fr: "vendus" }),
    of: pick({ en: "of", vi: "trên", es: "de", fr: "sur" }),
    edit: pick({ en: "Edit", vi: "Sửa", es: "Editar", fr: "Modifier" }),
    pause: pick({ en: "Pause", vi: "Tạm dừng", es: "Pausar", fr: "Suspendre" }),
    resume: pick({ en: "Resume", vi: "Tiếp tục", es: "Reanudar", fr: "Reprendre" }),
    archive: pick({ en: "Archive", vi: "Lưu trữ", es: "Archivar", fr: "Archiver" }),
    availability: {
      active: pick({ en: "Active", vi: "Đang hoạt động", es: "Activa", fr: "Active" }),
      scheduled: pick({ en: "Scheduled", vi: "Đã lên lịch", es: "Programada", fr: "Programmée" }),
      "sold-out": pick({ en: "Sold out", vi: "Đã bán hết", es: "Agotada", fr: "Épuisée" }),
      expired: pick({ en: "Expired", vi: "Đã hết hạn", es: "Expirada", fr: "Expirée" }),
      paused: pick({ en: "Paused", vi: "Tạm dừng", es: "Pausada", fr: "Suspendue" }),
      archived: pick({ en: "Archived", vi: "Đã lưu trữ", es: "Archivada", fr: "Archivée" }),
    } as Record<string, string>,
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  const list = (deals ?? []) as DealWithDetails[];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> {t.newDeal}
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="border rounded-xl py-16 flex flex-col items-center gap-3 text-center text-muted-foreground">
          <Tag className="w-8 h-8 text-slate-300" />
          <p className="max-w-sm text-sm">{t.empty}</p>
        </div>
      ) : (
        <div className="border rounded-xl divide-y">
          {list.map((d) => {
            const pct = Math.min(100, Math.round((d.purchasedCount / Math.max(1, d.capacity)) * 100));
            return (
              <div key={d.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-12 h-12 rounded-lg border bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {(d.heroImage || d.package.imageUrl)
                    ? <img src={d.heroImage || d.package.imageUrl!} alt={d.title} className="w-full h-full object-cover" />
                    : <Tag className="w-5 h-5 text-slate-400" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{d.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.purchasedCount} {t.sold} {t.of} {d.capacity}
                  </div>
                  <div className="mt-1.5 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="font-semibold tabular-nums">{money(d.dealPrice)}</div>
                  <div className="text-xs text-muted-foreground line-through tabular-nums">{money(d.listPrice)}</div>
                </div>

                <Badge variant="outline" className={`flex-shrink-0 ${availabilityStyle[d.availability] ?? ""}`}>
                  {t.availability[d.availability] ?? d.availability}
                </Badge>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="flex-shrink-0"><MoreHorizontal className="w-4 h-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditing(d); setFormOpen(true); }}>
                      <Pencil className="w-4 h-4 mr-2" /> {t.edit}
                    </DropdownMenuItem>
                    {d.status === "active" ? (
                      <DropdownMenuItem onClick={() => updateDeal({ id: d.id, status: "paused" }, { onError: () => toast({ title: "Failed to pause deal", variant: "destructive" }) })}>
                        <Pause className="w-4 h-4 mr-2" /> {t.pause}
                      </DropdownMenuItem>
                    ) : d.status === "paused" ? (
                      <DropdownMenuItem onClick={() => updateDeal({ id: d.id, status: "active" }, { onError: () => toast({ title: "Failed to resume deal", variant: "destructive" }) })}>
                        <Play className="w-4 h-4 mr-2" /> {t.resume}
                      </DropdownMenuItem>
                    ) : null}
                    {d.status !== "archived" && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => updateDeal({ id: d.id, status: "archived" }, { onError: () => toast({ title: "Failed to archive deal", variant: "destructive" }) })}
                      >
                        <Archive className="w-4 h-4 mr-2" /> {t.archive}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      <DealForm open={formOpen} onOpenChange={setFormOpen} deal={editing} />
    </div>
  );
}
