const pool = require('../db');

/**
 * Resolves which Stripe connected account a session is allowed to
 * charge, straight from Postgres — mirrors the same two-step lookup
 * (locations -> store_payment_accounts) the main certxa.com app uses.
 *
 * Only the owner/admin path (req.session.userId) is implemented here.
 *
 * TODO: staff OTP logins (req.session.staffId) are NOT resolved yet —
 * this intentionally returns an empty list for staff sessions rather
 * than guessing at a staff-to-store mapping that might not match your
 * actual schema. If staff members need to take payments too, add the
 * real staffId -> storeId lookup here (whatever table maps staff to
 * their store) before shipping.
 */
async function resolveAccountAndStoreForSession(session) {
  const userId = session?.userId;
  const staffId = session?.staffId;

  if (userId) {
    const { rows } = await pool.query(
      `SELECT l.id AS "storeId", spa.provider_account_id AS "providerAccountId"
       FROM locations l
       JOIN store_payment_accounts spa ON spa.store_id = l.id
       WHERE l.user_id = $1 AND spa.status = 'connected'
       LIMIT 1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  if (staffId) {
    // TODO: implement staff -> store -> connected account resolution.
    console.warn(`No staff-to-store resolution implemented yet (staffId=${staffId})`);
    return null;
  }

  return null;
}

// Matches the shape of the main app's isAuthenticated middleware, then
// goes one step further and resolves + attaches the connected account
// and store ID.
async function requireAuthorizedAccount(req, res, next) {
  try {
    const userId = req.session?.userId;
    const staffId = req.session?.staffId;

    if (!userId && !staffId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const resolved = await resolveAccountAndStoreForSession(req.session);

    if (!resolved) {
      return res.status(403).json({ message: 'No connected Stripe account for this session' });
    }

    req.connectedAccountId = resolved.providerAccountId;
    req.storeId = resolved.storeId;
    next();
  } catch (err) {
    console.error('Auth check failed:', err);
    res.status(401).json({ message: 'Unauthorized' });
  }
}

module.exports = { requireAuthorizedAccount };
