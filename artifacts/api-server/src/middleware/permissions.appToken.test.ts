import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ accountType: null as string | null }));
vi.mock("../db", () => ({ db: { select: () => ({ from: () => ({ where: async () => [{ id: "u1", role: "owner", accountType: state.accountType, permissions: null }] }) }) } }));
vi.mock("../lib/soloAuth", () => ({ verifySoloToken: (t: string) => (t === "good" ? { userId: "u1", type: "solo" } : null) }));

import { attachAuthContext } from "./permissions";

async function run(headers: Record<string, string>, session: Record<string, unknown> = {}) {
  const req: any = { headers, session };
  const res: any = { statusCode: 200, body: null, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  let passed = false;
  await attachAuthContext(req, res, () => { passed = true; });
  return { req, res, passed };
}

describe("Certxa Pro app sign-in (Bearer token)", () => {
  it("lets an account created in the app through", async () => {
    state.accountType = "certxa_pro";
    const r = await run({ authorization: "Bearer good" });
    expect(r.passed).toBe(true);
    expect(r.req.auth?.userId).toBe("u1");
  });

  it("signs out a website account that still has an app sign-in saved", async () => {
    state.accountType = null;
    const r = await run({ authorization: "Bearer good" });
    expect(r.passed).toBe(false);
    expect(r.res.statusCode).toBe(401);
    expect(r.res.body.code).toBe("NOT_AN_APP_ACCOUNT");
    expect(r.req.session.userId).toBeUndefined();
  });

  it("leaves website sign-ins (cookie sessions) alone", async () => {
    state.accountType = null;
    const r = await run({}, { userId: "u1" });
    expect(r.passed).toBe(true);
    expect(r.req.auth?.userId).toBe("u1");
  });
});
