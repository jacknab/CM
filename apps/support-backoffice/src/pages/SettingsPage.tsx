import { useState } from "react";
import { Settings, Bell, Shield, Palette, Globe, Save } from "lucide-react";

type Section = "general" | "notifications" | "security" | "appearance" | "integrations";

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "general",       label: "General",         icon: <Settings size={15} /> },
  { id: "notifications", label: "Notifications",   icon: <Bell size={15} /> },
  { id: "security",      label: "Security",        icon: <Shield size={15} /> },
  { id: "appearance",    label: "Appearance",      icon: <Palette size={15} /> },
  { id: "integrations",  label: "Integrations",    icon: <Globe size={15} /> },
];

function GeneralSettings() {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Platform Name</label>
        <input defaultValue="Certxa Back Office" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Support Email</label>
        <input defaultValue="support@certxa.com" type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Time Zone</label>
        <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white">
          <option>UTC</option>
          <option>America/New_York</option>
          <option>America/Chicago</option>
          <option>America/Los_Angeles</option>
          <option>Europe/London</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Business Hours</label>
        <div className="flex gap-3">
          <input defaultValue="09:00" type="time" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100" />
          <span className="flex items-center text-slate-400 text-sm">to</span>
          <input defaultValue="17:00" type="time" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100" />
        </div>
      </div>
    </div>
  );
}

function NotificationSettings() {
  const items = [
    { label: "New ticket created", desc: "Get alerted when a customer opens a new support ticket", on: true },
    { label: "Ticket escalated", desc: "Notify me when a ticket is escalated to my team", on: true },
    { label: "SLA breach warning", desc: "Alert 30 minutes before an SLA breach", on: true },
    { label: "Account suspended", desc: "Notify me when an agent suspends an account", on: false },
    { label: "New agent registered", desc: "Alert when a new support agent is invited", on: false },
    { label: "Service health alerts", desc: "Receive alerts when a service goes offline", on: true },
  ];
  return (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.label} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
          <div>
            <div className="text-sm font-medium text-slate-700">{item.label}</div>
            <div className="text-xs text-slate-400 mt-0.5">{item.desc}</div>
          </div>
          <button
            className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 relative ${item.on ? "bg-indigo-600" : "bg-slate-200"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${item.on ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
      ))}
    </div>
  );
}

function SecuritySettings() {
  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-700">
        <strong>Auth bypass is currently enabled.</strong> Set <code className="bg-amber-100 px-1 py-0.5 rounded">SUPPORT_REQUIRE_AUTH=true</code> in your environment to enforce login.
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Session Timeout</label>
        <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white">
          <option>30 minutes</option>
          <option>1 hour</option>
          <option>4 hours</option>
          <option>8 hours</option>
          <option>24 hours</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-3">IP Allowlist</label>
        <textarea
          placeholder="Add trusted IPs (one per line)…"
          rows={4}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 font-mono resize-none"
        />
        <p className="text-xs text-slate-400 mt-1">Leave blank to allow all IPs. CIDR notation supported (e.g. 10.0.0.0/8).</p>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700">Require 2FA for admin roles</div>
          <div className="text-xs text-slate-400 mt-0.5">Enforce two-factor authentication for Administrator and Manager roles</div>
        </div>
        <button className="w-10 h-5 rounded-full bg-slate-200 flex-shrink-0 relative">
          <span className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow" />
        </button>
      </div>
    </div>
  );
}

function IntegrationsSettings() {
  const integrations = [
    { name: "Stripe", status: "connected", desc: "Billing, invoices, and subscription management" },
    { name: "Mailgun", status: "connected", desc: "Transactional emails and system notifications" },
    { name: "Twilio", status: "connected", desc: "SMS messaging and AI receptionist phone numbers" },
    { name: "OpenAI", status: "connected", desc: "AI receptionist and ticket auto-categorisation" },
    { name: "Sentry", status: "not_connected", desc: "Error tracking and performance monitoring" },
    { name: "Slack", status: "not_connected", desc: "Alert notifications to your Slack workspace" },
    { name: "Datadog", status: "not_connected", desc: "Infrastructure monitoring and APM" },
  ];
  return (
    <div className="space-y-3">
      {integrations.map(i => (
        <div key={i.name} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div className="w-9 h-9 bg-white rounded-lg border border-slate-200 flex items-center justify-center flex-shrink-0">
            <Globe size={14} className="text-slate-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">{i.name}</span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                i.status === "connected" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
              }`}>{i.status === "connected" ? "Connected" : "Not connected"}</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{i.desc}</p>
          </div>
          <button className={`text-xs px-3 py-1.5 rounded-lg font-medium transition flex-shrink-0 ${
            i.status === "connected"
              ? "border border-slate-200 text-slate-600 hover:bg-white"
              : "bg-indigo-600 hover:bg-indigo-700 text-white"
          }`}>
            {i.status === "connected" ? "Configure" : "Connect"}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [active, setActive] = useState<Section>("general");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-800">Settings</h1>
          <p className="text-slate-500 text-sm mt-1">Configure back-office preferences, notifications, and integrations</p>
        </div>

        <div className="flex gap-6">
          <div className="w-44 flex-shrink-0">
            <nav className="space-y-0.5">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    active === s.id
                      ? "bg-indigo-600/10 text-indigo-700"
                      : "text-slate-500 hover:text-slate-700 hover:bg-white"
                  }`}
                >
                  {s.icon}
                  {s.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-5 capitalize">
                {SECTIONS.find(s => s.id === active)?.label} Settings
              </h2>

              {active === "general"       && <GeneralSettings />}
              {active === "notifications" && <NotificationSettings />}
              {active === "security"      && <SecuritySettings />}
              {active === "appearance"    && (
                <div className="text-sm text-slate-500 py-4">Appearance customisation coming soon. Dark mode and theme options will appear here.</div>
              )}
              {active === "integrations"  && <IntegrationsSettings />}

              {active !== "notifications" && (
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition"
                  >
                    <Save size={14} />
                    Save Changes
                  </button>
                  {saved && <span className="text-xs text-emerald-600 font-medium">✓ Saved</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
