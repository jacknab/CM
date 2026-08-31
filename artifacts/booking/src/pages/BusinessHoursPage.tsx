import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Save, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Globe, MapPin } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { format, addWeeks, subWeeks, startOfWeek, endOfWeek, addDays } from "date-fns";
import { Link } from "react-router-dom";
import type { Store, BusinessHours } from "@shared/schema";

// Human-readable labels for the most common IANA timezone identifiers.
// Used only to make the read-only display more friendly (e.g. "Eastern Time (ET)").
const TIMEZONE_LABELS: Record<string, string> = {
  "America/New_York":      "Eastern Time (ET)",
  "America/Chicago":       "Central Time (CT)",
  "America/Denver":        "Mountain Time (MT)",
  "America/Phoenix":       "Arizona (no DST)",
  "America/Los_Angeles":   "Pacific Time (PT)",
  "America/Anchorage":     "Alaska Time (AKT)",
  "Pacific/Honolulu":      "Hawaii Time (HT)",
  "America/Puerto_Rico":   "Puerto Rico (AST)",
  "America/Toronto":       "Toronto (ET)",
  "America/Vancouver":     "Vancouver (PT)",
  "America/Winnipeg":      "Winnipeg (CT)",
  "America/Halifax":       "Halifax (AT)",
  "America/St_Johns":      "Newfoundland (NT)",
  "America/Sao_Paulo":     "São Paulo (BRT)",
  "America/Argentina/Buenos_Aires": "Buenos Aires (ART)",
  "America/Bogota":        "Bogotá (COT)",
  "America/Lima":          "Lima (PET)",
  "America/Mexico_City":   "Mexico City (CST)",
  "America/Cancun":        "Cancún (EST)",
  "Europe/London":         "London (GMT/BST)",
  "Europe/Paris":          "Paris (CET/CEST)",
  "Europe/Berlin":         "Berlin (CET/CEST)",
  "Europe/Madrid":         "Madrid (CET/CEST)",
  "Europe/Rome":           "Rome (CET/CEST)",
  "Europe/Amsterdam":      "Amsterdam (CET/CEST)",
  "Europe/Brussels":       "Brussels (CET/CEST)",
  "Europe/Zurich":         "Zurich (CET/CEST)",
  "Europe/Stockholm":      "Stockholm (CET/CEST)",
  "Europe/Oslo":           "Oslo (CET/CEST)",
  "Europe/Helsinki":       "Helsinki (EET/EEST)",
  "Europe/Athens":         "Athens (EET/EEST)",
  "Europe/Warsaw":         "Warsaw (CET/CEST)",
  "Europe/Prague":         "Prague (CET/CEST)",
  "Europe/Budapest":       "Budapest (CET/CEST)",
  "Europe/Bucharest":      "Bucharest (EET/EEST)",
  "Europe/Kiev":           "Kyiv (EET/EEST)",
  "Europe/Moscow":         "Moscow (MSK)",
  "Europe/Istanbul":       "Istanbul (TRT)",
  "Europe/Lisbon":         "Lisbon (WET/WEST)",
  "Europe/Dublin":         "Dublin (GMT/IST)",
  "Asia/Dubai":            "Dubai (GST)",
  "Asia/Riyadh":           "Riyadh (AST)",
  "Asia/Kolkata":          "India (IST)",
  "Asia/Colombo":          "Sri Lanka (SLST)",
  "Asia/Dhaka":            "Dhaka (BST)",
  "Asia/Bangkok":          "Bangkok (ICT)",
  "Asia/Ho_Chi_Minh":      "Ho Chi Minh City (ICT)",
  "Asia/Jakarta":          "Jakarta (WIB)",
  "Asia/Singapore":        "Singapore (SGT)",
  "Asia/Kuala_Lumpur":     "Kuala Lumpur (MYT)",
  "Asia/Manila":           "Manila (PHT)",
  "Asia/Hong_Kong":        "Hong Kong (HKT)",
  "Asia/Shanghai":         "China (CST)",
  "Asia/Taipei":           "Taipei (NST)",
  "Asia/Tokyo":            "Tokyo (JST)",
  "Asia/Seoul":            "Seoul (KST)",
  "Asia/Tehran":           "Tehran (IRST)",
  "Asia/Jerusalem":        "Jerusalem (IST)",
  "Asia/Karachi":          "Karachi (PKT)",
  "Asia/Tashkent":         "Tashkent (UZT)",
  "Asia/Almaty":           "Almaty (ALMT)",
  "Australia/Sydney":      "Sydney (AEST/AEDT)",
  "Australia/Melbourne":   "Melbourne (AEST/AEDT)",
  "Australia/Brisbane":    "Brisbane (AEST)",
  "Australia/Perth":       "Perth (AWST)",
  "Australia/Adelaide":    "Adelaide (ACST/ACDT)",
  "Pacific/Auckland":      "Auckland (NZST/NZDT)",
  "Pacific/Fiji":          "Fiji (FJT)",
  "Africa/Cairo":          "Cairo (EET)",
  "Africa/Lagos":          "Lagos (WAT)",
  "Africa/Nairobi":        "Nairobi (EAT)",
  "Africa/Johannesburg":   "Johannesburg (SAST)",
  "Africa/Casablanca":     "Casablanca (WET)",
  "UTC":                   "UTC (Coordinated Universal Time)",
};

// United States timezones offered in the manual override dropdown.
const US_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York",    label: "Eastern Time (ET) — New York" },
  { value: "America/Chicago",     label: "Central Time (CT) — Chicago" },
  { value: "America/Denver",      label: "Mountain Time (MT) — Denver" },
  { value: "America/Phoenix",     label: "Arizona — Mountain, no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT) — Los Angeles" },
  { value: "America/Anchorage",   label: "Alaska Time (AKT) — Anchorage" },
  { value: "America/Adak",        label: "Hawaii–Aleutian Time (with DST) — Adak" },
  { value: "Pacific/Honolulu",    label: "Hawaii Time (HST), no DST — Honolulu" },
  { value: "America/Puerto_Rico", label: "Atlantic Time (AST) — Puerto Rico" },
];

type DayHours = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
};

// Display order: Monday first, Sunday last.
// Backend / JS convention: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6.
// DISPLAY_DOW[i] = the JS dayOfWeek value shown in display column i.
const DISPLAY_DOW = [1, 2, 3, 4, 5, 6, 0]; // Mon…Sat, then Sun
const DAY_NAMES   = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Maps JS dayOfWeek → display name
const DOW_NAME: Record<number, string> = {
  1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday",
  5: "Friday", 6: "Saturday", 0: "Sunday",
};
// Maps JS dayOfWeek → display index (Mon=0 … Sun=6) for sorting
const DOW_TO_DISPLAY: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

const DEFAULT_HOURS: DayHours[] = [
  { dayOfWeek: 1, openTime: "09:00", closeTime: "19:00", isClosed: false }, // Monday
  { dayOfWeek: 2, openTime: "09:00", closeTime: "19:00", isClosed: false }, // Tuesday
  { dayOfWeek: 3, openTime: "09:00", closeTime: "19:00", isClosed: false }, // Wednesday
  { dayOfWeek: 4, openTime: "09:00", closeTime: "19:00", isClosed: false }, // Thursday
  { dayOfWeek: 5, openTime: "09:00", closeTime: "19:00", isClosed: false }, // Friday
  { dayOfWeek: 6, openTime: "10:00", closeTime: "20:00", isClosed: false }, // Saturday
  { dayOfWeek: 0, openTime: "10:00", closeTime: "20:00", isClosed: false }, // Sunday
];

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function computeWeeklyHours(hours: DayHours[]): string {
  let total = 0;
  for (const h of hours) {
    if (h.isClosed) continue;
    const [oh, om] = h.openTime.split(":").map(Number);
    const [ch, cm] = h.closeTime.split(":").map(Number);
    const diff = ch * 60 + cm - (oh * 60 + om);
    if (diff > 0) total += diff;
  }
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  return `${hrs} hours ${mins} min`;
}

/** Convert "HH:MM" (24h) → { h12, min, ampm } for the manual time input */
function to12h(time24: string) {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { h12: h12.toString(), min: m.toString().padStart(2, "0"), ampm };
}

/** Convert { h12, min, ampm } → "HH:MM" (24h) */
function from12h(h12Str: string, minStr: string, ampm: string): string {
  let h = parseInt(h12Str) || 12;
  if (h < 1) h = 1;
  if (h > 12) h = 12;
  let m = parseInt(minStr);
  if (isNaN(m) || m < 0) m = 0;
  if (m > 59) m = 59;
  let h24 = h;
  if (ampm === "AM" && h === 12) h24 = 0;
  else if (ampm === "PM" && h !== 12) h24 = h + 12;
  return `${h24.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Manual time input: typed HH : MM + AM/PM dropdown */
function TimeInput({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId?: string }) {
  const init = to12h(value);
  const [hourStr, setHourStr] = useState(init.h12);
  const [minStr, setMinStr] = useState(init.min);
  const [ampm, setAmpm] = useState(init.ampm);

  // Sync when external value changes (e.g. on data load)
  useEffect(() => {
    const { h12, min, ampm: ap } = to12h(value);
    setHourStr(h12);
    setMinStr(min);
    setAmpm(ap);
  }, [value]);

  const commit = (h: string, m: string, ap: string) => {
    const clamped = from12h(h, m, ap);
    onChange(clamped);
  };

  const inputStyle: React.CSSProperties = {
    width: 34, textAlign: "center", fontSize: ".82rem", fontWeight: 600,
    border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 0",
    color: "#111827", background: "#fff", outline: "none",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }} data-testid={testId}>
      <input
        type="text"
        value={hourStr}
        onChange={e => setHourStr(e.target.value.replace(/\D/g, "").slice(0, 2))}
        onBlur={() => { const clamped = String(Math.min(12, Math.max(1, parseInt(hourStr) || 12))); setHourStr(clamped); commit(clamped, minStr, ampm); }}
        maxLength={2}
        style={inputStyle}
        placeholder="12"
      />
      <span style={{ fontWeight: 700, color: "#374151", fontSize: ".9rem", lineHeight: 1 }}>:</span>
      <input
        type="text"
        value={minStr}
        onChange={e => setMinStr(e.target.value.replace(/\D/g, "").slice(0, 2))}
        onBlur={() => { const clamped = String(Math.min(59, Math.max(0, parseInt(minStr) || 0))).padStart(2, "0"); setMinStr(clamped); commit(hourStr, clamped, ampm); }}
        maxLength={2}
        style={inputStyle}
        placeholder="00"
      />
      <select
        value={ampm}
        onChange={e => { setAmpm(e.target.value); commit(hourStr, minStr, e.target.value); }}
        style={{
          fontSize: ".78rem", fontWeight: 600, border: "1px solid #d1d5db",
          borderRadius: 6, padding: "3px 4px", color: "#111827",
          background: "#fff", cursor: "pointer", marginLeft: 2,
        }}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

/** Format an IANA timezone string for display.
 *  "America/New_York" → "Eastern Time (ET)"  (if in labels map)
 *  "America/New_York" → "America / New York" (fallback)
 */
function formatTimezoneLabel(tz: string): string {
  if (!tz || tz === "UTC") return "UTC (Coordinated Universal Time)";
  if (TIMEZONE_LABELS[tz]) return TIMEZONE_LABELS[tz];
  // Graceful fallback: make the IANA ID human-readable
  return tz.replace(/_/g, " ").replace(/\//g, " / ");
}

/** Get the current local time string in a given IANA timezone, e.g. "2:34 PM" */
function getCurrentTimeInZone(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  } catch {
    return "";
  }
}

function TimezoneCard({ store }: { store: Store }) {
  const { toast } = useToast();
  const savedTz = store.timezone ?? "UTC";

  // Local selection — starts from the saved value, re-syncs if the store reloads.
  const [selectedTz, setSelectedTz] = useState(savedTz);
  useEffect(() => { setSelectedTz(store.timezone ?? "UTC"); }, [store.timezone]);

  const [currentTime, setCurrentTime] = useState(() => getCurrentTimeInZone(selectedTz));

  // Tick every 30 seconds so the displayed local time stays fresh
  useEffect(() => {
    setCurrentTime(getCurrentTimeInZone(selectedTz));
    const id = setInterval(() => setCurrentTime(getCurrentTimeInZone(selectedTz)), 30_000);
    return () => clearInterval(id);
  }, [selectedTz]);

  const saveTimezone = useMutation({
    mutationFn: async (timezone: string) => {
      const res = await apiRequest("PATCH", `/api/stores/${store.id}`, { timezone });
      return res.json();
    },
    onSuccess: () => {
      // Refresh both the store list (drives `selectedStore` across the app) and
      // this page's store query so every timezone-aware view updates.
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stores", store.id] });
      toast({ title: "Timezone updated", description: `Now using ${formatTimezoneLabel(selectedTz)}.` });
    },
    onError: () => {
      setSelectedTz(savedTz);
      toast({ title: "Error", description: "Failed to update timezone.", variant: "destructive" });
    },
  });

  const isDirty = selectedTz !== savedTz;
  // If the saved timezone isn't one of the US options, still show it as a choice.
  const options = US_TIMEZONES.some(o => o.value === savedTz)
    ? US_TIMEZONES
    : [{ value: savedTz, label: formatTimezoneLabel(savedTz) }, ...US_TIMEZONES];

  const selectStyle: React.CSSProperties = {
    fontSize: ".9rem", fontWeight: 600, color: "#111827",
    border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 10px",
    background: "#fff", cursor: "pointer", minWidth: 260, maxWidth: "100%",
  };

  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
      padding: "16px 20px", boxShadow: "0 1px 3px 0 rgb(0 0 0/.04)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        {/* Left: icon + label + timezone selector */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, background: "#f0f9ff",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Globe style={{ width: 16, height: 16, color: "#0284c7" }} />
          </div>
          <div>
            <div style={{ fontSize: ".78rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>
              Timezone
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <select
                value={selectedTz}
                onChange={e => setSelectedTz(e.target.value)}
                style={selectStyle}
                data-testid="select-timezone"
                aria-label="Business timezone"
              >
                {options.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {isDirty && (
                <Button
                  size="sm"
                  onClick={() => saveTimezone.mutate(selectedTz)}
                  disabled={saveTimezone.isPending}
                  style={{ background: "#0f172a", color: "#fff", fontSize: ".78rem", height: 34 }}
                  data-testid="button-save-timezone"
                >
                  <Save style={{ width: 13, height: 13, marginRight: 5 }} />
                  {saveTimezone.isPending ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
            <div style={{ fontSize: ".75rem", color: "#6b7280", marginTop: 4 }}>
              {selectedTz}{currentTime ? ` · Currently ${currentTime}` : ""}
              {isDirty ? " · not saved yet" : ""}
            </div>
          </div>
        </div>

        {/* Right: badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: 20, padding: "4px 10px", flexShrink: 0,
        }}>
          <MapPin style={{ width: 12, height: 12, color: "#2563eb" }} />
          <span style={{ fontSize: ".72rem", fontWeight: 600, color: "#1d4ed8" }}>
            Manual override
          </span>
        </div>
      </div>

      {/* Explanation row */}
      <div style={{
        marginTop: 12, paddingTop: 12, borderTop: "1px solid #f3f4f6",
        fontSize: ".75rem", color: "#374151", lineHeight: 1.6,
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
      }}>
        <span>
          Pick the timezone your salon operates in. All business hours and appointment
          times use this setting. Changing your business address may re-detect it.
        </span>
        <Link to="/settings" style={{ color: "#0284c7", textDecoration: "underline", whiteSpace: "nowrap" }}>
          Business Settings
        </Link>
      </div>
    </div>
  );
}

/** Mobile-only: a single day card with open/closed toggle and time pickers */
function MobileDayCard({
  h,
  onUpdate,
}: {
  h: DayHours;
  onUpdate: (dow: number, field: keyof DayHours, value: string | boolean) => void;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        padding: "14px 16px",
        boxShadow: "0 1px 3px 0 rgb(0 0 0/.04)",
      }}
    >
      {/* Day name + closed toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: h.isClosed ? 0 : 12 }}>
        <span style={{ fontWeight: 700, fontSize: ".92rem", color: "#1c1917" }}>
          {DOW_NAME[h.dayOfWeek]}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {h.isClosed && (
            <span style={{ fontSize: ".78rem", color: "#9ca3af", fontStyle: "italic" }}>Closed</span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Checkbox
              checked={h.isClosed}
              onCheckedChange={(checked) => onUpdate(h.dayOfWeek, "isClosed", !!checked)}
            />
            <Label style={{ fontSize: ".8rem", color: "#374151", cursor: "pointer", fontWeight: 500 }}>Closed</Label>
          </div>
        </div>
      </div>

      {/* Time pickers */}
      {!h.isClosed && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: ".75rem", fontWeight: 600, color: "#374151", minWidth: 46 }}>Opens</span>
            <TimeInput value={h.openTime} onChange={(v) => onUpdate(h.dayOfWeek, "openTime", v)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: ".75rem", fontWeight: 600, color: "#374151", minWidth: 46 }}>Closes</span>
            <TimeInput value={h.closeTime} onChange={(v) => onUpdate(h.dayOfWeek, "closeTime", v)} />
          </div>
        </div>
      )}
    </div>
  );
}

function BusinessHoursEditor({ store }: { store: Store }) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [weekDate, setWeekDate] = useState(new Date());
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [hours, setHours] = useState<DayHours[]>(DEFAULT_HOURS);

  const weekStart = startOfWeek(weekDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekDate, { weekStartsOn: 1 });

  const { data: savedHours } = useQuery<BusinessHours[]>({
    queryKey: ["/api/business-hours", store.id],
    queryFn: async () => {
      const res = await fetch(`/api/business-hours?storeId=${store.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch business hours");
      return res.json();
    },
    enabled: !!store.id,
  });

  useEffect(() => {
    if (savedHours && savedHours.length > 0) {
      setHours(
        savedHours
          .map(h => ({
            dayOfWeek: h.dayOfWeek,
            openTime: h.openTime,
            closeTime: h.closeTime,
            isClosed: h.isClosed,
          }))
          .sort((a, b) => DOW_TO_DISPLAY[a.dayOfWeek] - DOW_TO_DISPLAY[b.dayOfWeek]),
      );
    }
  }, [savedHours]);

  const saveHours = useMutation({
    mutationFn: async (data: DayHours[]) => {
      const res = await apiRequest("PUT", "/api/business-hours", {
        storeId: store.id,
        hours: data,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-hours", store.id] });
      toast({ title: "Hours saved", description: "Business hours have been updated." });
      setEditingDay(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save hours.", variant: "destructive" });
    },
  });

  const handleSaveAll = () => {
    for (const h of hours) {
      if (h.isClosed) continue;
      const [oh, om] = h.openTime.split(":").map(Number);
      const [ch, cm] = h.closeTime.split(":").map(Number);
      if (ch * 60 + cm <= oh * 60 + om) {
        toast({
          title: "Invalid hours",
          description: `${DAY_NAMES[h.dayOfWeek]}: Close time must be after open time.`,
          variant: "destructive",
        });
        return;
      }
    }
    saveHours.mutate(hours);
  };

  const updateDayHours = (dow: number, field: keyof DayHours, value: string | boolean) => {
    setHours(prev => prev.map(h => h.dayOfWeek === dow ? { ...h, [field]: value } : h));
  };

  const weeklyTotal = computeWeeklyHours(hours);

  const weeklyMins = hours.reduce((sum, h) => {
    if (h.isClosed) return sum;
    const [oh, om] = h.openTime.split(":").map(Number);
    const [ch, cm] = h.closeTime.split(":").map(Number);
    const diff = ch * 60 + cm - (oh * 60 + om);
    return sum + (diff > 0 ? diff : 0);
  }, 0);
  const monthMins = Math.round(weeklyMins * 4.33);
  const monthHrs = Math.floor(monthMins / 60);
  const monthMin = monthMins % 60;
  const monthTotal = `${monthHrs} hours ${monthMin} min`;

  const today = new Date();

  /* ── Mobile card layout ────────────────────────────────────────────────── */
  if (isMobile) {
    return (
      <div className="space-y-3">
        {/* Week navigator */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "12px 16px", boxShadow: "0 1px 3px 0 rgb(0 0 0/.04)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={() => setWeekDate(subWeeks(weekDate, 1))}
            data-testid="button-prev-week"
            style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #e5e7eb", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#374151" }}
          >
            <ChevronLeft style={{ width: 16, height: 16 }} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexDirection: "column" }}>
            <span style={{ fontSize: ".8rem", fontWeight: 700, color: "#374151" }}>
              {format(weekStart, "dd MMM")} – {format(weekEnd, "dd MMM yyyy")}
            </span>
            <span style={{ fontSize: ".7rem", color: "#9ca3af" }}>Week: {weeklyTotal}</span>
          </div>
          <button
            onClick={() => setWeekDate(addWeeks(weekDate, 1))}
            data-testid="button-next-week"
            style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #e5e7eb", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#374151" }}
          >
            <ChevronRight style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Day cards */}
        {hours.map((h) => (
          <MobileDayCard key={h.dayOfWeek} h={h} onUpdate={updateDayHours} />
        ))}

        {/* Save button */}
        <Button
          onClick={handleSaveAll}
          disabled={saveHours.isPending}
          className="w-full"
          style={{ background: "#0f172a", color: "#fff", height: 48, fontSize: ".92rem" }}
        >
          <Save style={{ width: 15, height: 15, marginRight: 8 }} />
          {saveHours.isPending ? "Saving…" : "Save Hours"}
        </Button>
      </div>
    );
  }

  /* ── Desktop table layout ───────────────────────────────────────────────── */
  return (
    <div className="space-y-3">
      {/* Week navigator */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "12px 20px", boxShadow: "0 1px 3px 0 rgb(0 0 0/.04)", display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <button
          onClick={() => setWeekDate(subWeeks(weekDate, 1))}
          data-testid="button-prev-week"
          style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid #e5e7eb", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#374151" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f9fafb"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#fff"}
        >
          <ChevronLeft style={{ width: 15, height: 15 }} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: ".85rem", fontWeight: 600, color: "#374151", background: "#f3f4f6", padding: "3px 10px", borderRadius: 20 }}>
            This Week
          </span>
          <CalendarIcon style={{ width: 15, height: 15, color: "#9ca3af" }} />
          <span style={{ fontSize: ".85rem", color: "#374151", fontWeight: 500 }}>
            {format(weekStart, "dd MMM").toUpperCase()} – {format(weekEnd, "dd MMM yyyy").toUpperCase()}
          </span>
        </div>

        <button
          onClick={() => setWeekDate(addWeeks(weekDate, 1))}
          data-testid="button-next-week"
          style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid #e5e7eb", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#374151" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f9fafb"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#fff"}
        >
          <ChevronRight style={{ width: 15, height: 15 }} />
        </button>
      </div>

      {/* Table card */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px 0 rgb(0 0 0/.04)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "12px 20px", textAlign: "left", background: "#f9fafb", minWidth: 170, whiteSpace: "nowrap" }} />
                {DAY_NAMES.map((day, i) => {
                  const date = addDays(weekStart, i);
                  const isToday = today.toDateString() === date.toDateString();
                  return (
                    <th
                      key={day}
                      style={{
                        padding: "11px 8px",
                        textAlign: "center",
                        fontSize: ".78rem",
                        fontWeight: 600,
                        color: isToday ? "#2563eb" : "#374151",
                        background: isToday ? "#eff6ff" : "#f9fafb",
                        minWidth: 100,
                        borderLeft: "1px solid #f3f4f6",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        {isToday && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2563eb", display: "inline-block", flexShrink: 0 }} />}
                        <span style={{ fontWeight: 700 }}>{day}</span>
                      </div>
                      <div style={{ fontWeight: 400, color: isToday ? "#2563eb" : "#4b5563", fontSize: ".73rem", marginTop: 1 }}>
                        {format(date, "dd MMM.")}.
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "14px 20px", verticalAlign: "top", background: "#f9fafb" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: ".86rem", fontWeight: 700, color: "#1c1917" }}>Business Hours</span>
                    <button
                      onClick={() => setEditingDay(editingDay !== null ? null : 0)}
                      data-testid="button-edit-hours"
                      style={{
                        fontSize: ".78rem", fontWeight: 600,
                        color: editingDay !== null ? "#6b7280" : "#2563eb",
                        background: "none", border: "none", cursor: "pointer", padding: 0,
                        textDecoration: "underline", textUnderlineOffset: 2,
                      }}
                    >
                      {editingDay !== null ? "Done" : "Edit"}
                    </button>
                  </div>
                  <div style={{ marginTop: 5, fontSize: ".73rem", color: "#4b5563", lineHeight: 1.6 }}>
                    <div>Week: {weeklyTotal}</div>
                    <div>month: {monthTotal}</div>
                  </div>
                </td>
                {hours.map((h, i) => {
                  const date = addDays(weekStart, i);
                  const isToday = today.toDateString() === date.toDateString();
                  return (
                    <td
                      key={i}
                      style={{
                        textAlign: "center",
                        padding: "14px 8px",
                        fontSize: ".82rem",
                        borderLeft: "1px solid #f3f4f6",
                        background: isToday ? "#fafcff" : "transparent",
                        verticalAlign: "middle",
                      }}
                      data-testid={`text-hours-day-${i}`}
                    >
                      {h.isClosed ? (
                        <span style={{ color: "#6b7280", fontStyle: "italic", fontSize: ".8rem" }}>Closed</span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: ".67rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em", minWidth: 38, textAlign: "right" }}>Opens</span>
                            <span style={{ color: "#111827", fontWeight: 600, fontSize: ".82rem" }}>{formatTime12(h.openTime)}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: ".67rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em", minWidth: 38, textAlign: "right" }}>Closes</span>
                            <span style={{ color: "#374151", fontWeight: 500, fontSize: ".82rem" }}>{formatTime12(h.closeTime)}</span>
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Inline edit panel */}
        {editingDay !== null && (
          <div style={{ borderTop: "1px solid #e5e7eb", padding: "20px 20px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: ".88rem", fontWeight: 700, color: "#1c1917" }}>Edit Business Hours</h3>
              <Button
                size="sm"
                onClick={handleSaveAll}
                disabled={saveHours.isPending}
                style={{ background: "#0f172a", color: "#fff", fontSize: ".78rem", height: 32 }}
              >
                <Save style={{ width: 13, height: 13, marginRight: 5 }} />
                {saveHours.isPending ? "Saving…" : "Save hours"}
              </Button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {hours.map((h, i) => (
                <div
                  key={i}
                  style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "#f9fafb", border: "1px solid #f3f4f6" }}
                  data-testid={`edit-hours-day-${i}`}
                >
                  <span style={{ fontWeight: 600, fontSize: ".84rem", color: "#1c1917", minWidth: 88 }}>{DOW_NAME[h.dayOfWeek]}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Checkbox
                      checked={h.isClosed}
                      onCheckedChange={(checked) => updateDayHours(h.dayOfWeek, "isClosed", !!checked)}
                      data-testid={`checkbox-closed-day-${h.dayOfWeek}`}
                    />
                    <Label style={{ fontSize: ".8rem", color: "#374151", cursor: "pointer", fontWeight: 500 }}>Closed</Label>
                  </div>
                  {!h.isClosed && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: ".75rem", fontWeight: 600, color: "#374151", minWidth: 46 }}>Opens</span>
                        <TimeInput
                          value={h.openTime}
                          onChange={(v) => updateDayHours(h.dayOfWeek, "openTime", v)}
                          testId={`input-open-time-day-${h.dayOfWeek}`}
                        />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: ".75rem", fontWeight: 600, color: "#374151", minWidth: 46 }}>Closes</span>
                        <TimeInput
                          value={h.closeTime}
                          onChange={(v) => updateDayHours(h.dayOfWeek, "closeTime", v)}
                          testId={`input-close-time-day-${h.dayOfWeek}`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BusinessHoursPage() {
  const { selectedStore } = useSelectedStore();

  const { data: store, isLoading } = useQuery<Store>({
    queryKey: ["/api/stores", selectedStore?.id],
    enabled: !!selectedStore?.id,
  });

  if (isLoading || !store) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">Loading...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="sticky top-0 z-20 bg-background border-b px-6 py-4 -mx-6 -mt-6 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold" data-testid="text-page-title">Business Hours</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your business working hours</p>
        </div>
      </div>
      <div className="space-y-4">
        <TimezoneCard store={store} />
        <BusinessHoursEditor store={store} />
      </div>
    </AppLayout>
  );
}
