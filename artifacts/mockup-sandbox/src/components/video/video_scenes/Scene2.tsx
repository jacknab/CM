import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const APPOINTMENTS = [
  { time: "09:00", name: "Emma Clarke", service: "Gel Manicure", color: "#a78bfa", initials: "EC", confirmed: true },
  { time: "10:30", name: "Priya Patel",  service: "Acrylic Full Set", color: "#f9a8d4", initials: "PP", confirmed: true },
  { time: "12:00", name: "Sophie Lee",  service: "Pedicure + OPI",   color: "#fcd34d", initials: "SL", confirmed: false },
  { time: "14:00", name: "Aisha Brown", service: "Builder Gel",      color: "#6ee7b7", initials: "AB", confirmed: true },
];

export function Scene2() {
  const [phase, setPhase] = useState(0);
  const [tapped, setTapped] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1600),
      setTimeout(() => { setPhase(4); setTapped(true); }, 3000),
      setTimeout(() => setPhase(5), 4200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Background image — slow pan left */}
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.1, x: "-2%" }}
        animate={{ scale: 1.03, x: "1%" }}
        exit={{ opacity: 0, scale: 1.0 }}
        transition={{ duration: 5.5, ease: "easeOut" }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/scene2.png`}
          className="w-full h-full object-cover object-center"
          alt=""
        />
      </motion.div>

      {/* Additional warm tint */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 75% 60%, rgba(245,200,140,0.12) 0%, transparent 60%)" }}
      />

      {/* Booking UI panel — right side */}
      <motion.div
        className="absolute top-1/2 right-[6vw] z-20"
        style={{ width: "26vw", transform: "translateY(-50%)" }}
        initial={{ opacity: 0, x: 40, scale: 0.95 }}
        animate={{
          opacity: phase >= 2 ? 1 : 0,
          x: phase >= 2 ? 0 : 40,
          scale: phase >= 2 ? 1 : 0.95,
        }}
        exit={{ opacity: 0, x: 30 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,252,248,0.94)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.28), 0 2px 12px rgba(0,0,0,0.14)",
          }}
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <div>
              <div style={{ fontSize: "0.58rem", fontWeight: 700, color: "#9b7e50", letterSpacing: "0.1em", textTransform: "uppercase" }}>Thursday, 30 April</div>
              <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#1a1209" }}>Today's Schedule</div>
            </div>
            <div className="px-2.5 py-1 rounded-full" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)" }}>
              <span style={{ fontSize: "0.58rem", fontWeight: 700, color: "#D97706" }}>12 booked</span>
            </div>
          </div>

          {/* Appointment rows */}
          <div className="px-3 py-2 space-y-1.5">
            {APPOINTMENTS.map((appt, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-2.5 p-2 rounded-xl"
                style={{
                  background: tapped && i === 0 ? "rgba(245,158,11,0.12)" : "rgba(0,0,0,0.03)",
                  border: tapped && i === 0 ? "1px solid rgba(245,158,11,0.35)" : "1px solid transparent",
                  transition: "all 0.3s ease",
                }}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: phase >= 3 ? 1 : 0, x: phase >= 3 ? 0 : 16 }}
                transition={{ duration: 0.4, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <div style={{ fontSize: "0.6rem", color: "#9b8a72", fontWeight: 600, minWidth: "2.8rem" }}>{appt.time}</div>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: appt.color, fontSize: "0.5rem", fontWeight: 800 }}>
                  {appt.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: "0.68rem", fontWeight: 600, color: "#1a1209", lineHeight: 1.2 }}>{appt.name}</div>
                  <div style={{ fontSize: "0.58rem", color: "#9b8a72" }}>{appt.service}</div>
                </div>
                {appt.confirmed ? (
                  <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#10b981" }}>
                    <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 fill-white"><path d="M2 6l3 3 5-5"/></svg>
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: "rgba(245,158,11,0.2)", border: "1.5px solid #F59E0B" }} />
                )}
              </motion.div>
            ))}
          </div>

          {/* Confirm tap ripple */}
          <div className="px-3 pb-4">
            <motion.div
              className="rounded-xl py-2.5 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)", position: "relative", overflow: "hidden" }}
              animate={tapped ? { scale: [1, 0.97, 1] } : {}}
              transition={{ duration: 0.25 }}
            >
              {tapped && (
                <motion.div
                  className="absolute inset-0 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.3)" }}
                  initial={{ scale: 0, opacity: 0.8 }}
                  animate={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                />
              )}
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-white">
                <path d="M13.707 4.293a1 1 0 00-1.414 0L6 10.586 3.707 8.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l7-7a1 1 0 000-1.414z"/>
              </svg>
              <span style={{ color: "white", fontSize: "0.72rem", fontWeight: 700 }}>
                {tapped ? "Slot Confirmed!" : "Confirm Slot"}
              </span>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Revenue stat — top right */}
      <motion.div
        className="absolute top-[10vh] right-[6vw] z-20 flex items-center gap-2"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: phase >= 2 ? 0.9 : 0, y: phase >= 2 ? 0 : -16 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div
          className="px-3 py-1.5 rounded-full flex items-center gap-1.5"
          style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)", backdropFilter: "blur(8px)" }}
        >
          <svg viewBox="0 0 12 12" className="w-3 h-3" style={{ fill: "#10b981" }}><path d="M6 1l1.5 3 3.3.5-2.4 2.3.6 3.2L6 8.5l-3 1.5.6-3.2L1.2 4.5 4.5 4z"/></svg>
          <span style={{ fontSize: "0.62rem", color: "#10b981", fontWeight: 700 }}>$8,462 this month · ↑23%</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
