import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';

const SCENE_DURATIONS = { open: 4000, build1: 5000, build2: 3000, close: 1000 };

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0A1128]">
      {/* Background Video Layer */}
      <div className="absolute inset-0 z-0">
        <video 
          src={`${import.meta.env.BASE_URL}videos/salon-bg-pan.mp4`}
          className="w-full h-full object-cover opacity-40 mix-blend-screen"
          autoPlay
          muted
          loop
          playsInline
        />
        {/* Subtle Dark Gradient Overlay for the left side text readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A1128] via-[#0A1128]/70 to-transparent" />
      </div>

      {/* Shared Midground Effects */}
      <motion.div
        className="absolute w-[50vw] h-[50vh] rounded-full bg-amber-500/10 blur-[100px]"
        animate={{
          x: ['70vw', '50vw', '30vw', '70vw'][currentScene],
          y: ['20vh', '50vh', '10vh', '20vh'][currentScene],
          scale: [1, 1.2, 0.8, 1][currentScene],
        }}
        transition={{ duration: 2, ease: "easeInOut" }}
      />

      <AnimatePresence mode="sync">
        {currentScene === 0 && <Scene1 key="open" />}
        {currentScene === 1 && <Scene2 key="build1" />}
        {currentScene === 2 && <Scene3 key="build2" />}
        {currentScene === 3 && <Scene4 key="close" />}
      </AnimatePresence>
    </div>
  );
}
