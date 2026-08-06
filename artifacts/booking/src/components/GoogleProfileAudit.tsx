/**
 * GoogleProfileAudit
 *
 * Shows a Google Business Profile "completion assistant":
 *  - Reads what Google already has (live API call on the backend)
 *  - Shows a completion % bar
 *  - Lists each gap with a per-field "Fill in" action
 *  - Description: AI-generate a draft → owner edits → push
 *  - Booking URL conflict: warn + confirm before replacing
 *
 * Fill policy (product spec):
 *  - Fill if empty:     hours, services, bookingUrl, description
 *  - Conflict warning:  bookingUrl when Google already has a different URL
 *  - Never auto-push:   businessName, address, phone, categories, photos
 *  - Suggestion only:   categories (user acts on Google themselves)
 */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Info,
  AlertTriangle,
} from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type GapStatus = "ok" | "missing" | "conflict" | "suggest";

interface Gap {
  field:        string;
  label:        string;
  status:       GapStatus;
  description:  string;
  certxaValue?: string;
  googleValue?: string;
  canAutoFill:  boolean;
}

interface AuditResult {
  completionPct:  number;
  completedCount: number;
  totalFields:    number;
  gaps:           Gap[];
  certxaData: {
    bookingUrl:    string;
    storeName:     string;
    serviceCount:  number;
  };
}

interface Props {
  storeId: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: GapStatus }) {
  switch (status) {
    case "ok":
      return <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs gap-1">
        <CheckCircle2 size={11} /> Complete
      </Badge>;
    case "missing":
      return <Badge className="bg-amber-100 text-amber-700 border-0 text-xs gap-1">
        <Clock size={11} /> Missing
      </Badge>;
    case "conflict":
      return <Badge className="bg-orange-100 text-orange-700 border-0 text-xs gap-1">
        <AlertTriangle size={11} /> Conflict
      </Badge>;
    case "suggest":
      return <Badge className="bg-blue-100 text-blue-700 border-0 text-xs gap-1">
        <Info size={11} /> Suggestion
      </Badge>;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export function GoogleProfileAudit({ storeId }: Props) {
  const { toast }      = useToast();
  const queryClient    = useQueryClient();
  const auditKey       = ["gbp-profile-audit", storeId];

  // Per-field UI state
  const [fillingField,  setFillingField]  = useState<string | null>(null);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [draftDesc,     setDraftDesc]     = useState<string>("");
  const [showDescEditor, setShowDescEditor] = useState(false);
  const [conflictField, setConflictField] = useState<{ googleValue: string; certxaValue: string } | null>(null);
  const [dismissedConflict, setDismissedConflict] = useState(false);
  const [filledFields, setFilledFields]   = useState<Set<string>>(new Set());

  // ── Audit query ─────────────────────────────────────────────────────────────
  const { data: audit, isLoading, isError, error, refetch, isFetching } =
    useQuery<AuditResult>({
      queryKey: auditKey,
      queryFn:  async () => {
        const res = await axios.get(
          `/api/google-business/profile-audit?storeId=${storeId}`
        );
        return res.data;
      },
      retry: false,
      staleTime: 0,
    });

  // ── Fill gap mutation ────────────────────────────────────────────────────────
  const fillGap = async (
    field: string,
    extra: { description?: string; replaceExisting?: boolean } = {}
  ) => {
    setFillingField(field);
    try {
      await axios.post("/api/google-business/fill-gap", {
        storeId,
        field,
        ...extra,
      });
      toast({ title: "Pushed to Google ✓", description: `${field} updated on your listing.` });
      setFilledFields(prev => new Set(prev).add(field));
      if (field === "description") setShowDescEditor(false);
      await refetch();
    } catch (err: any) {
      // Booking URL conflict
      if (err?.response?.status === 409) {
        setConflictField({
          googleValue: err.response.data.existingUrl,
          certxaValue: err.response.data.certxaUrl,
        });
        setFillingField(null);
        return;
      }
      const msg = err?.response?.data?.message ?? err.message ?? "Something went wrong.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setFillingField(null);
    }
  };

  // ── Generate description ────────────────────────────────────────────────────
  const generateDescription = async () => {
    setGeneratingDesc(true);
    try {
      const res = await axios.post("/api/google-business/generate-description", { storeId });
      setDraftDesc(res.data.description ?? "");
      setShowDescEditor(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err.message ?? "Could not generate description.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setGeneratingDesc(false);
    }
  };

  // ── Fill all auto-fillable gaps ─────────────────────────────────────────────
  const fillAll = async () => {
    if (!audit) return;
    const fillable = audit.gaps.filter(
      g => g.canAutoFill && g.status !== "ok" && g.field !== "description"
    );
    for (const gap of fillable) {
      await fillGap(gap.field);
    }
  };

  // ── Loading / Error states ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
        <Loader2 className="animate-spin" size={22} />
        <span className="text-sm">Checking your Google listing…</span>
      </div>
    );
  }

  if (isError) {
    const errMsg = (error as any)?.response?.data?.message ?? (error as any)?.message ?? "Unknown error";
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 flex items-start gap-3">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold mb-0.5">Couldn't fetch your Google listing</p>
          <p className="text-red-600">{errMsg}</p>
          <Button size="sm" variant="outline" className="mt-3 text-xs h-7" onClick={() => refetch()}>
            <RefreshCw size={12} className="mr-1" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!audit) return null;

  const { completionPct, completedCount, totalFields, gaps } = audit;
  const autoFillableGaps = gaps.filter(g => g.canAutoFill && g.status !== "ok" && g.field !== "description");
  const hasAnyFillable   = autoFillableGaps.length > 0;

  return (
    <div className="space-y-4">

      {/* ── Completion header ───────────────────────────────────────────── */}
      <div className="rounded-xl border bg-gradient-to-br from-slate-50 to-blue-50/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">Profile Completion</p>
            <p className="text-xs text-muted-foreground">
              {completedCount} of {totalFields} sections complete
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-slate-800">{completionPct}%</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-200 rounded-full h-2">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>

        {/* Fill-all button */}
        {hasAnyFillable && (
          <Button
            size="sm"
            className="mt-3 h-8 text-xs bg-blue-600 hover:bg-blue-700"
            onClick={fillAll}
            disabled={!!fillingField}
          >
            {fillingField ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Sparkles size={12} className="mr-1.5" />}
            Fill in {autoFillableGaps.length} gap{autoFillableGaps.length > 1 ? "s" : ""} automatically
          </Button>
        )}

        {completionPct === 100 && (
          <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle2 size={12} /> Your profile looks great!
          </p>
        )}
      </div>

      {/* ── Gap cards ────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {gaps.map(gap => (
          <GapCard
            key={gap.field}
            gap={gap}
            isFilling={fillingField === gap.field}
            isFilledThisSession={filledFields.has(gap.field)}
            // Description-specific
            showDescEditor={gap.field === "description" && showDescEditor}
            draftDesc={draftDesc}
            setDraftDesc={setDraftDesc}
            generatingDesc={generatingDesc && gap.field === "description"}
            onGenerateDesc={generateDescription}
            onPushDesc={() => fillGap("description", { description: draftDesc })}
            // Booking URL conflict
            conflictInfo={gap.field === "bookingUrl" ? conflictField : null}
            dismissedConflict={dismissedConflict}
            onDismissConflict={() => setDismissedConflict(true)}
            // Fill action
            onFill={(opts) => fillGap(gap.field, opts)}
          />
        ))}
      </div>

    </div>
  );
}

// ── GapCard subcomponent ──────────────────────────────────────────────────────

interface GapCardProps {
  gap:                    Gap;
  isFilling:              boolean;
  isFilledThisSession:    boolean;
  showDescEditor:         boolean;
  draftDesc:              string;
  setDraftDesc:           (v: string) => void;
  generatingDesc:         boolean;
  onGenerateDesc:         () => void;
  onPushDesc:             () => void;
  conflictInfo:           { googleValue: string; certxaValue: string } | null;
  dismissedConflict:      boolean;
  onDismissConflict:      () => void;
  onFill:                 (opts?: { replaceExisting?: boolean }) => void;
}

function GapCard({
  gap,
  isFilling,
  isFilledThisSession,
  showDescEditor,
  draftDesc,
  setDraftDesc,
  generatingDesc,
  onGenerateDesc,
  onPushDesc,
  conflictInfo,
  dismissedConflict,
  onDismissConflict,
  onFill,
}: GapCardProps) {

  const isOk = gap.status === "ok" || isFilledThisSession;

  return (
    <div className={`rounded-lg border px-4 py-3 transition-colors ${
      isOk
        ? "border-emerald-200 bg-emerald-50/40"
        : gap.status === "conflict"
          ? "border-orange-200 bg-orange-50/30"
          : gap.status === "suggest"
            ? "border-blue-100 bg-blue-50/30"
            : "border-gray-200 bg-white"
    }`}>

      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isOk
            ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            : gap.status === "conflict"
              ? <AlertTriangle size={15} className="text-orange-500 shrink-0" />
              : gap.status === "suggest"
                ? <Info size={15} className="text-blue-500 shrink-0" />
                : <Clock size={15} className="text-amber-500 shrink-0" />
          }
          <span className="text-sm font-medium text-slate-800 truncate">{gap.label}</span>
          <StatusBadge status={isFilledThisSession ? "ok" : gap.status} />
        </div>

        {/* Action button — skip if OK or categories (suggestion only) */}
        {!isOk && gap.field !== "categories" && (
          <div className="shrink-0">
            {/* Description: AI generate */}
            {gap.field === "description" && !showDescEditor && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
                onClick={onGenerateDesc}
                disabled={generatingDesc}
              >
                {generatingDesc
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Sparkles size={11} />}
                Generate with AI
              </Button>
            )}

            {/* Booking URL conflict: two buttons */}
            {gap.field === "bookingUrl" && gap.status === "conflict" && !dismissedConflict && conflictInfo && (
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-slate-300"
                  onClick={onDismissConflict}
                >
                  Keep existing
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                  onClick={() => onFill({ replaceExisting: true })}
                  disabled={isFilling}
                >
                  {isFilling ? <Loader2 size={11} className="animate-spin mr-1" /> : null}
                  Replace with Certxa
                </Button>
              </div>
            )}

            {/* Standard fill button */}
            {!(gap.field === "description") &&
             !(gap.field === "bookingUrl" && gap.status === "conflict" && !dismissedConflict && conflictInfo) &&
             gap.canAutoFill && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={() => onFill()}
                disabled={isFilling}
              >
                {isFilling
                  ? <Loader2 size={11} className="animate-spin" />
                  : <ChevronRight size={11} />}
                Fill in
              </Button>
            )}
          </div>
        )}

        {/* Category: link to Google */}
        {gap.field === "categories" && gap.status === "suggest" && (
          <a
            href="https://business.google.com/locations"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0"
          >
            Open Google <ExternalLink size={11} />
          </a>
        )}
      </div>

      {/* Description text */}
      <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{gap.description}</p>

      {/* Certxa value hint */}
      {gap.certxaValue && !isOk && (
        <p className="text-xs text-slate-500 mt-1">
          <span className="font-medium">Certxa: </span>{gap.certxaValue}
        </p>
      )}

      {/* Conflict detail panel */}
      {gap.field === "bookingUrl" && gap.status === "conflict" && !dismissedConflict && conflictInfo && (
        <div className="mt-2 rounded-md bg-orange-50 border border-orange-200 p-2.5 space-y-1 text-xs">
          <p className="text-orange-800">
            <span className="font-semibold">On Google: </span>
            <a
              href={conflictInfo.googleValue}
              target="_blank"
              rel="noreferrer"
              className="underline break-all"
            >
              {conflictInfo.googleValue}
            </a>
          </p>
          <p className="text-orange-800">
            <span className="font-semibold">Certxa link: </span>
            <span className="break-all">{conflictInfo.certxaValue}</span>
          </p>
        </div>
      )}

      {/* Description AI editor */}
      {gap.field === "description" && showDescEditor && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-slate-700">
            Review and edit the AI-generated draft, then push it to Google:
          </p>
          <Textarea
            value={draftDesc}
            onChange={e => setDraftDesc(e.target.value)}
            rows={5}
            className="text-sm resize-none"
            placeholder="Your business description…"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={onGenerateDesc}
              disabled={generatingDesc}
            >
              {generatingDesc
                ? <Loader2 size={11} className="animate-spin mr-1" />
                : <RefreshCw size={11} className="mr-1" />}
              Regenerate
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
              onClick={onPushDesc}
              disabled={!draftDesc.trim() || isFilling}
            >
              {isFilling
                ? <Loader2 size={11} className="animate-spin mr-1" />
                : null}
              Push to Google
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
