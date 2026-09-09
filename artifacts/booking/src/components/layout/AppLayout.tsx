import { Sidebar } from "./Sidebar";
import { ReactNode } from "react";
import { useInSettingsShell } from "@/lib/settings-shell-context";

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

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background salon-shell paper-grain">
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop-only sidebar */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        <main className={fullHeight ? "flex-1 overflow-hidden flex flex-col" : "flex-1 overflow-y-auto"}>
          {fullHeight ? (
            <div className="flex-1 overflow-hidden flex flex-col">
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
