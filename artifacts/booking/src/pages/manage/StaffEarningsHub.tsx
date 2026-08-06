import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  ArrowLeft,
  ChevronRight,
  Users2,
  Settings2,
  DollarSign,
  BarChart3,
  Receipt,
  FileText,
  ClipboardList,
  Wallet,
  BookOpen,
  FileBarChart,
  UserCheck,
  ScrollText,
  Minus,
  CalendarClock,
  FileCheck2,
  Banknote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface HubCardData {
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  to: string;
}

function HubCard({ card }: { card: HubCardData }) {
  const navigate = useNavigate();
  const Icon = card.icon;
  return (
    <button
      onClick={() => navigate(card.to)}
      className="group flex items-center gap-4 rounded-2xl p-4 transition-all duration-200 text-left w-full border active:scale-[0.98]"
      style={{ background: "#17171A", borderColor: "#27272D" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#1E1E23"; e.currentTarget.style.borderColor = "#353540"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "#17171A"; e.currentTarget.style.borderColor = "#27272D"; }}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#0D0D0F" }}>
        <Icon className={cn("w-5 h-5", card.iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm mb-0.5 truncate" style={{ color: "#F2F2F5" }}>{card.title}</p>
        <p className="text-xs leading-relaxed line-clamp-2" style={{ color: "#8A8A96" }}>{card.description}</p>
      </div>
      <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: "#3A3A42" }} />
    </button>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#C9F23C" }} />
      <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "#5A5A64" }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: "#27272D" }} />
    </div>
  );
}

export default function StaffEarningsHub() {
  const navigate = useNavigate();
  const { pick } = useLanguage();

  const t = {
    title:    pick({ en: "Staff & Earnings",          vi: "Nhân Viên & Thu Nhập",       es: "Personal y Ganancias",         fr: "Équipe et Revenus" }),
    subtitle: pick({ en: "Team, pay rates, earnings reports, and payouts", vi: "Nhóm, mức lương, báo cáo và thanh toán", es: "Equipo, tarifas, informes y pagos", fr: "Équipe, rémunération, rapports et versements" }),
    teamSection:     pick({ en: "Team Management",       vi: "Quản Lý Nhóm",               es: "Gestión del Equipo",            fr: "Gestion de l'Équipe" }),
    earningsSection: pick({ en: "Earnings & Pay",        vi: "Thu Nhập & Lương",            es: "Ganancias y Pago",              fr: "Revenus et Rémunération" }),
    payoutsSection:  pick({ en: "Contractor Payouts",    vi: "Thanh Toán Nhà Thầu",         es: "Pagos a Contratistas",          fr: "Versements Prestataires" }),
  };

  const teamCards: HubCardData[] = [
    {
      title:       pick({ en: "Staff Members",        vi: "Thành Viên",              es: "Miembros del Equipo",       fr: "Membres de l'Équipe" }),
      description: pick({ en: "Add technicians, update profiles, set hours, and manage permissions.", vi: "Thêm kỹ thuật viên, cập nhật hồ sơ, đặt giờ và cấu hình quyền.", es: "Agregar técnicos, actualizar perfiles, establecer horarios y permisos.", fr: "Ajouter des techniciens, mettre à jour les profils, définir les horaires et permissions." }),
      icon: Users2,
      iconColor: "text-amber-400",
      to: "/payouts/contractors",
    },
    {
      title:       pick({ en: "Payroll Settings",      vi: "Cài Đặt Bảng Lương",      es: "Configuración de Nómina",   fr: "Paramètres de Paie" }),
      description: pick({ en: "Configure pay periods, cycles, rounding rules, and default deductions.", vi: "Thiết lập kỳ trả lương, chu kỳ, quy tắc làm tròn và khấu trừ.", es: "Configura períodos, ciclos, redondeo y deducciones predeterminadas.", fr: "Configurez les périodes, cycles, arrondi et déductions par défaut." }),
      icon: Settings2,
      iconColor: "text-slate-400",
      to: "/payroll-settings",
    },
    {
      title:       pick({ en: "Contractors",           vi: "Nhà Thầu",                es: "Contratistas",              fr: "Prestataires" }),
      description: pick({ en: "Contractor profiles, onboarding status, payout methods, and 1099 eligibility.", vi: "Hồ sơ nhà thầu, trạng thái, phương thức thanh toán và 1099.", es: "Perfiles, incorporación, métodos de pago y elegibilidad 1099.", fr: "Profils, intégration, méthodes de versement et éligibilité 1099." }),
      icon: UserCheck,
      iconColor: "text-violet-400",
      to: "/payouts/contractors",
    },
  ];

  const earningsCards: HubCardData[] = [
    {
      title:       pick({ en: "Commission Report",    vi: "Báo Cáo Hoa Hồng",        es: "Informe de Comisiones",     fr: "Rapport de Commission" }),
      description: pick({ en: "Per-staff commission breakdown — revenue, rate, and total earned for any period.", vi: "Phân tích hoa hồng — doanh thu, tỷ lệ và tổng kiếm được.", es: "Desglose por personal — ingresos, tasa y total ganado.", fr: "Détail par employé — revenus, taux et total gagné." }),
      icon: BarChart3,
      iconColor: "text-emerald-400",
      to: "/commission-report",
    },
    {
      title:       pick({ en: "Salon Earnings",        vi: "Thu Nhập Salon",           es: "Ganancias del Salón",       fr: "Revenus du Salon" }),
      description: pick({ en: "Total service revenue, tips collected, and net house earnings across any date range.", vi: "Tổng doanh thu, tiền tip và lợi nhuận thuần.", es: "Ingresos totales, propinas y ganancias netas.", fr: "Revenus totaux, pourboires et revenus nets." }),
      icon: Receipt,
      iconColor: "text-teal-400",
      to: "/salon-earnings",
    },
    {
      title:       pick({ en: "Staff Pay Summary",     vi: "Tóm Tắt Lương Nhân Viên", es: "Resumen de Pago", fr: "Résumé de Paie" }),
      description: pick({ en: "Gross pay, hours worked, service count, tips, and commission totals per person.", vi: "Lương gộp, giờ làm, số dịch vụ, tiền tip và tổng hoa hồng.", es: "Salario bruto, horas, servicios, propinas y comisiones por persona.", fr: "Salaire brut, heures, services, pourboires et commissions." }),
      icon: ClipboardList,
      iconColor: "text-cyan-400",
      to: "/staff-pay",
    },
    {
      title:       pick({ en: "Payroll",               vi: "Bảng Lương",               es: "Nómina",                    fr: "Paie" }),
      description: pick({ en: "Review period earnings, approve pay runs, and export payroll reports.", vi: "Xem thu nhập, phê duyệt bảng lương và xuất báo cáo.", es: "Revisar ganancias, aprobar pagos y exportar informes.", fr: "Réviser les revenus, approuver et exporter les rapports." }),
      icon: FileText,
      iconColor: "text-indigo-400",
      to: "/payroll",
    },
    {
      title:       pick({ en: "Earnings by Service",   vi: "Thu Nhập Theo Dịch Vụ",   es: "Ganancias por Servicio",    fr: "Revenus par Service" }),
      description: pick({ en: "Which services generate the most — ranked by revenue, bookings, and average ticket.", vi: "Dịch vụ nào tạo ra nhiều nhất — xếp hạng theo doanh thu và vé trung bình.", es: "Qué servicios generan más — clasificados por ingresos y ticket promedio.", fr: "Services les plus rentables — classés par revenus et ticket moyen." }),
      icon: FileBarChart,
      iconColor: "text-rose-400",
      to: "/commission-report",
    },
  ];

  const payoutCards: HubCardData[] = [
    {
      title:       pick({ en: "Payouts Overview",      vi: "Tổng Quan Thanh Toán",    es: "Resumen de Pagos",          fr: "Vue d'Ensemble Versements" }),
      description: pick({ en: "All contractor payout runs — pending, scheduled, and completed at a glance.", vi: "Tất cả lần thanh toán — đang chờ, đã lên lịch và đã hoàn thành.", es: "Todos los pagos — pendientes, programados y completados.", fr: "Tous les versements — en attente, planifiés et terminés." }),
      icon: Wallet,
      iconColor: "text-amber-400",
      to: "/payouts",
    },
    {
      title:       pick({ en: "Payout Run",            vi: "Chạy Thanh Toán",         es: "Ejecutar Pago",             fr: "Lancer un Versement" }),
      description: pick({ en: "Start a new contractor payout — review amounts, apply deductions, and confirm.", vi: "Khởi tạo thanh toán mới — xem xét, áp dụng khấu trừ và xác nhận.", es: "Inicia un nuevo pago — revisar, aplicar deducciones y confirmar.", fr: "Lancer un versement — réviser, déduire et confirmer." }),
      icon: Banknote,
      iconColor: "text-emerald-400",
      to: "/payouts/run",
    },
    {
      title:       pick({ en: "Payouts Ledger",        vi: "Sổ Cái Thanh Toán",       es: "Libro de Pagos",            fr: "Grand Livre Versements" }),
      description: pick({ en: "Full transaction ledger of all payouts, adjustments, and deductions.", vi: "Sổ cái đầy đủ của tất cả thanh toán, điều chỉnh và khấu trừ.", es: "Libro mayor de todos los pagos, ajustes y deducciones.", fr: "Grand livre de tous les versements, ajustements et déductions." }),
      icon: BookOpen,
      iconColor: "text-blue-400",
      to: "/payouts/ledger",
    },
    {
      title:       pick({ en: "Deductions",            vi: "Khấu Trừ",                es: "Deducciones",               fr: "Déductions" }),
      description: pick({ en: "Standing deductions — booth rent, product fees, supply charges, and custom items.", vi: "Khấu trừ cố định — tiền thuê, phí sản phẩm và các khoản tùy chỉnh.", es: "Deducciones fijas — alquiler, tarifas de productos y cargos personalizados.", fr: "Déductions fixes — loyer, frais de produits et charges personnalisées." }),
      icon: Minus,
      iconColor: "text-slate-400",
      to: "/payouts/deductions",
    },
    {
      title:       pick({ en: "Payout Schedule",       vi: "Lịch Thanh Toán",         es: "Calendario de Pagos",       fr: "Calendrier de Versements" }),
      description: pick({ en: "Automatic recurring payouts — weekly, bi-weekly, or monthly — on autopilot.", vi: "Thanh toán tự động định kỳ — hàng tuần, hai tuần hoặc hàng tháng.", es: "Pagos automáticos — semanal, quincenal o mensual.", fr: "Versements automatiques — hebdomadaires, bimensuels ou mensuels." }),
      icon: CalendarClock,
      iconColor: "text-violet-400",
      to: "/payouts/schedule",
    },
    {
      title:       pick({ en: "Tax Documents (1099)",  vi: "Tài Liệu Thuế (1099)",    es: "Documentos Fiscales (1099)", fr: "Documents Fiscaux (1099)" }),
      description: pick({ en: "Generate and distribute 1099-NEC forms. Track who's reached the filing threshold.", vi: "Tạo và phân phối mẫu 1099-NEC. Theo dõi ngưỡng khai thuế.", es: "Genera y distribuye 1099-NEC. Sigue quién alcanzó el umbral.", fr: "Générez les 1099-NEC. Suivez les prestataires ayant atteint le seuil." }),
      icon: ScrollText,
      iconColor: "text-rose-400",
      to: "/payouts/tax-docs",
    },
    {
      title:       pick({ en: "Payouts Reports",       vi: "Báo Cáo Thanh Toán",      es: "Informes de Pagos",         fr: "Rapports de Versements" }),
      description: pick({ en: "Payout history — per-contractor totals, period breakdowns, and export.", vi: "Lịch sử thanh toán — tổng theo nhà thầu, phân tích và xuất.", es: "Historial de pagos — totales, desglose y exportación.", fr: "Historique — totaux par prestataire, détails et export." }),
      icon: FileCheck2,
      iconColor: "text-indigo-400",
      to: "/payouts/reports",
    },
    {
      title:       pick({ en: "Commission Payouts",    vi: "Thanh Toán Hoa Hồng",     es: "Pagos de Comisiones",       fr: "Versements de Commissions" }),
      description: pick({ en: "Detailed commission breakdown per payout run — by service, staff member, and period.", vi: "Phân tích hoa hồng chi tiết — theo dịch vụ, nhân viên và kỳ.", es: "Desglose de comisiones por ejecución — servicio, miembro y período.", fr: "Détail des commissions par versement — service, membre et période." }),
      icon: DollarSign,
      iconColor: "text-orange-400",
      to: "/payouts/commissions",
    },
  ];

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto pb-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/manage")}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors border"
            style={{ background: "#17171A", borderColor: "#27272D" }}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: "#8A8A96" }} />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#F2F2F5", fontFamily: "'Outfit', sans-serif" }}>{t.title}</h1>
            <p className="text-sm mt-0.5" style={{ color: "#8A8A96" }}>{t.subtitle}</p>
          </div>
        </div>

        <div className="space-y-8">
          {/* Team Management */}
          <div>
            <SectionHeader label={t.teamSection} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {teamCards.map((c) => <HubCard key={c.to + c.title} card={c} />)}
            </div>
          </div>

          {/* Earnings & Pay */}
          <div>
            <SectionHeader label={t.earningsSection} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {earningsCards.map((c) => <HubCard key={c.to + c.title} card={c} />)}
            </div>
          </div>

          {/* Contractor Payouts */}
          <div>
            <SectionHeader label={t.payoutsSection} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {payoutCards.map((c) => <HubCard key={c.to + c.title} card={c} />)}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
