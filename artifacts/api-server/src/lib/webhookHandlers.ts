/**
 * lib/webhookHandlers.ts
 *
 * Legacy stub — Stripe webhook handling is now in routes/stripeWebhook.ts,
 * mounted at POST /api/stripe/webhook in src/index.ts.
 */
export class WebhookHandlers {
  static async processWebhook(_payload: Buffer, _signature: string): Promise<void> {
    throw new Error("Use POST /api/stripe/webhook instead.");
  }
}
