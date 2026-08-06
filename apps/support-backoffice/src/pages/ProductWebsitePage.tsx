import { Globe, CheckCircle2, AlertCircle, Clock, Shield } from "lucide-react";

const WEBSITES = [
  { account: "Luxe Hair Studio", domain: "luxehair.certxa.com", custom: null, status: "online", ssl: "valid", uptime: "99.9%" },
  { account: "Golden Scissors", domain: "goldenscissors.certxa.com", custom: "book.goldenscissors.com", status: "online", ssl: "valid", uptime: "99.7%" },
  { account: "Urban Glow Spa", domain: "urbanglow.certxa.com", custom: null, status: "online", ssl: "valid", uptime: "100%" },
  { account: "Bliss Beauty Bar", domain: "blissbeauty.certxa.com", custom: "blissbeautybar.com", status: "degraded", ssl: "valid", uptime: "98.1%" },
  { account: "The Cut Room", domain: "thecutroom.certxa.com", custom: null, status: "online", ssl: "expired", uptime: "99.4%" },
];

const STATUS_ICON: Record<string, React.ReactNode> = {
  online: <CheckCircle2 size={14} className="text-emerald-500" />,
  degraded: <AlertCircle size={14} className="text-amber-500" />,
  offline: <AlertCircle size={14} className="text-red-500" />,
};
const SSL_STYLE: Record<string, string> = {
  valid: "text-emerald-600",
  expired: "text-red-500",
  expiring_soon: "text-amber-500",
};

export default function ProductWebsitePage() {
  const online = WEBSITES.filter(w => w.status === "online").length;
  const issues = WEBSITES.filter(w => w.status !== "online").length;

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-5xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Website</h1>
            <p className="text-slate-500 text-sm mt-1">Website status, custom domains, and SSL certificates across all accounts</p>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle2 size={12} className="text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">{online} online</span>
            </div>
            {issues > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertCircle size={12} className="text-amber-600" />
                <span className="text-xs font-semibold text-amber-700">{issues} issues</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Websites", value: WEBSITES.length, icon: <Globe size={16} className="text-indigo-500" />, bg: "bg-indigo-50" },
            { label: "Custom Domains", value: WEBSITES.filter(w => w.custom).length, icon: <Shield size={16} className="text-violet-500" />, bg: "bg-violet-50" },
            { label: "SSL Expiry Issues", value: WEBSITES.filter(w => w.ssl !== "valid").length, icon: <Clock size={16} className="text-red-400" />, bg: "bg-red-50" },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={`w-9 h-9 ${m.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>{m.icon}</div>
              <div>
                <div className="text-2xl font-bold text-slate-800">{m.value}</div>
                <div className="text-xs text-slate-400">{m.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Account</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Domain</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Custom Domain</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">SSL</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">30d Uptime</th>
              </tr>
            </thead>
            <tbody>
              {WEBSITES.map(w => (
                <tr key={w.account} className="border-b border-slate-50 hover:bg-slate-50 transition">
                  <td className="px-4 py-3 font-medium text-slate-800">{w.account}</td>
                  <td className="px-4 py-3 text-xs text-indigo-600 font-mono">{w.domain}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{w.custom ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {STATUS_ICON[w.status]}
                      <span className="text-xs capitalize text-slate-600">{w.status}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-xs font-medium capitalize ${SSL_STYLE[w.ssl]}`}>{w.ssl}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700">{w.uptime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
