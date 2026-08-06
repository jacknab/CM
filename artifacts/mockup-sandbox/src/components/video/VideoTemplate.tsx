import { motion, AnimatePresence } from "framer-motion";
import { useVideoPlayer } from "@/lib/video";
import { Scene1 } from "./video_scenes/Scene1";
import { Scene2 } from "./video_scenes/Scene2";
import { Scene3 } from "./video_scenes/Scene3";
import { Scene4 } from "./video_scenes/Scene4";

const SCENE_DURATIONS = {
  welcome:   4000,
  booking:   5000,
  transition: 3000,
  closure:   2500,
};

const ORBS = [
  { size: "55vw", x: ["20vw","45vw","15vw"], y: ["10vh","35vh","20vh"], dur: 18, color: "rgba(245,158,11,0.06)" },
  { size: "40vw", x: ["65vw","40vw","70vw"], y: ["50vh","20vh","55vh"], dur: 22, color: "rgba(255,200,150,0.07)" },
  { size: "30vw", x: ["10vw","60vw","30vw"], y: ["60vh","70vh","40vh"], dur: 15, color: "rgba(200,160,120,0.05)" },
];

const sceneIndicatorPos = [
  { y: "0vh" },
  { y: "0vh" },
  { y: "0vh" },
  { y: "0vh" },
];

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0d0a07]">
      {/* ─── Persistent ambient orbs ─── */}
      {ORBS.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl pointer-events-none"
          style={{
            width: orb.size,
            height: orb.size,
            background: orb.color,
          }}
          animate={{ x: orb.x, y: orb.y }}
          transition={{ duration: orb.dur, repeat: Infinity, ease: "easeInOut", repeatType: "mirror" }}
        />
      ))}

      {/* ─── Persistent left-side text-readability gradient ─── */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background: "linear-gradient(to right, rgba(8,6,4,0.82) 0%, rgba(8,6,4,0.55) 40%, rgba(8,6,4,0.15) 65%, rgba(8,6,4,0.05) 100%)",
        }}
      />

      {/* ─── Bottom vignette ─── */}
      <div
        className="absolute inset-x-0 bottom-0 h-40 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(8,6,4,0.7), transparent)" }}
      />

      {/* ─── Scenes ─── */}
      <AnimatePresence mode="sync">
        {currentScene === 0 && <Scene1 key="welcome" />}
        {currentScene === 1 && <Scene2 key="booking" />}
        {currentScene === 2 && <Scene3 key="transition" />}
        {currentScene === 3 && <Scene4 key="closure" />}
      </AnimatePresence>
    </div>
  );
}
