import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Sparkles, Receipt, Calendar, Percent, FileText, Star, Users, Scissors, UserCircle, Wallet, HandCoins, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { isProAccount, isHiddenForProAccount } from "@shared/proAccount";

type ReportCard = { title: string; description: string; icon: typeof Sparkles; to: string };

/**
 * Reports home (owner, 2026-10-29): cards grouped by what they are about, each opening its own report page. A report is
 * listed once it is built (no "Coming soon"). Reports still being rebuilt (plans/reports.md) open their tab of the
 * older reports page until their own page replaces it.
 */
const GROUPS: { title: string; cards: ReportCard[] }[] = [
  { title: "Money", cards: [
    { title: "Sales", description: "Net sales, visits, average ticket, discounts, tax, tips and refunds, with when the money comes in", icon: Receipt, to: "/reports/sales" },
    { title: "Payments", description: "Cash, card, card reader and gift card payments, split payments split correctly", icon: Wallet, to: "/reports/payments" },
    { title: "Sales tax", description: "The tax actually charged at checkout, for filing", icon: Percent, to: "/reports/tax" },
    { title: "Tips", description: "Tips by technician: amount, how often, and share of sales", icon: HandCoins, to: "/reports/tips" },
    { title: "Gift cards", description: "Sold, used, and what is still owed on cards", icon: Gift, to: "/reports/gift-cards" },
    { title: "Salon earnings", description: "Revenue and payout breakdown for the salon", icon: Star, to: "/salon-earnings" },
    { title: "Day Close", description: "The Day Close report for any day you choose", icon: FileText, to: "/reports/day-close" },
    { title: "Register reports", description: "Cash drawer counts and register activity history", icon: FileText, to: "/register-reports" },
  ] },
  { title: "Team", cards: [
    { title: "Staff performance", description: "Bookings and revenue by team member", icon: UserCircle, to: "/reports/dashboard?tab=staff" },
    { title: "Commission earnings", description: "Breakdown of earnings to support commission payouts", icon: FileText, to: "/commission-report" },
  ] },
  { title: "Clients", cards: [
    { title: "Client activity", description: "Client counts, retention, and no-show risk", icon: Users, to: "/reports/dashboard?tab=customers" },
  ] },
  { title: "Operations", cards: [
    { title: "Appointments", description: "Appointment history: completed, cancelled, no-shows", icon: Calendar, to: "/reports/dashboard?tab=appointments" },
    { title: "Service performance", description: "Bookings and revenue by service", icon: Scissors, to: "/reports/dashboard?tab=services" },
  ] },
  { title: "Something else", cards: [
    { title: "Create a custom report", description: "Ask your Growth Analyst for any custom report", icon: Sparkles, to: "/support" },
  ] },
];

export default function ReportsHub() {
  const { user: authUser } = useAuth();
  const proAccount = isProAccount((authUser as any)?.accountType);
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Reports</h1>
        <div className="space-y-8">
          {GROUPS.map((group) => {
            const cards = group.cards.filter((card) => !(proAccount && isHiddenForProAccount(card.to)));
            if (!cards.length) return null;
            return (
              <section key={group.title} data-testid={`report-group-${group.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">{group.title}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {cards.map((card) => (
                    <button
                      key={card.title}
                      type="button"
                      onClick={() => navigate(card.to)}
                      className={cn(
                        "flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 text-left",
                        "hover:border-foreground/20 hover:shadow-sm transition-all",
                      )}
                      data-testid={`report-card-${card.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <div className="flex-shrink-0 h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                        <card.icon className="h-4.5 w-4.5 text-gray-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-foreground">{card.title}</div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{card.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
