import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";
import { SettingsShellContext } from "@/lib/settings-shell-context";
import PayoutAccountSettings from "@/pages/settings/PayoutAccountSettings";
import POSSettings from "@/pages/POSSettings";

type Tab = "payouts" | "checkout";

const TABS: { key: Tab; label: string }[] = [
  { key: "payouts", label: "Payout account" },
  { key: "checkout", label: "Checkout & tax" },
];

/**
 * Payments & Payouts — merges the former Settings pages "Payout Account" and
 * "Payments & Checkout" into one page under the Payments & POS section.
 *
 * The two source pages are mounted as-is inside a settings-shell context so
 * their own <AppLayout> collapses to a bare wrapper and their page headers
 * hide (they check useInSettingsShell()).
 */
export default function PaymentsPayouts() {
  const [tab, setTab] = useState<Tab>("payouts");

  return (
    <AppLayout>
      <div className="settings-surface">
        <div className="mx-auto max-w-2xl px-4 pt-6 md:px-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payments &amp; Payouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Identity verification, your payout bank account, the card reader and sales tax.
          </p>
          <div className="mt-5 flex gap-6 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "-mb-px shrink-0 border-b-2 py-3 text-[15px] font-semibold transition-colors",
                  tab === t.key
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <SettingsShellContext.Provider value={true}>
          {tab === "payouts" ? <PayoutAccountSettings /> : <POSSettings />}
        </SettingsShellContext.Provider>
      </div>
    </AppLayout>
  );
}
