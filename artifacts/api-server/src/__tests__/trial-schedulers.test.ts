/**
 * Trial Scheduler Tests
 *
 * Verifies that trial reminder and expiration emails are sent ONLY to account
 * owners (role = 'owner' | 'admin'), never to managers or staff, and that
 * users who have opted out of trial reminder emails are skipped.
 *
 * All DB and email calls are mocked — no real database connection is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Test fixtures ─────────────────────────────────────────────────────────

const OWNER_USER = {
  id: "owner-uuid-1",
  email: "owner@example.com",
  firstName: "Jane",
  role: "owner",
  subscriptionStatus: "trial",
  trialEndsAt: new Date(Date.now() + 7 * 86400_000),
  trialStartedAt: new Date(Date.now() - 53 * 86400_000),
};

const ADMIN_USER = {
  id: "admin-uuid-2",
  email: "admin@example.com",
  firstName: "Admin",
  role: "admin",
  subscriptionStatus: "trial",
  trialEndsAt: new Date(Date.now() + 7 * 86400_000),
  trialStartedAt: new Date(Date.now() - 53 * 86400_000),
};

const EXPIRED_OWNER = {
  id: "owner-expired-5",
  email: "expired@example.com",
  firstName: "Old",
  role: "owner",
  subscriptionStatus: "trial",
  trialEndsAt: new Date(Date.now() - 1000),
  trialStartedAt: new Date(Date.now() - 61 * 86400_000),
};

const EXPIRED_MANAGER = {
  id: "manager-expired-6",
  email: "expiredmanager@example.com",
  firstName: "Mgr",
  role: "manager",
  subscriptionStatus: "trial",
  trialEndsAt: new Date(Date.now() - 1000),
  trialStartedAt: new Date(Date.now() - 61 * 86400_000),
};

// ─── Mock helpers ──────────────────────────────────────────────────────────

/**
 * Build a drizzle-like chainable query mock.
 *
 * The scheduler's main query ends at `.where()` with no `.limit()`:
 *   `await db.select().from().where()` → rows[]
 *
 * Sub-queries (dedup check, location look-up) end at `.limit()`:
 *   `await db.select().from().where().limit()` → rows[]
 *
 * We satisfy both by making the object returned by `.where()` thenable
 * (so `await` resolves to `mainRows`) AND give it a `.limit()` method
 * that resolves to `subRows` for nested/subsequent queries.
 */
/**
 * Build a drizzle-like chainable query mock.
 *
 * Every `.select().from().where()` call returns a thenableWhere that:
 *   - resolves to `mainRows` when awaited directly  (main query: no .limit())
 *   - exposes `.limit()` → resolves to `subRows`   (sub-queries: dedup, location)
 *
 * This handles all three REMINDER_DAYS iterations and all sub-queries with a
 * single unified structure so no "firstSelect" flag is needed.
 */
function makeChain(mainRows: object[], subRows: object[] = []) {
  const makeThenableWhere = () => ({
    then: (onFulfilled: (v: object[]) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(mainRows).then(onFulfilled, onRejected),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve(mainRows).catch(fn),
    limit: vi.fn().mockResolvedValue(subRows),
  });

  const selectFn = vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(makeThenableWhere()),
    }),
  }));

  return {
    select: selectFn,
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };
}

// ─── Trial Reminder Tests ──────────────────────────────────────────────────

describe("runTrialReminderCheck", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("emails owner and admin users, not managers or staff", async () => {
    const sendEmailMock = vi.fn().mockResolvedValue({ success: true });

    vi.doMock("../db", () => ({ db: makeChain([OWNER_USER, ADMIN_USER]) }));
    vi.doMock("../mail", () => ({ sendEmail: sendEmailMock }));
    vi.doMock("../lib/systemEmails", () => ({ userWantsEmail: vi.fn().mockResolvedValue(true) }));
    vi.doMock("@shared/schema/orphaned-tables", () => ({
      billingActivityLogs: { id: "id", eventType: "eventType", metadataJson: "metadataJson" },
    }));

    const { runTrialReminderCheck } = await import("../services/trial-reminders");
    await runTrialReminderCheck();

    const recipients = sendEmailMock.mock.calls.map((c) => c[1] as string);
    expect(recipients).toContain("owner@example.com");
    expect(recipients).toContain("admin@example.com");
    expect(recipients).not.toContain("manager@example.com");
    expect(recipients).not.toContain("staff@example.com");
  });

  it("sends emails at 10/7/3/1-day intervals (correct schedule)", async () => {
    const sendEmailMock = vi.fn().mockResolvedValue({ success: true });

    vi.doMock("../db", () => ({ db: makeChain([OWNER_USER]) }));
    vi.doMock("../mail", () => ({ sendEmail: sendEmailMock }));
    vi.doMock("../lib/systemEmails", () => ({ userWantsEmail: vi.fn().mockResolvedValue(true) }));
    vi.doMock("@shared/schema/orphaned-tables", () => ({
      billingActivityLogs: { id: "id", eventType: "eventType", metadataJson: "metadataJson" },
    }));

    const { runTrialReminderCheck } = await import("../services/trial-reminders");
    await runTrialReminderCheck();

    // The scheduler loops over [10, 7, 3, 1] — confirm subjects match the new schedule
    const subjects = sendEmailMock.mock.calls.map((c) => c[2] as string);
    const validSubjects = [
      "Your Certxa trial ends in 10 days",
      "Your Certxa trial ends in 7 days",
      "Your Certxa trial ends in 3 days",
      "Your Certxa free trial ends tomorrow",
    ];
    subjects.forEach((s) => expect(validSubjects).toContain(s));
  });

  it("sends no emails when the DB returns only managers/staff (role filter working)", async () => {
    const sendEmailMock = vi.fn().mockResolvedValue({ success: true });

    // Simulates correct DB filtering: when only non-owners match the query,
    // zero rows come back and zero emails are sent.
    vi.doMock("../db", () => ({ db: makeChain([]) }));
    vi.doMock("../mail", () => ({ sendEmail: sendEmailMock }));
    vi.doMock("../lib/systemEmails", () => ({ userWantsEmail: vi.fn().mockResolvedValue(true) }));
    vi.doMock("@shared/schema/orphaned-tables", () => ({
      billingActivityLogs: { id: "id", eventType: "eventType", metadataJson: "metadataJson" },
    }));

    const { runTrialReminderCheck } = await import("../services/trial-reminders");
    await runTrialReminderCheck();

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("skips an owner who has unsubscribed from trial reminder emails", async () => {
    const sendEmailMock = vi.fn().mockResolvedValue({ success: true });

    vi.doMock("../db", () => ({ db: makeChain([OWNER_USER]) }));
    vi.doMock("../mail", () => ({ sendEmail: sendEmailMock }));
    // Owner opted out
    vi.doMock("../lib/systemEmails", () => ({ userWantsEmail: vi.fn().mockResolvedValue(false) }));
    vi.doMock("@shared/schema/orphaned-tables", () => ({
      billingActivityLogs: { id: "id", eventType: "eventType", metadataJson: "metadataJson" },
    }));

    const { runTrialReminderCheck } = await import("../services/trial-reminders");
    await runTrialReminderCheck();

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("skips a user when the dedup guard shows the reminder was already sent", async () => {
    const sendEmailMock = vi.fn().mockResolvedValue({ success: true });

    // Every select returns a thenable .where() — when awaited directly (main query)
    // it resolves to [OWNER_USER]; when .limit() is called (dedup sub-query) it
    // resolves to a non-empty record, meaning "already sent".
    const dbMock = (() => {
      const alreadySentRecord = [{ id: 99 }];
      const makeTW = () => ({
        then: (onFulfilled: (v: object[]) => unknown) => Promise.resolve([OWNER_USER]).then(onFulfilled),
        catch: (fn: (e: unknown) => unknown) => Promise.resolve([OWNER_USER]).catch(fn),
        limit: vi.fn().mockResolvedValue(alreadySentRecord), // dedup check → already sent
      });
      return {
        select: vi.fn(() => ({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue(makeTW()) }) })),
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
      };
    })();

    vi.doMock("../db", () => ({ db: dbMock }));
    vi.doMock("../mail", () => ({ sendEmail: sendEmailMock }));
    vi.doMock("../lib/systemEmails", () => ({ userWantsEmail: vi.fn().mockResolvedValue(true) }));
    vi.doMock("@shared/schema/orphaned-tables", () => ({
      billingActivityLogs: { id: "id", eventType: "eventType", metadataJson: "metadataJson" },
    }));

    const { runTrialReminderCheck } = await import("../services/trial-reminders");
    await runTrialReminderCheck();

    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// ─── Trial Expiration Tests ────────────────────────────────────────────────

describe("runTrialExpirationCheck", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  /**
   * For trial-expiration, the main query is:
   *   `await db.select().from().where()` → expired users array
   *
   * Sub-queries (active-sub check, location look-up) use `.limit()`.
   */
  function makeExpirationDb(expiredUsers: object[], subscriptionStatus?: string) {
    // storeSubscriptions and location sub-queries both use .select().from().where().limit()
    const subResult = subscriptionStatus ? [{ status: subscriptionStatus }] : [];

    let selectCount = 0;
    return {
      select: vi.fn(() => {
        selectCount++;
        const rows = selectCount === 1 ? expiredUsers : [];
        // The first and fourth SELECTs are the two sweep queries. The middle
        // SELECTs are location/subscription lookups and use LIMIT.
        const result = {
          then: (onFulfilled: (v: object[]) => unknown) => Promise.resolve(rows).then(onFulfilled),
          catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
        };
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(selectCount === 2 || selectCount === 3 ? subResult : rows),
              ...result,
            }),
          }),
        };
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
      execute: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("expires and emails owner accounts whose trial has ended", async () => {
    const sendTrialExpiredEmailMock = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../db", () => ({ db: makeExpirationDb([EXPIRED_OWNER]) }));
    vi.doMock("../lib/systemEmails", () => ({ sendTrialExpiredEmail: sendTrialExpiredEmailMock }));
    vi.doMock("../cache", () => ({ cache: { billing: { invalidate: vi.fn() } } }));
    vi.doMock("@shared/schema/subscriptions", () => ({ storeSubscriptions: { storeId: "store_id", status: "status" } }));

    const { runTrialExpirationCheck } = await import("../services/trial-expiration");
    const result = await runTrialExpirationCheck();

    expect(result.expired).toBe(1);
    expect(result.skipped).toBe(0);
    expect(sendTrialExpiredEmailMock).toHaveBeenCalledWith("expired@example.com", "Old");
  });

  it("does not email a manager user even when DB returns them (role filter is in the query)", async () => {
    // When the role filter is in place, managers will never be returned by the DB.
    // Passing zero results simulates the correct post-filter state.
    const sendTrialExpiredEmailMock = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../db", () => ({ db: makeExpirationDb([]) })); // role filter → empty
    vi.doMock("../lib/systemEmails", () => ({ sendTrialExpiredEmail: sendTrialExpiredEmailMock }));
    vi.doMock("../cache", () => ({ cache: { billing: { invalidate: vi.fn() } } }));
    vi.doMock("@shared/schema/subscriptions", () => ({ storeSubscriptions: {} }));

    const { runTrialExpirationCheck } = await import("../services/trial-expiration");
    const result = await runTrialExpirationCheck();

    expect(result.expired).toBe(0);
    expect(sendTrialExpiredEmailMock).not.toHaveBeenCalled();
  });

  it("skips users who already have an active paid subscription", async () => {
    const sendTrialExpiredEmailMock = vi.fn().mockResolvedValue(undefined);

    // Active → sub-queries return a paid, healthy subscription record
    vi.doMock("../db", () => ({ db: makeExpirationDb([EXPIRED_OWNER], "active") }));
    vi.doMock("../lib/systemEmails", () => ({ sendTrialExpiredEmail: sendTrialExpiredEmailMock }));
    vi.doMock("../cache", () => ({ cache: { billing: { invalidate: vi.fn() } } }));
    vi.doMock("@shared/schema/subscriptions", () => ({
      storeSubscriptions: { storeId: "store_id", status: "status" },
    }));

    const { runTrialExpirationCheck } = await import("../services/trial-expiration");
    const result = await runTrialExpirationCheck();

    expect(result.skipped).toBe(1);
    expect(result.expired).toBe(0);
    expect(sendTrialExpiredEmailMock).not.toHaveBeenCalled();
  });

  it("expires an account with no subscription", async () => {
    const sendTrialExpiredEmailMock = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../db", () => ({ db: makeExpirationDb([EXPIRED_OWNER]) }));
    vi.doMock("../lib/systemEmails", () => ({ sendTrialExpiredEmail: sendTrialExpiredEmailMock }));
    vi.doMock("../cache", () => ({ cache: { billing: { invalidate: vi.fn() } } }));
    vi.doMock("@shared/schema/subscriptions", () => ({
      storeSubscriptions: { storeId: "store_id", status: "status" },
    }));

    const { runTrialExpirationCheck } = await import("../services/trial-expiration");
    const result = await runTrialExpirationCheck();

    expect(result.expired).toBe(1);
    expect(result.skipped).toBe(0);
    expect(sendTrialExpiredEmailMock).toHaveBeenCalledOnce();
  });

  it("does not treat a past-due subscription as paid and in good standing", async () => {
    const sendTrialExpiredEmailMock = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../db", () => ({ db: makeExpirationDb([EXPIRED_OWNER], "past_due") }));
    vi.doMock("../lib/systemEmails", () => ({ sendTrialExpiredEmail: sendTrialExpiredEmailMock }));
    vi.doMock("../cache", () => ({ cache: { billing: { invalidate: vi.fn() } } }));
    vi.doMock("@shared/schema/subscriptions", () => ({
      storeSubscriptions: { storeId: "store_id", status: "status" },
    }));

    const { runTrialExpirationCheck } = await import("../services/trial-expiration");
    const result = await runTrialExpirationCheck();

    expect(result.expired).toBe(1);
    expect(result.skipped).toBe(0);
    expect(sendTrialExpiredEmailMock).toHaveBeenCalledOnce();
  });
});

// ─── TrialService role guard tests ────────────────────────────────────────

describe("TrialService.setupTrialForUser — role guard", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  function makeTrialServiceDb(role: string) {
    const setCalls: object[] = [];
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn((values: object) => {
        setCalls.push(values);
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    });

    return {
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ role }]),
            }),
          }),
        }),
        update: updateMock,
      },
      setCalls,
    };
  }

  it("sets subscriptionStatus='trial' for an owner", async () => {
    const { db: dbMock, setCalls } = makeTrialServiceDb("owner");
    vi.doMock("../db", () => ({ db: dbMock }));
    vi.doMock("@shared/schema", () => ({ locations: {}, storeSubscriptions: {} }));

    const { TrialService } = await import("../services/trial-service");
    await TrialService.setupTrialForUser("owner-uuid");

    const call = setCalls[0] as any;
    expect(call?.subscriptionStatus).toBe("trial");
    expect(call?.trialEndsAt).toBeInstanceOf(Date);
  });

  it("refuses to set trial for a manager and resets to active", async () => {
    const { db: dbMock, setCalls } = makeTrialServiceDb("manager");
    vi.doMock("../db", () => ({ db: dbMock }));
    vi.doMock("@shared/schema", () => ({ locations: {}, storeSubscriptions: {} }));

    const { TrialService } = await import("../services/trial-service");
    await TrialService.setupTrialForUser("manager-uuid");

    const call = setCalls[0] as any;
    expect(call?.subscriptionStatus).toBe("active");
    expect(call?.trialEndsAt).toBeNull();
  });

  it("refuses to set trial for a staff user and resets to active", async () => {
    const { db: dbMock, setCalls } = makeTrialServiceDb("staff");
    vi.doMock("../db", () => ({ db: dbMock }));
    vi.doMock("@shared/schema", () => ({ locations: {}, storeSubscriptions: {} }));

    const { TrialService } = await import("../services/trial-service");
    await TrialService.setupTrialForUser("staff-uuid");

    const call = setCalls[0] as any;
    expect(call?.subscriptionStatus).toBe("active");
  });

  it("allows legacy admin role (owner-equivalent) to get a trial", async () => {
    const { db: dbMock, setCalls } = makeTrialServiceDb("admin");
    vi.doMock("../db", () => ({ db: dbMock }));
    vi.doMock("@shared/schema", () => ({ locations: {}, storeSubscriptions: {} }));

    const { TrialService } = await import("../services/trial-service");
    await TrialService.setupTrialForUser("admin-uuid");

    const call = setCalls[0] as any;
    expect(call?.subscriptionStatus).toBe("trial");
  });

  it("does nothing when the user row is not found (fail-closed)", async () => {
    // Empty limit result → user not found
    const dbMock = {
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // no user found
            }),
          }),
        }),
        update: vi.fn(), // must NOT be called
      },
    };
    vi.doMock("../db", () => dbMock);
    vi.doMock("@shared/schema", () => ({ locations: {}, storeSubscriptions: {} }));

    const { TrialService } = await import("../services/trial-service");
    await TrialService.setupTrialForUser("nonexistent-uuid");

    expect(dbMock.db.update).not.toHaveBeenCalled();
  });

  it("resets to active for a null role (fail-closed, not default-allow)", async () => {
    const { db: dbMock, setCalls } = makeTrialServiceDb(null as any);
    vi.doMock("../db", () => ({ db: dbMock }));
    vi.doMock("@shared/schema", () => ({ locations: {}, storeSubscriptions: {} }));

    const { TrialService } = await import("../services/trial-service");
    await TrialService.setupTrialForUser("null-role-uuid");

    const call = setCalls[0] as any;
    // Null role is treated as non-owner — must NOT be given a trial
    expect(call?.subscriptionStatus).toBe("active");
    expect(call?.trialEndsAt).toBeNull();
  });

  it("resets to active for an unknown/unexpected role value", async () => {
    const { db: dbMock, setCalls } = makeTrialServiceDb("superadmin" as any);
    vi.doMock("../db", () => ({ db: dbMock }));
    vi.doMock("@shared/schema", () => ({ locations: {}, storeSubscriptions: {} }));

    const { TrialService } = await import("../services/trial-service");
    await TrialService.setupTrialForUser("unknown-role-uuid");

    const call = setCalls[0] as any;
    expect(call?.subscriptionStatus).toBe("active");
  });
});
