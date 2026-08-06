import { useNavigate } from "react-router-dom";
import { useFeatureFlags } from "@/hooks/use-features";
import { useState } from "react";
import {
  Search,
  Bell,
  ChevronDown,
  Settings,
  CalendarDays,
  Sliders,
  Globe,
  Users,
  MessageSquare,
  Mail,
  Banknote,
  ShoppingCart,
  LayoutDashboard,
  Shield,
  Tablet,
  Zap,
  Languages,
  CreditCard,
  ArrowLeftRight,
  Database,
  PhoneCall,
  MapPin,
  AlertTriangle,
  Trash2,
  X,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

type Module = {
  label: string;
  description: string;
  icon: React.ElementType;
  to: string;
  iconBg: string;
  iconColor: string;
};

type Group = { heading: string; items: Module[] };

function ModuleCard({
  mod,
  onClick,
  className,
}: {
  mod: Module;
  onClick: () => void;
  className?: string;
}) {
  const Icon = mod.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-3 bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer border border-slate-100 h-[150px]",
        className
      )}
    >
      <div className={`w-[54px] h-[54px] rounded-full flex items-center justify-center ${mod.iconBg}`}>
        <Icon className={`w-6 h-6 ${mod.iconColor}`} />
      </div>
      <span className="text-[10.5px] font-bold tracking-widest text-slate-700 text-center leading-snug whitespace-pre-line">
        {mod.label}
      </span>
    </button>
  );
}

export default function SettingsLanding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const features = useFeatureFlags();
  const { pick } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const t = {
    title:          pick({ en: "Settings",                              vi: "Cài đặt",                          es: "Ajustes",                           fr: "Paramètres" }),
    subtitle:       pick({ en: "Configure every aspect of your account", vi: "Cấu hình mọi khía cạnh tài khoản", es: "Configura cada aspecto de tu cuenta", fr: "Configurez chaque aspect de votre compte" }),
    searchSettings: pick({ en: "Search settings…",                     vi: "Tìm kiếm cài đặt…",                es: "Buscar ajustes…",                    fr: "Rechercher dans les paramètres…" }),
    dashboard:      pick({ en: "Dashboard",                             vi: "Tổng quan",                        es: "Panel",                             fr: "Tableau de bord" }),
    grpBilling:     pick({ en: "Billing",                               vi: "Thanh toán",                       es: "Facturación",                       fr: "Facturation" }),
    grpBusiness:    pick({ en: "Business",                              vi: "Kinh doanh",                       es: "Negocio",                           fr: "Entreprise" }),
    translations:     pick({ en: "CONTENT\nTRANSLATIONS",  vi: "DỊCH NỘI\nDUNG",            es: "TRADUCCIONES\nDE CONTENIDO",  fr: "TRADUCTIONS\nDE CONTENU" }),
    translationsDesc: pick({ en: "AI-powered translations for services, categories, add-ons and products.", vi: "Dịch tự động bằng AI cho dịch vụ, danh mục và sản phẩm.", es: "Traducciones AI para servicios, categorías, complementos y productos.", fr: "Traductions IA pour services, catégories, extras et produits." }),
    grpClientExp:   pick({ en: "Client Experience",                     vi: "Trải nghiệm khách hàng",           es: "Experiencia del cliente",           fr: "Expérience client" }),
    grpScheduling:  pick({ en: "Scheduling",                            vi: "Lên lịch",                         es: "Programación",                      fr: "Planification" }),
    grpStaff:       pick({ en: "Staff & Earnings",                      vi: "Nhân viên & Thu nhập",             es: "Personal y ganancias",              fr: "Équipe et revenus" }),
    grpPos:         pick({ en: "Point of Sale",                         vi: "Điểm bán hàng",                    es: "Punto de venta",                    fr: "Point de vente" }),
    grpComms:       pick({ en: "Communications",                        vi: "Truyền thông",                     es: "Comunicaciones",                    fr: "Communications" }),
    // module labels
    subUsage:       pick({ en: "SUBSCRIPTION\n& USAGE",    vi: "GÓI DỊCH VỤ\n& SỬ DỤNG",  es: "SUSCRIPCIÓN\nY USO",         fr: "ABONNEMENT\nET USAGE" }),
    subUsageDesc:   pick({ en: "View your plan, usage meters and switch plans.",              vi: "Xem gói, đồng hồ sử dụng và chuyển gói.",          es: "Ver tu plan, contadores de uso y cambiar planes.",     fr: "Consultez votre plan, les compteurs d'utilisation et changez de plan." }),
    bizSettings:    pick({ en: "BUSINESS\nSETTINGS",       vi: "CÀI ĐẶT\nKINH DOANH",      es: "CONFIGURACIÓN\nNEGOCIO",     fr: "PARAMÈTRES\nENTREPRISE" }),
    bizSettingsDesc:pick({ en: "Store info, billing and integrations.",                      vi: "Thông tin cửa hàng và tích hợp.",                   es: "Info de tienda, facturación e integraciones.",          fr: "Infos boutique, facturation et intégrations." }),
    bizHours:       pick({ en: "BUSINESS\nHOURS",         vi: "GIỜ\nLÀM VIỆC",             es: "HORARIO\nCOMERCIAL",         fr: "HEURES\nD'OUVERTURE" }),
    bizHoursDesc:   pick({ en: "Set your weekly open and close times for each day of the week.", vi: "Đặt giờ mở và đóng cửa hàng tuần cho mỗi ngày.", es: "Configura los horarios de apertura y cierre de cada día.", fr: "Définissez les heures d'ouverture et de fermeture pour chaque jour." }),
    features:       pick({ en: "FEATURES\nSETTINGS",       vi: "CÀI ĐẶT\nTÍNH NĂNG",       es: "AJUSTES DE\nFUNCIONES",      fr: "RÉGLAGES DES\nFONCTIONS" }),
    featuresDesc:   pick({ en: "Enable or disable platform features for your store.",         vi: "Bật hoặc tắt các tính năng nền tảng cho cửa hàng.", es: "Habilita o deshabilita las funciones de la plataforma.", fr: "Activez ou désactivez les fonctionnalités de la plateforme." }),
    language:       pick({ en: "LANGUAGE",                 vi: "NGÔN NGỮ",                   es: "IDIOMA",                     fr: "LANGUE" }),
    languageDesc:   pick({ en: "Display language for staff-facing screens and queue overlay.", vi: "Ngôn ngữ hiển thị cho màn hình nhân viên.",          es: "Idioma para las pantallas del personal y la cola.",    fr: "Langue d'affichage pour les écrans du personnel et la file." }),
    kiosk:          pick({ en: "KIOSK\nSETTINGS",          vi: "CÀI ĐẶT\nKIOSK",            es: "AJUSTES DE\nKIOSCO",         fr: "PARAMÈTRES\nKIOSQUE" }),
    kioskDesc:      pick({ en: "Self check-in tablet URL, QR code and custom welcome text.",  vi: "URL máy tính bảng check-in, mã QR và văn bản chào mừng.", es: "URL del tablet de auto check-in, código QR y texto de bienvenida.", fr: "URL de la tablette, QR code et texte d'accueil personnalisé." }),
    calSettings:    pick({ en: "CALENDAR\nSETTINGS",       vi: "CÀI ĐẶT\nLỊCH",             es: "AJUSTES DE\nCALENDARIO",     fr: "PARAMÈTRES\nCALENDRIER" }),
    calSettingsDesc:pick({ en: "Calendar view, time slots and booking rules.",                vi: "Chế độ xem lịch, khung giờ và quy tắc đặt lịch.",   es: "Vista del calendario, franjas horarias y reglas de reserva.", fr: "Vue du calendrier, créneaux et règles de réservation." }),
    onlineBooking:  pick({ en: "ONLINE\nBOOKING",          vi: "ĐẶT LỊCH\nTRỰC TUYẾN",      es: "RESERVA\nEN LÍNEA",          fr: "RÉSERVATION\nEN LIGNE" }),
    onlineBookingDesc: pick({ en: "Public booking page, widget and availability rules.",     vi: "Trang đặt lịch công khai, widget và quy tắc khả dụng.", es: "Página de reserva pública, widget y reglas de disponibilidad.", fr: "Page de réservation publique, widget et règles de disponibilité." }),
    bookingPolicies: pick({ en: "BOOKING\nPOLICIES",       vi: "CHÍNH SÁCH\nĐẶT LỊCH",      es: "POLÍTICAS DE\nRESERVA",      fr: "POLITIQUES DE\nRÉSERVATION" }),
    bookingPoliciesDesc: pick({ en: "Cancellation windows, late grace periods and no-show rules.", vi: "Thời gian hủy, gia hạn trễ và quy tắc vắng mặt.", es: "Ventanas de cancelación, períodos de gracia y reglas de no presentación.", fr: "Fenêtres d'annulation, délais de grâce et règles de no-show." }),
    staffMgmt:      pick({ en: "STAFF\nMANAGEMENT",        vi: "QUẢN LÝ\nNHÂN VIÊN",        es: "GESTIÓN DE\nPERSONAL",       fr: "GESTION DU\nPERSONNEL" }),
    staffMgmtDesc:  pick({ en: "Manage staff members, roles and schedules.",                  vi: "Quản lý nhân viên, vai trò và lịch làm việc.",       es: "Gestiona miembros del equipo, roles y horarios.",      fr: "Gérez les membres du personnel, leurs rôles et leurs horaires." }),
    earningsSettings: pick({ en: "EARNINGS\nSETTINGS",     vi: "CÀI ĐẶT\nTHU NHẬP",         es: "AJUSTES DE\nGANANCIAS",      fr: "PARAMÈTRES\nDE REVENUS" }),
    earningsSettingsDesc: pick({ en: "Pay frequency, period start day and commission rules.", vi: "Tần suất thanh toán, ngày bắt đầu kỳ và quy tắc hoa hồng.", es: "Frecuencia de pago, día de inicio y reglas de comisión.", fr: "Fréquence de paiement, jour de début et règles de commission." }),
    posSettings:    pick({ en: "POS\nSETTINGS",             vi: "CÀI ĐẶT\nPOS",              es: "AJUSTES\nPDV",               fr: "PARAMÈTRES\nPDV" }),
    posSettingsDesc:pick({ en: "Sales tax rate and point-of-sale configuration.",             vi: "Thuế bán hàng và cấu hình điểm bán.",                es: "Tasa de impuesto sobre ventas y configuración del PDV.",fr: "Taux de TVA et configuration du point de vente." }),
    stripeConnect:  pick({ en: "STRIPE\nCONNECT",          vi: "KẾT NỐI\nSTRIPE",           es: "STRIPE\nCONECT",             fr: "STRIPE\nCONNECT" }),
    stripeConnectDesc: pick({ en: "Connect your Stripe account to accept payments through the platform.", vi: "Kết nối tài khoản Stripe để nhận thanh toán.", es: "Conecta tu cuenta de Stripe para aceptar pagos.", fr: "Connectez votre compte Stripe pour accepter les paiements." }),
    payoutAccount:  pick({ en: "PAYOUT\nACCOUNT",          vi: "TÀI KHOẢN\nTHANH TOÁN",     es: "CUENTA DE\nPAGOS",           fr: "COMPTE DE\nVIREMENT" }),
    payoutAccountDesc: pick({ en: "Verify your identity and connect your bank account for payouts.", vi: "Xác minh danh tính và kết nối tài khoản ngân hàng.", es: "Verifica tu identidad y conecta tu cuenta bancaria.", fr: "Vérifiez votre identité et connectez votre compte bancaire." }),
    smsSettings:    pick({ en: "SMS\nSETTINGS",             vi: "CÀI ĐẶT\nSMS",              es: "AJUSTES\nSMS",               fr: "PARAMÈTRES\nSMS" }),
    smsSettingsDesc:pick({ en: "Configure text reminders, templates and opt-outs.",           vi: "Cấu hình nhắc nhở SMS, mẫu và hủy đăng ký.",        es: "Configura recordatorios de texto, plantillas y exclusiones.", fr: "Configurez les rappels SMS, modèles et désinscriptions." }),
    emailSettings:  pick({ en: "EMAIL\nSETTINGS",           vi: "CÀI ĐẶT\nEMAIL",           es: "AJUSTES DE\nCORREO",         fr: "PARAMÈTRES\nEMAIL" }),
    emailSettingsDesc: pick({ en: "Manage email notifications and sender settings.",          vi: "Quản lý thông báo email và cài đặt người gửi.",      es: "Gestiona notificaciones por correo y configuración del remitente.", fr: "Gérez les notifications par email et les paramètres d'envoi." }),
    grpAccount:     pick({ en: "Account",                                vi: "Tài khoản",                        es: "Cuenta",                            fr: "Compte" }),
    langPref:       pick({ en: "LANGUAGE\nPREFERENCES",    vi: "TÙY CHỌN\nNGÔN NGỮ",       es: "PREFERENCIAS\nDE IDIOMA",    fr: "PRÉFÉRENCES\nDE LANGUE" }),
    langPrefDesc:   pick({ en: "Set your preferred language for the Certxa platform interface.", vi: "Đặt ngôn ngữ ưa thích cho giao diện nền tảng Certxa.", es: "Establece tu idioma preferido para la interfaz de la plataforma Certxa.", fr: "Définissez votre langue préférée pour l'interface de la plateforme Certxa." }),
    dataTransfer:      pick({ en: "DATA\nTRANSFER",      vi: "CHUYỂN\nDỮ LIỆU",    es: "TRANSFERIR\nDATOS",   fr: "TRANSFERT\nDONNÉES" }),
    dataTransferDesc:  pick({ en: "Export or import your salon data, client records and history.", vi: "Xuất hoặc nhập dữ liệu salon, hồ sơ khách hàng và lịch sử.", es: "Exporta o importa los datos de tu salón, registros de clientes e historial.", fr: "Exportez ou importez vos données salon, fichiers clients et historique." }),
    grpIntegrations:   pick({ en: "Integrations",        vi: "Tích hợp",            es: "Integraciones",       fr: "Intégrations" }),
    aiReceptionist:    pick({ en: "AI\nRECEPTIONIST",   vi: "LỄ TÂN\nAI",          es: "RECEPCIONISTA\nIA",   fr: "RÉCEPTIONNISTE\nIA" }),
    aiReceptionistDesc:pick({ en: "Configure your AI phone receptionist, voice settings and call logs.", vi: "Cấu hình lễ tân điện thoại AI, cài đặt giọng nói và nhật ký cuộc gọi.", es: "Configura tu recepcionista telefónico AI, ajustes de voz y registros de llamadas.", fr: "Configurez votre réceptionniste téléphonique IA, paramètres vocaux et journaux d'appels." }),
    googleBusiness:    pick({ en: "GOOGLE\nBUSINESS",   vi: "GOOGLE\nDOANH NGHIỆP", es: "GOOGLE\nNEGOCIO",    fr: "GOOGLE\nENTREPRISE" }),
    googleBusinessDesc:pick({ en: "Manage your Google Business profile, reviews and map listing.", vi: "Quản lý hồ sơ Google Business, đánh giá và danh sách bản đồ.", es: "Gestiona tu perfil de Google Business, reseñas y listado en mapas.", fr: "Gérez votre profil Google Business, avis et fiche sur les cartes." }),
  };

  const groups: Group[] = [
    {
      heading: t.grpBilling,
      items: [
        { label: t.subUsage,    description: t.subUsageDesc,    icon: Zap,         to: "/billing",           iconBg: "bg-amber-100",  iconColor: "text-amber-600" },
      ],
    },
    {
      heading: t.grpBusiness,
      items: [
        { label: t.bizSettings,   description: t.bizSettingsDesc,   icon: Settings,     to: "/business-settings",      iconBg: "bg-slate-100",  iconColor: "text-slate-600" },
        { label: t.bizHours,      description: t.bizHoursDesc,      icon: CalendarDays, to: "/business-hours",         iconBg: "bg-violet-100", iconColor: "text-violet-600" },
        { label: t.features,      description: t.featuresDesc,      icon: Sliders,      to: "/features-settings",      iconBg: "bg-blue-100",   iconColor: "text-blue-600" },
        { label: t.language,      description: t.languageDesc,      icon: Languages,  to: "/language-settings",      iconBg: "bg-indigo-100", iconColor: "text-indigo-600" },
        { label: t.translations,  description: t.translationsDesc,  icon: Languages,  to: "/settings/translations",  iconBg: "bg-violet-100", iconColor: "text-violet-600" },
      ],
    },
    {
      heading: t.grpClientExp,
      items: [
        { label: t.kiosk,        description: t.kioskDesc,        icon: Tablet,     to: "/kiosk-settings",    iconBg: "bg-teal-100",   iconColor: "text-teal-600" },
      ],
    },
    {
      heading: t.grpScheduling,
      items: [
        { label: t.calSettings,  description: t.calSettingsDesc,  icon: CalendarDays, to: "/calendar-settings", iconBg: "bg-violet-100", iconColor: "text-violet-500" },
        { label: t.onlineBooking,description: t.onlineBookingDesc,icon: Globe,      to: "/online-booking",    iconBg: "bg-orange-100", iconColor: "text-orange-500" },
        { label: t.bookingPolicies, description: t.bookingPoliciesDesc, icon: Shield, to: "/booking-policies", iconBg: "bg-red-100",  iconColor: "text-red-500" },
      ],
    },
    {
      heading: t.grpStaff,
      items: [
        { label: t.staffMgmt,   description: t.staffMgmtDesc,   icon: Users,    to: "/payouts/contractors", iconBg: "bg-indigo-100", iconColor: "text-indigo-500" },
        { label: t.earningsSettings, description: t.earningsSettingsDesc, icon: Banknote, to: "/payroll-settings", iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
      ],
    },
    {
      heading: t.grpPos,
      items: [
        { label: t.posSettings,    description: t.posSettingsDesc,    icon: ShoppingCart, to: "/pos-settings",               iconBg: "bg-teal-100",    iconColor: "text-teal-600" },
        { label: t.stripeConnect,  description: t.stripeConnectDesc,  icon: CreditCard,   to: "/manage/payment-settings",    iconBg: "bg-violet-100",  iconColor: "text-violet-600" },
        { label: t.payoutAccount,  description: t.payoutAccountDesc,  icon: Banknote,     to: "/settings/payout-account",    iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
      ],
    },
    {
      heading: t.grpComms,
      items: [
        { label: t.smsSettings,  description: t.smsSettingsDesc,  icon: MessageSquare, to: "/sms-settings",  iconBg: "bg-sky-100",  iconColor: "text-sky-500" },
        { label: t.emailSettings,description: t.emailSettingsDesc,icon: Mail,          to: "/mail-settings", iconBg: "bg-rose-100", iconColor: "text-rose-500" },
      ],
    },
    {
      heading: t.grpIntegrations,
      items: [
        { label: t.aiReceptionist,  description: t.aiReceptionistDesc,  icon: PhoneCall, to: "/manage/ai-receptionist", iconBg: "bg-rose-100",  iconColor: "text-rose-500" },
        { label: t.googleBusiness,  description: t.googleBusinessDesc,  icon: MapPin,    to: "/google-business",        iconBg: "bg-red-100",   iconColor: "text-red-500"  },
      ],
    },
    {
      heading: t.grpAccount,
      items: [
        { label: t.dataTransfer, description: t.dataTransferDesc, icon: ArrowLeftRight, to: "/manage/data-transfer", iconBg: "bg-orange-100", iconColor: "text-orange-500" },
      ],
    },
  ];

  const visibleGroups = groups.filter((g) => {
    if (g.heading === t.grpPos && !features.pos) return false;
    return true;
  });

  const allModules = visibleGroups.flatMap((g) => g.items);
  const filteredModules = searchQuery.trim()
    ? allModules.filter((m) =>
        m.label.toLowerCase().replace(/\n/g, " ").includes(searchQuery.trim().toLowerCase()) ||
        m.description.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : null;

  const initials = (
    [user?.firstName?.[0], user?.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() ||
    (user?.firstName?.[0] ?? user?.email?.[0] ?? "U").toUpperCase()
  );

  const handleDeleteAccount = async () => {
    if (confirmPhrase !== "DELETE MY ACCOUNT") {
      setDeleteError('Please type "DELETE MY ACCOUNT" exactly to confirm.');
      return;
    }
    setIsDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/user/delete-account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPhrase }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.message || "Deletion failed. Please try again.");
        setIsDeleting(false);
        return;
      }
      // Account deleted — redirect to login
      window.location.href = "/auth";
    } catch {
      setDeleteError("Network error. Please try again.");
      setIsDeleting(false);
    }
  };

  const DeleteAccountModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Delete account permanently</h2>
            <p className="text-sm text-slate-500">This cannot be undone.</p>
          </div>
          <button onClick={() => { setShowDeleteModal(false); setConfirmPhrase(""); setDeleteError(""); }} className="ml-auto text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 text-sm text-red-700 space-y-1">
          <p className="font-semibold">The following will be permanently deleted:</p>
          <ul className="list-disc list-inside space-y-0.5 text-red-600">
            <li>Your store and all business settings</li>
            <li>All client records and appointment history</li>
            <li>All staff, payments, and financial data</li>
            <li>All SMS, email, and communication history</li>
            <li>Your login and account credentials</li>
          </ul>
        </div>

        <p className="text-sm text-slate-600 mb-3">
          Type <span className="font-mono font-bold text-slate-800">DELETE MY ACCOUNT</span> to confirm:
        </p>
        <input
          type="text"
          value={confirmPhrase}
          onChange={(e) => { setConfirmPhrase(e.target.value); setDeleteError(""); }}
          placeholder="DELETE MY ACCOUNT"
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono mb-1 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-300"
          autoFocus
        />
        {deleteError && <p className="text-xs text-red-600 mb-3">{deleteError}</p>}

        <div className="flex gap-3 mt-4">
          <button
            onClick={() => { setShowDeleteModal(false); setConfirmPhrase(""); setDeleteError(""); }}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteAccount}
            disabled={isDeleting || confirmPhrase !== "DELETE MY ACCOUNT"}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isDeleting ? "Deleting…" : "Delete everything"}
          </button>
        </div>
      </div>
    </div>
  );

  /* ─── MOBILE LAYOUT ─── */
  if (isMobile) {
    return (
      <div className="relative min-h-screen bg-white overflow-hidden flex flex-col">
        <div className="pointer-events-none absolute top-0 right-0 w-48 h-40 opacity-30" aria-hidden>
          <svg viewBox="0 0 200 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <ellipse cx="170" cy="30" rx="130" ry="90" fill="#e2e8f0" />
            <ellipse cx="200" cy="100" rx="100" ry="70" fill="#cbd5e1" />
          </svg>
        </div>
        <div className="pointer-events-none absolute bottom-16 left-0 right-0 h-40 opacity-20" aria-hidden>
          <svg viewBox="0 0 400 160" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <ellipse cx="200" cy="160" rx="260" ry="120" fill="#e2e8f0" />
            <ellipse cx="80" cy="180" rx="160" ry="100" fill="#cbd5e1" />
          </svg>
        </div>

        <div className="relative z-10 flex-1 flex flex-col px-5 pt-14 pb-4 overflow-y-auto">
          <div className="absolute top-6 left-5 right-5 flex items-center justify-between">
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: "1.55rem", letterSpacing: "-0.02em", color: "#3B0764", lineHeight: 1 }}>
              Certxa<span style={{ color: "#F59E0B" }}>.</span>
            </span>
            <button className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center text-white text-sm font-bold shadow-md" onClick={() => navigate("/account")}>
              {initials}
            </button>
          </div>

          <div className="mb-5">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2.5 shadow-sm">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder={t.searchSettings}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none text-sm text-slate-600 placeholder:text-slate-400 w-full"
              />
              <Bell className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
          </div>

          <div className="mb-5">
            <h1 className="text-3xl font-bold text-slate-800 leading-tight">{t.title}</h1>
            <p className="text-slate-500 mt-1 text-base">{t.subtitle}</p>
          </div>

          <div>
            {filteredModules ? (
              filteredModules.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                  <Search className="w-10 h-10 opacity-30" />
                  <p className="text-sm font-medium">No settings match "{searchQuery}"</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {filteredModules.map((mod) => (
                    <ModuleCard key={mod.to} mod={mod} onClick={() => navigate(mod.to)} className="h-[110px] p-3 gap-2 rounded-xl" />
                  ))}
                </div>
              )
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {allModules.map((mod) => (
                  <ModuleCard key={mod.to} mod={mod} onClick={() => navigate(mod.to)} className="h-[110px] p-3 gap-2 rounded-xl" />
                ))}
              </div>
            )}
          </div>

          {/* Mobile danger zone */}
          <div className="mt-8 mb-4 border border-red-200 rounded-2xl p-4 bg-red-50">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="text-sm font-bold text-red-700">Danger Zone</span>
            </div>
            <p className="text-xs text-red-600 mb-3">Permanently delete your account and all associated data. This action cannot be undone.</p>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete my account
            </button>
          </div>
        </div>

        <div className="relative z-20 bg-white border-t border-slate-100 flex items-center justify-around" style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 60px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <button className="flex flex-col items-center gap-1 px-6 py-2" onClick={() => navigate("/manage")}>
            <LayoutDashboard className="w-6 h-6 text-teal-500" />
            <span className="text-[11px] font-semibold text-teal-500">{t.dashboard}</span>
          </button>
        </div>
        {showDeleteModal && <DeleteAccountModal />}
      </div>
    );
  }

  /* ─── DESKTOP LAYOUT ─── */
  return (
    <AppLayout>
      <div className="relative min-h-full">
        <div className="pointer-events-none absolute top-0 right-0 w-96 h-64 opacity-30" aria-hidden>
          <svg viewBox="0 0 400 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <ellipse cx="320" cy="60" rx="220" ry="140" fill="#e2e8f0" />
            <ellipse cx="380" cy="160" rx="160" ry="100" fill="#cbd5e1" />
          </svg>
        </div>

        <div className="relative z-10">
          <div className="flex items-center justify-end gap-3 mb-8 pt-1">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2 shadow-sm w-56">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder={t.searchSettings}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none text-sm text-slate-600 placeholder:text-slate-400 w-full"
              />
            </div>
            <button className="relative w-9 h-9 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors">
              <Bell className="w-4 h-4 text-slate-600" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 ring-1 ring-white" />
            </button>
            <button className="flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-1 pr-3 py-1 shadow-sm hover:bg-slate-50 transition-colors" onClick={() => navigate("/account")}>
              <div className="w-7 h-7 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{initials}</div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800 leading-tight">{t.title}</h1>
            <p className="text-slate-500 mt-1">{t.subtitle}</p>
          </div>

          <div>
            {filteredModules ? (
              filteredModules.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
                  <Search className="w-10 h-10 opacity-30" />
                  <p className="text-sm font-medium">No settings match "{searchQuery}"</p>
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-4">
                  {filteredModules.map((mod) => (
                    <ModuleCard key={mod.to} mod={mod} onClick={() => navigate(mod.to)} />
                  ))}
                </div>
              )
            ) : (
              <div className="grid grid-cols-5 gap-4">
                {allModules.map((mod) => (
                  <ModuleCard key={mod.to} mod={mod} onClick={() => navigate(mod.to)} />
                ))}
              </div>
            )}
          </div>

          {/* Desktop danger zone */}
          <div className="mt-12 border border-red-200 rounded-2xl p-6 bg-red-50">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-bold text-red-700">Danger Zone</span>
                </div>
                <p className="text-sm text-red-600">Permanently delete your account and all associated data — clients, appointments, staff, payments, and everything else. This cannot be undone.</p>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="ml-6 shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete my account
              </button>
            </div>
          </div>
        </div>
      </div>
      {showDeleteModal && <DeleteAccountModal />}
    </AppLayout>
  );
}
