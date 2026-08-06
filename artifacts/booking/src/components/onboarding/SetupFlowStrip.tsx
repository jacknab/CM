/**
 * Three focused onboarding cards shown at the top of /manage.
 *
 * The visual treatment mirrors the product's setup reference while keeping
 * completion state and navigation backed by the existing setup-progress API.
 */
import { useNavigate } from "react-router-dom";
import {
  Check,
  ChevronRight,
  CreditCard,
  Globe,
  ShoppingBag,
} from "lucide-react";
import { useSetupProgress, type FlowProgress } from "@/hooks/use-setup-progress";
import { cn } from "@/lib/utils";

interface FlowDef {
  title: string;
  description: string;
  body: string;
  icon: React.ElementType;
  accent: string;
  art: "services" | "booking" | "payments";
  to: string;
  flowKeys: string[];
}

const FLOW_DEFS: FlowDef[] = [
  {
    title: "Add your services",
    description: "Services",
    body: "Set your prices, upload photos, and build a service menu that sells itself.",
    icon: ShoppingBag,
    accent: "#ff7a35",
    art: "services",
    to: "/setup/service-import",
    flowKeys: ["services_menu"],
  },
  {
    title: "Get discovered and booked online",
    description: "Online booking",
    body: "Claim your URL and launch a booking site that helps clients book in 30 seconds.",
    icon: Globe,
    accent: "#7042d7",
    art: "booking",
    to: "/online-booking",
    flowKeys: ["booking_calendar"],
  },
  {
    title: "Start getting paid",
    description: "Payments",
    body: "Accept payments, take deposits, and boost revenue by 65% on average.",
    icon: CreditCard,
    accent: "#3f73d5",
    art: "payments",
    to: "/setup/payments",
    flowKeys: ["pos_payments"],
  },
];

type CardStatus = "not_started" | "in_progress" | "complete";

function resolveCardStatus(flows: FlowProgress[], flowKeys: string[]): CardStatus {
  const relevant = flows.filter((flow) => flowKeys.includes(flow.key));
  if (!relevant.length) return "not_started";
  if (relevant.every((flow) => flow.status === "complete" || flow.status === "skipped")) {
    return "complete";
  }
  if (relevant.some((flow) => flow.status !== "not_started")) return "in_progress";
  return "not_started";
}

function DeviceArt({ art }: { art: FlowDef["art"] }) {
  if (art === "services") {
    return (
      <div className="relative h-36 w-24 rotate-[-13deg] rounded-[16px] border-[5px] border-slate-700/80 bg-slate-900 p-1.5 shadow-2xl">
        <div className="h-full rounded-[9px] bg-orange-100 p-2">
          <div className="mb-2 h-1.5 w-8 rounded-full bg-orange-300" />
          <div className="grid grid-cols-2 gap-1.5">
            {Array.from({ length: 4 }).map((_, index) => (
              <span key={index} className="h-7 rounded-md bg-white/85 shadow-sm" />
            ))}
          </div>
          <div className="mt-2 h-1.5 w-10 rounded-full bg-orange-200" />
        </div>
        <div className="absolute -bottom-5 left-[-10px] h-8 w-11 rounded-b-xl border-x-4 border-b-4 border-slate-700/80 bg-slate-800/70" />
      </div>
    );
  }

  if (art === "booking") {
    return (
      <div className="relative h-40 w-[82px] rotate-[5deg] rounded-[17px] border-[5px] border-slate-800/90 bg-slate-950 p-1.5 shadow-2xl">
        <div className="absolute left-1/2 top-0.5 h-2 w-8 -translate-x-1/2 rounded-b-md bg-slate-800" />
        <div className="h-full rounded-[10px] bg-violet-100 px-2 pt-6">
          <div className="mb-3 h-2 w-10 rounded-full bg-violet-300" />
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={index} className="h-5 rounded-md bg-white/85 shadow-sm" />
            ))}
          </div>
          <div className="mx-auto mt-3 h-5 w-5 rounded-full bg-violet-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-36 w-28">
      <div className="absolute left-1 top-8 h-16 w-24 rotate-[24deg] rounded-xl border border-white/30 bg-blue-200/90 shadow-2xl" />
      <div className="absolute left-8 top-3 h-16 w-24 rotate-[24deg] rounded-xl border border-white/30 bg-blue-100 shadow-2xl">
        <span className="absolute bottom-3 left-3 h-3 w-5 rounded-sm bg-blue-300" />
      </div>
      <div className="absolute bottom-1 right-0 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-blue-500 shadow-lg">
        <Check className="h-5 w-5 text-white" strokeWidth={3} />
      </div>
    </div>
  );
}

function FlowCard({ def, status }: { def: FlowDef; status: CardStatus }) {
  const navigate = useNavigate();
  const Icon = def.icon;
  const isComplete = status === "complete";
  const ctaLabel = isComplete ? "Done" : status === "in_progress" ? "Continue" : "Start";

  return (
    <button
      type="button"
      onClick={() => navigate(def.to)}
      className="group flex min-h-[294px] overflow-hidden rounded-[13px] border border-slate-200 bg-white text-left shadow-[0_2px_6px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-800 focus-visible:ring-offset-2"
    >
      <div
        className="relative flex w-[44%] shrink-0 items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(145deg, ${def.accent} 0%, ${def.accent}dd 52%, ${def.accent} 100%)` }}
      >
        <div className="absolute -bottom-12 -left-12 h-36 w-36 rounded-full border border-white/15 bg-white/10" />
        <div className="absolute -right-12 top-8 h-32 w-32 rounded-full border border-white/15 bg-white/10" />
        <div className="absolute left-5 top-12 h-8 w-8 rounded-full border border-white/25 bg-white/10" />
        <DeviceArt art={def.art} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col px-5 py-6">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50"
          style={{ color: def.accent }}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </div>
        <h3 className="mt-4 max-w-[160px] text-[16px] font-bold leading-[1.16] tracking-[-0.02em] text-slate-900">
          {def.title}
        </h3>
        <p className="mt-3 text-[12px] leading-[1.55] text-slate-600">{def.body}</p>
        <span
          className={cn(
            "mt-auto inline-flex w-fit items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[12px] font-bold text-white transition-colors group-hover:bg-slate-700",
            isComplete && "bg-emerald-700 group-hover:bg-emerald-600",
          )}
        >
          {ctaLabel}
          {isComplete ? (
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      </div>
    </button>
  );
}

export function SetupFlowStrip() {
  const { data, isLoading } = useSetupProgress();

  if (isLoading || !data) return null;

  const statuses = FLOW_DEFS.map((def) => resolveCardStatus(data.flows, def.flowKeys));
  const completed = statuses.filter((status) => status === "complete").length;

  return (
    <section className="mb-8 rounded-[15px] border border-slate-200 bg-[linear-gradient(135deg,#fbfbfd_0%,#f7f7fa_100%)] p-5 shadow-[0_2px_8px_rgba(15,23,42,0.02)] md:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-[25px] font-bold tracking-[-0.035em] text-slate-900 md:text-[27px]">Let’s get started</h2>
          <p className="mt-1 text-[13px] text-slate-700">You’re just 3 steps away from more bookings,</p>
        </div>

        <div className="flex items-center gap-3 md:min-w-[390px] md:justify-end">
          <div className="flex flex-1 items-center">
            {statuses.map((status, index) => (
              <div key={index} className="flex flex-1 items-center last:flex-none">
                <div
                  className={cn(
                    "relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                    status === "complete" ? "border-[#c89916] bg-[#d4a51d]" : "border-slate-200 bg-[#d8dce4]",
                  )}
                >
                  {status === "complete" && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </div>
                {index < statuses.length - 1 && (
                  <div className="mx-1 h-[3px] flex-1 overflow-hidden rounded-full bg-slate-300">
                    <div className={cn("h-full rounded-full bg-[#c89916] transition-all", status === "complete" ? "w-full" : "w-0")} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <span className="shrink-0 text-[12px] font-semibold text-slate-800">{completed}/3 completed</span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {FLOW_DEFS.map((def, index) => (
          <FlowCard key={def.title} def={def} status={statuses[index]} />
        ))}
      </div>
    </section>
  );
}