import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  X,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  MapPin,
  Loader2,
  CheckCircle2,
  User,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInTz, getNowInTimezone } from "@/lib/timezone";
import { apiRequest } from "@/lib/queryClient";
import { addDays, subDays, isSameDay } from "date-fns";
import { StoreData, ServiceData, ServiceOptionData, CategoryData, TimeSlot } from "./types";
import { detectBrowserLang, BOOKING_STRINGS } from "@/lib/bookingTranslations";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";

type Step = "client" | "services" | "time" | "confirm" | "payment";

interface ClassicThemeProps {
  store: StoreData;
  slug: string;
  preselectedStaffId?: number;
  preselectedServiceId?: number;
}

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
      <Button className="w-full mt-2" onClick={handleSubmit} disabled={isSubmitting || !stripe}>
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

export default function ClassicTheme({ store, slug, preselectedStaffId, preselectedServiceId }: ClassicThemeProps) {
  const [searchParams] = useSearchParams();
  const hideHeader = searchParams.get("embed") === "true" || searchParams.get("hideHeader") === "true";
  const [step, setStep] = useState<Step>("services");
  const [clientType, setClientType] = useState<"new" | "returning" | null>("new");
  const [returningPhone, setReturningPhone] = useState("");
  const [selectedServices, setSelectedServices] = useState<ServiceData[]>([]);
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
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [optionPickerService, setOptionPickerService] = useState<ServiceData | null>(null);
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

  const { data: servicesData, isLoading: servicesLoading } = useQuery<{
    services: ServiceData[];
    categories: CategoryData[];
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
  const categories = servicesData?.categories || [];

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
  const showPrices = publicStoreData?.showPrices ?? true;

  const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);
  const primaryService = selectedServices[0];

  const dateString = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
    : null;

  const { data: slots, isLoading: slotsLoading } = useQuery<TimeSlot[]>({
    queryKey: [
      "/api/public/store",
      slug,
      "availability",
      primaryService?.id,
      dateString,
      totalDuration,
      preselectedStaffId,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        serviceId: String(primaryService!.id),
        date: dateString!,
        duration: String(totalDuration),
      });
      if (preselectedStaffId) params.set("staffId", String(preselectedStaffId));
      const res = await fetch(
        `/api/public/store/${slug}/availability?${params}`,
        { credentials: "include" }
      );
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

  const submitBooking = useCallback((paymentInfo: Record<string, any>) => {
    if (!primaryService || !selectedSlot) return;
    bookMutation.mutate({
      serviceId: primaryService.id,
      staffId: selectedSlot.staffId,
      date: selectedSlot.time,
      duration: totalDuration,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      smsOptIn,
      ...paymentInfo,
    });
  }, [primaryService, selectedSlot, totalDuration, customerName, customerEmail, customerPhone, smsOptIn]);

  const bookMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/public/store/${slug}/book`, body);
      return res.json();
    },
    onSuccess: () => {
      setBookingSuccess(true);
    },
  });

  const now = useMemo(() => {
    return getNowInTimezone(timezone);
  }, [timezone]);

  if (selectedDate === null) {
    const today = getNowInTimezone(timezone);
    setSelectedDate(today);
    setWeekStart(today);
  }

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
    if (!slots)
      return { morning: [], afternoon: [], evening: [] };
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

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleService = (service: ServiceData) => {
    const exists = selectedServices.find((s) => s.id === service.id);
    if (exists) {
      setSelectedServices((prev) => prev.filter((s) => s.id !== service.id));
      return;
    }
    if (service.options && service.options.length > 1) {
      setOptionPickerService(service);
    } else {
      setSelectedServices((prev) => [...prev, service]);
    }
  };

  const handlePickOption = (service: ServiceData, option: ServiceOptionData) => {
    const serviceWithOption: ServiceData = {
      ...service,
      duration: option.durationMinutes,
      price: option.price,
      name: `${service.name} – ${option.name}`,
    };
    setSelectedServices((prev) => [...prev, serviceWithOption]);
    setOptionPickerService(null);
  };

  const handleClientSelect = (type: "new" | "returning") => {
    setClientType(type);
    if (type === "new") {
      setStep("services");
    }
  };

  const handleReturningContinue = () => {
    if (clientType === "returning") {
      setCustomerPhone(returningPhone);
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

  const handleConfirmBooking = async () => {
    if (!primaryService || !selectedSlot || !customerName.trim()) return;

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
    const newStart =
      direction === "next" ? addDays(weekStart, 7) : subDays(weekStart, 7);
    setWeekStart(newStart);
    setSelectedDate(newStart);
  };

  const isPhoneValid = customerPhone.replace(/\D/g, "").length === 10;

  if (!store) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Store not found</h2>
          <p className="text-gray-500 mt-2">This booking page doesn't exist.</p>
        </div>
      </div>
    );
  }

  if (bookingSuccess) {
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {preselectedStaff && (
        <div className="border-b bg-primary/5">
          <div className="max-w-2xl mx-auto px-4 py-3">
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

      <main className="max-w-2xl mx-auto">
        {step === "services" && (
          <div className="pb-24">
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => window.history.back()}
                data-testid="button-back-client"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h2 className="font-semibold text-lg">Select Service</h2>
            </div>

            <div className="px-4 py-2">
              {servicesLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(groupedServices).map(([category, categoryServices]) => {
                    const isCollapsed = collapsedCategories.has(category);
                    return (
                      <div key={category}>
                        <button
                          className="w-full flex items-center justify-between py-3 px-1 text-left"
                          onClick={() => toggleCategory(category)}
                          data-testid={`button-category-${category}`}
                        >
                          <span className="font-semibold text-sm text-gray-700 uppercase tracking-wide">
                            {category}
                          </span>
                          <ChevronDown
                            className={cn(
                              "w-4 h-4 text-gray-400 transition-transform",
                              isCollapsed && "-rotate-90"
                            )}
                          />
                        </button>
                        {!isCollapsed && (
                          <div className="space-y-1">
                            {categoryServices.map((service) => {
                              const isSelected = selectedServices.some((s) => s.id === service.id);
                              return (
                                <button
                                  key={service.id}
                                  onClick={() => toggleService(service)}
                                  data-testid={`button-service-${service.id}`}
                                  className={cn(
                                    "w-full text-left p-3 rounded-lg border-2 transition-all flex items-center justify-between",
                                    isSelected
                                      ? "border-primary bg-primary/5"
                                      : "border-transparent hover:border-gray-200 hover:bg-gray-50"
                                  )}
                                >
                                  <div>
                                    <p className="font-medium text-sm">{service.name}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      {service.duration} min
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {showPrices && (
                                      <span className="font-semibold text-sm">
                                        ${Number(service.price).toFixed(2)}
                                      </span>
                                    )}
                                    {isSelected ? (
                                      <Check className="w-4 h-4 text-primary" />
                                    ) : (
                                      <Plus className="w-4 h-4 text-gray-400" />
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedServices.length > 0 && (
              <div className="fixed bottom-0 left-0 right-0 max-w-2xl mx-auto bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{selectedServices.length} service{selectedServices.length > 1 ? "s" : ""}</p>
                  {showPrices && <p className="text-xs text-gray-500">${totalPrice.toFixed(2)}</p>}
                </div>
                <Button onClick={handleChooseTime} data-testid="button-choose-time">
                  Choose Time →
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
              <h2 className="font-semibold text-lg">Select Time</h2>
            </div>

            <div className="px-4 py-4">
              {/* Week navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => navigateWeek("prev")}
                  className="p-2 rounded-lg hover:bg-gray-100"
                  data-testid="button-prev-week"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium text-gray-700">
                  {weekDays[0] && formatInTz(weekDays[0], timezone, "MMM d")} –{" "}
                  {weekDays[6] && formatInTz(weekDays[6], timezone, "MMM d, yyyy")}
                </span>
                <button
                  onClick={() => navigateWeek("next")}
                  className="p-2 rounded-lg hover:bg-gray-100"
                  data-testid="button-next-week"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Day selector */}
              <div className="grid grid-cols-7 gap-1 mb-6">
                {weekDays.map((day, i) => {
                  const isToday = isSameDay(day, getNowInTimezone(timezone));
                  const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        "flex flex-col items-center py-2 rounded-lg transition-all",
                        isSelected
                          ? "bg-primary text-white"
                          : isToday
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-gray-50 text-gray-600"
                      )}
                    >
                      <span className="text-[10px] font-medium">
                        {formatInTz(day, timezone, "EEE")}
                      </span>
                      <span className="text-sm font-bold mt-0.5">
                        {formatInTz(day, timezone, "d")}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Slots */}
              {slotsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : !slots || slots.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border border-dashed border-gray-200 rounded-lg">
                  No availability for this day
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { label: "Morning", items: groupedSlots.morning },
                    { label: "Afternoon", items: groupedSlots.afternoon },
                    { label: "Evening", items: groupedSlots.evening },
                  ]
                    .filter((g) => g.items.length > 0)
                    .map((group) => (
                      <div key={group.label}>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                          {group.label}
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {group.items.map((slot, i) => (
                            <button
                              key={i}
                              onClick={() => handleSelectSlot(slot)}
                              data-testid={`button-slot-${i}`}
                              className="border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                            >
                              {formatInTz(slot.time, timezone, "h:mm a")}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="pb-6">
            <div className="flex items-center gap-3 px-4 py-3 border-b">
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

            <div className="px-4 py-4 space-y-4">
              <Card className="p-4">
                <div className="space-y-3">
                  {selectedSlot && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>
                        {formatInTz(selectedSlot.time, timezone, "EEEE, d MMMM yyyy 'at' h:mm a")}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="font-medium">Certxa Booking Service</p>
                      {store.address && (
                        <p className="text-gray-500 text-xs">{store.address}</p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="space-y-3">
                  {selectedServices.map((service) => (
                    <div key={service.id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{service.name}</p>
                        <p className="text-xs text-gray-500">
                          {service.category} &middot; {service.duration} min
                          {selectedSlot && <> &middot; {selectedSlot.staffName}</>}
                        </p>
                      </div>
                      {showPrices && (
                        <span className="font-semibold text-sm">
                          ${Number(service.price).toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                  {showPrices && (
                    <div className="border-t pt-3 flex items-center justify-between">
                      <span className="font-semibold">Total</span>
                      <span className="font-bold text-lg" data-testid="text-total-price">
                        ${totalPrice.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {/* Payment policy info */}
                  {paymentPolicyData?.policy === "card_on_file" && (
                    <div className="border-t pt-3 flex items-start gap-2">
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
                      <div className="border-t pt-3 space-y-1">
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
              </Card>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Name *</label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Your full name"
                    data-testid="input-customer-name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
                  <Input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="your@email.com"
                    data-testid="input-customer-email"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Phone *</label>
                  <Input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
                      let formatted = raw;
                      if (raw.length >= 6) formatted = `(${raw.slice(0, 3)}) ${raw.slice(3, 6)}-${raw.slice(6)}`;
                      else if (raw.length >= 3) formatted = `(${raw.slice(0, 3)}) ${raw.slice(3)}`;
                      setCustomerPhone(formatted);
                      if (phoneError) setPhoneError("");
                    }}
                    placeholder="(555) 555-5555"
                    data-testid="input-customer-phone"
                  />
                  {phoneError && <p className="text-xs text-destructive mt-1">{phoneError}</p>}
                </div>
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

              {paymentError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {paymentError}
                </div>
              )}

              <Button
                className="w-full"
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

              {bookMutation.isError && (
                <p className="text-red-500 text-sm text-center">
                  Failed to create booking. Please try again.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Payment step */}
        {step === "payment" && stripeInstance && paymentClientSecret && (
          <div className="pb-6">
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <Button size="icon" variant="ghost" onClick={() => setStep("confirm")}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h2 className="font-semibold text-lg">
                {intentType === "setup" ? "Save Payment Method" : "Pay Deposit"}
              </h2>
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* Booking recap */}
              <Card className="p-4 space-y-1">
                <p className="font-semibold text-gray-900">{primaryService?.name}</p>
                <p className="text-sm text-gray-600">
                  {selectedSlot && formatInTz(selectedSlot.time, timezone, "EEEE, d MMMM yyyy 'at' h:mm a")}
                </p>
                <p className="text-sm text-gray-500">With {selectedSlot?.staffName}</p>
                {intentType === "payment" && depositAmountCents > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
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
                  <div className="mt-2 pt-2 border-t border-gray-200 flex items-start gap-2">
                    <Lock className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-blue-800">
                      Your card will be securely stored. <strong>No charge will be made today.</strong>
                    </p>
                  </div>
                )}
              </Card>

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
                  onBack={() => setStep("confirm")}
                />
              </Elements>
            </div>
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
