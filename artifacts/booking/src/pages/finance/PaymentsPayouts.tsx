import { AppLayout } from "@/components/layout/AppLayout";
import { SettingsShellContext } from "@/lib/settings-shell-context";
import PayoutAccountSettings from "@/pages/settings/PayoutAccountSettings";

/**
 * Payments & Payouts — payout account setup, verification, and the embedded
 * Stripe Payment Dashboard. No page title here — the sidebar item already
 * says "Payments & Payouts"; repeating it as an on-page heading just eats
 * space the embedded dashboard could use.
 *
 * "Checkout & Tax" (formerly a second tab here) has its own sidebar entry
 * and route (/payments/checkout-tax) instead.
 *
 * PayoutAccountSettings is mounted inside a settings-shell context so its
 * own <AppLayout> collapses to a bare wrapper and its page header hides
 * (it checks useInSettingsShell()).
 */
export default function PaymentsPayouts() {
  return (
    <AppLayout fullHeight>
      <div className="settings-surface flex-1 min-h-0 flex flex-col">
        <SettingsShellContext.Provider value={true}>
          <PayoutAccountSettings />
        </SettingsShellContext.Provider>
      </div>
    </AppLayout>
  );
}
