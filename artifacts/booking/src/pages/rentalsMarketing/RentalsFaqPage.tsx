import { useState } from "react";
import { ChevronDown } from "lucide-react";
import RentalsMarketingLayout, { useDocumentMeta } from "./RentalsMarketingLayout";
import { FinalCta } from "./RentalsFeaturesPage";

// Every answer here is grounded in what's actually built (Phases 1-6). Trial
// length and cancellation policy are not yet decided for this product — see
// the Phase 7 report — so those two answers are deliberately non-committal
// rather than inventing a policy.
const FAQS: { q: string; a: string }[] = [
  {
    q: "What is Certxa Rentals?",
    a: "Certxa Rentals is software for salon and beauty facility owners who rent suites, booths, or treatment rooms to independent professionals. It keeps your spaces, professionals, rental agreements, and rent tracking in one place.",
  },
  {
    q: "Who is Certxa Rentals for?",
    a: "Facility owners and managers renting space to independent beauty professionals — nail technicians, stylists, barbers, estheticians, lash artists, and similar independent renters. It's built for the person managing the rental, not for the renters themselves.",
  },
  {
    q: "Can I manage more than one space?",
    a: "Yes. Add as many suites, booths, or treatment rooms as your facility has, each with its own type, status, and base rate.",
  },
  {
    q: "Can I manage multiple independent professionals?",
    a: "Yes. Each professional's business info, contact details, and status are tracked separately — and kept completely separate from your staff or payroll system, since they're not your employees.",
  },
  {
    q: "Can I track rental agreements and rent amounts?",
    a: "Yes. A rental agreement connects a professional to a space with real terms — rent amount, frequency (weekly, biweekly, or monthly), deposit, and notice period — plus start and end dates, or no end date at all for month-to-month arrangements.",
  },
  {
    q: "Can I track rent that's due, overdue, or paid?",
    a: "Yes. Rent charges are generated automatically from each agreement's terms, and your dashboard shows what's due, overdue, and upcoming at all times.",
  },
  {
    q: "Can I collect rent payments online?",
    a: "Not yet. Today, Certxa Rentals helps you track exactly what's owed and record payments as you receive them — cash, check, or other methods — with an automatic receipt. Online payment collection is on our roadmap.",
  },
  {
    q: "Can I track maintenance requests?",
    a: "Not yet — maintenance tracking is on our roadmap and not available today.",
  },
  {
    q: "Is there a free trial?",
    a: "Rentals pricing and trial terms have not been finalized yet. Create an account to set up your workspace; any billing terms will be shown clearly before a charge is required.",
  },
  {
    q: "Can I cancel anytime?",
    a: "We'll cover billing and cancellation terms with you directly when you get set up — reach out any time with questions.",
  },
];

export default function RentalsFaqPage() {
  useDocumentMeta(
    "FAQ — Certxa Rentals",
    "Answers to common questions about Certxa Rentals, booth and suite rental management software for salon and beauty facility owners.",
  );
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <RentalsMarketingLayout>
      <section className="border-b border-neutral-200 bg-neutral-50 py-16">
        <div className="mx-auto max-w-2xl px-5 text-center md:px-8">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-amber-600">FAQ</p>
          <h1 className="mt-2 font-[Outfit] text-[30px] font-semibold text-neutral-900 md:text-[38px]">
            Frequently asked questions.
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-5 py-16 md:px-8">
        <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
          {FAQS.map((faq, i) => {
            const open = openIndex === i;
            return (
              <div key={faq.q}>
                <button
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  aria-expanded={open}
                >
                  <span className="text-[14px] font-medium text-neutral-800">{faq.q}</span>
                  <ChevronDown size={16} className={`flex-shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {open && <p className="px-5 pb-4 text-[13.5px] leading-relaxed text-neutral-500">{faq.a}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <FinalCta />
    </RentalsMarketingLayout>
  );
}
