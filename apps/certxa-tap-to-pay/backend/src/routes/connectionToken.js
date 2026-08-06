const express = require('express');
const stripe = require('../stripeClient');
const { requireAuthorizedAccount } = require('../middleware/auth');

const router = express.Router();

// POST /stripe/connection_token
// Auth: certxa.sid session cookie (forwarded by the app from the WebView).
// No request body needed — the connected account comes entirely from
// the session, via requireAuthorizedAccount.
router.post('/connection_token', requireAuthorizedAccount, async (req, res) => {
  try {
    const token = await stripe.terminal.connectionTokens.create(
      {},
      { stripeAccount: req.connectedAccountId }
    );
    res.json({ secret: token.secret });
  } catch (err) {
    console.error('Failed to create connection token:', err);
    res.status(500).json({ error: 'Failed to create connection token' });
  }
});

module.exports = router;
