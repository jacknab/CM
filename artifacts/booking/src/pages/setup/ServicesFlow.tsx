/**
 * /setup/services — Services Menu onboarding flow
 * Step 1: Create a category
 * Step 2: Add services
 * Step 3: Assign staff (if staff exist)
 * Step 4: Done
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Scissors, Plus, Trash2, Check, Tag } from "lucide-react";
import { FlowShell } from "./FlowShell";
import { useToast } from "@/hooks/use-toast";

const STEPS = [
  { key: "category", label: "Create a category" },
  { key: "services", label: "Add services" },
  { key: "staff", label: "Assign to staff" },
  { key: "done", label: "All set" },
];

const CATEGORY_COLORS = [
  { label: "Purple", value: "#7C3AED", bg: "bg-purple-100" },
  { label: "Pink", value: "#DB2777", bg: "bg-pink-100" },
  { label: "Blue", value: "#2563EB", bg: "bg-blue-100" },
  { label: "Teal", value: "#0D9488", bg: "bg-teal-100" },
  { label: "Amber", value: "#D97706", bg: "bg-amber-100" },
  { label: "Rose", value: "#E11D48", bg: "bg-rose-100" },
];

const DURATIONS = ["15", "30", "45", "60", "75", "90", "120"];

interface ServiceDraft {
  name: string;
  price: string;
  duration: string;
}

export default function ServicesFlow() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);

  // Step 1 state
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState(CATEGORY_COLORS[0].value);
  const [savedCategoryId, setSavedCategoryId] = useState<number | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  // Step 2 state
  const [services, setServices] = useState<ServiceDraft[]>([
    { name: "", price: "", duration: "60" },
  ]);
  const [savingServices, setSavingServices] = useState(false);

  // Step 3 state
  const [staffList, setStaffList] = useState<{ id: number; name: string; assigned: boolean }[]>([]);
  const [staffLoaded, setStaffLoaded] = useState(false);
  const [savedServiceIds, setSavedServiceIds] = useState<number[]>([]);

  // ── Step 1: Save category ──────────────────────────────────────────────────
  const saveCategory = async () => {
    if (!categoryName.trim()) return;
    setSavingCategory(true);
    try {
      const res = await fetch("/api/service-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: categoryName.trim(), color: categoryColor }),
      });
      if (!res.ok) throw new Error("Failed to save category");
      const data = await res.json();
      setSavedCategoryId(data.id ?? data.category?.id ?? null);
      setStep(1);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save category. Try again." });
    } finally {
      setSavingCategory(false);
    }
  };

  // ── Step 2: Save services ─────────────────────────────────────────────────
  const saveServices = async () => {
    const valid = services.filter((s) => s.name.trim() && s.price);
    if (valid.length === 0) {
      toast({ variant: "destructive", title: "Add at least one service", description: "Enter a name and price for your service." });
      return;
    }
    setSavingServices(true);
    try {
      const ids: number[] = [];
      for (const svc of valid) {
        const res = await fetch("/api/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: svc.name.trim(),
            price: parseFloat(svc.price) || 0,
            duration: parseInt(svc.duration) || 60,
            categoryId: savedCategoryId,
          }),
        });
        if (res.ok) {
          const d = await res.json();
          ids.push(d.id ?? d.service?.id);
        }
      }
      setSavedServiceIds(ids);

      // Load staff for step 3
      const staffRes = await fetch("/api/staff", { credentials: "include" });
      if (staffRes.ok) {
        const data = await staffRes.json();
        const list = (Array.isArray(data) ? data : data.staff ?? []).map((s: any) => ({
          id: s.id,
          name: [s.firstName, s.lastName].filter(Boolean).join(" ") || s.email,
          assigned: false,
        }));
        setStaffList(list);
      }
      setStaffLoaded(true);
      setStep(2);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save services. Try again." });
    } finally {
      setSavingServices(false);
    }
  };

  // ── Step 3: Assign staff ──────────────────────────────────────────────────
  const assignStaff = async () => {
    const assigned = staffList.filter((s) => s.assigned);
    if (assigned.length > 0 && savedServiceIds.length > 0) {
      for (const staffMember of assigned) {
        await fetch(`/api/staff/${staffMember.id}/services`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ serviceIds: savedServiceIds }),
        }).catch(() => {});
      }
    }
    setStep(3);
  };

  const addServiceRow = () => setServices((s) => [...s, { name: "", price: "", duration: "60" }]);
  const removeServiceRow = (i: number) => setServices((s) => s.filter((_, idx) => idx !== i));
  const updateService = (i: number, field: keyof ServiceDraft, val: string) =>
    setServices((s) => s.map((svc, idx) => (idx === i ? { ...svc, [field]: val } : svc)));

  // ── Step content ──────────────────────────────────────────────────────────

  const renderStep = () => {
    if (step === 0) {
      return (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Tag className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Create your first category</h2>
              <p className="text-sm text-slate-500">Categories group related services (e.g. "Nails", "Gel", "Waxing").</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Category name</label>
              <input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !savingCategory && categoryName.trim() && saveCategory()}
                placeholder="e.g. Nail Services, Gel, Acrylics..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1A0333]/20 focus:border-[#1A0333] text-sm transition-all"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Color</label>
              <div className="flex gap-2 flex-wrap">
                {CATEGORY_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategoryColor(c.value)}
                    className={`w-9 h-9 rounded-full border-2 transition-all ${
                      categoryColor === c.value ? "border-slate-800 scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (step === 1) {
      return (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Scissors className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Add services to "{categoryName}"</h2>
              <p className="text-sm text-slate-500">Enter each service you offer, its duration, and price.</p>
            </div>
          </div>

          <div className="space-y-3">
            {services.map((svc, i) => (
              <div key={i} className="flex gap-2 items-start bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    value={svc.name}
                    onChange={(e) => updateService(i, "name", e.target.value)}
                    placeholder="Service name"
                    className="col-span-1 sm:col-span-1 px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1A0333]/20 text-sm"
                  />
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      value={svc.price}
                      onChange={(e) => updateService(i, "price", e.target.value)}
                      placeholder="Price"
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1A0333]/20 text-sm"
                    />
                  </div>
                  <select
                    value={svc.duration}
                    onChange={(e) => updateService(i, "duration", e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1A0333]/20 text-sm bg-white"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>{d} min</option>
                    ))}
                  </select>
                </div>
                {services.length > 1 && (
                  <button
                    onClick={() => removeServiceRow(i)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors mt-0.5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={addServiceRow}
              className="flex items-center gap-2 text-sm font-medium text-[#1A0333] hover:text-[#3B0764] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add another service
            </button>
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-1">Assign staff to these services</h2>
          <p className="text-sm text-slate-500 mb-6">
            Which of your team members can perform the services you just added?
          </p>

          {staffList.length === 0 ? (
            <div className="bg-slate-50 rounded-xl p-6 text-center border border-slate-100">
              <p className="text-slate-500 text-sm">No staff members yet — you can assign services from the Staff section later.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {staffList.map((member) => (
                <label
                  key={member.id}
                  className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={member.assigned}
                    onChange={(e) =>
                      setStaffList((s) =>
                        s.map((m) => (m.id === member.id ? { ...m, assigned: e.target.checked } : m))
                      )
                    }
                    className="w-4 h-4 rounded accent-[#1A0333]"
                  />
                  <div className="w-8 h-8 rounded-full bg-[#1A0333]/10 flex items-center justify-center text-xs font-bold text-[#1A0333]">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-slate-700">{member.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Step 4: Done
    return (
      <div className="text-center py-6">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Check className="w-8 h-8 text-emerald-600 stroke-[2]" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Services menu created! 🎉</h2>
        <p className="text-slate-500 text-sm max-w-sm mx-auto">
          Your service category and services have been saved. You can always add more services
          from the <strong>Services</strong> section.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <button
            onClick={() => navigate("/services")}
            className="text-sm font-semibold text-[#1A0333] border border-[#1A0333]/20 px-4 py-2 rounded-xl hover:bg-[#1A0333]/5 transition-colors"
          >
            View all services →
          </button>
        </div>
      </div>
    );
  };

  return (
    <FlowShell
      flowKey="services_menu"
      title="Services Menu Setup"
      steps={STEPS}
      currentStep={step}
      onBack={step > 0 ? () => setStep(step - 1) : undefined}
      onNext={
        step === 0
          ? (!categoryName.trim() || savingCategory ? undefined : saveCategory)
          : step === 1
          ? (savingServices ? undefined : saveServices)
          : step === 2
          ? assignStaff
          : undefined
      }
      nextLabel={step === 0 ? (savingCategory ? "Saving…" : "Create Category") : step === 1 ? (savingServices ? "Saving…" : "Save Services") : "Continue"}
      nextDisabled={
        (step === 0 && (!categoryName.trim() || savingCategory)) ||
        (step === 1 && savingServices)
      }
      onComplete={() => navigate("/setup")}
    >
      {renderStep()}
    </FlowShell>
  );
}
