/**
 * AppLogin.tsx — Headerless login page for the Certxa Owner native app WebView.
 *
 * Identical login logic to Auth.tsx but without the MarketingNav header or
 * the left-panel slideshow. The form card is centred over the animated
 * calendar background so the owner gets a clean, app-native feel without
 * the marketing chrome.
 *
 * Route: /app-login
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DemoCalendarBackground from "@/components/DemoCalendarBackground";

const PLUM     = "#3B0764";
const PLUM_MID = "#5B21B6";
const GOLD     = "#F59E0B";
const CHARCOAL = "#1C1917";

// ── "Continue with Google" button ────────────────────────────────────────────
function GoogleAuthButton({
  label,
  redirectTo,
}: {
  label: string;
  redirectTo?: string | null;
}) {
  const params = new URLSearchParams();
  if (redirectTo) params.set("redirect", redirectTo);
  const href = `/api/auth/google${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <a
      href={href}
      style={{
        width: "100%", display: "flex", alignItems: "center",
        justifyContent: "center", gap: 10, padding: "11px 20px",
        borderRadius: 10, border: "1.5px solid #e5e7eb", background: "#fff",
        fontSize: ".875rem", fontWeight: 600, color: "#374151",
        cursor: "pointer", textDecoration: "none",
        marginBottom: 16, transition: "border-color .15s, box-shadow .15s",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "#d1d5db";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
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

// ─────────────────────────────────────────────────────────────────────────────

export default function AppLogin() {
  const navigate = useNavigate();
  const { isAuthenticated, user, login, isLoggingIn, isLoading, hasStoredSession } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const redirectTo = searchParams.get("redirect") ?? null;

  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true); // default on for native app

  // Show error toasts from OAuth redirects
  useEffect(() => {
    const error = searchParams.get("error");
    if (!error) return;
    const messages: Record<string, string> = {
      rate_limited: `Too many sign-in attempts. Please wait ${searchParams.get("retry") ?? "a few"} minute(s) and try again.`,
      google_not_configured: "Google sign-in isn't set up on this server yet.",
      google_denied: "Google sign-in was cancelled.",
      google_oauth_failed: "Google sign-in failed. Please try again or use your email and password.",
    };
    toast({
      title: "Sign-in error",
      description: messages[error] ?? "An unexpected error occurred. Please try again.",
      variant: "destructive",
    });
  }, []);

  // Redirect when already authenticated
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (redirectTo) {
      navigate(redirectTo, { replace: true });
      return;
    }
    if (!user.onboardingCompleted) {
      navigate("/onboarding", { replace: true });
    } else {
      navigate("/manage", { replace: true });
    }
  }, [isAuthenticated, user, navigate, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email, password, keepSignedIn });
      // navigation is handled by the useEffect above once isAuthenticated flips
    } catch (error: any) {
      const message = error?.message || "Login failed";
      let description = message;
      try {
        const parsed = JSON.parse(message.replace(/^\d+:\s*/, ""));
        description = parsed.message || message;
      } catch {
        if (message.includes(":")) description = message.split(":").slice(1).join(":").trim();
      }
      toast({ title: "Login failed", description, variant: "destructive" });
    }
  };

  const isPending = isLoggingIn;

  // ── Restoring session splash ─────────────────────────────────────────────
  if (isLoading && hasStoredSession) {
    return (
      <div style={{
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0a041c",
      }}>
        <div style={{ textAlign: "center" }}>
          {/* Logo */}
          <div style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em",
            color: "#fff", marginBottom: 28,
          }}>
            Certxa<span style={{ color: GOLD }}>.</span>
          </div>
          <Loader2 style={{
            width: 32, height: 32, color: PLUM_MID,
            margin: "0 auto 14px",
            animation: "spin 1s linear infinite",
          }} />
          <p style={{ color: "#9ca3af", fontSize: ".875rem" }}>
            Welcome back! Restoring your session…
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Login card ────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0,
      fontFamily: "'Inter', sans-serif",
      overflow: "hidden",
    }}>
      {/* Animated calendar background */}
      <div style={{
        position: "absolute", inset: 0,
        filter: "blur(2px)",
        transform: "scale(1.04)",
      }}>
        <DemoCalendarBackground />
      </div>

      {/* Dark overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(10, 4, 28, 0.58)",
        backdropFilter: "brightness(0.80)",
      }} />

      {/* Centred card */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}>
        <div style={{
          width: "100%", maxWidth: 440,
          background: "#fff",
          borderRadius: 20,
          boxShadow: "0 24px 80px rgba(0,0,0,0.40), 0 8px 24px rgba(0,0,0,0.18)",
          overflow: "hidden",
          animation: "cardIn .35s cubic-bezier(.22,1,.36,1) both",
        }}>
          {/* Card body */}
          <div style={{ padding: "36px 40px 28px" }}>

            {/* Logo */}
            <div style={{
              textAlign: "center",
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.02em",
              color: CHARCOAL, marginBottom: 22,
            }}>
              Certxa<span style={{ color: GOLD }}>.</span>
            </div>

            {/* Heading */}
            <h1 style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.03em",
              color: CHARCOAL, lineHeight: 1.1,
              margin: "0 0 6px",
            }}>
              Welcome back
            </h1>
            <p style={{ color: "#6b7280", fontSize: ".88rem", margin: "0 0 22px", lineHeight: 1.5 }}>
              Sign in to continue to your dashboard.
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <Label htmlFor="app-email" style={{
                  display: "block", fontSize: ".68rem", fontWeight: 700,
                  color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4,
                }}>
                  Email
                </Label>
                <Input
                  id="app-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@yourbusiness.com"
                  required
                  autoFocus
                  style={{ height: 44, borderRadius: 9, borderColor: "#e5e7eb", background: "#fafafa", fontSize: "16px" }}
                />
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <Label htmlFor="app-password" style={{
                    fontSize: ".68rem", fontWeight: 700, color: "#6b7280",
                    textTransform: "uppercase", letterSpacing: ".08em",
                  }}>
                    Password
                  </Label>
                  <Link to="/forgot-password" style={{ fontSize: ".78rem", fontWeight: 600, color: PLUM_MID, textDecoration: "none" }}>
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="app-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  style={{ height: 44, borderRadius: 9, borderColor: "#e5e7eb", background: "#fafafa", fontSize: "16px" }}
                />
              </div>

              {/* Keep signed in — default on for native app context */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={e => setKeepSignedIn(e.target.checked)}
                  style={{ marginTop: 3, width: 16, height: 16, accentColor: PLUM_MID, cursor: "pointer" }}
                />
                <span>
                  <span style={{ display: "block", fontSize: ".78rem", fontWeight: 600, color: "#374151" }}>
                    Keep me signed in
                  </span>
                  <span style={{ display: "block", fontSize: ".7rem", color: "#9ca3af", marginTop: 1 }}>
                    Recommended for front-desk tablets.
                  </span>
                </span>
              </label>

              {/* CTA */}
              <button
                type="submit"
                disabled={isPending}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 8, padding: "13px 20px",
                  borderRadius: 10, border: "none",
                  background: `linear-gradient(135deg, ${GOLD} 0%, #E8950F 100%)`,
                  color: "#fff", fontSize: ".9rem", fontWeight: 700,
                  cursor: isPending ? "not-allowed" : "pointer",
                  opacity: isPending ? 0.65 : 1,
                  boxShadow: "0 4px 18px rgba(245,158,11,0.38)",
                  transition: "transform .15s, box-shadow .15s, opacity .15s",
                  marginTop: 4,
                }}
                onMouseEnter={e => {
                  if (!isPending) {
                    (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 26px rgba(245,158,11,0.48)";
                  }
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.transform = "none";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 18px rgba(245,158,11,0.38)";
                }}
              >
                {isPending
                  ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} />
                  : <>Sign in <ArrowRight style={{ width: 15, height: 15 }} /></>
                }
              </button>
            </form>

            {/* Switch to register */}
            <p style={{ textAlign: "center", color: "#9ca3af", fontSize: ".82rem", marginTop: 18 }}>
              Don't have an account?{" "}
              <Link
                to="/auth?mode=register"
                style={{ color: PLUM_MID, fontWeight: 700, textDecoration: "none" }}
              >
                Start free trial
              </Link>
            </p>
          </div>

          {/* Footer */}
          <div style={{
            padding: "10px 40px 14px",
            borderTop: "1px solid #f3f4f6",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 20,
          }}>
            <a
              href="https://certxa.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: ".72rem", color: "#9ca3af", textDecoration: "none" }}
            >
              Privacy
            </a>
            <a
              href="https://certxa.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: ".72rem", color: "#9ca3af", textDecoration: "none" }}
            >
              Terms
            </a>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes cardIn  {
          from { opacity: 0; transform: translateY(28px) scale(0.97); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
