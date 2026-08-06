import { motion } from 'framer-motion';

export function Scene4() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-end p-[5vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="w-[45vw] h-[60vh] relative overflow-hidden rounded-lg shadow-2xl"
      >
        <motion.img 
          src={`${import.meta.env.BASE_URL}images/receptionist-greeting.png`} 
          className="w-full h-full object-cover" 
          alt="Loop Closure"
          initial={{ filter: 'blur(10px)', scale: 1.05 }}
          animate={{ filter: 'blur(0px)', scale: 1.1 }}
          transition={{ duration: 1, ease: 'linear' }}
        />
      </motion.div>
    </motion.div>
  );
}
