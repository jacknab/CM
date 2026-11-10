/**
 * Website designer for salons (owner, 2026-11-10; plans/ai-website-builder.md). The salon dashboard's copy of the
 * Certxa Pro app's screen (app/website-designer.tsx), on the same API (api-server routes/aiSite.ts) for the salon chosen
 * in the store switcher: "here's your business as I know it", Look me up online (what Google, the old site and the web
 * say, and "which is right?" questions), six ideas with Love it / Not this, Build my site, Describe a change, Versions,
 * Put it online. Each AI step uses AI credits (200 free per business). Opened from Settings › Online Booking.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSelectedStore } from "@/hooks/use-store";
import { aiFontStack, useFontFamilies } from "@/pages/public-booking/AiSiteTheme";

type Block = { type: string; title?: string; lines?: string[] };
type Idea = { angle: string; why: string; layout: string; palette: { background: string; surface: string; text: string; accent: string };
  fonts: { heading: string; body: string }; headline: string; subline: string; blocks: Block[]; callToAction: string };
type Feedback = { verdict: "love" | "not" | null; note: string | null; chips: string[] };
type Round = { id: number; ideas: Idea[]; feedback: Feedback[] };
type Facts = {
  business: { name: string; kind: string; phone: string | null; area: string | null; privateAddress: boolean; houseCalls: { radiusMiles: number | null } | null };
  services: { name: string; price: number | null }[]; hours: { day: string; open: string | null }[]; team: { name: string }[];
  rating: { average: number; count: number } | null; photos: number; missing: string[];
};
type FoundCard = { kind: string; title: string; text: string; chips: string[]; sources: string[] };
type FoundQuestion = { id: string; topic: string; question: string; options: { label: string; from: string }[]; hint?: string };
type Answer = { choice?: number; text?: string; skipped?: boolean };
type Research = { id: number; found: { summary: string; cards: FoundCard[]; questions: FoundQuestion[]; webSearched: boolean }; answers: Record<string, Answer> };
type Version = { id: number; madeBy: string; summary: string | null; previewUrl: string | null; createdAt: string; live: boolean };
type ChatMessage = { id: number; role: "owner" | "designer"; text: string; versionId: number | null; createdAt: string };
type State = { available: boolean; credits: number; prices: { ideas: number; moreIdeas: number; build: number; edit: number; research: number }; facts: Facts;
  round: Round | null; research: Research | null; version: Version | null; job: { id: number; kind: string } | null; liveVersionId: number | null;
  siteUrl: string | null; messages: ChatMessage[] };
type JobPoll = { status: "running" | "done" | "failed"; error?: string | null; credits: number; research?: Research | null; round?: Round | null; version?: Version | null; messages?: ChatMessage[] };
type Working = "research" | "ideas" | "more" | "build" | "change";

const CARD_LABELS: Record<string, string> = { where: "Where you are", guests: "What guests say", oldSite: "Your old site", nearby: "Salons nearby",
  neighbourhood: "Your neighbourhood", look: "How you look", other: "Also found" };
const CHIPS = [{ key: "colours", label: "Colours" }, { key: "letters", label: "Letters" }, { key: "layout", label: "Layout" }, { key: "words", label: "Words" }];
const MISSING: Record<string, string> = {
  services: "No services yet. Add them in Catalog.",
  prices: "Most services have no price. Prices make a site much stronger (Catalog).",
  hours: "No opening hours yet (Settings › Business hours).",
  phone: "No business phone number (Settings › Business details).",
  location: "No city or address (Settings › Business details).",
  photos: "No photos of your work yet.",
  about: "No About text yet (Settings › Online Booking › About).",
};
const WORKING_TITLE: Record<Working, string> = { research: "Looking you up online", ideas: "Sketching 6 ideas at once", more: "Sketching 6 ideas at once", build: "Building your site", change: "Making your change" };
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** One idea drawn as a small phone page, in its real fonts. */
function IdeaPreview({ idea, name }: { idea: Idea; name: string }) {
  const p = idea.palette;
  const head = { fontFamily: aiFontStack(idea.fonts.heading), fontWeight: 700 }, body = { fontFamily: aiFontStack(idea.fonts.body) };
  return (
    <div className="rounded-2xl border p-4 shadow-sm" style={{ background: p.background, color: p.text }}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm" style={head}>{name}</span>
        <span className="rounded-full border px-2 py-0.5 text-xs opacity-70" style={{ ...body, borderColor: p.text }}>Menu</span>
      </div>
      <div className="mt-3 text-[28px] leading-[1.1]" style={head}>{idea.headline}</div>
      {idea.subline ? <div className="mt-1.5 text-sm opacity-80" style={body}>{idea.subline}</div> : null}
      {idea.blocks.filter((b) => b.type !== "callToAction").map((b, i) => (
        <div key={i} className="mt-3 rounded-xl p-3" style={{ background: p.surface }}>
          {b.title ? <div className="mb-1.5 text-[15px]" style={head}>{b.title}</div> : null}
          {(b.lines ?? []).slice(0, 6).map((line, j) => {
            const [left, right] = line.split(" · ");
            return b.type === "priceList" && right ? (
              <div key={j} className="flex items-center gap-2 py-0.5 text-[13px]" style={body}>
                <span className="flex-1 truncate">{left}</span><span style={{ ...head, color: p.accent }}>{right}</span>
              </div>
            ) : (
              <div key={j} className={`text-[13px] leading-5 opacity-90 ${b.type === "reviews" ? "italic" : ""}`} style={body}>
                {b.type === "reviews" ? `“${line.replace(/^[\s"“”']+|[\s"“”']+$/g, "")}”` : line}
              </div>
            );
          })}
        </div>
      ))}
      <div className="mt-3 flex h-11 items-center justify-center rounded-xl text-[15px]" style={{ ...head, background: p.accent, color: p.background }}>{idea.callToAction}</div>
    </div>
  );
}

export default function WebsiteDesigner() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<Working | null>(null);
  const [list, setList] = useState<Version[]>([]);
  const [switching, setSwitching] = useState(false);
  const [change, setChange] = useState("");
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [reopened, setReopened] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [confirm, setConfirm] = useState<{ kind: "publish"; version: Version } | { kind: "unpublish" } | null>(null);
  useFontFamilies(state?.round ? state.round.ideas.flatMap((i) => [i.fonts.heading, i.fonts.body]) : []);

  /** The designer's API for the salon in the store switcher (the server checks it is the user's). */
  const call = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    const res = await fetch(`${path}${path.includes("?") ? "&" : "?"}storeId=${storeId}`, {
      method, credentials: "include", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Something went wrong.");
    return data as T;
  }, [storeId]);

  const loadVersions = useCallback(async () => {
    const r = await call<{ versions: Version[] }>("/api/ai-site/versions").catch(() => null);
    if (r) setList(r.versions);
  }, [call]);

  // AI steps run as background jobs on the server: check every 4 seconds until done.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const follow = useCallback(async (jobId: number, kind: Working) => {
    setWorking(kind);
    try {
      for (;;) {
        await new Promise((r) => setTimeout(r, 4000));
        if (!alive.current) return;
        const job = await call<JobPoll>(`/api/ai-site/jobs/${jobId}`).catch(() => null);
        if (!job) continue;
        if (job.status === "running") { setState((s) => (s ? { ...s, credits: job.credits } : s)); continue; }
        if (job.status === "failed") { setError(job.error ?? "Something went wrong. Your credits were not used."); setState((s) => (s ? { ...s, credits: job.credits } : s)); return; }
        setState((s) => (s ? { ...s, credits: job.credits, research: job.research ?? s.research, round: job.round ?? s.round, version: job.version ?? s.version, messages: job.messages ?? s.messages } : s));
        if (kind === "ideas" || kind === "more") setNotes({}); else if (kind !== "research") void loadVersions();
        return;
      }
    } finally { if (alive.current) setWorking(null); }
  }, [call, loadVersions]);

  useEffect(() => {
    if (!storeId) return;
    setState(null); setError("");
    call<State>("/api/ai-site").then((next) => {
      setState(next);
      void loadVersions();
      if (next.job) {
        const k = next.job.kind;
        void follow(next.job.id, k === "research" || k === "build" || k === "change" ? k : k === "more-ideas" ? "more" : "ideas");
      }
    }).catch((e) => setError(e.message || "The website designer could not be opened."));
  }, [storeId, call, follow, loadVersions]);

  /** Charge credits and start a background step. */
  const start = async (kind: Working, path: string, price: number, body: Record<string, unknown> = {}) => {
    if (!state || working) return false;
    if (state.credits < price) { setError(`This needs ${price} credits; you have ${state.credits}.`); return false; }
    setError("");
    try {
      const r = await call<{ jobId: number; credits: number }>(path, "POST", { ...body, idempotencyKey: newKey() });
      setState((s) => (s ? { ...s, credits: r.credits } : s));
      void follow(r.jobId, kind);
      return true;
    } catch (e: any) { setError(`${e.message} Your credits were not used.`); return false; }
  };

  const sendChange = async () => {
    const message = change.trim();
    if (!state || message.length < 2) return;
    if (await start("change", "/api/ai-site/change", state.prices.edit, { message })) {
      setChange("");
      setState((s) => (s ? { ...s, messages: [...s.messages, { id: -Date.now(), role: "owner", text: message, versionId: null, createdAt: new Date().toISOString() }] } : s));
    }
  };

  const answer = async (q: FoundQuestion, a: Answer) => {
    if (!state?.research) return;
    const id = state.research.id;
    setState((s) => (s && s.research ? { ...s, research: { ...s.research, answers: { ...s.research.answers, [q.id]: a } } } : s));
    setReopened((r) => ({ ...r, [q.id]: false }));
    try {
      const r = await call<{ research: Research; facts: Facts; phoneSaved: string | null }>(`/api/ai-site/research/${id}/answers/${q.id}`, "PUT", a);
      setState((s) => (s ? { ...s, research: r.research, facts: r.facts } : s));
    } catch (e: any) { setError(e.message || "That could not be saved."); }
  };
  const answerText = (q: FoundQuestion, a: Answer) => (a.skipped ? "Skipped for now" : a.text ? a.text : a.choice != null ? q.options[a.choice]?.label ?? "" : "");

  const saveFeedback = (index: number, part: Partial<Feedback>) => {
    if (!state?.round) return;
    const roundId = state.round.id;
    setState((s) => (s && s.round ? { ...s, round: { ...s.round, feedback: s.round.feedback.map((f, i) => (i === index ? { ...f, ...part } : f)) } } : s));
    void call(`/api/ai-site/ideas/${roundId}/${index}`, "PUT", part).catch(() => setError("That could not be saved. Check the connection."));
  };

  const switchSite = async () => {
    if (!confirm) return;
    setSwitching(true); setError("");
    try {
      const r = confirm.kind === "publish"
        ? await call<{ versions: Version[] }>(`/api/ai-site/versions/${confirm.version.id}/publish`, "POST", {})
        : await call<{ versions: Version[] }>("/api/ai-site/unpublish", "POST", {});
      setList(r.versions);
      const liveId = confirm.kind === "publish" ? confirm.version.id : null;
      setState((s) => (s ? { ...s, liveVersionId: liveId, version: s.version ? { ...s.version, live: s.version.id === liveId } : s.version } : s));
    } catch (e: any) { setError(e.message); }
    finally { setSwitching(false); setConfirm(null); }
  };

  const f = state?.facts;
  const priced = f ? f.services.filter((x) => x.price != null).length : 0;
  const openDays = f ? f.hours.filter((h) => h.open).length : 0;
  const reacted = state?.round ? state.round.feedback.some((x) => x.verdict) : false;
  const loved = state?.round ? state.round.feedback.some((x) => x.verdict === "love") : false;
  const siteHost = state?.siteUrl?.replace("https://", "") ?? "your website";

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl pb-16" data-testid="website-designer">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/settings/online-booking" className="text-sm text-muted-foreground hover:underline">Online Booking</Link>
            <h1 className="text-2xl font-semibold tracking-tight">Website designer</h1>
          </div>
          {state ? <div className="text-sm font-semibold" data-testid="designer-credits">{`${state.credits} AI credits`}</div> : null}
        </div>

        {!state ? (error ? <p className="text-sm text-destructive">{error}</p> : <Loader2 className="mx-auto mt-16 h-6 w-6 animate-spin text-muted-foreground" />) : (
          <div className="space-y-6">
            {!state.available ? <p className="text-sm text-muted-foreground">The website designer isn't switched on yet.</p> : null}

            <Card className="p-6" data-testid="designer-facts">
              <h2 className="mb-2 text-lg font-semibold">{`Here's ${f!.business.name} as I know it`}</h2>
              <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                <div>{[f!.business.kind, f!.business.area].filter(Boolean).join(" · ")}{f!.business.privateAddress ? " (city only, your address stays private)" : ""}</div>
                <div>{`${f!.services.length} services, ${priced} with prices`}</div>
                <div>{openDays ? `Open ${openDays} ${openDays === 1 ? "day" : "days"} a week` : "No opening hours yet"}</div>
                {f!.team.length ? <div>{`Team: ${f!.team.map((t) => t.name).join(", ")}`}</div> : null}
                {f!.rating ? <div>{`${f!.rating.average} stars from ${f!.rating.count} ${f!.rating.count === 1 ? "review" : "reviews"}`}</div> : null}
                <div>{f!.photos ? `${f!.photos} photos of your work` : "No photos yet"}</div>
              </div>
              {f!.missing.length ? (
                <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
                  <div className="mb-1 font-semibold">Worth adding first</div>
                  {f!.missing.map((m) => <div key={m}>{`• ${MISSING[m] ?? m}`}</div>)}
                </div>
              ) : null}
              {!working && !state.research && state.available ? (
                <Button variant="outline" className="mt-4" onClick={() => void start("research", "/api/ai-site/research", state.prices.research)} data-testid="designer-lookup">
                  {`Look me up online · ${state.prices.research} credits`}
                </Button>
              ) : null}
            </Card>

            {working ? (
              <Card className="flex items-center gap-4 p-5" data-testid="designer-working">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <div>
                  <div className="font-semibold">{WORKING_TITLE[working]}</div>
                  <div className="text-sm text-muted-foreground">This takes a minute or so. You can leave this page; it keeps going.</div>
                </div>
              </Card>
            ) : null}
            {error ? <p className="text-sm text-destructive" data-testid="designer-error">{error}</p> : null}

            {state.research ? (
              <section className="space-y-4" data-testid="designer-found">
                <div>
                  <h2 className="text-lg font-semibold">What I found</h2>
                  <p className="text-muted-foreground">{state.research.found.summary}</p>
                </div>
                {state.research.found.questions.map((q) => {
                  const a = state.research!.answers[q.id];
                  if (a && !reopened[q.id]) return (
                    <Card key={q.id} className="flex items-center gap-4 p-4" data-testid={`designer-answered-${q.id}`}>
                      <div className="flex-1">
                        <div className="text-sm text-muted-foreground">{q.question}</div>
                        <div className="font-semibold">{answerText(q, a)}</div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setReopened((r) => ({ ...r, [q.id]: true }))}>Change</Button>
                    </Card>
                  );
                  return (
                    <Card key={q.id} className="space-y-3 bg-muted/60 p-5" data-testid={`designer-question-${q.id}`}>
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">I need you for a moment</div>
                      <div className="text-base font-semibold">{q.question}</div>
                      <div className="space-y-2">
                        {q.options.map((o, i) => (
                          <button key={i} type="button" onClick={() => void answer(q, { choice: i })} data-testid={`designer-option-${q.id}-${i}`}
                            className={`flex w-full items-center gap-3 rounded-lg border bg-background px-4 py-3 text-left hover:border-foreground/40 ${a?.choice === i ? "border-foreground" : ""}`}>
                            <span className="flex-1 font-medium">{o.label}</span>
                            <span className="text-xs text-muted-foreground">{o.from}</span>
                          </button>
                        ))}
                      </div>
                      {q.hint ? <p className="text-sm text-muted-foreground">{q.hint}</p> : null}
                      {q.topic === "other" ? (
                        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = (typed[q.id] ?? "").trim(); if (t) void answer(q, { text: t }); }}>
                          <Input value={typed[q.id] ?? ""} onChange={(e) => setTyped((t) => ({ ...t, [q.id]: e.target.value }))} maxLength={200} placeholder="Or type the right answer" />
                          <Button type="submit" size="icon" disabled={!(typed[q.id] ?? "").trim()} aria-label="Send answer"><ArrowUp className="h-4 w-4" /></Button>
                        </form>
                      ) : null}
                      <button type="button" className="text-sm font-semibold underline" onClick={() => void answer(q, { skipped: true })}>Skip for now</button>
                    </Card>
                  );
                })}
                {state.research.found.cards.length ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {state.research.found.cards.map((c, i) => (
                      <Card key={i} className="flex flex-col p-5">
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{CARD_LABELS[c.kind] ?? CARD_LABELS.other}</div>
                        <div className="mt-1 text-lg font-semibold leading-snug">{c.title}</div>
                        {c.text ? <p className="mt-1 text-sm">{c.text}</p> : null}
                        {c.chips.length ? <p className="mt-2 text-sm font-semibold">{c.chips.join(" · ")}</p> : null}
                        <p className="mt-auto pt-3 text-xs text-muted-foreground">{c.sources.join(", ")}</p>
                      </Card>
                    ))}
                  </div>
                ) : null}
                {!state.research.found.webSearched ? <p className="text-sm text-muted-foreground">Yelp, Nextdoor and other sites are added once the full designer is switched on.</p> : null}
                {!working ? (
                  <Button variant="ghost" onClick={() => void start("research", "/api/ai-site/research", state.prices.research)} data-testid="designer-lookup-again">
                    {`Look me up again · ${state.prices.research} credits`}
                  </Button>
                ) : null}
              </section>
            ) : null}

            {state.version && !working ? (
              <Card className="space-y-2 p-6" data-testid="designer-version">
                <h2 className="text-lg font-semibold">{state.version.live ? "Your site is online" : "Your site is ready to preview"}</h2>
                {state.version.summary ? <p className="text-sm">{state.version.summary}</p> : null}
                <p className="text-sm text-muted-foreground">{state.version.live
                  ? `Clients see this design at ${siteHost}. Prices, hours, reviews and photos always come from your Certxa details.`
                  : "Prices, hours, reviews and photos always come from your Certxa details. Only you can see the preview until you put it online."}</p>
                {state.version.previewUrl ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button asChild><a href={state.version.previewUrl} target="_blank" rel="noreferrer">{state.version.live ? "Open my website" : "Preview my site"}</a></Button>
                    {!state.version.live ? <Button variant="outline" disabled={switching} onClick={() => setConfirm({ kind: "publish", version: state.version! })}>Put it online</Button> : null}
                  </div>
                ) : <p className="text-sm text-muted-foreground">Set up your booking link first (Settings › Online Booking).</p>}
              </Card>
            ) : null}

            {state.version ? (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Describe a change</h2>
                {state.messages.length ? (
                  <div className="space-y-2" data-testid="designer-chat">
                    {state.messages.map((m) => (
                      <div key={m.id} className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "owner" ? "ml-auto bg-foreground text-background" : "border bg-background"}`}>{m.text}</div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">For example: "make it pink", "add a short FAQ about parking", "say we speak Spanish".</p>}
                <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void sendChange(); }}>
                  <Textarea value={change} onChange={(e) => setChange(e.target.value)} maxLength={500} rows={2} disabled={!!working} placeholder="Describe a change…" data-testid="designer-change-input" />
                  <Button type="submit" size="icon" disabled={!!working || change.trim().length < 2} aria-label="Send change"><ArrowUp className="h-4 w-4" /></Button>
                </form>
                <p className="text-xs text-muted-foreground">{`${state.prices.edit} credits a change, none if nothing needed changing. Each change is a new version you can preview first.`}</p>
              </section>
            ) : null}

            {!working && list.length > 0 && (list.length > 1 || state.liveVersionId != null) ? (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Versions</h2>
                <Card className="divide-y" data-testid="designer-versions">
                  {list.map((v) => (
                    <div key={v.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1">
                        <div className="font-medium">{`${v.madeBy === "build" ? "Built" : "Changed"} ${when(v.createdAt)}`}</div>
                        {v.live ? <div className="text-xs font-semibold text-muted-foreground">Online now</div> : null}
                      </div>
                      {v.previewUrl ? <a href={v.previewUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold hover:underline">Preview</a> : null}
                      {!v.live && v.previewUrl ? <button type="button" disabled={switching} onClick={() => setConfirm({ kind: "publish", version: v })} className="text-sm font-semibold hover:underline">Put online</button> : null}
                    </div>
                  ))}
                </Card>
                {state.liveVersionId != null ? <Button variant="ghost" disabled={switching} onClick={() => setConfirm({ kind: "unpublish" })}>Use my old design</Button> : null}
              </section>
            ) : null}

            {!working && !state.round ? (
              <Button size="lg" disabled={!state.available} onClick={() => void start("ideas", "/api/ai-site/ideas", state.prices.ideas, { more: false })} data-testid="designer-sketch">
                {`Show me 6 ideas · ${state.prices.ideas} credits`}
              </Button>
            ) : null}

            {state.round ? (
              <section className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Ideas for your site</h2>
                  <p className="text-sm text-muted-foreground">These are just inspiration. Tell me what you love and what you don't, and I'll design your site from that.</p>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {state.round.ideas.map((idea, i) => {
                    const fb = state.round!.feedback[i] ?? { verdict: null, note: null, chips: [] };
                    return (
                      <div key={`${state.round!.id}-${i}`} className="flex flex-col" data-testid={`designer-idea-${i}`}>
                        <div className="font-semibold">{idea.angle}</div>
                        <p className="mb-3 text-sm text-muted-foreground">{idea.why}</p>
                        <IdeaPreview idea={idea} name={f!.business.name} />
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button variant={fb.verdict === "not" ? "default" : "outline"} onClick={() => saveFeedback(i, { verdict: fb.verdict === "not" ? null : "not" })}>Not this</Button>
                          <Button variant={fb.verdict === "love" ? "default" : "outline"} onClick={() => saveFeedback(i, { verdict: fb.verdict === "love" ? null : "love" })}>Love it</Button>
                        </div>
                        {fb.verdict ? (
                          <div className="mt-2 space-y-2">
                            <Input value={notes[i] ?? fb.note ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [i]: e.target.value }))}
                              onBlur={() => { if (notes[i] !== undefined) saveFeedback(i, { note: notes[i].trim() || null }); }}
                              placeholder={fb.verdict === "love" ? "What do you love?" : "What's not working?"} />
                            <div className="flex flex-wrap gap-4">
                              {CHIPS.map((c) => {
                                const on = fb.chips.includes(c.key);
                                return (
                                  <label key={c.key} className="flex items-center gap-2 text-sm">
                                    <Checkbox checked={on} onCheckedChange={() => saveFeedback(i, { chips: on ? fb.chips.filter((x) => x !== c.key) : [...fb.chips, c.key] })} />
                                    {c.label}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {!working ? (
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button size="lg" disabled={!loved} onClick={() => void start("build", "/api/ai-site/build", state.prices.build)} data-testid="designer-build">
                      {`${state.version ? "Build it again" : "Build my site"} · ${state.prices.build} credits`}
                    </Button>
                    <Button size="lg" variant="outline" disabled={!reacted} onClick={() => void start("more", "/api/ai-site/ideas", state.prices.moreIdeas, { more: true })} data-testid="designer-more">
                      {`More ideas · ${state.prices.moreIdeas} credits`}
                    </Button>
                    {!loved ? <span className="text-sm text-muted-foreground">Mark at least one idea Love it to build your site.</span> : null}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </div>

      <AlertDialog open={confirm != null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "unpublish" ? "Use your old design?" : "Put it online?"}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.kind === "unpublish"
              ? "Your website goes back to the design you had before. Your AI designs are kept, so you can put one back online any time."
              : `${siteHost} will show this design from now on. You can switch back any time.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void switchSite(); }} disabled={switching}>
              {confirm?.kind === "unpublish" ? "Use old design" : "Put it online"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
