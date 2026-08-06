import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, ThumbsUp, ThumbsDown, Minus, Quote, RefreshCw, Clock } from "lucide-react";
import axios from "axios";
import { format, formatDistanceToNow } from "date-fns";

function extractApiErrorMessage(err: any): string {
  return (
    err?.response?.data?.message ||
    err?.message ||
    "Couldn't run the analysis. Please try again."
  );
}

interface Theme {
  name: string;
  sentiment: "positive" | "neutral" | "negative";
  count: number;
  examples: string[];
}

interface SentimentResult {
  themes:      Theme[];
  reviewCount: number;
  generatedAt: string | null;
  cached:      boolean;
}

interface ReviewSentimentDashboardProps {
  storeId: number;
}

const SENTIMENT_CONFIG = {
  positive: {
    label:     "Positive",
    icon:      ThumbsUp,
    bar:       "bg-emerald-500",
    badge:     "bg-emerald-100 text-emerald-700 border-emerald-200",
    ring:      "border-emerald-200",
    bg:        "bg-emerald-50/60",
    iconColor: "text-emerald-500",
  },
  neutral: {
    label:     "Neutral",
    icon:      Minus,
    bar:       "bg-amber-400",
    badge:     "bg-amber-100 text-amber-700 border-amber-200",
    ring:      "border-amber-200",
    bg:        "bg-amber-50/40",
    iconColor: "text-amber-500",
  },
  negative: {
    label:     "Needs attention",
    icon:      ThumbsDown,
    bar:       "bg-red-400",
    badge:     "bg-red-100 text-red-700 border-red-200",
    ring:      "border-red-200",
    bg:        "bg-red-50/40",
    iconColor: "text-red-500",
  },
} as const;

export function ReviewSentimentDashboard({ storeId }: ReviewSentimentDashboardProps) {
  const queryClient = useQueryClient();
  const [analysing, setAnalysing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // ── Load cached result on mount ──────────────────────────────────────────
  const { data: cached, isLoading: cacheLoading } = useQuery<SentimentResult | null>({
    queryKey: ["review-sentiment", storeId],
    queryFn:  async () => {
      try {
        const res = await axios.get(`/api/google-business/reviews-sentiment/${storeId}`);
        return res.data as SentimentResult;
      } catch (err: any) {
        if (err?.response?.status === 404) return null; // no analysis yet
        throw err;
      }
    },
    staleTime: Infinity, // we manage freshness manually via the Re-analyse button
    retry:     false,
  });

  // ── Run fresh analysis ────────────────────────────────────────────────────
  const analyse = async () => {
    try {
      setAnalysing(true);
      setError(null);
      const res = await axios.post(`/api/google-business/reviews-sentiment/${storeId}`);
      // Populate the query cache with the new result so the UI updates immediately
      queryClient.setQueryData(["review-sentiment", storeId], res.data as SentimentResult);
    } catch (err: any) {
      setError(extractApiErrorMessage(err));
    } finally {
      setAnalysing(false);
    }
  };

  const result   = cached;
  const hasData  = result && result.themes.length > 0;
  const maxCount = hasData ? Math.max(...result.themes.map((t) => t.count), 1) : 1;

  // ── Generated-at label ────────────────────────────────────────────────────
  const generatedLabel = result?.generatedAt
    ? (() => {
        const d = new Date(result.generatedAt);
        const ago = formatDistanceToNow(d, { addSuffix: true });
        const abs = format(d, "MMM d, yyyy 'at' h:mm a");
        return `Generated ${ago} (${abs})`;
      })()
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-violet-500" />
            <CardTitle className="text-sm font-semibold">Review Themes &amp; Sentiment</CardTitle>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={analyse}
            disabled={analysing || cacheLoading}
            className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50 text-xs"
          >
            {analysing ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Analysing…
              </>
            ) : result ? (
              <>
                <RefreshCw size={13} />
                Re-analyse
              </>
            ) : (
              <>
                <Sparkles size={13} />
                Analyse Reviews
              </>
            )}
          </Button>
        </div>

        {/* Sub-line: generated timestamp when available, otherwise description */}
        <CardDescription className="text-xs flex items-center gap-1.5">
          {generatedLabel ? (
            <>
              <Clock size={11} className="text-muted-foreground shrink-0" />
              <span>{generatedLabel}</span>
            </>
          ) : (
            "AI reads all your reviews and categorises them by topic and sentiment."
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {/* Loading cache on mount */}
        {cacheLoading && (
          <div className="flex items-center gap-2 py-6 justify-center text-sm text-violet-600">
            <Loader2 size={16} className="animate-spin" />
            Loading saved analysis…
          </div>
        )}

        {/* Running fresh analysis */}
        {analysing && (
          <div className="flex items-center gap-2 py-6 justify-center text-sm text-violet-600">
            <Loader2 size={16} className="animate-spin" />
            Reading through your reviews…
          </div>
        )}

        {/* No data yet (cache miss + not running) */}
        {!cacheLoading && !analysing && !result && !error && (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <div className="rounded-full bg-violet-100 p-3">
              <Sparkles size={22} className="text-violet-500" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700">Discover what clients talk about most</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Click "Analyse Reviews" to see a breakdown of recurring themes — staff, service quality,
                wait times, and more. The result is saved so you won't need to run it again.
              </p>
            </div>
          </div>
        )}

        {/* Result exists but no themes (too few reviews) */}
        {!cacheLoading && !analysing && result && result.themes.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Not enough review text to identify themes yet. Try again after more reviews come in.
          </p>
        )}

        {/* Theme cards */}
        {!analysing && hasData && (
          <div className="grid gap-3 sm:grid-cols-2">
            {result.themes.map((theme) => {
              const config   = SENTIMENT_CONFIG[theme.sentiment] ?? SENTIMENT_CONFIG.neutral;
              const Icon     = config.icon;
              const barWidth = Math.round((theme.count / maxCount) * 100);

              return (
                <div
                  key={theme.name}
                  className={`rounded-lg border ${config.ring} ${config.bg} p-3.5 space-y-2.5`}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon size={13} className={`${config.iconColor} shrink-0`} />
                      <span className="text-sm font-semibold text-gray-800 truncate">{theme.name}</span>
                    </div>
                    <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 shrink-0 ${config.badge}`}>
                      {config.label}
                    </span>
                  </div>

                  {/* Mention bar */}
                  <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Mentions</span>
                      <span className="font-medium">{theme.count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${config.bar} rounded-full transition-all duration-500`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>

                  {/* Example quotes */}
                  {theme.examples && theme.examples.length > 0 && (
                    <div className="space-y-1">
                      {theme.examples.slice(0, 2).map((ex, i) => (
                        <p key={i} className="text-[11px] text-gray-500 flex items-start gap-1 leading-snug">
                          <Quote size={9} className="text-gray-400 mt-0.5 shrink-0" />
                          <span className="italic line-clamp-2">{ex}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer note */}
        {!analysing && hasData && (
          <p className="text-[10px] text-muted-foreground text-center pt-1">
            AI-generated summary — review manually before acting on insights.
            Covers {result.reviewCount} review{result.reviewCount !== 1 ? "s" : ""}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
