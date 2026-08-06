import { MessageSquare, Users, Clock, Zap, Settings } from "lucide-react";

const channels = [
  { name: "Website Chat Widget", status: "Not connected", icon: "🌐", desc: "Embed live chat on the customer-facing booking site" },
  { name: "Email Inbox", status: "Not connected", icon: "📧", desc: "Unified inbox for support@ and hello@ addresses" },
  { name: "SMS Support Line", status: "Not connected", icon: "💬", desc: "Two-way SMS conversations with customers" },
  { name: "WhatsApp Business", status: "Not connected", icon: "📱", desc: "WhatsApp channel for high-volume markets" },
];

const features = [
  { icon: <Users size={18} className="text-indigo-500" />, title: "Agent Queue", desc: "Smart routing to available agents based on skill and workload" },
  { icon: <Clock size={18} className="text-violet-500" />, title: "SLA Timers", desc: "Visual countdowns for first-response and resolution SLAs" },
  { icon: <Zap size={18} className="text-amber-500" />, title: "AI Assist", desc: "Draft reply suggestions pulled from your knowledge base" },
  { icon: <MessageSquare size={18} className="text-emerald-500" />, title: "Canned Responses", desc: "Insert pre-written responses for common questions instantly" },
];

export default function LiveChatPage() {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-4xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Live Chat</h1>
            <p className="text-slate-500 text-sm mt-1">Real-time support conversations across all channels</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-white transition">
            <Settings size={14} />
            Configure Channels
          </button>
        </div>

        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mb-6 flex items-start gap-4">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <MessageSquare size={20} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-800">Live Chat module not yet configured</p>
            <p className="text-xs text-indigo-600 mt-1">Connect your first channel below to start receiving live conversations from customers. Once connected, all chats will appear here in a unified queue.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {channels.map(ch => (
            <div key={ch.name} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3 hover:shadow-sm transition">
              <div className="text-2xl flex-shrink-0">{ch.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-slate-700">{ch.name}</span>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{ch.status}</span>
                </div>
                <p className="text-xs text-slate-400">{ch.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <h2 className="text-sm font-semibold text-slate-700 mb-4">What you get when Live Chat is enabled</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map(f => (
            <div key={f.title} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
              <div className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center flex-shrink-0">
                {f.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-700">{f.title}</div>
                <div className="text-xs text-slate-400 mt-0.5">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
