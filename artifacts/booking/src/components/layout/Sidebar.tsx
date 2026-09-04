import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  BarChart3,
  LineChart,
  Calendar,
  Users,
  Scissors,
  UserCircle,
  DollarSign,
  Globe,
  HelpCircle,
  Settings,
  ChevronDown,
  Megaphone,
  MessageSquare,
  Star,
  MapPin,
  Heart,
  UserX,
  Monitor,
  Layers,
  Receipt,
  CreditCard,
  FileText,
  Wallet,
  Sliders,
  CalendarDays,
  Tablet,
  ShoppingCart,
  Banknote,
  Mail,
  Languages,
  BookOpen,
  ClipboardList,
  Package,
  Tag,
  LogOut,
  User,
  CreditCard as CreditCardIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useSelectedStore } from "@/hooks/use-store";
import { usePermissions } from "@/hooks/use-permissions";
import { useFeatureFlags } from "@/hooks/use-features";
import { useLanguage } from "@/hooks/use-language";
import { useQuery } from "@tanstack/react-query";
import { PERMISSIONS } from "@shared/permissions";

type Pick4 = (m: { en: string; vi: string; es: string; fr: string }) => string;

// ── Types ─────────────────────────────────────────────────────────────────────

type TopNavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  to: string;
  getHref?: (storeId: string | null) => string;
  matches: string[];
  permission?: string;
  hideForStaff?: boolean;
  hideForSolo?: boolean;
  eliteOnly?: boolean;
};

type SubNavItem = { label: string; icon: typeof LayoutDashboard; to: string };
type SubNavSection = { headingKey: string; heading: string; items: SubNavItem[] };

// ── Nav definitions ───────────────────────────────────────────────────────────

function buildTopNav(pick: Pick4): TopNavItem[] {
  return [
    {
      label: pick({ en: "Dashboard", vi: "Tổng quan", es: "Panel", fr: "Tableau de bord" }),
      icon: LayoutDashboard,
      to: "/manage",
      matches: ["/manage"],
    },
    {
      label: pick({ en: "Calendar", vi: "Lịch", es: "Calendario", fr: "Calendrier" }),
      icon: Calendar,
      to: "/calendar",
      matches: ["/calendar", "/appointments", "/booking/new"],
    },
    {
      label: pick({ en: "Clients", vi: "Khách hàng", es: "Clientes", fr: "Clients" }),
      icon: Users,
      to: "/customers",
      matches: ["/customers", "/client-lookup", "/clients", "/client", "/clients/at-risk"],
      permission: PERMISSIONS.CUSTOMERS_VIEW,
      hideForStaff: true,
    },
    // {
    //   label: "Website Builder",
    //   icon: Globe,
    //   to: "/website-builder/websites",
    //   getHref: () => `/website-builder/websites`,
    //   matches: ["/website-builder"],
    //   hideForStaff: true,
    // },
    {
      label: pick({ en: "Support", vi: "Hỗ trợ", es: "Soporte", fr: "Support" }),
      icon: HelpCircle,
      to: "/support",
      matches: ["/support", "/help"],
    },
  ];
}

function buildInsightsSubnav(pick: Pick4): SubNavItem[] {
  return [
    { label: pick({ en: "Analytics", vi: "Phân tích", es: "Analítica", fr: "Analytique" }), icon: BarChart3, to: "/salon-dashboard" },
    { label: pick({ en: "Reports",   vi: "Báo cáo",   es: "Informes",  fr: "Rapports" }),   icon: LineChart, to: "/commission-report" },
  ];
}

const INSIGHTS_MATCHES = [
  "/salon-dashboard", "/analytics", "/intelligence",
  "/commission-report", "/salon-earnings", "/register-reports", "/payroll",
];

function buildCatalogSubnav(pick: Pick4): SubNavItem[] {
  return [
    { label: pick({ en: "Categories", vi: "Danh mục",       es: "Categorías",    fr: "Catégories" }),  icon: Tag,           to: "/catalog/categories" },
    { label: pick({ en: "Services",   vi: "Dịch vụ",        es: "Servicios",     fr: "Services" }),     icon: Scissors,      to: "/catalog/services" },
    { label: pick({ en: "Packages",   vi: "Gói dịch vụ",    es: "Paquetes",      fr: "Forfaits" }),     icon: Package,       to: "/catalog/packages" },
    { label: pick({ en: "Add-Ons",    vi: "Dịch vụ thêm",   es: "Complementos",  fr: "Suppléments" }),  icon: ClipboardList, to: "/catalog/addons" },
    { label: pick({ en: "Nail Config", vi: "Cấu hình móng", es: "Config. de uñas", fr: "Config. ongles" }), icon: Star,       to: "/catalog/nail-services" },
    { label: pick({ en: "Products",   vi: "Sản phẩm",       es: "Productos",     fr: "Produits" }),     icon: ShoppingCart,  to: "/catalog/products" },
  ];
}

function buildMarketingSubnav(pick: Pick4): SubNavItem[] {
  return [
    { label: pick({ en: "Campaigns",       vi: "Chiến dịch",              es: "Campañas",           fr: "Campagnes" }),          icon: Megaphone,     to: "/campaigns" },
    { label: pick({ en: "SMS Activity",    vi: "Hoạt động SMS",           es: "Actividad SMS",      fr: "Activité SMS" }),       icon: MessageSquare, to: "/sms-activity" },
    { label: pick({ en: "Loyalty",         vi: "Khách hàng thân thiết",   es: "Fidelización",       fr: "Fidélité" }),           icon: Heart,         to: "/loyalty" },
    { label: pick({ en: "Waitlist",        vi: "Danh sách chờ",           es: "Lista de espera",    fr: "Liste d'attente" }),    icon: UserX,         to: "/waitlist" },
    { label: pick({ en: "Google Business", vi: "Google Doanh nghiệp",     es: "Google Negocio",     fr: "Google Entreprise" }),  icon: MapPin,        to: "/google-business" },
  ];
}

function buildFinanceSubnav(pick: Pick4): SubNavSection[] {
  return [
    {
      headingKey: "pointOfSale",
      heading: pick({ en: "Point of Sale", vi: "Điểm bán hàng", es: "Punto de venta", fr: "Point de vente" }),
      items: [
        { label: pick({ en: "Cash Drawer", vi: "Ngăn kéo tiền",   es: "Cajón de efectivo",   fr: "Tiroir-caisse" }),   icon: Layers,     to: "/cash-drawer" },
        { label: pick({ en: "Gift Cards",  vi: "Thẻ quà tặng",    es: "Tarjetas de regalo",  fr: "Cartes cadeaux" }),  icon: CreditCard, to: "/gift-cards" },
      ],
    },
    {
      headingKey: "reports",
      heading: pick({ en: "Reports", vi: "Báo cáo", es: "Informes", fr: "Rapports" }),
      items: [
        { label: pick({ en: "Commission",       vi: "Hoa hồng",           es: "Comisión",             fr: "Commission" }),         icon: DollarSign,    to: "/commission-report" },
        { label: pick({ en: "Salon Earnings",   vi: "Thu nhập salon",     es: "Ganancias del salón",  fr: "Revenus du salon" }),   icon: Receipt,       to: "/salon-earnings" },
        { label: pick({ en: "Register Reports", vi: "Báo cáo thu ngân",   es: "Informes de caja",     fr: "Rapports de caisse" }), icon: FileText,      to: "/register-reports" },
        { label: pick({ en: "Payroll",          vi: "Bảng lương",         es: "Nómina",               fr: "Paie" }),               icon: ClipboardList, to: "/payroll" },
      ],
    },
    {
      headingKey: "payouts",
      heading: pick({ en: "Payouts", vi: "Chi trả", es: "Pagos", fr: "Versements" }),
      items: [
        { label: pick({ en: "Payouts Overview", vi: "Tổng quan chi trả", es: "Resumen de pagos",  fr: "Aperçu des versements" }),   icon: Wallet,     to: "/payouts" },
        { label: pick({ en: "Payouts Ledger",   vi: "Sổ cái chi trả",    es: "Libro de pagos",     fr: "Registre des versements" }), icon: BookOpen,   to: "/payouts/ledger" },
        { label: pick({ en: "Contractors",      vi: "Nhà thầu",          es: "Contratistas",       fr: "Prestataires" }),           icon: UserCircle, to: "/payouts/contractors" },
      ],
    },
  ];
}

function buildSettingsSubnav(pick: Pick4): SubNavSection[] {
  return [
    {
      headingKey: "business",
      heading: pick({ en: "Business", vi: "Kinh doanh", es: "Negocio", fr: "Entreprise" }),
      items: [
        { label: pick({ en: "Business Settings",    vi: "Cài đặt kinh doanh",   es: "Config. de negocio",          fr: "Param. entreprise" }),        icon: Settings,     to: "/business-settings" },
        { label: pick({ en: "Business Hours",       vi: "Giờ làm việc",        es: "Horario comercial",           fr: "Heures d'ouverture" }),        icon: CalendarDays, to: "/business-hours" },
        { label: pick({ en: "Features",             vi: "Tính năng",           es: "Funciones",                    fr: "Fonctionnalités" }),           icon: Sliders,      to: "/features-settings" },
        { label: pick({ en: "Language",              vi: "Ngôn ngữ",            es: "Idioma",                       fr: "Langue" }),                    icon: Languages,    to: "/language-settings" },
        { label: pick({ en: "Content Translations", vi: "Dịch nội dung",       es: "Traducciones de contenido",   fr: "Traductions de contenu" }),   icon: Languages,    to: "/settings/translations" },
      ],
    },
    {
      headingKey: "scheduling",
      heading: pick({ en: "Scheduling", vi: "Lên lịch", es: "Programación", fr: "Planification" }),
      items: [
        { label: pick({ en: "Calendar",         vi: "Lịch",                  es: "Calendario",         fr: "Calendrier" }),           icon: CalendarDays, to: "/calendar-settings" },
        { label: pick({ en: "Stations & Chairs", vi: "Bàn & Ghế",            es: "Estaciones y sillas", fr: "Postes et fauteuils" }),  icon: Layers,       to: "/settings/resources" },
        { label: pick({ en: "Online Booking",   vi: "Đặt lịch trực tuyến",   es: "Reserva en línea",   fr: "Réservation en ligne" }), icon: Globe,        to: "/online-booking" },
        { label: pick({ en: "Booking Policies", vi: "Chính sách đặt lịch",   es: "Políticas de reserva", fr: "Politiques de réservation" }), icon: FileText, to: "/booking-policies" },
      ],
    },
    {
      headingKey: "clientExperience",
      heading: pick({ en: "Client Experience", vi: "Trải nghiệm KH", es: "Exp. del cliente", fr: "Exp. client" }),
      items: [
        { label: pick({ en: "Kiosk", vi: "Kiosk", es: "Kiosco", fr: "Kiosque" }), icon: Tablet, to: "/kiosk-settings" },
      ],
    },
    {
      headingKey: "staffEarnings",
      heading: pick({ en: "Staff & Earnings", vi: "Nhân viên & Thu nhập", es: "Personal y ganancias", fr: "Personnel et revenus" }),
      items: [
        { label: pick({ en: "Earnings Settings", vi: "Cài đặt thu nhập", es: "Ajustes de ganancias", fr: "Paramètres de revenus" }), icon: Banknote, to: "/payroll-settings" },
      ],
    },
    {
      headingKey: "posPayments",
      heading: pick({ en: "POS & Payments", vi: "POS & Thanh toán", es: "PDV y pagos", fr: "PDV et paiements" }),
      items: [
        { label: pick({ en: "Payments & Payouts", vi: "Thanh toán & Chi trả", es: "Pagos y liquidaciones", fr: "Paiements et versements" }), icon: DollarSign, to: "/manage/payment-settings" },
        { label: pick({ en: "POS Settings",   vi: "Cài đặt POS",     es: "Ajustes PDV",     fr: "Paramètres PDV" }),   icon: ShoppingCart, to: "/pos-settings" },
      ],
    },
    {
      headingKey: "communications",
      heading: pick({ en: "Communications", vi: "Truyền thông", es: "Comunicaciones", fr: "Communications" }),
      items: [
        { label: pick({ en: "SMS Settings",   vi: "Cài đặt SMS",   es: "Ajustes SMS",       fr: "Paramètres SMS" }),   icon: MessageSquare, to: "/sms-settings" },
        { label: pick({ en: "Email Settings", vi: "Cài đặt Email", es: "Ajustes de correo", fr: "Paramètres Email" }), icon: Mail,          to: "/mail-settings" },
      ],
    },
  ];
}

function buildTeamSubnav(pick: Pick4): SubNavItem[] {
  return [
    { label: pick({ en: "Staff",       vi: "Nhân viên", es: "Personal",    fr: "Personnel" }),   icon: UserCircle, to: "/team" },
    { label: pick({ en: "Commissions", vi: "Hoa hồng",  es: "Comisiones",  fr: "Commissions" }), icon: DollarSign, to: "/commissions" },
  ];
}

const TEAM_MATCHES = ["/team", "/staff", "/team-permissions", "/timeclock", "/print-checks", "/commissions"];

// ── Sub-item link ──────────────────────────────────────────────────────────────

function SubLink({
  item,
  isActive,
  badge,
  onLinkClick,
}: {
  item: SubNavItem;
  isActive: boolean;
  badge?: React.ReactNode;
  onLinkClick?: () => void;
}) {
  return (
    <Link
      to={item.to}
      onClick={onLinkClick}
      className={cn(
        "flex items-center gap-3 w-full pl-9 pr-3 py-2 rounded-lg text-[13.5px] transition-colors duration-100",
        isActive
          ? "bg-gray-100 text-gray-900 font-medium"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-800 font-normal"
      )}
    >
      <item.icon className={cn("h-3.5 w-3.5 flex-shrink-0", isActive ? "text-gray-700" : "text-gray-400")} />
      <span className="flex-1">{item.label}</span>
      {badge}
    </Link>
  );
}

// ── Top-level nav item ─────────────────────────────────────────────────────────

function NavItem({
  icon: Icon,
  label,
  isActive,
  badge,
  onClick,
  href,
  to,
  onLinkClick,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  isActive: boolean;
  badge?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  to?: string;
  onLinkClick?: () => void;
}) {
  const cls = cn(
    "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-[14px] transition-colors duration-100",
    isActive
      ? "bg-gray-900 text-white font-semibold"
      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium"
  );

  const inner = (
    <>
      <Icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-white" : "text-gray-400")} />
      <span className="flex-1">{label}</span>
      {badge}
    </>
  );

  if (onClick) {
    return <button onClick={onClick} className={cls}>{inner}</button>;
  }
  if (href) {
    return <a href={href} onClick={onLinkClick} className={cls}>{inner}</a>;
  }
  return (
    <Link to={to!} onClick={onLinkClick} className={cls}>
      {inner}
    </Link>
  );
}

// ── Expandable section trigger ─────────────────────────────────────────────────

function ExpandableTrigger({
  icon: Icon,
  label,
  isOpen,
  isActive,
  badge,
  onToggle,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  isOpen: boolean;
  isActive: boolean;
  badge?: React.ReactNode;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors duration-100",
        isActive
          ? "text-gray-900 font-semibold hover:bg-black/5"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      )}
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-gray-700" : "text-gray-400")} />
      <span className="flex-1 text-left">{label}</span>
      {badge}
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 text-gray-400",
          isOpen ? "rotate-180" : ""
        )}
      />
    </button>
  );
}

// ── Section divider label ──────────────────────────────────────────────────────

function SectionHeading({ label }: { label: string }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10.5px] font-semibold text-gray-400 uppercase tracking-widest">
      {label}
    </p>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar({ onLinkClick }: { onLinkClick?: () => void }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user, logout }  = useAuth();
  const { selectedStore, stores, setSelectedStoreId } = useSelectedStore();
  const { can, isStaff }  = usePermissions();
  const features          = useFeatureFlags();
  const { pick }          = useLanguage();

  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close account menu on outside click
  useEffect(() => {
    if (!accountMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [accountMenuOpen]);

  // ── Localized nav definitions (rebuilt whenever the language changes) ──────
  const TOP_NAV          = buildTopNav(pick);
  const INSIGHTS_SUBNAV  = buildInsightsSubnav(pick);
  const CATALOG_SUBNAV   = buildCatalogSubnav(pick);
  const MARKETING_SUBNAV = buildMarketingSubnav(pick);
  const FINANCE_SUBNAV   = buildFinanceSubnav(pick);
  const SETTINGS_SUBNAV  = buildSettingsSubnav(pick);
  const TEAM_SUBNAV      = buildTeamSubnav(pick);

  const CATALOG_MATCHES   = CATALOG_SUBNAV.map((i) => i.to);
  const MARKETING_MATCHES = MARKETING_SUBNAV.map((i) => i.to);
  const FINANCE_MATCHES   = FINANCE_SUBNAV.flatMap((s) => s.items.map((i) => i.to));
  const SETTINGS_MATCHES  = SETTINGS_SUBNAV.flatMap((s) => s.items.map((i) => i.to));

  const t = {
    insights:         pick({ en: "Insights",           vi: "Thông tin",              es: "Información",          fr: "Aperçus" }),
    catalog:          pick({ en: "Catalog",            vi: "Danh mục hàng",          es: "Catálogo",             fr: "Catalogue" }),
    team:             pick({ en: "Team",               vi: "Đội ngũ",                es: "Equipo",               fr: "Équipe" }),
    marketing:        pick({ en: "Marketing",          vi: "Tiếp thị",               es: "Marketing",            fr: "Marketing" }),
    financePos:       pick({ en: "Finance & POS",      vi: "Tài chính & POS",        es: "Finanzas y PDV",       fr: "Finances et PDV" }),
    finance:          pick({ en: "Finance",            vi: "Tài chính",              es: "Finanzas",             fr: "Finances" }),
    settings:         pick({ en: "Settings",           vi: "Cài đặt",                es: "Ajustes",              fr: "Paramètres" }),
    accountSettings:  pick({ en: "Account settings",   vi: "Cài đặt tài khoản",      es: "Config. de cuenta",    fr: "Param. du compte" }),
    subscriptionBilling: pick({ en: "Subscription & billing", vi: "Gói dịch vụ & Thanh toán", es: "Suscripción y facturación", fr: "Abonnement et facturation" }),
    switchLocation:   pick({ en: "Switch location",    vi: "Chuyển địa điểm",        es: "Cambiar ubicación",    fr: "Changer de site" }),
    signOut:          pick({ en: "Sign out",           vi: "Đăng xuất",              es: "Cerrar sesión",        fr: "Déconnexion" }),
    myBusiness:       pick({ en: "My Business",        vi: "Doanh nghiệp của tôi",   es: "Mi negocio",           fr: "Mon entreprise" }),
    staffFallback:    pick({ en: "Staff",               vi: "Nhân viên",              es: "Personal",             fr: "Personnel" }),
    ownerFallback:    pick({ en: "Owner",               vi: "Chủ sở hữu",             es: "Propietario",          fr: "Propriétaire" }),
  };

  const isInsightsActive = INSIGHTS_MATCHES.some(
    (m) => location.pathname === m || location.pathname.startsWith(m + "/")
  );
  const isCatalogActive = CATALOG_MATCHES.some(
    (m) => location.pathname === m || location.pathname.startsWith(m + "/")
  );
  const isTeamActive = TEAM_MATCHES.some(
    (m) => location.pathname === m || location.pathname.startsWith(m + "/")
  );
  const isMarketingActive = MARKETING_MATCHES.some(
    (m) => location.pathname === m || location.pathname.startsWith(m + "/")
  );
  const isFinanceActive = FINANCE_MATCHES.some(
    (m) => location.pathname === m || location.pathname.startsWith(m + "/")
  ) || location.pathname === "/reports" || location.pathname.startsWith("/reports/");
  const isSettingsActive = SETTINGS_MATCHES.some(
    (m) => location.pathname === m || location.pathname.startsWith(m + "/")
  ) || location.pathname === "/settings" || location.pathname.startsWith("/settings/");

  const [insightsOpen,  setInsightsOpen]  = useState(isInsightsActive);
  const [catalogOpen,   setCatalogOpen]   = useState(isCatalogActive);
  const [teamOpen,      setTeamOpen]      = useState(isTeamActive);
  const [marketingOpen, setMarketingOpen] = useState(isMarketingActive);
  const [financeOpen,   setFinanceOpen]   = useState(isFinanceActive);
  const [settingsOpen,  setSettingsOpen]  = useState(isSettingsActive);

  // Auto-open the section that contains the current route
  useEffect(() => {
    if (isInsightsActive)  setInsightsOpen(true);
    if (isCatalogActive)   setCatalogOpen(true);
    if (isTeamActive)      setTeamOpen(true);
    if (isMarketingActive) setMarketingOpen(true);
    if (isFinanceActive)   setFinanceOpen(true);
    if (isSettingsActive)  setSettingsOpen(true);
  }, [isInsightsActive, isCatalogActive, isMarketingActive, isFinanceActive, isSettingsActive]);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: boardData } = useQuery<any[]>({
    queryKey: ["/api/kiosk/walkins/today/count"],
    queryFn: async () => {
      const res = await fetch("/api/kiosk/walkins/today", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const waitingCount = (boardData ?? []).filter((c: any) => c.status === "waiting").length;

  const { data: subscription } = useQuery<any>({
    queryKey: ["/api/billing/profile", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return null;
      const res = await fetch(`/api/billing/profile/${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) return null;
      const payload = await res.json();
      return payload?.subscription ?? null;
    },
    enabled: !!selectedStore?.id && !isStaff,
    staleTime: 5 * 60 * 1000,
  });
  const isElite = subscription?.planCode === "elite";
  const isSolo  =
    (selectedStore as any)?.teamSize === "myself" ||
    !!subscription?.planCode?.toLowerCase().includes("solo");

  const { data: reviewStats } = useQuery<any>({
    queryKey: ["/api/google-business/reviews-stats", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return null;
      const res = await fetch(`/api/google-business/reviews-stats/${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedStore?.id && !isStaff,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });
  const unansweredReviews: number = reviewStats?.notRespondedReviews ?? 0;

  const visibleItems = TOP_NAV.filter((item) => {
    if (isStaff && item.hideForStaff) return false;
    if (isSolo  && item.hideForSolo)  return false;
    if (item.eliteOnly && !isElite)   return false;
    if (item.permission && !can(item.permission)) return false;
    return true;
  });

  // ── Badge helpers ──────────────────────────────────────────────────────────

  const reviewBadge = unansweredReviews > 0 ? (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white bg-amber-400">
      {unansweredReviews > 99 ? "99+" : unansweredReviews}
    </span>
  ) : undefined;

  // ── Render ─────────────────────────────────────────────────────────────────

  // Derived display values
  const businessName = selectedStore?.name ?? t.myBusiness;
  const ownerFirstName = isStaff
    ? (user as any)?.firstName ?? (user as any)?.name ?? t.staffFallback
    : (user as any)?.firstName ?? (user as any)?.name?.split(" ")[0] ?? t.ownerFallback;
  const ownerFullName = isStaff
    ? [(user as any)?.firstName, (user as any)?.lastName].filter(Boolean).join(" ") || t.staffFallback
    : [(user as any)?.firstName, (user as any)?.lastName].filter(Boolean).join(" ") || (user as any)?.name || t.ownerFallback;
  const initials = ownerFullName
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <aside className="w-[266px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen">
      {/* Account header — business name + owner name, clickable dropdown */}
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={() => setAccountMenuOpen((v) => !v)}
          className="flex items-center gap-3 w-full h-[60px] px-4 border-b border-gray-100 hover:bg-gray-50 transition-colors duration-100 text-left"
        >
          {/* Avatar */}
          <div
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            {initials || <User size={14} />}
          </div>
          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-gray-900 truncate leading-tight">{businessName}</p>
            <p className="text-[11px] text-gray-500 truncate leading-tight">{ownerFirstName}</p>
          </div>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform duration-200",
              accountMenuOpen && "rotate-180"
            )}
          />
        </button>

        {/* Dropdown menu */}
        {accountMenuOpen && (
          <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 shadow-lg rounded-b-xl overflow-hidden">
            {/* Account info header */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-[12px] font-semibold text-gray-900 truncate">{ownerFullName}</p>
              <p className="text-[11px] text-gray-500 truncate">{(user as any)?.email ?? ""}</p>
            </div>

            {/* Menu items */}
            <div className="py-1">
              <button
                onClick={() => { setAccountMenuOpen(false); onLinkClick?.(); navigate("/settings/account"); }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <User size={14} className="text-gray-400" />
                {t.accountSettings}
              </button>
              {!isStaff && (
                <button
                  onClick={() => { setAccountMenuOpen(false); onLinkClick?.(); navigate("/subscription"); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <CreditCardIcon size={14} className="text-gray-400" />
                  {t.subscriptionBilling}
                </button>
              )}
              {/* Multi-location switcher */}
              {!isStaff && stores.length > 1 && (
                <>
                  <div className="mx-4 my-1 border-t border-gray-100" />
                  <p className="px-4 pt-1 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{t.switchLocation}</p>
                  {stores.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setAccountMenuOpen(false); setSelectedStoreId(s.id); }}
                      className={cn(
                        "flex items-center gap-3 w-full px-4 py-2 text-[13px] transition-colors",
                        selectedStore?.id === s.id
                          ? "text-indigo-600 bg-indigo-50 font-medium"
                          : "text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      <MapPin size={13} className="flex-shrink-0 text-gray-400" />
                      <span className="truncate">{s.name}</span>
                    </button>
                  ))}
                </>
              )}
              <div className="mx-4 my-1 border-t border-gray-100" />
              <button
                onClick={() => { setAccountMenuOpen(false); logout(); }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-[13px] text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={14} className="text-red-400" />
                {t.signOut}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">

        {/* Core items — split around Catalog section */}
        {(() => {
          // Routes that appear BEFORE the Catalog section
          const beforeRoutes = new Set(["/manage", "/calendar", "/customers"]);
          const beforeItems = visibleItems.filter((i) => beforeRoutes.has(i.to));
          const afterItems  = visibleItems.filter((i) => !beforeRoutes.has(i.to));

          const renderItem = (item: typeof visibleItems[0]) => {
            const isActive = item.matches.some(
              (m) => location.pathname === m || location.pathname.startsWith(m + "/")
            );
            const resolvedHref = item.getHref?.(
              selectedStore?.id != null ? String(selectedStore.id) : null
            );
            const showBadge =
              (item.to === "/walkins" || item.to === "/walk-in-board") && waitingCount > 0;
            return (
              <NavItem
                key={item.to}
                icon={item.icon}
                label={item.label}
                isActive={isActive}
                href={resolvedHref}
                to={item.to}
                onLinkClick={onLinkClick}
                badge={
                  showBadge ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white bg-amber-400">
                      {waitingCount}
                    </span>
                  ) : undefined
                }
              />
            );
          };

          return (
            <>
              {/* Dashboard · Overview · Calendar · Clients */}
              <div className="space-y-0.5">
                {beforeItems.map(renderItem)}
              </div>

              {/* ── Insights ── */}
              {!isStaff && can(PERMISSIONS.REPORTS_VIEW) && (
                <div className={cn("mt-0.5 rounded-xl transition-colors duration-150", insightsOpen && "bg-indigo-50 p-1.5")}>
                  <ExpandableTrigger
                    icon={LineChart}
                    label={t.insights}
                    isOpen={insightsOpen}
                    isActive={isInsightsActive}
                    onToggle={() => setInsightsOpen((v) => !v)}
                  />
                  {insightsOpen && (
                    <div className="mt-0.5 space-y-0.5">
                      {INSIGHTS_SUBNAV.map((sub) => {
                        const active = location.pathname === sub.to || location.pathname.startsWith(sub.to + "/");
                        return <SubLink key={sub.to} item={sub} isActive={active} onLinkClick={onLinkClick} />;
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Catalog ── */}
              {!isStaff && can(PERMISSIONS.SERVICES_MANAGE) && (
                <div className={cn("mt-0.5 rounded-xl transition-colors duration-150", catalogOpen && "bg-violet-50 p-1.5")}>
                  <ExpandableTrigger
                    icon={Package}
                    label={t.catalog}
                    isOpen={catalogOpen}
                    isActive={isCatalogActive}
                    onToggle={() => setCatalogOpen((v) => !v)}
                  />
                  {catalogOpen && (
                    <div className="mt-0.5 space-y-0.5">
                      {CATALOG_SUBNAV.map((sub) => {
                        const active = location.pathname === sub.to || location.pathname.startsWith(sub.to + "/");
                        return <SubLink key={sub.to} item={sub} isActive={active} onLinkClick={onLinkClick} />;
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Team ── */}
              {!isStaff && can(PERMISSIONS.STAFF_MANAGE) && !isSolo && (
                <div className={cn("mt-0.5 rounded-xl transition-colors duration-150", teamOpen && "bg-sky-50 p-1.5")}>
                  <ExpandableTrigger
                    icon={UserCircle}
                    label={t.team}
                    isOpen={teamOpen}
                    isActive={isTeamActive}
                    onToggle={() => setTeamOpen((v) => !v)}
                  />
                  {teamOpen && (
                    <div className="mt-0.5 space-y-0.5">
                      {TEAM_SUBNAV.map((sub) => {
                        const active = location.pathname === sub.to || location.pathname.startsWith(sub.to + "/");
                        return <SubLink key={sub.to} item={sub} isActive={active} onLinkClick={onLinkClick} />;
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Website Builder (no-op — commented out) */}
            </>
          );
        })()}

        {/* ── Marketing ── */}
        {!isStaff && (
          <div className={cn("mt-0.5 rounded-xl transition-colors duration-150", marketingOpen && "bg-rose-50 p-1.5")}>
            <ExpandableTrigger
              icon={Megaphone}
              label={t.marketing}
              isOpen={marketingOpen}
              isActive={isMarketingActive}
              onToggle={() => setMarketingOpen((v) => !v)}
            />
            {marketingOpen && (
              <div className="mt-0.5 space-y-0.5">
                {MARKETING_SUBNAV.map((sub) => {
                  const active = location.pathname === sub.to || location.pathname.startsWith(sub.to + "/");
                  return (
                    <SubLink
                      key={sub.to}
                      item={sub}
                      isActive={active}
                      onLinkClick={onLinkClick}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Finance & POS ── */}
        {!isStaff && can(PERMISSIONS.REPORTS_VIEW) && (
          <div className={cn("mt-0.5 rounded-xl transition-colors duration-150", financeOpen && "bg-emerald-50 p-1.5")}>
            <ExpandableTrigger
              icon={DollarSign}
              label={features.pos ? t.financePos : t.finance}
              isOpen={financeOpen}
              isActive={isFinanceActive}
              onToggle={() => setFinanceOpen((v) => !v)}
            />
            {financeOpen && (
              <div className="mt-0.5">
                {FINANCE_SUBNAV.map((section) => (
                  <div key={section.headingKey}>
                    <SectionHeading label={section.heading} />
                    <div className="space-y-0.5">
                      {section.items.map((sub) => {
                        const active = location.pathname === sub.to || location.pathname.startsWith(sub.to + "/");
                        return <SubLink key={sub.to} item={sub} isActive={active} onLinkClick={onLinkClick} />;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </nav>

      {/* ── Fixed footer ── */}
      <div className="flex-shrink-0 border-t border-gray-100 px-2 py-2 bg-white">


        {/* Support link */}
        {(() => {
          const supportItem = TOP_NAV.find((i) => i.to === "/support");
          if (!supportItem) return null;
          const isActive = location.pathname === "/support" || location.pathname.startsWith("/support/");
          return (
            <NavItem
              icon={supportItem.icon}
              label={supportItem.label}
              isActive={isActive}
              to={supportItem.to}
              onLinkClick={onLinkClick}
            />
          );
        })()}

        {/* Settings expandable */}
        {!isStaff && can(PERMISSIONS.STORE_SETTINGS) && (
          <div className={cn("rounded-xl transition-colors duration-150", settingsOpen && "bg-amber-50 p-1.5")}>
            <ExpandableTrigger
              icon={Settings}
              label={t.settings}
              isOpen={settingsOpen}
              isActive={isSettingsActive}
              onToggle={() => setSettingsOpen((v) => !v)}
            />
            {settingsOpen && (
              <div className="mt-0.5 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                {SETTINGS_SUBNAV.filter((section) => {
                  if (section.headingKey === "posPayments" && !features.pos) return false;
                  return true;
                }).map((section) => (
                  <div key={section.headingKey}>
                    <SectionHeading label={section.heading} />
                    <div className="space-y-0.5">
                      {section.items.map((sub) => {
                        const active = location.pathname === sub.to || location.pathname.startsWith(sub.to + "/");
                        return <SubLink key={sub.to} item={sub} isActive={active} onLinkClick={onLinkClick} />;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Certxa branding wordmark */}
        <div className="px-3 pt-2 pb-1">
          <Link to="/manage" onClick={onLinkClick}>
            <span
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 700,
                fontSize: "1.1rem",
                letterSpacing: "-0.02em",
                color: "#9ca3af",
                lineHeight: 1,
              }}
            >
              Certxa<span style={{ color: "#F59E0B" }}>.</span>
            </span>
          </Link>
        </div>

      </div>
    </aside>
  );
}
