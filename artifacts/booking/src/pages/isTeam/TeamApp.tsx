import { Navigate, Routes, Route } from "react-router-dom";
import { useSupportAuth } from "@/hooks/use-support-auth";
import TeamSidebar from "@/components/isTeam/Sidebar";
import TeamTopBar from "@/components/isTeam/TopBar";
import TeamDashboardPage from "./DashboardPage";
import TeamCustomer360Page from "./Customer360Page";
import TeamDataTransferQueuePage from "./DataTransferQueuePage";
import TicketsPage from "./TicketsPage";
import LiveChatPage from "./LiveChatPage";
import AccountTimelinePage from "./AccountTimelinePage";
import BillingInvestigationPage from "./BillingInvestigationPage";
import VisitorsPage from "./VisitorsPage";

function TeamShell() {
  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <TeamSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TeamTopBar />
        <main className="flex-1 overflow-hidden flex flex-col">
          <Routes>
            <Route path="accounts" element={<TeamDashboardPage />} />
            <Route path="accounts/:id" element={<TeamCustomer360Page />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="live-chat" element={<LiveChatPage />} />
            <Route path="account-timeline" element={<AccountTimelinePage />} />
            <Route path="account-timeline/:accountId" element={<AccountTimelinePage />} />
            <Route path="visitors" element={<VisitorsPage />} />
            {/* Legacy path — the incidents route is now the live-visitors dashboard */}
            <Route path="incidents" element={<VisitorsPage />} />
            <Route path="incidents/:incidentId" element={<Navigate to="/isTeam/visitors" replace />} />
            <Route path="billing-investigation" element={<BillingInvestigationPage />} />
            <Route path="billing-investigation/:accountId" element={<BillingInvestigationPage />} />
            <Route path="data-transfers" element={<TeamDataTransferQueuePage />} />
            <Route path="*" element={<Navigate to="/isTeam/accounts" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function PrivateTeamRoute({ children }: { children: React.ReactNode }) {
  const { agent, isLoading } = useSupportAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 text-slate-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!agent) {
    return <Navigate to="/isTeam/login" replace />;
  }

  return <>{children}</>;
}

export default function TeamApp() {
  return (
    <PrivateTeamRoute>
      <TeamShell />
    </PrivateTeamRoute>
  );
}
