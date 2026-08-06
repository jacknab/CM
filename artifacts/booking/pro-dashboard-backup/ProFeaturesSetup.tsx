import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  Users, Package, Calculator, FileText, Star, MapPin,
  Clock, BookOpen, RefreshCw, Route, ThumbsUp,
  CheckSquare, Briefcase, CalendarClock, Home, Contact,
  ClipboardList, Map, LayoutDashboard, CalendarPlus, CreditCard,
  Check, Zap, ChevronRight, Info,
} from "lucide-react";

// ─── Feature definitions ──────────────────────────────────────────────────────

interface Feature {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}

const SELECTABLE_FEATURES: Feature[] = [
  {
    id: "crm",
    label: "CRM",
    icon: <Users className="w-5 h-5" />,
    description:
      "Simplify your sales process with our lead management system. Manage leads effortlessly with customizable boards and easy drag-and-drop features to track progress. Easily track, assign and prioritize leads to stay organized and ensure no opportunity slips through the cracks.",
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: <Package className="w-5 h-5" />,
    description:
      "The Inventory module enables you to track individual items from purchase to sale, giving you complete control over your company's stock at all times. Efficiently manage warehouses and assets by assigning them to projects and contacts.",
  },
  {
    id: "accounting",
    label: "Accounting",
    icon: <Calculator className="w-5 h-5" />,
    description:
      "Helps you keep an accurate and complete record of all your business's financial activities in one place. You can easily track your profits, expenses, labor hours, and account balances, and export the data whenever necessary.",
  },
  {
    id: "custom_forms",
    label: "Custom Forms",
    icon: <FileText className="w-5 h-5" />,
    description:
      "Create and add your own customized forms to projects and events to collect and manage information efficiently. Free version of this feature is limited to 30 forms per month and 1 template.",
  },
  {
    id: "memberships",
    label: "Memberships",
    icon: <Star className="w-5 h-5" />,
    description:
      "Create your own loyalty program and reward your clients with discounts and special offers. You can set multiple custom membership statuses to take a personal approach in your business and build lasting brand loyalty.",
  },
  {
    id: "gps_tracking",
    label: "GPS Tracking",
    icon: <MapPin className="w-5 h-5" />,
    description:
      "Allows you to track the exact past and current location of your workers on the map to manage their performance and for security purposes.",
  },
  {
    id: "time_cards",
    label: "Time Cards",
    icon: <Clock className="w-5 h-5" />,
    description:
      "Allows you to keep track of time worked by your employees to boost productivity and efficiency and create accurate payroll records.",
  },
  {
    id: "quickbooks",
    label: "QuickBooks Integration",
    icon: <BookOpen className="w-5 h-5" />,
    description:
      "Allows you to integrate with your QuickBooks Online account and export your data from Certxa to QuickBooks for accounting purposes.",
  },
  {
    id: "recurring_events",
    label: "Recurring Events",
    icon: <RefreshCw className="w-5 h-5" />,
    description:
      "Simplify your workflow and save time by effortlessly creating and managing all your recurring appointments and visits for various scenarios.",
  },
  {
    id: "route_optimization",
    label: "Route Optimization",
    icon: <Route className="w-5 h-5" />,
    description:
      "Efficiently manage your field appointments by viewing them on a map and finding the best routes to save time and increase productivity for your team.",
  },
  {
    id: "request_for_review",
    label: "Request for Review",
    icon: <ThumbsUp className="w-5 h-5" />,
    description:
      "Enable your customers to easily share their feedback and leave reviews for your service on social media, while safeguarding your online reputation from negative reviews.",
  },
  {
    id: "todo",
    label: "ToDo",
    icon: <CheckSquare className="w-5 h-5" />,
    description:
      "Enables you to easily create, assign, and monitor tasks within your team.",
  },
];

const CORE_FEATURES: Feature[] = [
  {
    id: "projects",
    label: "Projects",
    icon: <Briefcase className="w-5 h-5" />,
    description: "Manage all your projects in one place effortlessly.",
  },
  {
    id: "dispatch",
    label: "Dispatch",
    icon: <LayoutDashboard className="w-5 h-5" />,
    description:
      "See all visits and appointments assigned to your workers. Create, view, and manage events with ease.",
  },
  {
    id: "schedule",
    label: "Schedule",
    icon: <CalendarClock className="w-5 h-5" />,
    description:
      "Designed to display appointments (visits) for individual workers, making scheduling a breeze.",
  },
  {
    id: "properties",
    label: "Properties",
    icon: <Home className="w-5 h-5" />,
    description:
      "Manage your clients' addresses efficiently in one convenient module.",
  },
  {
    id: "contacts",
    label: "Contacts",
    icon: <Contact className="w-5 h-5" />,
    description:
      "Create detailed client profiles and quickly view their info, rate, appointments and projects.",
  },
  {
    id: "job_management",
    label: "Job Management",
    icon: <ClipboardList className="w-5 h-5" />,
    description:
      "Access all worker visits generated from projects in one place.",
  },
  {
    id: "map",
    label: "Map",
    icon: <Map className="w-5 h-5" />,
    description:
      "Visualize the locations of scheduled events for your workers directly on the map.",
  },
  {
    id: "dashboard",
    label: "Dashboard Management",
    icon: <LayoutDashboard className="w-5 h-5" />,
    description:
      "View and manage key business metrics, employee performance, and project progress all in one place.",
  },
  {
    id: "instant_appointment",
    label: "Instant Appointment",
    icon: <CalendarPlus className="w-5 h-5" />,
    description:
      "Schedule appointments with ease, allowing clients to book and confirm visits instantly.",
  },
  {
    id: "fast_payment",
    label: "Fast Payment",
    icon: <CreditCard className="w-5 h-5" />,
    description:
      "Enable quick, secure transactions, and process payments for services in just a few clicks.",
    comingSoon: true,
  },
];

// ─── Feature card ─────────────────────────────────────────────────────────────

function SelectableCard({
  feature,
  selected,
  onToggle,
}: {
  feature: Feature;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      layout
      onClick={onToggle}
      className={`relative rounded-2xl border-2 p-5 cursor-pointer transition-all duration-200 group ${
        selected
          ? "border-[#3B82F6] bg-[#3B82F6]/8"
          : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
      }`}
    >
      {/* Checkbox */}
      <div
        className={`absolute top-4 left-4 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
          selected
            ? "bg-[#3B82F6] border-[#3B82F6]"
            : "border-white/25 bg-transparent group-hover:border-white/50"
        }`}
      >
        {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>

      {/* Content */}
      <div className="pl-7">
        <div className="flex items-center gap-2 mb-2">
          <span className={`transition-colors ${selected ? "text-[#60a5fa]" : "text-white/40"}`}>
            {feature.icon}
          </span>
          <h3 className="font-bold text-sm text-white">{feature.label}</h3>
        </div>
        <p className="text-white/50 text-xs leading-relaxed">{feature.description}</p>
      </div>
    </motion.div>
  );
}

function CoreCard({ feature }: { feature: Feature }) {
  return (
    <div className="relative rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      {feature.comingSoon && (
        <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-400 border border-amber-400/25">
          Coming Soon
        </span>
      )}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-white/30">{feature.icon}</span>
        <h3 className="font-bold text-sm text-white/70">{feature.label}</h3>
      </div>
      <p className="text-white/35 text-xs leading-relaxed">{feature.description}</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProFeaturesSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(SELECTABLE_FEATURES.map((f) => f.id))
  );
  const [saving, setSaving] = useState(false);

  // Persist to localStorage immediately
  useEffect(() => {
    localStorage.setItem("proFeatures", JSON.stringify(Array.from(selected)));
  }, [selected]);

  const toggleFeature = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () =>
    setSelected(new Set(SELECTABLE_FEATURES.map((f) => f.id)));

  const handleDone = async () => {
    setSaving(true);
    try {
      const features = [...Array.from(selected), ...CORE_FEATURES.map((f) => f.id)];
      await fetch("/api/pro-dashboard/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features }),
      });
    } catch {
      // Non-blocking — features saved in localStorage
    } finally {
      setSaving(false);
      navigate("/pro-dashboard");
    }
  };

  const handleSelectLater = () => navigate("/pro-dashboard");

  const firstName = user?.firstName ?? user?.email?.split("@")[0] ?? "there";
  const displayName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.firstName ?? user?.email?.split("@")[0] ?? "there";

  const total = SELECTABLE_FEATURES.length;
  const count = selected.size;

  return (
    <div
      className="min-h-screen bg-[#050C18] text-white font-['Plus_Jakarta_Sans',sans-serif]"
      style={{ scrollBehavior: "smooth" }}
    >
      {/* ── Sticky top bar ── */}
      <div className="sticky top-0 z-30 bg-[#050C18]/90 backdrop-blur-xl border-b border-white/8 flex items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#3B82F6] flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-sm tracking-tight">Certxa</span>
          <span className="text-[#3B82F6] text-xs font-bold uppercase tracking-widest">Pro</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSelectLater}
            className="text-white/40 hover:text-white/70 text-sm font-medium transition-colors"
          >
            Select later
          </button>
          <button
            onClick={handleDone}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3B82F6] text-white text-sm font-bold hover:bg-[#3B82F6]/90 transition-colors disabled:opacity-60"
          >
            {saving ? "Saving…" : "Done"} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-32 pt-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl sm:text-4xl font-black mb-3">
            Hello,{" "}
            <span className="text-[#3B82F6]">{displayName}!</span>
          </h1>
          <p className="text-white/55 text-base mb-1">
            Please select the features that you need for your business.
          </p>
          <p className="text-white/35 text-sm">
            You can update your selection later on the{" "}
            <span className="text-white/55 font-semibold">Settings &rsaquo; Subscription &rsaquo; My Plan</span>{" "}
            page.
          </p>
        </motion.div>

        {/* ── Optional Features ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-lg">Optional Features</h2>
            <button
              onClick={selectAll}
              className="text-[#3B82F6] text-xs font-bold hover:text-[#60a5fa] transition-colors"
            >
              Select all
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SELECTABLE_FEATURES.map((f, i) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.12 + i * 0.03 }}
              >
                <SelectableCard
                  feature={f}
                  selected={selected.has(f.id)}
                  onToggle={() => toggleFeature(f.id)}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Core Features ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.3 }}
          className="mt-10"
        >
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-white font-bold text-lg">Core Features</h2>
            <div className="group relative">
              <Info className="w-4 h-4 text-white/30 cursor-help" />
              <div className="absolute left-6 top-0 hidden group-hover:block bg-[#0D1F35] border border-white/15 rounded-xl p-3 w-60 text-xs text-white/60 leading-relaxed z-20 shadow-2xl">
                Core features are always included in your Certxa Pro account. They cannot be deselected.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CORE_FEATURES.map((f, i) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.32 + i * 0.03 }}
              >
                <CoreCard feature={f} />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Sticky bottom bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#050C18]/95 backdrop-blur-xl border-t border-white/8 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#3B82F6]/15 border border-[#3B82F6]/30">
            <Check className="w-3.5 h-3.5 text-[#60a5fa]" />
            <span className="text-[#60a5fa] text-sm font-bold">
              Selected {count} of {total} features
            </span>
          </div>
          <span className="text-white/25 text-xs hidden sm:block">
            + {CORE_FEATURES.length} core features always included
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSelectLater}
            className="text-white/45 hover:text-white/70 text-sm font-medium transition-colors hidden sm:block"
          >
            Select later
          </button>
          <button
            onClick={handleDone}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#3B82F6] text-white text-sm font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/25 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Done"} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
