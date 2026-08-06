import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 2000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Background image — slow tilt-shift style zoom */}
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.08, y: "1%" }}
        animate={{ scale: 1.02, y: "0%" }}
        exit={{ opacity: 0, scale: 1.0 }}
        transition={{ duration: 3.5, ease: "easeOut" }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/scene3.png`}
          className="w-full h-full object-cover object-center"
          alt=""
        />
      </motion.div>

      {/* Depth-of-field blur vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 60% 100%, rgba(8,6,4,0.4) 0%, transparent 60%)",
        }}
      />

      {/* Floating service cards — staggered in from right */}
      {[
        { label: "Gel Manicure", price: "$45", dur: "45 min", color: "#a78bfa", delay: 0.2 },
        { label: "Acrylic Full Set", price: "$75", dur: "90 min", color: "#f9a8d4", delay: 0.4 },
        { label: "Builder Gel", price: "$55", dur: "60 min", color: "#6ee7b7", delay: 0.6 },
      ].map((svc, i) => (
        <motion.div
          key={i}
          className="absolute z-20"
          style={{
            right: `${6 + i * 1.5}vw`,
            top: `${24 + i * 18}vh`,
          }}
          initial={{ opacity: 0, x: 40, scale: 0.9 }}
          animate={{
            opacity: phase >= 2 ? 1 : 0,
            x: phase >= 2 ? 0 : 40,
            scale: phase >= 2 ? 1 : 0.9,
          }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.5, delay: svc.delay, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
            style={{
              background: "rgba(255,252,248,0.9)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              minWidth: "15vw",
            }}
          >
            <div className="w-7 h-7 rounded-lg flex-shrink-0" style={{ background: svc.color, opacity: 0.85 }} />
            <div className="flex-1">
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#1a1209" }}>{svc.label}</div>
              <div style={{ fontSize: "0.58rem", color: "#9b8a72" }}>{svc.dur}</div>
            </div>
            <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#D97706" }}>{svc.price}</div>
          </div>
        </motion.div>
      ))}

      {/* "Book Online" call-out bubble */}
      <motion.div
        className="absolute bottom-[18vh] right-[8vw] z-20"
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{
          opacity: phase >= 3 ? 1 : 0,
          scale: phase >= 3 ? 1 : 0.8,
          y: phase >= 3 ? 0 : 20,
        }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <div
          className="px-4 py-2.5 rounded-full flex items-center gap-2"
          style={{
            background: "linear-gradient(135deg, #F59E0B, #D97706)",
            boxShadow: "0 8px 28px rgba(245,158,11,0.45)",
          }}
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-white">
            <path d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1z"/>
          </svg>
          <span style={{ color: "white", fontSize: "0.75rem", fontWeight: 700 }}>Book Online · 24/7</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
