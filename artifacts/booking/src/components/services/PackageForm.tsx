import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ImagePlus, Loader2, Search } from "lucide-react";
import { useServices } from "@/hooks/use-services";
import { useAddons } from "@/hooks/use-addons";
import { usePackages, useCreatePackage, useUpdatePackage, type PackageItemInput } from "@/hooks/use-packages";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";

function fmtDuration(mins: number) {
  if (!mins) return "0m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
const money = (n: number) => `$${n.toFixed(2)}`;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  packageId: number | null;
}

export function PackageForm({ open, onOpenChange, packageId }: Props) {
  const { pick } = useLanguage();
  const { toast } = useToast();
  const { data: services = [] } = useServices();
  const { data: addons = [] } = useAddons();
  const { data: pkgs = [] } = usePackages();
  const { mutate: createPackage, isPending: creating } = useCreatePackage();
  const { mutate: updatePackage, isPending: updating } = useUpdatePackage();

  const editing = pkgs.find((p: any) => p.id === packageId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [fixedOn, setFixedOn] = useState(false);
  const [fixedPrice, setFixedPrice] = useState("");
  const [hiddenFromPublic, setHiddenFromPublic] = useState(false);
  const [svcSearch, setSvcSearch] = useState("");
  const [addonSearch, setAddonSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Seed / reset when the sheet opens
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name ?? "");
      setDescription(editing.description ?? "");
      setImageUrl(editing.imageUrl ?? null);
      setServiceIds(editing.items.filter((i: any) => i.itemType === "service").map((i: any) => i.serviceId));
      setAddonIds(editing.items.filter((i: any) => i.itemType === "addon").map((i: any) => i.addonId));
      setFixedOn(editing.pricingMode === "fixed");
      setFixedPrice(editing.fixedPrice != null ? String(editing.fixedPrice) : "");
      setHiddenFromPublic(!!editing.hiddenFromPublic);
    } else {
      setName(""); setDescription(""); setImageUrl(null);
      setServiceIds([]); setAddonIds([]); setFixedOn(false); setFixedPrice("");
      setHiddenFromPublic(false);
    }
    setErr(null); setSvcSearch(""); setAddonSearch("");
  }, [open, packageId]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = {
    createTitle: pick({ en: "New Package",  vi: "Gói mới",        es: "Nuevo paquete",  fr: "Nouveau forfait" }),
    editTitle:   pick({ en: "Edit Package", vi: "Sửa gói",        es: "Editar paquete", fr: "Modifier le forfait" }),
    desc:        pick({ en: "Bundle existing services and add-ons. Duration is always the sum; price is the sum unless you set a fixed price.", vi: "Gộp dịch vụ và bổ sung sẵn có. Thời lượng luôn là tổng; giá là tổng trừ khi bạn đặt giá cố định.", es: "Agrupa servicios y complementos existentes. La duración es siempre la suma; el precio es la suma salvo que fijes un precio.", fr: "Regroupez des services et suppléments existants. La durée est toujours la somme ; le prix est la somme sauf si vous fixez un prix." }),
    nameLabel:   pick({ en: "Package name", vi: "Tên gói",        es: "Nombre del paquete", fr: "Nom du forfait" }),
    descLabel:   pick({ en: "Description",  vi: "Mô tả",          es: "Descripción",    fr: "Description" }),
    image:       pick({ en: "Image",        vi: "Hình ảnh",       es: "Imagen",         fr: "Image" }),
    servicesLabel: pick({ en: "Services",   vi: "Dịch vụ",        es: "Servicios",      fr: "Services" }),
    addonsLabel: pick({ en: "Add-ons",      vi: "Bổ sung",        es: "Complementos",   fr: "Suppléments" }),
    searchSvc:   pick({ en: "Search services…", vi: "Tìm dịch vụ…", es: "Buscar servicios…", fr: "Rechercher des services…" }),
    searchAddon: pick({ en: "Search add-ons…",  vi: "Tìm bổ sung…", es: "Buscar complementos…", fr: "Rechercher des suppléments…" }),
    totalDuration: pick({ en: "Total duration", vi: "Tổng thời lượng", es: "Duración total", fr: "Durée totale" }),
    componentPrice: pick({ en: "Component price", vi: "Giá thành phần", es: "Precio de componentes", fr: "Prix des composants" }),
    fixedToggle: pick({ en: "Set a fixed package price", vi: "Đặt giá cố định cho gói", es: "Fijar un precio de paquete", fr: "Définir un prix de forfait fixe" }),
    fixedLabel:  pick({ en: "Fixed price",  vi: "Giá cố định",    es: "Precio fijo",    fr: "Prix fixe" }),
    hidden:      pick({ en: "Hide from online booking", vi: "Ẩn khỏi đặt lịch trực tuyến", es: "Ocultar de la reserva en línea", fr: "Masquer de la réservation en ligne" }),
    save:        pick({ en: "Save",         vi: "Lưu",            es: "Guardar",        fr: "Enregistrer" }),
    cancel:      pick({ en: "Cancel",       vi: "Hủy",            es: "Cancelar",       fr: "Annuler" }),
    needName:    pick({ en: "Give the package a name.", vi: "Đặt tên cho gói.", es: "Ponle un nombre al paquete.", fr: "Donnez un nom au forfait." }),
    needService: pick({ en: "Add at least one service.", vi: "Thêm ít nhất một dịch vụ.", es: "Añade al menos un servicio.", fr: "Ajoutez au moins un service." }),
    priceIs:     pick({ en: "Package price", vi: "Giá gói",       es: "Precio del paquete", fr: "Prix du forfait" }),
  };

  const selectedServices = useMemo(() => services.filter((s: any) => serviceIds.includes(s.id)), [services, serviceIds]);
  const selectedAddons = useMemo(() => addons.filter((a: any) => addonIds.includes(a.id)), [addons, addonIds]);

  const totalDuration = useMemo(
    () => selectedServices.reduce((n: number, s: any) => n + (Number(s.duration) || 0), 0)
        + selectedAddons.reduce((n: number, a: any) => n + (Number(a.duration) || 0), 0),
    [selectedServices, selectedAddons],
  );
  const componentPrice = useMemo(
    () => selectedServices.reduce((n: number, s: any) => n + (Number(s.price) || 0), 0)
        + selectedAddons.reduce((n: number, a: any) => n + (Number(a.price) || 0), 0),
    [selectedServices, selectedAddons],
  );
  const effectivePrice = fixedOn && fixedPrice !== "" ? Number(fixedPrice) || 0 : componentPrice;

  const filteredServices = services.filter((s: any) =>
    (s.name || "").toLowerCase().includes(svcSearch.toLowerCase()));
  const filteredAddons = addons.filter((a: any) =>
    (a.name || "").toLowerCase().includes(addonSearch.toLowerCase()));

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggle = (arr: number[], set: (v: number[]) => void, id: number) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const submit = () => {
    if (!name.trim()) { setErr(t.needName); return; }
    if (serviceIds.length === 0) { setErr(t.needService); return; }
    setErr(null);

    const items: PackageItemInput[] = [
      ...serviceIds.map((id) => ({ itemType: "service" as const, serviceId: id })),
      ...addonIds.map((id) => ({ itemType: "addon" as const, addonId: id })),
    ];
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      imageUrl: imageUrl ?? null,
      pricingMode: (fixedOn ? "fixed" : "sum") as "sum" | "fixed",
      fixedPrice: fixedOn && fixedPrice !== "" ? String(Number(fixedPrice).toFixed(2)) : null,
      hiddenFromPublic,
      items,
    };
    const opts = {
      onSuccess: () => { toast({ title: pick({ en: "Package saved", vi: "Đã lưu gói", es: "Paquete guardado", fr: "Forfait enregistré" }) }); onOpenChange(false); },
      onError: () => toast({ title: "Failed to save package", variant: "destructive" }),
    };
    if (editing) updatePackage({ id: editing.id, ...payload }, opts);
    else createPackage(payload, opts);
  };

  const busy = creating || updating;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? t.editTitle : t.createTitle}</SheetTitle>
          <SheetDescription>{t.desc}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Name + image */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-16 h-16 rounded-lg border bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0"
            >
              {imageUrl
                ? <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                : <ImagePlus className="w-5 h-5 text-slate-400" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
            <div className="flex-1">
              <Label htmlFor="pkg-name">{t.nameLabel}</Label>
              <Input id="pkg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mani + Pedi" />
            </div>
          </div>

          <div>
            <Label htmlFor="pkg-desc">{t.descLabel}</Label>
            <Textarea id="pkg-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {/* Services */}
          <div>
            <Label>{t.servicesLabel}</Label>
            <div className="relative mt-1">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input className="pl-8" value={svcSearch} onChange={(e) => setSvcSearch(e.target.value)} placeholder={t.searchSvc} />
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg divide-y">
              {filteredServices.map((s: any) => (
                <label key={s.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={serviceIds.includes(s.id)} onCheckedChange={() => toggle(serviceIds, setServiceIds, s.id)} />
                  <span className="flex-1 text-sm truncate">{s.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtDuration(Number(s.duration) || 0)} · {money(Number(s.price) || 0)}</span>
                </label>
              ))}
              {filteredServices.length === 0 && <div className="px-3 py-4 text-sm text-muted-foreground text-center">—</div>}
            </div>
          </div>

          {/* Add-ons */}
          <div>
            <Label>{t.addonsLabel}</Label>
            <div className="relative mt-1">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input className="pl-8" value={addonSearch} onChange={(e) => setAddonSearch(e.target.value)} placeholder={t.searchAddon} />
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg divide-y">
              {filteredAddons.map((a: any) => (
                <label key={a.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={addonIds.includes(a.id)} onCheckedChange={() => toggle(addonIds, setAddonIds, a.id)} />
                  <span className="flex-1 text-sm truncate">{a.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtDuration(Number(a.duration) || 0)} · {money(Number(a.price) || 0)}</span>
                </label>
              ))}
              {filteredAddons.length === 0 && <div className="px-3 py-4 text-sm text-muted-foreground text-center">—</div>}
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-slate-50 border p-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t.totalDuration}</span><span className="font-medium tabular-nums">{fmtDuration(totalDuration)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t.componentPrice}</span><span className="font-medium tabular-nums">{money(componentPrice)}</span></div>
            <div className="flex justify-between border-t pt-1.5"><span className="text-muted-foreground">{t.priceIs}</span><span className="font-bold tabular-nums">{money(effectivePrice)}</span></div>
          </div>

          {/* Fixed price */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={fixedOn} onCheckedChange={setFixedOn} />
              <span className="text-sm">{t.fixedToggle}</span>
            </label>
            {fixedOn && (
              <div>
                <Label htmlFor="pkg-fixed">{t.fixedLabel}</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-muted-foreground">$</span>
                  <Input id="pkg-fixed" className="pl-6" type="number" min="0" step="0.01"
                    value={fixedPrice} onChange={(e) => setFixedPrice(e.target.value)} placeholder="0.00" />
                </div>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={hiddenFromPublic} onCheckedChange={setHiddenFromPublic} />
            <span className="text-sm">{t.hidden}</span>
          </label>

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
