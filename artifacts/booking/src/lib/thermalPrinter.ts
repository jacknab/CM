// ── Bluetooth ESC/POS Thermal Printer ────────────────────────────────────────
// Supports BLE thermal printers (ESC/POS protocol) on Chrome/Edge for Windows
// and Android.  Tries multiple known service/characteristic UUIDs in order.
//
// Common printers that work: Peripage A6/A9, GOOJPRT PT-210, Munbyn ITPP022,
// Star TSP100IV BT, Epson TM-m30II-NT, and most cheap Chinese BLE printers.

const PRINTER_SERVICES = [
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",  // ISSC (Peripage, GOOJPRT, many generics)
  "000018f0-0000-1000-8000-00805f9b34fb",  // Generic SPP BLE
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",  // Xiaoxi / Munbyn
  "0000ff00-0000-1000-8000-00805f9b34fb",  // Some budget printers
  "0000ffe0-0000-1000-8000-00805f9b34fb",  // HM-10 style BLE modules
];

export interface ThermalPrinterConn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  device: any; // BluetoothDevice — Web Bluetooth API (not in default TS DOM lib)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  characteristic: any; // BluetoothRemoteGATTCharacteristic
  writeWithoutResponse: boolean;
}

export async function connectThermalPrinter(): Promise<ThermalPrinterConn> {
  if (!("bluetooth" in navigator)) {
    throw new Error("Web Bluetooth is not available in this browser. Use Chrome or Edge on Windows/Android.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const device = await (navigator as any).bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });
  if (!device.gatt) throw new Error("GATT not available on this device.");
  const server = await device.gatt.connect();

  for (const svcUuid of PRINTER_SERVICES) {
    try {
      const svc = await server.getPrimaryService(svcUuid);
      const chars = await svc.getCharacteristics();
      for (const c of chars) {
        if (c.properties.writeWithoutResponse || c.properties.write) {
          return {
            device,
            characteristic: c,
            writeWithoutResponse: c.properties.writeWithoutResponse,
          };
        }
      }
    } catch { /* service not found — try next */ }
  }

  throw new Error("No writable characteristic found. Make sure this is an ESC/POS BLE thermal printer.");
}

const CHUNK = 200; // safe BLE chunk size in bytes

export async function printBytes(conn: ThermalPrinterConn, data: Uint8Array): Promise<void> {
  const { characteristic: c, writeWithoutResponse } = conn;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    if (writeWithoutResponse) {
      await c.writeValueWithoutResponse(chunk);
    } else {
      await c.writeValue(chunk);
    }
    await new Promise(r => setTimeout(r, 20));
  }
}

// ── ESC/POS byte builder ──────────────────────────────────────────────────────

class P {
  private b: number[] = [];
  private enc = new TextEncoder();

  reset()          { this.b.push(0x1B, 0x40); return this; }
  center()         { this.b.push(0x1B, 0x61, 0x01); return this; }
  left()           { this.b.push(0x1B, 0x61, 0x00); return this; }
  bold(on: boolean){ this.b.push(0x1B, 0x45, on ? 1 : 0); return this; }
  size(dh: boolean, dw: boolean) {
    const n = (dh ? 0x01 : 0x00) | (dw ? 0x10 : 0x00);
    this.b.push(0x1D, 0x21, n);
    return this;
  }

  text(s: string) {
    for (const byte of this.enc.encode(s)) this.b.push(byte);
    return this;
  }

  lf(n = 1) { for (let i = 0; i < n; i++) this.b.push(0x0A); return this; }

  divider(width = 32) { return this.text("-".repeat(width)).lf(); }

  row(left: string, right: string, width = 32) {
    const gap = Math.max(1, width - left.length - right.length);
    return this.text(left + " ".repeat(gap) + right).lf();
  }

  qr(content: string, moduleSize = 5) {
    const data = this.enc.encode(content);
    const len = data.length + 3;
    // Model 2
    this.b.push(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // Module size
    this.b.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, moduleSize);
    // Error correction M
    this.b.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);
    // Store data
    this.b.push(0x1D, 0x28, 0x6B, len & 0xFF, (len >> 8) & 0xFF, 0x31, 0x50, 0x30);
    for (const byte of data) this.b.push(byte);
    // Print
    this.b.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
    return this;
  }

  cut() { this.b.push(0x1D, 0x56, 0x42, 0x04); return this; } // feed 4 lines + partial cut

  build() { return new Uint8Array(this.b); }
}

// ── Receipt builders ──────────────────────────────────────────────────────────

export interface CheckinTicketData {
  storeName: string;
  clientName: string;
  staffName?: string;
  services: { name: string; duration?: number; price?: number }[];
  appointmentId: number;
  bookingCode: string; // e.g. "BK:123" — encoded in the QR
  timeStr: string;     // e.g. "2:30 PM"
  dateStr: string;     // e.g. "Jun 18"
}

export function buildCheckinTicket(d: CheckinTicketData): Uint8Array {
  const p = new P();
  const W = 32;

  p.reset()
   .center().bold(true).size(true, true)
   .text(d.storeName.slice(0, 16)).lf()
   .size(false, false).bold(false)
   .lf()
   .bold(true).text("CHECK-IN TICKET").lf().bold(false)
   .text(`${d.dateStr}  ${d.timeStr}`).lf()
   .lf()
   .left()
   .divider(W)
   .bold(true).text(d.clientName).bold(false).lf();

  if (d.staffName) p.text(`with ${d.staffName}`).lf();

  p.lf().divider(W);

  for (const svc of d.services) {
    const right = svc.price != null ? `$${svc.price.toFixed(2)}` : "";
    p.row(svc.name.slice(0, 22), right, W);
    if (svc.duration) p.text(`  ${svc.duration} min`).lf();
  }

  p.divider(W)
   .center()
   .text(`Booking #${d.appointmentId}`).lf()
   .lf()
   .qr(d.bookingCode, 5)
   .lf()
   .text("Scan at checkout").lf()
   .lf(4)
   .cut();

  return p.build();
}

export interface CheckoutReceiptData {
  storeName: string;
  clientName?: string;
  tenders: { method: string; amount: number }[];
  grandTotal: number;
  changeDue: number;
  transactionId: string;
  dateStr: string;
  timeStr: string;
}

export function buildCheckoutReceipt(d: CheckoutReceiptData): Uint8Array {
  const p = new P();
  const W = 32;

  p.reset()
   .center().bold(true).size(true, true)
   .text(d.storeName.slice(0, 16)).lf()
   .size(false, false).bold(false)
   .lf()
   .text(`${d.dateStr}  ${d.timeStr}`).lf();

  if (d.clientName) p.text(d.clientName).lf();

  p.lf()
   .left()
   .divider(W);

  for (const t of d.tenders) {
    const label = t.method.charAt(0).toUpperCase() + t.method.slice(1);
    p.row(label, `$${t.amount.toFixed(2)}`, W);
  }

  p.divider(W)
   .bold(true).row("TOTAL", `$${d.grandTotal.toFixed(2)}`, W).bold(false);

  if (d.changeDue > 0) p.row("Change Due", `$${d.changeDue.toFixed(2)}`, W);

  p.lf()
   .center()
   .text("Thank you!").lf()
   .text(`Txn: ${d.transactionId}`).lf()
   .lf(4)
   .cut();

  return p.build();
}
