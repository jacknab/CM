import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

interface ServiceItem { id: number; name: string; duration: number; price: number; }

interface TicketData {
  token: string;
  clientName: string;
  phone: string;
  services: ServiceItem[];
  status: string;
  appointmentId: number | null;
  staffName: string | null;
  createdAt: string;
  storeName: string;
  storeAddress: string;
  storeTimezone: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  waiting: "Waiting",
  called: "Called to Chair",
  serving: "Now Serving",
  completed: "Completed",
};

const STATUS_STYLES: Record<string, string> = {
  waiting: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40",
  called: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  serving: "bg-teal-500/15 text-teal-300 border-teal-500/40",
  completed: "bg-green-500/15 text-green-300 border-green-500/40",
};

export default function KioskTicket() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/kiosk/ticket/${token}`)
      .then(r => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(data => { setTicket(data); setLoading(false); })
      .catch(() => { setError("Ticket not found or expired."); setLoading(false); });
  }, [token]);

  const updateStatus = async (status: string) => {
    if (!token) return;
    setUpdating(true);
    try {
      await fetch(`/api/public/kiosk/ticket/${token}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setTicket(prev => prev ? { ...prev, status } : prev);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !ticket) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center space-y-2">
        <div className="text-5xl mb-4">⚠️</div>
        <p className="text-red-400 text-xl">{error || "Ticket not found"}</p>
        <p className="text-zinc-500">This ticket may have expired (tickets last 4 hours).</p>
      </div>
    </div>
  );

  const total = ticket.services.reduce((s, sv) => s + (sv.price || 0), 0);
  const totalDuration = ticket.services.reduce((s, sv) => s + (sv.duration || 0), 0);
  const checkedInTime = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...(ticket.storeTimezone ? { timeZone: ticket.storeTimezone } : {}),
  }).format(new Date(ticket.createdAt));

  return (
    <div className="min-h-screen bg-zinc-950 py-8 px-4 flex items-start justify-center">
      <div className="w-full max-w-lg space-y-4">

        {/* Store header */}
        <div className="text-center mb-2">
          <p className="text-zinc-500 text-sm">{ticket.storeName}</p>
          {ticket.storeAddress && <p className="text-zinc-600 text-xs">{ticket.storeAddress}</p>}
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-white text-center">Walk-In Ticket</h1>

        {/* Status pill */}
        <div className={`border rounded-xl px-4 py-3 text-center text-lg font-semibold ${STATUS_STYLES[ticket.status] ?? STATUS_STYLES.waiting}`}>
          {STATUS_LABELS[ticket.status] ?? ticket.status}
        </div>

        {/* Client + services card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">Client</p>
              <p className="text-white text-2xl font-bold">{ticket.clientName}</p>
              {ticket.phone && (
                <p className="text-zinc-400 text-sm mt-1">{ticket.phone}</p>
              )}
              {ticket.staffName && (
                <p className="text-teal-400 text-sm mt-1.5 font-medium">✂️ {ticket.staffName}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">Checked In</p>
              <p className="text-white font-semibold text-lg">{checkedInTime}</p>
            </div>
          </div>

          <hr className="border-zinc-800" />

          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3">Services Requested</p>
            {ticket.services.length === 0 ? (
              <p className="text-zinc-500 italic">No services selected</p>
            ) : (
              <div className="space-y-1">
                {ticket.services.map((s, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-zinc-800/60 last:border-0">
                    <div>
                      <p className="text-white font-medium">{s.name}</p>
                      <p className="text-zinc-500 text-sm">{s.duration} min</p>
                    </div>
                    <p className="text-teal-300 font-semibold">${(s.price || 0).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {ticket.services.length > 0 && (
            <div className="flex justify-between items-center pt-2 border-t border-zinc-800">
              <span className="text-zinc-400">Estimated total ({totalDuration} min)</span>
              <span className="text-white font-bold text-xl">${total.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Booking reference */}
        {ticket.appointmentId && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3 flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Booking Reference</span>
            <span className="text-white font-mono font-bold text-lg">#{ticket.appointmentId}</span>
          </div>
        )}

        {/* Staff action buttons */}
        {ticket.status !== "completed" && (
          <div className="space-y-3 pt-2">
            {ticket.status === "waiting" && (
              <button
                onClick={() => updateStatus("called")}
                disabled={updating}
                className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold text-lg hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                📣 Call Client to Chair
              </button>
            )}
            {ticket.status === "called" && (
              <>
                <button
                  onClick={() => updateStatus("serving")}
                  disabled={updating}
                  className="w-full py-4 rounded-xl bg-teal-600 text-white font-bold text-lg hover:bg-teal-500 active:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  💈 Start Service
                </button>
                <button
                  onClick={() => updateStatus("waiting")}
                  disabled={updating}
                  className="w-full py-3 rounded-xl border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-900 disabled:opacity-50"
                >
                  ← Move Back to Waiting
                </button>
              </>
            )}
            {ticket.status === "serving" && (
              <button
                onClick={() => updateStatus("completed")}
                disabled={updating}
                className="w-full py-4 rounded-xl bg-green-600 text-white font-bold text-lg hover:bg-green-500 active:bg-green-700 disabled:opacity-50 transition-colors"
              >
                ✓ Mark as Completed
              </button>
            )}
          </div>
        )}

        {ticket.status === "completed" && (
          <div className="text-center py-6 border border-green-500/30 rounded-2xl bg-green-500/10">
            <span className="text-green-400 text-2xl font-semibold">✓ Service Completed</span>
            <p className="text-zinc-500 text-sm mt-1">This ticket has been closed.</p>
          </div>
        )}

        {/* Token reference */}
        <p className="text-center text-zinc-700 text-xs font-mono pt-2">
          Token: {ticket.token.substring(0, 12)}…
        </p>
      </div>
    </div>
  );
}
