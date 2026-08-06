import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setPhase(1), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-end p-[5vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-[50vw] h-[60vh] relative">
        <motion.div 
          className="absolute right-[10%] top-0 w-[35vw] h-[45vh] rounded-lg overflow-hidden shadow-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        >
          <motion.img 
            src={`${import.meta.env.BASE_URL}images/receptionist-gesture.png`} 
            className="w-full h-full object-cover" 
            alt="Receptionist Gesturing"
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 3, ease: 'easeOut' }}
          />
        </motion.div>
        
        {phase >= 1 && (
          <motion.div 
            className="absolute left-0 bottom-0 w-[35vw] h-[45vh] rounded-lg overflow-hidden shadow-2xl z-10 border border-white/10"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
          >
            <motion.img 
              src={`${import.meta.env.BASE_URL}images/salon-interior.png`} 
              className="w-full h-full object-cover" 
              alt="Salon Interior"
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              transition={{ duration: 3, ease: 'easeOut' }}
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
