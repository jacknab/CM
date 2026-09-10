// Single source of truth for the Settings navigation rail (pages/SettingsShell.tsx).
//
// The rail is intentionally short — one entry per area. Areas that bundle
// several pages expose them as `tabs`; SettingsShell maps each tab slug to its
// page component and renders them behind a <SettingsHub>. Every historical
// /settings/<slug> URL still resolves (SettingsShell keeps the standalone panes
// registered and App.tsx redirects the old top-level routes here).

import {
  Settings,
  CalendarDays,
  CreditCard,
  MessageSquare,
  CalendarSync,
  Wallet,
  Zap,
  Sliders,
  type LucideIcon,
} from "lucide-react";

type Pick4 = (m: { en: string; vi: string; es: string; fr: string }) => string;

export type SettingsNavTab = {
  /** ?tab= value inside the hub */
  slug: string;
  label: string;
  description: string;
};

export type SettingsNavItem = {
  /** short, Title-Case label */
  label: string;
  /** one-line explainer shown in the pane header */
  description: string;
  icon: LucideIcon;
  /** canonical route for this destination */
  to: string;
  /** URL segment inside the settings shell — /settings/<slug> */
  slug: string;
  /** true = a full standalone page (opens outside the shell, not in the pane) */
  external?: boolean;
  /** hide unless the POS feature is enabled */
  requiresPos?: boolean;
  /** tailwind bg + text classes for the icon chip */
  iconBg: string;
  iconColor: string;
  /** when present, this entry is a hub — the pane renders these as tabs */
  tabs?: SettingsNavTab[];
};

export type SettingsNavGroup = {
  key: string;
  heading: string;
  items: SettingsNavItem[];
};

export function buildSettingsNav(pick: Pick4): SettingsNavGroup[] {
  return [
    {
      key: "store",
      heading: pick({ en: "Store", vi: "Cửa hàng", es: "Tienda", fr: "Établissement" }),
      items: [
        {
          label: pick({ en: "Business", vi: "Kinh doanh", es: "Negocio", fr: "Entreprise" }),
          description: pick({
            en: "Store details, hours, language and content translations.",
            vi: "Thông tin cửa hàng, giờ làm việc, ngôn ngữ và dịch nội dung.",
            es: "Datos del negocio, horario, idioma y traducciones de contenido.",
            fr: "Informations, horaires, langue et traductions de contenu.",
          }),
          icon: Settings, to: "/settings/business", slug: "business",
          iconBg: "bg-slate-100", iconColor: "text-slate-600",
          tabs: [
            { slug: "business", label: pick({ en: "Business Settings", vi: "Cài đặt kinh doanh", es: "Configuración", fr: "Paramètres" }),
              description: pick({ en: "Store name, address, logo and contact details.", vi: "Tên, địa chỉ, logo và liên hệ.", es: "Nombre, dirección, logo y contacto.", fr: "Nom, adresse, logo et coordonnées." }) },
            { slug: "hours", label: pick({ en: "Business Hours", vi: "Giờ làm việc", es: "Horario", fr: "Horaires" }),
              description: pick({ en: "Weekly open and close times.", vi: "Giờ mở/đóng hàng tuần.", es: "Horas de apertura y cierre.", fr: "Heures d'ouverture et de fermeture." }) },
            { slug: "language", label: pick({ en: "Language", vi: "Ngôn ngữ", es: "Idioma", fr: "Langue" }),
              description: pick({ en: "Display language for staff screens.", vi: "Ngôn ngữ hiển thị màn hình nhân viên.", es: "Idioma de las pantallas del personal.", fr: "Langue des écrans du personnel." }) },
            { slug: "translations", label: pick({ en: "Content Translations", vi: "Dịch nội dung", es: "Traducciones", fr: "Traductions" }),
              description: pick({ en: "AI translations for services, categories and products.", vi: "Dịch AI cho dịch vụ, danh mục và sản phẩm.", es: "Traducciones IA de servicios, categorías y productos.", fr: "Traductions IA des services, catégories et produits." }) },
          ],
        },
        {
          label: pick({ en: "Booking & Calendar", vi: "Đặt lịch & Lịch", es: "Reservas y calendario", fr: "Réservations et agenda" }),
          description: pick({
            en: "Booking rules, your public page, stations and the check-in kiosk.",
            vi: "Quy tắc đặt lịch, trang công khai, bàn/ghế và kiosk check-in.",
            es: "Reglas de reserva, página pública, estaciones y kiosco de registro.",
            fr: "Règles de réservation, page publique, postes et kiosque d'enregistrement.",
          }),
          icon: CalendarDays, to: "/settings/booking", slug: "booking",
          iconBg: "bg-violet-100", iconColor: "text-violet-600",
          tabs: [
            { slug: "booking-controls", label: pick({ en: "Booking Controls", vi: "Kiểm soát đặt lịch", es: "Controles de reserva", fr: "Contrôles" }),
              description: pick({ en: "Cancellation policy, no-shows, waitlist, ban list and calendar rules.", vi: "Chính sách hủy, vắng mặt, danh sách chờ, chặn và quy tắc lịch.", es: "Cancelaciones, ausencias, lista de espera, bloqueos y reglas.", fr: "Annulations, absences, liste d'attente, blocages et règles." }) },
            { slug: "online-booking", label: pick({ en: "Online Booking", vi: "Đặt lịch trực tuyến", es: "Reserva en línea", fr: "Réservation en ligne" }),
              description: pick({ en: "Your public booking page, widget and availability.", vi: "Trang đặt lịch công khai, widget và chỗ trống.", es: "Página pública, widget y disponibilidad.", fr: "Page publique, widget et disponibilités." }) },
            { slug: "resources", label: pick({ en: "Stations & Chairs", vi: "Bàn & Ghế", es: "Estaciones y sillas", fr: "Postes et fauteuils" }),
              description: pick({ en: "Bookable nail stations, pedicure chairs and rooms.", vi: "Bàn nail, ghế pedicure và phòng.", es: "Estaciones, sillas de pedicura y salas.", fr: "Postes, fauteuils de pédicure et salles." }) },
            { slug: "kiosk", label: pick({ en: "Kiosk", vi: "Kiosk", es: "Kiosco", fr: "Kiosque" }),
              description: pick({ en: "Self check-in tablet URL, QR code and welcome text.", vi: "URL kiosk, mã QR và lời chào.", es: "URL del tablet, código QR y bienvenida.", fr: "URL de la tablette, QR code et accueil." }) },
          ],
        },
        {
          label: pick({ en: "Payments & POS", vi: "Thanh toán & POS", es: "Pagos y PDV", fr: "Paiements et PDV" }),
          description: pick({
            en: "Sales tax, point-of-sale options and your payout bank account.",
            vi: "Thuế bán hàng, tùy chọn POS và tài khoản nhận tiền.",
            es: "Impuesto sobre ventas, opciones de PDV y cuenta de cobros.",
            fr: "Taxe de vente, options du PDV et compte de versement.",
          }),
          icon: CreditCard, to: "/settings/pos", slug: "pos",
          requiresPos: true,
          iconBg: "bg-teal-100", iconColor: "text-teal-600",
          tabs: [
            { slug: "pos", label: pick({ en: "POS Settings", vi: "Cài đặt POS", es: "Ajustes del PDV", fr: "Paramètres du PDV" }),
              description: pick({ en: "Sales tax rate and point-of-sale configuration.", vi: "Thuế bán hàng và cấu hình điểm bán.", es: "Impuesto y configuración del PDV.", fr: "Taxe et configuration du PDV." }) },
            { slug: "payout-account", label: pick({ en: "Payout Account", vi: "Tài khoản nhận tiền", es: "Cuenta de cobros", fr: "Compte de versement" }),
              description: pick({ en: "Verify identity and link a bank account for payouts.", vi: "Xác minh danh tính và liên kết ngân hàng.", es: "Verifica identidad y vincula un banco.", fr: "Vérifiez l'identité et reliez un compte bancaire." }) },
          ],
        },
        {
          label: pick({ en: "Team & Payroll", vi: "Nhân viên & Bảng lương", es: "Equipo y nómina", fr: "Équipe et paie" }),
          description: pick({
            en: "Pay frequency, pay-period start day and commission rules.",
            vi: "Tần suất trả lương, ngày bắt đầu kỳ và quy tắc hoa hồng.",
            es: "Frecuencia de pago, inicio del período y reglas de comisión.",
            fr: "Fréquence de paie, début de période et règles de commission.",
          }),
          icon: Wallet, to: "/settings/commission", slug: "commission",
          iconBg: "bg-emerald-100", iconColor: "text-emerald-600",
        },
      ],
    },
    {
      key: "growth",
      heading: pick({ en: "Growth", vi: "Tăng trưởng", es: "Crecimiento", fr: "Croissance" }),
      items: [
        {
          label: pick({ en: "Messaging", vi: "Tin nhắn", es: "Mensajería", fr: "Messagerie" }),
          description: pick({
            en: "Text and email reminders, templates and sender details.",
            vi: "Nhắc nhở SMS và email, mẫu tin và thông tin người gửi.",
            es: "Recordatorios por SMS y correo, plantillas y remitente.",
            fr: "Rappels SMS et e-mail, modèles et expéditeur.",
          }),
          icon: MessageSquare, to: "/settings/messaging", slug: "messaging",
          iconBg: "bg-sky-100", iconColor: "text-sky-600",
          tabs: [
            { slug: "sms", label: pick({ en: "SMS", vi: "SMS", es: "SMS", fr: "SMS" }),
              description: pick({ en: "Text reminders, message templates and opt-outs.", vi: "Nhắc nhở SMS, mẫu tin và hủy nhận.", es: "Recordatorios, plantillas y exclusiones.", fr: "Rappels, modèles et désinscriptions." }) },
            { slug: "email", label: pick({ en: "Email", vi: "Email", es: "Correo", fr: "E-mail" }),
              description: pick({ en: "Email notifications and sender details.", vi: "Thông báo email và thông tin người gửi.", es: "Notificaciones y datos del remitente.", fr: "Notifications et coordonnées de l'expéditeur." }) },
          ],
        },
        {
          label: pick({ en: "Calendar Sync", vi: "Đồng bộ lịch", es: "Sincronización de calendario", fr: "Synchronisation d'agenda" }),
          description: pick({
            en: "Two-way sync between bookings and a technician's Google Calendar.",
            vi: "Đồng bộ hai chiều giữa lịch hẹn và Google Calendar của thợ.",
            es: "Sincronización bidireccional entre reservas y el Google Calendar del técnico.",
            fr: "Synchronisation bidirectionnelle entre réservations et Google Agenda.",
          }),
          icon: CalendarSync, to: "/settings/calendar-sync", slug: "calendar-sync",
          iconBg: "bg-violet-100", iconColor: "text-violet-600",
        },
      ],
    },
    {
      key: "account",
      heading: pick({ en: "Account", vi: "Tài khoản", es: "Cuenta", fr: "Compte" }),
      items: [
        {
          label: pick({ en: "Billing & Subscription", vi: "Thanh toán & Gói dịch vụ", es: "Facturación y suscripción", fr: "Facturation et abonnement" }),
          description: pick({
            en: "Your plan, usage meters and plan changes.",
            vi: "Gói của bạn, đồng hồ sử dụng và thay đổi gói.",
            es: "Tu plan, medidores de uso y cambios de plan.",
            fr: "Votre formule, compteurs d'usage et changements.",
          }),
          icon: Zap, to: "/billing", slug: "subscription", external: true,
          iconBg: "bg-amber-100", iconColor: "text-amber-600",
        },
        {
          label: pick({ en: "Advanced", vi: "Nâng cao", es: "Avanzado", fr: "Avancé" }),
          description: pick({
            en: "Feature toggles and data import / export.",
            vi: "Bật/tắt tính năng và nhập/xuất dữ liệu.",
            es: "Interruptores de funciones e importación / exportación de datos.",
            fr: "Options de fonctionnalités et import / export de données.",
          }),
          icon: Sliders, to: "/settings/advanced", slug: "advanced",
          iconBg: "bg-blue-100", iconColor: "text-blue-600",
          tabs: [
            { slug: "advanced", label: pick({ en: "Advanced Features", vi: "Tính năng nâng cao", es: "Funciones avanzadas", fr: "Fonctions avancées" }),
              description: pick({ en: "Turn platform features on or off for your store.", vi: "Bật/tắt tính năng nền tảng cho cửa hàng.", es: "Activa o desactiva funciones de la plataforma.", fr: "Activez ou désactivez des fonctionnalités." }) },
            { slug: "data-transfer", label: pick({ en: "Data Transfer", vi: "Chuyển dữ liệu", es: "Transferencia de datos", fr: "Transfert de données" }),
              description: pick({ en: "Export or import clients, appointments and history.", vi: "Xuất hoặc nhập khách, lịch hẹn và lịch sử.", es: "Exporta o importa clientes, citas e historial.", fr: "Exportez ou importez clients, rendez-vous et historique." }) },
          ],
        },
      ],
    },
  ];
}
