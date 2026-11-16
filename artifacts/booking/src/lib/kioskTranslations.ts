export type LangCode = "en" | "es" | "vi" | "zh" | "ko";

export interface KioskStrings {
  langLabel: string;

  // Idle
  defaultSubText: string;
  tapToBegin: string;
  /** Welcome screen (2026-10-29): what to do, readable from the door. */
  checkInHere: string;
  tapToStart: string;
  idleSteps: [string, string, string];
  kioskReady: string;

  // Closed
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
  // Smart Check-In
  lastVisitLine: (days: number, service: string) => string;
  recAsk: (service: string) => string;
  recUsual: (service: string) => string;
  recChoice: string;
  suggestedForYou: string;
  // Smart Check-In welcome screen (2026-10-24 design)
  /** "Welcome back, Tom!" */
  welcomeBack: (name: string) => string;
  welcomeBackSub: string;
  yourLastVisit: string;
  /** "21 days ago" / "Today" / "Yesterday" */
  daysAgoShort: (days: number) => string;
  ourSuggestion: string;
  whatToday: string;
  recommendedForYou: string;
  /** "Last visit: 21 days ago" */
  lastVisitPill: (days: number) => string;
  notSureAllServices: string;
  moreServices: string;
  hadBefore: string;
  reviewTitle: string;
  reviewSub: string;
  estimatedTotal: string;
  stillThere: string;
  /** {n} = seconds left */
  stillThereSub: string;
  stillHere: string;

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
  /** Under the phone keypad: consent to the texts the kiosk sends (called to the chair, missed you). */
  smsConsent: (storeName: string) => string;
  alreadyCheckedIn: string;
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
  otherServices: string;
  allServices: string;
  andMore: (n: number) => string;
  backBtn: string;

  // Services
  tapToSelect: string;
  noServices: string;
  noServiceSelected: string;
  twoServicesMax: string;
  /** The same note for a kiosk layout's own limit (Kiosk Builder): n services, h hours. */
  servicesMax: (n: number, hours: string) => string;
  /** Picture screens (Kiosk Builder): a Continue or add-on spot tapped before any service. */
  chooseServiceFirst: string;
  /** Picture screens: an add-on spot for an add-on the chosen service doesn't take. */
  addonNotForService: string;
  /** A Kiosk Extras group the client must choose from (the business's own group name, e.g. "Nail shape"). */
  chooseFromGroup: (group: string) => string;
  /** A screen set to "must choose" (Kiosk Builder) and nothing on it chosen yet. */
  chooseOneHere: string;
  /** The order board (Order Board theme): its order panel. */
  myOrder: string;
  orderEmpty: string;
  orderTotal: string;
  removeItem: string;
  orderFor: (name: string) => string;
  searchServices: string;
  searchResults: (q: string) => string;
  noResults: string;
  keyDone: string;
  keySpace: string;
  /** The order board's service screen: its button (owner, 2026-11-16). */
  addToTicket: string;
  addAnotherService: string;
  /** The Order Board's service workflows (shared/kiosk/serviceFlows.ts; owner, 2026-11-16). */
  onNowTitle: string;
  onNowToesTitle: string;
  onNowNothing: string;
  onNowPolish: string;
  onNowGel: string;
  onNowEnhancement: string;
  removalPrice: (price: string) => string;
  polishTitle: string;
  included: string;
  noDesign: string;
  addPedicureTitle: string;
  addManicureTitle: string;
  upgradeTitle: (name: string) => string;
  upgradeAgainTitle: (name: string) => string;
  usualPitch: string;
  yesAddIt: string;
  /** What an upgrade does for them, by kind of add-on (serviceFlows.ts UpgradeFamily). */
  pitch: Record<"chrome" | "french" | "rhinestones" | "nailArt" | "paraffin" | "cuticle" | "mask" | "hotStone" | "callus" | "scrub" | "massage" | "other", string>;
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
  checkInHere: "CHECK-IN\nHERE",
  tapToStart: "TAP TO START",
  idleSteps: ["Tap the screen", "Enter your phone number", "Have a seat — we'll call you"],
  kioskReady: "Kiosk Ready",
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
  lastVisitLine: (days, service) => days <= 0 ? `Your last visit was earlier today for ${service}.` : days === 1 ? `Your last visit was yesterday for ${service}.` : `Your last visit was ${days} days ago for ${service}.`,
  recAsk: service => `Would you like ${service} today?`,
  recUsual: service => `You usually have ${service}. Would you like it today?`,
  recChoice: "Would you like a fill or a new set today?",
  suggestedForYou: "Suggested for you",
  welcomeBack: (n) => `Welcome back, ${n}!`,
  welcomeBackSub: "We're so glad to see you. It's great to have you with us again!",
  yourLastVisit: "Your last visit",
  daysAgoShort: (d) => d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`,
  ourSuggestion: "Our suggestion",
  whatToday: "What would you like today?",
  recommendedForYou: "Recommended for you",
  lastVisitPill: (d) => d <= 0 ? "Last visit: today" : d === 1 ? "Last visit: yesterday" : `Last visit: ${d} days ago`,
  notSureAllServices: "Not sure? See all our services",
  moreServices: "More services",
  hadBefore: "You've had this before",
  reviewTitle: "Here's your visit",
  reviewSub: "Please check everything is right.",
  estimatedTotal: "Estimated total",
  stillThere: "Are you still there?",
  stillThereSub: "This screen will start over in {n} seconds.",
  stillHere: "Yes, I'm still here",
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
  smsConsent: store => `By entering your number you agree to receive text messages from ${store || "us"} about your visit. Message and data rates may apply. Reply STOP to opt out.`,
  alreadyCheckedIn: "You're already checked in. We'll call you shortly.",
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
  otherServices: "Other Services",
  allServices: "All Services",
  andMore: n => `+${n} more`,
  backBtn: "← Back",
  tapToSelect: "Tap to select your service",
  noServices: "No services configured yet.",
  noServiceSelected: "No service selected yet — tap a card above",
  twoServicesMax: "Up to 2 services (2½ hours) here. Please ask the front desk to add more.",
  servicesMax: (n, h) => n === 1 ? "One service per check-in here. Please ask the front desk to add more." : `Up to ${n} services (${h} hours) here. Please ask the front desk to add more.`,
  chooseServiceFirst: "Please choose a service first.",
  addonNotForService: "That add-on doesn't go with the service you chose.",
  chooseFromGroup: (g) => `Please choose your ${g.toLowerCase()}.`,
  chooseOneHere: "Please choose one to continue.",
  myOrder: "My order",
  orderEmpty: "Tap a service to add it here.",
  orderTotal: "Total",
  removeItem: "Remove",
  orderFor: (n: string) => `Check-in for ${n}`,
  searchServices: "Search Services",
  searchResults: (q: string) => `“${q}”`,
  noResults: "No services match that.",
  keyDone: "Done",
  keySpace: "Space",
  addToTicket: "Add to Ticket",
  addAnotherService: "Add another service",
  onNowTitle: "Do you have anything on your nails right now?",
  onNowToesTitle: "Do you have anything on your toenails right now?",
  onNowNothing: "Nothing, just my natural nails",
  onNowPolish: "Regular polish",
  onNowGel: "Gel polish",
  onNowEnhancement: "Acrylic, Gel X or dip",
  removalPrice: (price) => `+${price} removal`,
  polishTitle: "Which polish would you like?",
  included: "Included",
  noDesign: "No design, keep it simple",
  addPedicureTitle: "Would you like to add a pedicure?",
  addManicureTitle: "Would you like to add a manicure?",
  upgradeTitle: (name) => `Add ${name}?`,
  upgradeAgainTitle: (name) => `Add ${name} again?`,
  usualPitch: "You had it last time. Want it again today?",
  yesAddIt: "Yes, add it",
  pitch: {
    chrome: "A mirror-like chrome shine that makes your new set catch the light and really stand out.",
    french: "Crisp, classic tips that make your nails look clean, elegant and polished from every angle.",
    rhinestones: "A touch of sparkle that turns your nails into a statement everyone will notice.",
    nailArt: "A custom design that makes your nails one of a kind and shows off your style.",
    paraffin: "Warm paraffin wax that leaves your hands soft and smooth and your polish looking even better.",
    cuticle: "Healthy, conditioned cuticles so your manicure looks neater and lasts longer.",
    mask: "A hydrating mask and wrap that leaves your skin soft, smooth and glowing.",
    hotStone: "A soothing hot stone massage that melts away tension while your polish sets.",
    callus: "Smooth, soft heels so your feet look as good as your fresh polish.",
    scrub: "An exfoliating scrub that leaves your skin silky smooth and refreshed.",
    massage: "A longer, relaxing massage to make your visit even more of a treat.",
    other: "A little extra that makes your nails look and feel even better.",
  },
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
  showQr: "Show this screen to your stylist",
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
  checkInHere: "REGÍSTRESE\nAQUÍ",
  tapToStart: "TOQUE PARA EMPEZAR",
  idleSteps: ["Toque la pantalla", "Escriba su número de teléfono", "Tome asiento, le llamaremos"],
  kioskReady: "Kiosk Listo",
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
  lastVisitLine: (days, service) => days <= 0 ? `Su última visita fue hoy: ${service}.` : days === 1 ? `Su última visita fue ayer: ${service}.` : `Su última visita fue hace ${days} días: ${service}.`,
  recAsk: service => `¿Le gustaría ${service} hoy?`,
  recUsual: service => `Normalmente elige ${service}. ¿Lo desea hoy?`,
  recChoice: "¿Desea un relleno o un juego nuevo hoy?",
  suggestedForYou: "Sugerido para usted",
  welcomeBack: (n) => `¡Bienvenido de nuevo, ${n}!`,
  welcomeBackSub: "Nos alegra mucho verle. ¡Qué gusto tenerle de vuelta!",
  yourLastVisit: "Su última visita",
  daysAgoShort: (d) => d <= 0 ? "Hoy" : d === 1 ? "Ayer" : `Hace ${d} días`,
  ourSuggestion: "Nuestra sugerencia",
  whatToday: "¿Qué le gustaría hoy?",
  recommendedForYou: "Recomendado para usted",
  lastVisitPill: (d) => d <= 0 ? "Última visita: hoy" : d === 1 ? "Última visita: ayer" : `Última visita: hace ${d} días`,
  notSureAllServices: "¿No está seguro? Vea todos los servicios",
  moreServices: "Más servicios",
  hadBefore: "Ya lo ha elegido antes",
  reviewTitle: "Su visita",
  reviewSub: "Por favor, compruebe que todo esté correcto.",
  estimatedTotal: "Total estimado",
  stillThere: "¿Sigue ahí?",
  stillThereSub: "Esta pantalla se reiniciará en {n} segundos.",
  stillHere: "Sí, sigo aquí",
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
  smsConsent: store => `Al ingresar su número, acepta recibir mensajes de texto de ${store || "nosotros"} sobre su visita. Pueden aplicarse tarifas de mensajes y datos. Responda STOP para cancelar.`,
  alreadyCheckedIn: "Ya está registrado. Le llamaremos en breve.",
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
  otherServices: "Otros Servicios",
  allServices: "Todos los Servicios",
  andMore: n => `+${n} más`,
  backBtn: "← Atrás",
  tapToSelect: "Toca para seleccionar tu servicio",
  noServices: "Sin servicios configurados aún.",
  noServiceSelected: "Ningún servicio seleccionado — toca una tarjeta arriba",
  twoServicesMax: "Hasta 2 servicios (2½ horas) aquí. Pide en recepción que agreguen más.",
  servicesMax: (n, h) => n === 1 ? "Un servicio por registro aquí. Pide en recepción que agreguen más." : `Hasta ${n} servicios (${h} horas) aquí. Pide en recepción que agreguen más.`,
  chooseServiceFirst: "Primero elige un servicio.",
  addonNotForService: "Ese extra no está disponible con el servicio que elegiste.",
  chooseFromGroup: (g) => `Elige una opción: ${g}`,
  chooseOneHere: "Elige una opción para continuar.",
  myOrder: "Mi pedido",
  orderEmpty: "Toca un servicio para añadirlo aquí.",
  orderTotal: "Total",
  removeItem: "Quitar",
  orderFor: (n: string) => `Registro de ${n}`,
  searchServices: "Buscar servicios",
  searchResults: (q: string) => `“${q}”`,
  noResults: "Ningún servicio coincide.",
  keyDone: "Listo",
  keySpace: "Espacio",
  addToTicket: "Agregar al ticket",
  addAnotherService: "Agregar otro servicio",
  onNowTitle: "¿Tiene algo en las uñas ahora mismo?",
  onNowToesTitle: "¿Tiene algo en las uñas de los pies ahora mismo?",
  onNowNothing: "Nada, solo mis uñas naturales",
  onNowPolish: "Esmalte normal",
  onNowGel: "Esmalte de gel",
  onNowEnhancement: "Acrílico, Gel X o dip",
  removalPrice: (price) => `+${price} por retirarlo`,
  polishTitle: "¿Qué esmalte le gustaría?",
  included: "Incluido",
  noDesign: "Sin diseño, algo sencillo",
  addPedicureTitle: "¿Le gustaría agregar un pedicure?",
  addManicureTitle: "¿Le gustaría agregar un manicure?",
  upgradeTitle: (name) => `¿Agregar ${name}?`,
  upgradeAgainTitle: (name) => `¿Agregar ${name} otra vez?`,
  usualPitch: "Lo pidió la última vez. ¿Lo quiere otra vez hoy?",
  yesAddIt: "Sí, agregarlo",
  pitch: {
    chrome: "Un brillo cromado como espejo que hace que sus uñas nuevas reflejen la luz y destaquen.",
    french: "Puntas clásicas y nítidas que hacen que sus uñas se vean limpias y elegantes.",
    rhinestones: "Un toque de brillo que convierte sus uñas en algo que todos notarán.",
    nailArt: "Un diseño personalizado que hace sus uñas únicas y muestra su estilo.",
    paraffin: "Parafina tibia que deja sus manos suaves y su esmalte aún más bonito.",
    cuticle: "Cutículas sanas e hidratadas para que su manicure se vea más limpio y dure más.",
    mask: "Una mascarilla hidratante que deja su piel suave, lisa y radiante.",
    hotStone: "Un masaje relajante con piedras calientes mientras se seca su esmalte.",
    callus: "Talones suaves para que sus pies se vean tan bien como su esmalte nuevo.",
    scrub: "Una exfoliación que deja su piel sedosa y renovada.",
    massage: "Un masaje más largo y relajante para que su visita sea aún más especial.",
    other: "Un pequeño extra que hace que sus uñas se vean y se sientan aún mejor.",
  },
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
  showQr: "Muestra esta pantalla a tu estilista",
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
  checkInHere: "CHECK-IN\nTẠI ĐÂY",
  tapToStart: "CHẠM ĐỂ BẮT ĐẦU",
  idleSteps: ["Chạm vào màn hình", "Nhập số điện thoại của bạn", "Mời bạn ngồi, chúng tôi sẽ gọi bạn"],
  kioskReady: "Kiosk Sẵn Sàng",
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
  lastVisitLine: (days, service) => days <= 0 ? `Lần gần nhất bạn đến là hôm nay: ${service}.` : days === 1 ? `Lần gần nhất bạn đến là hôm qua: ${service}.` : `Lần gần nhất bạn đến là ${days} ngày trước: ${service}.`,
  recAsk: service => `Hôm nay bạn có muốn làm ${service} không?`,
  recUsual: service => `Bạn thường làm ${service}. Hôm nay bạn có muốn làm không?`,
  recChoice: "Hôm nay bạn muốn dặm lại hay làm bộ mới?",
  suggestedForYou: "Gợi ý cho bạn",
  welcomeBack: (n) => `Chào mừng ${n} quay lại!`,
  welcomeBackSub: "Rất vui được gặp lại bạn. Cảm ơn bạn đã quay lại với chúng tôi!",
  yourLastVisit: "Lần gần nhất bạn đến",
  daysAgoShort: (d) => d <= 0 ? "Hôm nay" : d === 1 ? "Hôm qua" : `${d} ngày trước`,
  ourSuggestion: "Gợi ý cho bạn",
  whatToday: "Hôm nay bạn muốn làm gì?",
  recommendedForYou: "Đề xuất cho bạn",
  lastVisitPill: (d) => d <= 0 ? "Lần gần nhất: hôm nay" : d === 1 ? "Lần gần nhất: hôm qua" : `Lần gần nhất: ${d} ngày trước`,
  notSureAllServices: "Chưa chắc? Xem tất cả dịch vụ",
  moreServices: "Dịch vụ khác",
  hadBefore: "Bạn đã từng chọn",
  reviewTitle: "Dịch vụ hôm nay của bạn",
  reviewSub: "Vui lòng kiểm tra lại thông tin.",
  estimatedTotal: "Tổng ước tính",
  stillThere: "Bạn vẫn còn ở đây chứ?",
  stillThereSub: "Màn hình sẽ bắt đầu lại sau {n} giây.",
  stillHere: "Vâng, tôi vẫn ở đây",
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
  smsConsent: store => `Khi nhập số điện thoại, bạn đồng ý nhận tin nhắn từ ${store || "chúng tôi"} về lần ghé thăm của bạn. Có thể áp dụng phí tin nhắn và dữ liệu. Trả lời STOP để hủy.`,
  alreadyCheckedIn: "Bạn đã check-in rồi. Chúng tôi sẽ gọi bạn ngay.",
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
  otherServices: "Dịch Vụ Khác",
  allServices: "Tất Cả Dịch Vụ",
  andMore: n => `+${n} dịch vụ`,
  backBtn: "← Quay lại",
  tapToSelect: "Chọn dịch vụ của bạn",
  noServices: "Chưa có dịch vụ nào được cấu hình.",
  noServiceSelected: "Chưa chọn dịch vụ — nhấn vào thẻ ở trên",
  twoServicesMax: "Tối đa 2 dịch vụ (2½ giờ) tại đây. Vui lòng nhờ quầy lễ tân thêm dịch vụ khác.",
  servicesMax: (n, h) => n === 1 ? "Mỗi lần check-in chỉ một dịch vụ tại đây. Vui lòng nhờ quầy lễ tân thêm dịch vụ khác." : `Tối đa ${n} dịch vụ (${h} giờ) tại đây. Vui lòng nhờ quầy lễ tân thêm dịch vụ khác.`,
  chooseServiceFirst: "Vui lòng chọn dịch vụ trước.",
  addonNotForService: "Dịch vụ thêm này không áp dụng cho dịch vụ bạn đã chọn.",
  chooseFromGroup: (g) => `Vui lòng chọn: ${g}`,
  chooseOneHere: "Vui lòng chọn một mục để tiếp tục.",
  myOrder: "Dịch vụ đã chọn",
  orderEmpty: "Chạm vào một dịch vụ để thêm vào đây.",
  orderTotal: "Tổng",
  removeItem: "Bỏ",
  orderFor: (n: string) => `Đăng ký cho ${n}`,
  searchServices: "Tìm dịch vụ",
  searchResults: (q: string) => `“${q}”`,
  noResults: "Không có dịch vụ phù hợp.",
  keyDone: "Xong",
  keySpace: "Dấu cách",
  addToTicket: "Thêm vào phiếu",
  addAnotherService: "Thêm dịch vụ khác",
  onNowTitle: "Hiện tại móng tay của bạn có đang làm gì không?",
  onNowToesTitle: "Hiện tại móng chân của bạn có đang làm gì không?",
  onNowNothing: "Không có, móng tự nhiên",
  onNowPolish: "Sơn thường",
  onNowGel: "Sơn gel",
  onNowEnhancement: "Bột, Gel X hoặc dip",
  removalPrice: (price) => `+${price} phí tháo`,
  polishTitle: "Bạn muốn sơn loại nào?",
  included: "Đã bao gồm",
  noDesign: "Không vẽ, đơn giản thôi",
  addPedicureTitle: "Bạn có muốn làm thêm chân không?",
  addManicureTitle: "Bạn có muốn làm thêm tay không?",
  upgradeTitle: (name) => `Thêm ${name}?`,
  upgradeAgainTitle: (name) => `Thêm ${name} như lần trước?`,
  usualPitch: "Lần trước bạn đã chọn dịch vụ này. Hôm nay bạn có muốn làm lại không?",
  yesAddIt: "Có, thêm vào",
  pitch: {
    chrome: "Lớp chrome bóng như gương giúp bộ móng mới của bạn lấp lánh và nổi bật.",
    french: "Đầu móng kiểu Pháp cổ điển giúp móng trông sạch sẽ và thanh lịch.",
    rhinestones: "Một chút lấp lánh khiến bộ móng của bạn thật nổi bật.",
    nailArt: "Mẫu vẽ riêng giúp bộ móng của bạn độc đáo và thể hiện phong cách.",
    paraffin: "Sáp paraffin ấm giúp đôi tay mềm mịn và màu sơn càng đẹp hơn.",
    cuticle: "Da quanh móng khỏe và mềm giúp bộ móng gọn gàng và bền lâu hơn.",
    mask: "Mặt nạ dưỡng ẩm giúp da mềm mịn và rạng rỡ.",
    hotStone: "Mát-xa đá nóng thư giãn trong khi chờ sơn khô.",
    callus: "Gót chân mềm mịn để đôi chân đẹp như màu sơn mới.",
    scrub: "Tẩy tế bào chết giúp da mịn màng và tươi mới.",
    massage: "Mát-xa lâu hơn để buổi làm đẹp càng thư giãn.",
    other: "Một chút thêm giúp bộ móng của bạn đẹp hơn nữa.",
  },
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
  showQr: "Cho kỹ thuật viên xem màn hình này",
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
  checkInHere: "在此签到",
  tapToStart: "点击开始",
  idleSteps: ["点击屏幕", "输入您的电话号码", "请稍坐，我们会叫您"],
  kioskReady: "服务台就绪",
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
  lastVisitLine: (days, service) => days <= 0 ? `您上次到店是今天：${service}。` : days === 1 ? `您上次到店是昨天：${service}。` : `您上次到店是 ${days} 天前：${service}。`,
  recAsk: service => `今天想做${service}吗？`,
  recUsual: service => `您通常选择${service}。今天也要吗？`,
  recChoice: "今天想补甲还是做全新一套？",
  suggestedForYou: "为您推荐",
  welcomeBack: (n) => `${n}，欢迎回来！`,
  welcomeBackSub: "很高兴再次见到您，欢迎回来！",
  yourLastVisit: "您上次到店",
  daysAgoShort: (d) => d <= 0 ? "今天" : d === 1 ? "昨天" : `${d} 天前`,
  ourSuggestion: "我们的建议",
  whatToday: "您今天想做什么？",
  recommendedForYou: "为您推荐",
  lastVisitPill: (d) => d <= 0 ? "上次到店：今天" : d === 1 ? "上次到店：昨天" : `上次到店：${d} 天前`,
  notSureAllServices: "还没想好？查看全部服务",
  moreServices: "更多服务",
  hadBefore: "您以前选过",
  reviewTitle: "您今天的服务",
  reviewSub: "请确认以下信息无误。",
  estimatedTotal: "预计总价",
  stillThere: "您还在吗？",
  stillThereSub: "此屏幕将在 {n} 秒后重新开始。",
  stillHere: "是的，我还在",
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
  smsConsent: store => `输入您的号码即表示您同意接收${store || "我们"}发送的有关您此次到访的短信。可能产生短信和数据费用。回复 STOP 即可退订。`,
  alreadyCheckedIn: "您已签到，我们很快会叫到您。",
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
  otherServices: "其他服务",
  allServices: "所有服务",
  andMore: n => `+${n} 项`,
  backBtn: "← 返回",
  tapToSelect: "点击选择您的服务",
  noServices: "暂无可用服务。",
  noServiceSelected: "尚未选择服务 — 请点击上方卡片",
  twoServicesMax: "此处最多可选 2 项服务（2.5 小时）。如需更多，请联系前台。",
  servicesMax: (n, h) => n === 1 ? "此处每次签到只能选 1 项服务。如需更多，请联系前台。" : `此处最多可选 ${n} 项服务（${h} 小时）。如需更多，请联系前台。`,
  chooseServiceFirst: "请先选择一项服务。",
  addonNotForService: "此附加项不适用于您选择的服务。",
  chooseFromGroup: (g) => `请选择：${g}`,
  chooseOneHere: "请先选择一项再继续。",
  myOrder: "我的服务",
  orderEmpty: "点选服务即可加入这里。",
  orderTotal: "合计",
  removeItem: "移除",
  orderFor: (n: string) => `${n} 的签到`,
  searchServices: "搜索服务",
  searchResults: (q: string) => `“${q}”`,
  noResults: "没有符合的服务。",
  keyDone: "完成",
  keySpace: "空格",
  addToTicket: "加入订单",
  addAnotherService: "再加一项服务",
  onNowTitle: "您的指甲现在有做什么吗？",
  onNowToesTitle: "您的脚指甲现在有做什么吗？",
  onNowNothing: "没有，自然指甲",
  onNowPolish: "普通指甲油",
  onNowGel: "凝胶指甲油",
  onNowEnhancement: "水晶甲、Gel X 或蘸粉",
  removalPrice: (price) => `+${price} 卸甲`,
  polishTitle: "您想要哪种指甲油？",
  included: "已包含",
  noDesign: "不要图案，简单就好",
  addPedicureTitle: "要加一个足部护理吗？",
  addManicureTitle: "要加一个手部护理吗？",
  upgradeTitle: (name) => `加上${name}？`,
  upgradeAgainTitle: (name) => `再加一次${name}？`,
  usualPitch: "您上次做过这一项。今天还要吗？",
  yesAddIt: "好的，加上",
  pitch: {
    chrome: "镜面般的金属光泽，让您的新指甲闪闪发亮、格外出众。",
    french: "经典法式甲尖，让指甲看起来干净又优雅。",
    rhinestones: "一点闪耀的水钻，让您的指甲成为焦点。",
    nailArt: "专属图案设计，让您的指甲独一无二，展现个人风格。",
    paraffin: "温热的石蜡护理，让双手柔软光滑，指甲油更显漂亮。",
    cuticle: "健康滋润的指甲边皮，让美甲更整洁、更持久。",
    mask: "保湿面膜和包裹，让肌肤柔软光滑、焕发光彩。",
    hotStone: "舒缓的热石按摩，在等待指甲油干的同时放松身心。",
    callus: "光滑柔软的脚后跟，让双脚和新指甲油一样漂亮。",
    scrub: "去角质磨砂，让肌肤丝滑清新。",
    massage: "更长时间的放松按摩，让这次护理更享受。",
    other: "一点小升级，让您的指甲看起来、感觉起来更好。",
  },
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
  showQr: "请将此屏幕出示给技师",
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
  checkInHere: "여기서\n체크인",
  tapToStart: "탭하여 시작",
  idleSteps: ["화면을 탭하세요", "전화번호를 입력하세요", "앉아서 기다려 주세요. 불러 드릴게요"],
  kioskReady: "키오스크 준비 완료",
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
  lastVisitLine: (days, service) => days <= 0 ? `마지막 방문은 오늘이었습니다: ${service}.` : days === 1 ? `마지막 방문은 어제였습니다: ${service}.` : `마지막 방문은 ${days}일 전이었습니다: ${service}.`,
  recAsk: service => `오늘 ${service} 하시겠어요?`,
  recUsual: service => `보통 ${service}을(를) 받으셨어요. 오늘도 하시겠어요?`,
  recChoice: "오늘은 리필과 새 세트 중 어느 것을 원하세요?",
  suggestedForYou: "추천 서비스",
  welcomeBack: (n) => `${n}님, 다시 오신 것을 환영해요!`,
  welcomeBackSub: "다시 만나서 정말 반가워요. 다시 찾아 주셔서 감사합니다!",
  yourLastVisit: "마지막 방문",
  daysAgoShort: (d) => d <= 0 ? "오늘" : d === 1 ? "어제" : `${d}일 전`,
  ourSuggestion: "추천",
  whatToday: "오늘은 어떤 서비스를 원하세요?",
  recommendedForYou: "고객님께 추천",
  lastVisitPill: (d) => d <= 0 ? "마지막 방문: 오늘" : d === 1 ? "마지막 방문: 어제" : `마지막 방문: ${d}일 전`,
  notSureAllServices: "잘 모르시겠어요? 전체 서비스 보기",
  moreServices: "다른 서비스",
  hadBefore: "이전에 선택하신 항목",
  reviewTitle: "오늘의 방문 내용",
  reviewSub: "내용이 맞는지 확인해 주세요.",
  estimatedTotal: "예상 합계",
  stillThere: "아직 계신가요?",
  stillThereSub: "{n}초 후 처음 화면으로 돌아갑니다.",
  stillHere: "네, 여기 있어요",
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
  smsConsent: store => `번호를 입력하시면 ${store || "저희"}에서 방문 관련 문자 메시지를 받는 데 동의하게 됩니다. 메시지 및 데이터 요금이 부과될 수 있습니다. 수신을 거부하려면 STOP을 회신하세요.`,
  alreadyCheckedIn: "이미 체크인되었습니다. 곧 불러 드리겠습니다.",
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
  otherServices: "기타 서비스",
  allServices: "전체 서비스",
  andMore: n => `+${n}개`,
  backBtn: "← 뒤로",
  tapToSelect: "서비스를 선택하려면 탭하세요",
  noServices: "아직 서비스가 없습니다.",
  noServiceSelected: "서비스를 선택하지 않았습니다 — 위의 카드를 탭하세요",
  twoServicesMax: "여기서는 최대 2개 서비스(2시간 30분)까지 선택할 수 있습니다. 추가는 프런트에 문의하세요.",
  servicesMax: (n, h) => n === 1 ? "여기서는 체크인당 1개 서비스만 선택할 수 있습니다. 추가는 프런트에 문의하세요." : `여기서는 최대 ${n}개 서비스(${h}시간)까지 선택할 수 있습니다. 추가는 프런트에 문의하세요.`,
  chooseServiceFirst: "먼저 서비스를 선택해 주세요.",
  addonNotForService: "선택하신 서비스에는 이 추가 옵션을 이용할 수 없습니다.",
  chooseFromGroup: (g) => `선택해 주세요: ${g}`,
  chooseOneHere: "계속하려면 하나를 선택해 주세요.",
  myOrder: "내 주문",
  orderEmpty: "서비스를 누르면 여기에 추가됩니다.",
  orderTotal: "합계",
  removeItem: "삭제",
  orderFor: (n: string) => `${n}님 체크인`,
  searchServices: "서비스 검색",
  searchResults: (q: string) => `“${q}”`,
  noResults: "일치하는 서비스가 없습니다.",
  keyDone: "완료",
  keySpace: "스페이스",
  addToTicket: "티켓에 추가",
  addAnotherService: "다른 서비스 추가",
  onNowTitle: "지금 손톱에 하신 것이 있나요?",
  onNowToesTitle: "지금 발톱에 하신 것이 있나요?",
  onNowNothing: "없어요, 자연 손톱이에요",
  onNowPolish: "일반 매니큐어",
  onNowGel: "젤 네일",
  onNowEnhancement: "아크릴, 젤 X 또는 딥",
  removalPrice: (price) => `+${price} 제거`,
  polishTitle: "어떤 폴리시를 원하세요?",
  included: "포함",
  noDesign: "디자인 없이 심플하게",
  addPedicureTitle: "페디큐어도 추가하시겠어요?",
  addManicureTitle: "매니큐어도 추가하시겠어요?",
  upgradeTitle: (name) => `${name} 추가할까요?`,
  upgradeAgainTitle: (name) => `${name} 다시 추가할까요?`,
  usualPitch: "지난번에 받으셨던 서비스예요. 오늘도 하시겠어요?",
  yesAddIt: "네, 추가할게요",
  pitch: {
    chrome: "거울처럼 빛나는 크롬 광택으로 새 네일이 더욱 돋보여요.",
    french: "깔끔하고 클래식한 프렌치 팁으로 손톱이 더 우아해 보여요.",
    rhinestones: "반짝이는 스톤으로 모두가 눈여겨볼 네일이 돼요.",
    nailArt: "나만의 디자인으로 개성 있는 네일을 완성해요.",
    paraffin: "따뜻한 파라핀으로 손이 부드럽고 매끈해지고 컬러도 더 예뻐 보여요.",
    cuticle: "건강한 큐티클 케어로 매니큐어가 더 깔끔하고 오래가요.",
    mask: "보습 마스크와 랩으로 피부가 부드럽고 촉촉해져요.",
    hotStone: "폴리시가 마르는 동안 따뜻한 핫스톤 마사지로 긴장을 풀어요.",
    callus: "매끈하고 부드러운 발뒤꿈치로 새 페디큐어가 더 돋보여요.",
    scrub: "각질 스크럽으로 피부가 매끈하고 산뜻해져요.",
    massage: "더 길고 편안한 마사지로 방문이 더욱 특별해져요.",
    other: "손톱을 더 예쁘고 건강하게 만들어 주는 작은 추가 서비스예요.",
  },
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
  showQr: "이 화면을 직원에게 보여주세요",
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
