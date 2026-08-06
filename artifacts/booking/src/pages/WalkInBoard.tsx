import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore } from "@/hooks/use-store";

interface Svc  { id: number; name: string; duration: number; price: number; category: string; }
interface Turn { staffId: number; name: string; color: string | null; avatarThumb: string | null; isActive: boolean; turnPosition: number; activeCount: number; }
interface CheckIn {
  id: number; token: string; clientName: string; phone: string | null;
  services: Svc[]; status: string; appointmentId: number | null;
  staffId: number | null; staffName: string | null; staffColor: string | null; staffAvatar: string | null;
  createdAt: string;
}

const STATUS_ORDER = ["waiting", "called", "serving", "completed"] as const;
const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  waiting:   { label: "Waiting",      color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.3)",  icon: "⏳" },
  called:    { label: "Called",       color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.3)",  icon: "📣" },
  serving:   { label: "Now Serving",  color: "#34d399", bg: "rgba(52,211,153,0.1)",  border: "rgba(52,211,153,0.3)",  icon: "✂️" },
  completed: { label: "Completed",    color: "#94a3b8", bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.2)", icon: "✓" },
};

const CAT_EMOJI: Record<string, string> = {
  hair:"✂️", color:"🎨", colour:"🎨", nails:"💅", nail:"💅", skin:"✨", facial:"🌸",
  waxing:"💫", barber:"💈", barbering:"💈", massage:"🌊", lash:"👁️", brow:"🎯", makeup:"💄",
};
function catEmoji(c: string) { return CAT_EMOJI[(c ?? "").toLowerCase().split(/[\s,_\/]/)[0]] ?? "⭐"; }
function elapsed(dt: string) {
  const s = Math.floor((Date.now() - new Date(dt).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  return `${Math.floor(m/60)}h ${m%60}m ago`;
}

export default function WalkInBoard() {
  const navigate = useNavigate();
  const [checkins, setCheckins]   = useState<CheckIn[]>([]);
  const [turns, setTurns]         = useState<Turn[]>([]);
  const [loading, setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [now, setNow]             = useState(new Date());
  const [assigning, setAssigning] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { selectedStore } = useSelectedStore();
  const storeSlug = (selectedStore as any)?.bookingSlug as string | null | undefined;

  const fetchBoard = useCallback(async () => {
    try {
      const [boardRes, turnRes] = await Promise.all([
        fetch("/api/kiosk/walkins/today", { credentials: "include" }),
        fetch("/api/kiosk/turn",          { credentials: "include" }),
      ]);
      if (boardRes.ok) setCheckins(await boardRes.json());
      if (turnRes.ok)  setTurns(await turnRes.json());
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoard();
    pollRef.current = setInterval(fetchBoard, 15_000);
    const clockId = setInterval(() => setNow(new Date()), 1_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(clockId);
    };
  }, [fetchBoard]);

  const updateStatus = async (token: string, status: string) => {
    await fetch(`/api/public/kiosk/ticket/${token}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchBoard();
  };

  const assignStaff = async (id: number, staffId: number) => {
    await fetch(`/api/kiosk/board/${id}/assign`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId }),
    });
    setAssigning(null);
    fetchBoard();
  };

  const toggleTurn = async (staffId: number) => {
    await fetch(`/api/kiosk/turn/toggle/${staffId}`, { method: "POST", credentials: "include" });
    fetchBoard();
  };

  const BG_MAIN  = "linear-gradient(145deg, #050d1a 0%, #0a2027 40%, #071520 100%)";
  const BG_CARD  = "rgba(255,255,255,0.04)";
  const BORDER   = "rgba(255,255,255,0.08)";

  const byStatus = (s: string) => checkins.filter(c => c.status === s);
  const activeCount = checkins.filter(c => c.status !== "completed").length;

  return (
    <AppLayout>
      <div className="h-full flex flex-col overflow-hidden" style={{ background: BG_MAIN, minHeight: "calc(100vh - 0px)" }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-black text-white">Walk-In Board</h1>
              <p className="text-slate-500 text-sm">Real-time check-in queue</p>
            </div>
            {activeCount > 0 && (
              <div className="px-3 py-1 rounded-full text-sm font-bold"
                style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }}>
                {activeCount} active
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span className="text-slate-400">Live · {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            </div>
          </div>
        </div>

        {/* ── Main: columns + sidebar ─────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Status columns */}
          <div className="flex-1 grid grid-cols-4 gap-0 overflow-hidden">
            {STATUS_ORDER.map(status => {
              const meta = STATUS_META[status];
              const cards = byStatus(status);
              return (
                <div key={status} className="flex flex-col overflow-hidden"
                  style={{ borderRight: `1px solid ${BORDER}` }}>
                  {/* Column header */}
                  <div className="px-4 py-3 flex items-center justify-between shrink-0"
                    style={{ borderBottom: `1px solid ${BORDER}`, background: meta.bg }}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{meta.icon}</span>
                      <span className="font-bold uppercase tracking-widest text-xs" style={{ color: meta.color }}>
                        {meta.label}
                      </span>
                    </div>
                    <span className="text-sm font-bold rounded-full w-6 h-6 flex items-center justify-center"
                      style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                      {cards.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {loading && cards.length === 0 && (
                      <div className="text-slate-600 text-sm text-center py-4">Loading…</div>
                    )}
                    {!loading && cards.length === 0 && (
                      <div className="text-slate-700 text-sm text-center py-8">
                        {status === "completed" ? "No completions yet" : "None here"}
                      </div>
                    )}
                    {cards.map(c => (
                      <CheckInCard
                        key={c.id}
                        checkin={c}
                        status={status}
                        meta={meta}
                        bgCard={BG_CARD}
                        border={BORDER}
                        isAssigning={assigning === c.id}
                        onAssign={() => setAssigning(assigning === c.id ? null : c.id)}
                        onAssignStaff={sid => assignStaff(c.id, sid)}
                        onStatus={s => updateStatus(c.token, s)}
                        turns={turns}
                        storeSlug={storeSlug}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Turn queue sidebar ──────────────────────────────────────── */}
          <div className="w-52 flex flex-col shrink-0 overflow-hidden"
            style={{ borderLeft: `1px solid ${BORDER}` }}>
            <div className="px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#14b8a6" }}>Turn Order</p>
              <p className="text-slate-600 text-xs mt-0.5">Auto-assign order</p>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {turns.length === 0 && (
                <p className="text-slate-600 text-xs text-center py-4 px-3">No staff in turn queue yet</p>
              )}
              {turns.map((t, i) => (
                <div key={t.staffId}
                  className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => toggleTurn(t.staffId)}>
                  {/* Position badge */}
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      background: t.isActive ? (t.color ?? "#14b8a6") : "rgba(255,255,255,0.08)",
                      color: t.isActive ? "#fff" : "#64748b",
                      opacity: t.isActive ? 1 : 0.5,
                    }}>
                    {i + 1}
                  </div>
                  {/* Avatar / initials */}
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden"
                    style={{ background: t.color ?? "#14b8a6", opacity: t.isActive ? 1 : 0.4 }}>
                    {t.avatarThumb
                      ? <img src={t.avatarThumb} className="w-full h-full object-cover" />
                      : t.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: t.isActive ? "#fff" : "#475569" }}>
                      {t.name.split(" ")[0]}
                    </p>
                    {t.activeCount > 0 && (
                      <p className="text-xs" style={{ color: "#f59e0b" }}>{t.activeCount} active</p>
                    )}
                  </div>
                  {!t.isActive && <span className="text-slate-600 text-xs">off</span>}
                </div>
              ))}
            </div>
            <div className="px-3 py-3 shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
              <p className="text-slate-600 text-xs text-center">Tap name to toggle on/off turn</p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ── CheckIn card ─────────────────────────────────────────────────────────────
function CheckInCard({ checkin: c, status, meta, bgCard, border, isAssigning, onAssign, onAssignStaff, onStatus, turns, storeSlug }: {
  checkin: CheckIn; status: string; meta: typeof STATUS_META[string];
  bgCard: string; border: string;
  isAssigning: boolean; onAssign: () => void; onAssignStaff: (id: number) => void;
  onStatus: (s: string) => void; turns: Turn[];
  storeSlug?: string | null;
}) {
  const total = c.services.reduce((s, x) => s + (x.price || 0), 0);
  const dur   = c.services.reduce((s, x) => s + (x.duration || 0), 0);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: bgCard, border: `1px solid ${border}` }}>
      {/* Status stripe */}
      <div className="h-1" style={{ background: meta.color, opacity: 0.7 }} />

      <div className="p-4 space-y-3">
        {/* Client */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-white font-bold text-base leading-tight">{c.clientName}</p>
            {c.phone && <p className="text-slate-500 text-xs mt-0.5">{c.phone}</p>}
          </div>
          <span className="text-slate-600 text-xs whitespace-nowrap">{elapsed(c.createdAt)}</span>
        </div>

        {/* Services */}
        {c.services.length > 0 && (
          <div className="space-y-1">
            {c.services.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span>{catEmoji(s.category)}</span>
                  <span>{s.name}</span>
                </span>
                <span className="text-slate-500">{s.duration}m</span>
              </div>
            ))}
            <div className="flex justify-between text-xs pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-slate-500">{dur} min total</span>
              <span className="font-bold" style={{ color: meta.color }}>${total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Assigned staff */}
        <div>
          {c.staffName ? (
            <div className="flex items-center gap-2 cursor-pointer" onClick={onAssign}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ background: c.staffColor ?? "#14b8a6" }}>
                {c.staffName.charAt(0)}
              </div>
              <span className="text-slate-300 text-xs">{c.staffName}</span>
              <span className="text-slate-600 text-xs">↓</span>
            </div>
          ) : (
            <button onClick={onAssign}
              className="text-xs px-2 py-1 rounded-lg transition-colors hover:bg-white/10"
              style={{ border: "1px dashed rgba(255,255,255,0.15)", color: "#64748b" }}>
              + Assign stylist
            </button>
          )}
          {isAssigning && (
            <div className="mt-2 rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {turns.map(t => (
                <div key={t.staffId}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/10 transition-colors text-sm"
                  onClick={() => onAssignStaff(t.staffId)}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: t.color ?? "#14b8a6" }}>
                    {t.name.charAt(0)}
                  </div>
                  <span className="text-slate-200">{t.name}</span>
                  {t.activeCount > 0 && <span className="text-xs text-amber-400 ml-auto">{t.activeCount} active</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {status !== "completed" && (
          <div className="flex gap-2 pt-1">
            {status === "waiting" && (
              <ActionBtn label="📣 Call" color="#60a5fa" onClick={() => onStatus("called")} />
            )}
            {status === "called" && (
              <>
                <ActionBtn label="✂️ Start" color="#34d399" onClick={() => onStatus("serving")} />
                <ActionBtn label="↩ Wait" color="#94a3b8" onClick={() => onStatus("waiting")} small />
              </>
            )}
            {status === "serving" && (
              <ActionBtn label="✓ Done" color="#34d399" onClick={() => onStatus("completed")} />
            )}
          </div>
        )}
        {status === "completed" && (
          <div className="text-center text-xs py-1" style={{ color: "#64748b" }}>Service complete</div>
        )}

        {/* View Ticket */}
        {storeSlug && (
          <a
            href={`/kiosk/${storeSlug}/ticket/${c.token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs py-1.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: "#64748b", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            🎫 View Ticket
          </a>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ label, color, onClick, small = false }: {
  label: string; color: string; onClick: () => void; small?: boolean;
}) {
  return (
    <button onClick={onClick}
      className="flex-1 py-2 rounded-xl text-white font-bold transition-all active:scale-95 hover:brightness-110"
      style={{
        fontSize: small ? 11 : 12,
        background: `${color}22`,
        border: `1px solid ${color}44`,
        color,
      }}>
      {label}
    </button>
  );
}
