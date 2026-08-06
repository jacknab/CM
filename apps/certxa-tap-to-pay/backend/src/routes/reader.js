const express = require('express');
const stripe = require('../stripeClient');
const { requireAuthorizedAccount } = require('../middleware/auth');
const { getOrCreateTerminalLocationId } = require('../services/terminalLocation');

const router = express.Router();

// POST /stripe/reader/register
// Auth: certxa.sid session cookie. body: { registrationCode, label? }
// One-time step per physical M2: links it to this store's Location.
// The registration code is printed on the reader / its packaging and
// is only valid for ~24 hours after the reader is unboxed/reset, so
// this needs a UI on certxa.com where the merchant types it in.
router.post('/reader/register', requireAuthorizedAccount, async (req, res) => {
  const { registrationCode, label } = req.body;

  if (!registrationCode || typeof registrationCode !== 'string') {
    return res.status(400).json({ error: 'registrationCode is required' });
  }

  try {
    const locationId = await getOrCreateTerminalLocationId(req.storeId, req.connectedAccountId);

    const reader = await stripe.terminal.readers.create(
      {
        registration_code: registrationCode,
        location: locationId,
        label: label || undefined,
      },
      { stripeAccount: req.connectedAccountId }
    );

    res.json({ readerId: reader.id, label: reader.label, serialNumber: reader.serial_number });
  } catch (err) {
    console.error('Failed to register reader:', err);
    // Stripe returns a clear error for expired/already-used codes —
    // surface its message rather than a generic one so the merchant
    // knows to get a fresh code.
    res.status(400).json({ error: err.message || 'Failed to register reader' });
  }
});

// GET /stripe/reader/list
// Auth: certxa.sid session cookie. Lists readers already registered to
// this store's Location — useful for a "manage your readers" screen.
router.get('/reader/list', requireAuthorizedAccount, async (req, res) => {
  try {
    const locationId = await getOrCreateTerminalLocationId(req.storeId, req.connectedAccountId);

    const readers = await stripe.terminal.readers.list(
      { location: locationId, limit: 20 },
      { stripeAccount: req.connectedAccountId }
    );

    res.json({
      readers: readers.data.map((r) => ({
        id: r.id,
        label: r.label,
        serialNumber: r.serial_number,
        status: r.status,
        deviceType: r.device_type,
      })),
    });
  } catch (err) {
    console.error('Failed to list readers:', err);
    res.status(500).json({ error: 'Failed to list readers' });
  }
});

module.exports = router;
