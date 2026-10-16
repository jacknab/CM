/**
 * receiptText.ts — pure receipt layout (no React Native imports, so it can be unit-tested).
 * Two copies are printed per sale: SALON COPY (signature line, kept by the salon) and CUSTOMER
 * COPY (no signature, taken home) — see buildReceiptText()'s `copy` parameter.
 */

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
  /** Group Pay: the technician heading this line goes under. Absent on a one-ticket receipt. */
  section?:  string;
  /** 'product' for retail (printed "P 1"), 'tip' for the ticket's share of the tip ("Tip"), otherwise a service ("S 1"). */
  kind?:     'service' | 'product' | 'tip';
}

export interface ReceiptData {
  storeName:     string;
  /** Street address only — kept separate from city/state/zip so the header can print them on their own line. */
  storeAddress?: string;
  /** Pre-formatted "City, ST ZIP" — built at the source, where city/state/zip are still separate fields. */
  storeCityStateZip?: string;
  storePhone?:   string;
  storeEmail?:   string;
  receiptNumber: number;
  date:          string;   // ISO or locale string
  clientName?:   string;
  /** The technician who performed the service, if known. */
  staffName?:    string;
  items:         ReceiptItem[];
  subtotal:      number;
  /** Manual + loyalty discount applied to the ticket (shown as a negative line). */
  discount?:     number;
  tax:           number;
  /** Tip included in grandTotal (shown as its own line). */
  tip?:          number;
  grandTotal:    number;
  paymentMethod: string;
  /** Each payment with its amount, printed as "Cash  $25.00" / "Card  $100.00" so staff see how much went on each. */
  tenders?:      { method: string; amount: number }[];
  amountPaid?:   number;
  changeDue?:    number;
  cardDetails?:  CardDetails;
}

/** Which physical copy to lay out: SALON keeps a signature line, CUSTOMER doesn't. */
export type ReceiptCopy = 'salon' | 'customer';

/** Character width for ESC/POS text: 32 for 58 mm paper, 48 for 80 mm. The library auto-wraps. */
const COL_W = 32;

// ── Receipt text builder ──────────────────────────────────────────────────────

/**
 * Pad a two-column row to a fixed width so the right side visually lines up.
 *
 * This printer does not reliably support switching text alignment mid-line (verified against
 * printed output — content after a same-line [R] tag was printed with no gap at all, immediately
 * after the left text, e.g. "ITEMPRICE"/"Subtotal$40.00"). ESC/POS justification is a per-line
 * property that many thermal printers only apply at the next line feed, not retroactively inside
 * a line already being buffered — so every two-column row in this file is built with manual
 * space-padding (always inside a single [L]…) instead of the [L]a[R]b same-line trick.
 */
export function twoCol(left: string, right: string, width = COL_W): string {
  const gap = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

/** Horizontal divider line */
export function divLine(char = '-', width = COL_W): string {
  return char.repeat(width);
}

/** Dollar amount formatter */
function $$(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Truncate an item name so a two-column row always leaves room for the price column. */
export function fitName(name: string, priceStr: string, width = COL_W): string {
  const maxLen = Math.max(1, width - priceStr.length - 1);
  return name.length > maxLen ? `${name.slice(0, maxLen - 1)}…` : name;
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

/**
 * Normalize a stored phone number to US "(XXX) XXX-XXXX" when it's a recognizable 10-digit US
 * number (with or without a leading "1" country code). Anything else — a different country's
 * number, a garbled value, too few/many digits — is printed exactly as stored rather than
 * guessing at a format that might mangle it.
 */
function fmtPhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

export function buildReceiptText(data: ReceiptData, copy: ReceiptCopy): string {
  const lines: string[] = [];
  const phone = fmtPhone(data.storePhone);

  // ── Business header (identical on both copies) ────────────────────────────────
  lines.push(`[C]<b>${data.storeName}</b>`);
  if (data.storeAddress)     lines.push(`[C]${data.storeAddress}`);
  if (data.storeCityStateZip) lines.push(`[C]${data.storeCityStateZip}`);
  if (phone)                 lines.push(`[C]${phone}`);
  lines.push(`[C]${divLine()}`);
  lines.push(`[C]<b>${copy === 'salon' ? 'SALON COPY' : 'CUSTOMER COPY'}</b>`);
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

  lines.push(`[L]${timeStr ? twoCol(`Date: ${dateStr}`, timeStr) : `Date: ${dateStr}`}`);
  if (data.clientName) lines.push(`[L]Client: ${data.clientName}`);
  if (data.staffName)  lines.push(`[L]Staff: ${data.staffName}`);
  lines.push(`[L]Txn: #${String(data.receiptNumber)}`);
  lines.push(`[C]${divLine()}`);

  // ── Line items ───────────────────────────────────────────────────────────────
  // No ITEM/PRICE header row on either copy — it's a label for columns the prices below it
  // already make obvious, and skipping it saves a line on every single receipt printed.
  // Group Pay: every ticket paid together, each under its technician's name —
  //   --- -- CINDY LANE -------------
  //   S 1 French Pedicure      $45.00
  // (the same layout the web receipt shows, booking lib/receiptSections.ts).
  const grouped = data.items.some((item) => !!item.section);
  let heading: string | null = null;
  for (const item of data.items) {
    const priceStr = $$(item.price);
    if (grouped) {
      const title = item.section ?? '';
      if (title !== heading) {
        heading = title;
        const head = `--- -- ${title.slice(0, COL_W - 8)} `;
        lines.push(`[L]${head}${'-'.repeat(Math.max(0, COL_W - head.length))}`);
      }
      const label = item.kind === 'tip' ? '    Tip' : `${item.kind === 'product' ? 'P' : 'S'} 1 ${item.name.replace(/^\+\s*/, '')}`;
      lines.push(`[L]${twoCol(fitName(label, priceStr), priceStr)}`);
      continue;
    }
    lines.push(`[L]${twoCol(fitName(item.name, priceStr), priceStr)}`);
    if (item.duration) lines.push(`[L]  ${item.duration}`);
  }
  lines.push(`[C]${divLine()}`);

  // ── Payment method + totals (one combined block, right above the signature/footer) ────────
  // No "X PAYMENT" heading on either copy, for the same reason as ITEM/PRICE — the card/cash
  // details right below it already say what it would have said.
  const c = data.cardDetails;
  if (c) {
    lines.push(`[L]${fmtBrand(c.brand)} ****${c.last4}`);
    lines.push(`[L]${fmtEntry(c.entryMethod ?? 'chip')}`);
    if (c.approvalCode || c.paymentIntentId) lines.push('');
    if (c.approvalCode)     lines.push(`[L]Approval: ${c.approvalCode}`);
    if (c.paymentIntentId)  lines.push(`[L]TRN: ${c.paymentIntentId}`);
    lines.push('');
  }
  lines.push(`[L]${twoCol('Subtotal:', $$(data.subtotal))}`);
  if ((data.discount ?? 0) > 0) {
    lines.push(`[L]${twoCol('Discount:', `-${$$(data.discount as number)}`)}`);
  }
  if (data.tax > 0) {
    lines.push(`[L]${twoCol('Tax:', $$(data.tax))}`);
  }
  if ((data.tip ?? 0) > 0) {
    lines.push(`[L]${twoCol('Tip:', $$(data.tip as number))}`);
  }
  lines.push(`[L]<b>${twoCol('TOTAL:', $$(data.grandTotal))}</b>`);
  for (const t of data.tenders ?? []) {
    if (t.amount > 0) lines.push(`[L]${twoCol(`${t.method}:`, $$(t.amount))}`);
  }
  lines.push(`[L]${twoCol('Amount Paid:', $$(data.amountPaid ?? data.grandTotal))}`);
  if ((data.changeDue ?? 0) > 0) {
    lines.push(`[L]${twoCol('Change:', $$(data.changeDue as number))}`);
  }
  lines.push(`[C]${divLine()}`);

  // ── Signature (salon copy only — this is the copy the customer signs) ──────────────────────
  if (copy === 'salon') {
    lines.push(`[C]<b>CUSTOMER SIGNATURE</b>`);
    lines.push('');
    lines.push(`[C]${divLine('_')}`);
    lines.push('');
    lines.push(`[C]I agree to the total amount above,`);
    lines.push(`[C]including any tip.`);
    lines.push(`[C]${divLine()}`);
  }

  // ── Footer (customer-facing — skipped on the salon copy) ───────────────────────
  if (copy !== 'salon') {
    lines.push(`[C]Thank you for visiting!`);
    lines.push(`[C]We look forward to seeing you again.`);
  }
  lines.push(`\n\n\n`);

  return lines.join('\n');
}

// ── Check-in ticket ─────────────────────────────────────────────────────────
// The slip printed the moment a client checks in. Matches a specific visual design: a black
// bar with today's check-in count in bold white (rendered as an image, like the QR below it —
// see components/NumberBarCapture.tsx), the QR code (also an image — this printer library has no
// native QR command, see lib/printer.ts), then the client's name and ticket number, then the
// date/time. The QR stays scannable through the client's whole visit: no ticket yet → opens
// check-in; once a ticket exists → opens it; once paid → opens the receipt. Same physical slip
// throughout — see /api/qr/lookup and NailHome.tsx's handleScan for how each stage resolves.

export interface CheckinTicketData {
  clientName: string;
  /** The same per-store number shown elsewhere in the POS as "#123" — reused here so the
   *  printed slip doubles as a manual-lookup fallback when the QR itself won't scan. */
  ticketNumber: number;
  /** ISO or locale string. */
  date: string;
  /** What the client chose at check-in (services, then "+ add-on" lines) — so the slip can be handed to the tech. */
  services?: string[];
}

/** The rows below the QR image: name + ticket number, date + time, then the chosen services. */
export function buildCheckinTicketFooter(data: CheckinTicketData): string {
  const lines: string[] = [];

  let dateStr = data.date;
  let timeStr = '';
  try {
    const d = new Date(data.date);
    if (!isNaN(d.getTime())) {
      dateStr = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    }
  } catch {}

  lines.push(`[L]<b>${twoCol(data.clientName, `# ${data.ticketNumber}`)}</b>`);
  lines.push(`[L]${twoCol(`DATE: ${dateStr}`, `TIME: ${timeStr}`)}`);
  const services = (data.services ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (services.length) {
    lines.push(`[C]${divLine()}`);
    for (const name of services) lines.push(`[L]${name.slice(0, COL_W)}`);
  }
  lines.push(`\n\n\n`);

  return lines.join('\n');
}
