import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStaffList } from "@/hooks/use-staff";
import { useAppointments } from "@/hooks/use-appointments";
import { useSelectedStore } from "@/hooks/use-store";
import { formatInTz, toStoreLocal } from "@/lib/timezone";
import { isWithinInterval, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { DollarSign, Users, FileText, ChevronRight, ChevronDown, Download, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Staff, AppointmentWithDetails } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

// Processing fee constants (same as industry standard: 3.5% + $0.05 per transaction)
const PROCESSING_FEE_RATE = 0.035;
const PROCESSING_FEE_FLAT = 0.05;

type CalcMode = "total_price" | "net_sales";
type DateRange = "current_pay_period" | "this_week" | "last_week" | "this_month" | "last_month" | "custom";

type PayrollSettingsData = {
  frequency: string;
  weekStartDay: number;
  monthStartDay: number;
  semiMonthlyDay1: number;
  semiMonthlyDay2: number;
};

function getCurrentPayPeriod(s: PayrollSettingsData): { from: Date; to: Date } {
  const now = new Date();
  const today = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();

  switch (s.frequency) {
    case "weekly": {
      const diff = (now.getDay() - s.weekStartDay + 7) % 7;
      const start = startOfDay(subDays(now, diff));
      return { from: start, to: endOfDay(addDays(start, 6)) };
    }
    case "biweekly": {
      const diff = (now.getDay() - s.weekStartDay + 7) % 7;
      const thisWeekStart = startOfDay(subDays(now, diff));
      const ANCHOR = new Date(2025, 0, 6 + ((s.weekStartDay - 1 + 7) % 7));
      const msPerDay = 864e5;
      const daysSinceAnchor = Math.floor((thisWeekStart.getTime() - ANCHOR.getTime()) / msPerDay);
      const weeksSinceAnchor = Math.floor(daysSinceAnchor / 7);
      const biweeklyBlock = Math.floor(weeksSinceAnchor / 2);
      const start = startOfDay(addDays(ANCHOR, biweeklyBlock * 14));
      return { from: start, to: endOfDay(addDays(start, 13)) };
    }
    case "semimonthly": {
      const d1 = s.semiMonthlyDay1;
      const d2 = s.semiMonthlyDay2;
      if (today < d1) {
        const prevM = month === 0 ? 11 : month - 1;
        const prevY = month === 0 ? year - 1 : year;
        return {
          from: startOfDay(new Date(prevY, prevM, d2)),
          to: endOfDay(new Date(year, month, d1 - 1)),
        };
      } else if (today < d2) {
        return {
          from: startOfDay(new Date(year, month, d1)),
          to: endOfDay(new Date(year, month, d2 - 1)),
        };
      } else {
        return {
          from: startOfDay(new Date(year, month, d2)),
          to: endOfDay(endOfMonth(now)),
        };
      }
    }
    case "monthly":
    default: {
      const sd = s.monthStartDay;
      if (today >= sd) {
        return {
          from: startOfDay(new Date(year, month, sd)),
          to: endOfDay(new Date(year, month + 1, sd - 1)),
        };
      } else {
        return {
          from: startOfDay(new Date(year, month - 1, sd)),
          to: endOfDay(new Date(year, month, sd - 1)),
        };
      }
    }
  }
}

const PAYROLL_DEFAULTS: PayrollSettingsData = {
  frequency: "monthly", weekStartDay: 1, monthStartDay: 1, semiMonthlyDay1: 1, semiMonthlyDay2: 15,
};

/** Calculate the payment processing fee for a given post-discount amount */
function calcProcessingFee(postDiscountAmount: number): number {
  if (postDiscountAmount <= 0) return 0;
  return postDiscountAmount * PROCESSING_FEE_RATE + PROCESSING_FEE_FLAT;
}

export default function CommissionReport() {
  const { selectedStore } = useSelectedStore();
  const timezone = selectedStore?.timezone || "UTC";
  const payoutFrequency = selectedStore?.commissionPayoutFrequency || "monthly";
  const { pick } = useLanguage();

  const t = {
    title:            pick({ en: "Commission Earnings Report", vi: "Báo cáo hoa hồng", es: "Informe de comisiones", fr: "Rapport des commissions" }),
    subtitle:         pick({ en: "Track staff commissions based on completed services.", vi: "Theo dõi hoa hồng nhân viên dựa trên dịch vụ đã hoàn thành.", es: "Sigue las comisiones del personal según los servicios completados.", fr: "Suivez les commissions du personnel selon les services terminés." }),
    payoutFreq:       pick({ en: "Payout frequency:", vi: "Tần suất chi trả:", es: "Frecuencia de pago:", fr: "Fréquence de versement :" }),
    exportBtn:        pick({ en: "Export CSV (Summary + Detailed)", vi: "Xuất CSV (Tóm tắt + Chi tiết)", es: "Exportar CSV (Resumen + Detalle)", fr: "Exporter CSV (Résumé + Détail)" }),
    exclusionTitle:   pick({ en: "Commission is not calculated on:", vi: "Hoa hồng không được tính trên:", es: "La comisión no se calcula sobre:", fr: "La commission n'est pas calculée sur :" }),
    exclusionBody:    pick({ en: "tips/gratuity (100% goes to the team member), custom checkout items, or initial package sales. Commission is earned on service and add-on sales only.", vi: "tiền tip (100% thuộc về nhân viên), mặt hàng thanh toán tùy chỉnh, hoặc gói bán ban đầu. Hoa hồng chỉ tính trên dịch vụ và dịch vụ thêm.", es: "propinas (100% para el empleado), artículos de pago personalizados o ventas de paquetes iniciales. La comisión se gana solo en servicios y complementos.", fr: "les pourboires (100% pour l'employé), les articles de caisse personnalisés ou les ventes de forfaits initiaux. La commission n'est gagnée que sur les services et suppléments." }),
    netSalesModeLabel:pick({ en: "Net Sales mode", vi: "Chế độ Doanh thu ròng", es: "Modo Ventas netas", fr: "Mode Ventes nettes" }),
    netSalesModeDesc: (rate: string, flat: string) => pick({
      en: ` deducts the payment processing fee (${rate}% + $${flat} per transaction) from each commission amount.`,
      vi: ` trừ phí xử lý thanh toán (${rate}% + $${flat} mỗi giao dịch) khỏi mỗi khoản hoa hồng.`,
      es: ` deduce la tarifa de procesamiento de pago (${rate}% + $${flat} por transacción) de cada monto de comisión.`,
      fr: ` déduit les frais de traitement des paiements (${rate}% + ${flat} $ par transaction) de chaque montant de commission.`,
    }),
    commissionBasis:  pick({ en: "Commission Basis", vi: "Cơ sở hoa hồng", es: "Base de comisión", fr: "Base de commission" }),
    totalPriceBtn:    pick({ en: "Total Price", vi: "Tổng giá", es: "Precio total", fr: "Prix total" }),
    totalPriceTip:    pick({ en: "Commission on (price − discount) × rate", vi: "Hoa hồng trên (giá − giảm giá) × tỷ lệ", es: "Comisión sobre (precio − descuento) × tasa", fr: "Commission sur (prix − remise) × taux" }),
    netSalesBtn:      pick({ en: "Net Sales", vi: "Doanh thu ròng", es: "Ventas netas", fr: "Ventes nettes" }),
    netSalesTip:      pick({ en: "Commission after deducting payment processing fees", vi: "Hoa hồng sau khi trừ phí xử lý thanh toán", es: "Comisión después de deducir tarifas de procesamiento", fr: "Commission après déduction des frais de traitement" }),
    period:           pick({ en: "Period", vi: "Kỳ hạn", es: "Período", fr: "Période" }),
    currentPayPeriod: pick({ en: "Current Pay Period", vi: "Kỳ trả lương hiện tại", es: "Período de pago actual", fr: "Période de paie actuelle" }),
    thisWeek:         pick({ en: "This Week", vi: "Tuần này", es: "Esta semana", fr: "Cette semaine" }),
    lastWeek:         pick({ en: "Last Week", vi: "Tuần trước", es: "Semana pasada", fr: "Semaine dernière" }),
    thisMonth:        pick({ en: "This Month", vi: "Tháng này", es: "Este mes", fr: "Ce mois" }),
    lastMonth:        pick({ en: "Last Month", vi: "Tháng trước", es: "Mes pasado", fr: "Mois dernier" }),
    customRange:      pick({ en: "Custom Range", vi: "Khoảng tùy chỉnh", es: "Rango personalizado", fr: "Plage personnalisée" }),
    from:             pick({ en: "From", vi: "Từ", es: "Desde", fr: "De" }),
    to:               pick({ en: "To", vi: "Đến", es: "Hasta", fr: "À" }),
    staff:            pick({ en: "Staff", vi: "Nhân viên", es: "Personal", fr: "Personnel" }),
    allCommissionStaff:pick({ en: "All Commission Staff", vi: "Tất cả NV hưởng hoa hồng", es: "Todo el personal con comisión", fr: "Tout le personnel commissionné" }),
    grossRevenue:     pick({ en: "Gross Revenue", vi: "Doanh thu gộp", es: "Ingresos brutos", fr: "Revenu brut" }),
    discountsSuffix:  (n: string) => pick({ en: `−$${n} discounts`, vi: `−$${n} giảm giá`, es: `−$${n} descuentos`, fr: `−${n} $ remises` }),
    totalCommissions: pick({ en: "Total Commissions", vi: "Tổng hoa hồng", es: "Comisiones totales", fr: "Commissions totales" }),
    feesSuffix:       (n: string) => pick({ en: `−$${n} fees`, vi: `−$${n} phí`, es: `−$${n} tarifas`, fr: `−${n} $ frais` }),
    cardTips:         pick({ en: "Card Tips", vi: "Tip thẻ", es: "Propinas con tarjeta", fr: "Pourboires carte" }),
    commissionStaffLabel: pick({ en: "Commission Staff", vi: "NV hưởng hoa hồng", es: "Personal con comisión", fr: "Personnel commissionné" }),
    noStaffEnabled:   pick({ en: "No staff members have commission enabled.", vi: "Chưa có nhân viên nào bật hoa hồng.", es: "Ningún miembro del personal tiene comisión habilitada.", fr: "Aucun membre du personnel n'a de commission activée." }),
    enableInProfile:  pick({ en: "Enable commissions in each staff member's profile settings.", vi: "Bật hoa hồng trong cài đặt hồ sơ của từng nhân viên.", es: "Habilita comisiones en la configuración del perfil de cada empleado.", fr: "Activez les commissions dans les paramètres de profil de chaque employé." }),
    colStaffMember:   pick({ en: "Staff Member", vi: "Nhân viên", es: "Empleado", fr: "Employé" }),
    colRate:          pick({ en: "Rate", vi: "Tỷ lệ", es: "Tasa", fr: "Taux" }),
    colAppts:         pick({ en: "Appts", vi: "Lịch hẹn", es: "Citas", fr: "RDV" }),
    colDiscounts:     pick({ en: "Discounts", vi: "Giảm giá", es: "Descuentos", fr: "Remises" }),
    colPostDiscount:  pick({ en: "Post-Discount", vi: "Sau giảm giá", es: "Post-descuento", fr: "Après remise" }),
    colCommission:    pick({ en: "Commission", vi: "Hoa hồng", es: "Comisión", fr: "Commission" }),
    colTipsComm:      pick({ en: "Tips + Comm.", vi: "Tip + Hoa hồng", es: "Propinas + Com.", fr: "Pourboires + Comm." }),
    noApptsInPeriod:  pick({ en: "No completed appointments in this period.", vi: "Không có lịch hẹn hoàn thành trong kỳ này.", es: "No hay citas completadas en este período.", fr: "Aucun rendez-vous terminé dans cette période." }),
    colDateTime:      pick({ en: "Date & Time", vi: "Ngày & Giờ", es: "Fecha y hora", fr: "Date et heure" }),
    colClient:        pick({ en: "Client", vi: "Khách hàng", es: "Cliente", fr: "Client" }),
    colService:       pick({ en: "Service", vi: "Dịch vụ", es: "Servicio", fr: "Service" }),
    colAddons:        pick({ en: "Add-ons", vi: "Dịch vụ thêm", es: "Complementos", fr: "Suppléments" }),
    colGross:         pick({ en: "Gross", vi: "Gộp", es: "Bruto", fr: "Brut" }),
    colDiscount:      pick({ en: "Discount", vi: "Giảm giá", es: "Descuento", fr: "Remise" }),
    colProcFee:       pick({ en: "Proc. Fee", vi: "Phí xử lý", es: "Tarifa proc.", fr: "Frais trait." }),
    colPostDisc:      pick({ en: "Post-Disc.", vi: "Sau GG", es: "Post-desc.", fr: "Après remise" }),
    colTip:           pick({ en: "Tip", vi: "Tip", es: "Propina", fr: "Pourboire" }),
    colCommTotal:     pick({ en: "Comm. (Total)", vi: "HH (Tổng)", es: "Com. (Total)", fr: "Comm. (Total)" }),
    colCommNet:       pick({ en: "Comm. (Net)", vi: "HH (Ròng)", es: "Com. (Neto)", fr: "Comm. (Net)" }),
    colTipComm:       pick({ en: "Tip + Comm.", vi: "Tip + HH", es: "Propina + Com.", fr: "Pourboire + Comm." }),
    walkIn:           pick({ en: "Walk-in", vi: "Khách vãng lai", es: "Sin cita", fr: "Sans rendez-vous" }),
    ticketsCount:     (n: number) => pick({ en: `${n} ticket${n !== 1 ? "s" : ""}`, vi: `${n} vé dịch vụ`, es: `${n} boleto${n !== 1 ? "s" : ""}`, fr: `${n} ticket${n !== 1 ? "s" : ""}` }),
    totals:           pick({ en: "Totals", vi: "Tổng cộng", es: "Totales", fr: "Totaux" }),
    periodLabel:      pick({ en: "Period:", vi: "Kỳ hạn:", es: "Período:", fr: "Période :" }),
    clickToExpand:    pick({ en: "Click a row to expand service tickets.", vi: "Nhấp vào một hàng để mở rộng vé dịch vụ.", es: "Haz clic en una fila para expandir los tickets.", fr: "Cliquez sur une ligne pour développer les tickets." }),
    totalPriceDef:    pick({ en: "Total Price:", vi: "Tổng giá:", es: "Precio total:", fr: "Prix total :" }),
    totalPriceFormula:pick({ en: "(price − discount) × rate", vi: "(giá − giảm giá) × tỷ lệ", es: "(precio − descuento) × tasa", fr: "(prix − remise) × taux" }),
    netSalesDef:      pick({ en: "Net Sales:", vi: "Doanh thu ròng:", es: "Ventas netas:", fr: "Ventes nettes :" }),
    netSalesFormula:  (rate: string, flat: string) => pick({
      en: `Total Price commission − processing fee (${rate}% + $${flat})`,
      vi: `Hoa hồng tổng giá − phí xử lý (${rate}% + $${flat})`,
      es: `Comisión de precio total − tarifa de procesamiento (${rate}% + $${flat})`,
      fr: `Commission prix total − frais de traitement (${rate}% + ${flat} $)`,
    }),
    // CSV export
    csvSummaryReport:  pick({ en: "SUMMARY REPORT",  vi: "BÁO CÁO TỔNG HỢP",  es: "INFORME RESUMEN",   fr: "RAPPORT RÉSUMÉ" }),
    csvDetailReport:   pick({ en: "DETAILED REPORT", vi: "BÁO CÁO CHI TIẾT",  es: "INFORME DETALLADO", fr: "RAPPORT DÉTAILLÉ" }),
    csvWalkIn:         pick({ en: "Walk-in",         vi: "Khách vãng lai",    es: "Sin cita",          fr: "Sans rendez-vous" }),
    csv: {
      staffMember:      pick({ en: "Staff Member",                 vi: "Nhân viên",                       es: "Empleado",                          fr: "Employé" }),
      commissionRate:   pick({ en: "Commission Rate (%)",          vi: "Tỷ lệ hoa hồng (%)",              es: "Tasa de comisión (%)",             fr: "Taux de commission (%)" }),
      appointments:     pick({ en: "Appointments",                 vi: "Số lịch hẹn",                     es: "Citas",                            fr: "Rendez-vous" }),
      serviceRevenue:   pick({ en: "Service Revenue ($)",          vi: "Doanh thu dịch vụ ($)",           es: "Ingresos por servicios ($)",       fr: "Revenu des services ($)" }),
      addonRevenue:     pick({ en: "Add-on Revenue ($)",           vi: "Doanh thu dịch vụ thêm ($)",      es: "Ingresos por extras ($)",          fr: "Revenu des suppléments ($)" }),
      discounts:        pick({ en: "Discounts ($)",                vi: "Giảm giá ($)",                    es: "Descuentos ($)",                   fr: "Remises ($)" }),
      postDiscountRev:  pick({ en: "Post-Discount Revenue ($)",    vi: "Doanh thu sau giảm giá ($)",      es: "Ingresos tras descuento ($)",      fr: "Revenu après remise ($)" }),
      processingFees:   pick({ en: "Processing Fees ($)",          vi: "Phí xử lý ($)",                   es: "Comisiones de procesamiento ($)",  fr: "Frais de traitement ($)" }),
      cardTips:         pick({ en: "Card Tips ($)",                vi: "Tiền tip qua thẻ ($)",            es: "Propinas con tarjeta ($)",         fr: "Pourboires par carte ($)" }),
      commTotalPrice:   pick({ en: "Commission – Total Price ($)", vi: "Hoa hồng – Tổng giá ($)",         es: "Comisión – Precio total ($)",      fr: "Commission – Prix total ($)" }),
      commNetSales:     pick({ en: "Commission – Net Sales ($)",   vi: "Hoa hồng – Doanh số ròng ($)",    es: "Comisión – Ventas netas ($)",      fr: "Commission – Ventes nettes ($)" }),
      tipsCommTotal:    pick({ en: "Tips + Commission Total ($)",  vi: "Tổng tip + hoa hồng ($)",         es: "Total propinas + comisión ($)",    fr: "Total pourboires + commission ($)" }),
      tipCommTotal:     pick({ en: "Tip + Commission Total ($)",   vi: "Tổng tip + hoa hồng ($)",         es: "Total propina + comisión ($)",     fr: "Total pourboire + commission ($)" }),
      date:             pick({ en: "Date",                         vi: "Ngày",                            es: "Fecha",                            fr: "Date" }),
      client:           pick({ en: "Client",                       vi: "Khách hàng",                      es: "Cliente",                          fr: "Client" }),
      service:          pick({ en: "Service",                      vi: "Dịch vụ",                         es: "Servicio",                         fr: "Service" }),
      addons:           pick({ en: "Add-ons",                      vi: "Dịch vụ thêm",                    es: "Extras",                           fr: "Suppléments" }),
      servicePrice:     pick({ en: "Service Price ($)",            vi: "Giá dịch vụ ($)",                 es: "Precio del servicio ($)",          fr: "Prix du service ($)" }),
      addonPrice:       pick({ en: "Add-on Price ($)",             vi: "Giá dịch vụ thêm ($)",            es: "Precio del extra ($)",             fr: "Prix du supplément ($)" }),
      grossRevenue:     pick({ en: "Gross Revenue ($)",            vi: "Doanh thu gộp ($)",               es: "Ingresos brutos ($)",              fr: "Revenu brut ($)" }),
      processingFee:    pick({ en: "Processing Fee ($)",           vi: "Phí xử lý ($)",                   es: "Comisión de procesamiento ($)",    fr: "Frais de traitement ($)" }),
      discount:         pick({ en: "Discount ($)",                 vi: "Giảm giá ($)",                    es: "Descuento ($)",                    fr: "Remise ($)" }),
      cardTip:          pick({ en: "Card Tip ($)",                 vi: "Tiền tip qua thẻ ($)",            es: "Propina con tarjeta ($)",          fr: "Pourboire par carte ($)" }),
    },
  };

  const { data: payrollSettings } = useQuery<PayrollSettingsData>({
    queryKey: ["/api/payroll-settings", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return PAYROLL_DEFAULTS;
      const res = await fetch(`/api/payroll-settings/${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) return PAYROLL_DEFAULTS;
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const { data: staffList = [] } = useStaffList();
  const { data: appointments = [] } = useAppointments();

  const [calcMode, setCalcMode] = useState<CalcMode>("total_price");
  const [dateRange, setDateRange] = useState<DateRange>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const now = new Date();
  const { from, to } = useMemo(() => {
    switch (dateRange) {
      case "current_pay_period":
        return getCurrentPayPeriod(payrollSettings ?? PAYROLL_DEFAULTS);
      case "this_week":
        return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
      case "last_week": {
        const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
        return { from: lastWeekStart, to: endOfWeek(lastWeekStart, { weekStartsOn: 1 }) };
      }
      case "this_month":
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case "last_month": {
        const lastMonthStart = startOfMonth(subDays(startOfMonth(now), 1));
        return { from: lastMonthStart, to: endOfMonth(lastMonthStart) };
      }
      case "custom":
        return {
          from: customFrom ? startOfDay(new Date(customFrom)) : subDays(now, 30),
          to: customTo ? endOfDay(new Date(customTo)) : now,
        };
      default:
        return { from: startOfMonth(now), to: endOfMonth(now) };
    }
  }, [dateRange, customFrom, customTo, payrollSettings]);

  const commissionStaff = staffList.filter((s: Staff) => s.commissionEnabled);

  const staffCommissions = useMemo(() => {
    const targetStaff = selectedStaffId === "all"
      ? commissionStaff
      : commissionStaff.filter((s: Staff) => s.id === Number(selectedStaffId));

    return targetStaff.map((member: Staff) => {
      const staffAppointments = appointments.filter((apt: AppointmentWithDetails) => {
        if (apt.staffId !== member.id) return false;
        if (apt.status !== "completed") return false;
        const aptDate = toStoreLocal(apt.date, timezone);
        return isWithinInterval(aptDate, { start: from, end: to });
      });

      // Per-appointment calculations — keyed by apt.id so sorting never mis-aligns data.
      const currentRate = Number(member.commissionRate || 0) / 100;
      const aptDataById = new Map<number, {
        serviceRevenue: number; addonRevenue: number; discountAmt: number;
        grossRevenue: number; postDiscount: number; processingFee: number;
        tipAmount: number; totalPriceComm: number; netSalesComm: number;
      }>();

      for (const apt of staffAppointments) {
        const totalPaid    = Number((apt as any).totalPaid    || 0);
        const tipAmount    = Number((apt as any).tipAmount    || 0);
        const discountAmt  = Number((apt as any).discountAmount || 0);
        const addonRevenue = apt.appointmentAddons?.reduce((s: number, aa: { addon?: { price?: unknown } | null }) => s + Number(aa.addon?.price || 0), 0) || 0;

        // Prefer actual collected amount (minus tip and addons) over catalog
        // price. When the appointment was never checked out, use the price
        // frozen at completion, then the live catalogue price.
        const snapPrice = (apt as any).servicePrice != null ? Number((apt as any).servicePrice) : null;
        const serviceRevenue = totalPaid > 0
          ? Math.max(0, totalPaid - tipAmount - addonRevenue)
          : (snapPrice != null ? snapPrice : Number(apt.service?.price || 0));

        // Rate frozen on the appointment at completion, else the member's
        // current rate (historical rows have no snapshot).
        const aptRate = (apt as any).commissionRate != null
          ? Number((apt as any).commissionRate) / 100
          : currentRate;

        const grossRevenue  = serviceRevenue + addonRevenue;
        const postDiscount  = Math.max(0, grossRevenue - discountAmt);
        const processingFee = calcProcessingFee(postDiscount);
        const totalPriceComm = postDiscount * aptRate;
        const netSalesComm   = Math.max(0, totalPriceComm - processingFee);

        aptDataById.set(apt.id, {
          serviceRevenue, addonRevenue, discountAmt,
          grossRevenue, postDiscount, processingFee,
          tipAmount, totalPriceComm, netSalesComm,
        });
      }

      const aptValues = Array.from(aptDataById.values());
      const totalServiceRevenue  = aptValues.reduce((s, d) => s + d.serviceRevenue, 0);
      const totalAddonRevenue    = aptValues.reduce((s, d) => s + d.addonRevenue, 0);
      const totalDiscount        = aptValues.reduce((s, d) => s + d.discountAmt, 0);
      const totalGrossRevenue    = aptValues.reduce((s, d) => s + d.grossRevenue, 0);
      const totalPostDiscount    = aptValues.reduce((s, d) => s + d.postDiscount, 0);
      const totalProcessingFees  = aptValues.reduce((s, d) => s + d.processingFee, 0);
      // Tips are NEVER included in commission base — 100% goes to staff member
      const totalTips            = aptValues.reduce((s, d) => s + d.tipAmount, 0);
      const totalPriceCommission = aptValues.reduce((s, d) => s + d.totalPriceComm, 0);
      const netSalesCommission   = aptValues.reduce((s, d) => s + d.netSalesComm, 0);

      const activeCommission = calcMode === "net_sales" ? netSalesCommission : totalPriceCommission;
      const totalTipsAndCommission = totalTips + activeCommission;

      return {
        staff: member,
        appointments: staffAppointments,
        appointmentCount: staffAppointments.length,
        commissionRate: Number(member.commissionRate || 0),
        totalServiceRevenue,
        totalAddonRevenue,
        totalDiscount,
        totalGrossRevenue,
        totalPostDiscount,
        totalProcessingFees,
        totalTips,
        totalPriceCommission,
        netSalesCommission,
        activeCommission,
        totalTipsAndCommission,
        aptDataById,
      };
    });
  }, [commissionStaff, appointments, selectedStaffId, from, to, timezone, calcMode]);

  const totalCommissions       = staffCommissions.reduce((sum, sc) => sum + sc.activeCommission, 0);
  const totalTips              = staffCommissions.reduce((sum, sc) => sum + sc.totalTips, 0);
  const totalTipsAndCommissions = staffCommissions.reduce((sum, sc) => sum + sc.totalTipsAndCommission, 0);
  const totalGrossRevenue      = staffCommissions.reduce((sum, sc) => sum + sc.totalGrossRevenue, 0);
  const totalDiscounts         = staffCommissions.reduce((sum, sc) => sum + sc.totalDiscount, 0);
  const totalProcessingFees    = staffCommissions.reduce((sum, sc) => sum + sc.totalProcessingFees, 0);

  function toggleExpand(staffId: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  }

  function handleExportCSV() {
    // Summary CSV mirrors the document's described columns (O = Total Price, P = Net Sales)
    const summaryHeaders = [
      t.csv.staffMember, t.csv.commissionRate, t.csv.appointments,
      t.csv.serviceRevenue, t.csv.addonRevenue, t.csv.discounts,
      t.csv.postDiscountRev, t.csv.processingFees, t.csv.cardTips,
      t.csv.commTotalPrice, t.csv.commNetSales, t.csv.tipsCommTotal,
    ];
    const summaryRows = staffCommissions.map(sc => [
      sc.staff.name,
      sc.commissionRate,
      sc.appointmentCount,
      sc.totalServiceRevenue.toFixed(2),
      sc.totalAddonRevenue.toFixed(2),
      sc.totalDiscount.toFixed(2),
      sc.totalPostDiscount.toFixed(2),
      sc.totalProcessingFees.toFixed(2),
      sc.totalTips.toFixed(2),
      sc.totalPriceCommission.toFixed(2),
      sc.netSalesCommission.toFixed(2),
      sc.totalTipsAndCommission.toFixed(2),
    ]);

    // Detailed CSV — one row per appointment
    const detailHeaders = [
      t.csv.date, t.csv.staffMember, t.csv.commissionRate, t.csv.client,
      t.csv.service, t.csv.addons, t.csv.servicePrice, t.csv.addonPrice,
      t.csv.grossRevenue, t.csv.processingFee, t.csv.discount, t.csv.postDiscountRev,
      t.csv.cardTip, t.csv.commTotalPrice, t.csv.commNetSales, t.csv.tipCommTotal,
    ];
    const detailRows: (string | number)[][] = [];
    staffCommissions.forEach((sc, si) => {
      sc.appointments
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .forEach((apt: AppointmentWithDetails) => {
          const d = sc.aptDataById.get(apt.id);
          if (!d) return;
          const addonNames = apt.appointmentAddons?.map((aa) => aa.addon?.name).filter(Boolean).join("; ") || "";
          detailRows.push([
            formatInTz(apt.date, timezone, "yyyy-MM-dd"),
            sc.staff.name,
            sc.commissionRate,
            (apt as any).customer?.fullName || (apt as any).customer?.name || (apt as any).customerName || t.csvWalkIn,
            apt.service?.name || "",
            addonNames,
            d.serviceRevenue.toFixed(2),
            d.addonRevenue.toFixed(2),
            d.grossRevenue.toFixed(2),
            d.processingFee.toFixed(2),
            d.discountAmt.toFixed(2),
            d.postDiscount.toFixed(2),
            d.tipAmount.toFixed(2),
            d.totalPriceComm.toFixed(2),
            d.netSalesComm.toFixed(2),
            (d.tipAmount + (calcMode === "net_sales" ? d.netSalesComm : d.totalPriceComm)).toFixed(2),
          ]);
        });
    });

    const toCSV = (headers: (string | number)[], rows: (string | number)[][]) =>
      [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

    const summaryCSV = toCSV(summaryHeaders, summaryRows);
    const detailCSV  = toCSV(detailHeaders, detailRows);
    const combined   = `${t.csvSummaryReport}\n${summaryCSV}\n\n${t.csvDetailReport}\n${detailCSV}`;

    const blob = new Blob([combined], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `commissions-report-${format(from, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppLayout>
      {/* ── Header ── */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">{t.title}</h1>
          <div className="text-muted-foreground text-sm mt-1">
            {t.subtitle}{" "}
            {t.payoutFreq} <Badge variant="secondary" className="no-default-active-elevate ml-1 capitalize">{payoutFrequency}</Badge>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={staffCommissions.length === 0 || staffCommissions.every(sc => sc.appointmentCount === 0)}
          onClick={handleExportCSV}
        >
          <Download className="h-4 w-4" />
          {t.exportBtn}
        </Button>
      </div>

      {/* ── Exclusion notice ── */}
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 mb-5 text-sm text-amber-800 flex gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
        <div>
          <span className="font-semibold">{t.exclusionTitle}</span>{" "}
          {t.exclusionBody}
          {calcMode === "net_sales" && (
            <span className="block mt-0.5">
              <span className="font-semibold">{t.netSalesModeLabel}</span>
              {t.netSalesModeDesc((PROCESSING_FEE_RATE * 100).toFixed(1), PROCESSING_FEE_FLAT.toFixed(2))}
            </span>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        {/* Calculation Mode */}
        <div className="space-y-1">
          <Label className="text-xs">{t.commissionBasis}</Label>
          <div className="flex rounded-md border overflow-hidden text-sm">
            <button
              className={cn(
                "px-3 py-1.5 transition-colors",
                calcMode === "total_price"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
              onClick={() => setCalcMode("total_price")}
              title={t.totalPriceTip}
            >
              {t.totalPriceBtn}
            </button>
            <button
              className={cn(
                "px-3 py-1.5 border-l transition-colors",
                calcMode === "net_sales"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
              onClick={() => setCalcMode("net_sales")}
              title={t.netSalesTip}
            >
              {t.netSalesBtn}
            </button>
          </div>
        </div>

        {/* Period */}
        <div className="space-y-1">
          <Label className="text-xs">{t.period}</Label>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-[180px]" data-testid="select-commission-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_pay_period">{t.currentPayPeriod}</SelectItem>
              <SelectItem value="this_week">{t.thisWeek}</SelectItem>
              <SelectItem value="last_week">{t.lastWeek}</SelectItem>
              <SelectItem value="this_month">{t.thisMonth}</SelectItem>
              <SelectItem value="last_month">{t.lastMonth}</SelectItem>
              <SelectItem value="custom">{t.customRange}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {dateRange === "custom" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">{t.from}</Label>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-[160px]"
                data-testid="input-commission-from"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.to}</Label>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-[160px]"
                data-testid="input-commission-to"
              />
            </div>
          </>
        )}

        {/* Staff Filter */}
        <div className="space-y-1">
          <Label className="text-xs">{t.staff}</Label>
          <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
            <SelectTrigger className="w-[180px]" data-testid="select-commission-staff">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.allCommissionStaff}</SelectItem>
              {commissionStaff.map((s: Staff) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t.grossRevenue}</p>
              <p className="text-xl font-bold" data-testid="text-total-revenue">${totalGrossRevenue.toFixed(2)}</p>
              {totalDiscounts > 0 && (
                <p className="text-xs text-rose-500">{t.discountsSuffix(totalDiscounts.toFixed(2))}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-green-500/10">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t.totalCommissions}
                <span className="ml-1 text-[10px] bg-muted px-1 rounded">
                  {calcMode === "net_sales" ? t.netSalesBtn : t.totalPriceBtn}
                </span>
              </p>
              <p className="text-xl font-bold text-green-600" data-testid="text-total-commissions">${totalCommissions.toFixed(2)}</p>
              {calcMode === "net_sales" && totalProcessingFees > 0 && (
                <p className="text-xs text-muted-foreground">{t.feesSuffix(totalProcessingFees.toFixed(2))}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-amber-500/10">
              <DollarSign className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t.cardTips}</p>
              <p className="text-xl font-bold text-amber-600">${totalTips.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-blue-500/10">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t.commissionStaffLabel}</p>
              <p className="text-xl font-bold" data-testid="text-commission-staff-count">{commissionStaff.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {commissionStaff.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t.noStaffEnabled}</p>
            <p className="text-xs text-muted-foreground mt-1">{t.enableInProfile}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            {/* ── Summary table ── */}
            <table className="w-full text-sm" data-testid="commission-table">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="w-8 py-3 px-3" />
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t.colStaffMember}</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t.colRate}</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground">{t.colAppts}</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">{t.grossRevenue}</th>
                  <th className="text-right py-3 px-4 font-medium text-rose-500">{t.colDiscounts}</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">{t.colPostDiscount}</th>
                  <th className="text-right py-3 px-4 font-medium text-amber-600">{t.cardTips}</th>
                  {/* Column O */}
                  <th className="text-right py-3 px-4 font-medium text-green-700 whitespace-nowrap">
                    {t.colCommission}
                    <span className="block text-[10px] font-normal text-muted-foreground">{t.totalPriceBtn}</span>
                  </th>
                  {/* Column P */}
                  <th className="text-right py-3 px-4 font-medium text-green-700 whitespace-nowrap">
                    {t.colCommission}
                    <span className="block text-[10px] font-normal text-muted-foreground">{t.netSalesBtn}</span>
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-blue-700 whitespace-nowrap">
                    {t.colTipsComm}
                    <span className="block text-[10px] font-normal text-muted-foreground capitalize">{calcMode === "net_sales" ? t.netSalesBtn : t.totalPriceBtn}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {staffCommissions.map((sc) => {
                  const isExpanded = expandedIds.has(sc.staff.id);
                  return (
                    <>
                      {/* ── Staff summary row ── */}
                      <tr
                        key={`summary-${sc.staff.id}`}
                        className="border-b last:border-b-0 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                        onClick={() => toggleExpand(sc.staff.id)}
                        data-testid={`row-commission-${sc.staff.id}`}
                      >
                        <td className="py-3 px-3 text-muted-foreground">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4" />
                            : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0"
                              style={{ backgroundColor: sc.staff.color || "#3b82f6" }}
                            >
                              {sc.staff.name.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium">{sc.staff.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="secondary" className="no-default-active-elevate">{sc.commissionRate}%</Badge>
                        </td>
                        <td className="py-3 px-4 text-center">{sc.appointmentCount}</td>
                        <td className="py-3 px-4 text-right">${sc.totalGrossRevenue.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-rose-500">
                          {sc.totalDiscount > 0 ? `−$${sc.totalDiscount.toFixed(2)}` : "—"}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">${sc.totalPostDiscount.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-amber-600 font-medium">
                          {sc.totalTips > 0 ? `$${sc.totalTips.toFixed(2)}` : "—"}
                        </td>
                        {/* Col O — Total Price commission */}
                        <td className={cn(
                          "py-3 px-4 text-right font-bold",
                          calcMode === "total_price" ? "text-green-600" : "text-muted-foreground",
                        )} data-testid={`text-commission-total-price-${sc.staff.id}`}>
                          ${sc.totalPriceCommission.toFixed(2)}
                        </td>
                        {/* Col P — Net Sales commission */}
                        <td className={cn(
                          "py-3 px-4 text-right font-bold",
                          calcMode === "net_sales" ? "text-green-600" : "text-muted-foreground",
                        )} data-testid={`text-commission-net-sales-${sc.staff.id}`}>
                          ${sc.netSalesCommission.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-blue-700" data-testid={`text-total-owed-${sc.staff.id}`}>
                          ${sc.totalTipsAndCommission.toFixed(2)}
                        </td>
                      </tr>

                      {/* ── Expanded detail rows ── */}
                      {isExpanded && (
                        <tr key={`tickets-${sc.staff.id}`} className="border-b bg-muted/10">
                          <td colSpan={11} className="p-0">
                            {sc.appointments.length === 0 ? (
                              <div className="px-12 py-4 text-sm text-muted-foreground italic">
                                {t.noApptsInPeriod}
                              </div>
                            ) : (
                              <div className="px-4 py-2">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground border-b border-border/50">
                                      <th className="text-left py-2 px-3 font-medium">{t.colDateTime}</th>
                                      <th className="text-left py-2 px-3 font-medium">{t.colClient}</th>
                                      <th className="text-left py-2 px-3 font-medium">{t.colService}</th>
                                      <th className="text-left py-2 px-3 font-medium">{t.colAddons}</th>
                                      <th className="text-right py-2 px-3 font-medium">{t.colGross}</th>
                                      <th className="text-right py-2 px-3 font-medium text-rose-500">{t.colDiscount}</th>
                                      <th className="text-right py-2 px-3 font-medium text-slate-500">{t.colProcFee}</th>
                                      <th className="text-right py-2 px-3 font-medium">{t.colPostDisc}</th>
                                      <th className="text-right py-2 px-3 font-medium text-amber-600">{t.colTip}</th>
                                      {/* Col O */}
                                      <th className={cn(
                                        "text-right py-2 px-3 font-medium",
                                        calcMode === "total_price" ? "text-green-700" : "text-muted-foreground",
                                      )}>
                                        {t.colCommTotal}
                                      </th>
                                      {/* Col P */}
                                      <th className={cn(
                                        "text-right py-2 px-3 font-medium",
                                        calcMode === "net_sales" ? "text-green-700" : "text-muted-foreground",
                                      )}>
                                        {t.colCommNet}
                                      </th>
                                      <th className="text-right py-2 px-3 font-medium text-blue-700">{t.colTipComm}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sc.appointments
                                      .slice()
                                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                                      .map((apt: AppointmentWithDetails) => {
                                        const d = sc.aptDataById.get(apt.id);
                                        if (!d) return null;
                                        const addonNames = apt.appointmentAddons
                                          ?.map((aa) => aa.addon?.name)
                                          .filter(Boolean)
                                          .join(", ") || "—";
                                        const activeComm = calcMode === "net_sales" ? d.netSalesComm : d.totalPriceComm;
                                        return (
                                          <tr
                                            key={apt.id}
                                            className="border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors"
                                          >
                                            <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">
                                              {formatInTz(apt.date, timezone, "MMM d, h:mm a")}
                                            </td>
                                            <td className="py-2 px-3">
                                              {(apt as any).customer?.fullName || (apt as any).customer?.name || (apt as any).customerName || t.walkIn}
                                            </td>
                                            <td className="py-2 px-3 font-medium">
                                              {apt.service?.name || "—"}
                                            </td>
                                            <td className="py-2 px-3 text-muted-foreground">
                                              {addonNames}
                                            </td>
                                            <td className="py-2 px-3 text-right">${d.grossRevenue.toFixed(2)}</td>
                                            <td className="py-2 px-3 text-right text-rose-500">
                                              {d.discountAmt > 0 ? `−$${d.discountAmt.toFixed(2)}` : "—"}
                                            </td>
                                            <td className="py-2 px-3 text-right text-slate-500">
                                              {calcMode === "net_sales"
                                                ? `$${d.processingFee.toFixed(2)}`
                                                : <span className="text-muted-foreground">—</span>}
                                            </td>
                                            <td className="py-2 px-3 text-right font-medium">${d.postDiscount.toFixed(2)}</td>
                                            <td className="py-2 px-3 text-right text-amber-600">
                                              {d.tipAmount > 0 ? `$${d.tipAmount.toFixed(2)}` : "—"}
                                            </td>
                                            {/* Col O */}
                                            <td className={cn(
                                              "py-2 px-3 text-right font-semibold",
                                              calcMode === "total_price" ? "text-green-600" : "text-muted-foreground",
                                            )}>
                                              ${d.totalPriceComm.toFixed(2)}
                                            </td>
                                            {/* Col P */}
                                            <td className={cn(
                                              "py-2 px-3 text-right font-semibold",
                                              calcMode === "net_sales" ? "text-green-600" : "text-muted-foreground",
                                            )}>
                                              ${d.netSalesComm.toFixed(2)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-semibold text-blue-700">
                                              ${(d.tipAmount + activeComm).toFixed(2)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t border-border/50 bg-muted/20 font-semibold">
                                      <td colSpan={4} className="py-2 px-3 text-muted-foreground">
                                        {t.ticketsCount(sc.appointmentCount)}
                                      </td>
                                      <td className="py-2 px-3 text-right">${sc.totalGrossRevenue.toFixed(2)}</td>
                                      <td className="py-2 px-3 text-right text-rose-500">
                                        {sc.totalDiscount > 0 ? `−$${sc.totalDiscount.toFixed(2)}` : "—"}
                                      </td>
                                      <td className="py-2 px-3 text-right text-slate-500">
                                        {calcMode === "net_sales"
                                          ? `$${sc.totalProcessingFees.toFixed(2)}`
                                          : "—"}
                                      </td>
                                      <td className="py-2 px-3 text-right">${sc.totalPostDiscount.toFixed(2)}</td>
                                      <td className="py-2 px-3 text-right text-amber-600">
                                        {sc.totalTips > 0 ? `$${sc.totalTips.toFixed(2)}` : "—"}
                                      </td>
                                      <td className={cn(
                                        "py-2 px-3 text-right",
                                        calcMode === "total_price" ? "text-green-600" : "text-muted-foreground",
                                      )}>
                                        ${sc.totalPriceCommission.toFixed(2)}
                                      </td>
                                      <td className={cn(
                                        "py-2 px-3 text-right",
                                        calcMode === "net_sales" ? "text-green-600" : "text-muted-foreground",
                                      )}>
                                        ${sc.netSalesCommission.toFixed(2)}
                                      </td>
                                      <td className="py-2 px-3 text-right text-blue-700">${sc.totalTipsAndCommission.toFixed(2)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t font-medium">
                  <td colSpan={4} className="py-3 px-4">{t.totals}</td>
                  <td className="py-3 px-4 text-right">${totalGrossRevenue.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right text-rose-500">
                    {totalDiscounts > 0 ? `−$${totalDiscounts.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-3 px-4 text-right">
                    ${(totalGrossRevenue - totalDiscounts).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right text-amber-600">
                    {totalTips > 0 ? `$${totalTips.toFixed(2)}` : "—"}
                  </td>
                  <td className={cn(
                    "py-3 px-4 text-right font-bold",
                    calcMode === "total_price" ? "text-green-600" : "text-muted-foreground",
                  )}>
                    ${staffCommissions.reduce((s, sc) => s + sc.totalPriceCommission, 0).toFixed(2)}
                  </td>
                  <td className={cn(
                    "py-3 px-4 text-right font-bold",
                    calcMode === "net_sales" ? "text-green-600" : "text-muted-foreground",
                  )}>
                    ${staffCommissions.reduce((s, sc) => s + sc.netSalesCommission, 0).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-blue-700">${totalTipsAndCommissions.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="bg-muted/30 border-t px-4 py-2 flex flex-wrap gap-x-4 gap-y-1 items-center">
            <span className="text-xs text-muted-foreground">
              {t.periodLabel} {formatInTz(from, timezone, "MMM d, yyyy")} – {formatInTz(to, timezone, "MMM d, yyyy")}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{t.clickToExpand}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              <strong>{t.totalPriceDef}</strong> {t.totalPriceFormula}
              &nbsp;&nbsp;
              <strong>{t.netSalesDef}</strong> {t.netSalesFormula((PROCESSING_FEE_RATE * 100).toFixed(1), PROCESSING_FEE_FLAT.toFixed(2))}
            </span>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
