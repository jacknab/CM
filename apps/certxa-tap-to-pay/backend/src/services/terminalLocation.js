const pool = require('../db');
const stripe = require('../stripeClient');

/**
 * Returns the Stripe Terminal Location ID for a store, creating one on
 * Stripe (and caching it in store_payment_accounts.stripe_terminal_location_id)
 * the first time it's needed. Safe to call on every request that needs
 * a location — it's a no-op DB read after the first call.
 *
 * ASSUMPTION TO VERIFY: this reads address fields (address, city,
 * state, postal_code, country) off the `locations` table by storeId.
 * I don't have your actual `locations` schema, so double check these
 * column names match — if they don't, Location creation will fail with
 * a clear Stripe validation error naming the missing field, not fail
 * silently.
 */
async function getOrCreateTerminalLocationId(storeId, connectedAccountId) {
  const { rows: existingRows } = await pool.query(
    `SELECT stripe_terminal_location_id AS "locationId"
     FROM store_payment_accounts
     WHERE store_id = $1`,
    [storeId]
  );

  const existingLocationId = existingRows[0]?.locationId;
  if (existingLocationId) {
    return existingLocationId;
  }

  const { rows: storeRows } = await pool.query(
    `SELECT name, address, city, state, postal_code AS "postalCode", country
     FROM locations
     WHERE id = $1`,
    [storeId]
  );

  const store = storeRows[0];
  if (!store) {
    throw new Error(`No store found for storeId=${storeId}`);
  }

  const missingFields = ['address', 'city', 'state', 'postalCode', 'country'].filter(
    (field) => !store[field]
  );
  if (missingFields.length > 0) {
    throw new Error(
      `Store ${storeId} is missing address field(s) required to create a Terminal Location: ${missingFields.join(', ')}`
    );
  }

  const location = await stripe.terminal.locations.create(
    {
      display_name: store.name || `Store ${storeId}`,
      address: {
        line1: store.address,
        city: store.city,
        state: store.state,
        postal_code: store.postalCode,
        country: store.country,
      },
    },
    { stripeAccount: connectedAccountId }
  );

  await pool.query(
    `UPDATE store_payment_accounts
     SET stripe_terminal_location_id = $1
     WHERE store_id = $2`,
    [location.id, storeId]
  );

  return location.id;
}

module.exports = { getOrCreateTerminalLocationId };
