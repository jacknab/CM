/**
 * Shared star-rating + comment + photo-upload form, used by both native
 * review entry points: ReviewSubmit.tsx (appointmentId-based, reached from
 * the owner's dashboard / a known appointment) and public-review/ReviewGate.tsx
 * (token-based, reached from the automated SMS/email review-request link for
 * salons without a Google review destination). Extracted so both share one
 * implementation instead of duplicating the same ~150 lines of markup.
 *
 * Purely presentational + its own local form state — the caller supplies
 * `onSubmit` and owns the actual API call, loading state, and success/error
 * handling, since the two entry points submit to different endpoints
 * (/api/reviews/submit vs /api/reviews/gate/submit).
 */
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2, Camera, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReviewStarFormSubmitData {
  rating: number;
  comment: string;
  photoUrl: string | null;
}

interface ReviewStarFormProps {
  onSubmit: (data: ReviewStarFormSubmitData) => void;
  submitting: boolean;
  submitError?: string | null;
}

const STAR_LABELS = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];

export function ReviewStarForm({ onSubmit, submitting, submitError }: ReviewStarFormProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoUrl(null);

    // Upload immediately so we have the URL ready for submit
    setPhotoUploading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/reviews/upload-photo", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setPhotoUrl(data.url);
    } catch {
      // Non-fatal — review submits without photo if upload failed
      setPhotoUrl(null);
    } finally {
      setPhotoUploading(false);
    }
  }

  function removePhoto() {
    setPhotoPreview(null);
    setPhotoUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const displayRating = hovered || rating;

  return (
    <>
      {/* Star selector */}
      <div className="text-center space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Tap a star to rate</p>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setRating(s)}
              onMouseEnter={() => setHovered(s)}
              onMouseLeave={() => setHovered(0)}
              className="transition-transform hover:scale-110 focus:outline-none"
            >
              <Star
                className={cn(
                  "h-10 w-10 transition-colors",
                  s <= displayRating
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground/30"
                )}
              />
            </button>
          ))}
        </div>
        {displayRating > 0 && (
          <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 h-5">
            {STAR_LABELS[displayRating]}
          </p>
        )}
      </div>

      {/* Comment */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Share your experience{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <Textarea
          placeholder="What did you love? Anything we could do better?"
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="resize-none"
        />
      </div>

      {/* Photo upload */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Add a photo{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        {photoPreview ? (
          <div className="relative inline-block">
            <img
              src={photoPreview}
              alt="Review photo preview"
              className="h-24 w-24 object-cover rounded-lg border"
            />
            {photoUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              </div>
            )}
            <button
              type="button"
              onClick={removePhoto}
              className="absolute -top-2 -right-2 bg-background border rounded-full p-0.5 shadow-sm hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-muted-foreground/40 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Camera className="h-4 w-4" />
            Upload photo
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
        />
      </div>

      {/* Submit */}
      <Button
        className="w-full"
        size="lg"
        disabled={rating === 0 || submitting || photoUploading}
        onClick={() => onSubmit({ rating, comment: comment.trim(), photoUrl })}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Submitting...
          </>
        ) : (
          "Submit Review"
        )}
      </Button>

      {submitError && (
        <p className="text-sm text-destructive text-center">{submitError}</p>
      )}
    </>
  );
}
