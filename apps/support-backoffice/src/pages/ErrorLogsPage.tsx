import { useState } from "react";
import { AlertCircle, Search, Terminal, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const LEVELS = ["all", "error", "warn", "info"] as const;
type Level = (typeof LEVELS)[number];

const SAMPLE_LOGS = [
  { id: 1, level: "error", service: "API Server", message: "Unhandled promise rejection in /api/appointments route", ts: new Date(Date.now() - 1000 * 60 * 8) },
  { id: 2, level: "warn",  service: "AI Receptionist", message: "OpenAI API latency high: 4200ms (threshold 3000ms)", ts: new Date(Date.now() - 1000 * 60 * 22) },
  { id: 3, level: "error", service: "SMS Gateway", message: "Twilio delivery failure for store_id=42: invalid phone number format", ts: new Date(Date.now() - 1000 * 60 * 47) },
  { id: 4, level: "warn",  service: "Billing", message: "Stripe webhook signature verification failed — possible replay", ts: new Date(Date.now() - 1000 * 60 * 92) },
  { id: 5, level: "error", service: "Database", message: "Query timeout after 30000ms on appointments table (store_id=17)", ts: new Date(Date.now() - 1000 * 60 * 120) },
  { id: 6, level: "info",  service: "Auth", message: "Rate limit triggered for IP 192.168.1.44 — 5 failed login attempts", ts: new Date(Date.now() - 1000 * 60 * 180) },
  { id: 7, level: "warn",  service: "Booking Engine", message: "Stale availability cache detected for store_id=8 — invalidating", ts: new Date(Date.now() - 1000 * 60 * 240) },
];

const LEVEL_STYLE: Record<string, string> = {
  error: "bg-red-100 text-red-700",
  warn:  "bg-amber-100 text-amber-700",
  info:  "bg-blue-100 text-blue-700",
};
const LEVEL_DOT: Record<string, string> = {
  error: "bg-red-500",
  warn:  "bg-amber-400",
  info:  "bg-blue-400",
};

export default function ErrorLogsPage() {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<Level>("all");

  const filtered = SAMPLE_LOGS.filter(l =>
    (level === "all" || l.level === level) &&
    (l.message.toLowerCase().includes(search.toLowerCase()) || l.service.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-5xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Error Logs</h1>
            <p className="text-slate-500 text-sm mt-1">Recent platform errors, warnings, and system events</p>
          </div>
          <button className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-white transition">
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5 text-xs text-amber-700">
          <strong>Sample data shown.</strong> Connect to your logging provider (Datadog, Sentry, CloudWatch) via Settings to see live error logs.
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search logs…"
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white"
            />
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
            {LEVELS.map(l => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`px-3 py-2 text-xs font-medium capitalize transition ${
                  level === l ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden font-mono">
          {filtered.length === 0 ? (
            <div className="p-10 text-center">
              <Terminal size={24} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-400 text-sm">No log entries match your filter</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(log => (
                <div key={log.id} className="px-4 py-3 hover:bg-slate-50 transition flex items-start gap-3">
                  <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${LEVEL_DOT[log.level]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${LEVEL_STYLE[log.level]}`}>{log.level}</span>
                      <span className="text-[10px] text-slate-400 font-sans">{log.service}</span>
                      <span className="text-[10px] text-slate-300 font-sans ml-auto">
                        {formatDistanceToNow(log.ts, { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed font-sans">{log.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
