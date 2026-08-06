import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

interface QueueEntry {
  id: number;
  displayName: string;
  status: string;
  partySize: number;
  estimatedWaitMinutes: number;
  isNext: boolean;
}

interface QueueData {
  store: { id: number; name: string; phone?: string };
  queueEnabled: boolean;
  waitingCount: number;
  calledCount: number;
  servedToday: number;
  estimatedWaitMinutes: number;
  avgServiceTime: number;
  queue: QueueEntry[];
}

export default function QueueDisplay() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<QueueData | null>(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/queue/${slug}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastUpdated(new Date());
      }
    } catch {}
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchQueue(); }, [slug]);

  // Direct WS connection (public page — no auth context, so we can't rely on the global hook).
  // Connect once storeId is known; reconnect automatically on drop; 30s fallback for missed events.
  useEffect(() => {
    const storeId = data?.store.id;
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
          if (msg.type === "queue_updated") void fetchQueue();
        } catch {}
      };
      ws.onclose = () => { if (alive) reconnectTimer = setTimeout(connect, 5000); };
    };

    connect();
    const fallback = setInterval(fetchQueue, 30000);
    return () => {
      alive = false;
      clearTimeout(reconnectTimer);
      ws?.close();
      clearInterval(fallback);
    };
  }, [data?.store.id, fetchQueue]);

  const waiting = data?.queue.filter(e => e.status === "waiting") || [];
  const serving = data?.queue.filter(e => ["called", "serving"].includes(e.status)) || [];

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=00D4AA&bgcolor=060E1A&data=${encodeURIComponent(window.location.origin + "/q/" + slug)}`;
  const checkInUrl = `${window.location.origin}/q/${slug}`;

  if (loading) {
    return (
      <div className="h-screen bg-[#060E1A] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#00D4AA]" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#060E1A] text-white flex flex-col overflow-hidden select-none"
      style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-10 py-5 border-b border-white/10 bg-[#0A1628] flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#00D4AA]/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-[#00D4AA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">{data?.store.name || "Queue"}</h1>
            <p className="text-[#00D4AA] text-sm font-semibold">Live Queue Board</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <StatChip label="Waiting" value={data?.waitingCount ?? 0} color="text-white" />
          <StatChip label="Served Today" value={data?.servedToday ?? 0} color="text-[#00D4AA]" />
          {waiting.length > 0 && (
            <StatChip
              label="Est. Wait"
              value={`~${waiting.length * (data?.avgServiceTime || 20)} min`}
              color="text-amber-400"
            />
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Queue list */}
        <div className="flex-1 flex flex-col overflow-hidden p-8">

          {/* Now Serving */}
          {serving.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2.5 h-2.5 rounded-full bg-[#00D4AA] animate-pulse" />
                <h2 className="text-sm font-bold text-[#00D4AA] uppercase tracking-widest">Now Serving</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                {serving.map(entry => (
                  <div key={entry.id}
                    className="flex items-center gap-3 bg-[#00D4AA]/15 border border-[#00D4AA]/40 rounded-2xl px-5 py-3">
                    <div className="w-3 h-3 rounded-full bg-[#00D4AA] animate-pulse flex-shrink-0" />
                    <span className="text-xl font-bold text-white">{entry.displayName}</span>
                    {entry.partySize > 1 && (
                      <span className="text-[#00D4AA] text-sm font-semibold">Party of {entry.partySize}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Waiting queue */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-bold text-white/40 uppercase tracking-widest">Up Next</h2>
            </div>

            {waiting.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-6xl mb-4">✨</div>
                <p className="text-2xl font-bold text-white/60">No one waiting right now</p>
                <p className="text-white/30 mt-2 text-lg">Check in below to be first in line!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {waiting.slice(0, 8).map((entry, idx) => (
                  <QueueRow key={entry.id} entry={entry} position={idx + 1} avgTime={data?.avgServiceTime || 20} />
                ))}
                {waiting.length > 8 && (
                  <div className="text-center py-3 text-white/30 text-sm font-medium">
                    + {waiting.length - 8} more in line
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right panel: check-in CTA */}
        <div className="w-72 flex-shrink-0 border-l border-white/10 bg-[#0A1628] flex flex-col items-center justify-center p-8 gap-6">
          <div className="text-center">
            <p className="text-white/40 text-sm font-semibold uppercase tracking-widest mb-2">Join the Line</p>
            <p className="text-white font-bold text-lg leading-tight">Scan or visit the link below to check in</p>
          </div>

          {/* QR Code */}
          <div className="bg-[#060E1A] p-4 rounded-2xl border border-[#00D4AA]/20">
            <img src={qrUrl} alt="Check-in QR" className="w-40 h-40 rounded-lg" />
          </div>

          <div className="text-center">
            <p className="text-[#00D4AA] text-sm font-mono font-bold break-all">{checkInUrl.replace(/^https?:\/\//, "")}</p>
          </div>

          <div className="text-center text-white/20 text-xs">
            Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-3xl font-black ${color}`}>{value}</p>
      <p className="text-white/30 text-xs font-semibold uppercase tracking-widest mt-0.5">{label}</p>
    </div>
  );
}

function QueueRow({ entry, position, avgTime }: { entry: QueueEntry; position: number; avgTime: number }) {
  const waitMins = (position - 1) * avgTime;
  return (
    <div className={`flex items-center gap-4 rounded-2xl px-5 py-3.5 ${
      position === 1 ? "bg-white/10 border border-white/20" : "bg-white/[0.04] border border-white/[0.06]"
    }`}>
      <span className={`text-2xl font-black w-10 text-center ${position === 1 ? "text-[#00D4AA]" : "text-white/30"}`}>
        {position}
      </span>
      <span className="flex-1 text-white font-bold text-lg">{entry.displayName}</span>
      {entry.partySize > 1 && (
        <span className="text-white/40 text-sm font-medium">×{entry.partySize}</span>
      )}
      <span className="text-white/40 text-sm font-medium w-20 text-right">
        {waitMins === 0 ? "Next!" : `~${waitMins} min`}
      </span>
    </div>
  );
}
