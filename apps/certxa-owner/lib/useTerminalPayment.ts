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

import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { apiCaller } from './terminalBridge';
import type { CardDetails } from './printer';

export interface PaymentPhaseCallbacks {
  onPhase:  (phase: 'connected' | 'collecting' | 'processing') => void;
  onStatus: (msg: string) => void;
}

export interface PaymentResult {
  /** Card details extracted from the confirmed PaymentIntent.
   *  Present for card/m2/tap payments; undefined for cash/manual. */
  cardDetails?: CardDetails;
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
  const {
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
  } = useStripeTerminal();

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
  ): Promise<PaymentServerResult> => {
    const r = await apiCaller.call('/api/payments/terminal/create-payment-intent', 'POST', {
      amountCents, currency: 'usd', appointmentId, clientName,
    });
    if (!r?.clientSecret) throw new Error(r?.error ?? 'Failed to create charge on server');
    return r as PaymentServerResult;
  };

  const captureOnServer = async (piId: string, method?: string): Promise<void> => {
    await apiCaller.call('/api/payments/terminal/capture-payment-intent', 'POST', {
      paymentIntentId: piId,
      method: method ?? 'card',
    });
  };

  /** Best-effort void — never throws. Used to clean up ghost authorizations. */
  const cancelPaymentIntentOnServer = (piId: string): void => {
    apiCaller.call('/api/payments/terminal/cancel-payment-intent', 'POST', { paymentIntentId: piId })
      .catch(() => {});
  };

  // ── Card detail extraction ─────────────────────────────────────────────────────

  /**
   * Extracts card details from the confirmed Stripe Terminal PaymentIntent.
   * Uses safe optional-chaining + `as any` because the field shape varies
   * slightly between Stripe Terminal SDK beta versions.
   */
  function extractCardDetails(confirmed: any, piId: string): CardDetails | undefined {
    try {
      // The Terminal SDK exposes card details under paymentMethodDetails.cardDetails
      // (card-present) or paymentMethodDetails.interacPresent for Interac.
      const pm = confirmed?.paymentMethodDetails;
      const cd = pm?.cardDetails ?? pm?.interacPresent ?? pm?.cardPresent;
      if (!cd) return undefined;

      const emv = cd.emvData ?? cd.emvAuthData ?? {};

      return {
        last4:           cd.last4 ?? '????',
        brand:           cd.brand ?? cd.network ?? 'card',
        funding:         cd.funding,
        approvalCode:    emv.authorizationCode ?? emv.authorisationCode ?? cd.authorizationCode,
        entryMethod:     cd.entryMethod,
        aid:             emv.applicationIdentifier ?? emv.aid,
        arqc:            emv.cryptogram ?? emv.arqc,
        pinVerified:     cd.pinVerified ?? false,
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
  ): Promise<PaymentResult> => {
    let paymentIntentId: string | null = null;
    let piConfirmed = false;

    try {
      callbacks.onPhase('connected');
      callbacks.onStatus('Creating charge…');
      console.log('[Stripe] createPaymentIntent()');

      const result = await createPaymentIntentOnServer(amountCents, appointmentId, clientName);
      paymentIntentId = result.paymentIntentId;

      const { paymentIntent, error: retErr } = await retrievePaymentIntent(result.clientSecret);
      if (retErr || !paymentIntent) throw new Error(retErr?.message ?? 'Failed to retrieve payment intent');

      callbacks.onPhase('collecting');
      callbacks.onStatus(method === 'm2' ? 'Tap, swipe, or insert card…' : 'Tap card, phone, or watch…');
      console.log('[Stripe] collectPaymentMethod()');

      const { paymentIntent: collected, error: collectErr } = await collectPaymentMethod({ paymentIntent });
      if (collectErr || !collected) throw new Error(collectErr?.message ?? 'Payment cancelled or failed');

      callbacks.onPhase('processing');
      callbacks.onStatus('Processing…');
      console.log('[Stripe] confirmPaymentIntent()');

      const { paymentIntent: confirmed, error: confirmErr } = await confirmPaymentIntent({ paymentIntent: collected });
      if (confirmErr || !confirmed) throw new Error(confirmErr?.message ?? 'Confirmation failed');

      // Card is now authorized — do NOT void even if the capture call fails.
      // A failed capture can be retried server-side; voiding would charge the
      // customer without recording the payment.
      piConfirmed = true;
      await captureOnServer(paymentIntentId, method);

      const cardDetails = extractCardDetails(confirmed, paymentIntentId);
      return { cardDetails };
    } catch (err) {
      if (paymentIntentId && !piConfirmed) {
        cancelPaymentIntentOnServer(paymentIntentId);
      }
      throw err;
    }
  };

  /** Cancels an in-progress collectPaymentMethod. Safe to call at any time. */
  const cancel = async (): Promise<void> => {
    try { await cancelCollectPaymentMethod(); } catch {}
  };

  return { run, cancel, getLocationId };
}
