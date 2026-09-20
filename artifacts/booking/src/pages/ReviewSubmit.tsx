import { useParams } from "react-router-dom";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import { ReviewStarForm, type ReviewStarFormSubmitData } from "@/components/review/ReviewStarForm";

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
  const { id: appointmentId } = useParams<{ id: string }>();
  const [submitted, setSubmitted] = useState(false);

  const { data: appt, isLoading, isError } = useQuery<AppointmentFormData>({
    queryKey: ["/api/reviews/form", appointmentId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/form/${appointmentId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!appointmentId,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: ReviewStarFormSubmitData) => {
      const res = await apiRequest("POST", "/api/reviews/submit", {
        appointmentId: Number(appointmentId),
        rating: data.rating,
        comment: data.comment || undefined,
        photoUrl: data.photoUrl || undefined,
      });
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
  });

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

        <ReviewStarForm
          onSubmit={(data) => submitMutation.mutate(data)}
          submitting={submitMutation.isPending}
          submitError={submitMutation.isError ? "Something went wrong. Please try again." : null}
        />
      </Card>
    </div>
  );
}
