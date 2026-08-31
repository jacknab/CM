import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { confirm, appAlert } from "@/lib/confirm";
import { 
  Save, 
  X, 
  Trash2, 
  Edit3, 
  Check, 
  RefreshCw,
  Search,
  ChevronLeft,
  Users,
  Calendar,
  DollarSign,
  Settings,
  Globe,
  BarChart3,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Package,
  CreditCard,
  FileText,
  Mail,
  MessageSquare,
  Phone
} from 'lucide-react';

interface StoreData {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  category: string;
  timezone: string;
  bookingSlug: string;
  bookingTheme: string;
  commissionPayoutFrequency: string;
  userId: string;
  userEmail: string;
  userFirstName: string;
  userLastName: string;
  createdAt: string;
  lastLogin?: string;
  accountStatus: string;
  subscription?: string;
}

interface TrialStatus {
  isActive: boolean;
  endDate: string;
  daysRemaining: number;
  planType: string;
  trialStartedAt: string;
  trialEndsAt: string;
  subscriptionStatus?: string;
}

interface StoreAnalytics {
  totalAppointments: number;
  activeStaffCount: number;
  totalCustomers: number;
  monthlyRevenue: number;
  averageRating: number;
  lastActivity: string;
}

interface GoogleBusinessProfile {
  isConnected: boolean;
  businessName: string;
  locationId: string;
  lastSyncedAt: string;
  reviewCount: number;
  averageRating: number;
}

const SectionHeader = ({ title, icon }: { title: string; icon?: React.ReactNode }) => (
  <div className="bg-[#2c3e50] text-white px-2 py-0.5 text-[11px] font-bold border-b border-white flex items-center gap-1">
    {icon}
    {title}
  </div>
);

const LabelInput = ({ label, value, onChange, type = "text", width = "w-full", options, disabled }: any) => (
  <div className="flex items-center gap-2 mb-1">
    <div className="text-[11px] text-right min-w-[100px]">{label}:</div>
    {options ? (
      <select 
        disabled={disabled}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={`bg-white border border-[#7F9DB9] px-1 py-0.5 text-[11px] h-[20px] outline-none ${width}`}
      >
        <option value="">Select...</option>
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    ) : (
      <input 
        type={type}
        disabled={disabled}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={`bg-white border border-[#7F9DB9] px-1 py-0.5 text-[11px] h-[20px] outline-none ${width}`}
      />
    )}
  </div>
);

const StatCard = ({ label, value, icon, color = "blue", trend }: { 
  label: string; 
  value: string | number; 
  icon?: React.ReactNode; 
  color?: string;
  trend?: string;
}) => (
  <div className="flex items-center gap-2 p-1 bg-white border border-[#7F9DB9]">
    <div className={`w-4 h-4 flex items-center justify-center text-${color}-600`}>
      {icon}
    </div>
    <div className="flex-1">
      <div className="text-[9px] text-gray-600">{label}</div>
      <div className="text-[11px] font-bold">{value}</div>
      {trend && (
        <div className={`text-[8px] font-medium ${
          trend.startsWith('+') ? 'text-green-600' : 'text-red-600'
        }`}>
          {trend}
        </div>
      )}
    </div>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const colors = {
    active: 'bg-green-100 text-green-800',
    trial: 'bg-yellow-100 text-yellow-800',
    suspended: 'bg-red-100 text-red-800',
    expired: 'bg-gray-100 text-gray-800'
  };
  
  return (
    <span className={`px-2 py-0.5 text-[9px] font-bold rounded ${colors[status as keyof typeof colors] || colors.trial}`}>
      {status.toUpperCase()}
    </span>
  );
};

export const StoreDatabaseEntry: React.FC = () => {
  const { storeNumber } = useParams<{ storeNumber: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [store, setStore] = useState<StoreData | null>(null);
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [analytics, setAnalytics] = useState<StoreAnalytics | null>(null);
  const [googleProfile, setGoogleProfile] = useState<GoogleBusinessProfile | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [servicesSubTab, setServicesSubTab] = useState('categories');
  const [staffData, setStaffData] = useState<any[]>([]);
  const [calendarSettings, setCalendarSettings] = useState<any>(null);
  const [smsSettings, setSmsSettings] = useState<any>(null);
  const [emailSettings, setEmailSettings] = useState<any>(null);
  const [servicesData, setServicesData] = useState<any[]>([]);
  const [categoriesData, setCategoriesData] = useState<any[]>([]);
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [staffStatusFilter, setStaffStatusFilter] = useState('');
  const [aiReceptionistEnabled, setAiReceptionistEnabled] = useState(false);
  const [aiReceptionistPhone, setAiReceptionistPhone] = useState<string | null>(null);
  const [aiPhoneDraft, setAiPhoneDraft] = useState('');
  const [aiWebhookUrl, setAiWebhookUrl] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPhoneSaving, setAiPhoneSaving] = useState(false);
  const [aiPhoneError, setAiPhoneError] = useState<string | null>(null);

  async function toggleAiReceptionist() {
    if (!store?.id || aiBusy) return;
    setAiBusy(true);
    try {
      const res = await fetch(`/api/admin/stores/${store.id}/ai-receptionist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !aiReceptionistEnabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiReceptionistEnabled(data.enabled ?? !aiReceptionistEnabled);
        if (data.phoneNumber !== undefined) setAiReceptionistPhone(data.phoneNumber);
        if (data.webhookUrl !== undefined) setAiWebhookUrl(data.webhookUrl);
      }
    } catch (e) {
      console.error('Failed to toggle AI Receptionist', e);
    } finally {
      setAiBusy(false);
    }
  }

  async function saveAiPhone() {
    if (!store?.id || aiPhoneSaving) return;
    setAiPhoneSaving(true);
    setAiPhoneError(null);
    try {
      const res = await fetch(`/api/admin/stores/${store.id}/ai-receptionist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phoneNumber: aiPhoneDraft.trim() || null }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setAiPhoneError(data?.message ?? `Save failed (HTTP ${res.status})`);
        return;
      }
      setAiReceptionistPhone(data.phoneNumber ?? null);
      setAiPhoneDraft(data.phoneNumber ?? '');
      setAiWebhookUrl(data.webhookUrl ?? null);
    } catch (e: any) {
      setAiPhoneError(e?.message ?? 'Network error');
    } finally {
      setAiPhoneSaving(false);
    }
  }

  async function clearAiPhone() {
    if (!store?.id || aiPhoneSaving) return;
    if (!(await confirm("Remove the Twilio number from this store? Inbound calls will stop reaching the AI."))) return;
    setAiPhoneSaving(true);
    setAiPhoneError(null);
    try {
      const res = await fetch(`/api/admin/stores/${store.id}/ai-receptionist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phoneNumber: null }),
      });
      if (res.ok) {
        setAiReceptionistPhone(null);
        setAiPhoneDraft('');
        setAiWebhookUrl(null);
      }
    } finally {
      setAiPhoneSaving(false);
    }
  }
  
  useEffect(() => {
    fetchData();
  }, [storeNumber]);

  const calculateStoreAnalytics = async (storeId: number): Promise<StoreAnalytics> => {
    try {
      // Fetch real data from your existing tables
      const [
        appointmentsResponse,
        staffResponse,
        customersResponse,
        servicesResponse
      ] = await Promise.all([
        fetch(`/api/appointments?storeId=${storeId}`),
        fetch(`/api/staff?storeId=${storeId}`),
        fetch(`/api/customers?storeId=${storeId}`),
        fetch(`/api/services?storeId=${storeId}`)
      ]);

      const appointments = appointmentsResponse.ok ? await appointmentsResponse.json() : [];
      const staff = staffResponse.ok ? await staffResponse.json() : [];
      const customers = customersResponse.ok ? await customersResponse.json() : [];
      const services = servicesResponse.ok ? await servicesResponse.json() : [];

      // Calculate real metrics
      const totalAppointments = Array.isArray(appointments) ? appointments.length : 0;
      const activeStaffCount = Array.isArray(staff) ? staff.length : 0;
      const totalCustomers = Array.isArray(customers) ? customers.length : 0;
      
      // Calculate monthly revenue from completed appointments
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const monthlyAppointments = Array.isArray(appointments) 
        ? appointments.filter((apt: any) => {
            const aptDate = new Date(apt.startTime);
            return aptDate.getMonth() === currentMonth && aptDate.getFullYear() === currentYear;
          })
        : [];
      
      const monthlyRevenue = monthlyAppointments.reduce((sum: number, apt: any) => {
        return sum + (apt.price || 0);
      }, 0);

      // Get last activity
      const lastActivity = Array.isArray(appointments) && appointments.length > 0
        ? appointments.reduce((latest: any, apt: any) => 
            new Date(apt.startTime) > new Date(latest.startTime) ? apt : latest
          ).startTime
        : new Date().toISOString();

      return {
        totalAppointments,
        activeStaffCount,
        totalCustomers,
        monthlyRevenue,
        averageRating: 0, // Would need reviews table
        lastActivity
      };
    } catch (err) {
      console.error('Error calculating analytics:', err);
      return {
        totalAppointments: 0,
        activeStaffCount: 0,
        totalCustomers: 0,
        monthlyRevenue: 0,
        averageRating: 0,
        lastActivity: new Date().toISOString()
      };
    }
  };

  const fetchTabData = async (storeId: number) => {
    try {
      // Fetch data for all tabs in parallel
      const [
        staffResponse,
        calendarResponse,
        smsResponse,
        emailResponse,
        servicesResponse,
        categoriesResponse
      ] = await Promise.all([
        fetch(`/api/admin/stores/${storeId}/staff`),
        fetch(`/api/admin/stores/${storeId}/calendar-settings`),
        fetch(`/api/admin/stores/${storeId}/sms-settings`),
        fetch(`/api/admin/stores/${storeId}/email-settings`),
        fetch(`/api/admin/stores/${storeId}/services`),
        fetch(`/api/admin/stores/${storeId}/service-categories`)
      ]);

      if (staffResponse.ok) setStaffData(await staffResponse.json());
      if (calendarResponse.ok) setCalendarSettings(await calendarResponse.json());
      if (smsResponse.ok) setSmsSettings(await smsResponse.json());
      if (emailResponse.ok) setEmailSettings(await emailResponse.json());
      if (servicesResponse.ok) setServicesData(await servicesResponse.json());
      if (categoriesResponse.ok) setCategoriesData(await categoriesResponse.json());

    } catch (err) {
      console.error('Error fetching tab data:', err);
    }
  };

  const fetchData = async () => {
    if (!storeNumber) return;
    setLoading(true);
    try {
      // Fetch Store Data
      const response = await fetch(`/api/admin/stores/${storeNumber}`);
      if (response.ok) {
        const storeData = await response.json();
        setStore(storeData);

      // Fetch Trial Status
      try {
        const trialResponse = await fetch(`/api/admin/users/${storeData?.userId}/trial-status`);
        if (trialResponse.ok) {
          const trial = await trialResponse.json();
          setTrialStatus(trial);
        }
      } catch {
        // Trial status not available for this store
      }

      // Fetch Analytics
      try {
        const analyticsResponse = await fetch(`/api/admin/stores/${storeData?.id}/analytics`);
        if (analyticsResponse.ok) {
          const realAnalytics = await analyticsResponse.json();
          setAnalytics(realAnalytics);
        } else {
          // Fallback to calculated analytics if dedicated endpoint doesn't exist
          const calculatedAnalytics = await calculateStoreAnalytics(storeData?.id);
          setAnalytics(calculatedAnalytics);
        }
      } catch {
        const calculatedAnalytics = await calculateStoreAnalytics(storeData?.id);
        setAnalytics(calculatedAnalytics);
      }

      // Fetch AI Receptionist state
      try {
        const aiResponse = await fetch(`/api/admin/stores/${storeData?.id}/ai-receptionist`, {
          credentials: 'include',
        });
        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          setAiReceptionistEnabled(aiData.enabled ?? false);
          setAiReceptionistPhone(aiData.phoneNumber ?? null);
          setAiPhoneDraft(aiData.phoneNumber ?? '');
          setAiWebhookUrl(aiData.webhookUrl ?? null);
        }
      } catch {
        // AI Receptionist state not available
      }

      // Fetch data for all other tabs
      await fetchTabData(storeData?.id);

      // Fetch Google Profile from database
      try {
        const profileResponse = await fetch(`/api/google-business/profile/${storeData?.id}`);
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          if (profileData.profile) {
            setGoogleProfile({
              isConnected: profileData.profile.isConnected,
              businessName: profileData.profile.businessName || storeData?.name || '',
              locationId: profileData.profile.locationId || '',
              lastSyncedAt: profileData.profile.lastSyncedAt || new Date().toISOString(),
              reviewCount: 0, // We'll need a separate endpoint for review count
              averageRating: 0, // We'll need a separate endpoint for rating
            });
          } else {
            // No profile exists
            setGoogleProfile({
              isConnected: false,
              businessName: storeData?.name || '',
              locationId: '',
              lastSyncedAt: '',
              reviewCount: 0,
              averageRating: 0,
            });
          }
        }
      } catch {
        // Set default disconnected state
        setGoogleProfile({
          isConnected: false,
          businessName: storeData?.name || '',
          locationId: '',
          lastSyncedAt: '',
          reviewCount: 0,
          averageRating: 0,
        });
      }
    }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStore = async (field: keyof StoreData, value: any) => {
    if (!store) return;
    setStore({ ...store, [field]: value });
  };

  const saveChanges = async () => {
    if (!store) return;
    try {
      const response = await fetch(`/api/admin/stores/${store.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: store.name,
          email: store.email,
          phone: store.phone,
          address: store.address,
          city: store.city,
          state: store.state,
          postcode: store.postcode,
          category: store.category,
          timezone: store.timezone,
        }),
      });
      if (!response.ok) throw new Error('Save failed');
      setIsEditMode(false);
      void appAlert("Changes saved successfully", "Saved");
    } catch (err) {
      console.error('Error saving changes:', err);
      void appAlert("Failed to save changes", "Error");
    }
  };

  const handleExtendTrial = async () => {
    if (!store?.userId) return;
    try {
      const response = await fetch(`/api/admin/users/${store.userId}/extend-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalDays: 30 })
      });
      if (response.ok) {
        void appAlert("Trial extended by 30 days", "Done");
        fetchData();
      }
    } catch (err) {
      console.error('Error extending trial:', err);
      void appAlert("Failed to extend trial", "Error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#D4D0C8]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="p-4 text-center">
        <h2 className="text-xl font-bold">Store Not Found</h2>
        <button onClick={() => navigate(-1)} className="mt-4 text-blue-600 underline">Go Back</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#D4D0C8] font-['Tahoma','sans-serif'] text-black select-none">
      {/* Title Bar */}
      <div className="bg-[#2c3e50] text-white p-1 flex justify-between items-center h-[28px] border-b border-white shadow-[inset_1px_1px_#ffffff,inset_-1px_-1px_#808080]">
        <div className="flex items-center gap-1 ml-1">
          <div className="w-4 h-4 bg-white flex items-center justify-center">
            <div className="w-3 h-3 border border-[#2c3e50]"></div>
          </div>
          <span className="text-[11px] font-bold">Store Database Entry</span>
        </div>
        <div className="flex gap-[2px] mr-1">
          <button className="w-4 h-4 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] text-black text-[10px] flex items-center justify-center font-bold">_</button>
          <button className="w-4 h-4 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] text-black text-[10px] flex items-center justify-center font-bold">□</button>
          <button onClick={() => navigate(-1)} className="w-4 h-4 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] text-black text-[10px] flex items-center justify-center font-bold">X</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex gap-1 p-1 bg-[#D4D0C8] border-b border-[#808080]">
        <button 
          onClick={saveChanges}
          disabled={!isEditMode}
          className="flex items-center gap-1 px-2 py-0.5 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] hover:bg-[#E1E1E1] active:shadow-[inset_1px_1px_#000000] disabled:opacity-50 disabled:shadow-none"
        >
          <Save size={12} className="text-blue-800" />
          <span className="text-[11px]">Save</span>
        </button>
        <button 
          onClick={() => setIsEditMode(false)}
          className="flex items-center gap-1 px-2 py-0.5 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] hover:bg-[#E1E1E1] active:shadow-[inset_1px_1px_#000000]"
        >
          <X size={12} className="text-red-600" />
          <span className="text-[11px]">Cancel</span>
        </button>
        <div className="flex-1"></div>
        <button 
          onClick={() => setIsEditMode(!isEditMode)}
          className={`flex items-center gap-1 px-4 py-0.5 border border-white shadow-[1px_1px_#000000] hover:bg-[#E1E1E1] active:shadow-[inset_1px_1px_#000000] ${isEditMode ? 'bg-yellow-200' : 'bg-[#D4D0C8]'}`}
        >
          <Edit3 size={12} className="text-blue-800" />
          <span className="text-[11px] font-bold">{isEditMode ? 'VIEW MODE' : 'EDIT MODE'}</span>
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="bg-[#2c3e50] text-white p-1 flex gap-1 border-b border-white">
        {[
          { id: 'overview', label: 'Overview', icon: <BarChart3 size={12} /> },
          { id: 'business', label: 'Business', icon: <Settings size={12} /> },
          { id: 'staff', label: 'Staff', icon: <Users size={12} /> },
          { id: 'services', label: 'Services', icon: <Package size={12} /> },
          { id: 'calendar', label: 'Calendar', icon: <Calendar size={12} /> },
          { id: 'sms', label: 'SMS', icon: <MessageSquare size={12} /> },
          { id: 'email', label: 'Email', icon: <Mail size={12} /> },
          { id: 'payments', label: 'Payments', icon: <CreditCard size={12} /> },
          { id: 'integration', label: 'Integration', icon: <Globe size={12} /> },
          { id: 'analytics', label: 'Analytics', icon: <TrendingUp size={12} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${
              activeTab === tab.id 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-300 hover:text-white hover:bg-blue-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto bg-[#D4D0C8]">
        {activeTab === 'overview' && (
          <div className="p-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
              <StatCard 
                label="Monthly Revenue" 
                value={`$${analytics?.monthlyRevenue || 0}`} 
                icon={<DollarSign size={16} />}
                color="green"
              />
              <StatCard 
                label="Total Appointments" 
                value={analytics?.totalAppointments || 0} 
                icon={<Calendar size={16} />}
                color="blue"
              />
              <StatCard 
                label="Total Clients" 
                value={analytics?.totalCustomers || 0} 
                icon={<Users size={16} />}
                color="purple"
              />
              <StatCard 
                label="Active Staff" 
                value={analytics?.activeStaffCount || 0} 
                icon={<Users size={16} />}
                color="orange"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Business Overview */}
              <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
                <SectionHeader title="Business Overview" icon={<BarChart3 size={10} />} />
                <div className="p-2">
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-[10px] font-medium">Store Name</span>
                    <span className="text-[10px] text-gray-900">{store.name}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-[10px] font-medium">Category</span>
                    <span className="text-[10px] text-gray-900">{store.category}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-[10px] font-medium">Booking Slug</span>
                    <span className="text-[10px] text-blue-600">{store.bookingSlug}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[10px] font-medium">Account Status</span>
                    <StatusBadge status={store.accountStatus || 'active'} />
                  </div>
                </div>
              </div>

              {/* Trial Status Section */}
              <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
                <SectionHeader title="Account Status" icon={<Clock size={10} />} />
                <div className="p-2">
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-[10px] font-medium">Account Created</span>
                    <span className="text-[10px] text-gray-900">
                      {store.createdAt ? new Date(store.createdAt).toLocaleDateString() : 'Unknown'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-[10px] font-medium">Account Status</span>
                    <span className="text-[10px]">
                      {trialStatus?.subscriptionStatus === 'active' ? (
                        <span className="text-blue-600 font-bold">SUBSCRIBED</span>
                      ) : trialStatus?.subscriptionStatus === 'trial' && trialStatus?.isActive ? (
                        <span className="text-green-600 font-bold">TRIAL ACTIVE</span>
                      ) : trialStatus?.subscriptionStatus === 'trial' ? (
                        <span className="text-red-600 font-bold">TRIAL EXPIRED</span>
                      ) : (
                        <span className="text-gray-600 font-bold">{(trialStatus?.subscriptionStatus || 'UNKNOWN').toUpperCase()}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-[10px] font-medium">Days Remaining</span>
                    <span className="text-[10px] font-bold">
                      {trialStatus?.subscriptionStatus === 'active' ? (
                        <span className="text-blue-600">Active Account</span>
                      ) : trialStatus?.isActive && trialStatus?.daysRemaining != null ? (
                        <span className="text-green-600">{trialStatus.daysRemaining} days</span>
                      ) : (
                        <span className="text-red-600">0 days</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[10px] font-medium">Trial End Date</span>
                    <span className="text-[10px] text-gray-900">
                      {trialStatus?.subscriptionStatus === 'active'
                        ? 'N/A'
                        : trialStatus?.trialEndsAt
                          ? new Date(trialStatus.trialEndsAt).toLocaleDateString()
                          : 'Not Set'
                      }
                    </span>
                  </div>
                  {trialStatus?.subscriptionStatus === 'trial' && !trialStatus.isActive && trialStatus.trialEndsAt && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                      <div className="text-[9px] text-red-800 font-bold text-center">
                        ⚠️ FREE TRIAL EXPIRED
                      </div>
                      <div className="text-[8px] text-red-700 text-center mt-1">
                        Account expired on {new Date(trialStatus.trialEndsAt).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                  {trialStatus?.subscriptionStatus === 'trial' && trialStatus.isActive && trialStatus.daysRemaining != null && trialStatus.daysRemaining <= 3 && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                      <div className="text-[9px] text-yellow-800 font-bold text-center">
                        ⚠️ TRIAL EXPIRING SOON
                      </div>
                      <div className="text-[8px] text-yellow-700 text-center mt-1">
                        {trialStatus.daysRemaining} days remaining in free trial
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* User Account */}
              <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
                <SectionHeader title="User Account" icon={<Users size={10} />} />
                <div className="p-2">
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-[10px] font-medium">User Email</span>
                    <span className="text-[10px] text-gray-900">{store.userEmail}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-[10px] font-medium">User Name</span>
                    <span className="text-[10px] text-gray-900">
                      {store.userFirstName} {store.userLastName}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[10px] font-medium">Last Login</span>
                    <span className="text-[10px] text-gray-900">
                      {store.lastLogin ? new Date(store.lastLogin).toLocaleDateString() : 'Never'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Account Actions */}
              <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
                <SectionHeader title="Account Actions" icon={<Settings size={10} />} />
                <div className="p-2">
                  <button 
                    onClick={handleExtendTrial}
                    className="w-full flex items-center gap-2 px-2 py-1 bg-blue-600 text-white text-[10px] hover:bg-blue-700 mb-2"
                  >
                    <Clock size={12} />
                    Extend Trial 30 Days
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'business' && (
          <div className="p-2">
            <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
              <SectionHeader title="Business Information" icon={<Settings size={10} />} />
              <div className="p-2">
                <LabelInput label="Store Name" value={store.name} onChange={(v: any) => handleUpdateStore('name', v)} disabled={!isEditMode} />
                <LabelInput label="Email" value={store.email} onChange={(v: any) => handleUpdateStore('email', v)} disabled={!isEditMode} />
                <LabelInput label="Phone" value={store.phone} onChange={(v: any) => handleUpdateStore('phone', v)} disabled={!isEditMode} />
                <LabelInput label="Address" value={store.address} onChange={(v: any) => handleUpdateStore('address', v)} disabled={!isEditMode} />
                <div className="flex gap-2">
                  <LabelInput label="City" value={store.city} onChange={(v: any) => handleUpdateStore('city', v)} disabled={!isEditMode} />
                  <LabelInput label="State" value={store.state} onChange={(v: any) => handleUpdateStore('state', v)} width="w-12" disabled={!isEditMode} />
                  <LabelInput label="Zip" value={store.postcode} onChange={(v: any) => handleUpdateStore('postcode', v)} width="w-16" disabled={!isEditMode} />
                </div>
                <div className="flex gap-2">
                  <LabelInput label="Category" value={store.category} onChange={(v: any) => handleUpdateStore('category', v)} disabled={!isEditMode} />
                  <LabelInput label="Timezone" value={store.timezone} onChange={(v: any) => handleUpdateStore('timezone', v)} disabled={!isEditMode} />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="p-2">
            {/* Staff Search and Filter */}
            <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8] mb-3">
              <SectionHeader title="Staff Management" icon={<Users size={10} />} />
              <div className="p-2">
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <div className="text-[10px] font-medium mb-1">Search Staff:</div>
                    <input 
                      type="text"
                      placeholder="Search by name, email, or phone..."
                      value={staffSearchTerm}
                      onChange={(e) => setStaffSearchTerm(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-[#7F9DB9] text-[11px] h-[20px] outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="text-[10px] font-medium">Commission:</div>
                    <select 
                      value={staffStatusFilter}
                      onChange={(e) => setStaffStatusFilter(e.target.value)}
                      className="px-2 py-1 bg-white border border-[#7F9DB9] text-[11px] h-[20px] outline-none"
                    >
                      <option value="">All Staff</option>
                      <option value="active">Commission Enabled</option>
                      <option value="inactive">Commission Disabled</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Staff List */}
              <div className="overflow-auto" style={{ maxHeight: '400px' }}>
                {staffData.length > 0 ? (
                  <table className="w-full text-[10px]">
                    <thead className="bg-[#F5F5F5] text-gray-600 border-b border-gray-300 sticky top-0 z-10">
                      <tr>
                        <th className="w-32 border-r border-gray-300 py-1 font-normal pl-2 text-left">Name</th>
                        <th className="w-40 border-r border-gray-300 py-1 font-normal pl-2 text-left">Email</th>
                        <th className="w-32 border-r border-gray-300 py-1 font-normal pl-2 text-left">Phone</th>
                        <th className="w-24 border-r border-gray-300 py-1 font-normal pl-2 text-center">Role</th>
                        <th className="w-24 border-r border-gray-300 py-1 font-normal pl-2 text-center">Commission</th>
                        <th className="w-32 border-r border-gray-300 py-1 font-normal pl-2 text-left">Created</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {staffData
                        .filter((staffMember: any) => {
                          // Apply search filter
                          const matchesSearch = staffSearchTerm === '' || 
                            staffMember.name.toLowerCase().includes(staffSearchTerm.toLowerCase()) ||
                            staffMember.email.toLowerCase().includes(staffSearchTerm.toLowerCase()) ||
                            (staffMember.phone && staffMember.phone.includes(staffSearchTerm));
                          
                          // Apply commission filter instead of status
                          const matchesStatus = staffStatusFilter === '' || 
                            (staffStatusFilter === 'active' && staffMember.commissionEnabled) ||
                            (staffStatusFilter === 'inactive' && !staffMember.commissionEnabled);
                          
                          return matchesSearch && matchesStatus;
                        })
                        .map((staffMember: any) => (
                          <tr key={staffMember.id} className="border-b border-gray-200 hover:bg-gray-50">
                            <td className="p-2">
                              <div className="font-medium text-[10px]">{staffMember.name}</div>
                            </td>
                            <td className="p-2">
                              <div className="text-[10px] text-blue-600">{staffMember.email}</div>
                            </td>
                            <td className="p-2">
                              <div className="text-[10px]">{staffMember.phone}</div>
                            </td>
                            <td className="p-2 text-center">
                              <div className="text-[10px] text-gray-600">{staffMember.role}</div>
                            </td>
                            <td className="p-2 text-center">
                              <StatusBadge status={staffMember.commissionEnabled ? 'active' : 'inactive'} />
                            </td>
                            <td className="p-2">
                              <div className="text-[10px] text-gray-600">Staff Member</div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-8">
                    <Users size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600 mb-4">No staff members found</p>
                    <p className="text-sm text-gray-500">
                      This store hasn't added any staff members yet.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'services' && (
          <div className="p-2">
            {/* Services Sub-Tab Navigation */}
            <div className="bg-[#2c3e50] text-white p-1 flex gap-1 border-b border-white mb-2">
              {[
                { id: 'categories', label: 'Categories', icon: <Package size={10} /> },
                { id: 'services', label: 'Services', icon: <Settings size={10} /> },
                { id: 'addons', label: 'Addons', icon: <FileText size={10} /> },
                { id: 'products', label: 'Products', icon: <Package size={10} /> },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setServicesSubTab(tab.id)}
                  className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    servicesSubTab === tab.id 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-300 hover:text-white hover:bg-blue-700'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Services Sub-Tab Content */}
            {servicesSubTab === 'categories' && (
              <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
                <SectionHeader title="Service Categories" icon={<Package size={10} />} />
                <div className="p-2">
                  {categoriesData.length > 0 ? (
                    <div className="space-y-2">
                      {categoriesData.map((category: any) => (
                        <div key={category.id} className="flex items-center justify-between p-2 bg-white border border-[#7F9DB9]">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded" style={{ backgroundColor: category.color || '#gray' }}></div>
                            <div>
                              <div className="text-[10px] font-bold">{category.name}</div>
                              <div className="text-[9px] text-gray-600">{category.description}</div>
                            </div>
                          </div>
                          <div className="text-[9px] text-gray-500">
                            {category.serviceCount || 0} services
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Package size={48} className="mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-600 mb-4">No service categories found</p>
                      <p className="text-sm text-gray-500">
                        This store hasn't created any service categories yet.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {servicesSubTab === 'services' && (
              <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
                <SectionHeader title="Services & Pricing" icon={<Settings size={10} />} />
                <div className="p-2">
                  {servicesData.length > 0 ? (
                    <div className="space-y-2">
                      {servicesData.map((service: any) => (
                        <div key={service.id} className="flex items-center justify-between p-2 bg-white border border-[#7F9DB9]">
                          <div className="flex-1">
                            <div className="text-[10px] font-bold">{service.name}</div>
                            <div className="text-[9px] text-gray-600">{service.description}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-bold">${service.price}</div>
                            <div className="text-[9px] text-gray-500">{service.duration} min</div>
                            <StatusBadge status={service.isActive ? 'active' : 'inactive'} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Settings size={48} className="mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-600 mb-4">No services found</p>
                      <p className="text-sm text-gray-500">
                        This store hasn't created any services yet.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {servicesSubTab === 'addons' && (
              <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
                <SectionHeader title="Service Addons" icon={<FileText size={10} />} />
                <div className="p-2">
                  <div className="text-center py-8">
                    <FileText size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600 mb-4">Service addons management</p>
                    <p className="text-sm text-gray-500">
                      Manage additional services, upgrades, and optional extras.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {servicesSubTab === 'products' && (
              <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
                <SectionHeader title="Products & Inventory" icon={<Package size={10} />} />
                <div className="p-2">
                  <div className="text-center py-8">
                    <Package size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600 mb-4">Product management interface</p>
                    <p className="text-sm text-gray-500">
                      Manage retail products, inventory, and product sales.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="p-2">
            <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
              <SectionHeader title="Calendar Settings" icon={<Calendar size={10} />} />
              <div className="p-2">
                {calendarSettings ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-[10px] font-medium">Start of Week</span>
                      <span className="text-[10px] text-gray-900">{calendarSettings.startOfWeek}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-[10px] font-medium">Time Slot Interval</span>
                      <span className="text-[10px] text-gray-900">{calendarSettings.timeSlotInterval} minutes</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-[10px] font-medium">Booking Buffer</span>
                      <span className="text-[10px] text-gray-900">{calendarSettings.bookingBufferTime} minutes</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-[10px] font-medium">Max Advance Booking</span>
                      <span className="text-[10px] text-gray-900">{calendarSettings.maxAdvanceBookingDays} days</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-[10px] font-medium">Same Day Booking</span>
                      <StatusBadge status={calendarSettings.allowSameDayBooking ? 'active' : 'inactive'} />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600 mb-4">No calendar settings found</p>
                    <p className="text-sm text-gray-500">
                      This store hasn't configured calendar settings yet.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sms' && (
          <div className="p-2">
            <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
              <SectionHeader title="SMS Settings" icon={<MessageSquare size={10} />} />
              <div className="p-2">
                {smsSettings ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-[10px] font-medium">Appointment Reminders</span>
                      <StatusBadge status={smsSettings.appointmentReminders ? 'active' : 'inactive'} />
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-[10px] font-medium">Reminder Hours</span>
                      <span className="text-[10px] text-gray-900">{smsSettings.reminderHours} hours</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-[10px] font-medium">Review Requests</span>
                      <StatusBadge status={smsSettings.reviewRequests ? 'active' : 'inactive'} />
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-[10px] font-medium">SMS Provider</span>
                      <span className="text-[10px] text-gray-900">{smsSettings.providerName || 'Not configured'}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-[10px] font-medium">API Key</span>
                      <span className="text-[10px] text-gray-900">{smsSettings.apiKey ? '•••••••••••' : 'Not configured'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <MessageSquare size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600 mb-4">No SMS settings found</p>
                    <p className="text-sm text-gray-500">
                      This store hasn't configured SMS notifications yet.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'email' && (
          <div className="p-2">
            <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
              <SectionHeader title="Email Settings" icon={<Mail size={10} />} />
              <div className="p-2">
                {emailSettings ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-[10px] font-medium">Appointment Confirmations</span>
                      <StatusBadge status={emailSettings.appointmentConfirmations ? 'active' : 'inactive'} />
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-[10px] font-medium">Reminder Emails</span>
                      <StatusBadge status={emailSettings.reminderEmails ? 'active' : 'inactive'} />
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-[10px] font-medium">Review Requests</span>
                      <StatusBadge status={emailSettings.reviewRequests ? 'active' : 'inactive'} />
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-[10px] font-medium">Mailgun Domain</span>
                      <span className="text-[10px] text-gray-900">{emailSettings.mailgunDomain || 'Not configured'}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-[10px] font-medium">API Key</span>
                      <span className="text-[10px] text-gray-900">{emailSettings.mailgunApiKey ? '•••••••••••' : 'Not configured'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Mail size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600 mb-4">No email settings found</p>
                    <p className="text-sm text-gray-500">
                      This store hasn't configured email notifications yet.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="p-2">
            <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
              <SectionHeader title="Payment Settings" icon={<CreditCard size={10} />} />
              <div className="p-2">
                <div className="text-center py-8">
                  <CreditCard size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-4">Payment configuration</p>
                  <p className="text-sm text-gray-500">
                    Payment methods, commission settings, and financial reporting.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'integration' && (
          <div className="p-2 space-y-2">
            {/* AI Voice Receptionist */}
            <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
              <SectionHeader title="AI Voice Receptionist" icon={<Phone size={10} />} />
              <div className="p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[12px] font-bold text-gray-800">Phone Booking Assistant</span>
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                        aiReceptionistEnabled
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : 'bg-gray-200 text-gray-600 border border-gray-300'
                      }`}>
                        {aiReceptionistEnabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-snug mb-2">
                      OpenAI Realtime voice receptionist that answers inbound calls and handles
                      <span className="font-semibold"> book · cancel · reschedule</span> with caller
                      recognition by phone number.
                    </p>
                    {aiReceptionistPhone ? (
                      <div className="text-[11px] text-gray-700 mb-1">
                        <span className="font-semibold">Current Twilio number:</span>{' '}
                        <span className="font-mono">{aiReceptionistPhone}</span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-700 mb-1">
                        No Twilio number provisioned for this store yet.
                      </div>
                    )}

                    {/* Phone number input + save */}
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="tel"
                        value={aiPhoneDraft}
                        onChange={(e) => { setAiPhoneDraft(e.target.value); setAiPhoneError(null); }}
                        placeholder="+1 212 555 0123"
                        disabled={aiPhoneSaving || !store?.id}
                        className="flex-1 px-2 py-1 text-[12px] font-mono border border-gray-400 bg-white shadow-[inset_1px_1px_#808080] focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={saveAiPhone}
                        disabled={
                          aiPhoneSaving ||
                          !store?.id ||
                          aiPhoneDraft.trim() === (aiReceptionistPhone ?? '')
                        }
                        className="px-3 py-1 text-[11px] font-bold border border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100 shadow-[1px_1px_#000000] active:shadow-[inset_1px_1px_#000000] disabled:opacity-40 whitespace-nowrap"
                      >
                        {aiPhoneSaving ? '…' : 'Save number'}
                      </button>
                      {aiReceptionistPhone && (
                        <button
                          onClick={clearAiPhone}
                          disabled={aiPhoneSaving}
                          className="px-2 py-1 text-[11px] font-bold border border-gray-400 bg-gray-50 text-gray-700 hover:bg-gray-100 shadow-[1px_1px_#000000] active:shadow-[inset_1px_1px_#000000] disabled:opacity-40 whitespace-nowrap"
                          title="Remove the Twilio number from this store"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {aiPhoneError && (
                      <div className="mt-1 text-[10px] text-red-700 font-semibold">{aiPhoneError}</div>
                    )}

                    {aiWebhookUrl && (
                      <div className="mt-2 p-2 bg-white/60 border border-gray-300 rounded">
                        <div className="text-[10px] font-bold text-gray-700 mb-0.5">
                          Twilio webhook URL — paste into the number's "A call comes in" setting in the Twilio Console:
                        </div>
                        <div className="flex items-center gap-1">
                          <code className="flex-1 text-[10px] font-mono text-gray-900 break-all">{aiWebhookUrl}</code>
                          <button
                            onClick={() => { navigator.clipboard?.writeText(aiWebhookUrl); }}
                            className="px-2 py-0.5 text-[10px] font-bold border border-gray-400 bg-gray-50 hover:bg-gray-100"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="text-[10px] text-gray-500 mt-2 leading-snug">
                      Enter the Twilio phone number you've purchased for this salon, then configure that number
                      in the Twilio Console to POST inbound calls to the webhook URL shown above. The salon
                      owner cannot see this control — admin-only.
                    </div>
                  </div>
                  <button
                    onClick={toggleAiReceptionist}
                    disabled={aiBusy || !store?.id}
                    className={`px-4 py-1.5 text-[11px] font-bold border shadow-[1px_1px_#000000] active:shadow-[inset_1px_1px_#000000] whitespace-nowrap ${
                      aiReceptionistEnabled
                        ? 'bg-red-50 border-red-300 text-red-800 hover:bg-red-100'
                        : 'bg-green-50 border-green-300 text-green-800 hover:bg-green-100'
                    } disabled:opacity-50`}
                  >
                    {aiBusy ? '…' : aiReceptionistEnabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            </div>

            {/* Other integrations placeholder */}
            <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
              <SectionHeader title="Other Integrations" icon={<Globe size={10} />} />
              <div className="p-2">
                <div className="text-center py-6">
                  <Globe size={32} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-[11px] text-gray-600">Third-party integrations</p>
                  <p className="text-[10px] text-gray-500">
                    Google Business Profile, social media, calendar sync, and API connections.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="p-2">
            <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
              <SectionHeader title="Analytics & Reports" icon={<TrendingUp size={10} />} />
              <div className="p-2">
                <div className="text-center py-8">
                  <TrendingUp size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-4">Performance analytics</p>
                  <p className="text-sm text-gray-500">
                    Revenue reports, client analytics, staff performance, and growth metrics.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Buttons */}
      <div className="p-1 flex justify-between bg-[#D4D0C8] border-t border-white">
        <div className="flex gap-1">
          <button className="px-4 py-0.5 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] text-[11px] hover:bg-[#E1E1E1] active:shadow-[inset_1px_1px_#000000]">
            Password Reset
          </button>
        </div>
        <div className="flex gap-1">
          <button 
            onClick={saveChanges}
            disabled={!isEditMode}
            className="px-6 py-0.5 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] text-[11px] hover:bg-[#E1E1E1] active:shadow-[inset_1px_1px_#000000] disabled:opacity-50"
          >
            ✓ OK
          </button>
          <button 
            onClick={() => navigate(-1)}
            className="px-6 py-0.5 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] text-[11px] hover:bg-[#E1E1E1] active:shadow-[inset_1px_1px_#000000]"
          >
            X Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
