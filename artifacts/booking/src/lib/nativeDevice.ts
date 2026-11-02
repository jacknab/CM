/**
 * Asking the Certxa app itself (offline health, phase 4): a fix only the app can do (DEVICE_FIX), or what the health
 * report needs to know about the app (DEVICE_INFO). The app answers with a `certxa_device_reply` event under the same
 * requestId. Only in app builds that say so (window.CERTXA_DEVICE_FIX).
 */
export const appDoesDeviceFixes = (): boolean =>
  typeof window !== "undefined" && !!(window as any).CERTXA_DEVICE_FIX && typeof (window as any).ReactNativeWebView?.postMessage === "function";

export function askApp<T = Record<string, unknown>>(type: "DEVICE_FIX" | "DEVICE_INFO", payload: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<T & { ok: boolean; detail?: string }> {
  return new Promise((resolve) => {
    if (!appDoesDeviceFixes()) { resolve({ ok: false, detail: "This tablet can't do that yet (it needs the newer Certxa app)" } as T & { ok: boolean; detail?: string }); return; }
    const requestId = `dv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const done = (value: any) => { window.removeEventListener("certxa_device_reply", onReply); clearTimeout(timer); resolve(value); };
    const onReply = (e: Event) => { const d = (e as CustomEvent).detail ?? {}; if (d.requestId === requestId) done(d); };
    const timer = setTimeout(() => done({ ok: false, detail: "The app didn't answer" }), timeoutMs);
    window.addEventListener("certxa_device_reply", onReply);
    try { (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type, requestId, ...payload })); }
    catch (err) { done({ ok: false, detail: String((err as Error)?.message ?? err) }); }
  });
}
