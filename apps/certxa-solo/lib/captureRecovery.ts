/**
 * captureRecovery.ts — pure logic (no React Native imports) for the last step of a
 * card payment: capturing the authorized PaymentIntent on the server.
 *
 * The WebView RPC bridge resolves the server's JSON body even for HTTP errors, so a
 * capture that failed looks like a normal return value. Success is therefore only
 * ever `{ success: true }` from the server — anything else is a failure.
 */

export type RpcCall = (endpoint: string, method: string, body?: unknown) => Promise<any>;

export class CaptureFailedError extends Error {
  paymentIntentId: string;
  constructor(paymentIntentId: string, detail: string) {
    super(
      `The card was approved but the charge could not be completed (${detail}). ` +
      'Do NOT charge the customer again — tap the payment button to finish it.',
    );
    this.name = 'CaptureFailedError';
    this.paymentIntentId = paymentIntentId;
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Server answers that retrying cannot fix. */
const NON_RETRYABLE = /cannot be captured|does not belong to this store|no connected stripe account/i;

export async function captureWithRetry(
  call: RpcCall,
  paymentIntentId: string,
  method: string,
  opts: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 1500;
  const sleep = opts.sleep ?? defaultSleep;
  let detail = 'no response from the server';

  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await call('/api/payments/terminal/capture-payment-intent', 'POST', { paymentIntentId, method });
      if (r?.success === true) return;
      detail = typeof r?.error === 'string' && r.error ? r.error : 'the server did not confirm the capture';
      if (NON_RETRYABLE.test(detail)) break;
    } catch (e: any) {
      detail = e?.message || 'network error';
    }
    if (i < attempts) await sleep(delayMs * i);
  }
  throw new CaptureFailedError(paymentIntentId, detail);
}

// ── A payment that was approved on the card but not yet captured ────────────────
// Kept in memory so "try again" finishes THIS payment instead of creating a second
// PaymentIntent (which would put a second hold on the customer's card).

export interface PendingCapture {
  paymentIntentId: string;
  appointmentId: number;
  amountCents: number;
  method: string;
  cardDetails?: unknown;
  at: number;
}

const PENDING_MAX_AGE_MS = 30 * 60 * 1000;
let pending: PendingCapture | null = null;

export const pendingCapture = {
  set(p: Omit<PendingCapture, 'at'>, now: number = Date.now()): void {
    pending = { ...p, at: now };
  },
  /** The pending capture, if it is for this same ticket and amount and still fresh. */
  matching(appointmentId: number, amountCents: number, now: number = Date.now()): PendingCapture | null {
    if (!pending) return null;
    if (now - pending.at > PENDING_MAX_AGE_MS) { pending = null; return null; }
    return pending.appointmentId === appointmentId && pending.amountCents === amountCents ? pending : null;
  },
  peek(): PendingCapture | null {
    return pending;
  },
  clear(): void {
    pending = null;
  },
};

// ── An unfinished PaymentIntent (created, not yet authorized) ───────────────────
// Stripe's guidance: after a decline or a timeout, re-use the SAME PaymentIntent —
// creating a new one can leave multiple authorizations on the cardholder's card.

export interface PendingIntent {
  paymentIntentId: string;
  clientSecret: string;
  appointmentId: number;
  amountCents: number;
  method: string;
  at: number;
}

let pendingIntentState: PendingIntent | null = null;

export const pendingIntent = {
  set(p: Omit<PendingIntent, 'at'>, now: number = Date.now()): void {
    pendingIntentState = { ...p, at: now };
  },
  matching(appointmentId: number, amountCents: number, now: number = Date.now()): PendingIntent | null {
    const p = pendingIntentState;
    if (!p) return null;
    if (now - p.at > PENDING_MAX_AGE_MS) return null; // stale: caller releases it via peek()
    return p.appointmentId === appointmentId && p.amountCents === amountCents ? p : null;
  },
  peek(): PendingIntent | null {
    return pendingIntentState;
  },
  clear(): void {
    pendingIntentState = null;
  },
};

export type NextStep = 'capture' | 'collect' | 'wait' | 'new';

/** What to do with a PaymentIntent we already created, given the status Stripe reports. */
export function nextStepForStatus(status: string | undefined | null): NextStep {
  switch (status) {
    case 'requiresPaymentMethod':
    case 'requiresConfirmation': // nothing authorized yet — collect again is safe
    case 'requiresAction':
      return 'collect';
    case 'requiresCapture':      // already authorized on the card — just capture
    case 'succeeded':            // already captured — the server call is idempotent
      return 'capture';
    case 'processing':
      return 'wait';
    case 'canceled':
    default:
      return 'new';
  }
}
