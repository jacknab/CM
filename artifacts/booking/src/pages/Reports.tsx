import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSelectedStore } from "@/hooks/use-store";
import { useAppointments } from "@/hooks/use-appointments";
import { useStaffList } from "@/hooks/use-staff";
import { useLanguage } from "@/hooks/use-language";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  DollarSign, Calendar, Users, Scissors, TrendingUp,
  ArrowUpRight, ArrowDownRight, Printer, UserCheck, UserX, AlertCircle, Download, FileText,
  Clock, ChevronRight, X as XIcon, Timer,
} from "lucide-react";
import {
  format, subDays, startOfDay, eachDayOfInterval,
  startOfMonth, eachMonthOfInterval, subMonths,
} from "date-fns";
import type { AppointmentWithDetails } from "@shared/schema";
import { cn } from "@/lib/utils";

const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"];

const STATUS_COLORS: Record<string, string> = {
  "Completed": "#22c55e",
  "Cancelled": "#ef4444",
  "No-Show":   "#f59e0b",
  "Pending":   "#6366f1",
};

type Range = "7d" | "30d" | "90d" | "12m";

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({
  title, value, sub, icon: Icon, trend,
}: {
  title: string; value: string; sub?: string;
  icon: React.ElementType; trend?: number;
}) {
  const up = trend !== undefined && trend >= 0;
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="rounded-full bg-primary/10 p-2">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 mt-3 text-xs font-medium ${up ? "text-green-600" : "text-red-500"}`}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const navigate = useNavigate();
  const { selectedStore } = useSelectedStore();
  const { pick } = useLanguage();
  const [range, setRange] = useState<Range>("30d");
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);

  const { data: allAppointments = [] } = useAppointments();
  const { data: staffList = [] } = useStaffList();
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/customers?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) return [];
      const raw = await res.json();
      return Array.isArray(raw) ? raw : [];
    },
    enabled: !!selectedStore,
  });
  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["/api/services", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/services?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) return [];
      const raw = await res.json();
      return Array.isArray(raw) ? raw : [];
    },
    enabled: !!selectedStore,
  });

  // ── Translations ──────────────────────────────────────────────────────────
  const t = {
    title:           pick({ en: "Reports",                          vi: "Báo Cáo",                               es: "Informes",                              fr: "Rapports" }),
    subtitle:        pick({ en: "Business performance across all key metrics", vi: "Hiệu suất kinh doanh trên tất cả chỉ số", es: "Rendimiento del negocio en todas las métricas", fr: "Performance de l'activité sur tous les indicateurs" }),
    last7d:          pick({ en: "Last 7 Days",                      vi: "7 Ngày Qua",                            es: "Últimos 7 Días",                         fr: "7 Derniers Jours" }),
    last30d:         pick({ en: "Last 30 Days",                     vi: "30 Ngày Qua",                           es: "Últimos 30 Días",                        fr: "30 Derniers Jours" }),
    last90d:         pick({ en: "Last 90 Days",                     vi: "90 Ngày Qua",                           es: "Últimos 90 Días",                        fr: "90 Derniers Jours" }),
    last12m:         pick({ en: "Last 12 Months",                   vi: "12 Tháng Qua",                          es: "Últimos 12 Meses",                       fr: "12 Derniers Mois" }),
    print:           pick({ en: "Print",                            vi: "In",                                    es: "Imprimir",                              fr: "Imprimer" }),
    exportCsv:       pick({ en: "Export CSV",                       vi: "Xuất CSV",                              es: "Exportar CSV",                          fr: "Exporter CSV" }),

    // Tabs
    tabRevenue:      pick({ en: "Revenue",                          vi: "Doanh Thu",                             es: "Ingresos",                              fr: "Revenus" }),
    tabAppointments: pick({ en: "Appointments",                     vi: "Lịch Hẹn",                              es: "Citas",                                 fr: "Rendez-vous" }),
    tabStaff:        pick({ en: "Staff",                            vi: "Nhân Viên",                             es: "Personal",                              fr: "Équipe" }),
    tabServices:     pick({ en: "Services",                         vi: "Dịch Vụ",                               es: "Servicios",                             fr: "Services" }),
    tabCustomers:    pick({ en: "Clients",                          vi: "Khách Hàng",                            es: "Clientes",                              fr: "Clients" }),
    tabTax:          pick({ en: "Tax Summary",                      vi: "Tóm Tắt Thuế",                          es: "Resumen Fiscal",                        fr: "Résumé Fiscal" }),

    // Revenue tab
    totalRevenue:    pick({ en: "Total Revenue",                    vi: "Tổng Doanh Thu",                        es: "Ingresos Totales",                      fr: "Revenus Totaux" }),
    avgDailyRevenue: pick({ en: "Avg Daily Revenue",                vi: "Doanh Thu TB/Ngày",                     es: "Promedio Diario",                       fr: "Revenus Moy./Jour" }),
    totalTips:       pick({ en: "Total Tips",                       vi: "Tổng Tiền Tip",                         es: "Propinas Totales",                      fr: "Pourboires Totaux" }),
    avgTicket:       pick({ en: "Avg Ticket",                       vi: "Trung Bình Vé",                         es: "Ticket Promedio",                       fr: "Ticket Moyen" }),
    perDayInPeriod:  pick({ en: "per day in period",               vi: "mỗi ngày trong kỳ",                     es: "por día en el período",                 fr: "par jour dans la période" }),
    completedAppts:  pick({ en: "completed appts",                  vi: "lịch hẹn hoàn thành",                   es: "citas completadas",                     fr: "rendez-vous terminés" }),
    revenueOverTime: pick({ en: "Revenue Over Time",                vi: "Doanh Thu Theo Thời Gian",              es: "Ingresos a lo Largo del Tiempo",        fr: "Revenus au Fil du Temps" }),
    revByPayment:    pick({ en: "Revenue by Payment Method",        vi: "Doanh Thu Theo Phương Thức Thanh Toán", es: "Ingresos por Método de Pago",           fr: "Revenus par Méthode de Paiement" }),
    revenueLabel:    pick({ en: "Revenue",                          vi: "Doanh Thu",                             es: "Ingresos",                              fr: "Revenus" }),

    // Appointments tab
    totalBookings:   pick({ en: "Total Bookings",                   vi: "Tổng Lượt Đặt",                         es: "Total de Reservas",                     fr: "Total des Réservations" }),
    completedStat:   pick({ en: "Completed",                        vi: "Hoàn Thành",                            es: "Completadas",                           fr: "Terminées" }),
    cancelledStat:   pick({ en: "Cancelled",                        vi: "Đã Hủy",                                es: "Canceladas",                            fr: "Annulées" }),
    noShowsStat:     pick({ en: "No-Shows",                         vi: "Vắng Mặt",                              es: "Ausencias",                             fr: "Non-Présentations" }),
    completionRate:  pick({ en: "completion rate",                  vi: "tỷ lệ hoàn thành",                      es: "tasa de finalización",                  fr: "taux de réalisation" }),
    ofBookings:      pick({ en: "of bookings",                      vi: "trong tổng đặt lịch",                   es: "de las reservas",                       fr: "des réservations" }),
    appsOverTime:    pick({ en: "Appointments Over Time",           vi: "Lịch Hẹn Theo Thời Gian",              es: "Citas a lo Largo del Tiempo",           fr: "Rendez-vous au Fil du Temps" }),
    statusBreakdown: pick({ en: "Status Breakdown",                 vi: "Phân Tích Trạng Thái",                  es: "Desglose de Estado",                    fr: "Répartition par Statut" }),

    // Staff tab
    activeStaff:         pick({ en: "Active Staff",                 vi: "Nhân Viên Hoạt Động",                   es: "Personal Activo",                       fr: "Personnel Actif" }),
    totalStaffMembers:   pick({ en: "total staff members",          vi: "tổng số nhân viên",                     es: "miembros del personal",                 fr: "membres du personnel" }),
    avgRevPerStaff:      pick({ en: "Avg Revenue / Staff",          vi: "Doanh Thu TB / Nhân Viên",              es: "Ingresos Promedio / Persona",           fr: "Revenus Moy. / Membre" }),
    completedThisPeriod: pick({ en: "completed this period",        vi: "hoàn thành trong kỳ",                   es: "completadas en este período",           fr: "terminés dans la période" }),
    totalTrackedHours:   pick({ en: "Total Tracked Hours",          vi: "Tổng Giờ Theo Dõi",                     es: "Horas Totales Registradas",             fr: "Heures Totales Suivies" }),
    acrossAllStaff:      pick({ en: "across all staff (timed appts)", vi: "toàn bộ nhân viên (lịch có bấm giờ)", es: "todo el personal (citas cronometradas)", fr: "tout le personnel (rdv chronométrés)" }),
    revByStaff:          pick({ en: "Revenue by Staff Member",      vi: "Doanh Thu Theo Nhân Viên",              es: "Ingresos por Miembro del Personal",     fr: "Revenus par Membre du Personnel" }),
    noCompletedPeriod:   pick({ en: "No completed appointments in this period.", vi: "Không có lịch hẹn hoàn thành trong kỳ.", es: "Sin citas completadas en este período.", fr: "Aucun rendez-vous terminé dans cette période." }),
    staffPerformance:    pick({ en: "Staff Performance — click a row to drill down", vi: "Hiệu Suất Nhân Viên — nhấn để xem chi tiết", es: "Rendimiento del Personal — clic para más detalles", fr: "Performance du Personnel — cliquer pour les détails" }),
    colStaffMember:      pick({ en: "Staff Member",                 vi: "Nhân Viên",                             es: "Miembro del Personal",                  fr: "Membre du Personnel" }),
    colBookings:         pick({ en: "Bookings",                     vi: "Lượt Đặt",                              es: "Reservas",                              fr: "Réservations" }),
    colRevenue:          pick({ en: "Revenue",                      vi: "Doanh Thu",                             es: "Ingresos",                              fr: "Revenus" }),
    colAvgTicket:        pick({ en: "Avg Ticket",                   vi: "TB Vé",                                 es: "Ticket Prom.",                          fr: "Ticket Moy." }),
    colAvgBooked:        pick({ en: "Avg Booked",                   vi: "TB Đặt",                                es: "Reserva Prom.",                         fr: "Réservé Moy." }),
    colAvgActual:        pick({ en: "Avg Actual",                   vi: "TB Thực Tế",                            es: "Real Prom.",                            fr: "Réel Moy." }),
    colPace:             pick({ en: "Pace",                         vi: "Tốc Độ",                                es: "Ritmo",                                 fr: "Rythme" }),
    onTrack:             pick({ en: "On Track",                     vi: "Đúng Tiến Độ",                          es: "En Tiempo",                             fr: "Dans les Temps" }),
    rushing:             pick({ en: "Rushing",                      vi: "Quá Nhanh",                             es: "Apresurado",                            fr: "Précipité" }),
    slow:                pick({ en: "Slow",                         vi: "Chậm",                                  es: "Lento",                                 fr: "Lent" }),
    paceNote:            pick({ en: "Pace: green = within ±15% of set duration (On Track). Finishing significantly under time signals rushing or lack of upsell. Finishing significantly over signals inefficiency. Timed columns require staff to tap Start & Checkout on the appointment.", vi: "Tốc Độ: xanh = trong phạm vi ±15% thời gian đặt. Kết thúc sớm hơn nhiều = làm quá nhanh. Kết thúc muộn hơn nhiều = kém hiệu quả. Cột có bấm giờ cần nhân viên bấm Bắt Đầu & Hoàn Thành.", es: "Ritmo: verde = dentro de ±15% de la duración fijada. Terminar muy antes = apresurado. Terminar muy después = ineficiente. Las columnas cronometradas requieren que el personal toque Inicio & Pago.", fr: "Rythme: vert = dans ±15% de la durée définie. Terminer trop tôt = précipité. Trop tard = inefficace. Les colonnes chronométrées nécessitent que le personnel appuie sur Démarrer & Payer." }),
    serviceTimeAnalysis: pick({ en: "Service Time Analysis",        vi: "Phân Tích Thời Gian Dịch Vụ",           es: "Análisis de Tiempo por Servicio",        fr: "Analyse du Temps par Service" }),
    actualTimeVsSet:     pick({ en: "Actual time per service vs. set duration", vi: "Thời gian thực tế so với thời gian đặt", es: "Tiempo real por servicio vs. duración fijada", fr: "Temps réel par service vs. durée définie" }),
    setDurVsAvgActual:   pick({ en: "Set Duration vs Avg Actual (timed appointments)", vi: "Thời Gian Đặt so với TB Thực Tế (có bấm giờ)", es: "Duración Fijada vs Real Prom. (citas cronometradas)", fr: "Durée Définie vs Réel Moy. (rdv chronométrés)" }),
    setDuration:         pick({ en: "Set Duration",                 vi: "Thời Gian Đặt",                         es: "Duración Fijada",                       fr: "Durée Définie" }),
    avgActualLabel:      pick({ en: "Avg Actual",                   vi: "TB Thực Tế",                            es: "Real Promedio",                         fr: "Réel Moyen" }),
    serviceBreakdown:    pick({ en: "Service Breakdown",            vi: "Chi Tiết Dịch Vụ",                      es: "Desglose de Servicios",                 fr: "Détail des Services" }),
    colService:          pick({ en: "Service",                      vi: "Dịch Vụ",                               es: "Servicio",                              fr: "Service" }),
    colDone:             pick({ en: "# Done",                       vi: "Số Lượng",                              es: "# Realizadas",                          fr: "# Effectuées" }),
    colSetDuration:      pick({ en: "Set Duration",                 vi: "Thời Gian Đặt",                         es: "Duración Fijada",                       fr: "Durée Définie" }),
    colTotalTime:        pick({ en: "Total Time",                   vi: "Tổng Thời Gian",                        es: "Tiempo Total",                          fr: "Temps Total" }),
    colVsSet:            pick({ en: "+/− vs Set",                   vi: "+/− so với Đặt",                        es: "+/− vs Fijado",                         fr: "+/− vs Défini" }),
    drillRevenue:        pick({ en: "Revenue",                      vi: "Doanh Thu",                             es: "Ingresos",                              fr: "Revenus" }),
    drillBookings:       pick({ en: "Bookings",                     vi: "Lượt Đặt",                              es: "Reservas",                              fr: "Réservations" }),
    drillTotalHours:     pick({ en: "Total Hours",                  vi: "Tổng Giờ",                              es: "Horas Totales",                         fr: "Heures Totales" }),
    drillAvgTicket:      pick({ en: "Avg Ticket",                   vi: "TB Vé",                                 es: "Ticket Prom.",                          fr: "Ticket Moy." }),

    // Services tab
    top10Services:   pick({ en: "Top 10 Services",                  vi: "Top 10 Dịch Vụ",                        es: "Top 10 Servicios",                      fr: "Top 10 Services" }),
    colSvcBookings:  pick({ en: "Bookings",                         vi: "Lượt Đặt",                              es: "Reservas",                              fr: "Réservations" }),
    colBooked:       pick({ en: "Booked",                           vi: "Đặt",                                   es: "Reservado",                             fr: "Réservé" }),
    colVsBooked:     pick({ en: "+/− vs Booked",                    vi: "+/− so với Đặt",                        es: "+/− vs Reservado",                      fr: "+/− vs Réservé" }),
    onTime:          pick({ en: "On time",                          vi: "Đúng Giờ",                              es: "A tiempo",                              fr: "À l'heure" }),
    over:            pick({ en: "over",                             vi: "vượt",                                  es: "excedido",                              fr: "dépassé" }),
    under:           pick({ en: "under",                            vi: "dưới",                                  es: "por debajo",                            fr: "en dessous" }),
    noData:          pick({ en: "No data available.",               vi: "Không có dữ liệu.",                     es: "Sin datos disponibles.",                fr: "Aucune donnée disponible." }),
    timingNote:      pick({ en: "Avg Actual is measured from when staff tap Start to Checkout. If a service consistently shows \"+ over\", consider increasing its booked duration to reduce schedule overruns.", vi: "TB Thực Tế được tính từ khi nhân viên bấm Bắt Đầu đến Thanh Toán. Nếu dịch vụ liên tục hiện \"+\", hãy tăng thời gian đặt để tránh chạy quá giờ.", es: "El Promedio Real se mide desde que el personal toca Inicio hasta Pago. Si un servicio muestra \"+\" de forma consistente, considera aumentar su duración para reducir retrasos.", fr: "La Moy. Réelle est mesurée du début au paiement. Si un service affiche constamment \"+\", envisagez d'augmenter sa durée réservée pour réduire les retards." }),

    // Customers tab
    totalCustomers:  pick({ en: "Total Clients",                    vi: "Tổng Khách Hàng",                       es: "Total de Clientes",                     fr: "Total des Clients" }),
    newThisPeriod:   pick({ en: "New This Period",                  vi: "Mới Trong Kỳ",                          es: "Nuevos en el Período",                  fr: "Nouveaux dans la Période" }),
    activeClients:   pick({ en: "Active Clients",                   vi: "Khách Hàng Hoạt Động",                  es: "Clientes Activos",                      fr: "Clients Actifs" }),
    avgSpendClient:  pick({ en: "Avg Spend / Client",               vi: "Chi Tiêu TB / Khách",                   es: "Gasto Promedio / Cliente",              fr: "Dépense Moy. / Client" }),
    allTime:         pick({ en: "all time",                         vi: "mọi lúc",                               es: "desde siempre",                         fr: "depuis toujours" }),
    bookedInPeriod:  pick({ en: "booked in period",                 vi: "đặt trong kỳ",                          es: "reservado en el período",               fr: "réservé dans la période" }),
    completedApptsSub: pick({ en: "completed appointments",         vi: "lịch hẹn hoàn thành",                   es: "citas completadas",                     fr: "rendez-vous terminés" }),
    noShowRisks:     pick({ en: "No-Show Risks",                    vi: "Rủi Ro Vắng Mặt",                       es: "Riesgos de Ausencia",                   fr: "Risques de Non-Présentation" }),
    colCustomer:     pick({ en: "Client",                           vi: "Khách Hàng",                            es: "Cliente",                               fr: "Client" }),
    colTotalBkgs:    pick({ en: "Total Bookings",                   vi: "Tổng Lượt Đặt",                         es: "Total Reservas",                        fr: "Total Réservations" }),
    colNoShows:      pick({ en: "No-Shows",                         vi: "Vắng Mặt",                              es: "Ausencias",                             fr: "Non-Présentations" }),
    colCancels:      pick({ en: "Cancels",                          vi: "Hủy",                                   es: "Cancelaciones",                         fr: "Annulations" }),
    colNoShowRate:   pick({ en: "No-Show Rate",                     vi: "Tỷ Lệ Vắng Mặt",                       es: "Tasa de Ausencias",                     fr: "Taux de Non-Présentation" }),
    noShowEmpty:     pick({ en: "No clients with a meaningful no-show history. Great news.", vi: "Không có khách hàng nào có lịch sử vắng mặt đáng kể. Tuyệt vời.", es: "Sin clientes con historial significativo de ausencias. Buenas noticias.", fr: "Aucun client avec un historique significatif de non-présentation. Bonne nouvelle." }),
    noShowNote:      pick({ en: "Lifetime no-show rate (not limited to the selected period). Only clients with 3+ total bookings and at least one no-show appear here.", vi: "Tỷ lệ vắng mặt suốt đời (không giới hạn kỳ). Chỉ hiển thị khách có 3+ lượt đặt và ít nhất 1 lần vắng mặt.", es: "Tasa de ausencias de por vida (no limitada al período). Solo clientes con 3+ reservas y al menos una ausencia.", fr: "Taux de non-présentation à vie (sans limite de période). Seulement les clients avec 3+ réservations et au moins une absence." }),
    top10Customers:  pick({ en: "Top 10 Clients by Spend",          vi: "Top 10 Khách Hàng Theo Chi Tiêu",       es: "Top 10 Clientes por Gasto",             fr: "Top 10 Clients par Dépense" }),
    colVisits:       pick({ en: "Visits",                           vi: "Lượt Ghé",                              es: "Visitas",                               fr: "Visites" }),
    colTotalSpend:   pick({ en: "Total Spend",                      vi: "Tổng Chi Tiêu",                         es: "Gasto Total",                           fr: "Dépense Totale" }),

    // Tax tab
    totalCollected12m:  pick({ en: "Total Collected (12m)",         vi: "Tổng Thu (12 Tháng)",                   es: "Total Cobrado (12m)",                   fr: "Total Collecté (12m)" }),
    serviceRevenue:     pick({ en: "Service Revenue",               vi: "Doanh Thu Dịch Vụ",                     es: "Ingresos por Servicios",                fr: "Revenus des Services" }),
    taxCollected:       pick({ en: "Tax Collected",                 vi: "Thuế Thu",                              es: "Impuesto Cobrado",                      fr: "Taxe Collectée" }),
    last12months:       pick({ en: "Last 12 months",                vi: "12 Tháng Qua",                          es: "Últimos 12 meses",                      fr: "12 Derniers Mois" }),
    exclTaxTips:        pick({ en: "Excl. tax & tips",              vi: "Chưa bao gồm thuế & tip",               es: "Excl. impuestos y propinas",            fr: "Hors taxes et pourboires" }),
    monthlyBreakdown:   pick({ en: "Monthly Income Breakdown",      vi: "Phân Tích Thu Nhập Hàng Tháng",         es: "Desglose Mensual de Ingresos",          fr: "Détail des Revenus Mensuels" }),
    taxSubtitle:        pick({ en: "Last 12 months — for self-assessment & accountant reports", vi: "12 Tháng Qua — cho tự khai thuế & báo cáo kế toán", es: "Últimos 12 meses — para autoevaluación e informes contables", fr: "12 derniers mois — pour déclaration fiscale et rapports comptables" }),
    colMonth:           pick({ en: "Month",                         vi: "Tháng",                                 es: "Mes",                                   fr: "Mois" }),
    colServiceRev:      pick({ en: "Service Revenue",               vi: "Doanh Thu DV",                          es: "Ingresos Servicios",                    fr: "Revenus Services" }),
    colTaxColl:         pick({ en: "Tax Collected",                 vi: "Thuế Thu",                              es: "Impuesto",                              fr: "Taxe" }),
    colTips:            pick({ en: "Tips",                          vi: "Tiền Tip",                              es: "Propinas",                              fr: "Pourboires" }),
    colTotalColl:       pick({ en: "Total Collected",               vi: "Tổng Thu",                              es: "Total Cobrado",                         fr: "Total Collecté" }),
    totalRow:           pick({ en: "Total",                         vi: "Tổng",                                  es: "Total",                                 fr: "Total" }),
    taxDisclaimer:      pick({ en: "This report covers completed appointments only. Consult your accountant for tax advice specific to your business.", vi: "Báo cáo này chỉ bao gồm lịch hẹn đã hoàn thành. Tham khảo kế toán để được tư vấn thuế phù hợp.", es: "Este informe cubre solo citas completadas. Consulta a tu contador para asesoría fiscal específica.", fr: "Ce rapport couvre uniquement les rendez-vous terminés. Consultez votre comptable pour des conseils fiscaux adaptés." }),
  };

  function rangeLabelStr(r: Range) {
    return pick({
      en: r === "7d" ? "Last 7 Days" : r === "30d" ? "Last 30 Days" : r === "90d" ? "Last 90 Days" : "Last 12 Months",
      vi: r === "7d" ? "7 Ngày Qua" : r === "30d" ? "30 Ngày Qua" : r === "90d" ? "90 Ngày Qua" : "12 Tháng Qua",
      es: r === "7d" ? "Últimos 7 Días" : r === "30d" ? "Últimos 30 Días" : r === "90d" ? "Últimos 90 Días" : "Últimos 12 Meses",
      fr: r === "7d" ? "7 Derniers Jours" : r === "30d" ? "30 Derniers Jours" : r === "90d" ? "90 Derniers Jours" : "12 Derniers Mois",
    });
  }

  const appointments = allAppointments as AppointmentWithDetails[];

  const { days, rangeStart, prevStart } = useMemo(() => {
    if (range === "12m") {
      const rangeStart = startOfDay(subDays(new Date(), 365));
      const prevStart = startOfDay(subDays(new Date(), 730));
      return { days: 365, rangeStart, prevStart };
    }
    const d = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    const rangeStart = startOfDay(subDays(new Date(), d - 1));
    const prevStart = startOfDay(subDays(new Date(), d * 2 - 1));
    return { days: d, rangeStart, prevStart };
  }, [range]);

  const now = new Date();

  const periodAppts = useMemo(() =>
    appointments.filter(a => {
      const d = new Date(a.date);
      return d >= rangeStart && d <= now;
    }), [appointments, rangeStart]);

  const prevAppts = useMemo(() =>
    appointments.filter(a => {
      const d = new Date(a.date);
      return d >= prevStart && d < rangeStart;
    }), [appointments, prevStart, rangeStart]);

  const completedAppts = useMemo(() => periodAppts.filter(a => a.status === "completed"), [periodAppts]);
  const prevCompleted = useMemo(() => prevAppts.filter(a => a.status === "completed"), [prevAppts]);

  function pct(cur: number, prev: number) {
    if (!prev) return cur > 0 ? 100 : 0;
    return ((cur - prev) / prev) * 100;
  }

  const totalRevenue = useMemo(() =>
    completedAppts.reduce((s, a) => s + parseFloat(a.totalPaid || "0"), 0), [completedAppts]);
  const prevRevenue = useMemo(() =>
    prevCompleted.reduce((s, a) => s + parseFloat(a.totalPaid || "0"), 0), [prevCompleted]);
  const totalTips = useMemo(() =>
    completedAppts.reduce((s, a) => s + parseFloat((a as any).tipAmount || "0"), 0), [completedAppts]);
  const avgTicket = completedAppts.length ? totalRevenue / completedAppts.length : 0;

  const revenueByDay = useMemo(() => {
    if (range === "12m") {
      const months = eachMonthOfInterval({ start: subMonths(now, 11), end: now });
      return months.map(m => {
        const label = format(m, "MMM yy");
        const rev = completedAppts
          .filter(a => format(new Date(a.date), "MMM yy") === label)
          .reduce((s, a) => s + parseFloat(a.totalPaid || "0"), 0);
        return { date: label, revenue: parseFloat(rev.toFixed(2)) };
      });
    }
    return eachDayOfInterval({ start: rangeStart, end: now }).map(day => {
      const label = format(day, range === "7d" ? "EEE d" : "MMM d");
      const rev = completedAppts
        .filter(a => format(new Date(a.date), "yyyy-MM-dd") === format(day, "yyyy-MM-dd"))
        .reduce((s, a) => s + parseFloat(a.totalPaid || "0"), 0);
      return { date: label, revenue: parseFloat(rev.toFixed(2)) };
    });
  }, [completedAppts, rangeStart, range]);

  const paymentBreakdown = useMemo(() => {
    const VALID = ["Cash", "Card", "Gift"];
    const map: Record<string, number> = {};
    completedAppts.forEach(a => {
      const raw = ((a as any).paymentMethod || "unknown").trim();
      const total = parseFloat(a.totalPaid || "0");
      const parts = raw.split(",");
      const hasEmbedded = parts.some((p: string) => p.includes(":"));
      parts.forEach((part: string) => {
        const tk = part.trim();
        let method: string;
        let amount: number;
        if (tk.includes(":")) {
          const ci = tk.indexOf(":");
          method = tk.slice(0, ci).trim();
          amount = parseFloat(tk.slice(ci + 1).trim()) || 0;
        } else {
          method = tk;
          amount = hasEmbedded ? 0 : total / parts.length;
        }
        const normalized = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
        const key = VALID.includes(normalized) ? normalized : "Unknown";
        map[key] = (map[key] || 0) + amount;
      });
    });
    return Object.entries(map)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
  }, [completedAppts]);

  const cancelled = useMemo(() => periodAppts.filter(a => a.status === "cancelled"), [periodAppts]);
  const noShow = useMemo(() => periodAppts.filter(a => a.status === "no_show"), [periodAppts]);
  const pending = useMemo(() => periodAppts.filter(a => a.status === "pending" || a.status === "confirmed"), [periodAppts]);

  const apptsByDay = useMemo(() => {
    if (range === "12m") {
      const months = eachMonthOfInterval({ start: subMonths(now, 11), end: now });
      return months.map(m => {
        const label = format(m, "MMM yy");
        return {
          date: label,
          completed: completedAppts.filter(a => format(new Date(a.date), "MMM yy") === label).length,
          cancelled: cancelled.filter(a => format(new Date(a.date), "MMM yy") === label).length,
        };
      });
    }
    return eachDayOfInterval({ start: rangeStart, end: now }).map(day => {
      const key = format(day, "yyyy-MM-dd");
      const label = format(day, range === "7d" ? "EEE d" : "MMM d");
      return {
        date: label,
        completed: completedAppts.filter(a => format(new Date(a.date), "yyyy-MM-dd") === key).length,
        cancelled: cancelled.filter(a => format(new Date(a.date), "yyyy-MM-dd") === key).length,
      };
    });
  }, [completedAppts, cancelled, rangeStart, range]);

  const statusBreakdown = useMemo(() => [
    { name: "Completed", value: completedAppts.length },
    { name: "Cancelled", value: cancelled.length },
    { name: "No-Show", value: noShow.length },
    { name: "Pending", value: pending.length },
  ].filter(x => x.value > 0), [completedAppts, cancelled, noShow, pending]);

  const staffStats = useMemo(() =>
    staffList.map((s: any) => {
      const appts = completedAppts.filter(a => (a as any).staffId === s.id);
      const revenue = appts.reduce((sum, a) => {
        const svcPrice = Number(a.service?.price || 0);
        const addonTotal = (a.appointmentAddons || []).reduce((acc, aa) => acc + Number(aa.addon?.price || 0), 0);
        return sum + svcPrice + addonTotal;
      }, 0);
      const timed = appts.filter((a: any) => a.startedAt && a.completedAt);
      const totalActualMin = timed.reduce((sum: number, a: any) => {
        const start = new Date(a.startedAt).getTime();
        const end = new Date(a.completedAt).getTime();
        return sum + Math.max(0, (end - start) / 60000);
      }, 0);
      const totalBookedMin = timed.reduce((sum: number, a: any) => {
        const addonMin = (a.appointmentAddons || []).reduce(
          (acc: number, aa: any) => acc + (aa.addon?.duration || 0), 0,
        );
        return sum + (a.duration || 0) + addonMin;
      }, 0);
      const avgActualMin = timed.length ? totalActualMin / timed.length : 0;
      const avgBookedMin = timed.length ? totalBookedMin / timed.length : 0;
      const efficiency = totalActualMin > 0 ? totalBookedMin / totalActualMin : 0;
      return {
        id: s.id, name: s.name,
        appointments: appts.length, revenue,
        avgTicket: appts.length ? revenue / appts.length : 0,
        timedCount: timed.length, avgActualMin, avgBookedMin, efficiency,
      };
    }).sort((a, b) => b.revenue - a.revenue),
  [staffList, completedAppts]);

  const staffServiceBreakdown = useMemo(() => {
    if (!selectedStaffId) return [];
    const staffAppts = completedAppts.filter(a => (a as any).staffId === selectedStaffId);
    const svcMap = new Map<number, {
      id: number; name: string; count: number; revenue: number;
      setDuration: number; timedCount: number; totalActualMin: number;
    }>();
    staffAppts.forEach(a => {
      const svcId = (a as any).serviceId ?? 0;
      const svcName = (a as any).service?.name ?? "Unknown";
      const setDur = (a as any).duration ?? (a as any).service?.duration ?? 0;
      const price =
        Number((a as any).service?.price ?? 0) +
        ((a as any).appointmentAddons ?? []).reduce(
          (s: number, aa: any) => s + Number(aa.addon?.price ?? 0), 0
        );
      const entry = svcMap.get(svcId) ?? {
        id: svcId, name: svcName, count: 0, revenue: 0,
        setDuration: setDur, timedCount: 0, totalActualMin: 0,
      };
      entry.count += 1;
      entry.revenue += price;
      if ((a as any).startedAt && (a as any).completedAt) {
        const ms = new Date((a as any).completedAt).getTime() - new Date((a as any).startedAt).getTime();
        entry.timedCount += 1;
        entry.totalActualMin += Math.max(0, ms / 60000);
      }
      svcMap.set(svcId, entry);
    });
    return Array.from(svcMap.values()).map(e => {
      const avgActualMin = e.timedCount > 0 ? e.totalActualMin / e.timedCount : 0;
      return {
        ...e, avgActualMin,
        avgOverMin: e.timedCount > 0 ? avgActualMin - e.setDuration : 0,
        efficiency: e.timedCount > 0 && e.setDuration > 0 ? e.setDuration / avgActualMin : 0,
      };
    }).sort((a, b) => b.count - a.count);
  }, [selectedStaffId, completedAppts]);

  const selectedStaffSummary = selectedStaffId
    ? staffStats.find(s => s.id === selectedStaffId) ?? null
    : null;

  const serviceStats = useMemo(() =>
    services.map((svc: any) => {
      const appts = completedAppts.filter(a => (a as any).serviceId === svc.id);
      const revenue = appts.reduce((sum, a) => {
        const svcPrice = Number(a.service?.price || 0);
        const addonTotal = (a.appointmentAddons || []).reduce((acc, aa) => acc + Number(aa.addon?.price || 0), 0);
        return sum + svcPrice + addonTotal;
      }, 0);
      const timed = appts.filter((a: any) => a.startedAt && a.completedAt);
      const totalActualMin = timed.reduce((sum: number, a: any) => {
        const start = new Date(a.startedAt).getTime();
        const end = new Date(a.completedAt).getTime();
        return sum + Math.max(0, (end - start) / 60000);
      }, 0);
      const bookedDur = svc.duration || 0;
      const avgActualMin = timed.length ? totalActualMin / timed.length : 0;
      const efficiency = avgActualMin > 0 ? bookedDur / avgActualMin : 0;
      const avgOverMin = avgActualMin - bookedDur;
      return {
        id: svc.id, name: svc.name,
        bookings: appts.length, revenue,
        avgTicket: appts.length ? revenue / appts.length : 0,
        bookedDur, timedCount: timed.length, avgActualMin, avgOverMin, efficiency,
      };
    }).sort((a, b) => b.bookings - a.bookings).slice(0, 10),
  [services, completedAppts]);

  const customerStats = useMemo(() => {
    return (customers as any[]).map(c => {
      const appts = completedAppts.filter(a => (a as any).customerId === c.id);
      const total = appts.reduce((s, a) => s + parseFloat(a.totalPaid || "0"), 0);
      return { id: c.id, name: c.name, visits: appts.length, totalSpend: total };
    }).sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 10);
  }, [customers, completedAppts]);

  const noShowRisks = useMemo(() => {
    const byCustomer = new Map<number, { total: number; noShows: number; cancels: number }>();
    (appointments as any[]).forEach(a => {
      const cid = a.customerId;
      if (!cid) return;
      const entry = byCustomer.get(cid) || { total: 0, noShows: 0, cancels: 0 };
      entry.total += 1;
      if (a.status === "no_show") entry.noShows += 1;
      if (a.status === "cancelled") entry.cancels += 1;
      byCustomer.set(cid, entry);
    });
    return (customers as any[])
      .map(c => {
        const stats = byCustomer.get(c.id) || { total: 0, noShows: 0, cancels: 0 };
        const rate = stats.total > 0 ? stats.noShows / stats.total : 0;
        return { id: c.id, name: c.name, phone: c.phone, total: stats.total, noShows: stats.noShows, cancels: stats.cancels, rate };
      })
      .filter(r => r.total >= 3 && r.noShows > 0)
      .sort((a, b) => b.rate - a.rate || b.noShows - a.noShows)
      .slice(0, 10);
  }, [customers, appointments]);

  const taxMonthlyRows = useMemo(() => {
    const months = eachMonthOfInterval({ start: subMonths(new Date(), 11), end: new Date() });
    return months.map(m => {
      const label = format(m, "MMM yyyy");
      const monthAppts = completedAppts.filter(a => format(new Date(a.date), "MMM yyyy") === label);
      const total = monthAppts.reduce((s, a) => s + parseFloat(a.totalPaid || "0"), 0);
      const tips = monthAppts.reduce((s, a) => s + parseFloat((a as any).tipAmount || "0"), 0);
      const tax = monthAppts.reduce((s, a) => {
        const svcPrice = Number(a.service?.price || 0);
        const addonTotal = (a.appointmentAddons || []).reduce((acc, aa) => acc + Number(aa.addon?.price || 0), 0);
        const discountAmount = Number((a as any).discountAmount || 0);
        const tipAmt = Number((a as any).tipAmount || 0);
        const giftCardAmt = Number((a as any).giftCardAmount || 0);
        const derived = parseFloat(a.totalPaid || "0") - Math.max(0, svcPrice + addonTotal - discountAmount) - tipAmt - giftCardAmt;
        return s + Math.max(0, derived);
      }, 0);
      const serviceRev = total - tips - tax;
      return {
        month: label,
        services: parseFloat(Math.max(0, serviceRev).toFixed(2)),
        tips: parseFloat(tips.toFixed(2)),
        tax: parseFloat(tax.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
      };
    });
  }, [completedAppts]);

  const newCustomers = useMemo(() =>
    (customers as any[]).filter(c => {
      const d = new Date(c.createdAt || c.created_at || 0);
      return d >= rangeStart;
    }), [customers, rangeStart]);

  const returningCount = useMemo(() =>
    completedAppts.reduce((acc, a) => {
      const cid = (a as any).customerId;
      if (cid) acc.add(cid);
      return acc;
    }, new Set<number>()).size, [completedAppts]);

  function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppLayout>
      {/* Back to hub */}
      <div style={{ position:"sticky",top:0,zIndex:40,background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"10px 24px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 3px 0 rgb(0 0 0/.06)",marginLeft:-32,marginRight:-32,marginTop:-24,marginBottom:0 }}>
        <button onClick={()=>navigate("/payouts/contractors")} style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",cursor:"pointer",fontSize:".82rem",fontWeight:600,color:"#374151",whiteSpace:"nowrap" }}>
          ← Staff &amp; Earnings
        </button>
        <div style={{ width:1,height:18,background:"#e5e7eb",flexShrink:0 }} />
        <span style={{ fontSize:".92rem",fontWeight:700,color:"#1c1917" }}>Reports</span>
      </div>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t.title}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{t.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={range} onValueChange={v => setRange(v as Range)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">{t.last7d}</SelectItem>
                <SelectItem value="30d">{t.last30d}</SelectItem>
                <SelectItem value="90d">{t.last90d}</SelectItem>
                <SelectItem value="12m">{t.last12m}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2">
              <Printer className="h-4 w-4" />
              {t.print}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="revenue">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="revenue">{t.tabRevenue}</TabsTrigger>
            <TabsTrigger value="appointments">{t.tabAppointments}</TabsTrigger>
            <TabsTrigger value="staff">{t.tabStaff}</TabsTrigger>
            <TabsTrigger value="services">{t.tabServices}</TabsTrigger>
            <TabsTrigger value="customers">{t.tabCustomers}</TabsTrigger>
            <TabsTrigger value="tax">{t.tabTax}</TabsTrigger>
          </TabsList>

          {/* ── REVENUE TAB ───────────────────────────────────────────────── */}
          <TabsContent value="revenue" className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title={t.totalRevenue} value={fmt(totalRevenue)} icon={DollarSign}
                trend={pct(totalRevenue, prevRevenue)} sub={rangeLabelStr(range)} />
              <StatCard title={t.avgDailyRevenue} value={fmt(totalRevenue / Math.max(days, 1))} icon={TrendingUp}
                sub={t.perDayInPeriod} />
              <StatCard title={t.totalTips} value={fmt(totalTips)} icon={DollarSign}
                sub={`${completedAppts.length} ${t.completedAppts}`} />
              <StatCard title={t.avgTicket} value={fmt(avgTicket)} icon={TrendingUp}
                trend={pct(avgTicket, prevRevenue / Math.max(prevCompleted.length, 1))} />
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{t.revenueOverTime}</CardTitle>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7 px-2.5" onClick={() => downloadCsv(
                  `revenue-${range}-${format(new Date(), "yyyy-MM-dd")}.csv`,
                  ["Date", "Revenue ($)"],
                  revenueByDay.map(r => [r.date, r.revenue])
                )}>
                  <Download className="h-3 w-3" />
                  CSV
                </Button>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={revenueByDay}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                      interval={range === "7d" ? 0 : "preserveStartEnd"} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                      tickFormatter={v => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v)} />
                    <Tooltip formatter={(v: number) => [fmt(v), t.revenueLabel]} />
                    <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2}
                      fill="url(#revGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {paymentBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t.revByPayment}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col md:flex-row items-center gap-6">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={paymentBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                        dataKey="value" paddingAngle={3}>
                        {paymentBreakdown.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full md:w-56 shrink-0 space-y-2">
                    {paymentBreakdown.map((p, i) => (
                      <div key={p.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          {p.name}
                        </div>
                        <span className="font-medium">{fmt(p.value)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── APPOINTMENTS TAB ──────────────────────────────────────────── */}
          <TabsContent value="appointments" className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title={t.totalBookings} value={String(periodAppts.length)} icon={Calendar}
                trend={pct(periodAppts.length, prevAppts.length)} sub={rangeLabelStr(range)} />
              <StatCard title={t.completedStat} value={String(completedAppts.length)} icon={UserCheck}
                sub={`${periodAppts.length ? ((completedAppts.length / periodAppts.length) * 100).toFixed(0) : 0}% ${t.completionRate}`} />
              <StatCard title={t.cancelledStat} value={String(cancelled.length)} icon={UserX}
                sub={`${periodAppts.length ? ((cancelled.length / periodAppts.length) * 100).toFixed(0) : 0}% ${t.ofBookings}`} />
              <StatCard title={t.noShowsStat} value={String(noShow.length)} icon={AlertCircle}
                sub={`${periodAppts.length ? ((noShow.length / periodAppts.length) * 100).toFixed(0) : 0}% ${t.ofBookings}`} />
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{t.appsOverTime}</CardTitle>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7 px-2.5" disabled={periodAppts.length === 0} onClick={() => downloadCsv(
                  `appointments-${range}-${format(new Date(), "yyyy-MM-dd")}.csv`,
                  ["Date", "Status", "Client", "Service", "Staff", "Total ($)"],
                  periodAppts.map(a => [
                    format(new Date(a.date), "yyyy-MM-dd"),
                    a.status,
                    (a as any).customerName || "",
                    a.service?.name || "",
                    (a as any).staffName || "",
                    a.totalPaid || "0",
                  ])
                )}>
                  <Download className="h-3 w-3" />
                  CSV
                </Button>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={apptsByDay}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                      interval={range === "7d" ? 0 : "preserveStartEnd"} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="completed" name={t.completedStat} fill="#22c55e" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="cancelled" name={t.cancelledStat} fill="#ef4444" radius={[3, 3, 0, 0]} />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {statusBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t.statusBreakdown}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col md:flex-row items-center gap-6">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={statusBreakdown} cx="50%" cy="50%" outerRadius={80}
                        dataKey="value" paddingAngle={3}>
                        {statusBreakdown.map((entry) => (
                          <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? CHART_COLORS[0]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full md:w-56 shrink-0 space-y-2">
                    {statusBreakdown.map((s) => (
                      <div key={s.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[s.name] ?? CHART_COLORS[0] }} />
                          {s.name}
                        </div>
                        <span className="font-medium">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── STAFF TAB ─────────────────────────────────────────────────── */}
          <TabsContent value="staff" className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title={t.activeStaff} value={String(staffList.length)} icon={Users} sub={t.totalStaffMembers} />
              <StatCard title={t.avgRevPerStaff} value={fmt(staffList.length ? totalRevenue / staffList.length : 0)}
                icon={DollarSign} sub={rangeLabelStr(range)} />
              <StatCard title={t.totalBookings} value={String(completedAppts.length)} icon={Calendar}
                sub={t.completedThisPeriod} />
              <StatCard
                title={t.totalTrackedHours}
                value={(() => {
                  const totalMin = staffStats.reduce((s, st) => s + st.avgActualMin * st.timedCount, 0);
                  return totalMin >= 60
                    ? `${Math.floor(totalMin / 60)}h ${Math.round(totalMin % 60)}m`
                    : `${Math.round(totalMin)}m`;
                })()}
                icon={Clock}
                sub={t.acrossAllStaff}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.revByStaff}</CardTitle>
              </CardHeader>
              <CardContent>
                {staffStats.filter(s => s.appointments > 0).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">{t.noCompletedPeriod}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, staffStats.filter(s => s.appointments > 0).length * 44)}>
                    <BarChart data={staffStats.filter(s => s.appointments > 0)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                        tickFormatter={v => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v)} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={90} />
                      <Tooltip formatter={(v: number) => [fmt(v), t.revenueLabel]} />
                      <Bar dataKey="revenue" name={t.revenueLabel} fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{t.staffPerformance}</CardTitle>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7 px-2.5" disabled={staffStats.length === 0} onClick={() => downloadCsv(
                  `staff-performance-${range}-${format(new Date(), "yyyy-MM-dd")}.csv`,
                  ["Staff Member", "Bookings", "Revenue ($)", "Avg Ticket ($)", "Avg Booked (min)", "Avg Actual (min)"],
                  staffStats.map(s => [
                    s.name, s.appointments,
                    s.revenue.toFixed(2), s.avgTicket.toFixed(2),
                    s.avgBookedMin ? s.avgBookedMin.toFixed(0) : "",
                    s.timedCount > 0 ? s.avgActualMin.toFixed(0) : "",
                  ])
                )}>
                  <Download className="h-3 w-3" />
                  CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">{t.colStaffMember}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colBookings}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colRevenue}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colAvgTicket}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colAvgBooked}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colAvgActual}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colPace}</th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {staffStats.map(s => {
                        const isSelected = selectedStaffId === s.id;
                        const overMin = s.timedCount > 0 ? Math.round(s.avgActualMin - s.avgBookedMin) : 0;
                        const pctDev = s.avgBookedMin > 0 ? (s.avgActualMin - s.avgBookedMin) / s.avgBookedMin : 0;
                        let effLabel: string;
                        let effClass: string;
                        if (s.timedCount === 0) {
                          effLabel = "—";
                          effClass = "text-muted-foreground";
                        } else if (Math.abs(pctDev) <= 0.15) {
                          effLabel = overMin === 0 ? t.onTrack : overMin > 0 ? `+${overMin}m` : `${overMin}m`;
                          effClass = "text-emerald-600 font-semibold";
                        } else if (pctDev < -0.15) {
                          effLabel = `${overMin}m (${t.rushing})`;
                          effClass = Math.abs(pctDev) > 0.30
                            ? "text-red-600 font-semibold"
                            : "text-amber-600 font-semibold";
                        } else {
                          effLabel = `+${overMin}m (${t.slow})`;
                          effClass = pctDev > 0.25
                            ? "text-red-600 font-semibold"
                            : "text-amber-600 font-semibold";
                        }
                        const fmtMin = (m: number) => s.timedCount > 0
                          ? (m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`)
                          : "—";
                        return (
                          <tr
                            key={s.id}
                            onClick={() => setSelectedStaffId(isSelected ? null : s.id)}
                            className={cn(
                              "border-b last:border-0 cursor-pointer transition-colors",
                              isSelected ? "bg-indigo-50 hover:bg-indigo-100" : "hover:bg-muted/40",
                            )}
                          >
                            <td className="py-2.5 pr-4 font-semibold flex items-center gap-2">
                              <span className={cn(
                                "inline-block w-2 h-2 rounded-full shrink-0",
                                isSelected ? "bg-indigo-500" : "bg-slate-300",
                              )} />
                              {s.name}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums">{s.appointments}</td>
                            <td className="py-2.5 px-4 text-right tabular-nums font-medium">{fmt(s.revenue)}</td>
                            <td className="py-2.5 px-4 text-right tabular-nums">{fmt(s.avgTicket)}</td>
                            <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">{fmtMin(s.avgBookedMin)}</td>
                            <td className="py-2.5 px-4 text-right tabular-nums">{fmtMin(s.avgActualMin)}</td>
                            <td className={cn("py-2.5 px-4 text-right tabular-nums", effClass)}>{effLabel}</td>
                            <td className="py-2.5 pl-1">
                              <ChevronRight className={cn(
                                "h-4 w-4 text-muted-foreground transition-transform",
                                isSelected && "rotate-90 text-indigo-500",
                              )} />
                            </td>
                          </tr>
                        );
                      })}
                      {staffStats.length === 0 && (
                        <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">{t.noData}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-3">{t.paceNote}</p>
              </CardContent>
            </Card>

            {selectedStaffSummary && (
              <Card className="border-indigo-200 shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Timer className="h-4 w-4 text-indigo-500" />
                      {selectedStaffSummary.name} — {t.serviceTimeAnalysis}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.actualTimeVsSet} · {rangeLabelStr(range)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedStaffId(null)}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </CardHeader>

                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: t.drillRevenue, value: fmt(selectedStaffSummary.revenue), icon: DollarSign, color: "text-emerald-600" },
                      { label: t.drillBookings, value: String(selectedStaffSummary.appointments), icon: Calendar, color: "text-blue-600" },
                      {
                        label: t.drillTotalHours,
                        value: (() => {
                          const m = selectedStaffSummary.avgActualMin * selectedStaffSummary.timedCount;
                          return m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : m > 0 ? `${Math.round(m)}m` : "—";
                        })(),
                        icon: Clock,
                        color: "text-violet-600",
                      },
                      { label: t.drillAvgTicket, value: fmt(selectedStaffSummary.avgTicket), icon: TrendingUp, color: "text-indigo-600" },
                    ].map(({ label, value, icon: Icon, color }) => (
                      <div key={label} className="rounded-lg border bg-slate-50 p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <Icon className={cn("h-3.5 w-3.5", color)} />
                          {label}
                        </div>
                        <p className={cn("text-xl font-bold tabular-nums", color)}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {staffServiceBreakdown.filter(s => s.timedCount > 0).length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-3 text-slate-700">{t.setDurVsAvgActual}</p>
                      <ResponsiveContainer width="100%" height={Math.max(160, staffServiceBreakdown.filter(s => s.timedCount > 0).length * 52)}>
                        <BarChart
                          data={staffServiceBreakdown.filter(s => s.timedCount > 0).map(s => ({
                            name: s.name.length > 18 ? s.name.slice(0, 17) + "…" : s.name,
                            [t.setDuration]: s.setDuration,
                            [t.avgActualLabel]: parseFloat(s.avgActualMin.toFixed(1)),
                          }))}
                          layout="vertical"
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                            tickFormatter={v => `${v}m`} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={130} />
                          <Tooltip formatter={(v: number) => [`${v} min`, undefined]} />
                          <Legend />
                          <Bar dataKey={t.setDuration} fill="#94a3b8" radius={[0, 3, 3, 0]} />
                          <Bar dataKey={t.avgActualLabel} fill="#6366f1" radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-semibold mb-3 text-slate-700">{t.serviceBreakdown}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-2 pr-4 font-medium">{t.colService}</th>
                            <th className="text-right py-2 px-3 font-medium">{t.colDone}</th>
                            <th className="text-right py-2 px-3 font-medium">{t.colRevenue}</th>
                            <th className="text-right py-2 px-3 font-medium">{t.colSetDuration}</th>
                            <th className="text-right py-2 px-3 font-medium">{t.colAvgActual}</th>
                            <th className="text-right py-2 px-3 font-medium">{t.colTotalTime}</th>
                            <th className="text-right py-2 pl-3 font-medium">{t.colVsSet}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {staffServiceBreakdown.map(s => {
                            const fmtMin = (m: number) =>
                              m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`;
                            const hasTiming = s.timedCount > 0;
                            const overMin = Math.round(s.avgOverMin);
                            const pctDev = s.setDuration > 0 ? s.avgOverMin / s.setDuration : 0;
                            let overLabel: string;
                            let overClass: string;
                            if (!hasTiming) {
                              overLabel = "—";
                              overClass = "text-muted-foreground";
                            } else if (Math.abs(pctDev) <= 0.15) {
                              overLabel = overMin === 0 ? t.onTrack : overMin > 0 ? `+${overMin}m` : `${overMin}m`;
                              overClass = "text-emerald-600 font-semibold";
                            } else if (pctDev < -0.15) {
                              overLabel = `${overMin}m — ${t.rushing}`;
                              overClass = Math.abs(pctDev) > 0.30
                                ? "text-red-600 font-semibold"
                                : "text-amber-600 font-semibold";
                            } else {
                              overLabel = `+${overMin}m — ${t.slow}`;
                              overClass = pctDev > 0.25
                                ? "text-red-600 font-semibold"
                                : "text-amber-600 font-semibold";
                            }
                            const totalActual = s.timedCount > 0 ? s.avgActualMin * s.timedCount : 0;
                            return (
                              <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                                <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{s.count}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{fmt(s.revenue)}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                                  {s.setDuration ? fmtMin(s.setDuration) : "—"}
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums">
                                  {hasTiming ? fmtMin(s.avgActualMin) : "—"}
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                                  {hasTiming ? fmtMin(totalActual) : "—"}
                                </td>
                                <td className={cn("py-2.5 pl-3 text-right tabular-nums", overClass)}>{overLabel}</td>
                              </tr>
                            );
                          })}
                          {staffServiceBreakdown.length === 0 && (
                            <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">{t.noData}</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── SERVICES TAB ──────────────────────────────────────────────── */}
          <TabsContent value="services" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{t.top10Services}</CardTitle>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7 px-2.5" disabled={serviceStats.length === 0} onClick={() => downloadCsv(
                  `services-${range}-${format(new Date(), "yyyy-MM-dd")}.csv`,
                  ["Service", "Bookings", "Revenue ($)", "Avg Ticket ($)", "Booked Duration (min)", "Avg Actual (min)", "Avg +/- (min)"],
                  serviceStats.map(s => [
                    s.name, s.bookings,
                    s.revenue.toFixed(2), s.avgTicket.toFixed(2),
                    s.bookedDur,
                    s.timedCount > 0 ? s.avgActualMin.toFixed(1) : "",
                    s.timedCount > 0 ? s.avgOverMin.toFixed(1) : "",
                  ])
                )}>
                  <Download className="h-3 w-3" />
                  CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">{t.colService}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colSvcBookings}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colRevenue}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colAvgTicket}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colBooked}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colAvgActual}</th>
                        <th className="text-right py-2 pl-4 font-medium">{t.colVsBooked}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceStats.map(s => {
                        const fmtMin = (m: number) => m >= 60
                          ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`
                          : `${Math.round(m)}m`;
                        const hasTiming = s.timedCount > 0;
                        const overMin = Math.round(s.avgOverMin);
                        const overLabel = !hasTiming
                          ? "—"
                          : overMin === 0
                            ? t.onTime
                            : overMin > 0
                              ? `+${overMin}m ${t.over}`
                              : `${overMin}m ${t.under}`;
                        const overClass = !hasTiming
                          ? "text-muted-foreground"
                          : overMin <= 0
                            ? "text-emerald-600 font-semibold"
                            : overMin <= Math.max(5, s.bookedDur * 0.15)
                              ? "text-amber-600 font-semibold"
                              : "text-red-600 font-semibold";
                        return (
                          <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                            <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                            <td className="py-2.5 px-4 text-right tabular-nums">{s.bookings}</td>
                            <td className="py-2.5 px-4 text-right tabular-nums">{fmt(s.revenue)}</td>
                            <td className="py-2.5 px-4 text-right tabular-nums">{fmt(s.avgTicket)}</td>
                            <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                              {s.bookedDur ? fmtMin(s.bookedDur) : "—"}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums">
                              {hasTiming ? fmtMin(s.avgActualMin) : "—"}
                            </td>
                            <td className={cn("py-2.5 pl-4 text-right tabular-nums", overClass)}>{overLabel}</td>
                          </tr>
                        );
                      })}
                      {serviceStats.length === 0 && (
                        <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">{t.noData}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-3">{t.timingNote}</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── CUSTOMERS TAB ─────────────────────────────────────────────── */}
          <TabsContent value="customers" className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title={t.totalCustomers} value={String((customers as any[]).length)} icon={Users} sub={t.allTime} />
              <StatCard title={t.newThisPeriod} value={String(newCustomers.length)} icon={UserCheck}
                sub={rangeLabelStr(range)} />
              <StatCard title={t.activeClients} value={String(returningCount)} icon={TrendingUp}
                sub={t.bookedInPeriod} />
              <StatCard title={t.avgSpendClient} value={fmt(returningCount ? totalRevenue / returningCount : 0)}
                icon={DollarSign} sub={t.completedApptsSub} />
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  {t.noShowRisks}
                </CardTitle>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7 px-2.5" disabled={noShowRisks.length === 0} onClick={() => downloadCsv(
                  `no-show-risks-${format(new Date(), "yyyy-MM-dd")}.csv`,
                  ["Client", "Phone", "Total Bookings", "No-Shows", "Cancels", "No-Show Rate (%)"],
                  noShowRisks.map(r => [r.name, r.phone || "", r.total, r.noShows, r.cancels, Math.round(r.rate * 100)])
                )}>
                  <Download className="h-3 w-3" />
                  CSV
                </Button>
              </CardHeader>
              <CardContent>
                {noShowRisks.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">{t.noShowEmpty}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2 pr-4 font-medium">{t.colCustomer}</th>
                          <th className="text-right py-2 px-4 font-medium">{t.colTotalBkgs}</th>
                          <th className="text-right py-2 px-4 font-medium">{t.colNoShows}</th>
                          <th className="text-right py-2 px-4 font-medium">{t.colCancels}</th>
                          <th className="text-right py-2 pl-4 font-medium">{t.colNoShowRate}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {noShowRisks.map(r => {
                          const pctVal = Math.round(r.rate * 100);
                          const cls = r.rate >= 0.5
                            ? "text-red-600 font-bold"
                            : r.rate >= 0.25
                              ? "text-amber-600 font-semibold"
                              : "text-muted-foreground";
                          return (
                            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                              <td className="py-2.5 pr-4">
                                <div className="font-medium">{r.name}</div>
                                {r.phone && <div className="text-xs text-muted-foreground">{r.phone}</div>}
                              </td>
                              <td className="py-2.5 px-4 text-right tabular-nums">{r.total}</td>
                              <td className="py-2.5 px-4 text-right tabular-nums">{r.noShows}</td>
                              <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">{r.cancels}</td>
                              <td className={cn("py-2.5 pl-4 text-right tabular-nums", cls)}>{pctVal}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="text-xs text-muted-foreground mt-3">{t.noShowNote}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{t.top10Customers}</CardTitle>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7 px-2.5" disabled={customerStats.length === 0} onClick={() => downloadCsv(
                  `top-customers-${range}-${format(new Date(), "yyyy-MM-dd")}.csv`,
                  ["Client", "Visits", "Total Spend ($)"],
                  customerStats.map(c => [c.name, c.visits, c.totalSpend.toFixed(2)])
                )}>
                  <Download className="h-3 w-3" />
                  CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">{t.colCustomer}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colVisits}</th>
                        <th className="text-right py-2 pl-4 font-medium">{t.colTotalSpend}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerStats.map((c, i) => (
                        <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                                {i + 1}
                              </span>
                              <span className="font-medium">{c.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right tabular-nums">{c.visits}</td>
                          <td className="py-2.5 pl-4 text-right tabular-nums font-semibold">{fmt(c.totalSpend)}</td>
                        </tr>
                      ))}
                      {customerStats.length === 0 && (
                        <tr><td colSpan={3} className="py-8 text-center text-muted-foreground">{t.noData}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAX TAB ─────────────────────────────────────────────────── */}
          <TabsContent value="tax" className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title={t.totalCollected12m} value={fmt(taxMonthlyRows.reduce((s, r) => s + r.total, 0))} icon={DollarSign} sub={t.last12months} />
              <StatCard title={t.serviceRevenue} value={fmt(taxMonthlyRows.reduce((s, r) => s + r.services, 0))} icon={Scissors} sub={t.exclTaxTips} />
              <StatCard title={t.taxCollected} value={fmt(taxMonthlyRows.reduce((s, r) => s + r.tax, 0))} icon={FileText} sub={t.last12months} />
              <StatCard title={t.totalTips} value={fmt(taxMonthlyRows.reduce((s, r) => s + r.tips, 0))} icon={TrendingUp} sub={t.last12months} />
            </div>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">{t.monthlyBreakdown}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.taxSubtitle}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => downloadCsv(
                    `tax-summary-${format(new Date(), "yyyy-MM")}.csv`,
                    ["Month", "Service Revenue", "Tax Collected", "Tips", "Total Collected"],
                    taxMonthlyRows.map(r => [r.month, r.services.toFixed(2), r.tax.toFixed(2), r.tips.toFixed(2), r.total.toFixed(2)])
                  )}
                >
                  <Download className="h-4 w-4" />
                  {t.exportCsv}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">{t.colMonth}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colServiceRev}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colTaxColl}</th>
                        <th className="text-right py-2 px-4 font-medium">{t.colTips}</th>
                        <th className="text-right py-2 pl-4 font-medium">{t.colTotalColl}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxMonthlyRows.map((r) => (
                        <tr key={r.month} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                          <td className="py-2.5 pr-4 font-medium">{r.month}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums">{fmt(r.services)}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums">{fmt(r.tax)}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums">{fmt(r.tips)}</td>
                          <td className="py-2.5 pl-4 text-right tabular-nums font-semibold">{fmt(r.total)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 font-bold bg-muted/30">
                        <td className="py-2.5 pr-4">{t.totalRow}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{fmt(taxMonthlyRows.reduce((s, r) => s + r.services, 0))}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{fmt(taxMonthlyRows.reduce((s, r) => s + r.tax, 0))}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{fmt(taxMonthlyRows.reduce((s, r) => s + r.tips, 0))}</td>
                        <td className="py-2.5 pl-4 text-right tabular-nums">{fmt(taxMonthlyRows.reduce((s, r) => s + r.total, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {t.taxDisclaimer}
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
