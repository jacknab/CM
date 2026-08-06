import React, { useEffect, useState } from 'react';
import { dbAdapter as supabase } from '../../lib/db-adapter';
import { apiRequest } from '../../services/api.js';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  CreditCard, 
  DollarSign, 
  Activity,
  Store,
  Calendar,
  Clock
} from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon: React.ComponentType<any>;
  color: string;
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtext, trend, trendValue, icon: Icon, color, onClick }) => (
  <div 
    className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex items-start justify-between cursor-pointer hover:shadow-md transition-shadow"
    onClick={onClick}
  >
    <div>
      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-gray-800 mb-2">{value}</h3>
      <div className="flex items-center">
        {trend && (
          <span className={`flex items-center text-xs font-bold mr-2 ${
            trend === 'up' ? 'text-green-600' : 
            trend === 'down' ? 'text-red-600' : 'text-gray-600'
          }`}>
            {trend === 'up' ? <TrendingUp size={14} className="mr-1" /> : 
             trend === 'down' ? <TrendingDown size={14} className="mr-1" /> : 
             <Activity size={14} className="mr-1" />}
            {trendValue}
          </span>
        )}
        {subtext && <span className="text-gray-400 text-xs">{subtext}</span>}
      </div>
    </div>
    <div className={`p-3 rounded-lg ${color} bg-opacity-10 text-white`}>
      <Icon size={24} className={color.replace('bg-', 'text-')} />
    </div>
  </div>
);

export interface DashboardOverviewProps {
  unpaidInvoicesCount: number | null;
  pastDueInvoicesCount: number | null;
  onUnpaidInvoicesClick: () => void;
  onPastDueInvoicesClick: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ unpaidInvoicesCount, pastDueInvoicesCount, onUnpaidInvoicesClick, onPastDueInvoicesClick }) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalAccounts: 0,
    newAccountsThisMonth: 0,
    newAccountsLastMonth: 0,
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    mrr: 0,
    mrrGrowth: 0,
    newSubsThisMonth: 0,
    newSubsLastMonth: 0,
    trialUsers: 0
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch real dashboard stats from API
        const response = await apiRequest('/api/admin/dashboard/stats');
        setStats({
          totalAccounts: response.totalAccounts,
          newAccountsThisMonth: response.newAccountsThisMonth,
          newAccountsLastMonth: response.newAccountsLastMonth,
          totalSubscriptions: response.totalSubscriptions,
          activeSubscriptions: response.activeSubscriptions,
          mrr: response.mrr,
          mrrGrowth: response.mrrGrowth,
          newSubsThisMonth: response.newSubsThisMonth,
          newSubsLastMonth: response.newSubsLastMonth,
          trialUsers: response.trialUsers || 0
        });
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        // Set default values on error
        setStats({
          totalAccounts: 0,
          newAccountsThisMonth: 0,
          newAccountsLastMonth: 0,
          totalSubscriptions: 0,
          activeSubscriptions: 0,
          mrr: 0,
          mrrGrowth: 0,
          newSubsThisMonth: 0,
          newSubsLastMonth: 0,
          trialUsers: 0
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getTrend = (current: number, previous: number) => {
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'neutral';
  };

  const getTrendText = (current: number, previous: number) => {
    const diff = current - previous;
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff} vs last month`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#f0f2f5] overflow-y-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard Overview</h1>
        <p className="text-gray-500 text-sm mt-1">Welcome back, Admin. Here's what's happening with your business.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard 
          title="Total Revenue (MRR)" 
          value={`$${stats.mrr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
          subtext="Monthly Recurring Revenue"
          trend={stats.mrrGrowth >= 0 ? 'up' : 'down'}
          trendValue={`${stats.mrrGrowth.toFixed(1)}%`}
          icon={DollarSign}
          color="bg-green-600"
        />
        
        <StatCard 
          title="Total Accounts" 
          value={stats.totalAccounts} 
          subtext="Registered Stores"
          trend={getTrend(stats.newAccountsThisMonth, stats.newAccountsLastMonth)}
          trendValue={getTrendText(stats.newAccountsThisMonth, stats.newAccountsLastMonth)}
          icon={Store}
          color="bg-blue-600"
        />

        <StatCard 
          title="Active Subscriptions" 
          value={stats.activeSubscriptions} 
          subtext={`${stats.totalSubscriptions} Total Records`}
          trend={getTrend(stats.newSubsThisMonth, stats.newSubsLastMonth)}
          trendValue={getTrendText(stats.newSubsThisMonth, stats.newSubsLastMonth)}
          icon={CreditCard}
          color="bg-purple-600"
        />

        <StatCard 
          title="New Clients (Mo)" 
          value={stats.newAccountsThisMonth} 
          subtext="This Month"
          trend={getTrend(stats.newAccountsThisMonth, stats.newAccountsLastMonth)}
          trendValue={`${stats.newAccountsLastMonth} last month`}
          icon={Users}
          color="bg-orange-500"
        />

        <StatCard 
          title="Free Trial Users" 
          value={stats.trialUsers} 
          subtext="Currently on trial"
          icon={Clock}
          color="bg-teal-600"
        />

        <StatCard 
          title="Unpaid Invoices" 
          value={unpaidInvoicesCount !== null ? unpaidInvoicesCount : '--'} 
          subtext="Total unpaid"
          icon={CreditCard}
          color="bg-red-600"
          onClick={onUnpaidInvoicesClick}
        />

        <StatCard 
          title="Past Due Invoices" 
          value={pastDueInvoicesCount !== null ? pastDueInvoicesCount : '--'} 
          subtext="Total past due"
          icon={CreditCard}
          color="bg-yellow-600"
          onClick={onPastDueInvoicesClick}
        />
      </div>

      {/* Recent Activity / Detailed View Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <Activity size={18} className="mr-2 text-blue-600" />
            Growth Insights
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-600">New Stores This Month</p>
                <p className="text-2xl font-bold text-gray-900">{stats.newAccountsThisMonth}</p>
              </div>
              <div className={`text-sm font-bold ${stats.newAccountsThisMonth >= stats.newAccountsLastMonth ? 'text-green-600' : 'text-red-500'}`}>
                {stats.newAccountsThisMonth >= stats.newAccountsLastMonth ? 'On Track' : 'Slowing Down'}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-600">New Subscriptions This Month</p>
                <p className="text-2xl font-bold text-gray-900">{stats.newSubsThisMonth}</p>
              </div>
              <div className={`text-sm font-bold ${stats.newSubsThisMonth >= stats.newSubsLastMonth ? 'text-green-600' : 'text-yellow-600'}`}>
                {stats.newSubsThisMonth - stats.newSubsLastMonth} vs Last Month
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-600">Subscription Conversion Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.totalAccounts > 0 ? ((stats.activeSubscriptions / stats.totalAccounts) * 100).toFixed(1) : 0}%
                </p>
              </div>
              <div className="text-sm text-gray-500">
                Active / Total Stores
              </div>
            </div>
          </div>
        </div>

        {/* Placeholder for future charts or lists */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 flex flex-col justify-center items-center text-center">
          <div className="p-4 bg-blue-50 rounded-full mb-4">
            <Calendar size={32} className="text-blue-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Revenue Forecast</h3>
          <p className="text-gray-500 text-sm max-w-xs mb-6">
            Based on current active subscriptions, your estimated annual run rate (ARR) is:
          </p>
          <div className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-500">
            ${(stats.mrr * 12).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <p className="text-xs text-gray-400 mt-2 uppercase tracking-wide font-bold">Projected ARR</p>
        </div>
      </div>
    </div>
  );
};
