import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, ChevronLeft, Calendar, Plus, X, Clock, RefreshCw, Users } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

type StaffMember = {
  id: number;
  name: string;
  avatarUrl?: string | null;
  color?: string | null;
  status?: string | null;
  employmentType?: string | null;
};

type AvailabilityRule = {
  id: number;
  staffId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type BizHours = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
};

const DAYS: { label: string; short: string; dow: number }[] = [
  { label: "Monday",    short: "Mon", dow: 1 },
  { label: "Tuesday",   short: "Tue", dow: 2 },
  { label: "Wednesday", short: "Wed", dow: 3 },
  { label: "Thursday",  short: "Thu", dow: 4 },
  { label: "Friday",    short: "Fri", dow: 5 },
  { label: "Saturday",  short: "Sat", dow: 6 },
  { label: "Sunday",    short: "Sun", dow: 0 },
];

const NAV_ITEMS = [
  { label: "Staff",               to: "/payouts/contractors" },
  { label: "Working Hours",       to: "/staff/working-hours" },
  { label: "Permission Settings", to: "/team-permissions" },
];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function formatDateRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const start = monday.toLocaleDateString("en-US", { day: "numeric", month: "short" }).toUpperCase();
  const end   = sunday.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }).toUpperCase();
  return `${start} – ${end}`;
}

function isCurrentWeek(monday: Date): boolean {
  const now = getMonday(new Date());
  return monday.getTime() === now.getTime();
}

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h < 12 ? "am" : "pm";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function calcHours(rules: AvailabilityRule[]): number {
  return rules.reduce((sum, r) => {
    const [sh, sm] = r.startTime.split(":").map(Number);
    const [eh, em] = r.endTime.split(":").map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return sum + (mins > 0 ? mins / 60 : 0);
  }, 0);
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = [
  "#bfdbfe", "#bbf7d0", "#fde68a", "#fecaca", "#ddd6fe", "#fed7aa",
];
function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  }
}

function toMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function EditPopover({
  staffId,
  rule,
  bizOpen,
  bizClose,
  onSave,
  onDelete,
}: {
  staffId: number;
  rule: AvailabilityRule;
  bizOpen: string;
  bizClose: string;
  onSave: (staffId: number, rule: AvailabilityRule, start: string, end: string) => void;
  onDelete: (staffId: number, rule: AvailabilityRule) => void;
}) {
  const [start, setStart] = useState(rule.startTime);
  const [end, setEnd] = useState(rule.endTime);
  const [open, setOpen] = useState(false);

  const bizOpenMins  = toMins(bizOpen);
  const bizCloseMins = toMins(bizClose);

  // Start options: within business hours (exclusive of close)
  const startOptions = TIME_OPTIONS.filter(t => {
    const m = toMins(t);
    return m >= bizOpenMins && m < bizCloseMins;
  });

  // End options: after current start, up to and including close
  const endOptions = TIME_OPTIONS.filter(t => {
    const m = toMins(t);
    return m > toMins(start) && m <= bizCloseMins;
  });

  // If saved start is now out of range, clamp it
  const effectiveStart = startOptions.includes(start) ? start : (startOptions[0] ?? start);
  const effectiveEnd   = endOptions.includes(end)     ? end   : (endOptions[endOptions.length - 1] ?? end);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          style={{
            background: "#ede9fe",
            border: "1px solid #c4b5fd",
            borderRadius: 8,
            padding: "6px 10px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
            minWidth: 80,
            transition: "background .12s",
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#ddd6fe"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#ede9fe"}
        >
          <span style={{ fontSize: ".78rem", fontWeight: 600, color: "#5b21b6" }}>
            {formatTime(rule.startTime)}
          </span>
          <span style={{ fontSize: ".78rem", fontWeight: 600, color: "#5b21b6" }}>
            {formatTime(rule.endTime)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" style={{ width: 230, padding: 16 }}>
        <div style={{ fontSize: ".82rem", fontWeight: 700, marginBottom: 4, color: "#1c1917" }}>
          Edit Schedule
        </div>
        <div style={{ fontSize: ".73rem", color: "#9ca3af", marginBottom: 10 }}>
          Must be within business hours ({formatTime(bizOpen)} – {formatTime(bizClose)})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={{ fontSize: ".75rem", color: "#6b7280", display: "block", marginBottom: 3 }}>Start time</label>
            <select
              value={effectiveStart}
              onChange={e => { setStart(e.target.value); }}
              style={{
                width: "100%", padding: "5px 8px", borderRadius: 6,
                border: "1px solid #e5e7eb", fontSize: ".82rem", color: "#1c1917",
              }}
            >
              {startOptions.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: ".75rem", color: "#6b7280", display: "block", marginBottom: 3 }}>End time</label>
            <select
              value={effectiveEnd}
              onChange={e => setEnd(e.target.value)}
              style={{
                width: "100%", padding: "5px 8px", borderRadius: 6,
                border: "1px solid #e5e7eb", fontSize: ".82rem", color: "#1c1917",
              }}
            >
              {endOptions.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button
            onClick={() => { onSave(staffId, rule, effectiveStart, effectiveEnd); setOpen(false); }}
            style={{
              flex: 1, padding: "6px 0", borderRadius: 6,
              background: "#0f172a", color: "#fff", border: "none",
              fontSize: ".8rem", fontWeight: 600, cursor: "pointer",
            }}
          >
            Save
          </button>
          <button
            onClick={() => { onDelete(staffId, rule); setOpen(false); }}
            style={{
              padding: "6px 10px", borderRadius: 6,
              background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca",
              fontSize: ".8rem", cursor: "pointer",
            }}
          >
            <X style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function StaffWorkingHours() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);

  const monday = useMemo(() => {
    const base = getMonday(new Date());
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  const { data: staffList = [], isLoading: staffLoading } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch("/api/staff", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch staff");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const { data: allRules = [], isLoading: rulesLoading } = useQuery<AvailabilityRule[]>({
    queryKey: ["/api/store-staff-availability", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/store-staff-availability?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch availability");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const { data: bizHoursList = [] } = useQuery<BizHours[]>({
    queryKey: ["/api/business-hours", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/business-hours?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch business hours");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  // Helper: get biz hours for a given day-of-week (0=Sun … 6=Sat)
  const getBizHoursForDay = (dow: number): BizHours | null =>
    (bizHoursList as BizHours[]).find(h => h.dayOfWeek === dow) ?? null;

  const setAvailability = useMutation({
    mutationFn: async ({ staffId, rules }: { staffId: number; rules: { dayOfWeek: number; startTime: string; endTime: string }[] }) => {
      const res = await fetch(`/api/staff/${staffId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rules }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/store-staff-availability", selectedStore?.id] });
    },
    onError: () => toast({ title: "Failed to update schedule", variant: "destructive" }),
  });

  const rulesForStaff = (staffId: number) =>
    allRules.filter(r => r.staffId === staffId);

  const handleAddDay = (staffId: number, dow: number) => {
    const biz = getBizHoursForDay(dow);
    if (biz?.isClosed) return; // business is closed that day — no staff availability allowed
    const defaultStart = biz?.openTime  ?? "09:00";
    const defaultEnd   = biz?.closeTime ?? "17:00";
    const current = rulesForStaff(staffId);
    const existing = current.map(r => ({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime }));
    setAvailability.mutate({
      staffId,
      rules: [...existing, { dayOfWeek: dow, startTime: defaultStart, endTime: defaultEnd }],
    }, {
      onSuccess: () => toast({ title: "Schedule added" }),
    });
  };

  const handleSaveRule = (staffId: number, rule: AvailabilityRule, start: string, end: string) => {
    const current = rulesForStaff(staffId);
    const updated = current.map(r =>
      r.id === rule.id
        ? { dayOfWeek: r.dayOfWeek, startTime: start, endTime: end }
        : { dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime }
    );
    setAvailability.mutate({ staffId, rules: updated }, {
      onSuccess: () => toast({ title: "Schedule updated" }),
    });
  };

  const handleDeleteRule = (staffId: number, rule: AvailabilityRule) => {
    const current = rulesForStaff(staffId);
    const remaining = current
      .filter(r => r.id !== rule.id)
      .map(r => ({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime }));
    setAvailability.mutate({ staffId, rules: remaining }, {
      onSuccess: () => toast({ title: "Day removed" }),
    });
  };

  const activeStaff = (staffList as StaffMember[]).filter(
    s => s.status !== "removed" && s.status !== "deactivated"
  );

  const isLoading = staffLoading || rulesLoading;
  const currentWeek = isCurrentWeek(monday);

  return (
    <AppLayout>
      <div className="min-h-full bg-[#f0f2f5] -m-4 md:-m-8">

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 px-4 md:px-6 pt-4 pb-3 text-[.82rem] text-gray-500">
          <span>Calendar</span>
          <ChevronRight className="w-3 h-3" />
          <span>Staff</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[#1c1917] font-semibold">Working Hours</span>
        </div>

        <div className="flex flex-col md:flex-row gap-4 px-4 md:px-6 pb-6 items-start">

          {/* Left sidebar */}
          <div className="hidden md:block w-[168px] shrink-0 bg-white rounded-xl border border-gray-200 py-2 shadow-sm">
            {NAV_ITEMS.map(item => {
              const isActive = item.to === "/staff/working-hours";
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  style={{
                    display: "block",
                    padding: "9px 16px",
                    fontSize: ".85rem",
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? "#1c1917" : "#4b5563",
                    background: isActive ? "#f3f4f6" : "transparent",
                    textDecoration: "none",
                    transition: "background .12s",
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "#f9fafb"; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Mobile horizontal nav */}
          <div className="flex md:hidden w-full gap-1 bg-white rounded-xl border border-gray-200 p-1.5 shadow-sm overflow-x-auto">
            {NAV_ITEMS.map(item => {
              const isActive = item.to === "/staff/working-hours";
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive ? "bg-gray-100 text-[#1c1917] font-bold" : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* Header card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
              <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#1c1917" }}>
                Working Hours
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: ".8rem", color: "#6b7280" }}>
                Manage your staff working hours, add breaks and time off
              </p>
            </div>

            {/* Week navigator */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 flex items-center justify-center gap-4">
              <button
                onClick={() => setWeekOffset(w => w - 1)}
                style={{
                  width: 30, height: 30, borderRadius: "50%",
                  border: "1px solid #e5e7eb", background: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "#374151",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f9fafb"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#fff"}
              >
                <ChevronLeft style={{ width: 15, height: 15 }} />
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: ".85rem", fontWeight: 600, color: "#374151",
                  background: currentWeek ? "#f3f4f6" : "transparent",
                  padding: currentWeek ? "3px 10px" : "3px 0",
                  borderRadius: 20,
                }}>
                  {currentWeek ? "This Week" : weekOffset < 0 ? "Past Week" : "Next Week"}
                </span>
                <Calendar style={{ width: 15, height: 15, color: "#9ca3af" }} />
                <span style={{ fontSize: ".85rem", color: "#6b7280", fontWeight: 500 }}>
                  {formatDateRange(monday)}
                </span>
              </div>

              <button
                onClick={() => setWeekOffset(w => w + 1)}
                style={{
                  width: 30, height: 30, borderRadius: "50%",
                  border: "1px solid #e5e7eb", background: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "#374151",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f9fafb"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#fff"}
              >
                <ChevronLeft style={{ width: 15, height: 15, transform: "rotate(180deg)" }} />
              </button>
            </div>

            {/* Table card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {isLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "56px 0", color: "#9ca3af" }}>
                  <RefreshCw style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: ".88rem" }}>Loading…</span>
                </div>
              ) : activeStaff.length === 0 ? (
                <div style={{ textAlign: "center", padding: "56px 24px", color: "#9ca3af" }}>
                  <Users style={{ width: 32, height: 32, margin: "0 auto 10px", color: "#d1d5db" }} />
                  <p style={{ fontWeight: 600, color: "#374151", margin: "0 0 4px" }}>No staff members yet</p>
                  <p style={{ fontSize: ".84rem", margin: 0 }}>Add team members to manage their schedules.</p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                        {/* Staff column header */}
                        <th style={{
                          padding: "11px 20px", textAlign: "left",
                          fontSize: ".78rem", fontWeight: 600, color: "#6b7280",
                          background: "#f9fafb", minWidth: 180, whiteSpace: "nowrap",
                        }}>
                          <div style={{ fontWeight: 700, color: "#1c1917", fontSize: ".82rem" }}>Working Hours</div>
                          <div style={{ fontWeight: 400, color: "#9ca3af", fontSize: ".74rem", marginTop: 1 }}>
                            {formatMonthDay(monday)} – {formatMonthDay(addDays(monday, 6))}
                          </div>
                        </th>
                        {DAYS.map((day, i) => {
                          const date = addDays(monday, i);
                          const isToday = new Date().toDateString() === date.toDateString();
                          return (
                            <th
                              key={day.dow}
                              style={{
                                padding: "11px 8px",
                                textAlign: "center",
                                fontSize: ".78rem",
                                fontWeight: 600,
                                color: isToday ? "#7c3aed" : "#374151",
                                background: isToday ? "#faf5ff" : "#f9fafb",
                                minWidth: 90,
                                borderLeft: "1px solid #f3f4f6",
                              }}
                            >
                              <div style={{ fontWeight: 700 }}>{day.label}</div>
                              <div style={{ fontWeight: 400, color: isToday ? "#7c3aed" : "#9ca3af", fontSize: ".73rem", marginTop: 1 }}>
                                {formatMonthDay(date)}.
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {activeStaff.map((member, mi) => {
                        const staffRules = rulesForStaff(member.id);
                        const totalHours = calcHours(staffRules);
                        const initials = getInitials(member.name);
                        const bg = avatarColor(member.id);
                        const isLast = mi === activeStaff.length - 1;

                        return (
                          <tr
                            key={member.id}
                            style={{
                              borderBottom: isLast ? "none" : "1px solid #f3f4f6",
                            }}
                          >
                            {/* Staff info cell */}
                            <td style={{ padding: "12px 20px", verticalAlign: "middle" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{
                                  width: 34, height: 34, borderRadius: "50%",
                                  background: bg, flexShrink: 0,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: ".73rem", fontWeight: 700, color: "#1e40af",
                                  overflow: "hidden",
                                }}>
                                  {member.avatarUrl
                                    ? <img src={member.avatarUrl} alt={member.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    : initials}
                                </div>
                                <div>
                                  <div style={{ fontSize: ".86rem", fontWeight: 600, color: "#1c1917", lineHeight: 1.3 }}>
                                    {member.name}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
                                    <Clock style={{ width: 10, height: 10, color: "#9ca3af" }} />
                                    <span style={{ fontSize: ".72rem", color: "#9ca3af" }}>
                                      {totalHours.toFixed(2)} hrs / $0.00
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Day cells */}
                            {DAYS.map((day, i) => {
                              const rule = staffRules.find(r => r.dayOfWeek === day.dow);
                              const date = addDays(monday, i);
                              const isToday = new Date().toDateString() === date.toDateString();

                              return (
                                <td
                                  key={day.dow}
                                  style={{
                                    padding: "10px 8px",
                                    textAlign: "center",
                                    verticalAlign: "middle",
                                    borderLeft: "1px solid #f3f4f6",
                                    background: isToday ? "#fefcff" : "transparent",
                                  }}
                                >
                                  {(() => {
                                    const biz = getBizHoursForDay(day.dow);
                                    const dayIsClosed = biz?.isClosed === true;
                                    const bizOpen  = biz?.openTime  ?? "09:00";
                                    const bizClose = biz?.closeTime ?? "17:00";
                                    return rule ? (
                                      <EditPopover
                                        staffId={member.id}
                                        rule={rule}
                                        bizOpen={bizOpen}
                                        bizClose={bizClose}
                                        onSave={handleSaveRule}
                                        onDelete={handleDeleteRule}
                                      />
                                    ) : dayIsClosed ? (
                                      <span style={{ fontSize: ".72rem", color: "#d1d5db" }}>Closed</span>
                                    ) : (
                                      <button
                                        onClick={() => handleAddDay(member.id, day.dow)}
                                        disabled={setAvailability.isPending}
                                      style={{
                                        width: 28, height: 28, borderRadius: "50%",
                                        border: "1.5px dashed #d1d5db",
                                        background: "transparent",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        cursor: "pointer", margin: "0 auto",
                                        transition: "border-color .12s, background .12s",
                                        color: "#9ca3af",
                                      }}
                                      onMouseEnter={e => {
                                        (e.currentTarget as HTMLElement).style.borderColor = "#7c3aed";
                                        (e.currentTarget as HTMLElement).style.background = "#faf5ff";
                                        (e.currentTarget as HTMLElement).style.color = "#7c3aed";
                                      }}
                                      onMouseLeave={e => {
                                        (e.currentTarget as HTMLElement).style.borderColor = "#d1d5db";
                                        (e.currentTarget as HTMLElement).style.background = "transparent";
                                        (e.currentTarget as HTMLElement).style.color = "#9ca3af";
                                      }}
                                      title={`Add ${day.label} schedule`}
                                    >
                                      <Plus style={{ width: 13, height: 13 }} />
                                    </button>
                                    );
                                  })()}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </AppLayout>
  );
}
