import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { useServices } from "@/hooks/use-services";
import { useStaffList } from "@/hooks/use-staff";
import { useClientsForBooking, useCreateClientForBooking, useClientDetail, type BookingClient } from "@/hooks/use-clients";
import { useCreateAppointment } from "@/hooks/use-appointments";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAddonsForService, useSetAppointmentAddons, useServiceCategories } from "@/hooks/use-addons";
import { ConflictResolutionDialog } from "@/components/addons/ConflictResolutionDialog";
import { useAvailableTime } from "@/hooks/use-available-time";
import { AvailableTimeBanner } from "@/components/AvailableTimeBanner";
import { useAvailableSlots, type TimeSlot } from "@/hooks/use-availability";
import { useSelectedStore } from "@/hooks/use-store";
import { actionQueueDB } from "@/lib/action-queue-db";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { syncEngine } from "@/lib/sync-engine";
import { useSnapshot } from "@/hooks/use-snapshot";
import { claimNextOfflineTurnTech, type OfflineTurnTechnician } from "@/lib/turn-offline";
import { turnClaimsDB, type TurnClaim } from "@/lib/turn-claims-db";
import { getTimezoneAbbr, formatInTz, storeLocalToUtc, getNowInTimezone, toLocalDateStringInTz } from "@/lib/timezone";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock, User, Users, X, Scissors, Sparkles, Loader2, Check, CalendarDays, Timer, AlertCircle, Trash2, Plus, WifiOff, Star } from "lucide-react";
import { cn, formatPhoneInput } from "@/lib/utils";
import type { Service, ServiceWithOptions, ServiceOption, Staff, Customer, Addon } from "@shared/schema";
import { getRequiredResourceType } from "@shared/resourceMatching";
import { appAlert } from "@/lib/confirm";
import { useLanguage } from "@/hooks/use-language";
import { useEntityTranslations } from "@/hooks/use-entity-translations";

type BookingStep = "services" | "addons" | "details";

// A synthetic Service built by handlePickServiceOption() has a name like
// "Base Name – Option Name". The base is a real service (translatable via
// entity_translations); the option suffix isn't a tracked entity, so only
// the base half gets translated and the suffix is reattached as-is.
const SERVICE_OPTION_SEP = " – ";
function splitServiceOptionName(name: string): { base: string; suffix: string | null } {
  const idx = name.indexOf(SERVICE_OPTION_SEP);
  if (idx === -1) return { base: name, suffix: null };
  return { base: name.slice(0, idx), suffix: name.slice(idx + SERVICE_OPTION_SEP.length) };
}

/**
 * Simple fixed-size pagination for the service grid. This app runs on
 * touch-screen kiosk monitors with no good way to scroll, so instead of a
 * scrollbar the grid shows a fixed page of cards with Previous / Next
 * buttons underneath. `pageSize` cards per page; the buttons only appear
 * when there's more than one page.
 */
const SERVICE_PAGE_SIZE = 10;

function useGridPagination<T>(items: T[], resetKey: unknown, pageSize: number = SERVICE_PAGE_SIZE) {
  const [page, setPage] = useState(0);

  // Reset to the first page whenever the underlying list changes (e.g. the
  // selected category).
  useEffect(() => { setPage(0); }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  // If a filter change shrinks the list past the current page, snap back.
  useEffect(() => {
    if (page > totalPages - 1) setPage(totalPages - 1);
  }, [page, totalPages]);

  const start = safePage * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return {
    pageItems,
    page: safePage,
    totalPages,
    showPrev: safePage > 0,
    showNext: safePage < totalPages - 1,
    goPrev: () => setPage((p) => Math.max(0, p - 1)),
    goNext: () => setPage((p) => p + 1),
  };
}

export default function NewBooking() {
  const navigate = useNavigate();
  const { isLoading: authLoading } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { snapshot } = useSnapshot();
  const { pick } = useLanguage();
  const { translateName, translateDescription } = useEntityTranslations();

  function displayServiceName(svc: { id: number; name: string } | null | undefined): string {
    if (!svc) return "";
    const { base, suffix } = splitServiceOptionName(svc.name);
    const translatedBase = translateName("service", svc.id, base);
    return suffix ? `${translatedBase}${SERVICE_OPTION_SEP}${suffix}` : translatedBase;
  }

  const t = {
    newBookingTitle:  pick({ en: "New Booking", vi: "Đặt lịch mới", es: "Nueva reserva", fr: "Nouvelle réservation" }),
    services:         pick({ en: "Services", vi: "Dịch vụ", es: "Servicios", fr: "Services" }),
    serviceCount:     (n: number) => pick({ en: `${n} service${n !== 1 ? "s" : ""}`, vi: `${n} dịch vụ`, es: `${n} servicio${n !== 1 ? "s" : ""}`, fr: `${n} service${n !== 1 ? "s" : ""}` }),
    cancel:           pick({ en: "Cancel", vi: "Hủy", es: "Cancelar", fr: "Annuler" }),
    continueBtn:      pick({ en: "Continue", vi: "Tiếp tục", es: "Continuar", fr: "Continuer" }),
    selectServiceCta: pick({ en: "Select a service to continue", vi: "Chọn dịch vụ để tiếp tục", es: "Selecciona un servicio para continuar", fr: "Sélectionnez un service pour continuer" }),
    lastBooked:       pick({ en: "Last Booked", vi: "Đã đặt gần đây", es: "Reservado recientemente", fr: "Dernière réservation" }),
    optionsCount:     (n: number) => pick({ en: `${n} options`, vi: `${n} tùy chọn`, es: `${n} opciones`, fr: `${n} options` }),
    extras:           pick({ en: "Extras", vi: "Dịch vụ thêm", es: "Extras", fr: "Extras" }),
    extrasFor:        (name: string) => pick({ en: `for ${name}`, vi: `cho ${name}`, es: `para ${name}`, fr: `pour ${name}` }),
    noExtras:         pick({ en: "No extras for this service", vi: "Không có dịch vụ thêm cho dịch vụ này", es: "No hay extras para este servicio", fr: "Aucun extra pour ce service" }),
    noAddonsBtn:      pick({ en: "No Addons", vi: "Không thêm dịch vụ", es: "Sin extras", fr: "Sans extras" }),
    checkout:         pick({ en: "Checkout", vi: "Thanh toán", es: "Pagar", fr: "Paiement" }),
    saving:           pick({ en: "Saving...", vi: "Đang lưu...", es: "Guardando...", fr: "Enregistrement..." }),
    save:             pick({ en: "Save", vi: "Lưu", es: "Guardar", fr: "Enregistrer" }),
    requestBooking:   pick({ en: "Request Booking", vi: "Yêu cầu đặt lịch", es: "Solicitar reserva", fr: "Demander une réservation" }),
    minSuffix:        (n: number) => pick({ en: `${n} min`, vi: `${n} phút`, es: `${n} min`, fr: `${n} min` }),
    bookBtn:          pick({ en: "Book", vi: "Đặt lịch", es: "Reservar", fr: "Réserver" }),
    extraCount:       (n: number) => pick({ en: `${n} extra${n > 1 ? "s" : ""}`, vi: `${n} dịch vụ thêm`, es: `${n} extra${n > 1 ? "s" : ""}`, fr: `${n} extra${n > 1 ? "s" : ""}` }),
    chooseStaff:      pick({ en: "Choose Staff", vi: "Chọn nhân viên", es: "Elegir personal", fr: "Choisir le personnel" }),
    ofThree:          (n: number) => pick({ en: `${n} of 3`, vi: `${n}/3`, es: `${n} de 3`, fr: `${n} sur 3` }),
    pickStaffDesc:    pick({ en: "Pick who will perform the service, or let us choose the first available.", vi: "Chọn người thực hiện dịch vụ, hoặc để chúng tôi chọn người sẵn sàng đầu tiên.", es: "Elige quién realizará el servicio, o deja que elijamos al primero disponible.", fr: "Choisissez qui effectuera le service, ou laissez-nous choisir le premier disponible." }),
    anyStaff:         pick({ en: "Any Staff", vi: "Bất kỳ nhân viên", es: "Cualquier personal", fr: "N'importe quel personnel" }),
    firstAvailable:   pick({ en: "First available", vi: "Người sẵn sàng đầu tiên", es: "Primero disponible", fr: "Premier disponible" }),
    assignStation:    pick({ en: "Assign Station", vi: "Chọn vị trí", es: "Asignar estación", fr: "Assigner un poste" }),
    optionalLabel:    pick({ en: "(optional)", vi: "(tùy chọn)", es: "(opcional)", fr: "(facultatif)" }),
    noPreference:     pick({ en: "No preference", vi: "Không yêu cầu", es: "Sin preferencia", fr: "Aucune préférence" }),
    nextChooseDate:   pick({ en: "Next: Choose Date", vi: "Tiếp: Chọn ngày", es: "Siguiente: Elegir fecha", fr: "Suivant : Choisir la date" }),
    chooseDate:       pick({ en: "Choose Date", vi: "Chọn ngày", es: "Elegir fecha", fr: "Choisir la date" }),
    notesOptional:    pick({ en: "Notes (optional)", vi: "Ghi chú (tùy chọn)", es: "Notas (opcional)", fr: "Notes (facultatif)" }),
    specialReqPh:     pick({ en: "Any special requests?", vi: "Có yêu cầu đặc biệt nào không?", es: "¿Alguna solicitud especial?", fr: "Des demandes particulières ?" }),
    nextChooseTime:   pick({ en: "Next: Choose Time", vi: "Tiếp: Chọn giờ", es: "Siguiente: Elegir hora", fr: "Suivant : Choisir l'heure" }),
    chooseTime:       pick({ en: "Choose Time", vi: "Chọn giờ", es: "Elegir hora", fr: "Choisir l'heure" }),
    findingNextDate:  pick({ en: "Finding next available date…", vi: "Đang tìm ngày trống tiếp theo…", es: "Buscando la próxima fecha disponible…", fr: "Recherche de la prochaine date disponible…" }),
    noTimesAvailable: pick({ en: "No times available", vi: "Không có giờ trống", es: "No hay horarios disponibles", fr: "Aucun horaire disponible" }),
    noSlotsIn60Days:  pick({ en: "No slots in the next 60 days", vi: "Không có chỗ trống trong 60 ngày tới", es: "No hay horarios en los próximos 60 días", fr: "Aucun créneau dans les 60 prochains jours" }),
    changeDate:       pick({ en: "Change Date", vi: "Đổi ngày", es: "Cambiar fecha", fr: "Changer la date" }),
    nextPage:         pick({ en: "Next", vi: "Tiếp", es: "Siguiente", fr: "Suivant" }),
    previousPage:     pick({ en: "Previous", vi: "Trước", es: "Anterior", fr: "Précédent" }),
    slotsAvailable:   (n: number, dur: number, tz: string) => pick({
      en: `${n} slot${n !== 1 ? "s" : ""} available · ${dur} min · ${tz}`,
      vi: `${n} chỗ trống · ${dur} phút · ${tz}`,
      es: `${n} horario${n !== 1 ? "s" : ""} disponible${n !== 1 ? "s" : ""} · ${dur} min · ${tz}`,
      fr: `${n} créneau${n !== 1 ? "s" : ""} disponible${n !== 1 ? "s" : ""} · ${dur} min · ${tz}`,
    }),
    pendingSync:      (n: number) => pick({ en: `${n} pending sync`, vi: `${n} đang chờ đồng bộ`, es: `${n} pendiente${n !== 1 ? "s" : ""} de sincronizar`, fr: `${n} en attente de synchro` }),
    offlineLabel:     pick({ en: "Offline", vi: "Ngoại tuyến", es: "Sin conexión", fr: "Hors ligne" }),
    bookingFailedPrefix: (msg: string) => pick({ en: `Booking failed: ${msg}`, vi: `Đặt lịch thất bại: ${msg}`, es: `Error al reservar: ${msg}`, fr: `Échec de la réservation : ${msg}` }),
    bookingFailedGeneric: pick({ en: "Could not save the booking. Please try again.", vi: "Không thể lưu lịch hẹn. Vui lòng thử lại.", es: "No se pudo guardar la reserva. Inténtalo de nuevo.", fr: "Impossible d'enregistrer la réservation. Veuillez réessayer." }),
    noStaffWalkinAlert: pick({ en: "No staff are available for a walk-in right now. Please pick a future time slot manually.", vi: "Hiện không có nhân viên nào cho khách vãng lai. Vui lòng chọn thủ công một khung giờ trong tương lai.", es: "No hay personal disponible para atender sin cita ahora. Elige manualmente un horario futuro.", fr: "Aucun personnel disponible pour un client sans rendez-vous. Veuillez choisir manuellement un créneau futur." }),
    clientOptional:   pick({ en: "Client (optional)", vi: "Khách hàng (tùy chọn)", es: "Cliente (opcional)", fr: "Client (facultatif)" }),
    bookingEllipsis:  pick({ en: "Booking...", vi: "Đang đặt lịch...", es: "Reservando...", fr: "Réservation..." }),
    bookedExclaim:    pick({ en: "Booked!", vi: "Đã đặt!", es: "¡Reservado!", fr: "Réservé !" }),
    completeBooking:  pick({ en: "Complete Booking", vi: "Hoàn tất đặt lịch", es: "Completar reserva", fr: "Terminer la réservation" }),
    selectDateHeading: pick({ en: "Select Date", vi: "Chọn ngày", es: "Seleccionar fecha", fr: "Sélectionner la date" }),
    clientLabel:      pick({ en: "Client", vi: "Khách hàng", es: "Cliente", fr: "Client" }),
    notesLabel:       pick({ en: "Notes", vi: "Ghi chú", es: "Notas", fr: "Notes" }),
    selectADate:      pick({ en: "Select a date", vi: "Chọn ngày", es: "Selecciona una fecha", fr: "Sélectionnez une date" }),
    staffLabel:       pick({ en: "Staff", vi: "Nhân viên", es: "Personal", fr: "Personnel" }),
    anyLabel:         pick({ en: "Any", vi: "Bất kỳ", es: "Cualquiera", fr: "N'importe" }),
    timeSlotLabel:    pick({ en: "Time Slot", vi: "Khung giờ", es: "Horario", fr: "Créneau" }),
    pickDateToSeeSlots: pick({ en: "Pick a date to see available time slots", vi: "Chọn ngày để xem khung giờ trống", es: "Elige una fecha para ver los horarios disponibles", fr: "Choisissez une date pour voir les créneaux disponibles" }),
    selectStaffToSeeAvailability: pick({ en: "Select a staff member to see their availability", vi: "Chọn nhân viên để xem lịch trống", es: "Selecciona un miembro del personal para ver su disponibilidad", fr: "Sélectionnez un membre du personnel pour voir sa disponibilité" }),
    noSlots60DaysLong: pick({ en: "No available time slots in the next 60 days", vi: "Không có khung giờ trống trong 60 ngày tới", es: "No hay horarios disponibles en los próximos 60 días", fr: "Aucun créneau disponible dans les 60 prochains jours" }),
    tryDifferentStaffOrService: pick({ en: "Try a different staff preference or service", vi: "Hãy thử nhân viên hoặc dịch vụ khác", es: "Prueba con otro personal o servicio", fr: "Essayez un autre personnel ou service" }),
    slotsAvailablePerBooking: (n: number, dur: number) => pick({
      en: `${n} available slot${n !== 1 ? "s" : ""} · ${dur} min per booking`,
      vi: `${n} khung giờ trống · ${dur} phút mỗi lịch hẹn`,
      es: `${n} horario${n !== 1 ? "s" : ""} disponible${n !== 1 ? "s" : ""} · ${dur} min por reserva`,
      fr: `${n} créneau${n !== 1 ? "s" : ""} disponible${n !== 1 ? "s" : ""} · ${dur} min par réservation`,
    }),
    appointmentConfirmation: pick({ en: "Appointment Confirmation", vi: "Xác nhận lịch hẹn", es: "Confirmación de la cita", fr: "Confirmation du rendez-vous" }),
    serviceLabel:     pick({ en: "Service", vi: "Dịch vụ", es: "Servicio", fr: "Service" }),
    staffLabelCaps:   pick({ en: "Staff", vi: "Nhân viên", es: "Personal", fr: "Personnel" }),
    walkIn:           pick({ en: "Walk-In", vi: "Khách vãng lai", es: "Sin cita", fr: "Sans rendez-vous" }),
    ok:               pick({ en: "OK", vi: "Đồng ý", es: "Aceptar", fr: "OK" }),
    appointmentCreated: pick({ en: "Appointment successfully created", vi: "Đã tạo lịch hẹn thành công", es: "Cita creada correctamente", fr: "Rendez-vous créé avec succès" }),
    shareAppointment: pick({ en: "Share Appointment", vi: "Chia sẻ lịch hẹn", es: "Compartir cita", fr: "Partager le rendez-vous" }),
    bookAnother:      pick({ en: "Book Another", vi: "Đặt lịch khác", es: "Reservar otra", fr: "Réserver une autre" }),
    backToCalendar:   pick({ en: "Back to Calendar", vi: "Quay lại lịch", es: "Volver al calendario", fr: "Retour au calendrier" }),
    cancelBookingTitle: pick({ en: "Cancel Booking", vi: "Hủy đặt lịch", es: "Cancelar reserva", fr: "Annuler la réservation" }),
    serviceNotSaved:  pick({ en: "Service not saved", vi: "Dịch vụ chưa được lưu", es: "Servicio no guardado", fr: "Service non enregistré" }),
    leavePageConfirm: pick({ en: "Are you sure you want to leave the page?", vi: "Bạn có chắc muốn rời khỏi trang này không?", es: "¿Seguro que quieres salir de la página?", fr: "Voulez-vous vraiment quitter la page ?" }),
    no:               pick({ en: "No", vi: "Không", es: "No", fr: "Non" }),
    yes:              pick({ en: "Yes", vi: "Có", es: "Sí", fr: "Oui" }),
    appointmentConfirmedShareTitle: pick({ en: "Appointment Confirmed", vi: "Đã xác nhận lịch hẹn", es: "Cita confirmada", fr: "Rendez-vous confirmé" }),
    chooseOptionToContinue: pick({ en: "Choose an option to continue", vi: "Chọn một tùy chọn để tiếp tục", es: "Elige una opción para continuar", fr: "Choisissez une option pour continuer" }),
    loadingExtras:    pick({ en: "Loading extras...", vi: "Đang tải dịch vụ thêm...", es: "Cargando extras...", fr: "Chargement des extras..." }),
    extrasForName:    (name: string) => pick({ en: `Extras for ${name}`, vi: `Dịch vụ thêm cho ${name}`, es: `Extras para ${name}`, fr: `Extras pour ${name}` }),
    shareText: (customer: string, service: string, staff: string, date: string, time: string) => pick({
      en: `${customer} booked ${service} with ${staff} on ${date} at ${time}`,
      vi: `${customer} đã đặt ${service} với ${staff} vào ${date} lúc ${time}`,
      es: `${customer} reservó ${service} con ${staff} el ${date} a las ${time}`,
      fr: `${customer} a réservé ${service} avec ${staff} le ${date} à ${time}`,
    }),
  };
  const timezone = selectedStore?.timezone || "UTC";
  const tzAbbr = getTimezoneAbbr(timezone);

  // "Today" at midnight in the STORE's timezone — used for the date-picker
  // disabled guard so we never allow booking into the past relative to the
  // salon's local time, even when the device is in a different timezone.
  const todayStoreDate = useMemo(() => {
    const todayStr = toLocalDateStringInTz(new Date(), timezone); // "YYYY-MM-DD"
    const [y, m, d] = todayStr.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }, [timezone]);

  const params = new URLSearchParams(window.location.search);
  const calStaffId = params.get("staffId") ? Number(params.get("staffId")) : null;
  const calResourceId = params.get("resourceId") ? Number(params.get("resourceId")) : null;
  const calDate = params.get("date");
  const calTime = params.get("time");
  const calAvailableMinutes = params.get("availableMinutes") ? Number(params.get("availableMinutes")) : null;
  const paramClientId = params.get("clientId") ? Number(params.get("clientId")) : null;
  const editAppointmentId = params.get("editId") ? Number(params.get("editId")) : null;
  const isReschedule = params.get("reschedule") === "1";
  const isCalendarBooking = !!(calStaffId && calDate && calTime);
  const isWalkIn = params.get("walkIn") === "1";
  // noShowFill: sent by the no-show sheet when "Book Walk-In for This Slot" is clicked.
  // Treated as a calendar booking (specific staff + slot) but bypasses the past-time guard
  // and the Turn system, so the appointment lands exactly on the no-show slot.
  const isNoShowFill = params.get("noShowFill") === "1";

  const queryClient = useQueryClient();

  // All useState declarations must come before any useQuery/useMutation that references them
  // to avoid a Temporal Dead Zone (TDZ) ReferenceError in the minified bundle.
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryOrder, setCategoryOrder] = useState<string[] | null>(null);
  const [mobileCatStep, setMobileCatStep] = useState<"categories" | "services">("categories");
  const [mobileDetailsStep, setMobileDetailsStep] = useState<"staff" | "date" | "time">("staff");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Addon[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<BookingClient | null>(null);
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<BookingStep>("services");
  const [editInitialized, setEditInitialized] = useState(false);
  const [clientInitialized, setClientInitialized] = useState(false);

  const availableMinutes = isCalendarBooking && calAvailableMinutes && calAvailableMinutes > 0 ? calAvailableMinutes : null;

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    if (calDate) {
      const [y, m, d] = calDate.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return getNowInTimezone(timezone);
  });
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [staffMode, setStaffMode] = useState<"any" | "specific">(isCalendarBooking ? "specific" : "any");
  const [specificStaffId, setSpecificStaffId] = useState<number | null>(calStaffId);
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(calResourceId);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [calendarSlotInitialized, setCalendarSlotInitialized] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [optionPickerService, setOptionPickerService] = useState<ServiceWithOptions | null>(null);
  const [optionPickerSelected, setOptionPickerSelected] = useState<ServiceOption | null>(null);
  const [walkInBookingPending, setWalkInBookingPending] = useState(false);
  // Offline walk-in path: true while the local Turn pick + booking submission
  // is resolving synchronously, so the button shows a spinner instead of
  // looking inert (see triggerWalkInBooking).
  const [walkInResolving, setWalkInResolving] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"staff" | "time">(() =>
    isReschedule || isCalendarBooking || calStaffId ? "time" : "staff"
  );
  // Must stay in the useState block (before any useQuery/useMutation) to avoid TDZ in prod build
  const [autoAdvancing, setAutoAdvancing] = useState(false);
  const autoAdvanceOriginRef = useRef<Date | null>(null);
  // Ref so the walkInBookingPending effect always calls the latest version of
  // handleRequestBooking — avoids stale-closure issues when selectedService
  // is not yet in the deps array.
  const handleRequestBookingRef = useRef<() => void>(() => {});
  // Stashes the offline Turn pick (technician + local claim record) between
  // the offline-resolution effect (below) setting selectedSlot and finalize()
  // reading it to build the TURN_ASSIGN payload / tag the claim.
  const pendingOfflineTurnRef = useRef<{ technician: OfflineTurnTechnician; claim: TurnClaim } | null>(null);
  // Re-entrancy guard for the offline-resolution effect — deliberately a ref,
  // not the walkInResolving *state*: including that state in the effect's own
  // dependency array would make setWalkInResolving(true) re-trigger the effect
  // (cleanup-then-rerun), which would cancel the very claim it just started.
  const walkInOfflineResolvingRef = useRef(false);
  // Tracks whether a booking has already been submitted this session so the
  // "Request Booking" button stays disabled after the mutation resolves and
  // the confirmation dialog is shown (prevents duplicate submissions).
  const [bookingSubmitted, setBookingSubmitted] = useState(false);
  // Ref-based immediate guard: set synchronously inside handleRequestBooking
  // BEFORE any async work so rapid multi-taps (via Continue buttons or the
  // walkInBookingPending effect) can't queue multiple mutations before React
  // re-renders with isPending=true.
  const bookingSubmittingRef = useRef(false);

  const networkStatus = useNetworkStatus();
  const isOffline = networkStatus === "offline";
  const [slotPendingCount, setSlotPendingCount] = useState(0);
  useEffect(() => {
    if (!isOffline) { setSlotPendingCount(0); return; }
    syncEngine.getPendingCount().then(setSlotPendingCount).catch(() => {});
    const id = setInterval(() => syncEngine.getPendingCount().then(setSlotPendingCount).catch(() => {}), 5000);
    return () => clearInterval(id);
  }, [isOffline]);

  // These hooks must come AFTER all useState declarations above to avoid a
  // Temporal Dead Zone (TDZ) ReferenceError in the minified production bundle.
  const { data: services, isLoading: servicesLoading } = useServices();
  // Services can only be deactivated, not deleted (deleting would break
  // commission history), so the same list endpoint used by the Services
  // management page also includes inactive rows. The booking picker must
  // never offer those for a new selection — filter them out here, once,
  // rather than re-checking isActive at every render site below.
  const activeServices = (services as Service[] | undefined)?.filter((s) => s.isActive !== false);
  const { data: categories } = useServiceCategories();
  const { data: staffList } = useStaffList();
  const { data: bookingResources = [] } = useQuery<{ id: number; type: string; name: string; isActive: boolean }[]>({
    queryKey: ["/api/resources"],
    queryFn: async () => {
      const res = await fetch("/api/resources", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });
  const activeBookingResources = (bookingResources as any[]).filter((r) => r.isActive);
  // Which resource type (pedicure chair vs. nail station) the selected service
  // needs, if any — waxing/threading/hair/etc. have no resource requirement,
  // so the resource picker only shows up (and the server only enforces
  // assignment) for services this resolves a type for.
  const requiredResourceType = selectedService
    ? getRequiredResourceType(selectedService.category, selectedService.name)
    : null;
  const matchingBookingResources = requiredResourceType
    ? activeBookingResources.filter((r: any) => r.type === requiredResourceType)
    : [];
  const { data: customers } = useClientsForBooking();
  // Direct single-client fetch by ID — resolves immediately without waiting for the
  // full 500-client list, eliminating the "Walk-In" flash when clientId is in the URL.
  const { data: directClient } = useClientDetail(paramClientId);
  const createAppointment = useCreateAppointment();
  const setAppointmentAddons = useSetAppointmentAddons();

  // Turn system: when booking a walk-in, ask who is "Next Up" so we can
  // pre-assign to the correct technician and apply the Consideration Lock.
  // Include serviceId in the query so the server can filter to techs who
  // actually perform this service.
  const _nbTurnCacheKey = `certxa_turn_${selectedStore?.id}`;
  const { data: turnEligibility } = useQuery<{ eligibleTechnicians: any[]; technicians: any[] }>({
    queryKey: ["/api/turn/eligibility", selectedStore?.id, selectedService?.id ?? null],
    queryFn: async () => {
      if (!navigator.onLine) {
        try {
          const raw = localStorage.getItem(_nbTurnCacheKey);
          if (raw) return JSON.parse(raw);
        } catch {}
        return { eligibleTechnicians: [], technicians: [] };
      }
      const svcParam = selectedService?.id ? `&serviceId=${selectedService.id}` : "";
      const res = await fetch(`/api/turn/eligibility?storeId=${selectedStore?.id}${svcParam}`, { credentials: "include" });
      if (!res.ok) return { eligibleTechnicians: [], technicians: [] };
      const d = await res.json();
      try { localStorage.setItem(_nbTurnCacheKey, JSON.stringify(d)); } catch {}
      return d;
    },
    enabled: (isWalkIn || isCalendarBooking) && !!selectedStore?.id,
    networkMode: "always",
  });
  // Used for walk-ins (to pre-select the correct tech) and for calendar bookings
  // (to know who Turn would have recommended, so overrides can be logged).
  const nextTurnTech = (isWalkIn || isCalendarBooking)
    ? (turnEligibility?.eligibleTechnicians?.[0] ?? null)
    : null;
  const { data: editAvailableTimeData } = useAvailableTime(editAppointmentId);

  const { data: serviceSuggestions } = useQuery<any[]>({
    queryKey: ["/api/intelligence/service-suggestion", paramClientId, selectedStore?.id],
    queryFn: async () => {
      const cid = paramClientId || null;
      if (!cid) return [];
      const res = await fetch(
        `/api/intelligence/service-suggestion/${cid}?storeId=${selectedStore?.id}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!paramClientId && !!selectedStore?.id,
    staleTime: 5 * 60 * 1000,
  });

  const handleCancel = () => {
    if (!selectedService) {
      navigate("/calendar");
    } else {
      setShowCancelConfirm(true);
    }
  };

  const addonTotalEarly = selectedAddons.reduce((sum, a) => sum + Number(a.price), 0);
  const addonDurationEarly = selectedAddons.reduce((sum, a) => sum + a.duration, 0);
  const totalDurationEarly = (selectedService?.duration || 0) + addonDurationEarly;
  const dateStringEarly = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
    : null;

  const { data: slots, isLoading: slotsLoading } = useAvailableSlots(
    selectedService?.id || null,
    selectedStore?.id || null,
    dateStringEarly,
    totalDurationEarly,
    staffMode === "specific" ? specificStaffId : null
  );

  useEffect(() => {
    // Set the slot immediately from URL params — does NOT wait for staffList so the
    // Request Booking button is enabled as soon as the page renders for a calendar booking.
    // staffName starts empty and is backfilled by the second effect below.
    if (!isCalendarBooking || calendarSlotInitialized) return;
    if (!calDate || !calTime || calStaffId === null) return;
    const utcTime = storeLocalToUtc(`${calDate}T${calTime}:00`, timezone);
    // Only enforce the past-time guard for regular calendar bookings.
    // noShowFill fills a specific past slot that was a no-show, so we
    // must let it through regardless of the current time.
    if (!isNoShowFill && utcTime.getTime() <= Date.now()) {
      navigate("/calendar");
      return;
    }
    // staffName left empty — backfilled once staffList arrives
    const staffMember = staffList?.find((s: Staff) => s.id === calStaffId) ?? null;
    if (staffMember) setSelectedStaff(staffMember);
    setSelectedSlot({
      time: utcTime.toISOString(),
      staffId: calStaffId,
      staffName: staffMember?.name ?? '',
    });
    if (staffMember) setCalendarSlotInitialized(true);
  }, [isCalendarBooking, staffList, calStaffId, calTime, calDate, timezone, calendarSlotInitialized, navigate, isNoShowFill]);

  // When the Turn system tells us who is next, lock the slot query to that tech
  // so the walk-in is booked against the correct technician.
  // Online only — offline is handled by the dedicated effect below, and this
  // effect's stale-localStorage-backed nextTurnTech must not clobber that pick.
  useEffect(() => {
    if (!isWalkIn || !navigator.onLine) return;
    if (!nextTurnTech) return;
    if (specificStaffId === nextTurnTech.id) return;
    setStaffMode("specific");
    setSpecificStaffId(nextTurnTech.id);
    setSelectedSlot(null);
  }, [isWalkIn, nextTurnTech?.id]);

  // Online only — see above.
  useEffect(() => {
    if (!isWalkIn || !navigator.onLine) return;
    if (selectedSlot) return;
    if (slotsLoading) return;
    if (!slots || slots.length === 0) return;
    const next = slots.find((s) => new Date(s.time).getTime() > Date.now());
    if (!next) return;
    setSelectedSlot(next);
    setSelectedStaff(staffList?.find((s: Staff) => s.id === next.staffId) || null);
  }, [isWalkIn, selectedSlot, slots, slotsLoading, staffList]);

  // Offline walk-in resolution: bypasses useAvailableSlots (a future-slot search
  // tool — the wrong shape for "who's turn-next, right now") entirely. Computes
  // a real Turn-fair pick from the snapshot + this device's local claim ledger,
  // claims it (so a second offline walk-in moments later doesn't repick the
  // same tech), and sets selectedSlot to "now" — the effect below then fires
  // handleRequestBooking once that state update lands.
  useEffect(() => {
    if (!walkInBookingPending || navigator.onLine) return;
    if (selectedSlot || walkInOfflineResolvingRef.current) return;

    if (!snapshot || !selectedStore?.id) {
      setWalkInBookingPending(false);
      void appAlert(t.noStaffWalkinAlert);
      navigate("/calendar");
      return;
    }

    let cancelled = false;
    walkInOfflineResolvingRef.current = true;
    setWalkInResolving(true);
    claimNextOfflineTurnTech(snapshot, selectedStore.id, selectedService?.id ?? null)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setWalkInBookingPending(false);
          void appAlert(t.noStaffWalkinAlert);
          navigate("/calendar");
          return;
        }
        pendingOfflineTurnRef.current = result;
        setStaffMode("specific");
        setSpecificStaffId(result.technician.id);
        setSelectedStaff(staffList?.find((s: Staff) => s.id === result.technician.id) ?? null);
        setSelectedSlot({ time: new Date().toISOString(), staffId: result.technician.id, staffName: result.technician.name });
      })
      .catch(() => {
        if (cancelled) return;
        setWalkInBookingPending(false);
        void appAlert(t.bookingFailedGeneric);
      })
      .finally(() => {
        walkInOfflineResolvingRef.current = false;
        if (!cancelled) setWalkInResolving(false);
      });

    return () => { cancelled = true; };
  }, [walkInBookingPending, selectedSlot, snapshot, selectedStore?.id, selectedService?.id, staffList, navigate, t]);

  useEffect(() => {
    if (!walkInBookingPending) return;
    if (!selectedSlot) return;
    setWalkInBookingPending(false);
    // Use the ref so we always call the latest closure even though
    // handleRequestBooking is not in the deps array.
    handleRequestBookingRef.current();
  }, [walkInBookingPending, selectedSlot]);

  useEffect(() => {
    if (!walkInBookingPending) return;
    if (slotsLoading) return;
    if (selectedSlot) return;
    if (slots && slots.length > 0) return;
    setWalkInBookingPending(false);
    void appAlert(t.noStaffWalkinAlert);
    navigate("/calendar");
  }, [walkInBookingPending, slotsLoading, selectedSlot, slots, navigate]);

  // Fast path: set the client from the direct single-client fetch (resolves before the
  // 500-client list) so the name shows immediately instead of "Walk-In".
  useEffect(() => {
    if (!directClient || clientInitialized) return;
    const customer: BookingClient = {
      id: directClient.id,
      name: directClient.fullName || `${(directClient as any).firstName ?? ''} ${(directClient as any).lastName ?? ''}`.trim(),
      email: (directClient as any).emails?.[0]?.emailAddress ?? null,
      phone: (directClient as any).phones?.[0]?.displayPhone ?? (directClient as any).phones?.[0]?.phoneNumberE164 ?? null,
      notes: null,
      birthday: (directClient as any).dateOfBirth ?? null,
      allergies: null,
      marketingOptIn: null,
      loyaltyPoints: null,
      storeId: selectedStore?.id ?? null,
      createdAt: (directClient as any).createdAt ?? "",
      updatedAt: (directClient as any).updatedAt ?? "",
    };
    setSelectedCustomer(customer);
    setClientInitialized(true);
  }, [directClient, clientInitialized, selectedStore?.id]);

  // Fallback: if the direct fetch missed (edge case), find client in the full list.
  useEffect(() => {
    if (paramClientId && customers && !clientInitialized) {
      const client = customers.find((c: BookingClient) => String(c.id) === String(paramClientId));
      if (client) {
        setSelectedCustomer(client);
        setClientInitialized(true);
      }
    }
  }, [paramClientId, customers, clientInitialized]);

  useEffect(() => {
    if (editAppointmentId && services && staffList && !editInitialized) {
      fetch(`/api/appointments?storeId=${selectedStore?.id}`, { credentials: "include" })
        .then(res => res.json())
        .then((allAppointments: any[]) => {
          const apt = allAppointments.find((a: any) => a.id === editAppointmentId);
          if (!apt) return;

          const svc = services.find((s: Service) => s.id === apt.serviceId);
          if (svc) {
            setSelectedService(svc);
            setSelectedCategory(svc.category);
          }

          const staff = staffList.find((s: Staff) => s.id === apt.staffId);
          if (staff) {
            setSelectedStaff(staff);
            setStaffMode("specific");
            setSpecificStaffId(staff.id);
          }

          if (apt.customer && customers) {
            const client = customers.find((c: BookingClient) => String(c.id) === String(apt.customerId));
            if (client) setSelectedCustomer(client);
          }

          if (apt.notes) setNotes(apt.notes);

          if (apt.appointmentAddons && apt.appointmentAddons.length > 0) {
            const addonItems = apt.appointmentAddons
              .map((aa: any) => aa.addon)
              .filter(Boolean);
            setSelectedAddons(addonItems);
          }

          if (isReschedule) {
            setSelectedDate(getNowInTimezone(timezone));
            setSelectedSlot(null);
          } else {
            const aptDate = new Date(apt.date);
            setSelectedDate(aptDate);
            setSelectedSlot({
              time: apt.date,
              staffId: apt.staffId,
              staffName: staff?.name || "",
            });
          }

          setEditInitialized(true);

          if (isReschedule) {
            setStep("details");
          } else if (apt.appointmentAddons && apt.appointmentAddons.length > 0) {
            setStep("addons");
          }
        })
        .catch(() => {});
    }
  }, [editAppointmentId, services, staffList, customers, selectedStore, editInitialized]);

  const { data: availableAddons, isLoading: addonsLoading } = useAddonsForService(selectedService?.id || null);

  const addonTotal = addonTotalEarly;
  const addonDuration = addonDurationEarly;
  const servicePrice = selectedService ? Number(selectedService.price) : 0;
  const totalPrice = servicePrice + addonTotal;
  const totalDuration = totalDurationEarly;
  const dateString = dateStringEarly;

  useEffect(() => {
    autoAdvanceOriginRef.current = null;
    setAutoAdvancing(false);
  }, [selectedService?.id, specificStaffId, staffMode, totalDuration, selectedStore?.id]);

  useEffect(() => {
    if (isCalendarBooking) return;
    if (!selectedDate) return;
    if (slotsLoading) return;
    if (!slots) return;
    if (slots.length > 0) {
      setAutoAdvancing(false);
      return;
    }
    if (!selectedService || !selectedStore || totalDuration <= 0) return;
    if (staffMode === "specific" && !specificStaffId) return;

    if (!autoAdvanceOriginRef.current) {
      autoAdvanceOriginRef.current = selectedDate;
    }
    const daysAhead = Math.floor(
      (selectedDate.getTime() - autoAdvanceOriginRef.current.getTime()) / 86400000,
    );
    if (daysAhead >= 60) {
      setAutoAdvancing(false);
      return;
    }

    setAutoAdvancing(true);
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    setSelectedDate(next);
  }, [
    slots,
    slotsLoading,
    selectedDate,
    selectedService,
    selectedStore,
    totalDuration,
    staffMode,
    specificStaffId,
    isCalendarBooking,
  ]);

  const categoryNames = useMemo(() => {
    let names: string[] = [];
    if (categories && categories.length > 0) {
      names = Array.from(new Set(categories.map((c: any) => c.name))) as string[];
    } else if (activeServices) {
      const catSet = new Set<string>();
      activeServices.forEach((s: Service) => catSet.add(s.category));
      names = Array.from(catSet);
    }
    if (categoryOrder) {
      return categoryOrder.filter((c) => names.includes(c)).concat(names.filter((c) => !categoryOrder.includes(c)));
    }
    return names.sort();
  }, [activeServices, categories, categoryOrder]);

  const categoryNameToId = useMemo(() => {
    const map = new Map<string, number>();
    (categories ?? []).forEach((c: any) => map.set(c.name, c.id));
    return map;
  }, [categories]);

  const displayCategoryName = (cat: string | null) => {
    if (!cat) return "";
    return translateName("category", categoryNameToId.get(cat), cat);
  };

  useEffect(() => {
    const stored = localStorage.getItem("categoryOrder");
    if (stored) setCategoryOrder(JSON.parse(stored));
  }, []);

  const filteredServices = useMemo(() => {
    if (!activeServices) return [];
    const activeCat = selectedCategory || (categoryNames.length > 0 ? categoryNames[0] : null);
    if (!activeCat) return activeServices;
    return activeServices.filter((s: Service) => s.category === activeCat);
  }, [activeServices, selectedCategory, categoryNames]);

  const activeCategory = selectedCategory || (categoryNames.length > 0 ? categoryNames[0] : null);

  // Kiosk/touch-screen monitors have no good way to scroll — paginate the
  // desktop service grid with Prev/Next cards instead of a scrollbar.
  const serviceGridPage = useGridPagination(filteredServices, activeCategory);

  const handleSelectService = (service: Service) => {
    const swo = service as ServiceWithOptions;
    if (swo.options && swo.options.length > 1) {
      setOptionPickerService(swo);
      return;
    }
    if (selectedService?.id !== service.id) {
      setSelectedAddons([]);
      setSelectedResourceId(null);
      if (!isCalendarBooking) {
        setSelectedSlot(null);
        setSelectedStaff(null);
      }
    }
    setSelectedService(service);
    setStep("addons");
  };

  const handlePickServiceOption = (svc: ServiceWithOptions, opt: ServiceOption) => {
    const synthetic: Service = {
      ...svc,
      name: `${svc.name} – ${opt.name}`,
      duration: opt.durationMinutes,
      price: opt.price,
    } as Service;
    if (selectedService?.id !== svc.id) {
      setSelectedAddons([]);
      setSelectedResourceId(null);
      if (!isCalendarBooking) {
        setSelectedSlot(null);
        setSelectedStaff(null);
      }
    }
    setSelectedService(synthetic);
    setOptionPickerService(null);
    setStep("addons");
  };

  const handleRemoveService = () => {
    setSelectedService(null);
    setSelectedAddons([]);
    setSelectedResourceId(null);
    setSelectedSlot(null);
    setSelectedStaff(null);
    setStep("services");
  };

  const handleToggleAddon = (addon: Addon) => {
    setSelectedAddons(prev => {
      const exists = prev.find(a => a.id === addon.id);
      if (exists) return prev.filter(a => a.id !== addon.id);
      return [...prev, addon];
    });
  };

  const handleRemoveAddon = (addonId: number) => {
    setSelectedAddons(prev => prev.filter(a => a.id !== addonId));
  };

  const triggerWalkInBooking = () => {
    if (selectedSlot) {
      handleRequestBooking();
    } else {
      setWalkInBookingPending(true);
    }
  };

  const handleContinueToAddons = () => {
    if (availableAddons && availableAddons.length > 0) {
      setStep("addons");
    } else if (isCalendarBooking && selectedSlot) {
      handleRequestBooking();
    } else if (isWalkIn) {
      triggerWalkInBooking();
    } else {
      setStep("details");
    }
  };

  const handleContinueToDetails = () => {
    if (isCalendarBooking) {
      // For calendar bookings the slot is always known (from URL params or state).
      // handleRequestBooking synthesizes it from URL params if selectedSlot is null,
      // so we can always confirm immediately — no need to send the user to the
      // details step (staff/time selection) just because of an offline race condition.
      handleRequestBooking();
      return;
    }
    if (isWalkIn) {
      triggerWalkInBooking();
      return;
    }
    setStep("details");
  };

  const handleSaveEdit = () => {
    if (!editAppointmentId) return;
    setAppointmentAddons.mutate(
      { appointmentId: editAppointmentId, addonIds: selectedAddons.map(a => a.id) },
      {
        onSuccess: (result) => {
          if (result && (result as any).__conflict) return; // conflict dialog will show
          navigate("/calendar");
        },
      }
    );
  };

  const handleConflictShorten = (addonIds: number[]) => {
    if (!editAppointmentId) return;
    setAppointmentAddons.clearConflict();
    setAppointmentAddons.mutate(
      { appointmentId: editAppointmentId, addonIds },
      { onSuccess: () => navigate("/calendar") }
    );
  };

  const handleConflictReassign = async (staffId: number) => {
    if (!editAppointmentId) return;
    // Update staff on the appointment first, then reapply addons
    await fetch(`/api/appointments/${editAppointmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ staffId }),
    });
    setAppointmentAddons.clearConflict();
    setAppointmentAddons.mutate(
      { appointmentId: editAppointmentId, addonIds: selectedAddons.map(a => a.id) },
      { onSuccess: () => navigate("/calendar") }
    );
  };

  const handleConflictPartial = (addonIds: number[]) => {
    if (!editAppointmentId) return;
    setAppointmentAddons.clearConflict();
    setAppointmentAddons.mutate(
      { appointmentId: editAppointmentId, addonIds },
      { onSuccess: () => navigate("/calendar") }
    );
  };

  const handleConflictOverride = () => {
    if (!editAppointmentId) return;
    setAppointmentAddons.clearConflict();
    setAppointmentAddons.mutate(
      { appointmentId: editAppointmentId, addonIds: selectedAddons.map(a => a.id), force: true },
      { onSuccess: () => navigate("/calendar") }
    );
  };

  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  const handleStaffModeChange = (mode: "any" | "specific") => {
    setStaffMode(mode);
    setSelectedSlot(null);
    if (mode === "any") {
      setSpecificStaffId(null);
    }
  };

  const handleSpecificStaffSelect = (staffId: number) => {
    setSpecificStaffId(staffId);
    setSelectedSlot(null);
  };

  const handleRequestBooking = () => {
    // Synchronous guard — prevents a second call from sneaking through before
    // React re-renders with createAppointment.isPending=true (rapid tap issue).
    if (bookingSubmittingRef.current || bookingSubmitted) return;
    bookingSubmittingRef.current = true;

    if (!selectedService) { bookingSubmittingRef.current = false; return; }

    // For calendar bookings offline the initialization effect may not have
    // run yet (selectedStore / staffList still loading). Synthesize the slot
    // directly from URL params so we never silently bail out.
    let slotToUse = selectedSlot;
    if (!slotToUse && isCalendarBooking && calStaffId !== null && calDate && calTime) {
      const utcTime = storeLocalToUtc(`${calDate}T${calTime}:00`, timezone);
      slotToUse = {
        time: utcTime.toISOString(),
        staffId: calStaffId,
        staffName: staffList?.find((s: Staff) => s.id === calStaffId)?.name ?? "",
      };
      // Persist it into state so downstream renders (e.g. confirmation) have it.
      setSelectedSlot(slotToUse);
    }

    if (!slotToUse) { bookingSubmittingRef.current = false; return; }

    const staffId = slotToUse.staffId;

    const finalize = (appointmentId?: number | string) => {
      if (isWalkIn && selectedStore?.id) {
        // Online: do NOT pass staffId — the server picks whoever is #1 in the
        // queue and applies the Consideration Lock. Passing staffId would flag
        // it as a manual request-bypass, skipping the lock entirely.
        //
        // Offline: the client already ran Turn's own ranking (pendingOfflineTurnRef,
        // set by the offline-resolution effect above) — pass that staffId back
        // plus source:"offline_turn" so the server still applies the lock (it
        // treats an unlabeled staffId as a manual override otherwise).
        const offlineTurn = pendingOfflineTurnRef.current;
        const turnPayload: Record<string, unknown> = {
          storeId: selectedStore.id,
          appointmentId,
          serviceId: selectedService?.id ?? null,
          ...(offlineTurn ? { staffId: offlineTurn.technician.id, source: "offline_turn" } : {}),
        };
        if (!navigator.onLine) {
          const tempId = `turn_assign_${Date.now()}`;
          // appointmentId is the CREATE_BOOKING temp id here (a "local_booking_..."
          // string) — sync-engine's applyClientMappings resolves it to the real
          // numeric id once CREATE_BOOKING confirms in the same sync pass. Give
          // this action an explicit sequence_index derived from that temp id's
          // embedded timestamp (+ a fixed offset) so it's guaranteed to sort
          // after its parent CREATE_BOOKING, not left to Date.now() coincidence.
          const parentTs = typeof appointmentId === "string" ? Number(appointmentId.split("_")[2]) : NaN;
          const sequence_index = Number.isFinite(parentTs) ? parentTs + 1000 : Date.now();
          if (offlineTurn) {
            turnClaimsDB.tagClaim(offlineTurn.claim.id, String(appointmentId ?? "")).catch(() => {});
          }
          actionQueueDB.add({
            type: "TURN_ASSIGN",
            entity_temp_id: tempId,
            payload: turnPayload,
            timestamp: Date.now(),
            sequence_index,
            idempotency_key: tempId,
          }).catch(() => {});
        } else {
          fetch("/api/turn/assign-walkin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(turnPayload),
          }).then(() => {
            window.dispatchEvent(new CustomEvent("turn-eligibility-changed"));
            queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", selectedStore.id] });
          }).catch(() => {});
        }
      } else if (isCalendarBooking && staffId && selectedStore?.id) {
        // Front desk clicked a specific tech's slot — this is a Turn override.
        // Log it for the favoritism monitor without altering the queue.
        const overridePayload = {
          storeId: selectedStore.id,
          appointmentId,
          assignedStaffId: staffId,
          turnRecommendedStaffId: nextTurnTech?.id ?? null,
        };
        if (!navigator.onLine) {
          const tempId = `turn_log_${Date.now()}`;
          actionQueueDB.add({
            type: "TURN_LOG_OVERRIDE",
            entity_temp_id: tempId,
            payload: overridePayload,
            timestamp: Date.now(),
            idempotency_key: tempId,
          }).catch(() => {});
        } else {
          fetch("/api/turn/log-override", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(overridePayload),
          }).catch(() => {});
        }
      }
      pendingOfflineTurnRef.current = null;
      setBookingSubmitted(true);
      setShowConfirmation(true);
    };

    createAppointment.mutate(
      {
        date: slotToUse.time,
        serviceId: selectedService.id,
        staffId,
        customerId: selectedCustomer?.id || undefined,
        clientId: selectedCustomer?.id || undefined,
        _offlineCustomerName: selectedCustomer?.name || undefined,
        _offlineServicePrice: Number(selectedService.price),
        _offlineAddons: selectedAddons.map((addon) => ({
          id: addon.id,
          name: addon.name,
          price: Number(addon.price),
          duration: Number(addon.duration ?? 0),
        })),
        duration: totalDuration,
        // Drop a stale resource pick if it doesn't match what the currently
        // selected service actually needs (e.g. the calendar's resource view
        // pre-selected a chair, then the client picked a manicure service
        // instead) — let the server auto-assign the correct type instead.
        resourceId: matchingBookingResources.some((r: any) => r.id === selectedResourceId)
          ? selectedResourceId!
          : undefined,
        notes: notes || undefined,
        // Walk-in clients are present right now — start the appointment immediately.
        // isCalendarBooking walk-ins also get "started" so they show In Progress on creation.
        status: isWalkIn ? "started" : "pending",
        // Tell the server this is a no-show fill so it skips the
        // "no past appointments" guard and the conflict check for the
        // no-show slot itself.
        ...(isNoShowFill ? { noShowFill: true } : {}),
      } as any,
      {
        onSuccess: (data: any) => {
          // Local offline bookings get a string temp-ID — the server addon endpoint
          // requires a real numeric ID, so skip the mutate and go straight to confirm.
          const isLocalBooking = typeof data?.id === "string";
          if (selectedAddons.length > 0 && data?.id && !isLocalBooking) {
            setAppointmentAddons.mutate(
              { appointmentId: data.id, addonIds: selectedAddons.map(a => a.id) },
              {
                onSuccess: () => finalize(data.id),
                onError: () => finalize(data.id),
              }
            );
          } else {
            finalize(data?.id);
          }
        },
        onError: (err: any) => {
          // Reset the immediate guard so the user can retry after a failure.
          bookingSubmittingRef.current = false;
          void appAlert(
            err?.message
              ? t.bookingFailedPrefix(err.message)
              : t.bookingFailedGeneric
          );
        },
      }
    );
  };
  // Keep the ref in sync so the walkInBookingPending effect always has the
  // latest closure (captures current selectedService, selectedSlot, etc.).
  handleRequestBookingRef.current = handleRequestBooking;

  if (authLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex bg-[#F7F5F0] overflow-hidden">
      {/* ── SERVICES STEP ── */}
      {step === "services" && (
        <>
          {/* ── Mobile layout ── */}
          <div className="flex flex-col flex-1 overflow-hidden md:hidden">

            {/* ── Mobile: Category picker page ── */}
            {mobileCatStep === "categories" && (
              <>
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-200 shrink-0">
                  <Button variant="ghost" size="icon" onClick={handleCancel} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100" data-testid="button-cancel-booking">
                    <X className="w-5 h-5" />
                  </Button>
                  <h1 className="font-bold text-lg flex-1 text-gray-900 tracking-tight">{t.newBookingTitle}</h1>
                  {selectedCustomer && (
                    <span className="text-sm text-gray-500 truncate max-w-[120px]">{selectedCustomer.name}</span>
                  )}
                </div>
                <div className="flex gap-1.5 px-4 pb-3 pt-3 bg-white border-b border-gray-100 shrink-0">
                  {[1,2,3,4,5,6].map((s) => (
                    <div key={s} className={cn("h-1 flex-1 rounded-full transition-all duration-300", s <= 1 ? "bg-primary" : "bg-gray-200")} />
                  ))}
                </div>

                {/* Category list — full page, desktop sidebar style */}
                <div className="flex-1 overflow-y-auto bg-[#F7F5F0]">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{t.services}</p>
                  </div>
                  {servicesLoading ? (
                    <div className="flex items-center justify-center h-40">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <nav className="py-2">
                      {categoryNames.map((cat) => {
                        const count = activeServices?.filter((s: Service) => s.category === cat).length ?? 0;
                        return (
                          <button
                            key={cat}
                            onClick={() => {
                              setSelectedCategory(cat);
                              setMobileCatStep("services");
                            }}
                            data-testid={`button-category-${cat.toLowerCase().replace(/\s+/g, "-")}`}
                            className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 border-l-[3px] border-transparent hover:bg-gray-100 active:bg-gray-200 transition-colors"
                          >
                            <span className="font-semibold text-base text-gray-900">{displayCategoryName(cat)}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-gray-400">{t.serviceCount(count)}</span>
                              <ArrowLeft className="w-4 h-4 text-gray-400 rotate-180" />
                            </div>
                          </button>
                        );
                      })}
                    </nav>
                  )}
                </div>
              </>
            )}

            {/* ── Mobile: Services list page (after category selected) ── */}
            {mobileCatStep === "services" && (
              <>
                {/* Header with back to categories */}
                <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-200 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMobileCatStep("categories")}
                    className="text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                    data-testid="button-back-categories"
                  >
                    <ArrowLeft className="w-5 h-5" />

                  </Button>
                  <div className="flex-1 min-w-0">
                    <h1 className="font-bold text-base text-gray-900 leading-tight truncate">{displayCategoryName(activeCategory)}</h1>
                    {selectedCustomer && (
                      <p className="text-xs text-gray-500 truncate">{selectedCustomer.name}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 px-4 pb-3 pt-3 bg-white border-b border-gray-100 shrink-0">
                  {[1,2,3,4,5,6].map((s) => (
                    <div key={s} className={cn("h-1 flex-1 rounded-full transition-all duration-300", s <= 2 ? "bg-primary" : "bg-gray-200")} />
                  ))}
                </div>

                {/* Service grid */}
                <div className="flex-1 overflow-y-auto p-4 pb-32 bg-gray-50">
                  {servicesLoading ? (
                    <div className="flex items-center justify-center h-40">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">
                      {filteredServices.map((service: Service) => {
                        const isSelected = selectedService?.id === service.id;
                        return (
                          <Card
                            key={service.id}
                            className={cn(
                              "p-3 cursor-pointer transition-all flex flex-col justify-between min-h-[100px]",
                              isSelected
                                ? "ring-2 ring-primary bg-primary/5 shadow-lg shadow-primary/20"
                                : "bg-white hover-elevate"
                            )}
                            onClick={() => handleSelectService(service)}
                            data-testid={`card-service-${service.id}`}
                          >
                            {service.imageUrl && (
                              <div className="w-full aspect-[4/3] rounded-md bg-muted/50 mb-2 overflow-hidden">
                                <img
                                  src={service.imageUrl}
                                  alt={service.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-semibold text-sm leading-tight" data-testid={`text-service-name-${service.id}`}>
                                {displayServiceName(service)}
                              </h3>
                              {(service as ServiceWithOptions).options?.length > 1 && (
                                <Badge className="text-[10px] px-1.5 py-0 h-4 leading-none">
                                  {t.optionsCount((service as ServiceWithOptions).options.length)}
                                </Badge>
                              )}
                            </div>
                            {!((service as ServiceWithOptions).options?.length > 1) && (
                              <div className="flex items-center justify-between mt-auto pt-2 gap-1">
                                <span className={cn("font-bold text-sm min-w-0 truncate", isSelected ? "text-primary" : "text-foreground")}>
                                  ${Number(service.price).toFixed(2)}
                                </span>
                                <Badge variant="secondary" className="no-default-active-elevate text-xs shrink-0">
                                  {service.duration}m
                                </Badge>
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Mobile bottom action bar */}
                <div
                  className="fixed bottom-0 left-0 right-0 bg-gray-950 px-4 pt-4 md:pb-4 z-20"
                  style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
                >
                  {selectedService ? (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-white leading-snug" data-testid="text-summary-service">{displayServiceName(selectedService)}</p>
                        <p className="text-xs text-white/50">
                          ${Number(selectedService.price).toFixed(2)} · {t.minSuffix(selectedService.duration)}
                        </p>
                      </div>
                      <Button
                        className="h-12 px-6 bg-primary hover:bg-primary/90 text-white shrink-0 rounded-xl font-semibold"
                        onClick={handleContinueToAddons}
                        data-testid="button-request-booking"
                      >
                        {t.continueBtn}
                      </Button>
                    </div>
                  ) : (
                    <Button className="w-full h-12 rounded-xl bg-white/10 text-white/40 border-0 hover:bg-white/10" disabled data-testid="button-request-booking">
                      {t.selectServiceCta}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Desktop layout ── */}
          <div className="hidden md:flex flex-1 overflow-hidden">
            <div className="w-[180px] flex-shrink-0 border-r bg-gray-50 flex flex-col shadow-[4px_0_20px_rgba(0,0,0,0.1)] z-10">
              <div className="px-5 py-4 border-b">
                <span className="font-bold text-lg tracking-tight font-display">{t.services}</span>
              </div>
              <nav className="flex-1 overflow-y-auto py-2">
                {categoryNames.map((cat) => (
                  <div key={cat}>
                    <button
                      onClick={() => setSelectedCategory(cat)}
                      className={cn(
                        "w-full text-left px-5 py-3 text-sm font-semibold font-display transition-colors flex items-center gap-2",
                        activeCategory === cat
                          ? "text-gray-900 border-l-[3px] border-gray-900 bg-gray-200/60"
                          : "text-gray-700 border-l-[3px] border-transparent hover:text-gray-900 hover:bg-gray-100"
                      )}
                      data-testid={`button-category-${cat.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {displayCategoryName(cat)}
                    </button>
                  </div>
                ))}
              </nav>
              <div className="p-3 border-t">
                <Button
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white h-12"
                  onClick={handleCancel}
                  data-testid="button-cancel-booking"
                >
                  <span className="font-semibold">{t.cancel}</span>
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {servicesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Service suggestion strip for returning clients — only for
                      services that are still active/bookable today. */}
                  {(() => {
                    const activeSuggestions = (serviceSuggestions ?? []).filter((s: any) =>
                      activeServices?.some((sv) => sv.id === s.serviceId)
                    );
                    if (activeSuggestions.length === 0 || selectedService) return null;
                    return (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                        {t.lastBooked}
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {activeSuggestions.slice(0, 3).map((s: any) => (
                          <button
                            key={s.serviceId}
                            type="button"
                            onClick={() => {
                              const match = activeServices?.find((sv: Service) => sv.id === s.serviceId);
                              if (match) handleSelectService(match);
                            }}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-violet-200 bg-violet-50 hover:bg-violet-100 text-sm font-medium text-violet-900 transition-colors"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
                            <span className="truncate max-w-[140px]">{translateName("service", s.serviceId, s.serviceName)}</span>
                            <span className="text-xs text-violet-500 flex-shrink-0 ml-1">×{s.visitCount}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    );
                  })()}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4">
                    {serviceGridPage.pageItems.map((service: Service) => {
                      const isSelected = selectedService?.id === service.id;
                      return (
                        <Card
                          key={service.id}
                          className={cn(
                            "p-4 cursor-pointer transition-all min-h-[112px] flex flex-col",
                            isSelected ? "ring-2 ring-primary shadow-md" : "hover-elevate"
                          )}
                          onClick={() => handleSelectService(service)}
                          data-testid={`card-service-${service.id}`}
                        >
                          <div className="flex flex-col flex-1 justify-between gap-2">
                            <div className="flex flex-col gap-2">
                              {service.imageUrl && (
                                <div className="w-full aspect-[4/3] rounded-md bg-muted/50 flex items-center justify-center mb-1 overflow-hidden relative">
                                  <img
                                    src={service.imageUrl}
                                    alt={service.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h3 className="font-semibold text-base leading-tight" data-testid={`text-service-name-${service.id}`}>{displayServiceName(service)}</h3>
                                {(service as ServiceWithOptions).options?.length > 1 && (
                                  <Badge className="text-[10px] px-1.5 py-0 h-4 leading-none shrink-0">
                                    {t.optionsCount((service as ServiceWithOptions).options.length)}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {!((service as ServiceWithOptions).options?.length > 1) && (
                              <div className="flex items-center justify-between gap-2 pt-1">
                                <span className="font-bold text-base min-w-0 truncate">
                                  ${Number(service.price).toFixed(2)}
                                </span>
                                <Badge variant="secondary" className="no-default-active-elevate text-xs shrink-0">
                                  {service.duration}m
                                </Badge>
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>

                  {serviceGridPage.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2" data-testid="services-pager">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={serviceGridPage.goPrev}
                        disabled={!serviceGridPage.showPrev}
                        data-testid="button-services-prev-page"
                      >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        {t.previousPage}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Page {serviceGridPage.page + 1} of {serviceGridPage.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={serviceGridPage.goNext}
                        disabled={!serviceGridPage.showNext}
                        data-testid="button-services-next-page"
                      >
                        {t.nextPage}
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="hidden md:flex">
            <BookingSummaryPanel
              selectedService={selectedService}
              selectedAddons={selectedAddons}
              selectedStaff={selectedStaff}
              selectedCustomer={selectedCustomer}
              customers={customers}
              totalPrice={totalPrice}
              totalDuration={totalDuration}
              onSetCustomer={setSelectedCustomer}
              onRemoveService={handleRemoveService}
              onRemoveAddon={handleRemoveAddon}
              onEditAddons={() => setStep("addons")}
              availableMinutes={availableMinutes}
              editAvailableMinutes={editAvailableTimeData?.availableMinutes}
              isCalendarBooking={isCalendarBooking}
              isEditMode={!!editAppointmentId}
              isWalkIn={isWalkIn}
              footerContent={
                editAppointmentId ? (
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 h-12 border-2 border-gray-400 text-gray-800 font-semibold hover:bg-gray-50"
                      onClick={() => navigate("/calendar")}
                      data-testid="button-edit-checkout"
                    >
                      {t.checkout}
                    </Button>
                    <Button
                      className="flex-1 h-12 bg-gray-900 hover:bg-gray-800 text-white font-semibold"
                      onClick={handleSaveEdit}
                      disabled={setAppointmentAddons.isPending}
                      data-testid="button-save-edit"
                    >
                      {setAppointmentAddons.isPending ? t.saving : t.save}
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full bg-gray-900 hover:bg-gray-800 text-white h-12"
                    onClick={handleContinueToAddons}
                    disabled={!selectedService}
                    data-testid="button-request-booking"
                  >
                    <span className="flex flex-col items-center leading-tight">
                      <span className="font-semibold">{t.requestBooking}</span>
                      <span className="font-semibold opacity-90">{t.minSuffix(totalDuration)}</span>
                    </span>
                  </Button>
                )
              }
            />
          </div>
        </>
      )}

      {/* ── ADDONS STEP ── */}
      {step === "addons" && (
        <>
          {/* ── Mobile layout ── */}
          <div className="flex flex-col flex-1 overflow-hidden md:hidden">
            <div className="px-4 py-4 flex items-center gap-3 bg-gray-950 shrink-0">
              {!editAppointmentId && (
                <Button variant="ghost" size="icon" onClick={() => setStep("services")} className="text-white/70 hover:text-white hover:bg-white/10" data-testid="button-back-services">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              <div className="flex-1">
                <h2 className="font-semibold text-lg text-white" data-testid="text-extras-heading">{t.extras}</h2>
                <p className="text-xs text-white/50" data-testid="text-extras-subheading">{t.extrasFor(displayServiceName(selectedService))}</p>
              </div>
            </div>
            <div className="flex gap-1.5 px-4 pb-3 bg-gray-950 shrink-0">
              {[1,2,3,4,5,6].map((s) => (
                <div key={s} className={cn("h-1 flex-1 rounded-full transition-all duration-300", s <= 3 ? "bg-primary" : "bg-white/15")} />
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-28 bg-gray-50">
              {addonsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : !availableAddons || availableAddons.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                  <Sparkles className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">{t.noExtras}</p>
                  <Button onClick={handleContinueToDetails} className="mt-2 bg-primary text-white h-11 px-8 rounded-xl">
                    {t.continueBtn}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {availableAddons.map((addon: Addon) => {
                    const isSelected = selectedAddons.some(a => a.id === addon.id);
                    return (
                      <Card
                        key={addon.id}
                        className={cn(
                          "p-3 cursor-pointer transition-all relative",
                          isSelected ? "ring-2 ring-primary shadow-md" : "hover-elevate"
                        )}
                        onClick={() => handleToggleAddon(addon)}
                        data-testid={`card-addon-${addon.id}`}
                      >
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center" data-testid={`addon-selected-${addon.id}`}>
                            <Check className="w-3 h-3 text-primary-foreground" />
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5">
                          <h3 className="font-semibold text-xs leading-tight" data-testid={`text-addon-name-${addon.id}`}>{translateName("addon", addon.id, addon.name)}</h3>
                          <div className="flex items-center justify-between mt-auto pt-1">
                            <span className="font-bold text-xs">${Number(addon.price).toFixed(2)}</span>
                            <Badge variant="secondary" className="no-default-active-elevate text-[10px]">{addon.duration}m</Badge>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mobile bottom action bar */}
            <div
              className="fixed bottom-0 left-0 right-0 bg-gray-950 px-4 pt-4 md:pb-4 z-20"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate text-white">{displayServiceName(selectedService)}</p>
                  <p className="text-xs text-white/50">
                    ${totalPrice.toFixed(2)} · {t.minSuffix(totalDuration)}
                    {selectedAddons.length > 0 && ` · ${t.extraCount(selectedAddons.length)}`}
                  </p>
                </div>
                <Button
                  className="h-12 px-6 bg-primary hover:bg-primary/90 text-white shrink-0 rounded-xl font-semibold"
                  onClick={handleContinueToDetails}
                  disabled={walkInResolving || createAppointment.isPending || bookingSubmitted}
                  data-testid="button-request-booking-addons"
                >
                  {walkInResolving || createAppointment.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    isCalendarBooking || isWalkIn ? t.bookBtn : t.continueBtn
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* ── Desktop layout ── */}
          <div className="hidden md:flex flex-1 overflow-y-auto flex-col">
            <div className="p-4 border-b flex items-center gap-3 bg-card">
              {!editAppointmentId && (
                <Button variant="ghost" size="icon" onClick={() => setStep("services")} data-testid="button-back-services">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              <div className="flex-1">
                <h2 className="font-semibold text-lg" data-testid="text-extras-heading">{t.extras}</h2>
                <p className="text-xs text-muted-foreground" data-testid="text-extras-subheading">{t.extrasFor(displayServiceName(selectedService))}</p>
              </div>
              {!editAppointmentId && (
                <Button variant="outline" size="sm" onClick={() => setStep("services")} data-testid="button-no-addons">
                  {t.noAddonsBtn}
                </Button>
              )}
            </div>
            <div className="p-6 space-y-5">
              {addonsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {availableAddons?.map((addon: Addon) => {
                    const isSelected = selectedAddons.some(a => a.id === addon.id);
                    return (
                      <Card
                        key={addon.id}
                        className={cn(
                          "p-4 cursor-pointer transition-all relative",
                          isSelected ? "ring-2 ring-primary shadow-md" : "hover-elevate"
                        )}
                        onClick={() => handleToggleAddon(addon)}
                        data-testid={`card-addon-${addon.id}`}
                      >
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center" data-testid={`addon-selected-${addon.id}`}>
                            <Check className="w-3 h-3 text-primary-foreground" />
                          </div>
                        )}
                        <div className="flex flex-col gap-2">
                          <h3 className="font-semibold text-sm leading-tight" data-testid={`text-addon-name-${addon.id}`}>{translateName("addon", addon.id, addon.name)}</h3>
                          {addon.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{translateDescription("addon", addon.id, addon.description)}</p>
                          )}
                          <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                            <span className="font-bold text-sm min-w-0 truncate">${Number(addon.price).toFixed(2)}</span>
                            <Badge variant="secondary" className="no-default-active-elevate text-[10px] shrink-0">
                              {addon.duration}m
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="hidden md:flex">
            <BookingSummaryPanel
              selectedService={selectedService}
              selectedAddons={selectedAddons}
              selectedStaff={selectedStaff}
              selectedCustomer={selectedCustomer}
              customers={customers}
              totalPrice={totalPrice}
              totalDuration={totalDuration}
              onSetCustomer={setSelectedCustomer}
              onRemoveService={handleRemoveService}
              onRemoveAddon={handleRemoveAddon}
              onEditAddons={() => setStep("addons")}
              availableMinutes={availableMinutes}
              editAvailableMinutes={editAvailableTimeData?.availableMinutes}
              isCalendarBooking={isCalendarBooking}
              isEditMode={!!editAppointmentId}
              isWalkIn={isWalkIn}
              footerContent={
                editAppointmentId ? (
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 h-12 border-2 border-gray-400 text-gray-800 font-semibold hover:bg-gray-50"
                      onClick={() => navigate("/calendar")}
                      data-testid="button-edit-checkout-addons"
                    >
                      {t.checkout}
                    </Button>
                    <Button
                      className="flex-1 h-12 bg-gray-900 hover:bg-gray-800 text-white font-semibold"
                      onClick={handleSaveEdit}
                      disabled={setAppointmentAddons.isPending}
                      data-testid="button-save-edit-addons"
                    >
                      {setAppointmentAddons.isPending ? t.saving : t.save}
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full bg-gray-900 hover:bg-gray-800 text-white h-12"
                    onClick={handleContinueToDetails}
                    disabled={walkInResolving || createAppointment.isPending || bookingSubmitted}
                    data-testid="button-request-booking-addons"
                  >
                    {walkInResolving || createAppointment.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span className="flex flex-col items-center leading-tight">
                        <span className="font-semibold">{t.requestBooking}</span>
                        <span className="font-semibold opacity-90">{t.minSuffix(totalDuration)}</span>
                      </span>
                    )}
                  </Button>
                )
              }
            />
          </div>
        </>
      )}

      {/* ── DETAILS STEP ── */}
      {step === "details" && (
        <>
          {/* ── Mobile layout — 3 dedicated pages ── */}
          <div className="flex flex-col flex-1 overflow-hidden md:hidden">

            {/* ─── Page 1: Choose Staff ─── */}
            {mobileDetailsStep === "staff" && (
              <>
                <div className="px-4 py-4 flex items-center gap-2 bg-gray-950 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (availableAddons && availableAddons.length > 0) setStep("addons");
                      else setMobileCatStep("services");
                      if (availableAddons && availableAddons.length === 0) setStep("services");
                    }}
                    className="text-white/70 hover:text-white hover:bg-white/10"
                    data-testid="button-back-from-details"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <div className="flex-1">
                    <span className="font-semibold text-lg text-white">{t.chooseStaff}</span>
                    <p className="text-xs text-white/40">{displayServiceName(selectedService)}</p>
                  </div>
                  <span className="text-xs text-white/30 font-medium">{t.ofThree(1)}</span>
                </div>
                <div className="flex gap-1.5 px-4 pb-3 bg-gray-950 shrink-0">
                  {[1,2,3,4,5,6].map((s) => (
                    <div key={s} className={cn("h-1 flex-1 rounded-full transition-all duration-300", s <= 4 ? "bg-primary" : "bg-white/15")} />
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto bg-white">
                  <div className="p-5">
                    <p className="text-sm text-muted-foreground mb-5">{t.pickStaffDesc}</p>
                    <div className="space-y-3">
                      {/* Any Staff */}
                      <button
                        onClick={() => handleStaffModeChange("any")}
                        className={cn(
                          "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                          staffMode === "any" ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300 bg-white"
                        )}
                        data-testid="card-staff-any"
                      >
                        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Users className="w-7 h-7 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-base">{t.anyStaff}</p>
                          <p className="text-sm text-muted-foreground">{t.firstAvailable}</p>
                        </div>
                        {staffMode === "any" && (
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                      </button>

                      {/* Staff members */}
                      {staffList?.map((member: Staff) => {
                        const isSelected = staffMode === "specific" && specificStaffId === member.id;
                        const color = member.color || "#3b82f6";
                        return (
                          <button
                            key={member.id}
                            onClick={() => { setStaffMode("specific"); handleSpecificStaffSelect(member.id); }}
                            className={cn(
                              "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                              isSelected ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300 bg-white"
                            )}
                            data-testid={`card-staff-${member.id}`}
                          >
                            <Avatar className="w-14 h-14 shrink-0">
                              <AvatarFallback style={{ backgroundColor: color + "22", color }} className="text-lg font-bold">
                                {member.name.split(" ").map((n: string) => n[0]).join("").toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-base truncate">{member.name}</p>
                              {member.role && <p className="text-sm text-muted-foreground capitalize truncate">{member.role}</p>}
                            </div>
                            {isSelected && (
                              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                                <Check className="w-3.5 h-3.5 text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Resource assignment — only shown for services that need a
                        pedicure chair or nail station. Picking one here is
                        optional (the server auto-assigns the first available
                        match if you don't), but only resources of the
                        required type are offered. */}
                    {requiredResourceType && matchingBookingResources.length > 0 && (
                      <div className="mt-5 pt-4 border-t">
                        <p className="text-sm font-semibold text-gray-900 mb-3">
                          {t.assignStation} <span className="text-muted-foreground font-normal">{t.optionalLabel}</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setSelectedResourceId(null)}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all",
                              !selectedResourceId
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-gray-200 text-gray-600 hover:border-gray-300"
                            )}
                          >
                            {t.noPreference}
                          </button>
                          {matchingBookingResources.map((r: any) => {
                            const em = ({ station: "💅", chair: "🪑", room: "🚪", other: "🛋️" } as Record<string, string>)[r.type] ?? "🛋️";
                            const isSel = selectedResourceId === r.id;
                            return (
                              <button
                                key={r.id}
                                onClick={() => setSelectedResourceId(isSel ? null : r.id)}
                                className={cn(
                                  "px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all",
                                  isSel
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                                )}
                              >
                                {em} {r.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className="bg-white border-t px-4 pt-4 md:pb-4"
                  style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
                >
                  <Button
                    className="w-full h-13 rounded-2xl font-semibold text-base"
                    onClick={() => setMobileDetailsStep("date")}
                    disabled={staffMode === "specific" && !specificStaffId}
                    data-testid="button-staff-next"
                  >
                    {t.nextChooseDate}
                  </Button>
                </div>
              </>
            )}

            {/* ─── Page 2: Choose Date ─── */}
            {mobileDetailsStep === "date" && (
              <>
                <div className="px-4 py-4 flex items-center gap-2 bg-gray-950 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMobileDetailsStep("staff")}
                    className="text-white/70 hover:text-white hover:bg-white/10"
                    data-testid="button-back-to-staff"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <div className="flex-1">
                    <span className="font-semibold text-lg text-white">{t.chooseDate}</span>
                    <p className="text-xs text-white/40">
                      {staffMode === "any" ? t.anyStaff : staffList?.find((s: Staff) => s.id === specificStaffId)?.name}
                    </p>
                  </div>
                  <span className="text-xs text-white/30 font-medium">{t.ofThree(2)}</span>
                </div>
                <div className="flex gap-1.5 px-4 pb-3 bg-gray-950 shrink-0">
                  {[1,2,3,4,5,6].map((s) => (
                    <div key={s} className={cn("h-1 flex-1 rounded-full transition-all duration-300", s <= 5 ? "bg-primary" : "bg-white/15")} />
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto bg-white">
                  <div className="p-4">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateChange}
                      disabled={(date) => date < todayStoreDate}
                      className="rounded-2xl border mx-auto w-full"
                      data-testid="calendar-date-picker"
                    />

                    {/* Notes field on date page */}
                    <div className="mt-5 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.notesOptional}</p>
                      <Input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t.specialReqPh}
                        data-testid="input-booking-notes"
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="bg-white border-t px-4 pt-4 md:pb-4"
                  style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
                >
                  <Button
                    className="w-full h-13 rounded-2xl font-semibold text-base"
                    onClick={() => setMobileDetailsStep("time")}
                    disabled={!selectedDate}
                    data-testid="button-date-next"
                  >
                    {t.nextChooseTime}
                  </Button>
                </div>
              </>
            )}

            {/* ─── Page 3: Choose Time Slot ─── */}
            {mobileDetailsStep === "time" && (
              <>
                <div className="px-4 py-4 flex items-center gap-2 bg-gray-950 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMobileDetailsStep("date")}
                    className="text-white/70 hover:text-white hover:bg-white/10"
                    data-testid="button-back-to-date"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <div className="flex-1">
                    <span className="font-semibold text-lg text-white">{t.chooseTime}</span>
                    <p className="text-xs text-white/40">
                      {dateStringEarly ? formatInTz(new Date(`${dateStringEarly}T12:00:00Z`), timezone, "EEEE, MMMM d") : ""}
                    </p>
                  </div>
                  <span className="text-xs text-white/30 font-medium">{t.ofThree(3)}</span>
                </div>
                <div className="flex gap-1.5 px-4 pb-3 bg-gray-950 shrink-0">
                  {[1,2,3,4,5,6].map((s) => (
                    <div key={s} className={cn("h-1 flex-1 rounded-full transition-all duration-300", s <= 6 ? "bg-primary" : "bg-white/15")} />
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto bg-white">
                  <div className="p-4">
                    {slotsLoading || autoAdvancing ? (
                      <div className="flex flex-col items-center justify-center h-48 gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        {autoAdvancing && <p className="text-sm text-muted-foreground">{t.findingNextDate}</p>}
                      </div>
                    ) : !slots || slots.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                        <Clock className="w-10 h-10 text-muted-foreground/30" />
                        <div>
                          <p className="text-base font-semibold text-foreground">{t.noTimesAvailable}</p>
                          <p className="text-sm text-muted-foreground mt-1">{t.noSlotsIn60Days}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setMobileDetailsStep("date")}>
                          {t.changeDate}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-4">
                          <p className="text-xs text-muted-foreground">
                            {t.slotsAvailable(slots.length, totalDuration, tzAbbr)}
                          </p>
                          {isOffline && (
                            <span className="flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-semibold">
                              <WifiOff className="w-2.5 h-2.5" />
                              {slotPendingCount > 0 ? t.pendingSync(slotPendingCount) : t.offlineLabel}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2.5">
                          {slots.map((slot) => {
                            const timePart = formatInTz(slot.time, timezone, "h:mm");
                            const periodPart = formatInTz(slot.time, timezone, "a").toUpperCase();
                            const staffForSlot = staffList?.find((s: Staff) => s.id === slot.staffId);
                            const isSelected = selectedSlot?.time === slot.time;
                            return (
                              <button
                                key={slot.time}
                                onClick={() => {
                                  setSelectedSlot(slot);
                                  setSelectedStaff(staffForSlot || null);
                                }}
                                className={cn(
                                  "flex flex-col items-center justify-center py-4 rounded-2xl border-2 transition-all",
                                  isSelected
                                    ? "bg-primary border-primary text-white shadow-lg shadow-primary/30"
                                    : "border-gray-200 hover:border-primary/40 bg-white"
                                )}
                                data-testid={`button-slot-${slot.time}`}
                              >
                                <span className="font-bold text-base leading-tight">{timePart}</span>
                                <span className={cn("text-xs font-medium mt-0.5", isSelected ? "text-white/80" : "text-muted-foreground")}>
                                  {periodPart}
                                </span>
                                {staffMode === "any" && staffForSlot && (
                                  <span className={cn("text-[10px] mt-1 truncate max-w-full px-1", isSelected ? "text-white/70" : "text-muted-foreground/70")}>
                                    {staffForSlot.name.split(" ")[0]}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  {!isWalkIn && !selectedCustomer && (
                    <div className="border-t px-4 pt-3 pb-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t.clientOptional}</p>
                      <ClientPickerWidget customers={customers} onSelect={setSelectedCustomer} />
                    </div>
                  )}
                </div>

                <div
                  className="bg-white border-t px-4 pt-4 md:pb-4"
                  style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
                >
                  {selectedSlot && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatInTz(selectedSlot.time, timezone, "h:mm a")} · {selectedSlot.staffName}</span>
                    </div>
                  )}
                  <Button
                    className="w-full h-13 rounded-2xl font-semibold text-base"
                    onClick={handleRequestBooking}
                    disabled={!selectedService || !selectedSlot || createAppointment.isPending || bookingSubmitted}
                    data-testid="button-complete-booking"
                  >
                    {createAppointment.isPending ? t.bookingEllipsis : bookingSubmitted ? t.bookedExclaim : t.completeBooking}
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* ── Desktop layout ── */}
          <div className="hidden md:flex flex-1 overflow-hidden">
            <div className="w-[320px] flex-shrink-0 border-r bg-card flex flex-col shadow-[4px_0_20px_rgba(0,0,0,0.1)] z-10">
              <div className="p-4 border-b flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => {
                  if (availableAddons && availableAddons.length > 0) setStep("addons");
                  else setStep("services");
                }} data-testid="button-back-from-details">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <span className="font-semibold text-lg">{t.selectDateHeading}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateChange}
                  disabled={(date) => date < todayStoreDate}
                  className="rounded-md border w-full"
                  data-testid="calendar-date-picker"
                />

                {!isWalkIn && !selectedCustomer && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t.clientLabel}</Label>
                    <ClientPickerWidget customers={customers} onSelect={setSelectedCustomer} />
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t.notesLabel}</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t.specialReqPh}
                    data-testid="input-booking-notes"
                  />
                </div>
              </div>
              <div className="p-3 border-t">
                <Button
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white h-12"
                  onClick={handleCancel}
                  data-testid="button-cancel-booking-details"
                >
                  <span className="font-semibold">{t.cancel}</span>
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-4 border-b bg-card flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold">
                    {selectedDate
                      ? formatInTz(new Date(`${dateStringEarly}T12:00:00Z`), timezone, "EEEE, MMMM d")
                      : t.selectADate}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
                    <button
                      type="button"
                      onClick={() => setDetailsTab("staff")}
                      className={cn(
                        "flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded transition-colors",
                        detailsTab === "staff"
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      data-testid="tab-staff"
                    >
                      <User className="w-3.5 h-3.5" />
                      {t.staffLabel}
                      <span className="text-[10px] text-muted-foreground/80 ml-0.5">
                        ({staffMode === "any" ? t.anyLabel : (staffList?.find((s: Staff) => s.id === specificStaffId)?.name?.split(" ")[0] || "—")})
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailsTab("time")}
                      className={cn(
                        "flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded transition-colors",
                        detailsTab === "time"
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      data-testid="tab-time"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      {t.timeSlotLabel}
                    </button>
                  </div>
                  <Badge variant="secondary" className="no-default-active-elevate text-xs">
                    {tzAbbr} &middot; {timezone}
                  </Badge>
                </div>
              </div>

              {detailsTab === "staff" ? (
                <div className="p-6 space-y-6">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t.pickStaffDesc}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    <button
                      onClick={() => handleStaffModeChange("any")}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-colors min-h-[140px]",
                        staffMode === "any"
                          ? "border-primary bg-primary/5"
                          : "border-border hover-elevate"
                      )}
                      data-testid="card-staff-any"
                    >
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="w-6 h-6 text-primary" />
                      </div>
                      <p className="text-sm font-semibold">{t.anyStaff}</p>
                      <p className="text-[11px] text-muted-foreground text-center leading-tight">{t.firstAvailable}</p>
                      {staffMode === "any" && (
                        <Check className="w-4 h-4 text-primary" />
                      )}
                    </button>
                    {staffList?.map((member: Staff) => {
                      const isSelected = staffMode === "specific" && specificStaffId === member.id;
                      const color = member.color || "#3b82f6";
                      return (
                        <button
                          key={member.id}
                          onClick={() => {
                            setStaffMode("specific");
                            handleSpecificStaffSelect(member.id);
                          }}
                          className={cn(
                            "flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-colors min-h-[140px]",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover-elevate"
                          )}
                          data-testid={`card-staff-${member.id}`}
                        >
                          <Avatar className="w-12 h-12">
                            <AvatarFallback
                              style={{ backgroundColor: color + "22", color: color }}
                              className="text-base font-bold"
                            >
                              {member.name.split(" ").map((n: string) => n[0]).join("").toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <p className="text-sm font-semibold text-center leading-tight truncate max-w-full">{member.name}</p>
                          <p className="text-[11px] text-muted-foreground text-center leading-tight truncate max-w-full">{member.role}</p>
                          {isSelected && (
                            <Check className="w-4 h-4 text-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-6">
                  {!selectedDate ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <CalendarDays className="w-10 h-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">{t.pickDateToSeeSlots}</p>
                    </div>
                  ) : staffMode === "specific" && !specificStaffId ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <User className="w-10 h-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">{t.selectStaffToSeeAvailability}</p>
                    </div>
                  ) : slotsLoading || autoAdvancing ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      {autoAdvancing && (
                        <p className="text-sm text-muted-foreground">{t.findingNextDate}</p>
                      )}
                    </div>
                  ) : !slots || slots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <Clock className="w-10 h-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">{t.noSlots60DaysLong}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t.tryDifferentStaffOrService}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-muted-foreground">
                          {t.slotsAvailablePerBooking(slots.length, totalDuration)}
                        </p>
                        {isOffline && (
                          <span className="flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-semibold">
                            <WifiOff className="w-3 h-3" />
                            {slotPendingCount > 0 ? t.pendingSync(slotPendingCount) : t.offlineLabel}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                        {slots.map((slot) => {
                          const timePart = formatInTz(slot.time, timezone, "h:mm");
                          const periodPart = formatInTz(slot.time, timezone, "a").toUpperCase();
                          const isSelected = selectedSlot?.time === slot.time;
                          const slotStaffColor = staffList?.find((s: Staff) => s.id === slot.staffId)?.color || "#3b82f6";

                          return (
                            <button
                              key={slot.time}
                              onClick={() => {
                                setSelectedSlot(slot);
                                setSelectedStaff(staffList?.find((s: Staff) => s.id === slot.staffId) || null);
                              }}
                              className={cn(
                                "flex flex-col items-center justify-center gap-0 px-3 py-3 rounded-md border text-sm transition-colors",
                                isSelected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "hover-elevate"
                              )}
                              data-testid={`button-slot-${slot.time}`}
                            >
                              <span className="font-semibold leading-tight">{timePart}</span>
                              <span className={cn(
                                "text-[11px] font-medium leading-tight",
                                isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                              )}>{periodPart}</span>
                              {staffMode === "specific" && (
                                <span className={cn(
                                  "flex items-center gap-1 text-[10px] truncate max-w-full mt-0.5",
                                  isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                                )}>
                                  <span
                                    className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: isSelected ? "rgba(255,255,255,0.7)" : slotStaffColor }}
                                  />
                                  {slot.staffName}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="hidden md:flex">
            <BookingSummaryPanel
              selectedService={selectedService}
              selectedAddons={selectedAddons}
              selectedStaff={selectedStaff}
              selectedCustomer={selectedCustomer}
              customers={customers}
              totalPrice={totalPrice}
              totalDuration={totalDuration}
              onSetCustomer={setSelectedCustomer}
              onRemoveService={handleRemoveService}
              onRemoveAddon={handleRemoveAddon}
              onEditAddons={() => setStep("addons")}
              availableMinutes={availableMinutes}
              isCalendarBooking={isCalendarBooking}
              isEditMode={!!editAppointmentId}
              isWalkIn={isWalkIn}
              footerContent={
                detailsTab === "staff" ? (
                  <Button
                    className="w-full h-12"
                    onClick={() => setDetailsTab("time")}
                    disabled={staffMode === "specific" && !specificStaffId}
                    data-testid="button-staff-continue"
                  >
                    {t.continueBtn}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    {selectedSlot && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {formatInTz(selectedSlot.time, timezone, "h:mm a")} &middot; {selectedSlot.staffName}
                        </span>
                      </div>
                    )}
                    <Button
                      className="w-full h-12 bg-primary text-primary-foreground"
                      onClick={handleRequestBooking}
                      disabled={!selectedService || !selectedSlot || createAppointment.isPending || bookingSubmitted}
                      data-testid="button-complete-booking"
                    >
                      {createAppointment.isPending ? t.bookingEllipsis : bookingSubmitted ? t.bookedExclaim : t.completeBooking}
                    </Button>
                  </div>
                )
              }
            />
          </div>
        </>
      )}

      {/* Desktop booking confirmation dialog */}
      <Dialog open={showConfirmation && window.innerWidth >= 768} onOpenChange={(open) => { if (!open) navigate("/calendar"); }}>
        <DialogContent className="sm:max-w-md" data-testid="booking-confirmation-dialog">
          <DialogTitle className="text-xl font-bold">{t.appointmentConfirmation}</DialogTitle>
          <div className="space-y-4 mt-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide">{t.serviceLabel}</p>
              <p className="font-semibold text-base mt-1" data-testid="confirm-service-name">{displayServiceName(selectedService)}</p>
            </div>
            {selectedSlot && (
              <div className="bg-muted/50 rounded-md p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  <span data-testid="confirm-date">{formatInTz(selectedSlot.time, timezone, "EEEE, MMM d, yyyy")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span data-testid="confirm-time">{formatInTz(selectedSlot.time, timezone, "h:mm a")}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide">{t.clientLabel}</p>
                <p className="font-medium text-sm mt-1" data-testid="confirm-customer">{selectedCustomer?.name || t.walkIn}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide">{t.staffLabelCaps}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-medium text-sm" data-testid="confirm-staff">{selectedSlot?.staffName}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-center mt-4">
            <Button
              className="px-8"
              onClick={() => navigate("/calendar")}
              data-testid="button-confirmation-ok"
            >
              {t.ok}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile full-screen booking confirmed success screen */}
      {showConfirmation && window.innerWidth < 768 && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-background"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          data-testid="mobile-booking-success-screen"
        >
          {/* Top gradient accent */}
          <div className="flex-shrink-0 h-2 bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400" />

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto flex flex-col items-center px-6 pt-10 pb-6">
            {/* Animated checkmark */}
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-5 shadow-lg">
              <Check className="w-10 h-10 text-green-600" strokeWidth={2.5} />
            </div>

            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">{t.bookedExclaim}</h1>
            <p className="text-sm text-muted-foreground mt-1 mb-8">{t.appointmentCreated}</p>

            {/* Summary card */}
            <div className="w-full max-w-sm bg-card border rounded-2xl shadow-sm overflow-hidden">
              {/* Service */}
              <div className="px-5 py-4 border-b">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t.serviceLabel}</p>
                <p className="text-base font-bold text-foreground" data-testid="confirm-service-name">{displayServiceName(selectedService)}</p>
                {selectedAddons.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedAddons.map(a => translateName("addon", a.id, a.name)).join(", ")}</p>
                )}
              </div>

              {/* Date & time */}
              {selectedSlot && (
                <div className="px-5 py-4 border-b flex items-start gap-3">
                  <CalendarDays className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold" data-testid="confirm-date">
                      {formatInTz(selectedSlot.time, timezone, "EEEE, MMM d, yyyy")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5" data-testid="confirm-time">
                      {formatInTz(selectedSlot.time, timezone, "h:mm a")}
                    </p>
                  </div>
                </div>
              )}

              {/* Customer & staff */}
              <div className="px-5 py-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t.clientLabel}</p>
                  <p className="text-sm font-semibold" data-testid="confirm-customer">{selectedCustomer?.name || t.walkIn}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t.staffLabelCaps}</p>
                  <p className="text-sm font-semibold" data-testid="confirm-staff">{selectedSlot?.staffName}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom action buttons */}
          <div className="flex-shrink-0 px-6 pb-4 space-y-3">
            {/* Share button — only shown if Web Share API is available */}
            {typeof navigator !== "undefined" && typeof (navigator as any).share === "function" && selectedSlot && (
              <button
                className="w-full min-h-[52px] flex items-center justify-center gap-2 rounded-2xl border-2 border-primary/20 bg-primary/5 text-primary font-semibold text-sm active:opacity-70 transition-opacity"
                onClick={async () => {
                  try {
                    await (navigator as any).share({
                      title: t.appointmentConfirmedShareTitle,
                      text: t.shareText(
                        selectedCustomer?.name || t.walkIn,
                        displayServiceName(selectedService),
                        selectedSlot?.staffName || "",
                        formatInTz(selectedSlot.time, timezone, "EEEE, MMM d"),
                        formatInTz(selectedSlot.time, timezone, "h:mm a")
                      ),
                    });
                  } catch (_) {}
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                {t.shareAppointment}
              </button>
            )}
            <button
              className="w-full min-h-[52px] flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground font-bold text-sm active:opacity-80 transition-opacity"
              onClick={() => { navigate("/booking/new"); window.location.reload(); }}
              data-testid="button-book-another"
            >
              {t.bookAnother}
            </button>
            <button
              className="w-full min-h-[48px] flex items-center justify-center rounded-2xl border border-border text-sm font-semibold text-foreground active:bg-muted transition-colors"
              onClick={() => navigate("/calendar")}
              data-testid="button-confirmation-ok"
            >
              {t.backToCalendar}
            </button>
          </div>
        </div>
      )}

      {/* Cancel confirmation dialog */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="max-w-sm text-center" data-testid="cancel-confirm-dialog">
          <DialogTitle className="sr-only">{t.cancelBookingTitle}</DialogTitle>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="w-14 h-14 rounded-full border-[3px] border-amber-400 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-amber-400" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">{t.serviceNotSaved}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t.leavePageConfirm}</p>
            </div>
            <div className="flex gap-3 w-full pt-1">
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setShowCancelConfirm(false)}
                data-testid="button-cancel-no"
              >
                {t.no}
              </Button>
              <Button
                className="flex-1 h-11 bg-gray-900 hover:bg-gray-800 text-white"
                onClick={() => navigate("/calendar")}
                data-testid="button-cancel-yes"
              >
                {t.yes}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Conflict Resolution Dialog — shown when adding add-ons to a booking */}
      <ConflictResolutionDialog
        open={!!setAppointmentAddons.conflictData}
        conflict={setAppointmentAddons.conflictData}
        onClose={() => setAppointmentAddons.clearConflict()}
        onShorten={handleConflictShorten}
        onReassign={handleConflictReassign}
        onPartial={handleConflictPartial}
        onOverride={handleConflictOverride}
      />

      {/* Service Options Picker */}
      <Dialog open={!!optionPickerService} onOpenChange={(open) => { if (!open) { setOptionPickerService(null); setOptionPickerSelected(null); } }}>
        <DialogContent className="sm:max-w-sm p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="font-semibold text-base">{optionPickerService ? translateName("service", optionPickerService.id, optionPickerService.name) : ""}</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{t.chooseOptionToContinue}</p>
          </div>
          <div className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
            {optionPickerService?.options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handlePickServiceOption(optionPickerService!, opt)}
                className="w-full text-left p-3 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{opt.name}</p>
                  {opt.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{opt.description}</p>}
                  <p className="text-xs text-muted-foreground/70 mt-0.5">{opt.durationMinutes} min</p>
                </div>
                <span className="font-semibold text-sm ml-4 shrink-0">${Number(opt.price).toFixed(2)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InlineAddonsSection({
  serviceId,
  serviceName,
  selectedAddons,
  onToggleAddon,
}: {
  serviceId: number;
  serviceName: string;
  selectedAddons: Addon[];
  onToggleAddon: (addon: Addon) => void;
}) {
  const { data: availableAddons, isLoading } = useAddonsForService(serviceId);
  const { pick } = useLanguage();
  const { translateName, translateDescription } = useEntityTranslations();
  const it = {
    loadingExtras: pick({ en: "Loading extras...", vi: "Đang tải dịch vụ thêm...", es: "Cargando extras...", fr: "Chargement des extras..." }),
    extrasForName: (name: string) => pick({ en: `Extras for ${name}`, vi: `Dịch vụ thêm cho ${name}`, es: `Extras para ${name}`, fr: `Extras pour ${name}` }),
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{it.loadingExtras}</span>
      </div>
    );
  }

  if (!availableAddons || availableAddons.length === 0) return null;

  return (
    <div data-testid="inline-addons-section">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">{it.extrasForName(serviceName)}</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {availableAddons.map((addon: Addon) => {
          const isSelected = selectedAddons.some(a => a.id === addon.id);
          return (
            <Card
              key={addon.id}
              className={cn(
                "p-3 cursor-pointer transition-all relative",
                isSelected ? "ring-2 ring-primary shadow-md" : "hover-elevate"
              )}
              onClick={() => onToggleAddon(addon)}
              data-testid={`inline-addon-${addon.id}`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <h4 className="font-semibold text-xs leading-tight">{translateName("addon", addon.id, addon.name)}</h4>
                {addon.description && (
                  <p className="text-[10px] text-muted-foreground line-clamp-2">{translateDescription("addon", addon.id, addon.description)}</p>
                )}
                <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                  <span className="font-bold text-xs">${Number(addon.price).toFixed(2)}</span>
                  <Badge variant="secondary" className="no-default-active-elevate text-[10px]">
                    {addon.duration}m
                  </Badge>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ClientPickerWidget({
  customers,
  onSelect,
}: {
  customers: any[] | undefined;
  onSelect: (c: any) => void;
}) {
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const createCustomer = useCreateClientForBooking();
  const { pick } = useLanguage();
  const ct = {
    fullNamePh:     pick({ en: "Full name *", vi: "Họ và tên *", es: "Nombre completo *", fr: "Nom complet *" }),
    offlineSync:    pick({ en: "Offline — will sync when reconnected", vi: "Ngoại tuyến — sẽ đồng bộ khi có kết nối lại", es: "Sin conexión: se sincronizará al reconectar", fr: "Hors ligne — synchronisera à la reconnexion" }),
    back:           pick({ en: "Back", vi: "Quay lại", es: "Atrás", fr: "Retour" }),
    addClient:      pick({ en: "Add Client", vi: "Thêm khách hàng", es: "Añadir cliente", fr: "Ajouter un client" }),
    searchPhonePh:  pick({ en: "Search by 10-digit phone…", vi: "Tìm theo số điện thoại 10 số…", es: "Buscar por teléfono de 10 dígitos…", fr: "Rechercher par téléphone à 10 chiffres…" }),
    noMatchFor:     (q: string) => pick({ en: `No match for "${q}"`, vi: `Không tìm thấy "${q}"`, es: `Sin coincidencias para "${q}"`, fr: `Aucun résultat pour « ${q} »` }),
    addClientWithPhone: pick({ en: "Add client with this phone", vi: "Thêm khách hàng với số này", es: "Añadir cliente con este teléfono", fr: "Ajouter un client avec ce téléphone" }),
    addAsNewClient: (q: string) => pick({ en: `Add "${q}" as new client`, vi: `Thêm "${q}" làm khách hàng mới`, es: `Añadir "${q}" como nuevo cliente`, fr: `Ajouter « ${q} » comme nouveau client` }),
    addNewClient:   pick({ en: "Add new client", vi: "Thêm khách hàng mới", es: "Añadir nuevo cliente", fr: "Ajouter un nouveau client" }),
  };

  const filtered = useMemo(() => {
    if (!customers) return [];
    const q = query.toLowerCase().trim();
    if (!q) return customers.slice(0, 6);
    const digits = q.replace(/\D/g, "");
    return customers
      .filter(c =>
        c.name.toLowerCase().includes(q) ||
        (digits.length >= 3 && c.phone != null && c.phone.replace(/\D/g, "").includes(digits))
      )
      .slice(0, 8);
  }, [customers, query]);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createCustomer.mutate(
      { name, phone: newPhone.trim() || undefined } as any,
      { onSuccess: (c: any) => onSelect(c) }
    );
  };

  if (showNew) {
    return (
      <div className="space-y-2">
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder={ct.fullNamePh}
          autoFocus
          data-testid="input-new-client-name"
        />
        <Input
          value={newPhone}
          onChange={e => setNewPhone(formatPhoneInput(e.target.value))}
          placeholder="(555) 000-0000"
          type="tel"
          inputMode="tel"
          data-testid="input-new-client-phone"
        />
        {!navigator.onLine && (
          <p className="flex items-center gap-1 text-xs text-amber-600">
            <AlertCircle className="w-3 h-3" />
            {ct.offlineSync}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setShowNew(false)}
            data-testid="button-new-client-back"
          >
            {ct.back}
          </Button>
          <Button
            size="sm"
            className="flex-1"
            disabled={!newName.trim() || createCustomer.isPending}
            onClick={handleCreate}
            data-testid="button-new-client-save"
          >
            {createCustomer.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : ct.addClient}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={ct.searchPhonePh}
        data-testid="input-client-search"
      />
      {(filtered.length > 0 || query.length > 0) && (
        <div className="max-h-44 overflow-y-auto rounded-md border bg-background divide-y">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
              onClick={() => onSelect(c)}
            >
              <span className="text-sm font-medium">{c.name}</span>
              {c.phone && (
                <span className="text-xs text-muted-foreground ml-2">{c.phone}</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && query.length > 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">{ct.noMatchFor(query)}</p>
          )}
        </div>
      )}
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm text-primary font-medium"
        onClick={() => {
          const digits = query.replace(/\D/g, "");
          setShowNew(true);
          setNewPhone(digits.length >= 7 ? formatPhoneInput(query) : "");
          setNewName(digits.length >= 7 ? "" : query);
          setQuery("");
        }}
        data-testid="button-add-new-client"
      >
        <Plus className="w-3.5 h-3.5" />
        {query.replace(/\D/g, "").length >= 7 ? ct.addClientWithPhone : query.length > 0 ? ct.addAsNewClient(query) : ct.addNewClient}
      </button>
    </div>
  );
}

function BookingSummaryPanel({
  selectedService,
  selectedAddons,
  selectedStaff,
  selectedCustomer,
  customers,
  totalPrice,
  totalDuration,
  onSetCustomer,
  onRemoveService,
  onRemoveAddon,
  onEditAddons,
  footerContent,
  availableMinutes,
  editAvailableMinutes,
  isCalendarBooking,
  isEditMode,
  isWalkIn,
}: {
  selectedService: Service | null;
  selectedAddons: Addon[];
  selectedStaff: Staff | null;
  selectedCustomer: BookingClient | null;
  customers: BookingClient[] | undefined;
  totalPrice: number;
  totalDuration: number;
  onSetCustomer: (c: BookingClient | null) => void;
  onRemoveService: () => void;
  onRemoveAddon: (id: number) => void;
  onEditAddons?: () => void;
  footerContent: React.ReactNode;
  availableMinutes?: number | null;
  editAvailableMinutes?: number | null;
  isCalendarBooking?: boolean;
  isEditMode?: boolean;
  isWalkIn?: boolean;
}) {
  const remainingMinutes = availableMinutes != null ? availableMinutes - totalDuration : null;
  const isOverTime = remainingMinutes != null && remainingMinutes < 0;
  const [highlightedServiceId, setHighlightedServiceId] = useState<number | null>(null);
  const { pick } = useLanguage();
  const { translateName } = useEntityTranslations();
  const displaySvcName = (svc: { id: number; name: string }) => {
    const { base, suffix } = splitServiceOptionName(svc.name);
    const translatedBase = translateName("service", svc.id, base);
    return suffix ? `${translatedBase}${SERVICE_OPTION_SEP}${suffix}` : translatedBase;
  };
  const bt = {
    replaceClient:  pick({ en: "Replace client", vi: "Thay đổi khách hàng", es: "Reemplazar cliente", fr: "Remplacer le client" }),
    walkIn:         pick({ en: "Walk-In", vi: "Khách vãng lai", es: "Sin cita", fr: "Sans rendez-vous" }),
    noShowRisk:     (pct: number, n: number, m: number) => pick({ en: `No-show risk · ${pct}% (${n}/${m})`, vi: `Nguy cơ vắng mặt · ${pct}% (${n}/${m})`, es: `Riesgo de ausencia · ${pct}% (${n}/${m})`, fr: `Risque d'absence · ${pct}% (${n}/${m})` }),
    noShowTitle:    (n: number, m: number) => pick({ en: `${n} no-shows out of ${m} bookings`, vi: `${n} lần vắng mặt trên ${m} lịch hẹn`, es: `${n} ausencias de ${m} reservas`, fr: `${n} absences sur ${m} réservations` }),
    depositRecommended: pick({ en: "Deposit recommended", vi: "Nên yêu cầu đặt cọc", es: "Se recomienda depósito", fr: "Acompte recommandé" }),
    visitsCount:    (n: number) => pick({ en: `${n} visits`, vi: `${n} lượt ghé`, es: `${n} visitas`, fr: `${n} visites` }),
    everyNDays:     (n: number) => pick({ en: `every ${n}d`, vi: `mỗi ${n} ngày`, es: `cada ${n}d`, fr: `tous les ${n}j` }),
    ltvSuffix:      pick({ en: "LTV", vi: "Giá trị trọn đời", es: "VPC", fr: "VVC" }),
    allergyAlert:   (a: string) => pick({ en: `Allergy alert: ${a}`, vi: `Cảnh báo dị ứng: ${a}`, es: `Alerta de alergia: ${a}`, fr: `Alerte allergie : ${a}` }),
    selectServiceToBegin: pick({ en: "Select a service to begin", vi: "Chọn dịch vụ để bắt đầu", es: "Selecciona un servicio para empezar", fr: "Sélectionnez un service pour commencer" }),
    availableTime:  pick({ en: "Available Time", vi: "Thời gian còn trống", es: "Tiempo disponible", fr: "Temps disponible" }),
    exceedsByMin:   (n: number) => pick({ en: `Exceeds available time by ${n} min.`, vi: `Vượt quá thời gian trống ${n} phút.`, es: `Excede el tiempo disponible en ${n} min.`, fr: `Dépasse le temps disponible de ${n} min.` }),
    availableForSlot: (avail: number, used: number) => pick({
      en: `You have ${avail} minutes available for this slot. Used: ${used} min.`,
      vi: `Bạn có ${avail} phút trống cho khung giờ này. Đã dùng: ${used} phút.`,
      es: `Tienes ${avail} minutos disponibles para este horario. Usado: ${used} min.`,
      fr: `Vous avez ${avail} minutes disponibles pour ce créneau. Utilisé : ${used} min.`,
    }),
    totalLabel:     pick({ en: "Total", vi: "Tổng cộng", es: "Total", fr: "Total" }),
    totalColon:     pick({ en: "Total:", vi: "Tổng cộng:", es: "Total:", fr: "Total :" }),
    minsParens:     (n: number) => pick({ en: `(${n} mins)`, vi: `(${n} phút)`, es: `(${n} min)`, fr: `(${n} min)` }),
    minLabel:       (n: number) => pick({ en: `${n} min`, vi: `${n} phút`, es: `${n} min`, fr: `${n} min` }),
  };

  const formatPhoneNumber = (raw: string) => {
    const digits = (raw || "").replace(/\D/g, "");
    const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (ten.length !== 10) return raw;
    return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  };
  const { selectedStore: panelStore } = useSelectedStore();
  const selectedCustomerHasServerId = typeof selectedCustomer?.id === "number";
  const { data: allAppts = [] } = useQuery<any[]>({
    queryKey: ["/api/appointments", panelStore?.id],
    queryFn: () =>
      fetch(`/api/appointments?storeId=${panelStore?.id}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!panelStore?.id && selectedCustomerHasServerId,
    staleTime: 60_000,
  });

  const { data: clientIntelData } = useQuery<any>({
    queryKey: ["/api/intelligence/client", selectedCustomer?.id, panelStore?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/intelligence/client/${selectedCustomer!.id}?storeId=${panelStore?.id}`,
        { credentials: "include" }
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: selectedCustomerHasServerId && !!panelStore?.id,
    staleTime: 5 * 60 * 1000,
  });
  const bookingIntel = clientIntelData?.intel;
  const noShowInfo = useMemo(() => {
    if (!selectedCustomer) return null;
    const mine = (allAppts as any[]).filter(a => a.customerId === selectedCustomer.id);
    const total = mine.length;
    const noShows = mine.filter(a => a.status === "no_show").length;
    if (total < 3 || noShows === 0) return null;
    const rate = noShows / total;
    if (rate < 0.25) return null;
    return { rate, noShows, total };
  }, [allAppts, selectedCustomer]);
  return (
    <>
    <div className="w-[460px] flex-shrink-0 border-l bg-card flex flex-col shadow-[-4px_0_20px_rgba(0,0,0,0.1)] z-10" data-testid="booking-summary-panel">
      <div className="p-4 border-b flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {selectedCustomer ? (
            <>
              <button
                type="button"
                onClick={() => onSetCustomer(null)}
                className="w-full text-left flex items-center gap-2 -m-1 p-1 rounded-md hover:bg-muted/50 active:bg-muted transition-colors"
                data-testid="button-replace-client"
                title={bt.replaceClient}
              >
                <span className="text-xl font-bold text-foreground truncate">
                  {selectedCustomer.name}
                </span>
                <X className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
              {selectedCustomer.phone && (
                <p className="text-xs text-muted-foreground mt-0.5">{formatPhoneNumber(selectedCustomer.phone)}</p>
              )}
              {noShowInfo && (
                <div
                  className={cn(
                    "mt-1.5 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                    noShowInfo.rate >= 0.5
                      ? "bg-red-50 border-red-300 text-red-700"
                      : "bg-amber-50 border-amber-300 text-amber-700",
                  )}
                  data-testid="badge-no-show-risk"
                  title={bt.noShowTitle(noShowInfo.noShows, noShowInfo.total)}
                >
                  <AlertCircle className="w-3 h-3" />
                  {bt.noShowRisk(Math.round(noShowInfo.rate * 100), noShowInfo.noShows, noShowInfo.total)}
                </div>
              )}
              {/* Deposit recommendation for high-risk clients */}
              {noShowInfo && noShowInfo.rate >= 0.4 && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                  <AlertCircle className="w-3 h-3" />
                  {bt.depositRecommended}
                </div>
              )}
              {/* Intelligence cadence hint */}
              {bookingIntel && bookingIntel.avgVisitCadenceDays > 0 && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {bookingIntel.totalVisits > 0 && (
                    <span>{bt.visitsCount(bookingIntel.totalVisits)}</span>
                  )}
                  {bookingIntel.totalVisits > 0 && <span className="text-muted-foreground/40">·</span>}
                  <span>
                    {bt.everyNDays(bookingIntel.avgVisitCadenceDays)}
                  </span>
                  {bookingIntel.lifetimeValue > 0 && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="font-medium text-foreground">${Math.round(bookingIntel.lifetimeValue).toLocaleString()} {bt.ltvSuffix}</span>
                    </>
                  )}
                </div>
              )}
              {selectedCustomer?.allergies && (
                <div
                  className="mt-1.5 flex items-start gap-1.5 rounded-md border border-orange-300 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700"
                  data-testid="badge-allergy-alert"
                  title={selectedCustomer.allergies}
                >
                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{bt.allergyAlert(selectedCustomer.allergies)}</span>
                </div>
              )}
            </>
          ) : (
            <span className="text-xl font-bold text-foreground">{bt.walkIn}</span>
          )}
        </div>
        {highlightedServiceId !== null && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveService(); setHighlightedServiceId(null); }}
            className="flex-shrink-0 p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
            data-testid="button-remove-service-trash"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {selectedService ? (
          <div
            className={cn(
              "w-full border-b cursor-pointer transition-colors duration-150 select-none",
              highlightedServiceId === selectedService.id
                ? "bg-yellow-100 border-yellow-300"
                : "bg-gray-50 hover:bg-yellow-50"
            )}
            onClick={() => {
              if (selectedAddons.length > 0 && onEditAddons) {
                onEditAddons();
              } else {
                setHighlightedServiceId(
                  highlightedServiceId === selectedService.id ? null : selectedService.id
                );
              }
            }}
          >
            <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
              <div className="flex-1">
                <h4 className="font-bold text-base leading-snug" data-testid="text-summary-service">
                  {displaySvcName(selectedService)} <span className="font-medium text-sm text-muted-foreground">({selectedService.duration}m)</span>
                </h4>
                {selectedStaff && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <Badge variant="outline" className="no-default-active-elevate text-[10px] px-1.5 py-0">{selectedStaff.name}</Badge>
                  </p>
                )}
              </div>
              <span className="font-bold text-base" data-testid="text-summary-service-price">${Number(selectedService.price).toFixed(2)}</span>
            </div>

            {selectedAddons.length > 0 && (
              <div className="px-4 pb-3 space-y-1.5 border-t border-dashed border-gray-300">
                {selectedAddons.map((addon) => (
                  <div key={addon.id} className="flex items-center justify-between gap-2 pt-2" data-testid={`summary-addon-${addon.id}`}>
                    <span className="text-sm font-semibold text-gray-800">
                      + {translateName("addon", addon.id, addon.name)} <span className="font-medium text-muted-foreground">({addon.duration}m)</span>
                    </span>
                    <span className="text-sm font-bold text-gray-800">${Number(addon.price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Sparkles className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">{bt.selectServiceToBegin}</p>
          </div>
        )}
      </div>

      {isEditMode && editAvailableMinutes != null && (
        <div className="px-4 pb-3">
          <AvailableTimeBanner availableMinutes={editAvailableMinutes} />
        </div>
      )}

      <div className="border-t p-4 space-y-3">
        {isCalendarBooking && availableMinutes != null && (
          <div
            className={cn(
              "rounded-md p-3 flex items-start gap-2.5",
              isOverTime
                ? "bg-destructive/10 border border-destructive/20"
                : "bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800"
            )}
            data-testid="available-time-banner"
          >
            <Timer className={cn("w-4 h-4 mt-0.5 flex-shrink-0", isOverTime ? "text-destructive" : "text-sky-600 dark:text-sky-400")} />
            <div>
              <p className={cn("text-sm font-semibold", isOverTime ? "text-destructive" : "text-foreground")}>
                {bt.availableTime}
              </p>
              <p className={cn("text-xs", isOverTime ? "text-destructive/80" : "text-muted-foreground")}>
                {isOverTime
                  ? bt.exceedsByMin(Math.abs(remainingMinutes!))
                  : bt.availableForSlot(availableMinutes!, totalDuration)
                }
              </p>
            </div>
          </div>
        )}
        {isEditMode ? (
          <p className="text-sm text-muted-foreground text-center">
            {bt.totalColon} <span className="font-semibold text-foreground">${totalPrice.toFixed(2)}</span>
            {totalDuration > 0 && <span> {bt.minsParens(totalDuration)}</span>}
          </p>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold">{bt.totalLabel}</span>
              {totalDuration > 0 && <p className="text-xs text-muted-foreground">{bt.minLabel(totalDuration)}</p>}
            </div>
            <span className="font-bold text-lg" data-testid="text-summary-total">${totalPrice.toFixed(2)}</span>
          </div>
        )}
        {footerContent}
      </div>
    </div>

    </>
  );
}
