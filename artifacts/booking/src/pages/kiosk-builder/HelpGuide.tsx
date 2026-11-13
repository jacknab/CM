/**
 * The Kiosk Builder's built-in guide (content: ./help.ts). Opens from Help in the top bar, from "How this works"
 * under each section, and by itself the first time a business opens the builder (Start here).
 */
import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { KIOSK_HELP, type HelpBlock, type HelpTopicId } from "./help";

const GROUPS = ["Getting started", "The sections", "How do I…", "More help"] as const;

/** Every word of a topic, for search. */
const topicText = (blocks: HelpBlock[]) => blocks.map((b) =>
  "p" in b ? b.p : "steps" in b ? b.steps.join(" ") : "list" in b ? b.list.join(" ") : "tip" in b ? b.tip : "h" in b ? b.h : "").join(" ").toLowerCase();

export function HelpGuide({ open, onOpenChange, topic, onTopic }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topic: HelpTopicId;
  onTopic: (t: HelpTopicId) => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const shown = useMemo(
    () => KIOSK_HELP.filter((t) => !query || t.title.toLowerCase().includes(query) || topicText(t.blocks).includes(query)),
    [query],
  );
  const current = KIOSK_HELP.find((t) => t.id === topic) ?? KIOSK_HELP[0];
  const index = KIOSK_HELP.indexOf(current);
  const next = KIOSK_HELP[index + 1];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col" data-testid="kiosk-help">
        <SheetHeader className="px-6 pt-5 pb-3 border-b border-slate-200">
          <SheetTitle>Kiosk Builder guide</SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 flex">
          {/* Topics */}
          <div className="w-[230px] shrink-0 border-r border-slate-200 overflow-y-auto p-3 space-y-3">
            <Input placeholder="Search the guide" value={q} onChange={(e) => setQ(e.target.value)} className="h-9" data-testid="kiosk-help-search" />
            {GROUPS.map((g) => {
              const items = shown.filter((t) => t.group === g);
              if (!items.length) return null;
              return (
                <div key={g}>
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g}</p>
                  {items.map((t) => (
                    <button key={t.id} type="button" onClick={() => onTopic(t.id)} data-testid={`kiosk-help-topic-${t.id}`}
                      className={`w-full text-left px-2 py-1.5 rounded-md text-sm ${t.id === current.id ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                      {t.title}
                    </button>
                  ))}
                </div>
              );
            })}
            {!shown.length && <p className="px-2 text-sm text-slate-500">Nothing found. Try another word.</p>}
          </div>

          {/* The topic */}
          <article className="flex-1 min-w-0 overflow-y-auto px-7 py-5 space-y-3 text-[15px] leading-relaxed text-slate-700" data-testid="kiosk-help-article">
            <h2 className="text-xl font-semibold text-slate-900">{current.title}</h2>
            {current.blocks.map((b, i) => {
              if ("h" in b) return <h3 key={i} className="pt-2 text-base font-semibold text-slate-900">{b.h}</h3>;
              if ("p" in b) return <p key={i}>{b.p}</p>;
              if ("steps" in b) return (
                <ol key={i} className="list-decimal pl-5 space-y-1.5">{b.steps.map((x, j) => <li key={j}>{x}</li>)}</ol>
              );
              if ("list" in b) return (
                <ul key={i} className="list-disc pl-5 space-y-1.5">{b.list.map((x, j) => <li key={j}>{x}</li>)}</ul>
              );
              if ("tip" in b) return (
                <p key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="font-semibold text-slate-900">Tip: </span>{b.tip}</p>
              );
              if ("see" in b) return (
                <p key={i} className="text-sm">
                  See also:{" "}
                  {b.see.map((x, j) => (
                    <span key={x.topic}>
                      {j > 0 && " · "}
                      <button type="button" className="underline text-slate-900" onClick={() => onTopic(x.topic)}>{x.label}</button>
                    </span>
                  ))}
                </p>
              );
              return null;
            })}
            {next && (
              <div className="pt-4 border-t border-slate-200">
                <button type="button" className="text-sm text-slate-900 underline" onClick={() => onTopic(next.id)} data-testid="kiosk-help-next">
                  Next: {next.title} →
                </button>
              </div>
            )}
          </article>
        </div>
      </SheetContent>
    </Sheet>
  );
}
