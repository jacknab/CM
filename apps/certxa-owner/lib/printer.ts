/**
 * printer.ts — Thermal receipt printer integration
 *
 * Supports Bluetooth (BLE) and USB thermal printers on Android via
 * react-native-thermal-receipt-printer-image-qr.
 *
 * Receipt layout matches the Certxa receipt template:
 *   • Store header (name / address / phone / email)
 *   • Transaction info (date / time / client / txn #)
 *   • Line items with optional duration
 *   • Subtotal / TOTAL
 *   • Payment section (method / amount / change)
 *   • Card details block for card payments (last4 / brand / approval / EMV)
 *   • Footer thank-you message
 *
 * Printer preference is persisted in AsyncStorage so it survives app restarts.
 * All functions degrade gracefully to no-ops if the native module is unavailable
 * (e.g. Expo Go, simulator).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PrinterDevice {
  type:    'bluetooth' | 'usb';
  /** Bluetooth MAC address or USB "vendorId/productId" composite key */
  address: string;
  name:    string;
  /** Raw vendor_id for USB devices */
  vendorId?:  string;
  /** Raw product_id for USB devices */
  productId?: string;
}

export interface CardDetails {
  last4:          string;
  brand:          string;          // 'visa' | 'mastercard' | 'amex' | 'discover' | …
  funding?:       string;          // 'credit' | 'debit' | 'prepaid' | 'unknown'
  approvalCode?:  string;          // auth/approval code from issuer
  entryMethod?:   string;          // 'chip' | 'contactless' | 'swipe' | 'manual'
  terminalId?:    string;
  sequenceNumber?: string;
  aid?:           string;          // EMV Application Identifier
  arqc?:          string;          // EMV Application Request Cryptogram
  pinVerified?:   boolean;
  paymentIntentId?: string;
}

export interface ReceiptItem {
  name:      string;
  price:     number;
  duration?: string;   // e.g. "75 min" — shown in grey below item name
}

export interface ReceiptData {
  storeName:     string;
  storeAddress?: string;
  storePhone?:   string;
  storeEmail?:   string;
  receiptNumber: number;
  date:          string;   // ISO or locale string
  clientName?:   string;
  items:         ReceiptItem[];
  subtotal:      number;
  tax:           number;
  grandTotal:    number;
  paymentMethod: string;
  amountPaid?:   number;
  changeDue?:    number;
  cardDetails?:  CardDetails;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = '@certxa_saved_printer';
/** Character width used for ESC/POS text formatting.
 *  32 works for 58 mm paper; 48 for 80 mm paper.
 *  The library auto-wraps, so 32 is the safe default. */
const COL_W = 32;

// ── Lazy native module loader ─────────────────────────────────────────────────

let _BLE: any = null;
let _USB: any = null;
let _nativeLoaded = false;

function loadNative() {
  if (_nativeLoaded) return;
  _nativeLoaded = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-thermal-receipt-printer-image-qr');
    _BLE = mod.BLEPrinter;
    _USB = mod.USBPrinter;
  } catch {
    // Native module not linked (Expo Go / simulator) — all ops are no-ops.
    console.warn('[Printer] Native thermal printer module not available.');
  }
}

// ── Persistence helpers ───────────────────────────────────────────────────────

export async function getSavedPrinter(): Promise<PrinterDevice | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PrinterDevice) : null;
  } catch {
    return null;
  }
}

export async function savePrinter(device: PrinterDevice): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(device));
}

export async function clearSavedPrinter(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

// ── Scanner ───────────────────────────────────────────────────────────────────

export async function scanForPrinters(): Promise<{
  paired:  PrinterDevice[];
  found:   PrinterDevice[];
}> {
  loadNative();
  const paired: PrinterDevice[] = [];
  const found:  PrinterDevice[] = [];

  if (_BLE) {
    try {
      await _BLE.init();
      const devices: any[] = (await _BLE.getDeviceList()) ?? [];
      for (const d of devices) {
        paired.push({
          type:    'bluetooth',
          address: d.inner_mac_address ?? d.address,
          name:    d.device_name ?? d.name ?? 'Bluetooth Printer',
        });
      }
    } catch (e) {
      console.warn('[Printer] BLE scan failed:', e);
    }
  }

  if (_USB) {
    try {
      await _USB.init();
      const devices: any[] = (await _USB.getDeviceList()) ?? [];
      for (const d of devices) {
        const vid = String(d.vendor_id ?? d.vendorId ?? '');
        const pid = String(d.product_id ?? d.productId ?? '');
        found.push({
          type:      'usb',
          address:   `${vid}/${pid}`,
          name:      d.device_name ?? d.name ?? `USB Printer (${vid}:${pid})`,
          vendorId:  vid,
          productId: pid,
        });
      }
    } catch (e) {
      console.warn('[Printer] USB scan failed:', e);
    }
  }

  return { paired, found };
}

export async function isBluetoothEnabled(): Promise<boolean> {
  loadNative();
  if (!_BLE) return false;
  try {
    // The library doesn't expose a direct check; attempt init and treat success as enabled.
    await _BLE.init();
    return true;
  } catch {
    return false;
  }
}

export async function enableBluetooth(): Promise<void> {
  // Android Bluetooth enabling requires a system intent — not directly possible from JS.
  // The library will throw an error if BT is off; the UI should surface that.
}

// ── Receipt text builder ──────────────────────────────────────────────────────

/** Pad a two-column row to exactly COL_W characters. */
function twoCol(left: string, right: string, width = COL_W): string {
  const gap = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

/** Horizontal divider line */
function divLine(char = '-', width = COL_W): string {
  return char.repeat(width);
}

/** Dollar amount formatter */
function $$(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Format card brand for display */
function fmtBrand(brand: string): string {
  const map: Record<string, string> = {
    visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express',
    discover: 'Discover', jcb: 'JCB', diners: 'Diners Club',
    unionpay: 'UnionPay',
  };
  return map[brand.toLowerCase()] ?? brand.toUpperCase();
}

/** Format entry method for display */
function fmtEntry(method: string): string {
  const map: Record<string, string> = {
    chip: 'INSERT', contactless: 'TAP', swipe: 'SWIPE',
    manual: 'MANUAL ENTRY', nfc: 'CONTACTLESS',
  };
  return map[method.toLowerCase()] ?? method.toUpperCase();
}

export function buildReceiptText(data: ReceiptData): string {
  const lines: string[] = [];

  // ── Store header ─────────────────────────────────────────────────────────────
  lines.push(`[C]<b>${data.storeName}</b>`);
  if (data.storeAddress) lines.push(`[C]${data.storeAddress}`);
  if (data.storePhone)   lines.push(`[C]Tel: ${data.storePhone}`);
  if (data.storeEmail)   lines.push(`[C]${data.storeEmail}`);
  lines.push(`[C]${divLine()}`);

  // ── Transaction info ─────────────────────────────────────────────────────────
  let dateStr = data.date;
  let timeStr = '';
  try {
    const d = new Date(data.date);
    if (!isNaN(d.getTime())) {
      dateStr = d.toLocaleDateString('en-US', {
        month: 'numeric', day: 'numeric', year: 'numeric',
      });
      timeStr = d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', second: '2-digit',
      });
    }
  } catch {}

  if (timeStr) {
    lines.push(`[L]Date: ${dateStr}[R]Time: ${timeStr}`);
  } else {
    lines.push(`[L]Date: ${dateStr}`);
  }
  if (data.clientName) lines.push(`[L]Client: ${data.clientName}`);
  lines.push(`[L]Txn: #${String(data.receiptNumber)}`);
  lines.push(`[C]${divLine()}`);

  // ── Line items ───────────────────────────────────────────────────────────────
  lines.push(`[L]<b>ITEM</b>[R]<b>PRICE</b>`);
  lines.push(`[C]${divLine()}`);
  for (const item of data.items) {
    lines.push(`[L]${item.name}[R]${$$(item.price)}`);
    if (item.duration) lines.push(`[L]${item.duration}`);
    lines.push(`[C]${divLine()}`);
  }

  // ── Subtotal / Total ─────────────────────────────────────────────────────────
  lines.push(`[L]Subtotal[R]${$$(data.subtotal)}`);
  if (data.tax > 0) {
    lines.push(`[L]Tax[R]${$$(data.tax)}`);
  }
  lines.push(`[C]${divLine()}`);
  lines.push(`[L]<b>TOTAL</b>[R]<b>${$$(data.grandTotal)}</b>`);
  lines.push(`[C]${divLine()}`);

  // ── Payment section ──────────────────────────────────────────────────────────
  lines.push(`[L]Payment[R]${data.paymentMethod}`);
  lines.push(`[L]Amount Paid[R]${$$(data.amountPaid ?? data.grandTotal)}`);
  lines.push(`[L]Change[R]${$$(data.changeDue ?? 0)}`);
  lines.push(`[C]${divLine()}`);

  // ── Card details block (card payments only) ──────────────────────────────────
  if (data.cardDetails) {
    const c = data.cardDetails;
    lines.push(`[L]ACCT: ****${c.last4}`);
    lines.push(`[L]ACCT TYPE: ${(c.funding ?? 'CREDIT').toUpperCase()}`);
    if (c.approvalCode) lines.push(`[L]APPROVAL: ${c.approvalCode.toUpperCase()}`);
    lines.push(`[L]${fmtBrand(c.brand)}`);
    if (c.terminalId)    lines.push(`[L]TERM#: ${c.terminalId}`);
    if (c.sequenceNumber) lines.push(`[L]SEQ#: ${c.sequenceNumber}`);
    if (c.aid)           lines.push(`[L]AID: ${c.aid}`);
    if (c.arqc)          lines.push(`[L]ARQC ${c.arqc}`);
    lines.push(`[L]ENTRY: ${fmtEntry(c.entryMethod ?? 'chip')}`);
    if (c.pinVerified)   lines.push(`[L]PIN VERIFIED`);
    lines.push(`[L]APPROVED`);
    lines.push(`[C]${divLine()}`);
    lines.push(`[C]CUSTOMER AGREES TO PAY THE ABOVE`);
    lines.push(`[C]TOTAL AMOUNT ACCORDING TO THE CARD`);
    lines.push(`[C]HOLDERS AGREEMENT`);
    lines.push(`[C]${divLine()}`);
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  lines.push(`[C]Thank you for visiting!`);
  lines.push(`[C]We look forward to seeing you again.`);
  lines.push(`\n\n\n`);

  return lines.join('\n');
}

// ── Print helpers ─────────────────────────────────────────────────────────────

async function getActivePrinterModule(device: PrinterDevice): Promise<any> {
  loadNative();
  if (device.type === 'bluetooth') {
    if (!_BLE) throw new Error('Bluetooth printer module not available');
    await _BLE.init();
    await _BLE.connectPrinter(device.address);
    return _BLE;
  } else {
    if (!_USB) throw new Error('USB printer module not available');
    await _USB.init();
    if (!device.vendorId || !device.productId) {
      throw new Error('USB printer missing vendor/product ID');
    }
    await _USB.connectPrinter(device.vendorId, device.productId);
    return _USB;
  }
}

// ── Public print API ──────────────────────────────────────────────────────────

export async function printReceipt(data: ReceiptData): Promise<void> {
  const saved = await getSavedPrinter();
  if (!saved) {
    throw new Error('No printer configured. Set up a printer in Settings → Printer.');
  }

  const mod  = await getActivePrinterModule(saved);
  const text = buildReceiptText(data);
  await mod.printBill(text);
}

export async function printTestPage(storeName: string): Promise<void> {
  const saved = await getSavedPrinter();
  if (!saved) throw new Error('No printer configured.');

  const mod = await getActivePrinterModule(saved);
  const lines = [
    `[C]<b>${storeName}</b>`,
    `[C]--- PRINTER TEST ---`,
    `[C]${divLine()}`,
    `[L]Left aligned`,
    `[R]Right aligned`,
    `[C]Centered`,
    `[L]Item[R]$10.00`,
    `[C]${divLine()}`,
    `[C]<b>Print test OK</b>`,
    `\n\n\n`,
  ].join('\n');
  await mod.printBill(lines);
}
