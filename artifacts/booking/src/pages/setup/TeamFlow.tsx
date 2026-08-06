/**
 * /setup/team — Team Members onboarding flow
 * Step 1: Add first staff member
 * Step 2: Set working hours
 * Step 3: Assign services
 * Step 4: Done
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Check, Clock } from "lucide-react";
import { FlowShell } from "./FlowShell";
import { useToast } from "@/hooks/use-toast";

const STEPS = [
  { key: "add", label: "Add a team member" },
  { key: "hours", label: "Set working hours" },
  { key: "services", label: "Assign services" },
  { key: "done", label: "All set" },
];

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_HOURS = DAYS.map((_, i) => ({
  isOpen: i >= 1 && i <= 5,
  openTime: "09:00",
  closeTime: "18:00",
}));

const ROLES = ["Nail Technician", "Manager", "Front Desk", "Esthetician", "Wax Specialist", "Other"];

export default function TeamFlow() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);

  // Step 1
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Nail Technician");
  const [savingStaff, setSavingStaff] = useState(false);
  const [savedStaffId, setSavedStaffId] = useState<number | null>(null);

  // Step 2
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [savingHours, setSavingHours] = useState(false);

  // Step 3
  const [services, setServices] = useState<{ id: number; name: string; assigned: boolean }[]>([]);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [savingAssign, setSavingAssign] = useState(false);

  // ── Step 1: create staff ─────────────────────────────────────────────────
  const saveStaff = async () => {
    if (!firstName.trim() || !email.trim()) return;
    setSavingStaff(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), role }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to add staff member");
      }
      const data = await res.json();
      setSavedStaffId(data.id ?? data.staff?.id ?? null);
      setStep(1);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setSavingStaff(false);
    }
  };

  // ── Step 2: save hours ───────────────────────────────────────────────────
  const saveHours = async () => {
    if (!savedStaffId) { setStep(2); return; }
    setSavingHours(true);
    try {
      await fetch(`/api/staff/${savedStaffId}/availability`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ availability: hours }),
      });
      // Load services for step 3
      const svRes = await fetch("/api/services", { credentials: "include" });
      if (svRes.ok) {
        const data = await svRes.json();
        const list = (Array.isArray(data) ? data : data.services ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          assigned: false,
        }));
        setServices(list);
      }
      setServicesLoaded(true);
      setStep(2);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save schedule." });
    } finally {
      setSavingHours(false);
    }
  };

  // ── Step 3: assign services ──────────────────────────────────────────────
  const assignServices = async () => {
    if (!savedStaffId) { setStep(3); return; }
    setSavingAssign(true);
    const ids = services.filter((s) => s.assigned).map((s) => s.id);
    if (ids.length > 0) {
      await fetch(`/api/staff/${savedStaffId}/services`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ serviceIds: ids }),
      }).catch(() => {});
    }
    setSavingAssign(false);
    setStep(3);
  };

  const updateHour = (i: number, field: string, val: string | boolean) =>
    setHours((h) => h.map((d, idx) => (idx === i ? { ...d, [field]: val } : d)));

  const renderStep = () => {
    if (step === 0) return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Add your first team member</h2>
            <p className="text-sm text-slate-500">They'll receive an email invite to access their staff portal.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">First name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Maria" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1A0333]/20 text-sm" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Last name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nguyen" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1A0333]/20 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email address</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@yoursalon.com" type="email" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1A0333]/20 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1A0333]/20 text-sm bg-white">
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>
    );

    if (step === 1) return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Clock className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Set {firstName}'s working hours</h2>
            <p className="text-sm text-slate-500">Choose which days and times they're available for appointments.</p>
          </div>
        </div>
        <div className="space-y-2">
          {DAYS.map((day, i) => (
            <div key={day} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${hours[i].isOpen ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50"}`}>
              <label className="flex items-center gap-2 w-28 flex-shrink-0 cursor-pointer">
                <input type="checkbox" checked={hours[i].isOpen} onChange={(e) => updateHour(i, "isOpen", e.target.checked)} className="rounded accent-[#1A0333]" />
                <span className={`text-sm font-medium ${hours[i].isOpen ? "text-slate-800" : "text-slate-400"}`}>{day.slice(0, 3)}</span>
              </label>
              {hours[i].isOpen ? (
                <div className="flex items-center gap-2 flex-1">
                  <input type="time" value={hours[i].openTime} onChange={(e) => updateHour(i, "openTime", e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A0333]/20" />
                  <span className="text-slate-400 text-sm">to</span>
                  <input type="time" value={hours[i].closeTime} onChange={(e) => updateHour(i, "closeTime", e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A0333]/20" />
                </div>
              ) : (
                <span className="text-xs text-slate-400 flex-1">Closed</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );

    if (step === 2) return (
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-1">Which services can {firstName} perform?</h2>
        <p className="text-sm text-slate-500 mb-5">This controls which services clients can book with {firstName}.</p>
        {services.length === 0 ? (
          <div className="bg-slate-50 rounded-xl p-6 text-center border border-slate-100">
            <p className="text-slate-500 text-sm">No services found — add services first, then come back to assign them.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {services.map((svc) => (
              <label key={svc.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <input type="checkbox" checked={svc.assigned} onChange={(e) => setServices((s) => s.map((sv) => sv.id === svc.id ? { ...sv, assigned: e.target.checked } : sv))} className="rounded accent-[#1A0333]" />
                <span className="text-sm font-medium text-slate-700">{svc.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );

    return (
      <div className="text-center py-6">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Check className="w-8 h-8 text-emerald-600 stroke-[2]" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">{firstName} has been added! 🎉</h2>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          Their profile, schedule, and services are saved. Add more team members from the <strong>Staff</strong> section.
        </p>
        <div className="mt-6 flex gap-3 justify-center flex-wrap">
          <button onClick={() => navigate("/staff/members")} className="text-sm font-semibold text-[#1A0333] border border-[#1A0333]/20 px-4 py-2 rounded-xl hover:bg-[#1A0333]/5 transition-colors">View staff →</button>
        </div>
      </div>
    );
  };

  return (
    <FlowShell
      flowKey="team_members"
      title="Team Setup"
      steps={STEPS}
      currentStep={step}
      onBack={step > 0 ? () => setStep(step - 1) : undefined}
      onNext={
        step === 0 ? (savingStaff ? undefined : saveStaff) :
        step === 1 ? (savingHours ? undefined : saveHours) :
        step === 2 ? (savingAssign ? undefined : assignServices) : undefined
      }
      nextLabel={step === 0 ? (savingStaff ? "Saving…" : "Add Member") : step === 1 ? (savingHours ? "Saving…" : "Save Schedule") : step === 2 ? (savingAssign ? "Saving…" : "Assign Services") : "Continue"}
      nextDisabled={(step === 0 && (!firstName.trim() || !email.trim() || savingStaff)) || (step === 1 && savingHours) || (step === 2 && savingAssign)}
      onComplete={() => navigate("/setup")}
    >
      {renderStep()}
    </FlowShell>
  );
}
