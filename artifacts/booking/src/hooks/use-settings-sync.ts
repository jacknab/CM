import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const MIN_GAP_MS = 3_000;

/**
 * Keeps an always-open screen (the /calendar tablet) in step with settings saved
 * elsewhere. The native app has no hard refresh, so this refetches every query that
 * already has data: on mount (returning from Settings), when the app comes back to the
 * foreground, and whenever `refresh` is called (server "settings_changed" event, or a
 * websocket reconnect that may have missed one).
 */
export function useSettingsSync(enabled: boolean) {
  const queryClient = useQueryClient();

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({
      refetchType: "active",
      predicate: (q) => q.state.dataUpdatedAt > 0,
    });
  }, [queryClient]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [enabled, refresh]);

  return refresh;
}
