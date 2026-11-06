/**
 * certxa.com/solo/billing — billing for a Certxa Pro (Solo) account (owner, 2026-11-06; plans/solo-web-dashboard.md).
 *
 * The app's Settings › Billing opens it through a one-time sign-in link (GET /billing/start → here). Billing has to
 * be on the website: Apple lets a US app send people to a website to pay, not take the card in the app.
 * Shows the plan (free Solo or Plus), text credits, the card on file and the payments made. Starting, cancelling or
 * keeping Plus happens on /pro-plus and buying credits on /pro-credits, the pages the app already uses.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { backToApp, useEndAppWebSessionOnClose } from "@/lib/appWebSession";

type Plus = {
  businessName: string | null;
  priceCents: number;
  plus: boolean;
  nextChargeAt: string | null;
  cancelAtPeriodEnd: boolean;
  paymentProblem: boolean;
  card: { brand: string | null; last4: string } | null;
};
type Credits = { credits: number; unlimited: boolean; card: { brand: string | null; last4: string | null } | null };
type Payment = { kind: "plus" | "credits"; date: string; amountCents: number | null; credits?: number; status: string; failure?: string | null };

const APP_RETURN = "certxa-pro://settings";
const PURPLE = "#6D4AE0";

async function call<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || data?.message || "Something went wrong"), { status: res.status });
  return data as T;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const brandName = (brand: string | null) => (brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Card");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

export default function SoloBilling() {
  useEndAppWebSessionOnClose();
  const expiredLink = new URLSearchParams(window.location.search).get("link") === "expired";
  const [plus, setPlus] = useState<Plus | null>(null);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [problem, setProblem] = useState<"" | "signin" | "error">("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [p, c] = await Promise.all([call<Plus>("/api/solo/plus"), call<Credits>("/api/solo/credits")]);
        setPlus(p);
        setCredits(c);
        call<{ items: Payment[] }>("/api/solo/billing/history").then((h) => setPayments(h.items)).catch(() => setPayments([]));
      } catch (err: any) {
        if (err.status === 401 || err.status === 403) setProblem("signin");
        else { setProblem("error"); setMessage(err.message); }
      }
    })();
  }, []);

  const card = plus?.card ?? (credits?.card?.last4 ? { brand: credits.card.brand, last4: credits.card.last4 } : null);

  const backButton = (
    <button type="button" onClick={() => backToApp(APP_RETURN)}
      className="flex h-12 w-full items-center justify-center rounded-full border border-gray-200 bg-white text-[15px] font-semibold text-gray-900">
      Back to Certxa Pro
    </button>
  );

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#F7F5FB] px-4 py-6">{/* fixed: no site header on this page */}
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <h1 className="text-2xl font-semibold text-gray-900">Billing</h1>
          {plus?.businessName && <p className="text-sm text-gray-500">{plus.businessName}</p>}
        </header>

        {problem === "signin" || (expiredLink && !plus) ? (
          <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">{expiredLink ? "This link has expired" : "Open this page from the app"}</h2>
            <p className="text-sm text-gray-600">Open the Certxa Pro app, go to Settings and tap Billing again.</p>
            {backButton}
          </div>
        ) : problem === "error" ? (
          <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-gray-700">{message || "Billing could not be loaded. Please try again."}</p>
            {backButton}
          </div>
        ) : !plus || !credits ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : (
          <>
            <Section title="Your plan">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-lg font-semibold text-gray-900">{plus.plus ? "Plus" : "Solo"}</p>
                <p className="text-sm text-gray-600">{plus.plus ? `${money(plus.priceCents)}/month` : "Free"}</p>
              </div>
              {plus.plus && (
                <p className="text-sm text-gray-700">
                  {plus.paymentProblem
                    ? "Your last payment didn't go through. We'll try your card again soon."
                    : plus.nextChargeAt
                      ? plus.cancelAtPeriodEnd
                        ? `Plus ends on ${longDate(plus.nextChargeAt)}. You won't be charged again.`
                        : `Next payment of ${money(plus.priceCents)} on ${longDate(plus.nextChargeAt)}.`
                      : null}
                </p>
              )}
              {!plus.plus && <p className="text-sm text-gray-700">Plus gives you unlimited text notifications to your clients for {money(plus.priceCents)} a month.</p>}
              <Link to="/pro-plus" state={{ fromBilling: true }}
                className="flex h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold text-white"
                style={{ backgroundColor: PURPLE }}>
                {plus.plus ? "Manage Plus" : "Get Plus"}
              </Link>
            </Section>

            <Section title="Text messages">
              {credits.unlimited ? (
                <p className="text-sm text-gray-700">Unlimited with Plus.</p>
              ) : (
                <>
                  <p className="text-sm text-gray-700"><span className="text-lg font-semibold text-gray-900">{credits.credits}</span> credits left</p>
                  <Link to="/pro-credits" state={{ fromBilling: true }}
                    className="flex h-11 w-full items-center justify-center rounded-full border border-gray-200 text-[15px] font-semibold text-gray-900">
                    Buy credits
                  </Link>
                </>
              )}
            </Section>

            <Section title="Card on file">
              <p className="text-sm text-gray-700">{card ? `${brandName(card.brand)} ending ${card.last4}` : "No card saved"}</p>
            </Section>

            <Section title="Payments">
              {payments === null ? (
                <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
              ) : payments.length === 0 ? (
                <p className="text-sm text-gray-500">No payments yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {payments.map((p, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                      <div>
                        <p className="text-gray-900">{p.kind === "plus" ? "Plus · monthly" : `${p.credits} text credits`}</p>
                        <p className="text-xs text-gray-500">{shortDate(p.date)}</p>
                        {p.status === "failed" && <p className="text-xs text-red-600">Payment failed{p.failure ? `: ${p.failure}` : ""}</p>}
                        {p.status === "refunded" && <p className="text-xs text-gray-500">Refunded</p>}
                      </div>
                      <p className="shrink-0 text-gray-900">{p.amountCents != null ? money(p.amountCents) : ""}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {backButton}
          </>
        )}
      </div>
    </div>
  );
}
