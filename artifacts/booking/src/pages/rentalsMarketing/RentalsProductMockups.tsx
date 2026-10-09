import { Building2, LayoutGrid, Users, FileText, Wallet, ArrowRight } from "lucide-react";

// Stylized recreations of the real Certxa Rentals interface — real nav items,
// real status vocabulary (SPACE_STATUS_LABELS / AGREEMENT_LIFECYCLE_LABELS /
// CHARGE_DISPLAY_LABELS from shared/rental*.ts), real section names from the
// Phase 6 dashboard. Not screenshots (no way to capture an authenticated one
// in this environment) and not an invented UI — every label and structure
// here matches what a signed-in owner actually sees. Example names/amounts
// are illustrative placeholders, not real customer data.

function BrowserChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)]">
      <div className="flex items-center gap-1.5 border-b border-neutral-100 bg-neutral-50 px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
        <span className="ml-2 rounded bg-white px-2.5 py-0.5 text-[10.5px] text-neutral-400">rentals.certxa.com</span>
        <span className="ml-auto hidden font-mono text-[8px] uppercase tracking-wider text-neutral-400 sm:block">Product UI · demo data</span>
      </div>
      {children}
    </div>
  );
}

const NAV_ITEMS = [
  { label: "Today", icon: Building2, active: true },
  { label: "Spaces", icon: LayoutGrid },
  { label: "Professionals", icon: Users },
  { label: "Leases", icon: FileText },
  { label: "Rent", icon: Wallet },
];

function MockSidebar() {
  return (
    <div className="hidden w-36 flex-shrink-0 bg-neutral-950 py-3 sm:block">
      <div className="flex items-center gap-1.5 px-3 pb-3">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-400/10 text-amber-400">
          <Building2 size={11} />
        </div>
        <span className="text-[10px] font-semibold text-white">Rentals</span>
      </div>
      {NAV_ITEMS.map((item) => (
        <div
          key={item.label}
          className={`mx-2 mb-0.5 flex items-center gap-1.5 rounded px-2 py-1.5 text-[10.5px] font-medium ${
            item.active ? "bg-neutral-800 text-amber-400" : "text-neutral-500"
          }`}
        >
          <item.icon size={11} />
          {item.label}
        </div>
      ))}
    </div>
  );
}

/** Recreates the Today dashboard: rent status + occupancy + needs-attention. */
export function DashboardMockup() {
  return (
    <BrowserChrome>
      <div className="flex">
        <MockSidebar />
        <div className="flex-1 space-y-3 bg-neutral-50 p-4 sm:p-5">
          <div className="rounded-lg border border-neutral-200 bg-white p-3.5">
            <p className="text-[10px] font-medium text-neutral-400">Overdue</p>
            <p className="font-[Outfit] text-[15px] font-semibold text-rose-600">$275.00</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-neutral-200 bg-white p-3.5">
              <p className="font-[Outfit] text-[13px] font-semibold text-neutral-900">9 of 12 occupied</p>
              <p className="mt-0.5 text-[10.5px] text-neutral-400">3 available</p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-3.5">
              <p className="text-[10px] font-medium text-neutral-400">Needs Attention</p>
              <p className="mt-0.5 text-[11px] text-neutral-600">1 renter overdue · 2 ending soon</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="flex items-center gap-2 border-b border-neutral-100 px-3.5 py-2.5">
              <span className="truncate text-[11.5px] font-medium text-neutral-800">Luxe Nails Studio</span>
              <ArrowRight size={10} className="text-neutral-300" />
              <span className="truncate text-[11.5px] text-neutral-600">Suite 4</span>
              <span className="ml-auto text-[10.5px] text-neutral-400">$275/wk</span>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2.5">
              <span className="truncate text-[11.5px] font-medium text-neutral-800">Marcus Fade Co.</span>
              <ArrowRight size={10} className="text-neutral-300" />
              <span className="truncate text-[11.5px] text-neutral-600">Booth 2</span>
              <span className="ml-auto text-[10.5px] text-neutral-400">$220/wk</span>
            </div>
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}

/** Recreates the Spaces list: real status pills + rows. */
export function SpacesMockup() {
  const rows = [
    { name: "Suite 4", type: "Suite", status: "Occupied", tone: "bg-neutral-800 text-white", rate: "$275" },
    { name: "Booth 2", type: "Booth", status: "Occupied", tone: "bg-neutral-800 text-white", rate: "$220" },
    { name: "Suite 6", type: "Suite", status: "Available", tone: "bg-emerald-50 text-emerald-700", rate: "$300" },
    { name: "Room B", type: "Treatment Room", status: "Maintenance", tone: "bg-rose-50 text-rose-700", rate: "$260" },
  ];
  return (
    <BrowserChrome>
      <div className="flex">
        <MockSidebar />
        <div className="flex-1 bg-neutral-50 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {["All 12", "Available 3", "Occupied 8", "Maintenance 1"].map((label, i) => (
              <span key={label} className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${i === 0 ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-600"}`}>
                {label}
              </span>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            {rows.map((row) => (
              <div key={row.name} className="flex items-center gap-2 border-b border-neutral-100 px-3.5 py-2.5 last:border-b-0">
                <span className="truncate text-[11.5px] font-medium text-neutral-800">{row.name}</span>
                <span className="hidden text-[10.5px] text-neutral-400 sm:block">{row.type}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[9.5px] font-medium ${row.tone}`}>{row.status}</span>
                <span className="w-10 flex-shrink-0 text-right text-[10.5px] text-neutral-400">{row.rate}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}

/** Recreates a Lease/Rental Agreement row: the Professional → Space relationship + rent + lifecycle. */
export function LeaseMockup() {
  const rows = [
    { pro: "Luxe Nails Studio", space: "Suite 4", rate: "$275/week", state: "Active", tone: "text-emerald-700 bg-emerald-500" },
    { pro: "Marcus Fade Co.", space: "Booth 2", rate: "$220/week", state: "Ending Soon", tone: "text-amber-700 bg-amber-500" },
    { pro: "Bella Lashes", space: "Room B", rate: "$260/week", state: "Upcoming", tone: "text-sky-700 bg-sky-500" },
  ];
  return (
    <BrowserChrome>
      <div className="flex">
        <MockSidebar />
        <div className="flex-1 space-y-2 bg-neutral-50 p-4 sm:p-5">
          {rows.map((row) => (
            <div key={row.pro} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[11.5px] font-medium text-neutral-800">{row.pro}</span>
                <ArrowRight size={10} className="flex-shrink-0 text-neutral-300" />
                <span className="truncate text-[11.5px] font-medium text-neutral-700">{row.space}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${row.tone.split(" ")[0]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${row.tone.split(" ")[1]}`} />
                  {row.state}
                </span>
                <span className="text-[10px] text-neutral-400">{row.rate}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </BrowserChrome>
  );
}
