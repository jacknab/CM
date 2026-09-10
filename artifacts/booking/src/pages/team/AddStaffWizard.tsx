import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { apiRequest } from "@/lib/queryClient";
import { WeeklyScheduleEditor, defaultWeek, scheduleHasError, type DayRule } from "@/components/team/WeeklyScheduleEditor";
import { ChevronLeft, Loader2 } from "lucide-react";

interface Category { id: number; name: string }
interface Service { id: number; name: string; categoryId: number | null }

const STEPS = ["Details", "Services", "Schedule"] as const;

export default function AddStaffWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { selectedStore } = useSelectedStore();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // step 1
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // step 2 — categories all checked by default
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/service-categories", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch("/api/service-categories", { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });
  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch("/api/services", { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });
  const [checkedCats, setCheckedCats] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (categories.length) setCheckedCats(new Set(categories.map((c) => c.id)));
  }, [categories]);

  const servicesByCat = useMemo(() => {
    const m = new Map<number, Service[]>();
    for (const s of services) {
      const k = s.categoryId ?? 0;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [services]);

  // step 3
  const [rules, setRules] = useState<DayRule[]>(defaultWeek());

  const canNext =
    step === 0 ? firstName.trim().length > 0 : step === 2 ? !scheduleHasError(rules) : true;

  const finish = async () => {
    setSaving(true);
    try {
      // 1. create staff
      const res = await apiRequest("POST", "/api/staff", {
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        role: "stylist",
        status: "active",
      });
      const staff = await res.json();
      const staffId = staff.id as number;

      // 2. services from checked categories
      const serviceIds = services
        .filter((s) => s.categoryId != null && checkedCats.has(s.categoryId))
        .map((s) => s.id);
      if (serviceIds.length) {
        await apiRequest("POST", `/api/staff/${staffId}/services`, { serviceIds });
      }

      // 3. availability
      if (rules.length) {
        await apiRequest("POST", `/api/staff/${staffId}/availability`, {
          rules: rules.map((r) => ({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime })),
        });
      }

      qc.invalidateQueries({ queryKey: ["/api/staff", selectedStore?.id] });
      toast({ title: `${staff.name} added` });
      navigate(`/team/${staffId}`);
    } catch {
      toast({ title: "Couldn't add staff member", variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
        <button
          onClick={() => (step === 0 ? navigate("/team") : setStep(step - 1))}
          className="mb-4 flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> {step === 0 ? "Staff" : STEPS[step - 1]}
        </button>

        {/* step indicator */}
        <div className="mb-6 flex gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "flex-1 rounded-full py-1 text-center text-xs font-medium",
                i === step ? "bg-primary/10 text-foreground" : i < step ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
              )}
            >
              {s}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold tracking-tight">Add a team member</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[15px] font-medium">First name</label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="text-[15px]" autoFocus />
              </div>
              <div className="space-y-1.5">
                <label className="text-[15px] font-medium">Last name</label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="text-[15px]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[15px] font-medium">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="text-[15px]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[15px] font-medium">Phone</label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="text-[15px]" />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">What can they do?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                All service categories are on by default — uncheck any this person doesn't do.
              </p>
            </div>
            <div className="divide-y divide-border rounded-xl border border-border">
              {categories.map((c) => {
                const count = servicesByCat.get(c.id)?.length ?? 0;
                return (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
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
                    <span className="flex-1 text-[15px] font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{count} {count === 1 ? "service" : "services"}</span>
                  </label>
                );
              })}
              {categories.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No service categories yet — you can assign services later.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">When do they work?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Their bookable hours. You can fine-tune this later.
              </p>
            </div>
            <WeeklyScheduleEditor rules={rules} onChange={setRules} />
          </div>
        )}

        <div className="mt-8 flex items-center justify-end gap-3">
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext} data-testid="wizard-next">
              Next
            </Button>
          ) : (
            <Button onClick={finish} disabled={!canNext || saving} data-testid="wizard-finish">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Staff
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
