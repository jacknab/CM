import React, { useState, useRef, useEffect } from "react";
import { appAlert } from "@/lib/confirm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Star,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Send,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import axios from "axios";

interface DraftItem {
  reviewId: number;
  responseId: number | null;
  customerName: string | null;
  rating: number;
  reviewText: string | null;
  draftText: string | null;
  skipped: boolean;
  // local UI state
  editedText: string;
  kept: boolean;
  publishing: boolean;
  published: boolean;
  expanded: boolean;
}

interface BulkDraftModalProps {
  storeId: number;
  unrespondedCount: number;
  maxDays?: number;
  onClose: () => void;
  onComplete: () => void;
}

type Phase = "idle" | "generating" | "review" | "done";

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={13}
          className={i <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating}/5</span>
    </div>
  );
}

export function BulkDraftModal({
  storeId,
  unrespondedCount,
  maxDays = 30,
  onClose,
  onComplete,
}: BulkDraftModalProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const keptCount = items.filter((i) => i.kept && !i.published).length;
  const publishedCount = items.filter((i) => i.published).length;
  const allPublished = items.length > 0 && items.filter((i) => i.kept).every((i) => i.published);

  const startGeneration = async () => {
    setPhase("generating");
    setItems([]);
    setErrorMsg(null);
    abortRef.current = new AbortController();

    try {
      const resp = await fetch(
        `/api/google-business/bulk-draft-replies/${storeId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxDays }),
          signal: abortRef.current.signal,
        }
      );

      if (!resp.ok) {
        throw new Error(`Server error: ${resp.status}`);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleEvent(event);
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setErrorMsg("Something went wrong. Please try again.");
      setPhase("idle");
    }
  };

  const handleEvent = (event: any) => {
    if (event.type === "start") {
      setTotal(event.total);
      if (event.total === 0) {
        setPhase("done");
      }
    } else if (event.type === "progress") {
      setItems((prev) => [
        ...prev,
        {
          reviewId: event.reviewId,
          responseId: event.responseId,
          customerName: event.customerName,
          rating: event.rating,
          reviewText: event.reviewText,
          draftText: event.draftText,
          skipped: event.skipped ?? false,
          editedText: event.draftText ?? "",
          kept: !event.skipped && !!event.draftText,
          publishing: false,
          published: false,
          expanded: false,
        },
      ]);
    } else if (event.type === "done") {
      setPhase("review");
    } else if (event.type === "error") {
      setErrorMsg(event.message ?? "An error occurred.");
      setPhase("idle");
    }
  };

  const toggleExpand = (idx: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, expanded: !item.expanded } : item
      )
    );
  };

  const toggleKeep = (idx: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, kept: !item.kept } : item
      )
    );
  };

  const updateText = (idx: number, text: string) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, editedText: text } : item
      )
    );
  };

  const publishOne = async (idx: number) => {
    const item = items[idx];
    if (!item.responseId || item.published || item.publishing) return;

    // If text was edited, update the draft first
    if (item.editedText !== item.draftText) {
      try {
        await axios.patch(`/api/google-business/review-response/${item.responseId}`, {
          responseText: item.editedText,
        });
      } catch { /* best-effort; publish anyway */ }
    }

    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, publishing: true } : it))
    );

    try {
      await axios.post(
        `/api/google-business/review-response/${item.responseId}/publish`
      );
      setItems((prev) =>
        prev.map((it, i) =>
          i === idx ? { ...it, publishing: false, published: true } : it
        )
      );
    } catch (err: any) {
      void appAlert(err.response?.data?.message ?? "Failed to publish. Try again from the Reviews list.", "Error");
      setItems((prev) =>
        prev.map((it, i) => (i === idx ? { ...it, publishing: false } : it))
      );
    }
  };

  const publishAll = async () => {
    for (let i = 0; i < items.length; i++) {
      if (items[i].kept && !items[i].published) {
        await publishOne(i);
      }
    }
  };

  const handleClose = () => {
    abortRef.current?.abort();
    onComplete();
    onClose();
  };

  return (
    <Dialog open onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-violet-600" />
            Bulk AI Reply Drafts
          </DialogTitle>
          <DialogDescription>
            {phase === "idle" &&
              `Generate AI reply drafts for all ${unrespondedCount} unanswered review${unrespondedCount !== 1 ? "s" : ""}. Review and edit each draft before publishing.`}
            {phase === "generating" &&
              `Writing drafts… ${items.length} of ${total || "?"} done`}
            {phase === "review" &&
              `${items.filter((i) => !i.skipped).length} drafts ready — edit if needed, then publish.`}
            {phase === "done" && "All unanswered reviews already have drafts — nothing to generate."}
          </DialogDescription>
        </DialogHeader>

        {/* Error */}
        {errorMsg && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 shrink-0">
            {errorMsg}
          </p>
        )}

        {/* Idle state */}
        {phase === "idle" && !errorMsg && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="rounded-full bg-violet-100 p-4">
              <Sparkles size={28} className="text-violet-600" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium text-gray-800">
                {unrespondedCount} unanswered review{unrespondedCount !== 1 ? "s" : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                AI will write a personalised draft for each one. You'll review everything before anything is published.
              </p>
            </div>
            <Button onClick={startGeneration} className="gap-2 bg-violet-600 hover:bg-violet-700">
              <Sparkles size={15} />
              Start Generating Drafts
            </Button>
          </div>
        )}

        {/* Generating — live progress list */}
        {phase === "generating" && (
          <div className="flex-1 overflow-y-auto space-y-2 py-2 min-h-0">
            {/* Progress bar */}
            {total > 0 && (
              <div className="shrink-0 mb-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Generating drafts…</span>
                  <span>{items.length} / {total}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-300"
                    style={{ width: `${total > 0 ? (items.length / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {items.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-violet-600 py-4 justify-center">
                <Loader2 size={16} className="animate-spin" />
                Starting…
              </div>
            )}

            {items.map((item, i) => (
              <div
                key={item.reviewId}
                className={`rounded-md border px-3 py-2 flex items-start gap-2 text-sm ${
                  item.skipped
                    ? "border-gray-200 bg-gray-50 text-gray-400"
                    : "border-violet-200 bg-violet-50/50"
                }`}
              >
                {item.skipped ? (
                  <XCircle size={15} className="mt-0.5 text-gray-400 shrink-0" />
                ) : (
                  <CheckCircle2 size={15} className="mt-0.5 text-violet-500 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate">{item.customerName ?? "Anonymous"}</p>
                  <StarRow rating={item.rating} />
                </div>
              </div>
            ))}

            {total > 0 && items.length < total && (
              <div className="flex items-center gap-2 text-sm text-violet-500 pt-1 pl-1">
                <Loader2 size={14} className="animate-spin" />
                Writing next draft…
              </div>
            )}
          </div>
        )}

        {/* Review phase — editable draft cards */}
        {(phase === "review") && items.length > 0 && (
          <div className="flex-1 overflow-y-auto space-y-3 py-2 min-h-0">
            {items.map((item, idx) => (
              <div
                key={item.reviewId}
                className={`rounded-lg border transition-colors ${
                  item.published
                    ? "border-green-200 bg-green-50/60"
                    : item.skipped
                    ? "border-gray-200 bg-gray-50"
                    : item.kept
                    ? "border-violet-200 bg-white"
                    : "border-gray-200 bg-gray-50 opacity-60"
                }`}
              >
                {/* Card header */}
                <div
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
                  onClick={() => !item.skipped && toggleExpand(idx)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {item.customerName ?? "Anonymous"}
                      </span>
                      <StarRow rating={item.rating} />
                      {item.published && (
                        <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                          Published
                        </Badge>
                      )}
                      {item.skipped && (
                        <Badge variant="outline" className="text-xs text-gray-400">
                          Skipped
                        </Badge>
                      )}
                    </div>
                    {item.reviewText && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {item.reviewText}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!item.skipped && !item.published && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleKeep(idx); }}
                        className={`text-xs rounded px-2 py-0.5 border transition-colors ${
                          item.kept
                            ? "bg-violet-100 border-violet-300 text-violet-700"
                            : "bg-gray-100 border-gray-300 text-gray-500"
                        }`}
                      >
                        {item.kept ? "Include" : "Skip"}
                      </button>
                    )}
                    {!item.skipped && (
                      item.expanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded draft editor */}
                {item.expanded && !item.skipped && (
                  <div className="px-3 pb-3 space-y-2 border-t border-dashed border-gray-200 pt-2">
                    <p className="text-xs font-medium text-violet-700 flex items-center gap-1">
                      <Sparkles size={11} />
                      AI Draft — edit before publishing
                    </p>
                    <Textarea
                      value={item.editedText}
                      onChange={(e) => updateText(idx, e.target.value)}
                      rows={4}
                      maxLength={5000}
                      disabled={item.published}
                      className="text-sm"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {item.editedText.length}/5000
                      </span>
                      {!item.published && item.kept && item.responseId && (
                        <Button
                          size="sm"
                          onClick={() => publishOne(idx)}
                          disabled={item.publishing || !item.editedText.trim()}
                          className="gap-1.5"
                        >
                          {item.publishing ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Send size={13} />
                          )}
                          Publish to Google
                        </Button>
                      )}
                      {item.published && (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle2 size={13} />
                          Published
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Done — nothing to generate */}
        {phase === "done" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 size={36} className="text-emerald-500" />
            <p className="font-medium text-gray-700">All caught up!</p>
            <p className="text-sm text-muted-foreground">
              Every unanswered review already has a draft. Open individual reviews to publish them.
            </p>
          </div>
        )}

        {/* Footer actions */}
        {(phase === "review") && items.length > 0 && (
          <div className="shrink-0 border-t pt-3 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {publishedCount > 0
                ? `${publishedCount} published`
                : `${keptCount} draft${keptCount !== 1 ? "s" : ""} ready`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleClose}>
                {allPublished ? "Done" : "Close — save drafts for later"}
              </Button>
              {!allPublished && keptCount > 0 && (
                <Button
                  size="sm"
                  onClick={publishAll}
                  className="gap-1.5 bg-violet-600 hover:bg-violet-700"
                >
                  <Send size={13} />
                  Publish All ({keptCount})
                </Button>
              )}
            </div>
          </div>
        )}

        {(phase === "idle" || phase === "done") && (
          <div className="shrink-0 border-t pt-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleClose}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
