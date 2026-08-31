import { useEffect, useState } from "react";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { SetupFlowStrip } from "@/components/onboarding/SetupFlowStrip";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  BarChart3,
  Calendar,
  Users,
  ShoppingBag,
  Users2,
  DollarSign,
  Monitor,
  Settings,
  ChevronDown,
  Loader2,
  LayoutDashboard,
  PhoneCall,
  MapPin,
  HeadphonesIcon,
  FileBarChart,
  X,
  Sliders,
  Globe,
  Banknote,
  ShoppingCart,
  CreditCard,
  MessageSquare,
  Mail,
  Receipt,
  BookOpen,
  ClipboardList,
  Wallet,
  Layers,
  BadgeDollarSign,
  CalendarClock,
  ScrollText,
  FileCheck2,
  Zap,
  Shield,
  Tablet,
  Languages,
  ArrowLeftRight,
  FileText,
  Settings2,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

interface ManageOverview {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
}

async function fetchOverview(): Promise<ManageOverview> {
  const res = await fetch("/api/manage/overview", { credentials: "include" });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error("Failed to load overview");
  return res.json();
}

// ── Search entry type ─────────────────────────────────────────────────────────
type SearchEntry = {
  label: string;        // shown large inside card
  section: string;      // small badge under label
  sectionColor: string; // tailwind classes for badge
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  to: string;
  href?: string;
  keywords: string;     // extra search text (description + aliases)
};

// ── Card ─────────────────────────────────────────────────────────────────────
function ModuleCard({
  label,
  icon: Icon,
  iconBg,
  iconColor,
  section,
  sectionColor,
  onClick,
  className,
}: {
  label: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  section?: string;
  sectionColor?: string;
  onClick: () => void;
  className?: string;
}) {
  // Convert ALL-CAPS label to Title Case for readability
  const displayLabel = label
    .split("\n")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("\n");

  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center justify-center gap-3 rounded-2xl bg-white p-5 transition-all duration-150 cursor-pointer active:scale-[0.97] h-[136px]",
        className
      )}
      style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = ""; }}
    >
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", iconBg)}>
        <Icon className={cn("w-6 h-6", iconColor)} />
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[13px] font-semibold text-center leading-snug whitespace-pre-line text-slate-800">
          {displayLabel}
        </span>
        {section && (
          <span className={cn("text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded-full mt-0.5", sectionColor)}>
            {section}
          </span>
        )}
      </div>
    </button>
  );
}

export default function ManageDashboard() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const { pick } = useLanguage();

  const t = {
    welcomeBack:     pick({ en: "Welcome back!",           vi: "Chào mừng trở lại!",    es: "¡Bienvenido de nuevo!",   fr: "Bon retour !" }),
    searchModules:   pick({ en: "Search everything…",     vi: "Tìm kiếm mô-đun...",     es: "Buscar módulos...",        fr: "Rechercher..." }),
    noMatch:         pick({ en: "No results for",         vi: "Không có kết quả cho",    es: "Sin resultados para",     fr: "Aucun résultat pour" }),
    dashboardTab:    pick({ en: "Dashboard",               vi: "Tổng quan",               es: "Panel",                   fr: "Tableau de bord" }),
    whatToDo:        pick({ en: "What would you like to do?", vi: "Bạn muốn làm gì hôm nay?", es: "¿Qué te gustaría hacer?", fr: "Que souhaitez-vous faire ?" }),
    myBookingSite:   pick({ en: "My booking site",         vi: "Trang đặt lịch của tôi", es: "Mi página de reservas",   fr: "Mon site de réservation" }),

    // ── Module / search-index labels (shared across the top cards + search results) ──
    lblOverview:        pick({ en: "OVERVIEW",             vi: "TỔNG QUAN",                 es: "RESUMEN",                     fr: "APERÇU" }),
    lblCalendar:        pick({ en: "CALENDAR",             vi: "LỊCH",                      es: "CALENDARIO",                  fr: "CALENDRIER" }),
    lblClients:         pick({ en: "CLIENTS",              vi: "KHÁCH HÀNG",                es: "CLIENTES",                    fr: "CLIENTS" }),
    lblStaffEarnings:   pick({ en: "STAFF &\nEARNINGS",    vi: "NHÂN VIÊN &\nTHU NHẬP",     es: "PERSONAL Y\nGANANCIAS",       fr: "PERSONNEL ET\nREVENUS" }),
    lblFinancePos:      pick({ en: "FINANCE &\nPOS",       vi: "TÀI CHÍNH &\nPOS",          es: "FINANZAS Y\nPDV",             fr: "FINANCES ET\nPDV" }),
    lblWebsiteBuilder:  pick({ en: "WEBSITE\nBUILDER",     vi: "TẠO\nWEBSITE",              es: "CREADOR DE\nSITIO WEB",       fr: "CRÉATEUR DE\nSITE WEB" }),
    lblCustomerSupport: pick({ en: "CUSTOMER\nSUPPORT",    vi: "HỖ TRỢ\nKHÁCH HÀNG",        es: "SOPORTE AL\nCLIENTE",         fr: "SUPPORT\nCLIENT" }),
    lblReports:         pick({ en: "REPORTS",              vi: "BÁO CÁO",                   es: "INFORMES",                    fr: "RAPPORTS" }),
    lblSettings:        pick({ en: "SETTINGS",             vi: "CÀI ĐẶT",                   es: "AJUSTES",                     fr: "PARAMÈTRES" }),
    lblServicesProducts:pick({ en: "SERVICES &\nPRODUCTS", vi: "DỊCH VỤ &\nSẢN PHẨM",       es: "SERVICIOS Y\nPRODUCTOS",      fr: "SERVICES ET\nPRODUITS" }),
    lblAiReceptionist:  pick({ en: "AI\nRECEPTIONIST",     vi: "LỄ TÂN\nAI",                es: "RECEPCIONISTA\nIA",           fr: "RÉCEPTIONNISTE\nIA" }),
    lblGoogleBusiness:  pick({ en: "GOOGLE\nBUSINESS",     vi: "GOOGLE\nDOANH NGHIỆP",      es: "GOOGLE\nNEGOCIO",             fr: "GOOGLE\nENTREPRISE" }),
    lblSubUsage:        pick({ en: "SUBSCRIPTION\n& USAGE", vi: "GÓI DỊCH VỤ\n& SỬ DỤNG",   es: "SUSCRIPCIÓN\nY USO",          fr: "ABONNEMENT\nET USAGE" }),
    lblBizSettings:     pick({ en: "BUSINESS\nSETTINGS",   vi: "CÀI ĐẶT\nKINH DOANH",       es: "CONFIGURACIÓN\nNEGOCIO",      fr: "PARAMÈTRES\nENTREPRISE" }),
    lblBizHours:        pick({ en: "BUSINESS\nHOURS",      vi: "GIỜ\nLÀM VIỆC",             es: "HORARIO\nCOMERCIAL",          fr: "HEURES\nD'OUVERTURE" }),
    lblFeatures:        pick({ en: "FEATURES\nSETTINGS",   vi: "CÀI ĐẶT\nTÍNH NĂNG",        es: "AJUSTES DE\nFUNCIONES",       fr: "RÉGLAGES DES\nFONCTIONS" }),
    lblLanguage:        pick({ en: "LANGUAGE",             vi: "NGÔN NGỮ",                  es: "IDIOMA",                      fr: "LANGUE" }),
    lblContentTranslations: pick({ en: "CONTENT\nTRANSLATIONS", vi: "DỊCH NỘI\nDUNG",       es: "TRADUCCIONES\nDE CONTENIDO",  fr: "TRADUCTIONS\nDE CONTENU" }),
    lblKioskSettings:   pick({ en: "KIOSK\nSETTINGS",      vi: "CÀI ĐẶT\nKIOSK",            es: "AJUSTES DE\nKIOSCO",          fr: "PARAMÈTRES\nKIOSQUE" }),
    lblCalSettings:     pick({ en: "CALENDAR\nSETTINGS",   vi: "CÀI ĐẶT\nLỊCH",             es: "AJUSTES DE\nCALENDARIO",      fr: "PARAMÈTRES\nCALENDRIER" }),
    lblOnlineBooking:   pick({ en: "ONLINE\nBOOKING",      vi: "ĐẶT LỊCH\nTRỰC TUYẾN",      es: "RESERVA\nEN LÍNEA",           fr: "RÉSERVATION\nEN LIGNE" }),
    lblBookingPolicies: pick({ en: "BOOKING\nPOLICIES",    vi: "CHÍNH SÁCH\nĐẶT LỊCH",      es: "POLÍTICAS DE\nRESERVA",       fr: "POLITIQUES DE\nRÉSERVATION" }),
    lblStaffMgmt:       pick({ en: "STAFF\nMANAGEMENT",    vi: "QUẢN LÝ\nNHÂN VIÊN",        es: "GESTIÓN DE\nPERSONAL",        fr: "GESTION DU\nPERSONNEL" }),
    lblEarningsSettings:pick({ en: "EARNINGS\nSETTINGS",   vi: "CÀI ĐẶT\nTHU NHẬP",         es: "AJUSTES DE\nGANANCIAS",       fr: "PARAMÈTRES\nDE REVENUS" }),
    lblPosSettings:     pick({ en: "POS\nSETTINGS",        vi: "CÀI ĐẶT\nPOS",              es: "AJUSTES\nPDV",                fr: "PARAMÈTRES\nPDV" }),
    lblStripeConnect:   pick({ en: "STRIPE\nCONNECT",      vi: "KẾT NỐI\nSTRIPE",           es: "STRIPE\nCONECT",              fr: "STRIPE\nCONNECT" }),
    lblPayoutAccount:   pick({ en: "PAYOUT\nACCOUNT",      vi: "TÀI KHOẢN\nTHANH TOÁN",     es: "CUENTA DE\nPAGOS",            fr: "COMPTE DE\nVIREMENT" }),
    lblSmsSettings:     pick({ en: "SMS\nSETTINGS",        vi: "CÀI ĐẶT\nSMS",              es: "AJUSTES\nSMS",                fr: "PARAMÈTRES\nSMS" }),
    lblEmailSettings:   pick({ en: "EMAIL\nSETTINGS",      vi: "CÀI ĐẶT\nEMAIL",            es: "AJUSTES DE\nCORREO",          fr: "PARAMÈTRES\nEMAIL" }),
    lblDataTransfer:    pick({ en: "DATA\nTRANSFER",       vi: "CHUYỂN\nDỮ LIỆU",           es: "TRANSFERIR\nDATOS",           fr: "TRANSFERT\nDONNÉES" }),
    lblPosInterface:    pick({ en: "POS\nINTERFACE",       vi: "GIAO DIỆN\nPOS",            es: "INTERFAZ\nPDV",               fr: "INTERFACE\nPDV" }),
    lblCashDrawer:      pick({ en: "CASH\nDRAWER",         vi: "NGĂN KÉO\nTIỀN MẶT",        es: "CAJÓN DE\nEFECTIVO",          fr: "TIROIR-\nCAISSE" }),
    lblStaffPos:        pick({ en: "STAFF POS",            vi: "POS NHÂN VIÊN",             es: "PDV DEL PERSONAL",            fr: "PDV DU PERSONNEL" }),
    lblCommissionReport:pick({ en: "COMMISSION\nREPORT",   vi: "BÁO CÁO\nHOA HỒNG",         es: "INFORME DE\nCOMISIONES",      fr: "RAPPORT DE\nCOMMISSIONS" }),
    lblSalonEarnings:   pick({ en: "SALON\nEARNINGS",      vi: "THU NHẬP\nSALON",           es: "GANANCIAS\nDEL SALÓN",        fr: "REVENUS DU\nSALON" }),
    lblRegisterReports: pick({ en: "REGISTER\nREPORTS",    vi: "BÁO CÁO\nTHU NGÂN",         es: "INFORMES DE\nCAJA",           fr: "RAPPORTS DE\nCAISSE" }),
    lblPayroll:         pick({ en: "PAYROLL",              vi: "BẢNG LƯƠNG",                es: "NÓMINA",                      fr: "PAIE" }),
    lblStaffPaySummary: pick({ en: "STAFF PAY\nSUMMARY",   vi: "TỔNG HỢP\nLƯƠNG NV",        es: "RESUMEN DE\nPAGO PERSONAL",   fr: "RÉSUMÉ DE\nPAIE PERSONNEL" }),
    lblPayoutsOverview: pick({ en: "PAYOUTS\nOVERVIEW",    vi: "TỔNG QUAN\nCHI TRẢ",        es: "RESUMEN DE\nPAGOS",           fr: "APERÇU DES\nVERSEMENTS" }),
    lblPayoutsLedger:   pick({ en: "PAYOUTS\nLEDGER",      vi: "SỔ CÁI\nCHI TRẢ",           es: "LIBRO DE\nPAGOS",             fr: "REGISTRE DES\nVERSEMENTS" }),
    lblPayoutsReports:  pick({ en: "PAYOUTS\nREPORTS",     vi: "BÁO CÁO\nCHI TRẢ",          es: "INFORMES DE\nPAGOS",          fr: "RAPPORTS DE\nVERSEMENTS" }),
    lblStaffMembers:    pick({ en: "STAFF\nMEMBERS",       vi: "NHÂN VIÊN",                 es: "MIEMBROS DEL\nPERSONAL",      fr: "MEMBRES DU\nPERSONNEL" }),
    lblPayrollSettings: pick({ en: "PAYROLL\nSETTINGS",    vi: "CÀI ĐẶT\nBẢNG LƯƠNG",       es: "AJUSTES DE\nNÓMINA",          fr: "PARAMÈTRES\nDE PAIE" }),
    lblContractors:     pick({ en: "CONTRACTORS",          vi: "NHÀ THẦU",                  es: "CONTRATISTAS",                fr: "PRESTATAIRES" }),
    lblEarningsByService:pick({ en: "EARNINGS BY\nSERVICE",vi: "THU NHẬP THEO\nDỊCH VỤ",   es: "GANANCIAS POR\nSERVICIO",     fr: "REVENUS PAR\nSERVICE" }),
    lblPayoutRun:       pick({ en: "PAYOUT RUN",           vi: "ĐỢT CHI TRẢ",               es: "EJECUCIÓN DE PAGO",           fr: "EXÉCUTION DE VERSEMENT" }),
    lblDeductions:      pick({ en: "DEDUCTIONS",           vi: "KHOẢN KHẤU TRỪ",            es: "DEDUCCIONES",                 fr: "DÉDUCTIONS" }),
    lblPayoutSchedule:  pick({ en: "PAYOUT\nSCHEDULE",     vi: "LỊCH\nCHI TRẢ",             es: "PROGRAMA DE\nPAGOS",          fr: "CALENDRIER DE\nVERSEMENT" }),
    lblTaxDocs:         pick({ en: "TAX DOCS\n(1099)",     vi: "HỒ SƠ THUẾ\n(1099)",        es: "DOCS FISCALES\n(1099)",       fr: "DOCS FISCAUX\n(1099)" }),
    lblCommissionPayouts:pick({ en: "COMMISSION\nPAYOUTS", vi: "CHI TRẢ\nHOA HỒNG",         es: "PAGOS DE\nCOMISIÓN",          fr: "VERSEMENTS DE\nCOMMISSION" }),
    lblSmsInbox:        pick({ en: "SMS INBOX",            vi: "HỘP THƯ SMS",               es: "BANDEJA SMS",                 fr: "BOÎTE SMS" }),
    lblCampaigns:       pick({ en: "CAMPAIGNS",            vi: "CHIẾN DỊCH",                es: "CAMPAÑAS",                    fr: "CAMPAGNES" }),
    lblKioskCheckin:    pick({ en: "KIOSK\nCHECK-IN",      vi: "CHECK-IN\nKIOSK",           es: "CHECK-IN\nEN KIOSCO",         fr: "ENREGISTREMENT\nKIOSQUE" }),
    lblWaitlist:        pick({ en: "WAITLIST",             vi: "DANH SÁCH CHỜ",             es: "LISTA DE ESPERA",             fr: "LISTE D'ATTENTE" }),
    lblGiftCards:       pick({ en: "GIFT CARDS",           vi: "THẺ QUÀ TẶNG",              es: "TARJETAS DE REGALO",          fr: "CARTES CADEAUX" }),
    lblIntakeForms:     pick({ en: "INTAKE FORMS",         vi: "BIỂU MẪU\nTIẾP NHẬN",       es: "FORMULARIOS DE\nADMISIÓN",    fr: "FORMULAIRES\nD'ADMISSION" }),
    lblReviews:         pick({ en: "REVIEWS",              vi: "ĐÁNH GIÁ",                  es: "RESEÑAS",                     fr: "AVIS" }),
    lblCallLogs:        pick({ en: "CALL LOGS",            vi: "NHẬT KÝ CUỘC GỌI",          es: "REGISTROS DE LLAMADAS",       fr: "JOURNAUX D'APPELS" }),
    lblNewBooking:      pick({ en: "NEW\nBOOKING",         vi: "ĐẶT LỊCH\nMỚI",             es: "NUEVA\nRESERVA",              fr: "NOUVELLE\nRÉSERVATION" }),

    // ── Section badges ──
    secSettings:      pick({ en: "Settings",         vi: "Cài đặt",              es: "Ajustes",             fr: "Paramètres" }),
    secFinancePos:    pick({ en: "Finance & POS",    vi: "Tài chính & POS",      es: "Finanzas y PDV",      fr: "Finances et PDV" }),
    secStaffEarnings: pick({ en: "Staff & Earnings", vi: "Nhân viên & Thu nhập", es: "Personal y ganancias", fr: "Personnel et revenus" }),
    secCommunications:pick({ en: "Communications",   vi: "Truyền thông",         es: "Comunicaciones",      fr: "Communications" }),
    secClientExp:     pick({ en: "Client Exp.",      vi: "Trải nghiệm KH",       es: "Exp. del cliente",    fr: "Exp. client" }),
    secAiReceptionist:pick({ en: "AI Receptionist",  vi: "Lễ tân AI",            es: "Recepcionista IA",    fr: "Réceptionniste IA" }),
  };

  // ── Top-level module cards (shown when not searching) ──────────────────────
  const modules = [
    { label: t.lblOverview,        icon: BarChart3,      to: "/analytics",               iconBg: "bg-teal-100",   iconColor: "text-teal-500",   row: 0 },
    { label: t.lblCalendar,        icon: Calendar,       to: "/calendar",                iconBg: "bg-violet-100", iconColor: "text-violet-500", row: 0 },
    { label: t.lblClients,         icon: Users,          to: "/customers",               iconBg: "bg-emerald-100",iconColor: "text-emerald-500",row: 0 },
    { label: t.lblStaffEarnings,   icon: Users2,         to: "/manage/staff-earnings",   iconBg: "bg-amber-100",  iconColor: "text-amber-500",  row: 0 },
    { label: t.lblFinancePos,      icon: DollarSign,     to: "/manage/finance-pos",      iconBg: "bg-green-100",  iconColor: "text-green-600",  row: 0 },
    { label: t.lblWebsiteBuilder,  icon: Monitor,        to: "/website-builder/websites", iconBg: "bg-purple-100", iconColor: "text-purple-500", href: "/website-builder/websites", row: 1 },
    { label: t.lblCustomerSupport, icon: HeadphonesIcon, to: "/manage/customer-support",  iconBg: "bg-violet-100", iconColor: "text-violet-500", row: 1 },
    { label: t.lblReports,         icon: FileBarChart,   to: "/analytics",                iconBg: "bg-indigo-100", iconColor: "text-indigo-500", row: 1 },
    { label: t.lblSettings,        icon: Settings,       to: "/settings",                 iconBg: "bg-slate-100",  iconColor: "text-slate-500",  row: 1 },
    { label: t.lblServicesProducts,icon: ShoppingBag,    to: "/services",                 iconBg: "bg-blue-100",   iconColor: "text-blue-500",   row: 1 },
  ];

  const desktopRow0 = modules.filter(m => m.row === 0);
  const desktopRow1 = modules.filter(m => m.row === 1);

  // ── Comprehensive search index ─────────────────────────────────────────────
  const searchIndex: SearchEntry[] = [
    // Dashboard
    { label: t.lblOverview,        section: t.dashboardTab,   sectionColor: "bg-teal-100 text-teal-700",    icon: BarChart3,      iconBg: "bg-teal-100",    iconColor: "text-teal-500",    to: "/analytics",                  keywords: "analytics revenue performance charts" },
    { label: t.lblCalendar,        section: t.dashboardTab,   sectionColor: "bg-teal-100 text-teal-700",    icon: Calendar,       iconBg: "bg-violet-100",  iconColor: "text-violet-500",  to: "/calendar",                   keywords: "appointments schedule booking calendar" },
    { label: t.lblClients,         section: t.dashboardTab,   sectionColor: "bg-teal-100 text-teal-700",    icon: Users,          iconBg: "bg-emerald-100", iconColor: "text-emerald-500", to: "/customers",                  keywords: "customers clients profiles contact list" },
    { label: t.lblServicesProducts,section: t.dashboardTab,   sectionColor: "bg-teal-100 text-teal-700",    icon: ShoppingBag,    iconBg: "bg-blue-100",    iconColor: "text-blue-500",    to: "/services",                   keywords: "menu pricing retail products add-ons categories" },
    { label: t.lblAiReceptionist,  section: t.dashboardTab,   sectionColor: "bg-teal-100 text-teal-700",    icon: PhoneCall,      iconBg: "bg-rose-100",    iconColor: "text-rose-500",    to: "/manage/ai-receptionist",     keywords: "voice phone auto booking calls receptionist" },
    { label: t.lblStaffEarnings,   section: t.dashboardTab,   sectionColor: "bg-teal-100 text-teal-700",    icon: Users2,         iconBg: "bg-amber-100",   iconColor: "text-amber-500",   to: "/manage/staff-earnings",      keywords: "team payroll commission contractors pay" },
    { label: t.lblFinancePos,      section: t.dashboardTab,   sectionColor: "bg-teal-100 text-teal-700",    icon: DollarSign,     iconBg: "bg-green-100",   iconColor: "text-green-600",   to: "/manage/finance-pos",         keywords: "point of sale cash register financial reports payouts" },
    { label: t.lblWebsiteBuilder,  section: t.dashboardTab,   sectionColor: "bg-teal-100 text-teal-700",    icon: Monitor,        iconBg: "bg-purple-100",  iconColor: "text-purple-500",  to: "/website-builder/websites",   href: "/website-builder/websites", keywords: "website publish pages salon site" },
    { label: t.lblSettings,        section: t.dashboardTab,   sectionColor: "bg-teal-100 text-teal-700",    icon: Settings,       iconBg: "bg-slate-100",   iconColor: "text-slate-500",   to: "/settings",                   keywords: "configure account preferences options" },
    { label: t.lblGoogleBusiness,  section: t.dashboardTab,   sectionColor: "bg-teal-100 text-teal-700",    icon: MapPin,         iconBg: "bg-red-100",     iconColor: "text-red-500",     to: "/google-business",            keywords: "google maps listing reviews reputation" },
    { label: t.lblCustomerSupport, section: t.dashboardTab,   sectionColor: "bg-teal-100 text-teal-700",    icon: HeadphonesIcon, iconBg: "bg-violet-100",  iconColor: "text-violet-500",  to: "/manage/customer-support",    keywords: "help billing technical account support chat call" },
    { label: t.lblReports,         section: t.dashboardTab,   sectionColor: "bg-teal-100 text-teal-700",    icon: FileBarChart,   iconBg: "bg-indigo-100",  iconColor: "text-indigo-500",  to: "/analytics",                  keywords: "reports analytics sales data export" },

    // Settings
    { label: t.lblSubUsage,           section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Zap,            iconBg: "bg-amber-100",   iconColor: "text-amber-600",   to: "/billing",                    keywords: "plan billing usage limits upgrade downgrade subscription" },
    { label: t.lblBizSettings,        section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Settings,       iconBg: "bg-slate-100",   iconColor: "text-slate-600",   to: "/business-settings",          keywords: "store info name address phone logo branding" },
    { label: t.lblBizHours,           section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Calendar,       iconBg: "bg-slate-100",   iconColor: "text-slate-600",   to: "/business-hours",             keywords: "open close hours schedule days weekly" },
    { label: t.lblFeatures,           section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Sliders,        iconBg: "bg-blue-100",    iconColor: "text-blue-600",    to: "/features-settings",          keywords: "enable disable toggle features modules platform" },
    { label: t.lblLanguage,           section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Languages,      iconBg: "bg-indigo-100",  iconColor: "text-indigo-600",  to: "/language-settings",          keywords: "language locale staff display screen" },
    { label: t.lblContentTranslations,section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Languages,      iconBg: "bg-violet-100",  iconColor: "text-violet-600",  to: "/settings/translations",      keywords: "translate ai services categories language multilingual" },
    { label: t.lblKioskSettings,      section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Tablet,         iconBg: "bg-teal-100",    iconColor: "text-teal-600",    to: "/kiosk-settings",             keywords: "kiosk tablet check-in self-service QR welcome" },
    { label: t.lblCalSettings,        section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Calendar,       iconBg: "bg-violet-100",  iconColor: "text-violet-500",  to: "/calendar-settings",          keywords: "calendar view timeslots intervals booking rules" },
    { label: t.lblOnlineBooking,      section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Globe,          iconBg: "bg-orange-100",  iconColor: "text-orange-500",  to: "/online-booking",             keywords: "online booking widget public page availability" },
    { label: t.lblBookingPolicies,    section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Shield,         iconBg: "bg-red-100",     iconColor: "text-red-500",     to: "/booking-policies",           keywords: "cancellation no-show deposit policy grace period" },
    { label: t.lblStaffMgmt,          section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Users,          iconBg: "bg-indigo-100",  iconColor: "text-indigo-500",  to: "/payouts/contractors",        keywords: "staff members roles permissions profiles schedule" },
    { label: t.lblEarningsSettings,   section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Banknote,       iconBg: "bg-emerald-100", iconColor: "text-emerald-600", to: "/payroll-settings",           keywords: "pay frequency period commission payroll settings" },
    { label: t.lblPosSettings,        section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: ShoppingCart,   iconBg: "bg-teal-100",    iconColor: "text-teal-600",    to: "/pos-settings",               keywords: "tax rate point of sale receipt payment methods" },
    { label: t.lblStripeConnect,      section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: CreditCard,     iconBg: "bg-violet-100",  iconColor: "text-violet-600",  to: "/manage/payment-settings",    keywords: "stripe connect card payment processor account" },
    { label: t.lblPayoutAccount,      section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Banknote,       iconBg: "bg-emerald-100", iconColor: "text-emerald-600", to: "/settings/payout-account",    keywords: "bank account direct deposit identity verify payout" },
    { label: t.lblSmsSettings,        section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: MessageSquare,  iconBg: "bg-sky-100",     iconColor: "text-sky-500",     to: "/sms-settings",               keywords: "sms text reminders templates opt-out twilio" },
    { label: t.lblEmailSettings,      section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: Mail,           iconBg: "bg-rose-100",    iconColor: "text-rose-500",    to: "/mail-settings",              keywords: "email notifications sender mailgun preferences" },
    { label: t.lblDataTransfer,       section: t.secSettings, sectionColor: "bg-slate-100 text-slate-600",  icon: ArrowLeftRight, iconBg: "bg-orange-100",  iconColor: "text-orange-500",  to: "/manage/data-transfer",       keywords: "export import data migration backup history records" },

    // Finance & POS hub
    { label: t.lblPosInterface,     section: t.secFinancePos, sectionColor: "bg-green-100 text-green-700",  icon: Monitor,       iconBg: "bg-green-100",   iconColor: "text-green-600",   to: "/pos",                keywords: "register walk-in payments transactions checkout" },
    { label: t.lblPosSettings,      section: t.secFinancePos, sectionColor: "bg-green-100 text-green-700",  icon: Settings2,     iconBg: "bg-slate-100",   iconColor: "text-slate-600",   to: "/pos-settings",       keywords: "tax rates payment methods receipts configuration" },
    { label: t.lblCashDrawer,       section: t.secFinancePos, sectionColor: "bg-green-100 text-green-700",  icon: Layers,        iconBg: "bg-amber-100",   iconColor: "text-amber-600",   to: "/cash-drawer",        keywords: "cash drawer open close reconcile sessions" },
    { label: t.lblStaffPos,         section: t.secFinancePos, sectionColor: "bg-green-100 text-green-700",  icon: Users2,        iconBg: "bg-blue-100",    iconColor: "text-blue-600",    to: "/staff-pos",          keywords: "staff pos front desk checkout simplified" },
    { label: t.lblCommissionReport, section: t.secFinancePos, sectionColor: "bg-green-100 text-green-700",  icon: DollarSign,    iconBg: "bg-amber-100",   iconColor: "text-amber-600",   to: "/commission-report",  keywords: "commission report per staff revenue earned" },
    { label: t.lblSalonEarnings,    section: t.secFinancePos, sectionColor: "bg-green-100 text-green-700",  icon: Receipt,       iconBg: "bg-green-100",   iconColor: "text-green-600",   to: "/salon-earnings",     keywords: "salon earnings revenue tips net house summary" },
    { label: t.lblRegisterReports,  section: t.secFinancePos, sectionColor: "bg-green-100 text-green-700",  icon: CreditCard,    iconBg: "bg-blue-100",    iconColor: "text-blue-600",    to: "/register-reports",   keywords: "register reports session summary opens closes totals" },
    { label: t.lblPayroll,          section: t.secFinancePos, sectionColor: "bg-green-100 text-green-700",  icon: FileText,      iconBg: "bg-slate-100",   iconColor: "text-slate-600",   to: "/payroll",            keywords: "payroll runs approve export pay periods" },
    { label: t.lblStaffPaySummary,  section: t.secFinancePos, sectionColor: "bg-green-100 text-green-700",  icon: ClipboardList, iconBg: "bg-cyan-100",    iconColor: "text-cyan-600",    to: "/staff-pay",          keywords: "staff pay summary gross hours worked tips commission" },
    { label: t.lblPayoutsOverview,  section: t.secFinancePos, sectionColor: "bg-green-100 text-green-700",  icon: Wallet,        iconBg: "bg-rose-100",    iconColor: "text-rose-600",    to: "/payouts",            keywords: "payouts overview pending completed scheduled contractors" },
    { label: t.lblPayoutsLedger,    section: t.secFinancePos, sectionColor: "bg-green-100 text-green-700",  icon: BookOpen,      iconBg: "bg-orange-100",  iconColor: "text-orange-600",  to: "/payouts/ledger",     keywords: "ledger transactions payouts adjustments deductions" },
    { label: t.lblPayoutsReports,   section: t.secFinancePos, sectionColor: "bg-green-100 text-green-700",  icon: BarChart3,     iconBg: "bg-indigo-100",  iconColor: "text-indigo-600",  to: "/payouts/reports",    keywords: "payout reports history breakdowns export" },

    // Staff & Earnings hub
    { label: t.lblStaffMembers,      section: t.secStaffEarnings, sectionColor: "bg-amber-100 text-amber-700", icon: Users2,        iconBg: "bg-amber-100",   iconColor: "text-amber-600",   to: "/payouts/contractors",   keywords: "staff members add technician permissions working hours profiles" },
    { label: t.lblPayrollSettings,   section: t.secStaffEarnings, sectionColor: "bg-amber-100 text-amber-700", icon: Settings2,     iconBg: "bg-slate-100",   iconColor: "text-slate-600",   to: "/payroll-settings",      keywords: "payroll periods pay cycles rounding deductions" },
    { label: t.lblContractors,       section: t.secStaffEarnings, sectionColor: "bg-amber-100 text-amber-700", icon: Users,         iconBg: "bg-violet-100",  iconColor: "text-violet-600",  to: "/payouts/contractors",   keywords: "contractors onboarding payout methods 1099 tax" },
    { label: t.lblEarningsByService, section: t.secStaffEarnings, sectionColor: "bg-amber-100 text-amber-700", icon: FileBarChart,  iconBg: "bg-rose-100",    iconColor: "text-rose-600",    to: "/commission-report",     keywords: "earnings by service revenue ranked bookings average ticket" },
    { label: t.lblPayoutRun,         section: t.secStaffEarnings, sectionColor: "bg-amber-100 text-amber-700", icon: Banknote,      iconBg: "bg-green-100",   iconColor: "text-green-600",   to: "/payouts/run",           keywords: "payout run initiate contractor new confirm" },
    { label: t.lblDeductions,        section: t.secStaffEarnings, sectionColor: "bg-amber-100 text-amber-700", icon: DollarSign,    iconBg: "bg-slate-100",   iconColor: "text-slate-600",   to: "/payouts/deductions",    keywords: "deductions booth rent product fees standing charges" },
    { label: t.lblPayoutSchedule,    section: t.secStaffEarnings, sectionColor: "bg-amber-100 text-amber-700", icon: CalendarClock, iconBg: "bg-violet-100",  iconColor: "text-violet-600",  to: "/payouts/schedule",      keywords: "payout schedule automatic recurring weekly monthly" },
    { label: t.lblTaxDocs,           section: t.secStaffEarnings, sectionColor: "bg-amber-100 text-amber-700", icon: ScrollText,    iconBg: "bg-rose-100",    iconColor: "text-rose-600",    to: "/payouts/tax-docs",      keywords: "1099 tax documents forms contractors filing NEC" },
    { label: t.lblCommissionPayouts, section: t.secStaffEarnings, sectionColor: "bg-amber-100 text-amber-700", icon: FileCheck2,    iconBg: "bg-indigo-100",  iconColor: "text-indigo-600",  to: "/payouts/commissions",   keywords: "commission payouts breakdown service staff period" },

    // Communications
    { label: t.lblSmsInbox,          section: t.secCommunications, sectionColor: "bg-sky-100 text-sky-700",     icon: MessageSquare,  iconBg: "bg-sky-100",     iconColor: "text-sky-500",     to: "/sms-inbox",             keywords: "sms inbox two-way messages reply clients text" },
    { label: t.lblCampaigns,         section: t.secCommunications, sectionColor: "bg-sky-100 text-sky-700",     icon: Mail,           iconBg: "bg-indigo-100",  iconColor: "text-indigo-500",  to: "/campaigns",             keywords: "campaigns marketing sms email blast broadcast clients" },

    // Client experience
    { label: t.lblKioskCheckin,      section: t.secClientExp, sectionColor: "bg-teal-100 text-teal-700",     icon: Tablet,         iconBg: "bg-teal-100",    iconColor: "text-teal-600",    to: "/kiosk-settings",        keywords: "kiosk self check-in tablet front desk qr code" },
    { label: t.lblWaitlist,          section: t.secClientExp, sectionColor: "bg-teal-100 text-teal-700",     icon: ClipboardList,  iconBg: "bg-violet-100",  iconColor: "text-violet-500",  to: "/waitlist",              keywords: "waitlist walk-in queue real-time" },
    { label: t.lblGiftCards,         section: t.secClientExp, sectionColor: "bg-teal-100 text-teal-700",     icon: CreditCard,     iconBg: "bg-rose-100",    iconColor: "text-rose-500",    to: "/gift-cards",            keywords: "gift cards issue manage balance voucher" },
    { label: t.lblIntakeForms,       section: t.secClientExp, sectionColor: "bg-teal-100 text-teal-700",     icon: FileText,       iconBg: "bg-blue-100",    iconColor: "text-blue-500",    to: "/intake-forms",          keywords: "intake forms consent waivers client information" },
    { label: t.lblReviews,           section: t.secClientExp, sectionColor: "bg-teal-100 text-teal-700",     icon: FileBarChart,   iconBg: "bg-indigo-100",  iconColor: "text-indigo-500",  to: "/reviews",               keywords: "reviews reputation google rating feedback clients" },

    // AI Receptionist sub-pages
    { label: t.lblCallLogs,          section: t.secAiReceptionist, sectionColor: "bg-rose-100 text-rose-700", icon: FileText,       iconBg: "bg-rose-100",    iconColor: "text-rose-500",    to: "/manage/ai-receptionist/call-logs", keywords: "call logs history recordings voice AI receptionist" },

    // New booking shortcut
    { label: t.lblNewBooking,        section: t.dashboardTab,   sectionColor: "bg-teal-100 text-teal-700",  icon: Calendar,       iconBg: "bg-violet-100",  iconColor: "text-violet-500",  to: "/booking",               keywords: "new booking create appointment add" },
  ];

  // ── Filter across the full index ───────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();
  const filteredEntries = q
    ? (() => {
        const seen = new Set<string>();
        return searchIndex.filter(entry => {
          const key = entry.to + "|" + entry.label;
          if (seen.has(key)) return false;
          seen.add(key);
          const hay = (entry.label + " " + entry.section + " " + entry.keywords).toLowerCase();
          return hay.includes(q);
        });
      })()
    : null;

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const { data, isLoading, error } = useQuery<ManageOverview>({
    queryKey: ["/api/manage/overview"],
    queryFn: fetchOverview,
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (error?.message === "unauthorized") {
      navigate("/auth?redirect=/manage", { replace: true });
    }
  }, [error, navigate]);

  const overviewUser = data?.user;
  const initials = (
    [overviewUser?.firstName?.[0], overviewUser?.lastName?.[0]]
      .filter(Boolean).join("").toUpperCase() ||
    (user?.firstName?.[0] ?? user?.email?.[0] ?? "U").toUpperCase()
  );

  if (authLoading || isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  /* ─── MOBILE LAYOUT ─── */
  if (isMobile) {
    return (
      <div className="relative min-h-screen flex flex-col bg-slate-50">
        <div className="flex-1 flex flex-col px-4 pb-6" style={{ paddingTop: "68px" }}>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 px-4 bg-white border-b border-slate-100 flex items-center justify-between" style={{ height: "60px" }}>
            <span className="font-bold text-slate-900" style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.25rem", letterSpacing: "-0.03em" }}>
              Certxa
            </span>
            <button
              className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center text-white text-sm font-bold shadow-sm"
              onClick={() => navigate("/account")}
            >
              {initials}
            </button>
          </div>

          {/* Welcome */}
          <div className="mb-5 pt-2">
            <h1 className="text-[1.65rem] font-bold leading-tight text-slate-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {user?.firstName ? `Hi, ${user.firstName} 👋` : t.welcomeBack}
            </h1>
            <p className="mt-1 text-slate-500 text-base">{t.whatToDo}</p>
          </div>

          <SetupFlowStrip />

          {/* 2-col module grid */}
          <div className="grid grid-cols-2 gap-3">
            {modules.map((mod) => (
              <ModuleCard
                key={mod.to + mod.label}
                label={mod.label}
                icon={mod.icon}
                iconBg={mod.iconBg}
                iconColor={mod.iconColor}
                onClick={() => "href" in mod && mod.href ? (window.location.href = mod.href) : navigate(mod.to)}
              />
            ))}
          </div>
        </div>

        {/* Bottom nav */}
        <div
          className="bg-white border-t border-slate-100 flex items-center justify-around"
          style={{
            height: "calc(env(safe-area-inset-bottom, 0px) + 62px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <button className="flex flex-col items-center gap-1 px-6 py-2">
            <LayoutDashboard className="w-6 h-6 text-teal-500" />
            <span className="text-[11px] font-semibold text-teal-500">{t.dashboardTab}</span>
          </button>
        </div>
      </div>
    );
  }

  /* ─── DESKTOP LAYOUT ─── */
  return (
    <AppLayout>
      <div className="relative min-h-full">
        <div className="relative z-10">
          {/* ── Top bar ── */}
          <div className="flex items-center justify-end gap-3 mb-8 pt-1">
            <div className="flex items-center gap-2 rounded-full px-4 py-2 w-64 border border-slate-200 bg-white">
              <Search className="w-4 h-4 shrink-0 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
                placeholder={t.searchModules}
                className="bg-transparent outline-none text-sm w-full text-slate-800 placeholder:text-slate-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="transition-colors shrink-0 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <NotificationBell />
            <button
              className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 transition-colors border border-slate-200 bg-white hover:bg-slate-50"
              onClick={() => navigate("/account")}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: "#C9F23C", color: "#0D0D0F" }}
              >{initials}</div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>

          {/* ── Page title ── */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold leading-tight text-slate-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {user?.firstName ? `Hey, ${user.firstName} 👋` : t.welcomeBack}
              </h1>
              <p className="mt-1 text-slate-500">{t.whatToDo}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/online-booking")}
              className="hidden items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors sm:flex border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <Globe className="h-4 w-4 text-teal-500" />
              {t.myBookingSite}
            </button>
          </div>

          {/* ── Onboarding flow cards ── */}
          <SetupFlowStrip />

          {/* ── Grid / search results ── */}
          {filteredEntries ? (
            filteredEntries.length > 0 ? (
              <div className="grid grid-cols-5 gap-4">
                {filteredEntries.map((entry, i) => (
                  <ModuleCard
                    key={entry.to + "|" + i}
                    label={entry.label}
                    icon={entry.icon}
                    iconBg={entry.iconBg}
                    iconColor={entry.iconColor}
                    section={entry.section}
                    sectionColor={entry.sectionColor}
                    onClick={() => entry.href ? (window.location.href = entry.href) : navigate(entry.to)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20" style={{ color: "#5A5A64" }}>
                <Search className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">{t.noMatch} "{searchQuery}"</p>
              </div>
            )
          ) : (
            <>
              <div className="grid grid-cols-5 gap-4 mb-4">
                {desktopRow0.map((mod) => (
                  <ModuleCard key={mod.to} label={mod.label} icon={mod.icon} iconBg={mod.iconBg} iconColor={mod.iconColor}
                    onClick={() => "href" in mod && mod.href ? (window.location.href = mod.href) : navigate(mod.to)} />
                ))}
              </div>
              <div className="grid grid-cols-5 gap-4 mb-4">
                {desktopRow1.map((mod) => (
                  <ModuleCard key={mod.to} label={mod.label} icon={mod.icon} iconBg={mod.iconBg} iconColor={mod.iconColor}
                    onClick={() => "href" in mod && mod.href ? (window.location.href = mod.href) : navigate(mod.to)} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
