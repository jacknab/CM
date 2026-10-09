import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import RentalsMarketingLayout, { useDocumentMeta } from "./RentalsMarketingLayout";
import { FinalCta } from "./RentalsFeaturesPage";

const ARTICLES = [
  {
    title: "What to put in a booth or suite rental agreement",
    summary:
      "The terms that actually matter: rent amount and frequency, deposit, notice period, and clear start and end dates. Getting this in writing — and somewhere you can find it later — avoids most disputes before they start.",
  },
  {
    title: "Booth rental vs. commission: how the two models differ",
    summary:
      "Under commission, a stylist is your employee and you split their service revenue. Under booth or suite rental, they're an independent business paying you rent for the space — with their own clients, pricing, and schedule.",
  },
  {
    title: "Signs your rental operations have outgrown a spreadsheet",
    summary:
      "If you're checking three different places to remember who's renting what, texting reminders about rent, or forgetting when someone's agreement is ending — it's usually not a discipline problem, it's a tooling problem.",
  },
];

export default function RentalsResourcesPage() {
  useDocumentMeta(
    "Resources — Certxa Rentals",
    "Practical guidance for salon and beauty facility owners renting booths and suites to independent professionals.",
  );

  return (
    <RentalsMarketingLayout>
      <section className="border-b border-neutral-200 bg-neutral-50 py-16">
        <div className="mx-auto max-w-2xl px-5 text-center md:px-8">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-amber-600">Resources</p>
          <h1 className="mt-2 font-[Outfit] text-[30px] font-semibold text-neutral-900 md:text-[38px]">
            Practical guidance for facility owners.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-500">
            Straightforward answers to the questions that come up when you're renting space to independent
            professionals.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16 md:px-8">
        <div className="space-y-8">
          {ARTICLES.map((article) => (
            <article key={article.title} className="rounded-xl border border-neutral-200 bg-white p-6">
              <h2 className="font-[Outfit] text-[18px] font-semibold text-neutral-900">{article.title}</h2>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-neutral-500">{article.summary}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center">
          <p className="text-[13.5px] text-neutral-500">
            Have a question that's not covered here?{" "}
            <Link to="/faq" className="font-medium text-neutral-700 underline hover:text-neutral-900">
              Check the FAQ
            </Link>{" "}
            or{" "}
            <a href="https://certxa.com/contact" className="font-medium text-neutral-700 underline hover:text-neutral-900">
              reach out to us
            </a>
            .
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link to="/how-it-works" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-neutral-700 hover:text-neutral-900">
            See how Certxa Rentals works
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      <FinalCta />
    </RentalsMarketingLayout>
  );
}
