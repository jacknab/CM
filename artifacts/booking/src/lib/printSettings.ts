import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_PRINT_SETTINGS, printSettingsOf, type PrintSettings } from "@shared/printSettings";

/**
 * What prints by itself (shared/printSettings.ts), as this tablet last heard it. Staff screens load it from the
 * server; the kiosk and customer screen get the check-in slip choice with their salon settings. Kept on the tablet so
 * it holds with no internet.
 */
const KEY = "certxa.printSettings";
let current: PrintSettings = (() => {
  try { const raw = localStorage.getItem(KEY); return raw ? printSettingsOf({ printing: JSON.parse(raw) }) : DEFAULT_PRINT_SETTINGS; }
  catch { return DEFAULT_PRINT_SETTINGS; }
})();

export function printSettings(): PrintSettings {
  return current;
}

export function setPrintSettings(next: Partial<PrintSettings>): void {
  current = printSettingsOf({ printing: { ...current, ...next } });
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* this session only */ }
}

export const printSettingsKey = ["/api/nail/print-settings"] as const;

/** The salon's printing settings, loaded on a staff screen (refreshed when another device changes them). */
export function usePrintSettings(enabled = true): PrintSettings {
  const { data } = useQuery<PrintSettings>({
    queryKey: printSettingsKey,
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch("/api/nail/print-settings", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load the printing settings");
      return printSettingsOf({ printing: await res.json() });
    },
  });
  useEffect(() => { if (data) setPrintSettings(data); }, [data]);
  return data ?? current;
}

/** Save the salon's printing settings (the setup's Printing step). */
export async function savePrintSettings(next: Partial<PrintSettings>): Promise<PrintSettings> {
  const res = await fetch("/api/nail/print-settings", {
    method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.message || "Could not save the printing settings");
  const saved = printSettingsOf({ printing: d });
  setPrintSettings(saved);
  return saved;
}
