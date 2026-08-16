import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronRight,
  CircleUserRound,
  Lightbulb,
  Loader2,
  Send,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const PLUM = "#1A0333";
const GOLD = "#C97B2B";
const LIGHT = "#FAFAFA";

type Overview = {
  user?: { firstName?: string | null };
};

type QuickPrompt = {
  label: string;
  prompt: string;
  icon: typeof BarChart3;
};

type AssistantAction = {
  id: string;
  label: string;
  to: string;
};

type Highlight = {
  label: string;
  value: string;
  detail?: string;
};

type ConversationTurn = {
  id: number;
  prompt: string;
  response: string;
  highlights: Highlight[];
  actions: AssistantAction[];
};

const QUICK_PROMPTS: QuickPrompt[] = [
  { label: "Find my biggest growth opportunity", prompt: "What is my biggest growth opportunity right now?", icon: TrendingUp },
  { label: "Compare this month to last month", prompt: "How is my revenue this month compared with last month?", icon: BarChart3 },
  { label: "Show clients at risk", prompt: "What do my at-risk and drifting client numbers tell me?", icon: Users },
  { label: "Tell me what to do next", prompt: "Based on my salon data, what is the most valuable action I should take next?", icon: Lightbulb },
];

async function fetchOverview(): Promise<Overview> {
  const response = await fetch("/api/manage/overview", { credentials: "include" });
  if (response.status === 401) throw new Error("unauthorized");
  if (!response.ok) throw new Error("failed");
  return response.json();
}

function CertxaAvatar() {
  return (
    <div className="flex-shrink-0 h-8 w-8 mt-0.5" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="32" height="32">
        <rect width="64" height="64" rx="14" fill="#3B0764" />
        <rect width="64" height="64" rx="14" fill="url(#home-shine)" opacity=".18" />
        <text x="35" y="48" textAnchor="middle" fontFamily="Georgia,'Times New Roman',serif" fontSize="46" fontWeight="700" fontStyle="italic" fill="#ffffff" letterSpacing="-2">C</text>
        <circle cx="52" cy="46" r="5.5" fill="#F59E0B" />
        <defs>
          <linearGradient id="home-shine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function AiBubble({ children, animate = false }: { children: React.ReactNode; animate?: boolean }) {
  return (
    <div className={`flex items-start gap-3 ${animate ? "members-slide-in" : ""}`} style={{ maxWidth: "90%" }}>
      <CertxaAvatar />
      <div className="rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 text-sm leading-relaxed text-gray-900 shadow-sm">
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end self-end" style={{ maxWidth: "85%" }}>
      <div className="rounded-2xl rounded-br-sm px-4 py-3 text-sm font-medium text-white shadow-sm" style={{ background: PLUM }}>
        {children}
      </div>
    </div>
  );
}

export default function MembersHome() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [isReplying, setIsReplying] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery<Overview>({
    queryKey: ["/api/manage/overview"],
    queryFn: fetchOverview,
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (error instanceof Error && error.message === "unauthorized") {
      navigate("/auth?redirect=/manage", { replace: true });
    }
  }, [error, navigate]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, isReplying]);

  const firstName = data?.user?.firstName || user?.firstName || "there";
  const initials = (user?.firstName?.[0] || user?.email?.[0] || "U").toUpperCase();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  async function ask(prompt: string) {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || isReplying) return;
    setMessage("");
    setPendingPrompt(cleanPrompt);
    setIsReplying(true);

    try {
      const history = turns.flatMap(turn => [
        { role: "user", content: turn.prompt },
        { role: "assistant", content: turn.response },
      ]);
      const response = await fetch("/api/intelligence/growth-assistant", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...history, { role: "user", content: cleanPrompt }].slice(-8),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The assistant is unavailable right now.");

      setTurns(previous => [
        ...previous,
        {
          id: Date.now(),
          prompt: cleanPrompt,
          response: String(payload.reply || "I couldn't find a reliable answer in your salon data."),
          highlights: Array.isArray(payload.highlights) ? payload.highlights : [],
          actions: Array.isArray(payload.actions) ? payload.actions : [],
        },
      ]);
    } catch (error) {
      setTurns(previous => [
        ...previous,
        {
          id: Date.now(),
          prompt: cleanPrompt,
          response: error instanceof Error ? error.message : "The assistant is unavailable right now. Please try again shortly.",
          highlights: [],
          actions: [],
        },
      ]);
    } finally {
      setIsReplying(false);
      setPendingPrompt("");
    }
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    ask(message);
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: LIGHT }}>
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: PLUM }} />
      </div>
    );
  }

  return (
    <main className="mx-auto flex h-[100dvh] max-w-lg flex-col overflow-hidden" style={{ background: LIGHT, fontFamily: "system-ui, sans-serif" }}>
      <header className="relative z-20 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: PLUM }}>
            <Sparkles size={14} color={GOLD} />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight" style={{ color: PLUM }}>Certxa</p>
            <p className="flex items-center gap-1 text-[10px] leading-tight text-gray-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Growth analyst
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/account")}
          aria-label="Open account"
          className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          style={{ background: PLUM }}
        >
          {initials || <CircleUserRound size={19} />}
        </button>
      </header>

      <section ref={scrollRef} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
        <AiBubble>
          <strong>{greeting}, {firstName} 👋</strong>
          <br />
          I analyze your bookings, revenue, services, and client trends. Ask me anything about how your salon is doing or where to grow next.
        </AiBubble>

        {turns.length === 0 && (
          <div className="members-slide-in ml-11 grid grid-cols-2 gap-2 pt-1">
            {QUICK_PROMPTS.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.prompt}
                  type="button"
                  onClick={() => ask(item.prompt)}
                  className="flex min-h-[62px] items-center gap-2.5 rounded-xl border-2 bg-white px-3 py-2.5 text-left text-xs font-semibold text-gray-800 transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 active:scale-[0.98]"
                  style={{ borderColor: "#D1D5DB" }}
                >
                  <Icon size={17} style={{ color: GOLD }} className="shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        )}

        {turns.map((turn, index) => (
          <div key={turn.id} className="space-y-3">
            <div className="flex justify-end"><UserBubble>{turn.prompt}</UserBubble></div>
            <AiBubble animate={index === turns.length - 1}>{turn.response}</AiBubble>
            {turn.highlights.length > 0 && (
              <div className="ml-11 grid grid-cols-2 gap-2">
                {turn.highlights.map((highlight, highlightIndex) => (
                  <div key={`${highlight.label}-${highlightIndex}`} className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/70">{highlight.label}</p>
                    <p className="mt-0.5 text-lg font-bold" style={{ color: PLUM }}>{highlight.value}</p>
                    {highlight.detail && <p className="mt-1 text-[11px] leading-snug text-gray-500">{highlight.detail}</p>}
                  </div>
                ))}
              </div>
            )}
            <div className="ml-11 space-y-2">
              {turn.actions.map(action => {
                return (
                  <button
                    key={action.to}
                    type="button"
                    onClick={() => navigate(action.to)}
                    className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border-2 bg-white px-3.5 py-2.5 text-left text-sm font-medium text-gray-800 transition-all hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 active:scale-[0.99]"
                    style={{ borderColor: "#D1D5DB" }}
                  >
                    <Sparkles size={16} style={{ color: GOLD }} />
                    <span className="flex-1">{action.label}</span>
                    <ChevronRight size={16} className="text-gray-400" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {isReplying && (
          <div className="space-y-3">
            {pendingPrompt && <div className="flex justify-end"><UserBubble>{pendingPrompt}</UserBubble></div>}
            <div className="flex justify-start">
              <div className="ml-11 rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  {[0, 150, 300].map(delay => <span key={delay} className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: `${delay}ms` }} />)}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <footer className="border-t border-gray-200 bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <form onSubmit={submitMessage} className="flex items-end gap-2">
          <label htmlFor="members-assistant-message" className="sr-only">Ask your salon assistant</label>
          <input
            id="members-assistant-message"
            value={message}
            onChange={event => setMessage(event.target.value)}
            placeholder="Ask about revenue, clients, services…"
            autoComplete="off"
            className="min-h-[48px] flex-1 rounded-xl border-2 border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-amber-600"
          />
          <button
            type="submit"
            disabled={!message.trim() || isReplying}
            aria-label="Send message"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-35"
            style={{ background: PLUM }}
          >
            <Send size={18} />
          </button>
        </form>
        <button
          type="button"
          onClick={() => navigate("/manage/dashboard")}
          className="mt-2 min-h-[40px] w-full text-xs font-medium text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:underline"
        >
          Browse all tools
        </button>
      </footer>

      <style>{`
        @keyframes members-slide-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .members-slide-in { animation: members-slide-in 0.3s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .members-slide-in { animation: none; }
        }
      `}</style>
    </main>
  );
}
