import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Home,
  User,
  Users,
  Calendar,
  ShoppingBag,
  Star,
  Scissors,
  Clock,
  MapPin,
  Smile,
  Plus,
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

interface MobileThemeProps {
  store: StoreData;
  slug: string;
  preselectedStaffId?: number;
  preselectedServiceId?: number;
}

type ViewState = "client" | "home" | "category" | "time" | "confirm" | "payment" | "profile";

// ── Inner Stripe payment form ─────────────────────────────────────────────────
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
      <Button className="w-full mt-2 h-14 text-base rounded-xl" onClick={handleSubmit} disabled={isSubmitting || !stripe}>
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : (
          <Lock className="w-4 h-4 mr-2" />
        )}
        {intentType === "setup"
          ? "Save Card & Confirm Booking"
          : `Pay $${(depositAmountCents / 100).toFixed(2)} & Confirm`}
      </Button>
      <Button variant="ghost" className="w-full text-sm text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Change booking details
      </Button>
    </div>
  );
}

export default function MobileTheme({ store, slug, preselectedStaffId, preselectedServiceId }: MobileThemeProps) {
  const [searchParams] = useSearchParams();
  const hideHeader = searchParams.get("embed") === "true" || searchParams.get("hideHeader") === "true";
  const [view, setView] = useState<ViewState>("home");
  const [clientType, setClientType] = useState<"new" | "returning" | null>("new");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<ServiceData[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<Record<number, number[]>>({});
  const [viewingAddonsForService, setViewingAddonsForService] = useState<ServiceData | null>(null);
  const [optionPickerService, setOptionPickerService] = useState<ServiceData | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [preselectedStaffName, setPreselectedStaffName] = useState<string | null>(null);
  const preselectionAppliedRef = useRef<number | null>(null);

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
  
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [returningPhone, setReturningPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // ── Payment policy / Stripe ──────────────────────────────────────────────
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [intentType, setIntentType] = useState<"setup" | "payment" | null>(null);
  const [pendingStripeCustomerId, setPendingStripeCustomerId] = useState<string | null>(null);
  const [depositAmountCents, setDepositAmountCents] = useState<number>(0);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const timezone = store.timezone || "UTC";

  const { data: servicesData, isLoading: servicesLoading } = useQuery<{
    services: ServiceData[];
    categories: CategoryData[];
    addons: AddonData[];
    serviceAddons: ServiceAddonData[];
  }>({
    queryKey: [`/api/public/store/${slug}/services`],
    enabled: !!slug,
  });

  const { data: publicStoreData } = useQuery<{ showPrices?: boolean }>({
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

  const services = servicesData?.services || [];
  const addons = servicesData?.addons || [];
  const serviceAddons = servicesData?.serviceAddons || [];
  const showPrices = publicStoreData?.showPrices ?? true;

  const totalPrice = selectedServices.reduce((sum, s) => {
    let price = Number(s.price);
    const sAddons = selectedAddons[s.id] || [];
    sAddons.forEach(addonId => {
      const addon = addons.find(a => a.id === addonId);
      if (addon) price += Number(addon.price);
    });
    return sum + price;
  }, 0);

  const totalDuration = selectedServices.reduce((sum, s) => {
    let duration = s.duration;
    const sAddons = selectedAddons[s.id] || [];
    sAddons.forEach(addonId => {
      const addon = addons.find(a => a.id === addonId);
      if (addon) duration += addon.duration;
    });
    return sum + duration;
  }, 0);

  const getAddonsForService = (serviceId: number) => {
    const mappings = serviceAddons.filter(sa => sa.serviceId === serviceId);
    const addonIds = new Set(mappings.map(sa => sa.addonId));
    return addons.filter(a => addonIds.has(a.id));
  };
  
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

  const profilePhone = customerPhone || returningPhone;
  const { data: history, isLoading: historyLoading } = useQuery<any[]>({
    queryKey: ["/api/public/store", slug, "history", profilePhone],
    queryFn: async () => {
      if (!profilePhone) return [];
      const res = await fetch(`/api/public/store/${slug}/customer-history?phone=${encodeURIComponent(profilePhone)}`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: view === "profile" && !!profilePhone,
  });

  const stats = useMemo(() => {
    if (!history) return { spend: 0, deposit: 0, noshow: 0, cancel: 0 };
    return history.reduce((acc, apt) => {
      if (apt.status === "completed") {
         const price = Number(apt.service?.price || 0); 
         const addonsPrice = apt.appointmentAddons?.reduce((sum: number, aa: any) => sum + Number(aa.addon?.price || 0), 0) || 0;
         acc.spend += price + addonsPrice;
      }
      if (apt.status === "cancelled") acc.cancel++;
      if (apt.status === "no_show") acc.noshow++;
      return acc;
    }, { spend: 0, deposit: 0, noshow: 0, cancel: 0 });
  }, [history]);

  const submitBooking = useCallback((paymentInfo: Record<string, any>) => {
    if (!primaryService || !selectedSlot) return;
    const allAddonIds = Object.values(selectedAddons).flat();
    bookMutation.mutate({
      serviceId: primaryService.id,
      staffId: selectedSlot.staffId,
      date: selectedSlot.time,
      duration: totalDuration,
      customerName: customerName.trim() || "Guest",
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: customerPhone.trim(),
      addonIds: allAddonIds,
      smsOptIn,
      ...paymentInfo,
    });
  }, [primaryService, selectedSlot, selectedAddons, totalDuration, customerName, customerEmail, customerPhone, smsOptIn]);

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
      const now = new Date();
      const currentHour = parseInt(formatInTz(now, timezone, "H"));
      const startDate = currentHour >= 12 ? addDays(today, 1) : today;
      setSelectedDate(startDate);
      setWeekStart(startDate);
    }
  }, [timezone]);

  // Pre-fill phone from stored session
  useMemo(() => {
    const storedPhone = localStorage.getItem(`booking_user_phone_${slug}`);
    if (storedPhone) {
      setCustomerPhone(storedPhone);
      setReturningPhone(storedPhone);
    }
  }, [slug]);

  const weekDays = useMemo(() => {
    if (!weekStart) return [];
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

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

  const groupedServices = useMemo(() => {
    const groups: Record<string, ServiceData[]> = {};
    for (const s of services) {
      const cat = s.category || "General";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    }
    return groups;
  }, [services]);

  const categoriesList = Object.keys(groupedServices);

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

  const handleCategorySelect = (category: string) => {
    setActiveCategory(category);
    setView("category");
  };

  const handleServiceSelect = (service: ServiceData) => {
    if (service.options && service.options.length > 1) {
      setOptionPickerService(service);
      return;
    }
    const serviceAddonsList = getAddonsForService(service.id);
    if (serviceAddonsList.length > 0) {
      setViewingAddonsForService(service);
    } else {
      setSelectedServices([service]);
      setView("time");
    }
  };

  // Service cards link here with the exact service ID so customers go straight
  // to date/time selection instead of having to pick the service again.
  useEffect(() => {
    const requestedServiceId = Number(preselectedServiceId);
    if (!Number.isFinite(requestedServiceId) || requestedServiceId <= 0 || services.length === 0 || preselectionAppliedRef.current === requestedServiceId) {
      return;
    }
    const service = services.find((candidate) => candidate.id === requestedServiceId);
    if (!service) return;
    preselectionAppliedRef.current = requestedServiceId;
    handleServiceSelect(service);
  }, [preselectedServiceId, services]);

  const handlePickOption = (service: ServiceData, option: ServiceOptionData) => {
    const serviceWithOption: ServiceData = {
      ...service,
      duration: option.durationMinutes,
      price: option.price,
      name: `${service.name} – ${option.name}`,
      options: [],
    };
    const serviceAddonsList = getAddonsForService(service.id);
    if (serviceAddonsList.length > 0) {
      setViewingAddonsForService(serviceWithOption);
    } else {
      setSelectedServices([serviceWithOption]);
      setView("time");
    }
    setOptionPickerService(null);
  };
  
  const confirmServiceWithAddons = () => {
    if (viewingAddonsForService) {
      setSelectedServices([viewingAddonsForService]);
      setViewingAddonsForService(null);
      setView("time");
    }
  };

  const handleSelectSlot = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    setView("confirm");
  };

  const handleConfirmBooking = async () => {
    if (!primaryService || !selectedSlot) return;
    if (clientType === "new" && !customerName.trim()) return;
    if (clientType === "returning" && !customerPhone.trim()) return;

    const phoneDigits = customerPhone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      setPhoneError("Enter a valid 10-digit phone number.");
      return;
    }

    const policy = paymentPolicyData?.policy ?? "none";

    if (policy === "none") {
      submitBooking({});
      return;
    }

    setIsCreatingIntent(true);
    setPaymentError(null);
    try {
      if (policy === "card_on_file") {
        const res = await fetch("/api/public/booking-setup-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, customerName: customerName.trim() || "Guest", customerEmail: customerEmail.trim() || undefined, customerPhone: customerPhone.trim() }),
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
          body: JSON.stringify({ slug, customerName: customerName.trim() || "Guest", customerEmail: customerEmail.trim() || undefined, customerPhone: customerPhone.trim(), serviceTotalCents }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to initialize payment");
        setPaymentClientSecret(data.clientSecret);
        setIntentType("payment");
        setPendingStripeCustomerId(data.stripeCustomerId);
        setDepositAmountCents(data.depositCents ?? serviceTotalCents);
      }
      setView("payment");
    } catch (err: any) {
      setPaymentError(err.message ?? "Failed to initialize payment");
    } finally {
      setIsCreatingIntent(false);
    }
  };

  const closingTime = useMemo(() => {
    if (!store.businessHours) return null;
    const today = getNowInTimezone(timezone);
    const dayOfWeek = today.getDay();
    const todayHours = store.businessHours.find(h => h.dayOfWeek === dayOfWeek);
    if (!todayHours || todayHours.isClosed) return null;
    const [h, m] = todayHours.closeTime.split(':');
    const date = new Date();
    date.setHours(parseInt(h), parseInt(m));
    return formatInTz(date, timezone, "h:mm a");
  }, [store, timezone]);

  const navigateWeek = (direction: "prev" | "next") => {
    if (!weekStart) return;
    const newStart = direction === "next" ? addDays(weekStart, 7) : subDays(weekStart, 7);
    setWeekStart(newStart);
    setSelectedDate(newStart);
  };

  if (bookingSuccess) {
    const confirmationDigits = customerPhone.replace(/\D/g, "");
    const confirmationUrl = confirmationDigits.length === 10
      ? `${window.location.origin}/booking/${confirmationDigits}?slug=${encodeURIComponent(slug)}`
      : null;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6 shadow-lg">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
          <p className="text-gray-500 mb-4">
            Your appointment at {store.name} has been booked successfully.
          </p>
          {selectedSlot && (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4">
               <p className="text-gray-900 font-semibold text-lg">{primaryService?.name}</p>
               <p className="text-gray-500 text-sm mt-1">
                 {formatInTz(selectedSlot.time, timezone, "EEEE, d MMMM yyyy")}
               </p>
               <p className="text-primary font-medium mt-1">
                 {formatInTz(selectedSlot.time, timezone, "h:mm a")}
               </p>
            </div>
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
            <div className="mb-6 space-y-2">
              <p className="text-sm text-gray-500">Confirmation number: {confirmationDigits}</p>
              <Button onClick={() => window.location.assign(confirmationUrl)} className="w-full rounded-full h-12 text-base">
                View Confirmation
              </Button>
            </div>
          )}
          <Button onClick={() => window.location.reload()} variant="outline" className="w-full rounded-full h-12 text-base">
            Book Another
          </Button>
        </div>
      </div>
    );
  }

  const headerBg = "bg-primary";
  const isPhoneValid = customerPhone.replace(/\D/g, "").length === 10;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans relative pb-20">

      <main className="flex-1 px-4 -mt-2 z-20 overflow-y-auto">
        {preselectedStaff && (
          <div className="mb-4 mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            {preselectedStaff.avatarUrl ? (
              <img
                src={preselectedStaff.avatarUrl}
                alt={preselectedStaff.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-primary/20 flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="w-6 h-6 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-900">{preselectedStaff.name}</p>
              {preselectedStaff.bio ? (
                <p className="text-xs text-gray-500 leading-snug line-clamp-2 mt-0.5">{preselectedStaff.bio}</p>
              ) : (
                <p className="text-xs text-primary font-medium mt-0.5">Your chosen stylist</p>
              )}
            </div>
          </div>
        )}

        {(view === "home" || view === "category") && (
          <div className="pb-8">
            {/* Store header card */}
            {!hideHeader && (
              <div className={cn("rounded-2xl p-6 mb-6 mt-4 text-white shadow-lg", headerBg)}>
                <h1 className="text-2xl font-bold">{store.name}</h1>
                {store.address && (
                  <div className="flex items-center gap-1 mt-2 text-white/80 text-sm">
                    <MapPin className="w-4 h-4" />
                    <span>{store.address}</span>
                  </div>
                )}
                {closingTime && (
                  <div className="flex items-center gap-1 mt-1 text-white/80 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>Closes at {closingTime}</span>
                  </div>
                )}
              </div>
            )}

            {/* Quick book pill */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
              <button
                onClick={() => setView("time")}
                disabled={!primaryService}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-white text-sm font-medium shadow disabled:opacity-40"
              >
                <Calendar className="w-4 h-4" />
                {primaryService ? "Choose Time" : "Select a Service First"}
              </button>
            </div>

            {/* Category list */}
            <h2 className="font-bold text-lg text-gray-900 mb-3">Services</h2>
            {servicesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
              </div>
            ) : view === "home" ? (
              <div className="space-y-3">
                {categoriesList.map(cat => (
                  <button
                    key={cat}
                    onClick={() => handleCategorySelect(cat)}
                    className="w-full flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Scissors className="w-5 h-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-gray-900">{cat}</p>
                        <p className="text-xs text-gray-500">{groupedServices[cat].length} service{groupedServices[cat].length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300" />
                  </button>
                ))}
              </div>
            ) : (
              /* Category services */
              <div>
                <button
                  onClick={() => setView("home")}
                  className="flex items-center gap-1.5 text-sm text-gray-500 mb-4 hover:text-gray-700"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to categories
                </button>
                <h3 className="font-bold text-gray-900 mb-3">{activeCategory}</h3>
                <div className="space-y-3">
                  {(groupedServices[activeCategory!] || []).map(service => {
                    const isSelected = selectedServices.some(s => s.id === service.id);
                    return (
                      <button
                        key={service.id}
                        onClick={() => handleServiceSelect(service)}
                        className={cn(
                          "w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-md"
                            : "border-gray-100 bg-white shadow-sm hover:border-primary/40"
                        )}
                      >
                        <div className="text-left">
                          <p className="font-semibold text-gray-900">{service.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{service.duration} min</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {showPrices && <span className="font-bold text-primary">${Number(service.price).toFixed(2)}</span>}
                          {isSelected
                            ? <CheckCircle2 className="w-5 h-5 text-primary" />
                            : <Plus className="w-5 h-5 text-gray-300" />
                          }
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedServices.length > 0 && (
                  <div className="mt-4">
                    <Button onClick={() => setView("time")} className="w-full h-12 rounded-xl">
                      Choose Date & Time →
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {view === "time" && (
          <div className="pb-8">
            <div className="flex items-center gap-2 mb-6 mt-4">
              <Button variant="ghost" size="icon" onClick={() => setView("home")} className="-ml-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-xl font-bold text-gray-800">Choose Time</h2>
            </div>

            {!primaryService ? (
              <div className="text-center py-12 text-gray-500">
                <p>Please select a service first.</p>
                <Button variant="ghost" onClick={() => setView("home")} className="mt-2">Back to Services</Button>
              </div>
            ) : (
              <>
                {/* Week calendar */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => navigateWeek("prev")} className="p-1.5 rounded-lg hover:bg-gray-100">
                      <ChevronLeft className="w-5 h-5 text-gray-500" />
                    </button>
                    <span className="text-sm font-semibold text-gray-700">
                      {weekDays[0] && formatInTz(weekDays[0], timezone, "MMM d")} – {weekDays[6] && formatInTz(weekDays[6], timezone, "MMM d, yyyy")}
                    </span>
                    <button onClick={() => navigateWeek("next")} className="p-1.5 rounded-lg hover:bg-gray-100">
                      <ChevronRight className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {weekDays.map((day, i) => {
                      const isToday = isSameDay(day, getNowInTimezone(timezone));
                      const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedDate(day)}
                          className={cn(
                            "flex flex-col items-center py-2 rounded-xl transition-all",
                            isSelected ? "bg-primary text-white" : isToday ? "bg-primary/10 text-primary" : "hover:bg-gray-50 text-gray-600"
                          )}
                        >
                          <span className="text-[10px] font-medium">{formatInTz(day, timezone, "EEE")}</span>
                          <span className="text-sm font-bold mt-0.5">{formatInTz(day, timezone, "d")}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Slots */}
                {slotsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                ) : !slots || slots.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 bg-white rounded-2xl border border-dashed border-gray-200">
                    No availability for this day
                  </div>
                ) : (
                  <div className="space-y-4">
                    {[
                      { label: "Morning", items: groupedSlots.morning },
                      { label: "Afternoon", items: groupedSlots.afternoon },
                      { label: "Evening", items: groupedSlots.evening },
                    ].filter(g => g.items.length > 0).map(group => (
                      <div key={group.label}>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group.label}</p>
                        <div className="grid grid-cols-3 gap-2">
                          {group.items.map((slot, i) => (
                            <button
                              key={i}
                              onClick={() => handleSelectSlot(slot)}
                              className="bg-white border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-800 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all shadow-sm"
                            >
                              {formatInTz(slot.time, timezone, "h:mm a")}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {view === "confirm" && (
            <div className="pb-8">
                 <div className="flex items-center gap-2 mb-6 mt-4">
                    <Button variant="ghost" size="icon" onClick={() => setView("time")} className="-ml-2">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h2 className="text-xl font-bold text-gray-800">Confirm</h2>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
                    <div className="flex items-start gap-4 border-b border-gray-100 pb-4 mb-4">
                        <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Scissors className="w-8 h-8 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-gray-900">{primaryService?.name}</h3>
                            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                                <Clock className="w-4 h-4" /> {primaryService?.duration} min
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                                <User className="w-4 h-4" /> {selectedSlot?.staffName}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-gray-500">Date</span>
                        <span className="font-medium">{selectedSlot && formatInTz(selectedSlot.time, timezone, "d MMM yyyy")}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-500">Time</span>
                        <span className="font-medium">{selectedSlot && formatInTz(selectedSlot.time, timezone, "h:mm a")}</span>
                    </div>

                    {/* Payment policy info */}
                    {paymentPolicyData?.policy === "card_on_file" && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-start gap-2">
                        <Lock className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                        <p className="text-sm text-blue-800">
                          A card is required to secure your booking. <strong>No charge will be made today.</strong>
                        </p>
                      </div>
                    )}
                    {paymentPolicyData?.policy === "deposit" && (() => {
                      const depositDollars = paymentPolicyData.depositType === "percentage"
                        ? totalPrice * ((paymentPolicyData.depositValue ?? 0) / 100)
                        : (paymentPolicyData.depositValue ?? 0);
                      const remaining = totalPrice - depositDollars;
                      return (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                          {showPrices && (
                            <div className="flex justify-between text-sm text-gray-600">
                              <span>Service total</span>
                              <span>${totalPrice.toFixed(2)}</span>
                            </div>
                          )}
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
                    })()}
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6 space-y-4">
                     <h3 className="font-bold text-gray-900">Your Details</h3>
                     <Input 
                        placeholder="Full Name" 
                        value={customerName} 
                        onChange={e => setCustomerName(e.target.value)} 
                        className="bg-gray-50 border-transparent focus:bg-white transition-all"
                     />
                     <Input 
                        placeholder="Phone Number (555) 555-5555" 
                        value={customerPhone} 
                        onChange={e => {
                          let value = e.target.value.replace(/\D/g, '');
                          if (value.length > 10) value = value.substring(0, 10);
                          if (value.length >= 6) {
                            value = `(${value.slice(0,3)}) ${value.slice(3,6)}-${value.slice(6)}`;
                          } else if (value.length >= 3) {
                            value = `(${value.slice(0,3)}) ${value.slice(3)}`;
                          }
                          setCustomerPhone(value);
                          if (phoneError) setPhoneError("");
                        }}
                        className="bg-gray-50 border-transparent focus:bg-white transition-all text-lg py-6" 
                     />
                     {phoneError && (
                       <p className="text-xs text-destructive">{phoneError}</p>
                     )}
                     <Input 
                        placeholder="Email (Optional)" 
                        value={customerEmail} 
                        onChange={e => setCustomerEmail(e.target.value)}
                        className="bg-gray-50 border-transparent focus:bg-white transition-all"
                     />
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
                </div>

                {paymentError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
                    {paymentError}
                  </div>
                )}

                <Button 
                    onClick={handleConfirmBooking} 
                    disabled={bookMutation.isPending || isCreatingIntent || !customerName.trim() || !isPhoneValid}
                    className="w-full h-14 text-lg rounded-xl shadow-lg"
                >
                    {(bookMutation.isPending || isCreatingIntent) ? (
                      <Loader2 className="animate-spin mr-2" />
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
        )}

        {/* Payment step */}
        {view === "payment" && stripeInstance && paymentClientSecret && (
          <div className="pb-8 mt-4">
            <div className="flex items-center gap-2 mb-6">
              <Button variant="ghost" size="icon" onClick={() => setView("confirm")} className="-ml-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-xl font-bold text-gray-800">
                {intentType === "setup" ? "Save Payment Method" : "Pay Deposit"}
              </h2>
            </div>

            {/* Booking recap */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 space-y-1">
              <p className="font-semibold text-gray-900">{primaryService?.name}</p>
              <p className="text-sm text-gray-600">
                {selectedSlot && formatInTz(selectedSlot.time, timezone, "EEEE, d MMMM yyyy 'at' h:mm a")}
              </p>
              <p className="text-sm text-gray-500">With {selectedSlot?.staffName}</p>
              {intentType === "payment" && depositAmountCents > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
                  {showPrices && (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Service total</span>
                      <span>${totalPrice.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold text-amber-800">
                    <span>Deposit due now</span>
                    <span>${(depositAmountCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Remaining at checkout</span>
                    <span>${Math.max(0, totalPrice - depositAmountCents / 100).toFixed(2)}</span>
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
                  submitBooking({ ...paymentInfo, stripeCustomerId: pendingStripeCustomerId })
                }
                onBack={() => setView("confirm")}
              />
            </Elements>
          </div>
        )}

        {view === "payment" && (!stripeInstance || !paymentClientSecret) && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 mt-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-gray-500">Preparing payment…</p>
          </div>
        )}

        {view === "profile" && (
            <div className="pb-24">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Profile</h2>
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-gray-200">
                        <div className="flex flex-col gap-[3px]">
                            <div className="w-1 h-1 rounded-full bg-gray-600"></div>
                            <div className="w-1 h-1 rounded-full bg-gray-600"></div>
                            <div className="w-1 h-1 rounded-full bg-gray-600"></div>
                        </div>
                    </Button>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
                    <div className="flex flex-col items-center mb-6">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                             <User className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="font-bold text-lg text-gray-900">{customerName || "Guest User"}</h3>
                        <div className="flex items-center gap-2 text-gray-500 text-sm mt-1">
                            <span className="flex items-center gap-1"><User className="w-3 h-3" /> {customerPhone || returningPhone || "No phone"}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                            <div className="text-xs text-gray-500 mb-1">Total Spend</div>
                            <div className="font-bold text-gray-900">${stats.spend.toFixed(2)}</div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                            <div className="text-xs text-gray-500 mb-1">Deposit</div>
                            <div className="font-bold text-gray-900">$0.00</div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                            <div className="text-xs text-gray-500 mb-1">No-Shows</div>
                            <div className="font-bold text-gray-900">{stats.noshow}</div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                            <div className="text-xs text-gray-500 mb-1">Cancellations</div>
                            <div className="font-bold text-gray-900">{stats.cancel}</div>
                        </div>
                    </div>
                </div>

                <h3 className="font-bold text-lg text-gray-900 mb-4">Recent Appointments</h3>
                
                {historyLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                ) : history && history.length > 0 ? (
                    <div className="space-y-4">
                        {history.map((apt) => {
                            const price = Number(apt.service?.price || 0);
                            const addonsPrice = apt.appointmentAddons?.reduce((sum: number, aa: any) => sum + Number(aa.addon?.price || 0), 0) || 0;
                            const total = price + addonsPrice;
                            const duration = apt.duration || apt.service?.duration || 0;

                            return (
                                <div key={apt.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                                        <span className="text-sm text-gray-500">{formatInTz(new Date(apt.date), timezone, "d MMM, yyyy, h:mm a")}</span>
                                        <span className={cn(
                                            "text-xs font-medium px-2 py-1 rounded-full border capitalize",
                                            apt.status === 'confirmed' ? "text-blue-600 bg-blue-50 border-blue-100" : 
                                            apt.status === 'completed' ? "text-green-600 bg-green-50 border-green-100" :
                                            apt.status === 'cancelled' ? "text-red-600 bg-red-50 border-red-100" :
                                            "text-gray-600 bg-gray-50 border-gray-100"
                                        )}>{apt.status || "Pending"}</span>
                                    </div>
                                    <div className="p-4">
                                        <h4 className="font-bold text-gray-900 mb-1">{apt.service?.name}</h4>
                                        <p className="text-sm text-gray-500 mb-2">{apt.service?.category}</p>
                                        <p className="text-sm text-gray-500">{apt.staff?.name || "Any Staff"} | $ {price.toFixed(2)} | {duration} mins</p>
                                    </div>
                                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                        <span className="font-medium text-gray-900">Total:</span>
                                        <span className="font-bold text-gray-900">$ {total.toFixed(2)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        No recent appointments found
                    </div>
                )}
                
                <div className="text-center mt-4">
                    <Button variant="ghost" className="text-sm font-semibold text-gray-900 hover:bg-transparent">
                        VIEW MORE
                    </Button>
                </div>
            </div>
        )}

      </main>
      
      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-2 flex justify-between items-center z-50 pb-safe">
        <button 
            className={`flex flex-col items-center gap-1 ${view === 'home' || view === 'category' ? 'text-primary' : 'text-gray-400'}`}
            onClick={() => setView('home')}
        >
            <Home className="w-6 h-6" />
            <span className="text-[10px] font-medium">Home</span>
        </button>
        
        <button className="flex flex-col items-center gap-1 text-gray-400 relative">
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full text-[10px] text-primary-foreground flex items-center justify-center border-2 border-white">0</div>
            <ShoppingBag className="w-6 h-6" />
            <span className="text-[10px] font-medium">Cart</span>
        </button>

        <button className={cn("flex flex-col items-center gap-1", view === "profile" ? "text-primary" : "text-gray-400")} onClick={() => setView("profile")}>
            <User className="w-6 h-6" />
            <span className="text-[10px] font-medium">Profile</span>
        </button>
      </div>

      <style>{`
        .pb-safe {
            padding-bottom: env(safe-area-inset-bottom, 20px);
        }
      `}</style>

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
            <Button onClick={confirmServiceWithAddons}>
              Choose Date/Time
            </Button>
          </div>
        </div>
      )}
      {/* Option Picker Modal */}
      {optionPickerService && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
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
