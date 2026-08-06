import { motion } from 'framer-motion';

export function Scene2() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-end p-[5vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        initial={{ y: '5vh', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        className="w-[45vw] h-[60vh] relative overflow-hidden rounded-lg shadow-2xl"
      >
        <motion.img 
          src={`${import.meta.env.BASE_URL}images/tablet-booking-ui.png`} 
          className="w-full h-full object-cover" 
          alt="Tablet UI" 
          initial={{ scale: 1.05, x: '2%' }}
          animate={{ scale: 1, x: '0%' }}
          transition={{ duration: 5, ease: 'linear' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
      </motion.div>
    </motion.div>
  );
}
