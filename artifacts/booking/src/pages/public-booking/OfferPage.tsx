/**
 * The page a client opens from the text "<business> has other times for you" (<slug>.certxa.com/?offer=<token>):
 * the times the professional offered that are still free, in the business's time zone. Picking one books it
 * straight away. Server: routes/bookingRequests.ts (publicRouter), lib/bookingRequests.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { formatInTz } from "@/lib/timezone";
import { SiteHeader, siteStyle } from "./SiteLook";
import { TimeZoneNote } from "./TimeZoneNote";
import type { BookingSiteLook, StoreData } from "./types";

type Offer = {
  status: "open" | "closed" | "booked";
  businessName: string;
  timezone: string;
  bookingUrl: string | null;
  look: BookingSiteLook;
  serviceName: string;
  duration: number;
  clientFirstName: string;
  times: string[];
  expiresAt?: string;
  bookedAt?: string | null;
};

export default function OfferPage({ token }: { token: string }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loadError, setLoadError] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [bookedTime, setBookedTime] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/public/booking-offer/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.message ?? "This link isn't valid.");
        setOffer(body);
      })
      .catch((e) => setLoadError(e.message));
  };
  useEffect(load, [token]);

  const store = useMemo(() => offer ? ({ id: 0, name: offer.businessName, timezone: offer.timezone, bookingSite: offer.look } as StoreData) : null, [offer]);
  const days = useMemo(() => {
    const byDay: Array<{ day: string; times: string[] }> = [];
    for (const time of offer?.times ?? []) {
      const day = formatInTz(time, offer!.timezone, "EEEE, MMMM d");
      const last = byDay[byDay.length - 1];
      if (last && last.day === day) last.times.push(time); else byDay.push({ day, times: [time] });
    }
    return byDay;
  }, [offer]);

  const book = async () => {
    if (!picked) return;
    setSaving(true); setError("");
    try {
      const r = await fetch(`/api/public/booking-offer/${encodeURIComponent(token)}/book`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ time: picked }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(body?.message ?? "That time couldn't be booked. Please pick another.");
        setPicked(null);
        load();
        return;
      }
      setBookedTime(picked);
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6 text-center">
        <div><h1 className="text-xl font-semibold text-gray-900">This link isn't valid</h1><p className="mt-2 text-gray-500">Check the link in your text message, or ask the business to send a new one.</p></div>
      </div>
    );
  }
  if (!offer || !store) {
    return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  }

  const finalTime = bookedTime ?? (offer.status === "booked" ? offer.bookedAt ?? null : null);
  return (
    <div className="min-h-screen bg-white text-gray-900" style={siteStyle(offer.look)}>
      <SiteHeader store={store} />
      <main className="max-w-md mx-auto px-4 pb-16">
        {finalTime || offer.status === "booked" ? (
          <div className="text-center py-8" data-testid="offer-booked">
            <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
            <h2 className="mt-3 text-2xl font-bold">You're booked</h2>
            <p className="mt-2 text-gray-600">{offer.serviceName} with {offer.businessName}</p>
            {finalTime ? <p className="mt-1 font-medium">{formatInTz(finalTime, offer.timezone, "EEEE, MMMM d 'at' h:mm a")}</p> : null}
            <p className="mt-4 text-sm text-gray-500">You'll get a confirmation by text.</p>
          </div>
        ) : offer.status === "closed" || offer.times.length === 0 ? (
          <div className="text-center py-8" data-testid="offer-closed">
            <h2 className="text-xl font-semibold">These times are no longer available</h2>
            <p className="mt-2 text-gray-500">{offer.status === "closed" ? "This offer has ended." : "The times offered have been taken."} You can still book another time.</p>
            {offer.bookingUrl ? <a href={offer.bookingUrl} className="mt-5 inline-block rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">Book a time</a> : null}
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-center" data-testid="offer-heading">Pick a new time, {offer.clientFirstName}</h2>
            <p className="mt-1 text-center text-sm text-gray-500">{offer.businessName} can see you for {offer.serviceName} at one of these times.</p>
            <TimeZoneNote timezone={offer.timezone} at={offer.times[0]} className="mt-1 text-center text-xs text-gray-500" />
            <div className="mt-5 space-y-5">
              {days.map(({ day, times }) => (
                <div key={day}>
                  <p className="mb-2 text-sm font-semibold text-gray-700">{day}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {times.map((time) => (
                      <button
                        key={time} type="button" onClick={() => setPicked(time)} data-testid={`offer-time-${time}`}
                        className={`rounded-xl border py-3 text-sm font-semibold transition-colors ${picked === time ? "border-primary bg-primary text-primary-foreground" : "border-gray-200 bg-white text-gray-800 hover:border-primary"}`}
                      >
                        {formatInTz(time, offer.timezone, "h:mm a")}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {error ? <p className="mt-4 text-center text-sm text-red-600">{error}</p> : null}
            <button
              type="button" disabled={!picked || saving} onClick={() => void book()} data-testid="offer-book"
              className="mt-6 w-full rounded-full bg-primary py-3.5 font-semibold text-primary-foreground disabled:opacity-40"
            >
              {saving ? "Booking…" : picked ? `Book ${formatInTz(picked, offer.timezone, "EEE, MMM d 'at' h:mm a")}` : "Choose a time"}
            </button>
            {offer.expiresAt ? <p className="mt-3 text-center text-xs text-gray-400">Open until {formatInTz(offer.expiresAt, offer.timezone, "EEEE, MMMM d")}</p> : null}
          </>
        )}
      </main>
    </div>
  );
}
