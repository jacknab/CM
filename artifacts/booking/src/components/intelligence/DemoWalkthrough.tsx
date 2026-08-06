import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Step {
  tab: string;
  tabLabel: string;
  title: string;
  realityCheck: string;
  body: string;
}

const STEPS: Step[] = [
  {
    tab: "overview",
    tabLabel: "Overview",
    title: "This is your business health — computed minutes ago",
    realityCheck: "Not pre-loaded. Not a simulation. The engines ran live.",
    body: "Every number you see was produced by 8 AI engines that just ran against this business's real appointment history — 6 months of actual bookings, client visits, payments, and cancellations. The growth score, the drift count, the revenue at risk are not examples. They are results.",
  },
  {
    tab: "clients",
    tabLabel: "At-Risk Clients",
    title: "Clients likely to disappear — and exactly why",
    realityCheck: "Each churn score is built from that person's own history, not a population average.",
    body: "Every client in the system has a score calculated from their individual visit cadence, how far past their normal window they are, their personal no-show rate, and time since last visit. This list surfaces the ones whose scores signal the highest drift or churn risk right now. Certxa compares each person against their own baseline — not an industry benchmark.",
  },
  {
    tab: "leakage",
    tabLabel: "Revenue Leakage",
    title: "The exact revenue this business stopped receiving",
    realityCheck: "Each dollar is linked to a specific client. No estimates.",
    body: "Every figure here is traced to a returning client — someone with multiple visits — who was an active spender and stopped coming in. One-time visitors are excluded, since a single visit doesn't establish a pattern. This is not a projection based on industry averages — it's the sum of what those exact returning clients used to pay, calculated from their service history and last known visit.",
  },
  {
    tab: "seats",
    tabLabel: "Dead Seats",
    title: "The calendar's structural weak spots — found automatically",
    realityCheck: "These aren't random slow days. They're chronic patterns with a dollar cost.",
    body: "Certxa scanned 6 months of appointment density by day and hour, looking for slots that are consistently underbooked — not just a bad week. Each gap here has an estimated annual revenue cost attached to it, so you know which ones are worth filling first.",
  },
  {
    tab: "noshow",
    tabLabel: "No-Show Risks",
    title: "Tomorrow's no-shows, identified today",
    realityCheck: "Each risk score is personal — built from that client's own no-show history.",
    body: "Every upcoming appointment is scored using the client's personal cancellation and no-show history, the time of day of the booking, and how far in advance they scheduled. High-risk appointments can be flagged for a reminder SMS before the slot is lost.",
  },
  {
    tab: "rebooking",
    tabLabel: "Rebooking Rates",
    title: "Who builds loyal clients — and who doesn't",
    realityCheck: "Rebooking rate is the loyalty metric most platforms never show you.",
    body: "This is one of the most honest numbers in any service business: what percentage of a client's visits does each staff member turn into a return booking? Certxa tracks it per person, benchmarks it against their own prior 90 days, and shows you the trend — up, down, or stable.",
  },
  {
    tab: "campaigns",
    tabLabel: "Campaigns",
    title: "Audiences built from real client data — not demographic guesses",
    realityCheck: "Every segment is live. Every message uses the client's actual name and history.",
    body: "The segments shown here — lapsed clients, high-value clients drifting, at-risk clients — are generated from this store's real client list right now. When you send a campaign, each SMS is personalized with the client's name and relevant service context. No batch blasting.",
  },
  {
    tab: "forecast",
    tabLabel: "Forecast",
    title: "Where revenue is heading — accounting for the clients you're losing",
    realityCheck: "This isn't an optimistic projection. It factors in current drift.",
    body: "The forecast is calculated from the actual drift rates, LTV patterns, and visit cadences of this business's real client base. It shows the trajectory if nothing changes — and estimates what recovery would look like if lapsed and drifting clients were won back. Honest numbers, not targets.",
  },
];

interface DemoWalkthroughProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  businessType?: string;
}

const SESSION_KEY = "certxa_demo_tour_dismissed";

export function DemoWalkthrough({ activeTab, setActiveTab, businessType }: DemoWalkthroughProps) {
  const [step, setStep]           = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Check sessionStorage on mount
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "true") setDismissed(true);
  }, []);

  // When step changes, switch the tab
  useEffect(() => {
    setActiveTab(STEPS[step].tab);
  }, [step]);

  function dismiss() {
    sessionStorage.setItem(SESSION_KEY, "true");
    setDismissed(true);
  }

  function goNext() {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else dismiss();
  }
  function goPrev() {
    if (step > 0) setStep(s => s - 1);
  }

  if (dismissed) return null;

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white p-5 shadow-sm dark:border-violet-800 dark:from-violet-950/50 dark:to-background">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              Live Demo Tour
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            · Step {step + 1} of {STEPS.length} — {current.tabLabel}
          </span>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Dismiss tour"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground mb-1 leading-snug">
          {current.title}
        </h3>
        <p className="text-xs font-medium text-violet-700 dark:text-violet-300 mb-2 flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3 shrink-0" />
          {current.realityCheck}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {current.body}
        </p>
      </div>

      {/* Step dots + navigation */}
      <div className="flex items-center justify-between gap-4">
        {/* Dot indicators */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`rounded-full transition-all ${
                i === step
                  ? "w-5 h-2 bg-violet-600"
                  : "w-2 h-2 bg-violet-200 dark:bg-violet-800 hover:bg-violet-400"
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Nav buttons */}
        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button variant="ghost" size="sm" onClick={goPrev} className="gap-1 h-8 px-3 text-xs">
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          )}
          <Button
            size="sm"
            onClick={goNext}
            className="gap-1 h-8 px-4 text-xs bg-violet-600 hover:bg-violet-700 text-white"
          >
            {isLast ? "Finish tour" : "Next"}
            {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
