import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { AdminLayout } from './AdminLayout';
import { StockItemManager } from './StockItemManager';
import { StoreDatabaseEntry } from './StoreDatabaseEntry';
import { UnifiedServiceManager } from './UnifiedServiceManager';
import { FulfillmentManager } from './FulfillmentManager';
import { UsersManager } from './UsersManager';
import { SettingsManager } from './SettingsManager';
import { InvoicesManager } from './InvoicesManager';
import { PlatformSettingsManager } from './PlatformSettingsManager';
import BillingDashboard from './BillingDashboard';
import { BillingPlansManager } from './BillingPlansManager';
import PlanFeaturesBuilder from './PlanFeaturesBuilder';
import IllustrationLibrary from './IllustrationLibrary';
import SeoAgentAdmin from './SeoAgentAdmin';
import WalletManager from './WalletManager';
import ServiceStatusPage from './ServiceStatusPage';
import StoreManager from './StoreManager';
import { DashboardOverview } from './DashboardOverview';
import BlogManager from './BlogManager';
import PlatformEmailCampaigns from './PlatformEmailCampaigns';
import { getStoreId } from '../../config.js';
import { apiRequest } from '../../services/api.js';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, ShieldAlert, LogIn } from 'lucide-react';

// ─── Admin Login Gate ──────────────────────────────────────────────────────────
// Shown when the user visits /isadmin/* without an active admin session.
function AdminLoginGate() {
  const { user, isLoading, login, loginError, isLoggingIn } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    try {
      await login({ email, password });
      // On success the parent re-renders with the new user — no navigation needed
    } catch (err: any) {
      setLocalError(err?.message ?? 'Login failed');
    }
  };

  // While the auth check is in flight, show a spinner
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a232e]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  // Logged in but not an admin
  if (user && !(user as any).isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#1a232e] gap-4">
        <ShieldAlert className="w-12 h-12 text-red-400" />
        <h1 className="text-xl font-bold text-white">Access Denied</h1>
        <p className="text-gray-400 text-sm">
          Your account ({(user as any).email}) does not have platform-admin access.
        </p>
      </div>
    );
  }

  // Not logged in — show login form
  return (
    <div className="flex items-center justify-center h-screen bg-[#1a232e]">
      <div className="bg-[#2c3e50] rounded-2xl shadow-2xl p-8 w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center">
              <LogIn className="w-6 h-6 text-white" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-white">Back Office</h1>
          <p className="text-sm text-gray-400">Sign in with your platform admin account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Email
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#1a232e] border border-[#34495e] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="admin@certxa.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#1a232e] border border-[#34495e] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          {/* Error */}
          {(localError || loginError) && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg px-3 py-2 text-sm text-red-300">
              {localError || (loginError as Error)?.message || 'Login failed'}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            {isLoggingIn ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600">
          Certxa Back Office · Platform Admin Only
        </p>
      </div>
    </div>
  );
}

// ─── Main AdminDashboard ────────────────────────────────────────────────────────
/**
 * AdminDashboard — Main container for the admin/back office section.
 * Handles routing and store context for all admin pages.
 *
 * Renders an inline login screen when no admin session is active so that
 * navigating to /isadmin/* on the VPS without a session shows a proper
 * login form instead of a flood of 401 errors.
 */
export const AdminDashboard: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [storeId, setStoreId] = useState<number | undefined>();
  const [businessType] = useState<string>('nail_salon');
  const [unpaidInvoicesCount, setUnpaidInvoicesCount] = useState<number | null>(null);
  const [pastDueInvoicesCount, setPastDueInvoicesCount] = useState<number | null>(null);
  const navigate = useNavigate();

  // ── Gate: loading / not authenticated / not admin ──────────────────────────
  // isLoading: auth check in flight (first render, or session refresh)
  // !user: definitely not logged in
  // !(user as any).isAdmin: logged in but not a platform admin
  if (isLoading || !user || !(user as any).isAdmin) {
    return <AdminLoginGate />;
  }

  // ── Authenticated admin — continue with normal initialisation ──────────────
  // This block runs only inside the JSX render, so hooks above are always
  // called in the same order. Store-ID setup and invoice count fetching live
  // in the inner AdminDashboardContent component to keep hooks-order stable.
  return <AdminDashboardContent
    unpaidInvoicesCount={unpaidInvoicesCount}
    setUnpaidInvoicesCount={setUnpaidInvoicesCount}
    pastDueInvoicesCount={pastDueInvoicesCount}
    setPastDueInvoicesCount={setPastDueInvoicesCount}
    storeId={storeId}
    setStoreId={setStoreId}
    businessType={businessType}
    navigate={navigate}
  />;
};

// Split out into a child component so we never call hooks conditionally above.
interface ContentProps {
  unpaidInvoicesCount: number | null;
  setUnpaidInvoicesCount: (n: number | null) => void;
  pastDueInvoicesCount: number | null;
  setPastDueInvoicesCount: (n: number | null) => void;
  storeId: number | undefined;
  setStoreId: (n: number | undefined) => void;
  businessType: string;
  navigate: ReturnType<typeof useNavigate>;
}

function AdminDashboardContent({
  unpaidInvoicesCount,
  setUnpaidInvoicesCount,
  pastDueInvoicesCount,
  setPastDueInvoicesCount,
  storeId,
  setStoreId,
  businessType,
  navigate,
}: ContentProps) {
  useEffect(() => {
    const sid = getStoreId();
    if (sid) {
      const numericId = Number(sid);
      if (!isNaN(numericId)) {
        setStoreId(numericId);
      }
    } else {
      setStoreId(1000);
    }

    const fetchInvoiceCounts = async () => {
      try {
        const unpaidResponse = await apiRequest('/api/billing/invoices/unpaid/count');
        setUnpaidInvoicesCount(unpaidResponse.count);

        const pastDueResponse = await apiRequest('/api/billing/invoices/past-due/count');
        setPastDueInvoicesCount(pastDueResponse.count);
      } catch (error) {
        console.error('Failed to fetch invoice counts:', error);
      }
    };

    fetchInvoiceCounts();
  }, []);

  if (!storeId) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-3" />
          <div className="text-xl font-bold text-gray-700 mb-2">Loading…</div>
          <div className="text-sm text-gray-500">Initializing admin dashboard</div>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <Routes>
        <Route path="/" element={<DashboardOverview
          unpaidInvoicesCount={unpaidInvoicesCount}
          pastDueInvoicesCount={pastDueInvoicesCount}
          onUnpaidInvoicesClick={() => navigate('/isadmin/invoices', { state: { filter: 'unpaid' } })}
          onPastDueInvoicesClick={() => navigate('/isadmin/invoices', { state: { filter: 'past_due' } })}
        />} />
        <Route path="/stock-items"           element={<StockItemManager />} />
        <Route path="/store-entry/:storeNumber" element={<StoreDatabaseEntry />} />
        <Route path="/services"              element={<UnifiedServiceManager storeId={storeId} businessType={businessType} />} />
        <Route path="/fulfillment"           element={<FulfillmentManager />} />
        <Route path="/platform-settings"     element={<PlatformSettingsManager />} />
        <Route path="/stores"                element={<StoreManager />} />
        <Route path="/users"                 element={<UsersManager />} />
        <Route path="/settings"              element={<SettingsManager />} />
        <Route path="/invoices"              element={<InvoicesManager />} />
        <Route path="/billing"               element={<BillingDashboard />} />
        <Route path="/billing/plans"         element={<BillingPlansManager />} />
        <Route path="/plans/:planId/features" element={<PlanFeaturesBuilder />} />
        <Route path="/illustration-library"  element={<IllustrationLibrary />} />
        <Route path="/seo-agent"             element={<SeoAgentAdmin />} />
        <Route path="/wallets"               element={<WalletManager />} />
        <Route path="/status"                element={<ServiceStatusPage />} />
        <Route path="/blog"                  element={<BlogManager />} />
        <Route path="/blog/*"               element={<BlogManager />} />
        <Route path="/platform-emails"      element={<PlatformEmailCampaigns />} />
      </Routes>
    </AdminLayout>
  );
}
