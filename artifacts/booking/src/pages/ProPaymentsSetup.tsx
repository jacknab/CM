/**
 * Card payment setup for the Certxa Pro app (owner, 2026-11-10): Stripe's embedded onboarding
 * (ConnectAccountOnboarding), the same form the website uses, on Certxa's own page. The app opens it in its in-app
 * browser through a one-time link (api-server routes/proPaymentsSetup.ts), signed in for this page only. When the
 * owner finishes or leaves the form, the page syncs the account and hands control back to the app
 * (certxa-pro://payments-setup), which then shows whether cards can be taken.
 */
import { useEffect, useState } from "react";
import { ConnectAccountOnboarding } from "@stripe/react-connect-js";
import { CheckCircle, Loader2 } from "lucide-react";
import { StripeConnectProvider } from "@/components/stripe/StripeConnectProvider";
import { backToApp as returnToApp, useEndAppWebSessionOnClose } from "@/lib/appWebSession";

const APP_RETURN = "certxa-pro://payments-setup?result=return";

type Status = { connected?: boolean; chargesEnabled?: boolean; detailsSubmitted?: boolean; publishableKey?: string | null };

async function call<T>(path: string, method = "GET"): Promise<T> {
  const res = await fetch(path, { method, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || "Something went wrong"), { status: res.status });
  return data as T;
}

export default function ProPaymentsSetup() {
  useEndAppWebSessionOnClose();
  const expiredLink = new URLSearchParams(window.location.search).get("link") === "expired";
  const [status, setStatus] = useState<Status | null>(null);
  const [problem, setProblem] = useState<"" | "signin" | "error">("");
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    call<Status>("/api/payments/stripe/status")
      .then(setStatus)
      .catch((err) => setProblem(err.status === 401 || err.status === 403 ? "signin" : "error"));
  }, []);

  // The form was finished or closed: bring Certxa's copy of the account up to date, then back to the app.
  const finish = async () => {
    setFinishing(true);
    await call("/api/payments/stripe/sync", "POST").catch(() => {});
    returnToApp(APP_RETURN);
  };

  const backButton = (
    <button type="button" onClick={() => returnToApp(APP_RETURN)} className="flex h-12 w-full items-center justify-center rounded-full border border-gray-200 bg-white text-[15px] font-semibold text-gray-900">
      Back to Certxa Pro
    </button>
  );

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#F7F5FB] px-4 py-6">{/* fixed: no site header on this page */}
      <div className="mx-auto max-w-xl space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Set up card payments</h1>
          <p className="mt-1 text-sm text-gray-600">Stripe asks for your details and bank account once. Card payments are paid out to your bank.</p>
        </div>

        {problem === "signin" || (expiredLink && !status) ? (
          <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">{expiredLink ? "This link has expired" : "Open this page from the app"}</h2>
            <p className="text-sm text-gray-600">Open the Certxa Pro app and tap Set up payments again.</p>
            {backButton}
          </div>
        ) : problem === "error" || (status && !status.publishableKey) ? (
          <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-gray-700">Payment setup could not be opened. Please try again from the app.</p>
            {backButton}
          </div>
        ) : !status ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : status.connected && status.chargesEnabled && status.detailsSubmitted ? (
          <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-7 w-7 shrink-0 text-gray-900" />
              <h2 className="text-lg font-semibold text-gray-900">You’re all set</h2>
            </div>
            <p className="text-sm text-gray-700">You can take card payments in the app.</p>
            {backButton}
          </div>
        ) : finishing ? (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-gray-600">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            Taking you back to Certxa Pro…
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl bg-white p-4 shadow-sm">
              <StripeConnectProvider publishableKey={status.publishableKey!}>
                <ConnectAccountOnboarding
                  onExit={() => void finish()}
                  collectionOptions={{ fields: "eventually_due" }}
                  onLoadError={(err) => { console.error("[pro-payments-setup] onboarding load error", err); setProblem("error"); }}
                />
              </StripeConnectProvider>
            </div>
            {backButton}
          </>
        )}
      </div>
    </div>
  );
}
