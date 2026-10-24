import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AppBuildCorner } from "@/components/AppBuildTag";
import { AppScreenGuard, AppBusinessGate } from "@/components/AppProfileGate";
import { currentAppProfile } from "@/lib/appProfile";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { resumeOrSignIn, UNAUTHORIZED_EVENT } from "@/lib/resumeSignIn";
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
import { isProAccount, isHiddenForProAccount } from "@shared/proAccount";
import { useTheme } from "@/hooks/use-theme";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FeatureGuard } from "@/components/FeatureGuard";
import { AdminDashboard } from "@/pages/Admin/AdminDashboard";
import BookingPresenceBeacon from "@/components/BookingPresenceBeacon";
import DevicePresenceBeacon from "@/components/DevicePresenceBeacon";
import { RequirePermission } from "@/components/RequirePermission";
import { PERMISSIONS } from "@shared/permissions";
import { AccountStatusGate } from "@/components/AccountStatusGate";
import SeoManager from "@/components/SeoManager";

const Services = lazy(() => import("@/pages/Services"));
const CatalogCategories = lazy(() => import("@/pages/catalog/CatalogCategories"));
const CatalogServices = lazy(() => import("@/pages/catalog/CatalogServices"));
const CatalogPackages = lazy(() => import("@/pages/catalog/CatalogPackages"));
const CatalogDeals = lazy(() => import("@/pages/catalog/CatalogDeals"));
const CatalogAddons = lazy(() => import("@/pages/catalog/CatalogAddons"));
const CatalogProducts = lazy(() => import("@/pages/catalog/CatalogProducts"));
const NailServices = lazy(() => import("@/pages/catalog/NailServices"));
const Customers = lazy(() => import("@/pages/Customers"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const PosCheckout = lazy(() => import("@/pages/PosCheckout"));
const Products = lazy(() => import("@/pages/Products"));
const NewBooking = lazy(() => import("@/pages/NewBooking"));
const ClientLookup = lazy(() => import("@/pages/ClientLookup"));
const POSInterface = lazy(() => import("@/pages/POSInterface"));
const ClientProfile = lazy(() => import("@/pages/ClientProfile"));
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const StaffWorkingHours = lazy(() => import("@/pages/StaffWorkingHours"));
const CashDrawer = lazy(() => import("@/pages/CashDrawer"));
const AddonsPage = lazy(() => import("@/pages/Addons"));
const SalonEarningsReport = lazy(() => import("@/pages/SalonEarningsReport"));
const CommissionReport = lazy(() => import("@/pages/CommissionReport"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const OwnerDashboard = lazy(() => import("@/pages/OwnerDashboard"));
const Reports = lazy(() => import("@/pages/Reports"));
const ReportsHub = lazy(() => import("@/pages/ReportsHub"));
const RegisterReports = lazy(() => import("@/pages/RegisterReports"));
const DayCloseReports = lazy(() => import("@/pages/DayCloseReports"));
const Waitlist = lazy(() => import("@/pages/Waitlist"));
const QueueDashboard = lazy(() => import("@/pages/queue/QueueDashboard"));
const QueueSettings = lazy(() => import("@/pages/queue/QueueSettings"));
const TurnSystem = lazy(() => import("@/pages/TurnSystem"));
const AppSettings = lazy(() => import("@/pages/app/AppSettings"));
const AppSettingsSection = lazy(() => import("@/pages/app/AppSettings").then((m) => ({ default: m.AppSettingsSection })));
const PublicCheckIn = lazy(() => import("@/pages/queue/PublicCheckIn"));
const QueueDisplay = lazy(() => import("@/pages/queue/QueueDisplay"));
const KioskCheckIn = lazy(() => import("@/pages/KioskCheckIn"));
const KioskSetup = lazy(() => import("@/pages/KioskSetup"));
const KioskTicket = lazy(() => import("@/pages/KioskTicket"));
const FrontDeskDisplay = lazy(() => import("@/pages/FrontDeskDisplay"));
const FrontDeskSetup = lazy(() => import("@/pages/FrontDeskSetup"));
const GiftCards = lazy(() => import("@/pages/GiftCards"));
const IntakeForms = lazy(() => import("@/pages/IntakeForms"));
const Loyalty = lazy(() => import("@/pages/Loyalty"));
const Reviews = lazy(() => import("@/pages/Reviews"));
const GoogleBusiness = lazy(() => import("@/pages/GoogleBusiness"));
const ReviewEntry = lazy(() => import("@/pages/ReviewEntry"));
const AiReceptionist = lazy(() => import("@/pages/AiReceptionist"));
const AiReceptionistLive = lazy(() => import("@/pages/AiReceptionistLive"));
const SmsInbox = lazy(() => import("@/pages/SmsInbox"));
const SmsActivity = lazy(() => import("@/pages/SmsActivity"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const MarketplaceAdsInfo = lazy(() => import("@/pages/MarketplaceAdsInfo"));
const ClientAtRisk = lazy(() => import("@/pages/ClientAtRisk"));
const ApiKeys = lazy(() => import("@/pages/ApiKeys"));
const EliteApiDocs = lazy(() => import("@/pages/EliteApiDocs"));
const EliteDetails = lazy(() => import("@/pages/EliteDetails"));
const MultiLocationDashboard = lazy(() => import("@/pages/MultiLocationDashboard"));
const Auth = lazy(() => import("@/pages/Auth"));
const AppLogin = lazy(() => import("@/pages/AppLogin"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const StaffAuth = lazy(() => import("@/pages/StaffAuth"));
const StaffDashboard = lazy(() => import("@/pages/StaffDashboard"));
const StaffOverview = lazy(() => import("@/pages/StaffOverview"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const OnboardingChat = lazy(() => import("@/pages/OnboardingChat"));
const SetupHub = lazy(() => import("@/pages/SetupHub"));
const ServicesFlow = lazy(() => import("@/pages/setup/ServicesFlow"));
const ServiceImportFlow = lazy(() => import("@/pages/setup/ServiceImportFlow"));
const TeamFlow = lazy(() => import("@/pages/setup/TeamFlow"));
const BookingCalendarFlow = lazy(() => import("@/pages/setup/BookingCalendarFlow"));
const POSPaymentsFlow = lazy(() => import("@/pages/setup/POSPaymentsFlow"));
const CommissionPayrollFlow = lazy(() => import("@/pages/setup/CommissionPayrollFlow"));
const MarketingFlow = lazy(() => import("@/pages/setup/MarketingFlow"));
const AIReceptionistFlow = lazy(() => import("@/pages/setup/AIReceptionistFlow"));
const WebsiteSetupFlow = lazy(() => import("@/pages/setup/WebsiteSetupFlow"));
const PublicBooking = lazy(() => import("@/pages/PublicBooking"));
const VoucherBookingPage = lazy(() => import("@/pages/VoucherBookingPage"));
const BookingWidgetPage = lazy(() => import("@/pages/BookingWidgetPage"));
const BookingConfirmation = lazy(() => import("@/pages/public-booking/BookingConfirmation"));
const ManageBooking = lazy(() => import("@/pages/public-booking/ManageBooking"));
const PublicReceipt = lazy(() => import("@/pages/public-booking/PublicReceipt"));
const CompleteBooking = lazy(() => import("@/pages/public-payment/CompleteBooking"));
const StaffCalendar = lazy(() => import("@/pages/StaffCalendar"));
const StaffProfile = lazy(() => import("@/pages/StaffProfile"));
const StaffMenu = lazy(() => import("@/pages/StaffMenu"));
const StaffLanguage = lazy(() => import("@/pages/StaffLanguage"));
const Staff1099 = lazy(() => import("@/pages/Staff1099"));
const StaffIncome = lazy(() => import("@/pages/StaffIncome"));
const StaffPOS = lazy(() => import("@/pages/StaffPOS"));
const StaffHistory = lazy(() => import("@/pages/StaffHistory"));
const NotFound = lazy(() => import("@/pages/not-found"));
const TeamLoginPage = lazy(() => import("@/pages/isTeam/LoginPage"));
const TeamApp = lazy(() => import("@/pages/isTeam/TeamApp"));
const RentalsApp = lazy(() => import("@/pages/rentals/RentalsApp"));
const RentalsMarketingHome = lazy(() => import("@/pages/rentalsMarketing/RentalsMarketingHome"));
const RentalsFeaturesPage = lazy(() => import("@/pages/rentalsMarketing/RentalsFeaturesPage"));
const RentalsHowItWorksPage = lazy(() => import("@/pages/rentalsMarketing/RentalsHowItWorksPage"));
const RentalsPricingPage = lazy(() => import("@/pages/rentalsMarketing/RentalsPricingPage"));
const RentalsResourcesPage = lazy(() => import("@/pages/rentalsMarketing/RentalsResourcesPage"));
const RentalsFaqPage = lazy(() => import("@/pages/rentalsMarketing/RentalsFaqPage"));
const RentalsAuthPage = lazy(() => import("@/pages/rentalsMarketing/RentalsAuthPage"));
const ContactPage = lazy(() => import("@/pages/ContactPage"));
const TeamPayroll = lazy(() => import("@/pages/team/TeamPayroll"));
const TeamTax1099 = lazy(() => import("@/pages/team/TeamTax1099"));
const StaffList = lazy(() => import("@/pages/team/StaffList"));
const AddStaffWizard = lazy(() => import("@/pages/team/AddStaffWizard"));
const StaffDetail = lazy(() => import("@/pages/team/StaffDetail"));
const StaffCalendarColors = lazy(() => import("@/pages/team/StaffCalendarColors"));
const ContractorOnboardingPortal = lazy(() => import("@/pages/ContractorOnboardingPortal"));
const TeamCommissions = lazy(() => import("@/pages/team/TeamCommissions"));
const StaffPaySummary = lazy(() => import("@/pages/StaffPaySummary"));
const StaffPayoutsSetup = lazy(() => import("@/pages/StaffPayoutsSetup"));
const StaffFinancialHub = lazy(() => import("@/pages/StaffFinancialHub"));
const Timeclock = lazy(() => import("@/pages/Timeclock"));
const PrintChecks = lazy(() => import("@/pages/PrintChecks"));
const CheckLayoutEditor = lazy(() => import("@/pages/CheckLayoutEditor"));
const SpaLandingPage = lazy(() => import("@/pages/SpaLandingPage"));
const TattooStudioLandingPage = lazy(() => import("@/pages/TattooStudioLandingPage"));
const AutumnLandingPage = lazy(() => import("@/pages/AutumnLandingPage"));
const AcceptInvite = lazy(() => import("@/pages/AcceptInvite"));
const ManageDashboard = lazy(() => import("@/pages/manage/ManageDashboard"));
const MembersHome = lazy(() => import("@/pages/manage/MembersHome"));
const AiReceptionistRouter = lazy(() => import("@/pages/manage/AiReceptionistRouter"));
const AiReceptionistEnrollment = lazy(() => import("@/pages/manage/AiReceptionistEnrollment"));
const AiReceptionistCallLogs = lazy(() => import("@/pages/manage/AiReceptionistCallLogs"));
const AiReceptionistInstructions = lazy(() => import("@/pages/manage/AiReceptionistInstructions"));
const CreditsTopup = lazy(() => import("@/pages/manage/CreditsTopup"));
const CustomerSupportPage = lazy(() => import("@/pages/manage/CustomerSupportPage"));
const FinancePosHub = lazy(() => import("@/pages/manage/FinancePosHub"));
const StaffEarningsHub = lazy(() => import("@/pages/manage/StaffEarningsHub"));
const PaymentSettings = lazy(() => import("@/pages/manage/PaymentSettings"));
const SettingsShell = lazy(() => import("@/pages/SettingsShell"));
const WalkInBoard = lazy(() => import("@/pages/WalkInBoard"));
const BillingPage = lazy(() => import("@/pages/manage/BillingPage"));
const DashboardBilling = lazy(() => import("@/pages/DashboardBilling"));
const AccountOverview = lazy(() => import("@/pages/AccountOverview"));
const Intelligence = lazy(() => import("@/pages/Intelligence"));
const HelpCenter = lazy(() => import("@/pages/HelpCenter"));
const SupportInbox = lazy(() => import("@/pages/SupportInbox"));
const DataTransferPage = lazy(() => import("@/pages/DataTransferPage"));
const ResourceSettings = lazy(() => import("@/pages/settings/ResourceSettings"));
const TranslationsPage = lazy(() => import("@/pages/TranslationsPage"));
const PaymentsPayouts = lazy(() => import("@/pages/finance/PaymentsPayouts"));
const POSSettings = lazy(() => import("@/pages/POSSettings"));
const NailHome = lazy(() => import("@/pages/nail/NailHome"));
const BarberHome = lazy(() => import("@/pages/barber/BarberHome"));


const authenticatedPaths = [
  // The Certxa apps' own pages (Settings, Reports, Messages — plans/certxa-apps.md).
  "/app",
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
  "/nail",
  "/barber",
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
  "/payments",
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
  "/marketplace-ads",
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
  const reserved = new Set(["www", "app", "manage", "voice", "api", "rentals"]);
  return !reserved.has(parts[0]);
}

function RootRedirect() {
  if (typeof window !== "undefined") {
    // rentals.certxa.com's root is the public marketing homepage (Phase 7) —
    // signed-in users reach the actual dashboard via Sign In / Get Started,
    // same as any other SaaS marketing site. This replaces the earlier
    // straight-to-dashboard redirect from when only the app existed there.
    if (window.location.hostname === "rentals.certxa.com") {
      return <RentalsMarketingHome />;
    }
    // <slug>.certxa.com: the server sends the booking app for a business's link, but the address stays "/".
    // PublicBooking finds the business from the host (/api/store/by-subdomain) and says so when there is none.
    if (isLikelyTenantHost(window.location.hostname)) {
      return <PublicBooking />;
    }
  }
  return <Navigate to="/auth" replace />;
}

/** Guards a route so it only ever renders on the Rentals marketing subdomain — defense in depth alongside PHP/allowlist precedence on the main domain. */
function RentalsMarketingRoute({ children }: { children: React.ReactNode }) {
  const allowedHosts = new Set(["rentals.certxa.com", "localhost", "127.0.0.1"]);
  if (typeof window !== "undefined" && !allowedHosts.has(window.location.hostname)) {
    return <NotFound />;
  }
  return <>{children}</>;
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

/** An account made in the Certxa Pro app is one calendar: the staff, commission and payroll pages send it to the calendar. */
function ProAccountRedirect() {
  const { user } = useAuth();
  const location = useLocation();
  if (isProAccount((user as any)?.accountType) && isHiddenForProAccount(location.pathname)) return <Navigate to="/calendar" replace />;
  return null;
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
            {/* No support chat bubble inside the booking app — the marketing
                site keeps its own widget (php/assets/js/livechat-widget.js).
                Signed-in users are reported to isTeam via <BookingPresenceBeacon/>
                (mounted in AppRoutes); kiosk / front-desk screens via this one. */}
            <DevicePresenceBeacon />
            {/* The Certxa app's version and build, bottom right of /nail, /frontdesk and /kiosk. */}
            <AppBuildCorner />
          </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AppRoutes() {
  const location = useLocation();
  const isPublicConfirmation =
    (location.pathname.startsWith("/booking/") && !location.pathname.startsWith("/booking/new")) ||
    location.pathname.startsWith("/b/");

  const isAuthenticatedRoute = authenticatedPaths.some(path =>
    location.pathname === path || location.pathname.startsWith(path + "/")
  ) && !isPublicConfirmation;

  const inApp = !!currentAppProfile();
  const routes = (
    <AppScreenGuard>
    <Suspense fallback={<main className="h-screen w-full flex items-center justify-center" role="status"><Loader2 className="w-7 h-7 animate-spin" /><span className="sr-only">Loading page</span></main>}>
    <ProAccountRedirect />
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
      <Route path="/manage/ai-receptionist/instructions" element={<AiReceptionistInstructions />} />
      <Route path="/manage/credits" element={<CreditsTopup />} />
      <Route path="/manage/billing/credits-topup" element={<CreditsTopup />} />
      <Route path="/manage/customer-support" element={<CustomerSupportPage />} />
      <Route path="/manage/reports" element={<Navigate to="/analytics" replace />} />
      <Route path="/manage/language" element={<Navigate to="/language-settings" replace />} />
      <Route path="/manage/finance-pos" element={<FinancePosHub />} />
      <Route path="/manage/staff-earnings" element={<StaffEarningsHub />} />
      <Route path="/manage/payment-settings" element={<PaymentSettings />} />
      {/* /settings/payout-account, /settings/translations, /settings/resources
          are now served by the SettingsShell :section route. */}

      {/* Auth */}
      <Route path="/auth" element={<Auth />} />
      <Route path="/app-login" element={<AppLogin />} />
      {/* A Certxa app's own Settings (plans/certxa-apps.md). */}
      <Route path="/app/settings" element={<AppSettings />} />
      <Route path="/app/settings/:section" element={<AppSettingsSection />} />
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
      <Route path="/redeem/:token" element={<VoucherBookingPage />} />
      <Route path="/booking/:confirmationNumber" element={<BookingConfirmation />} />
      <Route path="/b/:token" element={<ManageBooking />} />
      <Route path="/receipt/:token" element={<PublicReceipt />} />
      <Route path="/review/:id" element={<ReviewEntry />} />
      <Route path="/complete-booking/:token" element={<CompleteBooking />} />

      {/* Public queue */}
      <Route path="/q/:slug" element={<PublicCheckIn />} />
      <Route path="/q/:slug/display" element={<QueueDisplay />} />

      {/* Self check-in kiosk */}
      <Route path="/checkin-kiosk" element={<Navigate to="/kiosk-settings" replace />} />
      {/* A device set up as "Kiosk" in the certxa-owner native app lands here with no slug yet —
          redirects to its remembered /kiosk/:slug from localStorage, or asks for it once. */}
      <Route path="/kiosk" element={<KioskSetup />} />
      <Route path="/kiosk/:slug" element={<KioskCheckIn />} />
      <Route path="/kiosk/:slug/ticket/:token" element={<KioskTicket />} />

      {/* Front-desk customer-facing display (POS tablet): lightweight check-in
          + tip screen + card-payment instruction screens. NOT a self-serve kiosk. */}
      {/* A device set up as "Customer Facing Screen" in the certxa-owner native app lands here
          with no slug yet — redirects to its remembered /frontdesk/:slug(/:registerId) from
          localStorage, or asks for it once. */}
      <Route path="/frontdesk" element={<FrontDeskSetup />} />
      <Route path="/frontdesk/:slug" element={<FrontDeskDisplay />} />
      <Route path="/frontdesk/:slug/:registerId" element={<FrontDeskDisplay />} />

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

      {/* Certxa Rentals — separate product, own shell (see RentalsApp.tsx).
          Not in authenticatedPaths: like isTeam/isadmin, it's self-contained
          and doesn't use the Salon AppLayout/StoreProvider/MobileBottomNav. */}
      <Route
        path="/rentals/*"
        element={
          <RequirePermission permission={PERMISSIONS.RENTALS_VIEW} redirectTo="/overview">
            <RentalsApp />
          </RequirePermission>
        }
      />

      {/* Certxa Rentals — public marketing site (rentals.certxa.com only).
          Hostname-guarded: on certxa.com these paths are either already owned
          by a PHP page (e.g. /pricing) or simply unreachable — PHP intercepts
          first there. This guard is the actual safety net regardless. */}
      <Route path="/features" element={<RentalsMarketingRoute><RentalsFeaturesPage /></RentalsMarketingRoute>} />
      <Route path="/how-it-works" element={<RentalsMarketingRoute><RentalsHowItWorksPage /></RentalsMarketingRoute>} />
      <Route path="/pricing" element={<RentalsMarketingRoute><RentalsPricingPage /></RentalsMarketingRoute>} />
      <Route path="/resources" element={<RentalsMarketingRoute><RentalsResourcesPage /></RentalsMarketingRoute>} />
      <Route path="/faq" element={<RentalsMarketingRoute><RentalsFaqPage /></RentalsMarketingRoute>} />
      <Route path="/login" element={<RentalsMarketingRoute><RentalsAuthPage mode="login" /></RentalsMarketingRoute>} />
      <Route path="/signup" element={<RentalsMarketingRoute><RentalsAuthPage mode="signup" /></RentalsMarketingRoute>} />

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
      <Route path="/pos-settings" element={<Navigate to="/payments/checkout-tax" replace />} />
      {/* Catalog — individual pages */}
      <Route path="/catalog/categories" element={<OwnerOnlyRoute><CatalogCategories /></OwnerOnlyRoute>} />
      <Route path="/catalog/services"   element={<OwnerOnlyRoute><CatalogServices /></OwnerOnlyRoute>} />
      <Route path="/catalog/packages"   element={<OwnerOnlyRoute><CatalogPackages /></OwnerOnlyRoute>} />
      <Route path="/catalog/deals"      element={<OwnerOnlyRoute><CatalogDeals /></OwnerOnlyRoute>} />
      <Route path="/catalog/addons"     element={<OwnerOnlyRoute><CatalogAddons /></OwnerOnlyRoute>} />
      <Route path="/catalog/products"   element={<OwnerOnlyRoute><CatalogProducts /></OwnerOnlyRoute>} />
      <Route path="/catalog/nail-services" element={<OwnerOnlyRoute><NailServices /></OwnerOnlyRoute>} />
      <Route path="/catalog/resources" element={<OwnerOnlyRoute><ResourceSettings /></OwnerOnlyRoute>} />
      <Route path="/catalog/translations" element={<OwnerOnlyRoute><TranslationsPage /></OwnerOnlyRoute>} />
      <Route path="/payments/payouts" element={<OwnerOnlyRoute><PaymentsPayouts /></OwnerOnlyRoute>} />
      <Route path="/payments/checkout-tax" element={<OwnerOnlyRoute><POSSettings /></OwnerOnlyRoute>} />
      {/* legacy → new homes */}
      <Route path="/settings/pos" element={<Navigate to="/payments/checkout-tax" replace />} />
      <Route path="/settings/payout-account" element={<Navigate to="/payments/payouts" replace />} />
      <Route path="/settings/resources" element={<Navigate to="/catalog/resources" replace />} />
      <Route path="/settings/translations" element={<Navigate to="/catalog/translations" replace />} />
      <Route path="/settings/calendar-sync" element={<Navigate to="/settings/my-preferences" replace />} />
      {/* Legacy redirects */}
      <Route path="/services" element={<Navigate to="/catalog/services" replace />} />
      <Route path="/team" element={<StaffList />} />
      <Route path="/team/add" element={<AddStaffWizard />} />
      <Route path="/team/colors" element={<StaffCalendarColors />} />
      <Route path="/team/:id" element={<StaffDetail />} />
      <Route path="/staff" element={<Navigate to="/team" replace />} />
      <Route path="/staff/members" element={<Navigate to="/team" replace />} />
      <Route path="/staff/members/:id" element={<Navigate to="/team" replace />} />
      <Route path="/staff/working-hours" element={<SoloGuard><StaffWorkingHours /></SoloGuard>} />
      <Route path="/customers" element={<OwnerOnlyRoute><Customers /></OwnerOnlyRoute>} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/nail" element={<Suspense fallback={<main className="h-screen w-full flex items-center justify-center" role="status"><h1 className="sr-only">Nail salon front desk</h1><Loader2 className="w-7 h-7 animate-spin" /><span className="sr-only">Loading nail salon workspace</span></main>}><NailHome /></Suspense>} />
      <Route path="/barber" element={<Suspense fallback={<main className="h-screen w-full flex items-center justify-center" role="status">Loading barber workspace…</main>}><BarberHome /></Suspense>} />
      <Route path="/appointments" element={<Calendar />} />
      <Route path="/pos" element={<PosCheckout />} />
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
      <Route path="/reports" element={<ReportsHub />} />
      <Route path="/reports/dashboard" element={<Reports />} />
      <Route path="/reports/day-close" element={<DayCloseReports />} />
      <Route path="/register-reports" element={<RegisterReports />} />
      <Route path="/commission-report" element={<CommissionReport />} />
      <Route path="/salon-earnings" element={<SalonEarningsReport />} />
      {/* macOS-style Settings shell — left rail + detail pane, one URL per
          section (/settings/:section). Inline settings pages mount in the pane;
          the standalone routes below now redirect here. */}
      <Route path="/settings" element={<SettingsShell />} />
      <Route path="/settings/:section" element={<SettingsShell />} />
      <Route path="/kiosk-settings" element={<Navigate to="/settings/kiosk" replace />} />
      <Route path="/subscription" element={<Navigate to="/billing" replace />} />
      <Route path="/walk-in-board" element={<WalkInBoard />} />
      <Route path="/walkins" element={<WalkInBoard />} />
      <Route path="/calendar-settings" element={<Navigate to="/settings/booking-controls" replace />} />
      <Route path="/language-settings" element={<Navigate to="/settings/language" replace />} />
      <Route path="/business-settings" element={<Navigate to="/settings/business" replace />} />
      <Route path="/business-hours" element={<Navigate to="/settings/hours" replace />} />
      <Route path="/features-settings" element={<Navigate to="/settings/advanced" replace />} />
      <Route path="/payroll-settings" element={<Navigate to="/settings/commission" replace />} />
      {/* Payroll Home — single mobile-first hub for Team/Commission/Payroll.
          Old employee payroll UI moved to /payroll/employees; old contractor
          dashboard (/payouts) now redirects here — everything else under
          /payouts/* stays put as a drill-down destination reachable from the hub. */}
      <Route path="/payroll" element={<TeamPayroll />} />
      <Route path="/payroll/1099" element={<TeamTax1099 />} />
      <Route path="/payroll/employees" element={<Navigate to="/payroll" replace />} />
      <Route path="/payouts" element={<Navigate to="/payroll" replace />} />
      <Route path="/payouts/*" element={<Navigate to="/payroll" replace />} />
      <Route path="/commissions" element={<TeamCommissions />} />
      <Route path="/commissions/new" element={<Navigate to="/commissions" replace />} />
      <Route path="/timeclock" element={<SoloGuard><FeatureGuard feature="timeclock"><Timeclock /></FeatureGuard></SoloGuard>} />
      <Route path="/print-checks" element={<SoloGuard><PrintChecks /></SoloGuard>} />
      <Route path="/chkeditor" element={<CheckLayoutEditor />} />
      <Route path="/team-permissions" element={<Navigate to="/team" replace />} />
      {/* Booking Policies was merged into Booking Controls (/calendar-settings) */}
      <Route path="/booking-policies" element={<Navigate to="/settings/booking-controls" replace />} />
      <Route path="/clients/at-risk" element={<OwnerOnlyRoute><ClientAtRisk /></OwnerOnlyRoute>} />
      <Route path="/online-booking" element={<Navigate to="/settings/online-booking" replace />} />
      <Route path="/sms-settings" element={<Navigate to="/settings/client-notifications" replace />} />
      <Route path="/mail-settings" element={<Navigate to="/settings/client-notifications" replace />} />
      <Route path="/ai-receptionist" element={<AiReceptionist />} />
      <Route path="/ai-receptionist/live" element={<AiReceptionistLive />} />
      <Route path="/sms-inbox" element={<OwnerOnlyRoute><SmsInbox /></OwnerOnlyRoute>} />
      <Route path="/sms-activity" element={<OwnerOnlyRoute><SmsActivity /></OwnerOnlyRoute>} />
      <Route path="/campaigns" element={<OwnerOnlyRoute><Campaigns /></OwnerOnlyRoute>} />
      <Route path="/marketplace-ads" element={<OwnerOnlyRoute><MarketplaceAdsInfo /></OwnerOnlyRoute>} />
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
      <Route path="/manage/data-transfer" element={<Navigate to="/settings/data-transfer" replace />} />
      <Route path="/intelligence/launch" element={<Navigate to="/intelligence" replace />} />
      <Route path="/marketing" element={<Navigate to="/campaigns" replace />} />

      {/* Queue */}
      <Route path="/dashboard/queue" element={<QueueDashboard />} />
      <Route path="/dashboard/queue/settings" element={<QueueSettings />} />
      <Route path="/dashboard/turn" element={<TurnSystem />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
    </AppScreenGuard>
  );

  if (isAuthenticatedRoute) {
    return (
      <StoreProvider>
        <StaffPortalGuard>
        <SnapshotProvider>
          {/* A lost sign-in on any signed-in page: sign this device back in, or go to the sign-in page. */}
          <SignedOutRecovery />
          {/* Reports this signed-in user to isTeam → Live Visitors → Booking App Users */}
          <BookingPresenceBeacon />
          {/* Global mobile sticky header — fixed top-0, visible on every authenticated page */}
          {/* Inside a Certxa app the full platform's menus are never shown. */}
          {!inApp && <GlobalMobileHeader />}
          <AccountStatusGate>
            <AppBusinessGate>{routes}</AppBusinessGate>
          </AccountStatusGate>
          {/* No offline badge on the salon screens: /nail shows its connection in its footer; the kiosk and the
              customer screen never show the system's state to clients. */}
          {location.pathname !== "/calendar" && !/^\/(nail|kiosk|frontdesk)(\/|$)/.test(location.pathname) && <OfflineStatusBanner />}
          {!/^\/(kiosk|frontdesk)(\/|$)/.test(location.pathname) && <SyncConflictPanel />}
          {/* Global mobile bottom nav — fixed bottom-0, visible on every authenticated page */}
          {!inApp && <MobileBottomNav />}
        </SnapshotProvider>
        </StaffPortalGuard>
      </StoreProvider>
    );
  }

  // The /manage pages (dashboard, billing, AI receptionist…) are not in authenticatedPaths, so they had no store:
  // their sidebar showed "My Business" and hid everything that depends on the salon (the Nail POS link).
  // They get the store, and nothing else of the signed-in shell changes for them.
  if (location.pathname === "/manage" || location.pathname.startsWith("/manage/")) {
    return <StoreProvider>{routes}</StoreProvider>;
  }

  return routes;
}

/**
 * Mounted on every signed-in page. When a request comes back 401 (see lib/resumeSignIn.ts), or the app
 * finds nobody signed in at all, this device has lost its sign-in to the account: sign it back in as a
 * remembered device and reload, or go to the sign-in page and come back here afterwards.
 */
function SignedOutRecovery() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const here = location.pathname + location.search;
  const hereRef = useRef(here);
  hereRef.current = here;
  useEffect(() => {
    const onUnauthorized = () => { void resumeOrSignIn(hereRef.current); };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);
  useEffect(() => {
    if (!isLoading && !user && navigator.onLine) void resumeOrSignIn(hereRef.current);
  }, [isLoading, user]);
  return null;
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
