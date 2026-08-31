/**
 * CompleteBooking — the page a caller lands on from the AI receptionist's
 * "complete your booking" SMS link (/complete-booking/:token).
 *
 * The appointment already exists as a hidden, payment-pending hold (created
 * by aiReceptionist.ts's createBookingViaBookingRules when the store
 * requires a deposit or card-on-file). This page collects whichever one is
 * required via Stripe Elements, then calls the complete endpoint, which
 * unhides the appointment so it shows up on the salon's Calendar.
 *
 * Mirrors the public-booking themes' inline Stripe payment step (see
 * ClassicTheme.tsx's PaymentForm) but scoped to an existing appointment via
 * a one-time token instead of a fresh booking-in-progress.
 */
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Lock, CheckCircle2, CalendarX, ArrowLeft } from "lucide-react";
import { formatInTz } from "@/lib/timezone";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";

interface ValidateResponse {
  requirement: "deposit" | "card_on_file";
  depositAmountCents: number | null;
  storeName: string;
  serviceName: string;
  appointmentDate: string;
  duration: number;
  timezone: string;
  stripePublishableKey: string | null;
  stripeConnectedAccountId: string | null;
}

function PaymentForm({
  requirement,
  depositAmountCents,
  onSuccess,
  onError,
}: {
  requirement: "deposit" | "card_on_file";
  depositAmountCents: number | null;
  onSuccess: (info: { stripeSetupIntentId?: string; stripePaymentIntentId?: string }) => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (requirement === "card_on_file") {
        const result = await stripe.confirmSetup({
          elements,
          confirmParams: { return_url: window.location.href },
          redirect: "if_required",
        });
        if (result.error) throw new Error(result.error.message);
        onSuccess({ stripeSetupIntentId: result.setupIntent?.id });
      } else {
        const result = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: window.location.href },
          redirect: "if_required",
        });
        if (result.error) throw new Error(result.error.message);
        onSuccess({ stripePaymentIntentId: result.paymentIntent?.id });
      }
    } catch (err: any) {
      const message = err?.message ?? "Payment failed. Please try again.";
      setError(message);
      onError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting || !stripe}>
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
        {requirement === "card_on_file"
          ? "Save Card & Confirm Booking"
          : `Pay $${((depositAmountCents ?? 0) / 100).toFixed(2)} & Confirm`}
      </Button>
    </div>
  );
}

export default function CompleteBooking() {
  const { token } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ValidateResponse | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(false);

  // Step 1: validate the token, load its context.
  useEffect(() => {
    if (!token) {
      setError("No link provided");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/public/booking-payment-link/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "This link is no longer valid.");
        } else {
          setInfo(data);
        }
      } catch {
        setError("This link is no longer valid.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Step 2: once we know the requirement, load Stripe and create the intent.
  useEffect(() => {
    if (!info?.stripePublishableKey || !token) return;
    (async () => {
      const opts: any = {};
      if (info.stripeConnectedAccountId) opts.stripeAccount = info.stripeConnectedAccountId;
      const s = await loadStripe(info.stripePublishableKey!, opts);
      if (s) setStripeInstance(s);

      const path = info.requirement === "card_on_file"
        ? "/api/public/booking-payment-link/setup-intent"
        : "/api/public/booking-payment-link/payment-intent";
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not start payment. Please try again.");
        return;
      }
      setClientSecret(data.clientSecret);
    })();
  }, [info, token]);

  const handleStripeSuccess = async (result: { stripeSetupIntentId?: string; stripePaymentIntentId?: string }) => {
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch("/api/public/booking-payment-link/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...result }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not confirm your booking. Please try again.");
        setCompleting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Could not confirm your booking. Please try again.");
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0] p-6">
        <Card className="max-w-sm w-full p-6 text-center space-y-3">
          <CalendarX className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0] p-6">
        <Card className="max-w-sm w-full p-6 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h1 className="text-lg font-bold">You're all set!</h1>
          {info && (
            <p className="text-sm text-muted-foreground">
              Your {info.serviceName} appointment at {info.storeName} on{" "}
              {formatInTz(info.appointmentDate, info.timezone, "EEEE, MMM d")} at{" "}
              {formatInTz(info.appointmentDate, info.timezone, "h:mm a")} is confirmed.
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0] p-6">
      <Card className="max-w-sm w-full p-6 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-lg font-bold">Confirm your booking</h1>
          {info && (
            <p className="text-sm text-muted-foreground">
              {info.serviceName} at {info.storeName}
              <br />
              {formatInTz(info.appointmentDate, info.timezone, "EEEE, MMM d 'at' h:mm a")}
            </p>
          )}
        </div>

        {info?.requirement === "deposit" && (
          <div className="rounded-lg bg-violet-50 border border-violet-200 px-4 py-3 text-sm text-violet-800 text-center">
            A ${((info.depositAmountCents ?? 0) / 100).toFixed(2)} deposit is required to hold this time.
          </div>
        )}
        {info?.requirement === "card_on_file" && (
          <div className="rounded-lg bg-violet-50 border border-violet-200 px-4 py-3 text-sm text-violet-800 text-center">
            No charge today — we just need a card on file to hold this time.
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {completing ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : clientSecret && stripeInstance && info ? (
          <Elements stripe={stripeInstance} options={{ clientSecret, appearance: { theme: "stripe" } }}>
            <PaymentForm
              requirement={info.requirement}
              depositAmountCents={info.depositAmountCents}
              onSuccess={handleStripeSuccess}
              onError={setError}
            />
          </Elements>
        ) : (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </Card>
    </div>
  );
}
