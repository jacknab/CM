// artifacts/api-server/src/lib/stripeTerminal.ts
//
// New Stripe Terminal helpers for the Tap to Pay / M2 reader work.
// Written to match the patterns already in lib/stripeConnect.ts
// (getStripe() singleton, raw pool.query()) — NOT a separate service,
// this is meant to live directly in this repo.
//
// TODO: adjust these two imports to match whatever this project
// actually uses — I'm inferring them from lib/stripeConnect.ts and
// auth.ts but wasn't given their exact import paths/export names.
import { getStripe } from "./stripe";
import { pool } from "../db"; // wherever the pg Pool used by pool.query() in stripeConnect.ts is exported from

/**
 * Resolves which store + Stripe connected account a session belongs
 * to, for BOTH login types:
 *   - owner/admin: req.session.userId -> locations.user_id
 *   - staff:       req.session.staffId -> staff.store_id
 *
 * Returns null if there's no session, no matching store, or no
 * connected Stripe account yet.
 */
export async function resolveStoreAndAccountForSession(
  session: { userId?: string; staffId?: number } | undefined
): Promise<{ storeId: number; connectedAccountId: string } | null> {
  const userId = session?.userId;
  const staffId = session?.staffId;

  if (userId) {
    const { rows } = await pool.query(
      `SELECT l.id AS "storeId", spa.provider_account_id AS "connectedAccountId"
       FROM locations l
       JOIN store_payment_accounts spa ON spa.store_id = l.id
       WHERE l.user_id = $1 AND spa.status = 'connected'
       LIMIT 1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  if (staffId) {
    const { rows } = await pool.query(
      `SELECT s.store_id AS "storeId", spa.provider_account_id AS "connectedAccountId"
       FROM staff s
       JOIN store_payment_accounts spa ON spa.store_id = s.store_id
       WHERE s.id = $1 AND spa.status = 'connected'
       LIMIT 1`,
      [staffId]
    );
    return rows[0] ?? null;
  }

  return null;
}

/**
 * Returns the Stripe Terminal Location ID for a store, creating one on
 * Stripe (and caching it in store_payment_accounts.stripe_terminal_location_id)
 * the first time it's needed. Cheap to call on every request after the
 * first time — it's just a DB read.
 *
 * Country comes from store_payment_accounts.country (populated by
 * syncAccountFromStripe during OAuth onboarding) since locations has
 * no country column. Address (line1/city/state/postcode) comes from
 * locations, which is NOT collected during Connect OAuth — a store
 * needs to have filled that in via business settings first, or this
 * throws a clear error naming what's missing.
 */
export async function getOrCreateTerminalLocationId(storeId: number): Promise<string> {
  const { rows: paymentAccountRows } = await pool.query(
    `SELECT stripe_terminal_location_id AS "locationId",
            provider_account_id         AS "connectedAccountId",
            country
     FROM store_payment_accounts
     WHERE store_id = $1`,
    [storeId]
  );

  const paymentAccount = paymentAccountRows[0];
  if (!paymentAccount) {
    throw new Error(`No connected Stripe account for storeId=${storeId}`);
  }
  if (paymentAccount.locationId) {
    return paymentAccount.locationId;
  }
  if (!paymentAccount.country) {
    throw new Error(
      `Store ${storeId}'s Stripe account has no country set yet — complete Connect onboarding first`
    );
  }

  const { rows: storeRows } = await pool.query(
    `SELECT name, address, city, state, postcode
     FROM locations
     WHERE id = $1`,
    [storeId]
  );

  const store = storeRows[0];
  if (!store) {
    throw new Error(`No store found for storeId=${storeId}`);
  }

  const missingFields = ["address", "city", "state", "postcode"].filter((f) => !store[f]);
  if (missingFields.length > 0) {
    throw new Error(
      `Store ${storeId} is missing address field(s) required to create a Terminal Location ` +
        `(fill these in under business settings first): ${missingFields.join(", ")}`
    );
  }

  const stripe = getStripe();
  const location = await stripe.terminal.locations.create(
    {
      display_name: store.name || `Store ${storeId}`,
      address: {
        line1: store.address,
        city: store.city,
        state: store.state,
        postal_code: store.postcode,
        country: paymentAccount.country,
      },
    },
    { stripeAccount: paymentAccount.connectedAccountId }
  );

  await pool.query(
    `UPDATE store_payment_accounts SET stripe_terminal_location_id = $1 WHERE store_id = $2`,
    [location.id, storeId]
  );

  return location.id;
}

/**
 * One-time step linking a physical M2 reader to a store's Location,
 * using the registration code printed on/with the reader (valid for
 * ~24 hours after the reader is unboxed/reset).
 */
export async function registerReader(
  storeId: number,
  connectedAccountId: string,
  registrationCode: string,
  label?: string
) {
  const locationId = await getOrCreateTerminalLocationId(storeId);
  const stripe = getStripe();

  const reader = await stripe.terminal.readers.create(
    {
      registration_code: registrationCode,
      location: locationId,
      label,
    },
    { stripeAccount: connectedAccountId }
  );

  return { readerId: reader.id, label: reader.label, serialNumber: reader.serial_number };
}

/** Lists readers already registered to a store's Location. */
export async function listReaders(storeId: number, connectedAccountId: string) {
  const locationId = await getOrCreateTerminalLocationId(storeId);
  const stripe = getStripe();

  const readers = await stripe.terminal.readers.list(
    { location: locationId, limit: 20 },
    { stripeAccount: connectedAccountId }
  );

  return readers.data.map((r: any) => ({
    id: r.id,
    label: r.label,
    serialNumber: r.serial_number,
    status: r.status,
    deviceType: r.device_type,
  }));
}
