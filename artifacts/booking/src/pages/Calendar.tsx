import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { CalendarFaderScrollbar } from "@/components/CalendarFaderScrollbar";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAppointments, useUpdateAppointment } from "@/hooks/use-appointments";
import { useAppointmentSSE } from "@/hooks/use-appointment-sse";
import { useStaffList, useAllStaffAvailability } from "@/hooks/use-staff";
import { useSelectedStore } from "@/hooks/use-store";
import { useCalendarSettings, DEFAULT_CALENDAR_SETTINGS } from "@/hooks/use-calendar-settings";
import { formatInTz, formatStoreDate, getTimezoneAbbr, getNowInTimezone, storeLocalToUtc, isStoreLocalSlotInPast, isSameLocalDay, isSameStoreDay, isOnStoreDate, addStoreDays, toLocalDateStringInTz } from "@/lib/timezone";
import { addMinutes, format } from "date-fns";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, CalendarPlus, Users, Globe, ArrowLeft, ArrowUp, X, Clock, Loader2, CreditCard, Banknote, Smartphone, DollarSign, Check, Receipt, Percent, Tag, Delete, Printer, XCircle, Settings, PersonStanding, LayoutDashboard, TrendingUp, CalendarDays, Scissors, ShoppingBag, UserCircle, Gift, ClipboardList, FileText, BarChart3, MessageSquare, Mail, Building2, MapPin, Star, ThumbsUp, ListOrdered, Search, AlertCircle, Lock, Unlock, Bell, ListFilter, MoreVertical, Plus, LayoutList, Zap, Send, HelpCircle, ChevronDown as ChevronDownIcon, Calendar as CalendarIcon, Phone, AlertTriangle, LogIn, QrCode, Layers, WifiOff, Utensils, CupSoda, Package, BadgePercent, Barcode, ScanSearch, Scale, Ticket, Wallet } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AvailableTimeBanner } from "@/components/AvailableTimeBanner";
import { useThermalPrinter } from "@/hooks/use-thermal-printer";
import { buildCheckinTicket, buildCheckoutReceipt } from "@/lib/thermalPrinter";
import { cn } from "@/lib/utils";
import { getPosLayout, getMobilePosActions, resolvePosIcon, type PosButton } from "@/lib/pos";
import { POS_BUTTON_TX, POS_GUIDED_TX, POS_MISC_TX } from "@/lib/pos/labels";
import type { AppointmentWithDetails } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { CashDrawerPanel } from "@/pages/CashDrawer";
import { MobileCalendarView } from "@/components/MobileCalendarView";

import { WeeklyAgendaView } from "@/components/WeeklyAgendaView";
import { OpenRegisterModal } from "@/components/cash/OpenRegisterModal";
import { DayCloseModal } from "@/components/cash/DayCloseModal";
import POSInterface from "@/pages/POSInterface";
import { useLanguage } from "@/hooks/use-language";
import { useFeatureFlags } from "@/hooks/use-features";
import { useServiceCategories, useAddons } from "@/hooks/use-addons";
import { assignStaffColors, getContrastColors } from "@/lib/staffColors";
import { CATEGORY_PALETTE } from "@/components/services/CategoryManager";
import { usePendingSyncMap } from "@/hooks/use-pending-sync";
import { AppointmentSyncBadge } from "@/components/AppointmentSyncBadge";

type SidebarItem =
  | { kind: "link"; to: string; label: string; icon: any }
  | { kind: "action"; action: "quick-checkout" | "cash-drawer" | "day-close" | "open-register" | "client-lookup"; label: string; icon: any };

type TurnTechnician = {
  id: number;
  name: string;
  color?: string | null;
  avatarUrl?: string | null;
  eligible: boolean;
  clockedIn?: boolean;
  turnPosition?: number;
  exclusionReasons?: string[];
  turnCount?: number;
  currentStatus?: "available" | "busy" | "on_break";
  shortTurnProtected?: boolean;
};

const calendarSidebarItems: SidebarItem[] = [
  { kind: "link", to: "/calendar", label: "Calendar", icon: CalendarDays },
  { kind: "action", action: "quick-checkout", label: "Quick Lists", icon: LayoutList },
  { kind: "action", action: "client-lookup", label: "Clients", icon: Users },
  { kind: "action", action: "open-register", label: "POS", icon: CreditCard },
  { kind: "link", to: "/reports", label: "Reports", icon: BarChart3 },
  { kind: "action", action: "cash-drawer", label: "Cash Drawer", icon: Banknote },
  { kind: "action", action: "day-close", label: "Day Close", icon: Lock },
];

const HOUR_HEIGHT = 180;
const STAFF_CALENDAR_COLUMN_WIDTH = 210;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

/** True below Tailwind's `lg` (1024px) — where the POS 3-panel keypad is hidden
 *  and the phone/solo checkout layout takes over. */
function useIsCompactPos() {
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.innerWidth < 1024);
  useEffect(() => {
    const handler = () => setCompact(window.innerWidth < 1024);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return compact;
}
const CALENDAR_COLUMN_SEPARATOR_COLOR = "#d9e2ea";
const DEFAULT_BUSINESS_START = 9;
const DEFAULT_BUSINESS_END = 18;

function useCurrentTimeLine(timezone: string, startHour: number, endHour: number) {
  const [position, setPosition] = useState<number | null>(null);
  const [timeLabel, setTimeLabel] = useState("");

  const updatePosition = useCallback(() => {
    // Always derive wall-clock parts directly from Intl in the salon timezone.
    // This avoids Date getter drift when browser timezone differs from store timezone.
    const now = new Date();
    const hours = parseInt(formatInTz(now, timezone, "H"), 10);
    const minutes = parseInt(formatInTz(now, timezone, "m"), 10);
    const totalMinutes = hours * 60 + minutes;
    const startMinutes = startHour * 60;
    const endMinutes = endHour * 60;

    if (totalMinutes < startMinutes || totalMinutes > endMinutes) {
      setPosition(null);
      setTimeLabel("");
      return;
    }

    const pixelsFromTop = (totalMinutes - startMinutes) * (HOUR_HEIGHT / 60);
    setPosition(pixelsFromTop);

    const h = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    const m = String(minutes).padStart(2, "0");
    setTimeLabel(`${h}:${m}`);
  }, [timezone, startHour, endHour]);

  useEffect(() => {
    updatePosition();
    const interval = setInterval(updatePosition, 60000);
    return () => clearInterval(interval);
  }, [updatePosition]);

  return { position, timeLabel };
}

export default function Calendar() {
  const { isLoading: authLoading, user } = useAuth();
  const isStaffUser = user?.role === "staff" && !!user?.staffId;
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedStore } = useSelectedStore();
  const timezone = selectedStore?.timezone || "UTC";
  const lateGracePeriodMinutes = (selectedStore as any)?.lateGracePeriodMinutes ?? 10;
  const posEnabled = (selectedStore as any)?.posEnabled !== false;
  const isNailSalon = (selectedStore as any)?.category === "Nail Salon";

  // Category color map: categoryId → { bg, border }
  const { data: serviceCategories = [] } = useServiceCategories();
  const categoryColorMap = useMemo(() => {
    const map = new Map<number, { bg: string; border: string }>();
    for (const cat of serviceCategories as any[]) {
      if (cat.color && CATEGORY_PALETTE[cat.color]) {
        map.set(cat.id, { bg: CATEGORY_PALETTE[cat.color].bg, border: CATEGORY_PALETTE[cat.color].border });
      }
    }
    return map;
  }, [serviceCategories]);
  const tzAbbr = getTimezoneAbbr(timezone);
  const { pick } = useLanguage();
  const t = {
    today:               pick({ en: "Today",              vi: "Hôm nay",                    es: "Hoy",                      fr: "Aujourd'hui" }),
    allStaff:            pick({ en: "All Staff",          vi: "Tất cả nhân viên",            es: "Todo el personal",         fr: "Tout le personnel" }),
    appointment:         pick({ en: "Appointment",        vi: "Đặt lịch",                   es: "Cita",                     fr: "Rendez-vous" }),
    book:                pick({ en: "BOOK",               vi: "ĐẶT LỊCH",                   es: "RESERVAR",                 fr: "RÉSERVER" }),
    lookUp:              pick({ en: "LOOK UP",            vi: "TRA CỨU",                     es: "BUSCAR",                   fr: "CHERCHER" }),
    cancel:              pick({ en: "Cancel",             vi: "Hủy",                         es: "Cancelar",                 fr: "Annuler" }),
    now:                 pick({ en: "Now",                vi: "Bây giờ",                     es: "Ahora",                    fr: "Maintenant" }),
    loadingStaff:        pick({ en: "Loading staff...",  vi: "Đang tải nhân viên...",        es: "Cargando personal...",     fr: "Chargement du personnel..." }),
    noStaffFound:        pick({ en: "No staff members found for this store.", vi: "Không tìm thấy nhân viên nào.", es: "No se encontró personal para esta tienda.", fr: "Aucun membre du personnel trouvé." }),
    walkIn:              pick({ en: "Walk-In",            vi: "Khách vãng lai",              es: "Sin cita",                 fr: "Sans rendez-vous" }),
    service:             pick({ en: "Service",            vi: "Dịch vụ",                     es: "Servicio",                 fr: "Service" }),
    paid:                pick({ en: "Paid",               vi: "Đã TT",                       es: "Pagado",                   fr: "Payé" }),
    lists:               pick({ en: "Lists",              vi: "Danh sách",                   es: "Listas",                   fr: "Listes" }),
    checkIn:             pick({ en: "Check-In",           vi: "Check-In",                    es: "Registrar",                fr: "Arrivée" }),
    checkInSub:          pick({ en: "View pending appointments",     vi: "Xem lịch hẹn đang chờ",        es: "Ver citas pendientes",          fr: "Voir les rendez-vous en attente" }),
    checkOut:            pick({ en: "Check-Out",          vi: "Check-Out",                   es: "Pagar",                    fr: "Paiement" }),
    checkOutSub:         pick({ en: "Check out checked-in clients",  vi: "Thanh toán khách đã check-in",  es: "Cobrar a clientes registrados", fr: "Encaisser les clients arrivés" }),
    arrived:             pick({ en: "Arrived",            vi: "Đã Đến",                      es: "Llegaron",                 fr: "Arrivés" }),
    arrivedSub:          pick({ en: "Clients checked in at kiosk",   vi: "Khách đã check-in tại kiosk",   es: "Clientes registrados en kiosco", fr: "Clients enregistrés au kiosque" }),
    quickCheckIn:        pick({ en: "Quick Check-In",     vi: "Check-In Nhanh",              es: "Registro rápido",          fr: "Arrivée rapide" }),
    quickCheckOut:       pick({ en: "Quick Check-Out",    vi: "Check-Out Nhanh",             es: "Pago rápido",              fr: "Paiement rapide" }),
    arrivedList:         pick({ en: "Arrived Clients",    vi: "Khách Đã Đến",                es: "Clientes llegados",        fr: "Clients arrivés" }),
    tapToOpen:           pick({ en: "Tap a ticket to open",          vi: "Nhấn vào vé để mở",             es: "Toca un ticket para abrirlo",   fr: "Appuyez sur un ticket pour l'ouvrir" }),
    up:                  pick({ en: "Up",   vi: "Lên",    es: "Arriba",  fr: "Monter" }),
    down:                pick({ en: "Down", vi: "Xuống",  es: "Abajo",   fr: "Descendre" }),
    noPendingAppts:      pick({ en: "No pending appointments for today",  vi: "Không có lịch hẹn nào đang chờ hôm nay", es: "Sin citas pendientes hoy",              fr: "Aucun rendez-vous en attente aujourd'hui" }),
    noCheckedIn:         pick({ en: "No checked-in clients",              vi: "Không có khách nào đang phục vụ",        es: "Sin clientes registrados",              fr: "Aucun client enregistré" }),
    noArrived:           pick({ en: "No clients have checked in yet today",   vi: "Chưa có khách nào check-in hôm nay",  es: "Ningún cliente se ha registrado hoy",   fr: "Aucun client ne s'est enregistré aujourd'hui" }),
    ticket:              (n: number) => pick({ en: `${n} ${n === 1 ? "ticket" : "tickets"}`, vi: `${n} vé`, es: `${n} ${n === 1 ? "turno" : "turnos"}`, fr: `${n} ${n === 1 ? "ticket" : "tickets"}` }),
    pending:             pick({ en: "Pending",            vi: "Đang chờ",                    es: "Pendiente",                fr: "En attente" }),
    createNewAppt:       pick({ en: "Create New Appointment", vi: "Tạo lịch hẹn mới",        es: "Crear nueva cita",         fr: "Créer un rendez-vous" }),
    rescheduleSuccess:   pick({ en: "Appointment rescheduled",      vi: "Đã dời lịch hẹn",                          es: "Cita reprogramada",                     fr: "Rendez-vous replanifié" }),
    rescheduleSuccessDesc: pick({ en: "The appointment has been moved successfully.", vi: "Lịch hẹn đã được chuyển thành công.", es: "La cita se ha movido con éxito.", fr: "Le rendez-vous a été déplacé avec succès." }),
    rescheduleFail:      pick({ en: "Reschedule failed",            vi: "Không thể dời lịch",                       es: "Error al reprogramar",                  fr: "Échec de la replanification" }),
    rescheduleFailDesc:  pick({ en: "Could not move the appointment. Please try again.", vi: "Không thể chuyển lịch hẹn. Vui lòng thử lại.", es: "No se pudo mover la cita. Inténtalo de nuevo.", fr: "Impossible de déplacer le rendez-vous. Réessayez." }),
    noAppts:             pick({ en: "No appointments found",        vi: "Không tìm thấy lịch hẹn",                  es: "No se encontraron citas",               fr: "Aucun rendez-vous trouvé" }),
    noApptsDesc:         pick({ en: "This client has no appointments to look up.", vi: "Khách hàng này không có lịch hẹn nào để tra cứu.", es: "Este cliente no tiene citas para consultar.", fr: "Ce client n'a aucun rendez-vous à consulter." }),
    // Toast messages
    qrNotFound:          pick({ en: "QR scan — not found",             vi: "Quét QR — không tìm thấy",              es: "Escaneo QR — no encontrado",            fr: "Scan QR — introuvable" }),
    qrNotFoundDesc:      pick({ en: "No booking matched this code.",   vi: "Không có lịch hẹn nào khớp mã này.",    es: "Ningún turno coincide con este código.", fr: "Aucune réservation ne correspond à ce code." }),
    qrError:             pick({ en: "QR scan error",                   vi: "Lỗi quét QR",                          es: "Error de escaneo QR",                   fr: "Erreur de scan QR" }),
    qrErrorDesc:         pick({ en: "Could not process the scan.",     vi: "Không thể xử lý mã quét.",              es: "No se pudo procesar el escaneo.",        fr: "Impossible de traiter le scan." }),
    qrNotToday:          pick({ en: "Not a today booking",             vi: "Không phải lịch hẹn hôm nay",           es: "No es un turno de hoy",                 fr: "Réservation pas pour aujourd'hui" }),
    qrNotTodayDesc:      (client: string, service: string, date: string) => pick({
      en: `${client} — ${service} is scheduled for ${date}, not today.`,
      vi: `${client} — ${service} được đặt vào ${date}, không phải hôm nay.`,
      es: `${client} — ${service} está programado para ${date}, no hoy.`,
      fr: `${client} — ${service} est prévu pour le ${date}, pas aujourd'hui.` }),
    ticketsNotSaved:     pick({ en: "Some tickets didn't save",       vi: "Một số vé chưa được lưu",               es: "Algunos tickets no se guardaron",       fr: "Certains tickets n'ont pas été enregistrés" }),
    ticketsNotSavedDesc: pick({ en: "Check the calendar and retry any that are still open.", vi: "Kiểm tra lịch và thử lại những vé vẫn còn mở.", es: "Revisa el calendario y reintenta los que sigan abiertos.", fr: "Vérifiez le calendrier et réessayez ceux encore ouverts." }),
    couldNotMarkUnavail: pick({ en: "Could not mark unavailable",     vi: "Không thể đánh dấu bận",                es: "No se pudo marcar como no disponible",   fr: "Impossible de marquer indisponible" }),
    couldNotMarkAvail:   pick({ en: "Could not mark available",       vi: "Không thể đánh dấu rảnh",               es: "No se pudo marcar como disponible",      fr: "Impossible de marquer disponible" }),
    networkError:        pick({ en: "Network error",                   vi: "Lỗi mạng",                             es: "Error de red",                          fr: "Erreur réseau" }),
    pleaseTryAgain:      pick({ en: "Please try again.",               vi: "Vui lòng thử lại.",                    es: "Inténtalo de nuevo.",                   fr: "Veuillez réessayer." }),
    // Left toolbar (calendar-nav-drawer)
    navCalendar:         pick({ en: "Calendar",     vi: "Lịch",             es: "Calendario",     fr: "Agenda" }),
    navQuickLists:       pick({ en: "Quick Lists",  vi: "Danh sách nhanh",  es: "Listas rápidas", fr: "Listes rapides" }),
    navClients:          pick({ en: "Clients",      vi: "Khách hàng",       es: "Clientes",       fr: "Clients" }),
    navPos:              pick({ en: "POS",          vi: "Thu ngân",         es: "TPV",            fr: "Caisse" }),
    navReports:          pick({ en: "Reports",      vi: "Báo cáo",          es: "Informes",       fr: "Rapports" }),
    navCashDrawer:       pick({ en: "Cash Drawer",  vi: "Ngăn kéo tiền",    es: "Caja",           fr: "Tiroir-caisse" }),
    navDayClose:         pick({ en: "Day Close",    vi: "Chốt ngày",        es: "Cierre del día", fr: "Clôture" }),
    navInOut:            pick({ en: "In/Out",       vi: "Vào/Ra",           es: "Entrada/Salida", fr: "Arrivée/Départ" }),
  };

  // Query the open cash drawer session so we know whether to auto-prompt on mount
  const { data: openDrawerSession } = useQuery({
    queryKey: [`/api/cash-drawer/open?storeId=${selectedStore?.id}`],
    enabled: !!posEnabled && !!selectedStore?.id,
    staleTime: 60_000,
    // Use cached value offline rather than blocking on the network
    networkMode: "offlineFirst",
  });
  const { data: calSettings } = useCalendarSettings();

  const featureFlags    = useFeatureFlags();
  const turnSystemEnabled  = featureFlags.turnSystem !== false;
  const timeclockEnabled   = featureFlags.timeclock  !== false;
  const posFeatureEnabled  = featureFlags.pos        !== false;

  const settings = {
    startOfWeek: calSettings?.startOfWeek || DEFAULT_CALENDAR_SETTINGS.startOfWeek,
    timeSlotInterval: calSettings?.timeSlotInterval || DEFAULT_CALENDAR_SETTINGS.timeSlotInterval,
    nonWorkingHoursDisplay: calSettings?.nonWorkingHoursDisplay ?? DEFAULT_CALENDAR_SETTINGS.nonWorkingHoursDisplay,
    allowBookingOutsideHours: calSettings?.allowBookingOutsideHours ?? DEFAULT_CALENDAR_SETTINGS.allowBookingOutsideHours,
    autoCompleteAppointments: calSettings?.autoCompleteAppointments ?? DEFAULT_CALENDAR_SETTINGS.autoCompleteAppointments,
  };
  const showPrices = calSettings?.showPrices ?? DEFAULT_CALENDAR_SETTINGS.showPrices;

  const storeNow = getNowInTimezone(timezone);
  const [currentDate, setCurrentDate] = useState(storeNow);
  const [weekStart, setWeekStart] = useState(storeNow);

  // Fix: useState only captures the initial value once, so if selectedStore hasn't
  // loaded yet on first render (timezone defaults to "UTC"), currentDate and weekStart
  // are stuck on the UTC date instead of the store's local date.
  // This effect corrects both as soon as the real store timezone is available, and
  // again whenever the user switches stores. It only resets to "today in store TZ"
  // — it does not interfere with manual date navigation because setCurrentDate calls
  // from nav buttons always overwrite the corrected value afterward.
  const syncedStoreIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!selectedStore?.id) return;
    if (syncedStoreIdRef.current === selectedStore.id) return; // already synced
    syncedStoreIdRef.current = selectedStore.id;
    const now = getNowInTimezone(selectedStore.timezone || "UTC");
    setCurrentDate(now);
    setWeekStart(now);
  }, [selectedStore?.id, selectedStore?.timezone]);

  const [selectedStaffId, setSelectedStaffId] = useState<number | "all">("all");
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDetails | null>(null);
  const [showCancelFlow, setShowCancelFlow] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showClientLookup, setShowClientLookup] = useState(false);
  const [showClientLookupSheet, setShowClientLookupSheet] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showNewApptMenu, setShowNewApptMenu] = useState(false);
  const [lookupMode, setLookupMode] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ staffId: number; hour: number; minute: number } | null>(null);
  const [openStaffMenu, setOpenStaffMenu] = useState<number | null>(null);
  const [staffAvailOverride, setStaffAvailOverride] = useState<Record<number, boolean>>({});
  const [staffAvailLoading, setStaffAvailLoading] = useState<Record<number, boolean>>({});
  const [quickCheckoutOpen, setQuickCheckoutOpen] = useState(false);
  const [listView, setListView] = useState<"menu" | "checkin" | "checkout" | "arrived">("menu");
  const [showCashDrawer, setShowCashDrawer] = useState(false);
  const [showOpenRegister, setShowOpenRegister] = useState(false);
  const [showDayClose, setShowDayClose] = useState(false);
  const [showPOSSheet, setShowPOSSheet] = useState(false);
  const [posClientId, setPosClientId] = useState<number | null>(null);
  const [showWalkInCheckout, setShowWalkInCheckout] = useState(false);
  const [showTimeclockSheet, setShowTimeclockSheet] = useState(false);
  const [showTurnPage, setShowTurnPage] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  // Persisted across navigations (and reloads) so creating a booking and
  // returning to /calendar lands back on whichever view the staff had open —
  // not always the default grid view.
  const [calView, setCalView] = useState<"grid" | "agenda" | "resources">(() => {
    try {
      const stored = localStorage.getItem("calendarView");
      if (stored === "grid" || stored === "agenda" || stored === "resources") return stored;
    } catch {}
    return "grid";
  });
  useEffect(() => {
    try { localStorage.setItem("calendarView", calView); } catch {}
  }, [calView]);
  const [draggedAppointment, setDraggedAppointment] = useState<{ id: number; staffId: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ staffId: number; hour: number; minute: number } | null>(null);
  const navDrawerRef = useRef<HTMLElement | null>(null);
  const staffGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!navOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (navDrawerRef.current && target && !navDrawerRef.current.contains(target)) {
        setNavOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [navOpen]);
  const [showJumpToNow, setShowJumpToNow] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Returns ms until the next 1:00 AM in the store's local timezone
  function msUntilNext1AM(): number {
    const now = new Date();
    const fmt = (unit: Intl.DateTimeFormatOptions) =>
      parseInt(new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...unit }).format(now));
    const localHour   = fmt({ hour: "numeric", hour12: false });
    const localMinute = fmt({ minute: "2-digit" });
    const localSecond = fmt({ second: "2-digit" });
    const secsFromMidnight = localHour * 3600 + localMinute * 60 + localSecond;
    const secsUntil1AM = secsFromMidnight < 3600
      ? 3600 - secsFromMidnight                      // still before 1 AM today
      : 24 * 3600 - secsFromMidnight + 3600;          // past 1 AM — wait until tomorrow 1 AM
    return secsUntil1AM * 1000;
  }

  // Returns today's date string in the store's local timezone (YYYY-MM-DD), used as the localStorage day key
  function todayStoreLocal(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  }

  // On-mount check: show the Open Register prompt if the drawer hasn't been
  // opened today and it is already past 1 AM in the store's local timezone
  useEffect(() => {
    if (!posEnabled || !selectedStore) return;
    if (openDrawerSession === undefined) return; // still loading
    if (openDrawerSession) return; // drawer already open — no prompt needed

    const storageKey = `certxa_drawer_prompted_${selectedStore.id}_${todayStoreLocal()}`;
    if (localStorage.getItem(storageKey)) return; // already prompted today

    const localHour = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      }).format(new Date()),
    );
    // Only prompt during the morning opening window (5 AM – noon store local time).
    // Prevents the modal from firing mid-afternoon or evening on a stale session.
    if (localHour >= 5 && localHour < 12) setShowOpenRegister(true);
  }, [posEnabled, selectedStore, openDrawerSession]);

  // Recurring timer: fire at each 1 AM in the store's local timezone and re-schedule for the next day
  useEffect(() => {
    if (!posEnabled) return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        setShowOpenRegister(true);
        schedule(); // re-schedule for next 1 AM
      }, msUntilNext1AM());
    };
    schedule();
    return () => clearTimeout(t);
  }, [posEnabled]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const nowLineRef = useRef<HTMLDivElement>(null);
  const quickListRef = useRef<HTMLDivElement>(null);
  const checkinListRef = useRef<HTMLDivElement>(null);
  const arrivedListRef = useRef<HTMLDivElement>(null);
  const shouldAutoCenterTimeLineRef = useRef(true);
  const programmaticScrollRef = useRef(false);

  // ── QR / barcode scanner (document-level, focus-independent) ──────────────
  const qrScanBuffer  = useRef("");
  const qrScanTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrLastKeyAt   = useRef(0);
  const [qrFlash, setQrFlash] = useState(false);

  const isMobile = useIsMobile();

  // The Resources view toggle only exists in the desktop header — a stored
  // "resources" preference from a wider screen would otherwise leave a
  // narrower/mobile session with no view selected at all.
  useEffect(() => {
    if (isMobile && calView === "resources") setCalView("grid");
  }, [isMobile, calView]);

  // ── Offline sync state — tracks which local booking temp-IDs are pending/conflict ──
  const { syncMap, conflictMap } = usePendingSyncMap();

  // ── Bluetooth thermal printer ──────────────────────────────────────────────
  const thermalPrinter = useThermalPrinter();
  // Stable ref so WS closures can call print without being in their dep arrays
  const thermalPrintRef = useRef<((bytes: Uint8Array) => Promise<void>) | null>(null);
  thermalPrintRef.current = thermalPrinter.isConnected ? thermalPrinter.print : null;

  const updateAppointment = useUpdateAppointment();
  const { toast } = useToast();

  const { data: appointments, isFetching: isFetchingAppointments, isLoading: isLoadingAppointments } = useAppointments();
  const { data: staffList, isLoading: staffLoading } = useStaffList();
  const { data: allStaffAvailability } = useAllStaffAvailability(selectedStore?.id);
  const { data: calendarResources = [] } = useQuery<{ id: number; type: string; name: string; isActive: boolean }[]>({
    queryKey: ["/api/resources"],
    queryFn: async () => {
      const res = await fetch("/api/resources", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });
  const activeResources = calendarResources
    .filter((r: any) => r.isActive)
    .slice()
    .sort((a: any, b: any) => {
      if (a.type < b.type) return -1;
      if (a.type > b.type) return 1;
      return a.name.localeCompare(b.name);
    });
  const queryClient = useQueryClient();

  // SSE: real-time push for appointment status changes (including auto-no-show from scheduler)
  useAppointmentSSE(selectedStore?.id);
  const _turnCacheKey = `certxa_turn_${selectedStore?.id}`;
  const { data: turnEligibility } = useQuery<{ eligibleTechnicians: TurnTechnician[]; technicians: TurnTechnician[] }>({
    queryKey: ["/api/turn/eligibility", selectedStore?.id],
    queryFn: async () => {
      if (!navigator.onLine) {
        try {
          const raw = localStorage.getItem(_turnCacheKey);
          if (raw) return JSON.parse(raw);
        } catch {}
        return { eligibleTechnicians: [], technicians: [] };
      }
      const res = await fetch(`/api/turn/eligibility?storeId=${selectedStore?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch turn eligibility");
      const d = await res.json();
      try { localStorage.setItem(_turnCacheKey, JSON.stringify(d)); } catch {}
      return d;
    },
    enabled: !!selectedStore?.id && isNailSalon && turnSystemEnabled,
    networkMode: "always",
    refetchInterval: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Real-time appointment sync via WebSocket — works for ALL store types.
  // Instantly refreshes calendar when any booking is created, updated, or deleted
  // from any source: staff dashboard, online booking, AI receptionist, etc.
  useEffect(() => {
    if (!selectedStore?.id) return;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${protocol}://${window.location.host}/ws/notifications?storeId=${selectedStore.id}`);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (
            data.type === "booking_created" ||
            data.type === "booking_updated" ||
            data.type === "booking_deleted"
          ) {
            queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
          }
          // Kiosk check-in print jobs → auto-print on connected thermal printer
          if (data.type === "kiosk_print_job" && data.jobType === "checkin_ticket") {
            try {
              const bytes = buildCheckinTicket({
                storeName: data.storeName ?? "",
                clientName: data.clientName ?? "Guest",
                staffName: data.staffName,
                services: data.services ?? [],
                appointmentId: data.appointmentId,
                bookingCode: data.bookingCode ?? `BK:${data.appointmentId}`,
                timeStr: data.timeStr ?? "",
                dateStr: data.dateStr ?? "",
              });
              thermalPrintRef.current?.(bytes).catch(() => {});
            } catch {}
          }
        } catch {}
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (!destroyed) reconnectTimer = setTimeout(connect, 3000);
      };
    };
    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [queryClient, selectedStore?.id]);

  // Real-time turn queue updates via WebSocket + window event (nail salons only).
  // Auto-reconnects on drop so the queue stays live even after network blips.
  useEffect(() => {
    if (!selectedStore?.id || !isNailSalon || !turnSystemEnabled) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", selectedStore.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    };
    window.addEventListener("turn-eligibility-changed", invalidate);

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${protocol}://${window.location.host}/ws/notifications?storeId=${selectedStore.id}`);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "turn_eligibility_changed") invalidate();
        } catch {}
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (!destroyed) reconnectTimer = setTimeout(connect, 3000);
      };
    };
    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener("turn-eligibility-changed", invalidate);
      ws?.close();
    };
  }, [queryClient, selectedStore?.id]);

  const nextTurnTechnician = turnEligibility?.eligibleTechnicians?.[0] ?? null;
  const excludedTurnCount = turnEligibility?.technicians?.filter((tech) => !tech.eligible).length ?? 0;

  const { data: businessHours } = useQuery({
    queryKey: ["/api/business-hours", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return [];
      const res = await fetch(`/api/business-hours?storeId=${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedStore?.id,
    // No stale time — business hours must reflect saves made on the settings
    // page immediately (a 5-min window caused the calendar to keep showing the
    // old open/close times after a change).
    staleTime: 0,
  });

  const businessHoursForDay = useMemo(() => {
    if (!businessHours || (businessHours as any[]).length === 0) return null;
    // Use the store's local day-of-week, not the UTC day.  getUTCDay() returns
    // the wrong weekday for stores in UTC+ timezones when local midnight has
    // already crossed to the next day in UTC.
    // date-fns "i" = ISO day (1=Mon … 7=Sun); % 7 maps 7→0 giving 0=Sun … 6=Sat
    // which matches JS getDay() and the dayOfWeek values stored in the DB.
    const dayOfWeek = parseInt(formatStoreDate(currentDate, "i"), 10) % 7;
    return (businessHours as any[]).find((h: any) => h.dayOfWeek === dayOfWeek) || null;
  }, [businessHours, currentDate, timezone]);

  const { BUSINESS_START_HOUR, BUSINESS_END_HOUR, BUSINESS_OPEN_MINUTE, BUSINESS_CLOSE_MINUTE } = useMemo(() => {
    if (!businessHoursForDay || businessHoursForDay.isClosed) {
      return { BUSINESS_START_HOUR: DEFAULT_BUSINESS_START, BUSINESS_END_HOUR: DEFAULT_BUSINESS_END, BUSINESS_OPEN_MINUTE: 0, BUSINESS_CLOSE_MINUTE: 0 };
    }
    const [openHourRaw, openMinRaw = "0"] = String(businessHoursForDay.openTime || "09:00").split(":");
    const [closeHourRaw, closeMinRaw = "0"] = String(businessHoursForDay.closeTime || "17:00").split(":");
    const openHour = Math.max(0, Math.min(24, Number(openHourRaw)));
    const openMin = Math.max(0, Math.min(59, Number(openMinRaw)));
    const closeHour = Math.max(0, Math.min(24, Number(closeHourRaw)));
    const closeMin = Math.max(0, Math.min(59, Number(closeMinRaw)));
    return { BUSINESS_START_HOUR: openHour, BUSINESS_END_HOUR: closeHour, BUSINESS_OPEN_MINUTE: openMin, BUSINESS_CLOSE_MINUTE: closeMin };
  }, [businessHoursForDay]);

  // Total-minute forms — the close time keeps its minutes (a 23:50 close must not
  // collapse to 23:00 and block the 23:00–23:50 window).
  const BUSINESS_OPEN_TOTAL_MIN = BUSINESS_START_HOUR * 60 + BUSINESS_OPEN_MINUTE;
  const BUSINESS_CLOSE_TOTAL_MIN = BUSINESS_END_HOUR * 60 + BUSINESS_CLOSE_MINUTE;

  const baseStartHour = Math.max(0, BUSINESS_START_HOUR - settings.nonWorkingHoursDisplay);
  const baseEndHour = Math.min(24, Math.ceil(BUSINESS_CLOSE_TOTAL_MIN / 60) + settings.nonWorkingHoursDisplay);

  const displayedDayAppointments = useMemo(() => {
    if (!appointments) return [];
    return appointments.filter((apt: any) => {
      if (selectedStaffId !== "all" && apt.staffId !== selectedStaffId) return false;
      return isOnStoreDate(apt.date, currentDate, timezone);
    });
  }, [appointments, selectedStaffId, timezone, currentDate]);

  const { START_HOUR, END_HOUR } = useMemo(() => {
    let startHour = baseStartHour;
    let endHour = baseEndHour;

    for (const apt of displayedDayAppointments) {
      // Use formatInTz (→ formatInTimeZone) rather than toZonedTime+getUTCHours.
      // In date-fns-tz v3 the internal UTC-shift trick no longer works reliably.
      const startMinutes = parseInt(formatInTz(new Date(apt.date), timezone, "H"), 10) * 60
                         + parseInt(formatInTz(new Date(apt.date), timezone, "m"), 10);
      const effectiveEndMs = (apt.completedAt && apt.status === "completed")
        ? new Date(apt.completedAt).getTime()
        : new Date(apt.date).getTime() + Number(apt.duration || 0) * 60000;
      const effectiveDuration = Math.max(Math.round((effectiveEndMs - new Date(apt.date).getTime()) / 60000), 15);
      const endMinutes = Math.min(24 * 60, startMinutes + effectiveDuration);

      endHour = Math.max(endHour, Math.ceil(endMinutes / 60));
    }

    startHour = Math.max(0, startHour);
    endHour = Math.min(24, Math.max(endHour, startHour + 1));

    return { START_HOUR: startHour, END_HOUR: endHour };
  }, [baseStartHour, baseEndHour, displayedDayAppointments, timezone]);

  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const { position: timeLinePosition, timeLabel: timeLineLabel } = useCurrentTimeLine(timezone, START_HOUR, END_HOUR);
  const isToday = isSameStoreDay(currentDate, storeNow);

  // ── Unsettled-booking date lock ──────────────────────────────────────────
  // If any PAST day has appointments that haven't been paid or closed, the
  // calendar is locked to the earliest such date until all are settled.
  // "Unsettled" = not cancelled, not no_show, AND paymentStatus !== 'paid'.
  const unsettledLockDate = useMemo(() => {
    if (!posFeatureEnabled) return null;
    if (!appointments || !timezone) return null;
    // Compare store-LOCAL calendar days. `apt.date` is a true UTC instant, so an
    // evening appointment in a west-of-UTC timezone lands on the *next* UTC
    // calendar day — a raw `new Date(apt.date)` vs `getNowInTimezone()` (a
    // wall-clock Date) comparison then mis-classifies yesterday's late bookings
    // as "today" and the lock never engages. Reduce everything to "YYYY-MM-DD"
    // in the salon timezone and compare lexically.
    const todayStr = toLocalDateStringInTz(new Date(), timezone);
    let earliestStr: string | null = null;
    for (const apt of appointments as any[]) {
      if (
        apt.status === "cancelled" ||
        apt.status === "no_show" ||
        apt.status === "no-show" ||
        apt.status === "completed" ||
        apt.status === "done"
      ) continue;
      if (apt.paymentStatus === "paid") continue;
      const aptDayStr = toLocalDateStringInTz(apt.date, timezone);
      if (aptDayStr >= todayStr) continue; // only days strictly before today
      if (!earliestStr || aptDayStr < earliestStr) earliestStr = aptDayStr;
    }
    if (!earliestStr) return null;
    // Return a salon wall-clock Date (UTC fields carry the local Y/M/D) so it
    // lines up with `currentDate` / `formatStoreDate` / `isSameStoreDay`.
    return new Date(earliestStr + "T00:00:00Z");
  }, [appointments, timezone, posFeatureEnabled]);

  const isDateLocked = !!unsettledLockDate;

  // Pixel offset from the top of the scroll area to the business opening time.
  // Used to scroll to the open time on initial load (instead of "now") so the
  // full working day is visible right away.
  const businessOpenScrollPixels = (BUSINESS_OPEN_TOTAL_MIN - START_HOUR * 60) * (HOUR_HEIGHT / 60);


  // Auto-select the staff column for staff users once auth resolves
  useEffect(() => {
    if (isStaffUser && user?.staffId) {
      setSelectedStaffId(user.staffId as number);
    }
  }, [isStaffUser, user?.staffId]);

  useEffect(() => {
    const now = getNowInTimezone(timezone);
    setCurrentDate(now);
    setWeekStart(now);
    // Staff users are locked to their own column — don't reset to "all"
    setSelectedStaffId(isStaffUser && user?.staffId ? (user.staffId as number) : "all");
    setSelectedAppointment(null);
    setShowCheckout(false);
    setSelectedSlot(null);
    shouldAutoCenterTimeLineRef.current = true;
  }, [selectedStore?.id, timezone]);

  useEffect(() => {
    setSelectedSlot(null);
  }, [currentDate]);

  useEffect(() => {
    if (!isToday || !scrollContainerRef.current) return;
    if (!shouldAutoCenterTimeLineRef.current) return;
    // Wait for business hours to load before scrolling so we use the real open time.
    if (businessHours === undefined) return;
    const container = scrollContainerRef.current;
    // Scroll to the business opening time (not current time) so the full working
    // day is visible on initial load. The user can click "Now" to jump to current time.
    const BUFFER_PX = 12;
    const scrollTarget = Math.max(0, businessOpenScrollPixels - BUFFER_PX);
    programmaticScrollRef.current = true;
    container.scrollTo({ top: scrollTarget, behavior: "smooth" });
    shouldAutoCenterTimeLineRef.current = false;
  }, [isToday, businessOpenScrollPixels, currentDate, businessHours]);

  const scrollToNow = useCallback(() => {
    if (!nowLineRef.current) return;
    // Hide the button immediately so the user gets instant feedback.
    setShowJumpToNow(false);
    // Suppress the scroll listener so it doesn't re-show the button mid-animation.
    programmaticScrollRef.current = true;
    // Let the browser figure out the scroll ancestor — avoids the 88px offset
    // mismatch and the stale-ref problem with motion.div remounting on date change.
    nowLineRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    // Clear suppression after smooth-scroll animation finishes (~500ms; 900ms to be safe).
    setTimeout(() => { programmaticScrollRef.current = false; }, 900);
  }, []);

  useEffect(() => {
    // On mobile the scroll container has overflow-hidden (MobileCalendarView
    // manages its own internal scroll). scrollTop is always 0 so the check
    // would always read the timeline as off-screen and permanently set
    // showJumpToNow=true. Skip entirely on mobile — MobileCalendarView has
    // its own independent NOW button logic.
    if (isMobile) {
      setShowJumpToNow(false);
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) return;
    const checkVisibility = () => {
      // Flag is cleared by the setTimeout in scrollToNow — don't touch it here.
      if (programmaticScrollRef.current) return;
      shouldAutoCenterTimeLineRef.current = false;
      if (!isToday || timeLinePosition === null) {
        setShowJumpToNow(false);
        return;
      }
      // now-line is rendered at timeLinePosition + 88 from the content top
      // (88px = sticky staff-header height used in the top style).
      const lineTop = timeLinePosition + 88;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;
      const visible = lineTop >= viewTop + 40 && lineTop <= viewBottom - 40;
      setShowJumpToNow(!visible);
    };
    checkVisibility();
    container.addEventListener("scroll", checkVisibility, { passive: true });
    return () => container.removeEventListener("scroll", checkVisibility);
  }, [isMobile, isToday, timeLinePosition, currentDate]);

  const filteredStaff = useMemo(() => {
    if (!staffList) return [];
    if (selectedStaffId === "all") return staffList.filter((s: any) => s.showOnCalendar !== false);
    return staffList.filter((s: any) => s.id === selectedStaffId);
  }, [staffList, selectedStaffId]);

  const timeSlots = useMemo(() => {
    const slots: { hour: number; minute: number; label: string; isHour: boolean }[] = [];
    const interval = settings.timeSlotInterval;
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      for (let m = 0; m < 60; m += interval) {
        if (h === END_HOUR && m > 0) break;
        const isHour = m === 0;
        const label = isHour
          ? h === 0 ? "12 AM" : h === 12 ? "12 PM" : h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`
          : `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
        slots.push({ hour: h, minute: m, label, isHour });
      }
    }
    return slots;
  }, [START_HOUR, END_HOUR, settings.timeSlotInterval]);

  // Resources view always uses fixed 15-minute blocks regardless of calendar settings
  const resourceTimeSlots = useMemo(() => {
    const slots: { hour: number; minute: number; label: string; isHour: boolean }[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      for (let m = 0; m < 60; m += 15) {
        if (h === END_HOUR && m > 0) break;
        const isHour = m === 0;
        const label = isHour
          ? h === 0 ? "12 AM" : h === 12 ? "12 PM" : h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`
          : `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
        slots.push({ hour: h, minute: m, label, isHour });
      }
    }
    return slots;
  }, [START_HOUR, END_HOUR]);

  const getAppointmentsForStaff = (staffId: number) => {
    if (!appointments) return [];
    return appointments.filter((apt: any) => {
      return apt.staffId === staffId && isOnStoreDate(apt.date, currentDate, timezone) && !apt.calendarHidden;
    });
  };

  /** Returns the effective end time for a completed appointment.
   *  When an appointment has been checked out, the card height reflects the
   *  actual checkout time rather than the originally scheduled duration. */
  const getEffectiveEndDate = (apt: any): Date => {
    if (apt.completedAt && apt.status === "completed") {
      return new Date(apt.completedAt);
    }
    // No-show cards should only occupy the minimum visual slot so the
    // remainder of the original booked window is visibly free.
    if (apt.status === "no_show") {
      return new Date(apt.date);
    }
    return addMinutes(new Date(apt.date), Number(apt.duration || 0));
  };

  const getAppointmentStyle = (apt: any) => {
    // Use formatInTz (→ formatInTimeZone) — toZonedTime+getUTCHours breaks in date-fns-tz v3.
    const startMinutes = parseInt(formatInTz(new Date(apt.date), timezone, "H"), 10) * 60
                       + parseInt(formatInTz(new Date(apt.date), timezone, "m"), 10);
    const effectiveEnd = getEffectiveEndDate(apt);
    const effectiveDuration = Math.max(
      Math.round((effectiveEnd.getTime() - new Date(apt.date).getTime()) / 60000),
      15
    );
    const endMinutes = startMinutes + effectiveDuration;
    const visibleStartMinutes = START_HOUR * 60;
    const visibleEndMinutes = END_HOUR * 60;
    const clampedStartMinutes = Math.max(startMinutes, visibleStartMinutes);
    const clampedEndMinutes = Math.min(endMinutes, visibleEndMinutes);
    const topOffset = ((clampedStartMinutes - visibleStartMinutes) / 60) * HOUR_HEIGHT;
    const height = ((clampedEndMinutes - clampedStartMinutes) / 60) * HOUR_HEIGHT;
    return {
      top: `${topOffset}px`,
      height: `${Math.max(height, 30)}px`,
    };
  };

  // Auto-assigned palette colours keyed by staff id.
  // Sorted by id so the same member always gets the same colour regardless of filter.
  const staffColorMap = useMemo(
    () => assignStaffColors(staffList ?? []),
    [staffList]
  );

  const getStaffColor = (staffMember: any): string => {
    if (!staffMember?.id) return "#94a3b8";
    // Prefer the staff member's own "Calendar Color" (set on their profile,
    // TeamMembers.tsx/TeamMemberDetail.tsx's StaffColorPicker) — fall back to
    // the deterministic auto-assigned palette only for staff who haven't
    // picked one yet.
    return staffMember.color || staffColorMap.get(staffMember.id) || "#94a3b8";
  };

  const formatHourLabel = (timeStr: string) => {
    if (!timeStr) return "";
    const [hStr, mStr] = timeStr.split(":");
    const h24 = Number(hStr);
    const m = Number(mStr || 0);
    const ampm = h24 >= 12 ? "pm" : "am";
    const h = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    return `${h}:${String(m).padStart(2, "0")}${ampm}`;
  };

  const weekDayLabels = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = addStoreDays(weekStart, i);
      return { date: d, label: formatStoreDate(d, "EEE"), isToday: isSameStoreDay(d, storeNow) };
    });
  }, [weekStart, timezone, storeNow]);

  // Force calendar to the lock date whenever unsettled bookings are detected
  useEffect(() => {
    if (!unsettledLockDate) return;
    if (!isSameStoreDay(currentDate, unsettledLockDate)) {
      setCurrentDate(unsettledLockDate);
      setWeekStart(unsettledLockDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsettledLockDate]);

  const goToday = () => {
    if (isDateLocked) return; // blocked — unsettled bookings must be settled first
    shouldAutoCenterTimeLineRef.current = true;
    const now = getNowInTimezone(timezone);
    setCurrentDate(now);
    setWeekStart(now);
  };
  const [slideDir, setSlideDir] = useState<'next' | 'prev'>('next');
  const goPrev = useCallback(() => {
    if (isDateLocked) return; // blocked — unsettled bookings must be settled first
    // Never navigate before today — past dates are not viewable
    if (isToday) return;
    setSlideDir('prev');
    setCurrentDate(d => {
      const nd = addStoreDays(d, -1);
      setWeekStart(nd);
      return nd;
    });
  }, [isToday, isDateLocked]);
  const goNext = useCallback(() => {
    if (isDateLocked) return; // blocked — unsettled bookings must be settled first
    setSlideDir('next');
    setCurrentDate(d => {
      const nd = addStoreDays(d, 1);
      setWeekStart(nd);
      return nd;
    });
  }, [isDateLocked]);

  useEffect(() => {
    if (isMobile) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const deltaX = e.changedTouches[0].clientX - startX;
      const deltaY = e.changedTouches[0].clientY - startY;
      if (Math.abs(deltaX) < 50) return;
      if (Math.abs(deltaX) < Math.abs(deltaY)) return;
      if (deltaX < 0) goNext(); else goPrev();
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobile, goPrev, goNext]);

  // ── Close staff header menu when clicking outside ────────────────────────
  useEffect(() => {
    if (openStaffMenu === null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-staff-header-menu]")) {
        setOpenStaffMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openStaffMenu]);

  // ── Sync availability toggle with live timeclock status on popover open ──
  useEffect(() => {
    if (openStaffMenu === null || !selectedStore?.id) return;
    const staffId = openStaffMenu;
    const storeId = selectedStore.id;
    setStaffAvailLoading((prev) => ({ ...prev, [staffId]: true }));
    fetch(`/api/timeclock/status/${staffId}?storeId=${storeId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setStaffAvailOverride((prev) => ({ ...prev, [staffId]: !!data.clockedIn }));
      })
      .catch(() => { /* leave existing state on network error */ })
      .finally(() => {
        setStaffAvailLoading((prev) => ({ ...prev, [staffId]: false }));
      });
  }, [openStaffMenu, selectedStore?.id]);

  // ── QR / barcode scanner — open appointment sheet from kiosk ticket scan ──
  // Uses document-level keydown so it works regardless of which element has
  // focus (timeline re-renders, scroll effects, modal overlays — all safe).
  // USB/BT barcode scanners act as HID keyboards and inject keystrokes very
  // fast (< 50 ms apart); humans type > 100 ms apart. We exploit this gap.
  const handleQRScan = useCallback(async (raw: string) => {
    try {
      setQrFlash(true);
      setTimeout(() => setQrFlash(false), 600);

      const res = await fetch("/api/qr/lookup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrToken: raw }),
      });

      if (!res.ok) {
        toast({ title: t.qrNotFound, description: t.qrNotFoundDesc, variant: "destructive" });
        return;
      }

      const data = await res.json();
      if (!data.found) {
        toast({ title: t.qrNotFound, description: t.qrNotFoundDesc, variant: "destructive" });
        return;
      }

      // Try to find the appointment in the already-loaded list first (fast path)
      const loaded = (appointments ?? []) as AppointmentWithDetails[];
      const found = loaded.find((a) => a.id === data.appointmentId);

      if (found) {
        setSelectedAppointment(found);
        setShowCancelFlow(false);
        // If client already checked in, open directly to checkout
        if (found.status === "checked_in") setShowCheckout(true);
      } else {
        // Appointment exists but isn't on today's calendar — don't open it
        toast({
          title: t.qrNotToday,
          description: t.qrNotTodayDesc(data.clientName, data.service, data.date),
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: t.qrError, description: t.qrErrorDesc, variant: "destructive" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, toast]);

  useEffect(() => {
    const INTER_KEY_MAX_MS = 50;   // scanner chars arrive < 50 ms apart
    const BUFFER_RESET_MS  = 300;  // clear stale buffer after 300 ms silence
    const MIN_SCAN_LENGTH  = 6;    // ignore accidental single-key Enter presses

    const onKeyDown = (e: KeyboardEvent) => {
      // Never intercept when the user is typing in a real form field
      const tag = (document.activeElement?.tagName ?? "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((document.activeElement as HTMLElement | null)?.isContentEditable) return;

      const now = Date.now();
      const gap = now - qrLastKeyAt.current;
      qrLastKeyAt.current = now;

      if (e.key === "Enter") {
        const scanned = qrScanBuffer.current;
        qrScanBuffer.current = "";
        if (qrScanTimer.current) { clearTimeout(qrScanTimer.current); qrScanTimer.current = null; }
        if (scanned.length >= MIN_SCAN_LENGTH) {
          e.preventDefault();
          handleQRScan(scanned);
        }
        return;
      }

      // Accept printable single characters that arrive within the scanner window
      if (e.key.length !== 1) return;

      if (qrScanBuffer.current.length > 0 && gap > INTER_KEY_MAX_MS) {
        // Gap too large — scanner stream broken; restart with this character
        qrScanBuffer.current = e.key;
      } else {
        qrScanBuffer.current += e.key;
      }

      // Auto-clear stale buffer if Enter never arrives
      if (qrScanTimer.current) clearTimeout(qrScanTimer.current);
      qrScanTimer.current = setTimeout(() => {
        qrScanBuffer.current = "";
        qrScanTimer.current = null;
      }, BUFFER_RESET_MS);
    };

    document.addEventListener("keydown", onKeyDown, true); // capture phase → runs before any child handler
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [handleQRScan]);

  const getAvailableMinutesForSlot = useCallback((staffId: number, slotHour: number, slotMinute: number) => {
    if (!appointments) return END_HOUR * 60 - (slotHour * 60 + slotMinute);
    const staffApts = appointments.filter((apt: any) => {
      // Skip cancelled and no-show slots — they are considered free time.
      if (apt.staffId !== staffId || apt.status === "cancelled" || apt.status === "no_show") return false;
      return isOnStoreDate(apt.date, currentDate, timezone);
    });
    const slotStartMin = slotHour * 60 + slotMinute;
    const endOfDayMin = END_HOUR * 60;
    let nextBoundary = endOfDayMin;
    for (const apt of staffApts) {
      const aptStartMin = parseInt(formatInTz(new Date(apt.date), timezone, "H"), 10) * 60
                        + parseInt(formatInTz(new Date(apt.date), timezone, "m"), 10);
      if (aptStartMin > slotStartMin && aptStartMin < nextBoundary) {
        nextBoundary = aptStartMin;
      }
    }
    return nextBoundary - slotStartMin;
  }, [appointments, timezone, currentDate, END_HOUR]);

  const handleSlotClick = useCallback((staffId: number, slotHour: number, slotMinute: number) => {
    // Convert the slot time using the store timezone (not the browser timezone)
    // so the past-time guard is correct even when the browser TZ differs from the store.
    const slotDateStr = `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, "0")}-${String(currentDate.getUTCDate()).padStart(2, "0")}T${String(slotHour).padStart(2, "0")}:${String(slotMinute).padStart(2, "0")}:00`;
    if (isStoreLocalSlotInPast(slotDateStr, timezone)) return;
    const availMins = getAvailableMinutesForSlot(staffId, slotHour, slotMinute);
    if (availMins <= 0) return;
    setSelectedSlot(prev =>
      prev?.staffId === staffId && prev?.hour === slotHour && prev?.minute === slotMinute
        ? null
        : { staffId, hour: slotHour, minute: slotMinute }
    );
  }, [currentDate, timezone, getAvailableMinutesForSlot]);

  const handleBookSlot = useCallback((staffId: number, slotHour: number, slotMinute: number) => {
    const availMins = getAvailableMinutesForSlot(staffId, slotHour, slotMinute);
    if (availMins <= 0) return;
    const dateStr = `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, "0")}-${String(currentDate.getUTCDate()).padStart(2, "0")}`;
    const timeStr = `${String(slotHour).padStart(2, "0")}:${String(slotMinute).padStart(2, "0")}`;
    navigate(`/booking/new?staffId=${staffId}&date=${dateStr}&time=${timeStr}&availableMinutes=${availMins}`);
  }, [currentDate, navigate, getAvailableMinutesForSlot]);

  const handleCancelAppointment = (apt: AppointmentWithDetails) => {
    setShowCancelFlow(true);
  };

  const handleMarkNoShow = (apt: AppointmentWithDetails) => {
    updateAppointment.mutate(
      { id: apt.id, status: "no_show", cancellationReason: "No Show" } as any,
      {
        onSuccess: () => {
          setSelectedAppointment(null);
          setShowCancelFlow(false);
        },
      }
    );
  };

  const handleDeleteCancelledCard = useCallback(async (aptId: number) => {
    try {
      await fetch(`/api/appointments/${aptId}`, {
        method: "DELETE",
        credentials: "include",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    } catch {
      // Silent fail — card will re-appear on next refresh
    }
  }, [queryClient]);

  const handleConfirmCancel = (apt: AppointmentWithDetails, reason: string) => {
    const isNoShow = reason === "No Show";
    updateAppointment.mutate(
      {
        id: apt.id,
        status: isNoShow ? "no_show" : "cancelled",
        cancellationReason: reason,
        // Staff-initiated cancellations are hidden from the calendar view immediately.
        // Client (booking link) and AI receptionist cancellations are NOT hidden —
        // they remain visible so staff can see what was cancelled externally.
        ...(isNoShow ? {} : { calendarHidden: true }),
      } as any,
      {
        onSuccess: () => {
          setSelectedAppointment(null);
          setShowCancelFlow(false);
        },
      }
    );
  };

  const handleStartService = (apt: AppointmentWithDetails) => {
    updateAppointment.mutate(
      { id: apt.id, status: "started" } as any,
      {
        onSuccess: (updated: any) => {
          setSelectedAppointment({ ...apt, status: "started" });
        },
      }
    );
  };

  const handleCheckout = (apt: AppointmentWithDetails) => {
    // Offline: drawer session can't be verified — let checkout proceed and queue
    // the status update. When back online, the action queue will sync it.
    if (!openDrawerSession && navigator.onLine) {
      setShowOpenRegister(true);
      return;
    }
    // On native AND web: always open the checkout sheet first so staff can
    // review line items, apply a discount/tip, and then tap Finalize & Pay.
    // The native POS modal is opened from that button, not from here.
    setShowCheckout(true);
  };

  // ── Native app: listen for payment complete posted back from native POS ─────
  // The native POSModal dispatches this event after cash / card / M2 payment.
  // We update the appointment status, payment method, and total paid so the
  // booking ticket reflects the completed transaction.
  useEffect(() => {
    if (!(window as any).CERTXA_NATIVE_APP) return;
    const handler = (e: Event) => {
      const { appointmentId, method, amount } = (e as CustomEvent).detail ?? {};
      if (!appointmentId) return;
      updateAppointment.mutate(
        {
          id: appointmentId,
          status: "completed",
          paymentMethod: method || 'cash',
          totalPaid: String(amount || 0),
        } as any,
        { onSuccess: () => {
            setSelectedAppointment(null);
            queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
          }
        }
      );
    };
    window.addEventListener('certxa_native_payment_complete', handler);
    return () => window.removeEventListener('certxa_native_payment_complete', handler);
  }, [updateAppointment, queryClient]);

  const handleComplete = (apt: AppointmentWithDetails) => {
    updateAppointment.mutate(
      { id: apt.id, status: "completed" } as any,
      { onSuccess: () => setSelectedAppointment(null) }
    );
  };

  // ── Drag-and-drop rescheduling ──
  const handleAppointmentDragStart = (e: React.DragEvent, apt: any) => {
    if (apt.status === "completed") {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", String(apt.id));
    e.dataTransfer.effectAllowed = "move";
    setDraggedAppointment({ id: apt.id, staffId: apt.staffId });
  };

  const handleSlotDragOver = (e: React.DragEvent, staffId: number, hour: number, minute: number) => {
    if (!draggedAppointment) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ staffId, hour, minute });
  };

  const handleSlotDragLeave = (e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    if (e.currentTarget && relatedTarget && !e.currentTarget.contains(relatedTarget)) {
      setDropTarget(null);
    }
  };

  const handleSlotDrop = (e: React.DragEvent, staffId: number, hour: number, minute: number) => {
    e.preventDefault();
    const appointmentId = e.dataTransfer.getData("text/plain");
    if (!appointmentId) return;

    const aptId = Number(appointmentId);

    // Convert the drop target time from store-local to UTC so the appointment
    // lands at the correct time even when the browser timezone differs from the store.
    const dropDateStr = `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, "0")}-${String(currentDate.getUTCDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
    const newDate = storeLocalToUtc(dropDateStr, timezone);

    const updates: Record<string, any> = { date: newDate.toISOString() };
    if (draggedAppointment && staffId !== draggedAppointment.staffId) {
      updates.staffId = staffId;
    }

    updateAppointment.mutate(
      { id: aptId, ...updates } as any,
      {
        onSuccess: () => {
          toast({
            title: t.rescheduleSuccess,
            description: t.rescheduleSuccessDesc,
          });
        },
        onError: () => {
          toast({
            title: t.rescheduleFail,
            description: t.rescheduleFailDesc,
            variant: "destructive",
          });
        },
      },
    );

    setDraggedAppointment(null);
    setDropTarget(null);
  };

  const handleAppointmentDragEnd = () => {
    setDraggedAppointment(null);
    setDropTarget(null);
  };
  // ── End drag-and-drop ──

  const handleFinalizePayment = (
    apt: AppointmentWithDetails,
    paymentData: { paymentMethod: string; tip: number; discount: number; totalPaid: number; groupTickets?: { appointmentId: number; tip: number; discount: number; totalPaid: number; paymentMethod: string }[]; redemption?: { rewardId: number; customerId: number } },
  ) => {
    const close = () => { setSelectedAppointment(null); setShowCheckout(false); };

    // Spend the customer's loyalty points on the redeemed reward (the $ value is
    // already baked into the ticket discount). Best-effort — a points shortfall
    // shouldn't block the sale from closing.
    if (paymentData.redemption?.rewardId && paymentData.redemption.customerId) {
      fetch("/api/loyalty/redeem", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rewardId: paymentData.redemption.rewardId,
          customerId: paymentData.redemption.customerId,
          appointmentId: apt.id,
        }),
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/customers"] }))
        .catch(() => {});
    }

    if (paymentData.groupTickets && paymentData.groupTickets.length > 0) {
      // Group Pay — complete & pay each linked ticket individually with its share.
      Promise.all(
        paymentData.groupTickets.map((g) =>
          updateAppointment.mutateAsync({
            id: g.appointmentId,
            status: "completed",
            paymentMethod: g.paymentMethod,
            tipAmount: String(g.tip),
            discountAmount: String(g.discount),
            totalPaid: String(g.totalPaid),
          } as any),
        ),
      ).then(close).catch(() => {
        toast({ title: t.ticketsNotSaved, description: t.ticketsNotSavedDesc, variant: "destructive" });
      });
      return;
    }

    updateAppointment.mutate(
      {
        id: apt.id,
        status: "completed",
        paymentMethod: paymentData.paymentMethod,
        tipAmount: String(paymentData.tip),
        discountAmount: String(paymentData.discount),
        totalPaid: String(paymentData.totalPaid),
      } as any,
      { onSuccess: close },
    );
  };

  if (authLoading) {
    return (
      <div className="dark cx-cal text-foreground h-app w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="dark cx-cal text-foreground h-app w-full overflow-hidden flex flex-col bg-background">

      {/* ── Desktop header ── */}
      {!isMobile && (
      <div className="flex items-center h-[56px] px-4 border-b bg-white gap-0 flex-shrink-0" data-testid="calendar-header">

        {/* LEFT: View toggle + All Staff dropdown */}
        {/* View toggle — desktop only, moved to far left */}
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0 flex-shrink-0 mr-3">
          <button
            onClick={() => setCalView("grid")}
            aria-label="Grid view"
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md transition-all",
              calView === "grid"
                ? "bg-white shadow-sm text-teal-600"
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            <CalendarDays className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCalView("agenda")}
            aria-label="Agenda view"
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md transition-all",
              calView === "agenda"
                ? "bg-white shadow-sm text-teal-600"
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCalView("resources")}
            aria-label="Resources view"
            title="Resources view — one column per station / chair"
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md transition-all",
              calView === "resources"
                ? "bg-white shadow-sm text-teal-600"
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>

        {!isStaffUser && calView === "grid" && (
          <div className="flex-shrink-0 mr-4">
            <Select
              value={selectedStaffId === "all" ? "all" : String(selectedStaffId)}
              onValueChange={(val) => setSelectedStaffId(val === "all" ? "all" : Number(val))}
            >
              <SelectTrigger className="h-9 w-[150px] border-slate-200 bg-slate-50 text-sm rounded-full pl-3" data-testid="select-staff-filter">
                <Users className="w-3.5 h-3.5 mr-1.5 text-slate-400 flex-shrink-0" />
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.allStaff}</SelectItem>
                {staffList?.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* CENTER: ← Date → + Week chips inline */}
        <div className="flex items-center gap-0 flex-1 justify-center">
          {!isToday && (
            <button
              onClick={goToday}
              className="mr-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors flex-shrink-0"
              data-testid="button-go-today"
            >
              Today
            </button>
          )}
          <button
            onClick={goPrev}
            disabled={isToday}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors flex-shrink-0 disabled:opacity-25 disabled:cursor-not-allowed disabled:pointer-events-none"
            data-testid="button-prev-day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            className="text-[18px] font-bold text-slate-800 whitespace-nowrap px-2 hover:text-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none"
            onClick={() => { if (!isDateLocked) setShowDatePicker(true); }}
            disabled={isDateLocked}
            title={isDateLocked ? "Settle unpaid appointments before changing dates" : undefined}
            data-testid="button-current-date"
          >
            {formatStoreDate(currentDate, "EEE d MMM, yyyy")}
            {isDateLocked && (
              <svg className="inline-block ml-1.5 w-3.5 h-3.5 text-amber-500 align-middle" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          <button
            onClick={goNext}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors flex-shrink-0"
            data-testid="button-next-day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Week day chips — inline after date nav; tapping only moves highlight, not week anchor.
              Hidden below ~1180px (10" tablets) where the row would push header controls off-screen. */}
          <div className="hidden min-[1180px]:flex items-center gap-0.5 ml-3">
            {weekDayLabels.map((wd) => {
              const isSelected = isSameStoreDay(wd.date, currentDate);
              const chipLocked = isDateLocked && !isSelected;
              return (
                <button
                  key={wd.date.toISOString()}
                  onClick={() => { if (!chipLocked) setCurrentDate(wd.date); }}
                  disabled={chipLocked}
                  title={chipLocked ? "Settle unpaid appointments before changing dates" : undefined}
                  data-testid={`button-weekday-${wd.label.toLowerCase()}`}
                  className={cn(
                    "flex flex-col items-center justify-center w-[38px] h-[38px] rounded-lg transition-all leading-none gap-[2px]",
                    isSelected
                      ? "bg-teal-500 text-white shadow-sm"
                      : chipLocked
                        ? "text-slate-300 bg-slate-50 cursor-not-allowed opacity-50"
                        : "text-slate-600 bg-slate-100 hover:bg-slate-200"
                  )}
                >
                  <span className={cn("text-[10px]", isSelected ? "font-semibold" : "font-medium")}>
                    {wd.label}
                  </span>
                  <span className={cn("text-[11px] font-bold leading-none")}>
                    {formatStoreDate(wd.date, "d")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: TURN | view toggle | Certxa+CX as new-appt trigger */}
        <div className="flex items-center gap-3 flex-shrink-0">

          {/* Silent background-sync indicator — only visible during background refetches, never on initial load */}
          {isFetchingAppointments && !isLoadingAppointments && (
            <Loader2 className="w-3 h-3 text-slate-300 animate-spin flex-shrink-0" aria-label="Syncing calendar…" />
          )}

          {/* QR scanner ready indicator — pulses green when a scan is detected */}
          <div
            title="QR scanner active — scan a kiosk ticket to open booking"
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold flex-shrink-0 transition-all duration-300 select-none",
              qrFlash
                ? "bg-green-500 text-white scale-110"
                : "bg-slate-100 text-slate-400"
            )}
          >
            <QrCode className="w-3 h-3" />
            <span className="hidden lg:inline">{qrFlash ? "Scanned!" : "Scan"}</span>
          </div>

          {/* Thermal printer connect button */}
          {thermalPrinter.isAvailable && (
            <button
              onClick={thermalPrinter.isConnected ? thermalPrinter.disconnect : thermalPrinter.connect}
              title={
                thermalPrinter.isConnected
                  ? `${thermalPrinter.deviceName ?? "Printer"} connected — click to disconnect`
                  : thermalPrinter.status === "error"
                  ? `Error: ${thermalPrinter.error} — click to retry`
                  : "Connect Bluetooth thermal printer"
              }
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold flex-shrink-0 transition-all duration-300 select-none",
                thermalPrinter.isConnected
                  ? "bg-green-100 text-green-700 border border-green-200"
                  : thermalPrinter.status === "connecting"
                  ? "bg-amber-100 text-amber-600 animate-pulse"
                  : thermalPrinter.status === "error"
                  ? "bg-red-100 text-red-600"
                  : "bg-slate-100 text-slate-400 hover:bg-slate-200"
              )}
            >
              <Printer className="w-3 h-3" />
              <span className="hidden lg:inline">
                {thermalPrinter.isConnected
                  ? (thermalPrinter.deviceName?.split(" ")[0] ?? "Printer")
                  : thermalPrinter.status === "connecting"
                  ? "Connecting…"
                  : "Printer"}
              </span>
            </button>
          )}

          {/* Certxa branding — doubles as new-appointment trigger */}
          <div className="relative pl-3 border-l border-slate-200">
            <button
              onClick={() => setShowNewApptMenu(v => !v)}
              data-testid="button-new-appointment"
              aria-label="New appointment"
              className="flex items-center gap-2 hover:opacity-75 active:scale-95 transition-all duration-100"
            >
              <div className="hidden min-[1100px]:block text-right leading-none">
                <div className="text-[16px] font-black text-teal-500 tracking-tight">Certxa</div>
                <div className="text-[10px] font-semibold text-slate-400 tracking-wide">SalonOS</div>
              </div>
              {/* Animated light-sweep ring around CX avatar */}
              <div className="relative flex-shrink-0">
                <div
                  className="absolute rounded-full animate-spin pointer-events-none"
                  style={{
                    inset: "-3px",
                    background:
                      "conic-gradient(from 0deg, #e8185c 0deg, #f06292 50deg, #fce4ec 80deg, transparent 130deg, transparent 270deg, #c9154f 320deg, #e8185c 360deg)",
                    animationDuration: "2.4s",
                  }}
                />
                <div className="relative w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center text-white font-black text-sm shadow-sm z-10">
                  CX
                </div>
              </div>
            </button>
            {showNewApptMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowNewApptMenu(false)}
                />
                <div
                  className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-lg shadow-xl overflow-hidden"
                  onClick={e => e.stopPropagation()}
                  data-testid="popover-new-appointment-menu"
                >
                  <div className="px-3 py-2 border-b bg-muted/50">
                    <span className="text-xs font-semibold text-foreground">{t.appointment}</span>
                  </div>
                  <div className="p-2 flex flex-col gap-2 min-w-[200px]">
                  <button
                    className="w-full min-h-[56px] px-3 py-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                    onClick={() => {
                      setShowNewApptMenu(false);
                      setLookupMode(false);
                      setSelectedAppointment(null);
                      setShowCancelFlow(false);
                      setShowCheckout(false);
                      setShowClientLookup(true);
                    }}
                    data-testid="button-create-new-appointment"
                  >
                    <CalendarPlus className="w-4 h-4 shrink-0" />
                    <span>{t.book}</span>
                  </button>
                  <button
                    className="w-full min-h-[56px] px-3 py-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                    onClick={() => {
                      setShowNewApptMenu(false);
                      setLookupMode(true);
                      setSelectedAppointment(null);
                      setShowCancelFlow(false);
                      setShowCheckout(false);
                      setShowClientLookup(true);
                    }}
                    data-testid="button-lookup-appointment"
                  >
                    <Search className="w-4 h-4 shrink-0" />
                    <span>{t.lookUp}</span>
                  </button>
                  <button
                    className="w-full min-h-[56px] px-3 py-3 rounded-md border border-border text-sm font-semibold hover:bg-muted transition-colors flex items-center justify-center gap-2"
                    onClick={() => {
                      setShowNewApptMenu(false);
                    }}
                    data-testid="button-cancel-new-appointment-menu"
                  >
                    <span>{t.cancel}</span>
                  </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ── Unsettled-booking lock banner ─────────────────────────────────── */}
      {isDateLocked && unsettledLockDate && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-sm flex-shrink-0">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          <span>
            <strong>Calendar locked</strong> — {formatStoreDate(unsettledLockDate, "EEEE, MMM d")} has unpaid appointments that need to be settled before you can navigate to another day.
          </span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {/* Icon sidebar — always icon + label, teal active */}
        <nav
          className="hidden sm:flex flex-shrink-0 w-[72px] border-r border-slate-100 bg-white flex-col items-center py-3 gap-1 z-30"
          data-testid="calendar-nav-drawer"
        >
          {/* CX logo mark */}
          <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center text-white font-black text-sm mb-3 flex-shrink-0">
            CX
          </div>
          {(() => {
            const navLabel = (item: SidebarItem) => {
              const key = item.kind === "action" ? item.action : item.to;
              switch (key) {
                case "/calendar":       return t.navCalendar;
                case "quick-checkout":  return t.navQuickLists;
                case "client-lookup":   return t.navClients;
                case "open-register":   return t.navPos;
                case "/reports":        return t.navReports;
                case "cash-drawer":     return t.navCashDrawer;
                case "day-close":       return t.navDayClose;
                default:                return item.label;
              }
            };
            return (<>
          {calendarSidebarItems.filter((item) => {
            if (item.kind === "action" && item.action === "cash-drawer") return false;
            if (!posFeatureEnabled && item.kind === "action" && (item.action === "open-register" || item.action === "day-close")) return false;
            return true;
          }).map((item, idx) => {
            const baseClasses = "w-14 flex flex-col items-center justify-center rounded-xl py-2.5 gap-1 border border-transparent transition-all duration-150 cursor-pointer";
            if (item.kind === "action") {
              const isOpenRegister = item.action === "open-register";
              const isAppointments = item.action === "quick-checkout";
              return (
                <button
                  key={`action-${idx}`}
                  type="button"
                  onClick={() => {
                    if (isOpenRegister) {
                      setListView("checkout");
                      setQuickCheckoutOpen(true);
                    } else if (item.action === "day-close") {
                      setShowDayClose(true);
                    } else if (item.action === "client-lookup") {
                      setShowClientLookupSheet(true);
                    } else {
                      if (!openDrawerSession) {
                        setShowOpenRegister(true);
                      } else {
                        setListView("menu");
                        setQuickCheckoutOpen(true);
                      }
                    }
                  }}
                  data-testid={isOpenRegister ? "button-open-register" : item.action === "day-close" ? "button-day-close" : "button-quick-checkout"}
                  className={cn(baseClasses, "text-slate-400 hover:text-teal-600 hover:bg-teal-50 hover:border-teal-100")}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium leading-tight text-center">{navLabel(item)}</span>
                </button>
              );
            }
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  baseClasses,
                  isActive
                    ? "text-teal-600 bg-teal-50 border-teal-100"
                    : "text-slate-400 hover:text-teal-600 hover:bg-teal-50 hover:border-teal-100"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-tight text-center">{navLabel(item)}</span>
              </Link>
            );
          })}
            </>);
          })()}

          {/* Timeclock In/Out button — only shown when Timeclock feature is enabled */}
          {timeclockEnabled && (
            <button
              type="button"
              onClick={() => setShowTimeclockSheet(true)}
              className="w-14 flex flex-col items-center justify-center rounded-xl py-2.5 gap-1 border border-transparent transition-all duration-150 cursor-pointer text-slate-400 hover:text-teal-600 hover:bg-teal-50 hover:border-teal-100 mt-auto"
              data-testid="button-timeclock-inout"
            >
              <Clock className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-tight text-center">{t.navInOut}</span>
            </button>
          )}
        </nav>

        <div className="flex-1 overflow-hidden relative">
          {showCashDrawer && (
            <div
              className="absolute inset-0 z-[48] bg-background"
              data-testid="cash-drawer-overlay"
            >
              <CashDrawerPanel
                embedded
                onClose={() => setShowCashDrawer(false)}
              />
            </div>
          )}

          {/* Open Register modal — triggers at 1 AM ET and on calendar mount when drawer not yet open */}
          {posEnabled && selectedStore && (
            <OpenRegisterModal
              open={showOpenRegister}
              onClose={() => {
                // Track dismissal so we don't re-prompt if they navigate away and back today
                const storageKey = `certxa_drawer_prompted_${selectedStore.id}_${todayStoreLocal()}`;
                localStorage.setItem(storageKey, "1");
                setShowOpenRegister(false);
              }}
              storeId={selectedStore.id}
              userName={user?.firstName || user?.email || "Staff"}
            />
          )}

          {/* Day Close modal — opened from the toolbar Lock icon */}
          {posEnabled && selectedStore && (
            <DayCloseModal
              open={showDayClose}
              onClose={() => setShowDayClose(false)}
              storeId={selectedStore.id}
              userName={user?.firstName || user?.email || "Staff"}
            />
          )}

          {/* POS sheet — full-screen overlay opened from the POS toolbar button or BOOK flow */}
          {showPOSSheet && createPortal(
            <div className="fixed inset-0 z-[95] flex flex-col bg-white">
              <div className="flex items-center justify-between shrink-0 border-b border-slate-200 bg-slate-50 px-4 h-10">
                <span className="text-sm font-semibold text-slate-700">Point of Sale</span>
                <button
                  type="button"
                  onClick={() => { setShowPOSSheet(false); setPosClientId(null); }}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                  aria-label="Close POS"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <POSInterface initialClientId={posClientId} />
              </div>
            </div>,
            document.body
          )}
          {/* Walk-In Checkout — cart+keypad POS opened from the POS toolbar button */}
          {showWalkInCheckout && createPortal(
            <WalkInCheckoutPanel
              onClose={() => setShowWalkInCheckout(false)}
              onThermalPrint={thermalPrinter.isConnected ? thermalPrinter.print : undefined}
            />,
            document.body
          )}
          {showJumpToNow && calView === "grid" && !isMobile && (
            <button
              onClick={scrollToNow}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-500 text-white text-sm font-semibold shadow-lg hover:bg-blue-600 transition-colors"
              data-testid="button-jump-to-now"
            >
              <Clock className="w-4 h-4" />
              {t.now}
            </button>
          )}

          {/* ── Weekly Agenda View (all screen sizes) ── */}
          {calView === "agenda" && (
            <div className="absolute inset-0 overflow-hidden" style={isMobile ? { paddingBottom: 72 } : undefined}>
              <WeeklyAgendaView
                appointments={appointments ?? []}
                staffList={staffList ?? []}
                timezone={timezone}
                weekDayLabels={weekDayLabels}
                currentDate={currentDate}
                selectedAppointment={selectedAppointment}
                onSelectAppointment={(apt) => {
                  setSelectedAppointment(apt);
                  setShowCheckout(false);
                  setShowCancelFlow(false);
                }}
                onNewBooking={() => {
                  setLookupMode(false);
                  setSelectedAppointment(null);
                  setShowCancelFlow(false);
                  setShowCheckout(false);
                  setShowClientLookup(true);
                }}
                getStaffColor={getStaffColor}
                onBack={isMobile ? () => setCalView("grid") : undefined}
              />
            </div>
          )}

          {/* ── Grid view (mobile + desktop) ── */}
          {calView === "grid" && (
          <AnimatePresence initial={false} custom={slideDir}>
          <motion.div
            key={currentDate.toISOString().slice(0, 10)}
            ref={scrollContainerRef}
            custom={slideDir}
            initial={((dir: string) => ({ x: dir === 'next' ? '100%' : '-100%' })) as any}
            animate={{ x: 0 }}
            exit={((dir: string) => ({ x: dir === 'next' ? '-100%' : '100%' })) as any}
            transition={{ type: 'tween', ease: [0.25, 0.46, 0.45, 0.94], duration: 0.22 }}
            className={isMobile ? "absolute inset-0 overflow-hidden" : "absolute inset-0 overflow-auto"}
            style={isMobile ? { paddingBottom: 128 } : undefined}
          >
            {isMobile ? (
              <MobileCalendarView
                filteredStaff={filteredStaff}
                isPastDate={false}
                timeSlots={timeSlots}
                START_HOUR={START_HOUR}
                END_HOUR={END_HOUR}
                TOTAL_HOURS={TOTAL_HOURS}
                HOUR_HEIGHT={HOUR_HEIGHT}
                getAppointmentsForStaff={getAppointmentsForStaff}
                getAppointmentStyle={getAppointmentStyle}
                getStaffColor={getStaffColor}
                timezone={timezone}
                selectedAppointment={selectedAppointment}
                onSelectAppointment={(apt) => { setSelectedAppointment(apt); setShowCheckout(false); setShowCancelFlow(false); }}
                handleSlotClick={handleSlotClick}
                selectedSlot={selectedSlot}
                setSelectedSlot={(s) => setSelectedSlot(s)}
                handleBookSlot={handleBookSlot}
                isToday={isToday}
                timeLinePosition={timeLinePosition}
                timeLineLabel={timeLineLabel}
                showPrices={showPrices}
                lateGracePeriodMinutes={lateGracePeriodMinutes}
                storeNow={storeNow}
                settings={settings}
                weekDayLabels={weekDayLabels}
                currentDate={currentDate}
                onSelectDate={(date) => { setCurrentDate(date); }}
                onNewBooking={() => {
                  setLookupMode(false);
                  setSelectedAppointment(null);
                  setShowCancelFlow(false);
                  setShowCheckout(false);
                  setShowClientLookup(true);
                }}
                onLookup={() => {
                  setLookupMode(true);
                  setSelectedAppointment(null);
                  setShowCancelFlow(false);
                  setShowCheckout(false);
                  setShowClientLookup(true);
                }}
                selectedStaffId={selectedStaffId}
                onFilterStaff={(id) => setSelectedStaffId(id)}
                onQuickStart={(apt) => handleStartService(apt)}
                onQuickComplete={(apt) => handleComplete(apt)}
                onQuickCancel={(apt) => {
                  setSelectedAppointment(apt);
                  setShowCancelFlow(true);
                  setShowCheckout(false);
                }}
                goToday={goToday}
                onOpenDatePicker={() => setShowDatePicker(true)}
                calView={calView}
                onToggleCalView={() => setCalView(v => v === "grid" ? "agenda" : "grid")}
                staffList={staffList ?? []}
                isStaffUser={isStaffUser}
                tToday={t.today}
                tAllStaff={t.allStaff}
                allStaffAvailability={allStaffAvailability ?? []}
                businessStartMin={BUSINESS_OPEN_TOTAL_MIN}
                businessEndMin={BUSINESS_CLOSE_TOTAL_MIN}
                businessIsClosed={!!(businessHoursForDay?.isClosed)}
              />
            ) : (
            <div className="flex min-w-[600px] relative">
              {isToday && timeLinePosition !== null && (
                <div
                  ref={nowLineRef}
                  className="absolute left-0 right-0 z-[35] pointer-events-none flex items-center -translate-y-1/2"
                  style={{ top: `${timeLinePosition + 88}px` }}
                  data-testid="current-time-line-full"
                >
                  {/* Pill — fills the full 90px time-column so it covers the label beneath */}
                  <div className="w-[90px] flex-shrink-0 flex px-1">
                    <span
                      className="flex-1 inline-flex items-center justify-center rounded-md py-1 text-xs font-bold text-white shadow-[0_2px_8px_rgba(232,24,92,0.4)]"
                      style={{ backgroundColor: "#2dd4bf" }}
                      data-testid="current-time-label"
                    >
                      {timeLineLabel}
                    </span>
                  </div>
                  {/* Line anchored to pill's right edge */}
                  <div className="flex-1 h-[2px]" style={{ backgroundColor: "#2dd4bf" }} />
                </div>
              )}
              <div className="w-[90px] flex-shrink-0 bg-white z-30 sticky left-0">
                <div className="h-[68px] border-b sticky top-0 bg-white z-40" />
                <div className="relative" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
                  {Array.from({ length: TOTAL_HOURS * 4 + 1 }, (_, i) => {
                    const totalMins = i * 15;
                    const h = START_HOUR + Math.floor(totalMins / 60);
                    const m = totalMins % 60;
                    if (h > END_HOUR || (h === END_HOUR && m > 0)) return null;
                    const isHour = m === 0;
                    const hMod = h % 24;
                    const displayH = hMod === 0 ? 12 : hMod > 12 ? hMod - 12 : hMod;
                    const ampmLabel = hMod >= 12 ? "PM" : "AM";
                    const topPx = (totalMins / 60) * HOUR_HEIGHT;
                    if (isHour) {
                      return (
                        <div
                          key={`label-${h}-${m}`}
                          className="absolute left-0 right-0 flex items-center justify-end pr-2.5 -translate-y-1/2"
                          style={{ top: `${topPx}px` }}
                        >
                          <span className="text-[13px] font-bold text-indigo-600 leading-none tabular-nums">
                            {displayH} {ampmLabel}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`label-${h}-${m}`}
                        className="absolute left-0 right-0 flex items-center justify-end pr-2.5 -translate-y-1/2"
                        style={{ top: `${topPx}px` }}
                      >
                        <span className="text-[12px] font-medium text-slate-500 leading-none tabular-nums">
                          {m}
                        </span>
                      </div>
                    );
                  })}

                </div>
              </div>

              <div ref={staffGridRef} className="flex flex-1 relative" style={{ backgroundColor: "hsl(var(--background))" }}>

                {filteredStaff.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-20">
                    {staffLoading ? t.loadingStaff : t.noStaffFound}
                  </div>
                ) : (
                  <>
                  {filteredStaff.map((member: any, idx: number) => {
                    const staffApts = getAppointmentsForStaff(member.id);
                    const color = getStaffColor(member);

                    return (
                      <div
                        key={member.id}
                        className="flex-none"
                        style={{
                          width: `${STAFF_CALENDAR_COLUMN_WIDTH}px`,
                          minWidth: `${STAFF_CALENDAR_COLUMN_WIDTH}px`,
                          maxWidth: `${STAFF_CALENDAR_COLUMN_WIDTH}px`,
                        }}
                      >
                          <div
                            className="h-[68px] border-b flex flex-col items-center justify-center gap-1 px-2 sticky top-0 bg-white z-20 cursor-pointer select-none hover:bg-slate-50 transition-colors relative"
                            onClick={() => setOpenStaffMenu(openStaffMenu === member.id ? null : member.id)}
                            data-testid={`staff-header-${member.id}`}
                            data-staff-header-menu
                          >
                            <div className="hidden w-9 h-9 rounded-lg overflow-hidden ring-2 ring-white shadow-md flex-shrink-0">
                              {member.avatarUrl ? (
                                <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover object-top" />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center text-xs font-bold text-white"
                                  style={{ backgroundColor: color }}
                                >
                                  {member.name.split(" ").map((n: string) => n[0]).join("").toUpperCase()}
                                </div>
                              )}
                            </div>
                            <span className="text-[12px] font-semibold truncate max-w-full leading-tight" data-testid={`text-staff-name-${member.id}`}>
                              {(() => {
                                const parts = (member.name as string).trim().split(/\s+/);
                                return parts.length > 1
                                  ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
                                  : parts[0];
                              })()}
                            </span>
                            {(() => {
                              // Same ISO-day fix — must match the store's local day not UTC day.
                            const todayDow = parseInt(formatStoreDate(currentDate, "i"), 10) % 7;
                              const rule = allStaffAvailability?.find(
                                (r) => r.staffId === member.id && r.dayOfWeek === todayDow
                              );
                              if (rule) {
                                return (
                                  <span className="text-[10px] text-slate-400 leading-tight">
                                    {formatHourLabel(rule.startTime)} – {formatHourLabel(rule.endTime)}
                                  </span>
                                );
                              }
                              if (allStaffAvailability) {
                                return (
                                  <Link
                                    to={`/team/${member.id}?tab=availability`}
                                    className="text-[10px] text-blue-500 hover:underline leading-tight"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Set hours
                                  </Link>
                                );
                              }
                              return null;
                            })()}

                            {/* Staff header menu popover */}
                            {openStaffMenu === member.id && (
                              <div
                                className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-[60] bg-card border border-border rounded-lg shadow-xl overflow-hidden"
                                style={{ minWidth: "180px" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-foreground truncate">
                                    {member.name}
                                  </span>
                                  <button
                                    className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                                    onClick={() => setOpenStaffMenu(null)}
                                    aria-label="Close"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                      <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                    </svg>
                                  </button>
                                </div>
                                <div className="p-1.5 flex flex-col gap-1">
                                  {/* Availability toggle — backed by timeclock clock-in/clock-out */}
                                  <button
                                    className={cn(
                                      "w-full px-3 py-2 rounded-md text-xs font-semibold transition-colors flex items-center justify-between gap-2",
                                      staffAvailOverride[member.id] === true
                                        ? "bg-teal-500 text-white hover:bg-teal-600"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                      staffAvailLoading[member.id] && "opacity-60 cursor-not-allowed"
                                    )}
                                    disabled={!!staffAvailLoading[member.id]}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const storeId = selectedStore?.id;
                                      if (!storeId || staffAvailLoading[member.id]) return;
                                      const currentlyAvailable = staffAvailOverride[member.id] === true;
                                      setStaffAvailLoading((prev) => ({ ...prev, [member.id]: true }));
                                      try {
                                        if (currentlyAvailable) {
                                          const res = await fetch("/api/timeclock/clock-out", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            credentials: "include",
                                            body: JSON.stringify({ storeId, staffId: member.id }),
                                          });
                                          if (res.ok) {
                                            setStaffAvailOverride((prev) => ({ ...prev, [member.id]: false }));
                                          } else {
                                            const err = await res.json().catch(() => ({}));
                                            toast({ title: t.couldNotMarkUnavail, description: (err as any).error || t.pleaseTryAgain, variant: "destructive" });
                                          }
                                        } else {
                                          const res = await fetch("/api/timeclock/clock-in", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            credentials: "include",
                                            body: JSON.stringify({ storeId, staffId: member.id }),
                                          });
                                          if (res.ok || res.status === 409) {
                                            // 409 = already clocked in — treat as available
                                            setStaffAvailOverride((prev) => ({ ...prev, [member.id]: true }));
                                          } else {
                                            const err = await res.json().catch(() => ({}));
                                            toast({ title: t.couldNotMarkAvail, description: (err as any).error || t.pleaseTryAgain, variant: "destructive" });
                                          }
                                        }
                                      } catch {
                                        toast({ title: t.networkError, description: t.pleaseTryAgain, variant: "destructive" });
                                      } finally {
                                        setStaffAvailLoading((prev) => ({ ...prev, [member.id]: false }));
                                      }
                                    }}
                                    data-testid={`staff-avail-toggle-${member.id}`}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      {staffAvailLoading[member.id] && (
                                        <svg className="animate-spin w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                                        </svg>
                                      )}
                                      {staffAvailOverride[member.id] === true ? "Available" : "Unavailable"}
                                    </span>
                                    <span
                                      className={cn(
                                        "inline-flex w-8 h-4 rounded-full transition-colors flex-shrink-0 relative",
                                        staffAvailOverride[member.id] === true ? "bg-white/30" : "bg-slate-300"
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all",
                                          staffAvailOverride[member.id] === true ? "left-[18px]" : "left-0.5"
                                        )}
                                      />
                                    </span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>


                        <div
                          className="relative bg-white border-l last:border-r"
                          style={{
                            height: `${TOTAL_HOURS * HOUR_HEIGHT}px`,
                            borderLeftColor: "var(--cal-grid-line)",
                            borderRightColor: "var(--cal-grid-line)",
                          }}
                        >
                          {timeSlots.map((slot) => {
                            const topPx = ((slot.hour - START_HOUR) + slot.minute / 60) * HOUR_HEIGHT;
                            const slotHeight = (settings.timeSlotInterval / 60) * HOUR_HEIGHT;
                            const isSlotSelected =
                              selectedSlot?.staffId === member.id &&
                              selectedSlot?.hour === slot.hour &&
                              selectedSlot?.minute === slot.minute;
                            const slotH = slot.hour > 12 ? slot.hour - 12 : slot.hour === 0 ? 12 : slot.hour;
                            const slotM = String(slot.minute).padStart(2, "0");
                            const slotAmpm = slot.hour >= 12 ? "PM" : "AM";
                            const slotLabel = `${slotH}:${slotM} ${slotAmpm}`;
                            // Slots outside business hours or staff's own availability are non-working
                            const slotTotalMin = slot.hour * 60 + slot.minute;
                            const _todayDow = parseInt(formatStoreDate(currentDate, "i"), 10) % 7;
                            const _staffRule = allStaffAvailability?.find(
                              (r) => r.staffId === member.id && r.dayOfWeek === _todayDow
                            );
                            const _staffStartMin = _staffRule
                              ? Number(_staffRule.startTime.split(":")[0]) * 60 + Number(_staffRule.startTime.split(":")[1] || 0)
                              : null;
                            const _staffEndMin = _staffRule
                              ? Number(_staffRule.endTime.split(":")[0]) * 60 + Number(_staffRule.endTime.split(":")[1] || 0)
                              : null;
                            const isNonWorking = !!(businessHoursForDay?.isClosed)
                              || slotTotalMin < BUSINESS_OPEN_TOTAL_MIN
                              || slotTotalMin >= BUSINESS_CLOSE_TOTAL_MIN
                              || (_staffStartMin !== null && _staffEndMin !== null
                                  && (slotTotalMin < _staffStartMin || slotTotalMin >= _staffEndMin));
                            // Past-slot guard — same wall-clock approach as handleSlotClick
                            const _slotDateStr = `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, "0")}-${String(currentDate.getUTCDate()).padStart(2, "0")}T${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}:00`;
                            const isPastSlot = isStoreLocalSlotInPast(_slotDateStr, timezone);
                            const isUnbookable = isNonWorking || isPastSlot;
                            return (
                              <div
                                key={`${slot.hour}-${slot.minute}`}
                                className={cn(
                                  "absolute left-0 right-0 border-b transition-colors",
                                  slot.minute === 0 ? "border-slate-200" : "border-slate-100 border-dashed",
                                  isUnbookable
                                    ? "cursor-default"
                                    : "cursor-pointer",
                                  !isUnbookable && (isSlotSelected
                                    ? "bg-teal-50"
                                    : "hover:bg-teal-50/40"),
                                  dropTarget?.staffId === member.id &&
                                    dropTarget?.hour === slot.hour &&
                                    dropTarget?.minute === slot.minute &&
                                    draggedAppointment
                                    ? "bg-teal-100/60 ring-2 ring-teal-400 ring-inset"
                                    : ""
                                )}
                                style={{
                                  top: `${topPx}px`,
                                  height: `${slotHeight}px`,
                                  // Dotted tint only for non-working time (outside business hours or
                                  // staff availability). Past slots stay un-marked but remain
                                  // unbookable via the onClick guard + handleSlotClick's own check.
                                  backgroundColor: isNonWorking ? 'var(--cal-nonworking)' : undefined,
                                  backgroundImage: isNonWorking ? 'radial-gradient(rgba(148,163,184,0.32) 1px, transparent 1.3px)' : undefined,
                                  backgroundSize: isNonWorking ? '9px 9px' : undefined,
                                }}
                                onClick={() => !isUnbookable && handleSlotClick(member.id, slot.hour, slot.minute)}
                                onDragOver={(e) => handleSlotDragOver(e, member.id, slot.hour, slot.minute)}
                                onDragEnter={(e) => handleSlotDragOver(e, member.id, slot.hour, slot.minute)}
                                onDragLeave={handleSlotDragLeave}
                                onDrop={(e) => handleSlotDrop(e, member.id, slot.hour, slot.minute)}
                                data-testid={`calendar-slot-${member.id}-${slot.hour}-${slot.minute}`}
                              >
                                {isSlotSelected && (
                                  <div
                                    className="absolute z-50 bg-card border border-border rounded-lg shadow-xl overflow-hidden"
                                    style={{ top: 0, left: "calc(100% + 6px)", minWidth: "180px" }}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <div className="px-3 py-2 border-b bg-muted/50">
                                      <span className="text-xs font-semibold text-foreground">{slotLabel}</span>
                                    </div>
                                    <div className="p-1.5 flex flex-col gap-1">
                                      <button
                                        className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleBookSlot(member.id, slot.hour, slot.minute);
                                        }}
                                        data-testid={`book-slot-btn-${member.id}-${slot.hour}-${slot.minute}`}
                                      >
                                        {t.createNewAppt}
                                      </button>
                                      <button
                                        className="w-full px-3 py-2 rounded-md border border-border text-xs font-semibold hover:bg-muted transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedSlot(null);
                                        }}
                                      >
                                        {t.cancel}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {staffApts.map((apt: any) => {
                            const style = getAppointmentStyle(apt);
                            const startTime = formatInTz(apt.date, timezone, "h:mm");
                            const endTime = formatInTz(getEffectiveEndDate(apt), timezone, "h:mm a");
                            const isSelected = selectedAppointment?.id === apt.id;

                            // Band color by status
                            const bandColor =
                              apt.status === "completed" ? "#9ca3af"
                              : apt.status === "started" ? "#22c55e"
                              : apt.status === "late" ? "#fb923c"
                              : apt.status === "no_show" ? "#fb7185"
                              : "#3b82f6"; // pending / confirmed / default = booked (blue)

                            const isLocked = apt.status === "completed";

                            // Band side: left = staff/store booked, right = online booked
                            // apt.source === "online" would indicate online booking (stub: always left for now)
                            const isOnlineBooking = apt.source === "online";

                            const aptAddons = apt.appointmentAddons?.map((aa: any) => aa.addon).filter(Boolean) || [];
                            const addonTotal = aptAddons.reduce((sum: number, a: any) => sum + Number(a.price), 0);
                            const serviceTotal = Number(apt.service?.price || 0) + addonTotal;

                            const aptMinutesPastStart = Math.floor(
                              (Date.now() - new Date(apt.date).getTime()) / 60000,
                            );
                            const isAptOverdue =
                              aptMinutesPastStart >= lateGracePeriodMinutes &&
                              (apt.status === "pending" || apt.status === "confirmed");

                            const isCancelled = apt.status === "cancelled";
                            const isNoShow = apt.status === "no_show";

                            // Category colour for neutral-state appointments
                            const catColor = apt.service?.categoryId
                              ? categoryColorMap.get(apt.service.categoryId)
                              : undefined;

                            // Dark calendar: a solid accent colour per status/category,
                            // rendered as a translucent fill + solid left/border accent.
                            const cardAccent =
                              isCancelled ? "#f472b6"
                              : isNoShow ? "#fb7185"
                              : apt.status === "completed" ? "#94a3b8"
                              : apt.status === "started" ? "#34d399"
                              : apt.status === "late" ? "#fbbf24"
                              : (catColor?.border ?? "#a78bfa");

                            const effectiveBg = (isAptOverdue && !isCancelled && !isNoShow)
                              ? "rgba(239,68,68,0.14)"
                              : `${cardAccent}22`;
                            const effectiveBorder = (isAptOverdue && !isCancelled && !isNoShow) ? "#ef4444" : cardAccent;

                            return (
                              <div
                                key={apt.id}
                                draggable={!isLocked && !isCancelled}
                                className={cn(
                                  "absolute left-1 right-1 rounded-lg overflow-hidden cursor-pointer z-[5] transition-shadow hover:shadow-md relative",
                                  isLocked && !isCancelled && "opacity-75",
                                  draggedAppointment?.id === apt.id && "opacity-50 ring-2 ring-dashed ring-blue-400",
                                )}
                                style={{
                                  ...style,
                                  backgroundColor: effectiveBg,
                                  border: `1px solid ${effectiveBorder}`,
                                  ...(isSelected ? { boxShadow: `0 0 0 2px ${isAptOverdue ? "#ef4444" : bandColor}` } : {}),
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isCancelled) {
                                    setSelectedAppointment(apt);
                                    setShowCheckout(false);
                                    setShowCancelFlow(false);
                                  }
                                }}
                                onDragStart={(e) => handleAppointmentDragStart(e, apt)}
                                onDragEnd={handleAppointmentDragEnd}
                                data-testid={`appointment-block-${apt.id}`}
                              >
                                {/* Watermark for cancelled / no-show / completed / started */}
                                {(isCancelled || isNoShow || apt.status === "completed" || apt.status === "started") && (
                                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]">
                                    <span
                                      className="font-black uppercase tracking-widest select-none"
                                      style={{
                                        opacity: isCancelled || isNoShow ? 0.15 : 0.1,
                                        transform: "rotate(-25deg)",
                                        color: isCancelled ? "#be185d" : isNoShow ? "#dc2626" : apt.status === "completed" ? "#374151" : "#16a34a",
                                        fontSize: "11px",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {isCancelled ? "CANCELED" : isNoShow ? "NO SHOW" : apt.status === "completed" ? "COMPLETED" : "IN PROGRESS"}
                                    </span>
                                  </div>
                                )}
                                {/* Delete overlay for cancelled cards */}
                                {isCancelled && (
                                  <button
                                    className="absolute top-0.5 right-0.5 z-[3] w-4 h-4 rounded-full bg-pink-200 text-pink-700 flex items-center justify-center hover:bg-pink-300 transition-colors"
                                    title="Remove from calendar"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteCancelledCard(apt.id);
                                    }}
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                )}
                                <div className="px-2 py-1.5 overflow-hidden flex flex-col min-h-0 gap-0.5 relative z-[2]">
                                  {/* Row 1: time range + status badge (matches mobile WeeklyAgendaView) */}
                                  <div className="flex items-start justify-between gap-1">
                                    <span className="text-[11px] font-semibold leading-tight" style={{ color: cardAccent }}>{startTime} – {endTime}</span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {apt.clientRequestedStaff && (
                                        <span className="text-[8px] font-bold text-amber-500 leading-none uppercase tracking-tight">REQ</span>
                                      )}
                                      {(() => {
                                        const statusMap: Record<string, { bg: string; text: string; label: string }> = {
                                          pending:   { bg: "#eff6ff", text: "#3b82f6", label: "Pending" },
                                          confirmed: { bg: "#f0fdf4", text: "#22c55e", label: "Confirmed" },
                                          started:   { bg: "#fefce8", text: "#ca8a04", label: "In Progress" },
                                          completed: { bg: "#f3f4f6", text: "#6b7280", label: "Done" },
                                          cancelled: { bg: "#fff1f2", text: "#f43f5e", label: "Cancelled" },
                                          no_show:   { bg: "#fff1f2", text: "#f43f5e", label: "No Show" },
                                          late:      { bg: "#fff7ed", text: "#ea580c", label: "Late" },
                                        };
                                        // Paid appointments always show a green "Paid" badge
                                        if (apt.paymentStatus === "paid") {
                                          return (
                                            <span
                                              className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold leading-none flex-shrink-0"
                                              style={{ backgroundColor: "#dcfce7", color: "#16a34a" }}
                                            >
                                              Paid
                                            </span>
                                          );
                                        }
                                        // Overdue pending/confirmed appointments show as "Late"
                                        const key = (isAptOverdue && (apt.status === "pending" || apt.status === "confirmed"))
                                          ? "late"
                                          : (apt.status || "pending");
                                        const info = statusMap[key] ?? statusMap.pending;
                                        return (
                                          <span
                                            className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold leading-none flex-shrink-0"
                                            style={{ backgroundColor: info.bg, color: info.text }}
                                          >
                                            {info.label}
                                          </span>
                                        );
                                      })()}
                                      <AppointmentSyncBadge
                                        syncState={syncMap.get(apt._tempId) ?? (syncMap.get(`real:${apt.id}`) as any)}
                                        conflictDetail={conflictMap.get(apt._tempId) ?? conflictMap.get(`real:${apt.id}`)}
                                        entityTempId={apt._tempId}
                                        entityRealId={typeof apt.id === "number" ? apt.id : undefined}
                                      />
                                    </div>
                                  </div>

                                  {/* Client name — prominent */}
                                  <div className="text-[11px] font-medium text-gray-500 truncate leading-tight">
                                    {(apt as any).customer?.fullName || apt.customer?.name || apt.customerName || apt.clientName || t.walkIn}
                                  </div>

                                  {/* Service name */}
                                  <div className="text-[12.5px] font-semibold text-gray-900 truncate leading-tight">
                                    {apt.service?.name || t.service}
                                  </div>

                                  {/* Resource badge */}
                                  {(apt as any).resourceId && (() => {
                                    const res = calendarResources.find((r: any) => r.id === (apt as any).resourceId);
                                    if (!res) return null;
                                    const em = ({ station: "💅", chair: "🪑", room: "🚪", other: "🛋️" } as Record<string, string>)[res.type] ?? "🛋️";
                                    return (
                                      <div className="text-[9px] font-semibold text-indigo-500 leading-tight truncate">
                                        {em} {res.name}
                                      </div>
                                    );
                                  })()}

                                  {/* Addons */}
                                  {aptAddons.map((addon: any) => (
                                    <div key={addon.id} className="text-[10px] text-gray-500 truncate leading-tight" data-testid={`calendar-addon-${addon.id}`}>
                                      + {addon.name}
                                    </div>
                                  ))}

                                  {/* Price + duration */}
                                  {showPrices && (
                                    <div className="mt-auto pt-0.5 flex items-center justify-between gap-1">
                                      <span className="text-[10px] font-semibold text-gray-700">$ {serviceTotal.toFixed(2)}</span>
                                      {isLocked && (
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 bg-white/70 px-1 py-0.5 rounded">
                                          {t.paid}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {(isNoShow ? settings.timeSlotInterval : apt.duration) > 0 && (
                                    <div className="text-[9px] font-medium text-gray-400 leading-tight">
                                      {isNoShow ? settings.timeSlotInterval : apt.duration} min
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex-1 sticky top-0 h-[68px] bg-white border-b z-[5] self-start" />
                  </>
                )}
              </div>
            </div>
            )}
          </motion.div>
          </AnimatePresence>
          )}
          {/* ── Resources view ── */}
          {calView === "resources" && !isMobile && (
          <AnimatePresence initial={false} custom={slideDir}>
          <motion.div
            key={currentDate.toISOString().slice(0, 10) + "-res"}
            ref={scrollContainerRef}
            custom={slideDir}
            initial={((dir: string) => ({ x: dir === "next" ? "100%" : "-100%" })) as any}
            animate={{ x: 0 }}
            exit={((dir: string) => ({ x: dir === "next" ? "-100%" : "100%" })) as any}
            transition={{ type: "tween", ease: [0.25, 0.46, 0.45, 0.94], duration: 0.22 }}
            className="absolute inset-0 overflow-auto"
          >
            <div className={`flex relative ${activeResources.length <= 10 ? "w-full" : "min-w-[400px]"}`}>
              {isToday && timeLinePosition !== null && (
                <div
                  ref={nowLineRef}
                  className="absolute left-0 right-0 z-[35] pointer-events-none flex items-center -translate-y-1/2"
                  style={{ top: `${timeLinePosition + 88}px` }}
                >
                  <div className="w-[90px] flex-shrink-0 flex px-1">
                    <span className="flex-1 inline-flex items-center justify-center rounded-md py-1 text-xs font-bold text-white shadow-[0_2px_8px_rgba(232,24,92,0.4)]" style={{ backgroundColor: "#2dd4bf" }}>
                      {timeLineLabel}
                    </span>
                  </div>
                  <div className="flex-1 h-[2px]" style={{ backgroundColor: "#2dd4bf" }} />
                </div>
              )}
              {/* Time labels */}
              <div className="w-[90px] flex-shrink-0 bg-white z-30 sticky left-0">
                <div className="h-[68px] border-b sticky top-0 bg-white z-40" />
                <div className="relative" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
                  {Array.from({ length: TOTAL_HOURS * 4 + 1 }, (_, i) => {
                    const totalMins = i * 15;
                    const h = START_HOUR + Math.floor(totalMins / 60);
                    const m = totalMins % 60;
                    if (h > END_HOUR || (h === END_HOUR && m > 0)) return null;
                    const isHour = m === 0;
                    const hMod = h % 24;
                    const displayH = hMod === 0 ? 12 : hMod > 12 ? hMod - 12 : hMod;
                    const ampmLabel = hMod >= 12 ? "PM" : "AM";
                    const topPx = (totalMins / 60) * HOUR_HEIGHT;
                    if (isHour) {
                      return (
                        <div key={`rlbl-${h}`} className="absolute left-0 right-0 flex items-center justify-end pr-2.5 -translate-y-1/2" style={{ top: `${topPx}px` }}>
                          <span className="text-[13px] font-bold text-indigo-600 leading-none tabular-nums">{displayH} {ampmLabel}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={`rlbl-${h}-${m}`} className="absolute left-0 right-0 flex items-center justify-end pr-2.5 -translate-y-1/2" style={{ top: `${topPx}px` }}>
                        <span className="text-[12px] font-medium text-slate-500 leading-none tabular-nums">{m}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Resource columns */}
              <div className="flex flex-1 relative" style={{ backgroundColor: "hsl(var(--background))" }}>
                {activeResources.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm py-20 gap-3">
                    <Layers className="w-8 h-8 text-slate-300" />
                    <p className="text-slate-500">No active stations or chairs configured.</p>
                    <a href="/settings/resources" className="text-teal-600 underline text-sm font-medium">Add resources in Settings →</a>
                  </div>
                ) : (
                  <>
                  {activeResources.map((resource: any) => {
                    const resEmoji = ({ station: "💅", chair: "🪑", room: "🚪", other: "🛋️" } as Record<string, string>)[resource.type] ?? "🛋️";
                    const resTypeLabel = ({ station: "Nail Station", chair: "Pedicure Chair", room: "Treatment Room", other: "Resource" } as Record<string, string>)[resource.type] ?? resource.type;
                    const resApts = (appointments ?? []).filter((a: any) =>
                      a.resourceId === resource.id && isOnStoreDate(a.date, currentDate, timezone) && !a.calendarHidden
                    );
                    return (
                      <div key={resource.id} className={activeResources.length <= 10 ? "flex-1 min-w-0" : "flex-none"} style={activeResources.length <= 10 ? { minWidth: "120px" } : { width: `${STAFF_CALENDAR_COLUMN_WIDTH}px`, minWidth: `${STAFF_CALENDAR_COLUMN_WIDTH}px`, maxWidth: `${STAFF_CALENDAR_COLUMN_WIDTH}px` }}>
                        <div className="h-[68px] border-b flex flex-col items-center justify-center gap-0.5 px-2 sticky top-0 bg-white z-20">
                          <div className="text-xl leading-none">{resEmoji}</div>
                          <span className="text-[12px] font-semibold truncate max-w-full leading-tight">{resource.name}</span>
                          <span className="text-[10px] text-slate-400 leading-tight">{resTypeLabel}</span>
                        </div>
                        <div className="relative bg-white border-l last:border-r" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px`, borderLeftColor: "var(--cal-grid-line)", borderRightColor: "var(--cal-grid-line)" }}>
                          {resourceTimeSlots.map((slot) => {
                            const topPx = ((slot.hour - START_HOUR) + slot.minute / 60) * HOUR_HEIGHT;
                            const slotHeight = (15 / 60) * HOUR_HEIGHT;
                            const dateStr = `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, "0")}-${String(currentDate.getUTCDate()).padStart(2, "0")}`;
                            const timeStr = `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
                            const isPast = isStoreLocalSlotInPast(`${dateStr}T${timeStr}:00`, timezone);
                            const resSlotTotalMin = slot.hour * 60 + slot.minute;
                            const isResNonWorking = !!(businessHoursForDay?.isClosed)
                              || resSlotTotalMin < BUSINESS_OPEN_TOTAL_MIN
                              || resSlotTotalMin >= BUSINESS_CLOSE_TOTAL_MIN;
                            return (
                              <div
                                key={`${slot.hour}-${slot.minute}`}
                                className={cn(
                                  "absolute left-0 right-0 border-b border-slate-100 transition-colors",
                                  isResNonWorking ? "" : isPast ? "cursor-default" : "cursor-pointer hover:bg-teal-50/40"
                                )}
                                style={{
                                  top: `${topPx}px`,
                                  height: `${slotHeight}px`,
                                  backgroundColor: isResNonWorking ? 'var(--cal-nonworking)' : undefined,
                                  backgroundImage: isResNonWorking ? 'radial-gradient(rgba(148,163,184,0.32) 1px, transparent 1.3px)' : undefined,
                                  backgroundSize: isResNonWorking ? '9px 9px' : undefined,
                                }}
                                onClick={() => {
                                  if (isPast) return;
                                  navigate(`/booking/new?resourceId=${resource.id}&date=${dateStr}&time=${timeStr}`);
                                }}
                              />
                            );
                          })}
                          {resApts.map((apt: any) => {
                            const style = getAppointmentStyle(apt);
                            const startTime = formatInTz(apt.date, timezone, "h:mm");
                            const endTime = formatInTz(getEffectiveEndDate(apt), timezone, "h:mm a");
                            const isSelected = selectedAppointment?.id === apt.id;
                            const isCancelled = apt.status === "cancelled";
                            const isNoShow = apt.status === "no_show";
                            const assignedStaff = staffList?.find((s: any) => s.id === apt.staffId);
                            const staffColor = assignedStaff ? getStaffColor(assignedStaff) : "#94a3b8";
                            // Status overrides always win (cancelled/no-show/done/in-progress
                            // keep their usual pastel tints so those states stay recognizable);
                            // any other appointment is colored by the assigned staff member's
                            // own Calendar Color instead of the service category.
                            const isNeutral = !isCancelled && !isNoShow && apt.status !== "completed" && apt.status !== "started";
                            // Dark calendar: translucent fill + solid accent (see staff view above).
                            const resAccent = isCancelled ? "#f472b6" : isNoShow ? "#fb7185" : apt.status === "completed" ? "#94a3b8" : apt.status === "started" ? "#34d399" : staffColor;
                            const pastelBg = `${resAccent}22`;
                            const pastelBorder = resAccent;
                            const neutralContrast = isNeutral ? { text: "#f5f5f7", textMuted: "#9a9aa0" } : null;
                            return (
                              <div
                                key={apt.id}
                                className={cn(
                                  "absolute left-1 right-1 rounded-lg overflow-hidden cursor-pointer z-[5] transition-shadow hover:shadow-md",
                                  isCancelled && "opacity-60"
                                )}
                                style={{ ...style, backgroundColor: pastelBg, border: `1px solid ${pastelBorder}`, ...(isSelected ? { boxShadow: "0 0 0 2px #3b82f6" } : {}) }}
                                onClick={() => { if (!isCancelled) { setSelectedAppointment(apt); setShowCheckout(false); setShowCancelFlow(false); } }}
                                data-testid={`resource-appt-block-${apt.id}`}
                              >
                                <div className="px-2 py-1.5 overflow-hidden flex flex-col min-h-0 gap-0.5">
                                  <span
                                    className={cn("text-[10px] font-medium leading-tight", !isNeutral && "text-gray-600")}
                                    style={neutralContrast ? { color: neutralContrast.textMuted } : undefined}
                                  >{startTime} – {endTime}</span>
                                  <div
                                    className={cn("text-[11px] font-bold truncate leading-tight", !isNeutral && "text-gray-900")}
                                    style={neutralContrast ? { color: neutralContrast.text } : undefined}
                                  >
                                    {(apt as any).customer?.fullName || apt.customer?.name || apt.customerName || apt.clientName || t.walkIn}
                                  </div>
                                  <div
                                    className={cn("text-[10px] font-medium truncate leading-tight", !isNeutral && "text-gray-700")}
                                    style={neutralContrast ? { color: neutralContrast.text } : undefined}
                                  >{apt.service?.name || t.service}</div>
                                  {assignedStaff && (
                                    <div
                                      className={cn("text-[9px] truncate leading-tight", !isNeutral && "text-slate-400")}
                                      style={neutralContrast ? { color: neutralContrast.textMuted } : undefined}
                                    >👤 {assignedStaff.name}</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex-1 sticky top-0 h-[68px] bg-white border-b z-[5] self-start" />
                  </>
                )}
              </div>
            </div>
          </motion.div>
          </AnimatePresence>
          )}

          {/* ── Touch fader scrollbar (desktop grid only) ── */}
          {(calView === "grid" || calView === "resources") && !isMobile && (
            <CalendarFaderScrollbar scrollContainerRef={scrollContainerRef as React.RefObject<HTMLDivElement>} />
          )}
        </div>

        {/* ── Right: Current Queue Lineup panel — nail salons only, and only when Turn System is enabled ── */}
        {!isMobile && isNailSalon && turnSystemEnabled && (
          <div className="w-[110px] flex-shrink-0 border-l border-slate-200 bg-white hidden lg:flex flex-col overflow-hidden">
            <CalendarQueuePanel
              staffList={staffList ?? []}
              appointments={appointments ?? []}
              timezone={timezone}
              currentDate={currentDate}
              turnEligibility={turnEligibility}
              onOpenTurnPage={() => setShowTurnPage(true)}
              getStaffColor={getStaffColor}
            />
          </div>
        )}

        <Sheet open={quickCheckoutOpen} onOpenChange={setQuickCheckoutOpen}>
          <SheetContent
            side="left"
            className="dark cx-cal w-[340px] sm:w-[360px] p-0 flex flex-col gap-0 text-foreground"
          >
            {listView === "menu" ? (
              <>
                <SheetHeader className="px-4 py-3 border-b">
                  <SheetTitle className="text-base font-bold flex items-center gap-2">
                    <LayoutList className="w-4 h-4" />
                    {t.lists}
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground text-left">
                    {formatStoreDate(currentDate, "EEE MMM d")}
                  </p>
                </SheetHeader>

                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-6">
                  <button
                    type="button"
                    onClick={() => setListView("arrived")}
                    className="w-full max-w-[260px] h-24 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg hover:shadow-xl hover:from-violet-600 hover:to-purple-700 active:scale-[0.97] transition-all duration-150 flex flex-col items-center justify-center gap-1.5"
                  >
                    <LogIn className="w-9 h-9" />
                    <span className="text-lg font-bold">{t.arrived}</span>
                    <span className="text-xs text-purple-100">{t.arrivedSub}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setListView("checkin")}
                    className="w-full max-w-[260px] h-24 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg hover:shadow-xl hover:from-blue-600 hover:to-blue-700 active:scale-[0.97] transition-all duration-150 flex flex-col items-center justify-center gap-1.5"
                  >
                    <UserCircle className="w-9 h-9" />
                    <span className="text-lg font-bold">{t.checkIn}</span>
                    <span className="text-xs text-blue-100">{t.checkInSub}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setListView("checkout")}
                    className="w-full max-w-[260px] h-24 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg hover:shadow-xl hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.97] transition-all duration-150 flex flex-col items-center justify-center gap-1.5"
                  >
                    <Receipt className="w-9 h-9" />
                    <span className="text-lg font-bold">{t.checkOut}</span>
                    <span className="text-xs text-emerald-100">{t.checkOutSub}</span>
                  </button>
                </div>
              </>
            ) : listView === "arrived" ? (
              <>
                <SheetHeader className="px-4 py-3 border-b">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setListView("menu")}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <SheetTitle className="text-base font-bold flex items-center gap-2">
                      <LogIn className="w-4 h-4" />
                      {t.arrivedList}
                    </SheetTitle>
                  </div>
                  <p className="text-xs text-muted-foreground text-left">
                    {formatStoreDate(currentDate, "EEE MMM d")} · {t.tapToOpen}
                  </p>
                </SheetHeader>

                <div className="flex justify-center border-b">
                  <button
                    type="button"
                    onClick={() => arrivedListRef.current?.scrollBy({ top: -240, behavior: "smooth" })}
                    className="flex-1 h-12 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:bg-muted active:bg-muted/70 transition-colors"
                  >
                    <ChevronUp className="w-5 h-5" />
                    {t.up}
                  </button>
                </div>

                <div ref={arrivedListRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                  {(() => {
                    const arrivedAppts = (appointments || [])
                      .filter((apt: any) => {
                        if (apt.status !== "checked_in") return false;
                        return isOnStoreDate(apt.date, currentDate, timezone);
                      })
                      .sort((a: any, b: any) => {
                        const aTime = a.checkedInAt ? new Date(a.checkedInAt).getTime() : new Date(a.date).getTime();
                        const bTime = b.checkedInAt ? new Date(b.checkedInAt).getTime() : new Date(b.date).getTime();
                        return aTime - bTime;
                      });

                    if (arrivedAppts.length === 0) {
                      return (
                        <div className="text-center py-12 text-sm text-muted-foreground">
                          {t.noArrived}
                        </div>
                      );
                    }

                    return arrivedAppts.map((apt: any) => {
                      const staffMember = (staffList || []).find((s: any) => s.id === apt.staffId);
                      const staffColor = staffMember ? getStaffColor(staffMember) : "#94a3b8";
                      const customerName = ((apt as any).customer?.fullName || apt.customer?.name || apt.customerName || apt.clientName || "").trim() || t.walkIn;
                      const customerFirst = customerName.split(/\s+/)[0];
                      const checkedInTime = apt.checkedInAt
                        ? format(new Date(apt.checkedInAt), "h:mm a")
                        : formatInTz(apt.date, timezone, "h:mm a");
                      const serviceName = apt.services?.[0]?.name || "";

                      return (
                        <button
                          key={apt.id}
                          type="button"
                          onClick={() => {
                            setSelectedAppointment(apt);
                            setShowCheckout(false);
                            setShowCancelFlow(false);
                            setQuickCheckoutOpen(false);
                          }}
                          className="w-full text-left rounded-lg border bg-card hover:bg-muted active:bg-muted/70 transition-colors p-3 flex items-center gap-3"
                          style={{ borderLeft: `4px solid ${staffColor}` }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{customerFirst}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {staffMember ? staffMember.name : t.walkIn}
                              {serviceName ? ` · ${serviceName}` : ""}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded">
                              {checkedInTime}
                            </span>
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>

                <div className="flex justify-center border-t">
                  <button
                    type="button"
                    onClick={() => arrivedListRef.current?.scrollBy({ top: 240, behavior: "smooth" })}
                    className="flex-1 h-12 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:bg-muted active:bg-muted/70 transition-colors"
                  >
                    <ChevronDown className="w-5 h-5" />
                    {t.down}
                  </button>
                </div>
              </>
            ) : listView === "checkin" ? (
              <>
                <SheetHeader className="px-4 py-3 border-b">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setListView("menu")}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <SheetTitle className="text-base font-bold flex items-center gap-2">
                      <UserCircle className="w-4 h-4" />
                      {t.quickCheckIn}
                    </SheetTitle>
                  </div>
                  <p className="text-xs text-muted-foreground text-left">
                    {formatStoreDate(currentDate, "EEE MMM d")} · {t.tapToOpen}
                  </p>
                </SheetHeader>

                <div className="flex justify-center border-b">
                  <button
                    type="button"
                    onClick={() => checkinListRef.current?.scrollBy({ top: -240, behavior: "smooth" })}
                    data-testid="button-quick-scroll-up"
                    className="flex-1 h-12 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:bg-muted active:bg-muted/70 transition-colors"
                  >
                    <ChevronUp className="w-5 h-5" />
                    {t.up}
                  </button>
                </div>

                <div ref={checkinListRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
                  {(() => {
                    const todayAppts = (appointments || []).filter((apt: any) => {
                      if (apt.status !== "pending" && apt.status !== "confirmed") return false;
                      return isOnStoreDate(apt.date, currentDate, timezone);
                    });

                    if (todayAppts.length === 0) {
                      return (
                        <div className="text-center py-12 text-sm text-muted-foreground">
                          {t.noPendingAppts}
                        </div>
                      );
                    }

                    const byStaff = new Map<number, any[]>();
                    for (const apt of todayAppts) {
                      if (!byStaff.has(apt.staffId)) byStaff.set(apt.staffId, []);
                      byStaff.get(apt.staffId)!.push(apt);
                    }

                    const orderedStaff = (staffList || []).filter((s: any) =>
                      byStaff.has(s.id),
                    );

                    return orderedStaff.map((staffMember: any) => {
                      const list = (byStaff.get(staffMember.id) || []).sort(
                        (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime(),
                      );
                      return (
                        <div key={staffMember.id}>
                          <div className="flex items-center gap-2 px-1 mb-2">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={staffMember.profilePicture || undefined} />
                              <AvatarFallback
                                className="text-[11px] font-bold text-white"
                                style={{ backgroundColor: getStaffColor(staffMember) }}
                              >
                                {staffMember.name?.[0]?.toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-bold text-sm">{staffMember.name}</span>
                            <span className="ml-auto text-[11px] text-muted-foreground">
                              {t.ticket(list.length)}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            {list.map((apt: any) => {
                              const timeStr = formatInTz(apt.date, timezone, "h:mm a");
                              const customerFirst =
                                ((apt as any).customer?.fullName || apt.customer?.name || apt.customerName || apt.clientName || "").trim().split(/\s+/)[0] || "";
                              return (
                                <button
                                  key={apt.id}
                                  type="button"
                                  data-testid={`quick-ticket-${apt.id}`}
                                  onClick={() => {
                                    setSelectedAppointment(apt);
                                    setShowCheckout(false);
                                    setShowCancelFlow(false);
                                    setQuickCheckoutOpen(false);
                                  }}
                                  className="w-full text-left rounded-lg border bg-card hover:bg-muted active:bg-muted/70 transition-colors p-3 flex items-center gap-3"
                                  style={{
                                    borderLeft: `4px solid ${getStaffColor(staffMember)}`,
                                  }}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm truncate">
                                      {customerFirst || t.walkIn}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground truncate">
                                      {timeStr}
                                      {apt.services?.[0]?.name
                                        ? ` · ${apt.services[0].name}`
                                        : ""}
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {t.pending}
                                  </Badge>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                <div className="flex justify-center border-t">
                  <button
                    type="button"
                    onClick={() => checkinListRef.current?.scrollBy({ top: 240, behavior: "smooth" })}
                    data-testid="button-quick-scroll-down"
                    className="flex-1 h-12 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:bg-muted active:bg-muted/70 transition-colors"
                  >
                    <ChevronDown className="w-5 h-5" />
                    {t.down}
                  </button>
                </div>
              </>
            ) : (
              <>
                <SheetHeader className="px-4 py-3 border-b">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setListView("menu")}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <SheetTitle className="text-base font-bold flex items-center gap-2">
                      <Receipt className="w-4 h-4" />
                      {t.quickCheckOut}
                    </SheetTitle>
                  </div>
                  <p className="text-xs text-muted-foreground text-left">
                    {formatStoreDate(currentDate, "EEE MMM d")} · {t.tapToOpen}
                  </p>
                </SheetHeader>

                <div className="flex justify-center border-b">
                  <button
                    type="button"
                    onClick={() => quickListRef.current?.scrollBy({ top: -240, behavior: "smooth" })}
                    data-testid="button-quick-scroll-up"
                    className="flex-1 h-12 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:bg-muted active:bg-muted/70 transition-colors"
                  >
                    <ChevronUp className="w-5 h-5" />
                    {t.up}
                  </button>
                </div>

                <div ref={quickListRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
                  {(() => {
                    const todayAppts = (appointments || []).filter((apt: any) => {
                      if (apt.status !== "started") return false;
                      return isOnStoreDate(apt.date, currentDate, timezone);
                    });

                    if (todayAppts.length === 0) {
                      return (
                        <div className="text-center py-12 text-sm text-muted-foreground">
                          {t.noCheckedIn}
                        </div>
                      );
                    }

                    // Compute remaining minutes for each ticket (negative = overdue)
                    const getRemainingMin = (apt: any) => {
                      const addonsDur = (apt.appointmentAddons || []).reduce(
                        (s: number, aa: any) => s + (aa.addon?.duration || 0), 0
                      );
                      const totalDur = (apt.duration || 0) + addonsDur;
                      const startedAt = apt.startedAt ? new Date(apt.startedAt).getTime() : null;
                      const elapsedMin = startedAt ? Math.max(0, Math.floor((nowTick - startedAt) / 60000)) : 0;
                      return totalDur - elapsedMin;
                    };

                    // Sort ALL tickets by remaining time ascending (closest to 0 first)
                    const allSorted = [...todayAppts].sort(
                      (a: any, b: any) => getRemainingMin(a) - getRemainingMin(b)
                    );

                    // Group by staff, preserving the global sort order within each group
                    const byStaff = new Map<number, any[]>();
                    for (const apt of allSorted) {
                      if (!byStaff.has(apt.staffId)) byStaff.set(apt.staffId, []);
                      byStaff.get(apt.staffId)!.push(apt);
                    }

                    // Order staff groups by their earliest-finishing ticket
                    const seenStaffIds = new Set<number>();
                    const orderedStaff: any[] = [];
                    for (const apt of allSorted) {
                      if (!seenStaffIds.has(apt.staffId)) {
                        seenStaffIds.add(apt.staffId);
                        const sm = (staffList || []).find((s: any) => s.id === apt.staffId);
                        if (sm) orderedStaff.push(sm);
                      }
                    }

                    return orderedStaff.map((staffMember: any) => {
                      const list = byStaff.get(staffMember.id) || [];
                      return (
                        <div key={staffMember.id}>
                          <div className="flex items-center gap-2 px-1 mb-2">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={staffMember.profilePicture || undefined} />
                              <AvatarFallback
                                className="text-[11px] font-bold text-white"
                                style={{ backgroundColor: getStaffColor(staffMember) }}
                              >
                                {staffMember.name?.[0]?.toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-bold text-sm">{staffMember.name}</span>
                            <span className="ml-auto text-[11px] text-muted-foreground">
                              {t.ticket(list.length)}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            {list.map((apt: any) => {
                              const timeStr = formatInTz(apt.date, timezone, "h:mm a");
                              const customerFirst =
                                ((apt as any).customer?.fullName || apt.customer?.name || apt.customerName || apt.clientName || "").trim().split(/\s+/)[0] || "";
                              const isPaid = apt.status === "completed" || apt.paymentStatus === "paid";
                              const aptAddonsDur = (apt.appointmentAddons || []).reduce(
                                (s: number, aa: any) => s + (aa.addon?.duration || 0), 0
                              );
                              const totalDur = (apt.duration || 0) + aptAddonsDur;
                              const startedAt = apt.startedAt ? new Date(apt.startedAt).getTime() : null;
                              const remainingMin = getRemainingMin(apt);
                              const isOverdue = remainingMin < 0;
                              const absRemaining = Math.abs(remainingMin);
                              const countdownLabel = isOverdue
                                ? (absRemaining >= 60
                                    ? `+${Math.floor(absRemaining / 60)}h ${absRemaining % 60}m`
                                    : `+${absRemaining}m`)
                                : (remainingMin >= 60
                                    ? `${Math.floor(remainingMin / 60)}h ${remainingMin % 60}m`
                                    : `${remainingMin}m`);
                              const countdownClass = isOverdue
                                ? "bg-red-100 text-red-700 border-red-300"
                                : remainingMin <= (totalDur > 0 ? totalDur * 0.25 : 5)
                                  ? "bg-amber-100 text-amber-700 border-amber-300"
                                  : "bg-emerald-100 text-emerald-700 border-emerald-300";
                              return (
                                <button
                                  key={apt.id}
                                  type="button"
                                  data-testid={`quick-ticket-${apt.id}`}
                                  onClick={() => {
                                    setSelectedAppointment(apt);
                                    setShowCancelFlow(false);
                                    setShowCheckout(true);
                                    setQuickCheckoutOpen(false);
                                  }}
                                  className="w-full text-left rounded-lg border bg-card hover:bg-muted active:bg-muted/70 transition-colors p-3 flex items-center gap-3"
                                  style={{
                                    borderLeft: `4px solid ${getStaffColor(staffMember)}`,
                                  }}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm truncate">
                                      {customerFirst || t.walkIn}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground truncate">
                                      {timeStr}
                                      {apt.services?.[0]?.name
                                        ? ` · ${apt.services[0].name}`
                                        : ""}
                                    </div>
                                  </div>
                                  {startedAt && (
                                    <span
                                      className={cn(
                                        "text-[10px] font-bold px-1.5 py-0.5 rounded border tabular-nums",
                                        countdownClass,
                                      )}
                                      data-testid={`quick-ticket-elapsed-${apt.id}`}
                                      title={totalDur > 0 ? `${totalDur}m total · ${isOverdue ? `${absRemaining}m over` : `${remainingMin}m left`}` : undefined}
                                    >
                                      {countdownLabel}
                                    </span>
                                  )}
                                  {isPaid ? (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                      {t.paid}
                                    </Badge>
                                  ) : (
                                    <DollarSign className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                <div className="flex justify-center border-t">
                  <button
                    type="button"
                    onClick={() => quickListRef.current?.scrollBy({ top: 240, behavior: "smooth" })}
                    data-testid="button-quick-scroll-down"
                    className="flex-1 h-12 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:bg-muted active:bg-muted/70 transition-colors"
                  >
                    <ChevronDown className="w-5 h-5" />
                    {t.down}
                  </button>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {selectedAppointment && !showCancelFlow && !showCheckout && (
          <AppointmentDetailsPanel
            appointment={selectedAppointment}
            timezone={timezone}
            onClose={() => setSelectedAppointment(null)}
            onCancel={() => handleCancelAppointment(selectedAppointment)}
            onStart={() => handleStartService(selectedAppointment)}
            onCheckout={() => handleCheckout(selectedAppointment)}
            onComplete={() => handleComplete(selectedAppointment)}
            onEdit={() => navigate(`/booking/new?editId=${selectedAppointment.id}`)}
            onReschedule={() => navigate(`/booking/new?editId=${selectedAppointment.id}&reschedule=1`)}
            onMarkNoShow={() => handleMarkNoShow(selectedAppointment)}
            lateGraceMinutes={lateGracePeriodMinutes}
            isUpdating={updateAppointment.isPending}
            posEnabled={posEnabled}
            showPrices={showPrices}
          />
        )}

        {selectedAppointment && showCancelFlow && (
          <CancelAppointmentPanel
            appointment={selectedAppointment}
            timezone={timezone}
            onClose={() => setShowCancelFlow(false)}
            onConfirmCancel={(reason) => handleConfirmCancel(selectedAppointment, reason)}
            isUpdating={updateAppointment.isPending}
          />
        )}

        {selectedAppointment && showCheckout && (
          <CheckoutPOSPanel
            appointment={selectedAppointment}
            timezone={timezone}
            siblingAppointments={(appointments as AppointmentWithDetails[]) || []}
            onClose={() => { setShowCheckout(false); }}
            onFinalize={(paymentData) => handleFinalizePayment(selectedAppointment, paymentData)}
            isUpdating={updateAppointment.isPending}
            onCustomerLinked={(clientId, name, loyaltyPoints) => {
              setSelectedAppointment(prev => (prev ? ({
                ...prev,
                customerId: clientId,
                customer: { ...((prev as any).customer ?? {}), id: clientId, name, fullName: name, loyaltyPoints },
              } as any) : prev));
            }}
          />
        )}

        {showDatePicker && (
          <MonthCalendarOverlay
            selectedDate={currentDate}
            timezone={timezone}
            appointments={appointments || []}
            onSelectDate={(date) => {
              setCurrentDate(date);
              setShowDatePicker(false);
            }}
            onSelectAppointment={(apt) => {
              setSelectedAppointment(apt);
              setShowDatePicker(false);
            }}
            onClose={() => setShowDatePicker(false)}
          />
        )}

        {showClientLookupSheet && (
          <ClientLookupSheet
            onClose={() => setShowClientLookupSheet(false)}
          />
        )}

        {showClientLookup && (
          <ChooseClientPanel
            walkInsEnabled={(calSettings as any)?.walkInsEnabled ?? true}
            onClose={() => setShowClientLookup(false)}
            onSelectClient={(clientId) => {
              setShowClientLookup(false);
              if (lookupMode) {
                const now = Date.now();
                const clientAppts = (appointments || []).filter(
                  (apt: any) => apt.customerId === clientId,
                );
                const upcoming = clientAppts
                  .filter((apt: any) => new Date(apt.date).getTime() + (apt.duration || 0) * 60000 >= now)
                  .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
                const target = upcoming[0]
                  || clientAppts.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                if (target) {
                  setSelectedAppointment(target);
                  setShowCancelFlow(false);
                  setShowCheckout(false);
                } else {
                  toast({
                    title: t.noAppts,
                    description: t.noApptsDesc,
                  });
                }
                setLookupMode(false);
              } else {
                navigate(`/booking/new?clientId=${clientId}`);
              }
            }}
            onWalkIn={() => {
              setShowClientLookup(false);
              if (lookupMode) {
                setLookupMode(false);
                return;
              }
              navigate("/booking/new?walkIn=1");
            }}
          />
        )}
      </div>
      {showTurnPage && (
        <TurnPageModal
          currentDate={currentDate}
          timezone={timezone}
          appointments={appointments ?? []}
          staffList={staffList ?? []}
          turnEligibility={turnEligibility}
          nextTechnician={nextTurnTechnician}
          excludedCount={excludedTurnCount}
          storeId={selectedStore?.id ?? 0}
          language={(calSettings as any)?.language ?? "en"}
          onClose={() => setShowTurnPage(false)}
        />
      )}
      {/* Timeclock In/Out sheet — triggered from sidebar button */}
      {showTimeclockSheet && selectedStore && (
        <TimeClockSheet storeId={selectedStore.id} onClose={() => setShowTimeclockSheet(false)} />
      )}
    </div>
  );
}

function CalendarQueuePanel({
  staffList,
  appointments = [],
  timezone,
  currentDate,
  turnEligibility,
  onOpenTurnPage,
  getStaffColor,
}: {
  staffList: any[];
  appointments?: any[];
  timezone?: string;
  currentDate?: Date;
  turnEligibility?: { eligibleTechnicians: TurnTechnician[]; technicians: TurnTechnician[] };
  onOpenTurnPage?: () => void;
  getStaffColor?: (member: any) => string;
}) {
  const { pick } = useLanguage();
  const tz = timezone ?? "UTC";
  const now = new Date();
  const today = currentDate ?? now;

  const staffWithStatus = useMemo(() => {
    const available   = pick({ en: "Available",          vi: "Sẵn sàng",           es: "Disponible",      fr: "Disponible" });
    const busy        = pick({ en: "Busy",               vi: "Đang bận",            es: "Ocupado",         fr: "Occupé" });
    const retaining   = pick({ en: "Busy • Retaining spot", vi: "Đang bận • Giữ vị trí", es: "Ocupado • Reteniendo turno", fr: "Occupé • Conserve sa place" });
    const onBreak     = pick({ en: "On Break",           vi: "Đang nghỉ",           es: "En descanso",     fr: "En pause" });

    // For nail salons (turnEligibility present) only show clocked-in staff.
    const clockedInIds = turnEligibility?.technicians
      ? new Set(turnEligibility.technicians.filter((t: TurnTechnician) => t.clockedIn).map((t: TurnTechnician) => t.id))
      : null;

    // Sort by the turn queue order from turnEligibility.technicians so the panel
    // matches the TURN popup order (not the calendar column order).
    const turnOrderMap = new Map(
      (turnEligibility?.technicians ?? []).map((t: TurnTechnician, i: number) => [t.id, i])
    );

    const sourceList = (clockedInIds
      ? staffList.filter((member: any) => clockedInIds.has(member.id))
      : staffList
    )
      .filter((member: any) => member.showOnCalendar !== false)
      .sort((a: any, b: any) => (turnOrderMap.get(a.id) ?? 999) - (turnOrderMap.get(b.id) ?? 999));

    return sourceList.map((member: any, idx: number) => {
      let status: "available" | "busy" | "on_break" = "available";
      let statusLabel = available;

      if (turnEligibility?.technicians) {
        const techData = turnEligibility.technicians.find((t: TurnTechnician) => t.id === member.id);
        if (techData) {
          status = techData.currentStatus ?? "available";
          if (status === "busy") {
            statusLabel = techData.shortTurnProtected ? retaining : busy;
          } else if (status === "on_break") {
            statusLabel = onBreak;
          } else {
            const tc = techData.turnCount ?? 0;
            statusLabel = tc > 0
              ? pick({ en: `Available • ${tc} turn${tc !== 1 ? "s" : ""}`, vi: `Sẵn sàng • ${tc} lượt`, es: `Disponible • ${tc} turno${tc !== 1 ? "s" : ""}`, fr: `Disponible • ${tc} tour${tc !== 1 ? "s" : ""}` })
              : available;
          }
          return { member, status, statusLabel, position: idx + 1 };
        }
      }

      const todayApts = appointments.filter((apt: any) => {
        if (!apt.staffId || apt.staffId !== member.id) return false;
        return isOnStoreDate(apt.date, today, tz) && (apt.status === "started" || apt.status === "pending" || apt.status === "confirmed");
      });

      const inProgress = todayApts.find((apt: any) => {
        const s = new Date(apt.date);
        const e = addMinutes(s, Number(apt.duration ?? 0));
        return s <= now && e > now && apt.status === "started";
      });

      if (inProgress) {
        status = "busy";
        statusLabel = busy;
      }

      return { member, status, statusLabel, position: idx + 1 };
    });
  }, [staffList, appointments, turnEligibility, tz, today, pick, now]);

  const allBusy = staffWithStatus.length > 0 && staffWithStatus.every((s) => s.status === "busy");

  // Approx wait time: only when ALL staff are busy.
  // For each busy staff, check if there's 30+ min free after their current ticket.
  // If yes → candidate = current ticket end time.
  // If no (next booking starts within 30 min) → candidate = that next booking's end time.
  // Display the earliest candidate.
  const WALK_IN_GAP_MIN = 30;
  const approxWaitMinutes: number | null = (() => {
    if (!allBusy || !appointments.length) return null;
    const nowMs = new Date();

    const staffApts = new Map<number, Array<{ start: Date; end: Date }>>();
    for (const apt of appointments) {
      if (!apt.staffId) continue;
      const aptStart = new Date(apt.date);
      if (!isOnStoreDate(aptStart, today, tz)) continue;
      const aptEnd = addMinutes(aptStart, Number(apt.duration ?? 0));
      if (!staffApts.has(apt.staffId)) staffApts.set(apt.staffId, []);
      staffApts.get(apt.staffId)!.push({ start: aptStart, end: aptEnd });
    }
    for (const list of staffApts.values()) list.sort((a, b) => a.start.getTime() - b.start.getTime());

    let earliest: Date | null = null;
    for (const { member, status } of staffWithStatus) {
      if (status !== "busy") continue;
      const apts = staffApts.get(member.id) ?? [];
      const inProgress = apts.find((a) => a.start <= nowMs && a.end > nowMs);
      if (!inProgress) continue;
      const gapCutoff = addMinutes(inProgress.end, WALK_IN_GAP_MIN);
      const nextBooking = apts.find((a) => a.start > nowMs && a.start < gapCutoff);
      const candidate = nextBooking ? nextBooking.end : inProgress.end;
      if (earliest === null || candidate < earliest) earliest = candidate;
    }
    if (!earliest) return null;
    return Math.max(1, Math.round((earliest.getTime() - nowMs.getTime()) / 60000));
  })();

  if (staffWithStatus.length === 0) {
    return (
      <div className="flex flex-col">
        <div className="flex-1 flex items-center justify-center py-10 px-4 text-xs text-slate-400 text-center">
          {pick({ en: "No staff scheduled", vi: "Không có nhân viên", es: "Sin personal programado", fr: "Aucun personnel prévu" })}
        </div>
      </div>
    );
  }

  const availableRows = staffWithStatus.filter(({ status }) => status === "available");
  const busyRows      = staffWithStatus.filter(({ status }) => status !== "available");

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex-shrink-0 h-11 border-b border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={onOpenTurnPage}
          data-testid="button-open-turn-page"
          className="w-full h-full rounded-none bg-[#1b1b1f] text-slate-100 text-[10px] font-extrabold uppercase tracking-widest hover:bg-[#26262b] active:opacity-90 transition-colors"
        >
          {pick({ en: "TURN QUEUE", vi: "Hàng Chờ", es: "TURNO", fr: "FILE D'ATTENTE" })}
        </button>
      </div>

      {/* Queue rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-200 bg-white">
        {staffWithStatus.length === 0 ? (
          <p className="py-8 text-center text-[10px] text-slate-500">
            {pick({ en: "No staff\nclocked in", vi: "Chưa vào ca", es: "Sin personal\nregistrado", fr: "Aucun personnel\nconnecté" })}
          </p>
        ) : (
          <>
            {availableRows.map(({ member, statusLabel, position }) => {
              const staffColor = getStaffColor ? getStaffColor(member) : "#94a3b8";
              return (
                <div
                  key={member.id}
                  className={cn(
                    "flex flex-col items-center gap-1 px-2 py-2.5",
                    position === 1 ? "bg-emerald-500/10" : ""
                  )}
                >
                  <div className="relative">
                    <Avatar className="w-8 h-8 shrink-0" style={{ boxShadow: `0 0 0 2px ${staffColor}` }}>
                      <AvatarImage src={member.avatarUrl || undefined} alt={member.name} />
                      <AvatarFallback className="text-[10px] font-bold bg-slate-200 text-slate-700">
                        {member.name?.[0]?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className={cn(
                      "absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-extrabold ring-2 ring-[#0d0d0f]",
                      position === 1 ? "bg-emerald-500 text-white" : "bg-[#2dd4bf] text-slate-900"
                    )}>
                      {position}
                    </div>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-100 truncate w-full text-center leading-tight">
                    {member.name}
                  </p>
                  <p className="text-[10px] font-medium text-emerald-400 leading-tight text-center">{statusLabel}</p>
                </div>
              );
            })}

            {busyRows.length > 0 && (
              <>
                <div className="flex items-center gap-1 px-2 py-1 bg-rose-500/10">
                  <div className="h-px flex-1 bg-rose-500/25" />
                  <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-rose-400">
                    {pick({ en: "Busy", vi: "Bận", es: "Ocupado", fr: "Occupé" })}
                  </span>
                  <div className="h-px flex-1 bg-rose-500/25" />
                </div>
                {busyRows.map(({ member, statusLabel }) => {
                  const staffColor = getStaffColor ? getStaffColor(member) : "#94a3b8";
                  return (
                    <div key={member.id} className="flex flex-col items-center gap-1 px-2 py-2.5 bg-rose-500/10">
                      <Avatar className="w-8 h-8 shrink-0" style={{ boxShadow: `0 0 0 2px ${staffColor}` }}>
                        <AvatarImage src={member.avatarUrl || undefined} alt={member.name} />
                        <AvatarFallback className="text-[10px] font-bold bg-rose-500/15 text-rose-300">
                          {member.name?.[0]?.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-[11px] font-semibold text-slate-100 truncate w-full text-center leading-tight">
                        {member.name}
                      </p>
                      <p className="text-[10px] font-medium text-rose-400 leading-tight text-center">{statusLabel}</p>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer fill */}
      <div className="flex-shrink-0 h-1 bg-slate-100" />
    </div>
  );
}

function InlineTurnQueuePanel({
  turnEligibility,
  staffList,
  appointments = [],
  timezone,
  currentDate,
}: {
  turnEligibility?: { eligibleTechnicians: TurnTechnician[]; technicians: TurnTechnician[] };
  staffList: any[];
  appointments?: any[];
  timezone?: string;
  currentDate?: Date;
}) {
  const { pick } = useLanguage();
  const clockedIn = (turnEligibility?.technicians ?? []).filter((tec) => tec.clockedIn);
  const staffMeta = new Map(staffList.map((m: any) => [m.id, { avatarUrl: m.avatarUrl as string | null, color: (m.color ?? "#3b82f6") as string }]));

  const statusLine = (tech: TurnTechnician) => {
    if (tech.currentStatus === "busy") {
      return tech.shortTurnProtected
        ? pick({ en: "Busy - Requested - Retaining spot", vi: "Bận - Đã yêu cầu - Giữ vị trí", es: "Ocupado - Solicitado - Reteniendo turno", fr: "Occupé - Demandé - Conserve sa place" })
        : pick({ en: "Busy - With a client", vi: "Bận - Đang phục vụ khách", es: "Ocupado - Con un cliente", fr: "Occupé - Avec un client" });
    }
    if (tech.currentStatus === "on_break") return pick({ en: "On Break", vi: "Đang nghỉ", es: "En descanso", fr: "En pause" });
    const tc = tech.turnCount ?? 0;
    const base = tc > 0
      ? pick({ en: `Available - ${tc} turn${tc !== 1 ? "s" : ""} today`, vi: `Sẵn sàng - ${tc} lượt hôm nay`, es: `Disponible - ${tc} turno${tc !== 1 ? "s" : ""} hoy`, fr: `Disponible - ${tc} tour${tc !== 1 ? "s" : ""} aujourd'hui` })
      : pick({ en: "Available", vi: "Sẵn sàng", es: "Disponible", fr: "Disponible" });
    return tech.shortTurnProtected
      ? `${base} - ${pick({ en: "Retaining spot", vi: "Giữ vị trí", es: "Reteniendo turno", fr: "Conserve sa place" })}`
      : base;
  };

  // Busy check takes priority — a busy staff in spot #1 always shows pink, not green
  const rowBg = (tech: TurnTechnician, index: number) => {
    if (tech.currentStatus === "busy") return "bg-rose-50";
    if (index === 0) return "bg-green-50";
    if (tech.currentStatus === "on_break") return "bg-slate-100";
    return "bg-white";
  };

  // Approx wait time: when every clocked-in staff is busy, find the earliest time
  // a staff member will be TRULY free — i.e. their current appointment ends AND they
  // don't have another booking starting within the exclusion window after that.
  const exclusionWindowMinutes: number =
    (turnEligibility as any)?.settings?.appointmentExclusionWindowMinutes ?? 20;
  const allBusy = clockedIn.length > 0 && clockedIn.every((t) => t.currentStatus === "busy");
  const approxWaitMinutes: number | null = (() => {
    if (!allBusy || !appointments.length) return null;
    const now = new Date();
    const tz = timezone ?? "UTC";
    const day = currentDate ?? now;
    const busyIds = new Set(clockedIn.map((t) => t.id));

    // Build a per-staff list of today's appointments sorted by start time.
    const staffApts = new Map<number, Array<{ start: Date; end: Date }>>();
    for (const apt of appointments) {
      if (!apt.staffId) continue;
      const aptStart = new Date(apt.date);
      if (!isOnStoreDate(aptStart, day, tz)) continue;
      const aptEnd = addMinutes(aptStart, Number(apt.duration ?? 0));
      if (!staffApts.has(apt.staffId)) staffApts.set(apt.staffId, []);
      staffApts.get(apt.staffId)!.push({ start: aptStart, end: aptEnd });
    }
    for (const list of staffApts.values()) {
      list.sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    let earliest: Date | null = null;
    for (const staffId of busyIds) {
      const apts = staffApts.get(staffId) ?? [];
      // Find this staff's current in-progress appointment.
      const inProgress = apts.find((a) => a.start <= now && a.end > now);
      if (!inProgress) continue;

      // Skip if they have another booking starting within the exclusion window
      // right after the current one ends — they won't be free for walk-ins.
      const bufferCutoff = addMinutes(inProgress.end, exclusionWindowMinutes);
      const hasNextBookingSoon = apts.some(
        (a) => a.start > now && a.start < bufferCutoff
      );
      if (hasNextBookingSoon) continue;

      if (earliest === null || inProgress.end < earliest) earliest = inProgress.end;
    }
    if (!earliest) return null;
    return Math.max(1, Math.round((earliest.getTime() - now.getTime()) / 60000));
  })();

  return (
    <div
      className="flex-none flex flex-col border-l border-slate-300 self-stretch z-10"
      style={{ width: `${STAFF_CALENDAR_COLUMN_WIDTH}px`, minWidth: `${STAFF_CALENDAR_COLUMN_WIDTH}px` }}
    >
      {/* Sticky wrapper — keeps header + queue rows pinned to the top of the
          scroll container while the outer div still stretches to the full
          calendar height (so the bg fill extends all the way down). */}
      <div className="sticky top-0 flex flex-col">
        {/* Header */}
        <div className="flex h-[88px] flex-col items-center justify-center border-b border-slate-700 bg-slate-800 px-3 z-10 gap-1">
          <span className="text-center text-[11px] font-extrabold uppercase tracking-widest text-white leading-tight">
            {pick({ en: "Current Queue Lineup", vi: "Hàng đợi hiện tại", es: "Cola actual", fr: "File d'attente actuelle" })}
          </span>
          {approxWaitMinutes !== null && (
            <span className="text-center text-[10px] font-semibold text-amber-300 leading-tight">
              {pick({ en: `~${approxWaitMinutes} min wait`, vi: `Chờ khoảng ~${approxWaitMinutes} phút`, es: `~${approxWaitMinutes} min de espera`, fr: `~${approxWaitMinutes} min d'attente` })}
            </span>
          )}
        </div>

        {/* Queue rows */}
        <div className="divide-y divide-slate-100 bg-white">
          {clockedIn.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-400">{pick({ en: "No staff clocked in", vi: "Chưa có nhân viên nào vào ca", es: "Sin personal registrado", fr: "Aucun personnel connecté" })}</p>
          ) : (() => {
            // Split: available staff first (they get queue position numbers),
            // then busy/on-break staff below a divider (no queue number — they're serving).
            const activeRows = clockedIn.filter((t) => t.currentStatus === "available");
            const holdRows   = clockedIn.filter((t) => t.currentStatus !== "available");

            const renderRow = (tech: TurnTechnician, posIndex: number, isHold: boolean) => {
              const meta = staffMeta.get(tech.id);
              const initials = tech.name
                .split(" ")
                .map((p: string) => p[0] ?? "")
                .join("")
                .slice(0, 2)
                .toUpperCase();
              const bg = isHold
                ? (tech.currentStatus === "busy" ? "bg-rose-50" : "bg-slate-100")
                : posIndex === 0 ? "bg-green-50" : "bg-white";
              return (
                <div key={tech.id} className={cn("flex items-center gap-2 px-2.5 py-2", bg)}>
                  {/* Position badge — queue number for active, dot for hold */}
                  <div
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
                      isHold
                        ? "bg-rose-200 text-rose-700"
                        : posIndex === 0
                          ? "bg-green-800 text-white"
                          : "bg-slate-300 text-slate-600"
                    )}
                  >
                    {isHold ? "·" : posIndex + 1}
                  </div>

                  {/* Name + status */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-extrabold uppercase leading-tight tracking-wide text-slate-900">{tech.name}</p>
                    <p className="mt-0.5 truncate text-[10px] leading-tight text-slate-500">{statusLine(tech)}</p>
                  </div>
                </div>
              );
            };

            return (
              <>
                {activeRows.map((tech, i) => renderRow(tech, i, false))}
                {holdRows.length > 0 && (
                  <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-50">
                    <div className="h-px flex-1 bg-rose-200" />
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-rose-400">
                      {pick({ en: "Serving", vi: "Đang phục vụ", es: "Atendiendo", fr: "En service" })}
                    </span>
                    <div className="h-px flex-1 bg-rose-200" />
                  </div>
                )}
                {holdRows.map((tech, i) => renderRow(tech, i, true))}
              </>
            );
          })()}
        </div>
      </div>
      {/* Fill the rest of the column height with the same background */}
      <div className="flex-1 bg-slate-100 border-t border-slate-200" />
    </div>
  );
}

function MetricCell({
  label,
  value,
  valueColor = "slate",
}: {
  label: string;
  value: string | number;
  valueColor?: "teal" | "orange" | "red" | "slate" | "black";
}) {
  const colorCls = {
    teal:   "text-teal-600",
    orange: "text-orange-500",
    red:    "text-red-500",
    slate:  "text-slate-800",
    black:  "text-black",
  }[valueColor];
  return (
    <div className="flex flex-col px-2.5 py-2">
      <span className="text-[9px] font-medium leading-tight text-slate-400">{label}</span>
      <span className={cn("mt-0.5 text-sm font-bold tabular-nums leading-tight", colorCls)}>{value}</span>
    </div>
  );
}

function TurnTechCard({
  row,
  index,
  onClick,
  isHold = false,
}: {
  row: any;
  index: number;
  onClick?: () => void;
  isHold?: boolean;
}) {
  const initials = row.name
    .split(" ")
    .map((p: string) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const { pick } = useLanguage();
  const STATUS_CONFIG = {
    available: { label: pick({ en: "AVAILABLE", vi: "SẴN SÀNG", es: "DISPONIBLE", fr: "DISPONIBLE" }), badgeBg: "#54784d" },
    busy:      { label: pick({ en: "BUSY",      vi: "BẬN",      es: "OCUPADO",    fr: "OCCUPÉ"     }), badgeBg: "#b63c4a" },
    on_break:  { label: pick({ en: "ON BREAK",  vi: "NGHỈ",     es: "DESCANSO",   fr: "EN PAUSE"   }), badgeBg: "#6f6f6d" },
  };
  const sc = STATUS_CONFIG[row.currentStatus as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.available;

  const topBg =
    row.currentStatus === "busy"
      ? "#edd8db"
      : row.currentStatus === "on_break"
        ? "#e8e8e8"
        : "#d9eac6";

  const metrics = [
    { label: pick({ en: "Turn Count",        vi: "Số lượt",          es: "Turnos",           fr: "Nombre de tours" }),         value: row.turnCount },
    { label: pick({ en: "Daily Processing",  vi: "Đang xử lý",       es: "En proceso",       fr: "En traitement" }),           value: row.dailyProcessingOrders },
    { label: pick({ en: "Daily Done Income", vi: "Thu nhập xong",     es: "Ingresos hechos",  fr: "Revenus terminés" }),        value: `$${Math.round(row.dailyDoneIncome)}` },
    { label: pick({ en: "Daily Processing",  vi: "Thu nhập đang TT",  es: "Ingresos proceso", fr: "Revenus en cours" }),        value: `$${Math.round(row.dailyProcessingIncome)}` },
  ];

  const isNext = !isHold && index === 0;

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
      className={cn(
        "relative overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md",
        isNext ? "border-2 border-purple-500"
          : isHold ? "border-2 border-pink-500"
          : "border border-black/[0.08]",
        onClick && "cursor-pointer active:scale-[0.98]",
      )}
    >
      {/* Position badge — queue cards only; HOLD cards show nothing here */}
      {!isHold && (
        <div className="absolute right-2 top-2 z-10 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold leading-tight text-white">
          #{index + 1}
        </div>
      )}

      {/* Top section: info */}
      <div className="flex items-start" style={{ backgroundColor: topBg }}>
        {/* Name + status badge */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-3 px-3 pr-9">
          {isNext && (
            <span className="text-[11px] font-bold leading-none text-purple-500">{pick({ en: "NEXT", vi: "TIẾP THEO", es: "SIGUIENTE", fr: "SUIVANT" })}</span>
          )}
          {isHold && (
            <span className="text-[11px] font-bold leading-none text-pink-500">{pick({ en: "HOLD", vi: "GIỮ CHỖ", es: "EN ESPERA", fr: "EN ATTENTE" })}</span>
          )}
          <p className="truncate text-[15px] font-extrabold leading-tight text-slate-900">{row.name}</p>
          <span
            className="inline-block self-start rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: sc.badgeBg }}
          >
            {sc.label}
          </span>
          {row.shortTurnProtected && (
            <span className="inline-flex self-start items-center gap-0.5 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">
              {pick({ en: "Kept Turn", vi: "Giữ lượt", es: "Turno conservado", fr: "Tour conservé" })}
            </span>
          )}
        </div>
      </div>

      {/* Bottom: 2×2 metrics grid */}
      <div className="grid grid-cols-2 border-t border-black/[0.08]" style={{ backgroundColor: "#f5f5f5" }}>
        {metrics.map((cell, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col px-3 py-2",
              i % 2 === 1 && "border-l border-black/[0.08]",
              i >= 2 && "border-t border-black/[0.08]",
            )}
          >
            <span className="text-[9px] font-bold leading-tight text-black">{cell.label}</span>
            <span className="mt-0.5 text-sm font-extrabold leading-tight text-black">{cell.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TurnPageModal({
  currentDate,
  timezone,
  appointments,
  staffList,
  turnEligibility,
  nextTechnician,
  excludedCount,
  storeId,
  language,
  onClose,
}: {
  currentDate: Date;
  timezone: string;
  appointments: any[];
  staffList: any[];
  turnEligibility?: { eligibleTechnicians: TurnTechnician[]; technicians: TurnTechnician[] };
  nextTechnician: TurnTechnician | null;
  excludedCount: number;
  storeId: number;
  language?: string;
  onClose: () => void;
}) {
  const { pick } = useLanguage();

  const t = {
    whyButton:      pick({ en: "Why this order?",                    vi: "Tại sao thứ tự này?",                     es: "¿Por qué este orden?",                    fr: "Pourquoi cet ordre?" }),
    inOut:          pick({ en: "In/Out",                             vi: "Vào/Ra",                                  es: "Entrada/Salida",                          fr: "Entrée/Sortie" }),
    sheetTitle:     pick({ en: "Why is the queue in this order?",   vi: "Tại sao hàng đợi theo thứ tự này?",       es: "¿Por qué la cola está en este orden?",    fr: "Pourquoi la file est dans cet ordre?" }),
    sheetSub:       pick({ en: "A full breakdown of today's line-up", vi: "Phân tích đầy đủ danh sách hôm nay",   es: "Un desglose completo de la lista de hoy",  fr: "Un bilan complet de la liste du jour" }),
    noStaff:        pick({ en: "No staff are clocked in yet.",       vi: "Chưa có nhân viên nào bấm giờ vào ca.", es: "Aún no hay personal registrado.",         fr: "Aucun personnel n'est encore connecté." }),
    staffClockedIn: (n: number) => pick({ en: `${n} Staff Clocked In`, vi: `${n} Nhân viên đã vào ca`, es: `${n} personal registrado`, fr: `${n} personnel connecté` }),
    dailyTotal:     pick({ en: "Daily Total:",  vi: "Tổng ngày:",    es: "Total del día:",   fr: "Total du jour:" }),
    notClockedIn:   (n: number) => pick({ en: `${n} staff member${n !== 1 ? "s" : ""} not clocked in`, vi: `${n} nhân viên chưa bấm giờ vào ca`, es: `${n} miembro${n !== 1 ? "s" : ""} sin registrar`, fr: `${n} membre${n !== 1 ? "s" : ""} non connecté${n !== 1 ? "s" : ""}` }),
    withClient:     pick({ en: "Currently with a client",            vi: "Đang phục vụ khách",                     es: "Actualmente con un cliente",               fr: "Actuellement avec un client" }),
    onBreak:        pick({ en: "On break / paused",                  vi: "Đang nghỉ / tạm dừng",                   es: "En descanso / pausado",                    fr: "En pause / suspendu" }),
    howTitle:       pick({ en: "How the turn system works",          vi: "Hệ thống lượt hoạt động như thế nào",    es: "Cómo funciona el sistema de turnos",       fr: "Comment fonctionne le système de tours" }),
    howRules: (thresh: number) => pick({
      en: [
        `• <strong>Clock-in order</strong> sets the starting line-up — first in, first up.`,
        `• After a completed checkout <strong>above $${thresh}</strong>, that technician moves to the back of the line.`,
        `• Checkouts <strong>below $${thresh}</strong> (short turns) don't move the technician — they keep their spot for one more turn.`,
        `• A technician on break or with an upcoming appointment is <strong>skipped</strong> for walk-ins until they're available again.`,
        `• Managers can manually reorder the queue if needed.`,
      ],
      vi: [
        `• <strong>Thứ tự bấm giờ vào ca</strong> xác định hàng đợi ban đầu — ai vào trước, phục vụ trước.`,
        `• Sau khi thanh toán hoàn tất <strong>trên $${thresh}</strong>, nhân viên đó chuyển xuống cuối hàng đợi.`,
        `• Thanh toán <strong>dưới $${thresh}</strong> (lượt ngắn) không di chuyển nhân viên — họ giữ vị trí thêm một lượt nữa.`,
        `• Nhân viên đang nghỉ hoặc có lịch hẹn sắp tới sẽ bị <strong>bỏ qua</strong> cho khách vãng lai cho đến khi họ sẵn sàng.`,
        `• Quản lý có thể sắp xếp lại hàng đợi thủ công khi cần.`,
      ],
      es: [
        `• El <strong>orden de registro</strong> establece la fila inicial — el primero en entrar es el primero en atender.`,
        `• Tras un cobro completado <strong>por encima de $${thresh}</strong>, ese técnico pasa al final de la fila.`,
        `• Los cobros <strong>por debajo de $${thresh}</strong> (turnos cortos) no mueven al técnico — conservan su lugar un turno más.`,
        `• Un técnico en descanso o con una cita próxima es <strong>omitido</strong> para sin cita hasta que esté disponible.`,
        `• Los gerentes pueden reordenar la cola manualmente si es necesario.`,
      ],
      fr: [
        `• <strong>L'ordre de connexion</strong> établit la file de départ — premier arrivé, premier servi.`,
        `• Après un encaissement complété <strong>au-dessus de $${thresh}</strong>, ce technicien passe en fin de file.`,
        `• Les encaissements <strong>en dessous de $${thresh}</strong> (tours courts) ne déplacent pas le technicien — il garde sa place pour un tour de plus.`,
        `• Un technicien en pause ou avec un rendez-vous à venir est <strong>ignoré</strong> pour les sans-rendez-vous jusqu'à ce qu'il soit disponible.`,
        `• Les responsables peuvent réorganiser la file manuellement si nécessaire.`,
      ],
    }),
    headline0Short: (name: string) => pick({ en: `${name} kept their spot`, vi: `${name} giữ vị trí của mình`, es: `${name} conservó su lugar`, fr: `${name} a conservé sa place` }),
    detail0Short: (name: string, thresh: number) => pick({
      en: `${name}'s last ticket was below the $${thresh} minimum turn amount (a "short turn"). The system protected their position to give them another chance to complete a qualifying turn before moving to the back of the line.`,
      vi: `Khách hàng cuối của ${name} thanh toán dưới mức tối thiểu $${thresh} (lượt ngắn). Hệ thống bảo vệ vị trí của họ để họ có cơ hội hoàn thành một lượt đủ điều kiện trước khi chuyển xuống cuối hàng.`,
      es: `El último ticket de ${name} estuvo por debajo del mínimo de $${thresh} (un "turno corto"). El sistema protegió su posición para darle otra oportunidad antes de pasar al final.`,
      fr: `Le dernier ticket de ${name} était en dessous du minimum de $${thresh} (un "tour court"). Le système a protégé sa position pour lui donner une autre chance avant de passer en fin de file.`,
    }),
    headline0First: (name: string) => pick({ en: `${name} is up first`, vi: `${name} phục vụ đầu tiên`, es: `${name} es el primero`, fr: `${name} est le premier` }),
    detail0First: (name: string, thresh: number) => pick({
      en: `${name} hasn't completed a qualifying turn yet today and holds the earliest position in the queue based on clock-in order. They'll move to the back once they complete a checkout above $${thresh}.`,
      vi: `${name} chưa hoàn thành lượt đủ điều kiện nào hôm nay và đang giữ vị trí sớm nhất trong hàng đợi theo thứ tự bấm giờ vào ca. Họ sẽ chuyển xuống cuối sau khi hoàn thành thanh toán trên $${thresh}.`,
      es: `${name} aún no ha completado un turno calificado hoy y ocupa la posición más temprana según el orden de registro. Pasará al final tras completar un cobro por encima de $${thresh}.`,
      fr: `${name} n'a pas encore complété de tour qualifié aujourd'hui et occupe la position la plus avancée selon l'ordre de connexion. Il passera en fin de file après un encaissement au-dessus de $${thresh}.`,
    }),
    headline0Next: (name: string) => pick({ en: `${name} is up next`, vi: `${name} phục vụ tiếp theo`, es: `${name} es el siguiente`, fr: `${name} est le suivant` }),
    detail0Next: (name: string, turns: number, income: number, thresh: number) => pick({
      en: `${name} has completed ${turns} qualifying turn${turns !== 1 ? "s" : ""} today ($${income} total done income). After their last checkout they moved to the back of the line, but have since advanced as other technicians completed their own turns.`,
      vi: `${name} đã hoàn thành ${turns} lượt đủ điều kiện hôm nay (tổng thu nhập đã hoàn thành: $${income}). Sau lần thanh toán cuối, họ chuyển xuống cuối hàng nhưng đã tiến lên khi các kỹ thuật viên khác hoàn thành lượt của mình.`,
      es: `${name} ha completado ${turns} turno${turns !== 1 ? "s" : ""} calificado${turns !== 1 ? "s" : ""} hoy ($${income} de ingresos). Tras su último cobro pasó al final, pero ha avanzado conforme otros técnicos completaron sus turnos.`,
      fr: `${name} a complété ${turns} tour${turns !== 1 ? "s" : ""} qualifié${turns !== 1 ? "s" : ""} aujourd'hui ($${income} de revenus). Après son dernier encaissement il est passé en fin de file, mais a avancé à mesure que d'autres techniciens complétaient leurs tours.`,
    }),
    headlineNShort: (name: string, pos: number) => pick({ en: `${name} is #${pos} — short-turn hold`, vi: `${name} là #${pos} — giữ lượt ngắn`, es: `${name} es #${pos} — turno corto`, fr: `${name} est #${pos} — tour court` }),
    detailNShort: (name: string, thresh: number, prev: string | null) => pick({
      en: `${name}'s last ticket was below the $${thresh} minimum, so they're being given another turn before cycling to the back. They're currently behind ${prev}.`,
      vi: `Khách hàng cuối của ${name} thanh toán dưới $${thresh} nên họ được thêm một lượt trước khi chuyển xuống cuối. Hiện tại họ đứng sau ${prev}.`,
      es: `El último ticket de ${name} estuvo por debajo de $${thresh}, así que se le da otro turno antes de pasar al final. Actualmente está detrás de ${prev}.`,
      fr: `Le dernier ticket de ${name} était en dessous de $${thresh}, il bénéficie donc d'un tour supplémentaire avant de passer en fin de file. Il est actuellement derrière ${prev}.`,
    }),
    headlineNFirst: (name: string, pos: number) => pick({ en: `${name} is #${pos} in line`, vi: `${name} xếp hàng #${pos}`, es: `${name} es #${pos} en la cola`, fr: `${name} est #${pos} dans la file` }),
    detailNFirst: (name: string, prev: string | null) => pick({
      en: `${name} hasn't completed a qualifying turn yet today. They're positioned after ${prev} based on their clock-in time relative to the others in front of them.`,
      vi: `${name} chưa hoàn thành lượt đủ điều kiện nào hôm nay. Họ đứng sau ${prev} dựa trên thời gian bấm giờ vào ca so với những người đứng trước.`,
      es: `${name} aún no ha completado un turno calificado hoy. Está posicionado después de ${prev} según su hora de registro.`,
      fr: `${name} n'a pas encore complété de tour qualifié aujourd'hui. Il est positionné après ${prev} selon son heure de connexion.`,
    }),
    headlineNNext: (name: string, pos: number) => pick({ en: `${name} is #${pos} in line`, vi: `${name} xếp hàng #${pos}`, es: `${name} es #${pos} en la cola`, fr: `${name} est #${pos} dans la file` }),
    detailNNext: (name: string, turns: number, income: number, thresh: number, prev: string | null) => pick({
      en: `${name} has completed ${turns} qualifying turn${turns !== 1 ? "s" : ""} today ($${income} total). Each time a technician finishes a checkout above $${thresh}, they move to the back of the line. ${name} most recently cycled to the back after ${prev} — who is ahead because they either clocked in later or cycled back more recently.`,
      vi: `${name} đã hoàn thành ${turns} lượt đủ điều kiện hôm nay (tổng: $${income}). Mỗi khi nhân viên hoàn thành thanh toán trên $${thresh}, họ chuyển xuống cuối hàng. ${name} gần đây nhất chuyển xuống sau ${prev} — người đứng trước vì đã bấm giờ muộn hơn hoặc chuyển về phía sau gần đây hơn.`,
      es: `${name} ha completado ${turns} turno${turns !== 1 ? "s" : ""} hoy ($${income} en total). Cada vez que un técnico completa un cobro por encima de $${thresh}, pasa al final. ${name} pasó al final más recientemente después de ${prev}, quien está adelante por haberse registrado más tarde o haber rotado al final más recientemente.`,
      fr: `${name} a complété ${turns} tour${turns !== 1 ? "s" : ""} aujourd'hui ($${income} au total). Chaque fois qu'un technicien finit un encaissement au-dessus de $${thresh}, il passe en fin de file. ${name} a le plus récemment roté après ${prev}, qui est devant parce qu'il s'est connecté plus tard ou a tourné en fin de file plus récemment.`,
    }),
  };
  const [showTimeClock, setShowTimeClock] = useState(false);
  const [showWhySheet, setShowWhySheet] = useState(false);
  const [selectedTech, setSelectedTech] = useState<{ id: number; name: string; color?: string | null } | null>(null);
  // Use the salon's timezone for the kiosk clock — never the browser's locale.
  const [nowTime, setNowTime] = useState(() =>
    formatInTz(new Date(), timezone, "h:mm a")
  );
  const [todayDate] = useState(() =>
    formatInTz(new Date(), timezone, "EEEE, MMMM d")
  );
  const turnByStaff = new Map((turnEligibility?.technicians ?? []).map((tech) => [tech.id, tech]));
  const threshold: number = (turnEligibility as any)?.settings?.turnValueThreshold ?? 25;

  type TechHistoryRow = { turnNumber: number; serviceName: string; amount: number; timestamp: string };
  const { data: techHistory, isLoading: historyLoading } = useQuery<TechHistoryRow[]>({
    queryKey: ["/api/turn/staff-history", storeId, selectedTech?.id],
    queryFn: async () => {
      const res = await fetch(`/api/turn/staff-history?storeId=${storeId}&staffId=${selectedTech!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
    enabled: !!selectedTech && storeId > 0,
  });

  useEffect(() => {
    const id = setInterval(
      () => setNowTime(formatInTz(new Date(), timezone, "h:mm a")),
      30000
    );
    return () => clearInterval(id);
  }, [timezone]);

  // Build a lookup of per-staff appointment income/order data keyed by staffId
  const staffMeta = new Map<number, any>((staffList ?? []).map((member: any) => {
    const dayAppointments = appointments.filter((apt: any) => {
      if (apt.staffId !== member.id) return false;
      return isOnStoreDate(apt.date, currentDate, timezone);
    });
    const dailyDoneIncome = dayAppointments
      .filter((apt: any) => apt.status === "completed")
      .reduce((sum: number, apt: any) => sum + Number(apt.totalPaid || apt.service?.price || 0), 0);
    const dailyProcessingIncome = dayAppointments
      .filter((apt: any) => !["completed", "cancelled", "no-show", "no_show"].includes(String(apt.status)))
      .reduce((sum: number, apt: any) => sum + Number(apt.totalPaid || apt.service?.price || 0), 0);
    const dailyProcessingOrders = dayAppointments
      .filter((apt: any) => !["completed", "cancelled", "no-show", "no_show"].includes(String(apt.status))).length;
    return [member.id, { dailyDoneIncome, dailyProcessingIncome, dailyProcessingOrders, color: member.color ?? "#3b82f6", avatarUrl: member.avatarUrl }];
  }));

  // Use turnEligibility.technicians as the authoritative source — it is already
  // sorted by the server into the correct queue order (turnPosition 0 = next up).
  // Filter to clocked-in only, then augment with calendar income data.
  const clockedInRows = (turnEligibility?.technicians ?? [])
    .filter((tech) => tech.clockedIn)
    .map((tech) => {
      const meta = staffMeta.get(tech.id) ?? { dailyDoneIncome: 0, dailyProcessingIncome: 0, dailyProcessingOrders: 0, color: "#3b82f6", avatarUrl: null };
      return {
        id: tech.id,
        name: tech.name,
        color: meta.color,
        avatarUrl: meta.avatarUrl,
        turnCount: tech.turnCount ?? 0,
        turnPosition: tech.turnPosition ?? 999,
        dailyDoneIncome: meta.dailyDoneIncome,
        dailyProcessingIncome: meta.dailyProcessingIncome,
        dailyProcessingOrders: meta.dailyProcessingOrders,
        clockedIn: true,
        currentStatus: tech.currentStatus ?? "available",
        shortTurnProtected: tech.shortTurnProtected ?? false,
      };
    });
  const rightTotal = clockedInRows.reduce(
    (sum, row) => sum + row.dailyDoneIncome + row.dailyProcessingIncome,
    0
  );
  const notClockedIn = (turnEligibility?.technicians ?? []).filter((t) => !t.clockedIn).length;

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-slate-950/45 p-3" data-testid="turn-page-modal">
      <section className="relative flex h-full flex-col overflow-hidden rounded-md bg-white shadow-2xl">
        <header className="flex h-10 shrink-0 items-center justify-between bg-neutral-800 px-4 text-white">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Turn</h2>
            <span className="hidden sm:inline text-xs text-white/60">|</span>
            <span className="hidden sm:block text-xs text-white/80 truncate">{todayDate}</span>
            <span className="hidden sm:inline text-xs text-white/60">|</span>
            <span className="hidden sm:block text-xs font-semibold text-white/90">{nowTime}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 rounded bg-white/10 px-2 text-[11px] font-semibold text-white hover:bg-white/20"
              onClick={() => setShowWhySheet(true)}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {t.whyButton}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close turn page"
              data-testid="button-close-turn-page"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* ── Main body: cards + right sidebar ────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left — scrollable cards area */}
          <div className="flex-1 overflow-auto bg-slate-100 p-4">
            {clockedInRows.length === 0 ? (
              <div className="flex h-60 items-center justify-center rounded-xl border border-dashed bg-white text-sm text-muted-foreground">
                {t.noStaff}
              </div>
            ) : (() => {
              // Split: active queue (not busy) vs HOLD (currently serving a client)
              const queueRows = clockedInRows.filter((r) => r.currentStatus !== "busy");
              const holdRows  = clockedInRows.filter((r) => r.currentStatus === "busy");

              const minTurns = queueRows.length > 0
                ? Math.min(...queueRows.map((r) => r.turnCount))
                : 0;
              const hasCycleSplit = queueRows.some((r) => r.turnCount > minTurns);
              const currentCycle = (turnEligibility as any)?.currentCycle ?? 1;

              const cycleDivider = (
                <div key="cycle-divider" className="col-span-full flex items-center gap-3 py-2">
                  <div className="h-[3px] flex-1 rounded-full bg-slate-800" />
                  <span className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-white shadow-sm">
                    Cycle {currentCycle + 1}
                  </span>
                  <div className="h-[3px] flex-1 rounded-full bg-slate-800" />
                </div>
              );

              const items: React.ReactNode[] = [];
              let dividerInserted = false;

              queueRows.forEach((row, index) => {
                if (hasCycleSplit && !dividerInserted && row.turnCount > minTurns) {
                  dividerInserted = true;
                  items.push(cycleDivider);
                }
                items.push(
                  <TurnTechCard
                    key={row.id}
                    row={row}
                    index={index}
                    onClick={() => setSelectedTech({ id: row.id, name: row.name, color: row.color })}
                  />
                );
              });

              // Always show cycle divider — append after all cards if no mid-queue split yet
              if (!dividerInserted) {
                items.push(cycleDivider);
              }

              // HOLD section — always show divider regardless of whether staff are holding
              items.push(
                <div key="hold-divider" className="col-span-full flex items-center gap-3 py-2 mt-1">
                  <div className="h-[3px] flex-1 rounded-full bg-pink-500" />
                  <span className="shrink-0 rounded-full bg-pink-500 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-white shadow-sm">
                    Hold — Currently Serving
                  </span>
                  <div className="h-[3px] flex-1 rounded-full bg-pink-500" />
                </div>
              );
              holdRows.forEach((row, i) => {
                items.push(
                  <TurnTechCard
                    key={`hold-${row.id}`}
                    row={row}
                    index={i}
                    isHold
                    onClick={() => setSelectedTech({ id: row.id, name: row.name, color: row.color })}
                  />
                );
              });

              return (
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                  {items}
                </div>
              );
            })()}

            {notClockedIn > 0 && (
              <p className="mt-4 text-center text-xs text-slate-400">
                {t.notClockedIn(notClockedIn)}
              </p>
            )}
          </div>

          {/* Right — stats + clock-in panel, 15px from right edge */}
          <div className="flex w-[190px] shrink-0 flex-col border-l border-slate-200 bg-white pr-[15px] pl-4 py-5">

            {/* Top stats block */}
            <div className="flex flex-col divide-y divide-slate-200">
              {(turnEligibility as any)?.currentCycle != null && (
                <div className="pb-3">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-black">Cycle</p>
                  <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-800">
                    #{(turnEligibility as any).currentCycle}
                  </p>
                </div>
              )}

              <div className="py-3">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-black">
                  Staff Clocked In
                </p>
                <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-800">
                  {clockedInRows.length}
                </p>
              </div>

              <div className="pt-3">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-black">
                  {t.dailyTotal.replace(":", "").trim()}
                </p>
                <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-emerald-600">
                  ${Math.round(rightTotal)}
                </p>
              </div>
            </div>

            {/* Clock In / Out button */}
            <div className="flex flex-1 items-center justify-center">
              <button
                type="button"
                onClick={() => setShowTimeClock(true)}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-5 text-white shadow-md transition-colors hover:bg-slate-700 active:scale-[0.97]"
              >
                <Clock className="h-7 w-7" />
                <span className="text-[11px] font-bold uppercase tracking-widest leading-tight text-center">
                  {t.inOut}
                </span>
              </button>
            </div>

          </div>
        </div>

        {/* ── Why This Order? bottom sheet ─────────────────────────────── */}
        <AnimatePresence>
          {showWhySheet && (
            <>
              <motion.div
                className="absolute inset-0 bg-black/30 z-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowWhySheet(false)}
              />
              <motion.div
                className="absolute bottom-0 left-0 right-0 z-20 flex max-h-[82%] flex-col rounded-t-2xl bg-white shadow-2xl"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 32, stiffness: 320 }}
              >
                {/* drag handle */}
                <div className="flex shrink-0 justify-center pt-3 pb-1">
                  <div className="h-1 w-10 rounded-full bg-slate-200" />
                </div>

                {/* sheet header */}
                <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-1">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">{t.sheetTitle}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{t.sheetSub}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowWhySheet(false)}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-4">
                  {clockedInRows.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">{t.noStaff}</p>
                  ) : (
                    clockedInRows.map((row, index) => {
                      const pos = index + 1;
                      const turns = row.turnCount ?? 0;
                      const income = Math.round(row.dailyDoneIncome ?? 0);
                      const prevName = index > 0 ? clockedInRows[index - 1].name : null;

                      let headline = "";
                      let detail = "";

                      if (index === 0) {
                        if (row.shortTurnProtected) {
                          headline = t.headline0Short(row.name);
                          detail = t.detail0Short(row.name, threshold);
                        } else if (turns === 0) {
                          headline = t.headline0First(row.name);
                          detail = t.detail0First(row.name, threshold);
                        } else {
                          headline = t.headline0Next(row.name);
                          detail = t.detail0Next(row.name, turns, income, threshold);
                        }
                      } else {
                        if (row.shortTurnProtected) {
                          headline = t.headlineNShort(row.name, pos);
                          detail = t.detailNShort(row.name, threshold, prevName);
                        } else if (turns === 0) {
                          headline = t.headlineNFirst(row.name, pos);
                          detail = t.detailNFirst(row.name, prevName);
                        } else {
                          headline = t.headlineNNext(row.name, pos);
                          detail = t.detailNNext(row.name, turns, income, threshold, prevName);
                        }
                      }

                      return (
                        <div key={row.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                              index === 0 ? "bg-blue-600" : "bg-slate-400"
                            )}>
                              {pos}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{headline}</p>
                              <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
                              {row.currentStatus === "busy" && (
                                <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                  {t.withClient}
                                </span>
                              )}
                              {row.currentStatus === "on_break" && (
                                <span className="mt-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                  {t.onBreak}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* How the system works */}
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-700">{t.howTitle}</p>
                    <ul className="space-y-1.5 text-xs leading-5 text-blue-800">
                      {t.howRules(threshold).map((rule, i) => (
                        <li key={i} dangerouslySetInnerHTML={{ __html: rule }} />
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            </>
          )}
          {selectedTech && (
            <>
              <motion.div
                className="absolute inset-0 bg-black/30 z-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedTech(null)}
              />
              <motion.div
                className="absolute bottom-0 left-0 right-0 z-20 flex max-h-[78%] flex-col rounded-t-2xl bg-white shadow-2xl"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 32, stiffness: 320 }}
              >
                <div className="flex shrink-0 justify-center pt-3 pb-1">
                  <div className="h-1 w-10 rounded-full bg-slate-200" />
                </div>

                <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-1">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: selectedTech.color ?? "#3b82f6" }}
                    >
                      {selectedTech.name.split(" ").map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800">{selectedTech.name}</h3>
                      <p className="text-xs text-slate-500">Turn breakdown</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTech(null)}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* ── Live stats strip ── */}
                {(() => {
                  const live = turnByStaff.get(selectedTech.id);
                  const meta = staffMeta.get(selectedTech.id);
                  if (!live) return null;
                  const statusLabel =
                    live.currentStatus === "busy" ? "BUSY" :
                    live.currentStatus === "on_break" ? "ON BREAK" : "AVAILABLE";
                  const statusCls =
                    live.currentStatus === "busy" ? "bg-rose-100 text-rose-600" :
                    live.currentStatus === "on_break" ? "bg-slate-100 text-slate-600" :
                    "bg-green-100 text-green-700";
                  return (
                    <div className="mx-5 mb-3 grid grid-cols-4 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-slate-50">
                      <div className="flex flex-col items-center py-3 px-1">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Position</p>
                        <p className="mt-1 text-xl font-extrabold tabular-nums text-slate-800">
                          #{(live.turnPosition ?? 0) + 1}
                        </p>
                      </div>
                      <div className="flex flex-col items-center py-3 px-1">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Turns</p>
                        <p className="mt-1 text-xl font-extrabold tabular-nums text-slate-800">
                          {live.turnCount ?? 0}
                        </p>
                      </div>
                      <div className="flex flex-col items-center py-3 px-1">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Done $</p>
                        <p className="mt-1 text-xl font-extrabold tabular-nums text-emerald-600">
                          ${Math.round(meta?.dailyDoneIncome ?? 0)}
                        </p>
                      </div>
                      <div className="flex flex-col items-center justify-center py-3 px-1">
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusCls}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex-1 overflow-y-auto px-5 pb-6">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Completed Turns Today</p>
                  {historyLoading ? (
                    <div className="flex items-center justify-center py-10 text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : !techHistory || techHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                      <Receipt className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">No completed turns yet today</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-slate-100">
                      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        <span>#</span>
                        <span>Service</span>
                        <span className="text-right">Amount</span>
                        <span className="text-right">Time</span>
                      </div>
                      {techHistory.map((row) => (
                        <div
                          key={row.turnNumber}
                          className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 border-b border-slate-50 px-4 py-3 last:border-0"
                        >
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                            {row.turnNumber}
                          </span>
                          <span className="truncate text-sm font-medium text-slate-700">{row.serviceName}</span>
                          <span className="text-right text-sm font-semibold text-emerald-600">
                            ${row.amount % 1 === 0 ? row.amount.toFixed(0) : row.amount.toFixed(2)}
                          </span>
                          <span className="text-right text-xs text-slate-400">
                            {new Date(row.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5">
                        <span className="text-xs font-bold text-slate-500">Total</span>
                        <span className="text-sm font-bold text-slate-800">
                          ${techHistory.reduce((s, r) => s + r.amount, 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </section>
      {showTimeClock && storeId > 0 && (
        <TimeClockSheet storeId={storeId} onClose={() => setShowTimeClock(false)} />
      )}
    </div>,
    document.body
  );
}

function TimeClockSheet({ storeId, onClose }: { storeId: number; onClose: () => void }) {
  const { pick } = useLanguage();
  const queryClient = useQueryClient();
  const { selectedStore: _tcStore } = useSelectedStore();
  const timezone = _tcStore?.timezone || "UTC";
  const tTC = {
    inOut:      pick({ en: "In/Out",                   vi: "Vào/Ra",                    es: "Entrada/Salida",           fr: "Entrée/Sortie" }),
    enterPin:   pick({ en: "Enter PIN",                vi: "Nhập mã PIN",               es: "Ingresar PIN",             fr: "Entrer le PIN" }),
    pinHint:    pick({ en: "3–4 digit numeric PIN",    vi: "Mã PIN 3–4 chữ số",         es: "PIN numérico de 3–4 dígitos", fr: "PIN numérique de 3–4 chiffres" }),
    done:       pick({ en: "DONE",                     vi: "XONG",                      es: "LISTO",                    fr: "TERMINÉ" }),
    closingIn:  (s: number) => pick({ en: `Closing in ${s}s…`, vi: `Đóng sau ${s}s…`, es: `Cerrando en ${s}s…`, fr: `Fermeture dans ${s}s…` }),
    diffPin:    pick({ en: "Use a different PIN",      vi: "Dùng mã PIN khác",          es: "Usar un PIN diferente",    fr: "Utiliser un autre PIN" }),
  };
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [staff, setStaff] = useState<{ id: number; name: string; color?: string | null; avatarUrl?: string | null } | null>(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockTime, setClockTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [autoCloseCountdown, setAutoCloseCountdown] = useState<number | null>(null);

  const MAX_PIN_LENGTH = 4;

  // Start a 20-second auto-close countdown whenever a clock action completes
  useEffect(() => {
    if (!staff || !successMsg) return;
    setAutoCloseCountdown(20);
    const interval = setInterval(() => {
      setAutoCloseCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          onClose();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [staff, clockedIn]);

  const handleDigit = useCallback((digit: string) => {
    if (staff) return; // lock input after verified
    setPin((prev) => (prev.length < MAX_PIN_LENGTH ? prev + digit : prev));
    setPinError("");
  }, [staff]);

  const handleBackspace = useCallback(() => {
    if (staff) return;
    setPin((prev) => prev.slice(0, -1));
    setPinError("");
  }, [staff]);

  const handleSubmitPin = useCallback(async () => {
    if (pin.length < 3) {
      setPinError("PIN must be 3 or 4 digits");
      return;
    }
    if (loading) return;
    setLoading(true);
    setPinError("");
    try {
      const res = await fetch("/api/timeclock/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, pin }),
      });
      if (!res.ok) {
        const err = await res.json();
        setPinError(err.error || "Invalid PIN");
        setPin("");
        return;
      }
      const data = await res.json();
      setStaff(data.staff);

      // Check current clock status then auto-toggle
      let isClockedIn = false;
      const statusRes = await fetch(`/api/timeclock/status/${data.staff.id}?storeId=${storeId}`, {
        credentials: "include",
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        isClockedIn = statusData.clockedIn;
        setClockedIn(isClockedIn);
      }

      // Auto-toggle: clock in if not clocked in, clock out if already clocked in
      if (!isClockedIn) {
        await performClockIn(data.staff.id);
      } else {
        await performClockOut(data.staff.id);
      }
    } catch {
      setPinError("Network error. Please try again.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }, [pin, storeId, loading]);

  const performClockIn = useCallback(async (staffId: number) => {
    setLoading(true);
    try {
      const res = await fetch("/api/timeclock/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, staffId }),
      });
      if (!res.ok) {
        const err = await res.json();
        if (err.error === "Already clocked in") {
          setClockedIn(true);
          return;
        }
        setPinError(err.error || "Failed to clock in");
        return;
      }
      const data = await res.json();
      setClockedIn(true);
      const time = new Date(data.record.clockIn);
      setClockTime(formatInTz(time, timezone, "h:mm a"));
      setSuccessMsg("Clocked In");
      // Immediately refresh the Turn queue so the newly clocked-in tech appears
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", storeId] });
      window.dispatchEvent(new CustomEvent("turn-eligibility-changed"));
    } catch {
      setPinError("Failed to clock in");
    } finally {
      setLoading(false);
    }
  }, [storeId, queryClient]);

  const performClockOut = useCallback(async (staffId: number) => {
    setLoading(true);
    try {
      const res = await fetch("/api/timeclock/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, staffId }),
      });
      if (!res.ok) {
        const err = await res.json();
        setPinError(err.error || "Failed to clock out");
        return;
      }
      const data = await res.json();
      setClockedIn(false);
      const time = new Date(data.record.clockOut);
      setClockTime(formatInTz(time, timezone, "h:mm a"));
      setSuccessMsg("Clocked Out");
      // Immediately remove the clocked-out tech from the Turn queue
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", storeId] });
      window.dispatchEvent(new CustomEvent("turn-eligibility-changed"));
    } catch {
      setPinError("Failed to clock out");
    } finally {
      setLoading(false);
    }
  }, [storeId, queryClient]);

  const handleClockToggle = useCallback(() => {
    if (!staff) return;
    if (clockedIn) {
      performClockOut(staff.id);
    } else {
      performClockIn(staff.id);
    }
  }, [staff, clockedIn, performClockIn, performClockOut]);

  const handleReset = useCallback(() => {
    setStaff(null);
    setPin("");
    setPinError("");
    setClockedIn(false);
    setClockTime("");
    setSuccessMsg("");
  }, []);

  const numKeys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["enter", "0", "backspace"],
  ];

  return (
    <div className="dark cx-cal fixed inset-0 z-[100] text-foreground">
      <button
        type="button"
        aria-label="Close time clock"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[380px] bg-[#161618] flex flex-col shadow-[-8px_0_24px_rgba(0,0,0,0.12)] border-l">
        {/* Header */}
        <div className="px-4 py-4 flex items-center justify-between gap-2 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-base text-gray-900">{tTC.inOut}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col px-4 pt-5 min-h-0 bg-[#161618] pb-[calc(env(safe-area-inset-bottom,0px)+72px)]">
          {/* Staff info + PIN display */}
          <div className="w-full rounded-2xl bg-white border border-gray-200 shadow-sm py-6 px-4 mb-5 text-center">
            {staff ? (
              <>
                <p className="text-lg font-bold text-gray-900">{staff.name}</p>
                {successMsg ? (
                  <p className="text-3xl font-bold mt-2" style={{ color: clockedIn ? "#22c55e" : "#ef4444" }}>
                    {successMsg}
                    {clockTime && <span className="block text-base font-normal text-gray-500 mt-1">{clockTime}</span>}
                  </p>
                ) : (
                  <div className="mt-2">
                    {loading ? (
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                    ) : (
                      <>
                        <Button
                          onClick={onClose}
                          className="mt-4 w-full rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-base font-bold py-3 h-auto"
                        >
                          {tTC.done}
                        </Button>
                        {autoCloseCountdown !== null && (
                          <p className="mt-2 text-xs text-gray-400">
                            {tTC.closingIn(autoCloseCountdown)}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={handleReset}
                          className="block mt-3 mx-auto text-xs text-gray-400 underline hover:text-gray-600"
                        >
                          {tTC.diffPin}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-gray-900">
                  {pin.length > 0 ? "●".repeat(pin.length) : tTC.enterPin}
                </p>
                <p className="text-sm text-gray-400 mt-1 flex items-center justify-center gap-1.5">
                  {tTC.pinHint}
                </p>
                {pinError && (
                  <p className="text-sm text-red-500 mt-2 font-medium">{pinError}</p>
                )}
              </>
            )}
          </div>

          {/* Numpad */}
          {!staff && (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              {numKeys.map((row, ri) => (
                <div key={ri} className="flex gap-3 flex-1">
                  {row.map((key) => {
                    if (key === "enter") {
                      return (
                        <button
                          key={key}
                          type="button"
                          onPointerDown={e => e.preventDefault()}
                          onClick={handleSubmitPin}
                          disabled={pin.length < 3 || loading}
                          className="flex-1 rounded-2xl bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {loading ? (
                            <Loader2 className="w-7 h-7 animate-spin" />
                          ) : (
                            <PersonStanding className="w-7 h-7" />
                          )}
                        </button>
                      );
                    }
                    if (key === "backspace") {
                      return (
                        <button
                          key={key}
                          type="button"
                          onPointerDown={e => e.preventDefault()}
                          onClick={handleBackspace}
                          className="flex-1 rounded-2xl bg-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-300 active:scale-95 transition-all"
                        >
                          <Delete className="w-7 h-7" />
                        </button>
                      );
                    }
                    return (
                      <button
                        key={key}
                        type="button"
                        onPointerDown={e => e.preventDefault()}
                        onClick={() => handleDigit(key)}
                        className="flex-1 rounded-2xl bg-white text-3xl font-bold text-gray-900 shadow-sm border border-gray-100 hover:bg-gray-50 active:scale-95 transition-all"
                      >
                        {key}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label, muted = false }: { color: string; label: string; muted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", muted && "text-slate-300")}>
      <span className="h-2.5 w-5" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

interface FillSlotCandidate {
  customerId: number;
  customerName: string;
  customerPhone: string | null;
  lastVisitDate: string | null;
  daysSinceLast: number | null;
  preferredService: string | null;
  preferredStaff: string | null;
  suggestedMessage: string;
  priority: "high" | "medium" | "low";
}

function FillSlotSection({
  appointment,
  storeId,
}: {
  appointment: AppointmentWithDetails;
  storeId: number;
}) {
  const [sentIds, setSentIds] = useState<Set<number>>(new Set());
  const [sendingId, setSendingId] = useState<number | null>(null);
  const { toast: fillToast } = useToast();
  const { pick } = useLanguage();

  const { data: candidates, isLoading } = useQuery<FillSlotCandidate[]>({
    queryKey: ["/api/intelligence/cancellation-recovery", appointment.id, storeId],
    queryFn: async () => {
      const res = await fetch(
        `/api/intelligence/cancellation-recovery/${appointment.id}?storeId=${storeId}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!appointment.id && !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  const handleSend = async (candidate: FillSlotCandidate) => {
    setSendingId(candidate.customerId);
    try {
      const res = await fetch("/api/intelligence/fill-slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          storeId,
          customerId: candidate.customerId,
          message: candidate.suggestedMessage,
          cancelledAppointmentId: appointment.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSentIds(prev => new Set([...prev, candidate.customerId]));
        fillToast({ title: pick({ en: "Message sent!", vi: "Đã gửi tin nhắn!", es: "¡Mensaje enviado!", fr: "Message envoyé !" }), description: pick({ en: `${candidate.customerName} has been notified about the open slot.`, vi: `Đã thông báo cho ${candidate.customerName} về chỗ trống.`, es: `Se notificó a ${candidate.customerName} sobre el hueco libre.`, fr: `${candidate.customerName} a été informé du créneau libre.` }) });
      } else {
        fillToast({ title: pick({ en: "Could not send", vi: "Không thể gửi", es: "No se pudo enviar", fr: "Envoi impossible" }), description: data.error || pick({ en: "Failed to send SMS.", vi: "Gửi SMS thất bại.", es: "No se pudo enviar el SMS.", fr: "Échec de l'envoi du SMS." }), variant: "destructive" });
      }
    } catch {
      fillToast({ title: pick({ en: "Failed to send", vi: "Gửi thất bại", es: "Error al enviar", fr: "Échec de l'envoi" }), variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const priorityConfig: Record<string, { bg: string; text: string; label: string }> = {
    high: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "High" },
    medium: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "Mid" },
    low: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", label: "Low" },
  };

  return (
    <div className="pt-3 border-t space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-500 flex-shrink-0" />
        <span className="text-sm font-semibold">Fill this slot</span>
        {!isLoading && candidates && candidates.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {Math.min(candidates.length, 3)} match{Math.min(candidates.length, 3) !== 1 ? "es" : ""}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Finding candidates…
        </div>
      )}

      {!isLoading && (!candidates || candidates.length === 0) && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          No matching candidates found — consider posting about the opening or checking your waitlist.
        </p>
      )}

      {!isLoading && candidates && candidates.slice(0, 3).map((candidate) => {
        const isSent = sentIds.has(candidate.customerId);
        const isSending = sendingId === candidate.customerId;
        const pc = priorityConfig[candidate.priority] || priorityConfig.low;
        const hasPhone = !!candidate.customerPhone;

        return (
          <div
            key={candidate.customerId}
            className={cn(
              "rounded-lg border p-3 space-y-2 transition-colors",
              isSent ? "bg-emerald-50 border-emerald-200" : "bg-muted/40 border-border"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                  {candidate.customerName[0]?.toUpperCase() || "?"}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate leading-tight">{candidate.customerName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {candidate.daysSinceLast !== null
                      ? `${candidate.daysSinceLast}d since last visit`
                      : "First-time candidate"}
                  </p>
                </div>
              </div>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0",
                pc.bg, pc.text
              )}>
                {pc.label}
              </span>
            </div>

            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed italic">
              "{candidate.suggestedMessage.split("\n")[0]}"
            </p>

            <Button
              size="sm"
              className={cn(
                "w-full h-8 text-xs font-semibold gap-1.5",
                isSent
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : hasPhone
                  ? "bg-amber-500 hover:bg-amber-600 text-white"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              onClick={() => !isSent && hasPhone && handleSend(candidate)}
              disabled={isSent || isSending || !hasPhone}
            >
              {isSent ? (
                <><Check className="h-3.5 w-3.5" /> Sent ✓</>
              ) : isSending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
              ) : !hasPhone ? (
                "No phone on file"
              ) : (
                <><Send className="h-3.5 w-3.5" /> Send Message</>
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function AppointmentDetailsPanel({
  appointment,
  timezone,
  onClose,
  onCancel,
  onStart,
  onCheckout,
  onComplete,
  onEdit,
  onReschedule,
  onMarkNoShow,
  lateGraceMinutes,
  isUpdating,
  posEnabled,
  showPrices,
}: {
  appointment: AppointmentWithDetails;
  timezone: string;
  onClose: () => void;
  onCancel: () => void;
  onStart: () => void;
  onCheckout: () => void;
  onComplete: () => void;
  onEdit: () => void;
  onReschedule: () => void;
  onMarkNoShow: () => void;
  lateGraceMinutes: number;
  isUpdating: boolean;
  posEnabled: boolean;
  showPrices: boolean;
}) {
  const { pick } = useLanguage();
  const minutesPastStart = Math.floor(
    (Date.now() - new Date(appointment.date).getTime()) / 60000,
  );
  const isOverdue =
    minutesPastStart >= lateGraceMinutes &&
    (appointment.status === "pending" || appointment.status === "confirmed");
  const isPastOneHour = minutesPastStart > 60;
  const isAppointmentToday = isOnStoreDate(appointment.date, getNowInTimezone(timezone), timezone) && minutesPastStart >= -60;
  const endTime = addMinutes(new Date(appointment.date), appointment.duration);
  const dateStr = formatInTz(appointment.date, timezone, "EEEE, d MMM yyyy");
  const timeStr = `${formatInTz(appointment.date, timezone, "h:mm a")} - ${formatInTz(endTime, timezone, "h:mm a")}`;
  const appointmentIdNum = typeof appointment.id === "number" ? appointment.id : Number.NaN;
  const hasServerAppointmentId = Number.isFinite(appointmentIdNum);

  const { data: availableTimeData } = useQuery<{ availableMinutes: number }>({
    queryKey: ["/api/appointments", hasServerAppointmentId ? appointmentIdNum : "local", "available-time"],
    queryFn: async () => {
      const res = await fetch(`/api/appointments/${appointmentIdNum}/available-time`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch available time");
      return res.json();
    },
    enabled: hasServerAppointmentId,
    staleTime: 30 * 1000,
  });

  const { selectedStore: detailStore } = useSelectedStore();
  const { data: clientIntel } = useQuery<any>({
    queryKey: ["/api/intelligence/client", appointment.customerId, detailStore?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/intelligence/client/${appointment.customerId}?storeId=${detailStore?.id}`,
        { credentials: "include" }
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!appointment.customerId && !!detailStore?.id,
    staleTime: 5 * 60 * 1000,
  });
  const intel = clientIntel?.intel;

  const { toast: detailToast } = useToast();
  const [reviewSent, setReviewSent] = useState(false);
  const [reviewSending, setReviewSending] = useState(false);

  const handleSendReview = async () => {
    setReviewSending(true);
    try {
      const res = await fetch(`/api/appointments/${appointment.id}/send-review-request`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setReviewSent(true);
        detailToast({ title: tD.reviewSentToast, description: tD.reviewSentDesc });
      } else {
        detailToast({ title: tD.couldNotSend, description: data.error || tD.reviewNeedsSms, variant: "destructive" });
      }
    } catch {
      detailToast({ title: tD.failedToSend, variant: "destructive" });
    } finally {
      setReviewSending(false);
    }
  };

  const statusMap: Record<string, { label: string; variant: "destructive" | "secondary"; color: string }> = {
    pending:   { label: pick({ en: "Booked",    vi: "Đã đặt",     es: "Reservado",  fr: "Réservé"  }), variant: "secondary",   color: "#3b82f6" },
    confirmed: { label: pick({ en: "Booked",    vi: "Đã đặt",     es: "Reservado",  fr: "Réservé"  }), variant: "secondary",   color: "#3b82f6" },
    started:   { label: pick({ en: "Started",   vi: "Đang làm",   es: "Iniciado",   fr: "Commencé" }), variant: "secondary",   color: "#22c55e" },
    cancelled: { label: pick({ en: "Cancelled", vi: "Đã hủy",     es: "Cancelado",  fr: "Annulé"   }), variant: "destructive", color: "#ef4444" },
    completed: { label: pick({ en: "Completed", vi: "Hoàn thành", es: "Completado", fr: "Terminé"  }), variant: "secondary",   color: "#22c55e" },
    "no_show": { label: pick({ en: "No-Show",   vi: "Vắng mặt",   es: "No asistió", fr: "Absent"   }), variant: "destructive", color: "#ef4444" },
  };
  const statusInfo = statusMap[appointment.status || "pending"] || statusMap.pending;
  const statusLabel = statusInfo.label;
  const statusVariant = statusInfo.variant;
  const progressColor = statusInfo.color;

  const aptAddons = appointment.appointmentAddons?.map(aa => aa.addon).filter(Boolean) || [];
  const addonTotal = aptAddons.reduce((sum, a) => sum + Number(a!.price), 0);
  const baseTotal = Number(appointment.service?.price || 0) + addonTotal;
  const grandTotal = appointment.status === "completed" && Number((appointment as any).totalPaid) > 0
    ? Number((appointment as any).totalPaid)
    : baseTotal;

  const formatPhone = (phone: string | null | undefined) => {
    if (!phone) return "";
    const d = phone.replace(/\D/g, "");
    if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    if (d.length === 11 && d[0] === "1") return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
    return phone;
  };

  const panelDragStartY = useRef<number | null>(null);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const tD = {
    walkIn:       pick({ en: "Walk-In",               vi: "Khách vãng lai",      es: "Sin cita",              fr: "Sans rendez-vous" }),
    reviewSentToast: pick({ en: "Review request sent!", vi: "Đã gửi yêu cầu đánh giá!", es: "¡Solicitud de reseña enviada!", fr: "Demande d'avis envoyée !" }),
    reviewSentDesc:  pick({ en: "Your client will receive a text shortly.", vi: "Khách của bạn sẽ nhận được tin nhắn ngay.", es: "Tu cliente recibirá un mensaje en breve.", fr: "Votre client recevra un SMS sous peu." }),
    couldNotSend:    pick({ en: "Could not send", vi: "Không thể gửi", es: "No se pudo enviar", fr: "Envoi impossible" }),
    reviewNeedsSms:  pick({ en: "Review requests require SMS enabled with a Google review URL.", vi: "Yêu cầu đánh giá cần bật SMS và có link đánh giá Google.", es: "Las solicitudes de reseña requieren SMS activado con una URL de reseña de Google.", fr: "Les demandes d'avis nécessitent le SMS activé avec une URL d'avis Google." }),
    failedToSend:    pick({ en: "Failed to send", vi: "Gửi thất bại", es: "Error al enviar", fr: "Échec de l'envoi" }),
    service:      pick({ en: "Service",               vi: "Dịch vụ",             es: "Servicio",              fr: "Service" }),
    booked:       pick({ en: "Booked",                vi: "Đã đặt",              es: "Reservado",             fr: "Réservé" }),
    started:      pick({ en: "Started",               vi: "Đang làm",            es: "Iniciado",              fr: "Commencé" }),
    cancelled:    pick({ en: "Cancelled",             vi: "Đã hủy",              es: "Cancelado",             fr: "Annulé" }),
    completed:    pick({ en: "Completed",             vi: "Hoàn thành",          es: "Completado",            fr: "Terminé" }),
    noShow:       pick({ en: "No-Show",               vi: "Vắng mặt",            es: "No asistió",            fr: "Absent" }),
    total:        pick({ en: "Total",                 vi: "Tổng cộng",           es: "Total",                 fr: "Total" }),
    overdueMsg:   (m: number) => pick({ en: `Client is ${m} min late · check them in or mark as no-show`, vi: `Khách trễ ${m} phút · check-in hoặc đánh dấu vắng mặt`, es: `Cliente lleva ${m} min de retraso · regístralo o márcalo como no asistió`, fr: `Client en retard de ${m} min · enregistrez-le ou marquez absent` }),
    atRisk:       pick({ en: "At-risk client — hasn't visited in a while",        vi: "Khách có nguy cơ bỏ — lâu chưa ghé",            es: "Cliente en riesgo — no ha visitado hace tiempo",    fr: "Client à risque — n'a pas visité depuis longtemps" }),
    highNoShow:   pick({ en: "High no-show risk — consider confirming",           vi: "Nguy cơ vắng mặt cao — nên xác nhận lại",        es: "Alto riesgo de no asistencia — considera confirmar", fr: "Risque élevé d'absence — envisagez de confirmer" }),
    drifting:     pick({ en: "Drifting — cadence slipping",                       vi: "Đang thưa dần — cần chú ý",                      es: "Se aleja — cadencia disminuyendo",                  fr: "Dérive — cadence qui glisse" }),
    ltv:          pick({ en: "LTV",          vi: "Tổng giá trị",  es: "VTV",        fr: "VTV" }),
    every:        pick({ en: "every",        vi: "mỗi",           es: "cada",       fr: "tous les" }),
    visits:       pick({ en: "visits",       vi: "lần",           es: "visitas",    fr: "visites" }),
    reviewSent:   pick({ en: "Review Request Sent ✓",   vi: "Đã gửi yêu cầu đánh giá ✓",  es: "Solicitud de reseña enviada ✓",  fr: "Demande d'avis envoyée ✓" }),
    reviewSending:pick({ en: "Sending…",                vi: "Đang gửi…",                    es: "Enviando…",                      fr: "Envoi…" }),
    requestReview:pick({ en: "Request a Review",        vi: "Yêu cầu đánh giá",             es: "Solicitar reseña",               fr: "Demander un avis" }),
    rebook:       pick({ en: "Rebook",                  vi: "Đặt lại",                      es: "Volver a reservar",              fr: "Rebooker" }),
    edit:         pick({ en: "Edit",                    vi: "Chỉnh sửa",                    es: "Editar",                         fr: "Modifier" }),
    cancelAppt:   pick({ en: "Cancel Appointment",      vi: "Hủy lịch hẹn",                 es: "Cancelar cita",                  fr: "Annuler le rendez-vous" }),
    updating:     pick({ en: "Updating...",             vi: "Đang cập nhật...",              es: "Actualizando...",                fr: "Mise à jour..." }),
    reschedule:   pick({ en: "Reschedule",              vi: "Dời lịch",                      es: "Reprogramar",                    fr: "Replanifier" }),
    checkout:     pick({ en: "Checkout",                vi: "Thanh toán",                    es: "Pagar",                          fr: "Encaisser" }),
    finishAppt:   pick({ en: "Finish Appointment",      vi: "Kết thúc dịch vụ",              es: "Finalizar cita",                 fr: "Terminer le rendez-vous" }),
    complete:     pick({ en: "Complete",                vi: "Hoàn tất",                      es: "Completar",                      fr: "Terminer" }),
    markDone:     pick({ en: "Mark as Done",            vi: "Đánh dấu xong",                 es: "Marcar como hecho",              fr: "Marquer comme terminé" }),
    start:        pick({ en: "Start",                   vi: "Bắt đầu",                       es: "Iniciar",                        fr: "Démarrer" }),
    beginService: pick({ en: "Begin Service",           vi: "Bắt đầu dịch vụ",               es: "Iniciar servicio",               fr: "Démarrer le service" }),
    markNoShow:   pick({ en: "No-Show",                 vi: "Vắng mặt",                      es: "No asistió",                     fr: "Absent" }),
    markNoShowSub:pick({ en: "Mark Did Not Arrive",     vi: "Đánh dấu không đến",             es: "Marcar como no presentado",      fr: "Marquer non arrivé" }),
    daysOverdue:  (d: number) => pick({ en: `${Math.abs(d)}d overdue`, vi: `Quá hạn ${Math.abs(d)} ngày`, es: `${Math.abs(d)}d vencido`, fr: `${Math.abs(d)}j de retard` }),
    dueToday:     pick({ en: "due today",   vi: "đến hôm nay",  es: "vence hoy",  fr: "dû aujourd'hui" }),
    dueIn:        (d: number) => pick({ en: `due in ${d}d`, vi: `còn ${d} ngày`, es: `vence en ${d}d`, fr: `dans ${d}j` }),
  };

  return (
    <div className="fixed inset-0 z-50" data-testid="appointment-details-panel">
      <button
        type="button"
        aria-label="Close appointment details"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className={cn(
        "absolute right-0 top-0 h-full w-full sm:w-[440px] flex flex-col shadow-[-8px_0_24px_rgba(0,0,0,0.4)]",
        isOverdue && "ring-2 ring-rose-500/60 ring-inset",
      )}
        style={{ backgroundColor: "#1a1a1c", borderLeft: "1px solid #333338" }}
        onTouchStart={(e) => {
          const scrollTop = panelScrollRef.current?.scrollTop ?? 0;
          if (scrollTop === 0) {
            panelDragStartY.current = e.touches[0].clientY;
          } else {
            panelDragStartY.current = null;
          }
        }}
        onTouchEnd={(e) => {
          if (panelDragStartY.current === null) return;
          const dy = e.changedTouches[0].clientY - panelDragStartY.current;
          panelDragStartY.current = null;
          if (dy > 80) onClose();
        }}
      >
      {/* Mobile swipe-down handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-0 flex-shrink-0">
        <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
      </div>
      {isOverdue && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2 text-red-700 text-sm font-semibold" data-testid="overdue-banner">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{tD.overdueMsg(minutesPastStart)}</span>
        </div>
      )}
      <div className="p-4 flex items-center justify-between gap-2" style={{ borderBottom: "1px solid #2b2b2f" }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ backgroundColor: "#2e2e30", color: "#e5e5e7" }}>
            {((appointment as any).customer?.fullName || appointment.customer?.name || (appointment as any).customerName || (appointment as any).clientName || "").charAt(0).toUpperCase() || "W"}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[15px] leading-tight truncate" style={{ color: "#f5f5f7" }} data-testid="text-detail-customer">
              {(appointment as any).customer?.fullName || appointment.customer?.name || (appointment as any).customerName || (appointment as any).clientName || tD.walkIn}
            </p>
            {appointment.customer?.phone && (
              <p className="text-xs mt-0.5" style={{ color: "#8e8e93" }}>{formatPhone(appointment.customer.phone)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border"
            style={
              appointment.status === "started" ? { background: "rgba(52,211,153,0.12)", color: "#34d399", borderColor: "rgba(52,211,153,0.3)" }
              : appointment.status === "completed" ? { background: "rgba(148,163,184,0.14)", color: "#cbd5e1", borderColor: "rgba(148,163,184,0.3)" }
              : appointment.status === "cancelled" || appointment.status === "no_show" ? { background: "rgba(251,113,133,0.12)", color: "#fb7185", borderColor: "rgba(251,113,133,0.3)" }
              : { background: "rgba(96,165,250,0.12)", color: "#60a5fa", borderColor: "rgba(96,165,250,0.3)" }
            }
            data-testid="badge-detail-status"
          >
            {statusLabel}
          </span>
          <button onClick={onClose} className="ml-1" style={{ color: "#8e8e93" }} data-testid="button-close-details">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div ref={panelScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-bold" style={{ color: "#f5f5f7" }} data-testid="text-detail-date">{dateStr}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Clock className="w-3.5 h-3.5" style={{ color: "#8e8e93" }} />
              <span className="text-sm font-semibold" style={{ color: "#e5e5e7" }} data-testid="text-detail-time">{timeStr}</span>
            </div>
          </div>
          <div className="flex-shrink-0 rounded-lg px-2.5 py-1" style={{ backgroundColor: "#2a2a2c", border: "1px solid #3a3a3c" }}>
            <span className="text-sm font-semibold" style={{ color: "#e5e5e7" }}>{appointment.duration}m</span>
          </div>
        </div>

        <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: "#2a2a2c" }}>
          <div className="h-full rounded-full" style={{ width: "100%", backgroundColor: progressColor }} />
        </div>

        <div className="rounded-xl p-3.5 space-y-2.5" style={{ backgroundColor: "#232325", border: "1px solid #333338" }}>
          {appointment.staff && (
            <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ backgroundColor: "#2e2e30", color: "#a1a1a6" }} data-testid="badge-detail-staff">
              {appointment.staff.name}
            </span>
          )}

          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm leading-snug" style={{ color: "#f5f5f7" }} data-testid="text-detail-service">{appointment.service?.name || tD.service}</h4>
              <span className="text-xs" style={{ color: "#8e8e93" }}>({appointment.service?.duration || appointment.duration}m)</span>
            </div>
            {showPrices && (
              <span className="text-sm font-semibold flex-shrink-0" style={{ color: "#e5e5e7" }} data-testid="text-detail-price">
                ${appointment.service?.price ? Number(appointment.service.price).toFixed(2) : "0.00"}
              </span>
            )}
          </div>

          {aptAddons.length > 0 && (
            <div className="space-y-1.5 pl-3" style={{ borderLeft: "2px solid #3a3a3c" }} data-testid="detail-addons-list">
              {aptAddons.map((addon: any) => (
                <div key={addon.id} className="flex items-center justify-between gap-2" data-testid={`detail-addon-${addon.id}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-medium truncate" style={{ color: "#e5e5e7" }}>+ {addon.name}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: "#8e8e93" }}>({addon.duration}m)</span>
                  </div>
                  {showPrices && <span className="text-sm font-semibold" style={{ color: "#e5e5e7" }}>${Number(addon.price).toFixed(2)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {availableTimeData && (
          <AvailableTimeBanner availableMinutes={availableTimeData.availableMinutes} />
        )}

        {appointment.notes && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">{appointment.notes}</p>
          </div>
        )}

        {/* ── Client Intelligence strip ── */}
        {intel && appointment.customerId && (
          <div className="pt-2 border-t space-y-2">
            {/* No-show / churn risk */}
            {(intel.noShowRisk === "high" || intel.churnRisk === "high" || intel.churnRisk === "critical") && (
              <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
                intel.churnRisk === "critical" || intel.noShowRisk === "high"
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}>
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  {intel.churnRisk === "critical"
                    ? tD.atRisk
                    : intel.noShowRisk === "high"
                    ? tD.highNoShow
                    : tD.drifting}
                </span>
              </div>
            )}

            {/* LTV + visit cadence */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {intel.lifetimeValue > 0 && (
                <span className="flex items-center gap-1">
                  <span className="font-medium text-foreground">${Math.round(intel.lifetimeValue).toLocaleString()}</span>
                  {tD.ltv}
                </span>
              )}
              {intel.avgVisitCadenceDays > 0 && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="flex items-center gap-1">
                    {tD.every} <span className="font-medium text-foreground">{intel.avgVisitCadenceDays}d</span>
                  </span>
                </>
              )}
              {intel.totalVisits > 0 && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span><span className="font-medium text-foreground">{intel.totalVisits}</span> {tD.visits}</span>
                </>
              )}
              {/* Predicted next visit */}
              {intel.avgVisitCadenceDays > 0 && intel.lastVisitDate && (() => {
                const last = new Date(intel.lastVisitDate);
                const predicted = new Date(last.getTime() + intel.avgVisitCadenceDays * 24 * 60 * 60 * 1000);
                const daysUntil = Math.round((predicted.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                if (daysUntil < -14 || daysUntil > 60) return null;
                const label = daysUntil < 0 ? tD.daysOverdue(daysUntil) : daysUntil === 0 ? tD.dueToday : tD.dueIn(daysUntil);
                return (
                  <>
                    <span className="text-muted-foreground/30">·</span>
                    <span className={`flex items-center gap-1 ${daysUntil < 0 ? "text-amber-600 font-medium" : ""}`}>
                      <CalendarDays className="h-3 w-3" />
                      {label}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Fill Slot — shown for cancelled appointments ── */}
        {appointment.status === "cancelled" && detailStore?.id && (
          <FillSlotSection appointment={appointment} storeId={detailStore.id} />
        )}
      </div>

      <div
        className="p-4 space-y-2.5 md:pb-4"
        style={{ borderTop: "1px solid #2b2b2f", backgroundColor: "#202022", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
      >
        {showPrices && (
          <div className="flex items-center justify-between pb-1">
            <span className="font-semibold" style={{ color: "#8e8e93" }}>{tD.total}</span>
            <span className="font-bold text-lg" style={{ color: "#f5f5f7" }} data-testid="text-detail-total">
              ${grandTotal.toFixed(2)}
            </span>
          </div>
        )}


        {/* Review Request — shown for completed appointments with a phone number */}
        {appointment.status === "completed" && appointment.customer?.phone && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className={`flex-1 gap-2 h-10 rounded-lg font-semibold border border-[#3a3a3c] bg-[#2a2a2c] hover:bg-[#333338] ${reviewSent ? "text-emerald-400" : "text-[#e5e5e7]"}`}
              onClick={handleSendReview}
              disabled={reviewSending || reviewSent}
              data-testid="button-send-review-request"
            >
              <Star className="h-4 w-4" />
              {reviewSent ? tD.reviewSent : reviewSending ? tD.reviewSending : tD.requestReview}
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2 h-10 rounded-lg font-semibold border border-[#3a3a3c] bg-[#2a2a2c] text-[#e5e5e7] hover:bg-[#333338]"
              onClick={() => {
                const params = new URLSearchParams();
                if (appointment.customerId) params.set("customerId", String(appointment.customerId));
                if (appointment.staffId) params.set("staffId", String(appointment.staffId));
                if (appointment.serviceId) params.set("serviceId", String(appointment.serviceId));
                window.location.href = `/booking/new?${params.toString()}`;
              }}
            >
              <CalendarPlus className="h-4 w-4" />
              {tD.rebook}
            </Button>
          </div>
        )}

        {appointment.status !== "cancelled" && appointment.status !== "completed" && (
          <>
            <div className="flex gap-2">
              {!isPastOneHour && (
                <Button
                  variant="outline"
                  className="flex-1 h-10 rounded-lg font-semibold border border-[#3a3a3c] bg-[#2a2a2c] text-[#e5e5e7] hover:bg-[#333338]"
                  onClick={onEdit}
                  data-testid="button-edit-appointment"
                >
                  {tD.edit}
                </Button>
              )}
              <Button
                variant="outline"
                className="flex-1 h-10 rounded-lg font-semibold border border-[#3a3a3c] bg-transparent text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                onClick={onCancel}
                disabled={isUpdating}
                data-testid="button-cancel-appointment"
              >
                {isUpdating ? tD.updating : tD.cancelAppt}
              </Button>
            </div>

            <Button
              variant="outline"
              className="w-full h-10 rounded-lg font-semibold border border-[#3a3a3c] bg-[#2a2a2c] text-[#e5e5e7] hover:bg-[#333338]"
              onClick={onReschedule}
              disabled={isUpdating}
              data-testid="button-reschedule-appointment"
            >
              {tD.reschedule}
            </Button>

            {appointment.status === "started" ? (
              posEnabled ? (
                <Button
                  className="w-full h-12 rounded-lg font-semibold bg-[#16a34a] hover:bg-[#15a34a] text-white"
                  onClick={onCheckout}
                  disabled={isUpdating}
                  data-testid="button-checkout"
                >
                  <span className="flex flex-col items-center leading-tight">
                    <span className="font-semibold">{tD.checkout}</span>
                    <span className="text-[10px] opacity-80">{tD.finishAppt}</span>
                  </span>
                </Button>
              ) : (
                <Button
                  className="w-full h-12 rounded-lg font-semibold bg-[#16a34a] hover:bg-[#15a34a] text-white"
                  onClick={onComplete}
                  disabled={isUpdating}
                  data-testid="button-complete"
                >
                  <span className="flex flex-col items-center leading-tight">
                    <span className="font-semibold">{tD.complete}</span>
                    <span className="text-[10px] opacity-80">{tD.markDone}</span>
                  </span>
                </Button>
              )
            ) : isPastOneHour && (appointment.status === "pending" || appointment.status === "confirmed") ? (
              <Button
                variant="outline"
                className="w-full h-12 rounded-lg font-semibold border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                onClick={onMarkNoShow}
                disabled={isUpdating}
                data-testid="button-mark-no-show"
              >
                <span className="flex flex-col items-center leading-tight">
                  <span className="font-semibold">{tD.markNoShow}</span>
                  <span className="text-[10px] opacity-80">{tD.markNoShowSub}</span>
                </span>
              </Button>
            ) : isAppointmentToday ? (
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-blue-600 text-white h-12"
                  onClick={onStart}
                  disabled={isUpdating}
                  data-testid="button-start-service"
                >
                  <span className="flex flex-col items-center leading-tight">
                    <span className="font-semibold">{tD.start}</span>
                    <span className="text-[10px] opacity-80">{tD.beginService}</span>
                  </span>
                </Button>
                {isOverdue && (
                  <Button
                    variant="outline"
                    className="flex-1 h-12 rounded-lg font-semibold border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                    onClick={onMarkNoShow}
                    disabled={isUpdating}
                    data-testid="button-mark-no-show"
                  >
                    <span className="flex flex-col items-center leading-tight">
                      <span className="font-semibold">{tD.markNoShow}</span>
                      <span className="text-[10px] opacity-80">{tD.markNoShowSub}</span>
                    </span>
                  </Button>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
      </div>
    </div>
  );
}

const CANCEL_REASONS = [
  "Client Canceled",
  "Duplicated Booking",
  "No Show",
  "Other",
];

function CancelAppointmentPanel({
  appointment,
  timezone,
  onClose,
  onConfirmCancel,
  isUpdating,
}: {
  appointment: AppointmentWithDetails;
  timezone: string;
  onClose: () => void;
  onConfirmCancel: (reason: string) => void;
  isUpdating: boolean;
}) {
  const { pick } = useLanguage();
  const cancelReasonLabels: Record<string, string> = {
    "Client Canceled":    pick({ en: "Client Canceled",    vi: "Khách hủy",     es: "Cancelado por cliente",  fr: "Annulé par le client" }),
    "Duplicated Booking": pick({ en: "Duplicated Booking", vi: "Đặt trùng",     es: "Reserva duplicada",      fr: "Réservation en double" }),
    "No Show":            pick({ en: "No Show",            vi: "Vắng mặt",      es: "No asistió",             fr: "Absent" }),
    "Other":              pick({ en: "Other",              vi: "Lý do khác",    es: "Otro",                   fr: "Autre" }),
  };
  const tCA = {
    header:      pick({ en: "Cancel Appointment",                  vi: "Hủy lịch hẹn",                     es: "Cancelar cita",                      fr: "Annuler le rendez-vous" }),
    willCancel:  pick({ en: "Following services will be cancelled:", vi: "Các dịch vụ sau sẽ bị hủy:",      es: "Los siguientes servicios se cancelarán:", fr: "Les services suivants seront annulés:" }),
    service:     pick({ en: "Service",                             vi: "Dịch vụ",                           es: "Servicio",                           fr: "Service" }),
    reason:      pick({ en: "Cancellation Reason",                 vi: "Lý do hủy",                         es: "Motivo de cancelación",              fr: "Motif d'annulation" }),
    cancelling:  pick({ en: "Cancelling...",                       vi: "Đang hủy...",                        es: "Cancelando...",                      fr: "Annulation..." }),
    cancelBtn:   pick({ en: "Cancel Appointment",                  vi: "Hủy lịch hẹn",                      es: "Cancelar cita",                      fr: "Annuler le rendez-vous" }),
  };
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  const endTime = addMinutes(new Date(appointment.date), appointment.duration);
  const dateStr = formatInTz(appointment.date, timezone, "MM/dd/yyyy, h:mm a");
  const grandTotal = Number(appointment.service?.price || 0) +
    (appointment.appointmentAddons?.reduce((sum, aa) => sum + Number(aa.addon?.price || 0), 0) || 0);

  return (
    <div className="fixed inset-0 z-50" data-testid="cancel-appointment-panel">
      <button
        type="button"
        aria-label="Close cancel appointment"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[380px] flex flex-col shadow-[-8px_0_24px_rgba(0,0,0,0.4)]" style={{ backgroundColor: "#1a1a1c", borderLeft: "1px solid #333338" }}>
      <div className="p-4 flex items-center justify-between gap-2" style={{ borderBottom: "1px solid #2b2b2f" }}>
        <h2 className="font-bold text-[15px]" style={{ color: "#f5f5f7" }}>{tCA.header}</h2>
        <button onClick={onClose} style={{ color: "#8e8e93" }} data-testid="button-close-cancel">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <p className="text-sm mb-3" style={{ color: "#8e8e93" }}>{tCA.willCancel}</p>
          <div className="rounded-xl p-3.5 space-y-1.5" style={{ backgroundColor: "#232325", border: "1px solid #333338" }}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-sm" style={{ color: "#f5f5f7" }}>{appointment.service?.name || tCA.service}</span>
                {appointment.staff && (
                  <span className="text-sm" style={{ color: "#8e8e93" }}> · {appointment.staff.name}</span>
                )}
              </div>
              <span className="font-semibold text-sm" style={{ color: "#e5e5e7" }} data-testid="cancel-service-price">
                ${Number(appointment.service?.price || 0).toFixed(2)}
              </span>
            </div>
            <p className="text-xs" style={{ color: "#8e8e93" }} data-testid="cancel-service-date">{dateStr}</p>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "#8e8e93" }}>{tCA.reason}</h3>
          <div className="grid grid-cols-2 gap-2">
            {CANCEL_REASONS.map((reason) => {
              const active = selectedReason === reason;
              return (
                <button
                  key={reason}
                  className="h-auto py-3 px-2 text-sm rounded-lg border font-medium transition-colors"
                  style={active
                    ? { backgroundColor: "rgba(45,212,191,0.12)", borderColor: "rgba(45,212,191,0.4)", color: "#2dd4bf" }
                    : { backgroundColor: "#2a2a2c", borderColor: "#3a3a3c", color: "#e5e5e7" }}
                  onClick={() => setSelectedReason(reason)}
                  data-testid={`cancel-reason-${reason.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                >
                  {cancelReasonLabels[reason] ?? reason}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-4" style={{ borderTop: "1px solid #2b2b2f", backgroundColor: "#202022" }}>
        <button
          className="w-full h-12 rounded-lg font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#e11d48" }}
          onClick={() => selectedReason && onConfirmCancel(selectedReason)}
          disabled={!selectedReason || isUpdating}
          data-testid="button-confirm-cancel"
        >
          {isUpdating ? tCA.cancelling : tCA.cancelBtn}
        </button>
      </div>
      </div>
    </div>
  );
}

const TAX_RATE = 0.07;

const PAYMENT_METHODS = [
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "m2", label: "M2 Reader", icon: CreditCard },
] as const;

function loadStripeTerminalSDK(): Promise<any> {
  if ((window as any).StripeTerminal) return Promise.resolve((window as any).StripeTerminal);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/terminal/v1/";
    script.onload = () => resolve((window as any).StripeTerminal);
    script.onerror = () => reject(new Error("Failed to load Stripe Terminal SDK"));
    document.head.appendChild(script);
  });
}

const TIP_PRESETS = [
  { label: "No Tip", value: 0 },
  { label: "15%", percent: 0.15 },
  { label: "18%", percent: 0.18 },
  { label: "20%", percent: 0.20 },
  { label: "25%", percent: 0.25 },
];

type TenderLine = {
  id: number;
  method: string;
  amount: number;
};

interface GroupTicketShare {
  appointmentId: number;
  tip: number;
  discount: number;
  totalPaid: number;
  paymentMethod: string;
}
function CheckoutPOSPanel({
  appointment,
  timezone,
  onClose,
  onFinalize,
  isUpdating,
  siblingAppointments = [],
  onCustomerLinked,
}: {
  appointment: AppointmentWithDetails;
  timezone: string;
  onClose: () => void;
  onFinalize: (data: { paymentMethod: string; tip: number; discount: number; totalPaid: number; groupTickets?: GroupTicketShare[]; redemption?: { rewardId: number; customerId: number } }) => void;
  isUpdating: boolean;
  siblingAppointments?: AppointmentWithDetails[];
  onCustomerLinked?: (clientId: number, name: string, loyaltyPoints: number) => void;
}) {
  const { pick } = useLanguage();
  const tPOS = {
    checkoutHdr:     pick({ en: "Checkout",              vi: "Thanh toán",               es: "Pagar",                    fr: "Encaisser" }),
    walkIn:          pick({ en: "Walk-In",               vi: "Khách vãng lai",            es: "Sin cita",                 fr: "Sans rendez-vous" }),
    lineItems:       pick({ en: "Line Items",            vi: "Danh sách dịch vụ",         es: "Artículos",                fr: "Lignes" }),
    discount:        pick({ en: "Discount",              vi: "Giảm giá",                  es: "Descuento",                fr: "Remise" }),
    tip:             pick({ en: "Tip",                   vi: "Tiền tip",                  es: "Propina",                  fr: "Pourboire" }),
    custom:          pick({ en: "Custom:",               vi: "Tùy chỉnh:",                es: "Personalizado:",           fr: "Personnalisé:" }),
    subtotal:        pick({ en: "Subtotal",              vi: "Tạm tính",                  es: "Subtotal",                 fr: "Sous-total" }),
    tax:             pick({ en: "Tax",                   vi: "Thuế",                      es: "Impuesto",                 fr: "Taxe" }),
    total:           pick({ en: "Total",                 vi: "Tổng cộng",                 es: "Total",                    fr: "Total" }),
    finalizePay:     pick({ en: "Finalize & Pay",        vi: "Xác nhận & Thanh toán",     es: "Finalizar y pagar",        fr: "Finaliser et payer" }),
    backToAppt:      pick({ en: "Back to Appointment",  vi: "Quay lại lịch hẹn",          es: "Volver a la cita",         fr: "Retour au rendez-vous" }),
    paymentHdr:      pick({ en: "Payment",              vi: "Thanh toán",                  es: "Pago",                     fr: "Paiement" }),
    paymentsApplied: pick({ en: "Payments Applied",     vi: "Đã thanh toán",               es: "Pagos aplicados",          fr: "Paiements appliqués" }),
    balanceDue:      pick({ en: "Balance Due",          vi: "Còn lại",                     es: "Saldo pendiente",          fr: "Solde dû" }),
    paidInFull:      pick({ en: "Paid in Full",         vi: "Đã thanh toán đủ",            es: "Pagado en su totalidad",   fr: "Payé en totalité" }),
    changeDue:       pick({ en: "Change Due",           vi: "Tiền thối",                   es: "Cambio",                   fr: "Rendu monnaie" }),
    exact:           pick({ en: "EXACT",                vi: "ĐÚNG",                        es: "EXACTO",                   fr: "EXACT" }),
    payComplete:     pick({ en: "Payment Complete",     vi: "Thanh toán xong",             es: "Pago completado",          fr: "Paiement effectué" }),
    totalLabel:      pick({ en: "Total:",               vi: "Tổng:",                       es: "Total:",                   fr: "Total:" }),
    changeDueLabel:  pick({ en: "Change Due:",          vi: "Tiền thối:",                  es: "Cambio:",                  fr: "Rendu:" }),
    printReceipt:    pick({ en: "Print Receipt",        vi: "In hóa đơn",                  es: "Imprimir recibo",          fr: "Imprimer le reçu" }),
    noReceipt:       pick({ en: "No Receipt",           vi: "Không in",                    es: "Sin recibo",               fr: "Sans reçu" }),
    processing:      pick({ en: "Processing...",        vi: "Đang xử lý...",               es: "Procesando...",            fr: "Traitement..." }),
    retailItem:      pick({ en: "Retail Item",          vi: "Hàng bán lẻ",                 es: "Producto",                 fr: "Article boutique" }),
  };
  // POS status-bar messages (shown UPPERCASE in the sheet header). Kept in a
  // sub-object so every transient string the cashier sees is translated too.
  const tSt = {
    addClientFirst:   pick({ en: "ADD A CLIENT TO THE TICKET FIRST",   vi: "THÊM KHÁCH VÀO VÉ TRƯỚC",              es: "AÑADE UN CLIENTE AL TICKET PRIMERO",     fr: "AJOUTEZ D'ABORD UN CLIENT AU TICKET" }),
    enterAmountFirst: pick({ en: "ENTER AN AMOUNT FIRST",              vi: "NHẬP SỐ TIỀN TRƯỚC",                   es: "INTRODUCE UN IMPORTE PRIMERO",           fr: "SAISISSEZ D'ABORD UN MONTANT" }),
    mustEnterAmount:  pick({ en: "MUST ENTER AMOUNT FIRST",            vi: "PHẢI NHẬP SỐ TIỀN TRƯỚC",              es: "DEBES INTRODUCIR UN IMPORTE PRIMERO",    fr: "VOUS DEVEZ D'ABORD SAISIR UN MONTANT" }),
    m2Insert:         pick({ en: "M2 READER — INSERT / TAP CARD",      vi: "ĐẦU ĐỌC M2 — QUẸT / CHẠM THẺ",         es: "LECTOR M2 — INSERTA / ACERCA LA TARJETA", fr: "LECTEUR M2 — INSÉREZ / APPROCHEZ LA CARTE" }),
    noAddons:         pick({ en: "NO ADD-ONS IN CATALOGUE",            vi: "KHÔNG CÓ DỊCH VỤ THÊM",                es: "NO HAY EXTRAS EN EL CATÁLOGO",           fr: "AUCUN SUPPLÉMENT AU CATALOGUE" }),
    noOtherTickets:   pick({ en: "NO OTHER ACTIVE TICKETS",            vi: "KHÔNG CÓ VÉ NÀO KHÁC ĐANG MỞ",         es: "NO HAY OTROS TICKETS ACTIVOS",           fr: "AUCUN AUTRE TICKET ACTIF" }),
    noSaleDrawer:     pick({ en: "NO SALE — DRAWER OPENED",            vi: "KHÔNG BÁN — ĐÃ MỞ NGĂN KÉO",           es: "SIN VENTA — CAJÓN ABIERTO",              fr: "PAS DE VENTE — TIROIR OUVERT" }),
    nothingDue:       pick({ en: "NOTHING DUE",                        vi: "KHÔNG CÒN NỢ",                        es: "NADA PENDIENTE",                        fr: "RIEN À PAYER" }),
    nothingToUndo:    pick({ en: "NOTHING TO UNDO",                    vi: "KHÔNG CÓ GÌ ĐỂ HOÀN TÁC",             es: "NADA QUE DESHACER",                     fr: "RIEN À ANNULER" }),
    quickCancelled:   pick({ en: "QUICK TICKET CANCELLED",             vi: "ĐÃ HỦY VÉ NHANH",                     es: "TICKET RÁPIDO CANCELADO",               fr: "TICKET RAPIDE ANNULÉ" }),
    quickDone:        pick({ en: "QUICK TICKET DONE — REVIEW & CHARGE", vi: "XONG VÉ NHANH — KIỂM TRA & THU TIỀN", es: "TICKET RÁPIDO LISTO — REVISA Y COBRA",  fr: "TICKET RAPIDE TERMINÉ — VÉRIFIEZ ET ENCAISSEZ" }),
    quickExited:      pick({ en: "QUICK TICKET EXITED",                vi: "ĐÃ THOÁT VÉ NHANH",                   es: "SALISTE DEL TICKET RÁPIDO",             fr: "TICKET RAPIDE QUITTÉ" }),
    rewardRemoved:    pick({ en: "REWARD REMOVED",                     vi: "ĐÃ BỎ ƯU ĐÃI",                        es: "RECOMPENSA ELIMINADA",                  fr: "RÉCOMPENSE RETIRÉE" }),
    tapCancelled:     pick({ en: "TAP TO PAY CANCELLED",               vi: "ĐÃ HỦY TAP TO PAY",                   es: "TAP TO PAY CANCELADO",                  fr: "TAP TO PAY ANNULÉ" }),
    tapSentScreen:    pick({ en: "TAP TO PAY SENT TO CUSTOMER SCREEN", vi: "ĐÃ GỬI TAP TO PAY LÊN MÀN HÌNH KHÁCH", es: "TAP TO PAY ENVIADO A LA PANTALLA DEL CLIENTE", fr: "TAP TO PAY ENVOYÉ À L'ÉCRAN CLIENT" }),
    tapPrompt:        pick({ en: "TAP TO PAY — CUSTOMER TAP CARD / PHONE", vi: "TAP TO PAY — KHÁCH CHẠM THẺ / ĐIỆN THOẠI", es: "TAP TO PAY — EL CLIENTE ACERCA TARJETA / TELÉFONO", fr: "TAP TO PAY — LE CLIENT APPROCHE CARTE / TÉLÉPHONE" }),
    ticketComped:     pick({ en: "TICKET COMPED — 100% OFF",           vi: "MIỄN PHÍ VÉ — GIẢM 100%",             es: "TICKET GRATIS — 100% DE DESCUENTO",     fr: "TICKET OFFERT — 100% DE REMISE" }),
    tipScreenSent:    pick({ en: "TIP SCREEN SENT TO CLIENT",          vi: "ĐÃ GỬI MÀN HÌNH TIP CHO KHÁCH",        es: "PANTALLA DE PROPINA ENVIADA AL CLIENTE", fr: "ÉCRAN DE POURBOIRE ENVOYÉ AU CLIENT" }),
    cardDeclined:     pick({ en: "CARD PAYMENT DECLINED",              vi: "THẺ BỊ TỪ CHỐI",                      es: "PAGO CON TARJETA RECHAZADO",            fr: "PAIEMENT PAR CARTE REFUSÉ" }),
    customerEnrolled: pick({ en: "CUSTOMER ENROLLED",                  vi: "ĐÃ ĐĂNG KÝ KHÁCH",                    es: "CLIENTE INSCRITO",                      fr: "CLIENT INSCRIT" }),
    // Dynamic — return the localised template string.
    cardApproved:  (amt: string) => pick({ en: `CARD APPROVED · $${amt}`,   vi: `ĐÃ DUYỆT THẺ · $${amt}`,     es: `TARJETA APROBADA · $${amt}`,   fr: `CARTE APPROUVÉE · $${amt}` }),
    customerLinked:(nm: string, isNew: boolean) => pick({
      en: `CUSTOMER ${isNew ? "ENROLLED" : "LINKED"} · ${nm}`,
      vi: `${isNew ? "ĐÃ ĐĂNG KÝ" : "ĐÃ LIÊN KẾT"} KHÁCH · ${nm}`,
      es: `CLIENTE ${isNew ? "INSCRITO" : "VINCULADO"} · ${nm}`,
      fr: `CLIENT ${isNew ? "INSCRIT" : "LIÉ"} · ${nm}` }),
    pctDiscount:   (pct: string | number) => pick({ en: `${pct}% DISCOUNT APPLIED`, vi: `ĐÃ GIẢM ${pct}%`, es: `${pct}% DE DESCUENTO APLICADO`, fr: `REMISE DE ${pct}% APPLIQUÉE` }),
    amtDiscount:   (amt: string) => pick({ en: `$${amt} DISCOUNT APPLIED`, vi: `ĐÃ GIẢM $${amt}`, es: `DESCUENTO DE $${amt} APLICADO`, fr: `REMISE DE $${amt} APPLIQUÉE` }),
    itemAdded:     (name: string, amt: string) => pick({ en: `${name} ADDED · $${amt}`, vi: `ĐÃ THÊM ${name} · $${amt}`, es: `${name} AÑADIDO · $${amt}`, fr: `${name} AJOUTÉ · $${amt}` }),
    retailAdded:   (amt: string) => pick({ en: `RETAIL ADDED · $${amt}`, vi: `ĐÃ THÊM HÀNG BÁN LẺ · $${amt}`, es: `PRODUCTO AÑADIDO · $${amt}`, fr: `PRODUIT AJOUTÉ · $${amt}` }),
    extraAdded:    (kind: "addon" | "extra", amt: string) => pick({
      en: `${kind === "addon" ? "ADDON" : "EXTRA"} ADDED · $${amt}`,
      vi: `ĐÃ THÊM ${kind === "addon" ? "DỊCH VỤ THÊM" : "PHỤ PHÍ"} · $${amt}`,
      es: `${kind === "addon" ? "EXTRA" : "CARGO"} AÑADIDO · $${amt}`,
      fr: `${kind === "addon" ? "SUPPLÉMENT" : "FRAIS"} AJOUTÉ · $${amt}` }),
    enterAmountFor:(label: string) => pick({ en: `ENTER AMOUNT FOR ${label}`, vi: `NHẬP SỐ TIỀN CHO ${label}`, es: `INTRODUCE EL IMPORTE PARA ${label}`, fr: `SAISISSEZ LE MONTANT POUR ${label}` }),
    rewardApplied: (amt: string) => pick({ en: `REWARD APPLIED · $${amt} OFF`, vi: `ĐÃ ÁP DỤNG ƯU ĐÃI · GIẢM $${amt}`, es: `RECOMPENSA APLICADA · $${amt} DE DESCUENTO`, fr: `RÉCOMPENSE APPLIQUÉE · $${amt} DE REMISE` }),
    rewardRedeemed:(name: string) => pick({ en: `REWARD REDEEMED · ${name}`, vi: `ĐÃ ĐỔI ƯU ĐÃI · ${name}`, es: `RECOMPENSA CANJEADA · ${name}`, fr: `RÉCOMPENSE ÉCHANGÉE · ${name}` }),
    tipSet:        (amt: string) => pick({ en: `TIP SET · $${amt}`, vi: `ĐÃ ĐẶT TIP · $${amt}`, es: `PROPINA FIJADA · $${amt}`, fr: `POURBOIRE DÉFINI · $${amt}` }),
    undid:         (name: string) => pick({ en: `UNDID · ${name}`, vi: `ĐÃ HOÀN TÁC · ${name}`, es: `DESHECHO · ${name}`, fr: `ANNULÉ · ${name}` }),
    comingSoon:    (label: string) => pick({ en: `${label} — COMING SOON`, vi: `${label} — SẮP RA MẮT`, es: `${label} — PRÓXIMAMENTE`, fr: `${label} — BIENTÔT DISPONIBLE` }),
    readerFailed:      pick({ en: "Reader connection failed",  vi: "Kết nối đầu đọc thất bại",   es: "Falló la conexión del lector", fr: "Échec de connexion du lecteur" }),
    cardFailed:        pick({ en: "Card payment failed",       vi: "Thanh toán thẻ thất bại",    es: "El pago con tarjeta falló",    fr: "Échec du paiement par carte" }),
    paymentApproved:   pick({ en: "Payment approved",          vi: "Đã duyệt thanh toán",        es: "Pago aprobado",                fr: "Paiement approuvé" }),
    paymentApprovedDesc: (brand: string, last4: string, amt: string) => pick({
      en: `${brand} ···${last4} charged ${amt}`,
      vi: `${brand} ···${last4} đã tính ${amt}`,
      es: `${brand} ···${last4} cobrado ${amt}`,
      fr: `${brand} ···${last4} débité de ${amt}` }),
    popupBlocked:      pick({ en: "Pop-up blocked",            vi: "Cửa sổ bật lên bị chặn",     es: "Ventana emergente bloqueada",  fr: "Fenêtre pop-up bloquée" }),
    popupBlockedDesc:  pick({ en: "Allow pop-ups for this site to print receipts.", vi: "Cho phép cửa sổ bật lên trên trang này để in hóa đơn.", es: "Permite las ventanas emergentes de este sitio para imprimir recibos.", fr: "Autorisez les pop-ups sur ce site pour imprimer les reçus." }),
    noTipSelected:     pick({ en: "No tip selected by client", vi: "Khách chưa chọn tiền tip",    es: "El cliente no eligió propina", fr: "Le client n'a pas choisi de pourboire" }),
    m2Connected:      pick({ en: "M2 reader connected",      vi: "Đã kết nối đầu đọc M2",       es: "Lector M2 conectado",          fr: "Lecteur M2 connecté" }),
    m2ConnectedDesc:  (name: string) => pick({ en: `${name} is ready.`, vi: `${name} đã sẵn sàng.`, es: `${name} está listo.`, fr: `${name} est prêt.` }),
    // Quick Ticket wizard — header hint + ENTER hint (label/prompt come in already localised)
    qtStep:        (prompt: string, i: number, n: number) => pick({
      en: `${prompt} · ${i}/${n}`, vi: `${prompt} · ${i}/${n}`, es: `${prompt} · ${i}/${n}`, fr: `${prompt} · ${i}/${n}` }),
    qtEnterAdd:    (amt: string, label: string) => pick({
      en: `ENTER — add $${amt} to ${label}`, vi: `ENTER — thêm $${amt} vào ${label}`,
      es: `ENTER — añadir $${amt} a ${label}`, fr: `ENTER — ajouter $${amt} à ${label}` }),
    qtEnterSkip:   (label: string) => pick({
      en: `ENTER — skip ${label}`, vi: `ENTER — bỏ qua ${label}`,
      es: `ENTER — omitir ${label}`, fr: `ENTER — passer ${label}` }),
    qtHeaderHint:  (prompt: string, amt: number, i: number, n: number) => pick({
      en: `${prompt} — ENTER ${amt > 0 ? `TO ADD $${amt.toFixed(2)}` : "TO SKIP"} · ${i}/${n}`,
      vi: `${prompt} — ENTER ${amt > 0 ? `ĐỂ THÊM $${amt.toFixed(2)}` : "ĐỂ BỎ QUA"} · ${i}/${n}`,
      es: `${prompt} — ENTER ${amt > 0 ? `PARA AÑADIR $${amt.toFixed(2)}` : "PARA OMITIR"} · ${i}/${n}`,
      fr: `${prompt} — ENTER ${amt > 0 ? `POUR AJOUTER $${amt.toFixed(2)}` : "POUR PASSER"} · ${i}/${n}` }),
    qtClearExit:   pick({ en: "Clear & exit Quick Ticket", vi: "Xóa & thoát Vé nhanh", es: "Borrar y salir del Ticket rápido", fr: "Effacer et quitter le Ticket rapide" }),
    qtErrorCorrect: pick({ en: "Error Correct — undo the last line added", vi: "Sửa lỗi — hoàn tác dòng vừa thêm", es: "Corregir — deshacer la última línea", fr: "Corriger — annuler la dernière ligne" }),
  };
  // Localise a POS function-button caption by its stable id (falls back to the
  // raw English label from the layout config for dynamic add-on cells).
  const posT = (id: string | undefined, raw: string) => {
    const m = id ? POS_BUTTON_TX[id] : undefined;
    return m ? pick(m) : raw;
  };
  // Localise a Quick Ticket guided step (keyed by its English label).
  const guidedT = (step: { label: string; prompt: string }) => {
    const m = POS_GUIDED_TX[step.label];
    return m ? { label: pick(m.label), prompt: pick(m.prompt) } : step;
  };
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const posQueryClient = useQueryClient();
  const storeId = selectedStore?.id ?? null;
  // POS layout for this store's business type (nail-salon config today).
  const posLayout = getPosLayout((selectedStore as any)?.category);
  const posTaxRate = posLayout.taxRate ?? TAX_RATE;

  // Single-line status shown in the POS sheet header — replaces all POS toasts.
  const [posStatus, setPosStatus] = useState<{ text: string; tone: "error" | "success" | "info" } | null>(null);
  const posStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPosStatus = (text: string, tone: "error" | "success" | "info" = "info") => {
    setPosStatus({ text, tone });
    if (posStatusTimer.current) clearTimeout(posStatusTimer.current);
    posStatusTimer.current = setTimeout(() => setPosStatus(null), tone === "error" ? 4000 : 2600);
  };
  useEffect(() => () => { if (posStatusTimer.current) clearTimeout(posStatusTimer.current); }, []);

  // Client-facing tip screen (dual-screen kiosk):
  //  • auto-request opens it ONCE when the cart opens
  //  • `tipCollected` blocks any further auto-request after the client submits
  //  • the "Tip Adjust" button clears the tip and re-requests it on demand
  const [tipCollected, setTipCollected] = useState(false);
  const tipAutoRequestedRef = useRef(false);
  const requestClientTipScreen = () => {
    setWaitingForTip(true);
    broadcastToKiosk("kiosk_checkout_tip_request", { total: Math.round(preTotal * 100) / 100, cardMethod });
  };
  const [phase, setPhase] = useState<"cart" | "payment">("cart");
  const [tipMode, setTipMode] = useState<"preset" | "custom">("preset");
  const [selectedTipIndex, setSelectedTipIndex] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [discountType, setDiscountType] = useState<"dollar" | "percent">("dollar");
  const [dualScreenEnabled, setDualScreenEnabled] = useState(false);
  const [waitingForTip, setWaitingForTip] = useState(false);

  // Per-device card-payment method (M2 reader vs Tap to Pay). Set from the POS
  // settings button, saved to this device's localStorage, and sent to the
  // customer display so the tip-page CONFIRM arms the right native bridge.
  const POS_CARD_METHOD_KEY = "certxa.pos.cardMethod";
  const [cardMethod, setCardMethod] = useState<"m2" | "tap">(() => {
    try {
      const v = localStorage.getItem(POS_CARD_METHOD_KEY);
      return v === "m2" || v === "tap" ? v : "tap";
    } catch { return "tap"; }
  });
  const updateCardMethod = (m: "m2" | "tap") => {
    setCardMethod(m);
    try { localStorage.setItem(POS_CARD_METHOD_KEY, m); } catch {}
  };
  const [showPosSettings, setShowPosSettings] = useState(false);

  // One-time Tap to Pay enrollment (native Android wrapper only). The native
  // side runs: location permission → Terminal location → discover+connect a
  // tapToPay reader (fires Stripe's ToS + device provisioning), then posts back.
  const [tapSetup, setTapSetup] = useState<{ state: "idle" | "running" | "ready" | "error"; msg: string }>({ state: "idle", msg: "" });
  useEffect(() => {
    const onReady = () => setTapSetup({ state: "ready", msg: "Tap to Pay is ready on this device." });
    const onErr = (e: Event) => setTapSetup({ state: "error", msg: String((e as CustomEvent).detail?.message || "Setup failed. Try again.") });
    window.addEventListener("certxa_native_taptopay_ready", onReady);
    window.addEventListener("certxa_native_taptopay_error", onErr);
    return () => {
      window.removeEventListener("certxa_native_taptopay_ready", onReady);
      window.removeEventListener("certxa_native_taptopay_error", onErr);
    };
  }, []);
  const startTapToPaySetup = () => {
    setTapSetup({ state: "running", msg: "Follow the prompts on this device…" });
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "SETUP_TAP_TO_PAY" }));
  };

  const [tenders, setTenders] = useState<TenderLine[]>([]);
  const [keypadDisplay, setKeypadDisplay] = useState("0");
  const [nextTenderId, setNextTenderId] = useState(1);
  const [showComplete, setShowComplete] = useState(false);

  // Ad-hoc ticket lines added from the POS function buttons (add-ons, retail,
  // custom charges). Folded into `subtotal` below and shown in the cart panel.
  const [posExtraItems, setPosExtraItems] = useState<{ id: number; name: string; price: number; kind: string }[]>([]);
  const posExtraNextId = useRef(1);
  const addPosExtraItem = (name: string, price: number, kind = "item") => {
    setPosExtraItems((prev) => [...prev, { id: posExtraNextId.current++, name, price: Math.max(0, price), kind }]);
  };
  const removePosExtraItem = (id: number) => setPosExtraItems((prev) => prev.filter((it) => it.id !== id));

  // ── Stripe Terminal M2 state ──────────────────────────────────────────────
  const [termStatus, setTermStatus] = useState<"idle"|"loading"|"discovering"|"connecting"|"ready"|"collecting"|"processing"|"error">("idle");
  const [termReader, setTermReader] = useState<any>(null);
  const [termError, setTermError] = useState("");
  // Native app: tracks whether the M2 overlay is active on the device side
  const [nativeM2Active, setNativeM2Active] = useState(false);
  // Dual-screen "Tap to Pay": waiting on the customer tablet to collect the card.
  // The ref mirrors the state AND holds the amount we asked the tablet to charge,
  // so the WS listener (a stable closure) can settle the tender without stale vars.
  const [awaitingTapPay, setAwaitingTapPay] = useState(false);
  const awaitingTapPayAmtRef = useRef(0);

  // Reset the native-payment busy state when the bridge reports an error,
  // cancel, or failure (covers both M2 Reader and Tap to Pay).
  useEffect(() => {
    if (!(window as any).CERTXA_NATIVE_APP) return;
    const handler = () => setNativeM2Active(false);
    window.addEventListener('certxa_native_m2_error', handler);
    window.addEventListener('certxa_native_payment_failed', handler);
    return () => {
      window.removeEventListener('certxa_native_m2_error', handler);
      window.removeEventListener('certxa_native_payment_failed', handler);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const termRef = useRef<any>(null);
  const aptAddons = appointment.appointmentAddons?.map(aa => aa.addon).filter(Boolean) || [];
  const servicePrice = Number(appointment.service?.price || 0);
  const addonTotal = aptAddons.reduce((sum, a) => sum + Number(a!.price), 0);
  const posExtraTotal = posExtraItems.reduce((sum, it) => sum + it.price, 0);

  // ── Group Pay — other active tickets folded into this one for a single payment.
  //    The linked appointments are NOT merged; on finalize each is completed and
  //    paid individually with its proportional share of tip/discount so every
  //    tech keeps their own commission and per-tech tip tracking.
  const [linkedIds, setLinkedIds] = useState<number[]>([]);
  const [showLinkPicker, setShowLinkPicker] = useState(false);

  // ── Loyalty reward redemption (points → $ off) ──────────────────────────
  const [showRewardPicker, setShowRewardPicker] = useState(false);
  const [pendingRedemption, setPendingRedemption] = useState<
    null | { rewardId: number; name: string; pointsCost: number; dollarValue: number }
  >(null);
  const redemptionDiscount = pendingRedemption?.dollarValue ?? 0;

  // A customer linked from the front-desk display (phone check-in on a walk-in
  // ticket). Overrides the stale `appointment` prop so the sheet shows their
  // name / points immediately, without waiting for a query refetch to reach
  // `selectedAppointment`.
  const [linkedCustomer, setLinkedCustomer] = useState<
    null | { id: number; name: string; loyaltyPoints: number }
  >(null);
  // Inline callback from the parent — kept in a ref so the polling/WS effects
  // don't restart on every parent re-render.
  const onCustomerLinkedRef = useRef(onCustomerLinked);
  useEffect(() => { onCustomerLinkedRef.current = onCustomerLinked; }, [onCustomerLinked]);
  // Current appointment id in a ref — the WS listener effect only re-subscribes
  // on [storeId, dualScreenEnabled], so reading `appointment.id` directly inside
  // it is a stale closure when the panel is reused for a different ticket.
  const apptIdRef = useRef<number | undefined>(appointment?.id);
  useEffect(() => { apptIdRef.current = appointment?.id; }, [appointment?.id]);
  const customerLoyaltyPoints = linkedCustomer
    ? linkedCustomer.loyaltyPoints
    : Number((appointment as any).customer?.loyaltyPoints ?? 0);
  const effectiveCustomerId = linkedCustomer?.id ?? Number((appointment as any).customerId) ?? 0;
  const { data: loyaltyRewards = [] } = useQuery<
    { id: number; name: string; pointsCost: number; dollarValue: number; isActive: boolean }[]
  >({
    queryKey: ["/api/loyalty/rewards"],
    enabled: !!storeId && showRewardPicker,
  });
  const ticketSubtotal = (a: any) =>
    Number(a?.service?.price || 0) +
    (a?.appointmentAddons?.map((aa: any) => aa.addon).filter(Boolean).reduce((s: number, ad: any) => s + Number(ad.price || 0), 0) || 0);
  const linkableTickets = siblingAppointments.filter((a) =>
    a.id !== appointment.id &&
    ["started", "checked_in", "pending", "confirmed"].includes(String(a.status)) &&
    isOnStoreDate(a.date, getNowInTimezone(timezone), timezone),
  );
  const linkedAppointments = linkableTickets.filter((a) => linkedIds.includes(a.id));
  const linkedSubtotal = linkedAppointments.reduce((s, a) => s + ticketSubtotal(a), 0);

  const ownServiceBase = servicePrice + addonTotal + posExtraTotal;
  const subtotal = ownServiceBase + linkedSubtotal;

  const discountNum = Number(discountValue) || 0;
  const manualDiscount = discountType === "percent" ? subtotal * (discountNum / 100) : discountNum;
  const discount = manualDiscount + redemptionDiscount;
  const discountedSubtotal = Math.max(0, subtotal - discount);

  const tax = discountedSubtotal * posTaxRate;
  const preTotal = discountedSubtotal + tax;

  const tip = tipMode === "custom"
    ? (Number(customTip) || 0)
    : (TIP_PRESETS[selectedTipIndex]?.percent
        ? preTotal * (TIP_PRESETS[selectedTipIndex] as any).percent
        : (TIP_PRESETS[selectedTipIndex] as any)?.value || 0);

  const grandTotal = Math.round((preTotal + tip) * 100) / 100;
  const totalTendered = tenders.reduce((sum, t) => sum + t.amount, 0);
  const balanceDue = Math.round((grandTotal - totalTendered) * 100) / 100;
  const changeDue = balanceDue < 0 ? Math.abs(balanceDue) : 0;

  const endTime = addMinutes(new Date(appointment.date), appointment.duration);
  const dateStr = formatInTz(appointment.date, timezone, "EEE, MMM d");
  const timeStr = `${formatInTz(appointment.date, timezone, "h:mm a")} - ${formatInTz(endTime, timezone, "h:mm a")}`;

  const handleKeypadPress = (key: string) => {
    if (key === "C") {
      setKeypadDisplay("0");
      return;
    }
    if (key === "BS") {
      setKeypadDisplay(prev => prev.length <= 1 ? "0" : prev.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (keypadDisplay.includes(".")) return;
      setKeypadDisplay(prev => prev + ".");
      return;
    }
    setKeypadDisplay(prev => {
      if (prev === "0" && key !== ".") return key;
      const parts = prev.split(".");
      if (parts[1] && parts[1].length >= 2) return prev;
      return prev + key;
    });
  };

  useEffect(() => {
    if (phase === "payment") {
      setShowComplete(totalTendered >= grandTotal && tenders.length > 0);
    }
  }, [totalTendered, grandTotal, tenders.length, phase]);

  const handleApplyTender = (method: string) => {
    const amount = Number(keypadDisplay);
    if (amount <= 0) return;
    setTenders(prev => [...prev, { id: nextTenderId, method, amount }]);
    setNextTenderId(prev => prev + 1);
    setKeypadDisplay("0");
  };

  const handleRemoveTender = (id: number) => {
    setTenders(prev => prev.filter(t => t.id !== id));
  };

  const handleQuickAmount = (amount: number) => {
    setKeypadDisplay(String(amount.toFixed(2)));
  };

  const broadcastToKiosk = (type: string, payload: Record<string, unknown> = {}) => {
    if (!storeId || !dualScreenEnabled) return;
    fetch("/api/kiosk/checkout-event", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...payload }),
    }).catch(() => {});
  };

  useEffect(() => {
    if (!storeId) return;
    fetch("/api/kiosk-settings", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setDualScreenEnabled(d.dualScreenMode === true))
      .catch(() => {});
  }, [storeId]);

  useEffect(() => {
    if (!storeId || !dualScreenEnabled) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/notifications?storeId=${storeId}`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "kiosk_checkout_tip_selected") {
          const tipFromKiosk = Number(msg.tipAmount) || 0;
          setTipMode("custom");
          setCustomTip(tipFromKiosk.toFixed(2));
          setWaitingForTip(false);
          setTipCollected(true); // don't auto-re-open the client tip screen
          showPosStatus(
            tipFromKiosk > 0 ? `TIP RECEIVED · $${tipFromKiosk.toFixed(2)}` : "NO TIP SELECTED BY CLIENT",
            tipFromKiosk > 0 ? "success" : "info",
          );
        }
        if (msg.type === "kiosk_checkout_payment_result") {
          if (msg.via === "client_confirm") {
            // The customer confirmed the tip on the customer screen and the
            // native bridge (M2 or Tap to Pay) ran there. Record the tender so
            // the POS's "paid in full" logic completes the sale.
            if (msg.success) {
              const paid = Number(msg.total) || 0;
              if (paid > 0) {
                const m = msg.method === "m2" ? "m2" : "tap";
                setTenders(prev => [...prev, { id: (prev[prev.length - 1]?.id ?? 0) + 1, method: m, amount: paid }]);
                showPosStatus(tSt.cardApproved(paid.toFixed(2)), "success");
              }
            } else {
              showPosStatus(msg.error ? String(msg.error).toUpperCase() : tSt.cardDeclined, "error");
            }
          } else if (awaitingTapPayAmtRef.current > 0) {
            // A "Tap to Pay" collection the POS itself started on the customer
            // tablet. The web M2 flow also emits this event (and adds its own
            // tender locally), so ignore that echo (amt ref stays 0 there).
            const asked = awaitingTapPayAmtRef.current;
            awaitingTapPayAmtRef.current = 0;
            setAwaitingTapPay(false);
            if (msg.success) {
              const paid = Number(msg.total) || asked;
              setTenders(prev => [...prev, { id: (prev[prev.length - 1]?.id ?? 0) + 1, method: "tap", amount: paid }]);
              showPosStatus(tSt.cardApproved(paid.toFixed(2)), "success");
            } else {
              showPosStatus(msg.error ? String(msg.error).toUpperCase() : tSt.cardDeclined, "error");
            }
          }
        }
        // A customer just linked themselves to this ticket via phone check-in on
        // the front-desk display — swap "Walk-In" for their name immediately and
        // refresh the appointments cache in the background.
        if (msg.type === "kiosk_checkout_customer_linked") {
          const nm = String(msg.name || "").trim();
          const linkedApptId = Number(msg.appointmentId) || 0;
          const clientId = Number(msg.clientId) || 0;
          // apptIdRef, not a stale `appointment.id` from this effect's closure.
          if (clientId && (!linkedApptId || linkedApptId === apptIdRef.current)) {
            const pts = Number(msg.loyaltyPoints) || 0;
            setLinkedCustomer({ id: clientId, name: nm, loyaltyPoints: pts });
            onCustomerLinkedRef.current?.(clientId, nm, pts);
          }
          showPosStatus(nm ? tSt.customerLinked(nm.toUpperCase(), !!msg.isNew) : tSt.customerEnrolled, "success");
          posQueryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
        }
        // Client tapped "Redeem" on a loyalty reward on the front-desk display →
        // apply it to this ticket as a points redemption (discount). Points are
        // deducted server-side at finalize via onFinalize.redemption.
        if (msg.type === "kiosk_checkout_redeem_reward") {
          const rewardId = Number(msg.rewardId) || 0;
          if (rewardId) {
            setPendingRedemption({
              rewardId,
              name: String(msg.name || "Reward"),
              pointsCost: Number(msg.pointsCost) || 0,
              dollarValue: Number(msg.dollarValue) || 0,
            });
            showPosStatus(tSt.rewardRedeemed(String(msg.name || "").toUpperCase()), "success");
          }
        }
      } catch {}
    };
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, dualScreenEnabled]);

  // ── Reliable "customer linked" sync (no WebSocket dependency) ─────────────
  // When a walk-in customer types their phone on the /frontdesk check-in panel,
  // the server persists appointments.customer_id (POST /rewards-signup). The WS
  // broadcast that's meant to tell this POS panel can be lost (PM2 worker that
  // handles the HTTP request ≠ the worker holding this tab's socket, and the
  // cross-process relay isn't guaranteed). So while this sheet is open on a
  // ticket that has NO customer yet, poll the appointment directly — the moment
  // customer_id appears server-side, swap "Walk-In" for their name.
  const apptCustomerName = String(
    (appointment as any).customer?.fullName || (appointment as any).customer?.name || "",
  ).trim();
  useEffect(() => {
    // Keep polling until this sheet has a *named* customer. A ticket can already
    // carry a customer_id that points at a blank POS placeholder (empty name) —
    // that still shows as "Walk-In", and a real /frontdesk phone check-in must
    // be able to take it over.
    const hasNamedCustomer = !!linkedCustomer || apptCustomerName.length > 0;
    // Only relevant with the /frontdesk check-in panel (dual screen).
    if (!dualScreenEnabled || hasNamedCustomer || !appointment?.id) return;
    let stopped = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/appointments/${appointment.id}`, { credentials: "include" });
        if (!r.ok) return;
        const data = await r.json();
        const cid = Number(data?.customerId) || 0;
        const nm = String(data.customer?.fullName || data.customer?.name || "").trim();
        if (!cid || !nm || stopped) return; // ignore a blank placeholder
        const pts = Number(data.customer?.loyaltyPoints ?? 0);
        stopped = true;
        clearInterval(iv);
        setLinkedCustomer({ id: cid, name: nm, loyaltyPoints: pts });
        onCustomerLinkedRef.current?.(cid, nm, pts);
        showPosStatus(tSt.customerLinked(nm.toUpperCase(), false), "success");
      } catch { /* keep polling */ }
    };
    const iv = setInterval(poll, 1500);
    poll();
    return () => { stopped = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment?.id, apptCustomerName, linkedCustomer, dualScreenEnabled]);

  // Opening the checkout panel → switch the front-desk tablet to the cart +
  // check-in double panel straight away; closing it → send the tablet back to
  // its landing screen (dual screen only). The cart-mirror effect below keeps
  // the contents in sync while the panel is open.
  useEffect(() => {
    if (!storeId || !dualScreenEnabled) return;
    broadcastToKiosk("kiosk_checkout_start", { total: grandTotal, appointmentId: appointment?.id ?? 0 });
    return () => { broadcastToKiosk("kiosk_checkout_cancel"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, dualScreenEnabled]);

  // Ask the customer display for a tip once the ticket moves to payment. While
  // the ticket is still being built the display shows the live cart mirror.
  useEffect(() => {
    if (!dualScreenEnabled || phase !== "payment") return;
    if (tipAutoRequestedRef.current || tipCollected) return;
    tipAutoRequestedRef.current = true;
    requestClientTipScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dualScreenEnabled, phase, tipCollected]);

  // ── Live cart mirror → front-desk display (dual screen only) ──────────────
  const mirrorItems = useMemo(() => {
    const rows: { label: string; price: number }[] = [];
    if (appointment.service) rows.push({ label: appointment.service.name || "Service", price: servicePrice });
    for (const a of aptAddons) if (a) rows.push({ label: `+ ${a.name}`, price: Number(a.price) || 0 });
    for (const it of posExtraItems) rows.push({ label: it.name.startsWith("+") ? it.name : `+ ${it.name}`, price: it.price });
    return rows;
  }, [appointment.service, aptAddons, posExtraItems, servicePrice]);
  const mirrorIsWalkIn = !linkedCustomer && !((appointment as any).customerId);
  const mirrorCustomerName =
    linkedCustomer?.name ||
    (appointment as any).customer?.fullName || appointment.customer?.name ||
    (appointment as any).customerName || (appointment as any).clientName || tPOS.walkIn;
  const mirrorKey = JSON.stringify({ mirrorItems, discount, tip, tax, grandTotal, mirrorIsWalkIn, name: mirrorCustomerName, points: customerLoyaltyPoints });
  useEffect(() => {
    if (!dualScreenEnabled) return;
    broadcastToKiosk("kiosk_checkout_cart", {
      items: mirrorItems,
      subtotal, discount, tip, tax, total: grandTotal,
      isWalkIn: mirrorIsWalkIn,
      customerName: mirrorCustomerName,
      appointmentId: appointment?.id ?? 0,
      loyaltyPoints: mirrorIsWalkIn ? undefined : customerLoyaltyPoints,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dualScreenEnabled, mirrorKey]);

  // ── Terminal M2 connect/payment ───────────────────────────────────────────
  const handleConnectM2 = async () => {
    setTermStatus("loading"); setTermError("");
    try {
      const StripeTerminal = await loadStripeTerminalSDK();
      const terminal = StripeTerminal.create({
        onFetchConnectionToken: async () => {
          const r = await fetch("/api/payments/terminal/connection-token", { method: "POST", credentials: "include" });
          if (!r.ok) throw new Error("Failed to fetch connection token");
          return (await r.json()).secret;
        },
        onUnexpectedReaderDisconnect: () => {
          setTermReader(null); setTermStatus("idle");
          setTermError("Reader disconnected.");
        },
      });
      termRef.current = terminal;
      setTermStatus("discovering");
      const disc = await terminal.discoverReaders({ simulated: false });
      if (disc.error) throw new Error(disc.error.message);
      const readers = disc.discoveredReaders ?? [];
      if (!readers.length) throw new Error("No M2 reader found nearby. Make sure it is powered on and Bluetooth is enabled.");
      const toConnect = readers[0];
      setTermStatus("connecting");
      const conn = await terminal.connectReader(toConnect);
      if (conn.error) throw new Error(conn.error.message);
      setTermReader(toConnect);
      setTermStatus("ready");
      toast({ title: tSt.m2Connected, description: tSt.m2ConnectedDesc(String(toConnect.label ?? toConnect.id)) });
    } catch (err: any) {
      setTermStatus("error"); setTermError(err.message ?? "Connection failed");
      toast({ title: tSt.readerFailed, description: err.message, variant: "destructive" });
    }
  };

  const handleM2Payment = async () => {
    if (!termRef.current || !termReader) return;
    const amountCents = Math.round(balanceDue * 100);
    if (amountCents <= 0) return;
    setTermStatus("collecting"); setTermError("");
    // Tell the customer-facing front-desk display to show the "tap card on the
    // M2 reader" instruction screen while Stripe Terminal collects.
    broadcastToKiosk("kiosk_checkout_await_payment", { mode: "m2", total: balanceDue, appointmentId: appointment?.id ?? 0 });
    try {
      const piRes = await fetch("/api/payments/terminal/create-payment-intent", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, currency: "usd" }),
      });
      if (!piRes.ok) throw new Error((await piRes.json()).error ?? "Failed to create payment intent");
      const { clientSecret, paymentIntentId } = await piRes.json();
      const collect = await termRef.current.collectPaymentMethod(clientSecret);
      if (collect.error) throw new Error(collect.error.message);
      setTermStatus("processing");
      const process = await termRef.current.processPayment(collect.paymentIntent);
      if (process.error) throw new Error(process.error.message);
      const capture = await fetch("/api/payments/terminal/capture-payment-intent", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId }),
      });
      if (!capture.ok) throw new Error((await capture.json()).error ?? "Capture failed");
      const last4 = process.paymentIntent?.payment_method_details?.card_present?.last4 ?? "????";
      const brand = process.paymentIntent?.payment_method_details?.card_present?.brand ?? "Card";
      toast({ title: tSt.paymentApproved, description: tSt.paymentApprovedDesc(brand, last4, balanceDue.toFixed(2)) });
      setTermStatus("ready");
      // Add as tender so the existing "paid in full" logic kicks in
      const charged = balanceDue;
      setTenders(prev => [...prev, { id: nextTenderId, method: "m2", amount: charged }]);
      setNextTenderId(prev => prev + 1);
      broadcastToKiosk("kiosk_checkout_payment_result", { success: true, total: charged, last4 });
    } catch (err: any) {
      setTermStatus("ready");
      setTermError(err.message ?? "Payment failed");
      if (termRef.current) termRef.current.cancelCollectPaymentMethod().catch(() => {});
      toast({ title: tSt.cardFailed, description: err.message, variant: "destructive" });
      broadcastToKiosk("kiosk_checkout_payment_result", { success: false, error: err?.message });
    }
  };

  const handleCompleteTransaction = () => {
    broadcastToKiosk("kiosk_checkout_cancel");
    const methodsSummary = tenders.map(t => `${t.method}:${t.amount.toFixed(2)}`).join(",");
    const r2 = (n: number) => Math.round(n * 100) / 100;

    let groupTickets: GroupTicketShare[] | undefined;
    if (linkedAppointments.length > 0) {
      // Split tip + discount across every ticket proportionally to its service value.
      const tickets = [
        { id: appointment.id, base: ownServiceBase },
        ...linkedAppointments.map((a) => ({ id: a.id, base: ticketSubtotal(a) })),
      ];
      const totalBase = tickets.reduce((s, t) => s + t.base, 0) || 1;
      let tipLeft = r2(tip), discLeft = r2(discount), paidLeft = r2(totalTendered);
      groupTickets = tickets.map((t, i) => {
        const last = i === tickets.length - 1;
        const share = t.base / totalBase;
        const tShare = last ? tipLeft : r2(tip * share);
        const dShare = last ? discLeft : r2(discount * share);
        const pShare = last ? paidLeft : r2(totalTendered * share);
        tipLeft = r2(tipLeft - tShare); discLeft = r2(discLeft - dShare); paidLeft = r2(paidLeft - pShare);
        return { appointmentId: t.id, tip: tShare, discount: dShare, totalPaid: pShare, paymentMethod: methodsSummary };
      });
    }

    onFinalize({
      paymentMethod: methodsSummary,
      tip: r2(tip),
      discount: r2(discount),
      totalPaid: r2(totalTendered),
      groupTickets,
      redemption: pendingRedemption
        ? { rewardId: pendingRedemption.rewardId, customerId: effectiveCustomerId }
        : undefined,
    });
  };

  const handlePrintReceipt = () => {
    const escapeHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const storeName = escapeHtml((selectedStore as any)?.name || "Receipt");
    const storeAddr = escapeHtml(
      [
        (selectedStore as any)?.address,
        (selectedStore as any)?.city,
        (selectedStore as any)?.state,
        (selectedStore as any)?.zipCode,
      ]
        .filter(Boolean)
        .join(", "),
    );
    const storePhone = escapeHtml((selectedStore as any)?.phone || "");
    const customerName = escapeHtml(linkedCustomer?.name || (appointment as any).customer?.fullName || appointment.customer?.name || (appointment as any).customerName || (appointment as any).clientName || "Walk-In");
    const staffName = escapeHtml((appointment as any).staff?.name || "");
    const apptDate = escapeHtml(dateStr);
    const apptTime = escapeHtml(timeStr);
    const printedAt = escapeHtml(
      formatInTz(new Date(), timezone, "EEE, MMM d • h:mm a"),
    );

    const lineItems: { label: string; price: number }[] = [];
    if (appointment.service) {
      lineItems.push({
        label: appointment.service.name || "Service",
        price: servicePrice,
      });
    }
    for (const a of aptAddons) {
      if (!a) continue;
      lineItems.push({ label: `+ ${a.name}`, price: Number(a.price) });
    }
    // POS-added lines (add-ons, removal, retail, custom charges, Quick Ticket steps)
    for (const it of posExtraItems) {
      lineItems.push({ label: it.name.startsWith("+") ? it.name : `+ ${it.name}`, price: it.price });
    }

    const itemsHtml = lineItems
      .map(
        (li) => `
        <tr>
          <td>${escapeHtml(li.label)}</td>
          <td class="r">$${li.price.toFixed(2)}</td>
        </tr>`,
      )
      .join("");

    const tendersHtml = tenders
      .map(
        (t) => `
        <tr>
          <td>${escapeHtml(t.method.toUpperCase())}</td>
          <td class="r">$${t.amount.toFixed(2)}</td>
        </tr>`,
      )
      .join("");

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt #${appointment.id}</title>
<style>
  @page { margin: 8mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Courier New', ui-monospace, monospace;
    font-size: 12px;
    color: #000;
    margin: 0;
    padding: 12px;
    width: 80mm;
  }
  .center { text-align: center; }
  .r { text-align: right; }
  .bold { font-weight: 700; }
  .lg { font-size: 14px; }
  .xl { font-size: 16px; }
  .muted { color: #444; }
  hr { border: 0; border-top: 1px dashed #000; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  .total-row td { padding-top: 6px; font-weight: 700; font-size: 14px; }
  .footer { margin-top: 12px; font-size: 11px; }
</style>
</head>
<body>
  <div class="center bold xl">${storeName}</div>
  ${storeAddr ? `<div class="center muted">${storeAddr}</div>` : ""}
  ${storePhone ? `<div class="center muted">${storePhone}</div>` : ""}
  <hr />
  <div>Receipt #${appointment.id}</div>
  <div>${printedAt}</div>
  <div>Appt: ${apptDate} ${apptTime}</div>
  <div>Client: ${customerName}</div>
  ${staffName ? `<div>Staff: ${staffName}</div>` : ""}
  <hr />
  <table>${itemsHtml}</table>
  <hr />
  <table>
    <tr><td>Subtotal</td><td class="r">$${subtotal.toFixed(2)}</td></tr>
    ${
      discount > 0
        ? `<tr><td>Discount</td><td class="r">-$${discount.toFixed(2)}</td></tr>`
        : ""
    }
    <tr><td>Tax</td><td class="r">$${tax.toFixed(2)}</td></tr>
    ${
      tip > 0
        ? `<tr><td>Tip</td><td class="r">$${tip.toFixed(2)}</td></tr>`
        : ""
    }
    <tr class="total-row"><td>TOTAL</td><td class="r">$${grandTotal.toFixed(2)}</td></tr>
  </table>
  <hr />
  <table>${tendersHtml}</table>
  <table>
    <tr><td>Tendered</td><td class="r">$${totalTendered.toFixed(2)}</td></tr>
    ${
      changeDue > 0
        ? `<tr class="bold"><td>Change Due</td><td class="r">$${changeDue.toFixed(2)}</td></tr>`
        : ""
    }
  </table>
  <hr />
  <div class="center footer">Thank you!</div>
  <script>
    window.onload = function() {
      window.focus();
      window.print();
      setTimeout(function() { window.close(); }, 300);
    };
  </script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) {
      toast({
        title: tSt.popupBlocked,
        description: tSt.popupBlockedDesc,
        variant: "destructive",
      });
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const handlePrintAndComplete = () => {
    handlePrintReceipt();
    handleCompleteTransaction();
  };

  const getMethodIcon = (method: string) => {
    if (method === "tap") return Smartphone;
    const found = PAYMENT_METHODS.find(m => m.id === method);
    if (!found) return Banknote;
    return found.icon;
  };

  // ── Phase-1 keypad + function grid ────────────────────────────────────────
  //    Design ported from the standalone POS (pos-interface.jsx). Layout only —
  //    ENTER / quick-cash / function buttons are not wired to checkout yet.
  const [cartKeypad, setCartKeypad] = useState("");
  const cartKpDigit = (d: string) => setCartKeypad(prev => (prev + d).replace(/^0+(?=\d)/, "").slice(0, 10));
  const cartKpBack  = () => setCartKeypad(prev => prev.slice(0, -1));
  const cartKpClear = () => setCartKeypad("");

  // Dark keypad button styles (matches the posted POS reference).
  const KP_NUM: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    boxSizing: "border-box", outline: "none",
    border: "1px solid #3d3d40", borderRadius: 4, backgroundColor: "#2e2e30",
    cursor: "pointer", fontSize: 26, fontWeight: 500, color: "#f5f5f7",
    userSelect: "none",
  };
  const KP_FN_BASE: React.CSSProperties = {
    position: "relative",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    boxSizing: "border-box", outline: "none",
    border: "1px solid #3a3a3c", borderRadius: 4, backgroundColor: "#2a2a2c",
    cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#e5e5e7", lineHeight: 1.16,
    userSelect: "none", padding: "4px 3px", textAlign: "center", gap: 2, minHeight: 84,
  };
  // Colour band per row, cycled.
  const KP_ROW_BANDS = ["#f4d000", "#e879b0", "#00c8ff", "#ff8bd4", "#b493ff", "#95d8ff"];
  const posCustomerName =
    linkedCustomer?.name ||
    (appointment as any).customer?.fullName || appointment.customer?.name ||
    (appointment as any).customerName || (appointment as any).clientName || tPOS.walkIn;
  // A real, named client is on this ticket (linked live from /frontdesk or
  // already on the appointment) — show them in the header instead of "Checkout".
  const posHasNamedClient = !!linkedCustomer || (posCustomerName !== tPOS.walkIn && posCustomerName.trim() !== "");

  // ── POS function buttons — data-driven, keyed by the store's business type ──
  //    Layout comes from `posLayout` above. Submenu buttons drill into a nested
  //    grid; `posMenuStack` tracks depth.
  const [posMenuStack, setPosMenuStack] = useState<PosButton[][]>([]);
  const posButtons = posMenuStack.length > 0 ? posMenuStack[posMenuStack.length - 1] : posLayout.buttons;

  // ── Quick Ticket — a guided amount-entry wizard. Each step prompts for an
  //   amount; ENTER commits it as a cart line (or skips the step if blank),
  //   then advances. Cancelled by tapping Quick Ticket again.
  type GuidedStep = { prompt: string; label: string };
  const [guided, setGuided] = useState<{ steps: GuidedStep[]; i: number } | null>(null);
  const guidedStep = guided ? guided.steps[guided.i] : null;

  // ── Add-On browser — the store's live catalogue, paginated to the 3×5 grid.
  //   The grid always renders a "Back" cell first, so each page holds ≤14 real
  //   cells (13 + a "More" cell, except the last page). Cell 1 is the "+Addon"
  //   custom button; the rest are the store's add-ons, each tapping to a cart
  //   line named after it. "Back" doubles as "previous page" while paging.
  const { data: storeAddons } = useAddons();
  const addonPages = useMemo<PosButton[][]>(() => {
    const custom: PosButton = {
      id: "dyn.addon.custom",
      label: "+Addon",
      icon: "Calculator",
      band: "#e879b0",
      action: { type: "add-custom-item", payload: { kind: "addon" } },
    };
    const items: PosButton[] = [
      custom,
      ...(storeAddons ?? [])
        .filter((a: any) => a.isActive !== false)
        .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))
        .map((a: any): PosButton => ({
          id: `dyn.addon.${a.id}`,
          label: String(a.name),
          icon: "Sparkles",
          action: { type: "add-addon", payload: { addonId: a.id, addonName: String(a.name), price: Number(a.price) || 0 } },
        })),
    ];
    const chunks: PosButton[][] = [];
    for (let i = 0; i < items.length; ) {
      const remaining = items.length - i;
      const take = remaining > 14 ? 13 : remaining;
      chunks.push(items.slice(i, i + take));
      i += take;
    }
    // One array object per page, filled in place, so a "More" button can hold a
    // reference to the next page while that page is still being populated.
    const pages: PosButton[][] = chunks.map(() => []);
    chunks.forEach((chunk, k) => {
      pages[k].push(...chunk);
      if (k < chunks.length - 1) {
        pages[k].push({
          id: `dyn.addon.more.${k}`,
          label: `More\n${k + 2}/${chunks.length}`,
          icon: "ChevronRight",
          band: "#00c8ff",
          action: { type: "submenu", submenu: pages[k + 1] },
        });
      }
    });
    return pages;
  }, [storeAddons]);

  // Keypad value, in dollars (the phase-1 numpad stores cents: "2500" -> 25.00).
  const posKeypadDollars = () => (Number(cartKeypad) || 0) / 100;
  const clearPosKeypad = () => setCartKeypad("");
  // `posStatus` / `showPosStatus` are declared near the top of the component.

  // Quick Ticket: commit the current step's amount (if any) as a cart line and
  // move to the next prompt. Blank/zero = skip the step, nothing added.
  const handleGuidedEnter = () => {
    if (!guided) return;
    const step = guided.steps[guided.i];
    const amt = posKeypadDollars();
    if (amt > 0) addPosExtraItem(guidedT(step).label, amt, "guided");
    setCartKeypad("");
    const next = guided.i + 1;
    if (next >= guided.steps.length) {
      setGuided(null);
      showPosStatus(tSt.quickDone, "success");
    } else {
      setGuided({ steps: guided.steps, i: next });
    }
  };

  // ERC (Error Correct): in the Quick Ticket wizard → clear & exit;
  // otherwise → undo the last POS line item added.
  const handleErc = () => {
    if (guided) {
      setGuided(null);
      setCartKeypad("");
      showPosStatus(tSt.quickExited, "info");
      return;
    }
    setPosExtraItems((prev) => {
      if (prev.length === 0) { showPosStatus(tSt.nothingToUndo, "info"); return prev; }
      showPosStatus(tSt.undid(String(prev[prev.length - 1].name).toUpperCase()), "info");
      return prev.slice(0, -1);
    });
  };

  // ── Phone / solo-professional layout ─────────────────────────────────────
  //   Below `lg` the desktop 3-panel checkout is replaced by a mobile-app
  //   shell: Ticket / Keypad / Actions / Pay tabs with a sticky footer nav.
  //   Everything reuses the same state + `handlePosAction` + tender logic.
  const isCompactPos = useIsCompactPos();
  // Running inside the Certxa native Android wrapper — M2 Reader and Tap to Pay
  // route through the device bridge rather than the web Stripe Terminal SDK.
  const isNative = typeof window !== "undefined" && !!(window as any).CERTXA_NATIVE_APP;
  const mobileActions = useMemo(() => getMobilePosActions(posLayout), [posLayout]);
  const [mobileTab, setMobileTab] = useState<"ticket" | "keypad" | "actions" | "pay">("ticket");
  // An amount-entry action the pro started before typing a value — the Keypad
  // tab shows an "Apply to …" button to finish it.
  const [pendingAmountAction, setPendingAmountAction] = useState<PosButton | null>(null);
  const [mobileTipOpen, setMobileTipOpen] = useState<null | "charge" | "adjust">(null);
  const [mobileTipDone, setMobileTipDone] = useState(false);
  const MOBILE_KEYPAD_ACTIONS = new Set(["add-custom-item", "discount-custom", "add-product"]);
  // Run an Actions-tab button. Tip opens the full-screen prompt; amount-entry
  // actions with no value yet bounce to the Keypad tab.
  const runMobileAction = (btn: PosButton) => {
    const type = btn.action.type;
    if (type === "tip-adjust") { setMobileTipOpen("adjust"); return; }
    if (MOBILE_KEYPAD_ACTIONS.has(type) && posKeypadDollars() <= 0) {
      setPendingAmountAction(btn);
      setMobileTab("keypad");
      showPosStatus(tSt.enterAmountFor(posT(btn.id, btn.label || "").replace(/\n/g, " ").toUpperCase()), "info");
      return;
    }
    handlePosAction(btn);
  };
  // Pay-tab tender using the shared cents keypad (`cartKeypad`).
  const applyMobileTender = (method: string) => {
    const amt = posKeypadDollars();
    if (amt <= 0) { showPosStatus(tSt.enterAmountFirst, "error"); return; }
    setTenders((prev) => [...prev, { id: nextTenderId, method, amount: amt }]);
    setNextTenderId((n) => n + 1);
    clearPosKeypad();
  };

  const handlePosAction = (btn: PosButton) => {
    const { action } = btn;
    const p = action.payload ?? {};
    const flat = posT(btn.id, btn.label || "").replace(/\n/g, " ");
    const kd = posKeypadDollars();
    const NEED_AMOUNT = tSt.mustEnterAmount;

    switch (action.type) {
      case "submenu":
        if (action.submenu) setPosMenuStack((s) => [...s, action.submenu!]);
        return;
      case "back":
        setPosMenuStack((s) => s.slice(0, -1));
        return;
      case "addon-browser":
        setPosMenuStack((s) => [...s, addonPages[0] ?? []]);
        if ((storeAddons ?? []).length === 0) showPosStatus(tSt.noAddons, "info");
        return;
      case "guided-ticket": {
        if (guided) { setGuided(null); setCartKeypad(""); showPosStatus(tSt.quickCancelled, "info"); return; }
        const steps = ((p.steps as GuidedStep[]) ?? []).filter((s) => s && s.prompt && s.label);
        if (!steps.length) return;
        setPosMenuStack([]);
        setCartKeypad("");
        setGuided({ steps, i: 0 });
        if (isCompactPos) setMobileTab("keypad");
        return;
      }

      // ── Ticket lines ──────────────────────────────────────────────────────
      case "add-addon": {
        const price = kd > 0 ? kd : Number(p.price) || 0;
        const name = String(p.addonName ?? flat);
        addPosExtraItem(name, price, "addon");
        clearPosKeypad();
        showPosStatus(tSt.itemAdded(name.toUpperCase(), price.toFixed(2)), "success");
        return;
      }
      case "add-product": {
        if (kd <= 0) { showPosStatus(NEED_AMOUNT, "error"); return; }
        addPosExtraItem(tPOS.retailItem, kd, "retail");
        clearPosKeypad();
        showPosStatus(tSt.retailAdded(kd.toFixed(2)), "success");
        return;
      }
      case "add-custom-item": {
        if (kd <= 0) { showPosStatus(NEED_AMOUNT, "error"); return; }
        addPosExtraItem(p.kind === "addon" ? "+Addon" : "+Extra", kd, "custom");
        clearPosKeypad();
        showPosStatus(tSt.extraAdded(p.kind === "addon" ? "addon" : "extra", kd.toFixed(2)), "success");
        return;
      }

      // ── Discount / comp ──────────────────────────────────────────────────
      case "discount-preset": {
        if (typeof p.percent === "number") {
          setDiscountType("percent"); setDiscountValue(String(p.percent));
          showPosStatus(tSt.pctDiscount(p.percent), "success");
        } else if (typeof p.amount === "number") {
          setDiscountType("dollar"); setDiscountValue(String(p.amount));
          showPosStatus(tSt.amtDiscount(Number(p.amount).toFixed(2)), "success");
        }
        return;
      }
      case "discount-custom": {
        if (kd <= 0) { showPosStatus(NEED_AMOUNT, "error"); return; }
        setDiscountType("dollar"); setDiscountValue(String(kd)); clearPosKeypad();
        showPosStatus(tSt.amtDiscount(kd.toFixed(2)), "success");
        return;
      }
      case "comp-item":
        setDiscountType("percent"); setDiscountValue("100");
        showPosStatus(tSt.ticketComped, "success");
        return;

      // ── Tip / payment shaping ────────────────────────────────────────────
      case "tip-adjust": {
        // Clear any existing tip first…
        setTipMode("preset"); setSelectedTipIndex(0); setCustomTip("");
        if (dualScreenEnabled) {
          // …then (re-)open the client-facing tip screen. Used when it didn't
          // open, the client closed it, or they submitted the wrong amount.
          setTipCollected(false);
          tipAutoRequestedRef.current = true; // manual request now — skip the auto-effect
          requestClientTipScreen();
          showPosStatus(tSt.tipScreenSent, "info");
        } else if (kd > 0) {
          // No client screen — fall back to a manual amount from the keypad.
          setTipMode("custom"); setCustomTip(kd.toFixed(2)); clearPosKeypad();
          showPosStatus(tSt.tipSet(kd.toFixed(2)), "success");
        } else {
          showPosStatus(NEED_AMOUNT, "error");
        }
        return;
      }
      // ── Utilities ───────────────────────────────────────────────────────
      case "link-tickets":
        if (linkableTickets.length === 0) { showPosStatus(tSt.noOtherTickets, "error"); return; }
        setShowLinkPicker(true);
        return;
      case "no-sale":
        // TODO: hardware/native drawer kick.
        showPosStatus(tSt.noSaleDrawer, "info");
        return;

      case "loyalty-redeem":
        if (!((appointment as any).customerId)) {
          showPosStatus(tSt.addClientFirst, "error");
          return;
        }
        setShowRewardPicker(true);
        return;

      // ── Not yet backed by a subsystem ──────────────────────────────────
      case "gift-card":
      case "membership":
      case "reprint-receipt":
        showPosStatus(tSt.comingSoon(flat.toUpperCase()), "info");
        return;

      default:
        // eslint-disable-next-line no-console
        console.debug("[pos] unhandled action:", action.type, p);
    }
  };

  // ══ Mobile-app shell (phone / solo pro) — Ticket / Keypad / Actions / Pay ══
  if (isCompactPos) {
    const activeTab: "ticket" | "keypad" | "actions" | "pay" = phase === "payment" ? "pay" : mobileTab;
    const kpVal = (Number(cartKeypad) || 0) / 100;
    const paidInFull = tenders.length > 0 && totalTendered >= grandTotal;
    const actionsList = posMenuStack.length > 0 ? posButtons : mobileActions;

    const applyTip = (mode: "preset" | "custom", idxOrAmt: number) => {
      if (mode === "preset") { setTipMode("preset"); setSelectedTipIndex(idxOrAmt); }
      else { setTipMode("custom"); setCustomTip(idxOrAmt.toFixed(2)); }
      const from = mobileTipOpen;
      setMobileTipDone(true);
      setMobileTipOpen(null);
      setCartKeypad("");
      if (from === "charge") setMobileTab("pay");
    };
    const goCharge = () => {
      if (!dualScreenEnabled && !mobileTipDone) setMobileTipOpen("charge");
      else setMobileTab("pay");
    };

    const TABS: { id: typeof mobileTab; label: string; icon: any }[] = [
      { id: "ticket",  label: pick(POS_MISC_TX.tabTicket),  icon: Ticket },
      { id: "keypad",  label: pick(POS_MISC_TX.tabKeypad),  icon: DollarSign },
      { id: "actions", label: pick(POS_MISC_TX.tabActions), icon: Zap },
      { id: "pay",     label: pick(POS_MISC_TX.tabPay),     icon: CreditCard },
    ];
    const KEY = (k: string, on: () => void, wide = false) => (
      <button key={k} onClick={on}
        className={cn("h-14 rounded-md text-xl font-semibold flex items-center justify-center", wide && "col-span-1")}
        style={{ backgroundColor: "#2e2e30", border: "1px solid #3d3d40", color: "#f5f5f7" }}>
        {k === "BS" ? <Delete className="w-5 h-5" /> : k === "C" ? "CLR" : k}
      </button>
    );
    const numPad = (onDigit: (d: string) => void, onBack: () => void, onClear: () => void) => (
      <div className="grid grid-cols-3 gap-2">
        {["7","8","9","4","5","6","1","2","3"].map((k) => KEY(k, () => onDigit(k)))}
        {KEY("00", () => onDigit("00"))}
        {KEY("0", () => onDigit("0"))}
        {KEY("BS", onBack)}
        <button onClick={onClear} className="col-span-3 h-11 rounded-md text-sm font-semibold" style={{ backgroundColor: "#242426", border: "1px solid #3a3a3c", color: "#8e8e93" }}>CLEAR</button>
      </div>
    );

    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "#1c1c1e" }} data-testid="checkout-pos-mobile">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid #3a3a3c", backgroundColor: "#2c2c2e" }}>
          <button onClick={onClose} data-testid="pos-mobile-close" style={{ color: "#8e8e93" }}><X className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate" style={{ color: "#f5f5f7" }}>{posCustomerName}</p>
            <p className="text-[11px]" style={{ color: "#8e8e93" }}>#{appointment.id} · {tPOS.checkoutHdr}</p>
          </div>
          <span className="text-lg font-bold" style={{ color: "#34d399" }}>${grandTotal.toFixed(2)}</span>
        </div>
        {(guided || posStatus) && (
          <div className="px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-center"
            style={{ backgroundColor: "#242426", borderBottom: "1px solid #3a3a3c",
              color: guided ? "#f4d000" : posStatus!.tone === "error" ? "#fbbf24" : posStatus!.tone === "success" ? "#34d399" : "#9a9aa0" }}
            data-testid="pos-mobile-status">
            {guided
              ? tSt.qtStep(guidedT(guidedStep!).prompt, guided.i + 1, guided.steps.length)
              : posStatus!.text}
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "ticket" && (
            <div className="p-4 space-y-4" data-testid="pos-tab-ticket">
              <div className="rounded-md overflow-hidden" style={{ border: "1px solid #3a3a3c" }}>
                <div className="flex items-center justify-between p-3">
                  <div><p className="text-sm font-medium" style={{ color: "#f5f5f7" }}>{appointment.service?.name || "Service"}</p></div>
                  <span className="text-sm font-semibold" style={{ color: "#f5f5f7" }}>${servicePrice.toFixed(2)}</span>
                </div>
                {aptAddons.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-3" style={{ borderTop: "1px solid #3a3a3c" }}>
                    <p className="text-sm" style={{ color: "#f5f5f7" }}>+ {a.name}</p>
                    <span className="text-sm font-semibold" style={{ color: "#f5f5f7" }}>${Number(a.price).toFixed(2)}</span>
                  </div>
                ))}
                {posExtraItems.map((it) => (
                  <div key={it.id} className="flex items-center justify-between p-3" style={{ borderTop: "1px solid #3a3a3c" }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <button onClick={() => removePosExtraItem(it.id)} className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#3a2a2e", color: "#fb7185" }}><X className="w-2.5 h-2.5" /></button>
                      <p className="text-sm font-medium truncate" style={{ color: "#f5f5f7" }}>{it.name.startsWith("+") ? it.name : `+ ${it.name}`}</p>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: "#f5f5f7" }}>${it.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span style={{ color: "#8e8e93" }}>{tPOS.subtotal}</span><span style={{ color: "#e5e5e7" }}>${subtotal.toFixed(2)}</span></div>
                {tip > 0 && <div className="flex justify-between"><span style={{ color: "#8e8e93" }}>{tPOS.tip}</span><span style={{ color: "#e5e5e7" }}>${tip.toFixed(2)}</span></div>}
                {manualDiscount > 0 && <div className="flex justify-between" style={{ color: "#fb7185" }}><span>{tPOS.discount}{discountType === "percent" ? ` (${discountNum}%)` : ""}</span><span>&minus;${manualDiscount.toFixed(2)}</span></div>}
                {pendingRedemption && <div className="flex justify-between" style={{ color: "#34d399" }}><span>🎁 {pendingRedemption.name}</span><span>&minus;${pendingRedemption.dollarValue.toFixed(2)}</span></div>}
                {posTaxRate > 0 && <div className="flex justify-between"><span style={{ color: "#8e8e93" }}>{tPOS.tax} ({(posTaxRate * 100).toFixed(0)}%)</span><span style={{ color: "#e5e5e7" }}>${tax.toFixed(2)}</span></div>}
                <div className="flex justify-between font-bold text-lg pt-2" style={{ borderTop: "1px solid #3a3a3c", color: "#f5f5f7" }}><span>{tPOS.total}</span><span>${grandTotal.toFixed(2)}</span></div>
              </div>

              <button onClick={goCharge} className="w-full h-12 rounded-md font-semibold flex items-center justify-center gap-2" style={{ backgroundColor: "#16a34a", color: "#fff" }} data-testid="pos-mobile-charge">
                <Receipt className="w-4 h-4" /> Charge ${grandTotal.toFixed(2)}
              </button>
            </div>
          )}

          {activeTab === "keypad" && (
            <div className="p-4 space-y-3" data-testid="pos-tab-keypad">
              <div className="rounded-md text-right px-4 py-4 text-4xl font-mono" style={{ backgroundColor: "#0e0e10", border: "1px solid #3a3a3c", color: "#e8e8ea" }}>${kpVal.toFixed(2)}</div>
              {numPad(cartKpDigit, cartKpBack, cartKpClear)}
              {guided ? (
                <button
                  onClick={handleGuidedEnter}
                  className="w-full h-12 rounded-md font-bold"
                  style={{ backgroundColor: "#f4d000", color: "#1c1c1e" }}
                  data-testid="pos-mobile-guided-enter"
                >
                  {kpVal > 0
                    ? tSt.qtEnterAdd(kpVal.toFixed(2), guidedT(guidedStep!).label)
                    : tSt.qtEnterSkip(guidedT(guidedStep!).label)}
                </button>
              ) : pendingAmountAction ? (
                <button
                  onClick={() => { handlePosAction(pendingAmountAction); setPendingAmountAction(null); setPosMenuStack([]); setMobileTab("ticket"); }}
                  disabled={kpVal <= 0}
                  className="w-full h-12 rounded-md font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: "#16a34a" }}
                  data-testid="pos-mobile-keypad-apply"
                >
                  Apply to {(pendingAmountAction.label || "").replace(/\n/g, " ")} · ${kpVal.toFixed(2)}
                </button>
              ) : (
                <p className="text-center text-xs" style={{ color: "#8e8e93" }}>
                  Enter an amount, then use it on the Actions or Pay tab.
                </p>
              )}
            </div>
          )}

          {activeTab === "actions" && (
            <div className="p-4 space-y-3" data-testid="pos-tab-actions">
              {posMenuStack.length > 0 && (
                <button onClick={() => setPosMenuStack((s) => s.slice(0, -1))} className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#34d399" }}>
                  <ArrowLeft className="w-4 h-4" /> {pick(POS_MISC_TX.back)}
                </button>
              )}
              <div className="grid grid-cols-3 gap-2.5">
                {actionsList.map((b, i) => {
                  if (!b) return null;
                  const Icon = resolvePosIcon(b.icon);
                  const price = Number((b.action.payload as any)?.price) || 0;
                  return (
                    <button
                      key={b.id}
                      onClick={() => runMobileAction(b)}
                      className="relative flex flex-col items-center justify-center gap-1 rounded-lg py-3 min-h-[76px]"
                      style={{ backgroundColor: "#2a2a2c", border: "1px solid #3a3a3c", color: "#e5e5e7" }}
                      data-testid={`pos-mobile-action-${b.id}`}
                    >
                      {Icon ? <Icon className="w-5 h-5" /> : <span className="w-5 h-5 inline-block">•</span>}
                      <span className="text-[11px] font-semibold leading-tight text-center whitespace-pre-line">{posT(b.id, b.label)}</span>
                      {price > 0 && <span className="text-[10px]" style={{ color: "#8e8e93" }}>${price.toFixed(2)}</span>}
                      {b.action.type === "submenu" && <span className="absolute top-1 right-1.5 text-[10px]" style={{ color: "#8e8e93" }}>›</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "pay" && (
            <div className="p-4 space-y-4" data-testid="pos-tab-pay">
              <div className="flex items-center justify-between rounded-md px-4 py-3" style={{ backgroundColor: "#242426", border: "1px solid #3a3a3c" }}>
                <span className="text-sm font-semibold" style={{ color: balanceDue > 0 ? "#fb7185" : "#34d399" }}>
                  {balanceDue > 0 ? tPOS.balanceDue : tPOS.paidInFull}
                </span>
                <span className="text-xl font-bold" style={{ color: "#f5f5f7" }}>
                  ${(balanceDue > 0 ? balanceDue : changeDue).toFixed(2)}{balanceDue <= 0 && changeDue > 0 ? " change" : ""}
                </span>
              </div>

              <div className="rounded-md text-right px-4 py-3 text-3xl font-mono" style={{ backgroundColor: "#0e0e10", border: "1px solid #3a3a3c", color: "#e8e8ea" }}>${kpVal.toFixed(2)}</div>
              {numPad(cartKpDigit, cartKpBack, cartKpClear)}
              <button onClick={() => setCartKeypad(String(Math.max(0, Math.round(balanceDue * 100))))} className="w-full h-10 rounded-md text-sm font-semibold" style={{ backgroundColor: "#1f3a2f", border: "1px solid #16a34a", color: "#34d399" }}>
                {tPOS.exact} · ${Math.max(0, balanceDue).toFixed(2)}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => applyMobileTender("cash")} className="h-14 rounded-md font-semibold flex items-center justify-center gap-2 text-white" style={{ backgroundColor: "#16a34a" }} data-testid="pos-mobile-tender-cash">
                  <Banknote className="w-5 h-5" /> Cash
                </button>
                <button onClick={() => applyMobileTender("card")} className="h-14 rounded-md font-semibold flex items-center justify-center gap-2 text-white" style={{ backgroundColor: "#2563eb" }} data-testid="pos-mobile-tender-card">
                  <CreditCard className="w-5 h-5" /> Card
                </button>
                {isNative && (
                  <>
                    <button
                      onClick={() => {
                        if (nativeM2Active) return;
                        const cents = Math.round(balanceDue * 100);
                        if (cents <= 0) { showPosStatus(tSt.nothingDue, "error"); return; }
                        setNativeM2Active(true); setTermError("");
                        (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "M2_PAY", appointmentId: appointment?.id ?? 0, amountCents: cents, clientName: posCustomerName }));
                        showPosStatus(tSt.m2Insert, "info");
                      }}
                      disabled={nativeM2Active || balanceDue <= 0}
                      className="h-14 rounded-md font-semibold flex items-center justify-center gap-2 text-white disabled:opacity-50"
                      style={{ backgroundColor: "#4f46e5" }}
                      data-testid="pos-mobile-tender-m2"
                    >
                      {nativeM2Active ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                      {nativeM2Active ? "M2 active…" : "M2 Reader"}
                    </button>
                    <button
                      onClick={() => {
                        if (nativeM2Active) return;
                        const cents = Math.round(balanceDue * 100);
                        if (cents <= 0) { showPosStatus(tSt.nothingDue, "error"); return; }
                        setNativeM2Active(true); setTermError("");
                        (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "TAP_TO_PAY", appointmentId: appointment?.id ?? 0, amountCents: cents, clientName: posCustomerName }));
                        showPosStatus(tSt.tapPrompt, "info");
                      }}
                      disabled={nativeM2Active || balanceDue <= 0}
                      className="h-14 rounded-md font-semibold flex items-center justify-center gap-2 text-white disabled:opacity-50"
                      style={{ backgroundColor: "#7c3aed" }}
                      data-testid="pos-mobile-tender-tap"
                    >
                      {nativeM2Active ? <Loader2 className="w-5 h-5 animate-spin" /> : <Smartphone className="w-5 h-5" />}
                      {nativeM2Active ? "Tap active…" : "Tap to Pay"}
                    </button>
                  </>
                )}
                {/* Web browser (not the native app): Stripe Terminal M2 reader */}
                {!isNative && (() => {
                  const busy = termStatus === "collecting" || termStatus === "processing";
                  const connecting = termStatus === "loading" || termStatus === "discovering" || termStatus === "connecting";
                  const ready = (termStatus === "ready" || busy) && termReader;
                  return (
                    <button
                      onClick={ready ? handleM2Payment : handleConnectM2}
                      disabled={connecting || (ready && balanceDue <= 0)}
                      className="col-span-2 h-14 rounded-md font-semibold flex items-center justify-center gap-2 text-white disabled:opacity-50"
                      style={{ backgroundColor: "#4f46e5" }}
                      data-testid="pos-mobile-tender-m2"
                    >
                      {(busy || connecting) ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                      {ready
                        ? (termStatus === "collecting" ? "Waiting…" : termStatus === "processing" ? "Processing…" : `M2 · Charge $${Math.max(0, balanceDue).toFixed(2)}`)
                        : (termStatus === "loading" ? "Loading…" : termStatus === "discovering" ? "Scanning…" : termStatus === "connecting" ? "Connecting…" : termStatus === "error" ? "Retry M2" : "M2 Reader")}
                    </button>
                  );
                })()}
                {/* Web + dual-screen: tell the paired customer tablet to collect the tap */}
                {!isNative && dualScreenEnabled && (
                  <button
                    onClick={() => {
                      if (awaitingTapPay) {
                        awaitingTapPayAmtRef.current = 0; setAwaitingTapPay(false);
                        broadcastToKiosk("kiosk_checkout_cancel"); showPosStatus(tSt.tapCancelled, "info");
                        return;
                      }
                      const amt = balanceDue;
                      if (amt <= 0) return;
                      awaitingTapPayAmtRef.current = amt; setAwaitingTapPay(true);
                      broadcastToKiosk("kiosk_checkout_await_payment", { mode: "tap", total: amt, appointmentId: appointment?.id ?? 0 });
                      showPosStatus(tSt.tapSentScreen, "info");
                    }}
                    disabled={balanceDue <= 0 && !awaitingTapPay}
                    className="col-span-2 h-14 rounded-md font-semibold flex items-center justify-center gap-2 text-white disabled:opacity-50"
                    style={{ backgroundColor: "#7c3aed" }}
                    data-testid="pos-mobile-tender-tap"
                  >
                    {awaitingTapPay ? <Loader2 className="w-5 h-5 animate-spin" /> : <Smartphone className="w-5 h-5" />}
                    {awaitingTapPay ? "Cancel Tap to Pay" : "Tap to Pay (customer screen)"}
                  </button>
                )}
              </div>

              {tenders.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#8e8e93" }}>{tPOS.paymentsApplied}</p>
                  {tenders.map((t) => {
                    const Icon = getMethodIcon(t.method);
                    return (
                      <div key={t.id} className="flex items-center justify-between rounded-md p-2.5" style={{ backgroundColor: "#242426", border: "1px solid #3a3a3c" }}>
                        <span className="flex items-center gap-2 text-sm capitalize" style={{ color: "#e5e5e7" }}><Icon className="w-4 h-4" style={{ color: "#8e8e93" }} />{t.method}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: "#34d399" }}>${t.amount.toFixed(2)}</span>
                          <button onClick={() => handleRemoveTender(t.id)} style={{ color: "#8e8e93" }}><XCircle className="w-4 h-4" /></button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {paidInFull && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handlePrintAndComplete} disabled={isUpdating} className="h-12 rounded-md font-semibold flex items-center justify-center gap-2 disabled:opacity-50" style={{ backgroundColor: "#2a2a2c", border: "1px solid #3a3a3c", color: "#f5f5f7" }}>
                    <Printer className="w-4 h-4" /> {isUpdating ? tPOS.processing : tPOS.printReceipt}
                  </button>
                  <button onClick={handleCompleteTransaction} disabled={isUpdating} className="h-12 rounded-md font-semibold flex items-center justify-center gap-2 text-white disabled:opacity-50" style={{ backgroundColor: "#16a34a" }} data-testid="pos-mobile-complete">
                    <Check className="w-4 h-4" /> {isUpdating ? tPOS.processing : tPOS.noReceipt}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer tab nav */}
        <div className="flex" style={{ borderTop: "1px solid #3a3a3c", backgroundColor: "#2c2c2e", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {TABS.map((tb) => {
            const on = activeTab === tb.id;
            const Icon = tb.icon;
            return (
              <button
                key={tb.id}
                onClick={() => setMobileTab(tb.id)}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
                style={{ color: on ? "#34d399" : "#8e8e93", borderTop: on ? "2px solid #34d399" : "2px solid transparent" }}
                data-testid={`pos-mobile-tab-${tb.id}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold">{tb.label}</span>
              </button>
            );
          })}
        </div>

        {/* Full-screen tip step (pro turns the phone to the customer) */}
        {mobileTipOpen && (
          <div className="absolute inset-0 z-[64] flex flex-col items-center p-5 gap-4 overflow-y-auto" style={{ backgroundColor: "#161618" }} data-testid="pos-mobile-tip">
            <p className="text-xs font-bold uppercase tracking-widest mt-6" style={{ color: "#8e8e93" }}>Add a tip?</p>
            <p className="text-5xl font-black" style={{ color: "#f5f5f7" }}>${preTotal.toFixed(2)}</p>
            <div className="w-full max-w-sm grid grid-cols-3 gap-2">
              {TIP_PRESETS.map((tp, idx) => {
                const amt = (tp as any).percent ? preTotal * (tp as any).percent : ((tp as any).value || 0);
                return (
                  <button key={tp.label} onClick={() => applyTip("preset", idx)} className="rounded-xl py-3 flex flex-col items-center gap-0.5" style={{ backgroundColor: "#232325", border: "1px solid #3a3a3c" }} data-testid={`pos-mobile-tip-${idx}`}>
                    <span className="text-base font-bold" style={{ color: "#f5f5f7" }}>{tp.label}</span>
                    {(tp as any).percent ? <span className="text-xs" style={{ color: "#8e8e93" }}>${amt.toFixed(2)}</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="w-full max-w-sm space-y-2">
              <div className="rounded-md text-right px-4 py-2.5 text-2xl font-mono" style={{ backgroundColor: "#0e0e10", border: "1px solid #3a3a3c", color: "#e8e8ea" }}>${kpVal.toFixed(2)}</div>
              {numPad(cartKpDigit, cartKpBack, cartKpClear)}
              <button onClick={() => applyTip("custom", kpVal)} disabled={kpVal <= 0} className="w-full h-11 rounded-md font-semibold text-white disabled:opacity-40" style={{ backgroundColor: "#0d9d78" }}>
                Apply custom tip
              </button>
            </div>
            <button onClick={() => { const from = mobileTipOpen; setMobileTipDone(true); setMobileTipOpen(null); setCartKeypad(""); if (from === "charge") setMobileTab("pay"); }} className="text-sm pb-6" style={{ color: "#8e8e93" }}>
              Skip tip
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Desktop: one unified 3-panel sheet for the whole checkout ──
  //   Panel 1 = cart, Panel 2 = numpad. Panel 3 swaps between the function
  //   grid (cart phase) and the payment / tender panel (payment phase) — the
  //   "Finalize & Pay" button just flips `phase` in place, no second sheet.
  {
    const payKpVal = posKeypadDollars();
    const payPaidInFull = tenders.length > 0 && totalTendered >= grandTotal;
    return (
      <div className="fixed inset-0 z-50" data-testid="checkout-pos-panel">
        <button
          type="button"
          aria-label="Close checkout"
          className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
          onClick={onClose}
        />
        <div className="pos-cart-sheet absolute left-0 top-0 h-full w-full sm:w-[420px] lg:w-[1192px] max-w-[100vw] flex overflow-x-auto shadow-[8px_0_24px_rgba(0,0,0,0.12)]">
        {/* ── Panel 1 — Cart (dark) ── */}
        <div className="w-full sm:w-[420px] flex-shrink-0 flex flex-col overflow-hidden" style={{ backgroundColor: "#1c1c1e" }}>
        <div className="relative p-4 flex items-center justify-between gap-2" style={{ borderBottom: "1px solid #3a3a3c", backgroundColor: "#2c2c2e" }}>
          {posHasNamedClient ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{ backgroundColor: "#3a3a3c", color: "#f5f5f7" }}>
                {posCustomerName.charAt(0).toUpperCase()}
              </div>
              <span className="font-semibold text-base truncate" data-testid="pos-header-customer-name" style={{ color: "#f5f5f7" }}>{posCustomerName}</span>
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#2a2118", color: "#f5c451", border: "1px solid #4a3a1e" }}>
                <Star className="w-3 h-3" />
                {customerLoyaltyPoints}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0" style={{ borderColor: "#3f3f42", color: "#a1a1a6" }}>#{appointment.id}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" style={{ color: "#8e8e93" }} />
              <h2 className="font-semibold text-lg" style={{ color: "#f5f5f7" }}>{tPOS.checkoutHdr}</h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: "#3f3f42", color: "#a1a1a6" }}>#{appointment.id}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowPosSettings(v => !v)}
              data-testid="button-pos-settings"
              title="POS settings"
              style={{ color: showPosSettings ? "#f5f5f7" : "#8e8e93" }}
            >
              <Settings className="w-4 h-4" />
            </button>
            <button onClick={onClose} data-testid="button-close-checkout" style={{ color: "#8e8e93" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          {showPosSettings && (
            <>
              <button
                className="fixed inset-0 z-40 cursor-default"
                aria-label="Close settings"
                onClick={() => setShowPosSettings(false)}
              />
              <div
                className="absolute right-3 top-14 z-50 w-64 rounded-lg p-3 space-y-2 shadow-xl"
                style={{ backgroundColor: "#2c2c2e", border: "1px solid #3a3a3c" }}
                data-testid="pos-settings-menu"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#8e8e93" }}>
                  Card payment method
                </p>
                <p className="text-[11px] leading-snug" style={{ color: "#8e8e93" }}>
                  Used when the customer confirms the tip on the customer screen. Saved to this device.
                </p>
                {([
                  { key: "tap" as const, label: "Tap to Pay", icon: Smartphone, hint: "Phone / watch tap on the customer screen" },
                  { key: "m2" as const, label: "M2 Reader", icon: CreditCard, hint: "Bluetooth chip / swipe reader" },
                ]).map(opt => {
                  const active = cardMethod === opt.key;
                  const OptIcon = opt.icon;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => { updateCardMethod(opt.key); setShowPosSettings(false); }}
                      data-testid={`pos-card-method-${opt.key}`}
                      className="w-full flex items-start gap-2 rounded-md p-2 text-left"
                      style={{
                        backgroundColor: active ? "#1f3a2f" : "#242426",
                        border: `1px solid ${active ? "#16a34a" : "#3a3a3c"}`,
                      }}
                    >
                      <OptIcon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: active ? "#34d399" : "#8e8e93" }} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold" style={{ color: active ? "#34d399" : "#f5f5f7" }}>{opt.label}</span>
                        <span className="block text-[11px]" style={{ color: "#8e8e93" }}>{opt.hint}</span>
                      </span>
                      {active && <Check className="w-4 h-4 ml-auto flex-shrink-0" style={{ color: "#34d399" }} />}
                    </button>
                  );
                })}

                {/* One-time Tap to Pay enrollment — native Android app only */}
                {isNative && (
                  <div className="pt-1 mt-1 border-t" style={{ borderColor: "#3a3a3c" }}>
                    <button
                      onClick={startTapToPaySetup}
                      disabled={tapSetup.state === "running"}
                      data-testid="pos-setup-tap-to-pay"
                      className="w-full flex items-center gap-2 rounded-md p-2 text-left disabled:opacity-60"
                      style={{ backgroundColor: "#242426", border: "1px solid #3a3a3c" }}
                    >
                      {tapSetup.state === "running"
                        ? <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" style={{ color: "#8e8e93" }} />
                        : tapSetup.state === "ready"
                          ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#34d399" }} />
                          : <Smartphone className="w-4 h-4 flex-shrink-0" style={{ color: "#8e8e93" }} />}
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold" style={{ color: "#f5f5f7" }}>
                          {tapSetup.state === "ready" ? "Tap to Pay — ready" : "Set up Tap to Pay"}
                        </span>
                        <span className="block text-[11px]" style={{ color: tapSetup.state === "error" ? "#fb7185" : "#8e8e93" }}>
                          {tapSetup.msg || "One-time: accept Stripe's terms + grant location."}
                        </span>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {posHasNamedClient ? (
            /* Client name + points now live in the header — this row only needs
               the assigned staff. */
            appointment.staff ? (
              <div className="flex items-center justify-between" data-testid="pos-ticket-staff">
                <span className="text-[10px] uppercase tracking-wide" style={{ color: "#6b7280" }}>Staff</span>
                <span className="text-xs font-medium" style={{ color: "#d1d1d6" }}>{appointment.staff.name}</span>
              </div>
            ) : null
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ backgroundColor: "#2e2e30", color: "#e5e5e7" }}>
                {(posCustomerName || "W").charAt(0).toUpperCase()}
              </div>
              {/* Left — client name */}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate" data-testid="pos-customer-name" style={{ color: "#f5f5f7" }}>{posCustomerName}</p>
              </div>
              {/* Center — staff assigned to the ticket */}
              {appointment.staff && (
                <div className="flex flex-col items-center flex-shrink-0 px-2 leading-tight" data-testid="pos-ticket-staff">
                  <span className="text-[9px] uppercase tracking-wide" style={{ color: "#6b7280" }}>Staff</span>
                  <span className="text-xs font-medium" style={{ color: "#d1d1d6" }}>{appointment.staff.name}</span>
                </div>
              )}
              {/* Right — client points badge */}
              {(appointment as any).customerId && (
                <span
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full flex-shrink-0"
                  data-testid="pos-customer-points"
                  style={{ backgroundColor: "#2a2118", color: "#f5c451", border: "1px solid #4a3a1e" }}
                >
                  <Star className="w-3 h-3" />
                  {customerLoyaltyPoints} pts
                </span>
              )}
            </div>
          )}

          <div className="space-y-1">
            <h3 className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: "#8e8e93" }}>{tPOS.lineItems}</h3>
            <div className="rounded-md overflow-hidden" style={{ border: "1px solid #3a3a3c" }}>
              <div className="flex items-center justify-between p-3">
                <div>
                  <p className="text-sm font-medium" data-testid="pos-service-name" style={{ color: "#f5f5f7" }}>{appointment.service?.name}</p>
                </div>
                <span className="text-sm font-semibold" data-testid="pos-service-price" style={{ color: "#f5f5f7" }}>${servicePrice.toFixed(2)}</span>
              </div>
              {aptAddons.map((addon: any) => (
                <div key={addon.id} className="flex items-center justify-between p-3" style={{ borderTop: "1px solid #3a3a3c" }} data-testid={`pos-addon-${addon.id}`}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#f5f5f7" }}>+ {addon.name}</p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "#f5f5f7" }}>${Number(addon.price).toFixed(2)}</span>
                </div>
              ))}
              {posExtraItems.map((it) => (
                <div key={it.id} className="flex items-center justify-between p-3" style={{ borderTop: "1px solid #3a3a3c" }} data-testid={`pos-extra-${it.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      onClick={() => removePosExtraItem(it.id)}
                      className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "#3a2a2e", color: "#fb7185" }}
                      aria-label={`Remove ${it.name}`}
                      data-testid={`pos-extra-remove-${it.id}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                    <p className="text-sm font-medium truncate min-w-0" style={{ color: "#f5f5f7" }}>{it.name.startsWith("+") ? it.name : `+ ${it.name}`}</p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "#f5f5f7" }}>${it.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Linked tickets (Group Pay) */}
          {linkedAppointments.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: "#8e8e93" }}>
                  Linked Tickets · {linkedAppointments.length}
                </h3>
                <button className="text-[11px] font-semibold" style={{ color: "#2dd4bf" }} onClick={() => setShowLinkPicker(true)}>Edit</button>
              </div>
              <div className="rounded-md overflow-hidden" style={{ border: "1px solid #3a3a3c" }}>
                {linkedAppointments.map((a, i) => {
                  const nm = (a as any).customer?.fullName || a.customer?.name || (a as any).customerName || tPOS.walkIn;
                  return (
                    <div key={a.id} className="flex items-center justify-between p-3" style={i > 0 ? { borderTop: "1px solid #3a3a3c" } : undefined} data-testid={`pos-linked-${a.id}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => setLinkedIds((ids) => ids.filter((x) => x !== a.id))}
                          className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: "#3a2a2e", color: "#fb7185" }}
                          aria-label={`Unlink ${nm}`}
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "#f5f5f7" }}>{nm}</p>
                          <p className="text-xs truncate" style={{ color: "#8e8e93" }}>{a.service?.name}{a.staff ? ` · ${a.staff.name}` : ""}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: "#f5f5f7" }}>${ticketSubtotal(a).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px]" style={{ color: "#8e8e93" }}>
                Each ticket is paid & completed on its own — tip and discount split by service value, so every tech keeps their commission.
              </p>
            </div>
          )}
        </div>

        <div className="p-4 space-y-3" style={{ borderTop: "1px solid #3a3a3c", backgroundColor: "#2c2c2e" }}>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span style={{ color: "#8e8e93" }}>{tPOS.subtotal}</span>
              <span data-testid="pos-subtotal" style={{ color: "#e5e5e7" }}>${subtotal.toFixed(2)}</span>
            </div>
            {tip > 0 && (() => {
              const tipPct = discountedSubtotal > 0 ? Math.round((tip / discountedSubtotal) * 100) : 0;
              return (
                <div className="flex justify-between">
                  <span style={{ color: "#8e8e93" }}>{tPOS.tip}{tipPct > 0 ? ` (${tipPct}%)` : ""}</span>
                  <span data-testid="pos-tip" style={{ color: "#e5e5e7" }}>${tip.toFixed(2)}</span>
                </div>
              );
            })()}
            {manualDiscount > 0 && (
              <div className="flex justify-between" style={{ color: "#fb7185" }}>
                <span>{tPOS.discount}{discountType === "percent" ? ` (${discountNum}%)` : ""}</span>
                <span data-testid="pos-discount">&minus;${manualDiscount.toFixed(2)}</span>
              </div>
            )}
            {pendingRedemption && (
              <div className="flex justify-between" style={{ color: "#34d399" }}>
                <span>🎁 {pendingRedemption.name}</span>
                <span data-testid="pos-redemption">&minus;${pendingRedemption.dollarValue.toFixed(2)}</span>
              </div>
            )}
            {posTaxRate > 0 && (
              <div className="flex justify-between">
                <span style={{ color: "#8e8e93" }}>{tPOS.tax} ({(posTaxRate * 100).toFixed(0)}%)</span>
                <span data-testid="pos-tax" style={{ color: "#e5e5e7" }}>${tax.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg pt-2" style={{ borderTop: "1px solid #3a3a3c", color: "#f5f5f7" }}>
              <span>{tPOS.total}</span>
              <span data-testid="pos-total">${grandTotal.toFixed(2)}</span>
            </div>
            {phase === "payment" && tenders.length > 0 && (
              <>
                {tenders.map((t) => (
                  <div key={t.id} className="flex justify-between" style={{ color: "#34d399" }}>
                    <span className="capitalize">
                      {t.method === "m2" ? "M2 Card" : t.method === "tap" ? "Tap to Pay" : t.method}
                    </span>
                    <span data-testid={`pos-left-tender-${t.id}`}>&minus;${t.amount.toFixed(2)}</span>
                  </div>
                ))}
                <div
                  className="flex justify-between font-bold pt-2"
                  style={{ borderTop: "1px solid #3a3a3c", color: balanceDue > 0 ? "#fb7185" : "#34d399" }}
                >
                  <span>{balanceDue > 0 ? tPOS.balanceDue : changeDue > 0 ? "Change Due" : tPOS.paidInFull}</span>
                  <span data-testid="pos-balance-due">${(balanceDue > 0 ? balanceDue : changeDue).toFixed(2)}</span>
                </div>
              </>
            )}
          </div>

          {phase === "cart" ? (
            <button
              className="w-full h-12 rounded-md font-semibold flex items-center justify-center gap-2"
              style={{ backgroundColor: "#16a34a", color: "#fff" }}
              onClick={() => setPhase("payment")}
              data-testid="button-finalize-pay"
            >
              <Receipt className="w-4 h-4" />
              {tPOS.finalizePay}
            </button>
          ) : (
            <button
              className="w-full h-12 rounded-md font-semibold flex items-center justify-center gap-2"
              style={{ backgroundColor: "#2a2a2c", border: "1px solid #3a3a3c", color: "#f5f5f7" }}
              onClick={() => setPhase("cart")}
              data-testid="button-back-to-cart"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Cart
            </button>
          )}
          <button
            className="w-full h-9 rounded-md text-sm"
            style={{ color: "#8e8e93" }}
            onClick={() => { broadcastToKiosk("kiosk_checkout_cancel"); onClose(); }}
            data-testid="button-abort-checkout"
          >
            {tPOS.backToAppt}
          </button>
        </div>
        </div>
        {/* ── Panels 2 & 3 — dark POS keypad (header + centred keypad + footer) ── */}
        <div className="hidden lg:flex w-[772px] flex-shrink-0 flex-col" style={{ backgroundColor: "#1c1c1e", borderLeft: "1px solid #3a3a3c" }}>

          {/* Top status bar — replaces all POS toasts */}
          <div
            style={{
              backgroundColor: "#2c2c2e", borderBottom: "1px solid #3a3a3c", height: 46, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px",
            }}
            data-testid="pos-status-bar"
          >
            <span
              style={{
                fontSize: 15, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", textAlign: "center",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%",
                color: guided ? "#f4d000"
                     : posStatus?.tone === "error" ? "#fbbf24"
                     : posStatus?.tone === "success" ? "#34d399"
                     : "#9a9aa0",
              }}
            >
              {guided
                ? tSt.qtHeaderHint(guidedT(guidedStep!).prompt, posKeypadDollars(), guided.i + 1, guided.steps.length)
                : (posStatus?.text ?? "")}
            </span>
          </div>

          {/* Middle — vertically centred keypad + function grid */}
          <div className="flex-1 flex items-center justify-center" style={{ padding: "0 14px", minHeight: 0 }}>
            <div className="flex" style={{ gap: 20 }}>

              {/* Numpad */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 82px)", gridAutoRows: "72px", columnGap: 6, rowGap: 8 }} data-testid="cart-keypad">
                {/* Display */}
                <div style={{
                  gridColumn: "1 / span 4", height: 72, boxSizing: "border-box",
                  backgroundColor: "#0e0e10", border: "1px solid #3a3a3c", borderRadius: 4,
                  boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6)",
                  display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 20px",
                  fontSize: 40, fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
                  color: "#e8e8ea", fontWeight: 500, letterSpacing: 1,
                }} data-testid="cart-keypad-display">
                  {phase === "payment" ? `$${payKpVal.toFixed(2)}` : (cartKeypad || "0")}
                </div>

                {/* 7 8 9 ⌫ */}
                {["7", "8", "9"].map(n => <button key={n} style={KP_NUM} onClick={() => cartKpDigit(n)}>{n}</button>)}
                <button style={KP_NUM} onClick={cartKpBack} aria-label="Backspace"><Delete style={{ width: 26, height: 26, color: "#c7c7cc" }} /></button>

                {/* 4 5 6 CLEAR */}
                {["4", "5", "6"].map(n => <button key={n} style={KP_NUM} onClick={() => cartKpDigit(n)}>{n}</button>)}
                <button style={{ ...KP_NUM, fontSize: 15, fontWeight: 600 }} onClick={cartKpClear}>CLEAR</button>

                {/* 1 2 3 ERC */}
                {["1", "2", "3"].map(n => <button key={n} style={KP_NUM} onClick={() => cartKpDigit(n)}>{n}</button>)}
                <button
                  style={{ ...KP_NUM, backgroundColor: "#3a2a2e", border: "1px solid #5a3a3e", color: "#fb7185", fontSize: 17, fontWeight: 700, letterSpacing: 1 }}
                  onClick={handleErc}
                  title={guided ? tSt.qtClearExit : tSt.qtErrorCorrect}
                >
                  {guided ? "EXIT" : "ERC"}
                </button>

                {/* 00 0 ENTER */}
                <button style={KP_NUM} onClick={() => cartKpDigit("00")}>00</button>
                <button style={KP_NUM} onClick={() => cartKpDigit("0")}>0</button>
                <button
                  style={{ ...KP_NUM, gridColumn: "span 2", backgroundColor: guided ? "#f4d000" : "#0d9d78", border: `1px solid ${guided ? "#f4d000" : "#0d9d78"}`, color: guided ? "#1c1c1e" : "#fff", fontSize: 20, fontWeight: 700, letterSpacing: 1 }}
                  onClick={() => {
                    if (guided) { handleGuidedEnter(); return; }
                    // In the payment phase, ENTER commits the keypad amount as a cash payment.
                    if (phase === "payment") applyMobileTender("cash");
                  }}
                  data-testid="cart-keypad-enter"
                >
                  ENTER
                </button>

                {/* Beneath the numpad: business-type utility buttons, or quick-cash fallback */}
                {posLayout.keypadButtons
                  ? Array.from({ length: 4 }).map((_, i) => {
                      const b = posLayout.keypadButtons?.[i] ?? null;
                      if (!b) {
                        return <div key={`kpfn-gap-${i}`} style={{ ...KP_NUM, cursor: "default", backgroundColor: "#242426" }} aria-hidden="true" />;
                      }
                      const Icon = resolvePosIcon(b.icon);
                      return (
                        <button
                          key={b.id}
                          style={{
                            ...KP_FN_BASE, minHeight: 0, fontSize: 11, gap: 1, padding: "2px 2px",
                            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -4px 0 ${b.band ?? "#6b7280"}`,
                            opacity: b.enabled === false ? 0.4 : 1,
                          }}
                          onClick={() => b.enabled !== false && handlePosAction(b)}
                          disabled={b.enabled === false}
                          data-testid={`cart-kpfn-${b.id}`}
                        >
                          {Icon
                            ? <Icon style={{ width: 20, height: 20, strokeWidth: 1.5 }} />
                            : <span style={{ width: 20, height: 20, display: "inline-block" }}>•</span>}
                          <span style={{ whiteSpace: "pre-line" }}>{posT(b.id, b.label)}</span>
                        </button>
                      );
                    })
                  : [["$1", "100"], ["$5", "500"], ["$10", "1000"], ["$20", "2000"]].map(([label, val]) => (
                      <button key={label} style={{ ...KP_NUM, fontSize: 19, color: "#34d399", fontWeight: 600 }} onClick={() => setCartKeypad(val)}>
                        {label}
                      </button>
                    ))}
              </div>

              {phase === "cart" ? (
              /* Function grid — data-driven from the business-type POS layout */
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${posLayout.columns}, 116px)`, gridAutoRows: "84px", columnGap: 8, rowGap: 8 }} data-testid="cart-fn-grid">
                {posMenuStack.length > 0 && (
                  <button
                    style={{ ...KP_FN_BASE, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -4px 0 #6b7280" }}
                    onClick={() => setPosMenuStack((s) => s.slice(0, -1))}
                    data-testid="cart-fn-back"
                  >
                    <ArrowLeft style={{ width: 22, height: 22, strokeWidth: 1.75, marginBottom: 2 }} />
                    <span>{pick(POS_MISC_TX.back)}</span>
                  </button>
                )}
                {posButtons.map((b, i) => {
                  if (!b) {
                    return <div key={`gap-${i}`} style={{ border: "1px solid #3a3a3c", borderRadius: 4, backgroundColor: "#242426" }} />;
                  }
                  const band = b.band ?? KP_ROW_BANDS[Math.floor((i + posMenuStack.length) / posLayout.columns) % KP_ROW_BANDS.length];
                  const Icon = resolvePosIcon(b.icon);
                  return (
                    <button
                      key={b.id}
                      style={{ ...KP_FN_BASE, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -4px 0 ${band}`, opacity: b.enabled === false ? 0.4 : 1 }}
                      onClick={() => b.enabled !== false && handlePosAction(b)}
                      disabled={b.enabled === false}
                      data-testid={`cart-fn-btn-${b.id}`}
                    >
                      {Icon
                        ? <Icon style={{ width: 24, height: 24, strokeWidth: 1.5, marginBottom: 2 }} />
                        : <span style={{ width: 24, height: 24, marginBottom: 2, display: "inline-block" }}>•</span>}
                      <span style={{ whiteSpace: "pre-line" }}>{posT(b.id, b.label)}</span>
                      {b.action.type === "submenu" && (
                        <span style={{ position: "absolute", top: 4, right: 6, fontSize: 10, color: "#8e8e93" }}>›</span>
                      )}
                    </button>
                  );
                })}
              </div>
              ) : (
              /* Payment / tender panel — replaces the function grid in payment phase */
              <div style={{ width: 372, display: "flex", flexDirection: "column", gap: 10, alignSelf: "flex-start", maxHeight: 452, overflowY: "auto" }} data-testid="pos-payment-panel">
                <div style={{ backgroundColor: "#242426", border: "1px solid #3a3a3c", borderRadius: 6, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: balanceDue > 0 ? "#fb7185" : "#34d399" }}>
                    {balanceDue > 0 ? tPOS.balanceDue : tPOS.paidInFull}
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: "#f5f5f7" }} data-testid="pos-balance-due">
                    ${(balanceDue > 0 ? balanceDue : (changeDue || 0)).toFixed(2)}{balanceDue <= 0 && changeDue > 0 ? " chg" : ""}
                  </span>
                </div>

                <button
                  onClick={() => setCartKeypad(String(Math.max(0, Math.round(balanceDue * 100))))}
                  style={{ height: 40, borderRadius: 6, backgroundColor: "#1f3a2f", border: "1px solid #16a34a", color: "#34d399", fontSize: 13, fontWeight: 700, flexShrink: 0 }}
                  data-testid="pos-pay-exact"
                >
                  {tPOS.exact} · ${Math.max(0, balanceDue).toFixed(2)}
                </button>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => applyMobileTender("cash")} style={{ height: 56, borderRadius: 6, backgroundColor: "#16a34a", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} data-testid="tender-cash">
                    <Banknote className="w-5 h-5" /> Cash
                  </button>
                  <button onClick={() => applyMobileTender("card")} style={{ height: 56, borderRadius: 6, backgroundColor: "#2563eb", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} data-testid="tender-card">
                    <CreditCard className="w-5 h-5" /> Card
                  </button>
                  {/* ── M2 Reader — Bluetooth Stripe M2 card reader ──
                      In the native Android app this fires the device bridge
                      (M2_PAY); it never records a keypad tender. In a web
                      browser it drives the Stripe Terminal JS SDK. */}
                  {(() => {
                    const M2_STYLE: React.CSSProperties = { gridColumn: "span 2", height: 56, borderRadius: 6, backgroundColor: "#4f46e5", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 };
                    if (isNative) {
                      return (
                        <button
                          style={{ ...M2_STYLE, opacity: (balanceDue <= 0 || nativeM2Active) ? 0.5 : 1 }}
                          disabled={balanceDue <= 0 || nativeM2Active}
                          onClick={() => {
                            if (nativeM2Active) return;
                            const cents = Math.round(balanceDue * 100);
                            if (cents <= 0) { showPosStatus(tSt.nothingDue, "error"); return; }
                            setNativeM2Active(true); setTermError("");
                            (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "M2_PAY", appointmentId: appointment?.id ?? 0, amountCents: cents, clientName: posCustomerName }));
                            showPosStatus(tSt.m2Insert, "info");
                          }}
                          data-testid="tender-m2"
                        >
                          {nativeM2Active ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                          {nativeM2Active ? "M2 active…" : `M2 Reader · $${Math.max(0, balanceDue).toFixed(2)}`}
                        </button>
                      );
                    }
                    const busy = termStatus === "collecting" || termStatus === "processing";
                    const connecting = termStatus === "loading" || termStatus === "discovering" || termStatus === "connecting";
                    if ((termStatus === "ready" || busy) && termReader) {
                      return (
                        <button style={{ ...M2_STYLE, opacity: balanceDue <= 0 ? 0.5 : 1 }} disabled={balanceDue <= 0} onClick={handleM2Payment} data-testid="tender-m2">
                          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                          {termStatus === "collecting" ? "Waiting…" : termStatus === "processing" ? "Processing…" : `Charge $${balanceDue.toFixed(2)}`}
                        </button>
                      );
                    }
                    return (
                      <button style={{ ...M2_STYLE, opacity: connecting ? 0.5 : 1 }} disabled={connecting} onClick={handleConnectM2} data-testid="tender-m2">
                        {connecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                        {termStatus === "loading" ? "Loading…" : termStatus === "discovering" ? "Scanning…" : termStatus === "connecting" ? "Connecting…" : termStatus === "error" ? "Retry M2" : "M2 Reader"}
                      </button>
                    );
                  })()}

                  {/* ── Tap to Pay ──
                      Native Android: fires the device bridge (TAP_TO_PAY) to
                      run Tap to Pay on this phone's NFC — no keypad tender.
                      Web + dual-screen: tells the paired customer tablet to
                      collect the tap. Hidden otherwise. */}
                  {isNative ? (
                    <button
                      style={{ gridColumn: "span 2", height: 56, borderRadius: 6, backgroundColor: "#c026d3", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: (balanceDue <= 0 || nativeM2Active) ? 0.5 : 1 }}
                      disabled={balanceDue <= 0 || nativeM2Active}
                      onClick={() => {
                        if (nativeM2Active) return;
                        const cents = Math.round(balanceDue * 100);
                        if (cents <= 0) { showPosStatus(tSt.nothingDue, "error"); return; }
                        setNativeM2Active(true); setTermError("");
                        (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "TAP_TO_PAY", appointmentId: appointment?.id ?? 0, amountCents: cents, clientName: posCustomerName }));
                        showPosStatus(tSt.tapPrompt, "info");
                      }}
                      data-testid="tender-tap"
                    >
                      {nativeM2Active ? <Loader2 className="w-5 h-5 animate-spin" /> : <Smartphone className="w-5 h-5" />}
                      {nativeM2Active ? "Tap to Pay active…" : `Tap to Pay · $${Math.max(0, balanceDue).toFixed(2)}`}
                    </button>
                  ) : dualScreenEnabled ? (
                    <button
                      style={{ gridColumn: "span 2", height: 56, borderRadius: 6, backgroundColor: "#c026d3", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: (balanceDue <= 0 && !awaitingTapPay) ? 0.5 : 1 }}
                      disabled={balanceDue <= 0 && !awaitingTapPay}
                      onClick={() => {
                        if (awaitingTapPay) {
                          awaitingTapPayAmtRef.current = 0; setAwaitingTapPay(false);
                          broadcastToKiosk("kiosk_checkout_cancel"); showPosStatus(tSt.tapCancelled, "info");
                          return;
                        }
                        const amt = balanceDue;
                        if (amt <= 0) return;
                        awaitingTapPayAmtRef.current = amt; setAwaitingTapPay(true);
                        broadcastToKiosk("kiosk_checkout_await_payment", { mode: "tap", total: amt, appointmentId: appointment?.id ?? 0 });
                        showPosStatus(tSt.tapSentScreen, "info");
                      }}
                      data-testid="tender-tap"
                    >
                      {awaitingTapPay ? <Loader2 className="w-5 h-5 animate-spin" /> : <Smartphone className="w-5 h-5" />}
                      {awaitingTapPay ? "Cancel Tap to Pay" : "Tap to Pay (customer screen)"}
                    </button>
                  ) : null}
                </div>
                {termError && <p style={{ fontSize: 11, color: "#f87171", flexShrink: 0 }}>{termError}</p>}

                {tenders.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#8e8e93" }}>{tPOS.paymentsApplied}</p>
                    {tenders.map((t) => {
                      const Icon = getMethodIcon(t.method);
                      return (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#242426", border: "1px solid #3a3a3c", borderRadius: 6, padding: "8px 10px" }} data-testid={`tender-line-${t.id}`}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, textTransform: "capitalize", color: "#e5e5e7" }}>
                            <Icon className="w-4 h-4" style={{ color: "#8e8e93" }} />{t.method}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#34d399" }}>${t.amount.toFixed(2)}</span>
                            <button onClick={() => handleRemoveTender(t.id)} style={{ color: "#8e8e93" }}><XCircle className="w-4 h-4" /></button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {payPaidInFull && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flexShrink: 0, marginTop: "auto" }}>
                    <button onClick={handlePrintAndComplete} disabled={isUpdating} style={{ height: 48, borderRadius: 6, backgroundColor: "#2a2a2c", border: "1px solid #3a3a3c", color: "#f5f5f7", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: isUpdating ? 0.5 : 1 }} data-testid="button-print-receipt">
                      <Printer className="w-4 h-4" /> {isUpdating ? tPOS.processing : tPOS.printReceipt}
                    </button>
                    <button onClick={handleCompleteTransaction} disabled={isUpdating} style={{ height: 48, borderRadius: 6, backgroundColor: "#16a34a", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: isUpdating ? 0.5 : 1 }} data-testid="button-no-receipt">
                      <Check className="w-4 h-4" /> {isUpdating ? tPOS.processing : tPOS.noReceipt}
                    </button>
                  </div>
                )}
              </div>
              )}

            </div>
          </div>

          {/* Bottom footer bar */}
          <div style={{ backgroundColor: "#2c2c2e", borderTop: "1px solid #3a3a3c", height: 84, flexShrink: 0, display: "flex", alignItems: "stretch", justifyContent: "flex-end" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "0 20px", color: "#34d399", fontSize: 14, fontWeight: 600, letterSpacing: 1 }}>SYS OK</div>
            <div style={{ width: 6, backgroundColor: "#34d399" }} />
          </div>

        </div>
        </div>

        {/* ── Group Pay: link other active tickets ── */}
        {showLinkPicker && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }} onClick={() => setShowLinkPicker(false)}>
            <div className="w-full max-w-md max-h-[80vh] flex flex-col rounded-xl overflow-hidden" style={{ backgroundColor: "#1c1c1e", border: "1px solid #3a3a3c" }} onClick={(e) => e.stopPropagation()}>
              <div className="p-4 flex items-center justify-between" style={{ borderBottom: "1px solid #2b2b2f" }}>
                <div>
                  <h3 className="text-[15px] font-bold" style={{ color: "#f5f5f7" }}>Link tickets — Group Pay</h3>
                  <p className="text-xs mt-0.5" style={{ color: "#8e8e93" }}>Add other active tickets so one person pays for all.</p>
                </div>
                <button onClick={() => setShowLinkPicker(false)} style={{ color: "#8e8e93" }}><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {linkableTickets.length === 0 && (
                  <p className="py-8 text-center text-sm" style={{ color: "#8e8e93" }}>No other active tickets right now.</p>
                )}
                {linkableTickets.map((a) => {
                  const on = linkedIds.includes(a.id);
                  const nm = (a as any).customer?.fullName || a.customer?.name || (a as any).customerName || tPOS.walkIn;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setLinkedIds((ids) => on ? ids.filter((x) => x !== a.id) : [...ids, a.id])}
                      className="w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors"
                      style={{ backgroundColor: on ? "rgba(45,212,191,0.1)" : "#2a2a2c", border: `1px solid ${on ? "rgba(45,212,191,0.4)" : "#3a3a3c"}` }}
                      data-testid={`link-ticket-${a.id}`}
                    >
                      <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ border: `1px solid ${on ? "#2dd4bf" : "#4a4a4f"}`, backgroundColor: on ? "#2dd4bf" : "transparent" }}>
                        {on && <Check className="w-3.5 h-3.5" style={{ color: "#0d0d0f" }} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate" style={{ color: "#f5f5f7" }}>{nm}</p>
                        <p className="text-xs truncate" style={{ color: "#8e8e93" }}>
                          {a.service?.name}{a.staff ? ` · ${a.staff.name}` : ""} · {formatInTz(a.date, timezone, "h:mm a")}
                        </p>
                      </div>
                      <span className="text-sm font-semibold flex-shrink-0" style={{ color: "#e5e5e7" }}>${ticketSubtotal(a).toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="p-3" style={{ borderTop: "1px solid #2b2b2f" }}>
                <button
                  onClick={() => setShowLinkPicker(false)}
                  className="w-full h-11 rounded-lg font-semibold text-white"
                  style={{ backgroundColor: "#0d9d78" }}
                >
                  {linkedIds.length > 0 ? `Done · ${linkedIds.length} linked` : "Done"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Loyalty: redeem a reward (points → $ off) ── */}
        {showRewardPicker && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }} onClick={() => setShowRewardPicker(false)}>
            <div className="w-full max-w-md max-h-[80vh] flex flex-col rounded-xl overflow-hidden" style={{ backgroundColor: "#1c1c1e", border: "1px solid #3a3a3c" }} onClick={(e) => e.stopPropagation()}>
              <div className="p-4 flex items-center justify-between" style={{ borderBottom: "1px solid #2b2b2f" }}>
                <div>
                  <h3 className="text-[15px] font-bold" style={{ color: "#f5f5f7" }}>Redeem a reward</h3>
                  <p className="text-xs mt-0.5" style={{ color: "#8e8e93" }}>{customerLoyaltyPoints} points available</p>
                </div>
                <button onClick={() => setShowRewardPicker(false)} style={{ color: "#8e8e93" }}><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {pendingRedemption && (
                  <button
                    onClick={() => { setPendingRedemption(null); showPosStatus(tSt.rewardRemoved, "info"); setShowRewardPicker(false); }}
                    className="w-full rounded-lg p-3 text-left text-sm font-semibold"
                    style={{ backgroundColor: "#3a2a2e", border: "1px solid #5a3a3e", color: "#fb7185" }}
                  >
                    ✕ Remove “{pendingRedemption.name}” (−${pendingRedemption.dollarValue.toFixed(2)})
                  </button>
                )}
                {loyaltyRewards.filter(r => r.isActive).length === 0 && (
                  <p className="py-8 text-center text-sm" style={{ color: "#8e8e93" }}>No rewards set up. Add them in Loyalty settings.</p>
                )}
                {loyaltyRewards.filter(r => r.isActive).map((r) => {
                  const affordable = customerLoyaltyPoints >= r.pointsCost;
                  const chosen = pendingRedemption?.rewardId === r.id;
                  return (
                    <button
                      key={r.id}
                      disabled={!affordable && !chosen}
                      onClick={() => {
                        setPendingRedemption({ rewardId: r.id, name: r.name, pointsCost: r.pointsCost, dollarValue: r.dollarValue });
                        showPosStatus(tSt.rewardApplied(r.dollarValue.toFixed(2)), "success");
                        setShowRewardPicker(false);
                      }}
                      className="w-full flex items-center justify-between gap-3 rounded-lg p-3 text-left"
                      style={{
                        backgroundColor: chosen ? "rgba(45,212,191,0.1)" : "#2a2a2c",
                        border: `1px solid ${chosen ? "rgba(45,212,191,0.4)" : "#3a3a3c"}`,
                        opacity: affordable || chosen ? 1 : 0.4,
                      }}
                      data-testid={`reward-${r.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "#f5f5f7" }}>{r.name}</p>
                        <p className="text-xs" style={{ color: "#8e8e93" }}>
                          {r.pointsCost.toLocaleString()} pts{!affordable && !chosen ? ` · needs ${r.pointsCost - customerLoyaltyPoints} more` : ""}
                        </p>
                      </div>
                      <span className="text-sm font-bold flex-shrink-0" style={{ color: "#34d399" }}>${r.dollarValue.toFixed(2)} off</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  return null;
}

function WalkInCheckoutPanel({ onClose, onThermalPrint }: { onClose: () => void; onThermalPrint?: (bytes: Uint8Array) => Promise<void> }) {
  const { pick } = useLanguage();
  const tSt = {
    readerFailed:    pick({ en: "Reader connection failed",  vi: "Kết nối đầu đọc thất bại",   es: "Falló la conexión del lector", fr: "Échec de connexion du lecteur" }),
    cardFailed:      pick({ en: "Card payment failed",       vi: "Thanh toán thẻ thất bại",    es: "El pago con tarjeta falló",    fr: "Échec du paiement par carte" }),
    paymentApproved: pick({ en: "Payment approved",          vi: "Đã duyệt thanh toán",        es: "Pago aprobado",                fr: "Paiement approuvé" }),
    paymentApprovedDesc: (brand: string, last4: string, amt: string) => pick({
      en: `${brand} ···${last4} charged $${amt}`, vi: `${brand} ···${last4} đã tính $${amt}`,
      es: `${brand} ···${last4} cobrado $${amt}`, fr: `${brand} ···${last4} débité de $${amt}` }),
    m2Connected:     pick({ en: "M2 reader connected",       vi: "Đã kết nối đầu đọc M2",       es: "Lector M2 conectado",          fr: "Lecteur M2 connecté" }),
    m2ConnectedDesc: (name: string) => pick({ en: `${name} is ready.`, vi: `${name} đã sẵn sàng.`, es: `${name} está listo.`, fr: `${name} est prêt.` }),
    noTipSelected:   pick({ en: "No tip selected by client", vi: "Khách chưa chọn tiền tip",    es: "El cliente no eligió propina", fr: "Le client n'a pas choisi de pourboire" }),
  };
  const { selectedStore: _wiStore } = useSelectedStore();
  const timezone = _wiStore?.timezone || "UTC";
  const [phase, setPhase] = useState<"amount" | "payment">("amount");
  const [amountDisplay, setAmountDisplay] = useState("0");
  const [tenders, setTenders] = useState<TenderLine[]>([]);
  const [keypadDisplay, setKeypadDisplay] = useState("0");
  const [nextTenderId, setNextTenderId] = useState(1);
  const [showComplete, setShowComplete] = useState(false);

  // ── Stripe Terminal M2 state ──────────────────────────────────────────────
  const [wiTermStatus, setWiTermStatus] = useState<"idle"|"loading"|"discovering"|"connecting"|"ready"|"collecting"|"processing"|"error">("idle");
  const [wiTermReader, setWiTermReader] = useState<any>(null);
  const [wiTermError, setWiTermError] = useState("");
  // Native app: tracks whether the M2 overlay is active for walk-in payments
  const [wiNativeM2Active, setWiNativeM2Active] = useState(false);
  const wiTermRef = useRef<any>(null);
  const { toast } = useToast();

  // ── Dual Screen POS ───────────────────────────────────────────────────────
  const { selectedStore: wiStore } = useSelectedStore();
  const wiStoreId = wiStore?.id ?? null;
  const [dualScreenEnabled, setDualScreenEnabled] = useState(false);
  const [waitingForTip, setWaitingForTip] = useState(false);
  // Walk-in checkout has no separate subtotal/tip breakdown — amountDisplay
  // is a single lump sum staff keys in, and any tip the customer selects on
  // the kiosk gets added directly on top of it (see kiosk_checkout_tip_selected
  // below). Track how much of amountDisplay is already-received tip so that if
  // "Send Tip Screen to Customer" is clicked again, we can send the kiosk the
  // pre-tip base — not a total that already has a tip baked into it, which
  // would compound (double-count) tip on a second round.
  const [tipReceived, setTipReceived] = useState(0);

  useEffect(() => {
    if (!wiStoreId) return;
    fetch("/api/kiosk-settings", { credentials: "include" })
      .then(r => r.json())
      .then(d => setDualScreenEnabled(d.dualScreenMode === true))
      .catch(() => {});
  }, [wiStoreId]);

  useEffect(() => {
    if (!wiStoreId || !dualScreenEnabled) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/notifications?storeId=${wiStoreId}`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "kiosk_checkout_tip_selected") {
          const tip = Number(msg.tipAmount) || 0;
          if (tip > 0) {
            setAmountDisplay(prev => (Math.round((Number(prev) + tip) * 100) / 100).toFixed(2));
            setTipReceived(prev => Math.round((prev + tip) * 100) / 100);
            toast({ title: `Tip received: ${tip.toFixed(2)}` });
          } else {
            toast({ title: tSt.noTipSelected });
          }
          setWaitingForTip(false);
        }
      } catch {}
    };
    ws.onerror = () => {};
    return () => { ws.close(); };
  }, [wiStoreId, dualScreenEnabled]);

  const broadcastToKiosk = (type: string, payload: Record<string, unknown> = {}) => {
    if (!wiStoreId || !dualScreenEnabled) return;
    fetch("/api/kiosk/checkout-event", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...payload }),
    }).catch(() => {});
  };

  const handleClose = () => {
    broadcastToKiosk("kiosk_checkout_cancel");
    onClose();
  };

  const grandTotal = Number(amountDisplay) || 0;
  const totalTendered = tenders.reduce((sum, t) => sum + t.amount, 0);
  const balanceDue = Math.round((grandTotal - totalTendered) * 100) / 100;
  const changeDue = balanceDue < 0 ? Math.abs(balanceDue) : 0;

  // Opening the walk-in checkout → switch the front-desk tablet to the cart +
  // check-in double panel; closing it → send the tablet back to its landing
  // screen (dual screen only).
  useEffect(() => {
    if (!wiStoreId || !dualScreenEnabled) return;
    broadcastToKiosk("kiosk_checkout_start", { total: grandTotal });
    return () => { broadcastToKiosk("kiosk_checkout_cancel"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wiStoreId, dualScreenEnabled]);

  // Keep the tablet's total in sync as staff key in the amount.
  useEffect(() => {
    if (!wiStoreId || !dualScreenEnabled) return;
    broadcastToKiosk("kiosk_checkout_start", { total: grandTotal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grandTotal]);

  const handleAmountKeypad = (key: string) => {
    if (key === "C") { setAmountDisplay("0"); return; }
    if (key === "BS") { setAmountDisplay(prev => prev.length <= 1 ? "0" : prev.slice(0, -1)); return; }
    if (key === ".") { if (amountDisplay.includes(".")) return; setAmountDisplay(prev => prev + "."); return; }
    setAmountDisplay(prev => {
      if (prev === "0" && key !== ".") return key;
      const parts = prev.split(".");
      if (parts[1] && parts[1].length >= 2) return prev;
      return prev + key;
    });
  };

  const handleTenderKeypad = (key: string) => {
    if (key === "C") { setKeypadDisplay("0"); return; }
    if (key === "BS") { setKeypadDisplay(prev => prev.length <= 1 ? "0" : prev.slice(0, -1)); return; }
    if (key === ".") { if (keypadDisplay.includes(".")) return; setKeypadDisplay(prev => prev + "."); return; }
    setKeypadDisplay(prev => {
      if (prev === "0" && key !== ".") return key;
      const parts = prev.split(".");
      if (parts[1] && parts[1].length >= 2) return prev;
      return prev + key;
    });
  };

  const handleApplyTender = (method: string, overrideAmount?: number) => {
    const amount = overrideAmount ?? Number(keypadDisplay);
    if (amount <= 0) return;
    const newTenders = [...tenders, { id: nextTenderId, method, amount }];
    setTenders(newTenders);
    setNextTenderId(prev => prev + 1);
    if (!overrideAmount) setKeypadDisplay("0");
    const newTotal = newTenders.reduce((s, t) => s + t.amount, 0);
    if (newTotal >= grandTotal && newTenders.length > 0) setShowComplete(true);
  };

  const handleRemoveTender = (id: number) => {
    const updated = tenders.filter(t => t.id !== id);
    setTenders(updated);
    const newTotal = updated.reduce((s, t) => s + t.amount, 0);
    if (newTotal < grandTotal) setShowComplete(false);
  };

  // ── Native app: walk-in M2 completion + error reset ───────────────────────
  useEffect(() => {
    if (!(window as any).CERTXA_NATIVE_APP) return;
    const errHandler = () => setWiNativeM2Active(false);
    window.addEventListener('certxa_native_m2_error', errHandler);
    return () => window.removeEventListener('certxa_native_m2_error', errHandler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!(window as any).CERTXA_NATIVE_APP) return;
    // When native M2 completes a walk-in payment (appointmentId === 0), apply
    // the tender here so the walk-in checkout marks itself paid.
    const completeHandler = (e: Event) => {
      const { appointmentId, amount, method } = (e as CustomEvent).detail ?? {};
      if (appointmentId !== 0) return; // appointment POS handles non-zero IDs
      setWiNativeM2Active(false);
      handleApplyTender(method === 'tap_to_pay' ? 'tap_to_pay' : 'm2', amount);
    };
    window.addEventListener('certxa_native_payment_complete', completeHandler);
    return () => window.removeEventListener('certxa_native_payment_complete', completeHandler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Terminal M2 connect/payment ───────────────────────────────────────────
  const handleConnectWiM2 = async () => {
    setWiTermStatus("loading"); setWiTermError("");
    try {
      const StripeTerminal = await loadStripeTerminalSDK();
      const terminal = StripeTerminal.create({
        onFetchConnectionToken: async () => {
          const r = await fetch("/api/payments/terminal/connection-token", { method: "POST", credentials: "include" });
          if (!r.ok) throw new Error("Failed to fetch connection token");
          return (await r.json()).secret;
        },
        onUnexpectedReaderDisconnect: () => {
          setWiTermReader(null); setWiTermStatus("idle");
          setWiTermError("Reader disconnected.");
        },
      });
      wiTermRef.current = terminal;
      setWiTermStatus("discovering");
      const disc = await terminal.discoverReaders({ simulated: false });
      if (disc.error) throw new Error(disc.error.message);
      const readers = disc.discoveredReaders ?? [];
      if (!readers.length) throw new Error("No M2 reader found nearby. Make sure it is powered on and Bluetooth is enabled.");
      const toConnect = readers[0];
      setWiTermStatus("connecting");
      const conn = await terminal.connectReader(toConnect);
      if (conn.error) throw new Error(conn.error.message);
      setWiTermReader(toConnect);
      setWiTermStatus("ready");
      toast({ title: tSt.m2Connected, description: tSt.m2ConnectedDesc(String(toConnect.label ?? toConnect.id)) });
    } catch (err: any) {
      setWiTermStatus("error"); setWiTermError(err.message ?? "Connection failed");
      toast({ title: tSt.readerFailed, description: err.message, variant: "destructive" });
    }
  };

  const handleWiM2Payment = async () => {
    if (!wiTermRef.current || !wiTermReader) return;
    const chargeAmount = balanceDue > 0 ? balanceDue : Number(keypadDisplay);
    if (chargeAmount <= 0) return;
    const amountCents = Math.round(chargeAmount * 100);
    setWiTermStatus("collecting"); setWiTermError("");
    try {
      const piRes = await fetch("/api/payments/terminal/create-payment-intent", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, currency: "usd" }),
      });
      if (!piRes.ok) throw new Error((await piRes.json()).error ?? "Failed to create payment intent");
      const { clientSecret, paymentIntentId } = await piRes.json();
      const collect = await wiTermRef.current.collectPaymentMethod(clientSecret);
      if (collect.error) throw new Error(collect.error.message);
      setWiTermStatus("processing");
      const process = await wiTermRef.current.processPayment(collect.paymentIntent);
      if (process.error) throw new Error(process.error.message);
      const capture = await fetch("/api/payments/terminal/capture-payment-intent", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId }),
      });
      if (!capture.ok) throw new Error((await capture.json()).error ?? "Capture failed");
      const last4 = process.paymentIntent?.payment_method_details?.card_present?.last4 ?? "????";
      const brand = process.paymentIntent?.payment_method_details?.card_present?.brand ?? "Card";
      toast({ title: tSt.paymentApproved, description: tSt.paymentApprovedDesc(brand, last4, chargeAmount.toFixed(2)) });
      setWiTermStatus("ready");
      handleApplyTender("m2", chargeAmount);
      broadcastToKiosk("kiosk_checkout_payment_result", { success: true, total: chargeAmount, last4 });
    } catch (err: any) {
      setWiTermStatus("ready");
      setWiTermError(err.message ?? "Payment failed");
      if (wiTermRef.current) wiTermRef.current.cancelCollectPaymentMethod().catch(() => {});
      toast({ title: tSt.cardFailed, description: err.message, variant: "destructive" });
    }
  };

  const handleReset = () => {
    setPhase("amount");
    setAmountDisplay("0");
    setTenders([]);
    setKeypadDisplay("0");
    setNextTenderId(1);
    setShowComplete(false);
    setTipReceived(0);
  };

  const KEYPAD_KEYS = ["7","8","9","BS","4","5","6","C","1","2","3",".","00","0"] as const;

  if (phase === "amount") {
    return (
      <div className="fixed inset-0 z-[95]" data-testid="walkin-checkout-panel">
        <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" onClick={handleClose} />
        <div className="absolute left-0 top-0 h-full w-full sm:w-[420px] bg-card flex flex-col shadow-[8px_0_24px_rgba(0,0,0,0.12)] border-r">
          <div className="p-4 border-b flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-muted-foreground" />
              <h2 className="font-semibold text-lg">{pick({ en: "Walk-In Checkout", vi: "Thanh toán vãng lai", es: "Pago sin cita", fr: "Encaissement sans RDV" })}</h2>
              {dualScreenEnabled && <span className="text-[10px] font-medium text-teal-600 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">Dual Screen</span>}
            </div>
            <button onClick={handleClose} className="text-muted-foreground" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 flex flex-col p-4 gap-3">
            <p className="text-sm text-muted-foreground">{pick({ en: "Enter the sale total:", vi: "Nhập tổng tiền cần thu:", es: "Ingresa el total de la venta:", fr: "Entrez le total de la vente:" })}</p>

            <div className="bg-muted/30 rounded-xl px-4 py-3 flex items-center justify-end border">
              <span className="text-4xl font-mono font-bold tracking-wider" data-testid="walkin-amount-display">
                ${amountDisplay}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 flex-1">
              {KEYPAD_KEYS.map((key) => (
                <Button
                  key={key}
                  variant="outline"
                  className={cn(
                    "text-lg font-medium h-auto py-4",
                    key === "C" && "text-destructive",
                    key === "BS" && "text-muted-foreground"
                  )}
                  onClick={() => handleAmountKeypad(key)}
                >
                  {key === "BS" ? <Delete className="w-5 h-5" /> : key === "C" ? "CLR" : key}
                </Button>
              ))}
              <Button
                variant="outline"
                className="text-lg font-medium h-auto py-4 col-span-2 bg-primary/5 border-primary text-primary"
                onClick={() => setAmountDisplay(balanceDue > 0 ? balanceDue.toFixed(2) : "0")}
              >
                EXACT
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {[10, 20, 50, 100].map((amt) => (
                <Button key={amt} variant="secondary" size="sm" className="text-sm font-medium"
                  onClick={() => setAmountDisplay(String(amt.toFixed(2)))}
                >
                  ${amt}
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t p-4">
            <Button
              className="w-full h-12 bg-green-600 text-white text-base font-semibold"
              disabled={grandTotal <= 0}
              onClick={() => {
                setKeypadDisplay("0");
                setPhase("payment");
                broadcastToKiosk("kiosk_checkout_start", { total: grandTotal });
              }}
              data-testid="walkin-proceed-payment"
            >
              <Receipt className="w-4 h-4 mr-2" />
              {pick({ en: "Proceed to Payment", vi: "Tiếp tục thanh toán", es: "Proceder al pago", fr: "Procéder au paiement" })} — ${grandTotal.toFixed(2)}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[95]" data-testid="walkin-payment-panel">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" onClick={handleClose} />
      <div className="absolute left-0 top-0 h-full w-full sm:w-[680px] bg-card flex flex-col shadow-[8px_0_24px_rgba(0,0,0,0.12)] border-r">
        <div className="p-3 border-b flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold">{pick({ en: "Payment", vi: "Thanh toán", es: "Pago", fr: "Paiement" })}</h2>
            <span className="text-xs text-muted-foreground">· {pick({ en: "Walk-In", vi: "Vãng lai", es: "Sin cita", fr: "Sans RDV" })}</span>
          </div>
          <button onClick={() => setPhase("amount")} className="text-muted-foreground" data-testid="walkin-back-to-amount">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: cart summary */}
          <div className="w-[280px] flex-shrink-0 border-r flex flex-col">
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="flex items-center justify-between py-1.5 text-sm font-medium">
                <span>{pick({ en: "Sale Total", vi: "Tổng tiền hàng", es: "Total de venta", fr: "Total de la vente" })}</span>
                <span>${grandTotal.toFixed(2)}</span>
              </div>

              {tenders.length > 0 && (
                <div className="border-t pt-2 space-y-1.5">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {pick({ en: "Payments Applied", vi: "Đã thanh toán", es: "Pagos aplicados", fr: "Paiements appliqués" })}
                  </h4>
                  {tenders.map((tender) => {
                    const found = PAYMENT_METHODS.find(m => m.id === tender.method);
                    const Icon = found ? found.icon : Banknote;
                    return (
                      <div key={tender.id} className="flex items-center justify-between bg-muted/50 rounded-md p-2">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm capitalize">{tender.method}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-green-600">${tender.amount.toFixed(2)}</span>
                          <button onClick={() => handleRemoveTender(tender.id)} className="text-muted-foreground">
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t p-3">
              {balanceDue > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{pick({ en: "Balance Due", vi: "Còn lại", es: "Saldo pendiente", fr: "Solde dû" })}</span>
                  <span className="text-lg font-bold text-destructive">${balanceDue.toFixed(2)}</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-green-600">{pick({ en: "Paid in Full", vi: "Đã thanh toán đủ", es: "Pagado en su totalidad", fr: "Payé en totalité" })}</span>
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  {changeDue > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{pick({ en: "Change Due", vi: "Tiền thối", es: "Cambio", fr: "Rendu monnaie" })}</span>
                      <span className="font-medium">${changeDue.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: keypad + payment buttons */}
          <div className="flex-1 flex flex-col relative">
            <div className="bg-muted/30 px-4 py-3 border-b flex items-center justify-end">
              <span className="text-2xl font-mono font-bold tracking-wider" data-testid="walkin-keypad-display">
                ${keypadDisplay}
              </span>
            </div>

            <div className="flex-1 p-3 flex flex-col gap-2">
              <div className="grid grid-cols-4 gap-1.5 flex-1">
                {KEYPAD_KEYS.map((key) => (
                  <Button
                    key={key}
                    variant="outline"
                    className={cn(
                      "text-lg font-medium h-auto",
                      key === "C" && "text-destructive",
                      key === "BS" && "text-muted-foreground"
                    )}
                    onClick={() => handleTenderKeypad(key)}
                  >
                    {key === "BS" ? <Delete className="w-5 h-5" /> : key === "C" ? "CLR" : key}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  className="text-lg font-medium h-auto col-span-2 bg-primary/5 border-primary text-primary"
                  onClick={() => setKeypadDisplay(balanceDue > 0 ? balanceDue.toFixed(2) : "0")}
                >
                  {pick({ en: "EXACT", vi: "ĐÚNG", es: "EXACTO", fr: "EXACT" })}
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {[1, 5, 10, 20].map((amt) => (
                  <Button key={amt} variant="secondary" size="sm" className="text-sm font-medium"
                    onClick={() => setKeypadDisplay(String(amt.toFixed(2)))}
                  >
                    ${amt}
                  </Button>
                ))}
              </div>

              {dualScreenEnabled && !showComplete && (
                <Button
                  className={cn(
                    "w-full h-10 gap-2 text-sm font-semibold",
                    waitingForTip
                      ? "bg-amber-500 text-white"
                      : "bg-purple-600 hover:bg-purple-700 text-white"
                  )}
                  onClick={() => {
                    setWaitingForTip(true);
                    // Send the pre-tip base (current amount minus any tip
                    // already received from an earlier round), matching the
                    // appointment checkout's contract — otherwise a second
                    // tip request here would compute new tip presets off a
                    // total that already includes a prior tip.
                    const baseAmount = Math.max(0, Math.round((grandTotal - tipReceived) * 100) / 100);
                    broadcastToKiosk("kiosk_checkout_tip_request", { total: baseAmount });
                  }}
                  disabled={waitingForTip}
                >
                  {waitingForTip ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Waiting for client tip…</>
                  ) : (
                    <><Smartphone className="w-4 h-4" /> Send Tip Screen to Client</>
                  )}
                </Button>
              )}

              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {PAYMENT_METHODS.map((method) => {
                  const Icon = method.icon;
                  if (method.id === "m2") {
                    // ── Native Android: send M2_PAY to device bridge ──────────
                    if ((window as any).CERTXA_NATIVE_APP) {
                      const chargeAmt = balanceDue > 0 ? balanceDue : Number(keypadDisplay);
                      return (
                        <Button
                          key="m2"
                          className="h-auto py-2 flex flex-col items-center gap-1 bg-indigo-600 text-white"
                          onClick={() => {
                            if (wiNativeM2Active) return;
                            const amountCents = Math.round(chargeAmt * 100);
                            if (amountCents <= 0) return;
                            setWiNativeM2Active(true);
                            setWiTermError("");
                            (window as any).ReactNativeWebView?.postMessage(JSON.stringify({
                              type: 'M2_PAY',
                              appointmentId: 0,
                              amountCents,
                              clientName: 'Walk-in',
                            }));
                          }}
                          disabled={chargeAmt <= 0 || wiNativeM2Active}
                          data-testid="walkin-tender-m2"
                        >
                          {wiNativeM2Active
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <CreditCard className="w-5 h-5" />}
                          <span className="text-[10px] font-medium leading-tight text-center">
                            {wiNativeM2Active ? "M2 Active…" : "M2 Reader"}
                          </span>
                        </Button>
                      );
                    }
                    // ── Web: Stripe Terminal JS SDK ──────────────────────────
                    const busy = wiTermStatus === "collecting" || wiTermStatus === "processing";
                    const connecting = wiTermStatus === "loading" || wiTermStatus === "discovering" || wiTermStatus === "connecting";
                    const chargeAmt = balanceDue > 0 ? balanceDue : Number(keypadDisplay);
                    const chargeLabel = wiTermStatus === "collecting"
                      ? "Waiting…"
                      : wiTermStatus === "processing"
                        ? "Processing…"
                        : `Charge ${chargeAmt.toFixed(2)}`;
                    if ((wiTermStatus === "ready" || wiTermStatus === "collecting" || wiTermStatus === "processing") && wiTermReader) {
                      return (
                        <Button
                          key="m2"
                          className="h-auto py-2 flex flex-col items-center gap-1 bg-indigo-600 text-white"
                          onClick={handleWiM2Payment}
                          disabled={chargeAmt <= 0}
                          data-testid="walkin-tender-m2"
                        >
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                          <span className="text-[10px] font-medium leading-tight text-center">
                            {chargeLabel}
                          </span>
                        </Button>
                      );
                    }
                    return (
                      <Button
                        key="m2"
                        className="h-auto py-2 flex flex-col items-center gap-1 bg-indigo-600 text-white"
                        onClick={handleConnectWiM2}
                        disabled={connecting}
                        data-testid="walkin-tender-m2"
                      >
                        {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                        <span className="text-[10px] font-medium leading-tight text-center">
                          {wiTermStatus === "loading" ? "Loading…" : wiTermStatus === "discovering" ? "Scanning…" : wiTermStatus === "connecting" ? "Connecting…" : wiTermStatus === "error" ? "Retry M2" : "M2 Reader"}
                        </span>
                      </Button>
                    );
                  }
                  return (
                    <Button
                      key={method.id}
                      className={cn(
                        "h-auto py-3 flex flex-col items-center gap-1",
                        method.id === "cash" && "bg-green-600 text-white",
                        method.id === "card" && "bg-blue-600 text-white",
                      )}
                      onClick={() => handleApplyTender(method.id)}
                      disabled={Number(keypadDisplay) <= 0}
                      data-testid={`walkin-tender-${method.id}`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{method.label}</span>
                    </Button>
                  );
                })}
              </div>
              {wiTermError && <p className="text-xs text-red-600 dark:text-red-400 px-1">{wiTermError}</p>}
              {wiTermStatus === "ready" && wiTermReader && (
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  {wiTermReader.label ?? wiTermReader.id ?? "M2"} connected
                </p>
              )}
            </div>

            {showComplete && (
              <div className="absolute inset-0 bg-background/95 flex flex-col items-center justify-center gap-6 z-10" data-testid="walkin-payment-complete">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold">{pick({ en: "Payment Complete", vi: "Thanh toán xong", es: "Pago completado", fr: "Paiement effectué" })}</h3>
                  <p className="text-sm text-muted-foreground">
                    {pick({ en: "Total:", vi: "Tổng:", es: "Total:", fr: "Total:" })} ${grandTotal.toFixed(2)}
                  </p>
                  {changeDue > 0 && (
                    <p className="text-sm font-medium">
                      {pick({ en: "Change Due:", vi: "Tiền thối:", es: "Cambio:", fr: "Rendu:" })} ${changeDue.toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 w-full items-center">
                  {onThermalPrint && (
                    <Button
                      variant="outline"
                      className="gap-2 w-48"
                      onClick={async () => {
                        try {
                          const now = new Date();
                          const bytes = buildCheckoutReceipt({
                            storeName: wiStore?.name ?? "Salon",
                            tenders,
                            grandTotal,
                            changeDue,
                            transactionId: `WI-${Date.now().toString(36).toUpperCase()}`,
                            dateStr: formatInTz(now, timezone, "MM/dd/yyyy"),
                            timeStr: formatInTz(now, timezone, "hh:mm aa"),
                          });
                          await onThermalPrint(bytes);
                        } catch {}
                      }}
                    >
                      <Printer className="w-4 h-4" />
                      {pick({ en: "Print Receipt", vi: "In hóa đơn", es: "Imprimir recibo", fr: "Imprimer le reçu" })}
                    </Button>
                  )}
                  <div className="flex gap-3">
                    <Button variant="outline" className="gap-2" onClick={handleReset}>
                      <Receipt className="w-4 h-4" />
                      {pick({ en: "New Sale", vi: "Giao dịch mới", es: "Nueva venta", fr: "Nouvelle vente" })}
                    </Button>
                    <Button className="gap-2 bg-green-600 text-white" onClick={onClose}>
                      <Check className="w-4 h-4" />
                      {pick({ en: "Done", vi: "Hoàn tất", es: "Listo", fr: "Terminé" })}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Deposits tab rendered inside the client lookup sheet ────────────────────
function ClientDepositsTab({ clientId, appointments }: { clientId: number; appointments: any[] }) {
  const { data, isLoading } = useQuery<{ paymentMethods: any[] }>({
    queryKey: [`/api/payments/clients/${clientId}/payment-methods`],
    queryFn: async () => {
      const res = await fetch(`/api/payments/clients/${clientId}/payment-methods`, { credentials: "include" });
      if (!res.ok) return { paymentMethods: [] };
      return res.json();
    },
    enabled: !!clientId,
  });

  const savedCards = data?.paymentMethods ?? [];

  // Appointments that have a deposit collected (new columns) or old depositPaid flag
  const depositAppts = appointments.filter(
    (a: any) => a.depositPaid || Number(a.depositCollected ?? 0) > 0
  ).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const CARD_BRAND_ICONS: Record<string, string> = {
    visa: "💳",
    mastercard: "💳",
    amex: "💳",
    discover: "💳",
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Deposits & Payment</h2>

      {/* Saved card section */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Saved Card</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : savedCards.length === 0 ? (
          <Card className="p-4 flex items-center gap-3 text-sm text-muted-foreground border-dashed">
            <CreditCard className="w-4 h-4 shrink-0" />
            No card on file
          </Card>
        ) : (
          <div className="space-y-2">
            {savedCards.map((pm: any) => (
              <Card key={pm.id} className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-6 bg-gray-100 rounded flex items-center justify-center text-base">
                    {CARD_BRAND_ICONS[pm.brand?.toLowerCase()] ?? "💳"}
                  </div>
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {pm.brand} •••• {pm.last4}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Expires {pm.expMonth}/{pm.expYear}
                    </p>
                  </div>
                </div>
                {pm.isDefault && (
                  <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">
                    Default
                  </span>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Deposit history */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Deposit History</h3>
        {depositAppts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deposits on record.</p>
        ) : (
          <div className="space-y-2">
            {depositAppts.map((apt: any) => {
              const amount = Number(apt.depositCollected ?? apt.depositAmount ?? 0);
              const status = apt.paymentStatus ?? (apt.depositPaid ? "deposit_paid" : "none");
              const statusLabel: Record<string, { label: string; cls: string }> = {
                deposit_paid:  { label: "Deposit Paid",  cls: "bg-green-100 text-green-700" },
                card_saved:    { label: "Card Saved",    cls: "bg-blue-100 text-blue-700" },
                fully_paid:    { label: "Fully Paid",    cls: "bg-emerald-100 text-emerald-700" },
                failed:        { label: "Failed",        cls: "bg-red-100 text-red-700" },
                none:          { label: "No Payment",    cls: "bg-gray-100 text-gray-600" },
              };
              const badge = statusLabel[status] ?? statusLabel.none;
              return (
                <Card key={apt.id} className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{apt.service?.name ?? "Service"}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{format(new Date(apt.date), "MMM d, yyyy")}</span>
                    {amount > 0 && (
                      <span className="font-semibold text-foreground">${amount.toFixed(2)}</span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientLookupSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { selectedStore } = useSelectedStore();
  const featureFlags = useFeatureFlags();
  const [phoneDigits, setPhoneDigits] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [foundClient, setFoundClient] = useState<any>(null);
  const [activeSection, setActiveSection] = useState("overview");

  const clientId = foundClient?.id;
  const storeId = selectedStore?.id;

  const { data: allAppointments = [] } = useQuery<any[]>({
    queryKey: [`/api/appointments`, clientId, storeId, "client-profile-sheet"],
    queryFn: async () => {
      const res = await fetch(`/api/appointments?customerId=${clientId}&storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientId && !!storeId,
  });

  const now = new Date();
  const nextAppointments = useMemo(() =>
    allAppointments
      .filter((a: any) => new Date(a.date) >= now && a.status !== "cancelled")
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [allAppointments]
  );
  const pastAppointments = useMemo(() =>
    allAppointments
      .filter((a: any) => new Date(a.date) < now)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [allAppointments]
  );
  const totalSpend = useMemo(() =>
    allAppointments
      .filter((a: any) => ["completed", "pending", "confirmed"].includes(a.status))
      .reduce((sum: number, a: any) => sum + (a.service ? Number(a.service.price) : 0), 0),
    [allAppointments]
  );
  const noShows = useMemo(() => allAppointments.filter((a: any) => a.status === "no_show" || a.status === "no-show").length, [allAppointments]);
  const cancellations = useMemo(() => allAppointments.filter((a: any) => a.status === "cancelled").length, [allAppointments]);

  const formatPhone = (digits: string): string => {
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleDigit = useCallback((digit: string) => {
    if (phoneDigits.length < 10) {
      setPhoneDigits(prev => prev + digit);
      setSearchDone(false);
      setNotFound(false);
    }
  }, [phoneDigits.length]);

  const handleBackspace = useCallback(() => {
    setPhoneDigits(prev => prev.slice(0, -1));
    setSearchDone(false);
    setNotFound(false);
  }, []);

  useEffect(() => {
    if (phoneDigits.length === 10 && !searchDone && selectedStore) {
      setIsSearching(true);
      setNotFound(false);
      fetch(`/api/customers/search?phone=${encodeURIComponent(phoneDigits)}&storeId=${selectedStore.id}`, {
        credentials: "include",
      })
        .then(res => res.json())
        .then((customer: any) => {
          setIsSearching(false);
          setSearchDone(true);
          if (customer && customer.id) {
            setFoundClient(customer);
            setActiveSection("overview");
          } else {
            setNotFound(true);
          }
        })
        .catch(() => {
          setIsSearching(false);
          setSearchDone(true);
          setNotFound(true);
        });
    }
  }, [phoneDigits, searchDone, selectedStore]);

  const numKeys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["blank", "0", "backspace"],
  ];

  const profileSections = [
    { id: "overview",  label: "Overview" },
    { id: "next",      label: "Next Appointments",  count: nextAppointments.length },
    { id: "past",      label: "Past Appointments",  count: pastAppointments.length },
    { id: "deposits",  label: "Deposits" },
    { id: "memberships", label: "Memberships",      count: 0 },
    { id: "notes",     label: "Notes",              count: foundClient?.notes ? 1 : 0 },
    { id: "purchases", label: "Purchases",          count: 0 },
    { id: "data-privacy", label: "Data Privacy" },
    { id: "forms",     label: "Forms" },
  ];

  const renderProfileContent = () => {
    switch (activeSection) {
      case "overview":
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Overview</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground">Total Spend:</span>
                <span className="font-semibold">$ {totalSpend.toFixed(2)}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground">Deposit:</span>
                <span className="font-semibold">$ 0.00</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground">No-Shows:</span>
                <span className="font-semibold">{noShows}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground">Cancellations:</span>
                <span className="font-semibold">{cancellations}</span>
              </div>
            </div>
            {allAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CalendarIcon className="w-14 h-14 text-gray-300 mb-4" />
                <p className="font-semibold text-gray-700">No Appointments</p>
                <p className="text-sm text-gray-400 mt-1">The client has no appointments</p>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-base font-semibold">Recent Appointments</h3>
                {allAppointments
                  .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 5)
                  .map((apt: any) => (
                    <Card key={apt.id} className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{apt.service?.name || "Service"}</span>
                        <span className="text-xs text-muted-foreground capitalize">{apt.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {apt.staff?.name} · {format(new Date(apt.date), "MMM d, yyyy")}
                      </p>
                    </Card>
                  ))}
              </div>
            )}
          </div>
        );
      case "next":
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Next Appointments</h2>
            {nextAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming appointments</p>
            ) : (
              <div className="space-y-3">
                {nextAppointments.map((apt: any) => (
                  <Card key={apt.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{apt.service?.name || "Service"}</span>
                      <span className="text-xs text-muted-foreground capitalize">{apt.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {apt.staff?.name} · {format(new Date(apt.date), "MMM d, yyyy h:mm a")}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      case "past":
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Past Appointments</h2>
            {pastAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No past appointments</p>
            ) : (
              <div className="space-y-3">
                {pastAppointments.map((apt: any) => (
                  <Card key={apt.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{apt.service?.name || "Service"}</span>
                      <span className="text-xs text-muted-foreground capitalize">{apt.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {apt.staff?.name} · {format(new Date(apt.date), "MMM d, yyyy h:mm a")}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      case "deposits":
        return <ClientDepositsTab clientId={foundClient.id} appointments={allAppointments} />;
      case "notes":
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Notes</h2>
            {foundClient?.notes ? (
              <Card className="p-4 text-sm">{foundClient.notes}</Card>
            ) : (
              <p className="text-sm text-muted-foreground">No notes</p>
            )}
          </div>
        );
      default:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold capitalize">{activeSection.replace("-", " ")}</h2>
            <p className="text-sm text-muted-foreground">No records found</p>
          </div>
        );
    }
  };

  if (foundClient) {
    const initials = foundClient.name
      ? foundClient.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
      : "?";

    return (
      <div className="dark cx-cal fixed inset-0 z-50 text-foreground" data-testid="client-lookup-sheet">
        <button
          type="button"
          aria-label="Close"
          className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
          onClick={onClose}
        />
        <div className="absolute right-0 top-0 h-full w-full sm:w-[680px] bg-white flex flex-col shadow-[-8px_0_24px_rgba(0,0,0,0.12)] border-l">
          {/* Header */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-2 bg-white border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost" size="icon"
                className="text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                onClick={() => { setFoundClient(null); setPhoneDigits(""); setSearchDone(false); setNotFound(false); }}
                data-testid="button-back-client-lookup"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <span className="font-semibold text-base text-gray-900">Clients</span>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100" data-testid="button-close-client-lookup">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Split body */}
          <div className="flex flex-1 min-h-0">
            {/* Left sidebar */}
            <div className="w-[220px] flex-shrink-0 border-r bg-white flex flex-col">
              {/* Client info */}
              <div className="px-5 py-5 flex flex-col items-center text-center border-b border-gray-100">
                <h3 className="font-bold text-lg text-gray-900 leading-tight">{foundClient.name}</h3>
                {foundClient.phone && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Phone className="w-3 h-3" />{foundClient.phone}
                  </p>
                )}
                {featureFlags.rewardPoints && (foundClient.loyaltyPoints ?? 0) >= 0 && (
                  <p className="text-xs font-medium text-amber-600 mt-1.5">
                    ⭐ {foundClient.loyaltyPoints ?? 0} pts
                  </p>
                )}
                {foundClient.allergies && (
                  <div className="mt-2 w-full flex items-start gap-1.5 rounded-md border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-xs font-medium text-orange-700 text-left">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span className="leading-tight">{foundClient.allergies}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 px-4"
                    onClick={() => { onClose(); navigate(`/booking/new?clientId=${foundClient.id}`); }}
                  >
                    Book Now
                  </Button>
                </div>
              </div>

              {/* Nav */}
              <nav className="flex-1 overflow-y-auto py-1">
                {profileSections.map(sec => (
                  <button
                    key={sec.id}
                    onClick={() => setActiveSection(sec.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors text-left",
                      activeSection === sec.id
                        ? "text-primary bg-primary/5"
                        : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <span>{sec.label}</span>
                    <div className="flex items-center gap-1.5">
                      {sec.count !== undefined && (
                        <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 min-w-[20px] text-center leading-tight">
                          {sec.count}
                        </span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </nav>
            </div>

            {/* Right content */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
              {renderProfileContent()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dark cx-cal fixed inset-0 z-50 text-foreground" data-testid="client-lookup-sheet">
      <button
        type="button"
        aria-label="Close client lookup"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[380px] bg-[#161618] flex flex-col shadow-[-8px_0_24px_rgba(0,0,0,0.12)] border-l">
        {/* Header */}
        <div className="px-4 py-4 flex items-center justify-between gap-2 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-base text-gray-900">Client Lookup</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div
          className="flex-1 flex flex-col px-4 pt-5 min-h-0 bg-[#161618] md:pb-4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
        >
          {/* Phone number display */}
          <div className="w-full rounded-2xl bg-white border border-gray-200 shadow-sm py-6 px-4 mb-5 text-center">
            {phoneDigits.length > 0 ? (
              <p className="text-4xl font-bold tracking-widest text-primary">
                {formatPhone(phoneDigits)}
              </p>
            ) : (
              <p className="text-2xl font-medium text-muted-foreground/40">Enter Phone Number</p>
            )}
            {isSearching && (
              <p className="text-sm text-muted-foreground mt-2 animate-pulse">Searching...</p>
            )}
            {notFound && !isSearching && (
              <p className="text-sm text-red-500 mt-2 font-medium">No client found with this number</p>
            )}
          </div>

          {/* Numpad */}
          <div className="flex-1 flex flex-col gap-2 justify-end">
            {numKeys.map((row, ri) => (
              <div key={ri} className="grid grid-cols-3 gap-2">
                {row.map((key) => {
                  if (key === "blank") {
                    return <div key="blank" />;
                  }
                  if (key === "backspace") {
                    return (
                      <button
                        key="backspace"
                        type="button"
                        onPointerDown={e => e.preventDefault()}
                        onClick={handleBackspace}
                        className="h-[68px] rounded-2xl bg-white border border-gray-200 shadow-sm text-muted-foreground flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform"
                      >
                        <Delete className="w-5 h-5" />
                      </button>
                    );
                  }
                  return (
                    <button
                      key={key}
                      type="button"
                      onPointerDown={e => e.preventDefault()}
                      onClick={() => handleDigit(key)}
                      className="h-[68px] rounded-2xl bg-white border border-gray-200 shadow-sm text-2xl font-semibold text-foreground flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform"
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChooseClientPanel({
  onClose,
  onSelectClient,
  onWalkIn,
  walkInsEnabled = true,
}: {
  onClose: () => void;
  onSelectClient: (clientId: number) => void;
  onWalkIn: () => void;
  walkInsEnabled?: boolean;
}) {
  const { pick } = useLanguage();
  const tCC = {
    chooseClient: pick({ en: "Choose A Client",      vi: "Chọn khách hàng",                         es: "Elegir un cliente",           fr: "Choisir un client" }),
    enterPhone:   pick({ en: "Enter Phone Number",   vi: "Nhập số điện thoại",                       es: "Ingresar número de teléfono", fr: "Entrer le numéro de téléphone" }),
    tapWalkIn:    pick({ en: "Tap for walk-in",      vi: "Nhấn vào biểu tượng để đặt không cần tên", es: "Toca para sin cita",          fr: "Appuyez pour sans rendez-vous" }),
    searching:    pick({ en: "Searching...",         vi: "Đang tìm...",                              es: "Buscando...",                 fr: "Recherche..." }),
    enterName:    pick({ en: "Enter Client Name",    vi: "Nhập tên khách",                           es: "Ingresar nombre del cliente", fr: "Entrer le nom du client" }),
    newClient:    pick({ en: "New client · ",        vi: "Khách mới · ",                             es: "Nuevo cliente · ",            fr: "Nouveau client · " }),
    guest:        pick({ en: "Guest",                vi: "Vãng lai",                                 es: "Invitado",                    fr: "Invité" }),
    space:        pick({ en: "space",                vi: "dấu cách",                                 es: "espacio",                     fr: "espace" }),
    returnKey:    pick({ en: "return",               vi: "xong",                                     es: "confirmar",                   fr: "valider" }),
    creating:     pick({ en: "Creating...",          vi: "Đang tạo...",                              es: "Creando...",                  fr: "Création..." }),
    done:         pick({ en: "Done",                 vi: "Xong",                                     es: "Listo",                       fr: "Terminé" }),
  };
  const [phoneDigits, setPhoneDigits] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [showNameEntry, setShowNameEntry] = useState(false);
  const [clientName, setClientName] = useState("");
  const [shiftActive, setShiftActive] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const { selectedStore } = useSelectedStore();

  useEffect(() => {
    (document.activeElement as HTMLElement)?.blur();
  }, [showNameEntry]);

  const formatPhone = (digits: string): string => {
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const formatPhoneFull = (digits: string): string => {
    if (digits.length !== 10) return digits;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleDigit = useCallback((digit: string) => {
    if (phoneDigits.length < 10) {
      setPhoneDigits(prev => prev + digit);
      setSearchDone(false);
    }
  }, [phoneDigits.length]);

  const handleBackspace = useCallback(() => {
    setPhoneDigits(prev => prev.slice(0, -1));
    setSearchDone(false);
  }, []);

  useEffect(() => {
    if (phoneDigits.length === 10 && !searchDone && selectedStore) {
      setIsSearching(true);
      fetch(`/api/customers/search?phone=${encodeURIComponent(phoneDigits)}&storeId=${selectedStore.id}`, {
        credentials: "include",
      })
        .then(res => res.json())
        .then((customer: any) => {
          setIsSearching(false);
          setSearchDone(true);
          if (customer && customer.id) {
            onSelectClient(customer.id);
          } else {
            setShowNameEntry(true);
          }
        })
        .catch(() => {
          setIsSearching(false);
          setSearchDone(true);
          setShowNameEntry(true);
        });
    }
  }, [phoneDigits, searchDone, selectedStore, onSelectClient]);

  const handleNameKey = useCallback((key: string) => {
    const char = shiftActive ? key.toUpperCase() : key.toLowerCase();
    setClientName(prev => prev + char);
    if (shiftActive) setShiftActive(false);
  }, [shiftActive]);

  const handleNameBackspace = useCallback(() => {
    setClientName(prev => prev.slice(0, -1));
  }, []);

  const handleNameDone = useCallback(async () => {
    if (!clientName.trim() || !selectedStore) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: clientName.trim(),
          phone: phoneDigits,
          storeId: selectedStore.id,
        }),
      });
      const newCustomer = await res.json();
      if (newCustomer && newCustomer.id) {
        onSelectClient(newCustomer.id);
      }
    } catch {
      setIsCreating(false);
    }
  }, [clientName, phoneDigits, selectedStore, onSelectClient]);

  const handleGuestDone = useCallback(() => {
    onWalkIn();
  }, [onWalkIn]);

  const numKeys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [walkInsEnabled ? "walk-in" : "blank", "0", "backspace"],
  ];

  const kbRow1 = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"];
  const kbRow2 = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
  const kbRow3 = ["Z", "X", "C", "V", "B", "N", "M"];

  if (showNameEntry) {
    return (
      <div className="dark cx-cal fixed inset-0 z-50 text-foreground" data-testid="enter-name-panel">
        <button
          type="button"
          aria-label="Close name entry"
          className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
          onClick={onClose}
        />
        <div className="absolute right-0 top-0 h-full w-full sm:w-[740px] bg-[#161618] flex flex-col shadow-[-8px_0_24px_rgba(0,0,0,0.12)] border-l">
          <div className="px-4 py-4 flex items-center justify-between gap-2 bg-white border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onPointerDown={e => e.preventDefault()} onClick={() => { setShowNameEntry(false); setClientName(""); setPhoneDigits(""); setSearchDone(false); setShiftActive(true); }} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100" data-testid="button-back-name-entry">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <span className="font-semibold text-sm text-gray-900">{tCC.enterName}</span>
            </div>
            <Button variant="ghost" size="icon" onPointerDown={e => e.preventDefault()} onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100" data-testid="button-close-name-entry">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 flex flex-col px-3 pt-6 pb-3 min-h-0">
            <div className="text-center mb-4 px-2">
              <p className="text-3xl font-bold tracking-wide min-h-[44px]" data-testid="text-client-name-display">
                {clientName || <span className="text-muted-foreground/30">Name</span>}
              </p>
              <p className="text-xs text-primary mt-1 font-medium" data-testid="text-creating-for-phone">
                {tCC.newClient}{formatPhoneFull(phoneDigits)}
              </p>
            </div>

            <div className="flex-1 flex flex-col gap-1.5 min-h-0 justify-end">
              {/* Row 1: QWERTYUIOP */}
              <div className="flex gap-1">
                {kbRow1.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => handleNameKey(k)}
                    className="flex-1 h-[52px] rounded-md bg-muted text-sm font-semibold text-foreground hover-elevate active-elevate-2 flex items-center justify-center"
                    data-testid={`kb-${k.toLowerCase()}`}
                  >
                    {shiftActive ? k : k.toLowerCase()}
                  </button>
                ))}
              </div>
              {/* Row 2: ASDFGHJKL */}
              <div className="flex gap-1 px-[4%]">
                {kbRow2.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => handleNameKey(k)}
                    className="flex-1 h-[52px] rounded-md bg-muted text-sm font-semibold text-foreground hover-elevate active-elevate-2 flex items-center justify-center"
                    data-testid={`kb-${k.toLowerCase()}`}
                  >
                    {shiftActive ? k : k.toLowerCase()}
                  </button>
                ))}
              </div>
              {/* Row 3: Shift + ZXCVBNM + Backspace */}
              <div className="flex gap-1">
                <button
                  type="button"
                  onPointerDown={e => e.preventDefault()}
                  onClick={() => setShiftActive(prev => !prev)}
                  className={cn(
                    "w-[52px] h-[52px] rounded-md text-sm font-semibold flex items-center justify-center hover-elevate active-elevate-2 flex-shrink-0",
                    shiftActive ? "bg-foreground text-background" : "bg-muted text-foreground"
                  )}
                  data-testid="kb-shift"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                {kbRow3.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => handleNameKey(k)}
                    className="flex-1 h-[52px] rounded-md bg-muted text-sm font-semibold text-foreground hover-elevate active-elevate-2 flex items-center justify-center"
                    data-testid={`kb-${k.toLowerCase()}`}
                  >
                    {shiftActive ? k : k.toLowerCase()}
                  </button>
                ))}
                <button
                  type="button"
                  onPointerDown={e => e.preventDefault()}
                  onClick={handleNameBackspace}
                  className="w-[52px] h-[52px] rounded-md bg-muted text-muted-foreground flex items-center justify-center hover-elevate active-elevate-2 flex-shrink-0"
                  data-testid="kb-backspace"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>
              {/* Row 4: Guest / @ / Space / Return */}
              <div className="flex gap-1">
                <button
                  type="button"
                  onPointerDown={e => e.preventDefault()}
                  onClick={handleGuestDone}
                  className="h-[52px] px-3 rounded-md bg-muted text-sm font-medium text-foreground hover-elevate active-elevate-2 flex-shrink-0"
                  data-testid="kb-guest"
                >
                  {tCC.guest}
                </button>
                <button
                  type="button"
                  onPointerDown={e => e.preventDefault()}
                  onClick={() => handleNameKey("@")}
                  className="h-[52px] px-3 rounded-md bg-muted text-sm font-medium text-foreground hover-elevate active-elevate-2 flex-shrink-0"
                  data-testid="kb-at"
                >
                  @
                </button>
                <button
                  type="button"
                  onPointerDown={e => e.preventDefault()}
                  onClick={() => { handleNameKey(" "); setShiftActive(true); }}
                  className="flex-1 h-[52px] rounded-md bg-muted text-sm font-medium text-foreground hover-elevate active-elevate-2"
                  data-testid="kb-space"
                >
                  {tCC.space}
                </button>
                <button
                  type="button"
                  onPointerDown={e => e.preventDefault()}
                  onClick={handleNameDone}
                  className="h-[52px] px-3 rounded-md bg-muted text-sm font-medium text-foreground hover-elevate active-elevate-2 flex-shrink-0"
                  data-testid="kb-return"
                >
                  {tCC.returnKey}
                </button>
              </div>
            </div>

            <Button
              className="mt-3 w-full bg-green-600 text-white h-[58px] text-base font-semibold rounded-xl"
              onPointerDown={e => e.preventDefault()}
              onClick={handleNameDone}
              disabled={!clientName.trim() || isCreating}
              data-testid="button-name-done"
            >
              {isCreating ? tCC.creating : tCC.done}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dark cx-cal fixed inset-0 z-50 text-foreground" data-testid="choose-client-panel">
      <button
        type="button"
        aria-label="Close client lookup"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[380px] bg-[#161618] flex flex-col shadow-[-8px_0_24px_rgba(0,0,0,0.12)] border-l">
        {/* Header */}
        <div className="px-4 py-4 flex items-center justify-between gap-2 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100" data-testid="button-back-client-lookup">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-base text-gray-900">{tCC.chooseClient}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100" data-testid="button-close-client-lookup">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content fills all remaining height — bottom padding clears the mobile nav bar (56px + safe area) */}
        <div
          className="flex-1 flex flex-col px-4 pt-5 min-h-0 bg-[#161618] md:pb-4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
        >
          {/* Phone number display */}
          <div className="w-full rounded-2xl bg-white border border-gray-200 shadow-sm py-6 px-4 mb-5 text-center">
            {phoneDigits.length > 0 ? (
              <p className="text-4xl font-bold tracking-widest text-primary" data-testid="text-phone-display">
                {formatPhone(phoneDigits)}
              </p>
            ) : (
              <>
                <p className="text-base font-semibold text-gray-900" data-testid="text-enter-phone">{tCC.enterPhone}</p>
                <p className="text-sm text-gray-400 mt-1 flex items-center justify-center gap-1.5">
                  <PersonStanding className="w-4 h-4 inline" /> {tCC.tapWalkIn}
                </p>
              </>
            )}
            {isSearching && (
              <p className="text-sm text-primary mt-2 animate-pulse" data-testid="text-searching">{tCC.searching}</p>
            )}
          </div>

          {/* Numpad — flex-1 rows fill remaining height equally */}
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            {numKeys.map((row, ri) => (
              <div key={ri} className="flex gap-3 flex-1">
                {row.map((key) => {
                  if (key === "walk-in") {
                    return (
                      <button
                        key={key}
                        type="button"
                        onPointerDown={e => e.preventDefault()}
                        onClick={onWalkIn}
                        className="flex-1 rounded-2xl bg-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-300 active:scale-95 transition-all"
                        data-testid="numpad-walkin"
                      >
                        <PersonStanding className="w-7 h-7" />
                      </button>
                    );
                  }
                  if (key === "blank") {
                    return <div key={key} className="flex-1" aria-hidden="true" />;
                  }
                  if (key === "backspace") {
                    return (
                      <button
                        key={key}
                        type="button"
                        onPointerDown={e => e.preventDefault()}
                        onClick={handleBackspace}
                        className="flex-1 rounded-2xl bg-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-300 active:scale-95 transition-all"
                        data-testid="numpad-backspace"
                      >
                        <Delete className="w-7 h-7" />
                      </button>
                    );
                  }
                  return (
                    <button
                      key={key}
                      type="button"
                      onPointerDown={e => e.preventDefault()}
                      onClick={() => handleDigit(key)}
                      className="flex-1 rounded-2xl bg-white text-3xl font-bold text-gray-900 shadow-sm border border-gray-100 hover:bg-gray-50 active:scale-95 transition-all"
                      data-testid={`numpad-${key}`}
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DOW_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function MonthCalendarOverlay({
  selectedDate,
  timezone,
  appointments,
  onSelectDate,
  onSelectAppointment,
  onClose,
}: {
  selectedDate: Date;
  timezone: string;
  appointments: any[];
  onSelectDate: (date: Date) => void;
  onSelectAppointment: (apt: any) => void;
  onClose: () => void;
}) {
  const { pick, language } = useLanguage();
  const MONTH_NAMES_VI = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];
  const MONTH_NAMES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const MONTH_NAMES_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const DOW_LABELS_VI = ["CN","T2","T3","T4","T5","T6","T7"];
  const DOW_LABELS_ES = ["Do","Lu","Ma","Mi","Ju","Vi","Sa"];
  const DOW_LABELS_FR = ["Di","Lu","Ma","Me","Je","Ve","Sa"];
  const monthNames = language === "vi" ? MONTH_NAMES_VI : language === "es" ? MONTH_NAMES_ES : language === "fr" ? MONTH_NAMES_FR : MONTH_NAMES;
  const dowLabels  = language === "vi" ? DOW_LABELS_VI  : language === "es" ? DOW_LABELS_ES  : language === "fr" ? DOW_LABELS_FR  : DOW_LABELS;
  const tMC = {
    cal:   pick({ en: "Cal",   vi: "Lịch",       es: "Cal",    fr: "Cal" }),
    list:  pick({ en: "List",  vi: "Danh sách",  es: "Lista",  fr: "Liste" }),
    close: pick({ en: "Close", vi: "Đóng",       es: "Cerrar", fr: "Fermer" }),
  };
  const storeNow = getNowInTimezone(timezone);
   const [viewMonth, setViewMonth] = useState(selectedDate.getUTCMonth());
   const [viewYear, setViewYear] = useState(selectedDate.getUTCFullYear());
  const [previewDay, setPreviewDay] = useState<Date>(selectedDate);
  const [view, setView] = useState<"calendar" | "list">("calendar");

   const nowMonth = storeNow.getUTCMonth();
   const nowYear = storeNow.getUTCFullYear();
  const monthTabs = [0, 1, 2].map((i) => {
    const totalMonth = nowMonth + i;
    return {
      month: totalMonth % 12,
      year: nowYear + Math.floor(totalMonth / 12),
    };
  });

   const firstDay = new Date(Date.UTC(viewYear, viewMonth, 1));
   const lastDay = new Date(Date.UTC(viewYear, viewMonth + 1, 0));
   const startDow = firstDay.getUTCDay();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
   for (let d = 1; d <= lastDay.getUTCDate(); d++) cells.push(new Date(Date.UTC(viewYear, viewMonth, d)));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const dayAppts = appointments
    .filter((apt: any) => isOnStoreDate(apt.date, previewDay, timezone))
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

   const previewDayLabel = formatStoreDate(previewDay, "EEE, MMM d");

  const today0 = new Date(Date.UTC(storeNow.getUTCFullYear(), storeNow.getUTCMonth(), storeNow.getUTCDate()));

  const apptMap = useMemo(() => {
    const map = new Map<string, any[]>();
    appointments.forEach((apt: any) => {
       const key = toLocalDateStringInTz(apt.date, timezone);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(apt);
    });
    return map;
  }, [appointments, timezone]);

  const listAppts = useMemo(() => {
    return appointments
      .filter((apt: any) => {
         const dateKey = toLocalDateStringInTz(apt.date, timezone);
         const [year, month] = dateKey.split("-").map(Number);
         return dateKey >= toLocalDateStringInTz(today0, "UTC")
           && month === viewMonth + 1
           && year === viewYear;
      })
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [appointments, timezone, viewMonth, viewYear, today0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" data-testid="month-calendar-overlay">
      <button
        type="button"
        aria-label="Close date picker"
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative z-10 bg-card rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border"
        style={{ width: "min(1020px, 96vw)", height: "min(94vh, 94dvh)" }}
      >
        {/* ── HEADER ── */}
        <div className="flex items-center px-4 py-3 border-b flex-shrink-0 gap-3">
          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden border border-border flex-shrink-0">
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors",
                view === "calendar"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
              data-testid="view-toggle-calendar"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              {tMC.cal}
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors border-l border-border",
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
              data-testid="view-toggle-list"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              {tMC.list}
            </button>
          </div>

          {/* Month/year label — centered */}
          <span className="flex-1 text-center text-lg font-bold tracking-tight">
            {monthNames[viewMonth]} {viewYear}
          </span>

          {/* Close — large tap target for tablet */}
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-xl bg-muted hover:bg-muted/70 active:bg-muted/50 px-4 py-2 text-sm font-semibold text-foreground transition-colors"
            data-testid="datepicker-close"
          >
            {tMC.close}
          </button>
        </div>

        {/* ── BODY: left (tabs + grid/list) | right panel full-height ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT column */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Month tabs — compact */}
            <div className="flex gap-2 px-4 py-2 border-b flex-shrink-0">
              {monthTabs.map((tab) => {
                const isActive = tab.month === viewMonth && tab.year === viewYear;
                return (
                  <button
                    key={`${tab.year}-${tab.month}`}
                    type="button"
                    onClick={() => { setViewMonth(tab.month); setViewYear(tab.year); }}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted text-foreground hover:bg-muted/70"
                    )}
                    data-testid={`monthtab-${MONTH_NAMES[tab.month].toLowerCase()}`}
                  >
                    {monthNames[tab.month]}
                  </button>
                );
              })}
            </div>

            {/* ── CALENDAR grid ── */}
            {view === "calendar" && (
              <>
                <div className="grid grid-cols-7 px-4 pt-2 pb-1 flex-shrink-0">
                  {dowLabels.map((d) => (
                    <div key={d} className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide py-1">
                      {d}
                    </div>
                  ))}
                </div>
                <div
                  className="flex-1 px-4 pb-4 grid"
                  style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}
                >
                  {weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7">
                      {week.map((day, di) => {
                        if (!day) return <div key={di} />;
                        const isToday = isSameStoreDay(day, storeNow);
                        const isPreviewing = isSameStoreDay(day, previewDay);
                        const isOtherMonth = day.getUTCMonth() !== viewMonth;
                        const isPast = day < today0 && !isToday;
                        const dayKey = formatStoreDate(day, "yyyy-MM-dd");
                        const hasBookings = !isPast && !isOtherMonth && (apptMap.get(dayKey)?.length ?? 0) > 0;
                        const showDot = hasBookings && !isPreviewing;

                        if (isPast || isOtherMonth) {
                          return (
                            <div
                              key={di}
                              className="flex items-center justify-center rounded-xl m-[3px] min-h-[48px] select-none"
                            >
                              <span className="text-base font-medium text-muted-foreground/25">
                                {day.getUTCDate()}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <button
                            key={di}
                            type="button"
                            onClick={() => setPreviewDay(day)}
                            className={cn(
                              "flex items-center justify-center rounded-xl m-[3px] transition-colors select-none min-h-[48px]",
                              isPreviewing
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : isToday
                                  ? "border-2 border-primary"
                                  : "hover:bg-muted/60"
                            )}
                            data-testid={`day-${day.getUTCDate()}`}
                          >
                            {showDot ? (
                              <span className={cn(
                                "w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center text-base font-bold text-amber-950",
                                isToday && "ring-2 ring-primary ring-offset-1"
                              )}>
                                {day.getUTCDate()}
                              </span>
                            ) : (
                              <span className={cn(
                                "text-base font-medium",
                                isPreviewing ? "text-primary-foreground font-bold"
                                  : isToday ? "text-primary font-bold"
                                  : "text-foreground"
                              )}>
                                  {day.getUTCDate()}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── LIST view ── */}
            {view === "list" && (
              <div className="flex-1 overflow-y-auto p-4">
                {listAppts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-16">
                    <p className="text-base font-semibold text-muted-foreground">No upcoming bookings this month</p>
                    <p className="text-sm text-muted-foreground/60 mt-1">Switch months using the tabs above</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {listAppts.map((apt: any) => {
                      const dateLabel = formatInTz(new Date(apt.date), timezone, "M/d");
                      const firstName = (((apt as any).customer?.fullName || apt.customer?.name || apt.customerName || apt.clientName || "").split(" ")[0] || "Walk-In").toUpperCase();
                      const service = (apt.service?.name || "—").toUpperCase();
                      return (
                        <button
                          key={apt.id}
                          type="button"
                          onClick={() => onSelectAppointment(apt)}
                          className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm hover:bg-muted/40 active:scale-[0.98] transition-all text-left"
                          data-testid={`list-appt-${apt.id}`}
                        >
                          <span className="text-sm font-bold text-muted-foreground w-8 flex-shrink-0">{dateLabel}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-foreground truncate">{firstName}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{service}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* RIGHT: appointments panel — full height from below header */}
          {view === "calendar" && (
            <div className="w-[280px] flex-shrink-0 border-l flex flex-col bg-muted/20">
              {/* Slim day label row */}
              <div className="px-4 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
                <div>
                  <p className="font-semibold text-sm">{previewDayLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {dayAppts.length === 0 ? "No appointments" : `${dayAppts.length} appointment${dayAppts.length !== 1 ? "s" : ""}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                         const pd0 = new Date(Date.UTC(previewDay.getUTCFullYear(), previewDay.getUTCMonth(), previewDay.getUTCDate()));
                    if (pd0 >= today0) onSelectDate(previewDay);
                  }}
                  className="text-xs font-semibold text-primary hover:underline flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                  data-testid="datepicker-goto"
                >
                  Go to day →
                </button>
              </div>
              {/* Cards — scrollable, fills remaining height */}
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                {dayAppts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-10">
                    <p className="text-sm text-muted-foreground">No bookings on this day</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Tap a different date</p>
                  </div>
                ) : (
                  dayAppts.map((apt: any) => {
                    const firstName = ((apt as any).customer?.fullName || apt.customer?.name || apt.customerName || apt.clientName || "").split(" ")[0] || "Walk-In";
                    const phone = apt.customer?.phone || "—";
                    const service = apt.service?.name || "—";
                    const timeStr = formatInTz(apt.date, timezone, "h:mm a");
                    return (
                      <button
                        key={apt.id}
                        type="button"
                        onClick={() => onSelectAppointment(apt)}
                        className="w-full text-left rounded-xl border bg-card px-3 py-2.5 shadow-sm hover:bg-muted/40 transition-colors"
                        data-testid={`appt-card-${apt.id}`}
                      >
                        <p className="font-bold text-sm text-foreground leading-tight">{firstName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{phone}</p>
                        <p className="text-xs text-foreground mt-1 font-medium">{service}</p>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">{timeStr}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </div>
      </div>


    </div>
  );
}

// ── KioskCheckinDialog ──────────────────────────────────────────────────────
type KioskCheckin = {
  id: number;
  clientName: string | null;
  phone: string | null;
  services: { name: string }[];
  status: string;
  staffName: string | null;
  createdAt: string;
};

function KioskCheckinDialog({
  checkin,
  onClose,
  onDeleted,
  onSmsSent,
}: {
  checkin: KioskCheckin;
  onClose: () => void;
  onDeleted: () => void;
  onSmsSent: () => void;
}) {
  const [smsSending, setSmsSending] = useState(false);
  const [smsDone, setSmsDone] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const statusLabel: Record<string, string> = {
    waiting: "Waiting",
    called:  "Called",
    serving: "Being Served",
  };
  const statusColor: Record<string, string> = {
    waiting: "bg-amber-100 text-amber-700 border-amber-300",
    called:  "bg-blue-100 text-blue-700 border-blue-300",
    serving: "bg-emerald-100 text-emerald-700 border-emerald-300",
  };
  const statusIcon: Record<string, string> = {
    waiting: "⏳",
    called:  "📣",
    serving: "✂️",
  };

  const waitMinutes = Math.round((Date.now() - new Date(checkin.createdAt).getTime()) / 60000);
  const waitLabel = waitMinutes < 60
    ? `${waitMinutes}m ago`
    : `${Math.floor(waitMinutes / 60)}h ${waitMinutes % 60}m ago`;

  const serviceNames = Array.isArray(checkin.services)
    ? checkin.services.map((s: any) => (typeof s === "string" ? s : s?.name ?? "")).filter(Boolean).join(", ")
    : "";

  async function handleSmsOpening() {
    setSmsSending(true);
    setSmsError(null);
    try {
      const res = await fetch(`/api/kiosk/board/${checkin.id}/sms-opening`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to send SMS");
      }
      setSmsDone(true);
      onSmsSent();
    } catch (e: any) {
      setSmsError(e.message ?? "Failed to send SMS");
    } finally {
      setSmsSending(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/kiosk/board/${checkin.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      onDeleted();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-sm mx-0 sm:mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColor[checkin.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
              {statusIcon[checkin.status] ?? "👤"} {statusLabel[checkin.status] ?? checkin.status}
            </span>
            <span className="text-xs text-slate-400">checked in {waitLabel}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-full hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <p className="text-lg font-bold text-slate-900 leading-tight">{checkin.clientName || "Walk-in"}</p>
            {checkin.phone && <p className="text-sm text-slate-500 mt-0.5">{checkin.phone}</p>}
          </div>

          {serviceNames && (
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">Requested service</p>
              <p className="text-sm text-slate-700 font-medium">{serviceNames}</p>
            </div>
          )}

          {checkin.staffName && (
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">Assigned to</p>
              <p className="text-sm text-slate-700 font-medium">{checkin.staffName}</p>
            </div>
          )}

          {/* SMS feedback */}
          {smsDone && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700 font-medium">
              <Check className="w-4 h-4 shrink-0" /> SMS sent to {checkin.clientName?.split(" ")[0] ?? "client"}
            </div>
          )}
          {smsError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0" /> {smsError}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex flex-col gap-2">
          {!smsDone && checkin.phone && (
            <button
              onClick={handleSmsOpening}
              disabled={smsSending}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm rounded-xl py-3 transition-colors"
            >
              {smsSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
              {smsSending ? "Sending…" : "Text — Spot Just Opened Up"}
            </button>
          )}
          {!checkin.phone && (
            <div className="text-center text-xs text-slate-400 py-1">No phone on file — SMS unavailable</div>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-red-50 hover:text-red-600 disabled:opacity-60 text-slate-600 font-semibold text-sm rounded-xl py-3 transition-colors"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            {deleting ? "Removing…" : "Remove from List"}
          </button>
        </div>
      </div>
    </div>
  );
}
