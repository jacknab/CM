/**
 * Opens the cash drawer by sending the ESC/POS drawer-kick command to the receipt printer.
 *  • Android app  → the app sends it to the USB/Bluetooth printer (OPEN_DRAWER bridge message)
 *  • Web browser  → through the connected Bluetooth printer, if any
 *  • otherwise    → reports that it could not open (never pretends it did)
 */
import { buildDrawerKick } from "./thermalPrinter";

export type DrawerTransport = "native" | "web" | "none";
export interface DrawerResult { ok: boolean; error?: string }

/** Which path to use. Pure — unit-tested. */
export function chooseDrawerTransport(o: { nativeBridge: boolean; hasWebPrinter: boolean }): DrawerTransport {
  if (o.nativeBridge) return "native";
  if (o.hasWebPrinter) return "web";
  return "none";
}

function openViaApp(): Promise<DrawerResult> {
  return new Promise((resolve) => {
    const requestId = `dr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let finished = false;
    const finish = (r: DrawerResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener("certxa_native_drawer_result", onResult);
      resolve(r);
    };
    const onResult = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.requestId === requestId) finish({ ok: !!d.ok, error: d.error || undefined });
    };
    const timer = setTimeout(() => finish({ ok: false, error: "The printer did not respond." }), 40_000);
    window.addEventListener("certxa_native_drawer_result", onResult);
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "OPEN_DRAWER", requestId }));
  });
}

export async function openCashDrawerHardware(
  opts: { onThermalPrint?: (bytes: Uint8Array) => Promise<void> } = {},
): Promise<DrawerResult> {
  const w = window as any;
  const transport = chooseDrawerTransport({
    nativeBridge: !!w.CERTXA_NATIVE_APP && !!w.CERTXA_DRAWER_BRIDGE,
    hasWebPrinter: !!opts.onThermalPrint,
  });
  if (transport === "native") return openViaApp();
  if (transport === "web") {
    try {
      await opts.onThermalPrint!(buildDrawerKick());
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "The printer did not respond." };
    }
  }
  return { ok: false, error: "No receipt printer is connected." };
}
