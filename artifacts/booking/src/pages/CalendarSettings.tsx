import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCalendarSettings, useUpdateCalendarSettings, DEFAULT_CALENDAR_SETTINGS } from "@/hooks/use-calendar-settings";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { Save, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/hooks/use-language";
import type { Store } from "@shared/schema";

type CalendarSettingsForm = {
  startOfWeek: string;
  timeSlotInterval: number;
  nonWorkingHoursDisplay: number;
  allowBookingOutsideHours: boolean;
  autoCompleteAppointments: boolean;
  showPrices: boolean;
  walkInsEnabled: boolean;
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

export default function CalendarSettings() {
  const { selectedStore } = useSelectedStore();
  const { data: settings, isLoading } = useCalendarSettings();
  const updateSettings = useUpdateCalendarSettings();
  const { toast } = useToast();
  const { pick } = useLanguage();
  const { data: store, isLoading: storeLoading } = useQuery<Store>({
    queryKey: ["/api/stores", selectedStore?.id],
    enabled: !!selectedStore?.id,
  });

  const t = {
    loading:              pick({ en: "Loading...",               vi: "Đang tải...",         es: "Cargando...",                    fr: "Chargement..." }),
    pageTitle:            pick({ en: "Calendar Settings",        vi: "Cài đặt lịch",        es: "Configuración del calendario",   fr: "Paramètres du calendrier" }),
    saving:               pick({ en: "Saving...",               vi: "Đang lưu...",          es: "Guardando...",                   fr: "Enregistrement..." }),
    save:                 pick({ en: "Save",                    vi: "Lưu",                  es: "Guardar",                        fr: "Enregistrer" }),
    sectionTitle:         pick({ en: "Calendar Settings",        vi: "Cài đặt lịch",        es: "Configuración del calendario",   fr: "Paramètres du calendrier" }),
    startOfWeek:          pick({ en: "Calendar start of week",  vi: "Ngày bắt đầu tuần",   es: "Inicio de semana del calendario", fr: "Début de semaine du calendrier" }),
    startOfWeekTip:       pick({ en: "Choose which day the calendar week starts on.", vi: "Chọn ngày bắt đầu tuần trên lịch.", es: "Elige qué día comienza la semana del calendario.", fr: "Choisissez le jour de début de semaine du calendrier." }),
    monday:               pick({ en: "Monday",    vi: "Thứ Hai",  es: "Lunes",    fr: "Lundi" }),
    tuesday:              pick({ en: "Tuesday",   vi: "Thứ Ba",   es: "Martes",   fr: "Mardi" }),
    wednesday:            pick({ en: "Wednesday", vi: "Thứ Tư",   es: "Miércoles", fr: "Mercredi" }),
    thursday:             pick({ en: "Thursday",  vi: "Thứ Năm",  es: "Jueves",   fr: "Jeudi" }),
    friday:               pick({ en: "Friday",    vi: "Thứ Sáu",  es: "Viernes",  fr: "Vendredi" }),
    saturday:             pick({ en: "Saturday",  vi: "Thứ Bảy",  es: "Sábado",   fr: "Samedi" }),
    sunday:               pick({ en: "Sunday",    vi: "Chủ Nhật", es: "Domingo",  fr: "Dimanche" }),
    timeSlot:             pick({ en: "Time slot intervals",              vi: "Khoảng cách khung giờ",    es: "Intervalos de franjas horarias",    fr: "Intervalles des créneaux" }),
    timeSlotTip:          pick({ en: "The time interval between each slot on the calendar grid.", vi: "Khoảng cách thời gian giữa các khung giờ trên lưới lịch.", es: "El intervalo de tiempo entre cada franja en la cuadrícula del calendario.", fr: "L'intervalle de temps entre chaque créneau sur la grille du calendrier." }),
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
    walkInsDesc:          pick({ en: "When off, the walk-in button is hidden and staff must always look up or create a client. Useful if you want to capture client contact info for SMS or marketing on every booking.", vi: "Khi tắt, nút khách vãng lai bị ẩn và nhân viên phải luôn tra cứu hoặc tạo hồ sơ khách hàng. Hữu ích khi bạn muốn thu thập thông tin khách hàng cho SMS hoặc marketing.", es: "Cuando está desactivado, el botón de entrada directa está oculto y el personal debe buscar o crear un perfil de cliente.", fr: "Désactivé, le bouton d'entrée directe est masqué et le personnel doit chercher ou créer un profil client." }),
    min:                  pick({ en: "min",  vi: "phút", es: "min",  fr: "min" }),
    toastSaved:           pick({ en: "Settings saved",                    vi: "Đã lưu cài đặt",                  es: "Configuración guardada",                 fr: "Paramètres enregistrés" }),
    toastSavedDesc:       pick({ en: "Calendar settings have been updated.", vi: "Cài đặt lịch đã được cập nhật.", es: "La configuración del calendario se ha actualizado.", fr: "Les paramètres du calendrier ont été mis à jour." }),
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
        nonWorkingHoursDisplay: settings.nonWorkingHoursDisplay ?? DEFAULT_CALENDAR_SETTINGS.nonWorkingHoursDisplay,
        allowBookingOutsideHours: settings.allowBookingOutsideHours ?? DEFAULT_CALENDAR_SETTINGS.allowBookingOutsideHours,
        autoCompleteAppointments: settings.autoCompleteAppointments ?? DEFAULT_CALENDAR_SETTINGS.autoCompleteAppointments,
        showPrices: settings.showPrices ?? true,
        walkInsEnabled: (settings as any).walkInsEnabled ?? true,
      });
    }
  }, [settings, reset]);

  const onSubmit = (data: CalendarSettingsForm) => {
    // Whitelist exactly the fields this form owns — the calendar_settings row is
    // shared with the Booking Policies page (autoMarkNoShows), so sending the raw
    // RHF values object here risks silently overwriting a field this page has no
    // control for.
    updateSettings.mutate({
      startOfWeek: data.startOfWeek,
      timeSlotInterval: data.timeSlotInterval,
      nonWorkingHoursDisplay: data.nonWorkingHoursDisplay,
      allowBookingOutsideHours: data.allowBookingOutsideHours,
      autoCompleteAppointments: data.autoCompleteAppointments,
      showPrices: data.showPrices,
      walkInsEnabled: data.walkInsEnabled,
    }, {
      onSuccess: () => {
        toast({ title: t.toastSaved, description: t.toastSavedDesc });
      },
      onError: () => {
        toast({ title: t.toastError, description: t.toastErrorDesc, variant: "destructive" });
      },
    });
  };

  if (isLoading || storeLoading || !store) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">{t.loading}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h1 className="text-3xl font-display font-bold" data-testid="text-page-title">{t.pageTitle}</h1>
          <Button type="submit" disabled={updateSettings.isPending} data-testid="button-save-settings">
            <Save className="w-4 h-4 mr-2" />
            {updateSettings.isPending ? t.saving : t.save}
          </Button>
        </div>

        <Card>
          <CardContent className="p-6 space-y-8">
            <h2 className="text-xl font-semibold">{t.sectionTitle}</h2>

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
                {t.timeSlot}
                <InfoTooltip text={t.timeSlotTip} />
              </Label>
              <Controller
                name="timeSlotInterval"
                control={control}
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger data-testid="select-time-slot-interval">
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

            <div className="flex items-center justify-between gap-4 py-2 border-t pt-6">
              <div>
                <Label className="text-base font-medium">{t.allowOutside}</Label>
                <p className="text-sm text-muted-foreground mt-0.5">{t.allowOutsideDesc}</p>
              </div>
              <Controller
                name="allowBookingOutsideHours"
                control={control}
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-allow-outside-hours"
                  />
                )}
              />
            </div>

            <div className="flex items-center justify-between gap-4 py-2 border-t pt-6">
              <div>
                <Label className="text-base font-medium">{t.autoComplete}</Label>
                <p className="text-sm text-muted-foreground mt-0.5">{t.autoCompleteDesc}</p>
              </div>
              <Controller
                name="autoCompleteAppointments"
                control={control}
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-auto-complete"
                  />
                )}
              />
            </div>

            <div className="flex items-center justify-between gap-4 py-2 border-t pt-6">
              <div>
                <Label className="text-base font-medium">{t.showPrices}</Label>
                <p className="text-sm text-muted-foreground mt-0.5">{t.showPricesDesc}</p>
              </div>
              <Controller
                name="showPrices"
                control={control}
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-show-prices"
                  />
                )}
              />
            </div>

            <div className="flex items-center justify-between gap-4 py-2 border-t pt-6">
              <div>
                <Label className="text-base font-medium">{t.walkIns}</Label>
                <p className="text-sm text-muted-foreground mt-0.5">{t.walkInsDesc}</p>
              </div>
              <Controller
                name="walkInsEnabled"
                control={control}
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-walk-ins-enabled"
                  />
                )}
              />
            </div>

          </CardContent>
        </Card>
      </form>
    </AppLayout>
  );
}
