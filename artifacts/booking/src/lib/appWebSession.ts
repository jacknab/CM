/**
 * The billing pages the Certxa Pro app opens on the website (/solo/billing, /pro-plus, /pro-credits) are signed in
 * only for as long as the page is open (server: lib/appWebSession.ts). Closing the page or going back to the app
 * ends that sign-in. A card payment that leaves the page for the bank's check does not end it.
 * For an ordinary website sign-in the server ignores the request.
 */
import { useEffect } from "react";

let paying = false;

/** Around a step that leaves the page and comes back: a card confirmation (Stripe's bank check), Google's sign-in. */
export function setPaying(on: boolean): void {
  paying = on;
}

export function endAppWebSession(): void {
  try {
    if (navigator.sendBeacon?.("/api/app-web-session/end")) return;
  } catch { /* fall back to fetch */ }
  void fetch("/api/app-web-session/end", { method: "POST", credentials: "include", keepalive: true }).catch(() => {});
}

/** Ends the sign-in, then opens the app. */
export function backToApp(appUrl: string): void {
  endAppWebSession();
  window.location.href = appUrl;
}

/** Ends the sign-in when the page is closed (not while a payment is being confirmed). */
export function useEndAppWebSessionOnClose(): void {
  useEffect(() => {
    const onHide = (e: PageTransitionEvent) => {
      if (!paying && !e.persisted) endAppWebSession();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);
}
