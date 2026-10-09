import { useCallback, useEffect, useRef, useState } from "react";
import { verifyCardCharge } from "../frontdesk/verifyCardCharge";

/**
 * Real card charging for the Nail POS checkout — the Stripe M2 reader only (Tap to Pay is deliberately not offered here):
 *   • native Android app → the device bridge (M2_PAY), which reports back with `certxa_native_*` window events
 *   • web + Stripe Terminal → connect once, then create / collect / process / capture a PaymentIntent
 *   • paired /frontdesk tablet → the customer confirms the tip there and that device's M2 charges (see `frontdesk`)
 * A charge only becomes a tender through `onPaid`, i.e. after the money has actually moved.
 * `CardKind` still includes "tap" so a charge the other device reports as Tap to Pay is recorded truthfully.
 */
export type CardKind = "m2" | "tap";
export type TermStatus = "idle" | "loading" | "discovering" | "connecting" | "ready" | "collecting" | "processing" | "error";

export interface CardPaymentsOpts {
  ticketId: number;
  clientName: string;
  /** A customer-facing /frontdesk tablet is paired. */
  dualScreen: boolean;
  send: (type: string, payload?: Record<string, unknown>) => void;
  /** The ticket's tip / discount / already-tendered cents, stored on the PaymentIntent by the native app. */
  context: () => { tipCents: number; discountCents: number; priorTenderedCents: number };
  onPaid: (kind: CardKind, amount: number, last4?: string | null, paymentIntentId?: string | null, cardDetails?: unknown) => void;
  /** What is still owed once `paid` is taken, and what the sale will have taken in all — told to the customer's screen so a part-payment doesn't read "Payment successful". */
  settlementAfter: (paid: number) => { remaining: number; paidTotal: number };
  onFailed: (message: string) => void;
  /** Card charges already on this checkout, so a server-side lookup doesn't add one twice. */
  knownIntents: () => string[];
  /** The tip implied by a front-desk charge picked up from the server (charge − pre-tip amount). */
  onRemoteTip: (amount: number) => void;
  say: (text: string, tone?: "info" | "success" | "error") => void;
}

const money = (n: number) => `$${n.toFixed(2)}`;
export const isNativeApp = () => typeof window !== "undefined" && !!(window as any).CERTXA_NATIVE_APP;
/**
 * Can this page really talk to the Android app? "web" = a normal browser; "app" = inside the Certxa app with the message channel ready;
 * "broken" = the app flagged itself but its message channel is missing (a payment sent now would go nowhere).
 */
export const bridgeState = (): "web" | "app" | "broken" =>
  !isNativeApp() ? "web" : typeof (window as any).ReactNativeWebView?.postMessage === "function" ? "app" : "broken";

function loadStripeTerminalSDK(): Promise<any> {
  if ((window as any).StripeTerminal) return Promise.resolve((window as any).StripeTerminal);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/terminal/v1/";
    script.onload = () => resolve((window as any).StripeTerminal);
    script.onerror = () => reject(new Error("Failed to load Stripe Terminal SDK"));
    document.head.appendChild(script);
  });
}

export function useCardPayments(o: CardPaymentsOpts) {
  const opts = useRef(o);
  opts.current = o;
  const native = isNativeApp();

  const [status, setStatus] = useState<TermStatus>("idle");
  const [nativeBusy, setNativeBusy] = useState<CardKind | null>(null);
  const [awaitingFrontdesk, setAwaitingFrontdesk] = useState(false);
  // After staff stop waiting on the front desk, keep checking the server for a while: the customer may
  // already have tapped their card there, and that charge must still land on this ticket.
  const [watchingRemote, setWatchingRemote] = useState(false);
  const watchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (watchTimer.current) clearTimeout(watchTimer.current); }, []);
  const frontdeskLock = useRef(false);
  const term = useRef<any>(null);
  const reader = useRef<any>(null);
  const seenIntents = useRef(new Set<string>());
  const seenRemoteIntents = useRef(new Set<string>());
  const verifyingRemoteIntents = useRef(new Set<string>());

  // Native bridge results (and failures) for THIS ticket.
  useEffect(() => {
    if (!native) return;
    const done = async (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (Number(d.appointmentId) !== opts.current.ticketId) return;
      d.handledBySheet = true; // tell any page-level handler this checkout owns the payment
      const key = d.paymentIntentId ? String(d.paymentIntentId) : "";
      if (!key) { opts.current.onFailed("Card charge has no transaction ID. Check Stripe before retrying."); return; }
      if (seenIntents.current.has(key)) return;
      seenIntents.current.add(key);
      const amount = Number(d.amount) || 0;
      if (amount <= 0) return;
      try {
        const paid = await verifyCardCharge(key, opts.current.ticketId, amount);
        opts.current.send("kiosk_checkout_payment_result", { success: true, total: paid, last4: d.last4, appointmentId: opts.current.ticketId, ...opts.current.settlementAfter(paid) });
        opts.current.onPaid(d.method === "tap_to_pay" ? "tap" : "m2", paid, d.last4 ? String(d.last4) : null, key, d.cardDetails ?? undefined);
      } catch (err: any) { seenIntents.current.delete(key); opts.current.onFailed(err?.message ?? "Card payment could not be verified"); }
      finally { setNativeBusy(null); }
    };
    const failed = (e: Event) => {
      setNativeBusy(null);
      const message = (e as CustomEvent).detail?.message;
      if (message && message !== "Cancelled") opts.current.onFailed(String(message));
    };
    window.addEventListener("certxa_native_payment_complete", done);
    window.addEventListener("certxa_native_m2_error", failed);
    window.addEventListener("certxa_native_payment_failed", failed);
    return () => {
      window.removeEventListener("certxa_native_payment_complete", done);
      window.removeEventListener("certxa_native_m2_error", failed);
      window.removeEventListener("certxa_native_payment_failed", failed);
    };
  }, [native]);

  // What the front desk was asked to charge before the customer's tip (cents), while waiting on it.
  const frontdeskBaseCents = useRef<number | null>(null);

  // Turn a charge the front-desk device made into a tender — once, and only after Stripe confirms it.
  const acceptRemoteCharge = useCallback(async (intentId: string, total: number, method: CardKind, last4: string | null, cardDetails: unknown) => {
    const o = opts.current;
    if (seenRemoteIntents.current.has(intentId) || verifyingRemoteIntents.current.has(intentId) || o.knownIntents().includes(intentId)) return;
    verifyingRemoteIntents.current.add(intentId);
    try {
      const paid = await verifyCardCharge(intentId, o.ticketId, total);
      if (opts.current.ticketId !== o.ticketId) return;
      seenRemoteIntents.current.add(intentId);
      const base = frontdeskBaseCents.current;
      if (base != null && Math.round(paid * 100) >= base) o.onRemoteTip((Math.round(paid * 100) - base) / 100);
      o.onPaid(method, paid, last4, intentId, cardDetails);
    } catch (err: any) { o.onFailed(err?.message ?? "Card payment could not be verified"); }
    finally {
      verifyingRemoteIntents.current.delete(intentId);
      frontdeskBaseCents.current = null;
      frontdeskLock.current = false;
      setAwaitingFrontdesk(false);
    }
  }, []);

  // The front-desk device reported the card result after the customer confirmed the tip there.
  const onSocket = useCallback(async (msg: any) => {
    if (msg?.type !== "kiosk_checkout_payment_result") return;
    const o = opts.current;
    if (msg.appointmentId != null && Number(msg.appointmentId) !== o.ticketId) return;
    if (msg.via === "client_confirm") {
      // The customer confirmed the tip on their screen and the native bridge ran there.
      if (msg.success) {
        const intentId = typeof msg.paymentIntentId === "string" ? msg.paymentIntentId : null;
        if (!intentId) {
          frontdeskLock.current = false;
          setAwaitingFrontdesk(false);
          o.onFailed("Missing transaction ID. Check Stripe before trying another charge.");
          return;
        }
        await acceptRemoteCharge(intentId, Number(msg.total), msg.method === "tap" ? "tap" : "m2", msg.last4 ?? null, msg.cardDetails);
      } else {
        frontdeskBaseCents.current = null;
        frontdeskLock.current = false;
        setAwaitingFrontdesk(false);
        o.onFailed(msg.error ? String(msg.error) : "Card declined");
      }
    }
  }, [acceptRemoteCharge]);

  // Safety net while the front desk is charging: the server records every captured charge against the
  // ticket, so check it directly — a lost result message must never leave this screen waiting forever
  // on a customer who has already paid.
  useEffect(() => {
    if (!awaitingFrontdesk && !watchingRemote) return;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch(`/api/nail/captured-card-payments/${opts.current.ticketId}`, { credentials: "include" });
        if (!alive || !r.ok) return;
        const rows = await r.json() as { paymentIntentId: string; amountCents: number }[];
        if (!alive || !Array.isArray(rows)) return;
        for (const row of rows) await acceptRemoteCharge(row.paymentIntentId, row.amountCents / 100, "m2", null, undefined);
      } catch { /* try again on the next tick */ }
    };
    const iv = setInterval(check, 4_000);
    return () => { alive = false; clearInterval(iv); };
  }, [awaitingFrontdesk, watchingRemote, acceptRemoteCharge]);

  const bridge = (type: "M2_PAY", amount: number) => {
    const o = opts.current;
    const cents = Math.round(amount * 100);
    if (cents <= 0) return o.say("NOTHING DUE", "error");
    if (nativeBusy) return;
    // Never mark the button busy for a message that cannot be delivered — it would stay on "CHARGING…" with no way out.
    if (bridgeState() !== "app") return o.onFailed("The Certxa app connection isn't ready. Close and reopen the app, then try again.");
    setNativeBusy("m2");
    (window as any).ReactNativeWebView.postMessage(JSON.stringify({
      type, appointmentId: o.ticketId, amountCents: cents, clientName: o.clientName, nailCheckout: true, ...o.context(),
    }));
    o.say("M2 READER — INSERT / TAP CARD", "info");
  };

  const connectM2 = async () => {
    setStatus("loading");
    try {
      const StripeTerminal = await loadStripeTerminalSDK();
      const t = StripeTerminal.create({
        onFetchConnectionToken: async () => {
          const r = await fetch("/api/payments/terminal/connection-token", { method: "POST", credentials: "include" });
          if (!r.ok) throw new Error("Failed to fetch connection token");
          return (await r.json()).secret;
        },
        onUnexpectedReaderDisconnect: () => { reader.current = null; setStatus("idle"); opts.current.onFailed("Reader disconnected."); },
      });
      term.current = t;
      setStatus("discovering");
      const disc = await t.discoverReaders({ simulated: false });
      if (disc.error) throw new Error(disc.error.message);
      const found = disc.discoveredReaders ?? [];
      if (!found.length) throw new Error("No reader found. The M2 is a Bluetooth reader and only works through the Certxa Android app — a web browser can't connect to it (browsers only support smart readers on the same network).");
      setStatus("connecting");
      const conn = await t.connectReader(found[0]);
      if (conn.error) throw new Error(conn.error.message);
      reader.current = found[0];
      setStatus("ready");
      opts.current.say(`M2 READER CONNECTED · ${String(found[0].label ?? found[0].id).toUpperCase()}`, "success");
    } catch (err: any) {
      setStatus("error");
      opts.current.onFailed(err?.message ?? "Reader connection failed");
    }
  };

  // A card that was actually charged (processPayment succeeded) but whose capture call then
  // failed — network blip, server error, session expiry. This must never look like an ordinary
  // decline: retrying the normal way would create a brand-new PaymentIntent and charge the card
  // again. While this is set, chargeM2 resumes/retries capturing THIS SAME intent instead.
  const pendingCapture = useRef<{ paymentIntentId: string; amount: number } | null>(null);

  const captureWithRetry = async (paymentIntentId: string, attempts = 3): Promise<void> => {
    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
      try {
        const capture = await fetch("/api/payments/terminal/capture-payment-intent", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId }),
        });
        if (!capture.ok) throw new Error((await capture.json()).error ?? "Capture failed");
        return;
      } catch (err) {
        lastErr = err;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
    throw lastErr;
  };

  const chargeM2 = async (amount: number) => {
    const o = opts.current;
    const cents = Math.round(amount * 100);
    if (cents <= 0) return o.say("NOTHING DUE", "error");
    if (!term.current || !reader.current) return connectM2();

    // Resume a prior charge whose capture failed — never create a new PaymentIntent while one is
    // outstanding, or the customer could be charged twice for one sale. This does NOT check that
    // `amount` matches the pending charge: the card was already charged for that pending amount
    // regardless of what's being asked for now, so there is no safe way to "start fresh" — the
    // only thing a mismatched amount here means is the ticket total changed while a charge was
    // still unresolved, which must be sorted out (checked in Stripe / with support) before any
    // new charge attempt, not silently bypassed by tapping CARD again with a different total.
    if (pendingCapture.current) {
      const { paymentIntentId, amount: pendingAmount } = pendingCapture.current;
      setStatus("processing");
      o.say("FINISHING THE PREVIOUS CHARGE — DO NOT CHARGE AGAIN…", "info");
      try {
        await captureWithRetry(paymentIntentId);
        pendingCapture.current = null;
        setStatus("ready");
        o.send("kiosk_checkout_payment_result", { success: true, total: pendingAmount, appointmentId: o.ticketId, ...o.settlementAfter(pendingAmount) });
        o.onPaid("m2", pendingAmount, null, paymentIntentId);
      } catch (err: any) {
        setStatus("ready");
        o.onFailed(`Still couldn't confirm that charge (${err?.message ?? "capture failed"}). DO NOT charge the card again — check Stripe or contact support before retrying.`);
      }
      return;
    }

    setStatus("collecting");
    o.send("kiosk_checkout_await_payment", { mode: "m2", total: amount, appointmentId: o.ticketId, ...o.settlementAfter(amount) });
    try {
      const piRes = await fetch("/api/payments/terminal/create-payment-intent", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents, currency: "usd", appointmentId: o.ticketId, nailCheckout: true,
          clientName: o.clientName, method: "m2", ...o.context() }),
      });
      if (!piRes.ok) throw new Error((await piRes.json()).error ?? "Failed to create payment intent");
      const { clientSecret, paymentIntentId } = await piRes.json();
      const collect = await term.current.collectPaymentMethod(clientSecret);
      if (collect.error) throw new Error(collect.error.message);
      setStatus("processing");
      const processed = await term.current.processPayment(collect.paymentIntent);
      if (processed.error) throw new Error(processed.error.message);
      // The card is charged from here on — a capture failure past this point must never be
      // treated like an ordinary decline (see pendingCapture above).
      const cardPresent = processed.paymentIntent?.payment_method_details?.card_present;
      const last4 = cardPresent?.last4 ?? null;
      try {
        await captureWithRetry(paymentIntentId);
      } catch (captureErr: any) {
        pendingCapture.current = { paymentIntentId, amount };
        setStatus("ready");
        o.send("kiosk_checkout_payment_result", { success: false, error: "Capture failed", appointmentId: o.ticketId });
        o.onFailed(`Card was charged but we couldn't confirm it with the server (${captureErr?.message ?? "capture failed"}). DO NOT charge again — tap CARD once more to retry saving this same charge.`);
        return;
      }
      setStatus("ready");
      o.send("kiosk_checkout_payment_result", { success: true, total: amount, last4: last4 ?? "????", appointmentId: o.ticketId, ...o.settlementAfter(amount) });
      o.onPaid("m2", amount, last4, paymentIntentId, cardPresent ? {
        brand: cardPresent.brand, last4: cardPresent.last4,
        entryMethod: cardPresent.read_method, paymentIntentId,
        approvalCode: cardPresent.receipt?.authorization_code ?? cardPresent.receipt?.authorization_response_code ?? null,
      } : undefined);
    } catch (err: any) {
      setStatus("ready");
      term.current?.cancelCollectPaymentMethod?.().catch(() => {});
      o.send("kiosk_checkout_payment_result", { success: false, error: err?.message, appointmentId: o.ticketId });
      o.onFailed(err?.message ?? "Payment failed");
    }
  };

  const frontdesk = (payload: Record<string, unknown>) => {
    if (frontdeskLock.current) return;
    frontdeskLock.current = true;
    const base = Number(payload.amountDueBeforeTip);
    frontdeskBaseCents.current = Number.isFinite(base) ? Math.round(base * 100) : null;
    setAwaitingFrontdesk(true);
    opts.current.send("kiosk_checkout_tip_request", payload);
    opts.current.say("TIP AND CARD PAYMENT SENT TO FRONT DESK", "info");
  };

  /** Staff stop waiting on the front desk (customer walked off, screen never showed it): the POS is usable again. */
  const cancelFrontdesk = () => {
    if (!awaitingFrontdesk) return;
    frontdeskLock.current = false;
    setAwaitingFrontdesk(false);
    setWatchingRemote(true);
    if (watchTimer.current) clearTimeout(watchTimer.current);
    watchTimer.current = setTimeout(() => setWatchingRemote(false), 120_000);
    opts.current.send("kiosk_checkout_tip_cancel", { appointmentId: opts.current.ticketId });
  };

  return {
    native, status, nativeBusy, awaitingFrontdesk, frontdesk, cancelFrontdesk, onSocket,
    /** The CARD button: the M2 reader. */
    m2: (amount: number) => (native ? bridge("M2_PAY", amount) : void chargeM2(amount)),
    busy: nativeBusy !== null || awaitingFrontdesk || status === "loading" || status === "discovering" || status === "connecting" || status === "collecting" || status === "processing",
  };
}
