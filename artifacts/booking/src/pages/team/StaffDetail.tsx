import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { apiRequest } from "@/lib/queryClient";
import { WeeklyScheduleEditor, scheduleHasError, type DayRule } from "@/components/team/WeeklyScheduleEditor";
import { ChevronLeft, Loader2 } from "lucide-react";

interface Staff {
  id: number; name: string; email: string | null; phone: string | null;
  role: string | null; status: string | null;
  commissionRate: string | null; productCommissionRate: string | null;
}
interface Category { id: number; name: string }
interface Service { id: number; name: string; categoryId: number | null }

export default function StaffDetail() {
  const { id } = useParams<{ id: string }>();
  const staffId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { selectedStore } = useSelectedStore();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/staff", selectedStore?.id] });

  const { data: staff, isLoading } = useQuery<Staff>({
    queryKey: ["/api/staff", staffId],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${staffId}`, { credentials: "include" });
      if (!res.ok) throw new Error("not found");
      return res.json();
    },
  });
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/service-categories"],
    queryFn: async () => (await fetch("/api/service-categories", { credentials: "include" })).json(),
  });
  const { data: allServices = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
    queryFn: async () => (await fetch("/api/services", { credentials: "include" })).json(),
  });
  const { data: assignedIds = [] } = useQuery<number[]>({
    queryKey: [`/api/staff/${staffId}/services`],
    queryFn: async () => (await fetch(`/api/staff/${staffId}/services`, { credentials: "include" })).json(),
  });
  const { data: savedRules = [] } = useQuery<DayRule[]>({
    queryKey: [`/api/staff/${staffId}/availability`],
    queryFn: async () => (await fetch(`/api/staff/${staffId}/availability`, { credentials: "include" })).json(),
  });

  // ── editable state ──
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [svcRate, setSvcRate] = useState("0");
  const [prodRate, setProdRate] = useState("0");
  const [checkedCats, setCheckedCats] = useState<Set<number>>(new Set());
  const [rules, setRules] = useState<DayRule[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!staff) return;
    setName(staff.name);
    setEmail(staff.email ?? "");
    setPhone(staff.phone ?? "");
    setSvcRate(staff.commissionRate ?? "0");
    setProdRate(staff.productCommissionRate ?? "0");
  }, [staff]);

  const servicesByCat = useMemo(() => {
    const m = new Map<number, Service[]>();
    for (const s of allServices) m.set(s.categoryId ?? 0, [...(m.get(s.categoryId ?? 0) ?? []), s]);
    return m;
  }, [allServices]);

  useEffect(() => {
    // derive which categories are "on" from assigned service ids
    if (!categories.length || !allServices.length) return;
    const assigned = new Set(assignedIds);
    const on = new Set<number>();
    for (const c of categories) {
      const svc = servicesByCat.get(c.id) ?? [];
      if (svc.length && svc.every((s) => assigned.has(s.id))) on.add(c.id);
    }
    setCheckedCats(on);
  }, [categories, allServices, assignedIds, servicesByCat]);

  useEffect(() => {
    setRules(savedRules.map((r) => ({ dayOfWeek: r.dayOfWeek, startTime: (r.startTime || "09:00").slice(0, 5), endTime: (r.endTime || "17:00").slice(0, 5) })));
  }, [savedRules]);

  if (isLoading || !staff) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      </AppLayout>
    );
  }

  const saveAll = async () => {
    if (scheduleHasError(rules)) {
      toast({ title: "Fix the schedule — an end time is before its start", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("PATCH", `/api/staff/${staffId}`, {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        commissionRate: clampPct(svcRate),
        productCommissionRate: clampPct(prodRate),
        commissionEnabled: Number(svcRate) > 0 || Number(prodRate) > 0,
      });
      const serviceIds = allServices
        .filter((s) => s.categoryId != null && checkedCats.has(s.categoryId))
        .map((s) => s.id);
      await apiRequest("POST", `/api/staff/${staffId}/services`, { serviceIds });
      await apiRequest("POST", `/api/staff/${staffId}/availability`, {
        rules: rules.map((r) => ({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime })),
      });
      qc.invalidateQueries({ queryKey: ["/api/staff", staffId] });
      qc.invalidateQueries({ queryKey: [`/api/staff/${staffId}/services`] });
      qc.invalidateQueries({ queryKey: [`/api/staff/${staffId}/availability`] });
      invalidate();
      toast({ title: "Saved" });
    } catch {
      toast({ title: "Couldn't save", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove ${staff.name}? Their past bookings and history stay intact.`)) return;
    try {
      await apiRequest("DELETE", `/api/staff/${staffId}`);
      invalidate();
      toast({ title: `${staff.name} removed` });
      navigate("/team");
    } catch {
      toast({ title: "Couldn't remove", variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 space-y-8">
        <div>
          <button onClick={() => navigate("/team")} className="mb-3 flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <ChevronLeft className="h-4 w-4" /> Staff
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">{staff.name}</h1>
        </div>

        {/* Profile */}
        <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Profile</h2>
          <div className="space-y-1.5">
            <label className="text-[15px] font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="text-[15px]" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[15px] font-medium">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="text-[15px]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[15px] font-medium">Phone</label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="text-[15px]" />
            </div>
          </div>
        </section>

        {/* Compensation */}
        <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Compensation</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[15px] font-medium">Service commission</label>
              <div className="flex items-center gap-1.5">
                <Input type="number" min={0} max={100} value={svcRate} onChange={(e) => setSvcRate(e.target.value)} className="w-24 text-right text-[15px]" />
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[15px] font-medium">Product commission</label>
              <div className="flex items-center gap-1.5">
                <Input type="number" min={0} max={100} value={prodRate} onChange={(e) => setProdRate(e.target.value)} className="w-24 text-right text-[15px]" />
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
          </div>
        </section>

        {/* Services */}
        <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Services</h2>
          <div className="divide-y divide-border rounded-lg border border-border">
            {categories.map((c) => {
              const count = servicesByCat.get(c.id)?.length ?? 0;
              return (
                <label key={c.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                  <Checkbox
                    checked={checkedCats.has(c.id)}
                    onCheckedChange={(v) =>
                      setCheckedCats((prev) => {
                        const n = new Set(prev);
                        v ? n.add(c.id) : n.delete(c.id);
                        return n;
                      })
                    }
                  />
                  <span className="flex-1 text-[15px]">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* Schedule */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Schedule</h2>
          <WeeklyScheduleEditor rules={rules} onChange={setRules} />
        </section>

        <div className="flex items-center justify-between">
          <button onClick={remove} className="text-sm font-medium text-destructive hover:underline">
            Remove staff member
          </button>
          <Button onClick={saveAll} disabled={busy} data-testid="save-staff">
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

function clampPct(v: string): string {
  return Math.max(0, Math.min(100, Number(v) || 0)).toFixed(2);
}
