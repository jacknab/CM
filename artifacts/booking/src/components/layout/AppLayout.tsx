import { Sidebar } from "./Sidebar";
import { ReactNode } from "react";
import { useInSettingsShell } from "@/lib/settings-shell-context";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { currentAppProfile } from "@/lib/appProfile";

/**
 * AppLayout — desktop sidebar + scrollable content wrapper.
 * The mobile sticky header and bottom nav are now global (fixed-position)
 * in App.tsx via GlobalMobileHeader and MobileBottomNav, so they appear
 * on every authenticated page without needing AppLayout.
 *
 * When rendered inside the SettingsShell detail pane it collapses to a bare
 * wrapper — the shell already provides the sidebar, header and scroll
 * container — so a settings page keeps `<AppLayout>` in its own source and
 * still slots cleanly into the pane.
 */
export function AppLayout({ children, fullHeight = false }: { children: ReactNode; fullHeight?: boolean }) {
  const inSettingsShell = useInSettingsShell();

  if (inSettingsShell) {
    return fullHeight
      ? <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      : <div className="px-5 py-6 md:px-8 md:py-8 max-w-3xl">{children}</div>;
  }

  if (currentAppProfile()) return <AppFrame fullHeight={fullHeight}>{children}</AppFrame>;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background salon-shell paper-grain">
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop-only sidebar */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        <main className={fullHeight ? "flex-1 overflow-hidden flex flex-col" : "flex-1 overflow-y-auto"}>
          {fullHeight ? (
            <div className="flex-1 overflow-y-auto flex flex-col">
              {children}
            </div>
          ) : (
            <div className="container mx-auto p-4 md:p-8">
              {children}
              {/* Spacer so content clears the fixed mobile bottom nav (60px + safe area) */}
              <div
                className="md:hidden"
                style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}
                aria-hidden="true"
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * Inside a Certxa app (shared/appProfiles.ts) a page has no platform sidebar or menus: just Back and Home,
 * so the app's Settings, Reports and Messages pages never open the rest of the platform.
 */
function AppFrame({ children, fullHeight }: { children: ReactNode; fullHeight: boolean }) {
  const navigate = useNavigate();
  const profile = currentAppProfile()!;
  // React Router numbers the entries it added; 0 means this page was opened directly, with nothing to go back to.
  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate(profile.home));
  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3" data-testid="app-frame-header">
        <button type="button" onClick={back} className="flex items-center gap-1 text-sm font-medium text-primary" data-testid="app-frame-back">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <button type="button" onClick={() => navigate(profile.home)} className="text-sm font-medium text-primary" data-testid="app-frame-home">
          Home
        </button>
      </header>
      <main className={fullHeight ? "flex flex-1 flex-col overflow-hidden" : "flex-1 overflow-y-auto"}>
        {fullHeight ? children : <div className="container mx-auto p-4 md:p-8">{children}</div>}
      </main>
    </div>
  );
}
