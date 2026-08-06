/**
 * /setup/website — Claim your free Bloom subdomain
 *
 * Steps:
 *  1. Slug input with live availability check
 *  2. Success confirmation + redirect back to /setup
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, CheckCircle2, XCircle, Loader2, ArrowRight, Sparkles, ExternalLink } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";

// ── Types ────────────────────────────────────────────────────────────────────

type CheckState = "idle" | "checking" | "available" | "taken" | "invalid";

interface WebsiteInfo {
  storeName: string;
  existingSlug: string | null;
  suggestedSlug: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$|^[a-z0-9]{2,63}$/;
const RESERVED = new Set([
  "www","api","admin","app","mail","smtp","ftp","ns1","ns2",
  "dev","staging","production","support","help","blog","status",
  "static","assets","cdn","media","img","images",
]);

function validateLocal(slug: string): string | null {
  if (!slug) return null;
  if (slug.length < 2) return "At least 2 characters required";
  if (!SLUG_RE.test(slug)) return "Lowercase letters, numbers, and hyphens only (no leading/trailing hyphens)";
  if (RESERVED.has(slug)) return "That name is reserved — please choose another";
  return null;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function WebsiteSetupFlow() {
  const navigate = useNavigate();

  const [info, setInfo] = useState<WebsiteInfo | null>(null);
  const [slug, setSlug] = useState("");
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [checkReason, setCheckReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [launchedSlug, setLaunchedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch store info on mount
  useEffect(() => {
    fetch("/api/setup/website-info", { credentials: "include" })
      .then((r) => r.json())
      .then((data: WebsiteInfo) => {
        setInfo(data);
        const initial = data.existingSlug ?? data.suggestedSlug ?? "";
        setSlug(initial);
        if (initial) triggerCheck(initial);
      })
      .catch(() => {});
  }, []);

  // Debounced availability check
  function triggerCheck(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const localError = validateLocal(value);
    if (!value) { setCheckState("idle"); setCheckReason(null); return; }
    if (localError) { setCheckState("invalid"); setCheckReason(localError); return; }

    setCheckState("checking");
    setCheckReason(null);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/websites/check-slug?slug=${encodeURIComponent(value)}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.available) {
          setCheckState("available");
          setCheckReason(null);
        } else {
          setCheckState("taken");
          setCheckReason(data.reason ?? "That subdomain is already taken");
        }
      } catch {
        setCheckState("idle");
      }
    }, 450);
  }

  function handleSlugChange(value: string) {
    const clean = slugify(value);
    setSlug(clean);
    triggerCheck(clean);
  }

  async function handleLaunch() {
    if (checkState !== "available" || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/website-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setLaunchedSlug(data.slug);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (launchedSlug) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Your website is live!</h1>
          <p className="text-slate-500 text-sm mb-6">
            Visit your new Certxa website at the link below. It's already filled with your salon name,
            services, and booking link.
          </p>

          <a
            href={`https://${launchedSlug}.certxa.com`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#1A0333] bg-[#1A0333]/5 hover:bg-[#1A0333]/10 border border-[#1A0333]/15 px-5 py-3 rounded-xl transition-colors mb-8"
          >
            <Globe className="w-4 h-4" />
            {launchedSlug}.certxa.com
            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
          </a>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate("/website-builder/")}
              className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-[#1A0333] hover:bg-[#2D0553] px-5 py-2.5 rounded-xl transition-colors shadow-sm"
            >
              <Sparkles className="w-4 h-4" />
              Customise in Website Builder
            </button>
            <button
              onClick={() => navigate("/setup")}
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-5 py-2.5 rounded-xl transition-colors"
            >
              Back to Setup Guide
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── Slug claim screen ─────────────────────────────────────────────────────
  const canSubmit = checkState === "available" && !submitting;

  const statusIcon = () => {
    if (checkState === "checking") return <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />;
    if (checkState === "available") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (checkState === "taken" || checkState === "invalid") return <XCircle className="w-4 h-4 text-rose-500" />;
    return null;
  };

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
        {/* Back */}
        <button
          onClick={() => navigate("/setup")}
          className="text-sm text-slate-500 hover:text-slate-800 transition-colors mb-6 flex items-center gap-1"
        >
          ← Back to Setup
        </button>

        {/* Header */}
        <div className="mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1A0333] to-[#3B0764] flex items-center justify-center mb-4 shadow">
            <Globe className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Launch your free website</h1>
          <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
            Claim your free Certxa subdomain — your salon website goes live instantly, pre-filled
            with your name, hours, services, and booking link.
          </p>
        </div>

        {/* Slug input card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-3">
            Choose your subdomain
          </label>

          {/* Input row */}
          <div className="flex items-center gap-0 rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#1A0333]/20 focus-within:border-[#1A0333]/40 transition-all">
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder={info?.suggestedSlug ?? "your-salon-name"}
              maxLength={63}
              className="flex-1 px-4 py-3 text-sm font-mono text-slate-800 bg-transparent outline-none placeholder:text-slate-400"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <div className="px-3 flex items-center gap-2 border-l border-slate-200 bg-slate-50 h-full py-3">
              {statusIcon()}
              <span className="text-sm text-slate-400 font-medium select-none">.certxa.com</span>
            </div>
          </div>

          {/* Status message */}
          <div className="mt-2 min-h-[20px]">
            {checkState === "available" && (
              <p className="text-xs text-emerald-600 font-medium">
                ✓ <strong>{slug}.certxa.com</strong> is available
              </p>
            )}
            {(checkState === "taken" || checkState === "invalid") && checkReason && (
              <p className="text-xs text-rose-500">{checkReason}</p>
            )}
            {checkState === "idle" && (
              <p className="text-xs text-slate-400">Only lowercase letters, numbers, and hyphens allowed</p>
            )}
          </div>
        </div>

        {/* Preview */}
        {checkState === "available" && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 px-5 py-4 mb-4 flex items-center gap-3">
            <Globe className="w-5 h-5 text-[#1A0333] flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Your website will be live at</p>
              <p className="text-sm font-bold text-[#1A0333]">{slug}.certxa.com</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleLaunch}
            disabled={!canSubmit}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-[#1A0333] hover:bg-[#2D0553] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Launching…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Launch My Website
              </>
            )}
          </button>
          <button
            onClick={() => navigate("/setup")}
            className="text-sm text-slate-500 hover:text-slate-700 px-4 py-3 transition-colors"
          >
            Skip for now
          </button>
        </div>

        {/* Footer note */}
        <p className="text-xs text-slate-400 text-center mt-5 leading-relaxed">
          Your subdomain is free forever. You can connect a custom domain later from the Website Builder.
        </p>
      </div>
    </AppLayout>
  );
}
