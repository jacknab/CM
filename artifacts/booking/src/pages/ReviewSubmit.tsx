import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Star, CheckCircle2, Loader2, Camera, X } from "lucide-react";
import { cn } from "@/lib/utils";

type AppointmentFormData = {
  id: number;
  storeName: string | null;
  customerName: string | null;
  serviceName: string | null;
  staffName: string | null;
  date: string;
  alreadyReviewed: boolean;
};

export default function ReviewSubmit() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: appt, isLoading, isError } = useQuery<AppointmentFormData>({
    queryKey: ["/api/reviews/form", appointmentId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/form/${appointmentId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!appointmentId,
  });

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
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
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reviews/submit", {
        appointmentId: Number(appointmentId),
        rating,
        comment: comment.trim() || undefined,
        photoUrl: photoUrl || undefined,
      });
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
  });

  const starLabels = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];
  const displayRating = hovered || rating;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !appt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-8 max-w-md w-full text-center space-y-3">
          <p className="text-lg font-semibold">Review link not found</p>
          <p className="text-sm text-muted-foreground">
            This review link may be invalid or has expired.
          </p>
        </Card>
      </div>
    );
  }

  if (appt.alreadyReviewed || submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-8 max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
          <div>
            <p className="text-xl font-bold">Thank you!</p>
            <p className="text-sm text-muted-foreground mt-1">
              {submitted
                ? "Your review has been submitted successfully."
                : "You've already submitted a review for this appointment."}
            </p>
          </div>
          {appt.storeName && (
            <p className="text-sm text-muted-foreground">
              We appreciate your feedback at <strong>{appt.storeName}</strong>.
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-6">
      <Card className="p-8 max-w-md w-full space-y-6 shadow-lg">
        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-xl font-bold">{appt.storeName || "Your Experience"}</p>
          <p className="text-sm text-muted-foreground">
            How was your visit{appt.customerName ? `, ${appt.customerName.split(" ")[0]}` : ""}?
          </p>
        </div>

        {/* Appointment summary */}
        <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
          {appt.serviceName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service</span>
              <span className="font-medium">{appt.serviceName}</span>
            </div>
          )}
          {appt.staffName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">With</span>
              <span className="font-medium">{appt.staffName}</span>
            </div>
          )}
          {appt.date && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">
                {new Date(appt.date).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          )}
        </div>

        {/* Star selector */}
        <div className="text-center space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Tap a star to rate</p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
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
              {starLabels[displayRating]}
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
          disabled={rating === 0 || submitMutation.isPending || photoUploading}
          onClick={() => submitMutation.mutate()}
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Submitting...
            </>
          ) : (
            "Submit Review"
          )}
        </Button>

        {submitMutation.isError && (
          <p className="text-sm text-destructive text-center">
            Something went wrong. Please try again.
          </p>
        )}
      </Card>
    </div>
  );
}
