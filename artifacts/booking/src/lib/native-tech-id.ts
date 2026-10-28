/** Ask the Certxa Owner native shell to print one technician QR badge. */
export function printNativeTechId(tech: { id: number; name: string }): Promise<boolean> {
  const bridge = (window as any).ReactNativeWebView;
  if (!bridge?.postMessage || !(window as any).CERTXA_TECH_ID_PRINT_BRIDGE) return Promise.resolve(false);

  const requestId = `tech_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return new Promise((resolve) => {
    const finish = (printed: boolean) => {
      window.removeEventListener("certxa_native_print_result", onResult);
      clearTimeout(timeout);
      resolve(printed);
    };
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.requestId === requestId) finish(detail.ok === true);
    };
    const timeout = setTimeout(() => finish(false), 45_000);
    window.addEventListener("certxa_native_print_result", onResult);
    try {
      bridge.postMessage(JSON.stringify({
        type: "PRINT_TECH_ID",
        requestId,
        tech: { id: tech.id, name: tech.name },
        qrValue: `TECH:${tech.id}`,
      }));
    } catch {
      finish(false);
    }
  });
}
