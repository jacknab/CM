import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserCog, Plus, Search, Shield, Mail } from "lucide-react";
import { api, type SupportAgentItem } from "@/lib/api";

const ROLE_STYLE: Record<string, string> = {
  admin:       "bg-violet-100 text-violet-700",
  manager:     "bg-indigo-100 text-indigo-700",
  senior_agent:"bg-blue-100 text-blue-700",
  agent:       "bg-slate-100 text-slate-600",
};
const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  senior_agent: "Senior Agent",
  agent: "Support Agent",
};

export default function StaffPage() {
  const [search, setSearch] = useState("");

  const { data: agents = [], isLoading } = useQuery<SupportAgentItem[]>({
    queryKey: ["support-agents"],
    queryFn: () => api.agents.list(),
    staleTime: 120_000,
  });

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase()) ||
    a.role.toLowerCase().includes(search.toLowerCase())
  );

  const initials = (name: string) =>
    name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();

  const AVATAR_COLORS = [
    "bg-indigo-500", "bg-violet-500", "bg-emerald-500",
    "bg-rose-500", "bg-amber-500", "bg-sky-500",
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-4xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Support Staff</h1>
            <p className="text-slate-500 text-sm mt-1">Manage support agents, roles, and permissions</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition">
            <Plus size={14} />
            Invite Agent
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Agents", value: agents.length },
            { label: "Admins", value: agents.filter(a => a.role === "admin").length },
            { label: "Active Today", value: Math.min(agents.length, 3) },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <div className="text-2xl font-bold text-slate-800">{m.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="relative max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search agents…"
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-3 text-slate-500 text-sm p-6">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              Loading agents…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <UserCog size={28} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 text-sm">No agents found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((agent, i) => (
                <div key={agent.id} className="px-4 py-3.5 flex items-center gap-4 hover:bg-slate-50 transition">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                    {initials(agent.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700">{agent.name}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ROLE_STYLE[agent.role] ?? "bg-slate-100 text-slate-500"}`}>
                        {ROLE_LABEL[agent.role] ?? agent.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Mail size={10} className="text-slate-400" />
                      <span className="text-xs text-slate-400">{agent.email}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full" title="Online" />
                    <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition">
                      <Shield size={13} />
                    </button>
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
