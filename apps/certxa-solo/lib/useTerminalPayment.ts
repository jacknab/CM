/**
 * useTerminalPayment.ts — ported from certxa-owner's hook of the same name.
 *
 * Encapsulates the Stripe Terminal payment intent lifecycle:
 *   server PI creation → retrievePaymentIntent → collectPaymentMethod
 *     → confirmPaymentIntent → server capture.
 *
 * This app has no receipt printer, so (unlike certxa-owner) extracted card
 * details are only returned to the caller for on-screen confirmation, not
 * for a print job.
 *
 * The two-step auth + manual capture pattern is intentional:
 *   - If the capture call fails the card is NOT charged (retry server-side).
 *   - If the flow fails before confirmation the PI is voided automatically
 *     so it doesn't sit as an authorized-but-uncaptured ghost on Stripe.
 */

import { useRef } from 'react';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { terminalApiCall } from './apiClient';
import { terminalDiag } from './terminalDiag';
import { captureWithRetry, pendingCapture, pendingIntent, nextStepForStatus } from './captureRecovery';
import { displayPrompt, inputPrompt } from './readerPrompts';

/** Ticket context the server records with the payment (tip, discount, cash already taken). */
export interface PaymentContext {
  tipCents?: number;
  discountCents?: number;
  priorTenderedCents?: number;
}

export interface CardDetails {
  last4: string;
  brand: string;
  funding?: string;
  approvalCode?: string;
  entryMethod?: string;
  arqc?: string;
  aid?: string;
  pinVerified?: boolean;
  paymentIntentId: string;
}

const toCents = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export interface PaymentPhaseCallbacks {
  onPhase: (phase: 'connected' | 'collecting' | 'processing') => void;
  onStatus: (msg: string) => void;
}

export interface PaymentResult {
  cardDetails?: CardDetails;
  paymentIntentId?: string;
}

interface PaymentServerResult {
  clientSecret: string;
  paymentIntentId: string;
}

/**
 * Hook that owns the Terminal payment intent lifecycle.
 * Must be rendered inside <StripeTerminalProvider>.
 *
 * `appointmentId` is optional — omit it for a standalone "quick sale" not
 * tied to any appointment on the calendar.
 */
export function useTerminalPayment() {
  // The M2 has no screen: Stripe requires the app to show the reader's prompts
  // ("Retry card", "Insert or swipe"…). They are routed to the running payment's status line.
  const statusRef = useRef<((msg: string) => void) | null>(null);

  const {
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
    initialize,
    isInitialized,
  } = useStripeTerminal({
    onDidRequestReaderInput: (options: readonly string[]) => statusRef.current?.(inputPrompt(options)),
    onDidRequestReaderDisplayMessage: (message: string) => statusRef.current?.(displayPrompt(message)),
  } as any);

  // ── Server helpers ────────────────────────────────────────────────────────────

  const getLocationId = async (): Promise<string> => {
    const r = await terminalApiCall('/api/payments/terminal/location', 'GET');
    if (!r?.locationId) {
      throw new Error(r?.error ?? 'Could not get terminal location from server');
    }
    return r.locationId as string;
  };

  const createPaymentIntentOnServer = async (
    amountCents: number,
    appointmentId: number | undefined,
    clientName: string,
    method: string,
    ctx?: PaymentContext,
  ): Promise<PaymentServerResult> => {
    const r = await terminalApiCall('/api/payments/terminal/create-payment-intent', 'POST', {
      amountCents, currency: 'usd', appointmentId, clientName, method,
      tipCents: toCents(ctx?.tipCents),
      discountCents: toCents(ctx?.discountCents),
      priorTenderedCents: toCents(ctx?.priorTenderedCents),
    });
    if (!r?.clientSecret) throw new Error(r?.error ?? 'Failed to create charge on server');
    return r as PaymentServerResult;
  };

  /** Capture on the server. Throws unless the server confirms `{ success: true }`. */
  const captureOnServer = (piId: string, method: string): Promise<void> =>
    captureWithRetry((e, m, b) => terminalApiCall(e, m, b), piId, method);

  /** Best-effort void — never throws. Used to clean up ghost authorizations. */
  const cancelPaymentIntentOnServer = (piId: string): void => {
    terminalApiCall('/api/payments/terminal/cancel-payment-intent', 'POST', { paymentIntentId: piId })
      .catch(() => {});
  };

  // ── Card detail extraction ─────────────────────────────────────────────────────

  /**
   * Extracts card details from the confirmed Stripe Terminal PaymentIntent.
   * Field paths match the installed @stripe/stripe-terminal-react-native SDK
   * (see the equivalent function in certxa-owner's useTerminalPayment.ts for
   * the full field-by-field verification notes).
   */
  function extractCardDetails(confirmed: any, piId: string): CardDetails | undefined {
    try {
      const charge = confirmed?.charges?.[0];
      const chargePmd = charge?.paymentMethodDetails;
      const topPmd = confirmed?.paymentMethod;
      const cd = chargePmd?.cardPresentDetails ?? chargePmd?.interacPresentDetails
        ?? topPmd?.cardPresentDetails ?? topPmd?.interacPresentDetails;
      if (!cd) return undefined;

      return {
        last4: cd.last4 ?? '????',
        brand: cd.brand ?? cd.network ?? 'card',
        funding: cd.funding,
        approvalCode: cd.receipt?.authorizationCode ?? charge?.authorizationCode,
        entryMethod: cd.readMethod,
        arqc: cd.receipt?.applicationCryptogram,
        aid: undefined,
        pinVerified: undefined,
        paymentIntentId: piId,
      };
    } catch {
      return undefined;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Runs the full SDK payment flow for an already-connected reader.
   * `appointmentId` is omitted for a standalone quick sale.
   * Throws on any failure. If the PI was created but not yet confirmed,
   * it is automatically voided before re-throwing.
   */
  const run = async (
    amountCents: number,
    appointmentId: number | undefined,
    clientName: string,
    method: string,
    callbacks: PaymentPhaseCallbacks,
    ctx?: PaymentContext,
  ): Promise<PaymentResult> => {
    statusRef.current = callbacks.onStatus;
    try {
      return await runPayment(amountCents, appointmentId, clientName, method, callbacks, ctx);
    } finally {
      statusRef.current = null;
    }
  };

  const runPayment = async (
    amountCents: number,
    appointmentId: number | undefined,
    clientName: string,
    method: string,
    callbacks: PaymentPhaseCallbacks,
    ctx?: PaymentContext,
  ): Promise<PaymentResult> => {
    // Pending-capture/pending-intent matching keys on appointmentId; a quick
    // sale (no appointmentId) uses 0 as its key so it still gets the same
    // "resume the earlier attempt instead of double-charging" protection.
    const dedupeKey = appointmentId ?? 0;

    // 1. A previous attempt for this ticket + amount was approved on the card but its
    //    capture failed. Finish THAT payment — never create a second one.
    const resumable = pendingCapture.matching(dedupeKey, amountCents);
    if (resumable) {
      callbacks.onPhase('processing');
      callbacks.onStatus('Finishing payment…');
      await captureOnServer(resumable.paymentIntentId, resumable.method);
      pendingCapture.clear();
      pendingIntent.clear();
      return { cardDetails: resumable.cardDetails as CardDetails | undefined, paymentIntentId: resumable.paymentIntentId };
    }

    // A different ticket/amount's approved-but-uncaptured payment: capture it or release the hold.
    if (pendingCapture.peek()) await abandonPending();

    // 2. Stripe: after a decline or a timeout, re-use the SAME PaymentIntent — creating
    //    a new one can leave several authorizations on the cardholder's card. Only a
    //    PaymentIntent for a different ticket/amount (or a stale one) is released.
    let intent = pendingIntent.matching(dedupeKey, amountCents);
    if (!intent && pendingIntent.peek()) await releaseIntent();

    const createNew = async () => {
      callbacks.onPhase('connected');
      callbacks.onStatus('Creating charge…');
      console.log('[Stripe] createPaymentIntent()');
      const r = await createPaymentIntentOnServer(amountCents, appointmentId, clientName, method, ctx);
      intent = { paymentIntentId: r.paymentIntentId, clientSecret: r.clientSecret, appointmentId: dedupeKey, amountCents, method, at: Date.now() };
      pendingIntent.set({ paymentIntentId: r.paymentIntentId, clientSecret: r.clientSecret, appointmentId: dedupeKey, amountCents, method });
    };
    const retrieve = async () => {
      const { paymentIntent, error } = await retrievePaymentIntent(intent!.clientSecret);
      if (error || !paymentIntent) throw new Error(error?.message ?? 'Failed to retrieve payment intent');
      return paymentIntent;
    };

    if (!intent) await createNew();
    callbacks.onPhase('connected');

    let pi = await retrieve();
    let step = nextStepForStatus((pi as any).status);
    for (let i = 0; step === 'wait' && i < 3; i++) {
      callbacks.onStatus('Checking the earlier attempt…');
      await new Promise<void>((r) => setTimeout(r, 2000));
      pi = await retrieve();
      step = nextStepForStatus((pi as any).status);
    }
    if (step === 'wait') {
      throw new Error('The previous attempt is still processing. Wait a few seconds, then try again.');
    }
    if (step === 'new') {            // canceled / unusable — start a fresh one
      pendingIntent.clear();
      await createNew();
      pi = await retrieve();
      step = 'collect';
    }

    let cardDetails: CardDetails | undefined;
    const paymentIntentId = intent!.paymentIntentId;

    if (step === 'collect') {
      callbacks.onPhase('collecting');
      callbacks.onStatus(method === 'm2' ? 'Tap, insert, or swipe card…' : 'Tap card, phone, or watch…');
      console.log('[Stripe] collectPaymentMethod()');

      const { paymentIntent: collected, error: collectErr } = await collectPaymentMethod({ paymentIntent: pi });
      if (collectErr || !collected) throw new Error(collectErr?.message ?? 'Payment cancelled or failed');

      callbacks.onPhase('processing');
      callbacks.onStatus('Processing…');
      console.log('[Stripe] confirmPaymentIntent()');

      const { paymentIntent: confirmed, error: confirmErr } = await confirmPaymentIntent({ paymentIntent: collected });
      if (confirmErr || !confirmed) {
        if ((confirmErr as any)?.paymentIntent?.status === 'canceled') pendingIntent.clear();
        throw new Error(confirmErr?.message ?? 'Confirmation failed');
      }
      cardDetails = extractCardDetails(confirmed, paymentIntentId);
    } else {
      // Already authorized by an earlier attempt whose response we never saw — do not
      // charge the card again, just capture.
      callbacks.onPhase('processing');
      callbacks.onStatus('Finishing payment…');
    }

    // Card is authorized — never void from here on, even if capture fails; remember it so
    // "try again" finishes this same payment.
    pendingCapture.set({ paymentIntentId, appointmentId: dedupeKey, amountCents, method, cardDetails });
    await captureOnServer(paymentIntentId, method);
    pendingCapture.clear();
    pendingIntent.clear();
    return { cardDetails, paymentIntentId };
  };

  /** Void an unfinished PaymentIntent so it is not left dangling. */
  async function releaseIntent(): Promise<void> {
    const p = pendingIntent.peek();
    pendingIntent.clear();
    if (!p) return;
    try {
      await terminalApiCall('/api/payments/terminal/cancel-payment-intent', 'POST', { paymentIntentId: p.paymentIntentId });
    } catch { /* best effort */ }
  }

  /** Cancels an in-progress collectPaymentMethod. Safe to call at any time. */
  const cancel = async (): Promise<void> => {
    try { await cancelCollectPaymentMethod(); } catch {}
  };

  /**
   * The user walked away from a payment that was approved but not captured. Try once
   * more to capture it (it may already have gone through); if that fails, void the
   * authorization so the customer's card is not left on hold.
   */
  async function abandonPending(): Promise<{ captured: boolean; paymentIntentId?: string; cardDetails?: CardDetails }> {
    const p = pendingCapture.peek();
    if (!p) {
      await releaseIntent(); // walked away before the card was authorized
      return { captured: false };
    }
    try {
      await captureWithRetry((e, m, b) => terminalApiCall(e, m, b), p.paymentIntentId, p.method, { attempts: 1 });
      pendingCapture.clear();
      pendingIntent.clear();
      return { captured: true, paymentIntentId: p.paymentIntentId, cardDetails: p.cardDetails as CardDetails | undefined };
    } catch {
      cancelPaymentIntentOnServer(p.paymentIntentId);
      pendingCapture.clear();
      pendingIntent.clear();
      return { captured: false };
    }
  }

  /**
   * Make sure the Terminal SDK is initialized before taking a payment. Initialization
   * normally happens once at login; if that failed this retries it instead of leaving
   * payments dead until restart.
   */
  const ensureInitialized = async (): Promise<void> => {
    if (isInitialized || terminalDiag.sdkInitialized.occurred) return;

    if (terminalDiag.providerMounted.occurred && !terminalDiag.sdkInitialized.error) {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && !terminalDiag.sdkInitialized.occurred && !terminalDiag.sdkInitialized.error) {
        await new Promise<void>((r) => setTimeout(r, 500));
      }
      if (terminalDiag.sdkInitialized.occurred) return;
    }

    const res: any = await initialize();
    if (res?.error) {
      const msg: string = res.error.message ?? '';
      if (/already/i.test(msg)) { terminalDiag.markSdkInitialized(); return; }
      const reason = terminalDiag.tokenReceived.error || msg || 'The card reader service could not start';
      terminalDiag.markInitFailed(reason);
      throw new Error(reason);
    }
    terminalDiag.markSdkInitialized();
  };

  return { run, cancel, getLocationId, abandonPending, ensureInitialized };
}
