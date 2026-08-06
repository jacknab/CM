import { useEffect, useRef, useCallback, useState } from "react";

interface CalendarFaderScrollbarProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

export function CalendarFaderScrollbar({ scrollContainerRef, className }: CalendarFaderScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbTop, setThumbTop] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(36);
  const [scrollable, setScrollable] = useState(false);
  const dragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartScroll = useRef(0);

  const TRACK_PADDING = 8;

  const compute = useCallback(() => {
    const el = scrollContainerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const trackH = track.clientHeight - TRACK_PADDING * 2;
    const ratio = el.clientHeight / el.scrollHeight;
    if (ratio >= 1) {
      setScrollable(false);
      return;
    }
    setScrollable(true);
    const th = Math.max(32, Math.min(trackH * ratio, trackH * 0.8));
    const scrollableRange = el.scrollHeight - el.clientHeight;
    const scrollRatio = scrollableRange > 0 ? el.scrollTop / scrollableRange : 0;
    const maxTop = trackH - th;
    setThumbHeight(th);
    setThumbTop(TRACK_PADDING + scrollRatio * maxTop);
  }, [scrollContainerRef]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener("scroll", compute, { passive: true });
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    compute();
    return () => {
      el.removeEventListener("scroll", compute);
      ro.disconnect();
    };
  }, [scrollContainerRef, compute]);

  const scrollToRatio = useCallback((clientY: number) => {
    const el = scrollContainerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const trackH = track.clientHeight - TRACK_PADDING * 2;
    const th = thumbHeight;
    const maxTop = trackH - th;
    const relY = clientY - track.getBoundingClientRect().top - TRACK_PADDING - th / 2;
    const ratio = Math.max(0, Math.min(1, relY / maxTop));
    el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
  }, [scrollContainerRef, thumbHeight]);

  const onThumbPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    dragStartY.current = e.clientY;
    dragStartScroll.current = scrollContainerRef.current?.scrollTop ?? 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [scrollContainerRef]);

  const onThumbPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const el = scrollContainerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const trackH = track.clientHeight - TRACK_PADDING * 2;
    const maxTop = trackH - thumbHeight;
    const deltaY = e.clientY - dragStartY.current;
    const scrollRange = el.scrollHeight - el.clientHeight;
    const deltaScroll = maxTop > 0 ? (deltaY / maxTop) * scrollRange : 0;
    el.scrollTop = Math.max(0, Math.min(scrollRange, dragStartScroll.current + deltaScroll));
    compute();
  }, [scrollContainerRef, thumbHeight, compute]);

  const onThumbPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const onTrackPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target === thumbRef.current) return;
    scrollToRatio(e.clientY);
  }, [scrollToRatio]);

  if (!scrollable) return null;

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: 22,
        zIndex: 30,
        display: "flex",
        alignItems: "stretch",
        pointerEvents: "auto",
      }}
    >
      <div
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        style={{
          position: "absolute",
          right: 3,
          top: 6,
          bottom: 6,
          width: 14,
          borderRadius: 10,
          background: "rgba(30, 30, 40, 0.18)",
          backdropFilter: "blur(2px)",
          cursor: "pointer",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        {/* Tick marks */}
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: `${TRACK_PADDING + ((100 - TRACK_PADDING * 2) / 8) * i}%`,
              width: i % 4 === 0 ? 8 : 5,
              height: 1.5,
              borderRadius: 1,
              background: "rgba(255,255,255,0.25)",
              pointerEvents: "none",
            }}
          />
        ))}

        {/* Thumb */}
        <div
          ref={thumbRef}
          onPointerDown={onThumbPointerDown}
          onPointerMove={onThumbPointerMove}
          onPointerUp={onThumbPointerUp}
          onPointerCancel={onThumbPointerUp}
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: thumbTop,
            width: 16,
            height: thumbHeight,
            borderRadius: 8,
            background: "linear-gradient(180deg, #f8f8f8 0%, #e0e0e0 50%, #f0f0f0 100%)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.08)",
            cursor: "grab",
            userSelect: "none",
            touchAction: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
          }}
        >
          {/* Grip lines */}
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 1.5,
                borderRadius: 1,
                background: "rgba(0,0,0,0.22)",
                pointerEvents: "none",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
