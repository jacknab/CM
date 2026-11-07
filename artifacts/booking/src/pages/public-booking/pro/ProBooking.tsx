/**
 * The booking page for barbershops and hair salons (owner, 2026-11-02): prices depend on who does the service
 * (pricing levels — api-server lib/pricingLevels.ts). Nail salons and every other business keep their own booking
 * page (PublicBooking.tsx picks this one by business type only).
 *
 *   1. Services — each with its price, or its lowest-to-highest price when it depends on who does it
 *   2. Professional — a named one (their prices), or "Any available" (the range)
 *   3. Date and time — only professionals who do the service; with "Any available" each time goes to the
 *      lowest-priced professional free then, and that is who the review step names
 *   4. Review — services, professional, each price, total, date and time; the prices sent are checked by the server,
 *      and if they changed nothing is booked and the new price is shown to approve
 *
 * Up to two services per visit, as on the other booking pages. A business that takes a card or deposit when booking
 * keeps its usual booking page (`fallback`), whose prices the server also works out by professional.
 */
import { WalkInBanner } from "@/pages/line/WalkInBanner";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { CheckCircle2, ChevronLeft, Loader2, User } from "lucide-react";
import type { StoreData } from "../types";
import { SiteHeader, siteStyle } from "../SiteLook";
import { BookingClosedNotice, bookingClosed } from "../bookingClosed";
import { anyRange as anyRangeOf, money, priceOf as priceIn, priceRange as range, proTotal as totalOf, prosForAll } from "./proPricing";

interface Service { id: number; name: string; description?: string; duration: number; price: string; category: string; categoryId?: number; isActive?: boolean }
interface Category { id: number; name: string; sortOrder?: number }
interface ProPricing {
  staff: { id: number; name: string; avatarUrl: string | null; levelId: number | null; levelName: string | null }[];
  prices: { staffId: number; serviceId: number; price: number }[];
  ranges: { serviceId: number; min: number; max: number }[];
}
interface Slot { time: string; staffId: number; staffName: string; extraStaffId?: number; extraStaffName?: string; prices: Record<number, number>; total: number }
interface Policy { policy?: string; cancellationPolicyRequired?: boolean; cancellationPolicyText?: string }

const MAX_SERVICES = 2;

export default function ProBooking({ store, slug, fallback }: { store: StoreData; slug: string; fallback: ReactNode }) {
  const tz = store.timezone || "UTC";
  const { data: catalog, isLoading: catalogLoading } = useQuery<{ services: Service[]; categories: Category[] }>({ queryKey: [`/api/public/store/${slug}/services`] });
  const { data: pricing, isLoading: pricingLoading } = useQuery<ProPricing>({ queryKey: [`/api/public/store/${slug}/pro-pricing`] });
  const { data: policy, isLoading: policyLoading } = useQuery<Policy>({ queryKey: [`/api/public/booking-payment-policy/${slug}`] });

  const [step, setStep] = useState<"services" | "pro" | "time" | "review" | "done">("services");
  const [picked, setPicked] = useState<number[]>([]);
  const [proId, setProId] = useState<number | "any">("any");
  const [day, setDay] = useState(() => formatInTimeZone(new Date(), tz, "yyyy-MM-dd"));
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const services = useMemo(() => (catalog?.services ?? []).filter((s) => s.isActive !== false), [catalog]);
  const priceOf = (staffId: number, serviceId: number) => priceIn(pricing?.prices ?? [], staffId, serviceId);
  const rangeOf = (serviceId: number) => pricing?.ranges.find((r) => r.serviceId === serviceId);
  // Only services someone does; in the catalogue's category order.
  const bookable = services.filter((s) => rangeOf(s.id));
  const categoryOrder = new Map((catalog?.categories ?? []).map((c, i) => [c.id, c.sortOrder ?? i]));
  const groups = useMemo(() => {
    const m = new Map<string, { order: number; items: Service[] }>();
    for (const s of bookable) {
      const g = m.get(s.category) ?? { order: s.categoryId != null ? categoryOrder.get(s.categoryId) ?? 999 : 999, items: [] };
      g.items.push(s); m.set(s.category, g);
    }
    return [...m.entries()].sort((a, b) => a[1].order - b[1].order);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookable.length, catalog]);
  const chosen = picked.map((id) => services.find((s) => s.id === id)).filter(Boolean) as Service[];
  // Professionals who do everything chosen.
  const pros = prosForAll(pricing?.staff ?? [], pricing?.prices ?? [], picked);
  const proTotal = (staffId: number) => totalOf(pricing?.prices ?? [], staffId, picked);
  const anyRange = anyRangeOf(pros.map((p) => p.id), pricing?.prices ?? [], picked);

  // Times for the chosen day (the server gives each time to who takes it, with their prices).
  const first = chosen[0];
  const { data: slots, isFetching: slotsLoading } = useQuery<Slot[]>({
    queryKey: [`/api/public/store/${slug}/pro-times`, picked.join(","), proId, day],
    enabled: step === "time" && !!first,
    queryFn: async () => {
      const q = new URLSearchParams({ serviceId: String(first!.id), date: day, duration: String(first!.duration) });
      if (chosen[1]) q.set("extraServiceId", String(chosen[1].id));
      if (proId !== "any") q.set("staffId", String(proId));
      const res = await fetch(`/api/public/store/${slug}/pro-times?${q}`);
      if (!res.ok) throw new Error("Could not load the times");
      return res.json();
    },
  });
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => formatInTimeZone(new Date(Date.now() + i * 86_400_000), tz, "yyyy-MM-dd")), [tz]);
  useEffect(() => { setSlot(null); }, [day, proId, picked.join(",")]);

  if (catalogLoading || pricingLoading || policyLoading) {
    return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  // Taking a card or a deposit when booking happens on the business's usual booking page.
  if (!pricing || (policy?.policy && policy.policy !== "none")) return <>{fallback}</>;

  const needsAgreement = !!policy?.cancellationPolicyRequired && !!policy?.cancellationPolicyText?.trim();
  // "Who can book online" set to Nobody, or Booking System off: services shown, not chosen; call instead (bookingClosed.tsx).
  const closed = bookingClosed(store);
  const toggle = (id: number) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_SERVICES ? cur : [...cur, id]));
  const timeLabel = (iso: string) => formatInTimeZone(new Date(iso), tz, "h:mm a");
  const proName = (id: number) => pricing.staff.find((p) => p.id === id)?.name ?? "";

  const book = async () => {
    if (!slot || !first) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/public/store/${slug}/book`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: first.id, ...(chosen[1] ? { extraServiceId: chosen[1].id } : {}),
          staffId: slot.staffId, date: slot.time, duration: first.duration,
          customerName: name.trim(), customerPhone: phone.replace(/\D/g, ""), ...(email.trim() ? { customerEmail: email.trim() } : {}),
          cancellationPolicyAccepted: needsAgreement ? agreed : undefined,
          // What the client was shown: the server books only at these prices.
          quotedPrices: slot.prices,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data?.code === "PRICE_CHANGED") {
        // Show the new price; nothing was booked. The client confirms again at the new price.
        setSlot((s) => (s ? { ...s, prices: { ...s.prices, ...data.prices }, total: Object.values({ ...s.prices, ...data.prices } as Record<string, number>).reduce((a, b) => a + b, 0) } : s));
        setError(data.message ?? "The price changed. Please review and confirm.");
        return;
      }
      if (!res.ok) { setError(data?.message ?? "We couldn't book that. Please try again."); return; }
      setStep("done");
    } catch {
      setError("We couldn't reach the salon. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const back = (to: typeof step) => <button type="button" onClick={() => { setError(null); setStep(to); }} className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600" data-testid="pro-back"><ChevronLeft className="w-4 h-4" /> Back</button>;
  const card = "w-full text-left rounded-xl border p-4 transition-colors";
  const on = "border-[var(--site-accent,#111)] bg-gray-50 ring-1 ring-[var(--site-accent,#111)]";
  const primary = "w-full h-12 rounded-xl bg-[var(--site-accent,#111)] text-white font-semibold disabled:opacity-40";

  if (step === "done") {
    const digits = phone.replace(/\D/g, "");
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6" style={siteStyle(store.bookingSite)} data-testid="pro-done">
        <div className="text-center max-w-md">
          <CheckCircle2 className="w-14 h-14 mx-auto mb-4 text-green-600" />
          <h1 className="text-2xl font-bold mb-2">{store.bookingApproval === "manual" ? "Request sent" : "You're booked"}</h1>
          <p className="text-gray-600 mb-6">{slot && `${formatInTimeZone(new Date(slot.time), tz, "EEEE, MMMM d 'at' h:mm a")} with ${slot.staffName} · ${money(slot.total)}`}</p>
          {digits.length === 10 && <a className="underline" href={`/booking/${digits}?slug=${encodeURIComponent(slug)}`}>See your booking</a>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900" style={siteStyle(store.bookingSite)} data-testid="pro-booking">
      {step === "services" && <SiteHeader store={store} />}
      <main className="mx-auto max-w-2xl px-4 py-6 pb-32">
        {step === "services" && <WalkInBanner slug={slug} />}
        {step === "services" && (
          <section data-testid="pro-step-services">
            <h2 className="text-xl font-bold mb-1">Choose your services</h2>
            <p className="text-sm text-gray-500 mb-4">Up to {MAX_SERVICES}. Prices depend on who you book with.</p>
            {closed && <BookingClosedNotice store={store} className="mb-4" />}
            {groups.map(([cat, g]) => (
              <div key={cat} className="mb-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">{cat}</h3>
                <div className="space-y-2">
                  {g.items.map((s) => {
                    const r = rangeOf(s.id)!;
                    const sel = picked.includes(s.id);
                    return (
                      <button key={s.id} type="button" className={`${card} ${sel ? on : "border-gray-200"}`} disabled={closed} onClick={() => { if (!closed) toggle(s.id); }} data-testid={`pro-service-${s.id}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold">{s.name}</p>
                            {s.description && <p className="text-sm text-gray-500 mt-0.5">{s.description}</p>}
                            <p className="text-xs text-gray-400 mt-1">{s.duration} min</p>
                          </div>
                          <p className="font-semibold whitespace-nowrap" data-testid={`pro-service-price-${s.id}`}>{range(r.min, r.max)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {bookable.length === 0 && <p className="text-gray-500">No services can be booked online right now.</p>}
          </section>
        )}

        {step === "pro" && (
          <section data-testid="pro-step-pro">
            {back("services")}
            <h2 className="text-xl font-bold mb-4">Who would you like?</h2>
            <div className="space-y-2">
              <button type="button" className={`${card} ${proId === "any" ? on : "border-gray-200"}`} onClick={() => setProId("any")} data-testid="pro-any">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-gray-100"><User className="w-5 h-5 text-gray-500" /></span>
                    <div><p className="font-semibold">Any available professional</p><p className="text-sm text-gray-500">The first time that suits you</p></div></div>
                  {anyRange && <p className="font-semibold whitespace-nowrap">{range(anyRange.min, anyRange.max)}</p>}
                </div>
              </button>
              {pros.map((p) => (
                <button key={p.id} type="button" className={`${card} ${proId === p.id ? on : "border-gray-200"}`} onClick={() => setProId(p.id)} data-testid={`pro-staff-${p.id}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="grid h-11 w-11 place-items-center rounded-full bg-gray-100 font-semibold">{p.name.charAt(0)}</span>}
                      <div><p className="font-semibold">{p.name}</p>{p.levelName && <p className="text-sm text-gray-500">{p.levelName}</p>}</div>
                    </div>
                    <p className="font-semibold whitespace-nowrap">{money(proTotal(p.id))}</p>
                  </div>
                </button>
              ))}
            </div>
            {pros.length === 0 && <p className="mt-3 text-sm text-gray-500">Nobody does all of these services together. Choose "Any available professional".</p>}
          </section>
        )}

        {step === "time" && (
          <section data-testid="pro-step-time">
            {back("pro")}
            <h2 className="text-xl font-bold mb-1">Pick a time</h2>
            <p className="text-sm text-gray-500 mb-4">{proId === "any" ? "With any available professional" : `With ${proName(proId)}`}</p>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {days.map((d) => (
                <button key={d} type="button" onClick={() => setDay(d)} className={`shrink-0 rounded-xl border px-3 py-2 text-center ${d === day ? on : "border-gray-200"}`} data-testid={`pro-day-${d}`}>
                  <span className="block text-xs text-gray-500">{formatInTimeZone(new Date(`${d}T12:00:00Z`), "UTC", "EEE")}</span>
                  <span className="block font-semibold">{formatInTimeZone(new Date(`${d}T12:00:00Z`), "UTC", "MMM d")}</span>
                </button>
              ))}
            </div>
            {slotsLoading ? <Loader2 className="w-6 h-6 animate-spin text-gray-400" /> : !slots?.length ? <p className="text-gray-500">No times left this day. Try another day.</p> : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.map((s) => (
                  <button key={s.time} type="button" onClick={() => setSlot(s)} className={`rounded-xl border px-2 py-3 text-center ${slot?.time === s.time ? on : "border-gray-200"}`} data-testid="pro-slot">
                    <span className="block font-semibold">{timeLabel(s.time)}</span>
                    {proId === "any" && <span className="block text-xs text-gray-500">{money(s.total)}</span>}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {step === "review" && slot && (
          <section data-testid="pro-step-review">
            {back("time")}
            <h2 className="text-xl font-bold mb-4">Review your booking</h2>
            <div className="rounded-xl border border-gray-200 p-4 mb-4">
              <p className="font-semibold">{formatInTimeZone(new Date(slot.time), tz, "EEEE, MMMM d 'at' h:mm a")}</p>
              <p className="text-sm text-gray-600 mb-3">With {slot.staffName}{slot.extraStaffName && slot.extraStaffName !== slot.staffName ? ` (then ${slot.extraStaffName})` : ""}</p>
              {chosen.map((s) => (
                <div key={s.id} className="flex justify-between py-1.5 border-t border-gray-100" data-testid={`pro-review-line-${s.id}`}>
                  <span>{s.name}</span><span className="font-medium">{money(slot.prices[s.id] ?? 0)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 mt-1 border-t border-gray-200 font-bold" data-testid="pro-review-total"><span>Total</span><span>{money(slot.total)}</span></div>
            </div>
            <div className="space-y-3 mb-4">
              <input className="w-full h-12 rounded-xl border border-gray-300 px-3" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} data-testid="pro-name" />
              <input className="w-full h-12 rounded-xl border border-gray-300 px-3" placeholder="Mobile number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="pro-phone" />
              <input className="w-full h-12 rounded-xl border border-gray-300 px-3" placeholder="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {needsAgreement && (
              <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 mb-4 text-sm">
                <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span><span className="block whitespace-pre-wrap text-gray-600 mb-2">{policy!.cancellationPolicyText}</span>I have read and agree to the cancellation policy</span>
              </label>
            )}
            {error && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert" data-testid="pro-error">{error}</p>}
          </section>
        )}
      </main>

      {/* The next step, always at the bottom (none while booking is closed) */}
      {!closed && <div className="fixed inset-x-0 bottom-0 border-t bg-white p-4">
        <div className="mx-auto max-w-2xl">
          {step === "services" && <button type="button" className={primary} disabled={picked.length === 0} onClick={() => setStep("pro")} data-testid="pro-next">{picked.length ? `Continue · ${chosen.map((s) => s.name).join(" + ")}` : "Choose a service"}</button>}
          {step === "pro" && <button type="button" className={primary} disabled={proId !== "any" && !pros.some((p) => p.id === proId)} onClick={() => setStep("time")} data-testid="pro-next">Choose a time</button>}
          {step === "time" && <button type="button" className={primary} disabled={!slot} onClick={() => setStep("review")} data-testid="pro-next">{slot ? `Review · ${timeLabel(slot.time)} with ${slot.staffName}` : "Pick a time"}</button>}
          {step === "review" && <button type="button" className={primary} disabled={busy || !name.trim() || phone.replace(/\D/g, "").length !== 10 || (needsAgreement && !agreed)} onClick={() => void book()} data-testid="pro-book">{busy ? "Booking…" : `Book · ${money(slot?.total ?? 0)}`}</button>}
        </div>
      </div>}
    </div>
  );
}
