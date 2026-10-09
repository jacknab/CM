import { afterEach, describe, expect, it, vi } from "vitest";
import { printNativeCheckinTicket } from "./native-checkin-ticket";

afterEach(() => vi.unstubAllGlobals());

describe("native check-in ticket", () => {
  it("prints on this tablet with a matching response and local ticket details", async () => {
    const tablet = new EventTarget() as EventTarget & Record<string, any>;
    tablet.CERTXA_NATIVE_APP = true;
    tablet.ReactNativeWebView = {
      postMessage: (raw: string) => {
        const message = JSON.parse(raw);
        expect(message).toMatchObject({
          type: "PRINT_CHECKIN_TICKET", qrValue: "BK:123", todayCount: 14,
          ticket: { clientName: "Ada", ticketNumber: 14 },
        });
        queueMicrotask(() => tablet.dispatchEvent(Object.assign(new Event("certxa_native_print_result"), {
          detail: { requestId: message.requestId, ok: true },
        })));
      },
    };
    vi.stubGlobal("window", tablet);

    await expect(printNativeCheckinTicket({ clientName: "Ada", ticketNumber: 14, qrValue: "BK:123" })).resolves.toBe(true);
  });

  it("does not print to another device when there is no native bridge", async () => {
    vi.stubGlobal("window", { CERTXA_NATIVE_APP: false });
    await expect(printNativeCheckinTicket({ clientName: "Ada", ticketNumber: 14, qrValue: "BK:123" })).resolves.toBe(false);
  });

  it("reports a local printer failure so kiosk can use the existing POS fallback", async () => {
    const tablet = new EventTarget() as EventTarget & Record<string, any>;
    tablet.CERTXA_NATIVE_APP = true;
    tablet.ReactNativeWebView = {
      postMessage: (raw: string) => {
        const { requestId } = JSON.parse(raw);
        queueMicrotask(() => tablet.dispatchEvent(Object.assign(new Event("certxa_native_print_result"), {
          detail: { requestId, ok: false, error: "Printer offline" },
        })));
      },
    };
    vi.stubGlobal("window", tablet);

    await expect(printNativeCheckinTicket({ clientName: "Ada", ticketNumber: 14, qrValue: "BK:123" })).resolves.toBe(false);
  });
});
