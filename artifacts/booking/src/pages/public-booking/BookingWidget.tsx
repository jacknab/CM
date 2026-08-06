import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
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
  Star,
  ArrowRight,
} from "lucide-react";

// ── Category placeholder images (Pexels) ─────────────────────────────────────
const CATEGORY_PLACEHOLDERS: Record<string, string> = {
  pedicure:  "https://images.pexels.com/photos/3997388/pexels-photo-3997388.jpeg?auto=compress&cs=tinysrgb&w=800",
  extension: "https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=800",
  art:       "https://images.pexels.com/photos/3997387/pexels-photo-3997387.jpeg?auto=compress&cs=tinysrgb&w=800",
  addon:     "https://images.pexels.com/photos/3997392/pexels-photo-3997392.jpeg?auto=compress&cs=tinysrgb&w=800",
  default:   "https://images.pexels.com/photos/3997389/pexels-photo-3997389.jpeg?auto=compress&cs=tinysrgb&w=800",
};

function getCategoryPlaceholder(category: string): string {
  const lc = category.toLowerCase();
  if (lc.includes("pedicure")) return CATEGORY_PLACEHOLDERS.pedicure;
  if (lc.includes("acrylic") || lc.includes("extension") || lc.includes("gel-x") || lc.includes("gelx")) return CATEGORY_PLACEHOLDERS.extension;
  if (lc.includes("art")) return CATEGORY_PLACEHOLDERS.art;
  if (lc.includes("add") || lc.includes("addon") || lc.includes("extra")) return CATEGORY_PLACEHOLDERS.addon;
  return CATEGORY_PLACEHOLDERS.default;
}
import { cn } from "@/lib/utils";
import { formatInTz, getNowInTimezone } from "@/lib/timezone";
import { apiRequest } from "@/lib/queryClient";
import { addDays, subDays, isSameDay } from "date-fns";
import { StoreData, ServiceData, ServiceOptionData, CategoryData, TimeSlot } from "./types";

type Step = "client" | "services" | "time" | "confirm" | "success";

interface BookingWidgetProps {
  store: StoreData;
  slug: string;
  onBookingComplete?: (bookingData: any) => void;
}

/**
 * BookingWidget - A minimal, embedable booking widget
 * 
 * Perfect for embedding on external websites via iframe or as a component.
 * Based on ClassicTheme but without header or footer for seamless integration.
 * 
 * Usage as iframe:
 * <iframe src="https://yourdomain.com/widget?slug=store-slug" 
 *         style="width: 100%; height: 600px; border: none;"></iframe>
 * 
 * Usage as component:
 * <BookingWidget store={storeData} slug="store-slug" />
 */
export default function BookingWidget({
  store,
  slug,
  onBookingComplete,
}: BookingWidgetProps) {
  const [step, setStep] = useState<Step>("client");
  const [clientType, setClientType] = useState<"new" | "returning" | null>(null);
  const [returningPhone, setReturningPhone] = useState("");
  const [selectedServices, setSelectedServices] = useState<ServiceData[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [optionPickerService, setOptionPickerService] = useState<ServiceData | null>(null);

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

  const services = servicesData?.services || [];
  const categories = servicesData?.categories || [];
  const showPrices = publicStoreData?.showPrices ?? true;

  const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);
  const primaryService = selectedServices[0];

  const dateString = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(selectedDate.getDate()).padStart(2, "0")}`
    : null;

  const { data: slots, isLoading: slotsLoading } = useQuery<TimeSlot[]>({
    queryKey: [
      "/api/public/store",
      slug,
      "availability",
      primaryService?.id,
      dateString,
      totalDuration,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        serviceId: String(primaryService!.id),
        date: dateString!,
        duration: String(totalDuration),
      });
      const res = await fetch(
        `/api/public/store/${slug}/availability?${params}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch availability");
      return res.json();
    },
    enabled:
      !!slug && !!primaryService && !!dateString && totalDuration > 0,
  });

  const bookMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const url = `/api/public/store/${slug}/booking`;
      const response = await apiRequest("POST", url, body);
      return response.json();
    },
    onSuccess: (data) => {
      setSuccessMessage("Booking confirmed! Check your email for details.");
      setBookingSuccess(true);
      setStep("success");
      if (onBookingComplete) {
        onBookingComplete(data);
      }
    },
  });

  const groupedServices = useMemo(() => {
    const groups: Record<string, ServiceData[]> = {};
    categories.forEach((cat) => {
      groups[cat.name] = services.filter((s) => s.categoryId === cat.id);
    });
    return groups;
  }, [services, categories]);

  const calendarDates = useMemo(() => {
    if (!weekStart) return [];
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const groupedSlots = useMemo(() => {
    if (!slots) return { morning: [], afternoon: [], evening: [] };

    const morning = slots.filter((s) => {
      const hour = parseInt(formatInTz(new Date(s.time), timezone, "H"));
      return hour < 12;
    });
    const afternoon = slots.filter((s) => {
      const hour = parseInt(formatInTz(new Date(s.time), timezone, "H"));
      return hour >= 12 && hour < 17;
    });
    const evening = slots.filter((s) => {
      const hour = parseInt(formatInTz(new Date(s.time), timezone, "H"));
      return hour >= 17;
    });

    return { morning, afternoon, evening };
  }, [slots]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleService = (service: ServiceData) => {
    const alreadySelected = selectedServices.find((s) => s.id === service.id);
    if (alreadySelected) {
      setSelectedServices((prev) => prev.filter((s) => s.id !== service.id));
      return;
    }
    // If service has multiple options, show picker; otherwise add directly
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
    const now = getNowInTimezone(timezone);
    setWeekStart(now);
    setStep("time");
  };

  // Bloom-style: one tap selects the service and goes straight to time selection
  const handleBookNow = (service: ServiceData) => {
    if (service.options && service.options.length > 1) {
      setOptionPickerService(service);
      return;
    }
    setSelectedServices([service]);
    const now = getNowInTimezone(timezone);
    setWeekStart(now);
    setStep("time");
  };

  const handleSelectSlot = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    setStep("confirm");
  };

  const handleConfirmBooking = () => {
    if (!primaryService || !selectedSlot || !customerName.trim()) return;
    bookMutation.mutate({
      serviceId: primaryService.id,
      staffId: selectedSlot.staffId,
      date: selectedSlot.time,
      duration: totalDuration,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      customerPhone: customerPhone.trim(),
    });
  };

  if (servicesLoading && step === "client") {
    return (
      <div className="flex items-center justify-center min-h-[300px] bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="w-full bg-white text-gray-900">
      {step === "success" && (
        <div className="flex flex-col items-center justify-center min-h-[400px] px-6 py-12">
          <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Booking Confirmed!
          </h2>
          <p className="text-gray-600 text-center mb-4">{successMessage}</p>
          <div className="text-sm text-gray-500 text-center space-y-1 mb-6">
            <p>
              <strong>Date:</strong>{" "}
              {selectedSlot &&
                formatInTz(
                  selectedSlot.time,
                  timezone,
                  "EEEE, d MMMM yyyy"
                )}
            </p>
            <p>
              <strong>Time:</strong>{" "}
              {selectedSlot &&
                formatInTz(selectedSlot.time, timezone, "h:mm a")}
            </p>
            {showPrices && (
              <p>
                <strong>Total:</strong> ${totalPrice.toFixed(2)}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setBookingSuccess(false);
              setStep("client");
              setClientType(null);
              setSelectedServices([]);
              setSelectedDate(null);
              setSelectedSlot(null);
              setCustomerName("");
              setCustomerEmail("");
              setCustomerPhone("");
              setReturningPhone("");
            }}
          >
            Book Another Appointment
          </Button>
        </div>
      )}

      {step === "client" && (
        <div className="flex flex-col items-center justify-center min-h-[300px] px-6 py-12">
          <div className="w-full max-w-sm space-y-4">
            <div className="mb-6 text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                Book an Appointment
              </h2>
              <p className="text-sm text-gray-600">{store.name}</p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-14 text-base"
                onClick={() => handleClientSelect("new")}
                data-testid="button-new-client"
              >
                <User className="w-5 h-5 mr-2" />
                New Client
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-14 text-base"
                onClick={() => handleClientSelect("returning")}
                data-testid="button-returning-client"
              >
                <User className="w-5 h-5 mr-2" />
                Returning
              </Button>
            </div>

            {clientType === "returning" && (
              <div className="space-y-3 mt-4">
                <Input
                  placeholder="Enter your phone number"
                  value={returningPhone}
                  onChange={(e) => setReturningPhone(e.target.value)}
                  data-testid="input-returning-phone"
                />
                <Button
                  className="w-full"
                  onClick={handleReturningContinue}
                  data-testid="button-continue-returning"
                >
                  Continue
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {step === "services" && (
        <div className="pb-6">
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-4 py-3 border-b">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setStep("client")}
              data-testid="button-back-client"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h2 className="font-semibold text-lg">Choose a Service</h2>
          </div>

          {/* ── Category filter chips ───────────────────────────────────────── */}
          {categories.length > 1 && (
            <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide">
              {["All", ...categories.map((c) => c.name)].map((cat) => {
                const active =
                  cat === "All"
                    ? !collapsedCategories.has("__active__")
                    : collapsedCategories.has(cat);
                // We repurpose collapsedCategories as an active-category store here:
                // nothing in the Set = show All; a single cat name = filter to that cat
                const isActive =
                  cat === "All"
                    ? collapsedCategories.size === 0
                    : collapsedCategories.size === 1 && collapsedCategories.has(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      if (cat === "All") {
                        setCollapsedCategories(new Set());
                      } else {
                        setCollapsedCategories(new Set([cat]));
                      }
                    }}
                    className={cn(
                      "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors border",
                      isActive
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    )}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Service cards ───────────────────────────────────────────────── */}
          <div className="px-4 space-y-3 pt-1">
            {servicesLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              services
                .filter((s) => {
                  if (collapsedCategories.size === 0) return true;
                  return collapsedCategories.has(s.category);
                })
                .map((service) => {
                  const imgSrc = service.imageUrl || getCategoryPlaceholder(service.category);
                  const rating = store.googleRating ?? 5.0;
                  const reviewCount = store.googleReviewCount ?? 0;
                  const hasMultipleOptions = service.options && service.options.length > 1;

                  return (
                    <article
                      key={service.id}
                      className="overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100"
                      data-testid={`card-service-${service.id}`}
                    >
                      {/* Image + content row */}
                      <div className="flex min-h-[180px]">
                        {/* Left: image */}
                        <div className="relative w-[44%] flex-shrink-0 overflow-hidden bg-gray-100">
                          <img
                            src={imgSrc}
                            alt={`${service.name}`}
                            loading="lazy"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src =
                                CATEGORY_PLACEHOLDERS.default;
                            }}
                          />
                        </div>

                        {/* Right: content */}
                        <div className="flex flex-1 flex-col gap-1.5 px-3.5 py-3">
                          <h3 className="font-serif text-[17px] font-semibold leading-snug text-gray-900">
                            {service.name}
                          </h3>

                          {service.duration > 0 && (
                            <div className="flex items-center gap-1 text-[12px] text-gray-500">
                              <Clock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                              {service.duration} min
                            </div>
                          )}

                          {service.description && (
                            <p className="text-[12px] leading-relaxed text-gray-500 line-clamp-2">
                              {service.description}
                            </p>
                          )}

                          <div className="my-0.5 h-px bg-gray-100" />

                          {/* Rating */}
                          {reviewCount > 0 ? (
                            <div className="flex items-center gap-1.5 text-[12px] text-gray-600">
                              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 flex-shrink-0" aria-hidden="true" />
                              <span className="font-semibold text-gray-800">{rating.toFixed(1)}</span>
                              <span className="text-gray-400">({reviewCount} reviews)</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-[12px] text-gray-400">
                              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 flex-shrink-0" aria-hidden="true" />
                              <span className="text-gray-500">New</span>
                            </div>
                          )}

                          {hasMultipleOptions && (
                            <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              {service.options.length} options
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Price + Book button */}
                      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                        {showPrices ? (
                          <span className="font-serif text-[20px] font-bold text-rose-600">
                            {Number(service.price) > 0 ? `$${Number(service.price).toFixed(0)}` : "POA"}
                          </span>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          onClick={() => handleBookNow(service)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                          data-testid={`button-book-${service.id}`}
                          aria-label={`Book ${service.name}`}
                        >
                          Book Now
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  );
                })
            )}
          </div>
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
            <h2 className="font-semibold text-lg">Select Date & Time</h2>
          </div>

          <div className="px-4 py-4 space-y-4">
            {selectedDate && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  {formatInTz(selectedDate, timezone, "EEEE, d MMMM")}
                </p>

                {slotsLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : slots?.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500">
                      No available slots for this date.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedDate(null)}
                      className="mt-2"
                    >
                      Choose Another Date
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(groupedSlots).map(([period, periodSlots]) => {
                      if (periodSlots.length === 0) return null;
                      return (
                        <div key={period}>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            {period === "morning"
                              ? "Morning"
                              : period === "afternoon"
                                ? "Afternoon"
                                : "Evening"}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {periodSlots.map((slot) => (
                              <Button
                                key={slot.id}
                                variant={
                                  selectedSlot?.id === slot.id
                                    ? "default"
                                    : "outline"
                                }
                                size="sm"
                                onClick={() => handleSelectSlot(slot)}
                                className={cn(
                                  `flex-1 text-xs`,
                                  selectedSlot?.id === slot.id &&
                                    `ring-2 ring-primary ring-offset-2`
                                )}
                                data-testid={`button-slot-${slot.id}`}
                              >
                                {formatInTz(slot.time, timezone, "h:mm a")}
                              </Button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!selectedDate && weekStart && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setWeekStart(subDays(weekStart, 7))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <h3 className="font-semibold text-sm">
                    {formatInTz(weekStart, timezone, "MMMM yyyy")}
                  </h3>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setWeekStart(addDays(weekStart, 7))}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {calendarDates.map((date) => {
                    const isSelected = selectedDate && isSameDay(date, selectedDate);
                    const isToday = isSameDay(date, getNowInTimezone(timezone));
                    return (
                      <Button
                        key={date.toISOString()}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedDate(date)}
                        className={cn(
                          "flex-1 flex flex-col items-center",
                          isToday && !isSelected && "border-primary"
                        )}
                      >
                        <span className="text-xs font-medium">
                          {formatInTz(date, timezone, "EEE").substring(0, 1)}
                        </span>
                        <span className="text-sm">{date.getDate()}</span>
                      </Button>
                    );
                  })}
                </div>
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
                      {formatInTz(
                        selectedSlot.time,
                        timezone,
                        "EEEE, d MMMM yyyy 'at' h:mm a"
                      )}
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
                  <div
                    key={service.id}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-sm">{service.name}</p>
                      <p className="text-xs text-gray-500">
                        {service.category} &middot; {service.duration} min
                        {selectedSlot && (
                          <> &middot; {selectedSlot.staffName}</>
                        )}
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
                    <span className="font-semibold">Total to pay</span>
                    <span
                      className="font-bold text-lg"
                      data-testid="text-total-price"
                    >
                      ${totalPrice.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </Card>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Name *
                </label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Your full name"
                  data-testid="input-customer-name"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Email
                </label>
                <Input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="your@email.com"
                  data-testid="input-customer-email"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Phone
                </label>
                <Input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone number"
                  data-testid="input-customer-phone"
                />
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleConfirmBooking}
              disabled={!customerName.trim() || bookMutation.isPending}
              data-testid="button-confirm-booking"
            >
              {bookMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Confirm Booking
            </Button>

            {bookMutation.isError && (
              <p className="text-red-500 text-sm text-center">
                Failed to create booking. Please try again.
              </p>
            )}
          </div>
        </div>
      )}
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
