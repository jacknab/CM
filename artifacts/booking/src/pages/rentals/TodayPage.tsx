import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, DoorOpen, LayoutGrid, Users,
} from "lucide-react";
import RentalsTopBar from "@/components/rentals/RentalsTopBar";
import { RENT_FREQUENCY_LABELS, type RentFrequency } from "@shared/rentalAgreements";

interface OccupancyRow {
  agreementId: number; professionalId: number; professionalName: string; businessName: string | null;
  spaceId: number; spaceName: string; rentAmount: string | null; rentFrequency: string; lifecycle: string;
}
interface AvailableSpaceRow { id: number; name: string; type: string; monthlyRate: string | null }
interface UpcomingRentRow {
  chargeId: number; professionalName: string; businessName: string | null; spaceName: string;
  amount: string; remainingAmount: string; dueDate: string; displayState: string;
}
interface RecentPaymentRow {
  id: number; professionalName: string; businessName: string | null; amount: string; paidAt: string; method: string;
}
interface EndingSoonRow {
  agreementId: number; professionalName: string; businessName: string | null; spaceName: string; endDate: string | null;
}

interface RentalsOverview {
  spaces: { total: number; occupied: number; available: number; reserved: number; maintenance: number; inactive: number };
  professionals: { total: number };
  agreements: { total: number };
  rent: { due: string; overdue: string; upcoming: string };
  attention: {
    overdueChargeCount: number; overdueProfessionalCount: number; endingSoonCount: number;
    availableSpacesCount: number; upcomingMoveInsCount: number;
  };
  currentOccupancy: OccupancyRow[];
  availableSpaces: AvailableSpaceRow[];
  upcomingRent: UpcomingRentRow[];
  recentPayments: RecentPaymentRow[];
  endingSoon: EndingSoonRow[];
}

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TodayPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery<RentalsOverview>({
    queryKey: ["/api/rentals/overview"],
  });

  const hasAttention = !!data && (
    data.attention.overdueChargeCount > 0 || data.attention.endingSoonCount > 0 ||
    data.attention.availableSpacesCount > 0 || data.attention.upcomingMoveInsCount > 0
  );

  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title="Today" />
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-2xl">
          {isLoading ? (
            <div className="h-32 animate-pulse rounded-xl bg-neutral-100" />
          ) : !data ? null : data.spaces.total === 0 && data.professionals.total === 0 ? (
            <SetupState
              title="Your facility is ready to be set up"
              description="Add a space and a professional, then create a rental agreement to start tracking occupancy and rent."
              actions={[
                { label: "Add Space", to: "/rentals/spaces/new", primary: true },
                { label: "Add Professional", to: "/rentals/professionals/new", primary: false },
              ]}
            />
          ) : data.professionals.total === 0 ? (
            <SetupState
              title="Add your first professional"
              description="You have spaces set up — add an independent professional next so you can connect them through a rental agreement."
              actions={[{ label: "Add Professional", to: "/rentals/professionals/new", primary: true }]}
            />
          ) : data.spaces.total === 0 ? (
            <SetupState
              title="Add your first space"
              description="You have professionals on record — add a rentable space next so you can connect them through a rental agreement."
              actions={[{ label: "Add Space", to: "/rentals/spaces/new", primary: true }]}
            />
          ) : data.agreements.total === 0 ? (
            <SetupState
              title="Create your first rental agreement"
              description="Your facility has no current rental relationships yet. Connect a professional to a space to start tracking occupancy and rent."
              actions={[{ label: "Create Rental Agreement", to: "/rentals/leases/new", primary: true }]}
            />
          ) : (
            <div className="space-y-6">
              <RentStatusSection rent={data.rent} onNavigate={(status) => navigate(`/rentals/rent?status=${status}`)} />
              <OccupancySection spaces={data.spaces} onNavigate={(status) => navigate(`/rentals/spaces?status=${status}`)} />
              {hasAttention && <AttentionSection attention={data.attention} navigate={navigate} />}
              <CurrentOccupancySection rows={data.currentOccupancy} />
              <UpcomingRentSection rows={data.upcomingRent} />
              <AvailableSpacesSection rows={data.availableSpaces} />
              <RecentPaymentsSection rows={data.recentPayments} />
              <EndingSoonSection rows={data.endingSoon} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <p className="font-[Outfit] text-[13px] font-semibold text-neutral-500">{title}</p>
      {action}
    </div>
  );
}

// 1. Rent status — the most important operational question, leads the page.
function RentStatusSection({ rent, onNavigate }: { rent: RentalsOverview["rent"]; onNavigate: (status: string) => void }) {
  const hasAny = rent.due !== "0.00" || rent.overdue !== "0.00" || rent.upcoming !== "0.00";
  return (
    <section>
      <SectionHeader title="Rent" />
      {!hasAny ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <p className="text-[13px] text-neutral-500">Nothing due, overdue, or upcoming right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 divide-x divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
          <RentFigure label="Overdue" amount={rent.overdue} tone="rose" onClick={() => onNavigate("overdue")} />
          <RentFigure label="Due" amount={rent.due} tone="amber" onClick={() => onNavigate("due")} />
          <RentFigure label="Upcoming" amount={rent.upcoming} tone="neutral" onClick={() => onNavigate("upcoming")} />
        </div>
      )}
    </section>
  );
}

function RentFigure({ label, amount, tone, onClick }: { label: string; amount: string; tone: "rose" | "amber" | "neutral"; onClick: () => void }) {
  const color = amount === "0.00" ? "text-neutral-300" : tone === "rose" ? "text-rose-600" : tone === "amber" ? "text-amber-600" : "text-neutral-800";
  return (
    <button onClick={onClick} className="flex flex-col items-start gap-1 px-4 py-4 text-left transition hover:bg-neutral-50">
      <span className="text-[12px] font-medium text-neutral-400">{label}</span>
      <span className={`font-[Outfit] text-[18px] font-semibold ${color}`}>${amount}</span>
    </button>
  );
}

// 2. Occupancy — physical facility state, in plain counts, not a percentage-first framing.
function OccupancySection({ spaces, onNavigate }: { spaces: RentalsOverview["spaces"]; onNavigate: (status: string) => void }) {
  return (
    <section>
      <SectionHeader title="Occupancy" />
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <p className="font-[Outfit] text-[16px] font-semibold text-neutral-900">
          {spaces.occupied} of {spaces.total} space{spaces.total === 1 ? "" : "s"} occupied
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-neutral-500">
          {spaces.available > 0 && (
            <button onClick={() => onNavigate("available")} className="hover:text-neutral-700 hover:underline">
              {spaces.available} available
            </button>
          )}
          {spaces.reserved > 0 && (
            <button onClick={() => onNavigate("reserved")} className="hover:text-neutral-700 hover:underline">
              {spaces.reserved} reserved
            </button>
          )}
          {spaces.maintenance > 0 && <span>{spaces.maintenance} in maintenance</span>}
          {spaces.inactive > 0 && <span>{spaces.inactive} inactive</span>}
        </div>
      </div>
    </section>
  );
}

// 3. Attention required — a compact index of what needs action, only shown when something does.
function AttentionSection({
  attention,
  navigate,
}: {
  attention: RentalsOverview["attention"];
  navigate: (to: string) => void;
}) {
  const items: { icon: typeof AlertTriangle; text: string; to: string }[] = [];
  if (attention.overdueProfessionalCount > 0) {
    items.push({
      icon: AlertTriangle,
      text: `${attention.overdueProfessionalCount} professional${attention.overdueProfessionalCount === 1 ? "" : "s"} with overdue rent`,
      to: "/rentals/rent?status=overdue",
    });
  }
  if (attention.endingSoonCount > 0) {
    items.push({
      icon: CalendarClock,
      text: `${attention.endingSoonCount} agreement${attention.endingSoonCount === 1 ? "" : "s"} ending soon`,
      to: "/rentals/leases?status=ending",
    });
  }
  if (attention.upcomingMoveInsCount > 0) {
    items.push({
      icon: Users,
      text: `${attention.upcomingMoveInsCount} upcoming move-in${attention.upcomingMoveInsCount === 1 ? "" : "s"}`,
      to: "/rentals/leases?status=upcoming",
    });
  }
  if (attention.availableSpacesCount > 0) {
    items.push({
      icon: LayoutGrid,
      text: `${attention.availableSpacesCount} space${attention.availableSpacesCount === 1 ? "" : "s"} available to rent`,
      to: "/rentals/spaces?status=available",
    });
  }

  return (
    <section>
      <SectionHeader title="Needs Attention" />
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {items.map((item) => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className="flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-neutral-50"
          >
            <item.icon size={16} className="flex-shrink-0 text-neutral-400" />
            <span className="flex-1 text-[13px] text-neutral-700">{item.text}</span>
            <ArrowRight size={14} className="flex-shrink-0 text-neutral-300" />
          </button>
        ))}
      </div>
    </section>
  );
}

// 4. Current occupancy — the Professional → Space relationship, same visual language as Leases.
function CurrentOccupancySection({ rows }: { rows: OccupancyRow[] }) {
  if (rows.length === 0) return null;
  const visible = rows.slice(0, 6);
  return (
    <section>
      <SectionHeader title="Current Occupancy" action={<Link to="/rentals/leases" className="text-[12px] text-neutral-400 hover:text-neutral-600">View all</Link>} />
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {visible.map((row) => (
          <Link
            key={row.agreementId}
            to={`/rentals/leases/${row.agreementId}`}
            className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-neutral-50"
          >
            <span className="min-w-0 truncate text-[13px] font-medium text-neutral-800">{row.businessName ?? row.professionalName}</span>
            <ArrowRight size={12} className="flex-shrink-0 text-neutral-300" />
            <span className="min-w-0 truncate text-[13px] text-neutral-600">{row.spaceName}</span>
            <span className="flex-1" />
            {row.rentAmount && (
              <span className="flex-shrink-0 text-[12px] text-neutral-400">
                ${row.rentAmount}/{RENT_FREQUENCY_LABELS[row.rentFrequency as RentFrequency]?.toLowerCase() ?? row.rentFrequency}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

// 5. Upcoming rent — already naturally bounded to ~one billing period ahead by charge generation.
function UpcomingRentSection({ rows }: { rows: UpcomingRentRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <SectionHeader title="Upcoming Rent" action={<Link to="/rentals/rent" className="text-[12px] text-neutral-400 hover:text-neutral-600">View all</Link>} />
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {rows.map((row) => (
          <Link
            key={row.chargeId}
            to={`/rentals/rent/${row.chargeId}`}
            className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-neutral-50"
          >
            <span className="min-w-0 truncate text-[13px] font-medium text-neutral-800">{row.businessName ?? row.professionalName}</span>
            <ArrowRight size={12} className="flex-shrink-0 text-neutral-300" />
            <span className="min-w-0 truncate text-[13px] text-neutral-600">{row.spaceName}</span>
            <span className="flex-1" />
            <span className="flex-shrink-0 text-[12px] text-neutral-400">${row.remainingAmount} · {formatDate(row.dueDate)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// 6. Available spaces — the Space's own base rate, never contractual rent.
function AvailableSpacesSection({ rows }: { rows: AvailableSpaceRow[] }) {
  if (rows.length === 0) return null;
  const visible = rows.slice(0, 6);
  return (
    <section>
      <SectionHeader title="Available Spaces" action={<Link to="/rentals/spaces?status=available" className="text-[12px] text-neutral-400 hover:text-neutral-600">View all</Link>} />
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {visible.map((row) => (
          <Link
            key={row.id}
            to={`/rentals/spaces/${row.id}`}
            className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-neutral-50"
          >
            <DoorOpen size={14} className="flex-shrink-0 text-neutral-400" />
            <span className="min-w-0 truncate text-[13px] font-medium text-neutral-800">{row.name}</span>
            <span className="flex-1" />
            <span className="flex-shrink-0 text-[12px] text-neutral-400">{row.monthlyRate ? `$${row.monthlyRate} base rate` : "No base rate set"}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// 7. Recent payments — a quick operational glance, not a full ledger.
function RecentPaymentsSection({ rows }: { rows: RecentPaymentRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <SectionHeader title="Recent Payments" action={<Link to="/rentals/rent" className="text-[12px] text-neutral-400 hover:text-neutral-600">View all</Link>} />
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3 last:border-b-0">
            <CheckCircle2 size={14} className="flex-shrink-0 text-emerald-500" />
            <span className="min-w-0 truncate text-[13px] font-medium text-neutral-800">{row.businessName ?? row.professionalName}</span>
            <span className="flex-1" />
            <span className="flex-shrink-0 text-[12px] text-neutral-400">${row.amount} · {row.method} · {formatDate(row.paidAt)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// 8. Ending soon — reuses Phase 4's own "ending" lifecycle window, no new definition.
function EndingSoonSection({ rows }: { rows: EndingSoonRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <SectionHeader title="Ending Soon" />
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {rows.map((row) => (
          <Link
            key={row.agreementId}
            to={`/rentals/leases/${row.agreementId}`}
            className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-neutral-50"
          >
            <CalendarClock size={14} className="flex-shrink-0 text-amber-500" />
            <span className="min-w-0 truncate text-[13px] font-medium text-neutral-800">{row.businessName ?? row.professionalName}</span>
            <ArrowRight size={12} className="flex-shrink-0 text-neutral-300" />
            <span className="min-w-0 truncate text-[13px] text-neutral-600">{row.spaceName}</span>
            <span className="flex-1" />
            <span className="flex-shrink-0 text-[12px] text-neutral-400">Ends {formatDate(row.endDate)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SetupState({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions: { label: string; to: string; primary: boolean }[];
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 size={20} className="mt-0.5 flex-shrink-0 text-neutral-300" />
        <div>
          <p className="font-[Outfit] text-[15px] font-semibold text-neutral-900">{title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">{description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {actions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className={
                  action.primary
                    ? "rounded-md bg-neutral-900 px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
                    : "rounded-md border border-neutral-200 px-3.5 py-2 text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-50"
                }
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
