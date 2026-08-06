import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { PageErrorBoundary } from "./PageErrorBoundary";

export default function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const { pathname } = useLocation();

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 flex min-h-0 overflow-hidden">
          <PageErrorBoundary>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
}
