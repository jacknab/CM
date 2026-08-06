import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  X,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  User,
  Star,
  CreditCard,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInTz, getNowInTimezone } from "@/lib/timezone";
import { apiRequest } from "@/lib/queryClient";
import { addDays, subDays, isSameDay } from "date-fns";
import { StoreData, ServiceData, ServiceOptionData, CategoryData, TimeSlot, AddonData, ServiceAddonData } from "./types";
import { detectBrowserLang, BOOKING_STRINGS } from "@/lib/bookingTranslations";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";

type Step = "client" | "services" | "time" | "confirm" | "payment";

// ── Inner Stripe payment form (must be inside <Elements>) ────────────────────
function PaymentForm({
  intentType,
  depositAmountCents,
  onSuccess,
  onBack,
}: {
  intentType: "setup" | "payment" | null;
  depositAmountCents: number;
  onSuccess: (info: Record<string, any>) => void;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (intentType === "setup") {
        const result = await stripe.confirmSetup({
          elements,
          confirmParams: { return_url: window.location.href },
          redirect: "if_required",
        });
        if (result.error) throw new Error(result.error.message);
        const si = result.setupIntent;
        onSuccess({
          paymentPolicy: "card_on_file",
          paymentStatus: "card_saved",
          stripeSetupIntentId: si?.id,
          stripePaymentMethodId: typeof si?.payment_method === "string" ? si.payment_method : undefined,
        });
      } else {
        const result = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: window.location.href },
          redirect: "if_required",
        });
        if (result.error) throw new Error(result.error.message);
        const pi = result.paymentIntent;
        onSuccess({
          paymentPolicy: "deposit",
          paymentStatus: "deposit_paid",
          stripePaymentIntentId: pi?.id,
          stripePaymentMethodId: typeof pi?.payment_method === "string" ? pi.payment_method : undefined,
          depositCollected: depositAmountCents / 100,
          remainingBalance: undefined, // filled server-side
        });
      }
    } catch (err: any) {
      setError(err.message ?? "Payment failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <Button className="w-full mt-2" onClick={handleSubmit} disabled={isSubmitting || !stripe}>
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : (
          <Lock className="w-4 h-4 mr-2" />
        )}
        {intentType === "setup"
          ? "Save Card & Confirm Booking"
          : `Pay ${(depositAmountCents / 100).toFixed(2)} & Confirm`}
      </Button>
      <Button variant="ghost" className="w-full text-sm text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Change booking details
      </Button>
    </div>
  );
}

interface SimpleThemeProps {
  store: StoreData;
  slug: string;
  preselectedStaffId?: number;
  preselectedServiceId?: number;
}

export default function SimpleTheme({ store, slug, preselectedStaffId, preselectedServiceId }: SimpleThemeProps) {
  const [searchParams] = useSearchParams();
  const hideHeader = searchParams.get("embed") === "true" || searchParams.get("hideHeader") === "true";
  const [step, setStep] = useState<Step>("services");
  const [clientType, setClientType] = useState<"new" | "returning" | null>("new");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [returningPhone, setReturningPhone] = useState("");
  const [preselectedStaffName, setPreselectedStaffName] = useState<string | null>(null);

  const { data: publicStaff = [] } = useQuery<any[]>({
    queryKey: ["/api/public/store", slug, "staff"],
    queryFn: async () => {
      const res = await fetch(`/api/public/store/${slug}/staff`);
      if (!res.ok) throw new Error("Failed to fetch staff");
      return res.json();
    },
    enabled: !!preselectedStaffId,
  });
  const preselectedStaff = preselectedStaffId
    ? publicStaff.find((m) => m.id === preselectedStaffId) ?? null
    : null;
  const [selectedServices, setSelectedServices] = useState<ServiceData[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<Record<number, number[]>>({});
  const [viewingAddonsForService, setViewingAddonsForService] = useState<ServiceData | null>(null);
  const [optionPickerService, setOptionPickerService] = useState<ServiceData | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const preselectionAppliedRef = useRef<number | null>(null);

  // ── Payment policy / Stripe ──────────────────────────────────────────────
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [intentType, setIntentType] = useState<"setup" | "payment" | null>(null);
  const [pendingStripeCustomerId, setPendingStripeCustomerId] = useState<string | null>(null);
  const [depositAmountCents, setDepositAmountCents] = useState<number>(0);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const timezone = store.timezone || "UTC";

  const { data: storeData } = useQuery<StoreData & { businessHours: any[] }>({
    queryKey: [`/api/public/store/${slug}`],
    enabled: !!slug,
  });

  // ── Payment policy ──────────────────────────────────────────────────────────
  const { data: paymentPolicyData } = useQuery<{
    policy: "none" | "card_on_file" | "deposit";
    depositType: "percentage" | "fixed" | null;
    depositValue: number | null;
    stripePublishableKey: string | null;
    stripeConnectedAccountId: string | null;
  }>({
    queryKey: [`/api/public/booking-payment-policy/${slug}`],
    queryFn: async () => {
      const res = await fetch(`/api/public/booking-payment-policy/${slug}`);
      if (!res.ok) return { policy: "none", depositType: null, depositValue: null, stripePublishableKey: null, stripeConnectedAccountId: null };
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  // Load Stripe when publishable key is available
  useEffect(() => {
    if (!paymentPolicyData?.stripePublishableKey || stripeInstance) return;
    const opts: any = {};
    if (paymentPolicyData.stripeConnectedAccountId) {
      opts.stripeAccount = paymentPolicyData.stripeConnectedAccountId;
    }
    loadStripe(paymentPolicyData.stripePublishableKey, opts).then(s => {
      if (s) setStripeInstance(s);
    });
  }, [paymentPolicyData?.stripePublishableKey, paymentPolicyData?.stripeConnectedAccountId]);

  const closingTime = useMemo(() => {
    if (!storeData?.businessHours) return null;
    const today = getNowInTimezone(timezone);
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const todayHours = storeData.businessHours.find((h: any) => h.dayOfWeek === dayOfWeek);
    if (!todayHours || todayHours.isClosed) return null;
    
    // Parse HH:mm:ss
    const [h, m] = todayHours.closeTime.split(':');
    const date = new Date();
    date.setHours(parseInt(h), parseInt(m));
    return formatInTz(date, timezone, "h:mm a");
  }, [storeData, timezone]);

  const { data: servicesData, isLoading: servicesLoading } = useQuery<{
    services: ServiceData[];
    categories: CategoryData[];
    addons: AddonData[];
    serviceAddons: ServiceAddonData[];
  }>({
    queryKey: [`/api/public/store/${slug}/services`],
    enabled: !!slug,
  });

  const services = servicesData?.services || [];
  const categories = servicesData?.categories || [];
  const addons = servicesData?.addons || [];
  const serviceAddons = servicesData?.serviceAddons || [];
  const showPrices = (storeData as any)?.showPrices ?? true;

  useEffect(() => {
    const requestedServiceId = Number(preselectedServiceId);
    if (!Number.isFinite(requestedServiceId) || requestedServiceId <= 0 || services.length === 0 || preselectionAppliedRef.current === requestedServiceId) {
      return;
    }
    const service = services.find((candidate) => Number(candidate.id) === requestedServiceId);
    if (!service) return;
    preselectionAppliedRef.current = requestedServiceId;
    if (service.options && service.options.length > 1) {
      setOptionPickerService(service);
      return;
    }
    setSelectedServices([service]);
    setStep("time");
  }, [preselectedServiceId, services]);

  const getAddonsForService = (serviceId: number) => {
    const mappings = serviceAddons.filter(sa => sa.serviceId === serviceId);
    const addonIds = new Set(mappings.map(sa => sa.addonId));
    return addons.filter(a => addonIds.has(a.id));
  };

  const totalPrice = useMemo(() => {
    let total = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
    Object.entries(selectedAddons).forEach(([svcId, addonIds]) => {
      addonIds.forEach(id => {
        const addon = addons.find(a => a.id === id);
        if (addon) total += Number(addon.price);
      });
    });
    return total;
  }, [selectedServices, selectedAddons, addons]);

  const totalDuration = useMemo(() => {
    let total = selectedServices.reduce((sum, s) => sum + s.duration, 0);
    Object.entries(selectedAddons).forEach(([svcId, addonIds]) => {
      addonIds.forEach(id => {
        const addon = addons.find(a => a.id === id);
        if (addon) total += Number(addon.duration);
      });
    });
    return total;
  }, [selectedServices, selectedAddons, addons]);

  const primaryService = selectedServices[0];

  const dateString = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
    : null;

  const { data: slots, isLoading: slotsLoading } = useQuery<TimeSlot[]>({
    queryKey: ["/api/public/store", slug, "availability", primaryService?.id, dateString, totalDuration, preselectedStaffId],
    queryFn: async () => {
      const params = new URLSearchParams({
        serviceId: String(primaryService!.id),
        date: dateString!,
        duration: String(totalDuration),
      });
      if (preselectedStaffId) params.set("staffId", String(preselectedStaffId));
      const res = await fetch(`/api/public/store/${slug}/availability?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch availability");
      return res.json();
    },
    enabled: !!slug && !!primaryService && !!dateString && totalDuration > 0,
  });

  useMemo(() => {
    if (preselectedStaffId && slots && slots.length > 0 && !preselectedStaffName) {
      const match = slots.find(s => s.staffId === preselectedStaffId);
      if (match) setPreselectedStaffName(match.staffName);
    }
  }, [slots, preselectedStaffId]);

  const bookMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/public/store/${slug}/book`, body);
      return res.json();
    },
    onSuccess: () => {
      setBookingSuccess(true);
      if (customerPhone) {
        localStorage.setItem(`booking_user_phone_${slug}`, customerPhone);
      }
    },
  });

  const now = useMemo(() => {
    return getNowInTimezone(timezone);
  }, [timezone]);

  // Initialize date
  useMemo(() => {
     if (selectedDate === null) {
        const today = getNowInTimezone(timezone);
        setSelectedDate(today);
        setWeekStart(today);
     }
  }, [timezone]);

  // Pre-fill phone from stored session
  useMemo(() => {
    const storedPhone = localStorage.getItem(`booking_user_phone_${slug}`);
    if (storedPhone) {
      setReturningPhone(storedPhone);
      setCustomerPhone(storedPhone);
    }
  }, [slug]);

  const weekDays = useMemo(() => {
    if (!weekStart) return [];
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const groupedServices = useMemo(() => {
    const groups: Record<string, ServiceData[]> = {};
    for (const s of services) {
      const cat = s.category || "General";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    }
    return groups;
  }, [services]);

  const groupedSlots = useMemo(() => {
    if (!slots) return { morning: [], afternoon: [], evening: [] };
    const morning: TimeSlot[] = [];
    const afternoon: TimeSlot[] = [];
    const evening: TimeSlot[] = [];
    for (const slot of slots) {
      const hour = parseInt(formatInTz(slot.time, timezone, "H"));
      if (hour < 12) morning.push(slot);
      else if (hour < 17) afternoon.push(slot);
      else evening.push(slot);
    }
    return { morning, afternoon, evening };
  }, [slots, timezone]);

  const toggleService = (service: ServiceData) => {
    const exists = selectedServices.find((s) => s.id === service.id);
    if (exists) {
      const newAddons = { ...selectedAddons };
      delete newAddons[service.id];
      setSelectedAddons(newAddons);
      setSelectedServices((prev) => prev.filter((s) => s.id !== service.id));
      return;
    }
    if (service.options && service.options.length > 1) {
      setOptionPickerService(service);
      return;
    }
    const serviceAddonsList = getAddonsForService(service.id);
    if (serviceAddonsList.length > 0) {
      setViewingAddonsForService(service);
    }
    setSelectedServices((prev) => [...prev, service]);
  };

  const handlePickOption = (service: ServiceData, option: ServiceOptionData) => {
    const serviceWithOption: ServiceData = {
      ...service,
      duration: option.durationMinutes,
      price: option.price,
      name: `${service.name} – ${option.name}`,
      options: [],
    };
    setSelectedServices((prev) => [...prev, serviceWithOption]);
    setOptionPickerService(null);
  };

  const toggleAddon = (serviceId: number, addonId: number) => {
    setSelectedAddons((prev) => {
      const current = prev[serviceId] || [];
      const exists = current.includes(addonId);
      let updated;
      if (exists) {
        updated = current.filter((id) => id !== addonId);
      } else {
        updated = [...current, addonId];
      }
      return { ...prev, [serviceId]: updated };
    });
  };

  const handleClientSelect = (type: "new" | "returning") => {
    setClientType(type);
    if (type === "new") {
      setStep("services");
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    let formatted = raw;
    if (raw.length > 0) {
      if (raw.length <= 3) formatted = raw;
      else if (raw.length <= 6) formatted = `(${raw.slice(0, 3)}) ${raw.slice(3)}`;
      else formatted = `(${raw.slice(0, 3)}) ${raw.slice(3, 6)}-${raw.slice(6, 10)}`;
    }
    setReturningPhone(formatted);
    if (phoneError) setPhoneError("");
  };

  const handleReturningContinue = () => {
    if (clientType === "returning") {
      const digits = returningPhone.replace(/\D/g, "");
      if (digits.length !== 10) {
        setPhoneError("Enter a valid 10-digit phone number.");
        return;
      }
      setCustomerPhone(returningPhone);
      localStorage.setItem(`booking_user_phone_${slug}`, returningPhone);
    }
    setStep("services");
  };

  const handleChooseTime = () => {
    if (selectedServices.length === 0) return;
    setStep("time");
  };

  const handleSelectSlot = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    setStep("confirm");
  };

  // ── Submit booking (with optional payment info) ────────────────────────────
  const submitBooking = useCallback((paymentInfo: Record<string, any>) => {
    if (!primaryService || !selectedSlot) return;
    const allAddonIds = Object.values(selectedAddons).flat();
    bookMutation.mutate({
      serviceId: primaryService.id,
      staffId: selectedSlot.staffId,
      date: selectedSlot.time,
      duration: totalDuration,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: customerPhone.trim(),
      addonIds: allAddonIds,
      smsOptIn,
      ...paymentInfo,
    });
  }, [primaryService, selectedSlot, selectedAddons, totalDuration, customerName, customerEmail, customerPhone, smsOptIn, bookMutation]);

  // ── Calculate deposit in cents ─────────────────────────────────────────────
  const calculateDepositCents = useCallback((totalPriceDollars: number): number => {
    if (!paymentPolicyData || !paymentPolicyData.depositValue) return 0;
    if (paymentPolicyData.depositType === "percentage") {
      return Math.round(totalPriceDollars * (paymentPolicyData.depositValue / 100) * 100);
    }
    return Math.round(paymentPolicyData.depositValue * 100);
  }, [paymentPolicyData]);

  const handleConfirmBooking = async () => {
    const phoneDigits = customerPhone.replace(/\D/g, "");
    if (!primaryService || !selectedSlot || !customerName.trim()) return;
    if (phoneDigits.length !== 10) {
      setPhoneError("Enter a valid 10-digit phone number.");
      return;
    }

    const policy = paymentPolicyData?.policy ?? "none";

    if (policy === "none") {
      submitBooking({});
      return;
    }

    // Need Stripe — create an intent first
    setIsCreatingIntent(true);
    setPaymentError(null);
    try {
      if (policy === "card_on_file") {
        const res = await fetch("/api/public/booking-setup-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, customerName: customerName.trim(), customerEmail: customerEmail.trim() || undefined, customerPhone: customerPhone.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to initialize payment");
        setPaymentClientSecret(data.clientSecret);
        setIntentType("setup");
        setPendingStripeCustomerId(data.stripeCustomerId);
      } else {
        const serviceTotalCents = Math.round(totalPrice * 100);
        const res = await fetch("/api/public/booking-payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, customerName: customerName.trim(), customerEmail: customerEmail.trim() || undefined, customerPhone: customerPhone.trim(), serviceTotalCents }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to initialize payment");
        setPaymentClientSecret(data.clientSecret);
        setIntentType("payment");
        setPendingStripeCustomerId(data.stripeCustomerId);
        // Use server's authoritative deposit amount, not client calculation
        setDepositAmountCents(data.depositCents ?? serviceTotalCents);
      }
      setStep("payment");
    } catch (err: any) {
      setPaymentError(err.message ?? "Failed to initialize payment");
    } finally {
      setIsCreatingIntent(false);
    }
  };

  const navigateWeek = (direction: "prev" | "next") => {
    if (!weekStart) return;
    const newStart = direction === "next" ? addDays(weekStart, 7) : subDays(weekStart, 7);
    setWeekStart(newStart);
    setSelectedDate(newStart);
  };

  const isPhoneValid = customerPhone.replace(/\D/g, "").length === 10;
  const isReturningPhoneValid = returningPhone.replace(/\D/g, "").length === 10;

  if (bookingSuccess) {
    const confirmationDigits = customerPhone.replace(/\D/g, "");
    const confirmationUrl = confirmationDigits.length === 10
      ? `${window.location.origin}/booking/${confirmationDigits}?slug=${encodeURIComponent(slug)}`
      : null;
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
          <p className="text-gray-500 mb-4">
            Your appointment at {store.name} has been booked successfully.
          </p>
          {selectedSlot && (
            <p className="text-gray-700 font-medium mb-4">
              {formatInTz(selectedSlot.time, timezone, "EEEE, d MMMM yyyy 'at' h:mm a")}
            </p>
          )}

          {/* Payment confirmation */}
          {intentType === "setup" && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 text-left">
              <div className="flex items-center gap-2 text-blue-800 font-medium text-sm mb-0.5">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                Card securely stored
              </div>
              <p className="text-xs text-blue-600">No payment was taken today. Your card is on file for this appointment.</p>
            </div>
          )}
          {intentType === "payment" && depositAmountCents > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 text-left space-y-1">
              <div className="flex justify-between text-sm font-semibold text-green-800">
                <span>Deposit paid</span>
                <span>${(depositAmountCents / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Remaining at checkout</span>
                <span>${Math.max(0, totalPrice - depositAmountCents / 100).toFixed(2)}</span>
              </div>
            </div>
          )}

          {confirmationUrl && (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-gray-500">Confirmation number: {confirmationDigits}</p>
              <Button onClick={() => window.location.assign(confirmationUrl)} className="w-full">
                View Confirmation
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {preselectedStaff && (
        <div className="border-b bg-primary/5">
          <div className={cn("mx-auto px-4 py-3", step === "services" ? "max-w-5xl" : "max-w-2xl")}>
            <div className="flex items-center gap-3">
              {preselectedStaff.avatarUrl ? (
                <img
                  src={preselectedStaff.avatarUrl}
                  alt={preselectedStaff.name}
                  className="w-11 h-11 rounded-full object-cover border-2 border-white shadow-sm flex-shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-primary" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900">{preselectedStaff.name}</p>
                {preselectedStaff.bio && (
                  <p className="text-xs text-gray-500 leading-snug line-clamp-2">{preselectedStaff.bio}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className={cn("mx-auto", step === "services" ? "max-w-5xl" : "max-w-2xl")}>
        {step === "services" && (
          <div className="pb-24">
            {viewingAddonsForService && (
              <div className="fixed inset-0 z-[60] bg-white flex flex-col animate-in fade-in slide-in-from-bottom-10 duration-200">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-white sticky top-0">
                  <div>
                    <h2 className="font-semibold text-lg">Enhance your service</h2>
                    <p className="text-sm text-gray-500">Add-ons for {viewingAddonsForService.name}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setViewingAddonsForService(null)}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
                  {getAddonsForService(viewingAddonsForService.id).map((addon) => {
                    const isSelected = (selectedAddons[viewingAddonsForService.id] || []).includes(addon.id);
                    return (
                      <div
                        key={addon.id}
                        className={cn(
                          "border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md",
                          isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-gray-200"
                        )}
                        onClick={() => toggleAddon(viewingAddonsForService.id, addon.id)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-gray-900">{addon.name}</h3>
                            {addon.description && (
                              <p className="text-sm text-gray-500 mt-1">{addon.description}</p>
                            )}
                            <div className="mt-2 text-sm text-gray-500">+{addon.duration} min</div>
                          </div>
                          <div className="text-right">
                            {showPrices && (
                              <div className="font-semibold text-primary">
                                +${Number(addon.price).toFixed(2)}
                              </div>
                            )}
                            {isSelected && (
                              <CheckCircle2 className="w-5 h-5 text-primary mt-2 ml-auto" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="fixed bottom-0 left-0 right-0 bg-pink-50 border-t px-4 py-3 flex items-center justify-between gap-4 z-[60]">
                  <div>
                    <span className="text-sm font-medium">
                      {selectedServices.length} Service{selectedServices.length > 1 ? "s" : ""}
                    </span>
                    {showPrices && (
                      <span className="text-sm text-gray-500 ml-2">
                        ${totalPrice.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <Button onClick={() => {
                    setViewingAddonsForService(null);
                    handleChooseTime();
                  }}>
                    Choose Date/Time
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (activeCategory) {
                    setActiveCategory(null);
                  } else {
                    window.history.back();
                  }
                }}
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h2 className="font-semibold text-lg">
                {activeCategory ? activeCategory : "Select Category"}
              </h2>
            </div>

            <div className="px-4 py-2">
              {servicesLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-2">
                  {!activeCategory ? (
                    Object.keys(groupedServices).map((category) => (
                      <button
                        key={category}
                        className="w-full flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm hover:shadow-md transition-all text-left"
                        onClick={() => setActiveCategory(category)}
                        data-testid={`button-category-${category}`}
                      >
                        <div>
                          <span className="font-semibold text-gray-900 text-lg">
                            {category}
                          </span>
                          <p className="text-sm text-gray-500 mt-1">
                            {groupedServices[category].length} Service{groupedServices[category].length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </button>
                    ))
                  ) : (
                    <div className="space-y-3">
                      {groupedServices[activeCategory]?.map((service) => {
                        const isSelected = selectedServices.some(
                          (s) => s.id === service.id
                        );
                        return (
                          <div
                            key={service.id}
                            className={cn(
                              "border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md",
                              isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-gray-200 bg-white"
                            )}
                            onClick={() => toggleService(service)}
                            data-testid={`button-service-${service.id}`}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1 pr-4">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h3 className="font-semibold text-gray-900">{service.name}</h3>
                                  {service.options && service.options.length > 1 && !isSelected && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary text-white">
                                      {service.options.length} options
                                    </span>
                                  )}
                                </div>
                                {service.description && (
                                  <p className="text-sm text-gray-500 mt-1">{service.description}</p>
                                )}
                                <div className="mt-2 text-sm text-gray-500">{service.duration} min</div>
                              </div>
                              <div className="text-right flex flex-col items-end">
                                {showPrices && (
                                  <div className={cn(
                                    "font-semibold",
                                    isSelected ? "text-primary" : "text-gray-900"
                                  )}>
                                    {service.options && service.options.length > 1 ? "from " : ""}${Number(service.price).toFixed(2)}
                                  </div>
                                )}
                                {isSelected && (
                                  <CheckCircle2 className="w-5 h-5 text-primary mt-2" />
                                )}
                                {!isSelected && (
                                   <div className="w-5 h-5 rounded-full border border-gray-300 mt-2"></div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedServices.length > 0 && (
              <div className="fixed bottom-0 left-0 right-0 bg-pink-50 border-t px-4 py-3 flex items-center justify-between gap-4 z-50">
                <div>
                  <span className="text-sm font-medium">
                    {selectedServices.length} Service{selectedServices.length > 1 ? "s" : ""}
                  </span>
                  {showPrices && (
                    <span className="text-sm text-gray-500 ml-2" data-testid="text-total-price">
                      ${totalPrice.toFixed(2)}
                    </span>
                  )}
                </div>
                <Button onClick={handleChooseTime} data-testid="button-choose-staff">
                  Choose Date/Time
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "time" && (
          <div className="pb-6">
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setStep("services")}
                data-testid="button-back-services"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h2 className="font-semibold text-lg">Choose Time</h2>
            </div>

            {/* Calendar card */}
            <div className="px-4 pt-4 pb-2">
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-3 pt-3 pb-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => navigateWeek("prev")}
                    data-testid="button-week-prev"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-semibold text-gray-700">
                    {formatInTz(weekDays[0], timezone, "MMMM yyyy")}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => navigateWeek("next")}
                    data-testid="button-week-next"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-7 text-center px-1 py-3">
                  {weekDays.map((day) => {
                    const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                    const isToday = isSameDay(day, now);
                    const dayAbbrev = formatInTz(day, timezone, "EEE");
                    const dayNum = formatInTz(day, timezone, "d");
                    const monthAbbrev = formatInTz(day, timezone, "MMM");
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        data-testid={`button-day-${dayNum}`}
                        className="flex flex-col items-center gap-0.5"
                      >
                        <span className="text-[11px] font-medium text-gray-400 mb-1">{dayAbbrev}</span>
                        <span
                          className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                            isSelected
                              ? "bg-primary text-white shadow-sm"
                              : isToday
                                ? "border-2 border-primary text-primary"
                                : "text-gray-800 hover:bg-gray-50"
                          )}
                        >
                          {dayNum}
                        </span>
                        <span className="text-[10px] text-gray-400 leading-none mt-0.5">{monthAbbrev}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Time slots */}
            <div className="px-4 pt-3">
              <h3 className="text-center font-bold text-gray-900 text-base mb-1">
                What time works?
              </h3>
              {slotsLoading ? (
                <div className="flex items-center justify-center h-28">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : !slots || slots.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">
                  No available times for this date.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {slots.map((slot) => (
                    <Button
                      key={slot.time}
                      variant="outline"
                      className="text-sm h-11 rounded-xl border-gray-200 hover:border-primary hover:text-primary"
                      onClick={() => handleSelectSlot(slot)}
                      data-testid={`button-slot-${formatInTz(slot.time, timezone, "HH:mm")}`}
                    >
                      {formatInTz(slot.time, timezone, "h:mm a")}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setStep("time")}
                data-testid="button-back-time"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h2 className="font-semibold text-lg">Confirm Booking</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Your full name"
                  data-testid="input-customer-name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email (Optional)
                </label>
                <Input
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  data-testid="input-customer-email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <Input
                  value={customerPhone}
                  onChange={(e) => {
                    let value = e.target.value.replace(/\D/g, "");
                    if (value.length > 10) value = value.substring(0, 10);
                    if (value.length >= 6) {
                      value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
                    } else if (value.length >= 3) {
                      value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
                    }
                    setCustomerPhone(value);
                    if (phoneError) setPhoneError("");
                  }}
                  placeholder="(555) 555-5555"
                  type="tel"
                  data-testid="input-customer-phone"
                />
                {phoneError && (
                  <p className="text-xs text-destructive mt-1">{phoneError}</p>
                )}
              </div>

              {/* SMS opt-in consent */}
              <div className="border border-gray-200 rounded-lg p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsOptIn}
                    onChange={(e) => setSmsOptIn(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer shrink-0"
                  />
                  <span className="text-sm font-medium text-gray-800 leading-snug">
                    Get important appointment updates from Certxa LLC
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  By checking this box, you consent to receive automated text messages from Certxa LLC on behalf of your selected salon. Messages may include appointment confirmations, reminders, cancellations, rescheduling updates, and other appointment-related notifications. Consent is not a condition of purchase. Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe and HELP for help. View{" "}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold underline text-gray-700">TERMS</a>
                  {" "}&{" "}
                  <a href="/policy" target="_blank" rel="noopener noreferrer" className="font-semibold underline text-gray-700">PRIVACY</a>
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg mt-6">
                <h3 className="font-semibold mb-2">{primaryService?.name}</h3>
                <p className="text-sm text-gray-600 mb-1">
                  {selectedSlot &&
                    formatInTz(selectedSlot.time, timezone, "EEEE, d MMMM yyyy 'at' h:mm a")}
                </p>
                <p className="text-sm text-gray-600">
                  With {selectedSlot?.staffName}
                </p>
                {showPrices && (
                  <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span>${totalPrice.toFixed(2)}</span>
                    </div>
                    {primaryService?.depositRequired && primaryService?.depositAmount && (
                      <div className="flex justify-between text-sm text-amber-700 bg-amber-50 -mx-4 px-4 py-2 rounded mt-2">
                        <span>Deposit required today</span>
                        <span className="font-semibold">${Number(primaryService.depositAmount).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Payment policy notice */}
              {(() => {
                const policy = paymentPolicyData?.policy ?? "none";
                if (policy === "card_on_file") {
                  return (
                    <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mt-2">
                      <Lock className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-blue-800">
                        A payment method is required to secure your booking. <strong>No charge will be made today.</strong> Your card will be securely stored.
                      </p>
                    </div>
                  );
                }
                if (policy === "deposit") {
                  const depositCents = calculateDepositCents(totalPrice);
                  const depositDollars = depositCents / 100;
                  const remaining = totalPrice - depositDollars;
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mt-2 space-y-1">
                      <div className="flex justify-between text-sm text-gray-700">
                        <span>Service total</span>
                        <span>${totalPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold text-amber-800">
                        <span>Deposit due today</span>
                        <span>${depositDollars.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Remaining at checkout</span>
                        <span>${remaining.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {paymentError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {paymentError}
                </div>
              )}

              <Button
                className="w-full mt-4"
                onClick={handleConfirmBooking}
                disabled={!customerName.trim() || !isPhoneValid || bookMutation.isPending || isCreatingIntent}
                data-testid="button-confirm-booking"
              >
                {(bookMutation.isPending || isCreatingIntent) ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (paymentPolicyData?.policy && paymentPolicyData.policy !== "none") ? (
                  <Lock className="w-4 h-4 mr-2" />
                ) : null}
                {paymentPolicyData?.policy === "card_on_file"
                  ? "Continue to Save Card"
                  : paymentPolicyData?.policy === "deposit"
                    ? "Continue to Pay Deposit"
                    : "Confirm Booking"}
              </Button>
            </div>
          </div>
        )}

        {step === "payment" && stripeInstance && paymentClientSecret && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setStep("confirm")}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h2 className="font-semibold text-lg">
                {intentType === "setup" ? "Save Payment Method" : "Pay Deposit"}
              </h2>
            </div>

            {/* Booking summary recap */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-1">
              <p className="font-semibold text-gray-900">{primaryService?.name}</p>
              <p className="text-sm text-gray-600">
                {selectedSlot && formatInTz(selectedSlot.time, timezone, "EEEE, d MMMM yyyy 'at' h:mm a")}
              </p>
              <p className="text-sm text-gray-500">With {selectedSlot?.staffName}</p>
              {intentType === "payment" && depositAmountCents > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Service total</span>
                    <span>${totalPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-amber-800">
                    <span>Deposit due now</span>
                    <span>${(depositAmountCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Remaining at checkout</span>
                    <span>${(totalPrice - depositAmountCents / 100).toFixed(2)}</span>
                  </div>
                </div>
              )}
              {intentType === "setup" && (
                <div className="mt-3 pt-3 border-t border-gray-200 flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-blue-800">
                    Your card will be securely stored. <strong>No charge will be made today.</strong>
                  </p>
                </div>
              )}
            </div>

            <Elements
              stripe={stripeInstance}
              options={{
                clientSecret: paymentClientSecret,
                appearance: { theme: "stripe", variables: { colorPrimary: "#e11d48" } },
              }}
            >
              <PaymentForm
                intentType={intentType}
                depositAmountCents={depositAmountCents}
                onSuccess={(paymentInfo) =>
                  submitBooking({
                    ...paymentInfo,
                    stripeCustomerId: pendingStripeCustomerId,
                  })
                }
                onBack={() => setStep("confirm")}
              />
            </Elements>
          </div>
        )}

        {step === "payment" && (!stripeInstance || !paymentClientSecret) && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-gray-500">Preparing payment…</p>
          </div>
        )}
      </main>

      {/* Option Picker Modal */}
      {optionPickerService && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b">
              <h3 className="font-semibold text-base">{optionPickerService.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">Choose an option to continue</p>
            </div>
            <div className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
              {optionPickerService.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handlePickOption(optionPickerService, opt)}
                  className="w-full text-left p-3 rounded-xl border-2 border-gray-200 hover:border-primary hover:bg-primary/5 transition flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-sm">{opt.name}</p>
                    {opt.description && <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{opt.durationMinutes} min</p>
                  </div>
                  {showPrices && (
                    <span className="font-semibold text-sm ml-4 shrink-0">${Number(opt.price).toFixed(2)}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="px-4 pb-4 pt-2">
              <button
                onClick={() => setOptionPickerService(null)}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
