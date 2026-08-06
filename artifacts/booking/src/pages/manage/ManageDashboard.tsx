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
    dashboard:       pick({ en: "Here's your dashboard",  vi: "Đây là bảng điều khiển", es: "Tu panel de control",     fr: "Votre tableau de bord" }),
    searchModules:   pick({ en: "Search everything…",     vi: "Tìm kiếm mô-đun...",     es: "Buscar módulos...",        fr: "Rechercher..." }),
    noMatch:         pick({ en: "No results for",         vi: "Không có kết quả cho",    es: "Sin resultados para",     fr: "Aucun résultat pour" }),
    dashboardTab:    pick({ en: "Dashboard",               vi: "Tổng quan",               es: "Panel",                   fr: "Tableau de bord" }),
  };

  // ── Top-level module cards (shown when not searching) ──────────────────────
  const modules = [
    { label: "OVERVIEW",           icon: BarChart3,      to: "/analytics",               iconBg: "bg-teal-100",   iconColor: "text-teal-500",   row: 0 },
    { label: "CALENDAR",           icon: Calendar,       to: "/calendar",                iconBg: "bg-violet-100", iconColor: "text-violet-500", row: 0 },
    { label: "CLIENTS",            icon: Users,          to: "/customers",               iconBg: "bg-emerald-100",iconColor: "text-emerald-500",row: 0 },
    { label: "STAFF &\nEARNINGS", icon: Users2,         to: "/manage/staff-earnings",   iconBg: "bg-amber-100",  iconColor: "text-amber-500",  row: 0 },
    { label: "FINANCE &\nPOS",    icon: DollarSign,     to: "/manage/finance-pos",      iconBg: "bg-green-100",  iconColor: "text-green-600",  row: 0 },
    { label: "WEBSITE\nBUILDER",    icon: Monitor,        to: "/website-builder/websites", iconBg: "bg-purple-100", iconColor: "text-purple-500", href: "/website-builder/websites", row: 1 },
    { label: "CUSTOMER\nSUPPORT",  icon: HeadphonesIcon, to: "/manage/customer-support",  iconBg: "bg-violet-100", iconColor: "text-violet-500", row: 1 },
    { label: "REPORTS",             icon: FileBarChart,   to: "/analytics",                iconBg: "bg-indigo-100", iconColor: "text-indigo-500", row: 1 },
    { label: "SETTINGS",            icon: Settings,       to: "/settings",                 iconBg: "bg-slate-100",  iconColor: "text-slate-500",  row: 1 },
    { label: "SERVICES &\nPRODUCTS",icon: ShoppingBag,   to: "/services",                 iconBg: "bg-blue-100",   iconColor: "text-blue-500",   row: 1 },
  ];

  const desktopRow0 = modules.filter(m => m.row === 0);
  const desktopRow1 = modules.filter(m => m.row === 1);

  // ── Comprehensive search index ─────────────────────────────────────────────
  const searchIndex: SearchEntry[] = [
    // Dashboard
    { label: "OVERVIEW",           section: "Dashboard",      sectionColor: "bg-teal-100 text-teal-700",    icon: BarChart3,      iconBg: "bg-teal-100",    iconColor: "text-teal-500",    to: "/analytics",                  keywords: "analytics revenue performance charts" },
    { label: "CALENDAR",           section: "Dashboard",      sectionColor: "bg-teal-100 text-teal-700",    icon: Calendar,       iconBg: "bg-violet-100",  iconColor: "text-violet-500",  to: "/calendar",                   keywords: "appointments schedule booking calendar" },
    { label: "CLIENTS",            section: "Dashboard",      sectionColor: "bg-teal-100 text-teal-700",    icon: Users,          iconBg: "bg-emerald-100", iconColor: "text-emerald-500", to: "/customers",                  keywords: "customers clients profiles contact list" },
    { label: "SERVICES &\nPRODUCTS",section: "Dashboard",     sectionColor: "bg-teal-100 text-teal-700",    icon: ShoppingBag,    iconBg: "bg-blue-100",    iconColor: "text-blue-500",    to: "/services",                   keywords: "menu pricing retail products add-ons categories" },
    { label: "AI\nRECEPTIONIST",  section: "Dashboard",      sectionColor: "bg-teal-100 text-teal-700",    icon: PhoneCall,      iconBg: "bg-rose-100",    iconColor: "text-rose-500",    to: "/manage/ai-receptionist",     keywords: "voice phone auto booking calls receptionist" },
    { label: "STAFF &\nEARNINGS", section: "Dashboard",      sectionColor: "bg-teal-100 text-teal-700",    icon: Users2,         iconBg: "bg-amber-100",   iconColor: "text-amber-500",   to: "/manage/staff-earnings",      keywords: "team payroll commission contractors pay" },
    { label: "FINANCE &\nPOS",    section: "Dashboard",      sectionColor: "bg-teal-100 text-teal-700",    icon: DollarSign,     iconBg: "bg-green-100",   iconColor: "text-green-600",   to: "/manage/finance-pos",         keywords: "point of sale cash register financial reports payouts" },
    { label: "WEBSITE\nBUILDER",  section: "Dashboard",      sectionColor: "bg-teal-100 text-teal-700",    icon: Monitor,        iconBg: "bg-purple-100",  iconColor: "text-purple-500",  to: "/website-builder/websites",   href: "/website-builder/websites", keywords: "website publish pages salon site" },
    { label: "SETTINGS",          section: "Dashboard",      sectionColor: "bg-teal-100 text-teal-700",    icon: Settings,       iconBg: "bg-slate-100",   iconColor: "text-slate-500",   to: "/settings",                   keywords: "configure account preferences options" },
    { label: "GOOGLE\nBUSINESS",  section: "Dashboard",      sectionColor: "bg-teal-100 text-teal-700",    icon: MapPin,         iconBg: "bg-red-100",     iconColor: "text-red-500",     to: "/google-business",            keywords: "google maps listing reviews reputation" },
    { label: "CUSTOMER\nSUPPORT", section: "Dashboard",      sectionColor: "bg-teal-100 text-teal-700",    icon: HeadphonesIcon, iconBg: "bg-violet-100",  iconColor: "text-violet-500",  to: "/manage/customer-support",    keywords: "help billing technical account support chat call" },
    { label: "REPORTS",           section: "Dashboard",      sectionColor: "bg-teal-100 text-teal-700",    icon: FileBarChart,   iconBg: "bg-indigo-100",  iconColor: "text-indigo-500",  to: "/analytics",                  keywords: "reports analytics sales data export" },

    // Settings
    { label: "SUBSCRIPTION\n& USAGE",  section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Zap,            iconBg: "bg-amber-100",   iconColor: "text-amber-600",   to: "/billing",                    keywords: "plan billing usage limits upgrade downgrade subscription" },
    { label: "BUSINESS\nSETTINGS",     section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Settings,       iconBg: "bg-slate-100",   iconColor: "text-slate-600",   to: "/business-settings",          keywords: "store info name address phone logo branding" },
    { label: "BUSINESS\nHOURS",        section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Calendar,       iconBg: "bg-slate-100",   iconColor: "text-slate-600",   to: "/business-hours",             keywords: "open close hours schedule days weekly" },
    { label: "FEATURES\nSETTINGS",     section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Sliders,        iconBg: "bg-blue-100",    iconColor: "text-blue-600",    to: "/features-settings",          keywords: "enable disable toggle features modules platform" },
    { label: "LANGUAGE",               section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Languages,      iconBg: "bg-indigo-100",  iconColor: "text-indigo-600",  to: "/language-settings",          keywords: "language locale staff display screen" },
    { label: "CONTENT\nTRANSLATIONS",  section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Languages,      iconBg: "bg-violet-100",  iconColor: "text-violet-600",  to: "/settings/translations",      keywords: "translate ai services categories language multilingual" },
    { label: "KIOSK\nSETTINGS",        section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Tablet,         iconBg: "bg-teal-100",    iconColor: "text-teal-600",    to: "/kiosk-settings",             keywords: "kiosk tablet check-in self-service QR welcome" },
    { label: "CALENDAR\nSETTINGS",     section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Calendar,       iconBg: "bg-violet-100",  iconColor: "text-violet-500",  to: "/calendar-settings",          keywords: "calendar view timeslots intervals booking rules" },
    { label: "ONLINE\nBOOKING",        section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Globe,          iconBg: "bg-orange-100",  iconColor: "text-orange-500",  to: "/online-booking",             keywords: "online booking widget public page availability" },
    { label: "BOOKING\nPOLICIES",      section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Shield,         iconBg: "bg-red-100",     iconColor: "text-red-500",     to: "/booking-policies",           keywords: "cancellation no-show deposit policy grace period" },
    { label: "STAFF\nMANAGEMENT",      section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Users,          iconBg: "bg-indigo-100",  iconColor: "text-indigo-500",  to: "/payouts/contractors",        keywords: "staff members roles permissions profiles schedule" },
    { label: "EARNINGS\nSETTINGS",     section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Banknote,       iconBg: "bg-emerald-100", iconColor: "text-emerald-600", to: "/payroll-settings",           keywords: "pay frequency period commission payroll settings" },
    { label: "POS\nSETTINGS",          section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: ShoppingCart,   iconBg: "bg-teal-100",    iconColor: "text-teal-600",    to: "/pos-settings",               keywords: "tax rate point of sale receipt payment methods" },
    { label: "STRIPE\nCONNECT",        section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: CreditCard,     iconBg: "bg-violet-100",  iconColor: "text-violet-600",  to: "/manage/payment-settings",    keywords: "stripe connect card payment processor account" },
    { label: "PAYOUT\nACCOUNT",        section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Banknote,       iconBg: "bg-emerald-100", iconColor: "text-emerald-600", to: "/settings/payout-account",    keywords: "bank account direct deposit identity verify payout" },
    { label: "SMS\nSETTINGS",          section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: MessageSquare,  iconBg: "bg-sky-100",     iconColor: "text-sky-500",     to: "/sms-settings",               keywords: "sms text reminders templates opt-out twilio" },
    { label: "EMAIL\nSETTINGS",        section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: Mail,           iconBg: "bg-rose-100",    iconColor: "text-rose-500",    to: "/mail-settings",              keywords: "email notifications sender mailgun preferences" },
    { label: "DATA\nTRANSFER",         section: "Settings", sectionColor: "bg-slate-100 text-slate-600",  icon: ArrowLeftRight, iconBg: "bg-orange-100",  iconColor: "text-orange-500",  to: "/manage/data-transfer",       keywords: "export import data migration backup history records" },

    // Finance & POS hub
    { label: "POS\nINTERFACE",         section: "Finance & POS", sectionColor: "bg-green-100 text-green-700",  icon: Monitor,       iconBg: "bg-green-100",   iconColor: "text-green-600",   to: "/pos",                keywords: "register walk-in payments transactions checkout" },
    { label: "POS\nSETTINGS",          section: "Finance & POS", sectionColor: "bg-green-100 text-green-700",  icon: Settings2,     iconBg: "bg-slate-100",   iconColor: "text-slate-600",   to: "/pos-settings",       keywords: "tax rates payment methods receipts configuration" },
    { label: "CASH\nDRAWER",           section: "Finance & POS", sectionColor: "bg-green-100 text-green-700",  icon: Layers,        iconBg: "bg-amber-100",   iconColor: "text-amber-600",   to: "/cash-drawer",        keywords: "cash drawer open close reconcile sessions" },
    { label: "STAFF POS",              section: "Finance & POS", sectionColor: "bg-green-100 text-green-700",  icon: Users2,        iconBg: "bg-blue-100",    iconColor: "text-blue-600",    to: "/staff-pos",          keywords: "staff pos front desk checkout simplified" },
    { label: "COMMISSION\nREPORT",     section: "Finance & POS", sectionColor: "bg-green-100 text-green-700",  icon: DollarSign,    iconBg: "bg-amber-100",   iconColor: "text-amber-600",   to: "/commission-report",  keywords: "commission report per staff revenue earned" },
    { label: "SALON\nEARNINGS",        section: "Finance & POS", sectionColor: "bg-green-100 text-green-700",  icon: Receipt,       iconBg: "bg-green-100",   iconColor: "text-green-600",   to: "/salon-earnings",     keywords: "salon earnings revenue tips net house summary" },
    { label: "REGISTER\nREPORTS",      section: "Finance & POS", sectionColor: "bg-green-100 text-green-700",  icon: CreditCard,    iconBg: "bg-blue-100",    iconColor: "text-blue-600",    to: "/register-reports",   keywords: "register reports session summary opens closes totals" },
    { label: "PAYROLL",                section: "Finance & POS", sectionColor: "bg-green-100 text-green-700",  icon: FileText,      iconBg: "bg-slate-100",   iconColor: "text-slate-600",   to: "/payroll",            keywords: "payroll runs approve export pay periods" },
    { label: "STAFF PAY\nSUMMARY",     section: "Finance & POS", sectionColor: "bg-green-100 text-green-700",  icon: ClipboardList, iconBg: "bg-cyan-100",    iconColor: "text-cyan-600",    to: "/staff-pay",          keywords: "staff pay summary gross hours worked tips commission" },
    { label: "PAYOUTS\nOVERVIEW",      section: "Finance & POS", sectionColor: "bg-green-100 text-green-700",  icon: Wallet,        iconBg: "bg-rose-100",    iconColor: "text-rose-600",    to: "/payouts",            keywords: "payouts overview pending completed scheduled contractors" },
    { label: "PAYOUTS\nLEDGER",        section: "Finance & POS", sectionColor: "bg-green-100 text-green-700",  icon: BookOpen,      iconBg: "bg-orange-100",  iconColor: "text-orange-600",  to: "/payouts/ledger",     keywords: "ledger transactions payouts adjustments deductions" },
    { label: "PAYOUTS\nREPORTS",       section: "Finance & POS", sectionColor: "bg-green-100 text-green-700",  icon: BarChart3,     iconBg: "bg-indigo-100",  iconColor: "text-indigo-600",  to: "/payouts/reports",    keywords: "payout reports history breakdowns export" },

    // Staff & Earnings hub
    { label: "STAFF\nMEMBERS",         section: "Staff & Earnings", sectionColor: "bg-amber-100 text-amber-700", icon: Users2,        iconBg: "bg-amber-100",   iconColor: "text-amber-600",   to: "/payouts/contractors",   keywords: "staff members add technician permissions working hours profiles" },
    { label: "PAYROLL\nSETTINGS",      section: "Staff & Earnings", sectionColor: "bg-amber-100 text-amber-700", icon: Settings2,     iconBg: "bg-slate-100",   iconColor: "text-slate-600",   to: "/payroll-settings",      keywords: "payroll periods pay cycles rounding deductions" },
    { label: "CONTRACTORS",            section: "Staff & Earnings", sectionColor: "bg-amber-100 text-amber-700", icon: Users,         iconBg: "bg-violet-100",  iconColor: "text-violet-600",  to: "/payouts/contractors",   keywords: "contractors onboarding payout methods 1099 tax" },
    { label: "EARNINGS BY\nSERVICE",   section: "Staff & Earnings", sectionColor: "bg-amber-100 text-amber-700", icon: FileBarChart,  iconBg: "bg-rose-100",    iconColor: "text-rose-600",    to: "/commission-report",     keywords: "earnings by service revenue ranked bookings average ticket" },
    { label: "PAYOUT RUN",             section: "Staff & Earnings", sectionColor: "bg-amber-100 text-amber-700", icon: Banknote,      iconBg: "bg-green-100",   iconColor: "text-green-600",   to: "/payouts/run",           keywords: "payout run initiate contractor new confirm" },
    { label: "DEDUCTIONS",             section: "Staff & Earnings", sectionColor: "bg-amber-100 text-amber-700", icon: DollarSign,    iconBg: "bg-slate-100",   iconColor: "text-slate-600",   to: "/payouts/deductions",    keywords: "deductions booth rent product fees standing charges" },
    { label: "PAYOUT\nSCHEDULE",       section: "Staff & Earnings", sectionColor: "bg-amber-100 text-amber-700", icon: CalendarClock, iconBg: "bg-violet-100",  iconColor: "text-violet-600",  to: "/payouts/schedule",      keywords: "payout schedule automatic recurring weekly monthly" },
    { label: "TAX DOCS\n(1099)",        section: "Staff & Earnings", sectionColor: "bg-amber-100 text-amber-700", icon: ScrollText,    iconBg: "bg-rose-100",    iconColor: "text-rose-600",    to: "/payouts/tax-docs",      keywords: "1099 tax documents forms contractors filing NEC" },
    { label: "COMMISSION\nPAYOUTS",    section: "Staff & Earnings", sectionColor: "bg-amber-100 text-amber-700", icon: FileCheck2,    iconBg: "bg-indigo-100",  iconColor: "text-indigo-600",  to: "/payouts/commissions",   keywords: "commission payouts breakdown service staff period" },

    // Communications
    { label: "SMS INBOX",              section: "Communications", sectionColor: "bg-sky-100 text-sky-700",     icon: MessageSquare,  iconBg: "bg-sky-100",     iconColor: "text-sky-500",     to: "/sms-inbox",             keywords: "sms inbox two-way messages reply clients text" },
    { label: "CAMPAIGNS",              section: "Communications", sectionColor: "bg-sky-100 text-sky-700",     icon: Mail,           iconBg: "bg-indigo-100",  iconColor: "text-indigo-500",  to: "/campaigns",             keywords: "campaigns marketing sms email blast broadcast clients" },

    // Client experience
    { label: "KIOSK\nCHECK-IN",        section: "Client Exp.", sectionColor: "bg-teal-100 text-teal-700",     icon: Tablet,         iconBg: "bg-teal-100",    iconColor: "text-teal-600",    to: "/kiosk-settings",        keywords: "kiosk self check-in tablet front desk qr code" },
    { label: "WAITLIST",               section: "Client Exp.", sectionColor: "bg-teal-100 text-teal-700",     icon: ClipboardList,  iconBg: "bg-violet-100",  iconColor: "text-violet-500",  to: "/waitlist",              keywords: "waitlist walk-in queue real-time" },
    { label: "GIFT CARDS",             section: "Client Exp.", sectionColor: "bg-teal-100 text-teal-700",     icon: CreditCard,     iconBg: "bg-rose-100",    iconColor: "text-rose-500",    to: "/gift-cards",            keywords: "gift cards issue manage balance voucher" },
    { label: "INTAKE FORMS",           section: "Client Exp.", sectionColor: "bg-teal-100 text-teal-700",     icon: FileText,       iconBg: "bg-blue-100",    iconColor: "text-blue-500",    to: "/intake-forms",          keywords: "intake forms consent waivers client information" },
    { label: "REVIEWS",                section: "Client Exp.", sectionColor: "bg-teal-100 text-teal-700",     icon: FileBarChart,   iconBg: "bg-indigo-100",  iconColor: "text-indigo-500",  to: "/reviews",               keywords: "reviews reputation google rating feedback clients" },

    // AI Receptionist sub-pages
    { label: "CALL LOGS",              section: "AI Receptionist", sectionColor: "bg-rose-100 text-rose-700", icon: FileText,       iconBg: "bg-rose-100",    iconColor: "text-rose-500",    to: "/manage/ai-receptionist/call-logs", keywords: "call logs history recordings voice AI receptionist" },

    // New booking shortcut
    { label: "NEW\nBOOKING",           section: "Dashboard",      sectionColor: "bg-teal-100 text-teal-700",  icon: Calendar,       iconBg: "bg-violet-100",  iconColor: "text-violet-500",  to: "/booking",               keywords: "new booking create appointment add" },
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
            <p className="mt-1 text-slate-500 text-base">What would you like to do?</p>
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
              <p className="mt-1 text-slate-500">What would you like to do?</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/online-booking")}
              className="hidden items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors sm:flex border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <Globe className="h-4 w-4 text-teal-500" />
              My booking site
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
