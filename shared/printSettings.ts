/**
 * What prints by itself on the salon's receipt printer (owner, 2026-11-02; set in the front desk setup's Printing
 * step and kept in store_settings.preferences.printing). Absent = how it always worked: both receipt copies, the
 * Day Close report and the check-in slip all print.
 *   salonCopy    — the salon copy of a sales receipt (the one signed for a card sale). Off: only the customer copy.
 *   dayClose     — the Day Close (Z) report printed when the day is closed. "none": printed only when asked.
 *   checkinSlip  — the slip printed when a client checks in (kiosk, customer screen, front desk). "none": no slip.
 */
export interface PrintSettings {
  salonCopy: boolean;
  dayClose: "auto" | "none";
  checkinSlip: "auto" | "none";
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = { salonCopy: true, dayClose: "auto", checkinSlip: "auto" };

/** The settings from the salon's preferences (or anything else), with every gap filled by the default. */
export function printSettingsOf(prefs: unknown): PrintSettings {
  const p = (prefs as { printing?: Partial<PrintSettings> } | null)?.printing ?? {};
  return {
    salonCopy: p.salonCopy !== false,
    dayClose: p.dayClose === "none" ? "none" : "auto",
    checkinSlip: p.checkinSlip === "none" ? "none" : "auto",
  };
}
