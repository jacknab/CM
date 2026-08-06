import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1800),
      setTimeout(() => setPhase(4), 3200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Background image — slow Ken Burns pan right */}
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.12, x: "3%" }}
        animate={{ scale: 1.04, x: "0%" }}
        exit={{ scale: 1.0, opacity: 0 }}
        transition={{ duration: 4.5, ease: "easeOut" }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/scene1.png`}
          className="w-full h-full object-cover object-center"
          alt=""
        />
      </motion.div>

      {/* Warm blush gradient overlay — right side atmosphere */}
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 80% 50%, rgba(251,191,150,0.18) 0%, transparent 65%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 1 ? 1 : 0 }}
        transition={{ duration: 1.5 }}
      />

      {/* Floating reception card — bottom right */}
      <motion.div
        className="absolute bottom-[14vh] right-[8vw] z-20"
        style={{ width: "22vw" }}
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{
          opacity: phase >= 2 ? 1 : 0,
          y: phase >= 2 ? 0 : 30,
          scale: phase >= 2 ? 1 : 0.95,
        }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div
          className="rounded-2xl p-4"
          style={{
            background: "rgba(255,252,248,0.92)",
            backdropFilter: "blur(18px)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.12)",
          }}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)" }}>
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-white">
                <path d="M8 2a4 4 0 00-4 4v1H3a1 1 0 000 2h10a1 1 0 000-2h-1V6a4 4 0 00-4-4zM8 14a2 2 0 01-1.73-1h3.46A2 2 0 018 14z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "#6b5e45", letterSpacing: "0.08em", textTransform: "uppercase" }}>Walk-in Check-In</div>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#1a1209" }}>Welcome to Luxe Nails</div>
            </div>
          </div>
          <div style={{ fontSize: "0.72rem", color: "#7a6b54", marginBottom: "0.6rem" }}>Next available · 3 min wait</div>
          <div className="flex items-center justify-between">
            <div className="flex -space-x-1.5">
              {["#a78bfa","#f9a8d4","#fcd34d"].map((c, i) => (
                <div key={i} className="w-6 h-6 rounded-full border-2 border-white" style={{ background: c, zIndex: 3 - i }} />
              ))}
            </div>
            <div className="px-3 py-1 rounded-full text-white text-xs font-bold" style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)", fontSize: "0.65rem" }}>
              Check In
            </div>
          </div>
        </div>
      </motion.div>

      {/* Subtle scan-line indicator (top right) */}
      <motion.div
        className="absolute top-[10vh] right-[8vw] z-20 flex items-center gap-2"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: phase >= 3 ? 0.7 : 0, x: phase >= 3 ? 0 : 20 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          className="w-2 h-2 rounded-full"
          style={{ background: "#10b981" }}
          animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.75)", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>Live · 12 booked today</span>
      </motion.div>
    </motion.div>
  );
}
