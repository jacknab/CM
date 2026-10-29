/**
 * The /nail staff screens in English, Vietnamese, Spanish and French (the salon languages in Settings → Language).
 *
 * The language is the salon's (Settings → language) unless this tablet has been switched with the EN · VI · ES
 * buttons on the lock screen — each tablet can differ, since the owner, the front desk and the technicians do
 * not always read the same language first. Short labels live in T below; everything else on the screen is translated
 * by nailDomTranslate.ts from nailPhrases.ts (French: nailPhrasesFr.ts). Client names are never translated; service,
 * add-on and category names use the salon's stored translations, falling back to the name as typed.
 */
import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/use-language";

export type NailLang = "en" | "vi" | "es" | "fr";
const isLang = (v: unknown): v is NailLang => v === "en" || v === "vi" || v === "es" || v === "fr";
const DEVICE_KEY = "certxa.nail.lang";

const T = {
  // lock screen
  enter: { en: "ENTER", vi: "VÀO", es: "ENTRAR", fr: "ENTRER" },
  mySlip: { en: "MY SLIP", vi: "PHIẾU LƯƠNG", es: "MI RECIBO", fr: "MA FICHE" },
  mySlipFirst: { en: "MY SLIP — type your ID first", vi: "PHIẾU LƯƠNG — nhập mã trước", es: "MI RECIBO — escriba su ID primero", fr: "MA FICHE — saisissez d'abord votre ID" },
  turnQueue: { en: "Turn Queue", vi: "Thứ tự lượt", es: "Turnos", fr: "File des tours" },
  noneClockedIn: { en: "No technicians clocked in", vi: "Chưa có thợ nào vào ca", es: "Ningún técnico ha marcado entrada", fr: "Aucun technicien pointé" },
  turn: { en: "turn", vi: "lượt", es: "turno", fr: "tour" },
  turns: { en: "turns", vi: "lượt", es: "turnos", fr: "tours" },
  techId: { en: "Tech ID", vi: "Mã thợ", es: "ID del técnico", fr: "ID technicien" },
  // bottom tabs
  queue: { en: "Queue", vi: "Khách chờ", es: "Cola", fr: "File" },
  techs: { en: "Techs", vi: "Thợ", es: "Técnicos", fr: "Techniciens" },
  ticketNo: { en: "Ticket#", vi: "Số phiếu", es: "Ticket#", fr: "Ticket#" },
  checkIn: { en: "Check-In", vi: "Nhận khách", es: "Registro", fr: "Accueil" },
  more: { en: "More", vi: "Thêm", es: "Más", fr: "Plus" },
  connected: { en: "Connected", vi: "Đã kết nối", es: "Conectado", fr: "Connecté" },
  offline: { en: "Offline", vi: "Mất mạng", es: "Sin conexión", fr: "Hors ligne" },
  sending: { en: "Sending", vi: "Đang gửi", es: "Enviando", fr: "Envoi" },
  needsAttention: { en: "Needs attention", vi: "Cần xem lại", es: "Requiere atención", fr: "À vérifier" },
  signInNeeded: { en: "Sign in needed", vi: "Cần đăng nhập", es: "Inicie sesión", fr: "Connexion requise" },
  storageProblem: { en: "Storage problem", vi: "Lỗi bộ nhớ", es: "Error de almacenamiento", fr: "Problème de stockage" },
  // technician cards
  inService: { en: "IN SERVICE", vi: "ĐANG LÀM", es: "EN SERVICIO", fr: "EN SERVICE" },
  assigned: { en: "ASSIGNED", vi: "ĐÃ GIAO", es: "ASIGNADO", fr: "ASSIGNÉ" },
  available: { en: "AVAILABLE", vi: "RẢNH", es: "DISPONIBLE", fr: "DISPONIBLE" },
  onBreak: { en: "ON BREAK", vi: "NGHỈ", es: "EN DESCANSO", fr: "EN PAUSE" },
  notClockedIn: { en: "NOT CLOCKED IN", vi: "CHƯA VÀO CA", es: "SIN ENTRADA", fr: "NON POINTÉ" },
  free: { en: "FREE", vi: "RẢNH", es: "LIBRE", fr: "LIBRE" },
  clientWaiting: { en: "CLIENT WAITING", vi: "KHÁCH ĐANG CHỜ", es: "CLIENTE ESPERA", fr: "CLIENT EN ATTENTE" },
  inChair: { en: "IN CHAIR", vi: "ĐANG LÀM", es: "EN SILLA", fr: "EN FAUTEUIL" },
  tapToClockIn: { en: "Tap to clock in", vi: "Chạm để vào ca", es: "Toque para marcar entrada", fr: "Touchez pour pointer" },
  clientsToday: { en: "CLIENTS TODAY", vi: "KHÁCH HÔM NAY", es: "CLIENTES HOY", fr: "CLIENTS AUJOURD'HUI" },
  currentService: { en: "Current Service", vi: "Đang làm", es: "Servicio actual", fr: "Service en cours" },
  nextUp: { en: "Next Up", vi: "Kế tiếp", es: "Siguiente", fr: "Suivant" },
  next: { en: "NEXT", vi: "KẾ TIẾP", es: "SIGUE", fr: "SUIVANT" },
  inTurn: { en: "in turn", vi: "theo lượt", es: "en turno", fr: "au tour" },
  clockedOut: { en: "Clocked Out", vi: "Đã ra ca", es: "Fuera de turno", fr: "Dépointé" },
  clockedInTab: { en: "Clocked In", vi: "Đang trong ca", es: "En turno", fr: "Pointé" },
  // ticket buttons
  start: { en: "START", vi: "BẮT ĐẦU", es: "INICIAR", fr: "COMMENCER" },
  done: { en: "DONE", vi: "XONG", es: "LISTO", fr: "TERMINÉ" },
  assign: { en: "ASSIGN", vi: "GIAO THỢ", es: "ASIGNAR", fr: "ASSIGNER" },
  checkout: { en: "CHECKOUT", vi: "TÍNH TIỀN", es: "COBRAR", fr: "ENCAISSER" },
  reassign: { en: "REASSIGN", vi: "ĐỔI THỢ", es: "REASIGNAR", fr: "RÉASSIGNER" },
  ticket: { en: "TICKET", vi: "PHIẾU", es: "TICKET", fr: "TICKET" },
  textReady: { en: "TEXT READY", vi: "NHẮN KHÁCH", es: "AVISAR", fr: "PRÉVENIR" },
  cancel: { en: "CANCEL", vi: "HỦY", es: "CANCELAR", fr: "ANNULER" },
  // checkout
  cash: { en: "CASH", vi: "TIỀN MẶT", es: "EFECTIVO", fr: "ESPÈCES" },
  card: { en: "CARD", vi: "THẺ", es: "TARJETA", fr: "CARTE" },
  giftCard: { en: "GIFT CARD", vi: "THẺ QUÀ", es: "TARJETA REGALO", fr: "CARTE CADEAU" },
  services: { en: "SERVICES", vi: "DỊCH VỤ", es: "SERVICIOS", fr: "SERVICES" },
  payCheckout: { en: "PAY / CHECKOUT", vi: "TÍNH TIỀN", es: "PAGAR / COBRAR", fr: "PAYER / ENCAISSER" },
  back: { en: "BACK", vi: "TRỞ LẠI", es: "ATRÁS", fr: "RETOUR" },
  exit: { en: "EXIT", vi: "THOÁT", es: "SALIR", fr: "QUITTER" },
  subtotal: { en: "SUBTOTAL", vi: "TẠM TÍNH", es: "SUBTOTAL", fr: "SOUS-TOTAL" },
  discount: { en: "DISCOUNT", vi: "GIẢM GIÁ", es: "DESCUENTO", fr: "REMISE" },
  tax: { en: "TAX", vi: "THUẾ", es: "IMPUESTO", fr: "TAXE" },
  tip: { en: "TIP", vi: "TIỀN TIP", es: "PROPINA", fr: "POURBOIRE" },
  total: { en: "TOTAL", vi: "TỔNG CỘNG", es: "TOTAL", fr: "TOTAL" },
  balanceDue: { en: "BALANCE DUE", vi: "CÒN NỢ", es: "SALDO PENDIENTE", fr: "RESTE À PAYER" },
  changeDue: { en: "CHANGE DUE", vi: "TIỀN THỐI", es: "CAMBIO", fr: "MONNAIE À RENDRE" },
  paidInFull: { en: "PAID IN FULL", vi: "ĐÃ TRẢ ĐỦ", es: "PAGADO", fr: "PAYÉ EN TOTALITÉ" },
  paid: { en: "PAID ✓", vi: "ĐÃ TRẢ ✓", es: "PAGADO ✓", fr: "PAYÉ ✓" },
  saving: { en: "SAVING…", vi: "ĐANG LƯU…", es: "GUARDANDO…", fr: "ENREGISTREMENT…" },
} as const;

export type NailTextKey = keyof typeof T;

/** The language this tablet shows: its own choice, else the salon's, else English. */
export function useNailText() {
  const { language } = useLanguage();
  const [device, setDevice] = useState<NailLang | null>(() => {
    try { const v = localStorage.getItem(DEVICE_KEY); return isLang(v) ? v : null; } catch { return null; }
  });
  // Every screen of this tablet follows a switch made on any of them.
  useEffect(() => {
    const onChange = () => { try { const v = localStorage.getItem(DEVICE_KEY); setDevice(isLang(v) ? v : null); } catch { /* keep */ } };
    window.addEventListener("certxa-nail-lang", onChange);
    return () => window.removeEventListener("certxa-nail-lang", onChange);
  }, []);
  const lang: NailLang = device ?? (isLang(language) ? language : "en");
  const t = (key: NailTextKey): string => T[key][lang] ?? T[key].en;
  const setLang = (next: NailLang) => {
    try { localStorage.setItem(DEVICE_KEY, next); } catch { /* the choice lasts until reload */ }
    setDevice(next);
    window.dispatchEvent(new Event("certxa-nail-lang"));
  };
  return { lang, t, setLang };
}
