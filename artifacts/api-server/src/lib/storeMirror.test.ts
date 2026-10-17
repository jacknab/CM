import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Read as text: importing lib/storeMirror.ts would open the database.
const registry = readFileSync(join(__dirname, "storeMirror.ts"), "utf8");
const migration = readFileSync(join(__dirname, "../../../../migrations/0249_store_mirror_change_log.sql"), "utf8");
const copied = [...registry.matchAll(/\{ table: "([a-z_]+)"/g)].map((m) => m[1]);
const logged = [...migration.matchAll(/CREATE TRIGGER store_mirror_log AFTER INSERT OR UPDATE OR DELETE ON ([a-z_]+)/g)].map((m) => m[1]);

describe("the salon copy for tablets", () => {
  it("logs every change of every table it copies (a table without its trigger would never update on the tablet)", () => {
    expect(copied.length).toBeGreaterThan(50);
    expect([...logged].sort()).toEqual([...copied].sort());
  });

  it("never copies secrets", () => {
    for (const secret of ["api_keys", "staff_pins", "booking_payment_tokens", "contractor_onboarding_tokens", "stripe_settings", "store_payment_accounts"]) {
      expect(copied).not.toContain(secret);
    }
    for (const [table, column] of [["locations", "ein"], ["locations", "activation_code"], ["clients", "stripe_customer_id"], ["gift_cards", "pin_hash"], ["staff", "invite_token"], ["registers", "activation_code"]]) {
      expect(registry).toMatch(new RegExp(`table: "${table}"[^\\n]*omit: \\[[^\\]]*"${column}"`));
    }
  });
});
