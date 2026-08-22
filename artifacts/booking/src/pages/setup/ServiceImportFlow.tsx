/**
 * /setup/service-import — AI-powered Service Menu Onboarding Flow
 *
 * Steps:
 *  0. entry      – choose path (photos / PDF / manual)
 *  1. upload     – multi-image or PDF upload with tips
 *  2. processing – "Your menu has been received" + polling
 *  3. review     – grouped category view, edit/remove, publish
 *  4. done       – success confirmation
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  FileText,
  PenLine,
  Plus,
  X,
  Check,
  Trash2,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  AlertCircle,
  Edit2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUpdateFlowStatus } from "@/hooks/use-setup-progress";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadedFile {
  file: File;
  previewUrl: string;
}

interface ServiceDraft {
  name: string;
  price: number;
  duration: number;
  description?: string;
}

interface CategoryDraft {
  name: string;
  services: ServiceDraft[];
}

type FlowStep = "entry" | "upload" | "processing" | "review" | "done";
type ImportType = "photos" | "pdf";

// ─── Palette ─────────────────────────────────────────────────────────────────

const PLUM = "#1A0333";
const PLUM_MID = "#3B0764";
const GOLD = "#F59E0B";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(price: number) {
  return `$${Number(price).toFixed(2).replace(/\.00$/, "")}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ServiceImportFlow() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const updateFlow = useUpdateFlowStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<FlowStep>("entry");
  const [importType, setImportType] = useState<ImportType>("photos");

  // Upload state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);

  // Job polling state
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("pending");
  const [jobError, setJobError] = useState<string | null>(null);

  // Review state
  const [categories, setCategories] = useState<CategoryDraft[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [editingService, setEditingService] = useState<{ catIdx: number; svcIdx: number } | null>(null);
  const [editForm, setEditForm] = useState<ServiceDraft>({ name: "", price: 0, duration: 60 });

  // ── File handling ────────────────────────────────────────────────────────────

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(files)) {
      if (uploadedFiles.length + newFiles.length >= 10) break;
      newFiles.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    setUploadedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (idx: number) => {
    setUploadedFiles((prev) => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // ── Upload & submit ──────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (uploadedFiles.length === 0) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("importType", importType);
      for (const uf of uploadedFiles) {
        formData.append("files", uf.file);
      }

      const res = await fetch("/api/service-import/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Upload failed");
      }

      const data = await res.json();
      setJobId(data.jobId);
      setStep("processing");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Upload failed", description: e.message });
    } finally {
      setUploading(false);
    }
  };

  // ── Job polling ──────────────────────────────────────────────────────────────

  const pollJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/service-import/jobs/${jobId}`, { credentials: "include" });
      if (!res.ok) return;
      const { job } = await res.json();
      setJobStatus(job.status);

      if (job.status === "completed" && job.ai_result) {
        const result = typeof job.ai_result === "string" ? JSON.parse(job.ai_result) : job.ai_result;
        setCategories(result.categories ?? []);
        setStep("review");
      } else if (job.status === "failed") {
        setJobError(job.error_message ?? "Processing failed. Please try again.");
      }
    } catch {}
  }, [jobId]);

  useEffect(() => {
    if (step !== "processing" || !jobId) return;
    // Poll every 3 seconds
    const interval = setInterval(pollJob, 3000);
    pollJob(); // immediate first check
    return () => clearInterval(interval);
  }, [step, jobId, pollJob]);

  // ── Review: edit helpers ─────────────────────────────────────────────────────

  const startEdit = (catIdx: number, svcIdx: number) => {
    setEditingService({ catIdx, svcIdx });
    setEditForm({ ...categories[catIdx].services[svcIdx] });
  };

  const saveEdit = () => {
    if (!editingService) return;
    setCategories((prev) =>
      prev.map((cat, ci) =>
        ci === editingService.catIdx
          ? {
              ...cat,
              services: cat.services.map((s, si) =>
                si === editingService.svcIdx ? { ...editForm } : s
              ),
            }
          : cat
      )
    );
    setEditingService(null);
  };

  const removeService = (catIdx: number, svcIdx: number) => {
    setCategories((prev) =>
      prev.map((cat, ci) =>
        ci === catIdx
          ? { ...cat, services: cat.services.filter((_, si) => si !== svcIdx) }
          : cat
      ).filter((cat) => cat.services.length > 0)
    );
  };

  const removeCategory = (catIdx: number) => {
    setCategories((prev) => prev.filter((_, i) => i !== catIdx));
  };

  // ── Publish ──────────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    const nonEmpty = categories.filter((c) => c.services.length > 0);
    if (nonEmpty.length === 0) {
      toast({ variant: "destructive", title: "Nothing to publish", description: "Add at least one service before publishing." });
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch("/api/service-import/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobId, categories: nonEmpty }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Publish failed");
      }

      // Mark flow as complete
      updateFlow.mutate({ flowKey: "services_menu", status: "complete" });
      setStep("done");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Publish failed", description: e.message });
    } finally {
      setPublishing(false);
    }
  };

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const totalServices = categories.reduce((acc, c) => acc + c.services.length, 0);

  // ─── Step: Entry ─────────────────────────────────────────────────────────────

  const renderEntry = () => (
    <div className="max-w-md mx-auto px-4 py-10">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-100 mb-5">
          <Sparkles className="w-8 h-8 text-violet-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Let's build your service menu</h1>
        <p className="text-slate-500 text-sm leading-relaxed">
          Add your salon services so customers can book online.
        </p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {/* Photo option — primary */}
        <button
          onClick={() => { setImportType("photos"); setStep("upload"); }}
          className="w-full flex items-start gap-4 p-5 rounded-2xl border-2 border-violet-500 bg-violet-50 text-left hover:bg-violet-100 transition-colors active:scale-[0.98]"
        >
          <div className="w-12 h-12 rounded-xl bg-violet-500 flex items-center justify-center flex-shrink-0">
            <Camera className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-slate-800">Take photos of your price menu</span>
              <span className="text-xs font-semibold bg-violet-500 text-white px-2 py-0.5 rounded-full">Recommended</span>
            </div>
            <p className="text-sm text-slate-500">
              Snap photos of your price boards and our AI will create your menu automatically.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
        </button>

        {/* PDF option */}
        <button
          onClick={() => { setImportType("pdf"); setStep("upload"); }}
          className="w-full flex items-start gap-4 p-5 rounded-2xl border border-slate-200 bg-white text-left hover:bg-slate-50 transition-colors active:scale-[0.98]"
        >
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-slate-800 block mb-1">Upload a PDF menu</span>
            <p className="text-sm text-slate-500">Upload your existing menu document.</p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0 mt-0.5" />
        </button>

        {/* Manual option */}
        <button
          onClick={() => navigate("/setup/services")}
          className="w-full flex items-start gap-4 p-5 rounded-2xl border border-slate-200 bg-white text-left hover:bg-slate-50 transition-colors active:scale-[0.98]"
        >
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
            <PenLine className="w-6 h-6 text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-slate-800 block mb-1">Create services manually</span>
            <p className="text-sm text-slate-500">Add each service yourself, one at a time.</p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0 mt-0.5" />
        </button>
      </div>
    </div>
  );

  // ─── Step: Upload ─────────────────────────────────────────────────────────────

  const renderUpload = () => {
    const isPhoto = importType === "photos";
    const accept = isPhoto ? "image/jpeg,image/png,image/webp,image/heic,image/heif" : "application/pdf";

    return (
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Back */}
        <button
          onClick={() => { setUploadedFiles([]); setStep("entry"); }}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <h1 className="text-xl font-bold text-slate-900 mb-1">
          {isPhoto ? "📸 Upload price menu photos" : "📄 Upload your PDF menu"}
        </h1>
        <p className="text-slate-500 text-sm mb-6">
          {isPhoto
            ? "You can upload multiple photos — one for each price board (manicures, pedicures, acrylics, add-ons)."
            : "Upload your menu as a PDF and we'll extract the services for you."}
        </p>

        {/* Tips */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-amber-800 mb-2">For best results:</p>
          <ul className="space-y-1">
            {[
              "Make sure all prices are clearly visible",
              "Avoid glare and shadows on the board",
              "Keep the entire menu in the photo",
              "Hold your phone straight and steady",
            ].map((tip) => (
              <li key={tip} className="flex items-start gap-2 text-sm text-amber-700">
                <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                {tip}
              </li>
            ))}
          </ul>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={isPhoto}
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />

        {/* Upload button / drop zone */}
        {uploadedFiles.length === 0 ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-40 border-2 border-dashed border-violet-300 rounded-2xl flex flex-col items-center justify-center gap-3 bg-violet-50 hover:bg-violet-100 transition-colors active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-xl bg-violet-500 flex items-center justify-center">
              {isPhoto ? <Camera className="w-6 h-6 text-white" /> : <FileText className="w-6 h-6 text-white" />}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-violet-700">
                {isPhoto ? "Tap to add photos" : "Tap to select PDF"}
              </p>
              <p className="text-xs text-violet-500 mt-0.5">
                {isPhoto ? "JPEG, PNG, WebP, or HEIC · up to 10 photos" : "PDF · up to 20 MB"}
              </p>
            </div>
          </button>
        ) : (
          <div className="space-y-3">
            {/* Photo previews */}
            <div className="grid grid-cols-2 gap-3">
              {uploadedFiles.map((uf, idx) => (
                <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                  {uf.file.type === "application/pdf" ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3">
                      <FileText className="w-8 h-8 text-slate-400" />
                      <p className="text-xs text-slate-500 text-center break-all leading-tight">
                        {uf.file.name}
                      </p>
                    </div>
                  ) : (
                    <img
                      src={uf.previewUrl}
                      alt={`Menu photo ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <button
                    onClick={() => removeFile(idx)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              ))}

              {/* Add another */}
              {isPhoto && uploadedFiles.length < 10 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors active:scale-[0.98]"
                >
                  <Plus className="w-6 h-6 text-slate-400" />
                  <span className="text-xs text-slate-400 font-medium">Add photo</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Continue button */}
        {uploadedFiles.length > 0 && (
          <div className="mt-6">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full py-4 rounded-2xl font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: PLUM }}
            >
              {uploading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Uploading…
                </span>
              ) : (
                `Continue with ${uploadedFiles.length} ${uploadedFiles.length === 1 ? "file" : "files"}`
              )}
            </button>
          </div>
        )}
      </div>
    );
  };

  // ─── Step: Processing ─────────────────────────────────────────────────────────

  const renderProcessing = () => (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      {jobStatus === "failed" || jobError ? (
        /* Failed */
        <div>
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-3">We couldn't process your menu</h2>
          <p className="text-sm text-slate-500 leading-relaxed mb-6 max-w-sm mx-auto">
            {jobError ?? "We couldn't read your menu from those photos."}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => { setStep("upload"); setUploadedFiles([]); setJobError(null); setJobId(null); }}
              className="w-full py-4 rounded-2xl font-semibold text-white"
              style={{ backgroundColor: PLUM }}
            >
              Try Again
            </button>
            <button
              onClick={() => navigate("/setup/services")}
              className="w-full py-3 rounded-2xl font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Add Services Manually
            </button>
          </div>
        </div>
      ) : (
        /* Processing / pending */
        <div>
          <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-10 h-10 text-violet-500 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-3">Your menu has been received.</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-2">
            Certxa is creating your services in the background.
          </p>
          <p className="text-slate-400 text-sm">
            You can continue setting up your salon — we'll send you an email when it's ready.
          </p>

          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing your menu…
          </div>

          <div className="mt-10 space-y-3">
            <button
              onClick={() => navigate("/setup")}
              className="w-full py-4 rounded-2xl font-semibold text-white"
              style={{ backgroundColor: PLUM }}
            >
              Continue Setup
            </button>
            <p className="text-xs text-slate-400">
              This page will automatically update when your menu is ready.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Step: Review ─────────────────────────────────────────────────────────────

  const renderReview = () => (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Review your service menu</h1>
        </div>
        <p className="text-sm text-slate-500 ml-11">
          {categories.length} categor{categories.length === 1 ? "y" : "ies"} · {totalServices} service{totalServices === 1 ? "" : "s"} found
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-sm mb-4">All services were removed. Add some back or start over.</p>
          <button
            onClick={() => { setStep("entry"); setUploadedFiles([]); setJobId(null); }}
            className="text-sm font-semibold text-violet-600"
          >
            ← Start over
          </button>
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          {categories.map((cat, catIdx) => (
            <div key={catIdx} className="border border-slate-200 rounded-2xl overflow-hidden">
              {/* Category header */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div>
                  <span className="font-semibold text-slate-800">{cat.name}</span>
                  <span className="text-xs text-slate-400 ml-2">({cat.services.length})</span>
                </div>
                <button
                  onClick={() => removeCategory(catIdx)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Remove category"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Services */}
              <div className="divide-y divide-slate-100">
                {cat.services.map((svc, svcIdx) => (
                  <div key={svcIdx}>
                    {editingService?.catIdx === catIdx && editingService?.svcIdx === svcIdx ? (
                      /* Inline edit form */
                      <div className="p-4 bg-violet-50 space-y-3">
                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Service name</label>
                          <input
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                            autoFocus
                          />
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="text-xs font-semibold text-slate-600 block mb-1">Price ($)</label>
                            <input
                              type="number"
                              value={editForm.price}
                              onChange={(e) => setEditForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                              min="0"
                              step="0.01"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs font-semibold text-slate-600 block mb-1">Duration (min)</label>
                            <input
                              type="number"
                              value={editForm.duration}
                              onChange={(e) => setEditForm((f) => ({ ...f, duration: parseInt(e.target.value) || 60 }))}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                              min="5"
                              step="5"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={saveEdit}
                            className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingService(null)}
                            className="py-2 px-4 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Service row */
                      <div className="flex items-center gap-3 px-4 py-3">
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-700 truncate block">{svc.name}</span>
                          <span className="text-xs text-slate-400">{svc.duration} min</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-800 flex-shrink-0">{fmt(svc.price)}</span>
                        <button
                          onClick={() => startEdit(catIdx, svcIdx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                          title="Edit service"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeService(catIdx, svcIdx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Remove service"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Publish button */}
      <div className="sticky bottom-0 bg-white pt-4 pb-6 border-t border-slate-100 -mx-4 px-4">
        <button
          onClick={handlePublish}
          disabled={publishing || totalServices === 0}
          className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all active:scale-[0.98] disabled:opacity-60"
          style={{ backgroundColor: totalServices === 0 ? "#94a3b8" : PLUM }}
        >
          {publishing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Publishing…
            </span>
          ) : (
            `Publish Service Menu · ${totalServices} service${totalServices === 1 ? "" : "s"}`
          )}
        </button>
        <p className="text-center text-xs text-slate-400 mt-2">
          You can always edit or add more services later.
        </p>
      </div>
    </div>
  );

  // ─── Step: Done ───────────────────────────────────────────────────────────────

  const renderDone = () => (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
        <Check className="w-10 h-10 text-emerald-600 stroke-[2.5]" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-3">
        Your service menu is live! 🎉
      </h1>
      <p className="text-slate-500 text-sm leading-relaxed mb-10">
        Customers can now see and book your services online. You can always update
        your menu from the <strong>Services</strong> section.
      </p>
      <div className="space-y-3">
        <button
          onClick={() => navigate("/services")}
          className="w-full py-4 rounded-2xl font-bold text-white"
          style={{ backgroundColor: PLUM }}
        >
          View My Services →
        </button>
        <button
          onClick={() => navigate("/setup")}
          className="w-full py-3 rounded-2xl font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          Back to Setup
        </button>
      </div>
    </div>
  );

  // ─── Shell ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate("/setup")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Setup
          </button>
          <span className="text-sm font-semibold text-slate-700">Service Menu</span>
          <div className="w-16" />
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-1 transition-all duration-500"
            style={{
              backgroundColor: PLUM,
              width:
                step === "entry"      ? "20%" :
                step === "upload"     ? "40%" :
                step === "processing" ? "60%" :
                step === "review"     ? "80%" :
                "100%",
            }}
          />
        </div>
      </div>

      {/* Content */}
      {step === "entry"      && renderEntry()}
      {step === "upload"     && renderUpload()}
      {step === "processing" && renderProcessing()}
      {step === "review"     && renderReview()}
      {step === "done"       && renderDone()}
    </div>
  );
}
