import { useParams, useLocation } from "react-router-dom";
import { useBooking, useCancelBooking } from "@/hooks/use-public-booking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { CheckCircle2, Calendar, Download, XCircle, Clock, User, Scissors } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

function buildGoogleCalendarUrl(booking: any): string {
  const start = new Date(booking.date);
  const durationMin = booking.service?.duration || 60;
  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

  const text = encodeURIComponent(booking.service?.name || "Appointment");
  const details = encodeURIComponent(
    `Booking confirmation: ${booking.confirmationNumber || ""}\nStaff: ${booking.staff?.name || "Any"}`
  );
  const location = encodeURIComponent(booking.store?.address || "");

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${location}`;
}

function buildIcsContent(booking: any): string {
  const start = new Date(booking.date);
  const durationMin = booking.service?.duration || 60;
  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

  const now = new Date();
  const uid = `certxa-${booking.id}-${now.getTime()}@certxa.com`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Certxa//Certxa Booking//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${fmt(now)}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${booking.service?.name || "Appointment"}`,
    `DESCRIPTION:Booking confirmation: ${booking.confirmationNumber || ""}\\nStaff: ${booking.staff?.name || "Any"}`,
    `LOCATION:${booking.store?.address || ""}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadIcs(booking: any) {
  const ics = buildIcsContent(booking);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `certxa-booking-${booking.id}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BookingConfirmation() {
  const params = useParams();
  const location = useLocation();
  const confirmationNumber = params?.confirmationNumber;
  const searchParams = new URLSearchParams(location.search);
  const slug = searchParams.get("slug") || undefined;
  const { data: bookings, isLoading, error } = useBooking(confirmationNumber, slug);
  const cancelBooking = useCancelBooking();

  const handleCancel = (appointmentId: number) => {
    if (!confirmationNumber) return;
    cancelBooking.mutate({ confirmationNumber, appointmentId, slug });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="text-center text-muted-foreground">Loading your booking…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-8 pb-8 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-lg font-semibold">Booking not found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Please double-check your confirmation number.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!bookings || bookings.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-muted-foreground">No bookings found for this confirmation number.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-start min-h-screen bg-gray-50 py-10 px-4">
      <div className="w-full max-w-md space-y-4">
        {/* Header banner */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-3">
            <CheckCircle2 className="w-7 h-7 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">You're booked!</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Confirmation #{confirmationNumber}
          </p>
        </div>

        {bookings.map((booking: any) => {
          const isCancelled = booking.status === "cancelled";
          const apptDate = new Date(booking.date);

          return (
            <Card key={booking.id} className={`shadow-sm ${isCancelled ? "opacity-60" : ""}`}>
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
                {/* Date & time */}
                <div className="flex items-start gap-3 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{format(apptDate, "EEEE, MMMM d, yyyy")}</p>
                    <p className="text-muted-foreground">{format(apptDate, "h:mm a")}</p>
                  </div>
                </div>

                {/* Service */}
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

                {/* Staff */}
                {booking.staff?.name && (
                  <div className="flex items-start gap-3 text-sm">
                    <User className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="font-medium">{booking.staff.name}</p>
                  </div>
                )}

                {/* QR check-in code — only for non-cancelled */}
                {!isCancelled && (
                  <div className="pt-2 pb-1">
                    <div className="flex flex-col items-center gap-2 bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <QRCodeSVG
                        value={`BK:${booking.id}`}
                        size={140}
                        bgColor="#ffffff"
                        fgColor="#111827"
                        level="M"
                        className="rounded"
                      />
                      <p className="text-xs text-center text-muted-foreground font-medium">
                        Show this code at check-in
                      </p>
                    </div>
                  </div>
                )}

                {/* Add to Calendar buttons — only for non-cancelled */}
                {!isCancelled && (
                  <div className="pt-2 space-y-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Add to your calendar
                    </p>
                    <div className="flex gap-2">
                      <a
                        href={buildGoogleCalendarUrl(booking)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1"
                      >
                        <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                          <Calendar className="w-3.5 h-3.5" />
                          Google Calendar
                        </Button>
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5 text-xs"
                        onClick={() => downloadIcs(booking)}
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download .ics
                      </Button>
                    </div>
                  </div>
                )}

                {/* Cancel button */}
                {!isCancelled && (
                  <div className="pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-muted-foreground hover:text-destructive hover:bg-red-50 mt-1"
                      onClick={() => handleCancel(booking.id)}
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
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
