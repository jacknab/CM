import { useLocation } from "react-router-dom";

/**
 * The Certxa app's version and build, small in the bottom-right corner (owner's request, 2026-10-17): white on
 * /nail, grey on /frontdesk and /kiosk. The app says which APK it is (window.CERTXA_APP_BUILD, set from
 * apps/certxa-owner/lib/buildInfo.ts); in a normal browser there is nothing to show.
 */
export function AppBuildTag({ tone }: { tone: "white" | "grey" }) {
  const label = typeof window !== "undefined" ? (window as unknown as { CERTXA_APP_BUILD?: string }).CERTXA_APP_BUILD : undefined;
  if (!label) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="app-build-tag"
      style={{
        position: "fixed", right: 6, bottom: 3, zIndex: 9999, pointerEvents: "none",
        fontSize: 10, lineHeight: "12px", letterSpacing: 0.2,
        color: tone === "white" ? "#ffffff" : "#9ca3af",
      }}
    >
      {label}
    </div>
  );
}

/** Placed once in the app: white on /nail, grey on /frontdesk and /kiosk, nothing elsewhere. */
export function AppBuildCorner() {
  const { pathname } = useLocation();
  if (/^\/nail(\/|$)/.test(pathname)) return <AppBuildTag tone="white" />;
  if (/^\/(frontdesk|kiosk)(\/|$)/.test(pathname)) return <AppBuildTag tone="grey" />;
  return null;
}
