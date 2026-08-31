import { useState, useMemo } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInTz, getNowInTimezone } from "@/lib/timezone";
import { apiRequest } from "@/lib/queryClient";
import { addDays, subDays, isSameDay } from "date-fns";
import { StoreData, ServiceData, CategoryData, TimeSlot } from "./types";

type Step = "client" | "services" | "time" | "confirm";

interface ClassicThemeProps {
  store: StoreData;
  slug: string;
  preselectedStaffId?: number;
}

export default function ClassicTheme({ store, slug, preselectedStaffId }: ClassicThemeProps) {
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
  const [bookingSuccess, setBookingSuccess] = useState(false);

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
    enabled:
      !!slug && !!primaryService && !!dateString && totalDuration > 0,
  });

  useMemo(() => {
    if (preselectedStaffId && slots && slots.length > 0 && !preselectedStaffName) {
      const match = slots.find(s => s.staffId === preselectedStaffId);
      if (match) setPreselectedStaffName(match.staffName);
    }
  }, [slots, preselectedStaffId]);

  const bookMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest(
        "POST",
        `/api/public/store/${slug}/book`,
        body
      );
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
    setSelectedServices((prev) => {
      const exists = prev.find((s) => s.id === service.id);
      if (exists) return prev.filter((s) => s.id !== service.id);
      return [...prev, service];
    });
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

  const handleConfirmBooking = () => {
    if (!primaryService || !selectedSlot || !customerName.trim()) return;
    bookMutation.mutate({
      serviceId: primaryService.id,
      staffId: selectedSlot.staffId,
      date: selectedSlot.time,
      duration: totalDuration,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
    });
  };

  const navigateWeek = (direction: "prev" | "next") => {
    if (!weekStart) return;
    const newStart =
      direction === "next" ? addDays(weekStart, 7) : subDays(weekStart, 7);
    setWeekStart(newStart);
    setSelectedDate(newStart);
  };

  if (!store) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">
            Store not found
          </h2>
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
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Booking Confirmed!
          </h2>
          <p className="text-gray-500 mb-6">
            Your appointment at {store.name} has been booked successfully.
          </p>
          {selectedSlot && (
            <p className="text-gray-700 font-medium">
              {formatInTz(
                selectedSlot.time,
                timezone,
                "EEEE, d MMMM yyyy 'at' h:mm a"
              )}
            </p>
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
                  {Object.entries(groupedServices).map(
                    ([category, categoryServices]) => {
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
                                const isSelected = selectedServices.some(
                                  (s) => s.id === service.id
                                );
                                return (
                                  <button
                                    key={service.id}
                                    className="w-full flex items-center justify-between px-3 py-3 rounded-md hover:bg-gray-50"
                                    onClick={() => toggleService(service)}
                                    data-testid={`button-service-${service.id}`}
                                  >
                                    <div className="flex-1 text-left">
                                      <p className="font-medium text-sm text-gray-900">
                                        {service.name}
                                      </p>
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        {service.duration} min &middot;{" "}
                                        {service.category}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {showPrices && (
                                        <span className="font-semibold text-sm">
                                          ${Number(service.price).toFixed(2)}
                                        </span>
                                      )}
                                      <div
                                        className={cn(
                                          "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors",
                                          isSelected
                                            ? "bg-primary border-primary"
                                            : "border-gray-300"
                                        )}
                                      >
                                        {isSelected ? (
                                          <Check className="w-4 h-4 text-white" />
                                        ) : (
                                          <Plus className="w-4 h-4 text-gray-400" />
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>

            {selectedServices.length > 0 && (
              <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-3 flex items-center justify-between gap-4 z-50">
                <div>
                  <span className="text-sm font-medium">
                    {selectedServices.length} Service
                    {selectedServices.length > 1 ? "s" : ""}
                  </span>
                  {showPrices && (
                    <span
                      className="text-sm text-gray-500 ml-2"
                      data-testid="text-total-price"
                    >
                      ${totalPrice.toFixed(2)}
                    </span>
                  )}
                </div>
                <Button
                  onClick={handleChooseTime}
                  data-testid="button-choose-staff"
                >
                  Choose Staff
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

            {/* Calendar — week strip with nav arrows on each side */}
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0 h-8 w-8 rounded-full text-gray-400 hover:text-gray-700"
                  onClick={() => navigateWeek("prev")}
                  data-testid="button-week-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                <div className="flex-1 bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  {/* Combined day + date cells — label derived from actual date so it's always correct */}
                  <div className="grid grid-cols-7 text-center px-1 py-3">
                    {weekDays.map((day) => {
                      const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                      const isToday = isSameDay(day, now);
                      const dayAbbrev = formatInTz(day, timezone, "EEE"); // Mon, Tue, Wed …
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
                              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                              isSelected
                                ? "bg-primary text-white shadow-sm"
                                : isToday
                                  ? "border-2 border-primary text-primary"
                                  : "text-gray-800 hover:bg-gray-100"
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

                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0 h-8 w-8 rounded-full text-gray-400 hover:text-gray-700"
                  onClick={() => navigateWeek("next")}
                  data-testid="button-week-next"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
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

              <button
                className="flex items-center gap-1 text-primary text-sm font-medium mt-6"
                onClick={() => setStep("services")}
                data-testid="button-add-another-service"
              >
                <Plus className="w-4 h-4" />
                Add another service
              </button>
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
                      <p className="font-medium">{store.name}</p>
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
      </main>
    </div>
  );
}
