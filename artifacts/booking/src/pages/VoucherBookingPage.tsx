import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Check, Calendar as CalendarIcon, Clock3 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface VoucherInfo {
  voucherCode: string;
  dealTitle: string;
  dealPrice: number;
  storeSlug: string;
  storeName: string;
  packageId: number;
  serviceId: number;
  durationMinutes: number;
  expiresAt: string;
}

interface TimeSlot {
  time: string;
  staffId: number;
  staffName: string;
}

function nextDays(count: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function VoucherBookingPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);

  const { data: voucher, isLoading, error } = useQuery<VoucherInfo>({
    queryKey: [`/api/public/vouchers/${token}`],
    queryFn: async () => {
      const res = await fetch(`/api/public/vouchers/${token}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "That link isn't valid.");
      return body;
    },
    enabled: !!token,
    retry: false,
  });

  const days = useMemo(() => nextDays(21), []);
  const selectedDateKey = selectedDate ? dateKey(selectedDate) : null;

  const { data: slots, isLoading: slotsLoading } = useQuery<TimeSlot[]>({
    queryKey: [`/api/public/store/${voucher?.storeSlug}/availability`, voucher?.serviceId, selectedDateKey, voucher?.durationMinutes],
    queryFn: async () => {
      const params = new URLSearchParams({
        serviceId: String(voucher!.serviceId),
        date: selectedDateKey!,
        duration: String(voucher!.durationMinutes),
      });
      const res = await fetch(`/api/public/store/${voucher!.storeSlug}/availability?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!voucher && !!selectedDateKey,
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/public/store/${voucher!.storeSlug}/book`, {
        packageId: voucher!.packageId,
        staffId: selectedSlot!.staffId,
        date: selectedSlot!.time,
        duration: voucher!.durationMinutes,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        voucherCode: voucher!.voucherCode,
      });
      return res.json();
    },
    onError: (err: Error) => {
      const msg = err.message.includes(":") ? err.message.split(":").slice(1).join(":").trim() : err.message;
      setBookingError(msg.startsWith("{") ? "That time just became unavailable — please pick another." : msg);
    },
  });

  if (isLoading) {
    return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (error || !voucher) {
    return <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-semibold text-gray-900">We can't book that right now</h2>
        <p className="text-gray-500 mt-2">{(error as Error)?.message || "That link isn't valid."}</p>
      </div>
    </div>;
  }

  if (bookMutation.isSuccess) {
    return <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600"><Check className="w-7 h-7" /></div>
        <h2 className="mt-5 text-2xl font-semibold text-gray-900">You're booked!</h2>
        <p className="text-gray-500 mt-2">
          {voucher.dealTitle} at {voucher.storeName}
          {selectedDate && selectedSlot && <><br />{selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} at {new Date(selectedSlot.time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</>}
        </p>
        <p className="text-xs text-gray-400 mt-4">Your voucher is already paid for — nothing more to do until your appointment.</p>
      </div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{voucher.storeName}</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{voucher.dealTitle}</h1>
        <p className="mt-1 text-sm text-gray-500">Paid in full · ${voucher.dealPrice.toFixed(2)}</p>

        <div className="mt-8">
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-700"><CalendarIcon className="w-4 h-4" /> Pick a date</p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {days.map((d) => {
              const isSelected = selectedDateKey === dateKey(d);
              return (
                <button
                  key={dateKey(d)}
                  type="button"
                  onClick={() => { setSelectedDate(d); setSelectedSlot(null); }}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-center text-xs ${isSelected ? "border-primary bg-primary text-white" : "border-gray-200 text-gray-700"}`}
                  data-testid={`button-voucher-date-${dateKey(d)}`}
                >
                  <div className="font-semibold">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                  <div>{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedDateKey && (
          <div className="mt-6">
            <p className="flex items-center gap-2 text-sm font-semibold text-gray-700"><Clock3 className="w-4 h-4" /> Pick a time</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {slotsLoading ? (
                <div className="col-span-3 flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
              ) : slots && slots.length > 0 ? (
                slots.map((s) => (
                  <button
                    key={s.time}
                    type="button"
                    onClick={() => setSelectedSlot(s)}
                    className={`rounded-lg border py-2 text-sm ${selectedSlot?.time === s.time ? "border-primary bg-primary text-white" : "border-gray-200 text-gray-700"}`}
                    data-testid={`button-voucher-slot-${s.time}`}
                  >
                    {new Date(s.time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </button>
                ))
              ) : (
                <p className="col-span-3 py-4 text-center text-sm text-gray-400">No times available that day — try another date.</p>
              )}
            </div>
          </div>
        )}

        {selectedSlot && (
          <div className="mt-6 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Your info</p>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-primary" data-testid="input-voucher-name" />
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" type="tel" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-primary" data-testid="input-voucher-phone" />
            <button
              type="button"
              disabled={!customerName.trim() || !customerPhone.trim() || bookMutation.isPending}
              onClick={() => { setBookingError(null); bookMutation.mutate(); }}
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white disabled:opacity-50"
              data-testid="button-voucher-confirm"
            >
              {bookMutation.isPending ? "Booking…" : "Confirm appointment"}
            </button>
            {bookingError && <p className="text-xs text-red-600">{bookingError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
