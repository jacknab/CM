/**
 * DemoCalendarBackground
 * Pure-static render of the Certxa calendar with fake nail-salon data.
 * No hooks, no API calls — completely self-contained.
 * Used as the sign-up page background.
 */

import { useMemo } from "react";
import { format, addDays, startOfToday } from "date-fns";

// ── Design tokens (matches Calendar.tsx) ────────────────────────────────────
const HOUR_HEIGHT   = 180;   // px per hour — same as real calendar
const START_HOUR    = 8;     // 8 am
const END_HOUR      = 19;    // 7 pm
const TIME_GUTTER_W = 64;    // px
const HEADER_H      = 56;    // px — date-nav bar
const STAFF_HEAD_H  = 64;    // px — column header

// ── Service colours (matches CATEGORY_PALETTE) ───────────────────────────────
const SVC_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "Gel Manicure":        { bg: "#ede9fe", border: "#c4b5fd", text: "#4c1d95" },
  "Acrylic Fill":        { bg: "#e0e7ff", border: "#a5b4fc", text: "#3730a3" },
  "Dip Powder":          { bg: "#dbeafe", border: "#93c5fd", text: "#1e40af" },
  "Deluxe Pedicure":     { bg: "#ccfbf1", border: "#5eead4", text: "#134e4a" },
  "Gel X Full Set":      { bg: "#d1fae5", border: "#6ee7b7", text: "#064e3b" },
  "Nail Art":            { bg: "#ffedd5", border: "#fed7aa", text: "#92400e" },
  "Soak Off + New Set":  { bg: "#fefce8", border: "#fef08a", text: "#78350f" },
  "French Manicure":     { bg: "#fce7f3", border: "#f9a8d4", text: "#831843" },
  "Nail Repair":         { bg: "#f0fdf4", border: "#86efac", text: "#14532d" },
};

// ── Technicians ──────────────────────────────────────────────────────────────
const STAFF = [
  { id: 1, name: "Lisa M.",   initials: "LM", color: "#7c3aed" },
  { id: 2, name: "Sarah K.",  initials: "SK", color: "#0891b2" },
  { id: 3, name: "Jenny T.",  initials: "JT", color: "#d97706" },
  { id: 4, name: "Mia R.",    initials: "MR", color: "#059669" },
  { id: 5, name: "Kate L.",   initials: "KL", color: "#db2777" },
  { id: 6, name: "Tina W.",   initials: "TW", color: "#6366f1" },
];

// ── Appointment seed data ────────────────────────────────────────────────────
// startH/startM in 24h, durationMin
const APPOINTMENTS = [
  // Lisa
  { staffId: 1, client: "Emma Johnson",  service: "Gel Manicure",       startH: 9,  startM: 0,  durationMin: 60  },
  { staffId: 1, client: "Aaliyah Brooks",service: "Nail Art",            startH: 10, startM: 30, durationMin: 90  },
  { staffId: 1, client: "Sophie Chan",   service: "Dip Powder",          startH: 13, startM: 0,  durationMin: 75  },
  { staffId: 1, client: "Layla Kim",     service: "Acrylic Fill",        startH: 15, startM: 0,  durationMin: 60  },
  // Sarah
  { staffId: 2, client: "Diana Ruiz",    service: "Acrylic Fill",        startH: 9,  startM: 30, durationMin: 90  },
  { staffId: 2, client: "Priya Patel",   service: "Deluxe Pedicure",     startH: 12, startM: 0,  durationMin: 90  },
  { staffId: 2, client: "Olivia Green",  service: "Soak Off + New Set",  startH: 14, startM: 30, durationMin: 90  },
  { staffId: 2, client: "Hannah White",  service: "French Manicure",     startH: 16, startM: 30, durationMin: 45  },
  // Jenny
  { staffId: 3, client: "Megan Taylor",  service: "Gel X Full Set",      startH: 9,  startM: 0,  durationMin: 90  },
  { staffId: 3, client: "Zoe Martinez",  service: "Gel Manicure",        startH: 11, startM: 0,  durationMin: 60  },
  { staffId: 3, client: "Chloe Davis",   service: "Nail Art",            startH: 13, startM: 30, durationMin: 75  },
  { staffId: 3, client: "Riley Moore",   service: "Acrylic Fill",        startH: 15, startM: 30, durationMin: 90  },
  // Mia
  { staffId: 4, client: "Nadia Hassan",  service: "Deluxe Pedicure",     startH: 9,  startM: 0,  durationMin: 90  },
  { staffId: 4, client: "Jasmine Lee",   service: "Dip Powder",          startH: 11, startM: 30, durationMin: 75  },
  { staffId: 4, client: "Fatima Ali",    service: "Gel X Full Set",      startH: 14, startM: 0,  durationMin: 90  },
  { staffId: 4, client: "Bella Scott",   service: "Nail Repair",         startH: 16, startM: 30, durationMin: 30  },
  // Kate
  { staffId: 5, client: "Avery Wilson",  service: "Soak Off + New Set",  startH: 10, startM: 0,  durationMin: 90  },
  { staffId: 5, client: "Grace Turner",  service: "Gel Manicure",        startH: 12, startM: 30, durationMin: 60  },
  { staffId: 5, client: "Luna Garcia",   service: "Nail Art",            startH: 14, startM: 0,  durationMin: 90  },
  { staffId: 5, client: "Amber Hall",    service: "Deluxe Pedicure",     startH: 16, startM: 0,  durationMin: 90  },
  // Tina
  { staffId: 6, client: "Cassidy Young", service: "French Manicure",     startH: 9,  startM: 30, durationMin: 45  },
  { staffId: 6, client: "Destiny King",  service: "Gel X Full Set",      startH: 10, startM: 30, durationMin: 90  },
  { staffId: 6, client: "Maya Rivera",   service: "Acrylic Fill",        startH: 13, startM: 0,  durationMin: 90  },
  { staffId: 6, client: "Summer Cox",    service: "Soak Off + New Set",  startH: 15, startM: 30, durationMin: 90  },
];

function toTopPx(h: number, m: number) {
  return (h - START_HOUR) * HOUR_HEIGHT + (m / 60) * HOUR_HEIGHT;
}
function toDurationPx(durationMin: number) {
  return (durationMin / 60) * HOUR_HEIGHT;
}

export default function DemoCalendarBackground() {
  const today    = useMemo(() => startOfToday(), []);
  const dateLabel = format(today, "MMMM d, yyyy");
  const dayNames  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(today, i - today.getDay()));
  const hours     = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const totalH    = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

  return (
    <div
      style={{
        position: "absolute", inset: 0,
        fontFamily: "'Inter', sans-serif",
        background: "#f8fafc",
        overflow: "hidden",
        userSelect: "none",
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      {/* ── Top nav bar ───────────────────────────────────────────────────── */}
      <div style={{
        height: HEADER_H, display: "flex", alignItems: "center",
        padding: "0 20px", gap: 12,
        background: "#fff", borderBottom: "1px solid #e5e7eb",
        flexShrink: 0,
      }}>
        {/* Sidebar icon placeholder */}
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f3f4f6", flexShrink: 0 }} />

        {/* Today button */}
        <div style={{
          padding: "5px 14px", borderRadius: 8,
          border: "1px solid #e5e7eb", background: "#fff",
          fontSize: ".8rem", fontWeight: 600, color: "#374151",
        }}>
          Today
        </div>

        {/* Arrows */}
        <div style={{ display: "flex", gap: 2 }}>
          {["‹", "›"].map(a => (
            <div key={a} style={{
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff",
              fontSize: "1rem", color: "#6b7280",
            }}>{a}</div>
          ))}
        </div>

        {/* Date */}
        <span style={{ fontWeight: 700, fontSize: ".95rem", color: "#111827", letterSpacing: "-.01em" }}>
          {dateLabel}
        </span>

        <div style={{ flex: 1 }} />

        {/* View pills */}
        {["Day", "Week", "Agenda"].map((v, i) => (
          <div key={v} style={{
            padding: "5px 13px", borderRadius: 8,
            background: i === 0 ? "#5B21B6" : "#fff",
            border: i === 0 ? "none" : "1px solid #e5e7eb",
            fontSize: ".78rem", fontWeight: 600,
            color: i === 0 ? "#fff" : "#6b7280",
          }}>{v}</div>
        ))}

        {/* Staff filter pill */}
        <div style={{
          padding: "5px 13px", borderRadius: 8,
          border: "1px solid #e5e7eb", background: "#fff",
          fontSize: ".78rem", fontWeight: 600, color: "#374151",
          display: "flex", gap: 6, alignItems: "center",
        }}>
          <span>All Staff</span>
          <span style={{ color: "#9ca3af" }}>▾</span>
        </div>

        {/* Settings gear */}
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          border: "1px solid #e5e7eb", background: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#9ca3af", fontSize: ".9rem",
        }}>⚙</div>
      </div>

      {/* ── Calendar body ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", height: `calc(100% - ${HEADER_H}px)` }}>

        {/* Left sidebar icons */}
        <div style={{
          width: 52, background: "#fff", borderRight: "1px solid #e5e7eb",
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: 12, gap: 6, flexShrink: 0,
        }}>
          {["📅", "💳", "👥", "📊", "💵"].map(ic => (
            <div key={ic} style={{
              width: 36, height: 36, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1rem",
            }}>{ic}</div>
          ))}
        </div>

        {/* ── Main grid area ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

          {/* Staff column headers */}
          <div style={{
            display: "flex", borderBottom: "1px solid #e5e7eb",
            background: "#fff", flexShrink: 0, height: STAFF_HEAD_H,
          }}>
            {/* time gutter blank */}
            <div style={{ width: TIME_GUTTER_W, flexShrink: 0, borderRight: "1px solid #f3f4f6" }} />

            {/* Staff headers */}
            {STAFF.map(s => (
              <div key={s.id} style={{
                flex: 1, minWidth: 0,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 4, borderRight: "1px solid #f3f4f6",
                padding: "6px 8px",
              }}>
                {/* Avatar */}
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: s.color, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: ".68rem", fontWeight: 700, flexShrink: 0,
                }}>
                  {s.initials}
                </div>
                <span style={{
                  fontSize: ".72rem", fontWeight: 600, color: "#374151",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}>
                  {s.name}
                </span>
              </div>
            ))}
          </div>

          {/* ── Scrollable time grid ── */}
          <div style={{ flex: 1, overflowY: "hidden", overflowX: "hidden", position: "relative" }}>
            <div style={{ display: "flex", height: totalH, position: "relative" }}>

              {/* Time gutter */}
              <div style={{ width: TIME_GUTTER_W, flexShrink: 0, position: "relative", borderRight: "1px solid #f3f4f6" }}>
                {hours.map(h => (
                  <div key={h} style={{
                    position: "absolute",
                    top: (h - START_HOUR) * HOUR_HEIGHT - 9,
                    right: 10, left: 0,
                    display: "flex", justifyContent: "flex-end", alignItems: "center",
                    fontSize: ".68rem", color: "#9ca3af", fontWeight: 500,
                    paddingRight: 8,
                  }}>
                    {h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`}
                  </div>
                ))}
              </div>

              {/* Staff columns */}
              {STAFF.map(s => (
                <div key={s.id} style={{
                  flex: 1, minWidth: 0,
                  position: "relative",
                  borderRight: "1px solid #f3f4f6",
                  background: "#fff",
                }}>
                  {/* Hour lines */}
                  {hours.map(h => (
                    <div key={h} style={{
                      position: "absolute", left: 0, right: 0,
                      top: (h - START_HOUR) * HOUR_HEIGHT,
                      height: 1, background: "#f3f4f6",
                    }} />
                  ))}

                  {/* Half-hour lines */}
                  {hours.map(h => (
                    <div key={`hh-${h}`} style={{
                      position: "absolute", left: 0, right: 0,
                      top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2,
                      height: 1, background: "#f9fafb",
                    }} />
                  ))}

                  {/* Appointment cards */}
                  {APPOINTMENTS.filter(a => a.staffId === s.id).map((appt, idx) => {
                    const col  = SVC_COLORS[appt.service] ?? { bg: "#f3f4f6", border: "#d1d5db", text: "#374151" };
                    const top  = toTopPx(appt.startH, appt.startM);
                    const ht   = Math.max(toDurationPx(appt.durationMin), 28);
                    const endH = appt.startH + Math.floor((appt.startM + appt.durationMin) / 60);
                    const endM = (appt.startM + appt.durationMin) % 60;
                    const timeStr = `${appt.startH > 12 ? appt.startH - 12 : appt.startH}:${String(appt.startM).padStart(2, "0")} ${appt.startH >= 12 ? "PM" : "AM"} – ${endH > 12 ? endH - 12 : endH}:${String(endM).padStart(2, "0")} ${endH >= 12 ? "PM" : "AM"}`;

                    return (
                      <div
                        key={idx}
                        style={{
                          position: "absolute",
                          top: top + 1, left: 3, right: 3,
                          height: ht - 2,
                          borderRadius: 7,
                          background: col.bg,
                          borderLeft: `3px solid ${col.border}`,
                          border: `1px solid ${col.border}`,
                          borderLeftWidth: 3,
                          padding: "5px 7px",
                          overflow: "hidden",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                        }}
                      >
                        <div style={{
                          fontSize: ".67rem", fontWeight: 700, color: col.text,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          lineHeight: 1.3,
                        }}>
                          {appt.service}
                        </div>
                        {ht >= 44 && (
                          <div style={{
                            fontSize: ".62rem", color: col.text, opacity: 0.8,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            lineHeight: 1.3,
                          }}>
                            {appt.client}
                          </div>
                        )}
                        {ht >= 60 && (
                          <div style={{
                            fontSize: ".6rem", color: col.text, opacity: 0.6,
                            lineHeight: 1.3,
                          }}>
                            {timeStr}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
