import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCalendarSettings, useUpdateCalendarSettings, DEFAULT_CALENDAR_SETTINGS } from "@/hooks/use-calendar-settings";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import { useInSettingsShell } from "@/lib/settings-shell-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useForm, Controller } from "react-hook-form";
import { Save, HelpCircle, Clock, Minus, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/hooks/use-language";
import { BookingBanList } from "@/components/BookingBanList";
import type { Store } from "@shared/schema";

type CalendarSettingsForm = {
  startOfWeek: string;
  timeSlotInterval: number;
  bookingWindowHours: number;
  nonWorkingHoursDisplay: number;
  allowBookingOutsideHours: boolean;
  autoCompleteAppointments: boolean;
  autoMarkNoShows: boolean;
  showPrices: boolean;
  walkInsEnabled: boolean;
};

const BOOKING_WINDOW_MAX = 720;  // 30 days
const CANCEL_WINDOW_MAX = 168;   // 7 days
const CANCEL_FEE_MAX = 100;      // percent
const ADVANCE_MONTHS_MIN = 1;
const ADVANCE_MONTHS_MAX = 24;
const GRACE_MAX = 60;

type BookingMode = "all" | "existing" | "off";
type PaymentPolicy = "none" | "card_on_file" | "deposit";
type DepositType = "percentage" | "fixed";

/** Everything on this page that is stored on the `locations` row — served and
 * saved through /api/booking-policies. The calendar-grid fields above are a
 * separate table (calendar_settings) reached through useUpdateCalendarSettings. */
type BookingPoliciesResponse = {
  onlineBookingMode: BookingMode;
  advanceBookingEnabled: boolean;
  advanceBookingMonths: number;
  onlineWaitlistEnabled: boolean;
  askClientsForPronouns: boolean;
  allowOnlineCancellation: boolean;
  cancellationPolicyRequired: boolean;
  cancellationPolicyText: string;
  cancellationHoursCutoff: number;
  cancellationFeeType: "percentage" | null;
  cancellationFeeValue: number | null;
  lateGracePeriodMinutes: number;
  bookingPaymentPolicy: PaymentPolicy;
  depositType: DepositType | null;
  depositValue: number | null;
  stripeConnected?: boolean;
};

type PolState = {
  onlineBookingMode: BookingMode;
  advanceBookingEnabled: boolean;
  advanceBookingMonths: number;
  onlineWaitlistEnabled: boolean;
  askClientsForPronouns: boolean;
  allowOnlineCancellation: boolean;
  cancellationPolicyRequired: boolean;
  cancellationPolicyText: string;
  cancellationHoursCutoff: number;
  cancellationFeePct: number;   // 0 = no fee
  lateGracePeriodMinutes: number;
  bookingPaymentPolicy: PaymentPolicy;
  depositType: DepositType | null;
  depositValue: number | null;
};

const POL_DEFAULTS: PolState = {
  onlineBookingMode: "all",
  advanceBookingEnabled: false,
  advanceBookingMonths: 3,
  onlineWaitlistEnabled: false,
  askClientsForPronouns: false,
  allowOnlineCancellation: true,
  cancellationPolicyRequired: false,
  cancellationPolicyText: "",
  cancellationHoursCutoff: 0,
  cancellationFeePct: 0,
  lateGracePeriodMinutes: 10,
  bookingPaymentPolicy: "none",
  depositType: null,
  depositValue: null,
};

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help inline-block ml-1" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px]">
        <p className="text-xs">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Bordered "GlossGenius" stepper: a small caption, a big number, and −/+ pills. */
function StepperField({
  caption, value, min, max, onChange, testId,
}: {
  caption: string; value: number; min: number; max: number;
  onChange: (n: number) => void; testId?: string;
}) {
  const val = Number.isFinite(value) ? Math.trunc(value) : min;
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-input bg-background px-4 py-3">
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{caption}</span>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={val}
          onChange={(e) => onChange(clamp(parseInt(e.target.value, 10) || 0))}
          className="w-24 bg-transparent text-2xl font-semibold text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          data-testid={testId}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Decrease"
          onClick={() => onChange(clamp(val - 1))}
          disabled={val <= min}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-input text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Increase"
          onClick={() => onChange(clamp(val + 1))}
          disabled={val >= max}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-input text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** A label + description block with a trailing control (Switch etc.). */
function ToggleRow({
  title, desc, children, bordered = true,
}: {
  title: string; desc?: string; children: React.ReactNode; bordered?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-2 ${bordered ? "border-t pt-6" : ""}`}>
      <div>
        <Label className="text-base font-medium">{title}</Label>
        {desc && <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export default function CalendarSettings() {
  const { selectedStore } = useSelectedStore();
  const { data: settings, isLoading } = useCalendarSettings();
  const updateSettings = useUpdateCalendarSettings();
  const { toast } = useToast();
  const { pick } = useLanguage();
  const inShell = useInSettingsShell();
  const queryClient = useQueryClient();
  const { data: store, isLoading: storeLoading } = useQuery<Store>({
    queryKey: ["/api/stores", selectedStore?.id],
    enabled: !!selectedStore?.id,
  });

  const { data: policies, isLoading: policiesLoading } = useQuery<BookingPoliciesResponse>({
    queryKey: ["/api/booking-policies", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch("/api/booking-policies", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load booking policies");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const [pol, setPol] = useState<PolState>(POL_DEFAULTS);
  const setP = <K extends keyof PolState>(k: K, v: PolState[K]) => setPol((p) => ({ ...p, [k]: v }));
  const stripeConnected = !!policies?.stripeConnected;

  useEffect(() => {
    if (policies) {
      setPol({
        onlineBookingMode: policies.onlineBookingMode ?? "all",
        advanceBookingEnabled: policies.advanceBookingEnabled ?? false,
        advanceBookingMonths: policies.advanceBookingMonths ?? 3,
        onlineWaitlistEnabled: policies.onlineWaitlistEnabled ?? false,
        askClientsForPronouns: policies.askClientsForPronouns ?? false,
        allowOnlineCancellation: policies.allowOnlineCancellation ?? true,
        cancellationPolicyRequired: policies.cancellationPolicyRequired ?? false,
        cancellationPolicyText: policies.cancellationPolicyText ?? "",
        cancellationHoursCutoff: policies.cancellationHoursCutoff ?? 0,
        cancellationFeePct: policies.cancellationFeeValue ?? 0,
        lateGracePeriodMinutes: policies.lateGracePeriodMinutes ?? 10,
        bookingPaymentPolicy: policies.bookingPaymentPolicy ?? "none",
        depositType: policies.depositType ?? null,
        depositValue: policies.depositValue ?? null,
      });
    }
  }, [policies]);

  const updatePolicies = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("PUT", "/api/booking-policies", body);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.message || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/booking-policies"] });
    },
  });

  const t = {
    loading:              pick({ en: "Loading...",               vi: "Đang tải...",         es: "Cargando...",                    fr: "Chargement..." }),
    pageTitle:            pick({ en: "Booking Controls",         vi: "Kiểm soát đặt lịch",  es: "Controles de reserva",           fr: "Contrôles de réservation" }),
    saving:               pick({ en: "Saving...",               vi: "Đang lưu...",          es: "Guardando...",                   fr: "Enregistrement..." }),
    save:                 pick({ en: "Save",                    vi: "Lưu",                  es: "Guardar",                        fr: "Enregistrer" }),

    // Section headings
    secOnline:            pick({ en: "Online booking",          vi: "Đặt lịch trực tuyến",  es: "Reserva en línea",               fr: "Réservation en ligne" }),
    secCancellations:     pick({ en: "Cancellations",           vi: "Hủy lịch",             es: "Cancelaciones",                  fr: "Annulations" }),
    secWaitlist:          pick({ en: "Waitlist",                vi: "Danh sách chờ",        es: "Lista de espera",                fr: "Liste d'attente" }),
    secNoShows:           pick({ en: "No-shows & late arrivals", vi: "Vắng mặt & đến muộn",  es: "Ausencias y llegadas tarde",     fr: "Absences et retards" }),
    secBanList:           pick({ en: "Booking ban list",         vi: "Danh sách chặn đặt lịch", es: "Lista de bloqueo de reservas", fr: "Liste de blocage" }),
    secDisplay:           pick({ en: "Calendar display",         vi: "Hiển thị lịch",         es: "Visualización del calendario",   fr: "Affichage de l'agenda" }),

    // Online booking mode
    onlineMode:           pick({ en: "Online booking",          vi: "Đặt lịch trực tuyến",  es: "Reserva en línea",               fr: "Réservation en ligne" }),
    onlineModeField:      pick({ en: "Available",               vi: "Khả dụng",             es: "Disponible",                     fr: "Disponible" }),
    onlineModeAll:        pick({ en: "For all clients",         vi: "Cho mọi khách hàng",   es: "Para todos los clientes",        fr: "Pour tous les clients" }),
    onlineModeExisting:   pick({ en: "For existing clients only", vi: "Chỉ khách hiện có",  es: "Solo para clientes existentes",  fr: "Clients existants uniquement" }),
    onlineModeOff:        pick({ en: "Not available",           vi: "Không khả dụng",       es: "No disponible",                  fr: "Non disponible" }),
    onlineModeDescAll:    pick({ en: "Allow online booking for all clients, new and existing.", vi: "Cho phép đặt lịch trực tuyến cho mọi khách hàng, mới và cũ.", es: "Permite la reserva en línea a todos los clientes, nuevos y existentes.", fr: "Autorise la réservation en ligne pour tous les clients, nouveaux et existants." }),
    onlineModeDescExisting: pick({ en: "Only clients who already have a record with your salon can book online. New clients must call.", vi: "Chỉ khách hàng đã có hồ sơ tại tiệm mới đặt lịch trực tuyến được. Khách mới phải gọi điện.", es: "Solo los clientes que ya tienen ficha en tu salón pueden reservar en línea. Los nuevos deben llamar.", fr: "Seuls les clients déjà enregistrés dans votre salon peuvent réserver en ligne. Les nouveaux doivent appeler." }),
    onlineModeDescOff:    pick({ en: "Your public booking page won't accept any online appointments.", vi: "Trang đặt lịch công khai của bạn sẽ không nhận lịch hẹn trực tuyến nào.", es: "Tu página de reservas pública no aceptará ninguna cita en línea.", fr: "Votre page de réservation publique n'acceptera aucun rendez-vous en ligne." }),

    // Booking window
    bookingWindow:        pick({ en: "Booking window (in hours)", vi: "Cửa sổ đặt lịch (giờ)", es: "Ventana de reserva (en horas)", fr: "Fenêtre de réservation (en heures)" }),
    bookingWindowField:   pick({ en: "Window",  vi: "Cửa sổ",  es: "Ventana",  fr: "Fenêtre" }),
    bookingWindowDesc:    pick({ en: "Enter the number of hours notice you require from clients to book an upcoming appointment.", vi: "Nhập số giờ báo trước bạn yêu cầu khách hàng để đặt lịch hẹn sắp tới.", es: "Introduce las horas de antelación que exiges a los clientes para reservar una cita.", fr: "Indiquez le nombre d'heures de préavis exigé des clients pour réserver un rendez-vous." }),

    // Booking increments
    timeSlot:             pick({ en: "Booking increments",       vi: "Bước thời gian đặt lịch", es: "Intervalos de reserva",       fr: "Intervalles de réservation" }),
    timeSlotTip:          pick({ en: "Controls the time increments clients can book at and how your calendar time slots are divided.", vi: "Kiểm soát bước thời gian khách có thể đặt và cách chia khung giờ trên lịch.", es: "Controla los intervalos en los que los clientes pueden reservar y cómo se divide tu calendario.", fr: "Contrôle les intervalles auxquels les clients peuvent réserver et le découpage des créneaux de l'agenda." }),

    // Require card on file
    cardOnFile:           pick({ en: "Require card on file",     vi: "Yêu cầu thẻ lưu sẵn",  es: "Requerir tarjeta en archivo",   fr: "Carte enregistrée requise" }),
    cardOnFileField:      pick({ en: "Required card",           vi: "Thẻ bắt buộc",         es: "Tarjeta requerida",             fr: "Carte requise" }),
    cardNever:            pick({ en: "Never",                   vi: "Không bao giờ",        es: "Nunca",                         fr: "Jamais" }),
    cardOnFileOpt:        pick({ en: "Card on file",            vi: "Thẻ lưu sẵn",          es: "Tarjeta en archivo",            fr: "Carte enregistrée" }),
    cardDeposit:          pick({ en: "Deposit required",        vi: "Yêu cầu đặt cọc",      es: "Depósito requerido",            fr: "Acompte requis" }),
    cardNeverDesc:        pick({ en: "No credit or debit card required to reserve online.", vi: "Không cần thẻ tín dụng hoặc ghi nợ để đặt lịch trực tuyến.", es: "No se requiere tarjeta de crédito o débito para reservar en línea.", fr: "Aucune carte bancaire requise pour réserver en ligne." }),
    cardOnFileDesc:       pick({ en: "The client's card is saved for this appointment. No charge is made at booking.", vi: "Thẻ của khách được lưu cho lịch hẹn này. Không tính phí khi đặt lịch.", es: "Se guarda la tarjeta del cliente para esta cita. No se realiza ningún cargo al reservar.", fr: "La carte du client est enregistrée pour ce rendez-vous. Aucun débit à la réservation." }),
    cardDepositDesc:      pick({ en: "The client pays a deposit up front to confirm the booking.", vi: "Khách trả một khoản đặt cọc trước để xác nhận đặt lịch.", es: "El cliente paga un depósito por adelantado para confirmar la reserva.", fr: "Le client verse un acompte à l'avance pour confirmer la réservation." }),
    cardNoStripe:         pick({ en: "Connect a Stripe account to require a card or deposit — until then bookings are taken with no card.", vi: "Kết nối tài khoản Stripe để yêu cầu thẻ hoặc đặt cọc — trước đó lịch hẹn được nhận mà không cần thẻ.", es: "Conecta una cuenta de Stripe para requerir tarjeta o depósito; hasta entonces las reservas se aceptan sin tarjeta.", fr: "Connectez un compte Stripe pour exiger une carte ou un acompte — sans cela, les réservations sont prises sans carte." }),
    depositTypePct:       pick({ en: "% of service",            vi: "% dịch vụ",            es: "% del servicio",                fr: "% du service" }),
    depositTypeFixed:     pick({ en: "Fixed amount",            vi: "Số tiền cố định",      es: "Importe fijo",                  fr: "Montant fixe" }),
    depositValueLabel:    pick({ en: "Deposit amount",          vi: "Số tiền đặt cọc",      es: "Importe del depósito",          fr: "Montant de l'acompte" }),

    // Advance booking
    advance:              pick({ en: "Advance Booking",          vi: "Đặt lịch trước",       es: "Reserva anticipada",            fr: "Réservation à l'avance" }),
    advanceDesc:          pick({ en: "Limits how many months in advance clients can book appointments online. Once enabled, online bookings are restricted to the selected timeframe starting from today.", vi: "Giới hạn số tháng khách có thể đặt lịch trực tuyến trước. Khi bật, đặt lịch trực tuyến bị giới hạn trong khoảng thời gian đã chọn tính từ hôm nay.", es: "Limita cuántos meses de antelación pueden reservar los clientes en línea. Al activarlo, las reservas en línea se restringen al plazo seleccionado a partir de hoy.", fr: "Limite le nombre de mois à l'avance pendant lesquels les clients peuvent réserver en ligne. Une fois activé, les réservations en ligne sont limitées à la période choisie à partir d'aujourd'hui." }),
    advanceField:         pick({ en: "Months ahead",            vi: "Số tháng trước",       es: "Meses de antelación",           fr: "Mois à l'avance" }),

    // Pronouns
    pronouns:             pick({ en: "Ask clients for pronouns on booking form", vi: "Hỏi đại từ nhân xưng của khách trên biểu mẫu đặt lịch", es: "Pedir los pronombres del cliente en el formulario de reserva", fr: "Demander les pronoms du client sur le formulaire de réservation" }),
    pronounsDesc:         pick({ en: "The client's pronouns will be added to their client profile.", vi: "Đại từ nhân xưng của khách sẽ được thêm vào hồ sơ khách hàng.", es: "Los pronombres del cliente se añadirán a su ficha.", fr: "Les pronoms du client seront ajoutés à sa fiche." }),

    // Cancellations
    onlineCancel:         pick({ en: "Online cancellation",      vi: "Hủy lịch trực tuyến",  es: "Cancelación en línea",          fr: "Annulation en ligne" }),
    onlineCancelDesc:     pick({ en: "Allow clients to cancel and reschedule their appointments online.", vi: "Cho phép khách hủy và đổi lịch hẹn trực tuyến.", es: "Permite a los clientes cancelar y reprogramar sus citas en línea.", fr: "Autorise les clients à annuler et reprogrammer leurs rendez-vous en ligne." }),
    policyRequired:       pick({ en: "Cancellation policy required", vi: "Bắt buộc chính sách hủy", es: "Política de cancelación obligatoria", fr: "Politique d'annulation obligatoire" }),
    policyRequiredDesc:   pick({ en: "Clients will be required to acknowledge that they read your cancellation policy at booking.", vi: "Khách phải xác nhận đã đọc chính sách hủy của bạn khi đặt lịch.", es: "Los clientes deberán confirmar que han leído tu política de cancelación al reservar.", fr: "Les clients devront confirmer avoir lu votre politique d'annulation lors de la réservation." }),
    policyText:           pick({ en: "Cancellation policy",      vi: "Chính sách hủy",       es: "Política de cancelación",        fr: "Politique d'annulation" }),
    policyTextPlaceholder: pick({ en: "Your policy details", vi: "Chi tiết chính sách của bạn", es: "Detalles de tu política", fr: "Détails de votre politique" }),
    policyTextDesc:       pick({ en: "Shown on your booking page and the client's confirmation page. Example: \"I charge a 30% cancellation fee for no-shows or cancellations within 48 hours of the scheduled appointment.\"", vi: "Hiển thị trên trang đặt lịch và trang xác nhận của khách. Ví dụ: \"Tôi tính phí hủy 30% cho khách vắng mặt hoặc hủy trong vòng 48 giờ trước lịch hẹn.\"", es: "Se muestra en tu página de reservas y en la confirmación del cliente. Ejemplo: \"Cobro una tarifa de cancelación del 30% por ausencias o cancelaciones dentro de las 48 horas previas a la cita.\"", fr: "Affichée sur votre page de réservation et la confirmation du client. Exemple : « Je facture des frais d'annulation de 30 % pour les absences ou les annulations dans les 48 heures précédant le rendez-vous. »" }),
    policyRequiredWarn:   pick({ en: "Acknowledgement is required but there's no policy text yet.", vi: "Yêu cầu xác nhận nhưng chưa có nội dung chính sách.", es: "Se requiere confirmación pero aún no hay texto de política.", fr: "La confirmation est requise mais aucun texte de politique n'est encore saisi." }),

    cancelFee:            pick({ en: "Cancellation fee (%)", vi: "Phí hủy lịch (%)", es: "Tarifa de cancelación (%)", fr: "Frais d'annulation (%)" }),
    cancelFeeField:       pick({ en: "Fee percentage", vi: "Phần trăm phí", es: "Porcentaje de la tarifa", fr: "Pourcentage des frais" }),
    cancelFeeDesc:        pick({ en: "Prevent no-shows and protect your time with a no-show fee. Most salons set it between 20-30% of the appointment cost. Set to 0 for no fee.", vi: "Ngăn khách không đến và bảo vệ thời gian của bạn bằng phí vắng mặt. Hầu hết tiệm đặt từ 20-30% giá trị lịch hẹn. Đặt 0 để không tính phí.", es: "Evita las ausencias y protege tu tiempo con una tarifa por no presentarse. La mayoría de los salones la fijan entre el 20-30% del coste de la cita. Ponla en 0 para no cobrar.", fr: "Évitez les absences et protégez votre temps avec des frais de non-présentation. La plupart des salons les fixent entre 20 et 30 % du coût du rendez-vous. Mettez 0 pour ne rien facturer." }),
    cancelFeeNoStripe:    pick({ en: "Connect a Stripe account to actually charge this fee.", vi: "Kết nối tài khoản Stripe để thực sự tính phí này.", es: "Conecta una cuenta de Stripe para poder cobrar esta tarifa.", fr: "Connectez un compte Stripe pour facturer réellement ces frais." }),
    cancelWindow:         pick({ en: "Cancellation window (in hours)", vi: "Cửa sổ hủy lịch (giờ)", es: "Ventana de cancelación (en horas)", fr: "Fenêtre d'annulation (en heures)" }),
    cancelWindowField:    pick({ en: "Window", vi: "Cửa sổ", es: "Ventana", fr: "Fenêtre" }),
    cancelWindowDesc:     pick({ en: "How far in advance your clients can cancel appointments online. They'll need to contact you to cancel after that.", vi: "Khách hàng có thể hủy lịch trực tuyến trước bao lâu. Sau thời gian đó họ phải liên hệ với bạn để hủy.", es: "Con cuánta antelación pueden cancelar tus clientes las citas en línea. Después de eso, tendrán que contactarte para cancelar.", fr: "Combien de temps à l'avance vos clients peuvent annuler leurs rendez-vous en ligne. Passé ce délai, ils devront vous contacter pour annuler." }),

    // Waitlist
    waitlistEnable:       pick({ en: "Enable online waitlist registration", vi: "Bật đăng ký danh sách chờ trực tuyến", es: "Activar el registro en lista de espera en línea", fr: "Activer l'inscription à la liste d'attente en ligne" }),
    waitlistDesc:         pick({ en: "Allow clients who can't find a workable time to add themselves to your waitlist. You'll see their request in Waitlist and can reach out when a slot opens.", vi: "Cho phép khách không tìm được giờ phù hợp tự thêm vào danh sách chờ. Bạn sẽ thấy yêu cầu trong mục Danh sách chờ và có thể liên hệ khi có chỗ trống.", es: "Permite que los clientes que no encuentran un horario adecuado se añadan a tu lista de espera. Verás su solicitud en Lista de espera y podrás contactarlos cuando se libere un hueco.", fr: "Permet aux clients qui ne trouvent pas de créneau adapté de s'ajouter à votre liste d'attente. Vous verrez leur demande dans Liste d'attente et pourrez les contacter dès qu'un créneau se libère." }),

    // No-shows & late
    grace:                pick({ en: "Late arrival grace period", vi: "Thời gian ân hạn đến muộn", es: "Período de gracia por llegada tarde", fr: "Délai de tolérance pour retard" }),
    graceField:           pick({ en: "Minutes",                 vi: "Phút",                 es: "Minutos",                       fr: "Minutes" }),
    graceDesc:            pick({ en: "How many minutes after the scheduled time an appointment is still \"on time\" before it can be flagged late.", vi: "Số phút sau giờ hẹn mà lịch hẹn vẫn được coi là \"đúng giờ\" trước khi bị đánh dấu muộn.", es: "Cuántos minutos después de la hora prevista una cita sigue considerándose \"a tiempo\" antes de marcarse como tarde.", fr: "Combien de minutes après l'heure prévue un rendez-vous est encore « à l'heure » avant d'être signalé en retard." }),
    autoNoShow:           pick({ en: "Auto-mark no-shows",       vi: "Tự động đánh dấu vắng mặt", es: "Marcar ausencias automáticamente", fr: "Marquer les absences automatiquement" }),
    autoNoShowDesc:       pick({ en: "After the grace period, automatically set the appointment status to No Show on the calendar.", vi: "Sau thời gian ân hạn, tự động đặt trạng thái lịch hẹn thành Vắng mặt trên lịch.", es: "Tras el período de gracia, cambia automáticamente el estado de la cita a Ausente en el calendario.", fr: "Après le délai de tolérance, définit automatiquement le statut du rendez-vous sur Absence dans l'agenda." }),

    banListDesc:          pick({ en: "Phone numbers on this list can't make an online booking. Staff can still book them manually, and it doesn't affect the check-in kiosk.", vi: "Số điện thoại trong danh sách này không thể đặt lịch trực tuyến. Nhân viên vẫn có thể đặt thủ công, và không ảnh hưởng đến ki-ốt check-in.", es: "Los números de esta lista no pueden reservar en línea. El personal aún puede reservarlos manualmente y no afecta al quiosco de registro.", fr: "Les numéros de cette liste ne peuvent pas réserver en ligne. Le personnel peut toujours les réserver manuellement, et cela n'affecte pas la borne d'enregistrement." }),

    // Calendar display (existing extras)
    startOfWeek:          pick({ en: "Calendar start of week",  vi: "Ngày bắt đầu tuần",   es: "Inicio de semana del calendario", fr: "Début de semaine du calendrier" }),
    startOfWeekTip:       pick({ en: "Choose which day the calendar week starts on.", vi: "Chọn ngày bắt đầu tuần trên lịch.", es: "Elige qué día comienza la semana del calendario.", fr: "Choisissez le jour de début de semaine du calendrier." }),
    monday:               pick({ en: "Monday",    vi: "Thứ Hai",  es: "Lunes",    fr: "Lundi" }),
    tuesday:              pick({ en: "Tuesday",   vi: "Thứ Ba",   es: "Martes",   fr: "Mardi" }),
    wednesday:            pick({ en: "Wednesday", vi: "Thứ Tư",   es: "Miércoles", fr: "Mercredi" }),
    thursday:             pick({ en: "Thursday",  vi: "Thứ Năm",  es: "Jueves",   fr: "Jeudi" }),
    friday:               pick({ en: "Friday",    vi: "Thứ Sáu",  es: "Viernes",  fr: "Vendredi" }),
    saturday:             pick({ en: "Saturday",  vi: "Thứ Bảy",  es: "Sábado",   fr: "Samedi" }),
    sunday:               pick({ en: "Sunday",    vi: "Chủ Nhật", es: "Domingo",  fr: "Dimanche" }),
    nonWorkingHours:      pick({ en: "Non-working hours displayed in calendar",          vi: "Số giờ ngoài giờ làm việc hiển thị",    es: "Horas no laborables mostradas en el calendario", fr: "Heures non ouvrées affichées" }),
    nonWorkingHoursTip:   pick({ en: "How many non-working hours to show before and after business hours on the calendar.", vi: "Số giờ ngoài giờ làm việc hiển thị trước và sau giờ kinh doanh.", es: "Cuántas horas no laborables mostrar antes y después del horario de atención.", fr: "Combien d'heures non ouvrées afficher avant et après les heures d'ouverture." }),
    none:                 pick({ en: "None",    vi: "Không",  es: "Ninguna",  fr: "Aucune" }),
    hour1:                pick({ en: "1 hour",  vi: "1 giờ",  es: "1 hora",   fr: "1 heure" }),
    hour2:                pick({ en: "2 hours", vi: "2 giờ",  es: "2 horas",  fr: "2 heures" }),
    hour3:                pick({ en: "3 hours", vi: "3 giờ",  es: "3 horas",  fr: "3 heures" }),
    allowOutside:         pick({ en: "Allow staff to be booked outside opening hours", vi: "Cho phép đặt lịch ngoài giờ mở cửa", es: "Permitir al personal reservar fuera del horario de apertura", fr: "Autoriser le personnel à être réservé en dehors des heures d'ouverture" }),
    allowOutsideDesc:     pick({ en: "You are able to allow appointments to be made via your booking page beyond your closing time.", vi: "Cho phép đặt lịch qua trang đặt chỗ của bạn sau giờ đóng cửa.", es: "Puedes permitir citas a través de tu página de reservas más allá del horario de cierre.", fr: "Vous pouvez autoriser les rendez-vous via votre page de réservation au-delà de l'heure de fermeture." }),
    autoComplete:         pick({ en: "Set appointments to auto-complete",        vi: "Tự động hoàn thành lịch hẹn",       es: "Completar citas automáticamente",        fr: "Terminer les rendez-vous automatiquement" }),
    autoCompleteDesc:     pick({ en: "Set appointments to completed status at the end of the working day.", vi: "Chuyển lịch hẹn sang trạng thái hoàn thành vào cuối ngày làm việc.", es: "Marcar citas como completadas al final del día laboral.", fr: "Marquer les rendez-vous comme terminés à la fin de la journée de travail." }),
    showPrices:           pick({ en: "Show prices on appointments",              vi: "Hiển thị giá trên lịch hẹn",        es: "Mostrar precios en citas",               fr: "Afficher les prix sur les rendez-vous" }),
    showPricesDesc:       pick({ en: "Display service prices on calendar appointment cards and in the appointment details panel.", vi: "Hiển thị giá dịch vụ trên thẻ lịch hẹn và trong bảng chi tiết lịch hẹn.", es: "Mostrar precios de servicios en las tarjetas del calendario y en el panel de detalles.", fr: "Afficher les prix des services sur les cartes du calendrier et dans le panneau de détails." }),
    walkIns:              pick({ en: "Allow walk-ins",                           vi: "Cho phép khách vãng lai",           es: "Permitir entrada directa",               fr: "Autoriser les entrées directes" }),
    walkInsDesc:          pick({ en: "When off, the walk-in button is hidden and staff must always look up or create a client.", vi: "Khi tắt, nút khách vãng lai bị ẩn và nhân viên phải luôn tra cứu hoặc tạo hồ sơ khách hàng.", es: "Cuando está desactivado, el botón de entrada directa está oculto y el personal debe buscar o crear un perfil de cliente.", fr: "Désactivé, le bouton d'entrée directe est masqué et le personnel doit chercher ou créer un profil client." }),

    min:                  pick({ en: "min",  vi: "phút", es: "min",  fr: "min" }),
    toastSaved:           pick({ en: "Settings saved",                    vi: "Đã lưu cài đặt",                  es: "Configuración guardada",                 fr: "Paramètres enregistrés" }),
    toastSavedDesc:       pick({ en: "Your booking controls have been updated.", vi: "Kiểm soát đặt lịch của bạn đã được cập nhật.", es: "Tus controles de reserva se han actualizado.", fr: "Vos contrôles de réservation ont été mis à jour." }),
    toastError:           pick({ en: "Error",  vi: "Lỗi",    es: "Error",   fr: "Erreur" }),
    toastErrorDesc:       pick({ en: "Failed to save settings.", vi: "Không thể lưu cài đặt.", es: "Error al guardar la configuración.", fr: "Impossible d'enregistrer les paramètres." }),
  };

  const { control, handleSubmit, reset } = useForm<CalendarSettingsForm>({
    defaultValues: DEFAULT_CALENDAR_SETTINGS,
  });

  const VALID_WEEK_STARTS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];

  useEffect(() => {
    if (settings) {
      const rawStart = (settings.startOfWeek as string) || "";
      reset({
        startOfWeek: VALID_WEEK_STARTS.includes(rawStart) ? rawStart : DEFAULT_CALENDAR_SETTINGS.startOfWeek,
        timeSlotInterval: settings.timeSlotInterval ?? DEFAULT_CALENDAR_SETTINGS.timeSlotInterval,
        bookingWindowHours: (settings as any).bookingWindowHours ?? DEFAULT_CALENDAR_SETTINGS.bookingWindowHours,
        nonWorkingHoursDisplay: settings.nonWorkingHoursDisplay ?? DEFAULT_CALENDAR_SETTINGS.nonWorkingHoursDisplay,
        allowBookingOutsideHours: settings.allowBookingOutsideHours ?? DEFAULT_CALENDAR_SETTINGS.allowBookingOutsideHours,
        autoCompleteAppointments: settings.autoCompleteAppointments ?? DEFAULT_CALENDAR_SETTINGS.autoCompleteAppointments,
        autoMarkNoShows: (settings as any).autoMarkNoShows ?? false,
        showPrices: settings.showPrices ?? true,
        walkInsEnabled: (settings as any).walkInsEnabled ?? true,
      });
    }
  }, [settings, reset]);

  const onSubmit = (data: CalendarSettingsForm) => {
    // calendar_settings row (grid + minimum-notice + no-show automation)
    updateSettings.mutate({
      startOfWeek: data.startOfWeek,
      timeSlotInterval: data.timeSlotInterval,
      bookingWindowHours: data.bookingWindowHours,
      nonWorkingHoursDisplay: data.nonWorkingHoursDisplay,
      allowBookingOutsideHours: data.allowBookingOutsideHours,
      autoCompleteAppointments: data.autoCompleteAppointments,
      autoMarkNoShows: data.autoMarkNoShows,
      showPrices: data.showPrices,
      walkInsEnabled: data.walkInsEnabled,
    }, {
      onSuccess: () => toast({ title: t.toastSaved, description: t.toastSavedDesc }),
      onError: () => toast({ title: t.toastError, description: t.toastErrorDesc, variant: "destructive" }),
    });

    // locations row (online-booking + cancellation policy). A fee of 0 means
    // "no fee", which the API rejects as a percentage — send null instead.
    const hasFee = pol.cancellationFeePct >= 1;
    const isDeposit = pol.bookingPaymentPolicy === "deposit";
    updatePolicies.mutate({
      onlineBookingMode: pol.onlineBookingMode,
      advanceBookingEnabled: pol.advanceBookingEnabled,
      advanceBookingMonths: Math.max(ADVANCE_MONTHS_MIN, Math.min(ADVANCE_MONTHS_MAX, Math.trunc(pol.advanceBookingMonths) || ADVANCE_MONTHS_MIN)),
      onlineWaitlistEnabled: pol.onlineWaitlistEnabled,
      askClientsForPronouns: pol.askClientsForPronouns,
      allowOnlineCancellation: pol.allowOnlineCancellation,
      cancellationPolicyRequired: pol.cancellationPolicyRequired,
      cancellationPolicyText: pol.cancellationPolicyText,
      cancellationHoursCutoff: Math.max(0, Math.min(CANCEL_WINDOW_MAX, Math.trunc(pol.cancellationHoursCutoff) || 0)),
      cancellationFeeType: hasFee ? "percentage" : null,
      cancellationFeeValue: hasFee ? Math.min(CANCEL_FEE_MAX, Math.trunc(pol.cancellationFeePct)) : null,
      lateGracePeriodMinutes: Math.max(0, Math.min(GRACE_MAX, Math.trunc(pol.lateGracePeriodMinutes) || 0)),
      bookingPaymentPolicy: pol.bookingPaymentPolicy,
      depositType: isDeposit ? (pol.depositType ?? "fixed") : null,
      depositValue: isDeposit && pol.depositValue != null ? pol.depositValue : null,
    }, {
      onError: (e: any) => toast({ title: t.toastError, description: e?.message || t.toastErrorDesc, variant: "destructive" }),
    });
  };

  if (isLoading || storeLoading || !store || policiesLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">{t.loading}</div>
      </AppLayout>
    );
  }

  const saving = updateSettings.isPending || updatePolicies.isPending;
  const onlineModeDesc =
    pol.onlineBookingMode === "off" ? t.onlineModeDescOff
      : pol.onlineBookingMode === "existing" ? t.onlineModeDescExisting
      : t.onlineModeDescAll;
  const cardDesc =
    pol.bookingPaymentPolicy === "deposit" ? t.cardDepositDesc
      : pol.bookingPaymentPolicy === "card_on_file" ? t.cardOnFileDesc
      : t.cardNeverDesc;

  return (
    <AppLayout>
      <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-2xl space-y-6 px-4 py-6 pb-16 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {!inShell && (
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">{t.pageTitle}</h1>
          )}
          <Button type="submit" disabled={saving} data-testid="button-save-settings" className={inShell ? "ml-auto" : ""}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? t.saving : t.save}
          </Button>
        </div>

        {/* ── Online booking ─────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-6 space-y-8">
            <h2 className="text-xl font-semibold">{t.secOnline}</h2>

            <div className="space-y-2">
              <Label className="flex items-center">{t.onlineMode}</Label>
              <Select value={pol.onlineBookingMode} onValueChange={(v) => setP("onlineBookingMode", v as BookingMode)}>
                <SelectTrigger data-testid="select-online-booking-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.onlineModeAll}</SelectItem>
                  <SelectItem value="existing">{t.onlineModeExisting}</SelectItem>
                  <SelectItem value="off">{t.onlineModeOff}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">{onlineModeDesc}</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center">{t.bookingWindow}</Label>
              <Controller
                name="bookingWindowHours"
                control={control}
                render={({ field }) => (
                  <StepperField
                    caption={t.bookingWindowField}
                    value={field.value}
                    min={0}
                    max={BOOKING_WINDOW_MAX}
                    onChange={field.onChange}
                    testId="input-booking-window-hours"
                  />
                )}
              />
              <p className="text-sm text-muted-foreground">{t.bookingWindowDesc}</p>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="flex items-center text-base font-medium">
                  {t.timeSlot}
                  <InfoTooltip text={t.timeSlotTip} />
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">{t.timeSlotTip}</p>
              </div>
              <Controller
                name="timeSlotInterval"
                control={control}
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger
                      className="w-auto min-w-[128px] shrink-0 gap-2 rounded-full"
                      data-testid="select-time-slot-interval"
                    >
                      <Clock className="h-4 w-4 opacity-60" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 {t.min}</SelectItem>
                      <SelectItem value="10">10 {t.min}</SelectItem>
                      <SelectItem value="15">15 {t.min}</SelectItem>
                      <SelectItem value="20">20 {t.min}</SelectItem>
                      <SelectItem value="30">30 {t.min}</SelectItem>
                      <SelectItem value="60">60 {t.min}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2 border-t pt-6">
              <Label className="flex items-center">{t.cardOnFile}</Label>
              <Select
                value={pol.bookingPaymentPolicy}
                onValueChange={(v) => {
                  const next = v as PaymentPolicy;
                  setPol((p) => ({
                    ...p,
                    bookingPaymentPolicy: next,
                    depositType: next === "deposit" ? (p.depositType ?? "fixed") : null,
                    depositValue: next === "deposit" ? p.depositValue : null,
                  }));
                }}
              >
                <SelectTrigger data-testid="select-card-on-file">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.cardNever}</SelectItem>
                  <SelectItem value="card_on_file">{t.cardOnFileOpt}</SelectItem>
                  <SelectItem value="deposit">{t.cardDeposit}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">{cardDesc}</p>
              {pol.bookingPaymentPolicy !== "none" && !stripeConnected && (
                <p className="text-sm text-amber-600">{t.cardNoStripe}</p>
              )}

              {pol.bookingPaymentPolicy === "deposit" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t.depositValueLabel}</p>
                    <div className="flex gap-2">
                      {(["fixed","percentage"] as DepositType[]).map((dt) => (
                        <button
                          key={dt}
                          type="button"
                          onClick={() => setPol((p) => ({ ...p, depositType: dt, depositValue: null }))}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                            pol.depositType === dt
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-input text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {dt === "fixed" ? t.depositTypeFixed : t.depositTypePct}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {pol.depositType === "percentage" ? "%" : "$"}
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      value={pol.depositValue != null ? String(pol.depositValue) : ""}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
                        if (raw === "") { setP("depositValue", null); return; }
                        const n = parseInt(raw, 10);
                        setP("depositValue", pol.depositType === "percentage"
                          ? Math.min(100, Math.max(1, n))
                          : Math.min(999, Math.max(1, n)));
                      }}
                      placeholder={pol.depositType === "percentage" ? "30" : "25"}
                      className="w-full bg-transparent text-2xl font-bold text-foreground outline-none border-b-2 border-input focus:border-primary py-1 text-center transition-colors"
                      data-testid="input-deposit-value"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 border-t pt-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-base font-medium">{t.advance}</Label>
                  <p className="text-sm text-muted-foreground mt-0.5">{t.advanceDesc}</p>
                </div>
                <Switch
                  checked={pol.advanceBookingEnabled}
                  onCheckedChange={(c) => setP("advanceBookingEnabled", c)}
                  data-testid="switch-advance-booking"
                />
              </div>
              {pol.advanceBookingEnabled && (
                <StepperField
                  caption={t.advanceField}
                  value={pol.advanceBookingMonths}
                  min={ADVANCE_MONTHS_MIN}
                  max={ADVANCE_MONTHS_MAX}
                  onChange={(n) => setP("advanceBookingMonths", n)}
                  testId="input-advance-booking-months"
                />
              )}
            </div>

            <ToggleRow title={t.pronouns} desc={t.pronounsDesc}>
              <Switch
                checked={pol.askClientsForPronouns}
                onCheckedChange={(c) => setP("askClientsForPronouns", c)}
                data-testid="switch-ask-pronouns"
              />
            </ToggleRow>
          </CardContent>
        </Card>

        {/* ── Cancellations ─────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-6 space-y-8">
            <h2 className="text-xl font-semibold">{t.secCancellations}</h2>

            <ToggleRow title={t.onlineCancel} desc={t.onlineCancelDesc} bordered={false}>
              <Switch
                checked={pol.allowOnlineCancellation}
                onCheckedChange={(c) => setP("allowOnlineCancellation", c)}
                data-testid="switch-online-cancellation"
              />
            </ToggleRow>

            <ToggleRow title={t.policyRequired} desc={t.policyRequiredDesc}>
              <Switch
                checked={pol.cancellationPolicyRequired}
                onCheckedChange={(c) => setP("cancellationPolicyRequired", c)}
                data-testid="switch-policy-required"
              />
            </ToggleRow>

            <div className="space-y-2 border-t pt-6">
              <Label className="flex items-center">{t.policyText}</Label>
              <Textarea
                value={pol.cancellationPolicyText}
                onChange={(e) => setP("cancellationPolicyText", e.target.value)}
                placeholder={t.policyTextPlaceholder}
                rows={4}
                data-testid="textarea-cancellation-policy"
              />
              <p className="text-sm text-muted-foreground">
                {t.policyTextDesc}
                {pol.cancellationPolicyRequired && !pol.cancellationPolicyText.trim() && (
                  <span className="text-amber-600"> {t.policyRequiredWarn}</span>
                )}
              </p>
            </div>

            <div className="space-y-2 border-t pt-6">
              <Label className="flex items-center">{t.cancelFee}</Label>
              <div className="rounded-xl border border-input bg-background px-4 py-3">
                <span className="text-xs text-muted-foreground">{t.cancelFeeField}</span>
                <div className="flex items-baseline gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={CANCEL_FEE_MAX}
                    value={pol.cancellationFeePct}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setP("cancellationFeePct", Math.max(0, Math.min(CANCEL_FEE_MAX, Number.isFinite(n) ? n : 0)));
                    }}
                    className="w-20 bg-transparent text-2xl font-semibold text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    data-testid="input-cancellation-fee-pct"
                  />
                  <span className="text-lg font-semibold text-muted-foreground">%</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{t.cancelFeeDesc}</p>
              {pol.cancellationFeePct >= 1 && !stripeConnected && (
                <p className="text-sm text-amber-600">{t.cancelFeeNoStripe}</p>
              )}
            </div>

            <div className="space-y-2 border-t pt-6">
              <Label className="flex items-center">{t.cancelWindow}</Label>
              <StepperField
                caption={t.cancelWindowField}
                value={pol.cancellationHoursCutoff}
                min={0}
                max={CANCEL_WINDOW_MAX}
                onChange={(n) => setP("cancellationHoursCutoff", n)}
                testId="input-cancellation-window-hours"
              />
              <p className="text-sm text-muted-foreground">{t.cancelWindowDesc}</p>
            </div>
          </CardContent>
        </Card>

        {/* ── Waitlist ──────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-xl font-semibold">{t.secWaitlist}</h2>
            <ToggleRow title={t.waitlistEnable} desc={t.waitlistDesc} bordered={false}>
              <Switch
                checked={pol.onlineWaitlistEnabled}
                onCheckedChange={(c) => setP("onlineWaitlistEnabled", c)}
                data-testid="switch-online-waitlist"
              />
            </ToggleRow>
          </CardContent>
        </Card>

        {/* ── No-shows & late arrivals ──────────────────────────────────── */}
        <Card>
          <CardContent className="p-6 space-y-8">
            <h2 className="text-xl font-semibold">{t.secNoShows}</h2>

            <div className="space-y-2">
              <Label className="flex items-center">{t.grace}</Label>
              <StepperField
                caption={t.graceField}
                value={pol.lateGracePeriodMinutes}
                min={0}
                max={GRACE_MAX}
                onChange={(n) => setP("lateGracePeriodMinutes", n)}
                testId="input-late-grace-minutes"
              />
              <p className="text-sm text-muted-foreground">{t.graceDesc}</p>
            </div>

            <div className="flex items-center justify-between gap-4 border-t pt-6">
              <div>
                <Label className="text-base font-medium">{t.autoNoShow}</Label>
                <p className="text-sm text-muted-foreground mt-0.5">{t.autoNoShowDesc}</p>
              </div>
              <Controller
                name="autoMarkNoShows"
                control={control}
                render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-auto-no-show" />
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Booking ban list ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-xl font-semibold">{t.secBanList}</h2>
            <p className="text-sm text-muted-foreground">{t.banListDesc}</p>
            <BookingBanList />
          </CardContent>
        </Card>

        {/* ── Calendar display ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-6 space-y-8">
            <h2 className="text-xl font-semibold">{t.secDisplay}</h2>

            <div className="space-y-2">
              <Label className="flex items-center">
                {t.startOfWeek}
                <InfoTooltip text={t.startOfWeekTip} />
              </Label>
              <Controller
                name="startOfWeek"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger data-testid="select-start-of-week">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monday">{t.monday}</SelectItem>
                      <SelectItem value="tuesday">{t.tuesday}</SelectItem>
                      <SelectItem value="wednesday">{t.wednesday}</SelectItem>
                      <SelectItem value="thursday">{t.thursday}</SelectItem>
                      <SelectItem value="friday">{t.friday}</SelectItem>
                      <SelectItem value="saturday">{t.saturday}</SelectItem>
                      <SelectItem value="sunday">{t.sunday}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center">
                {t.nonWorkingHours}
                <InfoTooltip text={t.nonWorkingHoursTip} />
              </Label>
              <Controller
                name="nonWorkingHoursDisplay"
                control={control}
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger data-testid="select-non-working-hours">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t.none}</SelectItem>
                      <SelectItem value="1">{t.hour1}</SelectItem>
                      <SelectItem value="2">{t.hour2}</SelectItem>
                      <SelectItem value="3">{t.hour3}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex items-center justify-between gap-4 border-t pt-6">
              <div>
                <Label className="text-base font-medium">{t.allowOutside}</Label>
                <p className="text-sm text-muted-foreground mt-0.5">{t.allowOutsideDesc}</p>
              </div>
              <Controller
                name="allowBookingOutsideHours"
                control={control}
                render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-allow-outside-hours" />
                )}
              />
            </div>

            <div className="flex items-center justify-between gap-4 border-t pt-6">
              <div>
                <Label className="text-base font-medium">{t.autoComplete}</Label>
                <p className="text-sm text-muted-foreground mt-0.5">{t.autoCompleteDesc}</p>
              </div>
              <Controller
                name="autoCompleteAppointments"
                control={control}
                render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-auto-complete" />
                )}
              />
            </div>

            <div className="flex items-center justify-between gap-4 border-t pt-6">
              <div>
                <Label className="text-base font-medium">{t.showPrices}</Label>
                <p className="text-sm text-muted-foreground mt-0.5">{t.showPricesDesc}</p>
              </div>
              <Controller
                name="showPrices"
                control={control}
                render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-show-prices" />
                )}
              />
            </div>

            <div className="flex items-center justify-between gap-4 border-t pt-6">
              <div>
                <Label className="text-base font-medium">{t.walkIns}</Label>
                <p className="text-sm text-muted-foreground mt-0.5">{t.walkInsDesc}</p>
              </div>
              <Controller
                name="walkInsEnabled"
                control={control}
                render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-walk-ins-enabled" />
                )}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </AppLayout>
  );
}
