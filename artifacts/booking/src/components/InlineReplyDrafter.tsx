import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  Loader2,
  Send,
  X,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import axios from "axios";
import { cn } from "@/lib/utils";

interface InlineReplyDrafterProps {
  storeId: number;
  googleReviewId: number;
  reviewText: string | null;
  rating: number;
  customerName: string | null;
  onDraftSaved: () => void;
  onClose: () => void;
}

type Status = "idle" | "generating" | "error" | "picking" | "editing" | "saving" | "publishing" | "done";

export function InlineReplyDrafter({
  storeId,
  googleReviewId,
  reviewText,
  rating,
  customerName,
  onDraftSaved,
  onClose,
}: InlineReplyDrafterProps) {
  const [status, setStatus] = useState<Status>("generating");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  // Kick off generation immediately on mount
  React.useEffect(() => {
    generate();
  }, []);

  async function generate() {
    setStatus("generating");
    setError(null);
    setSuggestions([]);
    setText("");
    setSavedId(null);
    try {
      const res = await axios.post(`/api/google-business/suggest-reply/${storeId}`, {
        reviewText,
        rating,
        customerName,
      });
      const list: string[] = res.data.suggestions ?? [];
      if (list.length === 0) throw new Error("No suggestions returned");
      setSuggestions(list);
      setStatus("picking");
    } catch (err) {
      console.error(err);
      setError("Couldn't generate suggestions — please try again.");
      setStatus("error");
    }
  }

  function pickSuggestion(s: string) {
    setText(s);
    setStatus("editing");
  }

  async function saveDraft(andPublish = false) {
    if (!text.trim()) return;
    setStatus(andPublish ? "publishing" : "saving");
    try {
      const saveRes = await axios.post("/api/google-business/review-response", {
        googleReviewId,
        storeId,
        responseText: text.trim(),
      });
      const newId: number = saveRes.data.id;
      setSavedId(newId);

      if (andPublish) {
        await axios.post(`/api/google-business/review-response/${newId}/publish`);
      }

      setStatus("done");
      onDraftSaved();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Failed to save draft";
      setError(msg);
      setStatus("editing");
    }
  }

  if (status === "done") {
    return (
      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
          <CheckCircle2 size={15} />
          {savedId ? "Response saved as draft" : "Done"}
        </div>
        <button className="text-xs text-emerald-600 underline" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-violet-700">
          <Sparkles size={12} />
          AI reply suggestions
        </span>
        <button
          onClick={onClose}
          className="text-violet-400 hover:text-violet-600 transition-colors"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Generating spinner */}
      {status === "generating" && (
        <div className="flex items-center gap-2 py-2 text-sm text-violet-600">
          <Loader2 size={14} className="animate-spin" />
          Writing 3 suggestions for this review…
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle size={14} />
            {error}
          </div>
          <Button size="sm" variant="outline" onClick={generate} className="gap-1.5">
            <Sparkles size={12} />
            Try again
          </Button>
        </div>
      )}

      {/* Suggestion picker */}
      {status === "picking" && suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-violet-600">Pick one to use — you can edit it before saving:</p>
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pickSuggestion(s)}
              className="w-full text-left rounded-md border border-violet-200 bg-white px-3 py-2.5 text-sm text-gray-700 hover:border-violet-400 hover:bg-violet-50 transition-colors group relative"
            >
              <p className="pr-16 leading-relaxed">{s}</p>
              <span className="absolute right-2.5 top-2.5 text-xs font-medium text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity bg-violet-100 rounded px-1.5 py-0.5">
                Use this
              </span>
            </button>
          ))}
          <button
            className="text-xs text-violet-500 underline flex items-center gap-1"
            onClick={generate}
          >
            <ChevronDown size={11} />
            Generate different suggestions
          </button>
        </div>
      )}

      {/* Editing + save */}
      {(status === "editing" || status === "saving" || status === "publishing") && (
        <div className="space-y-2">
          {suggestions.length > 0 && (
            <button
              className="text-xs text-violet-500 underline"
              onClick={() => setStatus("picking")}
            >
              ← Back to suggestions
            </button>
          )}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Edit your reply here…"
            className="text-sm resize-none"
            autoFocus
          />
          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle size={12} /> {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{text.length}/5000</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveDraft(false)}
                disabled={!text.trim() || status === "saving" || status === "publishing"}
                className={cn(
                  "gap-1.5",
                  status === "saving" && "opacity-70"
                )}
              >
                {status === "saving" ? (
                  <><Loader2 size={13} className="animate-spin" />Saving…</>
                ) : (
                  "Save as Draft"
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => saveDraft(true)}
                disabled={!text.trim() || status === "saving" || status === "publishing"}
                className={cn(
                  "gap-1.5",
                  status === "publishing" && "opacity-70"
                )}
              >
                {status === "publishing" ? (
                  <><Loader2 size={13} className="animate-spin" />Publishing…</>
                ) : (
                  <><Send size={13} />Save & Publish</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
