import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Real card charging for the Nail POS checkout — the same three routes the calendar's checkout sheet uses:
 *   • native Android app → the device bridge (M2_PAY / TAP_TO_PAY), which reports back with `certxa_native_*` window events
 *   • web + Stripe Terminal M2 reader → connect once, then create / collect / process / capture a PaymentIntent
 *   • web + paired /frontdesk tablet → "Tap to Pay": the customer's tablet collects the card, we hear the result over the socket
 * A charge only becomes a tender through `onPaid`, i.e. after the money has actually moved.
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
  onPaid: (kind: CardKind, amount: number, last4?: string | null, paymentIntentId?: string | null) => void;
  /** What is still owed once `paid` is taken, and what the sale will have taken in all — told to the customer's screen so a part-payment doesn't read "Payment successful". */
  settlementAfter: (paid: number) => { remaining: number; paidTotal: number };
  onFailed: (message: string) => void;
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
  const [awaitingTap, setAwaitingTap] = useState(false);
  const tapAmount = useRef(0);
  const term = useRef<any>(null);
  const reader = useRef<any>(null);
  const seenIntents = useRef(new Set<string>());

  // Native bridge results (and failures) for THIS ticket.
  useEffect(() => {
    if (!native) return;
    const done = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (Number(d.appointmentId) !== opts.current.ticketId) return;
      d.handledBySheet = true; // tell any page-level handler this checkout owns the payment
      const key = d.paymentIntentId ? String(d.paymentIntentId) : "";
      if (key) { if (seenIntents.current.has(key)) return; seenIntents.current.add(key); }
      const amount = Number(d.amount) || 0;
      if (amount <= 0) return;
      setNativeBusy(null);
      opts.current.send("kiosk_checkout_payment_result", { success: true, total: amount, last4: d.last4, appointmentId: opts.current.ticketId, ...opts.current.settlementAfter(amount) });
      opts.current.onPaid(d.method === "tap_to_pay" ? "tap" : "m2", amount, d.last4 ? String(d.last4) : null, d.paymentIntentId ? String(d.paymentIntentId) : null);
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

  // The customer's tablet reported a card result (Tap to Pay collected on their screen).
  const onSocket = useCallback((msg: any) => {
    if (msg?.type !== "kiosk_checkout_payment_result") return;
    const o = opts.current;
    if (msg.via === "client_confirm") {
      // The customer confirmed the tip on their screen and the native bridge ran there.
      if (msg.success) { const paid = Number(msg.total) || 0; if (paid > 0) o.onPaid(msg.method === "m2" ? "m2" : "tap", paid, msg.last4 ?? null); }
      else o.onFailed(msg.error ? String(msg.error) : "Card declined");
    } else if (tapAmount.current > 0) {
      // A tap the POS itself asked the tablet to collect (the M2 flow echoes this event too — its ref stays 0).
      const asked = tapAmount.current;
      tapAmount.current = 0; setAwaitingTap(false);
      if (msg.success) o.onPaid("tap", Number(msg.total) || asked, msg.last4 ?? null);
      else o.onFailed(msg.error ? String(msg.error) : "Card declined");
    }
  }, []);

  const bridge = (type: "M2_PAY" | "TAP_TO_PAY", amount: number) => {
    const o = opts.current;
    const cents = Math.round(amount * 100);
    if (cents <= 0) return o.say("NOTHING DUE", "error");
    if (nativeBusy) return;
    // Never mark the button busy for a message that cannot be delivered — it would stay on "CHARGING…" with no way out.
    if (bridgeState() !== "app") return o.onFailed("The Certxa app connection isn't ready. Close and reopen the app, then try again.");
    setNativeBusy(type === "M2_PAY" ? "m2" : "tap");
    (window as any).ReactNativeWebView.postMessage(JSON.stringify({
      type, appointmentId: o.ticketId, amountCents: cents, clientName: o.clientName, ...o.context(),
    }));
    o.say(type === "M2_PAY" ? "M2 READER — INSERT / TAP CARD" : "TAP TO PAY — HOLD CARD OR PHONE TO THIS DEVICE", "info");
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

  const chargeM2 = async (amount: number) => {
    const o = opts.current;
    const cents = Math.round(amount * 100);
    if (cents <= 0) return o.say("NOTHING DUE", "error");
    if (!term.current || !reader.current) return connectM2();
    setStatus("collecting");
    o.send("kiosk_checkout_await_payment", { mode: "m2", total: amount, appointmentId: o.ticketId, ...o.settlementAfter(amount) });
    try {
      const piRes = await fetch("/api/payments/terminal/create-payment-intent", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents, currency: "usd" }),
      });
      if (!piRes.ok) throw new Error((await piRes.json()).error ?? "Failed to create payment intent");
      const { clientSecret, paymentIntentId } = await piRes.json();
      const collect = await term.current.collectPaymentMethod(clientSecret);
      if (collect.error) throw new Error(collect.error.message);
      setStatus("processing");
      const processed = await term.current.processPayment(collect.paymentIntent);
      if (processed.error) throw new Error(processed.error.message);
      const capture = await fetch("/api/payments/terminal/capture-payment-intent", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId }),
      });
      if (!capture.ok) throw new Error((await capture.json()).error ?? "Capture failed");
      const last4 = processed.paymentIntent?.payment_method_details?.card_present?.last4 ?? null;
      setStatus("ready");
      o.send("kiosk_checkout_payment_result", { success: true, total: amount, last4: last4 ?? "????", appointmentId: o.ticketId, ...o.settlementAfter(amount) });
      o.onPaid("m2", amount, last4, paymentIntentId);
    } catch (err: any) {
      setStatus("ready");
      term.current?.cancelCollectPaymentMethod?.().catch(() => {});
      o.send("kiosk_checkout_payment_result", { success: false, error: err?.message, appointmentId: o.ticketId });
      o.onFailed(err?.message ?? "Payment failed");
    }
  };

  /** Web + paired tablet: ask the customer's screen to collect the tap. A second press cancels. */
  const tapOnCustomerScreen = (amount: number) => {
    const o = opts.current;
    if (awaitingTap) {
      tapAmount.current = 0; setAwaitingTap(false);
      o.send("kiosk_checkout_cancel"); o.say("TAP TO PAY CANCELLED", "info");
      return;
    }
    if (amount <= 0) return o.say("NOTHING DUE", "error");
    tapAmount.current = amount; setAwaitingTap(true);
    o.send("kiosk_checkout_await_payment", { mode: "tap", total: amount, appointmentId: o.ticketId, ...o.settlementAfter(amount) });
    o.say(`TAP TO PAY SENT TO CUSTOMER SCREEN · ${money(amount)}`, "info");
  };

  return {
    native, status, nativeBusy, awaitingTap, onSocket,
    /** The M2 reader button. */
    m2: (amount: number) => (native ? bridge("M2_PAY", amount) : void chargeM2(amount)),
    /** The Tap to Pay button: on this device (native app) or on the customer's tablet (web + dual screen). */
    tap: (amount: number) => (native ? bridge("TAP_TO_PAY", amount) : tapOnCustomerScreen(amount)),
    /** Tap to Pay is offered in the native app, or on the web when a customer tablet is paired. */
    tapAvailable: native || o.dualScreen,
    busy: nativeBusy !== null || awaitingTap || status === "loading" || status === "discovering" || status === "connecting" || status === "collecting" || status === "processing",
  };
}
