import RentalsMarketingLayout, { useDocumentMeta } from "./RentalsMarketingLayout";
import { DashboardMockup, SpacesMockup, LeaseMockup } from "./RentalsProductMockups";
import { FinalCta } from "./RentalsFeaturesPage";

const STEPS = [
  {
    number: "1",
    title: "Add your spaces",
    description:
      "Set up every suite, booth, or treatment room you rent out. Give each one a name, a type, and a base rate — you can add amenities and notes any time.",
    mockup: <SpacesMockup />,
  },
  {
    number: "2",
    title: "Add your professionals",
    description:
      "Add the independent professionals renting from you — their business name, type, and contact info. They're never treated as employees or mixed into your staff system.",
    mockup: <DashboardMockup />,
  },
  {
    number: "3",
    title: "Create a rental agreement",
    description:
      "Connect a professional to a space with the real terms: rent amount, frequency, deposit, notice period, and dates. Certxa Rentals won't let two agreements overlap on the same space.",
    mockup: <LeaseMockup />,
  },
  {
    number: "4",
    title: "Manage everything from Today",
    description:
      "From here on, your Today dashboard shows occupancy, rent status, and what actually needs your attention — overdue rent, agreements ending soon, and open spaces.",
    mockup: <DashboardMockup />,
  },
];

export default function RentalsHowItWorksPage() {
  useDocumentMeta(
    "How It Works — Certxa Rentals",
    "See how Certxa Rentals works for salon and beauty facility owners: add your spaces and professionals, create rental agreements, then manage everything from one dashboard.",
  );

  return (
    <RentalsMarketingLayout>
      <section className="border-b border-neutral-200 bg-neutral-50 py-16">
        <div className="mx-auto max-w-3xl px-5 text-center md:px-8">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-amber-600">How It Works</p>
          <h1 className="mt-2 font-[Outfit] text-[30px] font-semibold text-neutral-900 md:text-[38px]">
            From spreadsheet to set up in four steps.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-500">
            No migration project, no training course. If you can describe who rents what and for how much, you can
            set this up today.
          </p>
        </div>
      </section>

      {STEPS.map((step, i) => (
        <section key={step.number} className="mx-auto max-w-6xl px-5 py-16 md:px-8">
          <div className={`grid items-center gap-10 md:grid-cols-2 ${i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""}`}>
            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 font-[Outfit] text-[14px] font-semibold text-white">
                {step.number}
              </div>
              <h2 className="mt-4 font-[Outfit] text-[22px] font-semibold text-neutral-900 md:text-[26px]">{step.title}</h2>
              <p className="mt-3 max-w-md text-[14px] leading-relaxed text-neutral-500">{step.description}</p>
            </div>
            <div>{step.mockup}</div>
          </div>
        </section>
      ))}

      <FinalCta />
    </RentalsMarketingLayout>
  );
}
