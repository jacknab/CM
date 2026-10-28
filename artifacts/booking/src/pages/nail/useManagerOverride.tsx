import { useCallback, useState } from "react";
import { ManagerPinSheet } from "@/components/staff-screen/ManagerPinSheet";
import { isDoneLocked, withManagerPin } from "./nailApi";

/**
 * The DONE lock (owner, 2026-10-28): a change to a ticket whose technician pressed DONE is refused by the server
 * (423 DONE_LOCKED) until a manager approves it. `guard(fn)` runs the change; when it is refused it asks for the
 * manager PIN and runs it again with the PIN. Resolves to undefined when the manager prompt is closed.
 * Render `pinSheet` once on the screen.
 */
export function useManagerOverride() {
  const [ask, setAsk] = useState<{ resolve: (pin: string | null) => void } | null>(null);
  const guard = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (err) {
      if (!isDoneLocked(err)) throw err;
      const pin = await new Promise<string | null>((resolve) => setAsk({ resolve }));
      setAsk(null);
      if (!pin) return undefined;
      return withManagerPin(pin, fn);
    }
  }, []);
  const pinSheet = ask
    ? <ManagerPinSheet title="Service is DONE · Manager PIN" onClose={() => ask.resolve(null)} onSuccess={(pin) => ask.resolve(pin)} />
    : null;
  return { guard, pinSheet };
}
