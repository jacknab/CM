import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { Staff, StaffAvailability, Service } from "@shared/schema";
import {
  useStaffAvailability,
  useSetStaffAvailability,
  useStaffServices,
  useSetStaffServices,
  useStaffList,
} from "@/hooks/use-staff";
import { StaffColorPicker } from "@/components/StaffColorPicker";
import { useServices } from "@/hooks/use-services";
import { useServiceCategories } from "@/hooks/use-addons";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Camera,
  Save,
  X,
  Loader2,
  Copy,
  Check,
  Sun,
  ChevronDown,
  Pencil,
  Power,
  Eye,
  Mail,
  Phone,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type BizHour = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
};

type DaySetting = { enabled: boolean; startTime: string; endTime: string };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ROLE_OPTIONS = [
  { value: "stylist",      label: "Stylist" },
  { value: "booth_renter", label: "Booth Renter" },
  { value: "receptionist", label: "Receptionist" },
  { value: "assistant",    label: "Assistant" },
  { value: "manager",      label: "Manager" },
  { value: "marketer",     label: "Marketer" },
  { value: "accountant",   label: "Accountant" },
  { value: "custom",       label: "Custom" },
];

function fmt12(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function gen30MinSlots(open = "09:00", close = "17:00") {
  const slots: string[] = [];
  const [oh, om] = open.split(":").map(Number);
  const [ch, cm] = close.split(":").map(Number);
  let mins = oh * 60 + om;
  const end = ch * 60 + cm;
  while (mins <= end) {
    slots.push(`${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`);
    mins += 30;
  }
  return slots;
}

// ─── Availability Tab ──────────────────────────────────────────────────────────

function AvailabilityTab({ staffId }: { staffId: number }) {
  const { selectedStore } = useSelectedStore();
  const { data: rules = [], isLoading: rulesLoading } = useStaffAvailability(staffId);
  const { data: bizHoursRaw = [] } = useQuery<BizHour[]>({
    queryKey: [`/api/business-hours?storeId=${selectedStore?.id}`],
    enabled: !!selectedStore?.id,
    queryFn: async () => {
      const res = await fetch(`/api/business-hours?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
  const { mutate: setAvailability, isPending: isSaving } = useSetStaffAvailability();
  const { toast } = useToast();

  const bizHours = useMemo(() => {
    const map = new Map<number, BizHour>();
    for (const bh of bizHoursRaw) map.set(bh.dayOfWeek, bh);
    return map;
  }, [bizHoursRaw]);

  const [days, setDays] = useState<DaySetting[]>(() =>
    Array.from({ length: 7 }, () => ({ enabled: false, startTime: "09:00", endTime: "17:00" }))
  );
  const [editingDay, setEditingDay] = useState<number | null>(null);

  useEffect(() => {
    if (rulesLoading) return;
    setDays(
      Array.from({ length: 7 }, (_, dow) => {
        const rule = (rules as StaffAvailability[]).find(r => r.dayOfWeek === dow);
        const bh = bizHours.get(dow);
        return {
          enabled:   !!rule,
          startTime: rule?.startTime ?? bh?.openTime  ?? "09:00",
          endTime:   rule?.endTime   ?? bh?.closeTime ?? "17:00",
        };
      })
    );
  }, [rules, bizHours, rulesLoading]);

  const persist = (updated: DaySetting[]) => {
    const newRules = updated.flatMap((d, dow) =>
      d.enabled ? [{ dayOfWeek: dow, startTime: d.startTime, endTime: d.endTime }] : []
    );
    setAvailability({ staffId, rules: newRules }, {
      onError: () => toast({ title: "Failed to save schedule", variant: "destructive" }),
    });
  };

  const [salonCopied, setSalonCopied] = useState(false);
  const copySalonHours = () => {
    if (bizHoursRaw.length === 0) return;
    const next = Array.from({ length: 7 }, (_, dow): DaySetting => {
      const bh = bizHours.get(dow);
      if (!bh || bh.isClosed) return { enabled: false, startTime: "09:00", endTime: "17:00" };
      return { enabled: true, startTime: bh.openTime, endTime: bh.closeTime };
    });
    setDays(next);
    persist(next);
    setSalonCopied(true);
    setTimeout(() => setSalonCopied(false), 2000);
  };

  const toggleDay = (dow: number) => {
    setDays(prev => {
      const next = prev.map((d, i) => i === dow ? { ...d, enabled: !d.enabled } : d);
      persist(next);
      return next;
    });
  };

  const updateTime = (dow: number, field: "startTime" | "endTime", value: string) => {
    setDays(prev => {
      const next = prev.map((d, i) => i === dow ? { ...d, [field]: value } : d);
      persist(next);
      return next;
    });
  };

  if (rulesLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Schedule</h2>
          <p className="text-sm text-gray-500 mt-1">Configure working days and hours for this team member.</p>
        </div>
        <div className="flex items-center gap-3">
          {isSaving && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          <button
            type="button"
            onClick={copySalonHours}
            disabled={bizHoursRaw.length === 0 || isSaving}
            className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full border border-gray-200 text-gray-700 bg-white hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {salonCopied
              ? <><Check className="w-3.5 h-3.5" /> Copied!</>
              : <><Copy className="w-3.5 h-3.5" /> Copy salon hours</>
            }
          </button>
        </div>
      </div>

      {/* Day rows */}
      <div className="divide-y divide-gray-100 border-t border-gray-100">
        {DAY_NAMES.map((dayName, dow) => {
          const bh          = bizHours.get(dow);
          const salonClosed = bh?.isClosed ?? false;
          const d           = days[dow] ?? { enabled: false, startTime: "09:00", endTime: "17:00" };
          const allSlots    = gen30MinSlots(bh?.openTime ?? "06:00", bh?.closeTime ?? "22:00");
          const startSlots  = allSlots.slice(0, -1);
          const endSlots    = allSlots.filter(s => s > d.startTime);
          const isEditing   = editingDay === dow;

          return (
            <div key={dow} className="flex items-center gap-4 py-4 min-h-[64px]">
              {/* Checkbox */}
              <div className="flex-shrink-0">
                <button
                  type="button"
                  disabled={salonClosed}
                  onClick={() => !salonClosed && toggleDay(dow)}
                  className={`w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                    salonClosed
                      ? "border-gray-200 bg-gray-50 cursor-not-allowed"
                      : d.enabled
                      ? "border-gray-900 bg-gray-900"
                      : "border-gray-300 bg-white hover:border-gray-400 cursor-pointer"
                  }`}
                >
                  {d.enabled && !salonClosed && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </div>

              {/* Day name */}
              <span
                className={`w-28 flex-shrink-0 text-sm font-semibold tracking-tight ${
                  salonClosed ? "text-gray-300" : d.enabled ? "text-gray-900" : "text-gray-400"
                }`}
              >
                {dayName}
              </span>

              {/* Time range or state */}
              {salonClosed ? (
                <span className="text-xs text-gray-300 italic">Salon closed</span>
              ) : !d.enabled ? (
                <span className="text-sm text-gray-400">Unavailable</span>
              ) : isEditing ? (
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <div className="flex items-center gap-1.5 border border-gray-200 rounded-full px-3 py-1.5 bg-white shadow-sm hover:border-gray-400 transition-colors">
                    <Sun className="w-3 h-3 text-amber-400 flex-shrink-0" />
                    <select
                      value={d.startTime}
                      onChange={e => updateTime(dow, "startTime", e.target.value)}
                      className="text-sm text-gray-700 bg-transparent border-0 outline-none cursor-pointer appearance-none"
                    >
                      {startSlots.map(s => <option key={s} value={s}>{fmt12(s)}</option>)}
                    </select>
                    <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                  <span className="text-sm text-gray-400">to</span>
                  <div className="flex items-center gap-1.5 border border-gray-200 rounded-full px-3 py-1.5 bg-white shadow-sm hover:border-gray-400 transition-colors">
                    <select
                      value={endSlots.includes(d.endTime) ? d.endTime : (endSlots[endSlots.length - 1] ?? d.endTime)}
                      onChange={e => updateTime(dow, "endTime", e.target.value)}
                      className="text-sm text-gray-700 bg-transparent border-0 outline-none cursor-pointer appearance-none"
                    >
                      {endSlots.map(s => <option key={s} value={s}>{fmt12(s)}</option>)}
                    </select>
                    <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingDay(null)}
                    className="text-xs font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-full border border-gray-200 hover:border-gray-300 transition-colors ml-1"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-sm text-gray-700">
                    {fmt12(d.startTime)} – {fmt12(d.endTime)}
                  </span>
                </div>
              )}

              {/* Edit pencil */}
              {!salonClosed && d.enabled && !isEditing && (
                <button
                  type="button"
                  onClick={() => setEditingDay(dow)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ml-auto flex-shrink-0"
                  aria-label={`Edit ${dayName} hours`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Services Tab ──────────────────────────────────────────────────────────────

function ServicesTab({ staffId }: { staffId: number }) {
  const { data: staffServiceLinks = [], isLoading: isLoadingLinks } = useStaffServices(staffId);
  const { data: allServices = [], isLoading: isLoadingServices } = useServices();
  const { data: categories = [] } = useServiceCategories();
  const { mutate: setServices, isPending } = useSetStaffServices();
  const { toast } = useToast();

  const assignedServiceIds = new Set((staffServiceLinks as any[]).map((ss: any) => ss.serviceId));
  const [localSelection, setLocalSelection] = useState<Set<number> | null>(null);
  const selection = localSelection ?? assignedServiceIds;

  const applyAndSave = (newSet: Set<number>) => {
    setLocalSelection(newSet);
    setServices({ staffId, serviceIds: Array.from(newSet) }, {
      onSuccess: () => setLocalSelection(null),
      onError: () => {
        setLocalSelection(null);
        toast({ title: "Failed to save services", variant: "destructive" });
      },
    });
  };

  const toggleService = (serviceId: number) => {
    const newSet = new Set(selection);
    if (newSet.has(serviceId)) newSet.delete(serviceId); else newSet.add(serviceId);
    applyAndSave(newSet);
  };

  const toggleCategory = (categoryServices: Service[]) => {
    const newSet = new Set(selection);
    const allSelected = categoryServices.every(s => newSet.has(s.id));
    categoryServices.forEach(s => { if (allSelected) newSet.delete(s.id); else newSet.add(s.id); });
    applyAndSave(newSet);
  };

  const isLoading = isLoadingLinks || isLoadingServices;
  const categorizedGroups = (categories as any[]).map((cat: any) => ({
    category: cat,
    services: (allServices as Service[]).filter(
      (s: Service) => s.categoryId === cat.id || s.category === cat.name,
    ),
  })).filter((g: any) => g.services.length > 0);

  const uncategorized = (allServices as Service[]).filter(
    (s: Service) => !(categories as any[]).some(
      (cat: any) => s.categoryId === cat.id || s.category === cat.name,
    ),
  );

  const totalSelected = selection.size;
  const totalServices = (allServices as Service[]).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Services</h2>
          <p className="text-sm text-gray-500 mt-1">Choose which services this team member can perform.</p>
        </div>
        <div className="flex items-center gap-3">
          {isPending && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          {!isLoading && totalServices > 0 && (
            <span className="text-sm text-gray-400">
              {totalSelected} of {totalServices} selected
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading services…
        </div>
      ) : totalServices === 0 ? (
        <div className="py-20 text-center">
          <p className="text-base font-semibold text-gray-500">No services yet</p>
          <p className="text-sm text-gray-400 mt-1">Add services from the Services menu first.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {categorizedGroups.map((group: any) => {
            const allSelected   = group.services.every((s: Service) => selection.has(s.id));
            const someSelected  = group.services.some((s: Service) => selection.has(s.id));
            const selectedCount = group.services.filter((s: Service) => selection.has(s.id)).length;

            return (
              <div key={group.category.id}>
                {/* Category header */}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => toggleCategory(group.services)}
                  className="w-full flex items-center gap-3 py-4 bg-gray-50/60 hover:bg-gray-50 transition-colors text-left px-0"
                >
                  <div
                    className={`w-[18px] h-[18px] rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      allSelected
                        ? "border-gray-900 bg-gray-900"
                        : someSelected
                        ? "border-gray-400 bg-gray-400"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {(allSelected || someSelected) && (
                      <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 10" fill="none">
                        <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className="flex-1 text-sm font-semibold text-gray-800">{group.category.name}</span>
                  <span className="text-xs text-gray-400 tabular-nums pr-1">
                    {selectedCount} / {group.services.length}
                  </span>
                </button>

                {/* Service rows */}
                <div className="divide-y divide-gray-50">
                  {group.services.map((service: Service) => (
                    <label
                      key={service.id}
                      className="flex items-center gap-3 py-3.5 pl-8 pr-0 cursor-pointer hover:bg-gray-50/60 transition-colors"
                    >
                      <div
                        className={`w-[18px] h-[18px] rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          selection.has(service.id)
                            ? "border-gray-900 bg-gray-900"
                            : "border-gray-300 bg-white"
                        }`}
                        onClick={() => toggleService(service.id)}
                      >
                        {selection.has(service.id) && (
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 10" fill="none">
                            <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{service.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {service.duration} min · ${Number(service.price).toFixed(2)}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          {uncategorized.length > 0 && (
            <div>
              <div className="flex items-center gap-3 py-4">
                <span className="flex-1 text-sm font-semibold text-gray-800">Other</span>
                <span className="text-xs text-gray-400 tabular-nums">
                  {uncategorized.filter(s => selection.has(s.id)).length} / {uncategorized.length}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {uncategorized.map((service: Service) => (
                  <label
                    key={service.id}
                    className="flex items-center gap-3 py-3.5 pl-8 cursor-pointer hover:bg-gray-50/60 transition-colors"
                  >
                    <div
                      className={`w-[18px] h-[18px] rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        selection.has(service.id)
                          ? "border-gray-900 bg-gray-900"
                          : "border-gray-300 bg-white"
                      }`}
                      onClick={() => toggleService(service.id)}
                    >
                      {selection.has(service.id) && (
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 10" fill="none">
                          <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{service.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {service.duration} min · ${Number(service.price).toFixed(2)}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({
  member,
  onUpdate,
  isSaving,
}: {
  member: Staff;
  onUpdate: (updates: Partial<Staff>) => void;
  isSaving: boolean;
}) {
  const showOnCalendar = (member as any).showOnCalendar ?? true;
  const status = (member as any).status ?? "active";
  const isActive = status === "active" || status === "invited";

  const toggle = (field: string, value: boolean) => onUpdate({ [field]: value } as any);

  const ToggleRow = ({
    label,
    description,
    checked,
    onChange,
  }: {
    label: string;
    description: string;
    checked: boolean;
    onChange: () => void;
  }) => (
    <div className="flex items-center justify-between py-5 border-b border-gray-100 last:border-0">
      <div className="flex-1 pr-8">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={onChange}
        disabled={isSaving}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 flex-shrink-0 ${
          checked ? "bg-gray-900" : "bg-gray-200"
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Settings</h2>
      <p className="text-sm text-gray-500 mb-6">Control visibility and booking preferences.</p>

      <div className="border-t border-gray-100">
        <ToggleRow
          label="Show on calendar"
          description="Appears in the salon calendar and can be assigned appointments."
          checked={showOnCalendar}
          onChange={() => toggle("showOnCalendar", !showOnCalendar)}
        />
        <ToggleRow
          label="Accept online bookings"
          description="Clients can choose this team member when booking online."
          checked={showOnCalendar}
          onChange={() => toggle("showOnCalendar", !showOnCalendar)}
        />
        <ToggleRow
          label="Active"
          description="Inactive members cannot be booked and are hidden from clients."
          checked={isActive}
          onChange={() => onUpdate({ status: isActive ? "deactivated" : "active" } as any)}
        />
      </div>
    </div>
  );
}

// ─── Tab Nav ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: "profile",      label: "Profile" },
  { id: "availability", label: "Schedule" },
  { id: "services",     label: "Services" },
  { id: "settings",     label: "Settings" },
];

// ─── Main Component ────────────────────────────────────────────────────────────

export default function TeamMemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const staffId = parseInt(id!, 10);

  const { data: allStaff = [] } = useStaffList();
  const takenColors = (allStaff as Staff[])
    .filter(s => s.id !== staffId && !!s.color)
    .map(s => s.color as string);

  const { data: member, isLoading } = useQuery<Staff>({
    queryKey: [api.staff.get.path, staffId],
    queryFn: async () => {
      const url = buildUrl(api.staff.get.path, { id: staffId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(staffId),
  });

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Staff & { status: string; showOnCalendar: boolean; employmentType: string; firstName: string; lastName: string }>>({});

  useEffect(() => {
    if (member) {
      const parts = (member.name ?? "").trim().split(/\s+/);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ");
      setEditForm({ ...(member as any), firstName, lastName });
    }
  }, [member]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { firstName, lastName } = editForm as any;
      const combinedName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ");
      const payload: Record<string, unknown> = {
        name:  combinedName || (editForm as any).name,
        role:  editForm.role,
        phone: editForm.phone,
        email: editForm.email,
        bio:   editForm.bio,
        color: editForm.color,
      };
      for (const k of Object.keys(payload)) {
        if (payload[k] === undefined) delete payload[k];
      }
      const url = buildUrl(api.staff.update.path, { id: staffId });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.staff.get.path, staffId] });
      qc.invalidateQueries({ queryKey: [api.staff.list.path] });
      toast({ title: "Profile updated" });
      setEditing(false);
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const updateField = async (updates: Partial<Staff>) => {
    const url = buildUrl(api.staff.update.path, { id: staffId });
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(updates),
    });
    if (!res.ok) { toast({ title: "Failed to update", variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: [api.staff.get.path, staffId] });
    qc.invalidateQueries({ queryKey: [api.staff.list.path] });
  };

  const [isSavingToggle, setIsSavingToggle] = useState(false);
  const handleSettingsUpdate = async (updates: Partial<Staff>) => {
    setIsSavingToggle(true);
    await updateField(updates);
    setIsSavingToggle(false);
  };

  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch(`/api/staff/${staffId}/avatar`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      toast({ title: "Photo updated" });
      qc.invalidateQueries({ queryKey: [api.staff.get.path, staffId] });
      qc.invalidateQueries({ queryKey: [api.staff.list.path] });
    } catch {
      toast({ title: "Photo upload failed", variant: "destructive" });
    } finally {
      setAvatarUploading(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-[720px] mx-auto px-6 py-8 space-y-5">
          <div className="h-5 w-28 bg-gray-100 rounded-full animate-pulse" />
          <div className="h-14 w-56 bg-gray-100 rounded-2xl animate-pulse" />
          <div className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      </AppLayout>
    );
  }
  if (!member) {
    return (
      <AppLayout>
        <div className="p-6 text-gray-400 text-sm">Team member not found.</div>
      </AppLayout>
    );
  }

  const m = member as any;
  const initials = member.name
    ? member.name.split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const activeTab = searchParams.get("tab") ?? "profile";
  const setTab = (v: string) =>
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set("tab", v); return n; }, { replace: true });

  const cancelEdit = () => {
    setEditing(false);
    const parts = (member.name ?? "").trim().split(/\s+/);
    setEditForm({ ...(member as any), firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") });
  };

  const roleLabel = ROLE_OPTIONS.find(r => r.value === (m.employmentType ?? member.role))?.label ?? member.role ?? "Team Member";

  return (
    <AppLayout>
      <div className={`max-w-[720px] mx-auto px-6 py-8${editing ? " pb-28" : ""}`}>

        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }}
        />

        {/* Back link */}
        <button
          onClick={() => navigate("/team")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Team
        </button>

        {/* ── Profile header ── */}
        <div className="flex items-start gap-5 mb-8">
          {/* Avatar */}
          <div
            className="relative flex-shrink-0 cursor-pointer group"
            onClick={() => fileRef.current?.click()}
          >
            <div className="w-20 h-20 rounded-full overflow-hidden">
              {(m.avatarThumbUrl || m.avatarUrl) ? (
                <img
                  src={m.avatarThumbUrl ?? m.avatarUrl}
                  alt={member.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white text-2xl font-bold"
                  style={{ backgroundColor: member.color ?? "#6366f1" }}
                >
                  {initials}
                </div>
              )}
            </div>
            <div className="absolute inset-0 bg-black/25 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {avatarUploading
                ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                : <Camera className="w-4 h-4 text-white" />
              }
            </div>
          </div>

          {/* Name & meta */}
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight leading-tight">
              {member.name}
            </h1>
            <p className="text-base text-gray-500 mt-1">{roleLabel}</p>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {member.email && (
                <span className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  {member.email}
                </span>
              )}
              {member.phone && (
                <span className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  {member.phone}
                </span>
              )}
            </div>
          </div>

          {/* Edit button */}
          <div className="flex-shrink-0">
            {editing ? (
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
                Editing…
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full border border-gray-200 text-gray-700 bg-white hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
          </div>
        </div>

        {/* ── Edit form ── */}
        {editing && (
          <div className="border border-gray-200 rounded-2xl p-6 mb-8 bg-white">
            <h3 className="text-lg font-bold text-gray-900 mb-5">Edit profile</h3>
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">First Name</Label>
                  <Input
                    value={(editForm as any).firstName ?? ""}
                    onChange={e => setEditForm(p => ({ ...p, firstName: e.target.value }))}
                    className="rounded-xl h-11"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Last Name</Label>
                  <Input
                    value={(editForm as any).lastName ?? ""}
                    onChange={e => setEditForm(p => ({ ...p, lastName: e.target.value }))}
                    className="rounded-xl h-11"
                    placeholder="Last name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Role</Label>
                  <Select value={editForm.role ?? "stylist"} onValueChange={v => setEditForm(p => ({ ...p, role: v }))}>
                    <SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Phone</Label>
                  <Input
                    type="tel"
                    value={editForm.phone ?? ""}
                    onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                    className="rounded-xl h-11"
                    placeholder="(555) 000-0000"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Email</Label>
                <Input
                  type="email"
                  value={editForm.email ?? ""}
                  onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                  className="rounded-xl h-11"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Bio</Label>
                <textarea
                  value={editForm.bio ?? ""}
                  onChange={e => setEditForm(p => ({ ...p, bio: e.target.value }))}
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-400 placeholder-gray-400"
                  placeholder="Short bio shown on the website…"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-500 mb-2 block uppercase tracking-wide">Calendar Color</Label>
                <StaffColorPicker
                  value={editForm.color}
                  takenColors={takenColors}
                  onChange={c => setEditForm(p => ({ ...p, color: c }))}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Tab navigation ── */}
        <div className="flex border-b border-gray-200 mb-8 -mx-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                activeTab === tab.id
                  ? "text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        {activeTab === "profile" && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Profile</h2>
            <p className="text-sm text-gray-500 mb-6">Contact details and personal information.</p>
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {[
                { label: "First name", value: member.name?.split(/\s+/)[0] || "—" },
                { label: "Last name",  value: member.name?.split(/\s+/).slice(1).join(" ") || "—" },
                { label: "Role",       value: roleLabel },
                { label: "Phone",      value: member.phone || "—" },
                { label: "Email",      value: member.email || "—" },
              ].map(row => (
                <div key={row.label} className="flex items-center py-4">
                  <span className="text-sm text-gray-500 w-32 flex-shrink-0">{row.label}</span>
                  <span className="text-sm font-medium text-gray-900">{row.value}</span>
                </div>
              ))}
              {member.bio && (
                <div className="py-4">
                  <span className="text-sm text-gray-500 block mb-1">Bio</span>
                  <p className="text-sm text-gray-800 leading-relaxed">{member.bio}</p>
                </div>
              )}
            </div>
            {!editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-6 flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit profile
              </button>
            )}
          </div>
        )}

        {activeTab === "availability" && <AvailabilityTab staffId={staffId} />}
        {activeTab === "services"     && <ServicesTab staffId={staffId} />}
        {activeTab === "settings"     && (
          <SettingsTab
            member={member}
            onUpdate={handleSettingsUpdate}
            isSaving={isSavingToggle}
          />
        )}

        {/* ── Sticky save footer ── */}
        {editing && (
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t border-gray-100 md:pl-[220px]">
            <div className="max-w-[720px] mx-auto px-6 py-4 flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500 hidden sm:block">Unsaved changes</p>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saveProfile.isPending}
                  className="flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveProfile.mutate()}
                  disabled={saveProfile.isPending}
                  className="flex items-center gap-1.5 text-sm font-semibold px-6 py-2.5 rounded-full bg-gray-900 hover:bg-gray-800 text-white transition-colors disabled:opacity-50 min-w-[90px] justify-center"
                >
                  {saveProfile.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                    : <><Save className="w-4 h-4" /> Save</>
                  }
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
