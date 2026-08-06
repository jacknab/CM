import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Users, Clock, CheckCircle, Loader2, MapPin, Phone, X, Navigation, Bell } from "lucide-react";

type LocationStatus = "idle" | "requesting" | "granted" | "denied" | "unsupported";

interface QueueInfo {
  store: { id: number; name: string; phone?: string; address?: string };
  queueEnabled: boolean;
  waitingCount: number;
  estimatedWaitMinutes: number;
  avgServiceTime: number;
}

interface PositionInfo {
  id: number;
  position: number;
  estimatedWaitMinutes: number;
  status: string;
}

type Page = "loading" | "form" | "confirmed" | "notFound" | "closed" | "error";

export default function PublicCheckIn() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<Page>("loading");
  const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null);
  const [positionInfo, setPositionInfo] = useState<PositionInfo | null>(null);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  // Ref so the WS handler can call the latest refreshPosition without stale closures
  const refreshPositionRef = useRef<(() => void) | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/queue/${slug}`);
      if (res.status === 404) { setPage("notFound"); return; }
      const data = await res.json();
      setQueueInfo(data);
      if (!data.queueEnabled) { setPage("closed"); return; }
      if (page === "loading") setPage("form");
    } catch {
      if (page === "loading") setPage("error");
    }
  }, [slug, page]);

  useEffect(() => { fetchQueue(); }, [slug]);

  // Direct WS connection (public page — no auth context, so we can't rely on the global hook).
  // Reconnects automatically on drop; separate position refresh on queue_updated; 60s fallback.
  useEffect(() => {
    const storeId = queueInfo?.store.id;
    if (!storeId) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let alive = true;

    const connect = () => {
      ws = new WebSocket(`${protocol}//${window.location.host}/ws/notifications?storeId=${storeId}`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          if (msg.type === "queue_updated") {
            void fetchQueue();
            refreshPositionRef.current?.();
          }
        } catch {}
      };
      ws.onclose = () => { if (alive) reconnectTimer = setTimeout(connect, 5000); };
    };

    connect();
    const fallback = setInterval(fetchQueue, 60000);
    return () => {
      alive = false;
      clearTimeout(reconnectTimer);
      ws?.close();
      clearInterval(fallback);
    };
  }, [queueInfo?.store.id, fetchQueue]);

  // Request geolocation when form becomes visible
  useEffect(() => {
    if (page !== "form") return;
    if (!navigator.geolocation) { setLocationStatus("unsupported"); return; }
    if (locationStatus !== "idle") return;
    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocationStatus("granted");
      },
      () => { setLocationStatus("denied"); },
      { timeout: 12000, maximumAge: 300_000, enableHighAccuracy: false }
    );
  }, [page]);

  useEffect(() => {
    if (page !== "confirmed" || !positionInfo) return;
    const refreshPosition = async () => {
      try {
        const res = await fetch(`/api/public/queue/${slug}/position/${positionInfo.id}`);
        if (res.ok) setPositionInfo(await res.json());
      } catch {}
    };
    // Expose to WS handler via ref so the direct WS connection can trigger position refresh too
    refreshPositionRef.current = () => { void refreshPosition(); };
    const fallback = setInterval(refreshPosition, 30000);
    return () => {
      refreshPositionRef.current = null;
      clearInterval(fallback);
    };
  }, [page, positionInfo?.id, slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Please enter your name"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/public/queue/${slug}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.name.trim(),
          customerPhone: form.phone.trim() || null,
          partySize: 1,
          latitude: coords?.lat ?? null,
          longitude: coords?.lon ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to check in"); setSubmitting(false); return; }
      setPositionInfo({ id: data.id, position: data.position, estimatedWaitMinutes: data.estimatedWaitMinutes, status: "waiting" });
      setPage("confirmed");
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  };

  const handleCancel = async () => {
    if (!positionInfo) return;
    try {
      await fetch(`/api/waitlist/${positionInfo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
    } catch {}
    setPage("form");
    setPositionInfo(null);
    setForm({ name: "", phone: "" });
    fetchQueue();
  };

  if (page === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  if (page === "error") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-gray-500 text-sm mb-4">Unable to load the check-in page. Please try again.</p>
          <button onClick={() => { setPage("loading"); fetchQueue(); }}
            className="px-4 py-2 rounded-lg bg-teal-500 text-white text-sm font-semibold">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (page === "notFound") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-gray-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Store Not Found</h1>
          <p className="text-gray-500 text-sm">This check-in link is invalid or the store no longer exists.</p>
        </div>
      </div>
    );
  }

  if (page === "closed") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Queue Closed</h1>
          <p className="text-gray-500 text-sm">{queueInfo?.store.name} is not accepting online check-ins right now.</p>
          {queueInfo?.store.phone && (
            <a href={`tel:${queueInfo.store.phone}`} className="mt-4 inline-flex items-center gap-2 text-teal-600 font-medium text-sm">
              <Phone className="w-4 h-4" /> Call us
            </a>
          )}
        </div>
      </div>
    );
  }

  const storeName = queueInfo?.store.name || "Salon";

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white">
      <div className="max-w-md mx-auto px-4 pt-10 pb-16">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500 shadow-lg mb-4">
            <Users className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{storeName}</h1>
          <p className="text-gray-500 text-sm mt-1">Virtual Check-In</p>
        </div>

        {page === "form" && queueInfo && (
          <>
            {/* Wait info bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 flex items-center gap-4">
              <div className="flex-1 text-center border-r border-gray-100">
                <p className="text-2xl font-bold text-gray-900">{queueInfo.waitingCount}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {queueInfo.waitingCount === 1 ? "person ahead" : "people ahead"}
                </p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-2xl font-bold text-teal-600">
                  {queueInfo.waitingCount === 0 ? "Now!" : `~${queueInfo.estimatedWaitMinutes} min`}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">est. wait</p>
              </div>
            </div>

            {/* Smart SMS location banner */}
            {locationStatus === "requesting" && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 text-blue-700 text-sm px-4 py-3 rounded-xl mb-4">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                <span>Getting your location for smart SMS timing…</span>
              </div>
            )}
            {locationStatus === "granted" && (
              <div className="flex items-center gap-3 bg-teal-50 border border-teal-100 text-teal-700 text-sm px-4 py-3 rounded-xl mb-4">
                <Navigation className="w-4 h-4 flex-shrink-0" />
                <span><strong>Location shared!</strong> We'll text you when it's time to head over.</span>
              </div>
            )}
            {locationStatus === "denied" && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 text-amber-700 text-sm px-4 py-3 rounded-xl mb-4">
                <Bell className="w-4 h-4 flex-shrink-0" />
                <span>Add your phone number below and we'll text you when you're almost up!</span>
              </div>
            )}

            {/* Check-in form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Your Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="First and last name"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent text-base"
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Phone Number <span className="text-gray-400 font-normal">(optional — for text alerts)</span>
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(555) 000-0000"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent text-base"
                  autoComplete="tel"
                />
              </div>

              {error && (
                <p className="text-red-500 text-sm font-medium bg-red-50 px-4 py-3 rounded-xl">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 rounded-xl bg-teal-500 text-white font-bold text-base hover:bg-teal-600 transition-colors disabled:opacity-60 shadow-md shadow-teal-200 mt-2"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Adding you to the line…
                  </span>
                ) : (
                  "Get in Line →"
                )}
              </button>
            </form>

            {queueInfo.store.address && (
              <div className="mt-8 flex items-start gap-2 text-gray-400 text-sm">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{queueInfo.store.address}</span>
              </div>
            )}
          </>
        )}

        {page === "confirmed" && positionInfo && (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-teal-500 shadow-xl mb-6">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-1">You're in line!</h2>
            <p className="text-gray-500 text-sm mb-8">
              {positionInfo.status === "called"
                ? "🔔 You've been called! Head in now."
                : "We'll let you know when it's almost your turn."}
            </p>

            {/* Position card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
              <div className="flex items-center justify-between">
                <div className="text-center flex-1 border-r border-gray-100">
                  <p className="text-5xl font-black text-gray-900">#{positionInfo.position}</p>
                  <p className="text-xs text-gray-400 mt-1">your position</p>
                </div>
                <div className="text-center flex-1">
                  <p className="text-3xl font-bold text-teal-600">
                    {positionInfo.position <= 1 ? "Now!" : `~${positionInfo.estimatedWaitMinutes} min`}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">est. wait</p>
                </div>
              </div>
            </div>

            {positionInfo.status === "called" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-amber-800 font-semibold text-sm">
                🎉 It's your turn! Please head inside now.
              </div>
            )}

            <p className="text-xs text-gray-400 mb-6">This page updates automatically in real time</p>

            <button
              onClick={handleCancel}
              className="text-sm text-gray-400 hover:text-red-500 transition-colors underline underline-offset-2"
            >
              Cancel my spot
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
