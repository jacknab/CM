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
import { buildReceiptText, divLine, twoCol, type CardDetails, type ReceiptItem, type ReceiptData } from './receiptText';

export { buildReceiptText };
export type { CardDetails, ReceiptItem, ReceiptData };

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
}

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
    // host and port must reach the native bridge as their real types (a string port here would hit the
    // same JS-string-into-Java-Integer bridge crash fixed for USB above).
    await _NET.connectPrinter(device.address, Number(device.port) || DEFAULT_NET_PORT, 8000);
    return _NET;
  }
  if (!_USB) throw new Error('USB printer module not available');
  await ensureUsbReady(device);
  return _USB;
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

/** Print a single copy of the receipt (used for the REPRINT/duplicate-copy button — not the
 *  two-copy sequence a successful payment triggers, see printReceiptCopies() below). Throws
 *  with a human-readable reason if it cannot. */
export async function printReceipt(data: ReceiptData, copy: 'salon' | 'customer' = 'customer'): Promise<void> {
  const printer = await resolvePrinter();
  const mod  = await getActivePrinterModule(printer);
  const text = buildReceiptText(data, copy);
  await mod.printBill(toPrinterTags(text));
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
  await mod.printBill(toPrinterTags(buildReceiptText(data, 'salon')));
  await new Promise((r) => setTimeout(r, 400));
  await mod.printBill(toPrinterTags(buildReceiptText(data, 'customer')));
}

export async function printTestPage(storeName: string): Promise<void> {
  const printer = await resolvePrinter();
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
  await mod.printBill(toPrinterTags(lines));
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
    await _NET.connectPrinter(printer.address, Number(printer.port) || DEFAULT_NET_PORT, 8000);
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
