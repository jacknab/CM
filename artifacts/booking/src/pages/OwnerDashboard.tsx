import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFeatureFlags } from "@/hooks/use-features";
import { Link } from "react-router-dom";
import {
  DollarSign, Calendar, Users, Users2, Star, Crown, ShieldAlert,
  AlertTriangle, AlertCircle, TrendingUp, TrendingDown,
  CreditCard, Banknote, Gift, ChevronRight, Wifi, WifiOff,
  Clock, BarChart3, Bell, CheckCircle2, UserCheck, Sparkles,
  UserPlus, Radio, PhoneCall, PackageX, Scissors, MessageSquareText,
  CalendarPlus, Package, X, HelpCircle, ArrowRight, Activity,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { useSelectedStore } from "@/hooks/use-store";
import { NotificationBell } from "@/components/NotificationBell";
import { formatInTz, getHourInTz } from "@/lib/timezone";
import { format, formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useDashboardWs } from "@/hooks/use-dashboard-ws";
import type { DashboardData } from "@/lib/dashboardTypes";
import { useLanguage } from "@/hooks/use-language";

type Pick4 = (m: { en: string; vi: string; es: string; fr: string }) => string;

// ── Translations (shared across every card on this page) ───────────────────────
function buildT(pick: Pick4) {
  return {
    live:              pick({ en: "LIVE", vi: "TRỰC TIẾP", es: "EN VIVO", fr: "EN DIRECT" }),
    viewAll:           pick({ en: "View all", vi: "Xem tất cả", es: "Ver todo", fr: "Voir tout" }),
    viewDetails:       pick({ en: "View Details", vi: "Xem chi tiết", es: "Ver detalles", fr: "Voir les détails" }),
    updatedAgo:        (rel: string) => pick({ en: `Updated ${rel}`, vi: `Đã cập nhật ${rel}`, es: `Actualizado ${rel}`, fr: `Mis à jour ${rel}` }),
    liveNow:           pick({ en: "Live", vi: "Trực tiếp", es: "En vivo", fr: "En direct" }),
    reconnecting:      pick({ en: "Reconnecting…", vi: "Đang kết nối lại…", es: "Reconectando…", fr: "Reconnexion…" }),
    // Status labels
    completed:         pick({ en: "Completed", vi: "Hoàn thành", es: "Completado", fr: "Terminé" }),
    inService:         pick({ en: "In Service", vi: "Đang phục vụ", es: "En servicio", fr: "En service" }),
    waitingStatus:     pick({ en: "Waiting", vi: "Đang chờ", es: "Esperando", fr: "En attente" }),
    noShow:            pick({ en: "No Show", vi: "Vắng mặt", es: "No asistió", fr: "Absence" }),
    upcomingStatus:    pick({ en: "Upcoming", vi: "Sắp tới", es: "Próximo", fr: "À venir" }),
    busy:              pick({ en: "Busy", vi: "Bận", es: "Ocupado", fr: "Occupé" }),
    onBreak:           pick({ en: "Break", vi: "Nghỉ", es: "Descanso", fr: "Pause" }),
    available:         pick({ en: "Available", vi: "Sẵn sàng", es: "Disponible", fr: "Disponible" }),
    // What's Happening
    whatsHappening:    pick({ en: "What's Happening Right Now", vi: "Đang diễn ra ngay bây giờ", es: "Qué está pasando ahora", fr: "Ce qui se passe maintenant" }),
    clientsInSalon:    (n: number) => pick({ en: `${n} client${n !== 1 ? "s" : ""} in the salon`, vi: `${n} khách hàng đang ở salon`, es: `${n} cliente${n !== 1 ? "s" : ""} en el salón`, fr: `${n} client${n !== 1 ? "s" : ""} au salon` }),
    viewLiveActivity:  pick({ en: "View live activity", vi: "Xem hoạt động trực tiếp", es: "Ver actividad en vivo", fr: "Voir l'activité en direct" }),
    clientsWaiting:    (n: number) => pick({ en: `${n} client${n !== 1 ? "s" : ""} waiting`, vi: `${n} khách hàng đang chờ`, es: `${n} cliente${n !== 1 ? "s" : ""} esperando`, fr: `${n} client${n !== 1 ? "s" : ""} en attente` }),
    viewWaitList:      pick({ en: "View wait list", vi: "Xem danh sách chờ", es: "Ver lista de espera", fr: "Voir la liste d'attente" }),
    stylistsWorking:   (n: number) => pick({ en: `${n} stylist${n !== 1 ? "s" : ""} currently working`, vi: `${n} nhân viên đang làm việc`, es: `${n} estilista${n !== 1 ? "s" : ""} trabajando`, fr: `${n} coiffeur${n !== 1 ? "s" : ""} en activité` }),
    viewTeamSchedule:  pick({ en: "View team schedule", vi: "Xem lịch làm việc", es: "Ver horario del equipo", fr: "Voir le planning de l'équipe" }),
    apptsRunningLate:  (n: number) => pick({ en: `${n} appointment${n !== 1 ? "s" : ""} running late`, vi: `${n} lịch hẹn bị trễ`, es: `${n} cita${n !== 1 ? "s" : ""} con retraso`, fr: `${n} rendez-vous en retard` }),
    viewDetailsLower:  pick({ en: "View details", vi: "Xem chi tiết", es: "Ver detalles", fr: "Voir les détails" }),
    allQuiet:          pick({ en: "All quiet for now", vi: "Hiện tại mọi thứ yên tĩnh", es: "Todo tranquilo por ahora", fr: "Tout est calme pour l'instant" }),
    // Team member status
    teamMemberStatus:  pick({ en: "Team Member Status", vi: "Trạng thái nhân viên", es: "Estado del personal", fr: "Statut de l'équipe" }),
    noneClockedIn:     pick({ en: "No team members clocked in", vi: "Chưa có nhân viên chấm công", es: "Ningún miembro ha marcado entrada", fr: "Aucun membre pointé" }),
    noneOnFloor:       pick({ en: "No team members on the floor today", vi: "Không có nhân viên nào hôm nay", es: "Nadie en el salón hoy", fr: "Personne sur le plancher aujourd'hui" }),
    turnSuffix:        pick({ en: "turn", vi: "lượt", es: "turno", fr: "tour" }),
    completedSuffix:   (n: number) => pick({ en: `${n} completed`, vi: `${n} đã hoàn thành`, es: `${n} completado${n !== 1 ? "s" : ""}`, fr: `${n} terminé${n !== 1 ? "s" : ""}` }),
    busyCount:         (n: number) => pick({ en: `${n} busy`, vi: `${n} bận`, es: `${n} ocupado${n !== 1 ? "s" : ""}`, fr: `${n} occupé${n !== 1 ? "s" : ""}` }),
    availCount:        (n: number) => pick({ en: `${n} available`, vi: `${n} sẵn sàng`, es: `${n} disponible${n !== 1 ? "s" : ""}`, fr: `${n} disponible${n !== 1 ? "s" : ""}` }),
    breakCount:        (n: number) => pick({ en: `${n} on break`, vi: `${n} đang nghỉ`, es: `${n} en descanso`, fr: `${n} en pause` }),
    viewCalendarArrow: pick({ en: "View Calendar →", vi: "Xem lịch →", es: "Ver calendario →", fr: "Voir le calendrier →" }),
    // Financials
    todayFinancials:   pick({ en: "Today's Financial Summary", vi: "Tổng kết tài chính hôm nay", es: "Resumen financiero de hoy", fr: "Résumé financier du jour" }),
    viewReport:        pick({ en: "View Report", vi: "Xem báo cáo", es: "Ver informe", fr: "Voir le rapport" }),
    payCard:           pick({ en: "Card", vi: "Thẻ", es: "Tarjeta", fr: "Carte" }),
    payCash:           pick({ en: "Cash", vi: "Tiền mặt", es: "Efectivo", fr: "Espèces" }),
    payGiftCard:       pick({ en: "Gift Cards", vi: "Thẻ quà tặng", es: "Tarjetas de regalo", fr: "Cartes cadeaux" }),
    totalRevenue:      pick({ en: "Total Revenue", vi: "Tổng doanh thu", es: "Ingresos totales", fr: "Revenu total" }),
    serviceSales:      pick({ en: "Service Sales", vi: "Doanh thu dịch vụ", es: "Ventas de servicios", fr: "Ventes de services" }),
    productSales:      pick({ en: "Product Sales", vi: "Doanh thu sản phẩm", es: "Ventas de productos", fr: "Ventes de produits" }),
    tips:              pick({ en: "Tips", vi: "Tiền tip", es: "Propinas", fr: "Pourboires" }),
    totalPayments:     pick({ en: "Total Payments", vi: "Tổng thanh toán", es: "Pagos totales", fr: "Paiements totaux" }),
    outstandingBalance:pick({ en: "Outstanding Balance", vi: "Số dư còn nợ", es: "Saldo pendiente", fr: "Solde impayé" }),
    // Top services
    topServicesToday:  pick({ en: "Top Services Today", vi: "Dịch vụ nổi bật hôm nay", es: "Servicios destacados de hoy", fr: "Meilleurs services du jour" }),
    viewAllServices:   pick({ en: "View All Services", vi: "Xem tất cả dịch vụ", es: "Ver todos los servicios", fr: "Voir tous les services" }),
    noServicesYet:     pick({ en: "No completed services yet today", vi: "Chưa có dịch vụ hoàn thành hôm nay", es: "Aún no hay servicios completados hoy", fr: "Aucun service terminé aujourd'hui" }),
    revenueServicesLegend: pick({ en: "($) Revenue   (#) Number of Services", vi: "($) Doanh thu   (#) Số lượt dịch vụ", es: "($) Ingresos   (#) N.º de servicios", fr: "($) Revenu   (#) Nombre de services" }),
    // Team performance
    teamPerformanceToday: pick({ en: "Team Performance Today", vi: "Hiệu suất đội ngũ hôm nay", es: "Rendimiento del equipo hoy", fr: "Performance de l'équipe aujourd'hui" }),
    viewTeamReport:    pick({ en: "View Team Report", vi: "Xem báo cáo đội ngũ", es: "Ver informe del equipo", fr: "Voir le rapport d'équipe" }),
    noTeamDataYet:     pick({ en: "No team data yet today", vi: "Chưa có dữ liệu đội ngũ hôm nay", es: "Aún no hay datos del equipo hoy", fr: "Aucune donnée d'équipe aujourd'hui" }),
    colName:           pick({ en: "Name", vi: "Tên", es: "Nombre", fr: "Nom" }),
    colSales:          pick({ en: "Sales", vi: "Doanh thu", es: "Ventas", fr: "Ventes" }),
    colAppts:          pick({ en: "Appts", vi: "Lịch hẹn", es: "Citas", fr: "RDV" }),
    colAvgTicket:      pick({ en: "Avg Ticket", vi: "TB/Khách", es: "Ticket prom.", fr: "Panier moy." }),
    // Client loyalty
    clientLoyaltySnapshot: pick({ en: "Client Loyalty Snapshot", vi: "Tổng quan khách hàng thân thiết", es: "Resumen de fidelización", fr: "Aperçu de la fidélité client" }),
    viewLoyalty:       pick({ en: "View Loyalty", vi: "Xem khách thân thiết", es: "Ver fidelización", fr: "Voir la fidélité" }),
    vipClients:        pick({ en: "VIP Clients", vi: "Khách hàng VIP", es: "Clientes VIP", fr: "Clients VIP" }),
    regulars:          pick({ en: "Regulars (Returning)", vi: "Khách quen (Quay lại)", es: "Habituales (Recurrentes)", fr: "Habitués (Récurrents)" }),
    newThisMonth:      pick({ en: "New Clients This Month", vi: "Khách mới tháng này", es: "Nuevos clientes este mes", fr: "Nouveaux clients ce mois" }),
    clientsAtRisk:     pick({ en: "Clients At Risk", vi: "Khách hàng có nguy cơ", es: "Clientes en riesgo", fr: "Clients à risque" }),
    // Recent activity
    recentActivity:    pick({ en: "Recent Activity", vi: "Hoạt động gần đây", es: "Actividad reciente", fr: "Activité récente" }),
    viewAllActivity:   pick({ en: "View All Activity", vi: "Xem tất cả hoạt động", es: "Ver toda la actividad", fr: "Voir toute l'activité" }),
    nothingYetToday:   pick({ en: "Nothing yet today", vi: "Chưa có gì hôm nay", es: "Nada por ahora hoy", fr: "Rien pour l'instant aujourd'hui" }),
    justNow:           pick({ en: "just now", vi: "vừa xong", es: "ahora mismo", fr: "à l'instant" }),
    secsAgo:           (n: number) => pick({ en: `${n}s ago`, vi: `${n} giây trước`, es: `hace ${n}s`, fr: `il y a ${n}s` }),
    minsAgo:           (n: number) => pick({ en: `${n}m ago`, vi: `${n} phút trước`, es: `hace ${n}min`, fr: `il y a ${n}min` }),
    hoursAgo:          (n: number) => pick({ en: `${n}h ago`, vi: `${n} giờ trước`, es: `hace ${n}h`, fr: `il y a ${n}h` }),
    // Reminders
    remindersAlerts:   pick({ en: "Reminders & Alerts", vi: "Nhắc nhở & Cảnh báo", es: "Recordatorios y alertas", fr: "Rappels et alertes" }),
    allClear:          pick({ en: "All clear — nothing needs attention right now", vi: "Mọi thứ ổn — không có gì cần chú ý", es: "Todo despejado — nada requiere atención", fr: "Tout est en ordre — rien ne nécessite d'attention" }),
    // AI Receptionist
    aiReceptionist:    pick({ en: "AI Receptionist", vi: "Lễ tân AI", es: "Recepcionista IA", fr: "Réceptionniste IA" }),
    aiLiveDesc:        pick({ en: "Your AI Receptionist is live and answering calls.", vi: "Lễ tân AI của bạn đang hoạt động và trả lời cuộc gọi.", es: "Tu recepcionista IA está activo y respondiendo llamadas.", fr: "Votre réceptionniste IA est en ligne et répond aux appels." }),
    todaysCalls:       pick({ en: "Today's Calls", vi: "Cuộc gọi hôm nay", es: "Llamadas de hoy", fr: "Appels du jour" }),
    booked:            pick({ en: "Booked", vi: "Đã đặt lịch", es: "Reservado", fr: "Réservé" }),
    missed:            pick({ en: "Missed", vi: "Bị nhỡ", es: "Perdida", fr: "Manqué" }),
    viewCallLogs:      pick({ en: "View Call Logs", vi: "Xem nhật ký cuộc gọi", es: "Ver registros de llamadas", fr: "Voir les journaux d'appels" }),
    // Upcoming appointments
    upcomingAppts:     pick({ en: "Upcoming Appointments", vi: "Lịch hẹn sắp tới", es: "Próximas citas", fr: "Rendez-vous à venir" }),
    viewCalendar:      pick({ en: "View Calendar", vi: "Xem lịch", es: "Ver calendario", fr: "Voir le calendrier" }),
    noUpcomingAppts:   pick({ en: "No upcoming appointments", vi: "Không có lịch hẹn sắp tới", es: "No hay próximas citas", fr: "Aucun rendez-vous à venir" }),
    colTime:           pick({ en: "TIME", vi: "GIỜ", es: "HORA", fr: "HEURE" }),
    colClient:         pick({ en: "CLIENT", vi: "KHÁCH HÀNG", es: "CLIENTE", fr: "CLIENT" }),
    colService:        pick({ en: "SERVICE", vi: "DỊCH VỤ", es: "SERVICIO", fr: "SERVICE" }),
    colStaff:          pick({ en: "STAFF", vi: "NHÂN VIÊN", es: "PERSONAL", fr: "PERSONNEL" }),
    colStatus:         pick({ en: "STATUS", vi: "TRẠNG THÁI", es: "ESTADO", fr: "STATUT" }),
    upcomingWaiting:   (up: number, w: number) => pick({ en: `${up} upcoming • ${w} waiting`, vi: `${up} sắp tới • ${w} đang chờ`, es: `${up} próximas • ${w} esperando`, fr: `${up} à venir • ${w} en attente` }),
    viewAllAppts:      pick({ en: "View All Appointments →", vi: "Xem tất cả lịch hẹn →", es: "Ver todas las citas →", fr: "Voir tous les rendez-vous →" }),
    // Inventory
    inventoryAlerts:   pick({ en: "Inventory Alerts", vi: "Cảnh báo tồn kho", es: "Alertas de inventario", fr: "Alertes d'inventaire" }),
    viewInventory:     pick({ en: "View Inventory", vi: "Xem tồn kho", es: "Ver inventario", fr: "Voir l'inventaire" }),
    inventoryHealthy:  pick({ en: "All inventory levels are healthy", vi: "Tất cả mức tồn kho đều ổn", es: "Todos los niveles de inventario están bien", fr: "Tous les niveaux de stock sont bons" }),
    colItem:           pick({ en: "ITEM", vi: "MẶT HÀNG", es: "ARTÍCULO", fr: "ARTICLE" }),
    colCategory:       pick({ en: "CATEGORY", vi: "DANH MỤC", es: "CATEGORÍA", fr: "CATÉGORIE" }),
    colStock:          pick({ en: "STOCK", vi: "TỒN KHO", es: "STOCK", fr: "STOCK" }),
    lowStock:          pick({ en: "Low Stock", vi: "Sắp hết hàng", es: "Poco stock", fr: "Stock faible" }),
    // Salon at a glance
    salonAtAGlance:    pick({ en: "Salon at a Glance", vi: "Tổng quan salon", es: "Salón de un vistazo", fr: "Salon en un coup d'œil" }),
    walkInsToday:      pick({ en: "Walk-ins Today", vi: "Khách vãng lai hôm nay", es: "Clientes sin cita hoy", fr: "Sans rendez-vous aujourd'hui" }),
    avgWaitTime:       pick({ en: "Average Wait Time", vi: "Thời gian chờ TB", es: "Tiempo de espera prom.", fr: "Temps d'attente moy." }),
    occupancyRate:     pick({ en: "Occupancy Rate", vi: "Tỷ lệ lấp đầy", es: "Tasa de ocupación", fr: "Taux d'occupation" }),
    clientRetention:   pick({ en: "Client Retention", vi: "Tỷ lệ giữ khách", es: "Retención de clientes", fr: "Rétention client" }),
    avgTicket:         pick({ en: "Average Ticket", vi: "Hóa đơn TB", es: "Ticket promedio", fr: "Panier moyen" }),
    tipsPct:           pick({ en: "Tips %", vi: "% Tiền tip", es: "% Propinas", fr: "% Pourboires" }),
    minSuffix:         pick({ en: "min", vi: "phút", es: "min", fr: "min" }),
    // Main header
    connectionLost:    pick({ en: "Live connection lost — reconnecting in the background.", vi: "Mất kết nối trực tiếp — đang kết nối lại.", es: "Se perdió la conexión en vivo — reconectando.", fr: "Connexion en direct perdue — reconnexion en cours." }),
    happeningPrefix:   pick({ en: "Here's what's happening at", vi: "Đây là những gì đang diễn ra tại", es: "Esto es lo que está pasando en", fr: "Voici ce qui se passe chez" }),
    happeningSuffix:   pick({ en: " right now.", vi: ".", es: " ahora.", fr: " en ce moment." }),
    yourSalon:         pick({ en: "your salon", vi: "salon của bạn", es: "tu salón", fr: "votre salon" }),
    todaysRevenue:     pick({ en: "Today's Revenue", vi: "Doanh thu hôm nay", es: "Ingresos de hoy", fr: "Revenu du jour" }),
    vsYesterday:       pick({ en: " vs yesterday", vi: " so với hôm qua", es: " vs. ayer", fr: " vs hier" }),
    completedInService:(c: number, i: number) => pick({ en: `${c} completed • ${i} in service`, vi: `${c} hoàn thành • ${i} đang phục vụ`, es: `${c} completado(s) • ${i} en servicio`, fr: `${c} terminé(s) • ${i} en service` }),
    todaysAppts:       pick({ en: "Today's Appointments", vi: "Lịch hẹn hôm nay", es: "Citas de hoy", fr: "Rendez-vous du jour" }),
    newClientsWeek:    pick({ en: "New Clients This Week", vi: "Khách mới tuần này", es: "Nuevos clientes esta semana", fr: "Nouveaux clients cette semaine" }),
    vsLastWeek:        pick({ en: " vs last week", vi: " so với tuần trước", es: " vs. semana pasada", fr: " vs semaine dernière" }),
    viewClients:       pick({ en: "View Clients", vi: "Xem khách hàng", es: "Ver clientes", fr: "Voir les clients" }),
    returningClients:  pick({ en: "Returning Clients", vi: "Khách quay lại", es: "Clientes recurrentes", fr: "Clients fidélisés" }),
    returningRate:     (pct: number) => pick({ en: `${pct}% returning rate`, vi: `${pct}% tỷ lệ quay lại`, es: `${pct}% tasa de retorno`, fr: `${pct}% taux de retour` }),
    apptsCompletedUpcoming: (c: number, u: number) => pick({ en: `${c} completed • ${u} upcoming`, vi: `${c} hoàn thành • ${u} sắp tới`, es: `${c} completada(s) • ${u} próxima(s)`, fr: `${c} terminé(s) • ${u} à venir` }),
    apptsWaitingSuffix: (n: number) => pick({ en: ` • ${n} waiting`, vi: ` • ${n} đang chờ`, es: ` • ${n} esperando`, fr: ` • ${n} en attente` }),
    apptsNoShowSuffix:  (n: number) => pick({ en: ` • ${n} no show`, vi: ` • ${n} vắng mặt`, es: ` • ${n} no asistió`, fr: ` • ${n} absence` }),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function greeting(name: string | null, tz: string, pick: Pick4) {
  const h = getHourInTz(new Date(), tz);
  const period = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const suffix = name ? `, ${name}` : "";
  const vi = period === "morning" ? `Chào buổi sáng${suffix}` : period === "afternoon" ? `Chào buổi chiều${suffix}` : `Chào buổi tối${suffix}`;
  const es = period === "morning" ? `Buenos días${suffix}` : period === "afternoon" ? `Buenas tardes${suffix}` : `Buenas noches${suffix}`;
  const fr = period === "morning" ? `Bonjour${suffix}` : period === "afternoon" ? `Bon après-midi${suffix}` : `Bonsoir${suffix}`;
  return pick({ en: `Good ${period}${suffix}! 👋`, vi: `${vi}! 👋`, es: `${es}! 👋`, fr: `${fr}! 👋` });
}

function statusLabel(status: string, t: ReturnType<typeof buildT>) {
  switch (status) {
    case "completed": return { label: t.completed,      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
    case "started":   return { label: t.inService,      cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };
    case "waiting":   return { label: t.waitingStatus,  cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
    case "no_show":   return { label: t.noShow,          cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
    default:          return { label: t.upcomingStatus, cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" };
  }
}

function formatDuration(mins: number) {
  if (!mins || mins <= 0) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function feedRelativeTime(iso: string, now: Date, t: ReturnType<typeof buildT>): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 5) return t.justNow;
  if (diffSec < 60) return t.secsAgo(diffSec);
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t.minsAgo(diffMin);
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t.hoursAgo(diffHr);
  return format(new Date(iso), "MMM d, h:mm a");
}

function elapsedSince(iso: string, now: Date): string {
  const diffSec = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} />;
}

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ title, to, toLabel = "View all" }: { title: string; to?: string; toLabel?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      {to && (
        <Link to={to} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
          {toLabel} <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ── Card Wrapper ──────────────────────────────────────────────────────────────
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-card border border-border shadow-sm", className)}>
      {children}
    </div>
  );
}

// ── Live Dot ──────────────────────────────────────────────────────────────────
function LiveBadge({ label }: { label?: string }) {
  const { pick } = useLanguage();
  const t = buildT(pick);
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
      </span>
      {label ?? t.live}
    </span>
  );
}

function ConnectionDot({ connected, lastUpdated }: { connected: boolean; lastUpdated: Date | null }) {
  const { pick } = useLanguage();
  const t = buildT(pick);
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        {connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
        <span className={cn("relative inline-flex rounded-full h-2 w-2", connected ? "bg-emerald-500" : "bg-muted-foreground/40")} />
      </span>
      <span className="text-xs text-muted-foreground hidden sm:inline">
        {connected ? lastUpdated ? t.updatedAgo(formatDistanceToNowStrict(lastUpdated, { addSuffix: true })) : t.liveNow : t.reconnecting}
      </span>
      {connected
        ? <Wifi className="w-3 h-3 text-emerald-500 hidden sm:inline" />
        : <WifiOff className="w-3 h-3 text-muted-foreground/40 hidden sm:inline" />}
    </div>
  );
}

// ── Live Clock ────────────────────────────────────────────────────────────────
function LiveClock({ timezone }: { timezone: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [timezone]);
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span>{formatInTz(now, timezone, "MMM d, yyyy")}</span>
      <span className="font-mono font-semibold text-foreground tabular-nums">{formatInTz(now, timezone, "h:mm a")}</span>
    </div>
  );
}

// ── Avatar initials ───────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];
function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function hashColor(name: string | null) {
  const n = name || "";
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function StaffAvatar({ name, url, size = "sm" }: { name: string | null; url?: string | null; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-7 h-7 text-[10px]" : "w-8 h-8 text-xs";
  if (url) return <img src={url} alt={name || ""} className={cn("rounded-full object-cover shrink-0", sz)} />;
  return (
    <div className={cn("rounded-full flex items-center justify-center font-semibold shrink-0", sz, hashColor(name))}>
      {initials(name)}
    </div>
  );
}

// ══ FEED ICON CONFIG ═══════════════════════════════════════════════════════════
const FEED_ICON_CONFIG: Record<string, { icon: React.ElementType; iconColor: string; iconBg: string }> = {
  check_in:          { icon: UserCheck,       iconColor: "text-blue-600",    iconBg: "bg-blue-100" },
  service_completed: { icon: CheckCircle2,    iconColor: "text-emerald-600", iconBg: "bg-emerald-100" },
  payment:           { icon: DollarSign,      iconColor: "text-emerald-600", iconBg: "bg-emerald-100" },
  ai_booking:        { icon: Sparkles,        iconColor: "text-violet-600",  iconBg: "bg-violet-100" },
  walk_in:           { icon: UserPlus,        iconColor: "text-sky-600",     iconBg: "bg-sky-100" },
  vip_arrival:       { icon: Crown,           iconColor: "text-amber-600",   iconBg: "bg-amber-100" },
  review:            { icon: Star,            iconColor: "text-amber-600",   iconBg: "bg-amber-100" },
  new_booking:       { icon: CalendarPlus,    iconColor: "text-indigo-600",  iconBg: "bg-indigo-100" },
  call_answered:     { icon: PhoneCall,       iconColor: "text-cyan-600",    iconBg: "bg-cyan-100" },
  low_stock:         { icon: PackageX,        iconColor: "text-red-600",     iconBg: "bg-red-100" },
};
const FEED_ICON_DEFAULT = { icon: MessageSquareText, iconColor: "text-muted-foreground", iconBg: "bg-muted" };

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

// ── KPI Card (top row) ────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, iconBg, iconColor, title, primary, sub, badge, to, toLabel,
}: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  title: string; primary: React.ReactNode;
  sub?: React.ReactNode; badge?: React.ReactNode;
  to?: string; toLabel?: string;
}) {
  const { pick } = useLanguage();
  const t = buildT(pick);
  const inner = (
    <div className="rounded-2xl bg-card border border-border p-5 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 h-full flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        {badge}
      </div>
      <div className="flex-1">
        <p className="text-xs font-medium text-muted-foreground mb-0.5">{title}</p>
        <div className="text-3xl font-bold text-foreground leading-none">{primary}</div>
      </div>
      {sub && <div className="mt-auto text-xs text-muted-foreground">{sub}</div>}
      {to && (
        <Link to={to} className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 mt-1 w-fit">
          {toLabel ?? t.viewDetails} <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
  return to ? <div className="h-full">{inner}</div> : <div className="h-full">{inner}</div>;
}

// ── What's Happening Right Now ────────────────────────────────────────────────
function WhatsHappeningNow({ data, isLoading }: { data: DashboardData | null; isLoading: boolean }) {
  const [clock, setClock] = useState(() => new Date());
  const { pick } = useLanguage();
  const t = buildT(pick);
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const inService = data?.schedule.filter((a) => a.status === "started") ?? [];
  const waiting = data?.schedule.filter((a) => a.status === "waiting") ?? [];
  const working = data?.today.team.working ?? 0;
  const lateAppts = data?.schedule.filter((a) => {
    if (a.status !== "started") return false;
    if (!a.startedAt) return false;
    const elapsed = (clock.getTime() - new Date(a.startedAt).getTime()) / 60000;
    return elapsed > (a.duration || 60);
  }) ?? [];

  const rows = [
    {
      icon: Users,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      label: t.clientsInSalon(inService.length),
      count: inService.length,
      to: "/calendar",
      toLabel: t.viewLiveActivity,
      live: true,
    },
    {
      icon: Clock,
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      label: t.clientsWaiting(waiting.length),
      count: waiting.length,
      to: "/calendar",
      toLabel: t.viewWaitList,
    },
    {
      icon: Scissors,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      label: t.stylistsWorking(working),
      count: working,
      to: "/payouts/contractors",
      toLabel: t.viewTeamSchedule,
    },
    {
      icon: AlertTriangle,
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
      label: t.apptsRunningLate(lateAppts.length),
      count: lateAppts.length,
      to: "/calendar",
      toLabel: t.viewDetailsLower,
      hidden: lateAppts.length === 0,
    },
  ];

  return (
    <Card className="overflow-hidden h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">{t.whatsHappening}</h2>
        <LiveBadge />
      </div>
      {isLoading ? (
        <div className="p-4 space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="p-4 space-y-1">
          {rows.filter((r) => !r.hidden).map((row, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/30 transition-colors group">
              <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", row.iconBg)}>
                <row.icon className={cn("w-4 h-4", row.iconColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{row.label}</p>
                {row.to && (
                  <Link to={row.to} className="text-xs text-primary hover:underline flex items-center gap-0.5 w-fit">
                    {row.toLabel} <ChevronRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}
          {rows.every((r) => r.hidden || r.count === 0) && (
            <div className="text-center py-6 text-sm text-muted-foreground">{t.allQuiet}</div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Team Member Status ────────────────────────────────────────────────────────

type TurnTechDashboard = {
  id: number;
  name: string;
  avatarUrl?: string | null;
  clockedIn: boolean;
  currentStatus: "available" | "busy" | "on_break";
  turnPosition?: number | null;
  turnCount?: number;
};

type StaffStatusEntry = {
  id: number | null;
  name: string;
  avatarUrl: string | null;
  currentStatus: "available" | "busy" | "on_break";
  turnPosition?: number | null;
  turnCount?: number;
  apptRef: { startedAt: string | null; duration: number } | null;
};

function formatTimerSecs(totalSecs: number): string {
  const abs = Math.abs(totalSecs);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const sign = totalSecs < 0 ? "-" : "";
  if (h > 0) return `${sign}${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${sign}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function TeamMemberTimer({
  apptRef,
  status,
}: {
  apptRef: StaffStatusEntry["apptRef"];
  status: StaffStatusEntry["currentStatus"];
}) {
  const mountRef = useRef(Date.now());
  const [, setTick] = useState(0);

  // Reset count-up baseline whenever status transitions away from busy
  // so the elapsed timer restarts at 0 for the new Available/Break phase.
  useEffect(() => {
    if (status !== "busy") {
      mountRef.current = Date.now();
      setTick(0);
    }
  }, [status]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();

  if (status === "busy") {
    // Count DOWN from ticket duration. Red when negative.
    const durSecs = (apptRef?.duration ?? 0) * 60;
    const elapsed = apptRef?.startedAt
      ? Math.floor((now - new Date(apptRef.startedAt).getTime()) / 1000)
      : 0;
    const remaining = durSecs - elapsed;
    return (
      <span className={cn(
        "font-mono text-xs font-bold tabular-nums",
        remaining < 0 ? "text-red-500" : "text-foreground",
      )}>
        {formatTimerSecs(remaining)}
      </span>
    );
  }

  // Available / Break: count UP from 1s. Orange when elapsed > ticket duration.
  const elapsed = Math.max(1, Math.floor((now - mountRef.current) / 1000));
  const durSecs = apptRef ? (apptRef.duration ?? 0) * 60 : null;
  const over = durSecs !== null && durSecs > 0 && elapsed > durSecs;
  return (
    <span className={cn(
      "font-mono text-xs font-bold tabular-nums",
      over ? "text-orange-500" : "text-foreground",
    )}>
      {formatTimerSecs(elapsed)}
    </span>
  );
}

function StatusBadge({ status }: { status: StaffStatusEntry["currentStatus"] }) {
  const { pick } = useLanguage();
  const t = buildT(pick);
  if (status === "busy") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
        {t.busy}
      </span>
    );
  }
  if (status === "on_break") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
        {t.onBreak}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
      {t.available}
    </span>
  );
}

function TeamMemberStatus({
  schedule,
  isLoading,
}: {
  schedule: DashboardData["schedule"];
  isLoading: boolean;
}) {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const flags = useFeatureFlags();
  const turnEnabled = flags.turnSystem;
  const { pick } = useLanguage();
  const t = buildT(pick);

  const { data: turnData, isLoading: turnLoading } = useQuery<{
    eligibleTechnicians: TurnTechDashboard[];
    technicians: TurnTechDashboard[];
  }>({
    queryKey: ["/api/turn/eligibility", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/turn/eligibility?storeId=${storeId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch turn eligibility");
      return res.json();
    },
    enabled: !!storeId && turnEnabled,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  // Map staffId → most relevant appointment (prefer "started" over others)
  const apptByStaffId = useMemo(() => {
    const map = new Map<number, DashboardData["schedule"][0]>();
    for (const a of schedule) {
      if (!a.staffId) continue;
      const cur = map.get(a.staffId);
      if (!cur || a.status === "started") map.set(a.staffId, a);
    }
    return map;
  }, [schedule]);

  // Map staffName → most relevant appointment (fallback for non-turn stores)
  const apptByName = useMemo(() => {
    const map = new Map<string, DashboardData["schedule"][0]>();
    for (const a of schedule) {
      if (!a.staffName) continue;
      const cur = map.get(a.staffName);
      if (!cur || a.status === "started") map.set(a.staffName, a);
    }
    return map;
  }, [schedule]);

  const entries = useMemo((): StaffStatusEntry[] => {
    if (turnEnabled) {
      // When turn system is on, only use turn eligibility data — never fall back
      // to non-turn schedule derivation which would silently misrepresent statuses.
      if (!turnData) return [];
      return (turnData.technicians ?? [])
        .filter((t) => t.clockedIn)
        .map((t) => {
          const a = apptByStaffId.get(t.id) ?? null;
          return {
            id: t.id,
            name: t.name,
            avatarUrl: t.avatarUrl ?? null,
            currentStatus: t.currentStatus,
            turnPosition: t.turnPosition,
            turnCount: t.turnCount,
            apptRef: a ? { startedAt: a.startedAt, duration: a.duration } : null,
          };
        });
    }
    // Non-turn: one entry per unique staff member from today's schedule
    const seen = new Set<string>();
    return schedule
      .filter((a) => {
        if (!a.staffName || seen.has(a.staffName)) return false;
        seen.add(a.staffName);
        return true;
      })
      .map((a) => {
        const latest = apptByName.get(a.staffName!);
        return {
          id: a.staffId,
          name: a.staffName!,
          avatarUrl: a.staffAvatarThumbUrl ?? null,
          currentStatus: latest?.status === "started" ? "busy" : "available",
          apptRef: latest ? { startedAt: latest.startedAt, duration: latest.duration } : null,
        };
      });
  }, [turnEnabled, turnData, schedule, apptByStaffId, apptByName]);

  const cardLoading = isLoading || (turnEnabled && turnLoading && !turnData);

  const busyCount = entries.filter((e) => e.currentStatus === "busy").length;
  const availCount = entries.filter((e) => e.currentStatus === "available").length;
  const breakCount = entries.filter((e) => e.currentStatus === "on_break").length;

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">{t.teamMemberStatus}</h2>
        <LiveBadge />
      </div>

      {cardLoading ? (
        <div className="p-4 space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <Users className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">
            {turnEnabled ? t.noneClockedIn : t.noneOnFloor}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {entries.map((entry) => (
            <div
              key={entry.id ?? entry.name}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
            >
              {/* Avatar */}
              <StaffAvatar name={entry.name} url={entry.avatarUrl} size="md" />

              {/* Name + turn info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{entry.name}</p>
                {turnEnabled && (
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {entry.turnPosition != null && entry.turnPosition < 999 && (
                      <span className="text-[10px] text-muted-foreground leading-none">
                        <span className="font-semibold text-foreground">
                          #{(entry.turnPosition as number) + 1}
                        </span>{" "}
                        {t.turnSuffix}
                      </span>
                    )}
                    {(entry.turnCount ?? 0) > 0 && (
                      <span className="text-[10px] text-muted-foreground leading-none">
                        {t.completedSuffix(entry.turnCount ?? 0)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Status badge + timer stacked on the right */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusBadge status={entry.currentStatus} />
                <TeamMemberTimer apptRef={entry.apptRef} status={entry.currentStatus} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!cardLoading && entries.length > 0 && (
        <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground flex items-center justify-between">
          <span>
            {busyCount > 0 && t.busyCount(busyCount)}
            {busyCount > 0 && availCount > 0 && " · "}
            {availCount > 0 && t.availCount(availCount)}
            {breakCount > 0 && ` · ${t.breakCount(breakCount)}`}
          </span>
          <Link to="/calendar" className="text-primary hover:underline font-medium">
            {t.viewCalendarArrow}
          </Link>
        </div>
      )}
    </Card>
  );
}

// ── Today's Financial Summary ─────────────────────────────────────────────────
function TodayFinancials({ data, isLoading }: { data: DashboardData | null; isLoading: boolean }) {
  const fin = data?.todayFinancials;
  const { pick } = useLanguage();
  const t = buildT(pick);
  const paymentConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    card:      { label: t.payCard,     icon: CreditCard, color: "text-blue-500" },
    cash:      { label: t.payCash,     icon: Banknote,   color: "text-emerald-500" },
    gift_card: { label: t.payGiftCard, icon: Gift,       color: "text-violet-500" },
  };

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">{t.todayFinancials}</h2>
        <Link to="/salon-earnings" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          {t.viewReport} <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
      ) : (
        <div className="flex-1 p-4 space-y-0">
          {/* Revenue lines */}
          {[
            { key: "total",   label: t.totalRevenue,  value: fin?.totalRevenue ?? 0, bold: false },
            { key: "service", label: t.serviceSales,  value: fin?.serviceSales ?? 0, bold: false },
            { key: "product", label: t.productSales,  value: fin?.productSales ?? 0, bold: false },
            { key: "tips",    label: t.tips,          value: fin?.tips ?? 0,         bold: false },
          ].map((row) => (
            <div key={row.key} className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className={cn("text-sm font-semibold text-foreground")}>
                <AnimatedNumber value={row.value} format="currency" />
              </span>
            </div>
          ))}

          {/* Total payments */}
          <div className="flex items-center justify-between py-2.5 border-b border-border">
            <span className="text-sm font-semibold text-foreground">{t.totalPayments}</span>
            <span className="text-sm font-bold text-foreground">
              <AnimatedNumber value={fin?.totalPayments ?? 0} format="currency" />
            </span>
          </div>

          {/* By method */}
          <div className="pt-1 pb-1 space-y-1">
            {Object.entries(fin?.byMethod ?? {})
              .filter(([k]) => k in paymentConfig)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([key, amount]) => {
                const cfg = paymentConfig[key];
                if (!cfg) return null;
                return (
                  <div key={key} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <cfg.icon className={cn("w-3.5 h-3.5", cfg.color)} />
                      <span className="text-xs text-muted-foreground">{cfg.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-foreground">
                      <AnimatedNumber value={amount as number} format="currency" />
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Outstanding */}
          <div className="flex items-center justify-between py-2.5 border-t border-border mt-1">
            <span className="text-sm text-muted-foreground">{t.outstandingBalance}</span>
            <span className={cn(
              "text-sm font-bold",
              (fin?.outstandingBalance ?? 0) > 0 ? "text-red-600" : "text-emerald-600 dark:text-emerald-400",
            )}>
              <AnimatedNumber value={fin?.outstandingBalance ?? 0} format="currency" />
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Top Services Today ────────────────────────────────────────────────────────
function TopServicesToday({ services, isLoading }: { services: DashboardData["topServices"]; isLoading: boolean }) {
  const { pick } = useLanguage();
  const t = buildT(pick);
  return (
    <Card className="overflow-hidden h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">{t.topServicesToday}</h2>
        <Link to="/services" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          {t.viewAllServices} <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : services.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <BarChart3 className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">{t.noServicesYet}</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {services.map((svc) => (
            <div key={svc.rank} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
              <span className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                svc.rank === 1 ? "bg-amber-100 text-amber-700" :
                svc.rank === 2 ? "bg-slate-100 text-slate-600" :
                svc.rank === 3 ? "bg-orange-100 text-orange-600" :
                "bg-muted text-muted-foreground",
              )}>{svc.rank}</span>
              <span className="flex-1 text-sm font-medium text-foreground truncate">{svc.name}</span>
              <span className="text-sm font-semibold text-foreground shrink-0">
                <AnimatedNumber value={svc.revenue} format="currency" />
              </span>
              <span className="text-xs text-muted-foreground shrink-0 w-8 text-right">({svc.count})</span>
            </div>
          ))}
        </div>
      )}
      {!isLoading && (
        <div className="px-4 py-2 border-t border-border/50 text-[10px] text-muted-foreground">
          {t.revenueServicesLegend}
        </div>
      )}
    </Card>
  );
}

// ── Team Performance Today ────────────────────────────────────────────────────
function TeamPerformanceToday({ team, isLoading }: { team: DashboardData["teamPerformance"]; isLoading: boolean }) {
  const { pick } = useLanguage();
  const t = buildT(pick);
  return (
    <Card className="overflow-hidden h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">{t.teamPerformanceToday}</h2>
        <Link to="/commission-report" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          {t.viewTeamReport} <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : team.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <Users2 className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">{t.noTeamDataYet}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 bg-muted/30 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <span>{t.colName}</span>
            <span className="text-right">{t.colSales}</span>
            <span className="text-right">{t.colAppts}</span>
            <span className="text-right w-16">{t.colAvgTicket}</span>
          </div>
          <div className="divide-y divide-border">
            {team.map((member, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-3 hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <StaffAvatar name={member.name} size="sm" />
                  <span className="text-sm font-medium text-foreground truncate">{member.name.split(" ")[0]}</span>
                </div>
                <span className="text-sm font-semibold text-foreground text-right">
                  <AnimatedNumber value={member.sales} format="currency" />
                </span>
                <span className="text-sm font-semibold text-foreground text-right">{member.appointments}</span>
                <span className="text-sm font-semibold text-foreground text-right w-16">
                  <AnimatedNumber value={member.avgTicket} format="currency" />
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ── Client Loyalty Snapshot ───────────────────────────────────────────────────
function ClientLoyaltySnapshot({ snapshot, isLoading }: { snapshot: DashboardData["clientLoyaltySnapshot"] | undefined; isLoading: boolean }) {
  const { pick } = useLanguage();
  const t = buildT(pick);
  const rows = [
    { icon: Crown,      iconBg: "bg-amber-100",   iconColor: "text-amber-600",   label: t.vipClients,     value: snapshot?.vipClients ?? 0 },
    { icon: Users,      iconBg: "bg-emerald-100",  iconColor: "text-emerald-600", label: t.regulars,       value: snapshot?.regulars ?? 0 },
    { icon: UserPlus,   iconBg: "bg-blue-100",     iconColor: "text-blue-600",    label: t.newThisMonth,   value: snapshot?.newThisMonth ?? 0 },
    { icon: ShieldAlert,iconBg: "bg-red-100",      iconColor: "text-red-600",     label: t.clientsAtRisk,  value: snapshot?.atRisk ?? 0 },
  ];

  return (
    <Card className="overflow-hidden h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">{t.clientLoyaltySnapshot}</h2>
        <Link to="/customers" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          {t.viewLoyalty} <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", row.iconBg)}>
                <row.icon className={cn("w-4 h-4", row.iconColor)} />
              </div>
              <span className="flex-1 text-sm text-foreground">{row.label}</span>
              <span className="text-lg font-bold text-foreground">
                <AnimatedNumber value={row.value} />
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Recent Activity ───────────────────────────────────────────────────────────
function RecentActivity({ items, isLoading, connected }: { items: DashboardData["recentActivity"]; isLoading: boolean; connected: boolean }) {
  const [clock, setClock] = useState(() => new Date());
  const { pick } = useLanguage();
  const t = buildT(pick);
  useEffect(() => {
    const intervalId = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(intervalId);
  }, []);

  const seenIdsRef = useRef<Set<number>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isLoading) return undefined;
    const incoming = items.map((i) => i.id);
    const newlySeen = incoming.filter((id) => !seenIdsRef.current.has(id));
    incoming.forEach((id) => seenIdsRef.current.add(id));
    if (newlySeen.length > 0 && seenIdsRef.current.size > newlySeen.length) {
      setFreshIds(new Set(newlySeen));
      const timeoutId = setTimeout(() => setFreshIds(new Set()), 2500);
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [items, isLoading]);

  useEffect(() => {
    if (!isLoading && seenIdsRef.current.size === 0) items.forEach((i) => seenIdsRef.current.add(i.id));
  }, [isLoading, items]);

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className={cn("w-3.5 h-3.5 text-primary", connected && "animate-pulse")} />
          <h2 className="text-sm font-bold text-foreground">{t.recentActivity}</h2>
        </div>
        <Link to="/activity" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          {t.viewAllActivity} <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <Radio className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">{t.nothingYetToday}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-border max-h-64">
          {items.map((item) => {
            const cfg = FEED_ICON_CONFIG[item.eventType] || FEED_ICON_DEFAULT;
            const Icon = cfg.icon;
            const isFresh = freshIds.has(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 transition-colors duration-700",
                  isFresh ? "bg-primary/[0.06] animate-in slide-in-from-top-2 fade-in duration-300" : "bg-transparent",
                )}
              >
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5", cfg.iconBg)}>
                  <Icon className={cn("w-3.5 h-3.5", cfg.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-snug">{item.message}</p>
                  <span className="text-[10px] text-muted-foreground">{feedRelativeTime(item.createdAt, clock, t)}</span>
                </div>
                {item.amount != null && (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                    ${item.amount.toFixed(2)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Reminders & Alerts ────────────────────────────────────────────────────────
function RemindersAlerts({ items, isLoading }: { items: DashboardData["needsAttention"]; isLoading: boolean }) {
  const { pick } = useLanguage();
  const t = buildT(pick);
  const alertIcon = (priority: string) => {
    if (priority === "high") return { Icon: AlertCircle, color: "text-red-600", bg: "bg-red-100" };
    if (priority === "medium") return { Icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-100" };
    return { Icon: Bell, color: "text-blue-600", bg: "bg-blue-100" };
  };
  const linkConfig: Record<string, string> = {
    lost_clients: "/customers",
    no_shows: "/calendar",
    waiting: "/calendar",
  };

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">{t.remindersAlerts}</h2>
        <Link to="/calendar" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          {t.viewAll} <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-500/50 mb-2" />
          <p className="text-sm text-muted-foreground">{t.allClear}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-border max-h-64">
          {items.map((item, i) => {
            const { Icon, color, bg } = alertIcon(item.priority);
            return (
              <Link
                key={i}
                to={linkConfig[item.type] || "/calendar"}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group"
              >
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", bg)}>
                  <Icon className={cn("w-3.5 h-3.5", color)} />
                </div>
                <p className="flex-1 text-xs text-foreground leading-snug">{item.label}</p>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── AI Receptionist ───────────────────────────────────────────────────────────
function AiReceptionistCard({ ai, isLoading }: { ai: DashboardData["aiReceptionist"] | undefined; isLoading: boolean }) {
  const { pick } = useLanguage();
  const t = buildT(pick);
  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
          </div>
          <h2 className="text-sm font-bold text-foreground">{t.aiReceptionist}</h2>
        </div>
        <LiveBadge />
      </div>
      {isLoading ? (
        <div className="p-4 space-y-3"><Skeleton className="h-8" /><Skeleton className="h-16" /></div>
      ) : (
        <div className="flex-1 p-4 flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">{t.aiLiveDesc}</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "calls",  label: t.todaysCalls, value: ai?.todayCalls ?? 0 },
              { key: "booked", label: t.booked,      value: ai?.booked ?? 0 },
              { key: "missed", label: t.missed,      value: ai?.missed ?? 0 },
            ].map((stat) => (
              <div key={stat.key} className="rounded-xl bg-muted/40 border border-border/50 p-3 text-center">
                <p className="text-xl font-bold text-foreground"><AnimatedNumber value={stat.value} /></p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{stat.label}</p>
              </div>
            ))}
          </div>
          <Link
            to="/manage/ai-receptionist"
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted/40 transition-colors mt-auto"
          >
            <PhoneCall className="w-4 h-4" />
            {t.viewCallLogs}
          </Link>
        </div>
      )}
    </Card>
  );
}

// ── Upcoming Appointments ─────────────────────────────────────────────────────
function UpcomingAppointments({ schedule, isLoading }: { schedule: DashboardData["schedule"]; isLoading: boolean }) {
  const { pick } = useLanguage();
  const t = buildT(pick);
  const upcoming = schedule.filter((a) => ["confirmed", "pending", "waiting"].includes(a.status));
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">{t.upcomingAppts}</h2>
        <Link to="/calendar" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          {t.viewCalendar} <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : upcoming.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center px-4">
          <Calendar className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">{t.noUpcomingAppts}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[80px_1fr_1fr_1fr_100px] gap-2 px-4 py-2 bg-muted/30 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <span>{t.colTime}</span><span>{t.colClient}</span><span>{t.colService}</span><span>{t.colStaff}</span><span className="text-right">{t.colStatus}</span>
          </div>
          <div className="divide-y divide-border">
            {upcoming.slice(0, 5).map((apt) => {
              const { label, cls } = statusLabel(apt.status, t);
              return (
                <div key={apt.id} className="grid grid-cols-[80px_1fr_1fr_1fr_100px] gap-2 items-center px-4 py-2.5 hover:bg-muted/20 transition-colors">
                  <span className="text-xs font-mono text-muted-foreground">{format(new Date(apt.time), "h:mm a")}</span>
                  <span className="text-xs font-medium text-foreground truncate">{apt.customerName}</span>
                  <span className="text-xs text-muted-foreground truncate">{apt.serviceName}</span>
                  <span className="text-xs text-muted-foreground truncate">{apt.staffName || "—"}</span>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full text-right justify-self-end whitespace-nowrap", cls)}>{label}</span>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2.5 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
            <span>{t.upcomingWaiting(upcoming.length, schedule.filter((a) => a.status === "waiting").length)}</span>
            <Link to="/calendar" className="text-primary hover:underline font-medium">{t.viewAllAppts}</Link>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Inventory Alerts ──────────────────────────────────────────────────────────
function InventoryAlertsCard({ alerts, isLoading }: { alerts: DashboardData["inventoryAlerts"]; isLoading: boolean }) {
  const { pick } = useLanguage();
  const t = buildT(pick);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">{t.inventoryAlerts}</h2>
        <Link to="/products" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          {t.viewInventory} <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center px-4">
          <Package className="w-8 h-8 text-emerald-500/50 mb-2" />
          <p className="text-sm text-muted-foreground">{t.inventoryHealthy}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 bg-muted/30 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <span>{t.colItem}</span><span>{t.colCategory}</span><span className="text-right">{t.colStock}</span><span className="text-right">{t.colStatus}</span>
          </div>
          <div className="divide-y divide-border">
            {alerts.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-2.5 hover:bg-muted/20 transition-colors">
                <span className="text-xs font-medium text-foreground truncate">{item.name}</span>
                <span className="text-xs text-muted-foreground">{item.category || "—"}</span>
                <span className="text-xs font-semibold text-foreground text-right">{item.stock}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 whitespace-nowrap">{t.lowStock}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ── Salon at a Glance ─────────────────────────────────────────────────────────
function SalonAtAGlance({ glance, isLoading }: { glance: DashboardData["glanceStats"] | undefined; isLoading: boolean }) {
  const { pick } = useLanguage();
  const t = buildT(pick);
  const stats = [
    { key: "walkins",   label: t.walkInsToday,    value: glance?.walkInsToday ?? 0,       format: "number" as const },
    { key: "wait",      label: t.avgWaitTime,     value: glance?.avgWaitMinutes ?? 0,     format: "time" as const },
    { key: "occupancy", label: t.occupancyRate,   value: glance?.occupancyPct ?? 0,        format: "pct" as const },
    { key: "retention", label: t.clientRetention, value: glance?.clientRetentionPct ?? 0, format: "pct" as const },
    { key: "avgTicket", label: t.avgTicket,       value: glance?.avgTicket ?? 0,           format: "currency" as const },
    { key: "tipsPct",   label: t.tipsPct,         value: glance?.tipsPct ?? 0,             format: "pct1" as const },
  ];

  function renderValue(v: number, f: string) {
    if (f === "currency") return <AnimatedNumber value={v} format="currency" />;
    if (f === "pct")  return <>{v}%</>;
    if (f === "pct1") return <>{v.toFixed(1)}%</>;
    if (f === "time") return <>{v} {t.minSuffix}</>;
    return <AnimatedNumber value={v} />;
  }

  return (
    <div className="rounded-2xl bg-primary/5 border border-primary/20 px-6 py-5">
      <h2 className="text-xs font-bold text-primary uppercase tracking-widest mb-4">{t.salonAtAGlance}</h2>
      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 text-center">
          {stats.map((s, i) => (
            <div key={i}>
              <p className="text-xl font-bold text-foreground">{renderValue(s.value, s.format)}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function OwnerDashboard() {
  const { user } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { pick } = useLanguage();
  const t = buildT(pick);
  const storeId = selectedStore?.id;
  const timezone = selectedStore?.timezone || "UTC";
  const storeName = selectedStore?.name || t.yourSalon;

  const { data, connected, lastUpdated, isError } = useDashboardWs(storeId);

  const firstName = user?.firstName || null;
  const isLoading = !data;

  // Derived data with fallbacks
  const today = data?.today;
  const schedule = data?.schedule ?? [];
  const newClients = data?.newClientsThisWeek;
  const topServices = data?.topServices ?? [];
  const teamPerf = data?.teamPerformance ?? [];
  const aiReceptionist = data?.aiReceptionist;
  const inventoryAlerts = data?.inventoryAlerts ?? [];
  const needsAttention = data?.needsAttention ?? [];
  const recentActivity = data?.recentActivity ?? [];
  const glanceStats = data?.glanceStats;
  const loyaltySnapshot = data?.clientLoyaltySnapshot;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {isError && !connected && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-5 py-3 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400 font-medium">{t.connectionLost}</p>
          </div>
        )}

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{greeting(firstName, timezone, pick)}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t.happeningPrefix} <span className="font-medium text-foreground">{storeName}</span>{t.happeningSuffix}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <LiveClock timezone={timezone} />
            <ConnectionDot connected={connected} lastUpdated={lastUpdated} />
            <NotificationBell />
          </div>
        </div>

        {/* ── ROW 1: 4 KPI cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Today's Revenue */}
          <KpiCard
            icon={DollarSign} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600 dark:text-emerald-400"
            title={t.todaysRevenue}
            primary={isLoading ? <Skeleton className="h-8 w-24 inline-block" /> : <AnimatedNumber value={today?.revenue ?? 0} format="currency" />}
            badge={!isLoading && today?.revenueDiff !== undefined ? (
              <span className={cn("flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full",
                today.revenueDiff >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600")}>
                {today.revenueDiff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <AnimatedNumber value={Math.abs(today.revenueDiff)} format="currency" duration={600} />
                {t.vsYesterday}
              </span>
            ) : undefined}
            sub={<span>{t.completedInService(today?.appointments?.completed ?? 0, today?.appointments?.inService ?? 0)}</span>}
            to="/salon-earnings" toLabel={t.viewDetails}
          />

          {/* Today's Appointments */}
          <KpiCard
            icon={Calendar} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600 dark:text-blue-400"
            title={t.todaysAppts}
            primary={isLoading ? <Skeleton className="h-8 w-16 inline-block" /> : <AnimatedNumber value={today?.totalAppointments ?? 0} />}
            sub={isLoading ? undefined : (
              <span>
                {t.apptsCompletedUpcoming(today?.appointments?.completed ?? 0, today?.appointments?.upcoming ?? 0)}
                {(today?.appointments?.waiting ?? 0) > 0 && t.apptsWaitingSuffix(today?.appointments?.waiting ?? 0)}
                {(today?.appointments?.noShow ?? 0) > 0 && t.apptsNoShowSuffix(today?.appointments?.noShow ?? 0)}
              </span>
            )}
            to="/calendar" toLabel={t.viewCalendar}
          />

          {/* New Clients This Week */}
          <KpiCard
            icon={Users} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600 dark:text-violet-400"
            title={t.newClientsWeek}
            primary={isLoading ? <Skeleton className="h-8 w-16 inline-block" /> : <AnimatedNumber value={newClients?.count ?? 0} />}
            badge={!isLoading && newClients !== undefined ? (
              <span className={cn("flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full",
                (newClients.vsLastWeek ?? 0) >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600")}>
                {(newClients.vsLastWeek ?? 0) >= 0 ? "+" : ""}{newClients.vsLastWeek}{t.vsLastWeek}
              </span>
            ) : undefined}
            to="/customers" toLabel={t.viewClients}
          />

          {/* Returning Clients */}
          <KpiCard
            icon={Users2} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600 dark:text-amber-400"
            title={t.returningClients}
            primary={isLoading ? <Skeleton className="h-8 w-16 inline-block" /> : <AnimatedNumber value={data?.clientLoyalty?.returningClients ?? 0} />}
            sub={!isLoading ? <span>{t.returningRate(data?.clientLoyalty?.retentionPct ?? 0)}</span> : undefined}
            to="/customers" toLabel={t.viewLoyalty}
          />
        </div>

        {/* ── ROW 2: What's Happening | Schedule | Financials ──────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{ minHeight: 340 }}>
          <WhatsHappeningNow data={data} isLoading={isLoading} />
          <TeamMemberStatus schedule={schedule} isLoading={isLoading} />
          <TodayFinancials data={data} isLoading={isLoading} />
        </div>

        {/* ── ROW 3: Top Services | Team | Client Loyalty ──────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <TopServicesToday services={topServices} isLoading={isLoading} />
          <TeamPerformanceToday team={teamPerf} isLoading={isLoading} />
          <ClientLoyaltySnapshot snapshot={loyaltySnapshot} isLoading={isLoading} />
        </div>

        {/* ── ROW 4: Recent Activity | Alerts | AI Receptionist ────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{ minHeight: 280 }}>
          <RecentActivity items={recentActivity} isLoading={isLoading} connected={connected} />
          <RemindersAlerts items={needsAttention} isLoading={isLoading} />
          <AiReceptionistCard ai={aiReceptionist} isLoading={isLoading} />
        </div>

        {/* ── ROW 5: Upcoming Appointments | Inventory Alerts ──────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <UpcomingAppointments schedule={schedule} isLoading={isLoading} />
          <InventoryAlertsCard alerts={inventoryAlerts} isLoading={isLoading} />
        </div>

        {/* ── ROW 6: Salon at a Glance (full width) ────────────────────── */}
        <SalonAtAGlance glance={glanceStats} isLoading={isLoading} />

      </div>
    </AppLayout>
  );
}
