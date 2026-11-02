/** What the Certxa app answered: printed, or why not. */
export type NativeBadgePrint = { ok: true } | { ok: false; error: string };

/** The Certxa app is running this page, but its version cannot print badges (it needs its latest update). */
export const nativeAppWithoutBadgePrint = () =>
  !!(window as any).CERTXA_NATIVE_APP && !(window as any).CERTXA_TECH_ID_PRINT_BRIDGE;

/** Ask the Certxa Owner native shell to print one technician QR badge (or another code on a badge: a manager badge,
 *  a setting confirmation) on the app's receipt printer (network, Bluetooth or USB). null when this page is not in
 *  an app that can; otherwise the app's answer, with its reason when it could not print. */
export function printNativeTechId(tech: { id: number; name: string }, qrValue = `TECH:${tech.id}`): Promise<NativeBadgePrint | null> {
  const bridge = (window as any).ReactNativeWebView;
  if (!bridge?.postMessage || !(window as any).CERTXA_TECH_ID_PRINT_BRIDGE) return Promise.resolve(null);

  const requestId = `tech_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return new Promise((resolve) => {
    const finish = (result: NativeBadgePrint) => {
      window.removeEventListener("certxa_native_print_result", onResult);
      clearTimeout(timeout);
      resolve(result);
    };
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.requestId !== requestId) return;
      finish(detail.ok === true ? { ok: true } : { ok: false, error: String(detail.error || "The printer did not print it.") });
    };
    const timeout = setTimeout(() => finish({ ok: false, error: "The printer did not answer. Check it is on, then try again." }), 45_000);
    window.addEventListener("certxa_native_print_result", onResult);
    try {
      bridge.postMessage(JSON.stringify({
        type: "PRINT_TECH_ID",
        requestId,
        tech: { id: tech.id, name: tech.name },
        qrValue,
      }));
    } catch {
      finish({ ok: false, error: "Could not reach the Certxa app's printer." });
    }
  });
}
