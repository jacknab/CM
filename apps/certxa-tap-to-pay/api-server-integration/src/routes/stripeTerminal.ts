// artifacts/api-server/src/routes/stripeTerminal.ts
//
// New routes for Terminal Location, M2 reader registration, and the
// PaymentIntent create/capture/cancel steps needed for card-present
// payments. Mount under the same /api/payments prefix as
// routes/stripeConnect.ts (whose existing POST /connection-token route
// already lives at /api/payments/terminal/connection-token, so these
// paths are chosen to match that convention).
//
// TODO: adjust this import to match wherever isAuthenticated actually
// lives (inferred as src/auth.ts from the session config you showed me).
import { Router } from "express";
import { isAuthenticated } from "../auth";
import {
  resolveStoreAndAccountForSession,
  getOrCreateTerminalLocationId,
  registerReader,
  listReaders,
} from "../lib/stripeTerminal";
import {
  createTerminalPaymentIntent,
  captureTerminalPaymentIntent,
  cancelTerminalPaymentIntent,
} from "../lib/stripeConnect";

const router = Router();

// Small local middleware so each route below doesn't repeat the same
// resolve-or-403 logic. Matches the shape of isAuthenticated but adds
// storeId/connectedAccountId onto req once resolved.
async function requireStoreAccount(req: any, res: any, next: any) {
  try {
    const resolved = await resolveStoreAndAccountForSession(req.session as any);
    if (!resolved) {
      return res.status(403).json({ message: "No connected Stripe account for this session" });
    }
    req.storeId = resolved.storeId;
    req.connectedAccountId = resolved.connectedAccountId;
    next();
  } catch (err) {
    console.error("Failed to resolve store/account for session:", err);
    res.status(500).json({ message: "Failed to resolve store" });
  }
}

// GET /terminal/location
// Returns (creating if needed) the current store's Terminal Location.
router.get("/terminal/location", isAuthenticated, requireStoreAccount, async (req: any, res: any) => {
  try {
    const locationId = await getOrCreateTerminalLocationId(req.storeId);
    res.json({ locationId });
  } catch (err: any) {
    console.error("Failed to get/create Terminal Location:", err);
    res.status(500).json({ message: err.message || "Failed to get/create Terminal Location" });
  }
});

// POST /terminal/reader/register
// body: { registrationCode, label? }
router.post(
  "/terminal/reader/register",
  isAuthenticated,
  requireStoreAccount,
  async (req: any, res: any) => {
    const { registrationCode, label } = req.body ?? {};
    if (!registrationCode || typeof registrationCode !== "string") {
      return res.status(400).json({ message: "registrationCode is required" });
    }

    try {
      const result = await registerReader(req.storeId, req.connectedAccountId, registrationCode, label);
      res.json(result);
    } catch (err: any) {
      console.error("Failed to register reader:", err);
      // Stripe's own error message is usually specific enough to show
      // the merchant directly (e.g. expired/already-used code).
      res.status(400).json({ message: err.message || "Failed to register reader" });
    }
  }
);

// GET /terminal/reader/list
router.get(
  "/terminal/reader/list",
  isAuthenticated,
  requireStoreAccount,
  async (req: any, res: any) => {
    try {
      const readers = await listReaders(req.storeId, req.connectedAccountId);
      res.json({ readers });
    } catch (err: any) {
      console.error("Failed to list readers:", err);
      res.status(500).json({ message: "Failed to list readers" });
    }
  }
);

// POST /terminal/payment-intent
// body: { amount, currency? }
// Creates the PaymentIntent the app will collect against. capture_method
// is "manual" (set inside createTerminalPaymentIntent) — this only
// reserves it, the reader authorizes it, and /capture below is what
// actually takes the money.
router.post(
  "/terminal/payment-intent",
  isAuthenticated,
  requireStoreAccount,
  async (req: any, res: any) => {
    const { amount, currency } = req.body ?? {};

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ message: "amount must be a positive integer (smallest currency unit)" });
    }

    try {
      const pi = await createTerminalPaymentIntent(
        req.connectedAccountId,
        amount,
        currency || "usd",
        { storeId: String(req.storeId) }
      );
      res.json({ clientSecret: pi.client_secret, id: pi.id });
    } catch (err: any) {
      console.error("Failed to create Terminal PaymentIntent:", err);
      res.status(500).json({ message: err.message || "Failed to create PaymentIntent" });
    }
  }
);

// POST /terminal/payment-intent/:id/capture
// Called once the reader has authorized the card (after the app's
// confirmPaymentIntent step succeeds) — this is what actually captures
// the funds.
router.post(
  "/terminal/payment-intent/:id/capture",
  isAuthenticated,
  requireStoreAccount,
  async (req: any, res: any) => {
    try {
      const pi = await captureTerminalPaymentIntent(req.connectedAccountId, req.params.id);
      res.json({ status: pi.status });
    } catch (err: any) {
      console.error("Failed to capture Terminal PaymentIntent:", err);
      res.status(500).json({ message: err.message || "Failed to capture PaymentIntent" });
    }
  }
);

// POST /terminal/payment-intent/:id/cancel
// Called if collection/authorization fails partway through, to void
// whatever was reserved rather than leaving it dangling.
router.post(
  "/terminal/payment-intent/:id/cancel",
  isAuthenticated,
  requireStoreAccount,
  async (req: any, res: any) => {
    try {
      await cancelTerminalPaymentIntent(req.connectedAccountId, req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      // Cancel failing isn't critical (e.g. it may already be in a
      // terminal state) — log it but don't fail the request hard.
      console.error("Failed to cancel Terminal PaymentIntent:", err);
      res.json({ ok: false });
    }
  }
);

export default router;
