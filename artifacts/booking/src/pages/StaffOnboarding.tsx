import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2, ArrowRight, Mail, Lock, Eye, EyeOff, Check,
  Camera, Upload, ChevronLeft, Clock, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "account" | "availability" | "photo";

const STEPS: Step[] = ["account", "availability", "photo"];

const STEP_LABELS: Record<Step, string> = {
  account:      "Account Setup",
  availability: "Your Hours",
  photo:        "Profile Photo",
};

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface SlotState {
  enabled:   boolean;
  startTime: string;
  endTime:   string;
}

const DEFAULT_SLOTS: SlotState[] = DAY_LABELS.map((_, i) => ({
  enabled:   i >= 1 && i <= 5, // Mon–Fri on by default
  startTime: "09:00",
  endTime:   "17:00",
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "" };
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: s, label: "Weak",   color: "#ef4444" };
  if (s <= 3) return { score: s, label: "Fair",   color: "#f59e0b" };
  return         { score: s, label: "Strong", color: "#00D4AA" };
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, i) => {
        const done    = i < idx;
        const active  = i === idx;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                done   ? "bg-[#00D4AA] text-[#050C18]" :
                active ? "bg-[#00D4AA]/20 border-2 border-[#00D4AA] text-[#00D4AA]" :
                         "bg-white/5 border border-white/20 text-white/30"
              }`}
            >
              {done ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-xs font-semibold hidden sm:block ${active ? "text-white" : done ? "text-[#00D4AA]" : "text-white/30"}`}>
              {STEP_LABELS[step]}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-px ${done ? "bg-[#00D4AA]" : "bg-white/15"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Account setup ─────────────────────────────────────────────────────

function AccountStep({ onNext }: { onNext: () => void }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const strength = passwordStrength(password);
  const mismatch = confirm.length > 0 && confirm !== password;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) return;
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/staff/onboarding/account", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? "Failed to save account. Try again."); return; }
      onNext();
    } catch {
      setError("Connection error. Check your network and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="mb-6">
        <h2 className="text-2xl font-black leading-tight mb-1">Set up your account</h2>
        <p className="text-white/55 text-sm leading-relaxed">
          Create a login so you can sign in directly from the main login page next time — no SMS code needed.
        </p>
      </div>

      {/* Email */}
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2">
          Email Address
        </label>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full h-13 pl-11 pr-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#00D4AA]/60 transition-colors"
            style={{ height: "52px" }}
          />
        </div>
        <p className="text-white/35 text-xs mt-1.5">This becomes your login email — make sure it's one you check.</p>
      </div>

      {/* Password */}
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2">
          Password
        </label>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
            className="w-full h-13 pl-11 pr-11 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#00D4AA]/60 transition-colors"
            style={{ height: "52px" }}
          />
          <button
            type="button"
            onClick={() => setShowPw(v => !v)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
          >
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {/* Strength bar */}
        {password.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex gap-1 flex-1">
              {[1, 2, 3, 4, 5].map(n => (
                <div
                  key={n}
                  className="h-1 flex-1 rounded-full transition-all"
                  style={{ background: n <= strength.score ? strength.color : "rgba(255,255,255,0.1)" }}
                />
              ))}
            </div>
            <span className="text-xs font-semibold" style={{ color: strength.color }}>{strength.label}</span>
          </div>
        )}
      </div>

      {/* Confirm password */}
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2">
          Confirm Password
        </label>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type={showConf ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Re-enter password"
            className={`w-full h-13 pl-11 pr-11 bg-white/5 border rounded-2xl text-white placeholder-white/30 text-sm focus:outline-none transition-colors ${
              mismatch ? "border-red-500/60 focus:border-red-500/80" : "border-white/10 focus:border-[#00D4AA]/60"
            }`}
            style={{ height: "52px" }}
          />
          <button
            type="button"
            onClick={() => setShowConf(v => !v)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
          >
            {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {mismatch && <p className="text-red-400 text-xs mt-1.5">Passwords don't match.</p>}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={saving || !email.trim() || !password || !confirm}
        className="w-full h-14 rounded-2xl bg-[#00D4AA] text-[#050C18] font-bold text-base flex items-center justify-center gap-2 hover:bg-[#00bfa5] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
      >
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : (<>Continue <ArrowRight className="w-5 h-5" /></>)}
      </button>
    </form>
  );
}

// ── Step 2: Availability ──────────────────────────────────────────────────────

function AvailabilityStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [slots, setSlots] = useState<SlotState[]>(DEFAULT_SLOTS);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const toggle = (i: number) =>
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, enabled: !s.enabled } : s));

  const setTime = (i: number, field: "startTime" | "endTime", val: string) =>
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/staff/onboarding/availability", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({
          slots: slots.map((s, i) => ({ dayOfWeek: i, ...s })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? "Failed to save. Try again."); return; }
      onNext();
    } catch {
      setError("Connection error. Check your network and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="mb-4">
        <h2 className="text-2xl font-black leading-tight mb-1">Your available hours</h2>
        <p className="text-white/55 text-sm leading-relaxed">
          Set the days and times you're generally available. Your manager can adjust these later.
        </p>
      </div>

      <div className="space-y-2">
        {slots.map((slot, i) => (
          <div
            key={i}
            className={`rounded-2xl border transition-all ${
              slot.enabled
                ? "border-[#00D4AA]/30 bg-[#00D4AA]/5"
                : "border-white/10 bg-white/[0.02]"
            }`}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Toggle */}
              <button
                type="button"
                onClick={() => toggle(i)}
                className={`relative w-10 h-5 rounded-full transition-all shrink-0 ${
                  slot.enabled ? "bg-[#00D4AA]" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    slot.enabled ? "translate-x-5" : ""
                  }`}
                />
              </button>

              {/* Day label */}
              <span className={`font-semibold text-sm w-24 ${slot.enabled ? "text-white" : "text-white/40"}`}>
                <span className="hidden sm:inline">{DAY_LABELS[i]}</span>
                <span className="inline sm:hidden">{DAY_SHORT[i]}</span>
              </span>

              {/* Time pickers */}
              {slot.enabled ? (
                <div className="flex items-center gap-2 flex-1">
                  <div className="relative flex-1">
                    <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#00D4AA]/60" />
                    <input
                      type="time"
                      value={slot.startTime}
                      onChange={e => setTime(i, "startTime", e.target.value)}
                      className="w-full pl-8 pr-2 py-2 text-sm bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#00D4AA]/50 [color-scheme:dark]"
                    />
                  </div>
                  <span className="text-white/30 text-xs shrink-0">to</span>
                  <div className="relative flex-1">
                    <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#00D4AA]/60" />
                    <input
                      type="time"
                      value={slot.endTime}
                      onChange={e => setTime(i, "endTime", e.target.value)}
                      className="w-full pl-8 pr-2 py-2 text-sm bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#00D4AA]/50 [color-scheme:dark]"
                    />
                  </div>
                </div>
              ) : (
                <span className="text-white/25 text-xs flex-1">Not available</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="h-14 px-5 rounded-2xl border border-white/10 bg-white/5 text-white/70 hover:text-white hover:border-white/20 font-medium text-sm flex items-center gap-2 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 h-14 rounded-2xl bg-[#00D4AA] text-[#050C18] font-bold text-base flex items-center justify-center gap-2 hover:bg-[#00bfa5] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : (<>Continue <ArrowRight className="w-5 h-5" /></>)}
        </button>
      </div>
    </form>
  );
}

// ── Step 3: Photo upload ──────────────────────────────────────────────────────

function PhotoStep({
  onFinish, staffId,
}: {
  onFinish: () => void;
  staffId: number | null;
}) {
  const [preview,   setPreview]   = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [uploaded,  setUploaded]  = useState(false);
  const [error,     setError]     = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const res = await fetch(`/api/staff/${staffId ?? "me"}/avatar`, {
        method:      "POST",
        credentials: "include",
        body:        form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as any).message ?? "Upload failed. Try again.");
        setPreview(null);
        return;
      }
      setUploaded(true);
    } catch {
      setError("Connection error. Check your network and try again.");
      setPreview(null);
    } finally {
      setUploading(false);
    }
  }, [staffId]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  };

  const complete = async () => {
    setError("");
    setCompleting(true);
    try {
      const res = await fetch("/api/staff/onboarding/complete", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as any).message ?? "Failed to complete setup. Try again.");
        return;
      }
      onFinish();
    } catch {
      setError("Connection error. Check your network and try again.");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="mb-4">
        <h2 className="text-2xl font-black leading-tight mb-1">Add a profile photo</h2>
        <p className="text-white/55 text-sm leading-relaxed">
          Your photo appears on your salon's website and in the booking flow. You can always change it later from your profile.
        </p>
      </div>

      {/* Drop zone / preview */}
      <div
        className={`relative rounded-3xl border-2 border-dashed transition-all cursor-pointer ${
          preview ? "border-[#00D4AA]/30" : "border-white/15 hover:border-white/30"
        }`}
        style={{ minHeight: "220px" }}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        {preview ? (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <div className="relative">
              <img
                src={preview}
                alt="Preview"
                className="w-32 h-32 rounded-full object-cover border-4 border-[#00D4AA]/40"
              />
              {uploading && (
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-[#00D4AA] animate-spin" />
                </div>
              )}
              {uploaded && !uploading && (
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#00D4AA] flex items-center justify-center border-2 border-[#050C18]">
                  <Check className="w-4 h-4 text-[#050C18]" />
                </div>
              )}
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                className="text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1"
              >
                <Camera className="w-3.5 h-3.5" /> Change photo
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-4 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/15 flex items-center justify-center">
              <Upload className="w-7 h-7 text-white/30" />
            </div>
            <div>
              <p className="text-white/60 text-sm font-medium">Click to upload or drag &amp; drop</p>
              <p className="text-white/30 text-xs mt-1">JPG, PNG or WebP · max 20 MB</p>
            </div>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={complete}
        disabled={uploading || completing}
        className="w-full h-14 rounded-2xl bg-[#00D4AA] text-[#050C18] font-bold text-base flex items-center justify-center gap-2 hover:bg-[#00bfa5] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {completing ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Finishing…</>
        ) : uploaded ? (
          <><Check className="w-5 h-5" /> All done — go to my dashboard</>
        ) : (
          <>Skip for now — go to my dashboard</>
        )}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StaffOnboarding() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const { user }     = useAuth();
  const [step, setStep] = useState<Step>("account");

  const staffId = (user as any)?.staffId ?? null;

  const finish = async () => {
    // Invalidate the auth cache so the refreshed user (onboardingCompleted=true) is fetched
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    navigate("/staff-dashboard", { replace: true });
  };

  return (
    <div
      className="min-h-screen w-full bg-[#050C18] text-white font-['Plus_Jakarta_Sans',sans-serif] flex flex-col"
      style={{ minHeight: "100dvh" }}
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#00D4AA]/8 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 px-5 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/web-app.png"
            alt="Certxa"
            className="w-8 h-8 rounded-lg"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <span className="font-extrabold text-lg tracking-tight">Certxa</span>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00D4AA]/10 border border-[#00D4AA]/30 text-[#00D4AA]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00D4AA] animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-wider">Getting Started</span>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col justify-center px-5 pb-8 pt-4 max-w-md mx-auto w-full">
        <StepIndicator current={step} />

        {step === "account" && (
          <AccountStep onNext={() => setStep("availability")} />
        )}
        {step === "availability" && (
          <AvailabilityStep
            onNext={() => setStep("photo")}
            onBack={() => setStep("account")}
          />
        )}
        {step === "photo" && (
          <PhotoStep onFinish={finish} staffId={staffId} />
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-5 py-5 text-center">
        <p className="text-white/20 text-[11px]">© {new Date().getFullYear()} Certxa</p>
      </footer>
    </div>
  );
}
