import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import MarketingNav from "@/components/layout/MarketingNav";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, ArrowRight, ArrowLeft, Calendar, Users, Wrench,
  CalendarDays, CreditCard, Star, Gift,
  BarChart2, ClipboardList, MessageSquare, ShieldCheck,
  Smartphone, Globe, Clock, Zap, Check, Plus, MapPin,
  ChevronDown, ChevronLeft, ChevronRight,
  Scissors, Sparkles, QrCode,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DemoCalendarBackground from "@/components/DemoCalendarBackground";

const GROUP_CONFIG = {
  booking: {
    label: "Certxa Booking",
    tagline: "Fill your calendar. Automate the rest.",
    icon: <Calendar className="w-5 h-5" />,
  },
  queue: {
    label: "Certxa Queue",
    tagline: "No appointments. No chaos.",
    icon: <Users className="w-5 h-5" />,
  },
  pro: {
    label: "Certxa Pro",
    tagline: "Run the office. Empower the crew.",
    icon: <Wrench className="w-5 h-5" />,
  },
} as const;

type GroupKey = keyof typeof GROUP_CONFIG;

const PLUM      = "#3B0764";
const PLUM_MID  = "#5B21B6";
const GOLD      = "#F59E0B";
const CHARCOAL  = "#1C1917";

const TRIAL_FEATURES = [
  { icon: CalendarDays, text: "Appointments & calendar" },
  { icon: Globe,        text: "Online booking widget" },
  { icon: CreditCard,   text: "Point of Sale & payments" },
  { icon: Users,        text: "Staff management" },
  { icon: MessageSquare,text: "SMS & email reminders (credits sold separately)" },
  { icon: Star,         text: "Loyalty program & rewards" },
  { icon: Gift,         text: "Gift cards" },
  { icon: Clock,        text: "Waitlist & virtual queue" },
  { icon: Smartphone,   text: "Google Reviews manager" },
  { icon: BarChart2,    text: "Analytics & reports" },
  { icon: ClipboardList,text: "Client intake forms" },
  { icon: Zap,          text: "Unlimited clients" },
];

// ── Booking Confirmation Preview Panel (right panel of Step 2) ───────────────

/**
 * "Continue with Google" button shared by the login and register views.
 * Full-page redirect to the backend OAuth entry point — no client-side SDK.
 * `redirectTo`/`plan` are round-tripped through the server's OAuth `state` so the
 * user lands in the same place email/password sign-in would have sent them.
 */
function GoogleAuthButton({ label, redirectTo, plan }: { label: string; redirectTo?: string | null; plan?: string | null }) {
  const params = new URLSearchParams();
  if (redirectTo) params.set("redirect", redirectTo);
  if (plan) params.set("plan", plan);
  const href = `/api/auth/google${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <a
      href={href}
      data-testid="button-google-auth"
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        gap: 10, padding: "11px 20px", borderRadius: 10,
        border: "1.5px solid #e5e7eb", background: "#fff",
        fontSize: ".875rem", fontWeight: 600, color: "#374151",
        cursor: "pointer", textDecoration: "none",
        marginBottom: 16, transition: "border-color .15s, box-shadow .15s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#d1d5db"; (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
    >
      <svg width="18" height="18" viewBox="0 0 48 48">
        <path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.5 7.3-17.3z"/>
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.9 2.3-8 2.3-6.1 0-11.3-4.1-13.2-9.7H2.6v6.2C6.6 42.7 14.7 48 24 48z"/>
        <path fill="#FBBC05" d="M10.8 28.8c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-6.2H2.6C.9 17 0 20.4 0 24s.9 7 2.6 10.2l8.2-5.4z"/>
        <path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.4 30.4 0 24 0 14.7 0 6.6 5.3 2.6 13.8l8.2 5.4C12.7 13.6 17.9 9.5 24 9.5z"/>
      </svg>
      {label}
    </a>
  );
}

function PillCallout({ label, style }: { label: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: "absolute",
      fontSize: ".57rem", fontWeight: 600, color: "#374151",
      background: "#fff",
      border: "1px solid #e9ecf0",
      borderRadius: 20, padding: "5px 11px",
      boxShadow: "0 3px 12px rgba(0,0,0,0.09)",
      whiteSpace: "nowrap",
      zIndex: 2,
      ...style,
    }}>
      {label}
    </div>
  );
}

function BookingPreviewPanel({ firstName = "", lastName = "", phone = "" }: {
  firstName?: string; lastName?: string; phone?: string;
}) {
  const customerName = [firstName, lastName].filter(Boolean).join(" ");
  const hasName  = customerName.length > 0;
  const hasPhone = phone.length > 0;

  return (
    <div style={{
      flex: 1, height: "100%",
      background: "linear-gradient(150deg, #f5f1ff 0%, #f0f2f8 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "20px 16px",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes pillIn {
          from { opacity: 0; transform: translateY(8px) scale(0.94); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pillFloat {
          0%,100% { transform: translateY(0px); }
          50%     { transform: translateY(-5px); }
        }
        @keyframes cursorBlink {
          0%,100% { opacity: 1; }
          50%     { opacity: 0; }
        }
        @keyframes valueReveal {
          from { opacity: 0; transform: translateX(5px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>

      {/* Floating pill callouts */}
      <PillCallout label="✓ No account required"
        style={{ top: "12%", left: "4%",
          animation: "pillIn .5s cubic-bezier(.22,1,.36,1) 0.1s both, pillFloat 3.4s ease-in-out 0.9s infinite" }} />
      <PillCallout label="✓ No login required"
        style={{ top: "10%", right: "3%",
          animation: "pillIn .5s cubic-bezier(.22,1,.36,1) 0.5s both, pillFloat 4.0s ease-in-out 1.3s infinite" }} />
      <PillCallout label="✓ Mobile friendly"
        style={{ top: "48%", left: "2%", transform: "translateY(-50%)",
          animation: "pillIn .5s cubic-bezier(.22,1,.36,1) 0.9s both, pillFloat 3.7s ease-in-out 1.7s infinite" }} />
      <PillCallout label="✓ Instant confirmation"
        style={{ bottom: "19%", left: "3%",
          animation: "pillIn .5s cubic-bezier(.22,1,.36,1) 1.3s both, pillFloat 3.2s ease-in-out 2.1s infinite" }} />
      <PillCallout label="✓ Under 60 seconds"
        style={{ bottom: "22%", right: "2%",
          animation: "pillIn .5s cubic-bezier(.22,1,.36,1) 1.7s both, pillFloat 4.3s ease-in-out 2.5s infinite" }} />

      {/* Top label */}
      <div style={{ textAlign: "center", marginBottom: 14, zIndex: 1, position: "relative" }}>
        <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#1C1917", letterSpacing: "-.01em" }}>
          Your public booking page
        </div>
      </div>

      {/* Phone mockup */}
      <div style={{
        width: "100%", maxWidth: 210,
        background: "#fff",
        borderRadius: 22,
        boxShadow: "0 14px 52px rgba(59,7,100,0.16), 0 2px 10px rgba(0,0,0,0.09)",
        overflow: "hidden",
        border: "1px solid #e2e3e8",
        position: "relative",
        zIndex: 1,
      }}>
        {/* Phone status bar */}
        <div style={{
          background: "#fff", padding: "8px 14px 4px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: ".52rem", fontWeight: 700, color: "#111" }}>9:41</span>
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {/* signal bars */}
            <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
              <rect x="0" y="5" width="2" height="3" rx=".5" fill="#111"/>
              <rect x="3" y="3" width="2" height="5" rx=".5" fill="#111"/>
              <rect x="6" y="1" width="2" height="7" rx=".5" fill="#111"/>
              <rect x="9" y="0" width="2" height="8" rx=".5" fill="#111"/>
            </svg>
            {/* battery */}
            <svg width="14" height="7" viewBox="0 0 14 7" fill="none">
              <rect x=".5" y=".5" width="11" height="6" rx="1.5" stroke="#111" strokeOpacity=".35"/>
              <rect x="1.5" y="1.5" width="8" height="4" rx=".8" fill="#111"/>
              <path d="M12.5 2.5v2" stroke="#111" strokeOpacity=".4" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>

        {/* Page header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 12px 8px", borderBottom: "1px solid #f0f0f2",
        }}>
          <ArrowLeft style={{ width: 13, height: 13, color: "#374151", flexShrink: 0 }} />
          <span style={{ fontSize: ".78rem", fontWeight: 700, color: "#111827" }}>Confirm</span>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: "10px 10px 0", background: "#f8f9fb" }}>

          {/* Service card — no icon box */}
          <div style={{
            background: "#fff", borderRadius: 10, padding: "10px 11px",
            marginBottom: 8,
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}>
            <div style={{ fontWeight: 700, fontSize: ".68rem", color: "#111827", marginBottom: 5 }}>
              Acrylic Full Set
            </div>
            <div style={{ fontSize: ".57rem", color: "#6b7280", display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
              <Clock style={{ width: 8, height: 8, color: "#9ca3af", flexShrink: 0 }} />
              75 min
            </div>
            <div style={{ fontSize: ".57rem", color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>
              {/* person icon */}
              <svg width="8" height="8" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="5" r="3" stroke="#9ca3af" strokeWidth="1.5"/>
                <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Sarah
            </div>

            <div style={{ height: 1, background: "#f0f0f2", margin: "8px 0" }} />

            {/* Date / Time rows */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: ".57rem", color: "#9ca3af" }}>Date</span>
              <span style={{ fontSize: ".57rem", fontWeight: 600, color: "#111827" }}>14 Jul 2026</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: ".57rem", color: "#9ca3af" }}>Time</span>
              <span style={{ fontSize: ".57rem", fontWeight: 600, color: "#111827" }}>1:15 PM</span>
            </div>
          </div>

          {/* Your Details card */}
          <div style={{
            background: "#fff", borderRadius: 10, padding: "10px 11px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}>
            <div style={{ fontWeight: 700, fontSize: ".65rem", color: "#111827", marginBottom: 8 }}>
              Your Details
            </div>

            {/* Full Name */}
            <div style={{
              background: "#f3f4f6", borderRadius: 7, padding: "7px 9px", marginBottom: 5,
              minHeight: 26, display: "flex", alignItems: "center",
              border: `1.5px solid ${hasName ? PLUM_MID : "transparent"}`,
              transition: "border-color .3s",
            }}>
              {hasName ? (
                <span key={customerName} style={{
                  fontSize: ".6rem", color: "#111827", fontWeight: 500,
                  animation: "valueReveal .18s ease both",
                  display: "flex", alignItems: "center",
                }}>
                  {customerName}
                  <span style={{ animation: "cursorBlink 1s step-end infinite", color: PLUM_MID, fontWeight: 300, marginLeft: 1 }}>|</span>
                </span>
              ) : (
                <span style={{ fontSize: ".6rem", color: "#b0b5c0" }}>Full Name</span>
              )}
            </div>

            {/* Phone */}
            <div style={{
              background: "#f3f4f6", borderRadius: 7, padding: "7px 9px", marginBottom: 5,
              minHeight: 26, display: "flex", alignItems: "center",
              border: `1.5px solid ${hasPhone ? PLUM_MID : "transparent"}`,
              transition: "border-color .3s",
            }}>
              {hasPhone ? (
                <span key={phone} style={{
                  fontSize: ".6rem", color: "#111827", fontWeight: 500,
                  animation: "valueReveal .18s ease both",
                  display: "flex", alignItems: "center",
                }}>
                  {phone}
                  <span style={{ animation: "cursorBlink 1s step-end infinite", color: PLUM_MID, fontWeight: 300, marginLeft: 1 }}>|</span>
                </span>
              ) : (
                <span style={{ fontSize: ".6rem", color: "#b0b5c0" }}>Phone Number</span>
              )}
            </div>

            {/* Email */}
            <div style={{
              background: "#f3f4f6", borderRadius: 7, padding: "7px 9px", marginBottom: 7,
              minHeight: 26, display: "flex", alignItems: "center",
            }}>
              <span style={{ fontSize: ".6rem", color: "#b0b5c0" }}>Email (Optional)</span>
            </div>

            {/* Checkbox */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <div style={{
                width: 11, height: 11, borderRadius: 3, flexShrink: 0, marginTop: 1,
                background: PLUM_MID, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5 4-4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span style={{ fontSize: ".53rem", color: "#374151", lineHeight: 1.4 }}>
                Get important appointment updates from Certxa LLC!
              </span>
            </div>
          </div>

          {/* Gradient fade over bottom nav */}
          <div style={{
            height: 44, marginTop: -4,
            background: "linear-gradient(to bottom, transparent, #f8f9fb)",
            pointerEvents: "none",
          }} />
        </div>

        {/* Bottom nav */}
        <div style={{
          background: "#fff", borderTop: "1px solid #f0f0f2",
          display: "flex", alignItems: "center", justifyContent: "space-around",
          padding: "6px 0 8px",
        }}>
          {[
            { label: "Home", icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 12l9-9 9 9M5 10v9h5v-5h4v5h5v-9" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            )},
            { label: "Cart", icon: (
              <div style={{ position: "relative" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div style={{ position: "absolute", top: -3, right: -3, width: 7, height: 7, borderRadius: "50%", background: PLUM_MID, border: "1.5px solid #fff" }} />
              </div>
            )},
            { label: "Profile", icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#9ca3af" strokeWidth="1.6"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round"/></svg>
            )},
          ].map(({ label, icon }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              {icon}
              <span style={{ fontSize: ".44rem", color: "#9ca3af" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Auth() {
  const navigate = useNavigate();
  const { isAuthenticated, user, login, register, isLoggingIn, isRegistering, isLoading, hasStoredSession } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<"login" | "register">(
    searchParams.get("mode") === "register" ? "register" : "login"
  );
  const rawGroup = searchParams.get("group") ?? "";
  const group: GroupKey | null = rawGroup in GROUP_CONFIG ? (rawGroup as GroupKey) : null;
  const cfg = group ? GROUP_CONFIG[group] : null;
  const redirectTo = searchParams.get("redirect") ?? null;
  const planParam = searchParams.get("plan") ?? null;

  // Persist the chosen plan across onboarding so ManageBillingWrapper can auto-checkout
  useEffect(() => {
    if (planParam) {
      sessionStorage.setItem("certxa_pending_plan", planParam);
    }
  }, [planParam]);

  useEffect(() => {
    const error = searchParams.get("error");
    if (!error) return;
    const messages: Record<string, string> = {
      rate_limited: `Too many sign-in attempts. Please wait ${searchParams.get("retry") ?? "a few"} minute(s) and try again.`,
      google_not_configured: "Google sign-in isn't set up on this server yet.",
      google_denied: "Google sign-in was cancelled.",
      google_oauth_failed: "Google sign-in failed. Please try again or use your email and password.",
    };
    const description = messages[error] ?? "An unexpected error occurred. Please try again.";
    toast({ title: "Sign-in error", description, variant: "destructive" });
  }, []);

  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [phone, setPhone]         = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);

  const formatPhoneDisplay = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  };

  // Register: 1 = details form, 2 = OTP verification, 3 = create password
  const [registerStep, setRegisterStep] = useState<1 | 2 | 3>(1);
  const [otpCode, setOtpCode] = useState("");
  const [otpTimer, setOtpTimer] = useState(0);
  const [otpSending, setOtpSending] = useState(false);
  const [otpSendError, setOtpSendError] = useState("");
  const [otpEmailSending, setOtpEmailSending] = useState(false);
  const [otpEmailSent, setOtpEmailSent] = useState(false);
  const [otpEmailError, setOtpEmailError] = useState("");
  const [otpDelivery, setOtpDelivery] = useState<"sms" | "email">("sms");
  const [professionalConfirmed, setProfessionalConfirmed] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpVerifyError, setOtpVerifyError] = useState("");

  // OTP countdown timer
  useEffect(() => {
    if (otpTimer <= 0) return;
    const id = setTimeout(() => setOtpTimer(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [otpTimer]);

  // Load Cormorant Garamond to match PHP nav exactly
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@300;400;500;600;700;800;900&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  const postAuthRedirect = (onboardingCompleted: boolean) => {
    if (redirectTo) {
      if (redirectTo.startsWith("/website-builder")) {
        window.location.href = redirectTo;
        return;
      }
      return navigate(redirectTo, { replace: true });
    }
    // If a plan was chosen from the pricing page, route to billing checkout after onboarding
    const pendingPlan = planParam ?? sessionStorage.getItem("certxa_pending_plan");
    if (pendingPlan && onboardingCompleted) {
      return navigate(`/manage/billing?checkout=${pendingPlan}`, { replace: true });
    }
    if (!onboardingCompleted) {
      return navigate("/onboarding");
    }
    return navigate("/manage");
  };

  useEffect(() => {
    if (isAuthenticated) {
      if (redirectTo) {
        if (redirectTo.startsWith("/website-builder")) {
          window.location.href = redirectTo;
          return;
        }
        navigate(redirectTo, { replace: true });
        return;
      }
      if (user && !user.onboardingCompleted) {
        navigate("/onboarding");
      } else {
        navigate("/manage");
      }
    }
  }, [isAuthenticated, user, navigate, group, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let result: any;
      if (mode === "login") {
        result = await login({ email, password, keepSignedIn });
      } else {
        result = await register({ email, password, firstName: firstName || undefined, lastName: lastName || undefined, keepSignedIn });
      }
      postAuthRedirect(!!(result && result.onboardingCompleted));
    } catch (error: any) {
      const message = error?.message || (mode === "login" ? "Login failed" : "Registration failed");
      let description = message;
      try {
        const parsed = JSON.parse(message.replace(/^\d+:\s*/, ""));
        description = parsed.message || message;
      } catch {
        if (message.includes(":")) description = message.split(":").slice(1).join(":").trim();
      }
      toast({ title: mode === "login" ? "Login failed" : "Registration failed", description, variant: "destructive" });
    }
  };

  const isPending = isLoggingIn || isRegistering;

  if (isLoading && hasStoredSession) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <MarketingNav authActions />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
          <div style={{ textAlign: "center" }}>
            <Loader2 style={{ width: 32, height: 32, color: PLUM_MID, margin: "0 auto 16px", animation: "spin 1s linear infinite" }} />
            <p style={{ color: "#9ca3af", fontSize: ".875rem" }}>Welcome back! Restoring your session…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Full-screen calendar-background register view ───────────────────────
  if (mode === "register") {
    const maskPhone = (p: string) => {
      const d = p.replace(/\D/g, "");
      if (d.length < 4) return d;
      return d.slice(0, 2) + "*".repeat(Math.max(0, d.length - 4)) + d.slice(-2);
    };

    const handleStep1Next = async (e: React.FormEvent) => {
      e.preventDefault();
      const phoneDigits = phone.replace(/\D/g, "");
      if (!firstName.trim() || !lastName.trim() || phoneDigits.length !== 10 || !email.trim() || !email.includes("@")) return;

      // Silently check if phone or email is already in use — no error shown, just don't proceed
      try {
        const availRes = await fetch(
          `/api/auth/check-availability?phone=${encodeURIComponent(phone)}&email=${encodeURIComponent(email)}`
        );
        if (availRes.ok) {
          const availData = await availRes.json();
          if (!availData.available) return;
        }
      } catch {
        // On network error, allow the flow to continue
      }

      setOtpSending(true);
      setOtpSendError("");
      try {
        const endpoint = otpDelivery === "email"
          ? "/api/auth/owner-request-otp-email"
          : "/api/auth/owner-request-otp";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, email }),
        });
        const data = await res.json();
        if (!res.ok && res.status !== 429) {
          setOtpSendError(data.message || "Failed to send verification code. Please try again.");
          return;
        }
        // 429 = code already sent, still advance (there's a live code)
        setRegisterStep(2);
        setOtpTimer(30);
      } catch {
        setOtpSendError("Connection error. Please check your internet and try again.");
      } finally {
        setOtpSending(false);
      }
    };

    const handleResendOtp = async (delivery: "sms" | "email" = otpDelivery) => {
      if (otpTimer > 0) return;
      setOtpSending(true);
      try {
        const endpoint = delivery === "email"
          ? "/api/auth/owner-request-otp-email"
          : "/api/auth/owner-request-otp";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, email }),
        });
        // 429 = rate-limited (code already live) — still reset timer so UX is consistent
        if (res.ok || res.status === 429) setOtpTimer(30);
      } catch { /* ignore — failure is non-blocking */ } finally {
        setOtpSending(false);
      }
    };

    const handleSendOtpEmail = async () => {
      if (otpEmailSending) return;
      setOtpEmailSending(true);
      setOtpEmailSent(false);
      setOtpEmailError("");
      try {
        const res = await fetch("/api/auth/owner-request-otp-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, email }),
        });
        const data = await res.json();
        if (!res.ok) {
          setOtpEmailError(data.message || "Could not send code to email. Please try again.");
          return;
        }
        setOtpDelivery("email");
        setOtpEmailSent(true);
        setOtpTimer(30);
      } catch {
        setOtpEmailError("Connection error. Please try again.");
      } finally {
        setOtpEmailSending(false);
      }
    };


    const handleOtpSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (otpCode.length !== 6 || otpVerifying) return;
      setOtpVerifying(true);
      setOtpVerifyError("");
      try {
        const res = await fetch("/api/auth/owner-verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, code: otpCode }),
        });
        const data = await res.json();
        if (!res.ok) {
          setOtpVerifyError(data.message || "Invalid code. Please try again.");
          return;
        }
        setRegisterStep(3);
      } catch {
        setOtpVerifyError("Connection error. Please check your internet and try again.");
      } finally {
        setOtpVerifying(false);
      }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (password.length < 6 || password !== confirmPassword) return;
      try {
        const result: any = await register({
          email,
          password,
          firstName: firstName || undefined,
          lastName:  lastName  || undefined,
          keepSignedIn,
        });
        postAuthRedirect(!!(result && result.onboardingCompleted));
      } catch (error: any) {
        const message = error?.message || "Registration failed";
        let description = message;
        try {
          const parsed = JSON.parse(message.replace(/^\d+:\s*/, ""));
          description = parsed.message || message;
        } catch {
          if (message.includes(":")) description = message.split(":").slice(1).join(":").trim();
        }
        toast({ title: "Registration failed", description, variant: "destructive" });
      }
    };

    const getPasswordStrength = (pw: string): { score: 0 | 1 | 2 | 3; label: string; color: string } => {
      if (!pw) return { score: 0, label: "", color: "" };
      let score = 0;
      if (pw.length >= 6) score++;
      if (pw.length >= 10 || /[A-Z]/.test(pw)) score++;
      if (pw.length >= 12 && /[A-Z]/.test(pw) && /[0-9!@#$%^&*]/.test(pw)) score = 3;
      if (score === 1) return { score: 1, label: "Too Weak", color: "#ef4444" };
      if (score === 2) return { score: 2, label: "Moderate", color: "#b45309" };
      return { score: 3, label: "Excellent", color: "#16a34a" };
    };

    // ── Step 2: OTP verification ───────────────────────────────────────────
    if (registerStep === 2) {
      return (
        <div style={{
          position: "fixed", inset: 0,
          fontFamily: "'Inter', sans-serif",
          background: "#fff",
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          overflowY: "auto",
          padding: "72px 24px 48px",
        }}>
          <div style={{ width: "100%", maxWidth: 480 }}>
            <h1 style={{
              fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em",
              color: "#111827", margin: "0 0 14px", lineHeight: 1.15,
            }}>
              Verify your phone number
            </h1>

            <p style={{ fontSize: ".92rem", color: "#374151", margin: "0 0 28px", lineHeight: 1.6 }}>
              To ensure your security, please enter the code sent to:{" "}
              <strong style={{ color: "#111827" }}>
                {otpDelivery === "email" ? email.trim().toLowerCase() : maskPhone(phone)}
              </strong>
            </p>

            <form onSubmit={handleOtpSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit verification code"
                minLength={6}
                maxLength={6}
                pattern="[0-9]{6}"
                autoFocus
                style={{
                  height: 52, borderRadius: 10, borderColor: "#e5e7eb",
                  background: "#fafafa", fontSize: "1.1rem", letterSpacing: ".25em",
                  textAlign: "center",
                }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontSize: ".84rem", color: "#6b7280", margin: 0 }}>
                  Didn't get your code?{" "}
                  <button
                    type="button"
                    onClick={() => handleResendOtp()}
                    disabled={otpTimer > 0 || otpSending}
                    style={{
                      background: "none", border: "none", padding: 0,
                      fontSize: ".84rem", fontWeight: 600,
                      color: otpTimer > 0 || otpSending ? "#9ca3af" : PLUM_MID,
                      cursor: otpTimer > 0 || otpSending ? "default" : "pointer",
                      textDecoration: otpTimer > 0 || otpSending ? "none" : "underline",
                    }}
                  >
                    {otpSending ? "Sending…" : "Resend code"}
                  </button>
                </p>

                <p style={{ fontSize: ".84rem", color: "#6b7280", margin: 0 }}>
                  {otpDelivery === "email" ? "Prefer a text message?" : "Can't access this phone?"}{" "}
                  <button
                    type="button"
                    onClick={async () => {
                      if (otpDelivery === "email") {
                        setOtpDelivery("sms");
                        setOtpEmailSent(false);
                        setOtpEmailError("");
                        setOtpTimer(0);
                        await handleResendOtp("sms");
                        return;
                      }
                      await handleSendOtpEmail();
                    }}
                    disabled={otpEmailSending}
                    style={{
                      background: "none", border: "none", padding: 0,
                      fontSize: ".84rem", fontWeight: 600,
                      color: otpEmailSending ? "#9ca3af" : PLUM_MID,
                      cursor: otpEmailSending ? "default" : "pointer",
                      textDecoration: otpEmailSending ? "none" : "underline",
                    }}
                  >
                    {otpEmailSending
                      ? "Sending…"
                      : otpDelivery === "email"
                        ? "Send code by SMS instead"
                        : "Send code to email instead"}
                  </button>
                </p>

                {otpEmailError && (
                  <p style={{ fontSize: ".82rem", color: "#ef4444", margin: 0 }}>
                    {otpEmailError}
                  </p>
                )}

                {otpVerifyError && (
                  <p style={{ fontSize: ".82rem", color: "#ef4444", margin: 0 }}>
                    {otpVerifyError}
                  </p>
                )}

                {otpTimer > 0 && (
                  <div style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "6px 16px", borderRadius: 20,
                    border: "1px solid #e5e7eb", background: "#f9fafb",
                    fontSize: ".82rem", color: "#6b7280", width: "fit-content",
                  }}>
                    Retry in {otpTimer} second{otpTimer !== 1 ? "s" : ""}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={otpCode.length !== 6 || otpVerifying}
                data-testid="button-submit-auth"
                style={{
                  width: "100%", padding: "13px 20px",
                  borderRadius: 10, border: "none",
                  background: otpCode.length === 6 && !otpVerifying
                    ? `linear-gradient(135deg, ${PLUM} 0%, ${PLUM_MID} 100%)`
                    : "#e5e7eb",
                  color: otpCode.length === 6 && !otpVerifying ? "#fff" : "#9ca3af",
                  fontSize: ".9rem", fontWeight: 700,
                  cursor: otpCode.length === 6 && !otpVerifying ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: otpCode.length === 6 && !otpVerifying ? "0 4px 20px rgba(59,7,100,0.3)" : "none",
                  transition: "background .2s, box-shadow .2s",
                }}
              >
                {otpVerifying
                  ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                  : "Verify"
                }
              </button>
            </form>

            <p style={{ fontSize: ".82rem", color: "#6b7280", marginTop: 28 }}>
              Need help?{" "}
              <a
                href="mailto:support@certxa.com"
                style={{ color: PLUM_MID, fontWeight: 600, textDecoration: "underline" }}
              >
                Contact us
              </a>
            </p>
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    // ── Step 3: Create password ────────────────────────────────────────────
    if (registerStep === 3) {
      const strength = getPasswordStrength(password);
      const passwordsMatch = password === confirmPassword;
      const canSubmit = password.length >= 6 && passwordsMatch && !isPending;

      return (
        <div style={{
          position: "fixed", inset: 0,
          fontFamily: "'Inter', sans-serif",
          background: "#fff",
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          overflowY: "auto",
          padding: "72px 24px 48px",
        }}>
          <div style={{ width: "100%", maxWidth: 480 }}>
            <h1 style={{
              fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em",
              color: "#111827", margin: "0 0 10px", lineHeight: 1.15,
            }}>
              Create your password
            </h1>
            <p style={{ fontSize: ".92rem", color: "#6b7280", margin: "0 0 32px", lineHeight: 1.6 }}>
              Choose a strong password to protect your account.
            </p>

            <form onSubmit={handlePasswordSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              {/* Password field */}
              <div>
                <label style={{
                  display: "block", fontSize: ".75rem", fontWeight: 700,
                  color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8,
                }}>Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    autoFocus
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    style={{
                      width: "100%", height: 52, borderRadius: 12,
                      border: "1.5px solid #e5e7eb",
                      background: "#fff",
                      fontSize: ".95rem", padding: "0 48px 0 16px",
                      outline: "none", boxSizing: "border-box",
                      color: "#111827",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{
                      position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer",
                      color: "#9ca3af", padding: 4, display: "flex", alignItems: "center",
                    }}
                  >
                    {showPassword
                      ? <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>

                {/* Strength meter */}
                {password.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", gap: 5, marginBottom: 5 }}>
                      {([1, 2, 3] as const).map(seg => (
                        <div key={seg} style={{
                          flex: 1, height: 4, borderRadius: 99,
                          background: strength.score >= seg ? strength.color : "#e5e7eb",
                          transition: "background .25s",
                        }} />
                      ))}
                    </div>
                    <div style={{
                      textAlign: "right", fontSize: ".78rem", fontWeight: 600,
                      color: strength.color, transition: "color .25s",
                    }}>
                      {strength.label}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm password field */}
              <div>
                <label style={{
                  display: "block", fontSize: ".75rem", fontWeight: 700,
                  color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8,
                }}>Confirm password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    style={{
                      width: "100%", height: 52, borderRadius: 12,
                      border: `1.5px solid ${confirmPassword.length > 0 && !passwordsMatch ? "#ef4444" : "#e5e7eb"}`,
                      background: "#fff",
                      fontSize: ".95rem", padding: "0 48px 0 16px",
                      outline: "none", boxSizing: "border-box",
                      color: "#111827",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(v => !v)}
                    style={{
                      position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer",
                      color: "#9ca3af", padding: 4, display: "flex", alignItems: "center",
                    }}
                  >
                    {showConfirmPassword
                      ? <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p style={{ fontSize: ".78rem", color: "#ef4444", margin: "6px 0 0", fontWeight: 500 }}>
                    Passwords don't match
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                data-testid="button-submit-auth"
                style={{
                  width: "100%", padding: "14px 20px",
                  borderRadius: 10, border: "none",
                  background: canSubmit
                    ? `linear-gradient(135deg, ${PLUM} 0%, ${PLUM_MID} 100%)`
                    : "#e5e7eb",
                  color: canSubmit ? "#fff" : "#9ca3af",
                  fontSize: ".9rem", fontWeight: 700,
                  cursor: canSubmit ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: canSubmit ? "0 4px 20px rgba(59,7,100,0.3)" : "none",
                  transition: "background .2s, box-shadow .2s",
                }}
              >
                {isPending
                  ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                  : "Create account"
                }
              </button>
            </form>

            <p style={{ fontSize: ".82rem", color: "#6b7280", marginTop: 28 }}>
              Need help?{" "}
              <a href="mailto:support@certxa.com" style={{ color: PLUM_MID, fontWeight: 600, textDecoration: "underline" }}>
                Contact us
              </a>
            </p>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    // ── Step 1: Wide 2-panel card ─────────────────────────────────────────
    return (
      <div style={{
        position: "fixed", inset: 0,
        fontFamily: "'Inter', sans-serif",
        overflow: "hidden",
      }}>
        {/* Calendar background */}
        <div style={{ position: "absolute", inset: 0, filter: "blur(2px)", transform: "scale(1.04)" }}>
          <DemoCalendarBackground />
        </div>
        <div style={{ position: "absolute", inset: 0, background: "rgba(10,4,28,0.56)", backdropFilter: "brightness(0.80)" }} />

        {/* Centered 2-panel card */}
        <div className="reg-step2-outer" style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
        }}>
          <div className="reg-step2-card" style={{
            width: "100%", maxWidth: 900,
            background: "#fff",
            borderRadius: 22,
            boxShadow: "0 28px 90px rgba(0,0,0,0.40), 0 8px 28px rgba(0,0,0,0.20)",
            overflow: "hidden",
            display: "flex",
            animation: "cardIn .38s cubic-bezier(.22,1,.36,1) both",
            maxHeight: "calc(100vh - 32px)",
          }}>

            {/* ── LEFT: Form panel ── */}
            <div className="reg-left-panel" style={{
              flex: "0 0 420px", display: "flex", flexDirection: "column",
              overflowY: "auto",
              borderRight: "1px solid #f0f0f2",
            }}>
              <div style={{ padding: "36px 40px 28px", flex: 1, display: "flex", flexDirection: "column" }}>

                {/* Logo */}
                <a href="/overview" style={{
                  display: "block", textAlign: "center",
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "1.45rem", fontWeight: 700, letterSpacing: "-0.02em",
                  color: CHARCOAL, textDecoration: "none", marginBottom: 18,
                }}>
                  Certxa<span style={{ color: GOLD }}>.</span>
                </a>

                {/* Heading */}
                <div style={{ margin: "0 0 20px" }}>
                  <h1 style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: "1.45rem", fontWeight: 400, letterSpacing: "-0.01em",
                    color: CHARCOAL, margin: 0, lineHeight: 1.3,
                  }}>
                    Let's get to know each other
                  </h1>
                </div>

                {/* Form */}
                <form onSubmit={handleStep1Next} style={{ display: "flex", flexDirection: "column", gap: 11, flex: 1 }}>
                  {/* First + Last */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <Label htmlFor="reg-first" style={{ display: "block", fontSize: ".68rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>First name</Label>
                      <Input
                        id="reg-first"
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        placeholder="Jane"
                        autoFocus
                        style={{ height: 42, borderRadius: 9, borderColor: "#e5e7eb", background: "#fafafa", fontSize: ".88rem" }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="reg-last" style={{ display: "block", fontSize: ".68rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>Last name</Label>
                      <Input
                        id="reg-last"
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        placeholder="Doe"
                        style={{ height: 42, borderRadius: 9, borderColor: "#e5e7eb", background: "#fafafa", fontSize: ".88rem" }}
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <Label htmlFor="reg-phone" style={{ display: "block", fontSize: ".68rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>Mobile phone</Label>
                    <Input
                      id="reg-phone"
                      type="tel"
                      inputMode="tel"
                      required
                      value={formatPhoneDisplay(phone)}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="(555) 000-0000"
                      style={{ height: 42, borderRadius: 9, borderColor: "#e5e7eb", background: "#fafafa", fontSize: ".88rem" }}
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <Label htmlFor="reg-email" style={{ display: "block", fontSize: ".68rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>Work Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      autoComplete="email"
                      data-testid="input-email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@yoursalon.com"
                      required
                      style={{ height: 42, borderRadius: 9, borderColor: "#e5e7eb", background: "#fafafa", fontSize: ".88rem" }}
                    />
                  </div>

                  {/* Professional confirmation */}
                  <div style={{
                    borderTop: "1px solid #f0f0f2",
                    paddingTop: 14,
                    display: "flex", flexDirection: "column", gap: 10,
                  }}>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={professionalConfirmed}
                        onChange={e => setProfessionalConfirmed(e.target.checked)}
                        style={{ marginTop: 2, width: 15, height: 15, accentColor: PLUM_MID, cursor: "pointer", flexShrink: 0 }}
                      />
                      <span style={{ fontSize: ".82rem", fontWeight: 700, color: "#111827", lineHeight: 1.45 }}>
                        I confirm that I'm a professional or business owner, and not a client seeking services.
                      </span>
                    </label>

                    <p style={{ fontSize: ".72rem", color: "#6b7280", lineHeight: 1.55, margin: 0 }}>
                      By signing up below, you confirm that you have read and agree to the Certxa{" "}
                      <a href="https://certxa.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#374151", fontWeight: 600, textDecoration: "underline" }}>Privacy Policy</a>
                      ,{" "}
                      <a href="https://certxa.com/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#374151", fontWeight: 600, textDecoration: "underline" }}>Terms of Service</a>
                      {" "}and{" "}
                      <a href="https://certxa.com/sms-terms" target="_blank" rel="noopener noreferrer" style={{ color: "#374151", fontWeight: 600, textDecoration: "underline" }}>SMS Terms</a>
                      .
                    </p>

                    <p style={{ fontSize: ".72rem", color: "#6b7280", lineHeight: 1.55, margin: 0 }}>
                      You understand that, by requesting this free trial, you are consenting to receive automated promotional text messages from Certxa regarding the Services, that consent is not a condition of any purchase and that you can opt out at any time by replying STOP or get support by texting HELP. Message frequency varies. Message and data rates may apply.
                    </p>
                  </div>

                  {/* Next button */}
                  {(() => {
                    const ready = firstName.trim().length > 0
                      && lastName.trim().length > 0
                      && phone.replace(/\D/g, "").length === 10
                      && email.trim().length > 0 && email.includes("@")
                      && professionalConfirmed;
                    return (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, marginTop: 6 }}>
                        {otpSendError && (
                          <p style={{ fontSize: ".8rem", color: "#ef4444", margin: 0, textAlign: "right" }}>
                            {otpSendError}
                          </p>
                        )}
                        <button
                          type="submit"
                          disabled={!ready || otpSending}
                          data-testid="button-submit-auth"
                          style={{
                            padding: "8px 22px",
                            borderRadius: 20, border: "none",
                            background: ready && !otpSending
                              ? `linear-gradient(135deg, ${PLUM} 0%, ${PLUM_MID} 100%)`
                              : "#e5e7eb",
                            color: ready && !otpSending ? "#fff" : "#9ca3af",
                            fontSize: ".82rem", fontWeight: 600,
                            cursor: ready && !otpSending ? "pointer" : "not-allowed",
                            display: "flex", alignItems: "center", gap: 5,
                            transition: "background .2s, color .2s",
                            boxShadow: ready && !otpSending ? "0 3px 12px rgba(59,7,100,0.28)" : "none",
                          }}
                        >
                          {otpSending
                            ? <><Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> Sending…</>
                            : <>Next <ArrowRight style={{ width: 13, height: 13 }} /></>
                          }
                        </button>
                      </div>
                    );
                  })()}
                </form>

              </div>

              {/* Footer */}
              <div style={{ padding: "10px 40px 14px", borderTop: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
                <a href="https://certxa.com/terms" target="_blank" rel="noopener noreferrer" style={{ fontSize: ".7rem", color: "#9ca3af", textDecoration: "none" }}>Terms of Service</a>
                <a href="https://certxa.com/privacy" target="_blank" rel="noopener noreferrer" style={{ fontSize: ".7rem", color: "#9ca3af", textDecoration: "none" }}>Privacy Policy</a>
              </div>
            </div>

            {/* ── RIGHT: Animated online booking preview ── */}
            <div className="reg-sms-panel" style={{ flex: 1, minWidth: 0 }}>
              <BookingPreviewPanel firstName={firstName} lastName={lastName} phone={formatPhoneDisplay(phone)} />
            </div>

          </div>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes cardIn {
            from { opacity: 0; transform: translateY(28px) scale(0.97); }
            to   { opacity: 1; transform: none; }
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: none; }
          }
          /* ── Responsive: hide booking preview, make form full-width ── */
          @media (max-width: 860px) {
            .reg-step2-card { max-width: 480px !important; }
            .reg-left-panel { flex: 1 1 auto !important; border-right: none !important; }
            .reg-sms-panel  { display: none !important; }
          }
          @media (max-width: 520px) {
            .reg-step2-card { border-radius: 16px !important; }
            .reg-left-panel > div:first-child { padding: 28px 24px 20px !important; }
            .reg-left-panel > div:last-child  { padding: 10px 24px 14px !important; }
          }
          @media (max-width: 480px) {
            .reg-step2-outer {
              padding: 0 !important;
              align-items: stretch !important;
            }
            .reg-step2-card {
              border-radius: 0 !important;
              max-width: 100% !important;
              max-height: none !important;
              box-shadow: none !important;
              min-height: 100svh;
              display: flex !important;
            }
            .reg-left-panel {
              flex: 1 1 auto !important;
              border-right: none !important;
              display: flex !important;
              flex-direction: column !important;
            }
            .reg-left-panel > div:first-child { padding: 44px 24px 28px !important; flex: 1; }
            .reg-left-panel > div:last-child  { padding: 12px 24px 20px !important; }
          }
        `}</style>
      </div>
    );
  }
  // ── End register view ────────────────────────────────────────────────────

  // ── Login view — same full-screen blurred-card design as register step 1 ──
  return (
    <div style={{
      position: "fixed", inset: 0,
      fontFamily: "'Inter', sans-serif",
      overflow: "hidden",
    }}>
      {/* Calendar background */}
      <div style={{ position: "absolute", inset: 0, filter: "blur(2px)", transform: "scale(1.04)" }}>
        <DemoCalendarBackground />
      </div>
      <div style={{ position: "absolute", inset: 0, background: "rgba(10, 4, 28, 0.52)", backdropFilter: "brightness(0.82)" }} />

      {/* Centered card */}
      <div className="auth-card-wrap" style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
        overflowY: "auto",
      }}>
        <div className="auth-card" style={{
          width: "100%", maxWidth: 468,
          background: "#fff",
          borderRadius: 20,
          boxShadow: "0 24px 80px rgba(0,0,0,0.36), 0 8px 24px rgba(0,0,0,0.18)",
          overflow: "hidden",
          animation: "cardIn .35s cubic-bezier(.22,1,.36,1) both",
        }}>
          <div className="auth-card-body" style={{ padding: "36px 40px 32px" }}>

            {/* Logo */}
            <a href="/overview" style={{
              display: "block", textAlign: "center",
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "1.55rem", fontWeight: 700,
              letterSpacing: "-0.02em",
              color: CHARCOAL, textDecoration: "none",
              marginBottom: 20,
            }}>
              Certxa<span style={{ color: GOLD }}>.</span>
            </a>

            {/* Heading */}
            <h1 style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "1.95rem", fontWeight: 700,
              letterSpacing: "-0.02em", color: CHARCOAL,
              textAlign: "center", margin: "0 0 6px", lineHeight: 1.15,
            }}>
              Welcome back
            </h1>

            {/* Subtitle */}
            <p style={{
              textAlign: "center", color: "#6b7280",
              fontSize: ".88rem", margin: "0 0 24px", lineHeight: 1.5,
            }}>
              Sign in to continue to your dashboard.
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              <div>
                <Label htmlFor="email" style={{ display: "block", fontSize: ".7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  data-testid="input-email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@yourbusiness.com"
                  required
                  autoFocus
                  style={{ height: 44, borderRadius: 9, fontSize: ".9rem", borderColor: "#e5e7eb", background: "#fafafa" }}
                />
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                  <Label htmlFor="password" style={{ fontSize: ".7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em" }}>
                    Password
                  </Label>
                  <Link to="/forgot-password" style={{ fontSize: ".78rem", fontWeight: 600, color: PLUM_MID, textDecoration: "none" }}>
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  data-testid="input-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  style={{ height: 44, borderRadius: 9, fontSize: ".9rem", borderColor: "#e5e7eb", background: "#fafafa" }}
                />
              </div>

              {/* CTA */}
              <button
                type="submit"
                disabled={isPending}
                data-testid="button-submit-auth"
                style={{
                  width: "100%", padding: "13px 20px",
                  borderRadius: 10, border: "none",
                  background: `linear-gradient(135deg, ${PLUM} 0%, ${PLUM_MID} 100%)`,
                  color: "#fff", fontSize: ".9rem", fontWeight: 700,
                  cursor: isPending ? "not-allowed" : "pointer",
                  opacity: isPending ? 0.65 : 1,
                  boxShadow: "0 4px 20px rgba(59,7,100,0.35)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  marginTop: 2,
                }}
              >
                {isPending
                  ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                  : <>Sign in <ArrowRight style={{ width: 16, height: 16 }} /></>
                }
              </button>

            </form>

            {/* Switch to register */}
            <p style={{ textAlign: "center", color: "#9ca3af", fontSize: ".82rem", marginTop: 20 }}>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("register")}
                data-testid="link-switch-to-register"
                style={{ color: PLUM_MID, fontWeight: 700, background: "none", border: "none", cursor: "pointer", fontSize: ".82rem" }}
              >
                Start free trial
              </button>
            </p>
          </div>

          {/* Footer */}
          <div className="auth-card-footer" style={{
            padding: "12px 40px 16px",
            borderTop: "1px solid #f3f4f6",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 20,
          }}>
            <a href="https://certxa.com/privacy" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: ".72rem", color: "#9ca3af", textDecoration: "none" }}>
              Privacy
            </a>
            <a href="https://certxa.com/terms" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: ".72rem", color: "#9ca3af", textDecoration: "none" }}>
              Terms
            </a>
            <Link to="/staff-auth"
              style={{ fontSize: ".72rem", color: "#9ca3af", textDecoration: "none" }}>
              Staff login
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(28px) scale(0.97); }
          to   { opacity: 1; transform: none; }
        }
        @media (max-width: 480px) {
          .auth-card-wrap { padding: 0 !important; align-items: stretch !important; }
          .auth-card {
            border-radius: 0 !important;
            max-width: 100% !important;
            box-shadow: none !important;
            min-height: 100svh;
            display: flex !important;
            flex-direction: column !important;
          }
          .auth-card-body { padding: 44px 24px 28px !important; flex: 1; }
          .auth-card-footer { padding: 12px 24px 20px !important; }
        }
      `}</style>
    </div>
  );
}

/* ─── Rotating ad slides for the register panel ─── */
const AD_SLIDES = [
  {
    tag: "SalonOS",
    tagColor: "#c4b5fd",
    tagBg: "rgba(139,92,246,0.20)",
    tagBorder: "rgba(139,92,246,0.35)",
    icon: <Scissors style={{ width: 13, height: 13 }} />,
    headline: ["Your whole salon,", "one screen."],
    accentWord: "salon,",
    sub: "Booking, POS, loyalty, intake forms — finally unified.",
    testimonial: {
      quote: "I replaced three separate apps with Certxa. Everything finally talks to each other — and my front desk actually loves coming to work now.",
      name: "Marcus T.",
      title: "Owner, Crown Barbershop",
      initials: "MT",
    },
  },
  {
    tag: "Smart Scheduling",
    tagColor: "#FCD34D",
    tagBg: "rgba(245,158,11,0.12)",
    tagBorder: "rgba(245,158,11,0.28)",
    icon: <Calendar style={{ width: 13, height: 13 }} />,
    headline: ["Fill your calendar", "while you sleep."],
    accentWord: "calendar",
    sub: "Online booking works for you 24/7 — even after hours.",
    testimonial: {
      quote: "I wake up every morning to new appointments. My book fills itself. I haven't had a slow Tuesday in months.",
      name: "Aaliyah K.",
      title: "Independent Stylist",
      initials: "AK",
    },
  },
  {
    tag: "Client Retention",
    tagColor: "#6ee7b7",
    tagBg: "rgba(16,185,129,0.12)",
    tagBorder: "rgba(16,185,129,0.28)",
    icon: <Sparkles style={{ width: 13, height: 13 }} />,
    headline: ["Turn one-timers", "into regulars."],
    accentWord: "regulars.",
    sub: "Loyalty rewards, gift cards & automated follow-ups.",
    testimonial: {
      quote: "The loyalty program brought back 40% of clients I thought were gone forever. The automated follow-ups do all the work for me.",
      name: "Priya S.",
      title: "Owner, Glow Nail Studio",
      initials: "PS",
    },
  },
  {
    tag: "Certxa Queue",
    tagColor: "#a5f3fc",
    tagBg: "rgba(14,165,233,0.12)",
    tagBorder: "rgba(14,165,233,0.28)",
    icon: <QrCode style={{ width: 13, height: 13 }} />,
    headline: ["Walk-ins without", "the wait-around."],
    accentWord: "wait-around.",
    sub: "Virtual check-in, live board display & smart SMS alerts.",
    testimonial: {
      quote: "Walk-in chaos is completely gone. Clients check in from the parking lot and we text them when we're ready. Genius.",
      name: "DeShawn M.",
      title: "Owner, Elite Cuts",
      initials: "DM",
    },
  },
];

/* ─── Trial left panel (register mode) ─── */
function TrialLeftPanel({ cfg }: { cfg: { label: string; tagline: string; icon: React.ReactNode } | null }) {
  const PLUM      = "#3B0764";
  const PLUM_MID  = "#5B21B6";
  const GOLD      = "#F59E0B";

  const [slideIdx, setSlideIdx] = useState(0);
  const [visible, setVisible]   = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setSlideIdx(i => (i + 1) % AD_SLIDES.length);
        setVisible(true);
      }, 420);
    }, 4200);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const slide = AD_SLIDES[slideIdx];

  return (
    <div
      className="auth-left-panel"
      style={{
        flex: 1, position: "relative", overflow: "hidden",
        display: "flex", flexDirection: "column",
        background: "#0d0020",
      }}
    >
      {/* Background video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        poster="/images/salon-bg.png"
        style={{
          position: "absolute", top: 0, left: 0,
          width: "100%", height: "100%",
          objectFit: "cover", zIndex: 1,
        }}
      >
        <source src="/videos/salon_booking.mp4" type="video/mp4" />
      </video>

      {/* Dark purple gradient overlay for readability */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 2,
        background: "linear-gradient(145deg, rgba(26,0,64,0.88) 0%, rgba(45,0,96,0.82) 50%, rgba(26,10,46,0.90) 100%)",
      }} />

      {/* Content */}
      <div style={{
        position: "relative", zIndex: 10,
        display: "flex", flexDirection: "column",
        justifyContent: "center",
        height: "100%", padding: "36px 48px",
        animation: "fadeUp .5s ease both",
      }}>

        {/* Logo */}
        <a href="/overview" style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "1.45rem", fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "#fff", textDecoration: "none",
          marginBottom: 28, display: "block",
        }}>
          Certxa<span style={{ color: GOLD }}>.</span>
        </a>

        {/* ── Animated ad block ── */}
        <div style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 0.38s ease, transform 0.38s ease",
          marginBottom: 22,
        }}>
          {/* Product tag */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "5px 13px", borderRadius: 50,
            background: slide.tagBg,
            border: `1px solid ${slide.tagBorder}`,
            marginBottom: 16, width: "fit-content",
          }}>
            <span style={{ color: slide.tagColor, display: "flex" }}>{slide.icon}</span>
            <span style={{ fontSize: ".7rem", fontWeight: 700, color: slide.tagColor, letterSpacing: ".07em", textTransform: "uppercase" }}>
              {slide.tag}
            </span>
          </div>

          {/* Headline */}
          <h2 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(2.4rem, 3.4vw, 3.1rem)",
            fontWeight: 700, letterSpacing: "-0.03em",
            lineHeight: 1.06, color: "#fff",
            margin: "0 0 12px",
          }}>
            {slide.headline.map((line, i) => (
              <span key={i} style={{ display: "block" }}>
                {line.split(" ").map((word, wi) =>
                  word === slide.accentWord
                    ? <em key={wi} style={{ color: GOLD, fontStyle: "italic" }}>{word} </em>
                    : <span key={wi}>{word} </span>
                )}
              </span>
            ))}
          </h2>

          {/* Sub */}
          <p style={{
            color: "rgba(255,255,255,0.52)", fontSize: ".88rem",
            lineHeight: 1.6, maxWidth: 340, margin: 0,
          }}>
            {slide.sub}
          </p>
        </div>

        {/* Slide dots */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {AD_SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => { setVisible(false); setTimeout(() => { setSlideIdx(i); setVisible(true); }, 300); }}
              style={{
                width: i === slideIdx ? 22 : 6,
                height: 6, borderRadius: 3,
                background: i === slideIdx ? GOLD : "rgba(255,255,255,0.2)",
                border: "none", cursor: "pointer", padding: 0,
                transition: "width 0.35s ease, background 0.35s ease",
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        {/* Testimonial — synced with active slide */}
        <div style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 0.38s ease 0.05s, transform 0.38s ease 0.05s",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.09)",
          backdropFilter: "blur(8px)",
          borderRadius: 12, padding: "14px 16px",
          marginBottom: 18,
        }}>
          <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
            {[...Array(5)].map((_, i) => (
              <svg key={i} width="11" height="11" viewBox="0 0 20 20" fill={GOLD}>
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
              </svg>
            ))}
          </div>
          <p style={{ fontSize: ".78rem", color: "rgba(255,255,255,0.62)", lineHeight: 1.55, fontStyle: "italic", margin: "0 0 10px" }}>
            "{slide.testimonial.quote}"
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: ".6rem", fontWeight: 800, color: "#fff",
              background: `linear-gradient(135deg, ${slide.tagColor}55, ${slide.tagColor}22)`,
              border: `1px solid ${slide.tagColor}44`,
            }}>
              {slide.testimonial.initials}
            </div>
            <div>
              <p style={{ fontSize: ".76rem", fontWeight: 700, color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1 }}>{slide.testimonial.name}</p>
              <p style={{ fontSize: ".66rem", color: "rgba(255,255,255,0.32)", margin: "3px 0 0" }}>{slide.testimonial.title}</p>
            </div>
          </div>
        </div>

        {/* 60-day free pill */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "5px 14px", borderRadius: 50,
          background: "rgba(245,158,11,0.10)",
          border: "1px solid rgba(245,158,11,0.22)",
          marginBottom: 20, width: "fit-content",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, flexShrink: 0 }} />
          <span style={{ fontSize: ".7rem", fontWeight: 700, color: "#FCD34D", letterSpacing: ".06em", textTransform: "uppercase" }}>
            Free for 60 days — no credit card
          </span>
        </div>

        {/* Feature grid — first 8 only */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: ".62rem", fontWeight: 700, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: ".14em", marginBottom: 10 }}>
            What's included
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px" }}>
            {TRIAL_FEATURES.slice(0, 8).map(({ text }) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(139,92,246,0.3)",
                }}>
                  <Check style={{ width: 10, height: 10, color: "#c4b5fd" }} />
                </div>
                <span style={{ fontSize: ".76rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.3 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{
          display: "flex", gap: 28,
          paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.08)",
        }}>
          {[
            { num: "50K+", label: "Businesses" },
            { num: "2M+",  label: "Bookings/mo" },
            { num: "4.9★", label: "Avg rating" },
          ].map(({ num, label }) => (
            <div key={label}>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.45rem", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1 }}>{num}</p>
              <p style={{ fontSize: ".65rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: ".08em", margin: "3px 0 0" }}>{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Login left panel ─── */
function LoginLeftPanel({ cfg }: { cfg: { label: string; tagline: string; icon: React.ReactNode } | null }) {
  const PLUM_MID  = "#5B21B6";
  const GOLD      = "#F59E0B";
  const PLUM      = "#3B0764";

  return (
    <div
      className="auth-left-panel"
      style={{
        flex: 1, position: "relative", overflow: "hidden",
        display: "flex", flexDirection: "column",
        background: "#0d0020",
      }}
    >
      {/* Background video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        poster="/images/nails.png"
        style={{
          position: "absolute", top: 0, left: 0,
          width: "100%", height: "100%",
          objectFit: "cover", zIndex: 1,
        }}
      >
        <source src="/videos/nail_salon.mp4" type="video/mp4" />
      </video>

      {/* Deep plum gradient overlay */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 2,
        background: "linear-gradient(145deg, rgba(26,0,64,0.86) 0%, rgba(45,0,96,0.80) 50%, rgba(26,10,46,0.88) 100%)",
      }} />

      <div style={{
        position: "relative", zIndex: 10,
        display: "flex", flexDirection: "column",
        height: "100%", padding: "52px 56px",
        animation: "fadeUp .5s ease both",
      }}>

        {/* Logo */}
        <a href="/overview" style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "1.55rem", fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "#fff", textDecoration: "none",
          marginBottom: 60, display: "block",
        }}>
          Certxa<span style={{ color: GOLD }}>.</span>
        </a>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {cfg && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "7px 16px", borderRadius: 50,
              background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.35)",
              color: "#c4b5fd", fontSize: ".8rem", fontWeight: 700,
              marginBottom: 24,
            }}>
              {cfg.icon}
              {cfg.label}
            </div>
          )}

          <h2 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(2.6rem, 3.5vw, 3.6rem)",
            fontWeight: 700, letterSpacing: "-0.03em",
            lineHeight: 1.06, color: "#fff",
            margin: "0 0 16px",
          }}>
            The platform<br />
            <em style={{ color: GOLD, fontStyle: "italic" }}>built for</em><br />
            service pros.
          </h2>

          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: ".95rem", lineHeight: 1.65, maxWidth: 340, margin: "0 0 32px" }}>
            Bookings, front desk, POS, loyalty rewards, check-in, waitlist — all in one place.
          </p>

          {/* Stats */}
          <div style={{ display: "flex", gap: 32, marginBottom: 32, paddingBottom: 28, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
            {[
              { num: "50K+", label: "Businesses" },
              { num: "2M+",  label: "Bookings/mo" },
              { num: "4.9★", label: "Avg rating" },
            ].map(({ num, label }) => (
              <div key={label}>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.6rem", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1 }}>{num}</p>
                <p style={{ fontSize: ".68rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: ".08em", margin: "4px 0 0" }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div style={{
            background: "rgba(255,255,255,0.06)", borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(8px)",
            padding: "20px 22px", maxWidth: 400,
          }}>
            <div style={{ display: "flex", gap: 2, marginBottom: 10 }}>
              {[...Array(5)].map((_, i) => (
                <svg key={i} width="13" height="13" viewBox="0 0 20 20" fill={GOLD}>
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
              ))}
            </div>
            <p style={{ fontSize: ".84rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.6, fontStyle: "italic", margin: "0 0 12px" }}>
              "Setting up took one afternoon. By the next morning we already had 6 new bookings come in overnight."
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: ".68rem", fontWeight: 700, color: "#fff",
                background: `linear-gradient(135deg, ${PLUM_MID}, ${PLUM})`,
              }}>JR</div>
              <div>
                <p style={{ fontSize: ".8rem", fontWeight: 700, color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1 }}>Jasmine R.</p>
                <p style={{ fontSize: ".7rem", color: "rgba(255,255,255,0.35)", margin: "3px 0 0" }}>Owner, Luxe Hair Studio</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
