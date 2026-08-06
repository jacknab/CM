import { useState, useCallback, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Upload, CheckCircle2, Clock, XCircle, RefreshCw, AlertTriangle,
  ChevronRight, ArrowLeft, FileText, Users, Calendar, Package,
  Gift, Loader2, RotateCcw, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TransferJob {
  id: number;
  mode: string;
  status: string;
  source_platform: string;
  files_json: Array<{ type: string; name: string; rows: number }>;
  imported_counts_json: Record<string, number>;
  errors_json: any[];
  reject_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Platform definitions ────────────────────────────────────────────────────

const PLATFORMS = [
  { id: "vagaro",       label: "Vagaro",          color: "bg-purple-500", emoji: "💜" },
  { id: "glossgenius",  label: "GlossGenius",     color: "bg-rose-500",   emoji: "🌸" },
  { id: "square",       label: "Square",           color: "bg-blue-500",   emoji: "⬛" },
  { id: "mindbody",     label: "Mindbody",         color: "bg-green-600",  emoji: "🧠" },
  { id: "fresha",       label: "Fresha",           color: "bg-teal-500",   emoji: "🌿" },
  { id: "booksy",       label: "Booksy",           color: "bg-amber-500",  emoji: "📅" },
  { id: "csv",          label: "CSV / Excel",      color: "bg-slate-500",  emoji: "📊" },
  { id: "other",        label: "Other",            color: "bg-gray-500",   emoji: "📁" },
];

const DATA_TYPES = [
  { id: "clients",      label: "Clients",          icon: Users,      required: true,  selfService: true  },
  { id: "appointments", label: "Appointment History", icon: Calendar, required: false, selfService: false },
  { id: "services",     label: "Services",         icon: Sparkles,   required: false, selfService: false },
  { id: "products",     label: "Products",         icon: Package,    required: false, selfService: false },
  { id: "giftCards",    label: "Gift Cards",       icon: Gift,       required: false, selfService: false },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending_upload:  { label: "Pending",       className: "bg-gray-100 text-gray-700" },
    pending_review:  { label: "Under Review",  className: "bg-yellow-100 text-yellow-800" },
    approved:        { label: "Approved",      className: "bg-blue-100 text-blue-800" },
    processing:      { label: "Processing…",   className: "bg-blue-100 text-blue-800" },
    completed:       { label: "Completed",     className: "bg-green-100 text-green-700" },
    failed:          { label: "Failed",        className: "bg-red-100 text-red-700" },
    rolled_back:     { label: "Rolled Back",   className: "bg-gray-100 text-gray-500" },
  };
  const { label, className } = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", className)}>{label}</span>;
}

// ─── Drop zone ───────────────────────────────────────────────────────────────

function DropZone({
  label, icon: Icon, file, onChange, accept,
}: {
  label: string;
  icon: React.ElementType;
  file: File | null;
  onChange: (f: File | null) => void;
  accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onChange(f);
  }, [onChange]);

  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all flex items-center gap-3",
        dragging ? "border-indigo-400 bg-indigo-50/50" : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30",
        file && "border-green-400 bg-green-50/40",
      )}
    >
      <input
        ref={ref}
        type="file"
        accept={accept ?? ".csv,.xlsx,.xls"}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", file ? "bg-green-100" : "bg-gray-100")}>
        {file ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Icon className="w-5 h-5 text-gray-500" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-500 truncate">{file ? file.name : "Drop a CSV or Excel file"}</p>
      </div>
      {file && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(null); }}
          className="text-gray-400 hover:text-red-500 text-sm px-1"
        >✕</button>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function DataTransferPage() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<"history" | "platform" | "upload" | "preview" | "submit" | "done">("history");
  const [platform, setPlatform] = useState("csv");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [preview, setPreview] = useState<Record<string, any>>({});
  const [mode, setMode] = useState<"self_service" | "concierge">("self_service");
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Fetch job history ──
  const { data: jobs = [], refetch: refetchJobs } = useQuery<TransferJob[]>({
    queryKey: ["data-transfer-jobs", storeId],
    queryFn: async () => {
      if (!storeId) return [];
      const r = await fetch(`/api/data-transfer/jobs?storeId=${storeId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!storeId,
  });

  // ── Fetch active job ──
  const { data: activeJob } = useQuery<TransferJob>({
    queryKey: ["data-transfer-job", activeJobId],
    queryFn: async () => {
      const r = await fetch(`/api/data-transfer/jobs/${activeJobId}`, { credentials: "include" });
      return r.json();
    },
    enabled: !!activeJobId,
  });

  // ── WS push: invalidate queries when job status changes ──
  useEffect(() => {
    const onJobStatusUpdated = () => {
      qc.invalidateQueries({ queryKey: ["data-transfer-jobs", storeId] });
      if (activeJobId) qc.invalidateQueries({ queryKey: ["data-transfer-job", activeJobId] });
    };
    window.addEventListener("job-status-updated", onJobStatusUpdated);
    return () => window.removeEventListener("job-status-updated", onJobStatusUpdated);
  }, [storeId, activeJobId, qc]);

  // ── Rollback mutation ──
  const rollbackMutation = useMutation({
    mutationFn: async (jobId: number) => {
      const r = await fetch(`/api/data-transfer/jobs/${jobId}/rollback`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error);
    },
    onSuccess: () => {
      toast({ title: "Import rolled back", description: "All imported records have been removed." });
      refetchJobs();
    },
    onError: (e: Error) => toast({ title: "Rollback failed", description: e.message, variant: "destructive" }),
  });

  const hasFiles = Object.values(files).some(Boolean);
  const hasOnlyClients = Object.entries(files).filter(([, f]) => f).every(([k]) => k === "clients");

  // ── Step: Upload & Preview ──
  const handlePreview = async () => {
    if (!hasFiles) return;
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("platform", platform);
      for (const [type, file] of Object.entries(files)) {
        if (file) fd.append(type, file);
      }
      const r = await fetch("/api/data-transfer/upload", { method: "POST", credentials: "include", body: fd });
      if (!r.ok) throw new Error("Upload failed");
      const data = await r.json();
      setPreview(data.preview);
      setMode(hasOnlyClients ? "self_service" : "concierge");
      setStep("preview");
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  // ── Step: Submit / execute ──
  const handleSubmit = async () => {
    if (!storeId) return;
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("storeId", String(storeId));
      fd.append("platform", platform);
      fd.append("mode", mode);
      for (const [type, file] of Object.entries(files)) {
        if (file) fd.append(type, file);
      }
      const r = await fetch("/api/data-transfer/start", { method: "POST", credentials: "include", body: fd });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      const { jobId } = await r.json();

      if (mode === "self_service") {
        const ex = await fetch(`/api/data-transfer/jobs/${jobId}/execute`, { method: "POST", credentials: "include" });
        if (!ex.ok) throw new Error((await ex.json()).error ?? "Import failed");
      }

      setActiveJobId(jobId);
      qc.invalidateQueries({ queryKey: ["data-transfer-jobs", storeId] });
      setStep("done");
    } catch (e: any) {
      toast({ title: "Transfer failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setStep("history");
    setFiles({});
    setPreview({});
    setPlatform("csv");
    setActiveJobId(null);
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          {step !== "history" && (
            <button onClick={() => setStep(step === "preview" ? "upload" : step === "upload" ? "platform" : step === "platform" ? "history" : "history")} className="text-gray-400 hover:text-gray-700">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Free Data Transfer</h1>
            <p className="text-sm text-gray-500">Move your existing data to Certxa — free, fast, and reversible.</p>
          </div>
        </div>

        {/* Step: History */}
        {step === "history" && (
          <div className="space-y-4">
            <Button
              onClick={() => setStep("platform")}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-12 text-base font-semibold rounded-xl"
            >
              <Upload className="w-5 h-5 mr-2" /> Start New Transfer
            </Button>

            {jobs.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Previous transfers</p>
                {jobs.map((job) => (
                  <Card key={job.id} className="border border-gray-200">
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-900 capitalize">{job.source_platform}</span>
                          <StatusBadge status={job.status} />
                          {job.mode === "concierge" && <Badge variant="outline" className="text-xs">Concierge</Badge>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {format(new Date(job.created_at), "MMM d, yyyy h:mm a")}
                        </p>
                        {job.status === "completed" && (
                          <p className="text-xs text-green-600 mt-0.5">
                            {Object.entries(job.imported_counts_json ?? {})
                              .filter(([, v]) => v > 0)
                              .map(([k, v]) => `${v} ${k}`)
                              .join(", ") || "Import complete"}
                          </p>
                        )}
                        {job.reject_reason && (
                          <p className="text-xs text-red-500 mt-0.5">{job.reject_reason}</p>
                        )}
                      </div>
                      {job.status === "completed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => rollbackMutation.mutate(job.id)}
                          disabled={rollbackMutation.isPending}
                        >
                          <RotateCcw className="w-4 h-4 mr-1" /> Undo
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {jobs.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No transfers yet. Start one above.</p>
              </div>
            )}
          </div>
        )}

        {/* Step: Platform selector */}
        {step === "platform" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Which software are you switching from?</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setPlatform(p.id); setStep("upload"); }}
                  className={cn(
                    "rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all text-center",
                    platform === p.id ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50"
                  )}
                >
                  <span className="text-2xl">{p.emoji}</span>
                  <span className="text-sm font-medium text-gray-800">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Upload files */}
        {step === "upload" && (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-gray-800">Upload your exported files</p>
              <p className="text-xs text-gray-500 mt-1">
                Upload as many files as you have. Client-only imports are instant.
                Uploading appointments, services, or products adds a 24-hour review step.
              </p>
            </div>

            <div className="space-y-3">
              {DATA_TYPES.map(({ id, label, icon }) => (
                <DropZone
                  key={id}
                  label={label}
                  icon={icon}
                  file={files[id] ?? null}
                  onChange={(f) => setFiles((prev) => ({ ...prev, [id]: f }))}
                />
              ))}
            </div>

            {!hasFiles && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Upload at least one file to continue.
              </p>
            )}

            <Button
              disabled={!hasFiles || isUploading}
              onClick={handlePreview}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11"
            >
              {isUploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing…</> : <>Continue <ChevronRight className="w-4 h-4 ml-1" /></>}
            </Button>
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-gray-800">Review your data</p>
              <p className="text-xs text-gray-500 mt-1">Here's a summary of what we found in your files.</p>
            </div>

            <div className="space-y-3">
              {Object.entries(preview).map(([dataType, info]: [string, any]) => {
                const def = DATA_TYPES.find((d) => d.id === dataType);
                const Icon = def?.icon ?? FileText;
                return (
                  <Card key={dataType} className="border border-gray-200">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-medium text-sm text-gray-900 capitalize">{dataType}</p>
                          <p className="text-xs text-gray-500">{info.totalRows} records detected</p>
                        </div>
                      </div>
                      {info.sample?.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border border-gray-100">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50">
                                {info.headers?.slice(0, 5).map((h: string) => (
                                  <th key={h} className="px-2 py-1.5 text-left font-medium text-gray-600 truncate max-w-[100px]">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {info.sample.slice(0, 3).map((row: any, i: number) => (
                                <tr key={i} className="border-t border-gray-100">
                                  {info.headers?.slice(0, 5).map((h: string) => (
                                    <td key={h} className="px-2 py-1.5 text-gray-700 truncate max-w-[100px]">{String(row[h] ?? "")}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Mode explanation */}
            <Card className={cn("border-2", mode === "self_service" ? "border-green-400 bg-green-50/40" : "border-amber-300 bg-amber-50/40")}>
              <CardContent className="p-4 flex items-start gap-3">
                {mode === "self_service"
                  ? <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  : <Clock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                }
                <div>
                  <p className="font-semibold text-sm text-gray-900">
                    {mode === "self_service" ? "Ready to import now" : "Requires a 24-hour review"}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {mode === "self_service"
                      ? "Clients will be imported instantly. You can undo this at any time."
                      : "Your full data package will be reviewed by the Certxa team and imported within 24 hours. You'll be notified when it's done."}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={() => setStep("submit")}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11"
            >
              {mode === "self_service" ? "Import Now" : "Submit for Review"} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Step: Confirm & Submit */}
        {step === "submit" && (
          <div className="space-y-5">
            <Card className="border border-gray-200">
              <CardContent className="p-5 space-y-4">
                <p className="font-semibold text-gray-900">Confirm your transfer</p>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Platform</span>
                    <span className="font-medium capitalize">{platform}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Mode</span>
                    <span className="font-medium">{mode === "self_service" ? "Instant (clients only)" : "Concierge (full transfer)"}</span>
                  </div>
                  {Object.entries(preview).map(([k, v]: [string, any]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-gray-500 capitalize">{k}</span>
                      <span className="font-medium">{v.totalRows} records</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 pt-3 text-xs text-gray-500">
                  ✅ All imported records are fully reversible — click "Undo" anytime on the history page.
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-12 text-base font-semibold"
            >
              {isSubmitting
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {mode === "self_service" ? "Importing…" : "Submitting…"}</>
                : mode === "self_service" ? "Import Clients Now" : "Submit for Review"
              }
            </Button>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="space-y-5">
            {mode === "self_service" ? (
              <Card className="border-2 border-green-400 bg-green-50/40">
                <CardContent className="p-6 text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                  <p className="font-bold text-lg text-gray-900">Import Complete!</p>
                  <p className="text-sm text-gray-600">
                    Your clients have been imported successfully. Find them in your Clients section.
                  </p>
                  {activeJob?.imported_counts_json && (
                    <p className="text-sm font-medium text-green-700">
                      {activeJob.imported_counts_json.clients ?? 0} clients imported
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-2 border-amber-300 bg-amber-50/40">
                <CardContent className="p-6 text-center space-y-3">
                  <Clock className="w-12 h-12 text-amber-500 mx-auto" />
                  <p className="font-bold text-lg text-gray-900">Transfer Submitted!</p>
                  <p className="text-sm text-gray-600">
                    The Certxa team will review and import your data within 24 hours. We'll notify you when it's complete.
                  </p>
                  {activeJob && (
                    <div className="text-xs text-gray-500 mt-2">
                      Job #{activeJob.id} — <StatusBadge status={activeJob.status} />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={reset} className="flex-1">
                <RefreshCw className="w-4 h-4 mr-2" /> Start Another
              </Button>
              <Button onClick={() => window.location.href = "/clients"} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white">
                Go to Clients
              </Button>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
