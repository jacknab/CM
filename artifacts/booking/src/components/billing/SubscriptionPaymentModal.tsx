/**
 * SubscriptionPaymentModal — embedded Stripe Elements checkout for the
 * owner-facing "pick a plan and subscribe" flow (DashboardBilling.tsx).
 *
 * Mirrors the marketplace's embedded deal checkout: a raw SetupIntent client
 * secret from the server, mounted into a Stripe Payment Element styled with
 * Certxa's own brand tokens — no redirect to a Stripe-hosted page.
 *
 * POST /api/subscription/subscribe always returns a SetupIntent (whether or
 * not a trial applies — see that file's header for why). This form confirms
 * it to verify a card, then calls /api/subscription/finalize-setup to
 * actually create the Stripe Subscription server-side; fulfillment itself
 * happens off the customer.subscription.created webhook from there.
 */

import { useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe as StripeJs, StripeElementsOptions } from "@stripe/stripe-js";
import { Loader2, Lock, CheckCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface SubscriptionPaymentSession {
  clientSecret: string;
  publishableKey: string;
  planName: string;
}

let stripePromiseCache: { key: string; promise: Promise<StripeJs | null> } | null = null;
function getStripePromise(publishableKey: string) {
  if (stripePromiseCache?.key === publishableKey) return stripePromiseCache.promise;
  const promise = loadStripe(publishableKey);
  stripePromiseCache = { key: publishableKey, promise };
  return promise;
}

const stripeAppearance = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "hsl(9 63% 58%)",
    colorBackground: "hsl(0 0% 100%)",
    colorText: "hsl(337 27% 20%)",
    colorDanger: "hsl(4 65% 51%)",
    colorTextSecondary: "hsl(337 15% 45%)",
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: "8px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": { border: "1px solid hsl(220 13% 88%)", boxShadow: "none" },
    ".Input:focus": { border: "1px solid hsl(9 63% 58%)", boxShadow: "0 0 0 1px hsl(9 63% 58%)" },
    ".Label": { color: "hsl(337 27% 20%)", fontWeight: "600", fontSize: "13px" },
  },
};

function InnerForm({
  session,
  onSuccess,
  onCancel,
}: {
  session: SubscriptionPaymentSession;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    if (result.error) {
      setError(result.error.message || "Card verification failed. Please try again.");
      setSubmitting(false);
      return;
    }
    const setupIntentId = result.setupIntent?.id;
    if (!setupIntentId) {
      setError("Card verification did not complete. Please try again.");
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch("/api/subscription/finalize-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ setupIntentId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Could not complete your subscription");
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Could not complete your subscription. Please contact support.");
      setSubmitting(false);
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
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="button" className="flex-1" onClick={submit} disabled={submitting || !stripe}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
          Save card & subscribe
        </Button>
      </div>
    </div>
  );
}

export function SubscriptionPaymentModal({
  session,
  onClose,
  onSuccess,
}: {
  session: SubscriptionPaymentSession | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [done, setDone] = useState(false);

  return (
    <Dialog
      open={!!session}
      onOpenChange={(open) => {
        if (!open) {
          setDone(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{done ? "You're subscribed" : `Subscribe to ${session?.planName ?? "plan"}`}</DialogTitle>
          <DialogDescription>
            {done
              ? "Your subscription is being activated — this usually takes just a moment."
              : "Paid securely via Stripe. Your card details never touch Certxa's servers."}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
            <p className="text-sm text-gray-500">Refreshing your plan…</p>
          </div>
        ) : session ? (
          <Elements
            stripe={getStripePromise(session.publishableKey)}
            options={{ clientSecret: session.clientSecret, appearance: stripeAppearance } as StripeElementsOptions}
          >
            <InnerForm
              session={session}
              onCancel={onClose}
              onSuccess={() => {
                setDone(true);
                onSuccess();
              }}
            />
          </Elements>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
