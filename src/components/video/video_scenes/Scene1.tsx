import { motion } from 'framer-motion';

export function Scene1() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-end p-[5vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Visual content on the right to leave space for left-side hero text */}
      <motion.div
        initial={{ x: '5vw', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 1.5, ease: 'easeOut', delay: 0.2 }}
        className="w-[45vw] h-[60vh] relative overflow-hidden rounded-lg shadow-2xl"
      >
        <motion.img 
          src={`${import.meta.env.BASE_URL}images/receptionist-greeting.png`} 
          className="w-full h-full object-cover transform origin-center" 
          alt="Receptionist Greeting"
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 4, ease: 'linear' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
      </motion.div>
    </motion.div>
  );
}
