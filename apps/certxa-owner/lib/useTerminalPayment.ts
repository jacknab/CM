/**
 * useTerminalPayment.ts
 *
 * Encapsulates the Stripe Terminal payment intent lifecycle:
 *   server PI creation → retrievePaymentIntent → collectPaymentMethod
 *     → confirmPaymentIntent → server capture.
 *
 * After a successful confirmation, card details (last4, brand, funding,
 * approval code, EMV data, entry method) are extracted from the confirmed
 * PaymentIntent and returned to the caller so they can be included on the
 * thermal printer receipt.
 *
 * Motivation: this flow was embedded inline inside POSModal alongside all the
 * UI rendering logic, making it hard to follow and impossible to test in
 * isolation. This hook mirrors the CheckoutViewModel separation in the
 * stripe-samples/terminal-apps-on-devices reference implementation.
 *
 * The two-step auth + manual capture pattern is intentional:
 *   - If the capture call fails the card is NOT charged (retry server-side).
 *   - If the flow fails before confirmation the PI is voided automatically
 *     so it doesn't sit as an authorized-but-uncaptured ghost on Stripe.
 */

import { useRef } from 'react';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { apiCaller } from './terminalBridge';
import { terminalDiag } from './terminalDiag';
import { captureWithRetry, pendingCapture, pendingIntent, nextStepForStatus } from './captureRecovery';
import { displayPrompt, inputPrompt } from './readerPrompts';
import type { CardDetails } from './printer';

/** Ticket context the server records with the payment (tip, discount, cash already taken). */
export interface PaymentContext {
  tipCents?:           number;
  discountCents?:      number;
  priorTenderedCents?: number;
}

const toCents = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export interface PaymentPhaseCallbacks {
  onPhase:  (phase: 'connected' | 'collecting' | 'processing') => void;
  onStatus: (msg: string) => void;
}

export interface PaymentResult {
  /** Card details extracted from the confirmed PaymentIntent.
   *  Present for card/m2/tap payments; undefined for cash/manual. */
  cardDetails?: CardDetails;
  /** The captured PaymentIntent (lets the web sheet ignore a duplicate completion event). */
  paymentIntentId?: string;
}

interface PaymentServerResult {
  clientSecret:    string;
  paymentIntentId: string;
}

/**
 * Hook that owns the Terminal payment intent lifecycle.
 * Must be rendered inside <StripeTerminalProvider>.
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
    const r = await apiCaller.call('/api/payments/terminal/location', 'GET');
    if (!r?.locationId) {
      // Surface the real server error (e.g. "Store has no connected Stripe account")
      // instead of a generic message that hides the root cause.
      throw new Error(r?.error ?? 'Could not get terminal location from server');
    }
    return r.locationId as string;
  };

  const createPaymentIntentOnServer = async (
    amountCents:   number,
    appointmentId: number,
    clientName:    string,
    method:        string,
    ctx?:          PaymentContext,
  ): Promise<PaymentServerResult> => {
    const r = await apiCaller.call('/api/payments/terminal/create-payment-intent', 'POST', {
      amountCents, currency: 'usd', appointmentId, clientName, method,
      tipCents:           toCents(ctx?.tipCents),
      discountCents:      toCents(ctx?.discountCents),
      priorTenderedCents: toCents(ctx?.priorTenderedCents),
    });
    if (!r?.clientSecret) throw new Error(r?.error ?? 'Failed to create charge on server');
    return r as PaymentServerResult;
  };

  /** Capture on the server. Throws unless the server confirms `{ success: true }`. */
  const captureOnServer = (piId: string, method: string): Promise<void> =>
    captureWithRetry((e, m, b) => apiCaller.call(e, m, b), piId, method);

  /** Best-effort void — never throws. Used to clean up ghost authorizations. */
  const cancelPaymentIntentOnServer = (piId: string): void => {
    apiCaller.call('/api/payments/terminal/cancel-payment-intent', 'POST', { paymentIntentId: piId })
      .catch(() => {});
  };

  // ── Card detail extraction ─────────────────────────────────────────────────────

  /**
   * Extracts card details from the confirmed Stripe Terminal PaymentIntent.
   *
   * Field paths verified directly against the installed
   * @stripe/stripe-terminal-react-native@0.0.1-beta.31 SDK — its TS defs
   * (types/index.d.ts: Charge, PaymentMethodDetails, CardPresentDetails,
   * ReceiptDetails) and its Android bridge (Mappers.kt: mapFromCharge,
   * mapFromPaymentMethod, mapFromCardPresentDetails, mapFromReceiptDetails).
   * Card-present data lives under PaymentMethodDetails.cardPresentDetails,
   * reachable two ways in this SDK: nested on the confirmed PaymentIntent's
   * first Charge (charges[0].paymentMethodDetails) or on the top-level
   * paymentMethod (PaymentMethod.Type also carries cardPresentDetails
   * directly) — both are checked since either may be the one populated.
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
        last4:   cd.last4 ?? '????',
        brand:   cd.brand ?? cd.network ?? 'card',
        funding: cd.funding,
        // receipt.authorizationCode is the canonical path (CardPresentDetails.receipt is
        // ReceiptDetails.authorizationCode); charge.authorizationCode is the same value
        // denormalized onto the Charge object by this SDK (Mappers.kt: mapFromCharge).
        approvalCode: cd.receipt?.authorizationCode ?? charge?.authorizationCode,
        // Raw SDK value (e.g. "contactlessEmv"/"contactEmv"), not the short "chip"/
        // "contactless"/"swipe" keys receiptText.ts's fmtEntry() maps — an unmatched value
        // falls through to its .toUpperCase() default. Not touching that mapping here.
        entryMethod: cd.readMethod,
        // applicationCryptogram (EMV tag 9F26, the ARQC) IS exposed by this SDK version.
        arqc: cd.receipt?.applicationCryptogram,
        // No AID/applicationIdentifier field exists on this SDK's CardPresentDetails or
        // ReceiptDetails (only emvAuthData, a raw string blob, and dedicatedFileName, which
        // is EMV-adjacent but not verified as equivalent) — left unset rather than guessed.
        aid: undefined,
        // No pinVerified (or other boolean) field exists on this SDK version.
        // receipt.cvm (cardholder verification method) IS exposed, but as a string
        // ("Online PIN", "Signature", "No CVM Required", …) — CardDetails only has a
        // boolean slot, so left unset rather than inferred/approximated from cvm.
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
   *
   * Sequence:
   *   1. Creates the PaymentIntent on the Certxa server.
   *   2. Retrieves it via the Terminal SDK.
   *   3. Collects the payment method (card tap / swipe / insert).
   *   4. Confirms (authorizes) the PaymentIntent via the SDK.
   *   5. Captures the authorized amount server-side.
   *
   * Returns a `PaymentResult` with optional `cardDetails` for receipt printing.
   *
   * Fires `callbacks.onPhase` and `callbacks.onStatus` at each step so
   * callers can drive UI transitions without re-implementing the flow.
   *
   * Throws on any failure. If the PI was created but not yet confirmed,
   * it is automatically voided before re-throwing.
   */
  const run = async (
    amountCents:   number,
    appointmentId: number,
    clientName:    string,
    method:        string,
    callbacks:     PaymentPhaseCallbacks,
    ctx?:          PaymentContext,
  ): Promise<PaymentResult> => {
    statusRef.current = callbacks.onStatus;
    try {
      return await runPayment(amountCents, appointmentId, clientName, method, callbacks, ctx);
    } finally {
      statusRef.current = null;
    }
  };

  const runPayment = async (
    amountCents:   number,
    appointmentId: number,
    clientName:    string,
    method:        string,
    callbacks:     PaymentPhaseCallbacks,
    ctx?:          PaymentContext,
  ): Promise<PaymentResult> => {
    // 1. A previous attempt for this ticket + amount was approved on the card but its
    //    capture failed. Finish THAT payment — never create a second one.
    const resumable = pendingCapture.matching(appointmentId, amountCents);
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
    let intent = pendingIntent.matching(appointmentId, amountCents);
    if (!intent && pendingIntent.peek()) await releaseIntent();

    const createNew = async () => {
      callbacks.onPhase('connected');
      callbacks.onStatus('Creating charge…');
      console.log('[Stripe] createPaymentIntent()');
      const r = await createPaymentIntentOnServer(amountCents, appointmentId, clientName, method, ctx);
      intent = { paymentIntentId: r.paymentIntentId, clientSecret: r.clientSecret, appointmentId, amountCents, method, at: Date.now() };
      pendingIntent.set({ paymentIntentId: r.paymentIntentId, clientSecret: r.clientSecret, appointmentId, amountCents, method });
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

      // A decline / cancel / timeout leaves the PaymentIntent in place (Stripe: re-use it).
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
    pendingCapture.set({ paymentIntentId, appointmentId, amountCents, method, cardDetails });
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
      await apiCaller.call('/api/payments/terminal/cancel-payment-intent', 'POST', { paymentIntentId: p.paymentIntentId });
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
      await captureWithRetry((e, m, b) => apiCaller.call(e, m, b), p.paymentIntentId, p.method, { attempts: 1 });
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
   * normally happens once at login; if that failed (Stripe not connected yet, early
   * network error) this retries it instead of leaving payments dead until restart.
   */
  const ensureInitialized = async (): Promise<void> => {
    if (isInitialized || terminalDiag.sdkInitialized.occurred) return;

    // The login-time initializer is still working (no failure recorded yet) — let it finish.
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
