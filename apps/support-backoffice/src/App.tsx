import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import SupportDashboardPage from "@/pages/SupportDashboardPage";
import Customer360Page from "@/pages/Customer360Page";
import AccountActivityPage from "@/pages/AccountActivityPage";
import DataTransferQueuePage from "@/pages/DataTransferQueuePage";
import TicketWorkspacePage from "@/pages/TicketWorkspacePage";
import BillingInvestigationPage from "@/pages/BillingInvestigationPage";
import BillingAccountPage from "@/pages/BillingAccountPage";
import IncidentsPage from "@/pages/IncidentsPage";
import IncidentDetailPage from "@/pages/IncidentDetailPage";
import AccountTimelinePage from "@/pages/AccountTimelinePage";
import AccountTimelineDetailPage from "@/pages/AccountTimelineDetailPage";
import LiveChatPage from "@/pages/LiveChatPage";
import EscalationsPage from "@/pages/EscalationsPage";
import SubscriptionsPage from "@/pages/SubscriptionsPage";
import InvoicesPage from "@/pages/InvoicesPage";
import RefundsPage from "@/pages/RefundsPage";
import ProductAIPage from "@/pages/ProductAIPage";
import ProductBookingPage from "@/pages/ProductBookingPage";
import ProductWebsitePage from "@/pages/ProductWebsitePage";
import ProductSMSPage from "@/pages/ProductSMSPage";
import WebsiteMonitoringPage from "@/pages/WebsiteMonitoringPage";
import ErrorLogsPage from "@/pages/ErrorLogsPage";
import ReportsPage from "@/pages/ReportsPage";
import StaffPage from "@/pages/StaffPage";
import SettingsPage from "@/pages/SettingsPage";
import AppShell from "@/components/layout/AppShell";

export default function App() {
  const basename = window.location.pathname.startsWith("/isTeam") ? "/isTeam" : "/";

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<SupportDashboardPage />} />

          {/* Accounts */}
          <Route path="/accounts" element={<DashboardPage />} />
          <Route path="/accounts/:id" element={<Customer360Page />} />
          <Route path="/accounts/:id/activity" element={<AccountActivityPage />} />

          {/* Support */}
          <Route path="/tickets" element={<TicketWorkspacePage />} />
          <Route path="/tickets/:ticketId" element={<TicketWorkspacePage />} />
          <Route path="/chat" element={<LiveChatPage />} />
          <Route path="/escalations" element={<EscalationsPage />} />

          {/* Billing */}
          <Route path="/billing/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/billing/invoices" element={<InvoicesPage />} />
          <Route path="/billing/refunds" element={<RefundsPage />} />
          <Route path="/billing-investigation" element={<BillingInvestigationPage />} />
          <Route path="/billing-investigation/:accountId" element={<BillingAccountPage />} />

          {/* Products */}
          <Route path="/products/ai" element={<ProductAIPage />} />
          <Route path="/products/booking" element={<ProductBookingPage />} />
          <Route path="/products/website" element={<ProductWebsitePage />} />
          <Route path="/products/sms" element={<ProductSMSPage />} />

          {/* Monitoring */}
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/incidents/:id" element={<IncidentDetailPage />} />
          <Route path="/monitoring/website" element={<WebsiteMonitoringPage />} />
          <Route path="/monitoring/errors" element={<ErrorLogsPage />} />

          {/* Account timeline */}
          <Route path="/account-timeline" element={<AccountTimelinePage />} />
          <Route path="/account-timeline/:accountId" element={<AccountTimelineDetailPage />} />

          {/* Data & Reports */}
          <Route path="/data-transfers" element={<DataTransferQueuePage />} />
          <Route path="/reports" element={<ReportsPage />} />

          {/* Staff & Settings */}
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
