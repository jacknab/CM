/**
 * printer.ts — Thermal receipt printer integration
 *
 * Supports Bluetooth (BLE), USB, and network (Ethernet/WiFi, raw ESC/POS over TCP port 9100)
 * thermal printers on Android via react-native-thermal-receipt-printer-image-qr.
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
import { NativeModules } from 'react-native';
import { pickUsbPrinter, type UsbDev } from './usbPrinterPick';
import { drawerKickBase64 } from './drawerKick';
import {
  buildReceiptText, divLine, twoCol, buildCheckinTicketFooter,
  type CardDetails, type ReceiptItem, type ReceiptData, type CheckinTicketData,
} from './receiptText';
import { buildZReportText, type ZReportPrintData } from './zReportText';

export { buildReceiptText, buildZReportText };
export type { CardDetails, ReceiptItem, ReceiptData, CheckinTicketData, ZReportPrintData };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PrinterDevice {
  type:    'bluetooth' | 'usb' | 'net';
  /** Bluetooth MAC address, USB "vendorId/productId" composite key, or the printer's IP address for 'net' */
  address: string;
  name:    string;
  /** Raw vendor_id for USB devices */
  vendorId?:  string;
  /** Raw product_id for USB devices */
  productId?: string;
  /** TCP port for 'net' devices — every ESC/POS network printer listens on 9100 unless reconfigured. */
  port?: number;
  /** Set only for a BIXOLON SRP-275III (impact dot-matrix, 76 mm paper). Its jobs are sent as our own ESC/POS
   *  (Font B + emphasized) instead of through the library's text formatter; every other printer is unchanged. */
  model?: 'bixolon-srp275iii';
  /** SRP-275III only: also print in double-strike mode (ESC G). Darker, slower. */
  doubleStrike?: boolean;
}

export const isSrp275iii = (d: PrinterDevice | null | undefined) => d?.model === 'bixolon-srp275iii';

const DEFAULT_NET_PORT = 9100;

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = '@certxa_saved_printer';

// ── Lazy native module loader ─────────────────────────────────────────────────

let _BLE: any = null;
let _USB: any = null;
let _NET: any = null;
let _nativeLoaded = false;

function loadNative() {
  if (_nativeLoaded) return;
  _nativeLoaded = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-thermal-receipt-printer-image-qr');
    _BLE = mod.BLEPrinter;
    _USB = mod.USBPrinter;
    _NET = mod.NetPrinter;
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

/** Loose IPv4 check (each octet 0-255) — enough to catch typos before we try to open a socket to it. */
export function isValidIPv4(ip: string): boolean {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
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

// ── Print helpers ─────────────────────────────────────────────────────────────

/** ESC @ (initialise printer) — harmless; used to test that the USB link is open. */
const ESC_INIT_B64 = 'G0A=';
const USB_READY_TIMEOUT_MS = 30_000;

async function listUsbDevices(): Promise<PrinterDevice[]> {
  loadNative();
  if (!_USB) return [];
  await _USB.init();
  const devices: any[] = (await _USB.getDeviceList()) ?? [];
  return devices.map((d) => {
    const vid = String(d.vendor_id ?? d.vendorId ?? '');
    const pid = String(d.product_id ?? d.productId ?? '');
    return { type: 'usb' as const, address: `${vid}/${pid}`, name: d.device_name ?? d.name ?? `USB Printer (${vid}:${pid})`, vendorId: vid, productId: pid };
  });
}

/**
 * The printer to use: the saved one; otherwise auto-detect the USB receipt printer plugged
 * into the tablet (and remember it) so printing works with no setup screen.
 */
export async function resolvePrinter(): Promise<PrinterDevice> {
  const saved = await getSavedPrinter();
  if (saved?.type === 'bluetooth' || saved?.type === 'net') return saved;

  loadNative();
  if (!_USB) throw new Error('USB printing is not available in this build of the app.');

  const usb = await listUsbDevices();
  const pick = pickUsbPrinter(usb as UsbDev[], saved);
  if (pick.ok) {
    const device = usb.find((d) => d.vendorId === pick.device.vendorId && d.productId === pick.device.productId)!;
    if (pick.reason !== 'saved') await savePrinter(device).catch(() => {});
    return device;
  }
  if (pick.reason === 'none') {
    throw new Error('No printer found. Check the USB cable between the receipt printer and this tablet, and that the printer is on.');
  }
  throw new Error('More than one USB device is connected and the receipt printer could not be identified. Open Printer setup and choose it.');
}

/**
 * Open the USB link. Android shows an "Allow Certxa to access the USB device?" prompt the
 * first time; the library reports nothing about it, so keep testing the link until it is open.
 */
async function ensureUsbReady(device: PrinterDevice): Promise<void> {
  loadNative();
  if (!device.vendorId || !device.productId) throw new Error('USB printer missing vendor/product ID');
  await _USB.init();
  // The native module's connectPrinter(vendorId, productId, ...) declares both as Java `Integer` — the JS wrapper does
  // no conversion, so passing the strings PrinterDevice stores them as (needed for AsyncStorage + display) crashes the
  // app: the old RN bridge throws trying to marshal a JS string into a native Integer argument. Convert at the call
  // boundary only; every other use of vendorId/productId (persistence, matching, display) keeps them as strings.
  const vid = Number(device.vendorId);
  const pid = Number(device.productId);
  if (!Number.isFinite(vid) || !Number.isFinite(pid)) throw new Error('USB printer has an invalid vendor/product ID');
  await _USB.connectPrinter(vid, pid); // requests USB permission if needed

  const native = (NativeModules as any).RNUSBPrinter;
  const deadline = Date.now() + USB_READY_TIMEOUT_MS;
  let asked = false;
  for (;;) {
    const open = await new Promise<boolean>((resolve) => {
      let failed = false;
      try { native.printRawData(ESC_INIT_B64, () => { failed = true; }); } catch { failed = true; }
      setTimeout(() => resolve(!failed), 200);
    });
    if (open) return;
    if (Date.now() > deadline) {
      throw new Error('The printer is not accessible. When Android asks to allow USB access for the printer, tap Allow — then try again.');
    }
    if (!asked) { asked = true; await _USB.connectPrinter(vid, pid).catch(() => {}); }
    await new Promise<void>((r) => setTimeout(r, 700));
  }
}

/**
 * Connect to a network printer. The library first pings the printer (ICMP) and gives up if the ping goes
 * unanswered — which some printers and networks never answer, though the printer itself is reachable on its
 * print port. If that fails, connect to the print port directly, without the ping.
 */
async function connectNet(device: PrinterDevice): Promise<void> {
  const port = Number(device.port) || DEFAULT_NET_PORT;
  try {
    await _NET.connectPrinter(device.address, port, 8000);
  } catch (first) {
    const native = (NativeModules as any).RNNetPrinter;
    if (!native?.connectPrinter) throw first;
    await new Promise<void>((resolve, reject) => {
      native.connectPrinter(device.address, port, () => resolve(), (err: unknown) => reject(err ?? first));
    });
  }
}

async function getActivePrinterModule(device: PrinterDevice): Promise<any> {
  loadNative();
  if (device.type === 'bluetooth') {
    if (!_BLE) throw new Error('Bluetooth printer module not available');
    await _BLE.init();
    await _BLE.connectPrinter(device.address);
    return _BLE;
  }
  if (device.type === 'net') {
    if (!_NET) throw new Error('Network printer module not available');
    await _NET.init();
    // A fresh connection for every job. The library otherwise reuses the socket from the last print, and a
    // network printer that has since closed its end (most do after a job or when idle) takes the next job
    // into a dead connection — the test print worked, the receipt a minute later didn't.
    await _NET.closeConn().catch(() => {});
    // host and port must reach the native bridge as their real types (a string port here would hit the
    // same JS-string-into-Java-Integer bridge crash fixed for USB above).
    try {
      await connectNet(device);
    } catch (e: any) {
      throw new Error(`Could not reach the printer at ${device.address}: ${typeof e === 'string' ? e : e?.message ?? 'no answer'}`);
    }
    return _NET;
  }
  if (!_USB) throw new Error('USB printer module not available');
  await ensureUsbReady(device);
  return _USB;
}

/** After a job on a network printer: give the write a moment to leave, then close the connection so the next
 *  job starts clean (the native write runs on its own thread and reports nothing back). */
async function finishJob(device: PrinterDevice): Promise<void> {
  if (device.type !== 'net' || !_NET) return;
  await new Promise((r) => setTimeout(r, 1500));
  await _NET.closeConn().catch(() => {});
}

// ── Public print API ──────────────────────────────────────────────────────────

/**
 * The receipt templates below are authored with the lowercase/bracket tags ([L]/[C]/[R]/<b>)
 * that are more readable to write, but the installed printer library's formatter
 * (EPToolkit.js) only recognizes uppercase angle-bracket tags (<L>/<C>/<R>/<B>) — anything
 * else passes through as literal printed text. Convert right before handing text to the
 * native module so every print call gets correctly formatted output.
 */
function toPrinterTags(text: string): string {
  return text
    .replace(/\[C\]/g, '<C>')
    .replace(/\[L\]/g, '<L>')
    .replace(/\[R\]/g, '<R>')
    .replace(/<b>/g, '<B>')
    .replace(/<\/b>/g, '</B>');
}

/** Hand tagged text to the printer: an SRP-275III gets our own Font B + emphasized bytes; every other printer
 *  goes through the library's formatter exactly as before. */
async function printTagged(printer: PrinterDevice, mod: any, text: string): Promise<void> {
  if (isSrp275iii(printer)) await sendRaw(printer, srp275iiiBytesBase64(text, !!printer.doubleStrike));
  else await mod.printBill(toPrinterTags(text));
}

/** Write raw ESC/POS (base64) to the already-connected printer. The library calls back only on failure, at once. */
async function sendRaw(printer: PrinterDevice, b64: string): Promise<void> {
  const native = printer.type === 'net' ? (NativeModules as any).RNNetPrinter
    : printer.type === 'bluetooth' ? (NativeModules as any).RNBLEPrinter : (NativeModules as any).RNUSBPrinter;
  if (!native?.printRawData) throw new Error('This printer connection cannot print.');
  await new Promise<void>((resolve, reject) => {
    let failure: string | null = null;
    try { native.printRawData(b64, (e: unknown) => { failure = String(e ?? 'The printer did not accept the job'); }); }
    catch (e: any) { failure = e?.message ?? 'The printer did not accept the job'; }
    setTimeout(() => (failure ? reject(new Error(failure)) : resolve()), 300);
  });
}

/**
 * BIXOLON SRP-275III bytes (owner, 2026-10-24: smaller and darker on the dot-matrix printer). Only commands in the
 * SRP-275III command manual are used — ESC @, ESC a, ESC !, ESC G, LF, ESC i — and no GS ! or FS ! (not supported).
 * ESC ! sets the font and emphasis together (bit 0 = Font B, bit 3 = emphasized, bits 4/5 = double height/width),
 * and it cancels ESC G, so all of it is sent again at the start of every line. The layout ([C]/[L]/[R], <b> lines
 * double size, 32 columns) is the receipt's own and is not changed. Ends with ESC @ so the next job starts from
 * the printer's defaults.
 */
export function srp275iiiBytesBase64(text: string, doubleStrike: boolean, boldAs: 'big' | 'underline' = 'big'): string {
  const out: number[] = [27, 64];
  srpLines(out, text, { fontB: true, emphasized: true, doubleStrike, boldAs });
  srpEnd(out);
  return toBase64(out);
}

/** `boldAs`: how a <b> line prints — 'big' (double width and height, as on receipts) or 'underline' (normal size,
 *  underlined: the Day Close report, whose many bold lines printed far too large — owner, 2026-10-24). */
function srpLines(out: number[], text: string, o: { fontB: boolean; emphasized: boolean; doubleStrike: boolean; boldAs?: 'big' | 'underline' }) {
  for (const raw of text.split('\n')) {
    const m = /^\[(L|C|R)\](.*)$/.exec(raw);
    const align = m ? ({ L: 0, C: 1, R: 2 } as const)[m[1] as 'L' | 'C' | 'R'] : 0;
    let body = m ? m[2] : raw;
    const big = /<b>/i.test(body);
    body = body.replace(/<\/?b>/gi, '');
    out.push(27, 97, align);
    // ESC ! bits: 1 Font B, 8 emphasized, 16+32 double height+width, 128 underline (SRP-275III manual, ESC ! / ESC -).
    const boldBits = !big ? 0 : o.boldAs === 'underline' ? 128 : 48;
    out.push(27, 33, (o.fontB ? 1 : 0) | (o.emphasized ? 8 : 0) | boldBits);
    out.push(27, 71, o.doubleStrike ? 1 : 0);
    for (const c of asciiOnly(body)) out.push(c);
    out.push(10);
  }
}

function srpEnd(out: number[]) {
  out.push(27, 33, 0, 27, 71, 0, 27, 97, 0);
  out.push(10, 10, 10, 10, 10, 27, 105); // feed, then cut (as the library's printBill ends)
  out.push(27, 64); // back to the printer's defaults
}

/** The printer's character table is plain ASCII: accents are dropped (Nguyễn → Nguyen), anything else prints "?". */
function asciiOnly(s: string): number[] {
  let t = s.replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'));
  try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { /* no normalize: keep as is */ }
  const codes: number[] = [];
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); codes.push(c >= 32 && c < 127 ? c : 63); }
  return codes;
}

/** Print a single copy of the receipt (used for the REPRINT/duplicate-copy button — not the
 *  two-copy sequence a successful payment triggers, see printReceiptCopies() below). Throws
 *  with a human-readable reason if it cannot. */
export async function printReceipt(data: ReceiptData, copy: 'salon' | 'customer' = 'customer'): Promise<void> {
  const printer = await resolvePrinter();
  const mod  = await getActivePrinterModule(printer);
  const text = buildReceiptText(data, copy);
  await printTagged(printer, mod, text);
  await finishJob(printer);
}

/**
 * After a successful payment: print the SALON COPY (has the customer-signature line) first,
 * then the CUSTOMER COPY — same completed transaction, same ReceiptData, no Stripe call, no new
 * PaymentIntent. Connects to the printer once and reuses that connection for both copies.
 *
 * The native printRawData() bridge has no real completion callback (it only ever reports errors;
 * a successful write is silent), so there is no reliable signal to await between the two prints
 * without touching native printer code, which is out of scope here. A short settling gap is used
 * instead, purely so the two jobs' writes don't land on the wire at the same time — not an
 * attempt to fake a "waited for completion" guarantee that doesn't exist underneath this library.
 */
export async function printReceiptCopies(data: ReceiptData): Promise<void> {
  const printer = await resolvePrinter();
  const mod = await getActivePrinterModule(printer);
  await printTagged(printer, mod, buildReceiptText(data, 'salon'));
  await new Promise((r) => setTimeout(r, 400));
  await printTagged(printer, mod, buildReceiptText(data, 'customer'));
  await finishJob(printer);
}

/** Width both images (number bar + QR) are rendered/printed at — matched to the 58mm-paper column
 *  width the rest of this file's templates assume (COL_W = 32 in receiptText.ts). */
const CHECKIN_IMAGE_PRINT_WIDTH = 300;

const stripDataUriPrefix = (b64: string) => b64.replace(/^data:image\/\w+;base64,/, '');

/**
 * Print the check-in ticket in this exact order: the black number-bar image, then the QR image,
 * then the two text rows (name + ticket number, date/time). Both images are rendered client-side
 * and handed in as base64 — see components/NumberBarCapture.tsx and components/QrCapture.tsx —
 * since this printer library can only print bold/aligned text or raster images, nothing in
 * between (no inverted/white-on-black text, no native QR command).
 */
export async function printCheckinTicket(data: CheckinTicketData, numberBarBase64: string, qrBase64: string): Promise<void> {
  const printer = await resolvePrinter();
  const mod = await getActivePrinterModule(printer);
  await mod.printImageBase64(stripDataUriPrefix(numberBarBase64), { imageWidth: CHECKIN_IMAGE_PRINT_WIDTH });
  await mod.printImageBase64(stripDataUriPrefix(qrBase64), { imageWidth: CHECKIN_IMAGE_PRINT_WIDTH });
  await mod.printBill(toPrinterTags(buildCheckinTicketFooter(data)));
  await finishJob(printer);
}

/** Print text the web app has already laid out for the paper (a technician's pay slip). Uses the same
 *  [C]/[L]/<b> tags as the receipt templates; one copy.
 *
 *  Sent as ESC/POS of our own rather than through the library's text formatter, so the whole slip prints in
 *  the printer's emphasized (bold) mode — the same size, darker on printers that print thin (owner, 2026-10-24).
 *  The library has no plain-bold tag: its <B> is double width and height. A <b> line keeps that larger size here,
 *  as before (the salon's name, Total Pay). */
export async function printText(text: string): Promise<void> {
  if (!text.trim()) throw new Error('Nothing to print');
  const printer = await resolvePrinter();
  await getActivePrinterModule(printer); // connects (and for USB, opens) the printer
  const native = printer.type === 'net' ? (NativeModules as any).RNNetPrinter
    : printer.type === 'bluetooth' ? (NativeModules as any).RNBLEPrinter : (NativeModules as any).RNUSBPrinter;
  if (!native?.printRawData) throw new Error('This printer connection cannot print text.');
  const data = isSrp275iii(printer) ? srp275iiiBytesBase64(text, !!printer.doubleStrike) : slipBytesBase64(text);
  await new Promise<void>((resolve, reject) => {
    let failure: string | null = null;
    try { native.printRawData(data, (e: unknown) => { failure = String(e ?? 'The printer did not accept the slip'); }); }
    catch (e: any) { failure = e?.message ?? 'The printer did not accept the slip'; }
    // The library calls back only on failure, and does so at once.
    setTimeout(() => (failure ? reject(new Error(failure)) : resolve()), 300);
  });
  await finishJob(printer);
}

/** The slip as ESC/POS bytes (base64): every line emphasized; [C]/[L]/[R] alignment; a <b> line double size. */
function slipBytesBase64(text: string): string {
  const out: number[] = [27, 64]; // initialise
  for (const raw of text.split('\n')) {
    const m = /^\[(L|C|R)\](.*)$/.exec(raw);
    const align = m ? ({ L: 0, C: 1, R: 2 } as const)[m[1] as 'L' | 'C' | 'R'] : 0;
    let body = m ? m[2] : raw;
    const big = /<b>/i.test(body);
    body = body.replace(/<\/?b>/gi, '');
    out.push(27, 97, align);
    // ESC ! n: 8 = emphasized; 56 = emphasized + double height + double width. FS ! for the double-byte font too.
    if (big) out.push(27, 33, 56, 28, 33, 12); else out.push(27, 33, 8, 28, 33, 0);
    out.push(27, 69, 1); // emphasized on (for printers that ignore it in ESC !)
    for (let i = 0; i < body.length; i++) {
      const c = body.charCodeAt(i);
      out.push(c < 128 ? c : 63); // plain ASCII; anything else prints as "?"
    }
    out.push(10);
  }
  out.push(27, 33, 0, 28, 33, 0, 27, 69, 0, 27, 97, 0);
  out.push(10, 10, 10, 10, 10, 27, 105); // feed, then cut (as the library's printBill ends)
  return toBase64(out);
}

function toBase64(bytes: number[]): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    s += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + (b === undefined ? '=' : abc[(n >> 6) & 63]) + (c === undefined ? '=' : abc[n & 63]);
  }
  return s;
}

/** Print the Day Close / Z Report — a single copy (it's a register document, not something
 *  handed to a customer, so there's no salon/customer split like printReceiptCopies()). */
export async function printZReport(data: ZReportPrintData): Promise<void> {
  const printer = await resolvePrinter();
  const mod = await getActivePrinterModule(printer);
  const text = buildZReportText(data);
  // BIXOLON SRP-275III: the report's bold lines at normal size, underlined (they printed double size, far too large).
  // Every other printer: exactly as before.
  if (isSrp275iii(printer)) await sendRaw(printer, srp275iiiBytesBase64(text, !!printer.doubleStrike, 'underline'));
  else await printTagged(printer, mod, text);
  await finishJob(printer);
}

/** `device` lets a caller test-print against a printer that hasn't been saved yet (e.g. the
 *  onboarding wizard's own test-print button, before the user has confirmed setup by tapping
 *  Continue) — omit it to test-print the already-saved printer, as the Settings "Test Print"
 *  button does. */
export async function printTestPage(storeName: string, device?: PrinterDevice): Promise<void> {
  const printer = device ?? await resolvePrinter();
  const mod = await getActivePrinterModule(printer);
  const lines = [
    `[C]<b>${storeName}</b>`,
    `[C]--- PRINTER TEST ---`,
    `[C]${divLine()}`,
    `[L]Left aligned`,
    `[R]Right aligned`,
    `[C]Centered`,
    `[L]${twoCol('Item', '$10.00')}`,
    `[C]${divLine()}`,
    `[C]<b>Print test OK</b>`,
    `\n\n\n`,
  ].join('\n');
  await printTagged(printer, mod, lines);
  await finishJob(printer);
}

/**
 * SRP-275III only: one page with the same sample printed three ways, to compare on the paper —
 *   A  the printer's normal mode (Font A, not emphasized: how it printed before)
 *   B  Font B + emphasized
 *   C  Font B + emphasized + double-strike
 */
export async function printSrp275iiiComparison(storeName: string, device?: PrinterDevice): Promise<void> {
  const printer = device ?? await resolvePrinter();
  await getActivePrinterModule(printer);
  const sample = (label: string) => [
    `[C]${label}`,
    `[C]<b>${storeName}</b>`,
    `[C]${divLine()}`,
    `[L]${twoCol('Gel Manicure', '$35.00')}`,
    `[L]${twoCol('Subtotal', '$35.00')}`,
    `[L]<b>${twoCol('TOTAL:', '$35.00', 16)}</b>`,
    `[C]${divLine()}`,
    '',
  ].join('\n');
  const out: number[] = [27, 64];
  srpLines(out, sample('A - NORMAL (AS BEFORE)'), { fontB: false, emphasized: false, doubleStrike: false });
  srpLines(out, sample('B - FONT B + EMPHASIZED'), { fontB: true, emphasized: true, doubleStrike: false });
  srpLines(out, sample('C - B + DOUBLE-STRIKE'), { fontB: true, emphasized: true, doubleStrike: true });
  srpEnd(out);
  await sendRaw(printer, toBase64(out));
  await finishJob(printer);
}

/**
 * Open the cash drawer: send the ESC/POS drawer-kick pulse to the receipt printer (the drawer is
 * plugged into the printer's RJ11 port). Throws with a human-readable reason if the printer
 * cannot be reached, so the caller never reports an open drawer that did not open.
 */
export async function openCashDrawer(): Promise<void> {
  const printer = await resolvePrinter();
  let native: any;
  if (printer.type === 'usb') {
    await ensureUsbReady(printer);
    native = (NativeModules as any).RNUSBPrinter;
  } else if (printer.type === 'net') {
    loadNative();
    if (!_NET) throw new Error('Network printer module not available');
    await _NET.init();
    await _NET.closeConn().catch(() => {});
    await connectNet(printer);
    native = (NativeModules as any).RNNetPrinter;
  } else {
    loadNative();
    if (!_BLE) throw new Error('Bluetooth printer module not available');
    await _BLE.init();
    await _BLE.connectPrinter(printer.address);
    native = (NativeModules as any).RNBLEPrinter;
  }
  if (!native?.printRawData) throw new Error('This printer connection cannot send the drawer command.');

  await new Promise<void>((resolve, reject) => {
    let failure: string | null = null;
    try {
      native.printRawData(drawerKickBase64(), (e: unknown) => { failure = String(e ?? 'The printer did not accept the command'); });
    } catch (e: any) {
      failure = e?.message ?? 'The printer did not accept the command';
    }
    // The library calls back only on failure, and does so immediately.
    setTimeout(() => (failure ? reject(new Error(failure)) : resolve()), 250);
  });
}
