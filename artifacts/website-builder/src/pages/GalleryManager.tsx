/**
 * GalleryManager — Salon Website Gallery & Google Business Profile Photos
 *
 * Lets salon owners / staff upload photos that simultaneously:
 *   1. Appear in their website's gallery section
 *   2. Are queued for automatic upload to Google Business Profile
 *
 * API: /api/google-business/gallery-photos/:storeId
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useStoreId } from "@/hooks/use-store-id";
import {
  Loader2,
  Trash2,
  Upload,
  X,
  Globe,
  EyeOff,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
  Camera,
  Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GalleryPhoto {
  id: number;
  storeId: number;
  imageUrl: string;
  imageR2Key: string | null;
  caption: string | null;
  showOnWebsite: boolean;
  sortOrder: number;
  gbpQueueId: number | null;
  createdAt: string;
  updatedAt: string;
}

type GbpStatus = "queued" | "uploaded" | "failed" | "none";

function gbpStatus(photo: GalleryPhoto): GbpStatus {
  if (!photo.gbpQueueId) return "none";
  // We don't have queue status in the list response; show "queued" as the safe default
  // The dispatcher will handle actual upload
  return "queued";
}

function GbpBadge({ status }: { status: GbpStatus }) {
  if (status === "none") return null;
  if (status === "uploaded") {
    return (
      <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide bg-emerald-500/90 text-white px-1.5 py-0.5 rounded-full">
        <CheckCircle2 className="w-2.5 h-2.5" /> Google
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide bg-red-500/90 text-white px-1.5 py-0.5 rounded-full">
        <AlertCircle className="w-2.5 h-2.5" /> Failed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide bg-sky-500/90 text-white px-1.5 py-0.5 rounded-full">
      <Clock className="w-2.5 h-2.5" /> Queued
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GalleryManager() {
  const { toast } = useToast();
  const storeId = useStoreId();

  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");
  const [deleting, setDeleting] = useState<Set<number>>(new Set());
  const [toggling, setToggling] = useState<Set<number>>(new Set());
  const [lightbox, setLightbox] = useState<GalleryPhoto | null>(null);
  const [editingCaption, setEditingCaption] = useState<{ id: number; value: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load photos ─────────────────────────────────────────────────────────────

  const fetchPhotos = useCallback(async () => {
    if (!storeId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/google-business/gallery-photos/${storeId}`);
      if (!res.ok) throw new Error("Failed to load");
      setPhotos(await res.json() as GalleryPhoto[]);
    } catch {
      toast({ variant: "destructive", title: "Could not load gallery photos" });
    } finally {
      setIsLoading(false);
    }
  }, [storeId, toast]);

  useEffect(() => { void fetchPhotos(); }, [fetchPhotos]);

  // ── Upload ───────────────────────────────────────────────────────────────────

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!storeId) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      toast({ variant: "destructive", title: "Please select image files only" });
      return;
    }
    setUploading(true);
    let successCount = 0;
    for (const file of images) {
      const form = new FormData();
      form.append("photo", file);
      if (captionDraft.trim()) {
        form.append("caption", captionDraft.trim());
      }
      try {
        const res = await fetch(`/api/google-business/gallery-photos/${storeId}/upload`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error("Upload failed");
        const newPhoto = await res.json() as GalleryPhoto;
        setPhotos((prev) => [newPhoto, ...prev]);
        successCount++;
      } catch {
        toast({ variant: "destructive", title: `Failed to upload ${file.name}` });
      }
    }
    if (successCount > 0) {
      toast({
        title: `${successCount} photo${successCount > 1 ? "s" : ""} added`,
        description: "Photos will appear on your website and are queued for Google Business Profile.",
      });
      setCaptionDraft("");
    }
    setUploading(false);
  }, [storeId, captionDraft, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    void uploadFiles(Array.from(e.dataTransfer.files));
  }, [uploadFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    void uploadFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  // ── Toggle website visibility ────────────────────────────────────────────────

  const toggleVisibility = async (photo: GalleryPhoto) => {
    setToggling((s) => new Set(s).add(photo.id));
    try {
      const res = await fetch(`/api/google-business/gallery-photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showOnWebsite: !photo.showOnWebsite }),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated = await res.json() as GalleryPhoto;
      setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (lightbox?.id === updated.id) setLightbox(updated);
    } catch {
      toast({ variant: "destructive", title: "Could not update photo" });
    } finally {
      setToggling((s) => { const n = new Set(s); n.delete(photo.id); return n; });
    }
  };

  // ── Save caption ─────────────────────────────────────────────────────────────

  const saveCaption = async (photoId: number, caption: string) => {
    try {
      const res = await fetch(`/api/google-business/gallery-photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: caption.trim() || null }),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated = await res.json() as GalleryPhoto;
      setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (lightbox?.id === updated.id) setLightbox(updated);
      setEditingCaption(null);
    } catch {
      toast({ variant: "destructive", title: "Could not save caption" });
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (photo: GalleryPhoto) => {
    if (!confirm(`Remove this photo from your gallery? This cannot be undone.`)) return;
    setDeleting((s) => new Set(s).add(photo.id));
    try {
      const res = await fetch(`/api/google-business/gallery-photos/${photo.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      if (lightbox?.id === photo.id) setLightbox(null);
      toast({ title: "Photo removed from gallery" });
    } catch {
      toast({ variant: "destructive", title: "Could not delete photo" });
    } finally {
      setDeleting((s) => { const n = new Set(s); n.delete(photo.id); return n; });
    }
  };

  // ── No store session ─────────────────────────────────────────────────────────

  if (!storeId) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 flex flex-col items-center justify-center text-center">
        <ImageIcon className="w-14 h-14 text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">No salon account found</h2>
        <p className="text-sm text-gray-500">Log in to a salon account to manage your gallery.</p>
      </div>
    );
  }

  const visible   = photos.filter((p) => p.showOnWebsite);
  const hidden    = photos.filter((p) => !p.showOnWebsite);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#1A0333]">Photo Gallery</h1>
          <p className="text-gray-500 mt-1 text-sm max-w-xl">
            Upload photos to your website gallery. Each photo is also automatically queued for your Google Business Profile — keeping both in sync.
          </p>
        </div>
        <Badge
          variant="secondary"
          className="shrink-0 mt-1 text-sm px-3 py-1"
        >
          {photos.length} photo{photos.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl bg-sky-50 border border-sky-100 px-4 py-3">
        <Info className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
        <p className="text-sm text-sky-700">
          <span className="font-medium">Photos go two places at once.</span>{" "}
          Uploaded photos appear in your salon's website gallery immediately, and are automatically scheduled for upload to Google Business Profile during business hours.
        </p>
      </div>

      {/* Upload zone */}
      <div className="space-y-3">
        {/* Caption input */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Caption (optional)</label>
          <input
            type="text"
            value={captionDraft}
            onChange={(e) => setCaptionDraft(e.target.value)}
            placeholder="e.g. French tip set, Gel manicure, Our team…"
            className="flex-1 text-sm rounded-lg border border-gray-200 px-3 py-1.5 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3B0764]/40"
          />
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-10 text-center transition-all cursor-pointer select-none ${
            isDragging
              ? "border-[#C97B2B] bg-[#C97B2B]/5 scale-[1.01]"
              : uploading
              ? "border-gray-200 bg-gray-50"
              : "border-gray-200 hover:border-[#3B0764]/40 hover:bg-gray-50/60"
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-[#3B0764] animate-spin" />
              <p className="text-sm text-gray-500 font-medium">Uploading…</p>
            </div>
          ) : (
            <>
              <Camera className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-600 font-medium">
                Drag & drop photos here, or{" "}
                <span className="text-[#3B0764] underline underline-offset-2">browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP, GIF — max 20 MB each · multiple files allowed</p>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Gallery grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-[#3B0764] animate-spin" />
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 border-2 border-dashed border-gray-100 rounded-2xl">
          <Camera className="w-12 h-12 mb-3 opacity-25" />
          <p className="text-sm font-medium text-gray-500">Your gallery is empty</p>
          <p className="text-xs mt-1 text-gray-400">Upload your first photo above to get started</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 rounded-full border-[#3B0764] text-[#3B0764] hover:bg-[#3B0764]/5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Upload photos
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Visible section */}
          {visible.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-gray-700">
                  Showing on website <span className="text-gray-400 font-normal">({visible.length})</span>
                </h2>
              </div>
              <PhotoGrid
                photos={visible}
                deleting={deleting}
                toggling={toggling}
                onOpen={setLightbox}
                onDelete={handleDelete}
                onToggle={toggleVisibility}
                onAddPhoto={() => fileInputRef.current?.click()}
              />
            </div>
          )}

          {/* Hidden section */}
          {hidden.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <EyeOff className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-500">
                  Hidden from website <span className="text-gray-400 font-normal">({hidden.length})</span>
                </h2>
              </div>
              <PhotoGrid
                photos={hidden}
                deleting={deleting}
                toggling={toggling}
                onOpen={setLightbox}
                onDelete={handleDelete}
                onToggle={toggleVisibility}
              />
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => { setEditingCaption(null); setLightbox(null); }}
        >
          <div
            className="relative max-w-3xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => { setEditingCaption(null); setLightbox(null); }}
              className="absolute top-3 right-3 z-10 bg-white/80 hover:bg-white rounded-full p-1.5 shadow"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Image */}
            <img
              src={lightbox.imageUrl}
              alt={lightbox.caption ?? "Gallery photo"}
              className="w-full max-h-[60vh] object-contain bg-gray-50"
            />

            {/* Details */}
            <div className="p-5 border-t border-gray-100 space-y-4">
              {/* Caption row */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Caption</p>
                {editingCaption?.id === lightbox.id ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={editingCaption.value}
                      onChange={(e) => setEditingCaption({ id: lightbox.id, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveCaption(lightbox.id, editingCaption.value);
                        if (e.key === "Escape") setEditingCaption(null);
                      }}
                      className="flex-1 text-sm rounded-lg border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#3B0764]/40"
                      placeholder="Add a caption…"
                    />
                    <Button size="sm" className="rounded-lg bg-[#3B0764] hover:bg-[#3B0764]/90" onClick={() => void saveCaption(lightbox.id, editingCaption.value)}>Save</Button>
                    <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setEditingCaption(null)}>Cancel</Button>
                  </div>
                ) : (
                  <button
                    className="text-sm text-left w-full text-gray-700 hover:text-[#3B0764] transition-colors"
                    onClick={() => setEditingCaption({ id: lightbox.id, value: lightbox.caption ?? "" })}
                  >
                    {lightbox.caption ?? <span className="text-gray-400 italic">No caption — click to add one</span>}
                  </button>
                )}
              </div>

              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {lightbox.showOnWebsite ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                    <Globe className="w-3 h-3" /> On website
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-gray-500">
                    <EyeOff className="w-3 h-3" /> Hidden
                  </Badge>
                )}
                {lightbox.gbpQueueId && (
                  <Badge className="bg-sky-100 text-sky-700 border-sky-200 gap-1">
                    <Clock className="w-3 h-3" /> Google Business queued
                  </Badge>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full flex-1 gap-1.5"
                  disabled={toggling.has(lightbox.id)}
                  onClick={() => void toggleVisibility(lightbox)}
                >
                  {toggling.has(lightbox.id) ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : lightbox.showOnWebsite ? (
                    <><EyeOff className="w-3.5 h-3.5" /> Hide from website</>
                  ) : (
                    <><Globe className="w-3.5 h-3.5" /> Show on website</>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-full shrink-0"
                  disabled={deleting.has(lightbox.id)}
                  onClick={() => void handleDelete(lightbox)}
                >
                  {deleting.has(lightbox.id) ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <><Trash2 className="w-3.5 h-3.5 mr-1" /> Remove</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Photo Grid Sub-component ─────────────────────────────────────────────────

interface PhotoGridProps {
  photos: GalleryPhoto[];
  deleting: Set<number>;
  toggling: Set<number>;
  onOpen: (p: GalleryPhoto) => void;
  onDelete: (p: GalleryPhoto) => void;
  onToggle: (p: GalleryPhoto) => void;
  onAddPhoto?: () => void;
}

function PhotoGrid({ photos, deleting, toggling, onOpen, onDelete, onToggle, onAddPhoto }: PhotoGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {photos.map((photo) => (
        <div
          key={photo.id}
          className={`group relative rounded-xl overflow-hidden border bg-gray-50 aspect-square shadow-sm hover:shadow-md transition-all cursor-pointer ${
            photo.showOnWebsite ? "border-gray-100" : "border-dashed border-gray-200 opacity-60"
          }`}
          onClick={() => onOpen(photo)}
        >
          <img
            src={photo.imageUrl}
            alt={photo.caption ?? "Gallery photo"}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />

          {/* GBP status */}
          <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <GbpBadge status={gbpStatus(photo)} />
          </div>

          {/* Actions overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />

          {/* Delete */}
          <button
            onClick={(e) => { e.stopPropagation(); void onDelete(photo); }}
            disabled={deleting.has(photo.id)}
            className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow disabled:opacity-50"
            title="Delete"
          >
            {deleting.has(photo.id) ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
          </button>

          {/* Eye toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); void onToggle(photo); }}
            disabled={toggling.has(photo.id)}
            className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 hover:bg-white text-gray-700 rounded-full p-1 shadow disabled:opacity-50"
            title={photo.showOnWebsite ? "Hide from website" : "Show on website"}
          >
            {toggling.has(photo.id) ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : photo.showOnWebsite ? (
              <Globe className="w-3 h-3 text-emerald-600" />
            ) : (
              <EyeOff className="w-3 h-3 text-gray-400" />
            )}
          </button>

          {/* Caption strip */}
          {photo.caption && (
            <div className="absolute bottom-0 inset-x-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
              <p className="text-[10px] text-white truncate">{photo.caption}</p>
            </div>
          )}
        </div>
      ))}

      {/* Add tile */}
      {onAddPhoto && (
        <button
          onClick={onAddPhoto}
          className="rounded-xl border-2 border-dashed border-gray-200 hover:border-[#3B0764]/50 hover:bg-[#3B0764]/5 aspect-square flex flex-col items-center justify-center text-gray-400 hover:text-[#3B0764] transition-all"
        >
          <Upload className="w-6 h-6 mb-1" />
          <span className="text-xs font-medium">Add photo</span>
        </button>
      )}
    </div>
  );
}
