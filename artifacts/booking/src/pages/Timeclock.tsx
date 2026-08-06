import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, differenceInMinutes, startOfWeek, endOfWeek, addDays } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSelectedStore } from "@/hooks/use-store";
import { useStaffList } from "@/hooks/use-staff";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Clock, Users, ChevronLeft, ChevronRight, Plus, Pencil, Trash2,
  LogIn, LogOut, Timer, Calendar,
} from "lucide-react";

type TimeclockRecord = {
  id: number;
  staffId: number;
  staffName: string;
  staffAvatarUrl: string | null;
  clockIn: string;
  clockOut: string | null;
  workDate: string;
};

type RangePreset = "today" | "yesterday" | "this_week" | "last_week" | "custom";

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(ts: string | null | undefined) {
  if (!ts) return "—";
  try { return format(new Date(ts), "h:mm a"); } catch { return "—"; }
}

function calcHours(clockIn: string, clockOut: string | null): number {
  if (!clockOut) return 0;
  const mins = differenceInMinutes(new Date(clockOut), new Date(clockIn));
  return Math.max(0, mins) / 60;
}

function hoursLabel(h: number) {
  if (h === 0) return "—";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function dateRangeForPreset(preset: RangePreset, customStart: string, customEnd: string) {
  const today = new Date();
  switch (preset) {
    case "today":
      return { start: toLocalDateStr(today), end: toLocalDateStr(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { start: toLocalDateStr(y), end: toLocalDateStr(y) };
    }
    case "this_week": {
      const sw = startOfWeek(today, { weekStartsOn: 0 });
      const ew = endOfWeek(today, { weekStartsOn: 0 });
      return { start: toLocalDateStr(sw), end: toLocalDateStr(ew) };
    }
    case "last_week": {
      const sw = startOfWeek(addDays(today, -7), { weekStartsOn: 0 });
      const ew = endOfWeek(addDays(today, -7), { weekStartsOn: 0 });
      return { start: toLocalDateStr(sw), end: toLocalDateStr(ew) };
    }
    case "custom":
      return { start: customStart, end: customEnd };
  }
}

type EditForm = {
  recordId: number | null;
  staffId: number;
  workDate: string;
  clockInTime: string;
  clockOutTime: string;
  isNew: boolean;
};

export default function Timeclock() {
  const navigate = useNavigate();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [preset, setPreset] = useState<RangePreset>("today");
  const [customStart, setCustomStart] = useState(toLocalDateStr(new Date()));
  const [customEnd, setCustomEnd] = useState(toLocalDateStr(new Date()));

  const [editOpen, setEditOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    recordId: null, staffId: 0, workDate: "", clockInTime: "", clockOutTime: "", isNew: false,
  });

  const { start: startDate, end: endDate } = dateRangeForPreset(preset, customStart, customEnd);

  const { data: staffList = [] } = useStaffList();

  const { data: records = [], isLoading } = useQuery<TimeclockRecord[]>({
    queryKey: ["timeclock-records", storeId, startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/timeclock/records?storeId=${storeId}&startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Failed to fetch records");
      return res.json();
    },
    enabled: !!storeId,
    refetchInterval: 30000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["timeclock-records", storeId] });
  };

  const clockInMut = useMutation({
    mutationFn: async (staffId: number) => {
      const res = await fetch("/api/timeclock/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, staffId, workDate: todayStr }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to clock in");
      }
      return res.json();
    },
    onSuccess: (_, staffId) => {
      const name = staffList.find((s) => s.id === staffId)?.name ?? "Staff";
      toast({ title: `${name} clocked in` });
      invalidate();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const clockOutMut = useMutation({
    mutationFn: async (staffId: number) => {
      const res = await fetch("/api/timeclock/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, staffId, workDate: todayStr }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to clock out");
      }
      return res.json();
    },
    onSuccess: (_, staffId) => {
      const name = staffList.find((s) => s.id === staffId)?.name ?? "Staff";
      toast({ title: `${name} clocked out` });
      invalidate();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const saveMut = useMutation({
    mutationFn: async (form: EditForm) => {
      const workDate = form.workDate;
      const clockIn = `${workDate}T${form.clockInTime}:00`;
      const clockOut = form.clockOutTime ? `${workDate}T${form.clockOutTime}:00` : null;
      if (form.isNew) {
        const res = await fetch("/api/timeclock/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId, staffId: form.staffId, workDate, clockIn, clockOut }),
        });
        if (!res.ok) throw new Error("Failed to save");
        return res.json();
      } else {
        const res = await fetch(`/api/timeclock/records/${form.recordId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clockIn, clockOut }),
        });
        if (!res.ok) throw new Error("Failed to save");
        return res.json();
      }
    },
    onSuccess: () => {
      toast({ title: "Time entry saved" });
      setEditOpen(false);
      invalidate();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/timeclock/records/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast({ title: "Entry deleted" });
      setDeleteId(null);
      invalidate();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const todayStr = toLocalDateStr(new Date());

  const todayRecords = useMemo(
    () => records.filter((r) => r.workDate === todayStr),
    [records, todayStr]
  );

  const activeStaff = useMemo(
    () => new Set(todayRecords.filter((r) => !r.clockOut).map((r) => r.staffId)),
    [todayRecords]
  );

  const staffClockedInToday = useMemo(
    () => new Set(todayRecords.map((r) => r.staffId)),
    [todayRecords]
  );

  const totalHoursToday = useMemo(
    () => todayRecords.reduce((sum, r) => sum + calcHours(r.clockIn, r.clockOut), 0),
    [todayRecords]
  );

  const totalHoursRange = useMemo(
    () => records.reduce((sum, r) => sum + calcHours(r.clockIn, r.clockOut), 0),
    [records]
  );

  function openEdit(rec: TimeclockRecord) {
    const clockInTime = format(new Date(rec.clockIn), "HH:mm");
    const clockOutTime = rec.clockOut ? format(new Date(rec.clockOut), "HH:mm") : "";
    setEditForm({
      recordId: rec.id, staffId: rec.staffId, workDate: rec.workDate,
      clockInTime, clockOutTime, isNew: false,
    });
    setEditOpen(true);
  }

  function openNew() {
    setEditForm({
      recordId: null, staffId: staffList[0]?.id ?? 0,
      workDate: todayStr, clockInTime: "", clockOutTime: "", isNew: true,
    });
    setEditOpen(true);
  }

  const isToday = preset === "today";

  const groupedByStaff = useMemo(() => {
    const map = new Map<number, { name: string; avatarUrl: string | null; records: TimeclockRecord[] }>();
    for (const rec of records) {
      if (!map.has(rec.staffId)) map.set(rec.staffId, { name: rec.staffName, avatarUrl: rec.staffAvatarUrl, records: [] });
      map.get(rec.staffId)!.records.push(rec);
    }
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [records]);

  const PRESETS: { value: RangePreset; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "this_week", label: "This Week" },
    { value: "last_week", label: "Last Week" },
    { value: "custom", label: "Custom Range" },
  ];

  return (
    <AppLayout>
      {/* Back to hub */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm -mx-4 md:-mx-8 -mt-4 md:-mt-8 mb-4 px-4 md:px-6 py-2.5 flex items-center gap-3">
        <button onClick={()=>navigate("/payouts/contractors")} style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",cursor:"pointer",fontSize:".82rem",fontWeight:600,color:"#374151",whiteSpace:"nowrap" }}>
          ← Staff &amp; Earnings
        </button>
        <div style={{ width:1,height:18,background:"#e5e7eb",flexShrink:0 }} />
        <span style={{ fontSize:".92rem",fontWeight:700,color:"#1c1917" }}>Timeclock</span>
      </div>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Timeclock</h1>
            <p className="text-slate-500 text-sm mt-0.5">Track staff hours and attendance</p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Entry
          </Button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Users className="w-5 h-5 text-blue-500" />}
            bg="bg-blue-50"
            label="Active Now"
            value={activeStaff.size.toString()}
            sub="clocked in today"
          />
          <StatCard
            icon={<Timer className="w-5 h-5 text-emerald-500" />}
            bg="bg-emerald-50"
            label="Hours Today"
            value={hoursLabel(totalHoursToday)}
            sub={`${todayRecords.length} entries`}
          />
          <StatCard
            icon={<Clock className="w-5 h-5 text-violet-500" />}
            bg="bg-violet-50"
            label="Range Total"
            value={hoursLabel(totalHoursRange)}
            sub={`${startDate === endDate ? startDate : `${startDate} → ${endDate}`}`}
          />
          <StatCard
            icon={<Calendar className="w-5 h-5 text-amber-500" />}
            bg="bg-amber-50"
            label="Staff Worked"
            value={groupedByStaff.length.toString()}
            sub="in selected range"
          />
        </div>

        {/* Range picker + Today clock-in panel */}
        <div className="flex flex-col md:flex-row gap-4">
          {/* Date range selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium transition-colors border",
                  preset === p.value
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                )}
              >
                {p.label}
              </button>
            ))}
            {preset === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 text-sm w-36"
                />
                <span className="text-slate-400 text-sm">→</span>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 text-sm w-36"
                />
              </div>
            )}
          </div>
        </div>

        {/* Today: quick clock-in panel */}
        {isToday && staffList.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="font-semibold text-sm text-slate-700">Today's Attendance</h2>
              <span className="text-xs text-slate-400">{format(new Date(), "EEEE, MMMM d")}</span>
            </div>
            <div className="divide-y divide-slate-50">
              {staffList.map((member) => {
                const isClockedIn = activeStaff.has(member.id);
                const todayEntry = todayRecords.find(
                  (r) => r.staffId === member.id && !r.clockOut
                );
                const lastEntry = [...todayRecords]
                  .filter((r) => r.staffId === member.id)
                  .sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime())[0];
                const dailyTotal = todayRecords
                  .filter((r) => r.staffId === member.id)
                  .reduce((sum, r) => sum + calcHours(r.clockIn, r.clockOut), 0);

                return (
                  <div key={member.id} className="flex items-center gap-4 px-5 py-3">
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {member.avatarUrl ? (
                        <img src={member.avatarUrl} alt={member.name} className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-bold">
                          {getInitials(member.name)}
                        </div>
                      )}
                      <span className={cn(
                        "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white",
                        isClockedIn ? "bg-emerald-400" : "bg-slate-300"
                      )} />
                    </div>

                    {/* Name + times */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-800 truncate">{member.name}</p>
                      <p className="text-xs text-slate-400">
                        {isClockedIn && todayEntry
                          ? `Clocked in ${formatTime(todayEntry.clockIn)}`
                          : lastEntry
                          ? `Last out ${formatTime(lastEntry.clockOut)}`
                          : "Not clocked in"}
                      </p>
                    </div>

                    {/* Hours today */}
                    <div className="text-right shrink-0 hidden sm:block">
                      {dailyTotal > 0 && (
                        <span className="text-sm font-semibold text-slate-700">{hoursLabel(dailyTotal)}</span>
                      )}
                      {isClockedIn && (
                        <p className="text-xs text-emerald-500 font-medium">Active</p>
                      )}
                    </div>

                    {/* Action button */}
                    <div className="shrink-0">
                      {isClockedIn ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs h-10 min-w-[90px] border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => clockOutMut.mutate(member.id)}
                          disabled={clockOutMut.isPending}
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Clock Out
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs h-10 min-w-[90px] border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                          onClick={() => clockInMut.mutate(member.id)}
                          disabled={clockInMut.isPending}
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          Clock In
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Records table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-slate-700">
              Time Entries
              {records.length > 0 && (
                <span className="ml-2 text-slate-400 font-normal">({records.length})</span>
              )}
            </h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
              <Clock className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Clock className="w-10 h-10 text-slate-200" />
              <p className="text-sm">No time entries for this period</p>
            </div>
          ) : (
            <div>
              {/* Desktop table */}
              <table className="w-full text-sm hidden md:table">
                <thead>
                  <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="text-left px-5 py-2.5 font-medium">Staff</th>
                    <th className="text-left px-4 py-2.5 font-medium">Date</th>
                    <th className="text-left px-4 py-2.5 font-medium">Clock In</th>
                    <th className="text-left px-4 py-2.5 font-medium">Clock Out</th>
                    <th className="text-left px-4 py-2.5 font-medium">Duration</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {records.map((rec) => {
                    const hours = calcHours(rec.clockIn, rec.clockOut);
                    const active = !rec.clockOut;
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            {rec.staffAvatarUrl ? (
                              <img src={rec.staffAvatarUrl} alt={rec.staffName} className="w-7 h-7 rounded-full object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold">
                                {getInitials(rec.staffName)}
                              </div>
                            )}
                            <span className="font-medium text-slate-800">{rec.staffName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {format(parseISO(rec.workDate), "MMM d, yyyy")}
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-medium">{formatTime(rec.clockIn)}</td>
                        <td className="px-4 py-3 text-slate-600">{formatTime(rec.clockOut)}</td>
                        <td className="px-4 py-3 font-semibold text-slate-700">{active ? "—" : hoursLabel(hours)}</td>
                        <td className="px-4 py-3">
                          {active ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Active</Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs">Complete</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-slate-400 hover:text-slate-700"
                              onClick={() => openEdit(rec)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-slate-400 hover:text-red-500"
                              onClick={() => setDeleteId(rec.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-100 bg-slate-50">
                    <td colSpan={4} className="px-5 py-3 text-sm text-slate-500 font-medium">Total hours</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{hoursLabel(totalHoursRange)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>

              {/* Mobile list */}
              <div className="md:hidden divide-y divide-slate-50">
                {records.map((rec) => {
                  const hours = calcHours(rec.clockIn, rec.clockOut);
                  const active = !rec.clockOut;
                  return (
                    <div key={rec.id} className="px-4 py-3 flex items-center gap-3">
                      {rec.staffAvatarUrl ? (
                        <img src={rec.staffAvatarUrl} alt={rec.staffName} className="w-9 h-9 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold shrink-0">
                          {getInitials(rec.staffName)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 text-sm truncate">{rec.staffName}</p>
                        <p className="text-xs text-slate-400">
                          {format(parseISO(rec.workDate), "MMM d")} · {formatTime(rec.clockIn)} – {formatTime(rec.clockOut)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {active ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Active</Badge>
                        ) : (
                          <span className="text-sm font-semibold text-slate-700">{hoursLabel(hours)}</span>
                        )}
                      </div>
                      <div className="shrink-0 flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(rec)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteId(rec.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Staff summary when showing a range */}
        {!isToday && groupedByStaff.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <h2 className="font-semibold text-sm text-slate-700">Hours by Staff</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {groupedByStaff.map(([staffId, { name, avatarUrl, records: recs }]) => {
                const total = recs.reduce((sum, r) => sum + calcHours(r.clockIn, r.clockOut), 0);
                const days = new Set(recs.map((r) => r.workDate)).size;
                return (
                  <div key={staffId} className="flex items-center gap-4 px-5 py-3">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-bold shrink-0">
                        {getInitials(name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm">{name}</p>
                      <p className="text-xs text-slate-400">{recs.length} entries · {days} day{days !== 1 ? "s" : ""}</p>
                    </div>
                    <span className="text-base font-bold text-slate-800">{hoursLabel(total)}</span>
                  </div>
                );
              })}
              <div className="flex items-center gap-4 px-5 py-3 bg-slate-50">
                <div className="flex-1">
                  <p className="font-semibold text-slate-700 text-sm">Total</p>
                </div>
                <span className="text-base font-bold text-slate-800">{hoursLabel(totalHoursRange)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit / Add dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editForm.isNew ? "Add Time Entry" : "Edit Time Entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {editForm.isNew && (
              <div className="space-y-1.5">
                <Label>Staff Member</Label>
                <Select
                  value={String(editForm.staffId)}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, staffId: Number(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={editForm.workDate}
                onChange={(e) => setEditForm((f) => ({ ...f, workDate: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Clock In</Label>
                <Input
                  type="time"
                  value={editForm.clockInTime}
                  onChange={(e) => setEditForm((f) => ({ ...f, clockInTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Clock Out <span className="text-slate-400 text-xs">(optional)</span></Label>
                <Input
                  type="time"
                  value={editForm.clockOutTime}
                  onChange={(e) => setEditForm((f) => ({ ...f, clockOutTime: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveMut.mutate(editForm)}
              disabled={saveMut.isPending || !editForm.clockInTime || !editForm.workDate}
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete entry?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this time entry. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId !== null && deleteMut.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function StatCard({
  icon, bg, label, value, sub,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", bg)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-slate-800 leading-tight">{value}</p>
        <p className="text-xs text-slate-400 truncate">{sub}</p>
      </div>
    </div>
  );
}
