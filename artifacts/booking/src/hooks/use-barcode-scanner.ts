import { useEffect, useRef } from "react";

/**
 * USB / Bluetooth barcode & QR scanners act as HID keyboards and type the whole code very fast
 * (< 50 ms between keys) and finish with Enter; a person types far slower. Listens at document level
 * (capture phase) so it works whichever element has focus, and never fires while a real form field is
 * focused. Same timings as the calendar's scanner.
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const buffer = useRef("");
  const lastKeyAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const INTER_KEY_MAX_MS = 50;
    const BUFFER_RESET_MS = 300;
    const MIN_SCAN_LENGTH = 6;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((document.activeElement as HTMLElement | null)?.isContentEditable) return;

      const now = Date.now();
      const gap = now - lastKeyAt.current;
      lastKeyAt.current = now;

      if (e.key === "Enter") {
        const scanned = buffer.current;
        buffer.current = "";
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        if (scanned.length >= MIN_SCAN_LENGTH) {
          e.preventDefault();
          cb.current(scanned);
        }
        return;
      }
      if (e.key.length !== 1) return;

      if (buffer.current.length > 0 && gap > INTER_KEY_MAX_MS) buffer.current = e.key;
      else buffer.current += e.key;

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { buffer.current = ""; timer.current = null; }, BUFFER_RESET_MS);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [enabled]);
}
