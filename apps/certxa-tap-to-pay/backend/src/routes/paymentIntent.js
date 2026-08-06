const express = require('express');
const stripe = require('../stripeClient');
const { requireAuthorizedAccount } = require('../middleware/auth');

const router = express.Router();

// POST /stripe/payment_intent
// Auth: certxa.sid session cookie. body: { amount, currency } only —
// the connected account comes from the session, never the client.
// Creates a DIRECT CHARGE on the connected account — the PaymentIntent
// itself lives on the client's Stripe account, not your platform's.
// This is the pattern Stripe recommends for in-person/Terminal payments
// on Connect (readers and Locations belong to the connected account).
router.post('/payment_intent', requireAuthorizedAccount, async (req, res) => {
  const { amount, currency } = req.body;

  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive integer (smallest currency unit)' });
  }
  if (!currency || typeof currency !== 'string') {
    return res.status(400).json({ error: 'currency is required' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount,
        currency,
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        // Optional: take a cut for your platform on each transaction.
        // application_fee_amount: Math.round(amount * 0.01), // e.g. 1%
      },
      { stripeAccount: req.connectedAccountId }
    );

    res.json({ client_secret: paymentIntent.client_secret, id: paymentIntent.id });
  } catch (err) {
    console.error('Failed to create PaymentIntent:', err);
    res.status(500).json({ error: 'Failed to create PaymentIntent' });
  }
});

module.exports = router;
