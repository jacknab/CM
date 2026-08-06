/**
 * /setup/marketing — Marketing & Growth onboarding flow
 * A sub-checklist style flow: each card links to an existing feature page.
 */
import { useNavigate } from "react-router-dom";
import { Globe, Star, Bell, BarChart2, ShoppingBag, ExternalLink, Check } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useUpdateFlowStatus } from "@/hooks/use-setup-progress";

interface MarketingCard {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  cta: string;
  to: string;
  external?: boolean;
}

const CARDS: MarketingCard[] = [
  {
    icon: Globe,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    title: "Launch your website",
    description: "Pick a template, and Certxa auto-fills your salon name, hours, services, and booking link. Publish in one click.",
    cta: "Open Website Builder",
    to: "/website-builder/",
    external: true,
  },
  {
    icon: BarChart2,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "Connect Google Business Profile",
    description: "Sync your hours, services, and photos to Google so clients can find and book you from search.",
    cta: "Connect Google",
    to: "/google-business",
  },
  {
    icon: Bell,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    title: "Enable appointment reminders",
    description: "Send automatic SMS and email reminders to reduce no-shows. Clients love the heads-up.",
    cta: "Set Up Reminders",
    to: "/notifications",
  },
  {
    icon: Star,
    iconBg: "bg-yellow-100",
    iconColor: "text-yellow-600",
    title: "Collect Google reviews",
    description: "Automatically ask happy clients for a Google review after their appointment.",
    cta: "Configure Reviews",
    to: "/reviews",
  },
  {
    icon: ShoppingBag,
    iconBg: "bg-rose-100",
    iconColor: "text-rose-600",
    title: "Enable loyalty rewards",
    description: "Give clients points for every visit and redeem them for discounts — keeps them coming back.",
    cta: "Set Up Loyalty",
    to: "/loyalty",
  },
];

export default function MarketingFlow() {
  const navigate = useNavigate();
  const updateFlow = useUpdateFlowStatus();

  const handleMarkComplete = () => {
    updateFlow.mutate(
      { flowKey: "marketing_growth", status: "complete" },
      { onSuccess: () => navigate("/setup") }
    );
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <button onClick={() => navigate("/setup")} className="text-sm text-slate-500 hover:text-slate-800 transition-colors mb-4 flex items-center gap-1">
            ← Back to Setup
          </button>
          <h1 className="text-2xl font-bold text-slate-800">Marketing & Growth</h1>
          <p className="text-slate-500 text-sm mt-1">
            Get discovered online and keep clients coming back. Each feature is optional — do them in any order.
          </p>
        </div>

        {/* Cards */}
        <div className="space-y-4 mb-8">
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-start gap-4">
                <div className={`w-11 h-11 rounded-xl ${card.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-slate-800 mb-1">{card.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-3">{card.description}</p>
                  <button
                    onClick={() => card.external ? (window.location.href = card.to) : navigate(card.to)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1A0333] bg-[#1A0333]/5 hover:bg-[#1A0333]/10 border border-[#1A0333]/15 px-4 py-2 rounded-lg transition-colors"
                  >
                    {card.cta}
                    {card.external && <ExternalLink className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Complete button */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Done with marketing setup?</p>
            <p className="text-xs text-slate-500 mt-0.5">Mark this as complete even if you skipped some features — you can always revisit them.</p>
          </div>
          <button
            onClick={handleMarkComplete}
            disabled={updateFlow.isPending}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm flex-shrink-0"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            {updateFlow.isPending ? "Saving…" : "Mark Complete"}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
