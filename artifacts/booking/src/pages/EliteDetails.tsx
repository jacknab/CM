import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle, Zap, Building2, Users, BarChart3, MessageSquare, Shield, Star, ChevronRight, Sparkles } from "lucide-react";

const ELITE_PRICE = 49;

const setupSteps = [
  {
    icon: Building2,
    title: "Business branding setup",
    desc: "Logo, colors, and identity configured across your system.",
  },
  {
    icon: Building2,
    title: "Multi-location configuration",
    desc: "All your locations structured correctly from day one.",
  },
  {
    icon: Zap,
    title: "Services & pricing setup",
    desc: "Imported from your PDF, images, or website URL — no manual entry.",
  },
  {
    icon: Users,
    title: "Staff accounts created per location",
    desc: "Every team member set up with the right access and permissions.",
  },
  {
    icon: Shield,
    title: "Full system configuration",
    desc: "Settings, permissions, and structure fully built out.",
  },
  {
    icon: CheckCircle,
    title: "Quality check before delivery",
    desc: "We review everything before handing over your system.",
  },
  {
    icon: Star,
    title: "Final delivery with ready-to-use access",
    desc: "You receive your login and a fully operational system.",
  },
];

const featureGroups = [
  {
    title: "Core System",
    features: ["Booking system", "Calendar management", "Client database"],
  },
  {
    title: "Multi-Location Operations",
    features: ["Location dashboards", "Staff per location", "Performance tracking per location"],
  },
  {
    title: "Growth Tools",
    features: ["SMS & email messaging", "Analytics dashboard", "Reporting tools"],
  },
  {
    title: "Elite Only",
    features: ["Done-for-you setup service", "Priority support", "Advanced reporting access", "Unlimited API keys", "50,000 SMS credits/mo", "Webhooks & real-time events"],
    highlight: true,
  },
];

const howItWorks = [
  {
    step: "01",
    title: "You sign up for Elite",
    desc: "Create your account and choose the Elite plan.",
  },
  {
    step: "02",
    title: "You submit your business info",
    desc: "Share your website link, PDFs, or photos — that's all we need.",
  },
  {
    step: "03",
    title: "We build and deliver your system",
    desc: "We configure everything and hand it over ready to use.",
  },
];

export default function EliteDetails() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-zinc-950/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link
            to="/manage/billing"
            className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to billing
          </Link>
          <span className="font-semibold text-sm tracking-tight">
            Certxa<span className="text-amber-400">.</span>
          </span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12 lg:py-16">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16">

          {/* ── Main Content ─────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-16">

            {/* 1. Header */}
            <div>
              <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-5 tracking-wide uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                Elite Plan
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight mb-4">
                A fully managed,<br />
                <span className="text-amber-300">done-for-you</span> system setup.
              </h1>
              <p className="text-zinc-400 text-lg leading-relaxed max-w-xl">
                Built for multi-location businesses that want to launch fast — without spending weeks on configuration.
              </p>
            </div>

            {/* 2. Core Value — Done-For-You Setup */}
            <div>
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-xl mb-1">Done-for-you onboarding & system setup</h2>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                      We fully configure your entire system for you using your business data. No setup required on your side.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {setupSteps.map((item) => (
                    <div key={item.title} className="flex items-start gap-3 bg-zinc-900/60 rounded-xl p-4 border border-zinc-800/60">
                      <CheckCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-white text-sm font-medium leading-snug">{item.title}</p>
                        <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Features Breakdown */}
            <div>
              <h2 className="text-white font-bold text-xl mb-6">Everything included</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {featureGroups.map((group) => (
                  <div
                    key={group.title}
                    className={`rounded-xl border p-5 ${
                      group.highlight
                        ? "border-amber-500/30 bg-amber-500/[0.04]"
                        : "border-zinc-800/60 bg-zinc-900/40"
                    }`}
                  >
                    <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${group.highlight ? "text-amber-400" : "text-zinc-500"}`}>
                      {group.title}
                    </p>
                    <ul className="space-y-2">
                      {group.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm text-zinc-300">
                          <span className={group.highlight ? "text-amber-400" : "text-emerald-400"}>✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. How it works */}
            <div>
              <h2 className="text-white font-bold text-xl mb-6">How it works</h2>
              <div className="relative">
                <div className="hidden sm:block absolute left-[30px] top-8 bottom-8 w-px bg-zinc-800" />
                <div className="space-y-4">
                  {howItWorks.map((item, i) => (
                    <div key={i} className="flex items-start gap-5">
                      <div className="relative z-10 w-[60px] flex-shrink-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-zinc-900 border-2 border-amber-500/40 flex items-center justify-center">
                          <span className="text-amber-400 text-xs font-bold">{item.step}</span>
                        </div>
                      </div>
                      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4 flex-1">
                        <p className="text-white font-semibold text-sm mb-0.5">{item.title}</p>
                        <p className="text-zinc-500 text-xs leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 5. Reassurance */}
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { icon: Shield, text: "No setup required on your side" },
                  { icon: Zap, text: "We handle everything for you" },
                  { icon: CheckCircle, text: "Your system is delivered ready to use" },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-3">
                    <item.icon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <p className="text-zinc-300 text-sm">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 6. Bottom CTA */}
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-8 text-center">
              <h3 className="text-white font-bold text-xl mb-2">Ready to get started?</h3>
              <p className="text-zinc-400 text-sm mb-6">We begin setup immediately after signup.</p>
              <Link
                to="/manage/billing"
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm px-6 py-3 rounded-xl transition-colors"
              >
                Get Started with Elite
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

          </div>

          {/* ── Sticky Summary Panel ──────────────────────────────────── */}
          <div className="lg:w-72 flex-shrink-0">
            <div className="lg:sticky lg:top-24">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-6 space-y-5">
                <div>
                  <div className="inline-flex items-center gap-1.5 bg-amber-500/15 text-amber-300 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-3">
                    <Sparkles className="w-3 h-3" />
                    Elite Plan
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold text-amber-200">${ELITE_PRICE}</span>
                    <span className="text-zinc-500 text-sm mb-1">/month</span>
                  </div>
                  <p className="text-zinc-500 text-xs mt-1">Includes done-for-you setup service</p>
                </div>

                <div className="space-y-2.5">
                  {["Done-for-you system setup", "Multi-location ready", "Unlimited API access", "50,000 SMS/mo", "Priority support"].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm text-zinc-300">
                      <CheckCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>

                <Link
                  to="/manage/billing"
                  className="flex items-center justify-center gap-2 w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm py-3 px-4 rounded-xl transition-colors"
                >
                  Get Started with Elite
                  <ChevronRight className="w-4 h-4" />
                </Link>

                <p className="text-zinc-600 text-xs text-center">We begin setup immediately after signup.</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
