import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Pencil, MoreHorizontal, Trash2, Package as PackageIcon, Loader2 } from "lucide-react";
import { usePackages, useDeletePackage } from "@/hooks/use-packages";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { confirm } from "@/lib/confirm";
import { PackageForm } from "./PackageForm";
import type { PackageWithItems } from "@shared/schema";

function fmtDuration(mins: number) {
  if (!mins) return "0m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
const fmtPrice = (p: number | string) => `$${Number(p).toFixed(2)}`;

export function PackagesList() {
  const { data: pkgs, isLoading } = usePackages();
  const { mutate: deletePackage } = useDeletePackage();
  const { pick } = useLanguage();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const t = {
    newPackage:  pick({ en: "New Package",   vi: "Gói mới",           es: "Nuevo paquete",     fr: "Nouveau forfait" }),
    empty:       pick({ en: "No packages yet — bundle services and add-ons into one priced item.", vi: "Chưa có gói nào — gộp dịch vụ và bổ sung thành một mục có giá.", es: "Aún no hay paquetes — agrupa servicios y complementos en un artículo con precio.", fr: "Aucun forfait — regroupez services et suppléments en un article tarifé." }),
    services:    pick({ en: "services",      vi: "dịch vụ",           es: "servicios",         fr: "services" }),
    addons:      pick({ en: "add-ons",       vi: "bổ sung",           es: "complementos",      fr: "suppléments" }),
    edit:        pick({ en: "Edit",          vi: "Sửa",               es: "Editar",            fr: "Modifier" }),
    del:         pick({ en: "Delete",        vi: "Xóa",               es: "Eliminar",          fr: "Supprimer" }),
    delConfirm:  pick({ en: "Delete this package? Bookings already made keep their recorded price.", vi: "Xóa gói này? Các lịch đã đặt vẫn giữ giá đã ghi.", es: "¿Eliminar este paquete? Las reservas ya hechas conservan su precio registrado.", fr: "Supprimer ce forfait ? Les réservations déjà faites conservent leur prix enregistré." }),
    fixed:       pick({ en: "Fixed price",   vi: "Giá cố định",       es: "Precio fijo",       fr: "Prix fixe" }),
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  const list = (pkgs ?? []) as PackageWithItems[];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditId(null); setFormOpen(true); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> {t.newPackage}
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="border rounded-xl py-16 flex flex-col items-center gap-3 text-center text-muted-foreground">
          <PackageIcon className="w-8 h-8 text-slate-300" />
          <p className="max-w-sm text-sm">{t.empty}</p>
        </div>
      ) : (
        <div className="border rounded-xl divide-y">
          {list.map((p) => {
            const nServices = p.items.filter((i) => i.itemType === "service").length;
            const nAddons = p.items.filter((i) => i.itemType === "addon").length;
            const hasFixed = p.pricingMode === "fixed";
            return (
              <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-12 h-12 rounded-lg border bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                    : <PackageIcon className="w-5 h-5 text-slate-400" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {nServices} {t.services}{nAddons ? ` · ${nAddons} ${t.addons}` : ""} · {fmtDuration(p.duration)}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="font-semibold tabular-nums">{fmtPrice(p.price)}</div>
                  {hasFixed && p.listPrice !== p.price && (
                    <div className="text-xs text-muted-foreground line-through tabular-nums">{fmtPrice(p.listPrice)}</div>
                  )}
                </div>

                {hasFixed && <Badge variant="secondary" className="flex-shrink-0">{t.fixed}</Badge>}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="flex-shrink-0"><MoreHorizontal className="w-4 h-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditId(p.id); setFormOpen(true); }}>
                      <Pencil className="w-4 h-4 mr-2" /> {t.edit}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={async () => {
                        if (await confirm(t.delConfirm)) {
                          deletePackage(p.id, { onError: () => toast({ title: "Failed to delete", variant: "destructive" }) });
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> {t.del}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      <PackageForm
        open={formOpen}
        onOpenChange={setFormOpen}
        packageId={editId}
      />
    </div>
  );
}
