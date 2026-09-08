import { useState } from "react";
import { useParams } from "react-router-dom";
import { useManagedBooking, useCancelManagedBooking } from "@/hooks/use-public-booking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Clock, User, Scissors, FileText, ChevronDown, Phone } from "lucide-react";

export default function ManageBooking() {
  const { token } = useParams();
  const { data, isLoading, error } = useManagedBooking(token);
  const cancelBooking = useCancelManagedBooking(token);
  const [showPolicy, setShowPolicy] = useState(false);

  const feeCharged = (cancelBooking.data as any)?.cancellationFeeCharged as number | null | undefined;
  const feeError = (cancelBooking.data as any)?.cancellationFeeError as boolean | undefined;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="text-center text-muted-foreground">Loading your booking…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-8 pb-8 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-lg font-semibold">Booking not found</p>
            <p className="text-sm text-muted-foreground mt-1">
              This link may have expired or is no longer valid.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { appointment: booking, store, storePolicy } = data;
  const isCancelled = booking.status === "cancelled";
  const apptDate = new Date(booking.date);
  const canCancelOnline = storePolicy?.allowOnlineCancellation !== false;

  return (
    <div className="flex justify-center items-start min-h-screen bg-gray-50 py-10 px-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-100 rounded-full mb-3">
            <FileText className="w-7 h-7 text-gray-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Your booking</h1>
          <p className="text-sm text-muted-foreground mt-1">{store.name}</p>
        </div>

        {feeCharged != null && feeCharged > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            A ${feeCharged.toFixed(2)} late-cancellation fee was charged to your card on file.
          </div>
        )}
        {feeError && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            Your appointment was cancelled. We couldn't process the late-cancellation fee — the salon may follow up.
          </div>
        )}

        {storePolicy?.cancellationPolicyText && (
          <Card className="shadow-sm">
            <button
              type="button"
              onClick={() => setShowPolicy((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-gray-700"
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Cancellation policy
              </span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showPolicy ? "rotate-180" : ""}`} />
            </button>
            {showPolicy && (
              <div className="px-4 pb-4 text-sm text-muted-foreground whitespace-pre-wrap">
                {storePolicy.cancellationPolicyText}
              </div>
            )}
          </Card>
        )}

        <Card className={`shadow-sm ${isCancelled ? "opacity-60" : ""}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {isCancelled ? (
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
              )}
              {isCancelled ? "Cancelled" : "Confirmed"}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">{format(apptDate, "EEEE, MMMM d, yyyy")}</p>
                <p className="text-muted-foreground">{format(apptDate, "h:mm a")}</p>
              </div>
            </div>

            {booking.service?.name && (
              <div className="flex items-start gap-3 text-sm">
                <Scissors className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">{booking.service.name}</p>
                  {booking.service.duration && (
                    <p className="text-muted-foreground">{booking.service.duration} min</p>
                  )}
                </div>
              </div>
            )}

            {booking.staff?.name && (
              <div className="flex items-start gap-3 text-sm">
                <User className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="font-medium">{booking.staff.name}</p>
              </div>
            )}

            {/* Reschedule — not self-service yet */}
            {!isCancelled && (
              <div className="pt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                {store.phone
                  ? <span>To reschedule, call the salon at {store.phone}.</span>
                  : <span>To reschedule, please call the salon.</span>}
              </div>
            )}

            {/* Cancel */}
            {!isCancelled && canCancelOnline && (
              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground hover:text-destructive hover:bg-red-50 mt-1"
                  onClick={() => cancelBooking.mutate()}
                  disabled={cancelBooking.isPending}
                >
                  {cancelBooking.isPending ? "Cancelling…" : "Cancel this appointment"}
                </Button>
                {(cancelBooking as any).error && (
                  <p className="text-xs text-red-500 text-center mt-1">
                    {(cancelBooking as any).error?.message || "Could not cancel. The cancellation window may have passed."}
                  </p>
                )}
              </div>
            )}
            {!isCancelled && !canCancelOnline && (
              <p className="pt-1 text-xs text-muted-foreground text-center">
                To cancel this appointment, please call the salon
                {store.phone ? ` at ${store.phone}` : ""}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
