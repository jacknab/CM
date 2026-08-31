import { useState, useMemo } from "react";
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
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInTz, getNowInTimezone } from "@/lib/timezone";
import { apiRequest } from "@/lib/queryClient";
import { addDays, subDays, isSameDay } from "date-fns";
import { StoreData, ServiceData, CategoryData, TimeSlot, AddonData, ServiceAddonData } from "./types";

interface MobileThemeProps {
  store: StoreData;
  slug: string;
  preselectedStaffId?: number;
}

type ViewState = "client" | "home" | "category" | "time" | "confirm" | "profile";

export default function MobileTheme({ store, slug, preselectedStaffId }: MobileThemeProps) {
  const [searchParams] = useSearchParams();
  const hideHeader = searchParams.get("embed") === "true" || searchParams.get("hideHeader") === "true";
  const [view, setView] = useState<ViewState>("home");
  const [clientType, setClientType] = useState<"new" | "returning" | null>("new");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<ServiceData[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<Record<number, number[]>>({});
  const [viewingAddonsForService, setViewingAddonsForService] = useState<ServiceData | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
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
  
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [returningPhone, setReturningPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState(false);

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
      // Check if it's 12:00 PM or later in the store's timezone
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
    const serviceAddons = getAddonsForService(service.id);
    if (serviceAddons.length > 0) {
      setViewingAddonsForService(service);
    } else {
      setSelectedServices([service]);
      setView("time");
    }
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

  const handleConfirmBooking = () => {
    if (!primaryService || !selectedSlot) return;
    
    // Validate name if new client, or phone if returning
    if (clientType === "new" && !customerName.trim()) return;
    if (clientType === "returning" && !customerPhone.trim()) return;

    const phoneDigits = customerPhone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      setPhoneError("Enter a valid 10-digit phone number.");
      return;
    }

    const addonIds = selectedAddons[primaryService.id] || [];
    bookMutation.mutate({
      serviceId: primaryService.id,
      staffId: selectedSlot.staffId,
      date: selectedSlot.time,
      duration: totalDuration,
      customerName: customerName.trim() || "Guest", // Fallback for returning flow if name not captured
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: customerPhone.trim(),
      addonIds,
    });
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
          <p className="text-gray-500 mb-6">
            Your appointment at {store.name} has been booked successfully.
          </p>
          {selectedSlot && (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
               <p className="text-gray-900 font-semibold text-lg">{primaryService?.name}</p>
               <p className="text-gray-500 text-sm mt-1">
                 {formatInTz(selectedSlot.time, timezone, "EEEE, d MMMM yyyy")}
               </p>
               <p className="text-primary font-medium mt-1">
                 {formatInTz(selectedSlot.time, timezone, "h:mm a")}
               </p>
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
          <Button onClick={() => window.location.reload()} className="w-full rounded-full h-12 text-base">
            Book Another
          </Button>
        </div>
      </div>
    );
  }

  // Header Background Color - using a rich red gradient
  const headerBg = "bg-gradient-to-b from-[#D32F2F] to-[#B71C1C]";
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
        {view === "home" && (
            <>
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Button variant="ghost" size="icon" onClick={() => {
                            window.history.back();
                        }} className="-ml-2 h-8 w-8">
                             <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <h2 className="text-lg font-bold text-gray-800">Services</h2>
                        <div className="h-[1px] bg-gray-200 flex-1 ml-2"></div>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-600 mb-4">
                        <div className="flex text-yellow-400">
                            <Star className="w-5 h-5 fill-current" />
                            <Star className="w-5 h-5 fill-current" />
                            <Star className="w-5 h-5 fill-current" />
                            <Star className="w-5 h-5 fill-current" />
                            <Star className="w-5 h-5 fill-current" />
                        </div>
                        <span className="font-semibold ml-1 text-lg">5.0</span>
                        <span className="text-gray-400 text-base">(120 reviews)</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {categoriesList.map(category => (
                            <button 
                                key={category}
                                onClick={() => handleCategorySelect(category)}
                                className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-4 hover:shadow-md transition-all active:scale-95 h-40"
                            >
                                {/* Large centered icon style to match "Image 2" cards */}
                                <div className="flex-1 flex items-center justify-center w-full">
                                    <Scissors className="w-16 h-16 text-gray-800 stroke-1" />
                                </div>
                                <span className="font-bold text-gray-900 text-lg">{category}</span>
                            </button>
                        ))}
                        <button className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-4 hover:shadow-md transition-all active:scale-95 h-40">
                            <div className="flex-1 flex items-center justify-center w-full">
                                <Plus className="w-16 h-16 text-gray-300 stroke-1" />
                            </div>
                            <span className="font-bold text-gray-900 text-lg">More Services</span>
                        </button>
                    </div>
                </div>
            </>
        )}

        {view === "category" && (
            <div className="pb-8">
                <div className="flex items-center gap-2 mb-6">
                    <Button variant="ghost" size="icon" onClick={() => setView("home")} className="-ml-2">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h2 className="text-xl font-bold text-gray-800">{activeCategory}</h2>
                </div>
                
                <div className="space-y-3">
                    {groupedServices[activeCategory!]?.map(service => (
                        <div key={service.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-gray-800">{service.name}</h3>
                                <p className="text-sm text-gray-500 mt-1">{service.duration} min</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {showPrices && <span className="font-bold text-gray-900">${Number(service.price).toFixed(2)}</span>}
                                <Button size="sm" className="rounded-full px-4 bg-[#D32F2F] hover:bg-[#B71C1C]" onClick={() => handleServiceSelect(service)}>
                                    Book
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {view === "time" && (
            <div className="pb-8">
                <div className="flex items-center gap-2 mb-5">
                    <Button variant="ghost" size="icon" onClick={() => setView("category")} className="-ml-2">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h2 className="text-xl font-bold text-gray-800">Select Time</h2>
                </div>

                {/* Calendar card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
                    <div className="flex items-center justify-between px-3 pt-3 pb-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateWeek("prev")}>
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm font-semibold text-gray-700">
                            {formatInTz(weekDays[0], timezone, "MMMM yyyy")}
                        </span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateWeek("next")}>
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
                                    className="flex flex-col items-center gap-0.5"
                                >
                                    <span className="text-[11px] font-medium text-gray-400 mb-1">{dayAbbrev}</span>
                                    <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                                        isSelected
                                            ? 'bg-[#D32F2F] text-white shadow-sm'
                                            : isToday
                                                ? 'border-2 border-[#D32F2F] text-[#D32F2F]'
                                                : 'text-gray-800 hover:bg-gray-50'
                                    }`}>
                                        {dayNum}
                                    </span>
                                    <span className="text-[10px] text-gray-400 leading-none mt-0.5">{monthAbbrev}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Time slots */}
                <h3 className="text-center font-bold text-gray-900 text-base mb-3">What time works?</h3>
                {slotsLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
                ) : !slots || slots.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-8">No available times for this date.</p>
                ) : (
                    <div className="grid grid-cols-3 gap-3">
                        {slots.map(slot => (
                            <button
                                key={slot.time}
                                onClick={() => handleSelectSlot(slot)}
                                className="py-3 px-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-[#D32F2F] hover:text-[#D32F2F] active:bg-[#D32F2F] active:text-white transition-all"
                            >
                                {formatInTz(slot.time, timezone, "h:mm a")}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        )}

        {view === "confirm" && (
            <div className="pb-8">
                 <div className="flex items-center gap-2 mb-6">
                    <Button variant="ghost" size="icon" onClick={() => setView("time")} className="-ml-2">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h2 className="text-xl font-bold text-gray-800">Confirm</h2>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
                    <div className="flex items-start gap-4 border-b border-gray-100 pb-4 mb-4">
                        <div className="w-16 h-16 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Scissors className="w-8 h-8 text-[#D32F2F]" />
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
                    {primaryService?.depositRequired && primaryService?.depositAmount && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
                        <span className="text-sm text-amber-700 font-medium">Deposit required</span>
                        <span className="text-sm font-bold text-amber-700">${Number(primaryService.depositAmount).toFixed(2)}</span>
                      </div>
                    )}
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
                </div>

                <Button 
                    onClick={handleConfirmBooking} 
                  disabled={bookMutation.isPending || !customerName.trim() || !isPhoneValid}
                    className="w-full h-14 text-lg rounded-xl bg-[#D32F2F] hover:bg-[#B71C1C] shadow-lg shadow-red-200"
                >
                    {bookMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : "Confirm Booking"}
                </Button>
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
            className={`flex flex-col items-center gap-1 ${view === 'home' || view === 'category' ? 'text-[#D32F2F]' : 'text-gray-400'}`}
            onClick={() => setView('home')}
        >
            <Home className="w-6 h-6" />
            <span className="text-[10px] font-medium">Home</span>
        </button>
        
        <button className="flex flex-col items-center gap-1 text-gray-400 relative">
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] rounded-full text-[10px] text-white flex items-center justify-center border-2 border-white">0</div>
            <ShoppingBag className="w-6 h-6" />
            <span className="text-[10px] font-medium">Cart</span>
        </button>

        <button className={cn("flex flex-col items-center gap-1", view === "profile" ? "text-[#D32F2F]" : "text-gray-400")} onClick={() => setView("profile")}>
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
    </div>
  );
}
