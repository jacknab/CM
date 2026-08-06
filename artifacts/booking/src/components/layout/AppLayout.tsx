import { Sidebar } from "./Sidebar";
import { ReactNode } from "react";

/**
 * AppLayout — desktop sidebar + scrollable content wrapper.
 * The mobile sticky header and bottom nav are now global (fixed-position)
 * in App.tsx via GlobalMobileHeader and MobileBottomNav, so they appear
 * on every authenticated page without needing AppLayout.
 */
export function AppLayout({ children, fullHeight = false }: { children: ReactNode; fullHeight?: boolean }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
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
