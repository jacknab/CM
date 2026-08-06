import { useContext } from "react";
import { StoreContext } from "@/hooks/use-store";
import { Link } from "react-router-dom";
import { Settings, Building2, Bell, CreditCard, Users, ArrowRight } from "lucide-react";

export default function SettingsPage() {
  const ctx = useContext(StoreContext);
  const store = ctx?.selectedStore;

  const SECTIONS = [
    { icon: Building2, label: "Business Profile", desc: "Update your business name, address, and contact info.", href: "/business-settings" },
    { icon: Users, label: "Staff & Crews", desc: "Manage your team members and field crews.", href: "/pro-dashboard/crews" },
    { icon: Bell, label: "Notifications", desc: "Configure SMS and email alerts for jobs and crews.", href: "/sms-settings" },
    { icon: CreditCard, label: "Billing & Subscription", desc: "Manage your Certxa Pro subscription and payment method.", href: "#" },
  ];

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-extrabold text-white">Settings</h1>
        <p className="text-white/40 text-xs mt-0.5">Configure your Certxa Pro workspace</p>
      </div>

      {/* Business info */}
      {store && (
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#00D4AA]/15 border border-[#00D4AA]/20 flex items-center justify-center text-[#00D4AA] font-black text-lg">
              {store.name[0]}
            </div>
            <div>
              <p className="text-white font-bold text-lg">{store.name}</p>
              {(store as any).address && <p className="text-white/40 text-sm">{(store as any).address}</p>}
              <p className="text-[#00D4AA] text-xs font-semibold">Certxa Pro • Active</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {SECTIONS.map(({ icon: Icon, label, desc, href }) => (
          <Link key={label} to={href} className="flex items-center gap-4 bg-white/4 hover:bg-white/8 border border-white/8 rounded-2xl px-5 py-4 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-[#00D4AA]/10 border border-[#00D4AA]/15 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4.5 h-4.5 text-[#00D4AA]" />
            </div>
            <div className="flex-1">
              <p className="text-white font-semibold text-sm">{label}</p>
              <p className="text-white/40 text-xs">{desc}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" />
          </Link>
        ))}
      </div>

      <div className="mt-8 bg-[#00D4AA]/8 border border-[#00D4AA]/15 rounded-2xl p-5">
        <p className="text-[#00D4AA] font-bold text-sm mb-1">Certxa Pro — Active</p>
        <p className="text-white/50 text-xs">Your trial includes unlimited jobs, crews, estimates, and invoices. Upgrade anytime to unlock advanced features.</p>
        <Link to="/pricing" className="inline-flex items-center gap-1.5 mt-3 text-[#00D4AA] text-xs font-semibold hover:underline">
          View Plans <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
