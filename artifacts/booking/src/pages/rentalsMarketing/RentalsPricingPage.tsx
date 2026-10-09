import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import RentalsMarketingLayout, { useDocumentMeta } from "./RentalsMarketingLayout";
import { FinalCta } from "./RentalsFeaturesPage";

// Pricing has not been established for this product yet — see the Phase 7
// report for what needs the user's input. Deliberately no dollar figures
// invented here; the page is structured so a real price can drop in later
// without a redesign.

const INCLUDED = [
  "Booth, suite, room, and station management",
  "Independent professional profiles",
  "Rental agreements with rent, deposit, and notice period",
  "Rent tracking — due, overdue, upcoming, and paid",
  "Manual payment recording with automatic receipts",
  "The full facility dashboard",
];

export default function RentalsPricingPage() {
  useDocumentMeta(
    "Pricing — Certxa Rentals",
    "Simple, transparent pricing for Certxa Rentals — booth and suite rental management software for salon and beauty facility owners.",
  );

  return (
    <RentalsMarketingLayout>
      <section className="border-b border-neutral-200 bg-neutral-50 py-16">
        <div className="mx-auto max-w-2xl px-5 text-center md:px-8">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-amber-600">Pricing</p>
          <h1 className="mt-2 font-[Outfit] text-[30px] font-semibold text-neutral-900 md:text-[38px]">
            Simple, transparent pricing.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-500">
            Clear plan details are being finalized. We won't publish a price or limit until the terms are ready.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-md px-5 py-16 md:px-8">
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-[0_20px_60px_-25px_rgba(0,0,0,0.15)]">
          <p className="font-[Outfit] text-[16px] font-semibold text-neutral-900">Certxa Rentals</p>
          <p className="mt-3 font-[Outfit] text-[15px] font-medium text-neutral-400">Pricing coming soon</p>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
            We're finalizing pricing and billing terms. You can create your Rentals workspace now; pricing will be
            presented clearly before any charge is required.
          </p>
          <Link
            to="/signup"
            className="mt-6 block rounded-md bg-neutral-900 px-4 py-3 text-[14px] font-medium text-white transition hover:bg-neutral-800"
          >
            Get Started
          </Link>
          <ul className="mt-7 space-y-2.5 text-left">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px] text-neutral-600">
                <Check size={14} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-6 text-center text-[12.5px] text-neutral-400">
          Have questions about pricing for your facility?{" "}
          <a href="https://certxa.com/contact" className="text-neutral-600 underline hover:text-neutral-900">
            Contact us
          </a>
          .
        </p>
      </section>

      <FinalCta />
    </RentalsMarketingLayout>
  );
}
