import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { GlobalMobileHeader } from "@/components/GlobalMobileHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmRoot } from "@/components/ConfirmRoot";
import { StoreProvider } from "@/components/StoreProvider";
import { SnapshotProvider } from "@/components/SnapshotProvider";
import { OfflineStatusBanner } from "@/components/OfflineStatusBanner";
import { SyncConflictPanel } from "@/components/SyncConflictPanel";
import { useSelectedStore } from "@/hooks/use-store";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FeatureGuard } from "@/components/FeatureGuard";
import POSSettings from "@/pages/POSSettings";
import Services from "@/pages/Services";
import CatalogCategories from "@/pages/catalog/CatalogCategories";
import CatalogServices from "@/pages/catalog/CatalogServices";
import CatalogPackages from "@/pages/catalog/CatalogPackages";
import CatalogAddons from "@/pages/catalog/CatalogAddons";
import CatalogProducts from "@/pages/catalog/CatalogProducts";
import NailServices from "@/pages/catalog/NailServices";
import StaffPayrollLanding from "@/pages/StaffPayrollLanding";
import Customers from "@/pages/Customers";
import Calendar from "@/pages/Calendar";
import Products from "@/pages/Products";
import NewBooking from "@/pages/NewBooking";
import ClientLookup from "@/pages/ClientLookup";
import POSInterface from "@/pages/POSInterface";
import ClientProfile from "@/pages/ClientProfile";
import ClientDetail from "@/pages/ClientDetail";
import StaffWorkingHours from "@/pages/StaffWorkingHours";
import CalendarSettingsPage from "@/pages/CalendarSettings";
import LanguageSettings from "@/pages/LanguageSettings";
import BusinessSettings from "@/pages/BusinessSettings";
import BusinessHoursPage from "@/pages/BusinessHoursPage";
import FeaturesSettings from "@/pages/FeaturesSettings";
import CashDrawer from "@/pages/CashDrawer";
import AddonsPage from "@/pages/Addons";
import CommissionReport from "@/pages/CommissionReport";
import SalonEarningsReport from "@/pages/SalonEarningsReport";
import Analytics from "@/pages/Analytics";
import OwnerDashboard from "@/pages/OwnerDashboard";
import Reports from "@/pages/Reports";
import RegisterReports from "@/pages/RegisterReports";
import Waitlist from "@/pages/Waitlist";
import QueueDashboard from "@/pages/queue/QueueDashboard";
import QueueSettings from "@/pages/queue/QueueSettings";
import TurnSystem from "@/pages/TurnSystem";
import PublicCheckIn from "@/pages/queue/PublicCheckIn";
import QueueDisplay from "@/pages/queue/QueueDisplay";
import KioskCheckIn from "@/pages/KioskCheckIn";
import KioskTicket from "@/pages/KioskTicket";
import FrontDeskDisplay from "@/pages/FrontDeskDisplay";
import GiftCards from "@/pages/GiftCards";
import IntakeForms from "@/pages/IntakeForms";
import Loyalty from "@/pages/Loyalty";
import Reviews from "@/pages/Reviews";
import GoogleBusiness from "@/pages/GoogleBusiness";
import ReviewSubmit from "@/pages/ReviewSubmit";
import OnlineBooking from "@/pages/OnlineBooking";
import SmsSettings from "@/pages/SmsSettings";
import MailSettings from "@/pages/MailSettings";
import AiReceptionist from "@/pages/AiReceptionist";
import AiReceptionistLive from "@/pages/AiReceptionistLive";
import SmsInbox from "@/pages/SmsInbox";
import SmsActivity from "@/pages/SmsActivity";
import Campaigns from "@/pages/Campaigns";
import BookingPolicies from "@/pages/BookingPolicies";
import ClientAtRisk from "@/pages/ClientAtRisk";
import ApiKeys from "@/pages/ApiKeys";
import EliteApiDocs from "@/pages/EliteApiDocs";
import EliteDetails from "@/pages/EliteDetails";
import MultiLocationDashboard from "@/pages/MultiLocationDashboard";
import { AdminDashboard } from "@/pages/Admin/AdminDashboard";
import Auth from "@/pages/Auth";
import AppLogin from "@/pages/AppLogin";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import StaffAuth from "@/pages/StaffAuth";
import StaffDashboard from "@/pages/StaffDashboard";
import StaffOverview from "@/pages/StaffOverview";
import Onboarding from "@/pages/Onboarding";
import OnboardingChat from "@/pages/OnboardingChat";
import SetupHub from "@/pages/SetupHub";
import ServicesFlow from "@/pages/setup/ServicesFlow";
import ServiceImportFlow from "@/pages/setup/ServiceImportFlow";
import TeamFlow from "@/pages/setup/TeamFlow";
import BookingCalendarFlow from "@/pages/setup/BookingCalendarFlow";
import POSPaymentsFlow from "@/pages/setup/POSPaymentsFlow";
import CommissionPayrollFlow from "@/pages/setup/CommissionPayrollFlow";
import MarketingFlow from "@/pages/setup/MarketingFlow";
import AIReceptionistFlow from "@/pages/setup/AIReceptionistFlow";
import WebsiteSetupFlow from "@/pages/setup/WebsiteSetupFlow";
import PublicBooking from "@/pages/PublicBooking";
import BookingWidgetPage from "@/pages/BookingWidgetPage";
import BookingConfirmation from "@/pages/public-booking/BookingConfirmation";
import ReviewGate from "@/pages/public-review/ReviewGate";
import ReviewFeedback from "@/pages/public-review/ReviewFeedback";
import CompleteBooking from "@/pages/public-payment/CompleteBooking";
import StaffCalendar from "@/pages/StaffCalendar";
import StaffProfile from "@/pages/StaffProfile";
import StaffMenu from "@/pages/StaffMenu";
import StaffLanguage from "@/pages/StaffLanguage";
import Staff1099 from "@/pages/Staff1099";
import StaffIncome from "@/pages/StaffIncome";
import StaffPOS from "@/pages/StaffPOS";
import StaffHistory from "@/pages/StaffHistory";
import NotFound from "@/pages/not-found";
import TeamLoginPage from "@/pages/isTeam/LoginPage";
import TeamApp from "@/pages/isTeam/TeamApp";
import CustomerChatPage from "@/pages/LiveChat/CustomerChatPage";
import ContactPage from "@/pages/ContactPage";
import TeamPermissions from "@/pages/TeamPermissions";
import PayrollSettings from "@/pages/PayrollSettings";
import Payroll from "@/pages/Payroll";
import PayrollHome from "@/pages/PayrollHome";
import PayoutsLayout from "@/pages/payouts/PayoutsLayout";
import PayoutsContractors from "@/pages/payouts/PayoutsContractors";
import ContractorDetail from "@/pages/payouts/ContractorDetail";
import ContractorByStaffId from "@/pages/payouts/ContractorByStaffId";
import TeamMembers from "@/pages/team/TeamMembers";
import TeamMemberDetail from "@/pages/team/TeamMemberDetail";
import StaffCalendarColors from "@/pages/team/StaffCalendarColors";
import ContractorOnboardingPortal from "@/pages/ContractorOnboardingPortal";
import PayoutsLedger from "@/pages/payouts/PayoutsLedger";
import PayoutsRun from "@/pages/payouts/PayoutsRun";
import PayoutsChecks from "@/pages/payouts/PayoutsChecks";
import PayoutsTaxDocs from "@/pages/payouts/PayoutsTaxDocs";
import PayoutsReports from "@/pages/payouts/PayoutsReports";
import PayoutsSchedule from "@/pages/payouts/PayoutsSchedule";
import PayoutsDeductions from "@/pages/payouts/PayoutsDeductions";
import PayoutsCommissions from "@/pages/payouts/PayoutsCommissions";
import CommissionsPage from "@/pages/CommissionsPage";
import CommissionsSetupWizard from "@/pages/CommissionsSetupWizard";
import BalanceDashboard from "@/pages/payouts/BalanceDashboard";
import StaffPaySummary from "@/pages/StaffPaySummary";
import StaffPayoutsSetup from "@/pages/StaffPayoutsSetup";
import StaffFinancialHub from "@/pages/StaffFinancialHub";
import Timeclock from "@/pages/Timeclock";
import PrintChecks from "@/pages/PrintChecks";
import CheckLayoutEditor from "@/pages/CheckLayoutEditor";
import SpaLandingPage from "@/pages/SpaLandingPage";
import TattooStudioLandingPage from "@/pages/TattooStudioLandingPage";
import AutumnLandingPage from "@/pages/AutumnLandingPage";
import AcceptInvite from "@/pages/AcceptInvite";
import ManageDashboard from "@/pages/manage/ManageDashboard";
import MembersHome from "@/pages/manage/MembersHome";
import AiReceptionistRouter from "@/pages/manage/AiReceptionistRouter";
import AiReceptionistEnrollment from "@/pages/manage/AiReceptionistEnrollment";
import AiReceptionistCallLogs from "@/pages/manage/AiReceptionistCallLogs";
import CreditsTopup from "@/pages/manage/CreditsTopup";
import CustomerSupportPage from "@/pages/manage/CustomerSupportPage";
import FinancePosHub from "@/pages/manage/FinancePosHub";
import StaffEarningsHub from "@/pages/manage/StaffEarningsHub";
import PaymentSettings from "@/pages/manage/PaymentSettings";
import PayoutAccountSettings from "@/pages/settings/PayoutAccountSettings";
import ResourceSettings from "@/pages/settings/ResourceSettings";
import SettingsLanding from "@/pages/SettingsLanding";
import TranslationsPage from "@/pages/TranslationsPage";
import KioskSettings from "@/pages/KioskSettings";
import WalkInBoard from "@/pages/WalkInBoard";
import BillingPage from "@/pages/manage/BillingPage";
import DashboardBilling from "@/pages/DashboardBilling";
import AccountOverview from "@/pages/AccountOverview";
import Intelligence from "@/pages/Intelligence";
import HelpCenter from "@/pages/HelpCenter";
import SupportInbox from "@/pages/SupportInbox";
import DataTransferPage from "@/pages/DataTransferPage";
import { RequirePermission } from "@/components/RequirePermission";
import { PERMISSIONS } from "@shared/permissions";
import { AccountStatusGate } from "@/components/AccountStatusGate";
import SeoManager from "@/components/SeoManager";

const authenticatedPaths = [
  "/onboarding",
  "/overview",
  "/salon-dashboard",
  "/dashboard",
  "/pos-settings",
  "/analytics",
  "/services",
  "/catalog",
  "/staff",
  "/team",
  "/customers",
  "/waitlist",
  "/loyalty",
  "/reviews",
  "/google-business",
  "/calendar",
  "/appointments",
  "/booking",
  "/client-lookup",
  "/client",
  "/products",
  "/addons",
  "/gift-cards",
  "/intake-forms",
  "/reports",
  "/register-reports",
  "/commission-report",
  "/salon-earnings",
  "/settings",
  "/settings/translations",
  "/settings/resources",
  "/booking-policies",
  "/calendar-settings",
  "/language-settings",
  "/business-settings",
  "/business-hours",
  "/features-settings",
  "/payroll-settings",
  "/payroll",
  "/payouts",
  "/payouts/balance",
  "/timeclock",
  "/print-checks",
  "/chkeditor",
  "/team-permissions",
  "/online-booking",
  "/sms-settings",
  "/mail-settings",
  "/ai-receptionist",
  "/campaigns",
  "/sms-inbox",
  "/sms-activity",
  "/cash-drawer",

  "/dashboard/queue",
  "/dashboard/turn",
  "/billing",
  "/account",
  "/staff-calendar",
  "/staff-pos",
  "/staff-profile",
  "/staff-menu",
  "/staff-language",
  "/staff-1099",
  "/staff-income",
  "/staff-history",
  "/staff-pay",
  "/staff-dashboard",
  "/staff-overview",
  "/staff-financial-hub",
  "/intelligence",
  "/api-keys",
  "/elite-api-docs",
  "/elite-details",
  "/multi-location",
  "/help",
  "/support",
  "/data-transfer",
  "/manage/data-transfer",
  "/kiosk-settings",
  "/walk-in-board",
  "/walkins",
  "/manage/payment-settings",
  "/setup",
];

/**
 * Paths that staff members are allowed to visit.
 * Everything else redirects them to /staff-dashboard.
 */
const STAFF_ALLOWED_PATHS = [
  "/staff-dashboard",
  "/staff-overview",
  "/staff-calendar",
  "/staff-profile",
  "/staff-menu",
  "/staff-language",
  "/staff-1099",
  "/staff-income",
  "/staff-history",
  "/staff-pay",
  "/staff-pos",
  "/staff-payouts",
  "/staff-financial-hub",
  "/booking/new",
  "/booking/",
  "/client-lookup",
  "/walk-in-board",
  "/walkins",
];

/**
 * RootRedirect — safety-net for any in-SPA navigation that lands on "/".
 * In production nginx routes GET / directly to the PHP landing page before
 * the SPA loads, so this component never runs for real visitors or crawlers.
 * If it somehow fires (e.g. SPA-internal pushState to "/"), redirect to /auth
 * via React Router so no full-page reload (and therefore no client-side
 * redirect detectable by Google) occurs.
 */
function isLikelyTenantHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  // Local + Replit preview/dev hosts are app environments, not tenant websites.
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".replit.dev") ||
    host.endsWith(".replit.app") ||
    host.endsWith(".repl.co")
  ) {
    return false;
  }

  const parts = host.split(".");
  if (parts.length < 3) return false;

  // Internal app subdomains should keep normal app behavior.
  const reserved = new Set(["www", "app", "manage", "voice", "api"]);
  return !reserved.has(parts[0]);
}

function TenantWebsiteNotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold mb-3">No website found</h1>
        <p className="text-zinc-400 leading-relaxed">
          This domain is not connected to a published website.
        </p>
      </div>
    </div>
  );
}

function RootRedirect() {
  if (typeof window !== "undefined" && isLikelyTenantHost(window.location.hostname)) {
    return <TenantWebsiteNotFound />;
  }
  return <Navigate to="/auth" replace />;
}

/**
 * StaffPortalGuard — sits above all authenticated routes.
 * If the logged-in user is a staff member and the current URL is NOT
 * one of their allowed paths, they are immediately redirected to
 * /staff-dashboard. This prevents staff from reaching owner pages
 * by typing URLs directly, using the back button, or following links.
 */
function StaffPortalGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;

  if (user?.role === "staff") {
    const allowed = STAFF_ALLOWED_PATHS.some(
      (p) => location.pathname === p || location.pathname.startsWith(p + "/")
    );
    if (!allowed) return <Navigate to="/staff-dashboard" replace />;
  }

  return <>{children}</>;
}

/**
 * OwnerOnlyRoute — kept for explicit per-route semantics, but
 * StaffPortalGuard above already blocks staff globally.
 */
function OwnerOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user?.role === "staff") return <Navigate to="/staff-dashboard" replace />;
  return <>{children}</>;
}

function SoloGuard({ children }: { children: React.ReactNode }) {
  const { selectedStore } = useSelectedStore();
  const { data: subscription } = useQuery<any>({
    queryKey: ["/api/billing/profile", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return null;
      const res = await fetch(`/api/billing/profile/${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) return null;
      const payload = await res.json();
      return payload?.subscription ?? null;
    },
    enabled: !!selectedStore?.id,
    staleTime: 5 * 60 * 1000,
  });
  const isSolo = (selectedStore as any)?.teamSize === "myself" || !!subscription?.planCode?.toLowerCase().includes("solo");
  if (isSolo) return <Navigate to="/manage" replace />;
  return <>{children}</>;
}

function App() {
  useTheme();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ConfirmRoot />
        <ErrorBoundary>
          <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
            <SeoManager />
            <AppRoutes />
            <CustomerChatPage />
          </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AppRoutes() {
  const location = useLocation();
  const isPublicConfirmation = location.pathname.startsWith("/booking/") && !location.pathname.startsWith("/booking/new");

  const isAuthenticatedRoute = authenticatedPaths.some(path =>
    location.pathname === path || location.pathname.startsWith(path + "/")
  ) && !isPublicConfirmation;

  const routes = (
    <Routes>
      {/* Root → PHP marketing landing page (hard navigation bypasses React Router) */}
      <Route path="/" element={<RootRedirect />} />

      {/* Manage hub */}
      <Route path="/manage" element={<MembersHome />} />
      <Route path="/manage/dashboard" element={<ManageDashboard />} />
      <Route path="/manage/billing" element={<ManageBillingWrapper />} />
      <Route path="/manage/ai-receptionist" element={<AiReceptionistRouter />} />
      <Route path="/manage/ai-receptionist/setup" element={<AiReceptionistEnrollment />} />
      <Route path="/manage/ai-receptionist/call-logs" element={<AiReceptionistCallLogs />} />
      <Route path="/manage/credits" element={<CreditsTopup />} />
      <Route path="/manage/billing/credits-topup" element={<CreditsTopup />} />
      <Route path="/manage/customer-support" element={<CustomerSupportPage />} />
      <Route path="/manage/reports" element={<Navigate to="/analytics" replace />} />
      <Route path="/manage/language" element={<Navigate to="/language-settings" replace />} />
      <Route path="/manage/finance-pos" element={<FinancePosHub />} />
      <Route path="/manage/staff-earnings" element={<StaffEarningsHub />} />
      <Route path="/manage/payment-settings" element={<PaymentSettings />} />
      <Route path="/settings/payout-account" element={<PayoutAccountSettings />} />

      {/* Auth */}
      <Route path="/auth" element={<Auth />} />
      <Route path="/app-login" element={<AppLogin />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Staff portal */}
      <Route path="/staff-auth" element={<StaffAuth />} />
      <Route path="/staff-dashboard" element={<StaffDashboard />} />
      <Route path="/staff-overview" element={<StaffOverview />} />
      <Route path="/staff-calendar" element={<StaffCalendar />} />
      <Route path="/staff-profile" element={<StaffProfile />} />
      <Route path="/staff-menu" element={<StaffMenu />} />
      <Route path="/staff-language" element={<StaffLanguage />} />
      <Route path="/staff-1099" element={<Staff1099 />} />
      <Route path="/staff-income" element={<StaffIncome />} />
      <Route path="/staff-pay" element={<StaffPaySummary />} />
      <Route path="/staff-payouts" element={<StaffPayoutsSetup />} />
      <Route path="/staff-financial-hub" element={<StaffFinancialHub />} />
      <Route path="/staff-pos" element={<StaffPOS />} />
      <Route path="/staff-history" element={<StaffHistory />} />

      {/* Team invite acceptance (public) */}
      <Route path="/accept-invite" element={<AcceptInvite />} />

      {/* Contractor self-service Stripe onboarding (public — magic link) */}
      <Route path="/contractor-onboarding/:token" element={<ContractorOnboardingPortal />} />

      {/* Public booking & review */}
      <Route path="/widget" element={<BookingWidgetPage />} />
      <Route path="/book/:slug" element={<PublicBooking />} />
      <Route path="/booking/:confirmationNumber" element={<BookingConfirmation />} />
      <Route path="/review/:token" element={<ReviewGate />} />
      <Route path="/review/:token/feedback" element={<ReviewFeedback />} />
      <Route path="/review/:appointmentId" element={<ReviewSubmit />} />
      <Route path="/complete-booking/:token" element={<CompleteBooking />} />

      {/* Public queue */}
      <Route path="/q/:slug" element={<PublicCheckIn />} />
      <Route path="/q/:slug/display" element={<QueueDisplay />} />

      {/* Self check-in kiosk */}
      <Route path="/checkin-kiosk" element={<Navigate to="/kiosk-settings" replace />} />
      <Route path="/kiosk/:slug" element={<KioskCheckIn />} />
      <Route path="/kiosk/:slug/ticket/:token" element={<KioskTicket />} />

      {/* Front-desk customer-facing display (POS tablet): lightweight check-in
          + tip screen + card-payment instruction screens. NOT a self-serve kiosk. */}
      <Route path="/frontdesk/:slug" element={<FrontDeskDisplay />} />

      {/* Industry landing pages */}
      <Route path="/spa" element={<SpaLandingPage />} />
      <Route path="/tattoo-studio" element={<TattooStudioLandingPage />} />
      <Route path="/autumn" element={<AutumnLandingPage />} />

      {/* Live chat widget is mounted globally — /chat redirects home */}
      <Route path="/chat" element={<Navigate to="/overview" replace />} />

      {/* Public contact form */}
      <Route path="/contact" element={<ContactPage />} />

      {/* isTeam support back-office */}
      <Route path="/isTeam/login" element={<TeamLoginPage />} />
      <Route path="/isTeam/*" element={<TeamApp />} />

      {/* Admin */}
      <Route path="/isadmin/*" element={<AdminDashboard />} />

      {/* Onboarding — conversational flow is the signup default; ?mode=classic remains available for support */}
      <Route
        path="/onboarding"
        element={(() => {
          const useClassicOnboarding =
            new URLSearchParams(window.location.search).get("mode") === "classic";
          return useClassicOnboarding ? <Onboarding /> : <OnboardingChat />;
        })()}
      />

      {/* Setup hub & individual flows */}
      <Route path="/setup" element={<SetupHub />} />
      <Route path="/setup/services" element={<ServicesFlow />} />
      <Route path="/setup/service-import" element={<ServiceImportFlow />} />
      <Route path="/setup/team" element={<TeamFlow />} />
      <Route path="/setup/booking" element={<BookingCalendarFlow />} />
      <Route path="/setup/payments" element={<POSPaymentsFlow />} />
      <Route path="/setup/payroll" element={<CommissionPayrollFlow />} />
      <Route path="/setup/marketing" element={<MarketingFlow />} />
      <Route path="/setup/website" element={<WebsiteSetupFlow />} />
      <Route path="/setup/ai" element={<AIReceptionistFlow />} />
      {/* Core booking system */}
      <Route path="/overview" element={<Navigate to="/analytics" replace />} />
      <Route path="/salon-dashboard" element={<OwnerOnlyRoute><OwnerDashboard /></OwnerOnlyRoute>} />
      <Route path="/dashboard" element={<Navigate to="/analytics" replace />} />
      <Route path="/pos-settings" element={<POSSettings />} />
      {/* Catalog — individual pages */}
      <Route path="/catalog/categories" element={<OwnerOnlyRoute><CatalogCategories /></OwnerOnlyRoute>} />
      <Route path="/catalog/services"   element={<OwnerOnlyRoute><CatalogServices /></OwnerOnlyRoute>} />
      <Route path="/catalog/packages"   element={<OwnerOnlyRoute><CatalogPackages /></OwnerOnlyRoute>} />
      <Route path="/catalog/addons"     element={<OwnerOnlyRoute><CatalogAddons /></OwnerOnlyRoute>} />
      <Route path="/catalog/products"   element={<OwnerOnlyRoute><CatalogProducts /></OwnerOnlyRoute>} />
      <Route path="/catalog/nail-services" element={<OwnerOnlyRoute><NailServices /></OwnerOnlyRoute>} />
      {/* Legacy redirects */}
      <Route path="/services" element={<Navigate to="/catalog/services" replace />} />
      <Route path="/team" element={<TeamMembers />} />
      <Route path="/team/colors" element={<StaffCalendarColors />} />
      <Route path="/team/:id" element={<TeamMemberDetail />} />
      <Route path="/staff" element={<Navigate to="/team" replace />} />
      <Route path="/staff/members" element={<Navigate to="/team" replace />} />
      <Route path="/staff/members/:id" element={<Navigate to="/team" replace />} />
      <Route path="/staff/working-hours" element={<SoloGuard><StaffWorkingHours /></SoloGuard>} />
      <Route path="/customers" element={<OwnerOnlyRoute><Customers /></OwnerOnlyRoute>} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/appointments" element={<Calendar />} />
      <Route path="/booking/new" element={<NewBooking />} />
      <Route path="/client-lookup" element={<ClientLookup />} />
      <Route path="/client/:id" element={<OwnerOnlyRoute><ClientProfile /></OwnerOnlyRoute>} />
      <Route path="/clients/:id" element={<OwnerOnlyRoute><ClientDetail /></OwnerOnlyRoute>} />
      <Route path="/products" element={<Navigate to="/catalog/products" replace />} />
      <Route path="/addons"   element={<Navigate to="/catalog/addons"   replace />} />
      <Route path="/analytics" element={<OwnerOnlyRoute><Analytics /></OwnerOnlyRoute>} />
      <Route path="/waitlist" element={<OwnerOnlyRoute><FeatureGuard feature="waitlist"><Waitlist /></FeatureGuard></OwnerOnlyRoute>} />
      <Route path="/gift-cards" element={<OwnerOnlyRoute><GiftCards /></OwnerOnlyRoute>} />
      <Route path="/intake-forms" element={<OwnerOnlyRoute><IntakeForms /></OwnerOnlyRoute>} />
      <Route path="/loyalty" element={<OwnerOnlyRoute><FeatureGuard feature="rewardPoints"><Loyalty /></FeatureGuard></OwnerOnlyRoute>} />
      <Route path="/reviews" element={<OwnerOnlyRoute><Reviews /></OwnerOnlyRoute>} />
      <Route path="/google-business" element={<OwnerOnlyRoute><GoogleBusiness /></OwnerOnlyRoute>} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/register-reports" element={<RegisterReports />} />
      <Route path="/commission-report" element={<CommissionReport />} />
      <Route path="/salon-earnings" element={<SalonEarningsReport />} />
      <Route path="/settings" element={<SettingsLanding />} />
      <Route path="/settings/translations" element={<TranslationsPage />} />
      <Route path="/settings/resources" element={<ResourceSettings />} />
      <Route path="/kiosk-settings" element={<KioskSettings />} />
      <Route path="/subscription" element={<Navigate to="/billing" replace />} />
      <Route path="/walk-in-board" element={<WalkInBoard />} />
      <Route path="/walkins" element={<WalkInBoard />} />
      <Route path="/calendar-settings" element={<CalendarSettingsPage />} />
      <Route path="/language-settings" element={<LanguageSettings />} />
      <Route path="/business-settings" element={<BusinessSettings />} />
      <Route path="/business-hours" element={<BusinessHoursPage />} />
      <Route path="/features-settings" element={<FeaturesSettings />} />
      <Route path="/payroll-settings" element={<PayrollSettings />} />
      {/* Payroll Home — single mobile-first hub for Team/Commission/Payroll.
          Old employee payroll UI moved to /payroll/employees; old contractor
          dashboard (/payouts) now redirects here — everything else under
          /payouts/* stays put as a drill-down destination reachable from the hub. */}
      <Route path="/payroll" element={<PayrollHome />} />
      <Route path="/payroll/employees" element={<Payroll />} />
      <Route element={<PayoutsLayout />}>
        <Route path="/payouts" element={<Navigate to="/payroll" replace />} />
        <Route path="/payouts/contractors" element={<PayoutsContractors />} />
        <Route path="/payouts/contractors/by-staff/:staffId" element={<ContractorByStaffId />} />
        <Route path="/payouts/contractors/:id" element={<ContractorDetail />} />
        <Route path="/payouts/ledger" element={<PayoutsLedger />} />
        <Route path="/payouts/run" element={<PayoutsRun />} />
        <Route path="/payouts/deductions" element={<PayoutsDeductions />} />
        <Route path="/payouts/commissions" element={<PayoutsCommissions />} />
        <Route path="/payouts/balance" element={<BalanceDashboard />} />
        <Route path="/payouts/checks" element={<PayoutsChecks />} />
        <Route path="/payouts/tax-docs" element={<PayoutsTaxDocs />} />
        <Route path="/payouts/reports" element={<PayoutsReports />} />
        <Route path="/payouts/schedule" element={<PayoutsSchedule />} />
      </Route>
      <Route path="/commissions" element={<CommissionsPage />} />
      <Route path="/commissions/new" element={<CommissionsSetupWizard />} />
      <Route path="/timeclock" element={<SoloGuard><FeatureGuard feature="timeclock"><Timeclock /></FeatureGuard></SoloGuard>} />
      <Route path="/print-checks" element={<SoloGuard><PrintChecks /></SoloGuard>} />
      <Route path="/chkeditor" element={<CheckLayoutEditor />} />
      <Route
        path="/team-permissions"
        element={
          <RequirePermission permission={PERMISSIONS.STAFF_MANAGE}>
            <TeamPermissions />
          </RequirePermission>
        }
      />
      <Route path="/booking-policies" element={<BookingPolicies />} />
      <Route path="/clients/at-risk" element={<OwnerOnlyRoute><ClientAtRisk /></OwnerOnlyRoute>} />
      <Route path="/online-booking" element={<OnlineBooking />} />
      <Route path="/sms-settings" element={<SmsSettings />} />
      <Route path="/mail-settings" element={<MailSettings />} />
      <Route path="/ai-receptionist" element={<AiReceptionist />} />
      <Route path="/ai-receptionist/live" element={<AiReceptionistLive />} />
      <Route path="/sms-inbox" element={<OwnerOnlyRoute><SmsInbox /></OwnerOnlyRoute>} />
      <Route path="/sms-activity" element={<OwnerOnlyRoute><SmsActivity /></OwnerOnlyRoute>} />
      <Route path="/campaigns" element={<OwnerOnlyRoute><Campaigns /></OwnerOnlyRoute>} />
      <Route path="/api-keys" element={<ApiKeys />} />
      <Route path="/elite-api-docs" element={<EliteApiDocs />} />
      <Route path="/elite-details" element={<EliteDetails />} />
      <Route path="/multi-location" element={<MultiLocationDashboard />} />
      <Route path="/cash-drawer" element={<FeatureGuard feature="pos"><CashDrawer /></FeatureGuard>} />
      <Route path="/billing" element={<DashboardBilling />} />
      <Route path="/account" element={<AccountOverview />} />
      <Route path="/intelligence" element={<Intelligence />} />
      <Route path="/help" element={<HelpCenter />} />
      <Route path="/support" element={<SupportInbox />} />
      <Route path="/data-transfer" element={<DataTransferPage />} />
      <Route path="/manage/data-transfer" element={<DataTransferPage />} />
      <Route path="/intelligence/launch" element={<Navigate to="/intelligence" replace />} />
      <Route path="/marketing" element={<Navigate to="/campaigns" replace />} />

      {/* Queue */}
      <Route path="/dashboard/queue" element={<QueueDashboard />} />
      <Route path="/dashboard/queue/settings" element={<QueueSettings />} />
      <Route path="/dashboard/turn" element={<TurnSystem />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );

  if (isAuthenticatedRoute) {
    return (
      <StoreProvider>
        <StaffPortalGuard>
        <SnapshotProvider>
          {/* Global mobile sticky header — fixed top-0, visible on every authenticated page */}
          <GlobalMobileHeader />
          <AccountStatusGate>
            {routes}
          </AccountStatusGate>
          <OfflineStatusBanner />
          <SyncConflictPanel />
          {/* Global mobile bottom nav — fixed bottom-0, visible on every authenticated page */}
          <MobileBottomNav />
        </SnapshotProvider>
        </StaffPortalGuard>
      </StoreProvider>
    );
  }

  return routes;
}

function ManageBillingWrapper() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [checkoutStatus, setCheckoutStatus] = useState<"idle" | "redirecting" | "error">("idle");

  // Plan code from URL param (just after signup) or sessionStorage (survived onboarding)
  const checkoutPlan =
    searchParams.get("checkout") ?? sessionStorage.getItem("certxa_pending_plan") ?? null;

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/manage/overview"],
    queryFn: () =>
      fetch("/api/manage/overview", { credentials: "include" }).then((r) => {
        if (r.status === 401) throw new Error("unauthorized");
        if (!r.ok) throw new Error("failed");
        return r.json();
      }),
    retry: false,
  });

  useEffect(() => {
    if (error?.message === "unauthorized") {
      const dest = checkoutPlan
        ? `/auth?mode=register&plan=${checkoutPlan}`
        : "/auth?redirect=/manage/billing";
      navigate(dest, { replace: true });
    }
  }, [error, navigate, checkoutPlan]);

  // Auto-trigger Stripe Checkout once salonId is available and a plan is pending
  useEffect(() => {
    if (!data || checkoutStatus !== "idle" || !checkoutPlan) return;
    const stores: any[] = data?.salonos?.stores ?? [];
    const salonId = stores[0]?.id ?? null;
    if (!salonId) return;

    sessionStorage.removeItem("certxa_pending_plan");
    setCheckoutStatus("redirecting");

    fetch(`/api/billing/subscribe/${salonId}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode: checkoutPlan, interval: "month" }),
    })
      .then((r) => r.json())
      .then((body) => {
        if (body.url) {
          window.location.href = body.url;
        } else {
          setCheckoutStatus("error");
        }
      })
      .catch(() => setCheckoutStatus("error"));
  }, [data, checkoutPlan, checkoutStatus]);

  if (isLoading || checkoutStatus === "redirecting") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        {checkoutStatus === "redirecting" && (
          <p className="text-zinc-400 text-sm">Setting up your free trial…</p>
        )}
      </div>
    );
  }

  const stores: any[] = data?.salonos?.stores ?? [];
  const salonId = stores[0]?.id ?? null;

  if (!salonId) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 text-center">
        <header className="fixed top-0 inset-x-0 border-b border-white/8 bg-zinc-950/80 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-6 h-14 flex items-center">
            <a href="/" className="font-semibold text-lg tracking-tight text-white">
              Certxa<span className="text-violet-400">.</span>
            </a>
          </div>
        </header>
        <div className="max-w-sm w-full space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h.008v.008H13.5v-.008zm0-4.5h.008v.008H13.5v-.008zm-7.5 9h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0021 4.5H6a2.25 2.25 0 00-2.25 2.25v12.375A2.25 2.25 0 006 21.375z" />
            </svg>
          </div>
          <div>
            <h1 className="text-white text-xl font-bold mb-2">No salon set up yet</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Your billing dashboard will be available once you've finished setting up your salon.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate("/onboarding")}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm py-3 px-4 rounded-xl transition-colors"
            >
              Complete setup
            </button>
            <button
              onClick={() => navigate("/manage")}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm py-3 px-4 rounded-xl transition-colors"
            >
              Back to account
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (checkoutStatus === "error") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 text-center gap-4">
        <p className="text-white font-semibold">Couldn't start checkout</p>
        <p className="text-zinc-400 text-sm max-w-xs">
          There was a problem connecting to Stripe. You can choose your plan from the billing dashboard.
        </p>
        <button
          onClick={() => setCheckoutStatus("idle")}
          className="bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm py-2.5 px-5 rounded-xl transition-colors"
        >
          Go to billing
        </button>
      </div>
    );
  }

  return <BillingPage salonId={salonId} />;
}

export default App;
