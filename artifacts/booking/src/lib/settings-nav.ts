// Single source of truth for the Settings navigation.
//
// Consumed by BOTH:
//   - pages/SettingsLanding.tsx  (the /settings card grid)
//   - components/layout/Sidebar.tsx  (the Settings expandable submenu)
//
// Keeping one config means the two surfaces can't drift apart again the way
// they had (different groups, different names, different items for the same
// destination).

import {
  Settings,
  CalendarDays,
  Clock,
  Languages,
  Sliders,
  Globe,
  FileText,
  Layers,
  Tablet,
  CreditCard,
  Banknote,
  ShoppingCart,
  MessageSquare,
  Mail,
  PhoneCall,
  MapPin,
  Sparkles,
  Users,
  Wallet,
  Zap,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";

type Pick4 = (m: { en: string; vi: string; es: string; fr: string }) => string;

export type SettingsNavItem = {
  /** short, Title-Case label (no ALL CAPS, no forced line breaks) */
  label: string;
  /** one-line explainer shown on the landing cards */
  description: string;
  icon: LucideIcon;
  to: string;
  /** tailwind bg + text classes for the landing card's icon chip */
  iconBg: string;
  iconColor: string;
};

export type SettingsNavGroup = {
  /** stable id — used for React keys and feature gating */
  key: string;
  heading: string;
  /** hide the whole group unless the POS feature is enabled */
  requiresPos?: boolean;
  items: SettingsNavItem[];
};

export function buildSettingsNav(pick: Pick4): SettingsNavGroup[] {
  return [
    {
      key: "business",
      heading: pick({ en: "Business", vi: "Kinh doanh", es: "Negocio", fr: "Entreprise" }),
      items: [
        {
          label: pick({ en: "Business Settings", vi: "Cài đặt kinh doanh", es: "Configuración del negocio", fr: "Paramètres de l'entreprise" }),
          description: pick({ en: "Store name, address, logo and contact details.", vi: "Tên cửa hàng, địa chỉ, logo và thông tin liên hệ.", es: "Nombre, dirección, logo y datos de contacto del negocio.", fr: "Nom, adresse, logo et coordonnées de l'établissement." }),
          icon: Settings, to: "/business-settings", iconBg: "bg-slate-100", iconColor: "text-slate-600",
        },
        {
          label: pick({ en: "Business Hours", vi: "Giờ làm việc", es: "Horario comercial", fr: "Heures d'ouverture" }),
          description: pick({ en: "Weekly open and close times for each day.", vi: "Giờ mở và đóng cửa hàng tuần cho mỗi ngày.", es: "Horarios de apertura y cierre de cada día.", fr: "Heures d'ouverture et de fermeture pour chaque jour." }),
          icon: Clock, to: "/business-hours", iconBg: "bg-violet-100", iconColor: "text-violet-600",
        },
        {
          label: pick({ en: "Language", vi: "Ngôn ngữ", es: "Idioma", fr: "Langue" }),
          description: pick({ en: "Display language for staff screens and the queue overlay.", vi: "Ngôn ngữ hiển thị cho màn hình nhân viên và bảng hàng đợi.", es: "Idioma para las pantallas del personal y la cola.", fr: "Langue d'affichage pour les écrans du personnel et la file." }),
          icon: Languages, to: "/language-settings", iconBg: "bg-indigo-100", iconColor: "text-indigo-600",
        },
      ],
    },
    {
      key: "booking",
      heading: pick({ en: "Booking & Calendar", vi: "Đặt lịch & Lịch", es: "Reservas y calendario", fr: "Réservations et agenda" }),
      items: [
        {
          label: pick({ en: "Booking Controls", vi: "Kiểm soát đặt lịch", es: "Controles de reserva", fr: "Contrôles de réservation" }),
          description: pick({ en: "Booking window, time-slot length and calendar rules.", vi: "Cửa sổ đặt lịch, độ dài khung giờ và quy tắc lịch.", es: "Ventana de reserva, duración de franjas y reglas del calendario.", fr: "Fenêtre de réservation, durée des créneaux et règles de l'agenda." }),
          icon: CalendarDays, to: "/calendar-settings", iconBg: "bg-violet-100", iconColor: "text-violet-500",
        },
        {
          label: pick({ en: "Online Booking", vi: "Đặt lịch trực tuyến", es: "Reserva en línea", fr: "Réservation en ligne" }),
          description: pick({ en: "Your public booking page, widget and availability.", vi: "Trang đặt lịch công khai, widget và tình trạng còn chỗ.", es: "Tu página de reserva pública, widget y disponibilidad.", fr: "Votre page de réservation publique, widget et disponibilités." }),
          icon: Globe, to: "/online-booking", iconBg: "bg-orange-100", iconColor: "text-orange-500",
        },
        {
          label: pick({ en: "Booking Policies", vi: "Chính sách đặt lịch", es: "Políticas de reserva", fr: "Politiques de réservation" }),
          description: pick({ en: "Cancellation policy & fees, no-show rules, deposits and the booking ban list.", vi: "Chính sách & phí hủy, quy tắc vắng mặt, đặt cọc và danh sách chặn đặt lịch.", es: "Política y tarifas de cancelación, reglas de ausencia, depósitos y lista de bloqueo.", fr: "Politique et frais d'annulation, règles de non-présentation, acomptes et liste de blocage." }),
          icon: FileText, to: "/booking-policies", iconBg: "bg-red-100", iconColor: "text-red-500",
        },
        {
          label: pick({ en: "Stations & Chairs", vi: "Bàn & Ghế", es: "Estaciones y sillas", fr: "Postes et fauteuils" }),
          description: pick({ en: "Bookable nail stations, pedicure chairs and rooms.", vi: "Bàn làm nail, ghế pedicure và phòng có thể đặt.", es: "Estaciones de manicura, sillas de pedicura y salas reservables.", fr: "Postes de manucure, fauteuils de pédicure et salles réservables." }),
          icon: Layers, to: "/settings/resources", iconBg: "bg-teal-100", iconColor: "text-teal-600",
        },
        {
          label: pick({ en: "Kiosk", vi: "Kiosk", es: "Kiosco", fr: "Kiosque" }),
          description: pick({ en: "Self check-in tablet URL, QR code and welcome text.", vi: "URL máy tính bảng tự check-in, mã QR và lời chào.", es: "URL del tablet de auto check-in, código QR y texto de bienvenida.", fr: "URL de la tablette d'enregistrement, QR code et message d'accueil." }),
          icon: Tablet, to: "/kiosk-settings", iconBg: "bg-sky-100", iconColor: "text-sky-600",
        },
      ],
    },
    {
      key: "payments",
      heading: pick({ en: "Payments & Payouts", vi: "Thanh toán & Chi trả", es: "Pagos y liquidaciones", fr: "Paiements et versements" }),
      requiresPos: true,
      items: [
        {
          label: pick({ en: "Payments & Payouts", vi: "Thanh toán & Chi trả", es: "Pagos y liquidaciones", fr: "Paiements et versements" }),
          description: pick({ en: "Connect Stripe, view your balance and set payout timing.", vi: "Kết nối Stripe, xem số dư và đặt thời gian chi trả.", es: "Conecta Stripe, consulta tu saldo y define los tiempos de pago.", fr: "Connectez Stripe, consultez votre solde et définissez le rythme des versements." }),
          icon: CreditCard, to: "/manage/payment-settings", iconBg: "bg-violet-100", iconColor: "text-violet-600",
        },
        {
          label: pick({ en: "Payout Account", vi: "Tài khoản nhận tiền", es: "Cuenta de cobros", fr: "Compte de versement" }),
          description: pick({ en: "Verify your identity and link a bank account for payouts.", vi: "Xác minh danh tính và liên kết tài khoản ngân hàng để nhận tiền.", es: "Verifica tu identidad y vincula una cuenta bancaria para cobros.", fr: "Vérifiez votre identité et reliez un compte bancaire pour les versements." }),
          icon: Banknote, to: "/settings/payout-account", iconBg: "bg-emerald-100", iconColor: "text-emerald-600",
        },
        {
          label: pick({ en: "POS Settings", vi: "Cài đặt POS", es: "Ajustes del PDV", fr: "Paramètres du PDV" }),
          description: pick({ en: "Sales tax rate and point-of-sale configuration.", vi: "Thuế bán hàng và cấu hình điểm bán.", es: "Tasa de impuesto sobre ventas y configuración del PDV.", fr: "Taux de taxe et configuration du point de vente." }),
          icon: ShoppingCart, to: "/pos-settings", iconBg: "bg-teal-100", iconColor: "text-teal-600",
        },
      ],
    },
    {
      key: "team",
      heading: pick({ en: "Team & Payroll", vi: "Nhân viên & Bảng lương", es: "Equipo y nómina", fr: "Équipe et paie" }),
      items: [
        {
          label: pick({ en: "Staff & Roles", vi: "Nhân viên & Vai trò", es: "Personal y roles", fr: "Personnel et rôles" }),
          description: pick({ en: "Manage team members, roles and permissions.", vi: "Quản lý thành viên, vai trò và quyền hạn.", es: "Gestiona miembros del equipo, roles y permisos.", fr: "Gérez les membres, les rôles et les autorisations." }),
          icon: Users, to: "/team", iconBg: "bg-indigo-100", iconColor: "text-indigo-500",
        },
        {
          label: pick({ en: "Earnings & Commission", vi: "Thu nhập & Hoa hồng", es: "Ingresos y comisiones", fr: "Revenus et commissions" }),
          description: pick({ en: "Pay frequency, pay-period start day and commission rules.", vi: "Tần suất trả lương, ngày bắt đầu kỳ và quy tắc hoa hồng.", es: "Frecuencia de pago, día de inicio del período y reglas de comisión.", fr: "Fréquence de paie, jour de début de période et règles de commission." }),
          icon: Wallet, to: "/payroll-settings", iconBg: "bg-emerald-100", iconColor: "text-emerald-600",
        },
        {
          label: pick({ en: "Payroll", vi: "Bảng lương", es: "Nómina", fr: "Paie" }),
          description: pick({ en: "Run payroll, review accruals and tax documents.", vi: "Chạy bảng lương, xem khoản tích lũy và tài liệu thuế.", es: "Procesa la nómina, revisa acumulados y documentos fiscales.", fr: "Lancez la paie, consultez les provisions et les documents fiscaux." }),
          icon: Banknote, to: "/payroll", iconBg: "bg-amber-100", iconColor: "text-amber-600",
        },
      ],
    },
    {
      key: "communications",
      heading: pick({ en: "Communications", vi: "Truyền thông", es: "Comunicaciones", fr: "Communications" }),
      items: [
        {
          label: pick({ en: "SMS Settings", vi: "Cài đặt SMS", es: "Ajustes de SMS", fr: "Paramètres SMS" }),
          description: pick({ en: "Text reminders, message templates and opt-outs.", vi: "Nhắc nhở qua SMS, mẫu tin nhắn và hủy nhận.", es: "Recordatorios por SMS, plantillas y exclusiones.", fr: "Rappels SMS, modèles de messages et désinscriptions." }),
          icon: MessageSquare, to: "/sms-settings", iconBg: "bg-sky-100", iconColor: "text-sky-500",
        },
        {
          label: pick({ en: "Email Settings", vi: "Cài đặt Email", es: "Ajustes de correo", fr: "Paramètres e-mail" }),
          description: pick({ en: "Email notifications and sender details.", vi: "Thông báo email và thông tin người gửi.", es: "Notificaciones por correo y datos del remitente.", fr: "Notifications par e-mail et coordonnées de l'expéditeur." }),
          icon: Mail, to: "/mail-settings", iconBg: "bg-rose-100", iconColor: "text-rose-500",
        },
      ],
    },
    {
      key: "integrations",
      heading: pick({ en: "Integrations & AI", vi: "Tích hợp & AI", es: "Integraciones e IA", fr: "Intégrations et IA" }),
      items: [
        {
          label: pick({ en: "AI Receptionist", vi: "Lễ tân AI", es: "Recepcionista IA", fr: "Réceptionniste IA" }),
          description: pick({ en: "Your AI phone receptionist, voice settings and call logs.", vi: "Lễ tân điện thoại AI, cài đặt giọng nói và nhật ký cuộc gọi.", es: "Tu recepcionista telefónico con IA, voz y registros de llamadas.", fr: "Votre réceptionniste téléphonique IA, la voix et les journaux d'appels." }),
          icon: PhoneCall, to: "/manage/ai-receptionist", iconBg: "bg-rose-100", iconColor: "text-rose-500",
        },
        {
          label: pick({ en: "Google Business Profile", vi: "Hồ sơ Google Business", es: "Perfil de Google Business", fr: "Profil Google Business" }),
          description: pick({ en: "Your Google listing, reviews and map presence.", vi: "Danh sách Google, đánh giá và hiển thị trên bản đồ.", es: "Tu ficha de Google, reseñas y presencia en el mapa.", fr: "Votre fiche Google, vos avis et votre présence sur la carte." }),
          icon: MapPin, to: "/google-business", iconBg: "bg-red-100", iconColor: "text-red-500",
        },
        {
          label: pick({ en: "Content Translations", vi: "Dịch nội dung", es: "Traducciones de contenido", fr: "Traductions de contenu" }),
          description: pick({ en: "AI translations for services, categories, add-ons and products.", vi: "Dịch bằng AI cho dịch vụ, danh mục, tiện ích và sản phẩm.", es: "Traducciones con IA para servicios, categorías, extras y productos.", fr: "Traductions IA pour services, catégories, extras et produits." }),
          icon: Sparkles, to: "/settings/translations", iconBg: "bg-fuchsia-100", iconColor: "text-fuchsia-600",
        },
      ],
    },
    {
      key: "account",
      heading: pick({ en: "Account", vi: "Tài khoản", es: "Cuenta", fr: "Compte" }),
      items: [
        {
          label: pick({ en: "Subscription & Usage", vi: "Gói dịch vụ & Sử dụng", es: "Suscripción y uso", fr: "Abonnement et usage" }),
          description: pick({ en: "Your plan, usage meters and plan changes.", vi: "Gói của bạn, đồng hồ sử dụng và thay đổi gói.", es: "Tu plan, medidores de uso y cambios de plan.", fr: "Votre formule, les compteurs d'usage et les changements de formule." }),
          icon: Zap, to: "/billing", iconBg: "bg-amber-100", iconColor: "text-amber-600",
        },
        {
          label: pick({ en: "Data Transfer", vi: "Chuyển dữ liệu", es: "Transferencia de datos", fr: "Transfert de données" }),
          description: pick({ en: "Export or import clients, appointments and history.", vi: "Xuất hoặc nhập khách hàng, lịch hẹn và lịch sử.", es: "Exporta o importa clientes, citas e historial.", fr: "Exportez ou importez clients, rendez-vous et historique." }),
          icon: ArrowLeftRight, to: "/manage/data-transfer", iconBg: "bg-orange-100", iconColor: "text-orange-500",
        },
        {
          label: pick({ en: "Advanced Features", vi: "Tính năng nâng cao", es: "Funciones avanzadas", fr: "Fonctions avancées" }),
          description: pick({ en: "Turn platform features on or off for your store.", vi: "Bật hoặc tắt các tính năng nền tảng cho cửa hàng.", es: "Activa o desactiva funciones de la plataforma para tu tienda.", fr: "Activez ou désactivez des fonctionnalités pour votre établissement." }),
          icon: Sliders, to: "/features-settings", iconBg: "bg-blue-100", iconColor: "text-blue-600",
        },
      ],
    },
  ];
}
