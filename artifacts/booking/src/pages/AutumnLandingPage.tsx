import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import MarketingLayout from "@/components/layout/MarketingLayout";
import {
  Phone, Calendar, Clock, Sparkles, ArrowRight, ShieldCheck,
  CheckCircle2, Star, MessageSquare, Zap, Users, CreditCard,
  PhoneCall, RefreshCw, TrendingUp, Volume2, X, BarChart2,
} from "lucide-react";

/* ─── Demo live calendar (shown in success state of DemoModal) ─── */
type DemoAppt = {
  id: number;
  date: string;
  duration: number;
  status: string | null;
  serviceName: string | null;
  staffName: string | null;
};

type DemoStaffMember = { id: number; name: string; color: string | null };

const STATUS_COLORS: Record<string, string> = {
  pending:     "#6d28d9",
  confirmed:   "#2563eb",
  "in-progress": "#d97706",
  completed:   "#10b981",
};

function apptColor(status: string | null, fallback = "#6d28d9") {
  return STATUS_COLORS[status ?? "pending"] ?? fallback;
}

function fmt12(date: Date) {
  const h = date.getHours(), m = date.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 || 12;
  return m === 0 ? `${hh}${ampm}` : `${hh}:${m.toString().padStart(2, "0")}${ampm}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DemoCalendar({
  storeId = 2,
  staffId,
  staffName,
  accentColor = "#6d28d9",
}: {
  storeId?: number;
  staffId?: number;
  staffName?: string;
  accentColor?: string;
}) {
  const [appts, setAppts] = useState<DemoAppt[]>([]);
  const [connected, setConnected] = useState(false);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  // Ref that always holds the latest appointment IDs so the WS handler
  // can diff correctly even though it's defined once in the effect closure.
  const apptIdsRef = useRef<Set<number>>(new Set());

  const buildUrl = () => {
    const base = `/api/autumn/demo-calendar/appointments?storeId=${storeId}`;
    return staffId != null ? `${base}&staffId=${staffId}` : base;
  };

  // Keep the ref in sync with state on every render
  apptIdsRef.current = new Set(appts.map((a) => a.id));

  const load = useRef(async () => {
    try {
      const res = await fetch(buildUrl());
      const data = await res.json();
      if (data.appointments) setAppts(data.appointments);
    } catch {}
  });

  useEffect(() => {
    load.current = async () => {
      try {
        const res = await fetch(buildUrl());
        const data = await res.json();
        if (data.appointments) setAppts(data.appointments);
      } catch {}
    };
    load.current();

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/notifications?storeId=${storeId}`);
    wsRef.current = ws;

    ws.onopen  = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = async (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "new_booking" || msg.type === "booking_created") {
          // Snapshot current IDs from the ref (always up-to-date, no stale closure)
          const prevIds = new Set(apptIdsRef.current);
          await load.current();
          // After load updates state, find which IDs are brand-new and highlight them
          setAppts(curr => {
            const added = curr.filter(a => !prevIds.has(a.id)).map(a => a.id);
            if (added.length) setNewIds(prev => new Set([...prev, ...added]));
            return curr;
          });
          setTimeout(() => setNewIds(new Set()), 3000);
        }
      } catch {}
    };

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
    }, 12000);

    return () => { ws.close(); clearInterval(ping); };
  }, [storeId, staffId]);

  // Build days: today + next 6
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  const byDay = (day: Date) =>
    appts
      .filter(a => {
        const d = new Date(a.date);
        return d.getFullYear() === day.getFullYear() &&
               d.getMonth() === day.getMonth() &&
               d.getDate() === day.getDate();
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const hasAny = appts.length > 0;

  return (
    <div>
      {/* Header row — "TECHNICIAN - NAME  ● Live" */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{
          fontSize: "0.78rem", fontWeight: 700, color: "#374151",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          {staffName ? `Technician — ${staffName}` : "Live Calendar"}
        </span>
        <span style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: "0.75rem", fontWeight: 600,
          color: connected ? "#10b981" : "#9ca3af",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: connected ? "#10b981" : "#d1d5db",
            display: "inline-block",
            ...(connected ? { animation: "pulse 1.8s infinite" } : {}),
          }} />
          {connected ? "Live" : "Connecting…"}
        </span>
      </div>

      {/* 7-day columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {days.map((day, i) => {
          const isToday = i === 0;
          const dayAppts = byDay(day);
          return (
            <div key={i} style={{
              background: isToday ? `${accentColor}08` : "#f9fafb",
              border: isToday ? `1.5px solid ${accentColor}` : "1.5px solid #e5e7eb",
              borderRadius: 10, padding: "8px 5px",
              minHeight: 84,
            }}>
              <div style={{ textAlign: "center", marginBottom: 5 }}>
                <div style={{ fontSize: "0.63rem", fontWeight: 700, color: isToday ? accentColor : "#9ca3af", textTransform: "uppercase" }}>
                  {DAY_NAMES[day.getDay()]}
                </div>
                <div style={{
                  fontSize: "0.85rem", fontWeight: 800,
                  color: isToday ? accentColor : "#111827",
                  background: isToday ? `${accentColor}18` : "transparent",
                  borderRadius: "50%",
                  width: 24, height: 24, lineHeight: "24px",
                  margin: "2px auto 0",
                }}>
                  {day.getDate()}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <AnimatePresence>
                  {dayAppts.map(a => {
                    const isNew = newIds.has(a.id);
                    const color = apptColor(a.status, accentColor);
                    return (
                      <motion.div
                        key={a.id}
                        initial={isNew ? { opacity: 0, scale: 0.8, y: -4 } : false}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.25 }}
                        title={`${a.serviceName ?? "Appt"} — ${a.staffName ?? "Staff"}`}
                        style={{
                          background: color + "18",
                          border: `1px solid ${color}40`,
                          borderLeft: `3px solid ${color}`,
                          borderRadius: 5,
                          padding: "3px 4px",
                          boxShadow: isNew ? `0 0 0 2px ${color}60` : "none",
                          transition: "box-shadow 0.5s",
                        }}
                      >
                        <div style={{ fontSize: "0.6rem", fontWeight: 700, color, lineHeight: 1.2 }}>
                          {fmt12(new Date(a.date))}
                        </div>
                        <div style={{ fontSize: "0.58rem", color: "#374151", lineHeight: 1.2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                          {a.serviceName ?? "Appointment"}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {dayAppts.length === 0 && (
                  <div style={{ fontSize: "0.58rem", color: "#d1d5db", textAlign: "center", paddingTop: 4 }}>—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!hasAny && (
        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#9ca3af", marginTop: 8 }}>
          No appointments yet — call and watch one appear!
        </p>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

/* ─── Demo phone number popup ─── */
const DEMO_PHONE_DISPLAY = "(619) 604-6886";
const DEMO_STORE_ID = 2;
const DEMO_DURATION_SECS = 5 * 60; // 5 minutes

function DemoModal({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [salonName, setSalonName] = useState<string>("Fabulous Nails");
  const [staffList, setStaffList] = useState<DemoStaffMember[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(DEMO_DURATION_SECS);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch store info + staff on mount
  useEffect(() => {
    fetch(`/api/autumn/demo-store-info?storeId=${DEMO_STORE_ID}`)
      .then(r => r.json())
      .then(data => {
        if (data.store?.name) setSalonName(data.store.name);
        if (Array.isArray(data.staff) && data.staff.length > 0) setStaffList(data.staff);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Countdown timer — starts when demo unlocks
  useEffect(() => {
    if (!success) return;
    setSecondsLeft(DEMO_DURATION_SECS);
    const iv = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { clearInterval(iv); onClose(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [success, onClose]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const isLow    = secondsLeft <= 60;
  const isUrgent = secondsLeft <= 20;
  const timerColor = isUrgent ? "#dc2626" : isLow ? "#ea580c" : "#6d28d9";
  const timerBg    = isUrgent ? "#fef2f2" : isLow ? "#fff7ed" : "#f5f3ff";
  const timerBorder = isUrgent ? "#fca5a5" : isLow ? "#fdba74" : "#c4b5fd";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!phone.trim()) { setError("Please enter your phone number."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/autumn/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      setSuccess(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  const STAFF_COLORS = ["#6d28d9", "#db2777", "#2563eb", "#0891b2"];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        overflowY: "auto",
        padding: "24px 16px",
      }}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ duration: 0.2 }}
        style={{
          background: "#fff", borderRadius: 20, padding: "32px 32px 28px",
          width: "100%", maxWidth: success ? 820 : 460, position: "relative",
          boxShadow: "0 24px 60px rgba(0,0,0,0.2)",
          transition: "max-width 0.3s ease",
          flexShrink: 0,
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 16, right: 16, zIndex: 2,
            background: "none", border: "none", cursor: "pointer",
            color: "#9ca3af", padding: 4, lineHeight: 1,
          }}
        >
          <X size={20} />
        </button>

        {/* ── Countdown timer (success state only) ── */}
        {success && (
          <div style={{
            position: "absolute", top: 14, right: 48, zIndex: 2,
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 11px", borderRadius: 50,
            background: timerBg,
            border: `1.5px solid ${timerBorder}`,
            transition: "background 0.4s, border-color 0.4s",
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: timerColor, display: "inline-block",
              animation: "demopulse 1.4s infinite",
            }} />
            <span style={{
              fontSize: "0.82rem", fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: timerColor,
              letterSpacing: "0.04em",
              transition: "color 0.4s",
            }}>
              {fmtTime(secondsLeft)}
            </span>
          </div>
        )}

        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: "#ede9fe", display: "flex", alignItems: "center",
          justifyContent: "center", marginBottom: 18,
        }}>
          <PhoneCall size={24} color="#6d28d9" />
        </div>

        {/* ════ STEP 1 — Phone entry ════ */}
        {!success ? (
          <>
            {/* Live badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 14,
              padding: "3px 10px", borderRadius: 50,
              background: "#fef2f2", border: "1px solid #fca5a5" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444",
                display: "inline-block", animation: "demopulse 1.5s infinite" }} />
              <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#dc2626",
                letterSpacing: "0.07em", textTransform: "uppercase" }}>
                Real Live Demo
              </span>
            </div>

            <h2 style={{ fontSize: "1.45rem", fontWeight: 800, color: "#111827", marginBottom: 6 }}>
              Try Autumn — Fabulous Nails
            </h2>

            {/* Context card */}
            <div style={{
              background: "#f5f3ff", border: "1px solid #ddd6fe",
              borderRadius: 12, padding: "13px 16px", marginBottom: 16,
            }}>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#4c1d95", marginBottom: 7 }}>
                💅 What to do:
              </div>
              <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: "0.83rem", color: "#374151", lineHeight: 1.95 }}>
                <li>Call the number we give you and ask Autumn to <strong>book an appointment</strong></li>
                <li>Pick <strong>any day of the week</strong> shown on the calendar</li>
                <li>You can even <strong>request a specific technician</strong> by name</li>
              </ul>
            </div>

            <p style={{ fontSize: "0.88rem", color: "#6b7280", lineHeight: 1.6, marginBottom: 22 }}>
              Enter your phone number to unlock the demo line. This is a{" "}
              <strong style={{ color: "#111827" }}>real live call</strong> to a real AI receptionist —
              once you submit you'll have exactly{" "}
              <strong style={{ color: "#6d28d9" }}>5 minutes</strong> to try it.
            </p>

            <form onSubmit={handleSubmit}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                Your Phone Number
              </label>
              <input
                ref={inputRef}
                type="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value); setError(""); }}
                placeholder="(555) 867–5309"
                style={{
                  width: "100%", padding: "14px 16px", borderRadius: 12,
                  border: error ? "1.5px solid #ef4444" : "1.5px solid #e5e7eb",
                  fontSize: "1rem", color: "#111827", outline: "none",
                  boxSizing: "border-box", marginBottom: error ? 6 : 16,
                  transition: "border-color .15s",
                }}
                onFocus={e => { if (!error) e.target.style.borderColor = "#6d28d9"; }}
                onBlur={e => { if (!error) e.target.style.borderColor = "#e5e7eb"; }}
              />
              {error && (
                <p style={{ color: "#ef4444", fontSize: "0.82rem", marginBottom: 12 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%", padding: "15px", borderRadius: 50,
                  background: loading ? "#a78bfa" : "#6d28d9",
                  color: "#fff", fontWeight: 700, fontSize: "1rem",
                  border: "none", cursor: loading ? "not-allowed" : "pointer",
                  transition: "background .15s", marginBottom: 14,
                }}
              >
                {loading ? "Saving…" : "Start My 5-Minute Demo →"}
              </button>

              <p style={{ textAlign: "center", fontSize: "0.77rem", color: "#9ca3af", lineHeight: 1.5 }}>
                US numbers only · One demo per number · We store your number only to prevent repeat demos and keep costs fair.
              </p>
            </form>
          </>
        ) : (
          /* ════ STEP 2 — Calendar view ════ */
          <div>
            {/* Urgency warning when < 60s left */}
            {isLow && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: isUrgent ? "#fef2f2" : "#fff7ed",
                  border: `1px solid ${isUrgent ? "#fca5a5" : "#fdba74"}`,
                  borderRadius: 10, padding: "9px 14px", marginBottom: 14,
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: "0.82rem", fontWeight: 600,
                  color: isUrgent ? "#dc2626" : "#ea580c",
                }}
              >
                <span style={{ fontSize: "1rem" }}>{isUrgent ? "⚠️" : "⏱️"}</span>
                {isUrgent
                  ? `Demo closing in ${secondsLeft} second${secondsLeft !== 1 ? "s" : ""}…`
                  : "Less than a minute left — finish your call!"}
              </motion.div>
            )}

            {/* Phone number header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%", background: "#d1fae5",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <CheckCircle2 size={24} color="#10b981" />
              </div>
              <div>
                <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#111827", margin: 0, letterSpacing: "-0.02em" }}>
                  {DEMO_PHONE_DISPLAY}
                </h2>
                <p style={{ fontSize: "0.84rem", color: "#6b7280", margin: "3px 0 0" }}>
                  Call now and book an appointment at {salonName}. Watch the calendar update live!
                </p>
              </div>
            </div>

            {/* Tips callout */}
            <div style={{
              background: "#f5f3ff", border: "1px solid #ddd6fe",
              borderRadius: 10, padding: "11px 14px", marginBottom: 18,
              display: "flex", alignItems: "flex-start", gap: 9,
              fontSize: "0.82rem", color: "#4c1d95", lineHeight: 1.75,
            }}>
              <span style={{ fontSize: "1.1rem", flexShrink: 0, marginTop: 1 }}>💡</span>
              <div>
                <strong>Tip:</strong> Tell Autumn which day works for you — any day shown below.
                You can also <strong>request a specific technician</strong> by name and she'll check their availability.
              </div>
            </div>

            {/* Per-staff live calendars — side-by-side grid */}
            {(() => {
              const list = staffList.length > 0 ? staffList : [{ id: undefined, name: undefined, color: null } as any];
              const cols  = list.length >= 2 ? 2 : 1;
              return (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                  gap: 16,
                }}>
                  {list.map((s: DemoStaffMember, idx: number) => {
                    const color = s.color || STAFF_COLORS[idx % STAFF_COLORS.length];
                    return (
                      <div key={s.id ?? idx} style={{
                        background: "#fafafa", borderRadius: 14,
                        border: "1px solid #f0eef8", padding: "12px 10px",
                      }}>
                        <DemoCalendar
                          storeId={DEMO_STORE_ID}
                          staffId={s.id}
                          staffName={s.name}
                          accentColor={color}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
              <button
                onClick={onClose}
                style={{
                  padding: "10px 28px", borderRadius: 50, background: "#6d28d9",
                  color: "#fff", fontWeight: 700, border: "none", cursor: "pointer", fontSize: "0.9rem",
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}

        <style>{`
          @keyframes demopulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.3; }
          }
        `}</style>
      </motion.div>
    </div>
  );
}

const PLUM      = "#3B0764";
const PLUM_MID  = "#5B21B6";
const VIOLET    = "#6D28D9";
const GOLD      = "#F59E0B";
const GREEN     = "#10B981";
const CREAM     = "#faf9ff";

/* ─── Two call scenarios for the hero phone animation ─── */
type HeroMsg = { from: "autumn" | "client"; text: string };

/* Scenario A — 3 bubbles: Autumn → Caller → Autumn */
const SCENARIO_A: HeroMsg[] = [
  { from: "autumn", text: "Thank you for calling Fabulous Nails! This is Autumn. How can I help you today?" },
  { from: "client", text: "Hi! I'd like to book a gel manicure this Wednesday." },
  { from: "autumn", text: "Perfect — Wednesday at 3:00 PM with Lily is open. Want me to book that for you?" },
];
const SCENARIO_A_DELAYS = [800, 4200, 7800];
const SCENARIO_A_LOOP   = 12000;

/* Scenario B — 4 bubbles: Caller → Autumn → Caller → Autumn */
const SCENARIO_B: HeroMsg[] = [
  { from: "client", text: "Hi, I need to reschedule my Thursday appointment." },
  { from: "autumn", text: "Of course! I can help with that. What's the name on the booking?" },
  { from: "client", text: "It's Sarah Johnson." },
  { from: "autumn", text: "Got it, Sarah — moved you to Saturday at 10:00 AM. Confirmation text on its way!" },
];
const SCENARIO_B_DELAYS = [800, 4000, 7200, 10800];
const SCENARIO_B_LOOP   = 15000;

const RING_MS = 2400; // ring duration before auto-answering

function HeroCallChat() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [phase, setPhase]             = useState<"ringing" | "connected" | "sweeping">("ringing");
  const [visible, setVisible]         = useState(0);
  const [loopKey, setLoopKey]         = useState(0);
  const [callSecs, setCallSecs]       = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const msgs   = scenarioIdx === 0 ? SCENARIO_A   : SCENARIO_B;
  const delays = scenarioIdx === 0 ? SCENARIO_A_DELAYS : SCENARIO_B_DELAYS;
  const loopMs = scenarioIdx === 0 ? SCENARIO_A_LOOP   : SCENARIO_B_LOOP;

  /* ringing → connected → message animation — loops, alternates scenarios */
  useEffect(() => {
    let msgTimers: ReturnType<typeof setTimeout>[] = [];
    setVisible(0);
    setCallSecs(0);
    setPhase("ringing");

    /* answer after RING_MS */
    const answerTimer = setTimeout(() => {
      setPhase("connected");
      msgTimers = delays.map((d, i) =>
        setTimeout(() => setVisible(c => Math.max(c, i + 1)), d)
      );
    }, RING_MS);

    /* sweep bubbles upward, then start next loop */
    const SWEEP_MS = 900;
    const sweepTimer = setTimeout(() => setPhase("sweeping"), RING_MS + loopMs);

    const loopTimer = setTimeout(() => {
      setScenarioIdx(s => (s + 1) % 2);
      setLoopKey(k => k + 1);
    }, RING_MS + loopMs + SWEEP_MS);

    return () => {
      clearTimeout(answerTimer);
      msgTimers.forEach(clearTimeout);
      clearTimeout(sweepTimer);
      clearTimeout(loopTimer);
    };
  }, [loopKey]);

  /* auto-scroll */
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visible]);

  /* call timer — only ticks while connected */
  useEffect(() => {
    if (phase !== "connected") return;
    const iv = setInterval(() => setCallSecs(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  const fmtCall = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const isRinging     = phase === "ringing";
  const isSweeping    = phase === "sweeping";
  /* who is speaking right now — last revealed message's speaker */
  const activeSpeaker = (visible > 0 && msgs[visible - 1]) ? msgs[visible - 1].from : "autumn";

  return (
    <div style={{ display: "flex", gap: 20, marginTop: 18, alignItems: "flex-start", height: 420 }}>

      {/* ── iPhone mockup ── */}
      <div style={{
        width: 178, flexShrink: 0,
        background: "linear-gradient(175deg, #2c2c2e 0%, #111113 100%)",
        borderRadius: 50, padding: 8,
        boxShadow: "0 36px 90px rgba(0,0,0,.75), inset 0 0 0 1.5px rgba(255,255,255,.16), inset 0 1px 0 rgba(255,255,255,.24)",
        position: "relative", alignSelf: "center",
      }}>
        {/* Left buttons: silent switch + vol up + vol down */}
        <div style={{ position: "absolute", left: -4, top: 88, width: 4, height: 22, background: "linear-gradient(90deg,#1a1a1c,#333)", borderRadius: "3px 0 0 3px" }} />
        <div style={{ position: "absolute", left: -4, top: 122, width: 4, height: 36, background: "linear-gradient(90deg,#1a1a1c,#333)", borderRadius: "3px 0 0 3px" }} />
        <div style={{ position: "absolute", left: -4, top: 168, width: 4, height: 36, background: "linear-gradient(90deg,#1a1a1c,#333)", borderRadius: "3px 0 0 3px" }} />
        {/* Right button: power */}
        <div style={{ position: "absolute", right: -4, top: 140, width: 4, height: 60, background: "linear-gradient(90deg,#333,#1a1a1c)", borderRadius: "0 3px 3px 0" }} />

        {/* Screen */}
        <div style={{
          background: isRinging
            ? "linear-gradient(170deg, #0c1a30 0%, #060e1e 55%, #020609 100%)"
            : isSweeping
            ? "linear-gradient(180deg, #0a0a0a 0%, #050505 100%)"
            : "linear-gradient(170deg, #1a0838 0%, #0a031a 45%, #040110 100%)",
          borderRadius: 42, height: 394,
          display: "flex", flexDirection: "column", alignItems: "center",
          overflow: "hidden", position: "relative",
          transition: "background 0.5s ease",
        }}>
          {/* Dynamic island */}
          <div style={{
            width: 90, height: 30, background: "#000",
            borderRadius: "0 0 24px 24px", flexShrink: 0,
          }} />

          {/* iOS status bar */}
          <div style={{
            width: "100%", padding: "5px 18px 0",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0, marginBottom: isRinging ? 4 : 0,
          }}>
            <div style={{ fontSize: ".7rem", color: "#fff", fontWeight: 700, letterSpacing: "-.01em" }}>12:00</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {/* Signal bars */}
              <svg width="15" height="11" viewBox="0 0 15 11" fill="white">
                <rect x="0"   y="6"   width="2.8" height="5"   rx=".6" opacity=".4"/>
                <rect x="4"   y="4.5" width="2.8" height="6.5" rx=".6" opacity=".65"/>
                <rect x="8"   y="2.5" width="2.8" height="8.5" rx=".6" opacity=".85"/>
                <rect x="12"  y="0"   width="2.8" height="11"  rx=".6"/>
              </svg>
              {/* WiFi */}
              <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                <circle cx="6.5" cy="9" r="1.2" fill="white"/>
                <path d="M3.2 6.2a4.66 4.66 0 0 1 6.6 0" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M1 3.8A8 8 0 0 1 12 3.8" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity=".6"/>
              </svg>
              {/* Battery */}
              <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
                <rect x=".5" y=".5" width="16" height="9" rx="2.2" stroke="white" strokeOpacity=".5"/>
                <rect x="1.5" y="1.5" width="11" height="7" rx="1.4" fill="white"/>
                <path d="M17.5 3.5v3a1.5 1.5 0 0 0 0-3z" fill="white" opacity=".45"/>
              </svg>
            </div>
          </div>

          {isRinging ? (
            /* ── RINGING STATE ── */
            <>
              <div style={{ fontSize: ".68rem", color: "rgba(255,255,255,.55)", fontWeight: 500, letterSpacing: ".06em", marginTop: 10, marginBottom: 18 }}>
                incoming call
              </div>

              {/* Ripple rings + avatar */}
              <div style={{ position: "relative", width: 82, height: 82, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                {[1, 2, 3].map(n => (
                  <div key={n} style={{
                    position: "absolute",
                    width: 82 + n * 26, height: 82 + n * 26,
                    borderRadius: "50%",
                    border: "1.5px solid rgba(52,211,153,.4)",
                    animation: `ringPulse 1.8s ${n * 0.35}s ease-out infinite`,
                    pointerEvents: "none",
                  }} />
                ))}
                <div style={{
                  width: 74, height: 74, borderRadius: "50%",
                  background: "linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.2rem", fontWeight: 800, color: "#fff",
                  boxShadow: "0 0 0 3px rgba(255,255,255,.15)", zIndex: 1,
                }}>FN</div>
              </div>

              <div style={{ fontSize: "1rem", color: "#fff", fontWeight: 700, textAlign: "center", lineHeight: 1.2, marginBottom: 4 }}>
                Fabulous Nails
              </div>
              <div style={{ fontSize: ".65rem", color: "rgba(255,255,255,.4)", marginBottom: 26 }}>
                +1 (619) 604-6886
              </div>

              {/* Decline / Accept */}
              <div style={{ display: "flex", gap: 36, alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 54, height: 54, borderRadius: "50%", background: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(220,38,38,.5)" }}>
                    <Phone size={22} color="#fff" style={{ transform: "rotate(135deg)" }} />
                  </div>
                  <span style={{ fontSize: ".6rem", color: "rgba(255,255,255,.5)" }}>Decline</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 54, height: 54, borderRadius: "50%", background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(22,163,74,.55)", animation: "acceptPulse 1.2s ease-in-out infinite" }}>
                    <Phone size={22} color="#fff" />
                  </div>
                  <span style={{ fontSize: ".6rem", color: "rgba(255,255,255,.5)" }}>Accept</span>
                </div>
              </div>
            </>
          ) : isSweeping ? (
            /* ── CALL COMPLETED / TRANSITION STATE ── */
            <motion.div
              key="ended-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, justifyContent: "center", gap: 8 }}
            >
              <div style={{ width: 62, height: 62, borderRadius: "50%", background: "rgba(255,255,255,.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 800, color: "rgba(255,255,255,.25)", marginBottom: 8 }}>FN</div>
              <div style={{ fontSize: ".88rem", color: "rgba(255,255,255,.85)", fontWeight: 600 }}>Autumn handled the call</div>
              <div style={{ fontSize: ".7rem", color: "rgba(255,255,255,.38)", fontVariantNumeric: "tabular-nums" }}>Preparing the next demo…</div>
            </motion.div>
          ) : (
            /* ── CONNECTED / ACTIVE CALL STATE ── */
            <>
              {/* Caller name + timer */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 20, marginBottom: 28 }}>
                <div style={{ fontSize: "1.15rem", color: "#fff", fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.2, marginBottom: 6 }}>
                  Fabulous Nails
                </div>
                <div style={{ fontSize: ".75rem", color: "rgba(255,255,255,.5)", fontVariantNumeric: "tabular-nums", letterSpacing: ".04em" }}>
                  {fmtCall(callSecs)}
                </div>
              </div>

              {/* Controls 3×2 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", rowGap: 10, columnGap: 6, padding: "0 12px", marginBottom: 16, width: "100%" }}>
                {([
                  { label: "mute", el: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="2" width="6" height="12" rx="3"/>
                      <path d="M5 10a7 7 0 0 0 14 0"/>
                      <line x1="12" y1="19" x2="12" y2="22"/>
                      <line x1="9" y1="22" x2="15" y2="22"/>
                    </svg>
                  )},
                  { label: "keypad", el: (
                    <svg width="13" height="13" viewBox="0 0 21 21" fill="white">
                      {[0,1,2,3,4,5,6,7,8].map(i =>
                        <circle key={i} cx={3 + (i % 3) * 7.5} cy={3 + Math.floor(i / 3) * 7.5} r="2.2"/>
                      )}
                    </svg>
                  )},
                  { label: "speaker", el: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                    </svg>
                  )},
                  { label: "add call", el: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h6M18 0v6"/>
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.93 13 19.79 19.79 0 0 1 1.92 4.38 2 2 0 0 1 3.89 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17.17z"/>
                    </svg>
                  )},
                  { label: "FaceTime", el: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="23 7 16 12 23 17 23 7"/>
                      <rect x="1" y="5" width="15" height="14" rx="2"/>
                    </svg>
                  )},
                  { label: "contacts", el: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  )},
                ] as {label: string; el: React.ReactNode}[]).map(({ label, el }) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "rgba(255,255,255,.16)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {el}
                    </div>
                    <div style={{ fontSize: ".5rem", color: "rgba(255,255,255,.55)", textAlign: "center", lineHeight: 1.2 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* End call */}
              <div style={{
                width: 50, height: 50, borderRadius: "50%",
                background: "#e5373a",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 16px rgba(229,55,58,.65)",
                flexShrink: 0,
              }}>
                <Phone size={18} color="#fff" style={{ transform: "rotate(135deg)" }} />
              </div>

              {/* Home indicator */}
              <div style={{ position: "absolute", bottom: 8, width: 110, height: 4, borderRadius: 2, background: "rgba(255,255,255,.35)" }} />
            </>
          )}
        </div>
      </div>

      {/* ── Call transcript panel — NO chat-app chrome ── */}
      <div style={{
        flex: 1, minWidth: 0,
        display: "flex", flexDirection: "column",
        height: "100%",
        background: "#fff",
        borderRadius: 20,
        boxShadow: "0 4px 24px rgba(0,0,0,.08)",
        overflow: "hidden",
        position: "relative",
      }}>

        {/* ── Ringing overlay ── */}
        <AnimatePresence>
          {isRinging && (
            <motion.div
              key="phase-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.35 } }}
              style={{
                position: "absolute", inset: 0, zIndex: 10,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                background: "rgba(255,255,255,0.97)",
                backdropFilter: "blur(6px)",
                gap: 10,
              }}
            >
              <div style={{ position: "relative", width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {[1, 2].map(n => (
                  <div key={n} style={{
                    position: "absolute",
                    width: 56 + n * 20, height: 56 + n * 20,
                    borderRadius: "50%",
                    border: `1.5px solid rgba(109,40,217,${0.22 - n * 0.07})`,
                    animation: `ringPulse 1.8s ${n * 0.4}s ease-out infinite`,
                  }} />
                ))}
                <div style={{
                  width: 50, height: 50, borderRadius: "50%",
                  background: `linear-gradient(135deg, ${PLUM} 0%, ${VIOLET} 100%)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 800, fontSize: "1rem",
                  boxShadow: `0 4px 16px rgba(109,40,217,.35)`,
                }}>A</div>
              </div>
              <div style={{ fontSize: ".8rem", fontWeight: 600, color: "#6b7280" }}>Autumn is answering…</div>
              <div style={{ display: "flex", gap: 5 }}>
                {[0, 1, 2].map(j => (
                  <div key={j} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: VIOLET, opacity: 0.45,
                    animation: `heroBounce 1.1s ${j * 0.18}s infinite`,
                  }} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scrollable bubbles — sweeps upward when loop ends */}
        <motion.div
          ref={scrollRef as React.RefObject<HTMLDivElement>}
          animate={isSweeping ? { y: -420, opacity: 0 } : { y: 0, opacity: 1 }}
          transition={isSweeping
            ? { duration: 0.55, ease: [0.4, 0, 1, 1] }
            : { duration: 0 }
          }
          style={{
            flex: 1,
            padding: "18px 16px 10px",
            overflowY: isSweeping ? "hidden" : "auto",
            display: "flex", flexDirection: "column", gap: 10,
            scrollBehavior: "smooth",
          }}
        >
          <AnimatePresence initial={false}>
            {msgs.slice(0, visible).map((msg, i) => {
              const isAI = msg.from === "autumn";
              return (
                <motion.div
                  key={`${loopKey}-${i}`}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                  style={{
                    display: "flex",
                    justifyContent: isAI ? "flex-start" : "flex-end",
                  }}
                >
                  <div style={{
                    maxWidth: "78%",
                    padding: "10px 14px",
                    borderRadius: isAI
                      ? "4px 18px 18px 18px"
                      : "18px 4px 18px 18px",
                    background: isAI
                      ? "linear-gradient(135deg, #4f7fff 0%, #007AFF 100%)"
                      : "#E9E9EB",
                    color: isAI ? "#fff" : "#1c1c1e",
                    fontSize: ".76rem", lineHeight: 1.55, fontWeight: 500,
                    boxShadow: isAI
                      ? "0 2px 10px rgba(0,122,255,.25)"
                      : "0 1px 4px rgba(0,0,0,.06)",
                  }}>
                    {msg.text}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

        </motion.div>

        {/* ── Speaking indicator bar ── */}
        <div style={{
          flexShrink: 0,
          borderTop: "1px solid #f0f0f0",
          padding: "10px 16px",
          display: "flex", alignItems: "center", gap: 10,
          background: "#fafafa",
        }}>
          {/* AI avatar + waveform */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              background: `linear-gradient(135deg, ${PLUM} 0%, ${VIOLET} 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 800, fontSize: ".72rem",
              opacity: activeSpeaker === "autumn" ? 1 : 0.35,
              transition: "opacity 0.4s",
            }}>A</div>
            <div style={{
              display: "flex", alignItems: "center", gap: 2,
              opacity: activeSpeaker === "autumn" ? 1 : 0.2,
              transition: "opacity 0.4s",
            }}>
              {[4, 7, 11, 8, 13, 6, 9, 5, 12, 7, 10, 4].map((h, j) => (
                <div key={j} style={{
                  width: 3, borderRadius: 2,
                  background: VIOLET,
                  height: h,
                  animation: activeSpeaker === "autumn"
                    ? `waveBar 0.9s ${j * 0.06}s ease-in-out infinite alternate`
                    : "none",
                  opacity: activeSpeaker === "autumn" ? 1 : 0.3,
                }} />
              ))}
            </div>
          </div>

          {/* Dotted divider */}
          <div style={{
            flex: 1, borderTop: "1.5px dotted #e0e0e0",
            alignSelf: "center",
          }} />

          {/* Client avatar */}
          <div style={{
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
            background: "#E9E9EB",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: ".72rem", fontWeight: 700, color: "#555",
            opacity: activeSpeaker === "client" ? 1 : 0.35,
            transition: "opacity 0.4s",
          }}>👤</div>
        </div>
      </div>

      <style>{`
        @keyframes waveBar {
          from { transform: scaleY(0.35); }
          to   { transform: scaleY(1.4); }
        }
        @keyframes ringPulse {
          0%   { transform: scale(0.85); opacity: 0.8; }
          70%  { transform: scale(1.35); opacity: 0; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        @keyframes acceptPulse {
          0%, 100% { box-shadow: 0 3px 14px rgba(22,163,74,.55); }
          50%       { box-shadow: 0 3px 22px rgba(22,163,74,.9); }
        }
      `}</style>
    </div>
  );
}

/* ─── Animated live activity feed ─── */
const FEED_ITEMS = [
  { id: 1, dot: GREEN,       text: "Booked — Sarah M. → Fri 2:00 PM (balayage)",     time: "just now" },
  { id: 2, dot: PLUM_MID,   text: "Answered pricing question re: highlights",         time: "2m ago"   },
  { id: 3, dot: GOLD,        text: "Rescheduled — Emma L. → Thu 10:00 AM",            time: "5m ago"   },
  { id: 4, dot: GREEN,       text: "Booked — James T. → Sat 11:00 AM (haircut)",      time: "12m ago"  },
  { id: 5, dot: PLUM_MID,   text: "Answered hours of operation inquiry",              time: "18m ago"  },
];

function ActivityFeed() {
  const [items, setItems] = useState(FEED_ITEMS.slice(0, 4));

  useEffect(() => {
    let index = 4;
    const interval = setInterval(() => {
      setItems(prev => {
        const next = FEED_ITEMS[index % FEED_ITEMS.length];
        const updated = [next, ...prev].slice(0, 4);
        return updated.map((item, i) => ({ ...item, id: Date.now() + i }));
      });
      index++;
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ marginTop: 20 }}>
      <AnimatePresence>
        {items.map(item => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 0",
              borderBottom: "1px solid rgba(229,231,235,0.5)",
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: item.dot, flexShrink: 0,
            }} />
            <span style={{ flex: 1, fontSize: ".83rem", fontWeight: 500, color: "#1f2937" }}>
              {item.text}
            </span>
            <span style={{ fontSize: ".72rem", color: "#9ca3af", whiteSpace: "nowrap" }}>
              {item.time}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ─── FadeIn scroll reveal ─── */
function FadeIn({ children, delay = 0, style = {} }: {
  children: React.ReactNode; delay?: number; style?: React.CSSProperties;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.75, ease: [0.25, 0.1, 0.25, 1], delay }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/* ─── Feature card ─── */
function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e9e4f5",
      borderRadius: 20, padding: "28px 26px",
      transition: "box-shadow .2s, transform .2s",
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(91,33,182,.12)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
        (e.currentTarget as HTMLElement).style.transform = "none";
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `linear-gradient(135deg, ${PLUM} 0%, ${VIOLET} 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 16, color: "#fff",
      }}>
        {icon}
      </div>
      <h3 style={{ fontWeight: 700, fontSize: "1rem", color: "#1c1917", marginBottom: 8 }}>
        {title}
      </h3>
      <p style={{ fontSize: ".875rem", color: "#6b7280", lineHeight: 1.65 }}>
        {body}
      </p>
    </div>
  );
}

/* ─── Step card ─── */
function StepCard({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: `linear-gradient(135deg, ${PLUM} 0%, ${VIOLET} 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 20px", color: "#fff",
        fontSize: "1.25rem", fontWeight: 800,
        boxShadow: `0 6px 20px rgba(59,7,100,.3)`,
      }}>
        {number}
      </div>
      <h3 style={{ fontWeight: 700, fontSize: "1.05rem", color: "#1c1917", marginBottom: 10 }}>
        {title}
      </h3>
      <p style={{ fontSize: ".875rem", color: "#6b7280", lineHeight: 1.65, maxWidth: 260, margin: "0 auto" }}>
        {body}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════ */
export default function AutumnLandingPage() {
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    document.title = "Autumn AI Receptionist | Certxa";
  }, []);

  return (
    <MarketingLayout>
      <AnimatePresence>
        {demoOpen && <DemoModal onClose={() => setDemoOpen(false)} />}
      </AnimatePresence>

      {/* ── 1. HERO ── */}
      <section style={{
        background: `linear-gradient(135deg, ${PLUM} 0%, #2e0650 35%, #1a0338 100%)`,
        color: "#fff",
        padding: "88px 24px 110px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Background orbs */}
        <div style={{
          position: "absolute", top: -100, right: -100, width: 500, height: 500,
          borderRadius: "50%", background: "rgba(109,40,217,.18)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -80, left: -80, width: 380, height: 380,
          borderRadius: "50%", background: "rgba(91,33,182,.14)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: "30%", left: "45%", width: 260, height: 260,
          borderRadius: "50%", background: "rgba(245,158,11,.06)", pointerEvents: "none",
        }} />

        <div style={{
          maxWidth: 1160, margin: "0 auto",
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: 60, alignItems: "center",
        }} className="hero-grid">

          {/* Left copy */}
          <div>
            <FadeIn>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "rgba(16,185,129,.15)", border: "1px solid rgba(16,185,129,.35)",
                borderRadius: 50, padding: "6px 16px", marginBottom: 24,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: GREEN, flexShrink: 0,
                  animation: "pulse 2s infinite",
                }} />
                <span style={{ fontSize: ".78rem", fontWeight: 600, color: "#6ee7b7", letterSpacing: ".06em" }}>
                  LIVE — AUTUMN IS ANSWERING CALLS NOW
                </span>
              </div>
            </FadeIn>

            <FadeIn delay={0.1}>
              <h1 style={{
                fontSize: "clamp(2.4rem, 4.5vw, 3.8rem)", fontWeight: 800,
                lineHeight: 1.1, marginBottom: 22, letterSpacing: "-0.03em",
              }}>
                Meet Autumn.<br />
                <span style={{ color: GOLD }}>Your salon's AI receptionist.</span>
              </h1>
            </FadeIn>

            <FadeIn delay={0.2}>
              <p style={{
                fontSize: "1.1rem", color: "rgba(255,255,255,.72)",
                lineHeight: 1.7, marginBottom: 38, maxWidth: 500,
              }}>
                Autumn answers every call instantly, books appointments directly into your calendar, handles rescheduling, answers client questions, and upsells add-ons — all without you lifting a finger.
              </p>
            </FadeIn>

            <FadeIn delay={0.3}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button onClick={() => setDemoOpen(true)} style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "16px 36px", borderRadius: 50, fontWeight: 700,
                  fontSize: "1rem", border: "none", cursor: "pointer",
                  background: "#6366f1", color: "#fff",
                  boxShadow: "0 4px 24px rgba(99,102,241,.45)",
                  transition: "transform .15s, box-shadow .15s",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 28px rgba(99,102,241,.6)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 24px rgba(99,102,241,.45)"; }}
                >
                  Demo Autumn Now
                </button>
                <a href="/dashboard" style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "14px 28px", borderRadius: 50, fontWeight: 600,
                  fontSize: ".95rem", textDecoration: "none",
                  border: "1px solid rgba(255,255,255,.28)", color: "rgba(255,255,255,.88)",
                  transition: "background .15s, border-color .15s",
                }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,.1)";
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,.5)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,.28)";
                  }}
                >
                  Enable for My Salon
                </a>
              </div>
            </FadeIn>

            <FadeIn delay={0.4}>
              <div style={{ display: "flex", gap: 28, marginTop: 40 }}>
                {[
                  { val: "< 2 sec", label: "Answer time" },
                  { val: "100%", label: "Answer rate" },
                  { val: "24 / 7", label: "Always on" },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontWeight: 800, fontSize: "1.3rem", color: "#fff" }}>{s.val}</div>
                    <div style={{ fontSize: ".75rem", color: "rgba(255,255,255,.55)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>

          {/* Right — live dashboard card */}
          <FadeIn delay={0.45}>
            <div style={{
              background: "rgba(255,255,255,.97)", borderRadius: 28,
              padding: "32px 28px",
              boxShadow: "0 32px 80px rgba(0,0,0,.35)",
              border: "1px solid rgba(255,255,255,.25)",
            }}>
              {/* Card header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 24, paddingBottom: 20,
                borderBottom: "1px solid #e9e4f5",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${PLUM} 0%, ${VIOLET} 100%)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontWeight: 800, fontSize: "1.2rem",
                    boxShadow: `0 4px 16px rgba(59,7,100,.4)`,
                  }}>A</div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1rem", color: "#1c1917" }}>Autumn</div>
                    <div style={{ fontSize: ".8rem", color: "#6b7280", fontWeight: 500 }}>AI Receptionist</div>
                  </div>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(16,185,129,.1)", color: "#059669",
                  padding: "6px 14px", borderRadius: 50, fontSize: ".78rem", fontWeight: 700,
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: GREEN, flexShrink: 0,
                  }} /> Online now
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "Calls Today", val: "47" },
                  { label: "Response",    val: "<2s"  },
                  { label: "Answer Rate", val: "100%" },
                ].map(s => (
                  <div key={s.label} style={{
                    background: "#f5f3ff", borderRadius: 14, padding: "12px 8px", textAlign: "center",
                  }}>
                    <div style={{ fontWeight: 800, fontSize: "1.2rem", color: PLUM }}>{s.val}</div>
                    <div style={{ fontSize: ".68rem", color: "#6b7280", fontWeight: 600, marginTop: 2, textTransform: "uppercase", letterSpacing: ".04em" }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* iPhone call + animated booking chat */}
              <HeroCallChat />

              {/* Disclaimer */}
              <p style={{
                marginTop: 10, fontSize: ".65rem",
                color: "#9ca3af", textAlign: "center",
                letterSpacing: ".01em",
              }}>
                Simulated call flow — Autumn is not a website chatbot.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── 2. STATS BAR ── */}
      <section style={{
        background: "#fff", borderBottom: "1px solid #e9e4f5",
        borderTop: "1px solid #e9e4f5", padding: "36px 24px",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          gap: 0,
        }} className="stats-bar-grid">
          {[
            { icon: <PhoneCall size={16} />, label: "Calls Answered", val: "2,847", sub: "this week" },
            { icon: <Calendar   size={16} />, label: "Appointments Booked", val: "1,203", sub: "" },
            { icon: <Clock      size={16} />, label: "Avg Response Time",   val: "< 2 sec", sub: "" },
            { icon: <Star       size={16} color={GOLD} />, label: "Client Satisfaction", val: "98.4%", sub: "" },
          ].map((s, i) => (
            <div key={s.label} style={{
              padding: "0 32px",
              borderRight: i < 3 ? "1px solid #e9e4f5" : "none",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: ".78rem", fontWeight: 600, color: "#6b7280",
                marginBottom: 6,
              }}>
                {s.icon} {s.label}
              </div>
              <div style={{ fontWeight: 800, fontSize: "1.7rem", color: "#1c1917" }}>
                {s.val}
                {s.sub && <span style={{ fontSize: "1rem", fontWeight: 500, color: "#9ca3af", marginLeft: 6 }}>{s.sub}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. MEET AUTUMN ── */}
      <section style={{ background: CREAM, padding: "96px 24px" }}>
        <div style={{
          maxWidth: 1160, margin: "0 auto",
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: 72, alignItems: "center",
        }} className="hero-grid">

          {/* Left — capability list */}
          <FadeIn>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: `rgba(59,7,100,.08)`, border: `1px solid rgba(59,7,100,.18)`,
              borderRadius: 50, padding: "6px 16px", marginBottom: 24,
            }}>
              <Sparkles size={13} color={PLUM_MID} />
              <span style={{ fontSize: ".78rem", fontWeight: 600, color: PLUM_MID, letterSpacing: ".06em" }}>
                MEET AUTUMN
              </span>
            </div>

            <h2 style={{
              fontSize: "clamp(1.9rem, 3vw, 2.9rem)", fontWeight: 800,
              lineHeight: 1.2, letterSpacing: "-0.02em",
              color: "#1c1917", marginBottom: 20,
            }}>
              A receptionist who never puts<br />
              <span style={{ color: PLUM_MID }}>a caller on hold.</span>
            </h2>

            <p style={{ fontSize: "1.05rem", color: "#6b7280", lineHeight: 1.7, marginBottom: 36, maxWidth: 500 }}>
              Autumn is deeply integrated with your Certxa account. From the moment she's activated, she knows every service you offer, every staff member's schedule, your business hours, and your booking rules.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { icon: <Calendar size={18} />,     text: "Books, reschedules, and cancels appointments in real time" },
                { icon: <MessageSquare size={18} />, text: "Answers questions about services, prices, and availability" },
                { icon: <TrendingUp size={18} />,   text: "Upsells add-ons and premium services on every call" },
                { icon: <Users size={18} />,        text: "Recognises returning clients and personalises the experience" },
                { icon: <PhoneCall size={18} />,    text: "Fills calendar gaps and keeps your schedule fully booked" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: `rgba(59,7,100,.07)`, color: PLUM_MID,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {item.icon}
                  </div>
                  <span style={{ fontSize: ".92rem", color: "#374151", lineHeight: 1.6, paddingTop: 6 }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </FadeIn>

          {/* Right — call log dashboard card */}
          <FadeIn delay={0.2}>
            <div style={{
              background: "#fff", borderRadius: 24,
              boxShadow: "0 12px 48px rgba(59,7,100,.12)",
              border: "1px solid #e9e4f5", overflow: "hidden",
            }}>
              {/* Card header */}
              <div style={{
                background: `linear-gradient(135deg, ${PLUM} 0%, ${VIOLET} 100%)`,
                padding: "20px 24px", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: "rgba(255,255,255,.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: "1.1rem",
                  }}>A</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: ".9rem" }}>Autumn — Call History</div>
                    <div style={{ fontSize: ".75rem", opacity: .7 }}>Your AI receptionist activity</div>
                  </div>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(16,185,129,.25)", padding: "4px 12px",
                  borderRadius: 50, fontSize: ".72rem", fontWeight: 700, color: "#6ee7b7",
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: GREEN }} />
                  Active
                </div>
              </div>

              {/* Mini stats */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                borderBottom: "1px solid #f0eaf8",
              }}>
                {[
                  { val: "34", label: "Calls Today" },
                  { val: "2m 18s", label: "Avg Duration" },
                  { val: "21", label: "Bookings" },
                ].map((s, i) => (
                  <div key={s.label} style={{
                    padding: "14px 12px", textAlign: "center",
                    borderRight: i < 2 ? "1px solid #f0eaf8" : "none",
                  }}>
                    <div style={{ fontWeight: 800, fontSize: "1.15rem", color: PLUM }}>{s.val}</div>
                    <div style={{ fontSize: ".68rem", color: "#9ca3af", fontWeight: 600, marginTop: 2, textTransform: "uppercase", letterSpacing: ".04em" }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Call log rows */}
              <div style={{ padding: "6px 0" }}>
                {[
                  { name: "Sarah M.",  phone: "(305) 555-0142", outcome: "booked",    duration: "1m 54s", time: "9:12 AM",  outcomeBg: "rgba(16,185,129,.1)",  outcomeColor: "#059669", outcomeLabel: "Booked"     },
                  { name: "James T.",  phone: "(786) 555-0388", outcome: "rescheduled",duration: "2m 31s",time: "9:47 AM",  outcomeBg: "rgba(59,130,246,.1)",  outcomeColor: "#2563eb", outcomeLabel: "Rescheduled"},
                  { name: "Emma L.",   phone: "(954) 555-0271", outcome: "cancelled",  duration: "0m 58s", time: "10:03 AM", outcomeBg: "rgba(245,158,11,.1)",  outcomeColor: "#b45309", outcomeLabel: "Cancelled"  },
                  { name: "Priya K.",  phone: "(305) 555-0519", outcome: "booked",    duration: "3m 07s", time: "10:22 AM", outcomeBg: "rgba(16,185,129,.1)",  outcomeColor: "#059669", outcomeLabel: "Booked"     },
                  { name: "Marcus W.", phone: "(786) 555-0934", outcome: "booked",    duration: "2m 45s", time: "10:55 AM", outcomeBg: "rgba(16,185,129,.1)",  outcomeColor: "#059669", outcomeLabel: "Booked"     },
                ].map((row, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center",
                    padding: "11px 20px", gap: 12,
                    borderBottom: i < 4 ? "1px solid #f9f7fe" : "none",
                  }}>
                    {/* Avatar */}
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: "rgba(59,7,100,.07)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: ".78rem", fontWeight: 700, color: PLUM_MID, flexShrink: 0,
                    }}>
                      {row.name[0]}
                    </div>
                    {/* Name + phone */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: ".82rem", color: "#1c1917" }}>{row.name}</div>
                      <div style={{ fontSize: ".72rem", color: "#9ca3af" }}>{row.phone}</div>
                    </div>
                    {/* Outcome badge */}
                    <span style={{
                      fontSize: ".68rem", fontWeight: 700, padding: "3px 9px", borderRadius: 50,
                      background: row.outcomeBg, color: row.outcomeColor,
                      whiteSpace: "nowrap",
                    }}>
                      {row.outcomeLabel}
                    </span>
                    {/* Duration */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: ".78rem", fontWeight: 600, color: "#374151" }}>{row.duration}</div>
                      <div style={{ fontSize: ".68rem", color: "#9ca3af" }}>{row.time}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{
                padding: "12px 20px",
                borderTop: "1px solid #f0eaf8",
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 6,
              }}>
                <CheckCircle2 size={13} color={GREEN} />
                <span style={{ fontSize: ".75rem", fontWeight: 600, color: "#6b7280" }}>
                  Every call logged automatically — nothing slips through
                </span>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── 4. FEATURES GRID ── */}
      <section style={{ background: "#fff", padding: "96px 24px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <h2 style={{
                fontSize: "clamp(1.9rem, 3vw, 2.8rem)", fontWeight: 800,
                letterSpacing: "-0.02em", color: "#1c1917", marginBottom: 16,
              }}>
                Everything a great receptionist does,<br />
                <span style={{ color: PLUM_MID }}>without the overhead.</span>
              </h2>
              <p style={{ fontSize: "1.05rem", color: "#6b7280", maxWidth: 580, margin: "0 auto" }}>
                Autumn handles your front-desk calls completely — from first ring to confirmed booking.
              </p>
            </div>
          </FadeIn>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
          }} className="features-grid">
            {[
              {
                icon: <Phone size={20} />,
                title: "Instant answer, every time",
                body: "Autumn picks up within two seconds, rain or shine. No more missed calls while your stylists are mid-service.",
              },
              {
                icon: <Calendar size={20} />,
                title: "Real-time booking",
                body: "She sees live availability across all staff and books — or reschedules — directly into your Certxa calendar.",
              },
              {
                icon: <TrendingUp size={20} />,
                title: "Built-in upselling",
                body: "Autumn naturally suggests add-ons and upgrades on every call, increasing your average ticket without any training.",
              },
              {
                icon: <Users size={20} />,
                title: "Client recognition",
                body: "Returning clients are greeted by name. Autumn knows their history and can pull up their last appointment.",
              },
              {
                icon: <ShieldCheck size={20} />,
                title: "Policy enforcement",
                body: "Autumn applies your cancellation policy and handles late-notice requests gracefully — no awkward conversations for your team.",
              },
              {
                icon: <ShieldCheck size={20} />,
                title: "Protection layer",
                body: "Spam filter included — robocalls, telemarketers, and obvious loops are ended in the first few seconds.",
              },
              {
                icon: <Volume2 size={20} />,
                title: "Natural conversation",
                body: "Autumn sounds warm, professional, and human. Callers routinely can't tell she isn't your front-desk team.",
              },
              {
                icon: <RefreshCw size={20} />,
                title: "Always up to date",
                body: "Change your services, hours, or staff? Autumn syncs automatically — no retraining required.",
              },
              {
                icon: <MessageSquare size={20} />,
                title: "Handles FAQs",
                body: "Pricing, directions, parking, wait times — Autumn answers common questions so your team doesn't have to.",
              },
              {
                icon: <Zap size={20} />,
                title: "Zero setup friction",
                body: "Autumn reads your Certxa account from day one. You're live in minutes, not days.",
              },
            ].map(f => (
              <FadeIn key={f.title}>
                <FeatureCard {...f} />
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4b. CALENDAR GAPS ── */}
      <section style={{ background: CREAM, padding: "96px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <div style={{
                display: "inline-block", padding: "6px 18px", borderRadius: 50,
                background: `rgba(59,7,100,.08)`, color: PLUM_MID,
                fontSize: ".78rem", fontWeight: 700, letterSpacing: ".08em",
                textTransform: "uppercase", marginBottom: 20,
              }}>
                Calendar Intelligence
              </div>
              <h2 style={{
                fontSize: "clamp(1.9rem, 3vw, 2.8rem)", fontWeight: 800,
                letterSpacing: "-0.02em", color: "#1c1917", marginBottom: 16,
              }}>
                Autumn keeps your calendar full.<br />
                <span style={{ color: PLUM_MID }}>Not just answered — optimised.</span>
              </h2>
              <p style={{ fontSize: "1.05rem", color: "#6b7280", maxWidth: 600, margin: "0 auto" }}>
                Every gap in your day is lost revenue. Autumn doesn't just take bookings — she actively works your schedule to maximise utilisation and client value.
              </p>
            </div>
          </FadeIn>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 20,
          }}>
            {[
              {
                icon: <Clock size={22} />,
                title: "Fills dead time automatically",
                body: "Autumn spots open slots and works to fill them — reaching out, suggesting alternatives, and keeping the waitlist moving.",
              },
              {
                icon: <RefreshCw size={22} />,
                title: "Increases repeat bookings",
                body: "She nudges lapsed clients, reminds regulars it's time to rebook, and turns one-time visitors into loyal regulars.",
              },
              {
                icon: <TrendingUp size={22} />,
                title: "Pushes upsells intelligently",
                body: "Based on service history and slot duration, Autumn suggests the right add-ons at exactly the right moment.",
              },
              {
                icon: <Star size={22} />,
                title: "Prioritises high-value clients",
                body: "VIP clients and high-ticket services get preference when slots are tight — Autumn knows who matters most.",
              },
              {
                icon: <BarChart2 size={22} />,
                title: "Smooths calendar utilisation",
                body: "No more back-to-back chaos or dead afternoons. Autumn distributes bookings to match your team's rhythm.",
              },
            ].map((item, i) => (
              <FadeIn key={item.title} delay={i * 0.07}>
                <div style={{
                  background: "#fff", borderRadius: 20,
                  padding: "28px 24px",
                  border: "1px solid #e9e4f5",
                  boxShadow: "0 4px 20px rgba(59,7,100,.06)",
                  height: "100%", boxSizing: "border-box",
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: `linear-gradient(135deg, rgba(59,7,100,.1) 0%, rgba(109,40,217,.12) 100%)`,
                    color: PLUM_MID,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 16,
                  }}>
                    {item.icon}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: ".95rem", color: "#1c1917", marginBottom: 8 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: ".85rem", color: "#6b7280", lineHeight: 1.65 }}>
                    {item.body}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. HOW IT WORKS ── */}
      <section style={{ background: "#fff", padding: "96px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 72 }}>
              <h2 style={{
                fontSize: "clamp(1.9rem, 3vw, 2.8rem)", fontWeight: 800,
                letterSpacing: "-0.02em", color: "#1c1917", marginBottom: 16,
              }}>
                Up and running in minutes
              </h2>
              <p style={{ fontSize: "1.05rem", color: "#6b7280", maxWidth: 480, margin: "0 auto" }}>
                Autumn works with the data already inside your Certxa account. There's nothing to configure from scratch.
              </p>
            </div>
          </FadeIn>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: 48, position: "relative",
          }} className="steps-grid">
            {/* Connector line */}
            <div style={{
              position: "absolute", top: 27, left: "calc(16.6% + 8px)",
              width: "calc(66.7% - 16px)", height: 2,
              background: `linear-gradient(90deg, ${PLUM}40, ${VIOLET}40)`,
              zIndex: 0,
            }} className="step-connector" />

            {[
              {
                number: "1",
                title: "Load your account balance",
                body: "Head to the Autumn section in your Certxa dashboard and add credit to your account. You choose how much to load.",
              },
              {
                number: "2",
                title: "Activate Autumn",
                body: "Enable Autumn with one click. She reads your services, staff, and calendar automatically — no manual setup.",
              },
              {
                number: "3",
                title: "Forward your calls",
                body: "Point your salon phone to Autumn's number. She starts answering immediately. Your balance covers every minute she's on a call.",
              },
            ].map(s => (
              <FadeIn key={s.number} style={{ position: "relative", zIndex: 1 }}>
                <StepCard {...s} />
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. PRICING / CREDITS ── */}
      <section style={{ background: "#fff", padding: "96px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 60 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: `rgba(59,7,100,.07)`, border: `1px solid rgba(59,7,100,.15)`,
                borderRadius: 50, padding: "6px 16px", marginBottom: 20,
              }}>
                <CreditCard size={13} color={PLUM_MID} />
                <span style={{ fontSize: ".78rem", fontWeight: 600, color: PLUM_MID, letterSpacing: ".06em" }}>
                  HOW PRICING WORKS
                </span>
              </div>
              <h2 style={{
                fontSize: "clamp(1.9rem, 3vw, 2.8rem)", fontWeight: 800,
                letterSpacing: "-0.02em", color: "#1c1917", marginBottom: 16,
              }}>
                Pay for what Autumn actually uses.
              </h2>
              <p style={{ fontSize: "1.05rem", color: "#6b7280", maxWidth: 540, margin: "0 auto" }}>
                Autumn is available on every Certxa plan. There's no extra subscription — instead you load funds into your account and Autumn draws from that balance as she handles calls.
              </p>
            </div>
          </FadeIn>

          {/* Pricing explainer cards */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: 24, marginBottom: 48,
          }} className="pricing-cards">
            {[
              {
                icon: <CreditCard size={22} />,
                title: "Load your balance",
                body: "Add any amount to your Autumn credit balance directly from your Certxa dashboard. Funds never expire.",
                highlight: false,
              },
              {
                icon: <Phone size={22} />,
                title: "Autumn handles calls",
                body: "Every minute Autumn spends on an active call draws from your balance. Nothing is charged when she's idle.",
                highlight: true,
              },
              {
                icon: <TrendingUp size={22} />,
                title: "Auto top-up (optional)",
                body: "Set a low-balance threshold and Certxa will top up your account automatically — so Autumn never stops mid-day.",
                highlight: false,
              },
            ].map(card => (
              <FadeIn key={card.title}>
                <div style={{
                  borderRadius: 20,
                  background: card.highlight
                    ? `linear-gradient(135deg, ${PLUM} 0%, ${VIOLET} 100%)`
                    : "#fff",
                  border: card.highlight ? "none" : "1px solid #e9e4f5",
                  padding: "30px 26px",
                  color: card.highlight ? "#fff" : "#1c1917",
                  boxShadow: card.highlight ? `0 12px 40px rgba(59,7,100,.28)` : "none",
                  transform: card.highlight ? "scale(1.03)" : "none",
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: card.highlight ? "rgba(255,255,255,.15)" : "rgba(59,7,100,.07)",
                    color: card.highlight ? "#fff" : PLUM_MID,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 18,
                  }}>
                    {card.icon}
                  </div>
                  <h3 style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 10 }}>
                    {card.title}
                  </h3>
                  <p style={{
                    fontSize: ".875rem", lineHeight: 1.65,
                    color: card.highlight ? "rgba(255,255,255,.8)" : "#6b7280",
                  }}>
                    {card.body}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* Plans compatibility */}
          <FadeIn>
            <div style={{
              background: CREAM, border: "1px solid #e9e4f5",
              borderRadius: 20, padding: "32px 36px",
              display: "flex", alignItems: "center",
              gap: 24, flexWrap: "wrap",
            }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <h3 style={{ fontWeight: 700, fontSize: "1.05rem", color: "#1c1917", marginBottom: 8 }}>
                  Works with every Certxa plan
                </h3>
                <p style={{ fontSize: ".88rem", color: "#6b7280", lineHeight: 1.6 }}>
                  Autumn is an add-on available to Solo, Professional, and Elite subscribers. Simply load credit and enable her — no plan upgrade required.
                </p>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {["Solo", "Professional", "Elite"].map(plan => (
                  <div key={plan} style={{
                    padding: "8px 18px", borderRadius: 50,
                    background: `rgba(59,7,100,.07)`,
                    border: `1px solid rgba(59,7,100,.15)`,
                    fontSize: ".82rem", fontWeight: 700, color: PLUM_MID,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <CheckCircle2 size={13} color={GREEN} />
                    {plan}
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── 7. TESTIMONIAL ── */}
      <section style={{ background: CREAM, padding: "88px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <FadeIn>
            <div style={{
              background: "#fff", borderRadius: 24, padding: "56px 52px",
              boxShadow: "0 8px 40px rgba(59,7,100,.09)",
              border: "1px solid #e9e4f5", textAlign: "center",
            }}>
              <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 28 }}>
                {[1,2,3,4,5].map(i => (
                  <Star key={i} size={22} color={GOLD} fill={GOLD} />
                ))}
              </div>

              <blockquote style={{
                fontSize: "clamp(1.25rem, 2.2vw, 1.65rem)", fontWeight: 700,
                color: "#1c1917", lineHeight: 1.45, marginBottom: 32,
                letterSpacing: "-0.01em",
              }}>
                "Autumn paid for herself in the first week. We stopped missing calls, our booking rate went up 34%, and my staff finally stopped running to the phone mid-haircut."
              </blockquote>

              <div style={{ fontWeight: 700, color: "#1c1917", fontSize: ".95rem" }}>Jessica R.</div>
              <div style={{ color: "#9ca3af", fontSize: ".83rem", marginTop: 4 }}>Owner, Luxe Hair Studio</div>

              <div style={{
                display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
                gap: 24, marginTop: 40, paddingTop: 36,
                borderTop: "1px solid #e9e4f5",
              }}>
                {[
                  { val: "34%",   label: "More bookings"  },
                  { val: "Zero",  label: "Missed calls"   },
                  { val: "10 min", label: "Setup time"    },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontWeight: 800, fontSize: "1.8rem", color: PLUM_MID }}>{s.val}</div>
                    <div style={{ fontSize: ".78rem", color: "#9ca3af", fontWeight: 600, marginTop: 4 }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── 8. FAQ ── */}
      <section style={{ background: "#fff", padding: "88px 24px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <FadeIn>
            <h2 style={{
              fontSize: "clamp(1.7rem, 2.5vw, 2.4rem)", fontWeight: 800,
              letterSpacing: "-0.02em", color: "#1c1917",
              marginBottom: 48, textAlign: "center",
            }}>
              Common questions
            </h2>
          </FadeIn>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              {
                q: "Do I need a separate subscription for Autumn?",
                a: "No. Autumn is available on all Certxa plans — Solo, Professional, and Elite. You simply load credit to your account and enable her. There's no additional monthly fee.",
              },
              {
                q: "How does the credit balance work?",
                a: "You top up your Autumn credit balance from inside your Certxa dashboard. Autumn draws from that balance for each minute of active call time. You can set a low-balance auto top-up so she never goes offline mid-day.",
              },
              {
                q: "Does Autumn need training before she can take calls?",
                a: "No. From the moment you enable her, Autumn already knows your services, staff members, schedule, business hours, and pricing — pulled directly from your Certxa account. Setup takes minutes.",
              },
              {
                q: "What happens if my credit balance runs out?",
                a: "Autumn will stop taking new calls until the balance is topped up. We'll notify you well in advance and the optional auto top-up feature means you'll rarely run dry.",
              },
              {
                q: "Can callers tell they're speaking to an AI?",
                a: "Autumn is designed to sound warm, natural, and professional. Many callers don't realise she isn't your front-desk team. If a caller specifically asks whether they're speaking to an AI, Autumn will answer honestly.",
              },
              {
                q: "Does Autumn work for multi-location businesses?",
                a: "Yes. Autumn can be enabled independently per location, each with its own credit balance and configuration — ideal for salon groups and franchise owners.",
              },
            ].map((item, i) => (
              <FaqItem key={i} question={item.q} answer={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. CTA BANNER ── */}
      <section style={{
        background: `linear-gradient(135deg, ${PLUM} 0%, #1a0338 100%)`,
        padding: "96px 24px",
        textAlign: "center", position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)",
          width: 600, height: 600, borderRadius: "50%",
          background: "rgba(109,40,217,.2)", pointerEvents: "none",
        }} />

        <div style={{ maxWidth: 680, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <FadeIn>
            <h2 style={{
              fontSize: "clamp(2.2rem, 4vw, 3.6rem)", fontWeight: 800,
              lineHeight: 1.1, letterSpacing: "-0.03em", color: "#fff",
              marginBottom: 20,
            }}>
              Your phone is ringing.<br />
              Is Autumn there?
            </h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p style={{ fontSize: "1rem", color: "rgba(255,255,255,.6)", marginBottom: 40 }}>
              Call Autumn yourself — enter your number and get a live demo in seconds.
            </p>
          </FadeIn>
          <FadeIn delay={0.2}>
            <div style={{ display: "flex", gap: 20, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => setDemoOpen(true)} style={{
                display: "inline-flex", alignItems: "center",
                padding: "16px 36px", borderRadius: 50, fontWeight: 700,
                fontSize: "1rem", border: "none", cursor: "pointer",
                background: "#6366f1", color: "#fff",
                boxShadow: "0 4px 24px rgba(99,102,241,.45)",
                transition: "transform .15s, box-shadow .15s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 28px rgba(99,102,241,.6)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 24px rgba(99,102,241,.45)"; }}
              >
                Try Free Demo
              </button>
              <a href="/contact" style={{
                display: "inline-flex", alignItems: "center",
                fontSize: "1rem", fontWeight: 700, textDecoration: "none",
                color: "#fff", transition: "opacity .15s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.75"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1"; }}
              >
                Talk to Sales
              </a>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 900px) {
          .hero-grid        { grid-template-columns: 1fr !important; }
          .features-grid    { grid-template-columns: 1fr 1fr !important; }
          .steps-grid       { grid-template-columns: 1fr !important; }
          .pricing-cards    { grid-template-columns: 1fr !important; }
          .step-connector   { display: none !important; }
          .stats-bar-grid   { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 560px) {
          .features-grid    { grid-template-columns: 1fr !important; }
          .stats-bar-grid   { grid-template-columns: 1fr !important; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: .4; }
        }
        @keyframes heroBounce {
          0%, 80%, 100% { transform: translateY(0);   opacity: .55; }
          40%           { transform: translateY(-5px); opacity: 1;   }
        }
      `}</style>
    </MarketingLayout>
  );
}

/* ─── FAQ accordion item ─── */
function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      border: "1px solid #e9e4f5",
      borderRadius: 14, overflow: "hidden",
      marginBottom: 8,
      transition: "box-shadow .2s",
      boxShadow: open ? "0 4px 20px rgba(59,7,100,.08)" : "none",
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", textAlign: "left",
          padding: "20px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, background: "none", border: "none", cursor: "pointer",
          fontWeight: 600, fontSize: ".93rem", color: "#1c1917",
        }}
      >
        {question}
        <span style={{
          flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
          background: open ? `linear-gradient(135deg, #3B0764, #6D28D9)` : "#f3f0ff",
          color: open ? "#fff" : "#5B21B6",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.1rem", lineHeight: 1,
          transition: "background .2s, color .2s",
        }}>
          {open ? <X size={13} /> : "+"}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{
              padding: "0 24px 20px",
              fontSize: ".875rem", color: "#6b7280", lineHeight: 1.7,
            }}>
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
