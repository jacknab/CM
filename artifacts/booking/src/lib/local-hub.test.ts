import { describe, it, expect } from "vitest";
import { forRegister } from "./local-hub-rules";

describe("which hub messages a screen acts on", () => {
  it("takes a message for its own register", () => {
    expect(forRegister({ type: "kiosk_checkout_start", registerId: 3 }, 3)).toBe(true);
    expect(forRegister({ type: "kiosk_checkout_start", registerId: "3" }, 3)).toBe(true);
  });
  it("ignores a message for another register", () => {
    expect(forRegister({ type: "kiosk_checkout_start", registerId: 4 }, 3)).toBe(false);
  });
  it("treats register 0 as not known, on either side", () => {
    expect(forRegister({ type: "kiosk_checkout_start", registerId: 1256 }, 0)).toBe(true);
    expect(forRegister({ type: "kiosk_checkout_tip_selected", registerId: 0 }, 1256)).toBe(true);
  });
  it("takes a message meant for every register, and takes everything before it knows its own", () => {
    expect(forRegister({ type: "settings_changed" }, 3)).toBe(true);
    expect(forRegister({ type: "kiosk_checkout_start", registerId: 4 }, null)).toBe(true);
  });
});
