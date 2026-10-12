import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneCall, PhoneOff } from 'lucide-react';

type Phase = 'idle' | 'ringing' | 'answered' | 'talking' | 'ended';

const WAVEFORM_BARS = 28;

const TRANSCRIPT = [
  { speaker: 'caller', text: 'Hi, I need to book a gel manicure for Saturday.' },
  { speaker: 'autumn', text: 'Of course! I have 10 AM or 2 PM open with Maya. Which works?' },
  { speaker: 'caller', text: 'Let\'s do 10 AM.' },
  { speaker: 'autumn', text: 'Perfect — booked! You\'ll get a confirmation text shortly.' },
];

export default function AutumnPhoneAnimation() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [lineIndex, setLineIndex] = useState(-1);
  const [barHeights, setBarHeights] = useState<number[]>(Array(WAVEFORM_BARS).fill(4));
  const waveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animate waveform bars when talking
  useEffect(() => {
    if (phase === 'talking') {
      waveRef.current = setInterval(() => {
        setBarHeights(
          Array.from({ length: WAVEFORM_BARS }, (_, i) => {
            const base = 4;
            const amp = i % 2 === 0 ? 28 : 20;
            return base + Math.random() * amp;
          })
        );
      }, 120);
    } else {
      if (waveRef.current) clearInterval(waveRef.current);
      setBarHeights(Array(WAVEFORM_BARS).fill(4));
    }
    return () => { if (waveRef.current) clearInterval(waveRef.current); };
  }, [phase]);

  // Run the full animation sequence on loop
  useEffect(() => {
    let cancelled = false;

    const delay = (ms: number) =>
      new Promise<void>((res) => {
        timeoutRef.current = setTimeout(() => { if (!cancelled) res(); }, ms);
      });

    async function run() {
      while (!cancelled) {
        setPhase('idle');
        setLineIndex(-1);
        await delay(1800);

        setPhase('ringing');
        await delay(2800);

        setPhase('answered');
        await delay(900);

        setPhase('talking');
        for (let i = 0; i < TRANSCRIPT.length; i++) {
          if (cancelled) return;
          setLineIndex(i);
          await delay(2400);
        }

        setPhase('ended');
        await delay(2200);
      }
    }

    run();
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const isRinging = phase === 'ringing';
  const isActive = phase === 'answered' || phase === 'talking';
  const isEnded = phase === 'ended';

  return (
    <div className="relative flex flex-col items-center justify-center select-none" style={{ minHeight: 420 }}>

      {/* Outer ambient glow rings — only while ringing */}
      <AnimatePresence>
        {isRinging && (
          <>
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border border-primary/20"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: [0, 0.5, 0], scale: [0.7, 1.6 + i * 0.3, 2.2 + i * 0.3] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2, delay: i * 0.4, repeat: Infinity, ease: 'easeOut' as const }}
                style={{ width: 120, height: 120 }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Phone card */}
      <motion.div
        className="relative z-10 rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col"
        style={{
          width: 280,
          background: 'hsl(var(--card))',
        }}
        animate={isRinging ? { y: [0, -4, 4, -4, 4, 0] } : { y: 0 }}
        transition={isRinging ? { duration: 0.5, repeat: Infinity, repeatDelay: 0.3 } : { duration: 0.3 }}
      >
        {/* Status bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-[11px] font-semibold text-muted-foreground tracking-wide">
            {phase === 'idle' ? 'Certxa Salon' : phase === 'ringing' ? 'Incoming call…' : phase === 'ended' ? 'Call ended' : 'Connected'}
          </span>
          <AnimatePresence mode="wait">
            {isActive && (
              <motion.span
                key="timer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[11px] font-mono text-primary"
              >
                00:12
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Caller info */}
        <div className="flex flex-col items-center gap-2 px-5 py-5">
          {/* Avatar */}
          <motion.div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-primary-foreground"
            style={{ background: 'hsl(var(--primary))' }}
            animate={isRinging ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={isRinging ? { duration: 0.6, repeat: Infinity } : { duration: 0.3 }}
          >
            A
          </motion.div>
          <div className="text-center">
            <p className="font-semibold text-foreground text-sm">Autumn</p>
            <p className="text-xs text-muted-foreground">AI Receptionist · Certxa</p>
          </div>

          {/* Waveform — only while talking */}
          <div className="h-10 flex items-end gap-[2px] mt-1" aria-hidden="true">
            {barHeights.map((h, i) => (
              <motion.div
                key={i}
                className="rounded-full"
                style={{
                  width: 3,
                  background: phase === 'talking'
                    ? (TRANSCRIPT[lineIndex]?.speaker === 'autumn' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))')
                    : 'hsl(var(--border))',
                }}
                animate={{ height: phase === 'talking' ? h : 4 }}
                transition={{ duration: 0.12, ease: 'easeOut' as const }}
              />
            ))}
          </div>
        </div>

        {/* Transcript bubble */}
        <div className="px-4 pb-3 min-h-[56px] flex items-center">
          <AnimatePresence mode="wait">
            {lineIndex >= 0 && TRANSCRIPT[lineIndex] && (
              <motion.div
                key={lineIndex}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className={`rounded-2xl px-3 py-2 text-xs leading-relaxed max-w-full ${
                  TRANSCRIPT[lineIndex].speaker === 'autumn'
                    ? 'bg-primary text-primary-foreground self-end ml-auto'
                    : 'bg-muted text-foreground'
                }`}
              >
                <span className="block font-semibold mb-0.5 opacity-70 text-[10px]">
                  {TRANSCRIPT[lineIndex].speaker === 'autumn' ? 'Autumn' : 'Caller'}
                </span>
                {TRANSCRIPT[lineIndex].text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-6 px-5 py-4 border-t border-border">
          <AnimatePresence mode="wait">
            {phase === 'idle' && (
              <motion.div
                key="idle-btn"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'hsl(var(--muted))' }}
              >
                <Phone size={20} className="text-muted-foreground" />
              </motion.div>
            )}

            {isRinging && (
              <motion.div
                key="ring-btn"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: [1, 1.12, 1] }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.6, repeat: Infinity }}
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
                style={{ background: 'hsl(var(--primary))' }}
              >
                <Phone size={20} className="text-primary-foreground" />
              </motion.div>
            )}

            {isActive && (
              <motion.div
                key="active-btn"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
                style={{ background: 'hsl(var(--primary))' }}
              >
                <PhoneCall size={20} className="text-primary-foreground" />
              </motion.div>
            )}

            {isEnded && (
              <motion.div
                key="ended-btn"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'hsl(var(--destructive) / 0.12)' }}
              >
                <PhoneOff size={20} style={{ color: 'hsl(var(--destructive))' }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom label */}
        <div className="px-5 pb-4 text-center">
          <AnimatePresence mode="wait">
            {phase === 'idle' && (
              <motion.p key="idle-lbl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[11px] text-muted-foreground">
                Waiting for next call…
              </motion.p>
            )}
            {isRinging && (
              <motion.p key="ring-lbl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[11px] text-primary font-semibold">
                Answering in under 2 s
              </motion.p>
            )}
            {isActive && (
              <motion.p key="active-lbl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[11px] text-muted-foreground">
                Booking appointment in real time
              </motion.p>
            )}
            {isEnded && (
              <motion.p key="ended-lbl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[11px] text-muted-foreground">
                Appointment confirmed ✓
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Stat chips below the phone */}
      <div className="flex gap-3 mt-6 flex-wrap justify-center">
        {[
          { label: 'Avg answer time', value: '< 2 s' },
          { label: 'Calls handled', value: '24/7' },
          { label: 'Booking rate', value: '94%' },
        ].map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center gap-0.5 rounded-xl border border-border bg-card px-4 py-2.5"
          >
            <span className="text-lg font-extrabold text-primary" style={{ fontFamily: 'var(--font-heading)' }}>
              {s.value}
            </span>
            <span className="text-[10px] text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
