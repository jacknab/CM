/**
 * StripeConnectProvider.tsx
 *
 * Initialises @stripe/connect-js and wraps children with ConnectComponentsProvider
 * so embedded Stripe Connect components (ConnectAccountOnboarding,
 * ConnectAccountManagement, ConnectNotificationBanner, ConnectPayments,
 * ConnectPayouts, etc.) can render inside the Certxa platform.
 *
 * The provider calls POST /api/payments/stripe/account-session to obtain a
 * short-lived client_secret. Sessions expire after 60 minutes; connect-js
 * automatically re-calls fetchClientSecret ~5 minutes before expiry.
 *
 * Usage:
 *   <StripeConnectProvider publishableKey={pk}>
 *     <ConnectNotificationBanner />
 *     <ConnectAccountOnboarding onExit={handleExit} />
 *   </StripeConnectProvider>
 */

import { useMemo } from "react";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import { ConnectComponentsProvider } from "@stripe/react-connect-js";

interface StripeConnectProviderProps {
  publishableKey: string;
  children: React.ReactNode;
}

export function StripeConnectProvider({ publishableKey, children }: StripeConnectProviderProps) {
  // Create the instance once per publishable key.
  // fetchClientSecret is invoked immediately on mount and then again
  // automatically by connect-js before each session expires — no polling needed.
  const stripeConnectInstance = useMemo(
    () =>
      loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret: async () => {
          const res = await fetch("/api/payments/stripe/account-session", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error ?? "Failed to create Stripe Account Session");
          }
          const { clientSecret } = await res.json();
          return clientSecret as string;
        },
        appearance: {
          // "drawer" slides sub-flows in from the side, staying visually
          // embedded in the page. "dialog" renders them as a centered modal
          // with a backdrop, which reads as a popup even though it's still
          // technically mounted inline — not what we want here.
          overlays: "drawer",
          variables: {
            colorPrimary:     "#6d28d9",   // Certxa violet
            fontFamily:       "Outfit, Inter, system-ui, sans-serif",
            borderRadius:     "10px",
            colorBackground:  "#ffffff",
            colorText:        "#111318",
            colorSecondaryText: "#667085",
            colorBorder:      "#e4e7ec",
            colorDanger:      "#dc2626",
            fontSizeBase:     "14px",
            spacingUnit:      "4px",
          },
        },
      }),
    // Re-create only if the publishable key changes (e.g. test ↔ live toggle)
    [publishableKey]
  );

  return (
    <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
      {children}
    </ConnectComponentsProvider>
  );
}
