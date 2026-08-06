const express = require('express');
const { requireAuthorizedAccount } = require('../middleware/auth');
const { getOrCreateTerminalLocationId } = require('../services/terminalLocation');

const router = express.Router();

// GET /stripe/terminal_location
// Auth: certxa.sid session cookie. No body needed.
// Returns the current store's Stripe Terminal Location, creating it on
// Stripe the first time this is called for that store.
router.get('/terminal_location', requireAuthorizedAccount, async (req, res) => {
  try {
    const locationId = await getOrCreateTerminalLocationId(req.storeId, req.connectedAccountId);
    res.json({ locationId });
  } catch (err) {
    console.error('Failed to get/create Terminal Location:', err);
    res.status(500).json({ error: err.message || 'Failed to get/create Terminal Location' });
  }
});

module.exports = router;
