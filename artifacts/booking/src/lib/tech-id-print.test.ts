import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTechIdSlip } from "./thermalPrinter";
import { printNativeTechId } from "./native-tech-id";

afterEach(() => vi.unstubAllGlobals());

describe("Tech ID printing", () => {
  it("builds a QR slip containing the scanner token and technician name", () => {
    const bytes = buildTechIdSlip({ id: 12, name: "Mia Nguyen" });
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("TECH:12");
    expect(text).toContain("Mia Nguyen");
  });

  it("asks the native shell to print the same Tech ID token", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", Object.assign(new EventTarget(), {
      CERTXA_TECH_ID_PRINT_BRIDGE: true,
      ReactNativeWebView: { postMessage },
    }));

    const pending = printNativeTechId({ id: 7, name: "Ana" });
    const message = JSON.parse(postMessage.mock.calls[0][0]);
    expect(message).toMatchObject({ type: "PRINT_TECH_ID", qrValue: "TECH:7", tech: { id: 7, name: "Ana" } });
    window.dispatchEvent(new CustomEvent("certxa_native_print_result", { detail: { requestId: message.requestId, ok: true } }));
    await expect(pending).resolves.toEqual({ ok: true });
  });

  it("passes on why the app could not print", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", Object.assign(new EventTarget(), { CERTXA_TECH_ID_PRINT_BRIDGE: true, ReactNativeWebView: { postMessage } }));
    const pending = printNativeTechId({ id: 7, name: "Ana" }, "M7-K3Q7XB");
    const message = JSON.parse(postMessage.mock.calls[0][0]);
    expect(message.qrValue).toBe("M7-K3Q7XB");
    window.dispatchEvent(new CustomEvent("certxa_native_print_result", { detail: { requestId: message.requestId, ok: false, error: "Could not reach the printer at 192.168.0.50" } }));
    await expect(pending).resolves.toEqual({ ok: false, error: "Could not reach the printer at 192.168.0.50" });
  });
});
