// Moved out of pages/Calendar.tsx so the /nail and /barber staff screens don't load the whole calendar.
import { useState, useEffect } from "react";
import { formatTurns } from "@shared/turnRules";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { formatInTz, isOnStoreDate } from "@/lib/timezone";
import { X, Clock, Loader2, Receipt, Send, HelpCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { queueTurnAdjust } from "@/pages/nail/nailApi";
import { ManagerPinSheet } from "./ManagerPinSheet";
import { TimeClockSheet } from "./TimeClockSheet";

export type TurnTechnician = {
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

export function TurnTechCard({
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

export function TurnPageModal({
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
  const queryClient = useQueryClient();

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
  // Not a useState initializer — this modal can stay open/mounted for hours,
  // so the date label must be recomputed on the same tick as nowTime below,
  // not frozen at whatever date it happened to be when the modal first opened.
  const [todayDate, setTodayDate] = useState(() =>
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
      () => {
        setNowTime(formatInTz(new Date(), timezone, "h:mm a"));
        setTodayDate(formatInTz(new Date(), timezone, "EEEE, MMMM d"));
      },
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
                          {formatTurns(Number.isFinite(Number((live as any).turnUnits)) ? Number((live as any).turnUnits) : Math.round((live.turnCount ?? 0) * 1000))}
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

                <TurnAdjustPanel
                  storeId={storeId}
                  staffId={selectedTech.id}
                  name={selectedTech.name}
                  fixedOrder={(turnEligibility as any)?.turnRules?.mode === "round_robin"}
                  onDone={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/turn/staff-history", storeId, selectedTech.id] });
                  }}
                />

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

/**
 * A manager gives or takes turns by hand (a free redo, a favour, a late start): pick the change, say why,
 * approve with the manager PIN. The server records it in the turn history. In fixed order a turn can only
 * be given, which sends the technician to the back of the order. With no connection it is kept on the tablet,
 * counted in its line at once, and sent when the connection is back.
 */
export function TurnAdjustPanel({ storeId, staffId, name, fixedOrder, onDone }: { storeId: number; staffId: number; name: string; fixedOrder: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const [units, setUnits] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [askPin, setAskPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const first = name.split(" ")[0];
  const choices = fixedOrder ? [{ units: 1000, label: "Send to back" }] : [
    { units: -1000, label: "−1" }, { units: -500, label: "−½" }, { units: 500, label: "+½" }, { units: 1000, label: "+1" },
  ];
  const save = async (managerPin: string) => {
    setAskPin(false);
    setSaving(true);
    try {
      const body = { staffId, units: fixedOrder ? 1000 : units ?? 0, reason: reason.trim(), managerPin };
      try {
        const res = await fetch("/api/nail/turn-adjust", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId, ...body }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Could not change the turns");
      } catch (err) {
        // No server: keep it on the tablet (lib/request-deadline.ts fails an unreachable request with a TypeError).
        if (!(err instanceof TypeError)) throw err;
        await queueTurnAdjust(storeId, body);
      }
      toast({ title: fixedOrder ? `${first} goes to the back of the order` : `${(units ?? 0) > 0 ? "Gave" : "Took"} ${formatTurns(Math.abs(units ?? 0))} ${Math.abs(units ?? 0) <= 1000 ? "turn" : "turns"} ${(units ?? 0) > 0 ? "to" : "from"} ${first}` });
      setUnits(null); setReason("");
      onDone();
    } catch (err: any) {
      toast({ title: err?.message || "Could not change the turns", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mx-5 mb-3 rounded-xl border border-slate-100 px-4 py-3" data-testid="turn-adjust">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Adjust turns</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {choices.map((c) => (
          <button key={c.units} type="button" onClick={() => setUnits(units === c.units ? null : c.units)} data-testid={`turn-adjust-${c.units}`}
            className={`h-9 min-w-[52px] rounded-lg border px-3 text-sm font-semibold ${units === c.units ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
            {c.label}
          </button>
        ))}
      </div>
      {units != null && (
        <div className="mt-3 flex gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Reason (kept in the turn history)"
            className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm" data-testid="turn-adjust-reason" />
          <button type="button" disabled={reason.trim().length < 2 || saving} onClick={() => setAskPin(true)} data-testid="turn-adjust-save"
            className="h-9 rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white disabled:opacity-40">
            {saving ? "Saving…" : "Approve"}
          </button>
        </div>
      )}
      {askPin && <ManagerPinSheet title="Approve turn change" onClose={() => setAskPin(false)} onSuccess={(pin) => void save(pin)} />}
    </div>
  );
}
