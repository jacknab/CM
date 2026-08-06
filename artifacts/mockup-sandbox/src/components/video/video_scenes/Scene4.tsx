import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 900),
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
      {/* Reuse scene1 image — slight different crop, fades back to start */}
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.05, x: "0%" }}
        animate={{ scale: 1.08, x: "2%" }}
        exit={{ opacity: 0, scale: 1.12 }}
        transition={{ duration: 2.8, ease: "easeIn" }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/scene1.png`}
          className="w-full h-full object-cover object-right"
          alt=""
        />
      </motion.div>

      {/* Warm loop-bridge overlay */}
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 70% 45%, rgba(251,191,100,0.14) 0%, transparent 65%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 1 ? 1 : 0 }}
        transition={{ duration: 1.2 }}
      />

      {/* Stats trio — bottom right */}
      <motion.div
        className="absolute bottom-[12vh] right-[6vw] z-20 flex flex-col gap-2"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 24 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        {[
          { label: "Fill Rate", value: "94%", color: "#10b981" },
          { label: "No-shows prevented", value: "↓ 78%", color: "#F59E0B" },
          { label: "Revenue growth", value: "↑ 23%", color: "#a78bfa" },
        ].map((stat, i) => (
          <motion.div
            key={i}
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl"
            style={{
              background: "rgba(255,252,248,0.88)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 6px 24px rgba(0,0,0,0.16)",
            }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: phase >= 2 ? 1 : 0, x: phase >= 2 ? 0 : 20 }}
            transition={{ duration: 0.4, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: stat.color }} />
            <span style={{ fontSize: "0.62rem", color: "#7a6b54", fontWeight: 500, minWidth: "10vw" }}>{stat.label}</span>
            <span style={{ fontSize: "0.78rem", color: "#1a1209", fontWeight: 800, marginLeft: "auto" }}>{stat.value}</span>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
