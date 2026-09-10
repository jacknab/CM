// Single source of truth for the Settings navigation (pages/SettingsShell.tsx).
//
// Two-level structure, modelled on GlossGenius:
//   • top tab bar  — a handful of areas (Personal / Team / Business / Subscription)
//   • left sub-nav — the active tab's items, one row per settings page
//
// SettingsShell maps each item `slug` to a pane component. Every historical
// /settings/<slug> URL still resolves. `external: true` items open their own
// full route instead of mounting in the pane.


type Pick4 = (m: { en: string; vi: string; es: string; fr: string }) => string;

export type SettingsNavItem = {
  /** short, Title-Case label */
  label: string;
  /** one-line explainer shown in the pane header + as a tooltip */
  description: string;
  /** canonical route for this destination */
  to: string;
  /** URL segment inside the settings shell — /settings/<slug> */
  slug: string;
  /** true = a full standalone page (opens outside the shell, not in the pane) */
  external?: boolean;
  /** hide unless the POS feature is enabled */
  requiresPos?: boolean;
  /** small pill next to the label (plan gate like "Gold", or a count) */
  badge?: string;
};

export type SettingsTab = {
  /** stable id — React keys, active-tab detection */
  key: string;
  label: string;
  items: SettingsNavItem[];
};

export function buildSettingsNav(pick: Pick4): SettingsTab[] {
  return [
    // ── PERSONAL ────────────────────────────────────────────────────────────
    {
      key: "personal",
      label: pick({ en: "Personal", vi: "Cá nhân", es: "Personal", fr: "Personnel" }),
      items: [
        {
          label: pick({ en: "Personal Details", vi: "Thông tin cá nhân", es: "Datos personales", fr: "Informations personnelles" }),
          description: pick({
            en: "Your name, photo and contact info as the account owner.",
            vi: "Tên, ảnh và thông tin liên hệ của chủ tài khoản.",
            es: "Tu nombre, foto y datos de contacto como titular de la cuenta.",
            fr: "Votre nom, photo et coordonnées en tant que titulaire du compte.",
          }),
          to: "/settings/personal-details", slug: "personal-details",
        },
        {
          label: pick({ en: "My Preferences", vi: "Tùy chọn của tôi", es: "Mis preferencias", fr: "Mes préférences" }),
          description: pick({
            en: "Notification defaults and calendar sync.",
            vi: "Mặc định thông báo và đồng bộ lịch.",
            es: "Preferencias de notificaciones y sincronización de calendario.",
            fr: "Préférences de notifications et synchronisation d'agenda.",
          }),
          to: "/settings/my-preferences", slug: "my-preferences",
        },
        {
          label: pick({ en: "Security", vi: "Bảo mật", es: "Seguridad", fr: "Sécurité" }),
          description: pick({
            en: "The password you sign in with.",
            vi: "Mật khẩu bạn dùng để đăng nhập.",
            es: "La contraseña con la que inicias sesión.",
            fr: "Le mot de passe avec lequel vous vous connectez.",
          }),
          to: "/settings/security", slug: "security",
        },
      ],
    },

    // ── TEAM ───────────────────────────────────────────────────────────────
    // Minimal for now — the Staff area gets its own refactor.
    {
      key: "team",
      label: pick({ en: "Team", vi: "Nhân viên", es: "Equipo", fr: "Équipe" }),
      items: [
        {
          label: pick({ en: "Staff & Roles", vi: "Nhân viên & Vai trò", es: "Personal y roles", fr: "Personnel et rôles" }),
          description: pick({
            en: "Manage team members, roles and permissions.",
            vi: "Quản lý thành viên, vai trò và quyền hạn.",
            es: "Gestiona miembros del equipo, roles y permisos.",
            fr: "Gérez les membres, les rôles et les autorisations.",
          }),
          to: "/team", slug: "team", external: true,
        },
        {
          label: pick({ en: "Earnings & Commission", vi: "Thu nhập & Hoa hồng", es: "Ingresos y comisiones", fr: "Revenus et commissions" }),
          description: pick({
            en: "Pay frequency, pay-period start day and commission rules.",
            vi: "Tần suất trả lương, ngày bắt đầu kỳ và quy tắc hoa hồng.",
            es: "Frecuencia de pago, día de inicio del período y reglas de comisión.",
            fr: "Fréquence de paie, jour de début de période et règles de commission.",
          }),
          to: "/settings/commission", slug: "commission",
        },
        {
          label: pick({ en: "Payroll", vi: "Bảng lương", es: "Nómina", fr: "Paie" }),
          description: pick({
            en: "Run payroll, review accruals and tax documents.",
            vi: "Chạy bảng lương, xem khoản tích lũy và tài liệu thuế.",
            es: "Procesa la nómina, revisa acumulados y documentos fiscales.",
            fr: "Lancez la paie, consultez les provisions et les documents fiscaux.",
          }),
          to: "/payroll", slug: "payroll", external: true,
        },
      ],
    },

    // ── BUSINESS ───────────────────────────────────────────────────────────
    {
      key: "business",
      label: pick({ en: "Business", vi: "Kinh doanh", es: "Negocio", fr: "Entreprise" }),
      items: [
        {
          label: pick({ en: "Business Details", vi: "Thông tin kinh doanh", es: "Datos del negocio", fr: "Informations" }),
          description: pick({ en: "Store name, address, logo and contact details.", vi: "Tên, địa chỉ, logo và thông tin liên hệ.", es: "Nombre, dirección, logo y datos de contacto.", fr: "Nom, adresse, logo et coordonnées." }),
          to: "/settings/business", slug: "business",
        },
        {
          label: pick({ en: "Business Hours", vi: "Giờ làm việc", es: "Horario comercial", fr: "Heures d'ouverture" }),
          description: pick({ en: "Weekly open and close times for each day.", vi: "Giờ mở và đóng cửa hàng tuần cho mỗi ngày.", es: "Horarios de apertura y cierre de cada día.", fr: "Heures d'ouverture et de fermeture pour chaque jour." }),
          to: "/settings/hours", slug: "hours",
        },
        {
          label: pick({ en: "Booking Page", vi: "Trang đặt lịch", es: "Página de reservas", fr: "Page de réservation" }),
          description: pick({ en: "Your public booking page, widget and availability.", vi: "Trang đặt lịch công khai, widget và tình trạng còn chỗ.", es: "Tu página de reserva pública, widget y disponibilidad.", fr: "Votre page de réservation publique, widget et disponibilités." }),
          to: "/settings/online-booking", slug: "online-booking",
        },
        {
          label: pick({ en: "Booking Controls", vi: "Kiểm soát đặt lịch", es: "Controles de reserva", fr: "Contrôles de réservation" }),
          description: pick({ en: "Approval, lead time, advance limit, card-on-file, cancellation policy and fees.", vi: "Duyệt, thời gian báo trước, giới hạn đặt trước, thẻ lưu, chính sách và phí hủy.", es: "Aprobación, antelación, límite de reserva, tarjeta en archivo, política y tarifas de cancelación.", fr: "Approbation, délai, limite d'anticipation, carte enregistrée, politique et frais d'annulation." }),
          to: "/settings/booking-controls", slug: "booking-controls",
        },
        {
          label: pick({ en: "Stations & Chairs", vi: "Bàn & Ghế", es: "Estaciones y sillas", fr: "Postes et fauteuils" }),
          description: pick({ en: "Bookable nail stations, pedicure chairs and rooms.", vi: "Bàn làm nail, ghế pedicure và phòng có thể đặt.", es: "Estaciones de manicura, sillas de pedicura y salas reservables.", fr: "Postes de manucure, fauteuils de pédicure et salles réservables." }),
          to: "/settings/resources", slug: "resources",
        },
        {
          label: pick({ en: "Check-in Kiosk", vi: "Kiosk check-in", es: "Kiosco de registro", fr: "Kiosque d'enregistrement" }),
          description: pick({ en: "Self check-in tablet URL, QR code and welcome text.", vi: "URL máy tính bảng tự check-in, mã QR và lời chào.", es: "URL del tablet de auto check-in, código QR y texto de bienvenida.", fr: "URL de la tablette d'enregistrement, QR code et message d'accueil." }),
          to: "/settings/kiosk", slug: "kiosk",
        },
        {
          label: pick({ en: "Text Messages", vi: "Tin nhắn SMS", es: "Mensajes de texto", fr: "SMS" }),
          description: pick({ en: "Text reminders, message templates and opt-outs.", vi: "Nhắc nhở qua SMS, mẫu tin nhắn và hủy nhận.", es: "Recordatorios por SMS, plantillas y exclusiones.", fr: "Rappels SMS, modèles de messages et désinscriptions." }),
          to: "/settings/sms", slug: "sms",
        },
        {
          label: pick({ en: "Email", vi: "Email", es: "Correo", fr: "E-mail" }),
          description: pick({ en: "Email notifications and sender details.", vi: "Thông báo email và thông tin người gửi.", es: "Notificaciones por correo y datos del remitente.", fr: "Notifications par e-mail et coordonnées de l'expéditeur." }),
          to: "/settings/email", slug: "email",
        },
        {
          label: pick({ en: "Payments & Checkout", vi: "Thanh toán & Tính tiền", es: "Pagos y cobro", fr: "Paiements et encaissement" }),
          description: pick({ en: "Sales tax rate, card reader and point-of-sale configuration.", vi: "Thuế bán hàng, đầu đọc thẻ và cấu hình điểm bán.", es: "Impuesto sobre ventas, lector de tarjetas y configuración del PDV.", fr: "Taux de taxe, lecteur de carte et configuration du point de vente." }),
          to: "/settings/pos", slug: "pos", requiresPos: true,
        },
        {
          label: pick({ en: "Payout Account", vi: "Tài khoản nhận tiền", es: "Cuenta de cobros", fr: "Compte de versement" }),
          description: pick({ en: "Verify your identity and link a bank account for payouts.", vi: "Xác minh danh tính và liên kết tài khoản ngân hàng để nhận tiền.", es: "Verifica tu identidad y vincula una cuenta bancaria para cobros.", fr: "Vérifiez votre identité et reliez un compte bancaire pour les versements." }),
          to: "/settings/payout-account", slug: "payout-account", requiresPos: true,
        },
        {
          label: pick({ en: "Language", vi: "Ngôn ngữ", es: "Idioma", fr: "Langue" }),
          description: pick({ en: "Display language for staff screens and the queue overlay.", vi: "Ngôn ngữ hiển thị cho màn hình nhân viên và bảng hàng đợi.", es: "Idioma para las pantallas del personal y la cola.", fr: "Langue d'affichage pour les écrans du personnel et la file." }),
          to: "/settings/language", slug: "language",
        },
        {
          label: pick({ en: "Content Translations", vi: "Dịch nội dung", es: "Traducciones de contenido", fr: "Traductions de contenu" }),
          description: pick({ en: "AI translations for services, categories, add-ons and products.", vi: "Dịch bằng AI cho dịch vụ, danh mục, tiện ích và sản phẩm.", es: "Traducciones con IA para servicios, categorías, extras y productos.", fr: "Traductions IA pour services, catégories, extras et produits." }),
          to: "/settings/translations", slug: "translations",
        },
        {
          label: pick({ en: "Advanced Features", vi: "Tính năng nâng cao", es: "Funciones avanzadas", fr: "Fonctions avancées" }),
          description: pick({ en: "Turn platform features on or off for your store.", vi: "Bật hoặc tắt các tính năng nền tảng cho cửa hàng.", es: "Activa o desactiva funciones de la plataforma para tu tienda.", fr: "Activez ou désactivez des fonctionnalités pour votre établissement." }),
          to: "/settings/advanced", slug: "advanced",
        },
        {
          label: pick({ en: "Import & Export", vi: "Nhập & Xuất", es: "Importar y exportar", fr: "Import et export" }),
          description: pick({ en: "Export or import clients, appointments and history.", vi: "Xuất hoặc nhập khách hàng, lịch hẹn và lịch sử.", es: "Exporta o importa clientes, citas e historial.", fr: "Exportez ou importez clients, rendez-vous et historique." }),
          to: "/settings/data-transfer", slug: "data-transfer",
        },
      ],
    },

    // ── SUBSCRIPTION ───────────────────────────────────────────────────────
    {
      key: "subscription",
      label: pick({ en: "Subscription", vi: "Gói dịch vụ", es: "Suscripción", fr: "Abonnement" }),
      items: [
        {
          label: pick({ en: "Plan & Billing", vi: "Gói & Thanh toán", es: "Plan y facturación", fr: "Formule et facturation" }),
          description: pick({
            en: "Your plan, usage meters, payment method and invoices.",
            vi: "Gói của bạn, đồng hồ sử dụng, phương thức thanh toán và hóa đơn.",
            es: "Tu plan, medidores de uso, método de pago y facturas.",
            fr: "Votre formule, compteurs d'usage, moyen de paiement et factures.",
          }),
          to: "/billing", slug: "subscription", external: true,
        },
      ],
    },
  ];
}
