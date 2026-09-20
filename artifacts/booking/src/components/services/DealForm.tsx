import { useEffect, useMemo, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Tag } from "lucide-react";
import { usePackages } from "@/hooks/use-packages";
import { useCreateDeal, useUpdateDeal } from "@/hooks/use-deals";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import type { DealWithDetails } from "@shared/schema";

const money = (n: number) => `$${n.toFixed(2)}`;
const todayInput = () => new Date().toISOString().slice(0, 10);
const plusDaysInput = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deal: DealWithDetails | null;
}

export function DealForm({ open, onOpenChange, deal }: Props) {
  const { pick } = useLanguage();
  const { toast } = useToast();
  const { data: pkgs = [] } = usePackages();
  const { mutate: createDeal, isPending: creating } = useCreateDeal();
  const { mutate: updateDeal, isPending: updating } = useUpdateDeal();

  const [packageId, setPackageId] = useState<number | null>(null);
  // Title/description are never owner-typed — always sourced from the
  // selected package's own name/description (frozen at creation time, same
  // snapshot pattern as listPrice, so a later package edit doesn't
  // retroactively change a live deal's marketplace listing).
  const [title, setTitle] = useState("");
  const [marketingDescription, setMarketingDescription] = useState("");
  const [dealPrice, setDealPrice] = useState("");
  const [capacity, setCapacity] = useState("25");
  const [startsAt, setStartsAt] = useState(todayInput());
  const [endsAt, setEndsAt] = useState(plusDaysInput(30));
  const [expiryDays, setExpiryDays] = useState(30);
  const [err, setErr] = useState<string | null>(null);

  const selectedPackage = pkgs.find((p: any) => p.id === packageId);

  useEffect(() => {
    if (!open) return;
    if (deal) {
      setPackageId(deal.packageId);
      setTitle(deal.title);
      setMarketingDescription(deal.marketingDescription ?? "");
      setDealPrice(String(deal.dealPrice));
      setCapacity(String(deal.capacity));
      setStartsAt(new Date(deal.startsAt).toISOString().slice(0, 10));
      setEndsAt(new Date(deal.endsAt).toISOString().slice(0, 10));
      setExpiryDays((deal as any).expiryDays ?? 30);
    } else {
      setPackageId(null); setTitle(""); setMarketingDescription("");
      setDealPrice(""); setCapacity("25");
      setStartsAt(todayInput()); setEndsAt(plusDaysInput(30));
      setExpiryDays(30);
    }
    setErr(null);
  }, [open, deal]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = {
    createTitle: pick({ en: "New Deal", vi: "Ưu đãi mới", es: "Nueva oferta", fr: "Nouvelle offre" }),
    editTitle:   pick({ en: "Edit Deal", vi: "Sửa ưu đãi", es: "Editar oferta", fr: "Modifier l'offre" }),
    desc:        pick({ en: "Turn an existing package into a limited-time deal on the marketplace. Customers pre-pay for a voucher and redeem it when their appointment starts.", vi: "Biến một gói có sẵn thành ưu đãi có thời hạn trên chợ ứng dụng. Khách trả trước để lấy phiếu và đổi khi lịch hẹn bắt đầu.", es: "Convierte un paquete existente en una oferta por tiempo limitado en el mercado. Los clientes pagan por adelantado un vale y lo canjean cuando comienza su cita.", fr: "Transformez un forfait existant en offre à durée limitée sur la marketplace. Les clients prépaient un bon et l'échangent au début de leur rendez-vous." }),
    packageLabel: pick({ en: "Package", vi: "Gói dịch vụ", es: "Paquete", fr: "Forfait" }),
    packagePlaceholder: pick({ en: "Choose a package…", vi: "Chọn một gói…", es: "Elige un paquete…", fr: "Choisissez un forfait…" }),
    noPackages: pick({ en: "Create a package in Catalog → Packages first.", vi: "Hãy tạo một gói trong Danh mục → Gói trước.", es: "Primero crea un paquete en Catálogo → Paquetes.", fr: "Créez d'abord un forfait dans Catalogue → Forfaits." }),
    copyFromPackageHint: pick({ en: "Title & description come from this package automatically.", vi: "Tiêu đề & mô tả được lấy tự động từ gói này.", es: "El título y la descripción provienen automáticamente de este paquete.", fr: "Le titre et la description proviennent automatiquement de ce forfait." }),
    expiryLabel: pick({ en: "Voucher valid for", vi: "Phiếu có hiệu lực trong", es: "Vale válido por", fr: "Bon valable" }),
    expiryHint:  pick({ en: "How long a customer has to redeem their voucher after buying it — independent of the sale dates below.", vi: "Thời gian khách có thể đổi phiếu sau khi mua — không liên quan đến ngày bán bên dưới.", es: "Cuánto tiempo tiene un cliente para canjear su vale después de comprarlo, independiente de las fechas de venta.", fr: "Délai dont dispose un client pour échanger son bon après l'achat, indépendant des dates de vente ci-dessous." }),
    days: pick({ en: "days", vi: "ngày", es: "días", fr: "jours" }),
    priceLabel: pick({ en: "Deal price", vi: "Giá ưu đãi", es: "Precio de la oferta", fr: "Prix de l'offre" }),
    listPrice:  pick({ en: "Package price", vi: "Giá gói", es: "Precio del paquete", fr: "Prix du forfait" }),
    capacityLabel: pick({ en: "Vouchers available", vi: "Số phiếu có sẵn", es: "Vales disponibles", fr: "Bons disponibles" }),
    startsLabel: pick({ en: "Starts", vi: "Bắt đầu", es: "Empieza", fr: "Commence" }),
    endsLabel:   pick({ en: "Ends", vi: "Kết thúc", es: "Termina", fr: "Se termine" }),
    save:   pick({ en: "Save", vi: "Lưu", es: "Guardar", fr: "Enregistrer" }),
    cancel: pick({ en: "Cancel", vi: "Hủy", es: "Cancelar", fr: "Annuler" }),
    saved:  pick({ en: "Deal saved", vi: "Đã lưu ưu đãi", es: "Oferta guardada", fr: "Offre enregistrée" }),
    needPackage: pick({ en: "Choose a package.", vi: "Hãy chọn một gói.", es: "Elige un paquete.", fr: "Choisissez un forfait." }),
    needTitle:   pick({ en: "Give the deal a title.", vi: "Đặt tiêu đề cho ưu đãi.", es: "Ponle un título a la oferta.", fr: "Donnez un titre à l'offre." }),
    needPrice:   pick({ en: "Deal price must be more than $0 and less than the package price.", vi: "Giá ưu đãi phải lớn hơn $0 và nhỏ hơn giá gói.", es: "El precio de la oferta debe ser mayor que $0 y menor que el precio del paquete.", fr: "Le prix de l'offre doit être supérieur à 0 $ et inférieur au prix du forfait." }),
    needCapacity: pick({ en: "Capacity must be at least 1.", vi: "Số lượng phải ít nhất là 1.", es: "La capacidad debe ser de al menos 1.", fr: "La capacité doit être d'au moins 1." }),
    needDates: pick({ en: "End date must be after the start date.", vi: "Ngày kết thúc phải sau ngày bắt đầu.", es: "La fecha de fin debe ser posterior a la de inicio.", fr: "La date de fin doit être après la date de début." }),
  };

  const discountPercent = useMemo(() => {
    const list = selectedPackage?.price ?? 0;
    const deal = Number(dealPrice) || 0;
    if (!list || deal >= list) return 0;
    return Math.round((1 - deal / list) * 100);
  }, [selectedPackage, dealPrice]);

  const submit = () => {
    if (!packageId) { setErr(t.needPackage); return; }
    if (!title.trim()) { setErr(t.needTitle); return; }
    const price = Number(dealPrice);
    if (!price || price <= 0 || (selectedPackage && price >= selectedPackage.price)) { setErr(t.needPrice); return; }
    if (!capacity || Number(capacity) < 1) { setErr(t.needCapacity); return; }
    if (new Date(startsAt) >= new Date(endsAt)) { setErr(t.needDates); return; }
    setErr(null);

    const opts = {
      onSuccess: () => { toast({ title: t.saved }); onOpenChange(false); },
      onError: (e: Error) => toast({ title: e.message || "Failed to save deal", variant: "destructive" }),
    };
    if (deal) {
      updateDeal({
        id: deal.id,
        title: title.trim(),
        marketingDescription: marketingDescription.trim() || null,
        dealPrice: price.toFixed(2),
        capacity: Number(capacity),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        expiryDays,
      }, opts);
    } else {
      createDeal({
        packageId,
        title: title.trim(),
        marketingDescription: marketingDescription.trim() || null,
        dealPrice: price.toFixed(2),
        capacity: Number(capacity),
        expiryDays,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      }, opts);
    }
  };

  const busy = creating || updating;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{deal ? t.editTitle : t.createTitle}</SheetTitle>
          <SheetDescription>{t.desc}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          <div>
            <Label>{t.packageLabel}</Label>
            {!deal ? (
              pkgs.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">{t.noPackages}</p>
              ) : (
                <Select value={packageId ? String(packageId) : undefined} onValueChange={(v) => {
                  const id = Number(v);
                  setPackageId(id);
                  const pkg = pkgs.find((p: any) => p.id === id);
                  // Always sync from the package — there's no manual title/
                  // description override anymore, so this stays in lockstep
                  // with whichever package is currently selected.
                  if (pkg) {
                    setTitle(pkg.name);
                    setMarketingDescription(pkg.description ?? "");
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder={t.packagePlaceholder} /></SelectTrigger>
                  <SelectContent>
                    {pkgs.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name} — {money(p.price)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            ) : (
              <div className="mt-1 flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
                <Tag className="w-4 h-4 text-muted-foreground" /> {deal.package.name}
              </div>
            )}
          </div>

          {!!selectedPackage && (
            <div className="rounded-lg border bg-slate-50 px-3 py-2.5">
              <p className="text-sm font-medium">{title}</p>
              {marketingDescription && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{marketingDescription}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">{t.copyFromPackageHint}</p>
            </div>
          )}

          <div>
            <Label>{t.expiryLabel}</Label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {[30, 60, 90].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setExpiryDays(n)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    expiryDays === n ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-slate-50"
                  }`}
                >
                  {n} {t.days}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t.expiryHint}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="deal-price">{t.priceLabel}</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-muted-foreground">$</span>
                <Input id="deal-price" className="pl-6" type="number" min="0" step="0.01"
                  value={dealPrice} onChange={(e) => setDealPrice(e.target.value)} placeholder="0.00" />
              </div>
              {!!selectedPackage && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.listPrice}: <span className="line-through">{money(selectedPackage.price)}</span>
                  {discountPercent > 0 && <span className="ml-1 font-medium text-emerald-600">−{discountPercent}%</span>}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="deal-capacity">{t.capacityLabel}</Label>
              <Input id="deal-capacity" type="number" min="1" step="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="deal-starts">{t.startsLabel}</Label>
              <Input id="deal-starts" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="deal-ends">{t.endsLabel}</Label>
              <Input id="deal-ends" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
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
