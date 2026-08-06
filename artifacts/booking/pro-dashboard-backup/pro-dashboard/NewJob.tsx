import { useContext, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StoreContext } from "@/hooks/use-store";
import { ArrowLeft, MapPin, User, Wrench, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const SERVICE_TYPES = [
  "HVAC - Installation", "HVAC - Repair", "HVAC - Maintenance",
  "Plumbing - Repair", "Plumbing - Installation", "Plumbing - Drain Cleaning",
  "Electrical - Wiring", "Electrical - Repair", "Electrical - Panel Upgrade",
  "Handyman - General Repair", "Handyman - Assembly", "Handyman - Painting",
  "Roofing - Inspection", "Roofing - Repair", "Roofing - Replacement",
  "Landscaping", "Pest Control", "Appliance Repair", "Locksmith", "Other",
];

export default function NewJob() {
  const ctx = useContext(StoreContext);
  const storeId = ctx?.selectedStore?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    customerName: "", customerPhone: "", customerEmail: "",
    address: "", city: "", state: "", zip: "",
    serviceType: "", priority: "normal", status: "new",
    description: "", crewId: "", scheduledAt: "", estimatedHours: "",
  });

  const { data: crews = [] } = useQuery({
    queryKey: ["/api/pro-dashboard/crews", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/pro-dashboard/crews?storeId=${storeId}`);
      return r.json();
    },
    enabled: !!storeId,
  });

  const create = useMutation({
    mutationFn: async () => {
      const body: any = { ...form };
      if (body.crewId) body.crewId = Number(body.crewId);
      else delete body.crewId;
      if (body.scheduledAt) body.scheduledAt = new Date(body.scheduledAt).toISOString();
      else delete body.scheduledAt;
      if (!body.estimatedHours) delete body.estimatedHours;
      const r = await fetch(`/api/pro-dashboard/orders?storeId=${storeId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/pro-dashboard/orders"] });
      navigate(`/pro-dashboard/jobs/${data.id}`);
    },
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const Field = ({ label, name, type = "text", placeholder = "" }: any) => (
    <div className="space-y-1.5">
      <Label className="text-white/60 text-xs font-semibold uppercase tracking-wider">{label}</Label>
      <Input type={type} value={(form as any)[name]} onChange={e => set(name, e.target.value)} placeholder={placeholder}
        className="bg-white/6 border-white/15 text-white placeholder:text-white/25 focus:border-[#00D4AA]/50 h-11 rounded-xl" />
    </div>
  );

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link to="/pro-dashboard/jobs" className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </Link>

      <h1 className="text-xl font-extrabold text-white mb-6">Create New Job</h1>

      <div className="space-y-5">
        {/* Customer */}
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-[#00D4AA]" />
            <h3 className="text-white font-bold text-sm">Customer</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full Name *" name="customerName" placeholder="John Smith" />
            <Field label="Phone" name="customerPhone" placeholder="(555) 123-4567" />
            <div className="sm:col-span-2">
              <Field label="Email" name="customerEmail" placeholder="john@example.com" />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-[#00D4AA]" />
            <h3 className="text-white font-bold text-sm">Job Location</h3>
          </div>
          <div className="space-y-4">
            <Field label="Address *" name="address" placeholder="123 Main Street" />
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1"><Field label="City" name="city" placeholder="Austin" /></div>
              <Field label="State" name="state" placeholder="TX" />
              <Field label="Zip" name="zip" placeholder="78701" />
            </div>
          </div>
        </div>

        {/* Job details */}
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-4 h-4 text-[#00D4AA]" />
            <h3 className="text-white font-bold text-sm">Job Details</h3>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs font-semibold uppercase tracking-wider">Service Type *</Label>
              <Select value={form.serviceType} onValueChange={v => set("serviceType", v)}>
                <SelectTrigger className="bg-white/6 border-white/15 text-white h-11 rounded-xl">
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent className="bg-[#0D1F35] border-white/15 text-white max-h-64">
                  {SERVICE_TYPES.map(s => <SelectItem key={s} value={s} className="text-white focus:bg-white/10">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-white/60 text-xs font-semibold uppercase tracking-wider">Priority</Label>
                <Select value={form.priority} onValueChange={v => set("priority", v)}>
                  <SelectTrigger className="bg-white/6 border-white/15 text-white h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0D1F35] border-white/15 text-white">
                    {["low","normal","high","emergency"].map(p => <SelectItem key={p} value={p} className="text-white focus:bg-white/10 capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Field label="Est. Hours" name="estimatedHours" type="number" placeholder="2.5" />
            </div>
            <Field label="Schedule Date & Time" name="scheduledAt" type="datetime-local" />
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs font-semibold uppercase tracking-wider">Description / Notes</Label>
              <textarea value={form.description} onChange={e => set("description", e.target.value)}
                placeholder="Describe the job, what needs to be done, any special instructions…"
                rows={3}
                className="w-full bg-white/6 border border-white/15 text-white placeholder:text-white/25 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#00D4AA]/50" />
            </div>
          </div>
        </div>

        {/* Assign crew */}
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-[#00D4AA]" />
            <h3 className="text-white font-bold text-sm">Assign Crew (optional)</h3>
          </div>
          <Select value={form.crewId} onValueChange={v => set("crewId", v)}>
            <SelectTrigger className="bg-white/6 border-white/15 text-white h-11 rounded-xl">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent className="bg-[#0D1F35] border-white/15 text-white">
              <SelectItem value="" className="text-white focus:bg-white/10">Unassigned</SelectItem>
              {crews.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)} className="text-white focus:bg-white/10">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                    {c.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link to="/pro-dashboard/jobs" className="px-5 py-2.5 rounded-xl border border-white/15 text-white/70 hover:bg-white/8 text-sm font-semibold transition-all">Cancel</Link>
          <button
            onClick={() => create.mutate()}
            disabled={!form.customerName || !form.address || !form.serviceType || create.isPending}
            className="flex-1 py-2.5 rounded-xl bg-[#00D4AA] text-[#050C18] font-bold text-sm disabled:opacity-40 transition-all"
          >
            {create.isPending ? "Creating…" : "Create Job"}
          </button>
        </div>
      </div>
    </div>
  );
}
