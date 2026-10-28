import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Sparkles, Receipt, Calendar, Percent, FileText, Star, Users, Scissors, UserCircle, Wallet, HandCoins, Gift, Clock, Repeat,
  UserMinus, CalendarX, Award, Hourglass, Timer, BarChart3, MessageSquareHeart, MessageSquare, Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { isProAccount, isHiddenForProAccount } from "@shared/proAccount";

type ReportCard = { title: string; description: string; icon: typeof Sparkles; to: string };

/**
 * Reports home (owner, 2026-10-29): cards grouped by what they are about, each opening its own report page. A report is
 * listed once it is built (no "Coming soon"). plans/reports.md.
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
    { title: "Staff performance", description: "Sales, tickets, average ticket, tips, add-ons, clients who came back, sales per hour", icon: UserCircle, to: "/reports/staff" },
    { title: "Hours & chair use", description: "Hours on the clock against time with clients", icon: Clock, to: "/reports/hours" },
    { title: "Turns", description: "Turns earned, tickets given by turn, and adjustments", icon: Repeat, to: "/reports/turns" },
    { title: "Commission earnings", description: "Breakdown of earnings to support commission payouts", icon: FileText, to: "/commission-report" },
  ] },
  { title: "Clients", cards: [
    { title: "Client retention", description: "New and returning clients, and how many new clients come back", icon: Users, to: "/reports/retention" },
    { title: "Lapsed clients", description: "Regulars who haven't been back for a while: a list to win them back", icon: UserMinus, to: "/reports/lapsed-clients" },
    { title: "Most valuable clients", description: "Top clients by spend, with lifetime value", icon: Star, to: "/reports/top-clients" },
    { title: "No-shows & cancellations", description: "Rates, worst days, and clients who miss again and again", icon: CalendarX, to: "/reports/no-shows" },
    { title: "Loyalty", description: "Points earned and used, and who holds the most", icon: Award, to: "/reports/loyalty" },
  ] },
  { title: "Operations", cards: [
    { title: "Appointments & walk-ins", description: "Booked vs walk-in, completed, cancelled, no-shows, how far ahead people book", icon: Calendar, to: "/reports/appointments" },
    { title: "Wait times", description: "From check-in to the service starting, by hour and day", icon: Hourglass, to: "/reports/wait-times" },
    { title: "Service times", description: "How long services really take against the time booked", icon: Timer, to: "/reports/service-times" },
    { title: "Busiest times", description: "When clients come in, by day and hour, for staffing", icon: BarChart3, to: "/reports/busy-times" },
    { title: "Services & add-ons", description: "What sells, for how much, and add-on attach rates", icon: Scissors, to: "/reports/services" },
  ] },
  { title: "Marketing", cards: [
    { title: "Review requests", description: "Review texts sent, links opened, reviews received", icon: MessageSquareHeart, to: "/reports/reviews" },
    { title: "Texts sent", description: "Every text the salon sent, by kind, with failures", icon: MessageSquare, to: "/reports/texts" },
    { title: "Autumn calls", description: "AI receptionist calls, outcomes, and the visits she booked", icon: Phone, to: "/reports/autumn-calls" },
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
