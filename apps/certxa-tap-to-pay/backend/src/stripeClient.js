const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set — copy .env.example to .env and fill it in');
}

// This is your PLATFORM account's secret key. Requests to connected
// accounts are made by passing { stripeAccount: connectedAccountId } as
// the second argument on individual calls (see routes/) — you do not
// need a separate Stripe instance per connected account.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

module.exports = stripe;
