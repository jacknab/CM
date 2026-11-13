import { EMPTY_ARRAY } from "@/lib/empty";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Pencil, MoreHorizontal, Trash2, Copy, Layers, Loader2, Search } from "lucide-react";
import { useAddons } from "@/hooks/use-addons";
import {
  useAddonGroups, useCreateAddonGroup, useUpdateAddonGroup, useDeleteAddonGroup, useDuplicateAddonGroup, type AddonGroup,
} from "@/hooks/use-addon-groups";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { confirm } from "@/lib/confirm";

function fmtDuration(mins: number) {
  if (!mins) return "0m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
const money = (n: number) => `$${n.toFixed(2)}`;

/** Catalog › Add-on Groups: reusable lists of existing add-ons that services can be given (routes/addonGroups.ts). */
export function AddonGroupsList() {
  const { data: groups, isLoading } = useAddonGroups();
  const { data: allStoreAddons = EMPTY_ARRAY } = useAddons();
  const addons = useMemo(() => allStoreAddons.filter((a: any) => !a.kioskExtra), [allStoreAddons]);
  const { mutate: deleteGroup } = useDeleteAddonGroup();
  const { pick } = useLanguage();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [duplicating, setDuplicating] = useState<AddonGroup | null>(null);

  const t = {
    newGroup:   pick({ en: "New Group",    vi: "Nhóm mới",        es: "Nuevo grupo",     fr: "Nouveau groupe" }),
    empty:      pick({ en: "No add-on groups yet — put add-ons several services share in one group, then give the group to those services.", vi: "Chưa có nhóm nào — gom các dịch vụ thêm mà nhiều dịch vụ dùng chung vào một nhóm, rồi gán nhóm cho các dịch vụ đó.", es: "Aún no hay grupos — reúne los complementos que comparten varios servicios en un grupo y asígnalo a esos servicios.", fr: "Aucun groupe — réunissez les suppléments communs à plusieurs services dans un groupe, puis attribuez-le à ces services." }),
    addons:     pick({ en: "add-ons",      vi: "dịch vụ thêm",    es: "complementos",    fr: "suppléments" }),
    services:   pick({ en: "services",     vi: "dịch vụ",         es: "servicios",       fr: "services" }),
    noServices: pick({ en: "not used by any service", vi: "chưa gán cho dịch vụ nào", es: "sin servicios asignados", fr: "attribué à aucun service" }),
    edit:       pick({ en: "Edit",         vi: "Sửa",             es: "Editar",          fr: "Modifier" }),
    duplicate:  pick({ en: "Duplicate",    vi: "Nhân bản",        es: "Duplicar",        fr: "Dupliquer" }),
    del:        pick({ en: "Delete",       vi: "Xóa",             es: "Eliminar",        fr: "Supprimer" }),
    delConfirm: pick({ en: "Delete this group? Services that use it lose its add-ons. Add-ons you linked to a service by hand stay.", vi: "Xóa nhóm này? Các dịch vụ dùng nhóm sẽ mất các dịch vụ thêm của nhóm. Dịch vụ thêm bạn tự gán cho dịch vụ vẫn giữ nguyên.", es: "¿Eliminar este grupo? Los servicios que lo usan pierden sus complementos. Los complementos que vinculaste a mano se quedan.", fr: "Supprimer ce groupe ? Les services qui l'utilisent perdent ses suppléments. Les suppléments liés à la main restent." }),
    deleted:    pick({ en: "Group deleted", vi: "Đã xóa nhóm",    es: "Grupo eliminado", fr: "Groupe supprimé" }),
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  const list = groups ?? [];
  const addonName = new Map(addons.map((a: any) => [a.id, a.name as string]));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditId(null); setFormOpen(true); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> {t.newGroup}
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="border rounded-xl py-16 flex flex-col items-center gap-3 text-center text-muted-foreground">
          <Layers className="w-8 h-8 text-slate-300" />
          <p className="max-w-sm text-sm">{t.empty}</p>
        </div>
      ) : (
        <div className="border rounded-xl divide-y">
          {list.map((g) => {
            const names = g.addonIds.map((id) => addonName.get(id)).filter(Boolean);
            return (
              <div key={g.id} className="flex items-center gap-4 px-4 py-3" data-testid={`addon-group-${g.id}`}>
                <div className="w-12 h-12 rounded-lg border bg-slate-50 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-5 h-5 text-slate-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{g.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.addonIds.length} {t.addons} · {g.serviceIds.length ? `${g.serviceIds.length} ${t.services}` : t.noServices}
                  </div>
                  {names.length > 0 && <div className="text-xs text-muted-foreground truncate mt-0.5">{names.join(", ")}</div>}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="flex-shrink-0" data-testid={`addon-group-menu-${g.id}`}><MoreHorizontal className="w-4 h-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditId(g.id); setFormOpen(true); }}>
                      <Pencil className="w-4 h-4 mr-2" /> {t.edit}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDuplicating(g)}>
                      <Copy className="w-4 h-4 mr-2" /> {t.duplicate}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={async () => {
                        if (await confirm(t.delConfirm)) {
                          deleteGroup(g.id, {
                            onSuccess: () => toast({ title: t.deleted }),
                            onError: (e) => toast({ title: e.message || "Failed to delete", variant: "destructive" }),
                          });
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

      <AddonGroupForm open={formOpen} onOpenChange={setFormOpen} group={list.find((g) => g.id === editId) ?? null} />
      <DuplicateGroupDialog group={duplicating} onClose={() => setDuplicating(null)} />
    </div>
  );
}

function AddonGroupForm({ open, onOpenChange, group }: { open: boolean; onOpenChange: (v: boolean) => void; group: AddonGroup | null }) {
  const { pick } = useLanguage();
  const { toast } = useToast();
  const { data: allStoreAddons = EMPTY_ARRAY } = useAddons();
  const addons = useMemo(() => allStoreAddons.filter((a: any) => !a.kioskExtra), [allStoreAddons]);
  const { mutate: createGroup, isPending: creating } = useCreateAddonGroup();
  const { mutate: updateGroup, isPending: updating } = useUpdateAddonGroup();

  const [name, setName] = useState("");
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? "");
    setAddonIds(group?.addonIds ?? []);
    setSearch(""); setErr(null);
  }, [open, group?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = {
    createTitle: pick({ en: "New Add-on Group",  vi: "Nhóm dịch vụ thêm mới", es: "Nuevo grupo de complementos", fr: "Nouveau groupe de suppléments" }),
    editTitle:   pick({ en: "Edit Add-on Group", vi: "Sửa nhóm dịch vụ thêm", es: "Editar grupo de complementos", fr: "Modifier le groupe de suppléments" }),
    desc:        pick({ en: "Pick existing add-ons. Price and time stay on each add-on; give the group to services from the service's edit screen.", vi: "Chọn các dịch vụ thêm sẵn có. Giá và thời gian vẫn theo từng dịch vụ thêm; gán nhóm cho dịch vụ trong màn hình sửa dịch vụ.", es: "Elige complementos existentes. El precio y el tiempo siguen en cada complemento; asigna el grupo desde la edición del servicio.", fr: "Choisissez des suppléments existants. Le prix et la durée restent sur chaque supplément ; attribuez le groupe depuis la fiche du service." }),
    nameLabel:   pick({ en: "Group name",     vi: "Tên nhóm",           es: "Nombre del grupo",  fr: "Nom du groupe" }),
    addonsLabel: pick({ en: "Add-ons",        vi: "Dịch vụ thêm",       es: "Complementos",      fr: "Suppléments" }),
    search:      pick({ en: "Search add-ons…", vi: "Tìm dịch vụ thêm…", es: "Buscar complementos…", fr: "Rechercher des suppléments…" }),
    selected:    pick({ en: "selected",       vi: "đã chọn",            es: "seleccionados",     fr: "sélectionnés" }),
    inactive:    pick({ en: "inactive",       vi: "đã tắt",             es: "inactivo",          fr: "inactif" }),
    save:        pick({ en: "Save",           vi: "Lưu",                es: "Guardar",           fr: "Enregistrer" }),
    cancel:      pick({ en: "Cancel",         vi: "Hủy",                es: "Cancelar",          fr: "Annuler" }),
    needName:    pick({ en: "Give the group a name.", vi: "Đặt tên cho nhóm.", es: "Ponle un nombre al grupo.", fr: "Donnez un nom au groupe." }),
    saved:       pick({ en: "Group saved",    vi: "Đã lưu nhóm",        es: "Grupo guardado",    fr: "Groupe enregistré" }),
  };

  // Active add-ons, plus any inactive one already in the group (so saving doesn't drop it unseen).
  const choices = useMemo(
    () => addons.filter((a: any) => a.isActive !== false || addonIds.includes(a.id))
      .filter((a: any) => (a.name || "").toLowerCase().includes(search.toLowerCase())),
    [addons, addonIds, search],
  );
  const toggle = (id: number) => setAddonIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);

  const submit = () => {
    if (!name.trim()) { setErr(t.needName); return; }
    setErr(null);
    const opts = {
      onSuccess: () => { toast({ title: t.saved }); onOpenChange(false); },
      onError: (e: Error) => setErr(e.message || "Failed to save group"),
    };
    if (group) updateGroup({ id: group.id, name: name.trim(), addonIds }, opts);
    else createGroup({ name: name.trim(), addonIds }, opts);
  };
  const busy = creating || updating;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{group ? t.editTitle : t.createTitle}</SheetTitle>
          <SheetDescription>{t.desc}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          <div>
            <Label htmlFor="addon-group-name">{t.nameLabel}</Label>
            <Input id="addon-group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gel Extras" maxLength={80} />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <Label>{t.addonsLabel}</Label>
              <span className="text-xs text-muted-foreground">{addonIds.length} {t.selected}</span>
            </div>
            <div className="relative mt-1">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} />
            </div>
            <div className="mt-2 max-h-80 overflow-y-auto border rounded-lg divide-y">
              {choices.map((a: any) => (
                <label key={a.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={addonIds.includes(a.id)} onCheckedChange={() => toggle(a.id)} />
                  <span className="flex-1 text-sm truncate">
                    {a.name}{a.isActive === false && <span className="text-muted-foreground"> ({t.inactive})</span>}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtDuration(Number(a.duration) || 0)} · {money(Number(a.price) || 0)}</span>
                </label>
              ))}
              {choices.length === 0 && <div className="px-3 py-4 text-sm text-muted-foreground text-center">—</div>}
            </div>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t.cancel}</Button>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} {t.save}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function DuplicateGroupDialog({ group, onClose }: { group: AddonGroup | null; onClose: () => void }) {
  const { pick } = useLanguage();
  const { toast } = useToast();
  const { mutate: duplicate, isPending } = useDuplicateAddonGroup();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const t = {
    question:  pick({ en: "What would you like to name this duplicate group?", vi: "Bạn muốn đặt tên nhóm bản sao này là gì?", es: "¿Qué nombre quieres darle a este grupo duplicado?", fr: "Quel nom voulez-vous donner à ce groupe dupliqué ?" }),
    copy:      pick({ en: "Copy",      vi: "Bản sao",   es: "Copia",    fr: "Copie" }),
    cancel:    pick({ en: "Cancel",    vi: "Hủy",       es: "Cancelar", fr: "Annuler" }),
    duplicate: pick({ en: "Duplicate", vi: "Nhân bản",  es: "Duplicar", fr: "Dupliquer" }),
    needName:  pick({ en: "Give the group a name.", vi: "Đặt tên cho nhóm.", es: "Ponle un nombre al grupo.", fr: "Donnez un nom au groupe." }),
    done:      pick({ en: "Group duplicated", vi: "Đã nhân bản nhóm", es: "Grupo duplicado", fr: "Groupe dupliqué" }),
  };

  useEffect(() => {
    if (group) { setName(`${group.name} ${t.copy}`); setErr(null); }
  }, [group?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!group) return;
    if (!name.trim()) { setErr(t.needName); return; }
    duplicate({ id: group.id, name: name.trim() }, {
      onSuccess: () => { toast({ title: t.done }); onClose(); },
      onError: (e) => setErr(e.message || "Failed to duplicate group"),
    });
  };

  return (
    <Dialog open={!!group} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.question}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            maxLength={80}
            autoFocus
            data-testid="input-duplicate-group-name"
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>{t.cancel}</Button>
          <Button onClick={submit} disabled={isPending} className="gap-1.5">
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />} {t.duplicate}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
