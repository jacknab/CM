import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  ArrowLeft,
  ChevronRight,
  Monitor,
  Settings2,
  Layers,
  Users2 as UsersIcon,
  BarChart3,
  Receipt,
  CreditCard,
  DollarSign,
  FileText,
  Wallet,
  BookOpen,
  ClipboardList,
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

export default function FinancePosHub() {
  const navigate = useNavigate();
  const { pick } = useLanguage();

  const t = {
    title:    pick({ en: "Finance & POS",         vi: "Tài Chính & POS",       es: "Finanzas y PDV",          fr: "Finances et PDV" }),
    subtitle: pick({ en: "Financial reports and point-of-sale tools", vi: "Báo cáo tài chính và công cụ bán hàng", es: "Informes financieros y herramientas de venta", fr: "Rapports financiers et outils de vente" }),
    posSection:      pick({ en: "Point of Sale",         vi: "Điểm Bán Hàng",          es: "Punto de Venta",          fr: "Point de Vente" }),
    reportsSection:  pick({ en: "Financial Reports",     vi: "Báo Cáo Tài Chính",      es: "Informes Financieros",    fr: "Rapports Financiers" }),
    payoutsSection:  pick({ en: "Payouts",               vi: "Thanh Toán",              es: "Pagos",                   fr: "Versements" }),
  };

  const posCards: HubCardData[] = [
    {
      title: pick({ en: "POS Register",     vi: "Máy Tính Tiền",       es: "Caja Registradora",   fr: "Caisse Enregistreuse" }),
      description: pick({ en: "Open the register to process payments, charge services, and handle walk-in transactions.", vi: "Mở màn hình để xử lý thanh toán, tính phí dịch vụ và giao dịch.", es: "Abre la caja para cobrar servicios y procesar pagos.", fr: "Ouvrez la caisse pour facturer les services et traiter les paiements." }),
      icon: Monitor,
      iconColor: "text-emerald-400",
      to: "/pos",
    },
    {
      title: pick({ en: "POS Settings",      vi: "Cài Đặt POS",         es: "Ajustes de Caja",     fr: "Paramètres Caisse" }),
      description: pick({ en: "Tax rates, payment methods, receipt options, and register preferences.", vi: "Thuế suất, phương thức thanh toán, tùy chọn biên lai và cài đặt.", es: "Impuestos, métodos de pago, recibos y preferencias.", fr: "Taxes, paiements, reçus et préférences de caisse." }),
      icon: Settings2,
      iconColor: "text-slate-400",
      to: "/pos-settings",
    },
    {
      title: pick({ en: "Cash Drawer",       vi: "Ngăn Kéo Tiền",       es: "Cajón de Efectivo",   fr: "Tiroir-Caisse" }),
      description: pick({ en: "Open and close drawer sessions, record cash in/out, and reconcile totals.", vi: "Mở và đóng phiên, ghi lại tiền vào/ra và đối chiếu tổng số.", es: "Abre sesiones, registra entradas/salidas y reconcilia totales.", fr: "Ouvrez les sessions, enregistrez les entrées/sorties et réconciliez." }),
      icon: Layers,
      iconColor: "text-amber-400",
      to: "/cash-drawer",
    },
    {
      title: pick({ en: "Staff Checkout",    vi: "Thanh Toán Nhân Viên", es: "Cobro del Personal",  fr: "Caisse Personnel" }),
      description: pick({ en: "Staff-facing POS mode — simplified payment and checkout flow for front desk.", vi: "Chế độ POS cho nhân viên — thanh toán đơn giản cho quầy lễ tân.", es: "Modo simplificado para recepción con flujo de pago rápido.", fr: "Mode simplifié pour la réception avec un flux de paiement rapide." }),
      icon: UsersIcon,
      iconColor: "text-blue-400",
      to: "/staff-pos",
    },
  ];

  const reportCards: HubCardData[] = [
    {
      title: pick({ en: "Commission Report",    vi: "Báo Cáo Hoa Hồng",     es: "Informe de Comisiones", fr: "Rapport de Commission" }),
      description: pick({ en: "Per-staff commission breakdown — revenue generated, rate applied, and commission earned.", vi: "Phân tích hoa hồng — doanh thu, tỷ lệ và hoa hồng.", es: "Por personal — ingresos, tasa y comisión ganada.", fr: "Par employé — revenus, taux et commission gagnée." }),
      icon: DollarSign,
      iconColor: "text-amber-400",
      to: "/commission-report",
    },
    {
      title: pick({ en: "Salon Earnings",       vi: "Thu Nhập Salon",        es: "Ganancias del Salón",   fr: "Revenus du Salon" }),
      description: pick({ en: "Service revenue, tips, and house net earnings across any date range.", vi: "Doanh thu dịch vụ, tiền tip và lợi nhuận thuần.", es: "Ingresos por servicios, propinas y neto de la casa.", fr: "Revenus de services, pourboires et net de la maison." }),
      icon: Receipt,
      iconColor: "text-emerald-400",
      to: "/salon-earnings",
    },
    {
      title: pick({ en: "Register Reports",     vi: "Báo Cáo Máy Tính Tiền", es: "Informes de Caja",     fr: "Rapports de Caisse" }),
      description: pick({ en: "Session summaries — opens, closes, sales totals, and cash logs by drawer session.", vi: "Tóm tắt phiên — mở, đóng, tổng doanh số và nhật ký tiền mặt.", es: "Resúmenes de sesiones — aperturas, cierres, totales y logs.", fr: "Résumés de sessions — ouvertures, fermetures, totaux et journaux." }),
      icon: CreditCard,
      iconColor: "text-blue-400",
      to: "/register-reports",
    },
    {
      title: pick({ en: "Payroll",              vi: "Bảng Lương",            es: "Nómina",               fr: "Paie" }),
      description: pick({ en: "Commission-based payroll runs — review, approve, and export payroll periods.", vi: "Bảng lương hoa hồng — xem xét, phê duyệt và xuất kỳ lương.", es: "Nómina por comisiones — revisar, aprobar y exportar períodos.", fr: "Paie par commissions — réviser, approuver et exporter." }),
      icon: FileText,
      iconColor: "text-slate-400",
      to: "/payroll",
    },
    {
      title: pick({ en: "Staff Pay Summary",    vi: "Tóm Tắt Lương",         es: "Resumen de Nómina",     fr: "Résumé de Paie" }),
      description: pick({ en: "Gross pay, hours worked, and commission totals for all staff.", vi: "Lương gộp, giờ làm việc và tổng hoa hồng toàn nhân viên.", es: "Salario bruto, horas y totales de comisión.", fr: "Salaire brut, heures et totaux de commission." }),
      icon: ClipboardList,
      iconColor: "text-cyan-400",
      to: "/staff-pay",
    },
  ];

  const payoutCards: HubCardData[] = [
    {
      title: pick({ en: "Payouts Overview",   vi: "Tổng Quan Thanh Toán",  es: "Resumen de Pagos",      fr: "Vue d'Ensemble Versements" }),
      description: pick({ en: "All contractor payout runs — pending, completed, and scheduled.", vi: "Tất cả lần thanh toán — đang chờ, hoàn thành và đã lên lịch.", es: "Todos los pagos — pendientes, completados y programados.", fr: "Tous les versements — en attente, terminés et planifiés." }),
      icon: Wallet,
      iconColor: "text-rose-400",
      to: "/payouts",
    },
    {
      title: pick({ en: "Payouts Ledger",     vi: "Sổ Cái Thanh Toán",     es: "Libro de Pagos",        fr: "Grand Livre Versements" }),
      description: pick({ en: "Full transaction ledger of all payouts, deductions, and adjustments.", vi: "Sổ cái đầy đủ — tất cả thanh toán, khấu trừ và điều chỉnh.", es: "Libro mayor de pagos, deducciones y ajustes.", fr: "Grand livre des versements, déductions et ajustements." }),
      icon: BookOpen,
      iconColor: "text-orange-400",
      to: "/payouts/ledger",
    },
    {
      title: pick({ en: "Payouts Reports",    vi: "Báo Cáo Thanh Toán",    es: "Informes de Pagos",     fr: "Rapports de Versements" }),
      description: pick({ en: "Payout history — totals, per-contractor breakdowns, and export.", vi: "Lịch sử thanh toán — tổng, phân tích theo nhà thầu và xuất.", es: "Historial — totales, desglose por contratista y exportación.", fr: "Historique — totaux, détails et export." }),
      icon: BarChart3,
      iconColor: "text-indigo-400",
      to: "/payouts/reports",
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
          <div>
            <SectionHeader label={t.posSection} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {posCards.map((c) => <HubCard key={c.to} card={c} />)}
            </div>
          </div>

          <div>
            <SectionHeader label={t.reportsSection} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {reportCards.map((c) => <HubCard key={c.to} card={c} />)}
            </div>
          </div>

          <div>
            <SectionHeader label={t.payoutsSection} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {payoutCards.map((c) => <HubCard key={c.to} card={c} />)}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
