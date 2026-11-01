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

/** A settings change the assistant proposed; it happens only when the owner taps Confirm. */
type ProposedChange = { id: number; summary: string; status: string; result?: string | null };

type ConversationTurn = {
  id: number;
  prompt: string;
  response: string;
  highlights: Highlight[];
  actions: AssistantAction[];
  changes?: ProposedChange[];
  showPrompt?: boolean;
};

const QUICK_PROMPTS: QuickPrompt[] = [
  { label: "How did this week go?", prompt: "How did this week go compared with last week?", icon: BarChart3 },
  { label: "Who are my best clients?", prompt: "Who are my best clients this year?", icon: Users },
  { label: "Help me set up my front desk", prompt: "Help me set up my front desk, one step at a time.", icon: Lightbulb },
  { label: "Check my front desk settings", prompt: "What are my front desk settings right now?", icon: TrendingUp },
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
      <div className="rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 text-sm leading-relaxed text-gray-900 shadow-sm whitespace-pre-line">
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
  const briefingAttemptedRef = useRef(false);

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

  const initials = (user?.firstName?.[0] || user?.email?.[0] || "U").toUpperCase();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  async function ask(prompt: string, options: { automaticBriefing?: boolean } = {}) {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || isReplying) return;
    setMessage("");
    setPendingPrompt(options.automaticBriefing ? "" : cleanPrompt);
    setIsReplying(true);

    try {
      // Questions go to the assistant that can look things up and propose settings changes (routes/ownerAssistant.ts);
      // the opening briefing still comes from the growth assistant.
      if (!options.automaticBriefing) {
        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: cleanPrompt }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "The assistant is unavailable right now.");
        setTurns(previous => [...previous, {
          id: Date.now(), prompt: cleanPrompt, response: String(payload.reply || ""),
          highlights: [], actions: [], changes: Array.isArray(payload.actions) ? payload.actions : [],
        }]);
        return;
      }
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
          briefing: options.automaticBriefing === true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("[MembersHome/growth-assistant] request failed", {
          status: response.status,
          diagnosticId: payload.diagnosticId,
          error: payload.error,
        });
        throw new Error(payload.error || "The assistant is unavailable right now.");
      }
      if (payload.skipped === true) return;

      setTurns(previous => [
        ...previous,
        {
          id: Date.now(),
          prompt: cleanPrompt,
          response: String(payload.reply || "I couldn't find a reliable answer in your salon data."),
          highlights: Array.isArray(payload.highlights) ? payload.highlights : [],
          actions: Array.isArray(payload.actions) ? payload.actions : [],
          showPrompt: !options.automaticBriefing,
        },
      ]);
    } catch (error) {
      if (options.automaticBriefing) {
        // Keep the page welcoming and manual chat available if an automatic
        // briefing cannot be generated; server diagnostics capture the cause.
        return;
      }
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

  useEffect(() => {
    if (authLoading || isLoading || !data || briefingAttemptedRef.current) return;
    briefingAttemptedRef.current = true;
    const ownerName = data.user?.firstName || user?.firstName || "there";
    void ownerName;
    // The kept conversation first, then today's briefing under it.
    void (async () => {
      try {
        const r = await fetch("/api/assistant/history", { credentials: "include" });
        const msgs: { id: number; role: string; content: string; actions?: ProposedChange[] }[] = r.ok ? await r.json() : [];
        const past: ConversationTurn[] = [];
        for (let i = 0; i < msgs.length; i++) {
          if (msgs[i].role !== "user") continue;
          const answer = msgs[i + 1]?.role === "assistant" ? msgs[i + 1] : null;
          past.push({ id: msgs[i].id, prompt: msgs[i].content, response: answer?.content ?? "", highlights: [], actions: [], changes: answer?.actions ?? [] });
        }
        if (past.length) setTurns(past);
      } catch { /* the briefing still comes */ }
      ask("Give me my briefing.", { automaticBriefing: true });
    })();
    // `ask` intentionally runs once per mounted visit; the server enforces the
    // durable cross-device 12-hour window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoading, data, user?.firstName, greeting]);

  async function decide(turnId: number, change: ProposedChange, decision: "confirm" | "cancel") {
    const mark = (patch: Partial<ProposedChange>) => setTurns(prev => prev.map(t => t.id !== turnId ? t
      : { ...t, changes: (t.changes ?? []).map(c => c.id === change.id ? { ...c, ...patch } : c) }));
    mark({ status: "working" });
    try {
      const r = await fetch(`/api/assistant/actions/${change.id}/${decision}`, { method: "POST", credentials: "include" });
      const d = await r.json().catch(() => ({}));
      mark({ status: d.status ?? (r.ok ? "done" : "failed"), result: d.message ?? null });
    } catch {
      mark({ status: "pending", result: "No connection — try again." });
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
            {turn.showPrompt !== false && <div className="flex justify-end"><UserBubble>{turn.prompt}</UserBubble></div>}
            <AiBubble animate={index === turns.length - 1}>{turn.response}</AiBubble>
            {(turn.changes ?? []).map(change => (
              <div key={change.id} className="ml-11 rounded-xl border-2 bg-white px-3.5 py-3" style={{ borderColor: "#D1D5DB" }} data-testid="assistant-change">
                <p className="text-sm font-medium text-gray-900">{change.summary}</p>
                {change.status === "pending" || change.status === "working" ? (
                  <div className="mt-2.5 flex gap-2">
                    <button type="button" disabled={change.status === "working"} onClick={() => void decide(turn.id, change, "confirm")}
                      className="min-h-[40px] flex-1 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: PLUM }} data-testid="assistant-change-confirm">
                      {change.status === "working" ? "Saving…" : "Confirm"}
                    </button>
                    <button type="button" disabled={change.status === "working"} onClick={() => void decide(turn.id, change, "cancel")}
                      className="min-h-[40px] flex-1 rounded-lg border-2 border-gray-300 text-sm font-semibold text-gray-700 disabled:opacity-60" data-testid="assistant-change-cancel">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <p className={`mt-1.5 text-xs font-medium ${change.status === "failed" ? "text-red-700" : "text-gray-500"}`} data-testid="assistant-change-result">
                    {change.result || (change.status === "done" ? "Done." : change.status === "cancelled" ? "Cancelled — nothing was changed." : change.status === "failed" ? "That change didn't go through." : "")}
                  </p>
                )}
                {change.status === "pending" && change.result && <p className="mt-1.5 text-xs text-red-700">{change.result}</p>}
              </div>
            ))}
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
