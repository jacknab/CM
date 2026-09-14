import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sparkles, Receipt, Calendar, ShoppingCart, Package, Percent,
  Boxes, FileText, Star, Users, Scissors, UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ReportCard = {
  title: string;
  description: string;
  icon: typeof Sparkles;
} & ({ to: string; comingSoon?: false } | { to?: undefined; comingSoon: true });

const CARDS: ReportCard[] = [
  { title: "Create a custom report", description: "Ask your Growth Analyst for any custom report", icon: Sparkles, to: "/support" },
  { title: "Sales", description: "Breakdown of gross and net transaction history", icon: Receipt, to: "/reports/dashboard?tab=revenue" },
  { title: "Appointments", description: "Includes information about appointment history", icon: Calendar, to: "/reports/dashboard?tab=appointments" },
  { title: "Staff performance", description: "Includes bookings and revenue by team member", icon: UserCircle, to: "/reports/dashboard?tab=staff" },
  { title: "Service performance", description: "Includes booking and revenue history by service", icon: Scissors, to: "/reports/dashboard?tab=services" },
  { title: "Client activity", description: "Includes client counts, retention, and no-show risk", icon: Users, to: "/reports/dashboard?tab=customers" },
  { title: "Sales tax", description: "Includes information about sales tax history", icon: Percent, to: "/reports/dashboard?tab=tax" },
  { title: "Commission earnings", description: "Breakdown of earnings to support commission payouts", icon: FileText, to: "/commission-report" },
  { title: "Salon earnings", description: "Revenue and payout breakdown for the salon", icon: Star, to: "/salon-earnings" },
  { title: "Register reports", description: "Cash drawer counts and register activity history", icon: FileText, to: "/register-reports" },
  { title: "Retail sales", description: "Includes information about retail sales history", icon: ShoppingCart, comingSoon: true },
  { title: "Packages activity", description: "Includes a detailed activity report tracking all credit actions", icon: Package, comingSoon: true },
  { title: "Inventory", description: "Includes information about inventory sales", icon: Boxes, comingSoon: true },
  { title: "Transaction detail", description: "Includes all line items for each transaction", icon: Receipt, comingSoon: true },
  { title: "Most valuable clients", description: "Includes a list of top clients by lifetime spend", icon: Star, comingSoon: true },
];

export default function ReportsHub() {
  const navigate = useNavigate();
  const [comingSoon, setComingSoon] = useState<string | null>(null);

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Reports</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CARDS.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={() => (card.comingSoon ? setComingSoon(card.title) : navigate(card.to))}
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
      </div>

      <Dialog open={!!comingSoon} onOpenChange={(open) => !open && setComingSoon(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{comingSoon}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This report is coming soon.</p>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
