import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

/**
 * The "floating glass card" look shared by every panel on the right side of the /frontdesk cart screen (RewardsPanel,
 * TipPanel, …): layered shadows, a slow idle float, a rise-in on arrival, and a gentle tilt + sheen that follows the
 * finger / pointer. All motion is pure CSS transforms (cheap on a tablet) and switches off for reduced motion. One
 * copy of the CSS/behaviour here so every panel using it looks and moves identically — never duplicate this file.
 */

export const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Counts up to `target` smoothly, so a number on a card feels alive when the panel appears or the value changes. */
export function useCountUp(target: number, ms = 1100): number {
  const [v, setV] = useState(() => (reducedMotion() ? target : 0));
  const from = useRef(v);
  useEffect(() => {
    if (reducedMotion()) { setV(target); return; }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(start + (target - start) * eased);
      from.current = cur;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** The rise-in delay for the i-th card (0-based, in arrival order), and its idle-float timing once risen. */
export const cardRiseDelay = (i: number): CSSProperties => ({ animationDelay: `${0.12 + i * 0.11}s` });
export const cardFloatStyle = (i: number): CSSProperties => ({ animationDuration: `${6 + (i % 3) * 0.9}s`, animationDelay: `${-i * 1.3}s` });

/** Tilt + sheen that follow the pointer across the panel — put the ref on the outer `.fd-rw` and spread the handlers onto it. */
export function useFloatingTilt() {
  const stageRef = useRef<HTMLDivElement>(null);
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = stageRef.current;
    if (!el || reducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${((0.5 - y) * 9).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((x - 0.5) * 12).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${(x * 100).toFixed(0)}%`);
  };
  const onPointerLeave = () => {
    const el = stageRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--mx", "30%");
  };
  return { stageRef, onPointerMove, onPointerLeave };
}

export const FLOATING_CARD_CSS = `
  .fd-rw { position: absolute; inset: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .fd-rw-col { position: relative; width: 100%; max-width: 430px; max-height: 100%; padding: 26px 22px; display: flex; flex-direction: column; gap: 16px; }
  .fd-rw-scroll { display: flex; flex-direction: column; gap: 16px; overflow-y: auto; overflow-x: hidden; padding: 14px 34px 90px; margin: -14px -34px -90px; scrollbar-width: none; }
  .fd-rw-scroll::-webkit-scrollbar { display: none; }

  /* drifting light orbs behind everything: depth */
  .fd-orb { position: absolute; border-radius: 50%; filter: blur(34px); opacity: .55; pointer-events: none; animation: fd-drift 19s ease-in-out infinite; }
  .fd-orb.a { width: 300px; height: 300px; left: -70px; top: -40px; background: radial-gradient(circle, #ffd1ec, transparent 68%); }
  .fd-orb.b { width: 360px; height: 360px; right: -110px; bottom: -70px; background: radial-gradient(circle, #b58cff, transparent 66%); animation-duration: 24s; animation-delay: -6s; }
  .fd-orb.c { width: 220px; height: 220px; left: 38%; top: 46%; background: radial-gradient(circle, #ff9ad0, transparent 70%); animation-duration: 28s; animation-delay: -12s; opacity: .4; }
  @keyframes fd-drift { 0%, 100% { transform: translate3d(0, 0, 0) scale(1); } 33% { transform: translate3d(34px, 22px, 0) scale(1.08); } 66% { transform: translate3d(-26px, 36px, 0) scale(.94); } }

  /* arrival, then a slow idle float — on separate wrappers so their transforms stack */
  .fd-rise { animation: fd-rise .8s cubic-bezier(.2, .85, .25, 1) both; }
  @keyframes fd-rise { from { opacity: 0; transform: perspective(900px) translate3d(0, 46px, -80px) rotateX(-22deg) scale(.94); } to { opacity: 1; transform: perspective(900px) translate3d(0, 0, 0) rotateX(0deg) scale(1); } }
  .fd-float { animation: fd-float 6.5s ease-in-out infinite; transform-style: preserve-3d; }
  @keyframes fd-float { 0%, 100% { transform: perspective(900px) translate3d(0, 0, 0) rotateX(0deg); } 50% { transform: perspective(900px) translate3d(0, -7px, 0) rotateX(1.6deg); } }

  /* the glass card itself: layered shadows read as height above the screen */
  .fd-card { position: relative; border-radius: 24px; padding: 17px 19px; color: #0b0b12; overflow: hidden;
    background: linear-gradient(150deg, rgba(255,255,255,.34), rgba(255,255,255,.11) 60%, rgba(255,255,255,.18));
    border: 1px solid rgba(255,255,255,.42);
    -webkit-backdrop-filter: blur(16px) saturate(150%); backdrop-filter: blur(16px) saturate(150%);
    box-shadow: inset 0 1.5px 0 rgba(255,255,255,.6), inset 0 -3px 8px rgba(70,15,130,.20),
                0 2px 3px rgba(50,8,110,.22), 0 12px 22px rgba(50,8,110,.28), 0 30px 54px rgba(50,8,110,.30);
    transform: perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform .28s ease-out; will-change: transform; }
  /* a sheen that follows the pointer */
  .fd-card::before { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    background: radial-gradient(360px 150px at var(--mx, 30%) -10%, rgba(255,255,255,.42), transparent 62%); transition: background-position .2s; }
  /* a card that's "the one" right now (a redeemable reward, the chosen tip, …): a bright rim and a soft inner glow that
     pulses (opacity only — cheap on a tablet) */
  .fd-ready { box-shadow: inset 0 1.5px 0 rgba(255,255,255,.7), inset 0 -3px 8px rgba(70,15,130,.16), 0 0 0 1.5px rgba(255,255,255,.85),
                0 2px 3px rgba(50,8,110,.22), 0 14px 26px rgba(50,8,110,.30), 0 34px 60px rgba(50,8,110,.32); }
  .fd-ready::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-shadow: inset 0 0 34px 6px rgba(255,255,255,.65); animation: fd-glow 2.6s ease-in-out infinite; }
  @keyframes fd-glow { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }

  .fd-badge { width: 54px; height: 54px; border-radius: 17px; flex-shrink: 0; display: grid; place-items: center; font-size: 28px;
    background: linear-gradient(145deg, #fff, #ffd9ee); box-shadow: 0 4px 0 rgba(150,60,170,.35), 0 10px 18px rgba(50,8,110,.35), inset 0 2px 0 #fff; }
  .fd-bar { height: 8px; border-radius: 8px; background: rgba(60,8,120,.28); overflow: hidden; box-shadow: inset 0 1px 3px rgba(40,0,90,.35); }
  .fd-bar > i { display: block; height: 100%; border-radius: 8px; background: linear-gradient(90deg, #fff, #ffd9ee); box-shadow: 0 0 10px rgba(255,255,255,.7); transition: width 1.1s cubic-bezier(.2,.85,.25,1); }

  /* a pressable 3D button */
  .fd-btn { border: none; border-radius: 14px; padding: 11px 20px; font-size: 14px; font-weight: 900; letter-spacing: .02em; flex-shrink: 0; cursor: pointer;
    transition: transform .09s ease, box-shadow .09s ease; }
  .fd-btn.on { background: linear-gradient(180deg, #fff, #ffeaf5); box-shadow: 0 5px 0 rgba(140,60,170,.55), 0 12px 18px rgba(40,0,90,.35); }
  .fd-btn.on:active { transform: translateY(4px); box-shadow: 0 1px 0 rgba(140,60,170,.55), 0 4px 8px rgba(40,0,90,.35); }
  .fd-btn.off { background: rgba(255,255,255,.14); color: rgba(11,11,18,.55); box-shadow: inset 0 1px 0 rgba(255,255,255,.25); cursor: default; }
  .fd-btn.done { background: rgba(255,255,255,.5); color: #0b0b12; box-shadow: inset 0 1px 0 rgba(255,255,255,.4); cursor: default; }

  @media (prefers-reduced-motion: reduce) {
    .fd-rise, .fd-float, .fd-orb, .fd-ready::after { animation: none !important; }
    .fd-card { transition: none; }
    .fd-bar > i { transition: none; }
  }
`;
