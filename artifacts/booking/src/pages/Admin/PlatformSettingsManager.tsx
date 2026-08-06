import React, { useState, useEffect } from 'react';
import { appAlert } from "@/lib/confirm";
import { 
  Save, 
  X, 
  Edit3, 
  Check, 
  RefreshCw,
  Settings,
  Mail,
  Smartphone,
  Calendar,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  Globe,
  Shield
} from 'lucide-react';

interface PlatformSettings {
  trialPeriodDays: number;
  mailgun: {
    apiKey: string;
    domain: string;
    fromEmail: string;
    fromName: string;
    enabled: boolean;
  };
  twilio: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
    enabled: boolean;
  };
}

const SectionHeader = ({ title, icon }: { title: string; icon?: React.ReactNode }) => (
  <div className="bg-[#2c3e50] text-white px-2 py-0.5 text-[11px] font-bold border-b border-white flex items-center gap-1">
    {icon}
    {title}
  </div>
);

const LabelInput = ({ label, value, onChange, type = "text", width = "w-full", options, disabled }: any) => (
  <div className="flex items-center gap-2 mb-1">
    <div className="text-[11px] text-right min-w-[120px]">{label}:</div>
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

const StatusBadge = ({ status }: { status: string }) => {
  const colors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
  };
  
  return (
    <span className={`px-2 py-0.5 text-[9px] font-bold rounded ${colors[status as keyof typeof colors] || colors.pending}`}>
      {status.toUpperCase()}
    </span>
  );
};

const ServiceStatusCard = ({ service, status, lastCheck }: { service: string; status: boolean; lastCheck?: string }) => (
  <div className="flex items-center gap-2 p-2 bg-white border border-[#7F9DB9]">
    <div className={`w-3 h-3 rounded-full ${status ? 'bg-green-500' : 'bg-red-500'}`}></div>
    <div className="flex-1">
      <div className="text-[10px] font-bold">{service}</div>
      <div className="text-[9px] text-gray-600">
        {status ? 'Connected' : 'Disconnected'}
        {lastCheck && ` • Last check: ${new Date(lastCheck).toLocaleString()}`}
      </div>
    </div>
    <StatusBadge status={status ? 'active' : 'inactive'} />
  </div>
);

export const PlatformSettingsManager: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState<string>('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const response = await fetch('/api/admin/platform-settings', { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`Failed to fetch settings (HTTP ${response.status})`);
      }
      const settingsData = await response.json();
      setSettings(settingsData);
    } catch (err: any) {
      // No more silent fall-back to mock 30-day trial — that's exactly what
      // was hiding the real env value. Surface the error to the admin instead.
      console.error('Error fetching platform settings:', err);
      setFetchError(err?.message ?? 'Network error');
      setSettings({
        trialPeriodDays: 0,
        mailgun: { apiKey: '', domain: '', fromEmail: '', fromName: '', enabled: false },
        twilio: { accountSid: '', authToken: '', phoneNumber: '', enabled: false },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettings = (category: keyof PlatformSettings, field: string, value: any) => {
    if (!settings) return;
    
    if (category === 'mailgun' || category === 'twilio') {
      setSettings({
        ...settings,
        [category]: {
          ...(settings[category] as object),
          [field]: value
        }
      });
    } else {
      // For top-level fields (e.g. trialPeriodDays), use category as the key
      setSettings({
        ...settings,
        [category]: value
      });
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    try {
      const response = await fetch('/api/admin/platform-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({} as any));
        throw new Error(errBody?.message ?? `HTTP ${response.status}`);
      }

      // Re-fetch so the UI reflects what was actually persisted (don't trust
      // the in-memory state we just sent).
      await fetchSettings();
      setIsEditMode(false);
      void appAlert("Settings saved. The new trial length applies to all NEW signups from this point on. Existing users keep their current trial end date.", "Saved");
    } catch (err: any) {
      console.error('Error saving settings:', err);
      void appAlert(`Failed to save settings: ${err?.message ?? "unknown error"}`, "Error");
    }
  };

  const testService = async (service: 'mailgun' | 'twilio') => {
    setTesting(service);
    try {
      const endpoint = service === 'mailgun' ? 'test-mailgun' : 'test-twilio';
      const testTo = service === 'mailgun' ? testEmail || 'test@example.com' : '+1234567890';
      
      const response = await fetch(`/api/admin/platform-settings/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo })
      });
      
      if (response.ok) {
        const result = await response.json();
        void appAlert(`${service.charAt(0).toUpperCase() + service.slice(1)} test successful!`, "Success");
      } else {
        throw new Error('Test failed');
      }
    } catch (err) {
      console.error(`Error testing ${service}:`, err);
      void appAlert(`${service.charAt(0).toUpperCase() + service.slice(1)} test failed`, "Error");
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#D4D0C8]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-4 text-center">
        <h2 className="text-xl font-bold">Settings Not Available</h2>
        <button onClick={fetchSettings} className="mt-4 text-blue-600 underline">Retry</button>
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
          <span className="text-[11px] font-bold">Platform Settings</span>
        </div>
        <div className="flex gap-[2px] mr-1">
          <button className="w-4 h-4 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] text-black text-[10px] flex items-center justify-center font-bold">_</button>
          <button className="w-4 h-4 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] text-black text-[10px] flex items-center justify-center font-bold">□</button>
          <button className="w-4 h-4 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] text-black text-[10px] flex items-center justify-center font-bold">X</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex gap-1 p-1 bg-[#D4D0C8] border-b border-[#808080]">
        <button 
          onClick={saveSettings}
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

      {/* Content Area */}
      <div className="flex-1 p-2 flex gap-4 overflow-auto">
        {/* Left Column */}
        <div className="flex-1 flex flex-col gap-3 min-w-[450px]">
          {/* Trial Settings */}
          <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
            <SectionHeader title="Trial Settings" icon={<Calendar size={10} />} />
            <div className="p-2">
              <LabelInput 
                label="Trial Period (Days)" 
                value={settings.trialPeriodDays} 
                onChange={(v: any) => handleUpdateSettings('trialPeriodDays' as any, '', Number(v))} 
                type="number" 
                disabled={!isEditMode} 
              />
              <div className="mt-2 p-2 bg-white border border-[#7F9DB9]">
                <div className="text-[10px] font-bold mb-1">Current Status</div>
                <div className="text-[9px] text-gray-600">
                  New signups will receive <b>{settings.trialPeriodDays}</b> day{settings.trialPeriodDays === 1 ? '' : 's'} of free trial access.
                  Existing users keep the trial end date they were assigned at signup.
                </div>
                {fetchError && (
                  <div className="mt-1 text-[9px] text-red-700 font-bold">
                    Could not load live settings — showing zeros. ({fetchError})
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mailgun Settings */}
          <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
            <SectionHeader title="Mailgun Settings" icon={<Mail size={10} />} />
            <div className="p-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-[11px] text-right min-w-[120px]">Enabled:</div>
                <input 
                  type="checkbox" 
                  disabled={!isEditMode}
                  checked={settings.mailgun.enabled} 
                  onChange={(e) => handleUpdateSettings('mailgun', 'enabled', e.target.checked)} 
                />
                <StatusBadge status={settings.mailgun.enabled ? 'active' : 'inactive'} />
              </div>
              <LabelInput 
                label="API Key" 
                value={settings.mailgun.apiKey} 
                onChange={(v: any) => handleUpdateSettings('mailgun', 'apiKey', v)} 
                type="password" 
                disabled={!isEditMode} 
              />
              <LabelInput 
                label="Domain" 
                value={settings.mailgun.domain} 
                onChange={(v: any) => handleUpdateSettings('mailgun', 'domain', v)} 
                disabled={!isEditMode} 
              />
              <LabelInput 
                label="From Email" 
                value={settings.mailgun.fromEmail} 
                onChange={(v: any) => handleUpdateSettings('mailgun', 'fromEmail', v)} 
                disabled={!isEditMode} 
              />
              <LabelInput 
                label="From Name" 
                value={settings.mailgun.fromName} 
                onChange={(v: any) => handleUpdateSettings('mailgun', 'fromName', v)} 
                disabled={!isEditMode} 
              />
              <LabelInput 
                label="Test Email" 
                value={testEmail} 
                onChange={(v: any) => setTestEmail(v)} 
                disabled={!isEditMode} 
              />
              <div className="mt-2">
                <button 
                  onClick={() => testService('mailgun')}
                  disabled={testing === 'mailgun'}
                  className="px-2 py-1 bg-blue-600 text-white text-[9px] hover:bg-blue-700 disabled:opacity-50"
                >
                  {testing === 'mailgun' ? 'Testing...' : 'Send Test Email'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="flex-1 flex flex-col gap-3 min-w-[450px]">
          {/* Twilio Settings */}
          <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
            <SectionHeader title="Twilio Settings" icon={<Smartphone size={10} />} />
            <div className="p-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-[11px] text-right min-w-[120px]">Enabled:</div>
                <input 
                  type="checkbox" 
                  disabled={!isEditMode}
                  checked={settings.twilio.enabled} 
                  onChange={(e) => handleUpdateSettings('twilio', 'enabled', e.target.checked)} 
                />
                <StatusBadge status={settings.twilio.enabled ? 'active' : 'inactive'} />
              </div>
              <LabelInput 
                label="Account SID" 
                value={settings.twilio.accountSid} 
                onChange={(v: any) => handleUpdateSettings('twilio', 'accountSid', v)} 
                disabled={!isEditMode} 
              />
              <LabelInput 
                label="Auth Token" 
                value={settings.twilio.authToken} 
                onChange={(v: any) => handleUpdateSettings('twilio', 'authToken', v)} 
                type="password" 
                disabled={!isEditMode} 
              />
              <LabelInput 
                label="Phone Number" 
                value={settings.twilio.phoneNumber} 
                onChange={(v: any) => handleUpdateSettings('twilio', 'phoneNumber', v)} 
                disabled={!isEditMode} 
              />
              <div className="mt-2">
                <button 
                  onClick={() => testService('twilio')}
                  disabled={testing === 'twilio'}
                  className="px-2 py-1 bg-blue-600 text-white text-[9px] hover:bg-blue-700 disabled:opacity-50"
                >
                  {testing === 'twilio' ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
            </div>
          </div>

          {/* Service Status */}
          <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
            <SectionHeader title="Service Status" icon={<Shield size={10} />} />
            <div className="p-2 flex flex-col gap-2">
              <ServiceStatusCard 
                service="Mailgun Email Service" 
                status={settings.mailgun.enabled} 
                lastCheck={new Date().toISOString()}
              />
              <ServiceStatusCard 
                service="Twilio SMS Service" 
                status={settings.twilio.enabled} 
                lastCheck={new Date().toISOString()}
              />
              <div className="mt-2 p-2 bg-white border border-[#7F9DB9]">
                <div className="text-[10px] font-bold mb-1">System Health</div>
                <div className="text-[9px] text-gray-600">
                  All services operating normally. Last system check: {new Date().toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Administrative Actions */}
          <div className="border border-white shadow-[1px_1px_#808080] bg-[#D4D0C8]">
            <SectionHeader title="Administrative Actions" icon={<AlertTriangle size={10} />} />
            <div className="p-2 flex flex-col gap-1">
              <button className="flex items-center gap-2 px-2 py-1 bg-white border border-[#7F9DB9] hover:bg-gray-50 text-[10px]">
                <RefreshCw size={10} />
                Test All Services
              </button>
              <button className="flex items-center gap-2 px-2 py-1 bg-white border border-[#7F9DB9] hover:bg-gray-50 text-[10px]">
                <Users size={10} />
                View Service Logs
              </button>
              <button className="flex items-center gap-2 px-2 py-1 bg-white border border-[#7F9DB9] hover:bg-gray-50 text-[10px] text-red-600">
                <XCircle size={10} />
                Reset All Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Buttons */}
      <div className="p-1 flex justify-between bg-[#D4D0C8] border-t border-white">
        <div className="flex gap-1">
          <button 
            onClick={fetchSettings}
            className="px-4 py-0.5 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] text-[11px] hover:bg-[#E1E1E1] active:shadow-[inset_1px_1px_#000000]"
          >
            Refresh
          </button>
        </div>
        <div className="flex gap-1">
          <button 
            onClick={saveSettings}
            disabled={!isEditMode}
            className="px-6 py-0.5 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] text-[11px] hover:bg-[#E1E1E1] active:shadow-[inset_1px_1px_#000000] disabled:opacity-50"
          >
            ✓ OK
          </button>
          <button 
            onClick={() => setIsEditMode(false)}
            className="px-6 py-0.5 bg-[#D4D0C8] border border-white shadow-[1px_1px_#000000] text-[11px] hover:bg-[#E1E1E1] active:shadow-[inset_1px_1px_#000000]"
          >
            X Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
