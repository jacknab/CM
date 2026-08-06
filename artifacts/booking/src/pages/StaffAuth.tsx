import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Loader2, ArrowRight, Phone, MessageSquare, X, AlertCircle, Timer,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";

const STORAGE_KEY = "booking_user_session";

type LoginMode = "phone" | "otp";

type DialogType = "error" | "otp_locked" | "portal_disabled" | "otp_already_sent";

interface DialogState {
  type: DialogType;
  title: string;
  message: string;
  retryAfterSecs?: number;
}

function useCountdown(initialSecs: number | undefined) {
  const [remaining, setRemaining] = useState(initialSecs ?? 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!initialSecs) return;
    setRemaining(initialSecs);
    intervalRef.current = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [initialSecs]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const display = `${mins}:${String(secs).padStart(2, "0")}`;
  return { remaining, display };
}

function LoginDialog({ dialog, onClose }: { dialog: DialogState; onClose: () => void }) {
  const { remaining, display } = useCountdown(dialog.retryAfterSecs);
  const isLockout = dialog.type === "otp_locked";
  const isPortalDisabled = dialog.type === "portal_disabled";

  const icon = isPortalDisabled ? (
    <AlertCircle className="w-8 h-8 text-red-400" />
  ) : isLockout ? (
    <Timer className="w-8 h-8 text-orange-400" />
  ) : (
    <AlertCircle className="w-8 h-8 text-red-400" />
  );

  const iconBg = isPortalDisabled
    ? "bg-red-500/10 border-red-500/20"
    : isLockout
    ? "bg-orange-500/10 border-orange-500/20"
    : "bg-red-500/10 border-red-500/20";

  const canDismiss = !isLockout || remaining === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
      style={{ background: "rgba(5,12,24,0.88)", backdropFilter: "blur(10px)" }}
      onClick={canDismiss ? onClose : undefined}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl bg-[#0d1a2d] border border-white/10 p-8 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {canDismiss && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className={`w-16 h-16 rounded-full border flex items-center justify-center mx-auto mb-5 ${iconBg}`}>
          {icon}
        </div>

        <h2 className="text-xl font-black mb-3 leading-tight">{dialog.title}</h2>
        <p className="text-white/60 text-sm leading-relaxed mb-5">{dialog.message}</p>

        {isLockout && remaining > 0 && (
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-orange-500/10 border border-orange-500/20">
              <Timer className="w-4 h-4 text-orange-400" />
              <span className="text-orange-300 font-mono text-xl font-bold tracking-widest">{display}</span>
            </div>
            <p className="text-white/35 text-xs mt-2">Try again when the timer reaches 0:00</p>
          </div>
        )}

        {isLockout && remaining === 0 ? (
          <button
            onClick={onClose}
            className="w-full h-12 rounded-2xl bg-[#00D4AA] text-[#050C18] font-bold text-sm transition-colors"
          >
            Try again now
          </button>
        ) : !isLockout ? (
          <button
            onClick={onClose}
            className="w-full h-12 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm transition-colors"
          >
            {isPortalDisabled ? "Understood" : "Go back and try again"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function StaffAuth() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [mode, setMode] = useState<LoginMode>("phone");
  const [phone, setPhone] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !user) return;
    if (user.role === "staff") navigate("/staff-dashboard", { replace: true });
  }, [isAuthenticated, user, authLoading, navigate]);

  const showDialog = (d: DialogState) => setDialog(d);
  const closeDialog = () => setDialog(null);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setIsSendingCode(true);
    try {
      const res = await fetch("/api/auth/staff-request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "PORTAL_DISABLED") {
          showDialog({
            type: "portal_disabled",
            title: "Staff Portal Disabled",
            message: "This salon has disabled access to the Staff Portal. Contact your salon owner or manager for assistance.",
          });
          return;
        }
        if (res.status === 429) {
          showDialog({
            type: "otp_already_sent",
            title: "Code Already Sent",
            message: "A sign-in code was already sent to your number. Check your SMS and enter it below. You can request a new one after 2 minutes.",
          });
          setMode("otp");
          return;
        }
        showDialog({ type: "error", title: "Couldn't Send Code", message: data.message || "Failed to send the sign-in code. Please try again." });
        return;
      }
      setMode("otp");
    } catch {
      showDialog({ type: "error", title: "Connection Error", message: "Something went wrong. Please check your connection and try again." });
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) return;
    setIsVerifying(true);
    try {
      const res = await fetch("/api/auth/staff-otp-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "PORTAL_DISABLED") {
          showDialog({
            type: "portal_disabled",
            title: "Staff Portal Disabled",
            message: "This salon has disabled access to the Staff Portal. Contact your salon owner or manager for assistance.",
          });
          return;
        }
        if (data.code === "OTP_IP_LOCKED") {
          showDialog({
            type: "otp_locked",
            title: "Too Many Attempts",
            message: "This device has been temporarily blocked from verifying codes due to too many incorrect attempts.",
            retryAfterSecs: data.retryAfterSecs,
          });
          return;
        }
        showDialog({
          type: "error",
          title: "Invalid Code",
          message: data.message || "That code didn't match. Double-check the SMS and try again, or request a new code.",
        });
        return;
      }
      queryClient.setQueryData(["/api/auth/user"], data);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "true");
      // First-time login: redirect to onboarding wizard; otherwise go to dashboard
      if (data.onboardingCompleted === false) {
        navigate("/staff-onboarding", { replace: true });
      } else {
        navigate("/staff-dashboard", { replace: true });
      }
    } catch {
      showDialog({ type: "error", title: "Connection Error", message: "Something went wrong. Please check your connection and try again." });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-[#050C18] text-white font-['Plus_Jakarta_Sans',sans-serif] flex flex-col"
      style={{ minHeight: "100dvh" }}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#00D4AA]/10 rounded-full blur-[120px]" />
      </div>

      <header className="relative z-10 px-5 pt-6 pb-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img
            src="/web-app.png"
            alt="Certxa"
            className="w-8 h-8 rounded-lg"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <span className="font-extrabold text-lg tracking-tight">Certxa</span>
        </Link>
        <Link to="/auth" className="text-white/50 hover:text-white text-xs font-medium transition-colors">
          Owner login
        </Link>
      </header>

      <main className="relative z-10 flex-1 flex flex-col justify-center px-5 pb-8 pt-4 max-w-md mx-auto w-full">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00D4AA]/10 border border-[#00D4AA]/30 text-[#00D4AA] mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00D4AA] animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Staff Portal</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-2">Welcome back</h1>
          <p className="text-white/55 text-sm">
            {mode === "otp"
              ? "Enter the code we sent to your phone."
              : "Enter your phone number to receive a sign-in code."}
          </p>
        </div>

        {mode === "phone" && (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <label htmlFor="phone" className="block text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  required
                  className="w-full h-14 pl-12 pr-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 text-base focus:outline-none focus:border-[#00D4AA]/60 transition-colors"
                />
              </div>
              <p className="text-white/35 text-xs mt-2 leading-relaxed">
                We'll send an 8-digit code to your phone. Standard SMS rates may apply.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSendingCode || !phone.trim()}
              className="w-full h-14 rounded-2xl bg-[#00D4AA] text-[#050C18] font-bold text-base flex items-center justify-center gap-2 hover:bg-[#00bfa5] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSendingCode ? <Loader2 className="w-5 h-5 animate-spin" /> : (<><MessageSquare className="w-5 h-5" /> Send code</>)}
            </button>

            <p className="mt-4 text-white/30 text-xs text-center">
              No account? Ask your salon owner to add you as a staff member.
            </p>
          </form>
        )}

        {mode === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label htmlFor="otp" className="block text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2">
                Access Code
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Enter 8-digit code"
                required
                className="w-full h-14 px-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 text-xl font-mono tracking-[0.3em] text-center focus:outline-none focus:border-[#00D4AA]/60 transition-colors"
              />
              <p className="text-white/35 text-xs mt-2 text-center">
                Sent to {phone || "your phone"} · valid for 15 minutes
              </p>
            </div>

            <button
              type="submit"
              disabled={isVerifying || otp.length < 7}
              className="w-full h-14 rounded-2xl bg-[#00D4AA] text-[#050C18] font-bold text-base flex items-center justify-center gap-2 hover:bg-[#00bfa5] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : (<>Verify <ArrowRight className="w-5 h-5" /></>)}
            </button>

            <button
              type="button"
              onClick={() => { setMode("phone"); setOtp(""); }}
              className="w-full h-12 rounded-2xl border border-white/10 bg-white/5 text-white/70 hover:text-white hover:border-white/20 font-medium text-sm flex items-center justify-center gap-2 transition-colors"
            >
              ← Use a different number
            </button>
          </form>
        )}
      </main>

      <footer className="relative z-10 px-5 py-5 text-center space-y-2">
        <div className="flex items-center justify-center gap-4">
          <a href="https://certxa.com/privacy" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white/70 text-[11px] transition-colors">
            Privacy Policy
          </a>
          <span className="text-white/20 text-[11px]">·</span>
          <a href="https://certxa.com/terms" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white/70 text-[11px] transition-colors">
            Terms of Service
          </a>
        </div>
        <p className="text-white/20 text-[11px]">© {new Date().getFullYear()} Certxa</p>
      </footer>

      {dialog && <LoginDialog dialog={dialog} onClose={closeDialog} />}
    </div>
  );
}
