/**
 * usbPrinterPick.ts — pure logic for choosing the receipt printer among the tablet's USB
 * devices. The native library lists EVERY USB device with only a vendor/product id (no
 * names, no device class), so the choice is: the printer the user saved, else the single
 * USB device, else the single device from a known POS-printer maker, else "ambiguous".
 */
export interface UsbDev {
  vendorId: string;
  productId: string;
}

/** Vendor ids (decimal) used by common thermal receipt printers. Best effort, not exhaustive. */
export const KNOWN_PRINTER_VENDOR_IDS = new Set<string>([
  '1208',   // 0x04B8 Epson
  '1305',   // 0x0519 Star Micronics
  '5380',   // 0x1504 Bixolon
  '7568',   // 0x1D90 Citizen
  '3540',   // 0x0DD4 Custom
  '5455',   // 0x154F SNBC
  '1155',   // 0x0483 STMicroelectronics (many generic 58/80mm printers)
  '1046',   // 0x0416 Winbond (generic)
  '1110',   // 0x0456 (generic Xprinter)
  '10473',  // 0x28E9 (GD32-based printers)
  '4070',   // 0x0FE6 (Xprinter / ICS)
  '8137',   // 0x1FC9 NXP (generic)
  '26728',  // 0x6868 (generic POS)
  '19267',  // 0x4B43 (generic POS)
]);

const same = (a: UsbDev, b: { vendorId?: string; productId?: string }) =>
  a.vendorId === b.vendorId && a.productId === b.productId;

export type PickResult =
  | { ok: true; device: UsbDev; reason: 'saved' | 'only-device' | 'known-printer' }
  | { ok: false; reason: 'none' | 'ambiguous' };

export function pickUsbPrinter(devices: UsbDev[], saved?: { vendorId?: string; productId?: string } | null): PickResult {
  if (devices.length === 0) return { ok: false, reason: 'none' };

  if (saved?.vendorId && saved?.productId) {
    const s = devices.find((d) => same(d, saved));
    if (s) return { ok: true, device: s, reason: 'saved' };
  }
  if (devices.length === 1) return { ok: true, device: devices[0], reason: 'only-device' };

  const known = devices.filter((d) => KNOWN_PRINTER_VENDOR_IDS.has(d.vendorId));
  if (known.length === 1) return { ok: true, device: known[0], reason: 'known-printer' };

  return { ok: false, reason: 'ambiguous' };
}
