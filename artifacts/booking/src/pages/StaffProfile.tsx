import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StaffPortalNav } from "@/components/StaffPortalNav";
import {
  ArrowLeft, Camera, ImagePlus, User, Mail, Phone, Lock, Hash,
  Eye, EyeOff, Check, Loader2, X, ChevronRight, Clock,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn, e164ToInputDigits, formatPhoneInput } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffProfileData = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  role: string | null;
  color: string | null;
};

type AvailabilityRule = { id?: number; dayOfWeek: number; startTime: string; endTime: string };
type DaySchedule = { working: boolean; startTime: string; endTime: string };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_START = "09:00";
const DEFAULT_END   = "17:00";

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 px-1 mb-2 mt-6">
      {label}
    </p>
  );
}

function FieldRow({
  icon: Icon, label, value, onChange, type = "text", placeholder, readOnly = false, rightSlot, error,
}: {
  icon: React.ElementType; label: string; value: string;
  onChange?: (v: string) => void; type?: string; placeholder?: string;
  readOnly?: boolean; rightSlot?: React.ReactNode; error?: string;
}) {
  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-3.5 px-4 py-3.5">
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-slate-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-none mb-0.5">{label}</p>
          <input
            type={type} value={value} onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder ?? label} readOnly={readOnly}
            className={cn(
              "w-full text-[15px] font-medium text-slate-800 bg-transparent outline-none placeholder:text-slate-300",
              readOnly && "opacity-40 cursor-default select-none",
            )}
          />
        </div>
        {rightSlot}
      </div>
      {error && <p className="text-[11px] text-red-500 px-4 pb-2 -mt-1">{error}</p>}
    </div>
  );
}

function PinDots({ value, length = 4 }: { value: string; length?: number }) {
  return (
    <div className="flex gap-3 justify-center py-3">
      {Array.from({ length }).map((_, i) => (
        <div key={i} className={cn(
          "w-3.5 h-3.5 rounded-full border-2 transition-all duration-150",
          i < value.length ? "bg-teal-500 border-teal-500 scale-110" : "border-slate-300 bg-white",
        )} />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StaffProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  // ── Profile ──────────────────────────────────────────────────────────────────
  const { data: profile, isLoading } = useQuery<StaffProfileData>({
    queryKey: ["/api/staff/me/profile"],
    queryFn: async () => {
      const res = await fetch("/api/staff/me/profile", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });

  const { data: pinData } = useQuery<{ hasPin: boolean }>({
    queryKey: ["/api/staff/me/pin"],
    queryFn: async () => {
      const res = await fetch("/api/staff/me/pin", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to check PIN");
      return res.json();
    },
  });

  // ── Availability ─────────────────────────────────────────────────────────────
  const { data: availabilityRules } = useQuery<AvailabilityRule[]>({
    queryKey: ["/api/staff/availability", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const res = await fetch(`/api/staff/${profile.id}/availability`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!profile?.id,
  });

  // ── Local state ──────────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");

  // 7-element array: index = dayOfWeek (0=Sun)
  const [weekSchedule, setWeekSchedule] = useState<DaySchedule[]>(
    Array.from({ length: 7 }, () => ({ working: false, startTime: DEFAULT_START, endTime: DEFAULT_END }))
  );
  const [availDirty, setAvailDirty] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setEmail(profile.email ?? "");
      setPhone(formatPhoneInput(e164ToInputDigits(profile.phone)));
    }
  }, [profile]);

  useEffect(() => {
    if (availabilityRules === undefined) return;
    const schedule: DaySchedule[] = Array.from({ length: 7 }, () => ({
      working: false, startTime: DEFAULT_START, endTime: DEFAULT_END,
    }));
    for (const rule of availabilityRules) {
      if (rule.dayOfWeek >= 0 && rule.dayOfWeek <= 6) {
        schedule[rule.dayOfWeek] = { working: true, startTime: rule.startTime, endTime: rule.endTime };
      }
    }
    setWeekSchedule(schedule);
    setAvailDirty(false);
  }, [availabilityRules]);

  const updateDay = useCallback((dow: number, patch: Partial<DaySchedule>) => {
    setWeekSchedule(prev => {
      const next = prev.map((d, i) => i === dow ? { ...d, ...patch } : d);
      return next;
    });
    setAvailDirty(true);
  }, []);

  // PIN state
  const [pinEntry, setPinEntry] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter");
  const [pinSaved, setPinSaved] = useState(false);

  // Password state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const infoDirty =
    profile &&
    (name !== (profile.name ?? "") ||
      email !== (profile.email ?? "") ||
      phone !== e164ToInputDigits(profile.phone));

  const passwordReady = currentPw.length >= 1 && newPw.length >= 6 && confirmPw === newPw;

  // ── Mutations ────────────────────────────────────────────────────────────────
  const updateInfo = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staff/me/profile", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "Failed to save"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/me/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "Profile saved" });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const updatePin = useMutation({
    mutationFn: async (pin: string) => {
      const res = await fetch("/api/staff/me/pin", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "Failed to set PIN"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/me/pin"] });
      setPinEntry(""); setPinConfirm(""); setPinStep("enter");
      setPinSaved(true); setTimeout(() => setPinSaved(false), 3000);
      toast({ title: "Timeclock PIN updated" });
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: "destructive" });
      setPinEntry(""); setPinConfirm(""); setPinStep("enter");
    },
  });

  const updatePassword = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staff/me/password", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "Failed to update password"); }
      return res.json();
    },
    onSuccess: () => {
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setShowPasswordSection(false);
      toast({ title: "Password updated" });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch("/api/staff/me/avatar", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "Upload failed"); }
      return res.json() as Promise<{ avatarUrl: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/me/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "Photo updated" });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const saveAvailability = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error("No profile");
      const rules = weekSchedule
        .map((d, dow) => d.working ? { dayOfWeek: dow, startTime: d.startTime, endTime: d.endTime } : null)
        .filter(Boolean);
      const res = await fetch(`/api/staff/${profile.id}/availability`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "Failed to save availability"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/availability", profile?.id] });
      setAvailDirty(false);
      toast({ title: "Working hours saved" });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  // ── PIN handlers ─────────────────────────────────────────────────────────────
  const handlePinKey = (digit: string) => {
    if (pinStep === "enter") {
      const next = pinEntry + digit;
      if (next.length <= 4) {
        setPinEntry(next);
        if (next.length === 4) setTimeout(() => setPinStep("confirm"), 250);
      }
    } else {
      const next = pinConfirm + digit;
      if (next.length <= 4) {
        setPinConfirm(next);
        if (next.length === 4) {
          if (next === pinEntry) { updatePin.mutate(next); }
          else {
            toast({ title: "PINs don't match — try again", variant: "destructive" });
            setPinEntry(""); setPinConfirm(""); setPinStep("enter");
          }
        }
      }
    }
  };

  const handlePinBackspace = () => {
    if (pinStep === "confirm") {
      if (pinConfirm.length > 0) setPinConfirm(p => p.slice(0, -1));
      else { setPinStep("enter"); setPinEntry(p => p.slice(0, -1)); }
    } else { setPinEntry(p => p.slice(0, -1)); }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const staffColor = profile?.color ?? "#14b8a6";
  const initials = (profile?.name?.[0] ?? user?.firstName?.[0] ?? "S").toUpperCase();
  const avatarUrl = profile?.avatarUrl ?? null;

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-7 h-7 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-slate-50 overflow-hidden" style={{ height: "100dvh" }}>

      {/* ── Sticky header ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shadow-sm">
        <button
          className="w-9 h-9 flex items-center justify-center rounded-full active:bg-slate-100 transition-colors"
          onClick={() => navigate(-1)} aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h1 className="font-bold text-[17px] text-slate-800 flex-1">Account Information</h1>
        <button
          className={cn(
            "px-4 py-1.5 rounded-full text-[14px] font-semibold transition-all",
            infoDirty
              ? "bg-teal-500 text-white active:bg-teal-600 shadow-sm"
              : "bg-slate-100 text-slate-400 cursor-default",
          )}
          onClick={() => {
            if (!infoDirty) return;
            if (phone) {
              const digits = phone.replace(/\D/g, "");
              if (digits.length !== 10) {
                setPhoneError("Enter a valid 10-digit US phone number");
                return;
              }
            }
            setPhoneError("");
            updateInfo.mutate();
          }}
          disabled={!infoDirty || updateInfo.isPending}
        >
          {updateInfo.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto pb-24">

        {/* ── Avatar hero ── */}
        <div className="bg-white border-b border-slate-100 pb-7 pt-8 flex flex-col items-center gap-3">
          <button
            className="relative group active:opacity-80 transition-opacity"
            onClick={() => !uploadAvatar.isPending && setPhotoMenuOpen(true)}
            disabled={uploadAvatar.isPending}
            aria-label="Change profile photo"
          >
            <div
              className="w-[88px] h-[88px] rounded-full flex items-center justify-center text-3xl font-bold overflow-hidden shadow-md ring-4 ring-white"
              style={{ backgroundColor: `${staffColor}22`, color: staffColor }}
            >
              {avatarUrl
                ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                : initials}
            </div>
            <div className="absolute bottom-0 right-0 w-7 h-7 bg-teal-500 rounded-full flex items-center justify-center shadow-md border-2 border-white">
              {uploadAvatar.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                : <Camera className="w-3.5 h-3.5 text-white" />}
            </div>
          </button>
          <div className="text-center">
            <p className="font-bold text-[17px] text-slate-800">{profile?.name ?? "Staff Member"}</p>
            {profile?.role && (
              <p className="text-[13px] text-slate-400 mt-0.5 capitalize">{profile.role}</p>
            )}
          </div>
          <button
            className="text-[12px] text-teal-600 font-medium active:opacity-70"
            onClick={() => !uploadAvatar.isPending && setPhotoMenuOpen(true)}
          >
            Change photo
          </button>
        </div>

        {/* ── Personal Info ── */}
        <div className="px-4">
          <SectionHeader label="Personal Info" />
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <FieldRow icon={User}  label="Full Name"     value={name}  onChange={setName}  placeholder="Your name" />
            <FieldRow icon={Mail}  label="Email Address" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
            <FieldRow icon={Phone} label="Phone Number"  value={phone} onChange={(v) => { setPhone(formatPhoneInput(v)); setPhoneError(""); }} placeholder="(555) 000-0000" type="tel" error={phoneError} />
          </div>
          {infoDirty && (
            <p className="text-[11px] text-teal-600 mt-1.5 ml-1">Unsaved changes — tap Save above.</p>
          )}
        </div>

        {/* ── Working Hours ── */}
        <div className="px-4">
          <SectionHeader label="Working Hours" />
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-100">
              {DAYS.map((day, dow) => {
                const sched = weekSchedule[dow];
                return (
                  <div key={dow} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {/* Day toggle */}
                      <button
                        className={cn(
                          "w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold transition-all",
                          sched.working
                            ? "bg-teal-500 text-white shadow-sm"
                            : "bg-slate-100 text-slate-400",
                        )}
                        onClick={() => updateDay(dow, { working: !sched.working })}
                        aria-label={`Toggle ${day}`}
                      >
                        {DAY_ABBR[dow].slice(0, 2)}
                      </button>

                      {/* Time pickers or "Day off" label */}
                      {sched.working ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="time"
                            value={sched.startTime}
                            onChange={e => updateDay(dow, { startTime: e.target.value })}
                            className="flex-1 text-[14px] font-medium text-slate-700 bg-slate-50 rounded-xl px-3 py-2 outline-none border border-slate-200 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition-colors"
                          />
                          <span className="text-slate-300 text-[12px] shrink-0">to</span>
                          <input
                            type="time"
                            value={sched.endTime}
                            onChange={e => updateDay(dow, { endTime: e.target.value })}
                            className="flex-1 text-[14px] font-medium text-slate-700 bg-slate-50 rounded-xl px-3 py-2 outline-none border border-slate-200 focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition-colors"
                          />
                        </div>
                      ) : (
                        <div className="flex-1">
                          <p className="text-[14px] font-medium text-slate-300">Day off</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Save hours button */}
            <div className="px-4 py-3 border-t border-slate-100">
              <button
                className={cn(
                  "w-full py-2.5 rounded-xl font-semibold text-[14px] transition-all flex items-center justify-center gap-2",
                  availDirty
                    ? "bg-teal-500 text-white active:bg-teal-600"
                    : "bg-slate-100 text-slate-400 cursor-default",
                )}
                disabled={!availDirty || saveAvailability.isPending}
                onClick={() => availDirty && saveAvailability.mutate()}
              >
                {saveAvailability.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Clock className="w-4 h-4" />}
                {availDirty ? "Save Hours" : "Hours up to date"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Security ── */}
        <div className="px-4">
          <SectionHeader label="Security" />
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">

            {/* Timeclock PIN */}
            <div className="px-4 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <Hash className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1">
                  <p className="text-[15px] font-semibold text-slate-800">
                    {pinData?.hasPin ? "Change Timeclock PIN" : "Set Timeclock PIN"}
                  </p>
                  <p className="text-[12px] text-slate-400">
                    {pinStep === "enter"
                      ? (pinData?.hasPin ? "Enter a new 4-digit PIN" : "Choose a 4-digit PIN")
                      : "Re-enter to confirm"}
                  </p>
                </div>
                {pinSaved && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-teal-500">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
                {updatePin.isPending && <Loader2 className="w-4 h-4 animate-spin text-teal-500" />}
              </div>
              <PinDots value={pinStep === "enter" ? pinEntry : pinConfirm} />
              <div className="grid grid-cols-3 gap-2 mt-2">
                {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((key) => {
                  if (key === "") return <div key="empty" />;
                  const isBack = key === "⌫";
                  return (
                    <button
                      key={key}
                      onClick={() => isBack ? handlePinBackspace() : handlePinKey(key)}
                      disabled={updatePin.isPending}
                      className={cn(
                        "h-11 rounded-xl text-[17px] font-bold transition-all active:scale-95 select-none",
                        isBack
                          ? "bg-slate-100 text-slate-500 active:bg-slate-200"
                          : "bg-slate-50 text-slate-800 active:bg-slate-100",
                      )}
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Change Password */}
            <button
              className="w-full flex items-center gap-3.5 px-4 py-3.5"
              onClick={() => setShowPasswordSection(v => !v)}
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 text-slate-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-[15px] font-semibold text-slate-800">Change Password</p>
                <p className="text-[12px] text-slate-400">Update your login password</p>
              </div>
              <ChevronRight className={cn("w-4 h-4 text-slate-300 transition-transform", showPasswordSection && "rotate-90")} />
            </button>

            {showPasswordSection && (
              <form
                className="px-4 pb-4 pt-1 flex flex-col gap-2.5 bg-slate-50"
                onSubmit={(e) => { e.preventDefault(); if (passwordReady) updatePassword.mutate(); }}
                autoComplete="on"
              >
                <input type="text" name="username" autoComplete="username"
                  className="hidden" defaultValue={profile?.email ?? ""} aria-hidden tabIndex={-1} />

                {[
                  { val: currentPw, set: setCurrentPw, show: showCurrent, toggle: () => setShowCurrent(v => !v), name: "current-password", ac: "current-password", placeholder: "Current password" },
                  { val: newPw, set: setNewPw, show: showNew, toggle: () => setShowNew(v => !v), name: "new-password", ac: "new-password", placeholder: "New password (min 6 chars)" },
                  { val: confirmPw, set: setConfirmPw, show: showConfirm, toggle: () => setShowConfirm(v => !v), name: "confirm-password", ac: "new-password", placeholder: "Confirm new password" },
                ].map((f, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 border",
                    i === 2 && confirmPw.length > 0 && confirmPw !== newPw
                      ? "bg-red-50 border-red-200"
                      : "bg-white border-slate-200",
                  )}>
                    <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type={f.show ? "text" : "password"}
                      name={f.name} autoComplete={f.ac}
                      value={f.val} onChange={e => f.set(e.target.value)}
                      placeholder={f.placeholder}
                      className="flex-1 bg-transparent text-[14px] font-medium text-slate-800 outline-none placeholder:text-slate-300"
                    />
                    <button type="button" onClick={f.toggle} className="text-slate-400 p-1">
                      {f.show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                ))}

                {confirmPw.length > 0 && confirmPw !== newPw && (
                  <p className="text-[11px] text-red-500 ml-1">Passwords don't match</p>
                )}

                <button
                  type="submit"
                  className={cn(
                    "w-full py-3 rounded-xl font-semibold text-[14px] transition-all flex items-center justify-center gap-2 mt-1",
                    passwordReady ? "bg-teal-500 text-white active:bg-teal-600" : "bg-slate-200 text-slate-400 cursor-not-allowed",
                  )}
                  disabled={!passwordReady || updatePassword.isPending}
                >
                  {updatePassword.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Update Password
                </button>
              </form>
            )}
          </div>
        </div>

      </div>

      {/* ── Hidden file inputs ── */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar.mutate(f); e.target.value = ""; }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar.mutate(f); e.target.value = ""; }} />

      {/* ── Photo action sheet ── */}
      {photoMenuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setPhotoMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-t-3xl px-4 pb-10 pt-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-6" />
            <p className="text-center text-[12px] font-semibold text-slate-400 uppercase tracking-widest mb-4">Profile Photo</p>
            <button
              className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-slate-50 active:bg-slate-100 transition-colors mb-3"
              onClick={() => { setPhotoMenuOpen(false); setTimeout(() => cameraInputRef.current?.click(), 50); }}
            >
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5 text-teal-600" />
              </div>
              <div className="text-left">
                <p className="text-[15px] font-semibold text-slate-800">Take a Photo</p>
                <p className="text-[12px] text-slate-400">Use your camera</p>
              </div>
            </button>
            <button
              className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-slate-50 active:bg-slate-100 transition-colors mb-3"
              onClick={() => { setPhotoMenuOpen(false); setTimeout(() => fileInputRef.current?.click(), 50); }}
            >
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <ImagePlus className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="text-left">
                <p className="text-[15px] font-semibold text-slate-800">Choose from Library</p>
                <p className="text-[12px] text-slate-400">Pick an existing photo</p>
              </div>
            </button>
            <button
              className="w-full py-3.5 rounded-2xl border border-slate-200 text-slate-500 font-semibold text-[14px] flex items-center justify-center gap-2 active:bg-slate-50"
              onClick={() => setPhotoMenuOpen(false)}
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      )}

      <StaffPortalNav />
    </div>
  );
}
