import { Link } from "react-router-dom";
import { ArrowRight, LayoutGrid, Users, FileText, Wallet, Building2, Check } from "lucide-react";
import RentalsMarketingLayout, { useDocumentMeta } from "./RentalsMarketingLayout";
import { DashboardMockup, SpacesMockup, LeaseMockup } from "./RentalsProductMockups";

export default function RentalsMarketingHome() {
  useDocumentMeta(
    "Certxa Rentals — Booth & Suite Rental Software for Salons",
    "Certxa Rentals helps salon and beauty facility owners manage the spaces, independent professionals, rental agreements, and rent for their booth and suite rentals — all from one simple dashboard.",
  );

  return (
    <RentalsMarketingLayout>
      {/* Hero */}
      <section className="relative overflow-hidden bg-neutral-950">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:items-center md:px-8 md:py-24">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-[11.5px] font-medium text-amber-400">
              <Building2 size={12} />
              Built for salon booth &amp; suite rentals
            </span>
            <h1 className="mt-5 font-[Outfit] text-[34px] font-semibold leading-[1.15] text-white md:text-[46px]">
              Booth and suite rental, without the rental-management headache.
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-neutral-400">
              Track your spaces, your independent professionals, their rental agreements, and their rent — all in one
              simple platform built for facility owners, not enterprise property managers.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="flex items-center gap-1.5 rounded-md bg-amber-400 px-5 py-3 text-[14px] font-medium text-neutral-900 transition hover:bg-amber-300"
              >
                Get Started
                <ArrowRight size={15} />
              </Link>
              <Link
                to="/how-it-works"
                className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-5 py-3 text-[14px] font-medium text-white transition hover:bg-neutral-900"
              >
                See How It Works
              </Link>
            </div>
          </div>
          <div className="md:pl-6">
            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-[Outfit] text-[26px] font-semibold text-neutral-900 md:text-[32px]">
            Your booth rentals shouldn't live in 10 different places.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-500">
            A spreadsheet for who's in which suite. A group text thread for rent reminders. A sticky note for when
            someone's agreement is ending. Certxa Rentals brings all of it into one place.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {["Spreadsheets", "Text threads", "Sticky notes", "Verbal agreements", "Forgotten due dates", "Scattered contact info"].map((item) => (
            <div key={item} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-4 text-center text-[12.5px] font-medium text-neutral-500">
              {item}
            </div>
          ))}
        </div>
      </section>

      {/* Core features */}
      <section className="bg-neutral-50 py-20">
        <div className="mx-auto max-w-6xl px-5 md:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-[Outfit] text-[26px] font-semibold text-neutral-900 md:text-[32px]">
              Everything you need to run your rentals.
            </h2>
            <p className="mt-4 text-[15px] text-neutral-500">Nothing you don't.</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={LayoutGrid}
              title="Spaces"
              description="Organize every suite, booth, and treatment room you rent out, with real-time status — Available, Occupied, Reserved, Maintenance, or Inactive."
            />
            <FeatureCard
              icon={Users}
              title="Professionals"
              description="Keep every independent professional's business info organized — name, business, contact details, and status. Never mixed into your employee or payroll system."
            />
            <FeatureCard
              icon={FileText}
              title="Rental Agreements"
              description="Connect a professional to a space with real contractual terms: rent, frequency, deposit, notice period, and dates. Renew or end an agreement without losing the history."
            />
            <FeatureCard
              icon={Wallet}
              title="Rent Tracking"
              description="See exactly what's due, overdue, and upcoming for every space. Record payments as you receive them and keep a full payment history per agreement."
            />
            <FeatureCard
              icon={Building2}
              title="Facility Dashboard"
              description="One screen that shows occupancy, rent status, and what actually needs your attention today — not a wall of decorative charts."
            />
            <FeatureCard
              icon={Check}
              title="Built for booth rental"
              description="Modeled around how salon suites and booths actually work: a facility, its spaces, and the independent professionals who rent them."
            />
          </div>
          <div className="mt-10 text-center">
            <Link to="/features" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-neutral-700 hover:text-neutral-900">
              See all features
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* Product screenshots */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:px-8">
        <ScreenshotRow
          eyebrow="Facility Dashboard"
          title="Know what's happening at your facility, at a glance."
          description="Occupancy, rent status, and what needs your attention today — one page, no digging."
          mockup={<DashboardMockup />}
        />
        <ScreenshotRow
          reverse
          eyebrow="Spaces"
          title="Keep every space organized."
          description="Suites, booths, and treatment rooms with a clear status — so you always know what's available and what's occupied."
          mockup={<SpacesMockup />}
        />
        <ScreenshotRow
          eyebrow="Rental Agreements"
          title="See exactly who's renting what, and for how much."
          description="Every agreement shows the professional, the space, the rent, and where it stands in its lifecycle — Upcoming, Active, Ending Soon, or Ended."
          mockup={<LeaseMockup />}
        />
      </section>

      {/* How it works */}
      <section className="bg-neutral-50 py-20">
        <div className="mx-auto max-w-4xl px-5 text-center md:px-8">
          <h2 className="font-[Outfit] text-[26px] font-semibold text-neutral-900 md:text-[32px]">How it works</h2>
          <div className="mt-12 grid gap-8 text-left sm:grid-cols-3">
            <Step number="1" title="Add your spaces" description="Set up every suite, booth, or treatment room you rent out." />
            <Step number="2" title="Add professionals & agreements" description="Connect each independent professional to their space with real rental terms." />
            <Step number="3" title="Manage everything from Today" description="Track occupancy, rent, and what needs your attention — all from one dashboard." />
          </div>
          <Link
            to="/how-it-works"
            className="mt-10 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-neutral-700 hover:text-neutral-900"
          >
            See the full walkthrough
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* Who it's for */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:px-8">
        <h2 className="text-center font-[Outfit] text-[26px] font-semibold text-neutral-900 md:text-[32px]">Who it's for</h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          <WhoCard
            title="Independent Salon Owners"
            description="Renting out one or two extra chairs? Keep it organized without taking on complicated software."
          />
          <WhoCard
            title="Booth & Suite Rental Facilities"
            description="Purpose-built for facilities where independent professionals rent their own space and run their own business."
          />
          <WhoCard
            title="Growing Beauty Facilities"
            description="Replace scattered spreadsheets and text threads with one system as you add more spaces and professionals."
          />
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-neutral-950 py-20">
        <div className="mx-auto max-w-2xl px-5 text-center md:px-8">
          <h2 className="font-[Outfit] text-[28px] font-semibold text-white md:text-[34px]">
            Spend less time managing your rentals.
          </h2>
          <p className="mt-4 text-[15px] text-neutral-400">
            Bring your spaces, professionals, agreements, and rent into one simple platform.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/signup"
              className="flex items-center gap-1.5 rounded-md bg-amber-400 px-5 py-3 text-[14px] font-medium text-neutral-900 transition hover:bg-amber-300"
            >
              Get Started
              <ArrowRight size={15} />
            </Link>
            <Link
              to="/how-it-works"
              className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-5 py-3 text-[14px] font-medium text-white transition hover:bg-neutral-900"
            >
              See How It Works
            </Link>
          </div>
        </div>
      </section>
    </RentalsMarketingLayout>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: typeof LayoutGrid; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-100 text-neutral-600">
        <Icon size={17} />
      </div>
      <p className="mt-3.5 font-[Outfit] text-[15px] font-semibold text-neutral-900">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{description}</p>
    </div>
  );
}

function ScreenshotRow({
  eyebrow,
  title,
  description,
  mockup,
  reverse,
}: {
  eyebrow: string;
  title: string;
  description: string;
  mockup: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className={`mb-20 grid items-center gap-10 last:mb-0 md:grid-cols-2 ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}>
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wide text-amber-600">{eyebrow}</p>
        <h3 className="mt-2 font-[Outfit] text-[22px] font-semibold text-neutral-900 md:text-[26px]">{title}</h3>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-neutral-500">{description}</p>
      </div>
      <div>{mockup}</div>
    </div>
  );
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div>
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 font-[Outfit] text-[13px] font-semibold text-white">
        {number}
      </div>
      <p className="mt-3 font-[Outfit] text-[15px] font-semibold text-neutral-900">{title}</p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-500">{description}</p>
    </div>
  );
}

function WhoCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <p className="font-[Outfit] text-[16px] font-semibold text-neutral-900">{title}</p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-500">{description}</p>
    </div>
  );
}
