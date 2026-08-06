import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Trash2,
  Upload,
  Download,
  ImageIcon,
  X,
} from "lucide-react";

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "nail_salon", label: "Nail Salon" },
  { value: "barbershop", label: "Barbershop" },
  { value: "hair_salon", label: "Hair Salon" },
  { value: "other", label: "Other" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

interface LibraryImage {
  id: number;
  filename: string;
  category: string;
  originalUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function imgUrl(item: LibraryImage) {
  return `/api/image-library/images/${item.category}/${item.filename}`;
}

export default function ImageLibrary() {
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [harvesting, setHarvesting] = useState(false);
  const [uploadingCategory, setUploadingCategory] = useState<string>("other");
  const [isDragging, setIsDragging] = useState(false);
  const [deleting, setDeleting] = useState<Set<number>>(new Set());
  const [lightbox, setLightbox] = useState<LibraryImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async (category: Category) => {
    setIsLoading(true);
    try {
      const url = category === "all"
        ? "/api/image-library"
        : `/api/image-library?category=${category}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load");
      setImages(await res.json() as LibraryImage[]);
    } catch {
      toast({ variant: "destructive", title: "Could not load images" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { void fetchImages(activeCategory); }, [activeCategory, fetchImages]);

  // ── Upload ────────────────────────────────────────────────────────────────

  const uploadFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      toast({ variant: "destructive", title: "Please drop image files only" });
      return;
    }
    const cat = uploadingCategory === "all" ? "other" : uploadingCategory;
    let successCount = 0;
    for (const file of images) {
      const form = new FormData();
      form.append("image", file);
      try {
        const res = await fetch(`/api/image-library/upload?category=${cat}`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error("Upload failed");
        successCount++;
      } catch {
        toast({ variant: "destructive", title: `Failed to upload ${file.name}` });
      }
    }
    if (successCount > 0) {
      toast({ title: `${successCount} image${successCount > 1 ? "s" : ""} uploaded` });
      void fetchImages(activeCategory);
    }
  }, [uploadingCategory, activeCategory, fetchImages, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    void uploadFiles(files);
  }, [uploadFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    void uploadFiles(files);
    e.target.value = "";
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (img: LibraryImage) => {
    if (!confirm(`Delete "${img.filename}"? This cannot be undone.`)) return;
    setDeleting((d) => new Set(d).add(img.id));
    try {
      const res = await fetch(`/api/image-library/${img.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setImages((prev) => prev.filter((i) => i.id !== img.id));
      if (lightbox?.id === img.id) setLightbox(null);
      toast({ title: "Image deleted" });
    } catch {
      toast({ variant: "destructive", title: "Could not delete image" });
    } finally {
      setDeleting((d) => { const n = new Set(d); n.delete(img.id); return n; });
    }
  };

  // ── Harvest ───────────────────────────────────────────────────────────────

  const handleHarvest = async () => {
    setHarvesting(true);
    try {
      const res = await fetch("/api/image-library/harvest", { method: "POST" });
      if (!res.ok) throw new Error("Harvest failed");
      toast({
        title: "Harvest started",
        description: "Images are being downloaded in the background. Refresh in a moment.",
      });
      setTimeout(() => { void fetchImages(activeCategory); }, 8000);
    } catch {
      toast({ variant: "destructive", title: "Harvest failed" });
    } finally {
      setHarvesting(false);
    }
  };

  const displayedImages = images;
  const uploadCat = uploadingCategory === "all" ? "other" : uploadingCategory;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#1A0333]">Image Library</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Manage images by business type. Drag & drop to upload, click to preview.
          </p>
        </div>
        <Button
          onClick={() => { void handleHarvest(); }}
          disabled={harvesting}
          variant="outline"
          className="rounded-full border-[#3B0764] text-[#3B0764] hover:bg-[#3B0764]/5 gap-2"
        >
          {harvesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {harvesting ? "Harvesting…" : "Harvest from Templates"}
        </Button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              activeCategory === cat.value
                ? "bg-[#1A0333] text-white shadow"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {cat.label}
            {cat.value !== "all" && (
              <span className="ml-1.5 text-xs opacity-60">
                {images.filter((i) => i.category === cat.value).length || ""}
              </span>
            )}
          </button>
        ))}
        <Badge variant="secondary" className="ml-auto self-center">
          {images.length} image{images.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
          isDragging
            ? "border-[#C97B2B] bg-[#C97B2B]/5 scale-[1.01]"
            : "border-gray-200 hover:border-[#3B0764]/40 hover:bg-gray-50/60"
        }`}
      >
        <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500 font-medium mb-1">
          Drop images here, or{" "}
          <button
            className="text-[#3B0764] underline underline-offset-2 hover:text-[#C97B2B]"
            onClick={() => fileInputRef.current?.click()}
          >
            browse
          </button>
        </p>
        <p className="text-xs text-gray-400">
          JPG, PNG, WebP, GIF, SVG — max 20 MB each
        </p>

        {/* Category picker for uploads */}
        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="text-xs text-gray-400">Upload to:</span>
          <select
            value={uploadingCategory}
            onChange={(e) => setUploadingCategory(e.target.value)}
            className="text-xs rounded-lg border border-gray-200 px-2 py-1 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#3B0764]"
          >
            {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
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

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#3B0764] animate-spin" />
        </div>
      ) : displayedImages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ImageIcon className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">No images yet</p>
          <p className="text-xs mt-1">Upload some or click "Harvest from Templates"</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {displayedImages.map((img) => (
            <div
              key={img.id}
              className="group relative rounded-xl overflow-hidden border border-gray-100 bg-gray-50 aspect-square shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setLightbox(img)}
            >
              <img
                src={imgUrl(img)}
                alt={img.filename}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              {/* Category badge */}
              <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[9px] font-semibold uppercase tracking-wide bg-black/50 text-white px-1.5 py-0.5 rounded-full">
                  {img.category.replace("_", " ")}
                </span>
              </div>
              {/* Delete button */}
              <button
                onClick={(e) => { e.stopPropagation(); void handleDelete(img); }}
                disabled={deleting.has(img.id)}
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow disabled:opacity-50"
                title="Delete"
              >
                {deleting.has(img.id) ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
              </button>
              {/* Size */}
              {img.fileSize && (
                <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[9px] bg-black/40 text-white px-1.5 py-0.5 rounded-full">
                    {formatBytes(img.fileSize)}
                  </span>
                </div>
              )}
            </div>
          ))}
          {/* Upload tile */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border-2 border-dashed border-gray-200 hover:border-[#3B0764]/50 hover:bg-[#3B0764]/5 aspect-square flex flex-col items-center justify-center text-gray-400 hover:text-[#3B0764] transition-all"
          >
            <Upload className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Upload</span>
          </button>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-3 right-3 z-10 bg-white/80 hover:bg-white rounded-full p-1.5 shadow"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={imgUrl(lightbox)}
              alt={lightbox.filename}
              className="max-w-full max-h-[70vh] object-contain"
            />
            <div className="p-4 border-t border-gray-100">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{lightbox.filename}</p>
                  {lightbox.originalUrl && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{lightbox.originalUrl}</p>
                  )}
                  <div className="flex gap-2 mt-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {lightbox.category.replace("_", " ")}
                    </Badge>
                    {lightbox.fileSize && (
                      <Badge variant="outline" className="text-[10px]">{formatBytes(lightbox.fileSize)}</Badge>
                    )}
                    {lightbox.mimeType && (
                      <Badge variant="outline" className="text-[10px]">{lightbox.mimeType}</Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="shrink-0 rounded-full"
                  onClick={() => { void handleDelete(lightbox); }}
                  disabled={deleting.has(lightbox.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
