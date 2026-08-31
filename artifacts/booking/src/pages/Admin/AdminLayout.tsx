import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  ShoppingBag, 
  Wrench, 
  Settings, 
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  Package,
  CreditCard,
  Tag,
  ImageIcon,
  Zap,
  Wallet,
  Activity,
  BookOpen,
  Mails,
  UserCog,
} from 'lucide-react';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { path: '/isadmin/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/isadmin/stock-items', label: 'ACCOUNTS', icon: ShoppingBag },
    { path: '/isadmin/wallets', label: 'WALLETS', icon: Wallet },
    { path: '/isadmin/billing', label: 'BILLING', icon: CreditCard },
    { path: '/isadmin/billing/plans', label: 'PLANS', icon: Tag },
    { path: '/isadmin/services', label: 'Subscriptions', icon: Wrench },
    { path: '/isadmin/fulfillment', label: 'FULFILLMENT', icon: Package },
    { path: '/isadmin/illustration-library', label: 'ILLUSTRATIONS', icon: ImageIcon },
    { path: '/isadmin/platform-settings', label: 'PLATFORM SETTINGS', icon: Settings },
    { path: '/isadmin/seo-agent', label: 'SEO AGENT', icon: Zap },
    { path: '/isadmin/status', label: 'SERVICE STATUS', icon: Activity },
    { path: '/isadmin/blog', label: 'BLOG', icon: BookOpen },
    { path: '/isadmin/platform-emails', label: 'PLATFORM EMAIL', icon: Mails },
    { path: '/isadmin/agents', label: 'AGENT ACCOUNTS', icon: UserCog },
  ];

  return (
    <div className="flex h-screen bg-gray-100" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-[#2c3e50] text-white transition-all duration-300 flex flex-col`}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#34495e]">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <ShoppingBag size={24} />
              <span className="text-xl font-bold uppercase tracking-wider">Back Office</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-[#34495e] rounded transition-colors"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                  isActive
                    ? 'bg-[#34495e] border-l-4 border-[#3498db]'
                    : 'hover:bg-[#34495e]'
                }`}
              >
                <Icon size={20} />
                {sidebarOpen && (
                  <span className="text-sm font-medium uppercase tracking-wide">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer Actions */}
        <div className="border-t border-[#34495e] p-4">
          <Link
            to="/isadmin/settings"
            className="flex items-center gap-3 px-4 py-3 hover:bg-[#34495e] rounded transition-colors"
          >
            <Settings size={20} />
            {sidebarOpen && <span className="text-sm font-medium">Settings</span>}
          </Link>
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#34495e] rounded transition-colors mt-2"
          >
            <LogOut size={20} />
            {sidebarOpen && <span className="text-sm font-medium">Exit Manager</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
};
