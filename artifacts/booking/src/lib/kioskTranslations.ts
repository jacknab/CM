export type LangCode = "en" | "es" | "vi" | "zh" | "ko";

export interface KioskStrings {
  langLabel: string;

  // Idle
  defaultSubText: string;
  tapToBegin: string;
  kioskReady: string;

  // Closed
  weClosed: string;
  seeFrontDesk: string;

  // Loading / generic
  oneMoment: string;
  somethingWrong: string;
  tryAgain: string;

  // Phone screen
  selfCheckInKiosk: string;
  loyaltyRewards: string;
  enterPhone: string;
  infoNeverShared: string;
  cancel: string;

  // Welcome back
  loyaltyPoints: (n: number) => string;
  visitReturn: (n: number) => string;
  loadingOptions: string;

  // Name entry
  firstTimeHere: string;
  whatsYourName: string;
  yourNamePlaceholder: string;
  spaceKey: string;
  continueBtn: string;

  // Wait confirm
  teamWithOthers: string;
  estimatedWait: string;
  youreNext: string;
  beRightWithYou: string;
  wouldYouLikeToWait: string;
  yesIllWait: string;
  continueCheckin: string;
  noThanks: string;
  maybeAnotherTime: string;
  startOver: string;

  // Fully booked
  fullyBookedNow: string;
  fullyBookedBody: (name: string) => string;
  fullyBookedSub: string;
  textIfSpot: string;
  yesTextMe: string;
  joinWaitlist: string;

  // Waitlist added
  youreOnTheList: string;
  wellTextYouSoon: string;
  howItWorks: string;
  waitlistStep1Title: string;
  waitlistStep1Body: string;
  waitlistStep2Title: string;
  waitlistStep2Body: string;
  waitlistStep3Title: string;
  waitlistStep3Body: string;
  newCheckin: string;

  // No thanks
  thanksForStoppingBy: (name: string) => string;
  hopeToSeeYouSoon: string;
  weSentYouText: string;
  checkMessages: string;

  // Service type
  checkinPrefix: string;
  whatBringsYouIn: (name: string) => string;
  handServices: string;
  handBullet1: string;
  handBullet2: string;
  handBullet3: string;
  footServices: string;
  footBullet1: string;
  footBullet2: string;
  footBullet3: string;
  maniPediPackages: string;
  comboBullet1: string;
  comboBullet2: string;
  comboBullet3: string;
  backBtn: string;

  // Services
  tapToSelect: string;
  noServices: string;
  noServiceSelected: string;
  pageOf: (cur: number, total: number) => string;
  previousBtn: string;
  seeMore: string;

  // Addons
  optional: string;
  wouldYouLikeToAdd: string;
  addonsAvailableWith: (svcName: string) => string;
  addonsSelected: (n: number) => string;
  skipBtn: string;

  // Stylist
  whoWouldYouLike: string;
  pickStylist: string;
  nextAvailable: string;
  autoAssign: string;
  selectedCheck: string;
  checkInBtn: string;

  // Ticket
  allCheckedIn: string;
  showQr: string;
  clientLabel: string;
  withStaff: (name: string) => string;
  servicesLabel: string;
  minEst: (n: number) => string;
  bookingHash: string;
  staffScanQr: string;

  // Appointment confirmed
  youreCheckedIn: (name: string) => string;
  appointmentConfirmed: string;
  yourService: string;
  appointmentTime: string;
  yourStylist: string;
  staffWithYouSoon: (name: string) => string;
  teamWithYouSoon: string;
  loyaltyPointsLabel: (n: number) => string;
  doneBtn: string;
}

const en: KioskStrings = {
  langLabel: "English",
  defaultSubText: "Your style journey starts here",
  tapToBegin: "👆  TAP ANYWHERE TO BEGIN",
  kioskReady: "Kiosk Ready",
  weClosed: "We're closed right now",
  seeFrontDesk: "Please see a team member at the front desk",
  oneMoment: "One moment…",
  somethingWrong: "Something went wrong.",
  tryAgain: "Try Again",
  selfCheckInKiosk: "Self Check-In Kiosk",
  loyaltyRewards: "⭐ Loyalty Rewards",
  enterPhone: "Enter your cell phone number",
  infoNeverShared: "Your information is never shared",
  cancel: "Cancel",
  loyaltyPoints: n => `${n} loyalty points`,
  visitReturn: n => `Visit #${n} — thanks for coming back!`,
  loadingOptions: "Loading your options…",
  firstTimeHere: "First time here?",
  whatsYourName: "Welcome! What's your name?",
  yourNamePlaceholder: "Your name",
  spaceKey: "SPACE",
  continueBtn: "Continue →",
  teamWithOthers: "Our team is currently with other clients",
  estimatedWait: "Estimated wait time",
  youreNext: "You're next!",
  beRightWithYou: "We'll be right with you",
  wouldYouLikeToWait: "Would you like to wait?",
  yesIllWait: "Yes, I'll wait",
  continueCheckin: "Continue check-in",
  noThanks: "No thanks",
  maybeAnotherTime: "Maybe another time",
  startOver: "← Start over",
  fullyBookedNow: "We're fully booked right now",
  fullyBookedBody: name => `Sorry${name !== "there" ? `, ${name}` : ""}! Our team is fully booked.`,
  fullyBookedSub: "We don't have an open slot in the next hour — but sometimes appointments don't show up.",
  textIfSpot: "Want us to text you if a spot opens up?",
  yesTextMe: "Yes, text me!",
  joinWaitlist: "Join the waitlist",
  youreOnTheList: "You're on the list!",
  wellTextYouSoon: "We'll text you the moment a slot opens up today.",
  howItWorks: "📋 Here's how it works",
  waitlistStep1Title: "We'll text you",
  waitlistStep1Body: "As soon as a booked appointment doesn't show up, you'll get a text.",
  waitlistStep2Title: "15-minute window",
  waitlistStep2Body: "Come in within 15 minutes of the text to claim the spot.",
  waitlistStep3Title: "First come, first served",
  waitlistStep3Body: "The first person to arrive gets the open slot.",
  newCheckin: "← New Check-in",
  thanksForStoppingBy: name => `Thanks for stopping by, ${name}!`,
  hopeToSeeYouSoon: "We hope to see you again soon.",
  weSentYouText: "We've sent you a text!",
  checkMessages: "Check your messages for our online booking link to schedule for a later date.",
  checkinPrefix: "Check-in",
  whatBringsYouIn: name => `Hi ${name}! What brings you in today?`,
  handServices: "Hand Services",
  handBullet1: "Manicures",
  handBullet2: "Nail Enhancements",
  handBullet3: "Nail Repairs",
  footServices: "Foot Services",
  footBullet1: "Pedicures",
  footBullet2: "Foot Treatments",
  footBullet3: "Toe Nail Care",
  maniPediPackages: "Mani-Pedi Packages",
  comboBullet1: "Hand & Foot Care",
  comboBullet2: "Combo Services",
  comboBullet3: "Best Value",
  backBtn: "← Back",
  tapToSelect: "Tap to select your service",
  noServices: "No services configured yet.",
  noServiceSelected: "No service selected yet — tap a card above",
  pageOf: (c, t) => `Page ${c}/${t}`,
  previousBtn: "← Previous",
  seeMore: "See More  ›",
  optional: "Optional",
  wouldYouLikeToAdd: "Would you like to add anything?",
  addonsAvailableWith: s => `Add-ons available with ${s}`,
  addonsSelected: n => `${n} add-on${n > 1 ? "s" : ""} selected`,
  skipBtn: "Skip →",
  whoWouldYouLike: "Who would you like today?",
  pickStylist: "Pick your preferred stylist or go with next available",
  nextAvailable: "Next Available",
  autoAssign: "Auto-assign",
  selectedCheck: "Selected ✓",
  checkInBtn: "Check In →",
  allCheckedIn: "You're all checked in!",
  showQr: "Show this screen or QR code to your stylist",
  clientLabel: "Client",
  withStaff: name => `With ${name}`,
  servicesLabel: "Services",
  minEst: n => `${n} min est.`,
  bookingHash: "Booking #",
  staffScanQr: "Staff: scan to pull up booking",
  youreCheckedIn: name => `You're checked in, ${name}!`,
  appointmentConfirmed: "We've got your appointment confirmed.",
  yourService: "Your Service",
  appointmentTime: "Appointment time",
  yourStylist: "Your stylist",
  staffWithYouSoon: name => `${name} will be with you shortly.`,
  teamWithYouSoon: "A member of our team will be with you shortly.",
  loyaltyPointsLabel: n => `${n} loyalty points`,
  doneBtn: "← Done",
};

const es: KioskStrings = {
  langLabel: "Español",
  defaultSubText: "Tu viaje de estilo comienza aquí",
  tapToBegin: "👆  TOCA PARA COMENZAR",
  kioskReady: "Kiosk Listo",
  weClosed: "Estamos cerrados ahora",
  seeFrontDesk: "Por favor hable con un miembro del equipo",
  oneMoment: "Un momento…",
  somethingWrong: "Algo salió mal.",
  tryAgain: "Intentar de nuevo",
  selfCheckInKiosk: "Kiosk de Auto Check-In",
  loyaltyRewards: "⭐ Puntos de Lealtad",
  enterPhone: "Ingresa tu número de celular",
  infoNeverShared: "Tu información nunca se comparte",
  cancel: "Cancelar",
  loyaltyPoints: n => `${n} puntos de lealtad`,
  visitReturn: n => `Visita #${n} — ¡gracias por regresar!`,
  loadingOptions: "Cargando tus opciones…",
  firstTimeHere: "¿Es tu primera vez?",
  whatsYourName: "¡Bienvenido! ¿Cómo te llamas?",
  yourNamePlaceholder: "Tu nombre",
  spaceKey: "ESPACIO",
  continueBtn: "Continuar →",
  teamWithOthers: "Nuestro equipo está con otros clientes",
  estimatedWait: "Tiempo de espera estimado",
  youreNext: "¡Eres el siguiente!",
  beRightWithYou: "Estaremos contigo enseguida",
  wouldYouLikeToWait: "¿Te gustaría esperar?",
  yesIllWait: "Sí, esperaré",
  continueCheckin: "Continuar check-in",
  noThanks: "No, gracias",
  maybeAnotherTime: "Quizás en otra ocasión",
  startOver: "← Volver al inicio",
  fullyBookedNow: "Estamos completamente ocupados",
  fullyBookedBody: name => `Lo sentimos${name !== "there" ? `, ${name}` : ""}! Nuestro equipo está completamente ocupado.`,
  fullyBookedSub: "No tenemos un espacio disponible en la próxima hora, pero a veces hay cancelaciones.",
  textIfSpot: "¿Quieres que te avisemos si se abre un espacio?",
  yesTextMe: "¡Sí, avísame!",
  joinWaitlist: "Unirse a la lista de espera",
  youreOnTheList: "¡Estás en la lista!",
  wellTextYouSoon: "Te avisaremos en cuanto se abra un espacio hoy.",
  howItWorks: "📋 Cómo funciona",
  waitlistStep1Title: "Te avisamos",
  waitlistStep1Body: "En cuanto una cita no se presente, recibirás un mensaje.",
  waitlistStep2Title: "Ventana de 15 minutos",
  waitlistStep2Body: "Ven dentro de 15 minutos del mensaje para reclamar el espacio.",
  waitlistStep3Title: "Primero en llegar, primero en ser atendido",
  waitlistStep3Body: "La primera persona en llegar obtiene el espacio libre.",
  newCheckin: "← Nuevo Check-in",
  thanksForStoppingBy: name => `¡Gracias por visitarnos, ${name}!`,
  hopeToSeeYouSoon: "Esperamos verte pronto.",
  weSentYouText: "¡Te enviamos un mensaje!",
  checkMessages: "Revisa tus mensajes para el enlace de reservas en línea.",
  checkinPrefix: "Check-in",
  whatBringsYouIn: name => `¡Hola ${name}! ¿Qué te trae hoy?`,
  handServices: "Servicios de Manos",
  handBullet1: "Manicuras",
  handBullet2: "Extensiones de Uñas",
  handBullet3: "Reparación de Uñas",
  footServices: "Servicios de Pies",
  footBullet1: "Pedicuras",
  footBullet2: "Tratamientos de Pies",
  footBullet3: "Cuidado de Uñas de Pies",
  maniPediPackages: "Paquetes Mani-Pedi",
  comboBullet1: "Cuidado de Manos y Pies",
  comboBullet2: "Servicios Combinados",
  comboBullet3: "Mejor Valor",
  backBtn: "← Atrás",
  tapToSelect: "Toca para seleccionar tu servicio",
  noServices: "Sin servicios configurados aún.",
  noServiceSelected: "Ningún servicio seleccionado — toca una tarjeta arriba",
  pageOf: (c, t) => `Página ${c}/${t}`,
  previousBtn: "← Anterior",
  seeMore: "Ver más  ›",
  optional: "Opcional",
  wouldYouLikeToAdd: "¿Te gustaría agregar algo?",
  addonsAvailableWith: s => `Extras disponibles con ${s}`,
  addonsSelected: n => `${n} extra${n > 1 ? "s" : ""} seleccionado${n > 1 ? "s" : ""}`,
  skipBtn: "Omitir →",
  whoWouldYouLike: "¿Quién prefieres hoy?",
  pickStylist: "Elige tu estilista preferido o el primero disponible",
  nextAvailable: "Próximo Disponible",
  autoAssign: "Asignación automática",
  selectedCheck: "Seleccionado ✓",
  checkInBtn: "Check In →",
  allCheckedIn: "¡Ya estás registrado!",
  showQr: "Muestra esta pantalla o el código QR a tu estilista",
  clientLabel: "Cliente",
  withStaff: name => `Con ${name}`,
  servicesLabel: "Servicios",
  minEst: n => `${n} min est.`,
  bookingHash: "Reserva #",
  staffScanQr: "Equipo: escanea para ver la reserva",
  youreCheckedIn: name => `¡Estás registrado, ${name}!`,
  appointmentConfirmed: "Tu cita ha sido confirmada.",
  yourService: "Tu Servicio",
  appointmentTime: "Hora de la cita",
  yourStylist: "Tu estilista",
  staffWithYouSoon: name => `${name} estará contigo en breve.`,
  teamWithYouSoon: "Un miembro de nuestro equipo estará contigo en breve.",
  loyaltyPointsLabel: n => `${n} puntos de lealtad`,
  doneBtn: "← Listo",
};

const vi: KioskStrings = {
  langLabel: "Tiếng Việt",
  defaultSubText: "Hành trình làm đẹp của bạn bắt đầu tại đây",
  tapToBegin: "👆  CHẠM VÀO ĐỂ BẮT ĐẦU",
  kioskReady: "Kiosk Sẵn Sàng",
  weClosed: "Chúng tôi đã đóng cửa",
  seeFrontDesk: "Vui lòng gặp nhân viên ở quầy lễ tân",
  oneMoment: "Một chút…",
  somethingWrong: "Đã xảy ra lỗi.",
  tryAgain: "Thử lại",
  selfCheckInKiosk: "Kiosk Tự Check-In",
  loyaltyRewards: "⭐ Điểm Thưởng",
  enterPhone: "Nhập số điện thoại của bạn",
  infoNeverShared: "Thông tin của bạn được bảo mật",
  cancel: "Hủy",
  loyaltyPoints: n => `${n} điểm thưởng`,
  visitReturn: n => `Lần thứ ${n} — cảm ơn bạn đã quay lại!`,
  loadingOptions: "Đang tải lựa chọn…",
  firstTimeHere: "Lần đầu đến đây?",
  whatsYourName: "Chào mừng! Tên của bạn là gì?",
  yourNamePlaceholder: "Tên của bạn",
  spaceKey: "KHOẢNG TRẮNG",
  continueBtn: "Tiếp tục →",
  teamWithOthers: "Nhân viên đang phục vụ khách khác",
  estimatedWait: "Thời gian chờ ước tính",
  youreNext: "Bạn là người tiếp theo!",
  beRightWithYou: "Chúng tôi sẽ phục vụ bạn ngay",
  wouldYouLikeToWait: "Bạn có muốn chờ không?",
  yesIllWait: "Có, tôi sẽ chờ",
  continueCheckin: "Tiếp tục đăng ký",
  noThanks: "Không, cảm ơn",
  maybeAnotherTime: "Lần sau vậy",
  startOver: "← Bắt đầu lại",
  fullyBookedNow: "Chúng tôi đã kín lịch",
  fullyBookedBody: name => `Xin lỗi${name !== "there" ? ` ${name}` : ""}! Nhân viên của chúng tôi đã kín lịch.`,
  fullyBookedSub: "Không có chỗ trống trong giờ tới — nhưng đôi khi có người hủy lịch.",
  textIfSpot: "Bạn có muốn chúng tôi nhắn tin nếu có chỗ trống không?",
  yesTextMe: "Có, nhắn cho tôi!",
  joinWaitlist: "Vào danh sách chờ",
  youreOnTheList: "Bạn đã vào danh sách!",
  wellTextYouSoon: "Chúng tôi sẽ nhắn tin ngay khi có chỗ trống hôm nay.",
  howItWorks: "📋 Cách thức hoạt động",
  waitlistStep1Title: "Chúng tôi sẽ nhắn tin",
  waitlistStep1Body: "Ngay khi có lịch hủy, bạn sẽ nhận được tin nhắn.",
  waitlistStep2Title: "Cửa sổ 15 phút",
  waitlistStep2Body: "Đến trong vòng 15 phút sau khi nhận tin để nhận chỗ.",
  waitlistStep3Title: "Ai đến trước được phục vụ trước",
  waitlistStep3Body: "Người đến đầu tiên sẽ có được chỗ trống.",
  newCheckin: "← Check-in Mới",
  thanksForStoppingBy: name => `Cảm ơn bạn đã ghé thăm, ${name}!`,
  hopeToSeeYouSoon: "Hẹn gặp lại bạn sớm.",
  weSentYouText: "Chúng tôi đã gửi tin nhắn cho bạn!",
  checkMessages: "Kiểm tra tin nhắn để nhận liên kết đặt lịch trực tuyến.",
  checkinPrefix: "Check-in",
  whatBringsYouIn: name => `Chào ${name}! Hôm nay bạn cần dịch vụ gì?`,
  handServices: "Dịch Vụ Tay",
  handBullet1: "Làm Móng Tay",
  handBullet2: "Nối Móng",
  handBullet3: "Sửa Móng",
  footServices: "Dịch Vụ Chân",
  footBullet1: "Làm Móng Chân",
  footBullet2: "Chăm Sóc Bàn Chân",
  footBullet3: "Cắt Tỉa Móng Chân",
  maniPediPackages: "Gói Tay + Chân",
  comboBullet1: "Chăm Sóc Tay & Chân",
  comboBullet2: "Dịch Vụ Kết Hợp",
  comboBullet3: "Tiết Kiệm Nhất",
  backBtn: "← Quay lại",
  tapToSelect: "Chọn dịch vụ của bạn",
  noServices: "Chưa có dịch vụ nào được cấu hình.",
  noServiceSelected: "Chưa chọn dịch vụ — nhấn vào thẻ ở trên",
  pageOf: (c, t) => `Trang ${c}/${t}`,
  previousBtn: "← Trước",
  seeMore: "Xem thêm  ›",
  optional: "Tuỳ chọn",
  wouldYouLikeToAdd: "Bạn có muốn thêm gì không?",
  addonsAvailableWith: s => `Dịch vụ bổ sung có thể thêm với ${s}`,
  addonsSelected: n => `Đã chọn ${n} dịch vụ bổ sung`,
  skipBtn: "Bỏ qua →",
  whoWouldYouLike: "Bạn muốn chọn kỹ thuật viên nào?",
  pickStylist: "Chọn kỹ thuật viên yêu thích hoặc người có sẵn tiếp theo",
  nextAvailable: "Người Có Sẵn",
  autoAssign: "Tự động phân công",
  selectedCheck: "Đã chọn ✓",
  checkInBtn: "Check In →",
  allCheckedIn: "Bạn đã check in thành công!",
  showQr: "Cho kỹ thuật viên xem màn hình hoặc mã QR này",
  clientLabel: "Khách",
  withStaff: name => `Với ${name}`,
  servicesLabel: "Dịch Vụ",
  minEst: n => `Khoảng ${n} phút`,
  bookingHash: "Mã đặt lịch #",
  staffScanQr: "Nhân viên: quét mã để xem lịch",
  youreCheckedIn: name => `${name} đã check in xong!`,
  appointmentConfirmed: "Lịch hẹn của bạn đã được xác nhận.",
  yourService: "Dịch Vụ Của Bạn",
  appointmentTime: "Giờ hẹn",
  yourStylist: "Kỹ thuật viên",
  staffWithYouSoon: name => `${name} sẽ phục vụ bạn ngay.`,
  teamWithYouSoon: "Nhân viên của chúng tôi sẽ phục vụ bạn ngay.",
  loyaltyPointsLabel: n => `${n} điểm thưởng`,
  doneBtn: "← Xong",
};

const zh: KioskStrings = {
  langLabel: "中文",
  defaultSubText: "您的美甲之旅从这里开始",
  tapToBegin: "👆  点击任意处开始",
  kioskReady: "服务台就绪",
  weClosed: "我们现在已关门",
  seeFrontDesk: "请前往前台联系工作人员",
  oneMoment: "请稍候…",
  somethingWrong: "出现错误，请重试。",
  tryAgain: "重试",
  selfCheckInKiosk: "自助签到服务台",
  loyaltyRewards: "⭐ 积分奖励",
  enterPhone: "请输入您的手机号码",
  infoNeverShared: "您的信息绝对保密",
  cancel: "取消",
  loyaltyPoints: n => `${n} 积分`,
  visitReturn: n => `第 ${n} 次到访 — 感谢您的再次光临！`,
  loadingOptions: "正在加载选项…",
  firstTimeHere: "第一次来？",
  whatsYourName: "欢迎！请问您的名字是？",
  yourNamePlaceholder: "您的姓名",
  spaceKey: "空格",
  continueBtn: "继续 →",
  teamWithOthers: "我们的员工正在为其他顾客服务",
  estimatedWait: "预计等候时间",
  youreNext: "您是下一位！",
  beRightWithYou: "我们马上为您服务",
  wouldYouLikeToWait: "您愿意等候吗？",
  yesIllWait: "是的，我愿意等",
  continueCheckin: "继续签到",
  noThanks: "不用了，谢谢",
  maybeAnotherTime: "下次再来",
  startOver: "← 重新开始",
  fullyBookedNow: "我们现在已约满",
  fullyBookedBody: name => `抱歉${name !== "there" ? `，${name}` : ""}！我们的员工已约满。`,
  fullyBookedSub: "未来一小时内没有空档 — 但有时会有取消预约的情况。",
  textIfSpot: "如有空档，是否希望我们发短信通知您？",
  yesTextMe: "是的，请通知我！",
  joinWaitlist: "加入等候名单",
  youreOnTheList: "您已加入名单！",
  wellTextYouSoon: "今天一有空档，我们将立即发短信通知您。",
  howItWorks: "📋 流程说明",
  waitlistStep1Title: "我们会发短信",
  waitlistStep1Body: "一旦有预约取消，您将立即收到短信通知。",
  waitlistStep2Title: "15分钟时间窗口",
  waitlistStep2Body: "收到短信后15分钟内到店即可获得该空档。",
  waitlistStep3Title: "先到先得",
  waitlistStep3Body: "最先到达的顾客获得空档。",
  newCheckin: "← 新签到",
  thanksForStoppingBy: name => `感谢您的光临，${name}！`,
  hopeToSeeYouSoon: "期待再次为您服务。",
  weSentYouText: "我们已向您发送短信！",
  checkMessages: "请查看短信获取在线预约链接。",
  checkinPrefix: "签到",
  whatBringsYouIn: name => `您好 ${name}！今天需要什么服务？`,
  handServices: "手部护理",
  handBullet1: "美甲",
  handBullet2: "甲油胶",
  handBullet3: "修甲",
  footServices: "足部护理",
  footBullet1: "美脚",
  footBullet2: "足部护理",
  footBullet3: "趾甲护理",
  maniPediPackages: "手足套餐",
  comboBullet1: "手足护理",
  comboBullet2: "组合服务",
  comboBullet3: "超值套餐",
  backBtn: "← 返回",
  tapToSelect: "点击选择您的服务",
  noServices: "暂无可用服务。",
  noServiceSelected: "尚未选择服务 — 请点击上方卡片",
  pageOf: (c, t) => `第 ${c}/${t} 页`,
  previousBtn: "← 上一页",
  seeMore: "查看更多  ›",
  optional: "可选",
  wouldYouLikeToAdd: "是否需要添加项目？",
  addonsAvailableWith: s => `可与 ${s} 搭配的附加项目`,
  addonsSelected: n => `已选 ${n} 个附加项目`,
  skipBtn: "跳过 →",
  whoWouldYouLike: "您希望哪位技师为您服务？",
  pickStylist: "请选择您偏好的技师，或选择下一位空闲技师",
  nextAvailable: "下一位空闲",
  autoAssign: "自动分配",
  selectedCheck: "已选择 ✓",
  checkInBtn: "签到 →",
  allCheckedIn: "签到成功！",
  showQr: "请将此屏幕或二维码出示给技师",
  clientLabel: "顾客",
  withStaff: name => `技师：${name}`,
  servicesLabel: "服务项目",
  minEst: n => `预计 ${n} 分钟`,
  bookingHash: "预约编号 #",
  staffScanQr: "员工：扫码查看预约",
  youreCheckedIn: name => `${name}，签到完成！`,
  appointmentConfirmed: "您的预约已确认。",
  yourService: "您的服务",
  appointmentTime: "预约时间",
  yourStylist: "您的技师",
  staffWithYouSoon: name => `${name} 即将为您服务。`,
  teamWithYouSoon: "我们的员工即将为您服务。",
  loyaltyPointsLabel: n => `${n} 积分`,
  doneBtn: "← 完成",
};

const ko: KioskStrings = {
  langLabel: "한국어",
  defaultSubText: "당신의 스타일 여정이 시작됩니다",
  tapToBegin: "👆  화면을 탭하여 시작하세요",
  kioskReady: "키오스크 준비 완료",
  weClosed: "현재 영업 중이 아닙니다",
  seeFrontDesk: "프런트 데스크의 직원에게 문의해 주세요",
  oneMoment: "잠시만요…",
  somethingWrong: "오류가 발생했습니다.",
  tryAgain: "다시 시도",
  selfCheckInKiosk: "셀프 체크인 키오스크",
  loyaltyRewards: "⭐ 적립 포인트",
  enterPhone: "휴대폰 번호를 입력해 주세요",
  infoNeverShared: "개인 정보는 절대 공유되지 않습니다",
  cancel: "취소",
  loyaltyPoints: n => `${n} 포인트`,
  visitReturn: n => `${n}번째 방문 — 다시 오셔서 감사합니다!`,
  loadingOptions: "옵션을 불러오는 중…",
  firstTimeHere: "처음 방문이신가요?",
  whatsYourName: "어서 오세요! 성함이 어떻게 되세요?",
  yourNamePlaceholder: "이름을 입력하세요",
  spaceKey: "공백",
  continueBtn: "계속 →",
  teamWithOthers: "현재 직원들이 다른 고객을 응대 중입니다",
  estimatedWait: "예상 대기 시간",
  youreNext: "다음 차례입니다!",
  beRightWithYou: "곧 도움을 드리겠습니다",
  wouldYouLikeToWait: "기다리시겠습니까?",
  yesIllWait: "네, 기다리겠습니다",
  continueCheckin: "체크인 계속하기",
  noThanks: "괜찮습니다",
  maybeAnotherTime: "다음에 다시 오겠습니다",
  startOver: "← 처음으로",
  fullyBookedNow: "현재 예약이 꽉 찼습니다",
  fullyBookedBody: name => `죄송합니다${name !== "there" ? `, ${name}` : ""}! 모든 직원이 예약 중입니다.`,
  fullyBookedSub: "향후 1시간 내 빈 자리가 없지만, 취소가 생길 수도 있습니다.",
  textIfSpot: "빈 자리가 생기면 문자로 알려드릴까요?",
  yesTextMe: "네, 알려주세요!",
  joinWaitlist: "대기 명단에 등록",
  youreOnTheList: "대기 명단에 등록되었습니다!",
  wellTextYouSoon: "오늘 자리가 생기는 즉시 문자를 보내드리겠습니다.",
  howItWorks: "📋 진행 방법",
  waitlistStep1Title: "문자 알림 발송",
  waitlistStep1Body: "예약 취소가 발생하면 즉시 문자를 보내드립니다.",
  waitlistStep2Title: "15분 이내 방문",
  waitlistStep2Body: "문자 수신 후 15분 이내에 방문하시면 자리를 드립니다.",
  waitlistStep3Title: "선착순",
  waitlistStep3Body: "먼저 도착하신 분이 빈 자리를 이용하실 수 있습니다.",
  newCheckin: "← 새 체크인",
  thanksForStoppingBy: name => `방문해 주셔서 감사합니다, ${name}!`,
  hopeToSeeYouSoon: "또 만나길 바랍니다.",
  weSentYouText: "문자를 보내드렸습니다!",
  checkMessages: "온라인 예약 링크는 문자 메시지를 확인해 주세요.",
  checkinPrefix: "체크인",
  whatBringsYouIn: name => `안녕하세요, ${name}! 오늘은 어떤 서비스를 원하시나요?`,
  handServices: "손 관리",
  handBullet1: "매니큐어",
  handBullet2: "네일 아트",
  handBullet3: "네일 수리",
  footServices: "발 관리",
  footBullet1: "페디큐어",
  footBullet2: "발 트리트먼트",
  footBullet3: "발톱 관리",
  maniPediPackages: "손발 패키지",
  comboBullet1: "손·발 케어",
  comboBullet2: "콤보 서비스",
  comboBullet3: "최고의 가성비",
  backBtn: "← 뒤로",
  tapToSelect: "서비스를 선택하려면 탭하세요",
  noServices: "아직 서비스가 없습니다.",
  noServiceSelected: "서비스를 선택하지 않았습니다 — 위의 카드를 탭하세요",
  pageOf: (c, t) => `${c}/${t} 페이지`,
  previousBtn: "← 이전",
  seeMore: "더 보기  ›",
  optional: "선택 사항",
  wouldYouLikeToAdd: "추가 항목을 원하시나요?",
  addonsAvailableWith: s => `${s}과 함께 이용 가능한 추가 서비스`,
  addonsSelected: n => `${n}개 추가 선택됨`,
  skipBtn: "건너뛰기 →",
  whoWouldYouLike: "어떤 직원을 원하시나요?",
  pickStylist: "선호하는 직원을 선택하거나 다음 가용 직원을 선택하세요",
  nextAvailable: "다음 가용 직원",
  autoAssign: "자동 배정",
  selectedCheck: "선택됨 ✓",
  checkInBtn: "체크인 →",
  allCheckedIn: "체크인이 완료되었습니다!",
  showQr: "이 화면 또는 QR 코드를 직원에게 보여주세요",
  clientLabel: "고객",
  withStaff: name => `담당: ${name}`,
  servicesLabel: "서비스",
  minEst: n => `약 ${n}분`,
  bookingHash: "예약 번호 #",
  staffScanQr: "직원: QR 코드를 스캔하여 예약 확인",
  youreCheckedIn: name => `${name}님, 체크인 완료!`,
  appointmentConfirmed: "예약이 확인되었습니다.",
  yourService: "선택한 서비스",
  appointmentTime: "예약 시간",
  yourStylist: "담당 직원",
  staffWithYouSoon: name => `${name}이(가) 곧 도움을 드리겠습니다.`,
  teamWithYouSoon: "담당 직원이 곧 도움을 드리겠습니다.",
  loyaltyPointsLabel: n => `${n} 포인트`,
  doneBtn: "← 완료",
};

export const KIOSK_LANGS: { code: LangCode; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "zh", label: "中文" },
  { code: "ko", label: "한국어" },
];

export const translations: Record<LangCode, KioskStrings> = { en, es, vi, zh, ko };
