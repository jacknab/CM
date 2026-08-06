export type BookingLang = "en" | "es" | "vi" | "zh" | "ko" | "fr";

export interface BookingStrings {
  selectCategory: string;
  selectService: string;
  servicesCount: (n: number) => string;
  chooseDateAndTime: string;
  from: string;
  optionsBadge: (n: number) => string;
  enhanceService: string;
  addOnsFor: (name: string) => string;
  chooseOption: string;
  cancel: string;
  chooseTime: string;
  selectDateTime: string;
  whatTimeWorks: string;
  noTimesAvailable: string;
  chooseAnotherDate: string;
  morning: string;
  afternoon: string;
  evening: string;
  confirmBooking: string;
  confirm: string;
  confirmBtn: string;
  fieldName: string;
  fieldEmail: string;
  fieldPhone: string;
  yourDetails: string;
  namePlaceholder: string;
  fullNamePlaceholder: string;
  emailPlaceholder: string;
  emailPlaceholder2: string;
  phonePlaceholder: string;
  phonePlaceholder2: string;
  phonePlaceholder3: string;
  total: string;
  totalToPay: string;
  depositRequired: string;
  depositRequiredToday: string;
  withStaff: (name: string) => string;
  dateLabel: string;
  timeLabel: string;
  bookingConfirmedTitle: string;
  bookingConfirmedMsg: (storeName: string) => string;
  bookingConfirmedEmail: string;
  confirmationNumber: string;
  viewConfirmation: string;
  navHome: string;
  navCart: string;
  navProfile: string;
  yourChosenStylist: string;
  servicesSection: string;
  moreServices: string;
  selectTime: string;
  profileTitle: string;
  totalSpend: string;
  depositLabel: string;
  noShows: string;
  cancellations: string;
  recentAppointments: string;
  totalColon: string;
  phoneError: string;
}

const en: BookingStrings = {
  selectCategory: "Select Category",
  selectService: "Select Service",
  servicesCount: n => `${n} Service${n !== 1 ? "s" : ""}`,
  chooseDateAndTime: "Choose Date/Time",
  from: "from ",
  optionsBadge: n => `${n} options`,
  enhanceService: "Enhance your service",
  addOnsFor: name => `Add-ons for ${name}`,
  chooseOption: "Choose an option to continue",
  cancel: "Cancel",
  chooseTime: "Choose Time",
  selectDateTime: "Select Date & Time",
  whatTimeWorks: "What time works?",
  noTimesAvailable: "No available times for this date.",
  chooseAnotherDate: "Choose Another Date",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  confirmBooking: "Confirm Booking",
  confirm: "Confirm",
  confirmBtn: "Confirm Booking",
  fieldName: "Name",
  fieldEmail: "Email (Optional)",
  fieldPhone: "Phone",
  yourDetails: "Your Details",
  namePlaceholder: "Your full name",
  fullNamePlaceholder: "Full Name",
  emailPlaceholder: "you@example.com",
  emailPlaceholder2: "your@email.com",
  phonePlaceholder: "(555) 555-5555",
  phonePlaceholder2: "Phone Number (555) 555-5555",
  phonePlaceholder3: "Phone number",
  total: "Total",
  totalToPay: "Total to pay",
  depositRequired: "Deposit required",
  depositRequiredToday: "Deposit required today",
  withStaff: name => `With ${name}`,
  dateLabel: "Date",
  timeLabel: "Time",
  bookingConfirmedTitle: "Booking Confirmed!",
  bookingConfirmedMsg: store => `Your appointment at ${store} has been booked successfully.`,
  bookingConfirmedEmail: "Booking confirmed! Check your email for details.",
  confirmationNumber: "Confirmation number:",
  viewConfirmation: "View Confirmation",
  navHome: "Home",
  navCart: "Cart",
  navProfile: "Profile",
  yourChosenStylist: "Your chosen stylist",
  servicesSection: "Services",
  moreServices: "More Services",
  selectTime: "Select Time",
  profileTitle: "Profile",
  totalSpend: "Total Spend",
  depositLabel: "Deposit",
  noShows: "No-Shows",
  cancellations: "Cancellations",
  recentAppointments: "Recent Appointments",
  totalColon: "Total:",
  phoneError: "Enter a valid 10-digit phone number.",
};

const es: BookingStrings = {
  selectCategory: "Seleccionar categoría",
  selectService: "Seleccionar servicio",
  servicesCount: n => `${n} Servicio${n !== 1 ? "s" : ""}`,
  chooseDateAndTime: "Elegir fecha/hora",
  from: "desde ",
  optionsBadge: n => `${n} opciones`,
  enhanceService: "Mejora tu servicio",
  addOnsFor: name => `Complementos para ${name}`,
  chooseOption: "Elige una opción para continuar",
  cancel: "Cancelar",
  chooseTime: "Elegir hora",
  selectDateTime: "Seleccionar fecha y hora",
  whatTimeWorks: "¿Qué horario te viene bien?",
  noTimesAvailable: "No hay horarios disponibles para esta fecha.",
  chooseAnotherDate: "Elegir otra fecha",
  morning: "Mañana",
  afternoon: "Tarde",
  evening: "Noche",
  confirmBooking: "Confirmar reserva",
  confirm: "Confirmar",
  confirmBtn: "Confirmar reserva",
  fieldName: "Nombre",
  fieldEmail: "Correo electrónico (opcional)",
  fieldPhone: "Teléfono",
  yourDetails: "Tus datos",
  namePlaceholder: "Tu nombre completo",
  fullNamePlaceholder: "Nombre completo",
  emailPlaceholder: "tú@ejemplo.com",
  emailPlaceholder2: "tu@correo.com",
  phonePlaceholder: "(555) 555-5555",
  phonePlaceholder2: "Teléfono (555) 555-5555",
  phonePlaceholder3: "Número de teléfono",
  total: "Total",
  totalToPay: "Total a pagar",
  depositRequired: "Depósito requerido",
  depositRequiredToday: "Depósito requerido hoy",
  withStaff: name => `Con ${name}`,
  dateLabel: "Fecha",
  timeLabel: "Hora",
  bookingConfirmedTitle: "¡Reserva confirmada!",
  bookingConfirmedMsg: store => `Tu cita en ${store} ha sido reservada exitosamente.`,
  bookingConfirmedEmail: "¡Reserva confirmada! Revisa tu correo para más detalles.",
  confirmationNumber: "Número de confirmación:",
  viewConfirmation: "Ver confirmación",
  navHome: "Inicio",
  navCart: "Carrito",
  navProfile: "Perfil",
  yourChosenStylist: "Tu estilista elegido",
  servicesSection: "Servicios",
  moreServices: "Más servicios",
  selectTime: "Seleccionar hora",
  profileTitle: "Perfil",
  totalSpend: "Gasto total",
  depositLabel: "Depósito",
  noShows: "No presentados",
  cancellations: "Cancelaciones",
  recentAppointments: "Citas recientes",
  totalColon: "Total:",
  phoneError: "Ingresa un número de teléfono de 10 dígitos válido.",
};

const vi: BookingStrings = {
  selectCategory: "Chọn danh mục",
  selectService: "Chọn dịch vụ",
  servicesCount: n => `${n} Dịch vụ`,
  chooseDateAndTime: "Chọn ngày/giờ",
  from: "từ ",
  optionsBadge: n => `${n} lựa chọn`,
  enhanceService: "Nâng cấp dịch vụ",
  addOnsFor: name => `Dịch vụ bổ sung cho ${name}`,
  chooseOption: "Chọn một tùy chọn để tiếp tục",
  cancel: "Hủy",
  chooseTime: "Chọn giờ",
  selectDateTime: "Chọn ngày & giờ",
  whatTimeWorks: "Giờ nào phù hợp?",
  noTimesAvailable: "Không có khung giờ nào cho ngày này.",
  chooseAnotherDate: "Chọn ngày khác",
  morning: "Buổi sáng",
  afternoon: "Buổi chiều",
  evening: "Buổi tối",
  confirmBooking: "Xác nhận đặt lịch",
  confirm: "Xác nhận",
  confirmBtn: "Xác nhận đặt lịch",
  fieldName: "Họ tên",
  fieldEmail: "Email (Tùy chọn)",
  fieldPhone: "Điện thoại",
  yourDetails: "Thông tin của bạn",
  namePlaceholder: "Họ và tên đầy đủ",
  fullNamePlaceholder: "Họ và tên",
  emailPlaceholder: "ban@example.com",
  emailPlaceholder2: "ban@email.com",
  phonePlaceholder: "(555) 555-5555",
  phonePlaceholder2: "Số điện thoại (555) 555-5555",
  phonePlaceholder3: "Số điện thoại",
  total: "Tổng cộng",
  totalToPay: "Tổng thanh toán",
  depositRequired: "Yêu cầu đặt cọc",
  depositRequiredToday: "Đặt cọc hôm nay",
  withStaff: name => `Với ${name}`,
  dateLabel: "Ngày",
  timeLabel: "Giờ",
  bookingConfirmedTitle: "Đặt lịch thành công!",
  bookingConfirmedMsg: store => `Lịch hẹn tại ${store} đã được đặt thành công.`,
  bookingConfirmedEmail: "Đặt lịch thành công! Kiểm tra email để biết chi tiết.",
  confirmationNumber: "Mã xác nhận:",
  viewConfirmation: "Xem xác nhận",
  navHome: "Trang chủ",
  navCart: "Giỏ hàng",
  navProfile: "Hồ sơ",
  yourChosenStylist: "Kỹ thuật viên bạn chọn",
  servicesSection: "Dịch vụ",
  moreServices: "Xem thêm dịch vụ",
  selectTime: "Chọn giờ",
  profileTitle: "Hồ sơ",
  totalSpend: "Tổng chi tiêu",
  depositLabel: "Đặt cọc",
  noShows: "Vắng mặt",
  cancellations: "Hủy lịch",
  recentAppointments: "Lịch hẹn gần đây",
  totalColon: "Tổng:",
  phoneError: "Vui lòng nhập số điện thoại 10 chữ số hợp lệ.",
};

const zh: BookingStrings = {
  selectCategory: "选择类别",
  selectService: "选择服务",
  servicesCount: n => `${n} 项服务`,
  chooseDateAndTime: "选择日期/时间",
  from: "起价 ",
  optionsBadge: n => `${n} 个选项`,
  enhanceService: "增加额外服务",
  addOnsFor: name => `${name} 的附加项目`,
  chooseOption: "请选择一个选项继续",
  cancel: "取消",
  chooseTime: "选择时间",
  selectDateTime: "选择日期和时间",
  whatTimeWorks: "哪个时间合适？",
  noTimesAvailable: "该日期暂无可用时段。",
  chooseAnotherDate: "选择其他日期",
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
  confirmBooking: "确认预约",
  confirm: "确认",
  confirmBtn: "确认预约",
  fieldName: "姓名",
  fieldEmail: "邮箱（可选）",
  fieldPhone: "电话",
  yourDetails: "您的信息",
  namePlaceholder: "您的全名",
  fullNamePlaceholder: "全名",
  emailPlaceholder: "您的邮箱",
  emailPlaceholder2: "您的邮箱",
  phonePlaceholder: "(555) 555-5555",
  phonePlaceholder2: "电话号码 (555) 555-5555",
  phonePlaceholder3: "电话号码",
  total: "合计",
  totalToPay: "应付总额",
  depositRequired: "需要预付定金",
  depositRequiredToday: "今日需付定金",
  withStaff: name => `技师：${name}`,
  dateLabel: "日期",
  timeLabel: "时间",
  bookingConfirmedTitle: "预约成功！",
  bookingConfirmedMsg: store => `您在 ${store} 的预约已成功完成。`,
  bookingConfirmedEmail: "预约成功！请查看邮件获取详情。",
  confirmationNumber: "确认编号：",
  viewConfirmation: "查看确认信息",
  navHome: "首页",
  navCart: "购物车",
  navProfile: "个人资料",
  yourChosenStylist: "您选择的技师",
  servicesSection: "服务项目",
  moreServices: "更多服务",
  selectTime: "选择时间",
  profileTitle: "个人资料",
  totalSpend: "总消费",
  depositLabel: "定金",
  noShows: "未出现",
  cancellations: "取消次数",
  recentAppointments: "近期预约",
  totalColon: "合计：",
  phoneError: "请输入有效的10位电话号码。",
};

const ko: BookingStrings = {
  selectCategory: "카테고리 선택",
  selectService: "서비스 선택",
  servicesCount: n => `${n}개 서비스`,
  chooseDateAndTime: "날짜/시간 선택",
  from: "부터 ",
  optionsBadge: n => `${n}가지 옵션`,
  enhanceService: "서비스 업그레이드",
  addOnsFor: name => `${name} 추가 서비스`,
  chooseOption: "계속하려면 옵션을 선택하세요",
  cancel: "취소",
  chooseTime: "시간 선택",
  selectDateTime: "날짜 및 시간 선택",
  whatTimeWorks: "어느 시간이 좋으세요?",
  noTimesAvailable: "이 날짜에는 예약 가능한 시간이 없습니다.",
  chooseAnotherDate: "다른 날짜 선택",
  morning: "오전",
  afternoon: "오후",
  evening: "저녁",
  confirmBooking: "예약 확인",
  confirm: "확인",
  confirmBtn: "예약 확인",
  fieldName: "이름",
  fieldEmail: "이메일 (선택)",
  fieldPhone: "전화번호",
  yourDetails: "고객 정보",
  namePlaceholder: "성함을 입력해 주세요",
  fullNamePlaceholder: "성함",
  emailPlaceholder: "이메일 주소",
  emailPlaceholder2: "이메일 주소",
  phonePlaceholder: "(555) 555-5555",
  phonePlaceholder2: "전화번호 (555) 555-5555",
  phonePlaceholder3: "전화번호",
  total: "합계",
  totalToPay: "결제 금액",
  depositRequired: "보증금 필요",
  depositRequiredToday: "오늘 보증금 납부 필요",
  withStaff: name => `${name} 담당`,
  dateLabel: "날짜",
  timeLabel: "시간",
  bookingConfirmedTitle: "예약 완료!",
  bookingConfirmedMsg: store => `${store}에서의 예약이 성공적으로 완료되었습니다.`,
  bookingConfirmedEmail: "예약 완료! 자세한 내용은 이메일을 확인해 주세요.",
  confirmationNumber: "예약 번호:",
  viewConfirmation: "예약 확인서 보기",
  navHome: "홈",
  navCart: "장바구니",
  navProfile: "프로필",
  yourChosenStylist: "선택하신 담당자",
  servicesSection: "서비스",
  moreServices: "더 많은 서비스",
  selectTime: "시간 선택",
  profileTitle: "프로필",
  totalSpend: "총 지출",
  depositLabel: "보증금",
  noShows: "노쇼",
  cancellations: "취소",
  recentAppointments: "최근 예약",
  totalColon: "합계:",
  phoneError: "유효한 10자리 전화번호를 입력해 주세요.",
};

const fr: BookingStrings = {
  selectCategory: "Choisir une catégorie",
  selectService: "Choisir un service",
  servicesCount: n => `${n} Service${n !== 1 ? "s" : ""}`,
  chooseDateAndTime: "Choisir date/heure",
  from: "à partir de ",
  optionsBadge: n => `${n} option${n !== 1 ? "s" : ""}`,
  enhanceService: "Améliorer votre service",
  addOnsFor: name => `Suppléments pour ${name}`,
  chooseOption: "Choisissez une option pour continuer",
  cancel: "Annuler",
  chooseTime: "Choisir l'heure",
  selectDateTime: "Choisir la date et l'heure",
  whatTimeWorks: "Quelle heure vous convient ?",
  noTimesAvailable: "Aucun horaire disponible pour cette date.",
  chooseAnotherDate: "Choisir une autre date",
  morning: "Matin",
  afternoon: "Après-midi",
  evening: "Soir",
  confirmBooking: "Confirmer la réservation",
  confirm: "Confirmer",
  confirmBtn: "Confirmer la réservation",
  fieldName: "Nom",
  fieldEmail: "Email (facultatif)",
  fieldPhone: "Téléphone",
  yourDetails: "Vos informations",
  namePlaceholder: "Votre nom complet",
  fullNamePlaceholder: "Nom complet",
  emailPlaceholder: "vous@exemple.fr",
  emailPlaceholder2: "votre@email.fr",
  phonePlaceholder: "(555) 555-5555",
  phonePlaceholder2: "Numéro de téléphone (555) 555-5555",
  phonePlaceholder3: "Numéro de téléphone",
  total: "Total",
  totalToPay: "Total à payer",
  depositRequired: "Acompte requis",
  depositRequiredToday: "Acompte requis aujourd'hui",
  withStaff: name => `Avec ${name}`,
  dateLabel: "Date",
  timeLabel: "Heure",
  bookingConfirmedTitle: "Réservation confirmée !",
  bookingConfirmedMsg: store => `Votre rendez-vous chez ${store} a été réservé avec succès.`,
  bookingConfirmedEmail: "Réservation confirmée ! Vérifiez votre email pour les détails.",
  confirmationNumber: "Numéro de confirmation :",
  viewConfirmation: "Voir la confirmation",
  navHome: "Accueil",
  navCart: "Panier",
  navProfile: "Profil",
  yourChosenStylist: "Votre styliste choisi",
  servicesSection: "Services",
  moreServices: "Plus de services",
  selectTime: "Choisir l'heure",
  profileTitle: "Profil",
  totalSpend: "Dépense totale",
  depositLabel: "Acompte",
  noShows: "Absences",
  cancellations: "Annulations",
  recentAppointments: "Rendez-vous récents",
  totalColon: "Total :",
  phoneError: "Veuillez saisir un numéro de téléphone à 10 chiffres valide.",
};

export const BOOKING_STRINGS: Record<BookingLang, BookingStrings> = { en, es, vi, zh, ko, fr };

export function detectBrowserLang(): BookingLang {
  const supported: BookingLang[] = ["en", "es", "vi", "zh", "ko", "fr"];
  try {
    const nav = (navigator.languages?.[0] ?? navigator.language ?? "en")
      .toLowerCase()
      .split("-")[0];
    return supported.find(l => l === nav) ?? "en";
  } catch {
    return "en";
  }
}
