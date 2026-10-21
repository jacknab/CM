/**
 * The /nail staff screens in English, Vietnamese and Spanish.
 *
 * The language is the salon's (Settings → language) unless this tablet has been switched with the EN · VI · ES
 * buttons on the lock screen — each tablet can differ, since the owner, the front desk and the technicians do
 * not always read the same language first. Every phrase lives here, so a phrase that reads badly is fixed in one
 * place. Words the salon types itself (service names, client names) are never translated.
 */
import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/use-language";

export type NailLang = "en" | "vi" | "es";
const DEVICE_KEY = "certxa.nail.lang";

const T = {
  // lock screen
  enter: { en: "ENTER", vi: "VÀO", es: "ENTRAR" },
  mySlip: { en: "MY SLIP", vi: "PHIẾU LƯƠNG", es: "MI RECIBO" },
  mySlipFirst: { en: "MY SLIP — type your ID first", vi: "PHIẾU LƯƠNG — nhập mã trước", es: "MI RECIBO — escriba su ID primero" },
  turnQueue: { en: "Turn Queue", vi: "Thứ tự lượt", es: "Turnos" },
  noneClockedIn: { en: "No technicians clocked in", vi: "Chưa có thợ nào vào ca", es: "Ningún técnico ha marcado entrada" },
  turn: { en: "turn", vi: "lượt", es: "turno" },
  turns: { en: "turns", vi: "lượt", es: "turnos" },
  techId: { en: "Tech ID", vi: "Mã thợ", es: "ID del técnico" },
  // bottom tabs
  queue: { en: "Queue", vi: "Khách chờ", es: "Cola" },
  techs: { en: "Techs", vi: "Thợ", es: "Técnicos" },
  ticketNo: { en: "Ticket#", vi: "Số phiếu", es: "Ticket#" },
  checkIn: { en: "Check-In", vi: "Nhận khách", es: "Registro" },
  more: { en: "More", vi: "Thêm", es: "Más" },
  connected: { en: "Connected", vi: "Đã kết nối", es: "Conectado" },
  offline: { en: "Offline", vi: "Mất mạng", es: "Sin conexión" },
  sending: { en: "Sending", vi: "Đang gửi", es: "Enviando" },
  needsAttention: { en: "Needs attention", vi: "Cần xem lại", es: "Requiere atención" },
  signInNeeded: { en: "Sign in needed", vi: "Cần đăng nhập", es: "Inicie sesión" },
  storageProblem: { en: "Storage problem", vi: "Lỗi bộ nhớ", es: "Error de almacenamiento" },
  // technician cards
  inService: { en: "IN SERVICE", vi: "ĐANG LÀM", es: "EN SERVICIO" },
  assigned: { en: "ASSIGNED", vi: "ĐÃ GIAO", es: "ASIGNADO" },
  available: { en: "AVAILABLE", vi: "RẢNH", es: "DISPONIBLE" },
  onBreak: { en: "ON BREAK", vi: "NGHỈ", es: "EN DESCANSO" },
  notClockedIn: { en: "NOT CLOCKED IN", vi: "CHƯA VÀO CA", es: "SIN ENTRADA" },
  free: { en: "FREE", vi: "RẢNH", es: "LIBRE" },
  clientWaiting: { en: "CLIENT WAITING", vi: "KHÁCH ĐANG CHỜ", es: "CLIENTE ESPERA" },
  inChair: { en: "IN CHAIR", vi: "ĐANG LÀM", es: "EN SILLA" },
  tapToClockIn: { en: "Tap to clock in", vi: "Chạm để vào ca", es: "Toque para marcar entrada" },
  clientsToday: { en: "CLIENTS TODAY", vi: "KHÁCH HÔM NAY", es: "CLIENTES HOY" },
  currentService: { en: "Current Service", vi: "Đang làm", es: "Servicio actual" },
  nextUp: { en: "Next Up", vi: "Kế tiếp", es: "Siguiente" },
  next: { en: "NEXT", vi: "KẾ TIẾP", es: "SIGUE" },
  inTurn: { en: "in turn", vi: "theo lượt", es: "en turno" },
  clockedOut: { en: "Clocked Out", vi: "Đã ra ca", es: "Fuera de turno" },
  clockedInTab: { en: "Clocked In", vi: "Đang trong ca", es: "En turno" },
  // ticket buttons
  start: { en: "START", vi: "BẮT ĐẦU", es: "INICIAR" },
  done: { en: "DONE", vi: "XONG", es: "LISTO" },
  assign: { en: "ASSIGN", vi: "GIAO THỢ", es: "ASIGNAR" },
  checkout: { en: "CHECKOUT", vi: "TÍNH TIỀN", es: "COBRAR" },
  reassign: { en: "REASSIGN", vi: "ĐỔI THỢ", es: "REASIGNAR" },
  ticket: { en: "TICKET", vi: "PHIẾU", es: "TICKET" },
  textReady: { en: "TEXT READY", vi: "NHẮN KHÁCH", es: "AVISAR" },
  cancel: { en: "CANCEL", vi: "HỦY", es: "CANCELAR" },
  // checkout
  cash: { en: "CASH", vi: "TIỀN MẶT", es: "EFECTIVO" },
  card: { en: "CARD", vi: "THẺ", es: "TARJETA" },
  giftCard: { en: "GIFT CARD", vi: "THẺ QUÀ", es: "TARJETA REGALO" },
  services: { en: "SERVICES", vi: "DỊCH VỤ", es: "SERVICIOS" },
  payCheckout: { en: "PAY / CHECKOUT", vi: "TÍNH TIỀN", es: "PAGAR / COBRAR" },
  back: { en: "BACK", vi: "TRỞ LẠI", es: "ATRÁS" },
  exit: { en: "EXIT", vi: "THOÁT", es: "SALIR" },
  subtotal: { en: "SUBTOTAL", vi: "TẠM TÍNH", es: "SUBTOTAL" },
  discount: { en: "DISCOUNT", vi: "GIẢM GIÁ", es: "DESCUENTO" },
  tax: { en: "TAX", vi: "THUẾ", es: "IMPUESTO" },
  tip: { en: "TIP", vi: "TIỀN TIP", es: "PROPINA" },
  total: { en: "TOTAL", vi: "TỔNG CỘNG", es: "TOTAL" },
  balanceDue: { en: "BALANCE DUE", vi: "CÒN NỢ", es: "SALDO PENDIENTE" },
  changeDue: { en: "CHANGE DUE", vi: "TIỀN THỐI", es: "CAMBIO" },
  paidInFull: { en: "PAID IN FULL", vi: "ĐÃ TRẢ ĐỦ", es: "PAGADO" },
  paid: { en: "PAID ✓", vi: "ĐÃ TRẢ ✓", es: "PAGADO ✓" },
  saving: { en: "SAVING…", vi: "ĐANG LƯU…", es: "GUARDANDO…" },
} as const;

export type NailTextKey = keyof typeof T;

/** The language this tablet shows: its own choice, else the salon's (Vietnamese or Spanish), else English. */
export function useNailText() {
  const { language } = useLanguage();
  const [device, setDevice] = useState<NailLang | null>(() => {
    try { const v = localStorage.getItem(DEVICE_KEY); return v === "en" || v === "vi" || v === "es" ? v : null; } catch { return null; }
  });
  // Every screen of this tablet follows a switch made on any of them.
  useEffect(() => {
    const onChange = () => { try { const v = localStorage.getItem(DEVICE_KEY); setDevice(v === "en" || v === "vi" || v === "es" ? v : null); } catch { /* keep */ } };
    window.addEventListener("certxa-nail-lang", onChange);
    return () => window.removeEventListener("certxa-nail-lang", onChange);
  }, []);
  const lang: NailLang = device ?? (language === "vi" ? "vi" : language === "es" ? "es" : "en");
  const t = (key: NailTextKey): string => T[key][lang] ?? T[key].en;
  const setLang = (next: NailLang) => {
    try { localStorage.setItem(DEVICE_KEY, next); } catch { /* the choice lasts until reload */ }
    setDevice(next);
    window.dispatchEvent(new Event("certxa-nail-lang"));
  };
  return { lang, t, setLang };
}
