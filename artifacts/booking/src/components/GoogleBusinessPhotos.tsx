/**
 * GoogleBusinessPhotos
 *
 * Lets salon owners upload photos that simultaneously:
 *  1. Appear in their website gallery (under "Our Work")
 *  2. Get pushed to their Google Business Profile
 */

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Trash2, Upload, Globe, CheckCircle2, Clock, AlertCircle, ImageOff, Loader2, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GalleryPhoto {
  id: number;
  storeId: number;
  imageUrl: string;
  imageR2Key: string | null;
  caption: string | null;
  showOnWebsite: boolean;
  gbpQueueId: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Lightweight GBP status overlay pulled from the photo engine queue
interface GbpQueueItem {
  id: number;
  status: "pending" | "processing" | "uploaded" | "failed" | "cancelled";
}

function GbpStatusBadge({ status }: { status: GbpQueueItem["status"] | undefined | null }) {
  if (!status) return null;
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    uploaded:   { label: "On Google",  variant: "default",     icon: <CheckCircle2 size={11} /> },
    pending:    { label: "Queued",     variant: "secondary",   icon: <Clock size={11} /> },
    processing: { label: "Uploading",  variant: "secondary",   icon: <Loader2 size={11} className="animate-spin" /> },
    failed:     { label: "GBP failed", variant: "destructive", icon: <AlertCircle size={11} /> },
    cancelled:  { label: "Cancelled",  variant: "outline",     icon: <AlertCircle size={11} /> },
  };
  const cfg = map[status];
  if (!cfg) return null;
  return (
    <Badge variant={cfg.variant} className="gap-1 text-[10px] py-0.5 px-1.5">
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

function PhotoCard({
  photo,
  queueStatus,
  onToggleWebsite,
  onCaptionSave,
  onDelete,
}: {
  photo: GalleryPhoto;
  queueStatus: GbpQueueItem["status"] | undefined;
  onToggleWebsite: (show: boolean) => void;
  onCaptionSave: (caption: string) => void;
  onDelete: () => void;
}) {
  const [editCaption, setEditCaption] = useState(photo.caption ?? "");
  const [captionDirty, setCaptionDirty] = useState(false);

  return (
    <div className="border rounded-xl overflow-hidden bg-white shadow-sm flex flex-col group">
      {/* Image */}
      <div className="relative aspect-square bg-gray-100">
        <img
          src={photo.imageUrl}
          alt={photo.caption ?? "Gallery photo"}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {/* GBP status badge */}
        <div className="absolute top-2 left-2">
          <GbpStatusBadge status={queueStatus} />
        </div>
        {/* Delete button */}
        <button
          onClick={onDelete}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity
                     bg-red-600 text-white rounded-full p-1.5 hover:bg-red-700"
          title="Delete photo"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Controls */}
      <div className="p-3 flex flex-col gap-3">
        {/* Caption */}
        <div>
          <Label className="text-[11px] text-muted-foreground mb-1 block">Caption (optional)</Label>
          <div className="flex gap-1.5">
            <Input
              value={editCaption}
              onChange={(e) => { setEditCaption(e.target.value); setCaptionDirty(true); }}
              placeholder="Add a caption…"
              className="h-7 text-xs"
            />
            {captionDirty && (
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => { onCaptionSave(editCaption); setCaptionDirty(false); }}
              >
                Save
              </Button>
            )}
          </div>
        </div>

        {/* Show on website toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe size={12} />
            <span>Show in gallery</span>
          </div>
          <Switch
            checked={photo.showOnWebsite}
            onCheckedChange={onToggleWebsite}
          />
        </div>
      </div>
    </div>
  );
}

export function GoogleBusinessPhotos({ storeId }: { storeId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ── Fetch gallery photos ───────────────────────────────────────────────────
  const { data: photos = [], isLoading } = useQuery<GalleryPhoto[]>({
    queryKey: ["gallery-photos", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/google-business/gallery-photos/${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load gallery photos");
      return res.json();
    },
  });

  // ── Fetch GBP queue to get upload statuses ────────────────────────────────
  const queueIds = photos.map((p) => p.gbpQueueId).filter(Boolean) as number[];
  const { data: queueItems = [] } = useQuery<GbpQueueItem[]>({
    queryKey: ["gbp-queue-gallery", storeId],
    queryFn: async () => {
      const res = await fetch(
        `/api/google-business/photo-engine/queue/${storeId}?limit=100`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: photos.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data as GbpQueueItem[] | undefined;
      const hasPending = (data ?? []).some((q) => q.status === "pending" || q.status === "processing");
      return hasPending ? 15_000 : false;
    },
  });

  const queueStatusById = Object.fromEntries(queueItems.map((q) => [q.id, q.status]));
  const getQueueStatus = (photo: GalleryPhoto) =>
    photo.gbpQueueId ? queueStatusById[photo.gbpQueueId] : undefined;

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let successCount = 0;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const fd = new FormData();
      fd.append("photo", file);
      try {
        const res = await fetch(`/api/google-business/gallery-photos/${storeId}/upload`, {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        if (!res.ok) throw new Error(await res.text());
        successCount++;
      } catch (err: any) {
        toast({ title: "Upload failed", description: err?.message ?? "Unknown error", variant: "destructive" });
      }
    }

    setUploading(false);
    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ["gallery-photos", storeId] });
      queryClient.invalidateQueries({ queryKey: ["gbp-queue-gallery", storeId] });
      toast({
        title: `${successCount} photo${successCount > 1 ? "s" : ""} uploaded`,
        description: "Added to your website gallery and queued for Google Business Profile.",
      });
    }
  }, [storeId, queryClient, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  // ── Update mutation ────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, any> }) => {
      const res = await fetch(`/api/google-business/gallery-photos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update photo");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gallery-photos", storeId] }),
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  // ── Delete mutation ────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/google-business/gallery-photos/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete photo");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gallery-photos", storeId] });
      toast({ title: "Photo deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Info banner */}
      <Card className="border-blue-100 bg-blue-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3 items-start">
            <Info size={18} className="text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Photos go to two places at once</p>
              <p>
                Every photo you upload here appears in the <strong>Gallery section</strong> of your
                published website and is automatically queued for your{" "}
                <strong>Google Business Profile</strong>. Uploads to Google are spaced out
                during business hours (max 3/day by default).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload zone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Upload Photos</CardTitle>
          <CardDescription>Drag & drop or click to select. JPG, PNG, WebP — max 20 MB each.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
              ${dragOver ? "border-primary bg-primary/5" : "border-gray-200 hover:border-primary/50"}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 size={32} className="animate-spin text-primary" />
                <p className="text-sm font-medium">Uploading…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload size={32} className="text-gray-300" />
                <p className="text-sm font-medium">
                  {dragOver ? "Drop photos here" : "Drag photos here, or click to select"}
                </p>
                <p className="text-xs">You can select multiple files at once</p>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Photo grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">
            Gallery Photos
            {photos.length > 0 && (
              <span className="ml-2 text-muted-foreground font-normal">({photos.length})</span>
            )}
          </h3>
          {photos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {photos.filter((p) => p.showOnWebsite).length} shown on website ·{" "}
              {queueItems.filter((q) => q.status === "uploaded").length} on Google
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={28} className="animate-spin text-gray-300" />
          </div>
        ) : photos.length === 0 ? (
          <div className="border rounded-xl py-16 flex flex-col items-center gap-3 text-muted-foreground bg-gray-50">
            <ImageOff size={36} className="text-gray-200" />
            <p className="text-sm font-medium">No photos yet</p>
            <p className="text-xs">Upload your first photo above to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {photos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                queueStatus={getQueueStatus(photo)}
                onToggleWebsite={(show) =>
                  updateMutation.mutate({ id: photo.id, payload: { showOnWebsite: show } })
                }
                onCaptionSave={(caption) =>
                  updateMutation.mutate({ id: photo.id, payload: { caption } })
                }
                onDelete={() => {
                  if (confirm("Delete this photo? It will be removed from your website gallery.")) {
                    deleteMutation.mutate(photo.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
