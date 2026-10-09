import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useDocumentMeta } from "./RentalsMarketingLayout";

type RentalsAuthMode = "login" | "signup";

export default function RentalsAuthPage({ mode }: { mode: RentalsAuthMode }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading, login, register, isLoggingIn, isRegistering } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useDocumentMeta(
    mode === "login" ? "Sign In — Certxa Rentals" : "Create Your Certxa Rentals Account",
    mode === "login"
      ? "Sign in to Certxa Rentals to manage your salon booth and suite rentals."
      : "Create a Certxa Rentals account for your salon's booth and suite rental management.",
  );

  // Braces matter: an effect must return nothing or a cleanup function, never a call's result.
  useEffect(() => { window.scrollTo(0, 0); }, [mode]);
  if (!isLoading && user) return <Navigate to="/rentals/today" replace />;

  const pending = isLoggingIn || isRegistering;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (mode === "login") {
        await login({ email, password, keepSignedIn: true });
      } else {
        await register({ email, password, firstName, lastName, keepSignedIn: true, source: "rentals" });
        const response = await fetch("/api/rentals/onboarding", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessName, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Your account was created, but the Rentals workspace could not be set up.");
        }
      }
      navigate("/rentals/today", { replace: true });
    } catch (error: any) {
      const raw = error?.message || "We couldn't complete that request.";
      let message = raw.replace(/^\d+:\s*/, "");
      try { message = JSON.parse(message).message || message; } catch { /* plain API message */ }
      toast({ title: mode === "login" ? "Sign in failed" : "Account setup failed", description: message, variant: "destructive" });
    }
  };

  return (
    <main className="min-h-screen bg-[#f3f1eb] text-[#171816]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(460px,0.78fr)]">
        <aside className="relative hidden overflow-hidden bg-[#171816] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
          <Link to="/" className="relative z-10 flex items-center gap-3 font-[Outfit] text-lg font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e9ad48] text-[#171816]"><Building2 size={18} /></span>
            Certxa Rentals
          </Link>
          <div className="relative z-10 max-w-xl">
            <p className="mb-5 font-mono text-xs uppercase tracking-[0.22em] text-[#e9ad48]">Your rental desk, organized</p>
            <h1 className="font-[Outfit] text-5xl font-semibold leading-[1.05] tracking-[-0.035em] xl:text-6xl">
              Less chasing rent.<br />More running your salon.
            </h1>
            <div className="mt-9 grid gap-4 text-sm text-neutral-300 sm:grid-cols-2">
              {["See paid, due, and overdue rent", "Keep every booth and suite organized", "Connect renters to real agreements", "Know what needs attention today"].map((item) => (
                <div key={item} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-[#e9ad48]" />{item}</div>
              ))}
            </div>
          </div>
          <p className="relative z-10 text-xs text-neutral-500">Built for independent salon and beauty-business owners.</p>
          <div className="absolute -bottom-24 -right-20 h-80 w-80 rounded-full border border-[#e9ad48]/20" aria-hidden="true" />
          <div className="absolute -bottom-10 -right-6 h-52 w-52 rounded-full border border-[#e9ad48]/30" aria-hidden="true" />
        </aside>

        <section className="flex items-center justify-center px-5 py-10 sm:px-10 lg:bg-white">
          <div className="w-full max-w-[430px]">
            <Link to="/" className="mb-10 inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 lg:mb-14">
              <ArrowLeft size={15} /> Back to Certxa Rentals
            </Link>
            <div className="mb-8 flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#171816] text-[#e9ad48]"><Building2 size={17} /></span>
              <span className="font-[Outfit] font-semibold">Certxa Rentals</span>
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9a681f]">{mode === "login" ? "Welcome back" : "Start your workspace"}</p>
            <h1 className="mt-3 font-[Outfit] text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
              {mode === "login" ? "Sign in to manage your rentals" : "Create your Rentals account"}
            </h1>
            <p className="mt-3 text-sm leading-6 text-neutral-500">
              {mode === "login" ? "Use your Certxa identity to open your Rentals workspace." : "Set up a dedicated workspace for your salon's booths and suites."}
            </p>

            <form onSubmit={submit} className="mt-8 space-y-5">
              {mode === "signup" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" required />
                    <Field label="Last name" value={lastName} onChange={setLastName} autoComplete="family-name" required />
                  </div>
                  <Field label="Salon or business name" value={businessName} onChange={setBusinessName} autoComplete="organization" required />
                </>
              )}
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-[13px] font-semibold text-neutral-700">
                  Password
                  {mode === "login" && <Link to="/forgot-password" className="font-medium text-[#8b5a17] hover:underline">Forgot password?</Link>}
                </span>
                <span className="relative block">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required className="h-12 w-full rounded-lg border border-neutral-300 bg-white px-3.5 pr-11 text-[15px] outline-none transition focus:border-[#b47a26] focus:ring-4 focus:ring-[#e9ad48]/15" />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </span>
              </label>
              <button disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#171816] text-sm font-semibold text-white transition hover:bg-[#2a2c28] focus:outline-none focus:ring-4 focus:ring-[#e9ad48]/30 disabled:cursor-not-allowed disabled:opacity-60">
                {pending && <Loader2 size={16} className="animate-spin" />}{mode === "login" ? "Sign In" : "Create Rentals Account"}
              </button>
            </form>
            <p className="mt-7 text-center text-sm text-neutral-500">
              {mode === "login" ? "Don't have an account?" : "Already have a Rentals account?"}{" "}
              <Link to={mode === "login" ? "/signup" : "/login"} className="font-semibold text-neutral-900 underline decoration-[#e9ad48] decoration-2 underline-offset-4">
                {mode === "login" ? "Create your Rentals account" : "Sign in"}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; required?: boolean }) {
  return <label className="block"><span className="mb-2 block text-[13px] font-semibold text-neutral-700">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required={required} className="h-12 w-full rounded-lg border border-neutral-300 bg-white px-3.5 text-[15px] outline-none transition focus:border-[#b47a26] focus:ring-4 focus:ring-[#e9ad48]/15" /></label>;
}
