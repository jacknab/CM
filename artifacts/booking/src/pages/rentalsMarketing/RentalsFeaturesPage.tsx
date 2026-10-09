import { Link } from "react-router-dom";
import { ArrowRight, LayoutGrid, Users, FileText, Wallet, Building2, Check } from "lucide-react";
import RentalsMarketingLayout, { useDocumentMeta } from "./RentalsMarketingLayout";
import { DashboardMockup, SpacesMockup, LeaseMockup } from "./RentalsProductMockups";

export default function RentalsFeaturesPage() {
  useDocumentMeta(
    "Features — Certxa Rentals",
    "See everything Certxa Rentals includes for managing salon booth and suite rentals: spaces, independent professionals, rental agreements, rent tracking, and a facility dashboard.",
  );

  return (
    <RentalsMarketingLayout>
      <PageHero
        eyebrow="Features"
        title="Everything you need to run your booth and suite rentals."
        description="Built specifically around how salon and beauty facility rentals actually work — not adapted from generic property-management software."
      />

      <FeatureSection
        icon={LayoutGrid}
        eyebrow="Spaces"
        title="Organize every suite, booth, and treatment room."
        mockup={<SpacesMockup />}
        points={[
          "Set up each space as a Suite, Booth, Treatment Room, or Other.",
          "Track real-time status: Available, Occupied, Reserved, Maintenance, or Inactive.",
          "Set a base rental rate per space, kept separate from what any one professional actually pays.",
          "Add amenities so professionals and your own team know what each space includes.",
          "Search and filter your full inventory in seconds.",
        ]}
      />

      <FeatureSection
        reverse
        icon={Users}
        eyebrow="Professionals"
        title="Keep independent professionals organized — without treating them like employees."
        mockup={<DashboardMockup />}
        points={[
          "Store business name, business type, and contact information for every renter.",
          "Track status: Active, Pending, Inactive, or Former — without deleting anyone's history.",
          "Professionals are never mixed into your staff, commission, or payroll system — they run their own business.",
          "Search by name, business, contact info, or which space they currently occupy.",
        ]}
      />

      <FeatureSection
        icon={FileText}
        eyebrow="Rental Agreements"
        title="The contract between a professional and a space, done right."
        mockup={<LeaseMockup />}
        points={[
          "Connect a professional to a space with real terms: rent amount, frequency, deposit, and notice period.",
          "Support weekly, biweekly, or monthly rent — plus open-ended, month-to-month agreements.",
          "Automatic lifecycle status — Upcoming, Active, Ending Soon, Ended, or Terminated — derived from the actual dates, never left stale.",
          "The system won't let you double-book a space with overlapping agreements.",
          "Renew into a new agreement without losing the old one's history, or end an agreement early with a reason on record.",
        ]}
      />

      <FeatureSection
        reverse
        icon={Wallet}
        eyebrow="Rent Tracking"
        title="Know what's owed, what's overdue, and what's been paid."
        mockup={<DashboardMockup />}
        points={[
          "Rent charges are generated automatically from each agreement's own terms — no manual math.",
          "See at a glance what's due, overdue, or upcoming for every space and professional.",
          "Record payments as you receive them — cash, check, or other — including partial payments.",
          "Every payment sends an automatic confirmation, and every charge keeps a full payment history.",
        ]}
      />

      <FeatureSection
        icon={Building2}
        eyebrow="Facility Dashboard"
        title="One screen. What's actually happening today."
        mockup={<DashboardMockup />}
        points={[
          "Occupancy at a glance — how many spaces are occupied, available, or upcoming.",
          "Rent status for the whole facility — due, overdue, and upcoming totals.",
          "A Needs Attention section that only shows up when something actually needs it.",
          "Current occupancy, upcoming rent, available spaces, recent payments, and agreements ending soon — all in one place.",
        ]}
      />

      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8">
        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-6">
          <p className="flex items-center justify-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">
            <Check size={13} />
            On the roadmap
          </p>
          <p className="mt-2 text-[13.5px] text-neutral-500">
            Maintenance tracking and deeper reporting are on the way. We build one thing at a time and ship it when
            it's actually ready.
          </p>
        </div>
      </section>

      <FinalCta />
    </RentalsMarketingLayout>
  );
}

function PageHero({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <section className="border-b border-neutral-200 bg-neutral-50 py-16">
      <div className="mx-auto max-w-3xl px-5 text-center md:px-8">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-amber-600">{eyebrow}</p>
        <h1 className="mt-2 font-[Outfit] text-[30px] font-semibold text-neutral-900 md:text-[38px]">{title}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-neutral-500">{description}</p>
      </div>
    </section>
  );
}

function FeatureSection({
  icon: Icon,
  eyebrow,
  title,
  points,
  mockup,
  reverse,
}: {
  icon: typeof LayoutGrid;
  eyebrow: string;
  title: string;
  points: string[];
  mockup: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:px-8">
      <div className={`grid items-center gap-10 md:grid-cols-2 ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}>
        <div>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-100 text-neutral-600">
            <Icon size={17} />
          </div>
          <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-amber-600">{eyebrow}</p>
          <h2 className="mt-1.5 font-[Outfit] text-[22px] font-semibold text-neutral-900 md:text-[26px]">{title}</h2>
          <ul className="mt-4 space-y-2.5">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-neutral-600">
                <Check size={15} className="mt-0.5 flex-shrink-0 text-neutral-400" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div>{mockup}</div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="bg-neutral-950 py-16">
      <div className="mx-auto max-w-2xl px-5 text-center md:px-8">
        <h2 className="font-[Outfit] text-[24px] font-semibold text-white md:text-[28px]">
          Spend less time managing your rentals.
        </h2>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            to="/signup"
            className="flex items-center gap-1.5 rounded-md bg-amber-400 px-5 py-3 text-[14px] font-medium text-neutral-900 transition hover:bg-amber-300"
          >
            Get Started
            <ArrowRight size={15} />
          </Link>
          <Link
            to="/pricing"
            className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-5 py-3 text-[14px] font-medium text-white transition hover:bg-neutral-900"
          >
            See Pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
