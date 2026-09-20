/**
 * receiptText.ts — pure receipt layout (no React Native imports, so it can be unit-tested).
 * The layout matches the Certxa receipt template: store header, transaction info, line items,
 * subtotal / discount / tax / tip / TOTAL, payment section, card block for card payments, footer.
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
  /** Manual + loyalty discount applied to the ticket (shown as a negative line). */
  discount?:     number;
  tax:           number;
  /** Tip included in grandTotal (shown as its own line). */
  tip?:          number;
  grandTotal:    number;
  paymentMethod: string;
  amountPaid?:   number;
  changeDue?:    number;
  cardDetails?:  CardDetails;
}

/** Character width for ESC/POS text: 32 for 58 mm paper, 48 for 80 mm. The library auto-wraps. */
const COL_W = 32;

// ── Receipt text builder ──────────────────────────────────────────────────────

/** Pad a two-column row to exactly COL_W characters. */
function twoCol(left: string, right: string, width = COL_W): string {
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
  if ((data.discount ?? 0) > 0) {
    lines.push(`[L]Discount[R]-${$$(data.discount as number)}`);
  }
  if (data.tax > 0) {
    lines.push(`[L]Tax[R]${$$(data.tax)}`);
  }
  if ((data.tip ?? 0) > 0) {
    lines.push(`[L]Tip[R]${$$(data.tip as number)}`);
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

