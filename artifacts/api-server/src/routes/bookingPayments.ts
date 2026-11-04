/**
 * routes/bookingPayments.ts — Online booking payment policy
 *
 * PUBLIC routes (no session required):
 *   GET  /api/public/booking-payment-policy/:slug   — store policy + stripe key
 *   POST /api/public/booking-setup-intent           — card-on-file Setup Intent
 *   POST /api/public/booking-payment-intent         — deposit Payment Intent
 *
 * AUTHENTICATED routes (session required, mounted under /api/payments):
 *   GET    /clients/:id/payment-methods             — list client's saved card
 *   DELETE /clients/:id/payment-methods/:pmId       — remove saved card
 */

import { Router } from "express";
import Stripe from "stripe";
import { db, pool } from "../db";
import { locations, appointments, services } from "@shared/schema";
import { clients } from "@shared/schema/clients";
import { eq, and } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { depositFromRule, depositIsSet, getBookingPaymentToken, markBookingPaymentTokenUsed, splitDeposit, visitParts } from "../lib/bookingPaymentLinks";
import { broadcastSyncEvent } from "../notifications";

// ─── Platform Stripe singleton ────────────────────────────────────────────────
let _stripe: Stripe | null = null;
function getPlatformStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  _stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" as any, typescript: true });
  return _stripe;
}

// ─── DB helper: get store's connected Stripe account ID ──────────────────────
async function getConnectedAccountId(storeId: number): Promise<string | null> {
  const row = await pool.query<{ provider_account_id: string }>(
    `SELECT provider_account_id FROM store_payment_accounts
     WHERE store_id = $1 AND provider = 'stripe' AND status = 'connected'
     LIMIT 1`,
    [storeId]
  );
  return row.rows[0]?.provider_account_id ?? null;
}

// ─── DB helper: find or create Stripe Customer on connected account ────────────
async function ensureStripeCustomer(
  stripe: Stripe,
  connectedAccountId: string,
  clientId: number,
  name: string,
  email?: string,
  phone?: string
): Promise<{ customerId: string; isNew: boolean }> {
  // Check if client already has a customer ID stored
  const [cl] = await db
    .select({ stripeCustomerId: clients.stripeCustomerId })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (cl?.stripeCustomerId) {
    return { customerId: cl.stripeCustomerId, isNew: false };
  }

  const customer = await stripe.customers.create(
    { name, email: email || undefined, phone: phone || undefined, metadata: { certxa_client_id: String(clientId) } },
    { stripeAccount: connectedAccountId }
  );

  await db.update(clients).set({ stripeCustomerId: customer.id }).where(eq(clients.id, clientId));

  return { customerId: customer.id, isNew: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTER
// ═══════════════════════════════════════════════════════════════════════════════
export const publicBookingPaymentRouter = Router();

/**
 * GET /api/public/booking-payment-policy/:slug
 * Returns the store's payment policy so the booking widget can adapt.
 */
publicBookingPaymentRouter.get("/booking-payment-policy/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const [store] = await db
      .select({
        id: locations.id,
        bookingPaymentPolicy: locations.bookingPaymentPolicy,
        depositType: locations.depositType,
        depositValue: locations.depositValue,
        depositIncludeTravelFee: locations.depositIncludeTravelFee,
        cancellationPolicyRequired: locations.cancellationPolicyRequired,
        cancellationPolicyText: locations.cancellationPolicyText,
        bookingApproval: locations.bookingApproval,
      })
      .from(locations)
      .where(eq(locations.bookingSlug, slug))
      .limit(1);

    if (!store) return res.status(404).json({ error: "Store not found" });

    const connectedAccountId = await getConnectedAccountId(store.id);
    const stripeEnabled = !!connectedAccountId && !!process.env.STRIPE_SECRET_KEY;

    // If Stripe isn't connected, effective policy is always 'none'
    // A business that reviews each booking first takes requests. A request takes no payment (a deposit comes after the
    // pro approves, lib/bookingRequests.ts), but a card to keep on file is collected with it (owner, 2026-11-04).
    const policy = store.bookingPaymentPolicy ?? "none";
    let effectivePolicy = stripeEnabled && (store.bookingApproval !== "manual" || policy === "card_on_file") ? policy : "none";

    // Deposit policy is only valid when depositValue is actually configured;
    // a misconfigured deposit (value null/0) falls back to 'none' so the booking
    // widget doesn't send the customer into a payment step that will always 400.
    if (effectivePolicy === "deposit" && !depositIsSet({ type: store.depositType, value: store.depositValue })) {
      console.warn(`[bookingPayments/policy] store ${store.id} has deposit policy but no depositValue — falling back to none`);
      effectivePolicy = "none";
    }

    return res.json({
      policy: effectivePolicy,
      depositType: store.depositType,
      depositValue: store.depositValue ? Number(store.depositValue) : null,
      depositIncludeTravelFee: store.depositIncludeTravelFee,
      stripePublishableKey: stripeEnabled ? (process.env.STRIPE_PUBLISHABLE_KEY ?? null) : null,
      stripeConnectedAccountId: stripeEnabled ? connectedAccountId : null,
      cancellationPolicyRequired: !!store.cancellationPolicyRequired && !!String(store.cancellationPolicyText ?? "").trim(),
      cancellationPolicyText: String(store.cancellationPolicyText ?? "").trim(),
    });
  } catch (err: any) {
    console.error("[bookingPayments/policy]", err?.message);
    return res.status(500).json({ error: "Failed to fetch payment policy" });
  }
});

/**
 * POST /api/public/booking-setup-intent
 * Creates a Stripe Setup Intent so the customer can save a card without being charged.
 * Body: { slug, customerName, customerEmail?, customerPhone? }
 * NOTE: clientId is intentionally NOT accepted here (public endpoint — no ownership proof).
 * The booking endpoint links the Stripe customer to the client record after booking creation.
 */
publicBookingPaymentRouter.post("/booking-setup-intent", async (req, res) => {
  try {
    const { slug, customerName, customerEmail, customerPhone } = req.body;
    if (!slug || !customerName) return res.status(400).json({ error: "slug and customerName required" });

    const [store] = await db
      .select({ id: locations.id, bookingPaymentPolicy: locations.bookingPaymentPolicy })
      .from(locations)
      .where(eq(locations.bookingSlug, slug))
      .limit(1);

    if (!store) return res.status(404).json({ error: "Store not found" });
    if (store.bookingPaymentPolicy !== "card_on_file") {
      return res.status(400).json({ error: "This store does not require card on file" });
    }

    const connectedAccountId = await getConnectedAccountId(store.id);
    if (!connectedAccountId) return res.status(400).json({ error: "Store has no connected Stripe account" });

    const stripe = getPlatformStripe();

    // Always create an anonymous guest customer — the booking endpoint links it to the
    // client record after the appointment is created (where store ownership is verified).
    const customer = await stripe.customers.create(
      {
        name: customerName,
        email: customerEmail || undefined,
        phone: customerPhone || undefined,
        metadata: { certxa_store_id: String(store.id), certxa_booking: "pending" },
      },
      { stripeAccount: connectedAccountId }
    );

    const setupIntent = await stripe.setupIntents.create(
      {
        customer: customer.id,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: { certxa_store_id: String(store.id) },
      },
      { stripeAccount: connectedAccountId }
    );

    return res.json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      stripeCustomerId: customer.id,
    });
  } catch (err: any) {
    console.error("[bookingPayments/setup-intent]", err?.message);
    return res.status(500).json({ error: err?.message ?? "Failed to create setup intent" });
  }
});

/**
 * POST /api/public/booking-payment-intent
 * Creates a Stripe Payment Intent to collect a deposit.
 * Body: { slug, customerName, customerEmail?, customerPhone?, serviceTotalCents }
 *
 * Deposit amount is always computed SERVER-SIDE from the store's depositType/depositValue.
 * The client sends serviceTotalCents (sum of service prices) so we can compute percentage deposits;
 * fixed deposits ignore this value. Never trust client-supplied amountCents.
 *
 * NOTE: clientId is intentionally NOT accepted (public endpoint — no ownership proof).
 */
publicBookingPaymentRouter.post("/booking-payment-intent", async (req, res) => {
  try {
    const { slug, customerName, customerEmail, customerPhone, serviceTotalCents, travelFeeCents } = req.body;
    if (!slug || !customerName || typeof serviceTotalCents !== "number") {
      console.warn("[bookingPayments/payment-intent] 400: missing required fields", { slug, customerName, serviceTotalCentsType: typeof serviceTotalCents });
      return res.status(400).json({ error: "slug, customerName, and serviceTotalCents required" });
    }
    if (serviceTotalCents < 0) {
      console.warn("[bookingPayments/payment-intent] 400: negative serviceTotalCents", { serviceTotalCents });
      return res.status(400).json({ error: "Invalid service total" });
    }

    const [store] = await db
      .select({
        id: locations.id,
        bookingPaymentPolicy: locations.bookingPaymentPolicy,
        depositType: locations.depositType,
        depositValue: locations.depositValue,
        depositIncludeTravelFee: locations.depositIncludeTravelFee,
      })
      .from(locations)
      .where(eq(locations.bookingSlug, slug))
      .limit(1);

    if (!store) return res.status(404).json({ error: "Store not found" });
    if (store.bookingPaymentPolicy !== "deposit") {
      console.warn(`[bookingPayments/payment-intent] 400: store ${store.id} policy is '${store.bookingPaymentPolicy}', not 'deposit'`);
      return res.status(400).json({ error: "This store does not require a deposit" });
    }
    const rule = { type: store.depositType, value: store.depositValue, includeTravelFee: store.depositIncludeTravelFee };
    if (!depositIsSet(rule)) {
      console.warn(`[bookingPayments/payment-intent] 400: store ${store.id} has deposit policy but no amount`);
      return res.status(400).json({ error: "Store deposit not configured" });
    }

    // Compute authoritative deposit amount server-side (at least Stripe's minimum)
    const depositCents = depositFromRule(rule, serviceTotalCents, Number(travelFeeCents) > 0 ? Number(travelFeeCents) : 0);
    if (depositCents <= 0) return res.status(400).json({ error: "This booking has nothing to pay" });

    const connectedAccountId = await getConnectedAccountId(store.id);
    if (!connectedAccountId) {
      console.warn(`[bookingPayments/payment-intent] 400: store ${store.id} has no connected Stripe account`);
      return res.status(400).json({ error: "Store has no connected Stripe account" });
    }

    const stripe = getPlatformStripe();

    // Always create an anonymous guest customer — booking endpoint links it after creation.
    const customer = await stripe.customers.create(
      {
        name: customerName,
        email: customerEmail || undefined,
        phone: customerPhone || undefined,
        metadata: { certxa_store_id: String(store.id), certxa_booking: "pending" },
      },
      { stripeAccount: connectedAccountId }
    );

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: depositCents,
        currency: "usd",
        customer: customer.id,
        payment_method_types: ["card"],
        capture_method: "automatic",
        metadata: {
          certxa_store_id: String(store.id),
          certxa_deposit_cents: String(depositCents),
          certxa_service_total_cents: String(serviceTotalCents),
        },
      },
      { stripeAccount: connectedAccountId }
    );

    return res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      stripeCustomerId: customer.id,
      depositCents, // authoritative amount — client should display this, not its own calc
    });
  } catch (err: any) {
    console.error("[bookingPayments/payment-intent]", err?.message);
    return res.status(500).json({ error: err?.message ?? "Failed to create payment intent" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT-LINK ROUTES — AI receptionist "complete your booking" SMS flow
// ═══════════════════════════════════════════════════════════════════════════════
// Unlike the routes above (payment collected BEFORE the appointment exists,
// in the same browser session as the booking form), these operate on an
// appointment that already exists as a hidden, payment-pending hold — the
// token identifies which one. See lib/bookingPaymentLinks.ts and
// aiReceptionist.ts's createBookingViaBookingRules for how the hold and
// token get created, and services/booking-hold-scheduler.ts for the
// 20-min-resend / 60-min-expire lifecycle around it.

function isTokenUsable(tokenRow: { usedAt: Date | null; expiresAt: Date }): { ok: true } | { ok: false; status: number; error: string } {
  if (tokenRow.usedAt) return { ok: false, status: 410, error: "This link has already been used." };
  if (tokenRow.expiresAt.getTime() <= Date.now()) return { ok: false, status: 410, error: "This link has expired — please call the salon to rebook." };
  return { ok: true };
}

/**
 * POST /api/public/booking-payment-link/validate
 * Body: { token }
 * Returns what the page needs to render: what's required, the deposit
 * amount (if any), and store/service/time context for display.
 */
publicBookingPaymentRouter.post("/booking-payment-link/validate", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== "string") return res.status(400).json({ error: "token required" });

    const tokenRow = await getBookingPaymentToken(token);
    if (!tokenRow) return res.status(404).json({ error: "Invalid link" });
    const usable = isTokenUsable(tokenRow);
    if (!usable.ok) return res.status(usable.status).json({ error: usable.error });

    const [appt] = await db
      .select({ date: appointments.date, duration: appointments.duration, serviceId: appointments.serviceId })
      .from(appointments)
      .where(eq(appointments.id, tokenRow.appointmentId))
      .limit(1);
    if (!appt) return res.status(404).json({ error: "Appointment not found" });

    const [service] = appt.serviceId
      ? await db.select({ name: services.name }).from(services).where(eq(services.id, appt.serviceId)).limit(1)
      : [undefined];
    const [store] = await db
      .select({ name: locations.name, timezone: locations.timezone })
      .from(locations)
      .where(eq(locations.id, tokenRow.storeId))
      .limit(1);

    const connectedAccountId = await getConnectedAccountId(tokenRow.storeId);
    const stripeEnabled = !!connectedAccountId && !!process.env.STRIPE_SECRET_KEY;
    if (!stripeEnabled) {
      return res.status(400).json({ error: "This salon's payment setup is temporarily unavailable — please call to confirm your booking." });
    }

    return res.json({
      requirement: tokenRow.requirement,
      depositAmountCents: tokenRow.depositAmountCents,
      storeName: store?.name ?? "",
      serviceName: service?.name ?? "",
      appointmentDate: appt.date,
      duration: appt.duration,
      timezone: store?.timezone ?? "UTC",
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
      stripeConnectedAccountId: connectedAccountId,
    });
  } catch (err: any) {
    console.error("[bookingPayments/payment-link/validate]", err?.message);
    return res.status(500).json({ error: "Failed to validate link" });
  }
});

/**
 * POST /api/public/booking-payment-link/setup-intent
 * Body: { token } — creates a Stripe Setup Intent for the card-on-file requirement.
 */
publicBookingPaymentRouter.post("/booking-payment-link/setup-intent", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== "string") return res.status(400).json({ error: "token required" });

    const tokenRow = await getBookingPaymentToken(token);
    if (!tokenRow) return res.status(404).json({ error: "Invalid link" });
    const usable = isTokenUsable(tokenRow);
    if (!usable.ok) return res.status(usable.status).json({ error: usable.error });
    if (tokenRow.requirement !== "card_on_file") {
      return res.status(400).json({ error: "This booking does not require card on file" });
    }
    if (!tokenRow.customerId) return res.status(400).json({ error: "No client on this booking" });

    const connectedAccountId = await getConnectedAccountId(tokenRow.storeId);
    if (!connectedAccountId) return res.status(400).json({ error: "Store has no connected Stripe account" });

    const stripe = getPlatformStripe();
    const [cl] = await db.select({ fullName: clients.fullName }).from(clients).where(eq(clients.id, tokenRow.customerId)).limit(1);
    const { customerId: stripeCustomerId } = await ensureStripeCustomer(
      stripe, connectedAccountId, tokenRow.customerId, cl?.fullName || "Guest", undefined, tokenRow.customerPhone ?? undefined
    );

    const setupIntent = await stripe.setupIntents.create(
      {
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: { certxa_store_id: String(tokenRow.storeId), certxa_appointment_id: String(tokenRow.appointmentId) },
      },
      { stripeAccount: connectedAccountId }
    );

    return res.json({ clientSecret: setupIntent.client_secret, setupIntentId: setupIntent.id, stripeCustomerId });
  } catch (err: any) {
    console.error("[bookingPayments/payment-link/setup-intent]", err?.message);
    return res.status(500).json({ error: err?.message ?? "Failed to create setup intent" });
  }
});

/**
 * POST /api/public/booking-payment-link/payment-intent
 * Body: { token } — creates a Stripe Payment Intent for the deposit amount
 * snapshotted on the token at hold-creation time (never recomputed here).
 */
publicBookingPaymentRouter.post("/booking-payment-link/payment-intent", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== "string") return res.status(400).json({ error: "token required" });

    const tokenRow = await getBookingPaymentToken(token);
    if (!tokenRow) return res.status(404).json({ error: "Invalid link" });
    const usable = isTokenUsable(tokenRow);
    if (!usable.ok) return res.status(usable.status).json({ error: usable.error });
    if (tokenRow.requirement !== "deposit" || !tokenRow.depositAmountCents) {
      return res.status(400).json({ error: "This booking does not require a deposit" });
    }
    if (!tokenRow.customerId) return res.status(400).json({ error: "No client on this booking" });

    const connectedAccountId = await getConnectedAccountId(tokenRow.storeId);
    if (!connectedAccountId) return res.status(400).json({ error: "Store has no connected Stripe account" });

    const stripe = getPlatformStripe();
    const [cl] = await db.select({ fullName: clients.fullName }).from(clients).where(eq(clients.id, tokenRow.customerId)).limit(1);
    const { customerId: stripeCustomerId } = await ensureStripeCustomer(
      stripe, connectedAccountId, tokenRow.customerId, cl?.fullName || "Guest", undefined, tokenRow.customerPhone ?? undefined
    );

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: tokenRow.depositAmountCents,
        currency: "usd",
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        capture_method: "automatic",
        metadata: {
          certxa_store_id: String(tokenRow.storeId),
          certxa_appointment_id: String(tokenRow.appointmentId),
          certxa_deposit_cents: String(tokenRow.depositAmountCents),
        },
      },
      { stripeAccount: connectedAccountId }
    );

    return res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      stripeCustomerId,
      depositCents: tokenRow.depositAmountCents,
    });
  } catch (err: any) {
    console.error("[bookingPayments/payment-link/payment-intent]", err?.message);
    return res.status(500).json({ error: err?.message ?? "Failed to create payment intent" });
  }
});

/**
 * POST /api/public/booking-payment-link/complete
 * Body: { token, stripeSetupIntentId? | stripePaymentIntentId? }
 * Authoritatively verifies the Stripe intent, unhides the appointment, and
 * marks the token used — this is what makes the booking show up on the
 * Calendar for the first time.
 */
publicBookingPaymentRouter.post("/booking-payment-link/complete", async (req, res) => {
  try {
    const { token, stripeSetupIntentId, stripePaymentIntentId } = req.body;
    if (!token || typeof token !== "string") return res.status(400).json({ error: "token required" });

    const tokenRow = await getBookingPaymentToken(token);
    if (!tokenRow) return res.status(404).json({ error: "Invalid link" });
    const usable = isTokenUsable(tokenRow);
    if (!usable.ok) return res.status(usable.status).json({ error: usable.error });

    // The whole visit: add-ons, travel fee and any second service.
    const parts = await visitParts(tokenRow.appointmentId);
    const serviceTotalCents = parts.reduce((sum, part) => sum + part.cents, 0);

    const verified = await verifyStripeIntentForBooking({
      storeId: tokenRow.storeId,
      paymentPolicy: tokenRow.requirement,
      stripeSetupIntentId,
      stripePaymentIntentId,
      expectedDepositCents: tokenRow.depositAmountCents ?? undefined,
      authorizedServiceTotalCents: serviceTotalCents,
    });

    await pool.query(
      `UPDATE appointments SET
        calendar_hidden            = FALSE,
        payment_policy             = $1,
        payment_status             = $2,
        stripe_payment_intent_id   = $3,
        stripe_setup_intent_id     = $4,
        stripe_customer_id         = $5,
        stripe_payment_method_id   = $6,
        deposit_collected          = $7,
        remaining_balance          = $8
       WHERE id = $9`,
      [
        tokenRow.requirement,
        verified.paymentStatus,
        verified.stripePaymentIntentId,
        verified.stripeSetupIntentId,
        verified.stripeCustomerId,
        verified.stripePaymentMethodId,
        verified.depositCollected,
        verified.remainingBalance,
        tokenRow.appointmentId,
      ]
    );

    if (verified.stripeCustomerId && tokenRow.customerId) {
      await pool.query(`UPDATE clients SET stripe_customer_id = $1 WHERE id = $2`, [verified.stripeCustomerId, tokenRow.customerId]);
      if (verified.paymentStatus === "card_saved") await rememberClientCard(tokenRow.storeId, tokenRow.customerId, verified);
    }

    // A deposit larger than the first service comes off the second too: it must not be charged again at checkout.
    if (verified.depositCollected && parts.length > 1) {
      for (const part of splitDeposit(Math.round(verified.depositCollected * 100), parts)) {
        await pool.query(`UPDATE appointments SET deposit_collected = $2 WHERE id = $1`, [part.id, (part.cents / 100).toFixed(2)]);
      }
    }

    await markBookingPaymentTokenUsed(tokenRow.id);

    // Paid: the second service of the same visit shows too, the client gets the usual confirmation, and the
    // owner's phone hears about it (it said nothing while the booking waited for its deposit).
    await pool.query(`UPDATE appointments SET calendar_hidden = FALSE WHERE ticket_group_id = $1 AND store_id = $2`, [tokenRow.appointmentId, tokenRow.storeId]);
    void (async () => {
      const { storage } = await import("../storage");
      const { sendBookingConfirmation } = await import("../sms");
      const { sendBookingConfirmationEmail } = await import("../mail");
      const { pushBookingEvent } = await import("../lib/ownerPush");
      const full = await storage.getAppointment(tokenRow.appointmentId);
      if (full) {
        await sendBookingConfirmation(full).catch(() => undefined);
        await sendBookingConfirmationEmail(full).catch(() => undefined);
      }
      void pushBookingEvent(tokenRow.storeId, tokenRow.appointmentId, "booked_online");
    })().catch((e) => console.warn("[bookingPayments/complete] after-payment messages:", e?.message ?? e));

    broadcastSyncEvent({
      type: "booking_updated",
      storeId: tokenRow.storeId,
      appointmentId: tokenRow.appointmentId,
      changes: ["calendarHidden", "paymentStatus"],
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[bookingPayments/payment-link/complete]", err?.message);
    return res.status(400).json({ error: err?.message ?? "Failed to complete booking" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPENSATING ACTION — refund / cancel a payment intent on booking failure
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Called when booking creation or verification fails after a PaymentIntent was confirmed.
 * - If already captured (succeeded): issues a full refund
 * - If still uncaptured (requires_capture): cancels the intent
 * Errors are logged but never re-thrown — this is best-effort compensation.
 */
export async function compensateStripePayment(storeId: number, paymentIntentId: string): Promise<void> {
  try {
    const stripe = getPlatformStripe();
    const connectedAccountId = await getConnectedAccountId(storeId);
    if (!connectedAccountId) return;

    const pi = await stripe.paymentIntents.retrieve(
      paymentIntentId, {}, { stripeAccount: connectedAccountId }
    );

    if (pi.status === "succeeded") {
      await stripe.refunds.create(
        { payment_intent: paymentIntentId, reason: "duplicate" },
        { stripeAccount: connectedAccountId }
      );
      console.log(`[compensateStripe] Refunded PaymentIntent ${paymentIntentId} for store ${storeId}`);
    } else if (pi.status === "requires_capture" || pi.status === "processing") {
      await stripe.paymentIntents.cancel(
        paymentIntentId, {}, { stripeAccount: connectedAccountId }
      );
      console.log(`[compensateStripe] Cancelled PaymentIntent ${paymentIntentId} for store ${storeId}`);
    }
    // already canceled / refunded / other terminal state — nothing to do
  } catch (err: any) {
    console.error(`[compensateStripe] Failed to compensate PaymentIntent ${paymentIntentId}:`, err?.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER-SIDE INTENT VERIFICATION (called from booking endpoint after creation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verifies a Stripe intent after booking creation and returns trusted payment fields.
 * Throws if the intent is not in a valid completed state or belongs to a different store.
 *
 * For setup intents: verifies status === "succeeded"
 * For payment intents: verifies status === "succeeded" and amount matches metadata
 */
/**
 * A saved card is checked with a $1 hold, released at once, so nothing is charged (owner, 2026-11-04). A declined card
 * stops the booking. A bank asking for the client to approve it isn't a decline: the card was already set up with them
 * present, so it stays saved, and a Stripe problem on our side doesn't turn a good client away either.
 */
export async function checkCardWithHold(stripe: Pick<Stripe, "paymentIntents">, connectedAccountId: string,
  card: { storeId: number; customerId: string; paymentMethodId: string }): Promise<void> {
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create({
      amount: 100, currency: "usd", customer: card.customerId, payment_method: card.paymentMethodId,
      payment_method_types: ["card"], capture_method: "manual", confirm: true, off_session: true,
      description: "Card check, released right away",
      metadata: { certxa_store_id: String(card.storeId), certxa_card_check: "1" },
    }, { stripeAccount: connectedAccountId });
  } catch (err: any) {
    if (err?.code === "authentication_required") return;
    if (err?.type === "StripeCardError") throw new Error(err?.message || "That card was declined. Please try another card.");
    console.warn("[bookingPayments/card-check] not checked:", err?.message);
    return;
  }
  await stripe.paymentIntents.cancel(pi.id, {}, { stripeAccount: connectedAccountId })
    .catch((err: any) => console.error("[bookingPayments/card-check] hold not released:", pi.id, err?.message));
}

/** Keep a saved card on the client, so it's there for their next booking and shows on their profile. */
export async function rememberClientCard(storeId: number, clientId: number, card: { stripeCustomerId: string | null; stripePaymentMethodId: string | null }): Promise<void> {
  if (!card.stripeCustomerId || !card.stripePaymentMethodId) return;
  const connectedAccountId = await getConnectedAccountId(storeId);
  const pm = connectedAccountId
    ? await getPlatformStripe().paymentMethods.retrieve(card.stripePaymentMethodId, {}, { stripeAccount: connectedAccountId }).catch(() => null)
    : null;
  await pool.query(
    `UPDATE clients SET stripe_customer_id = $1, stripe_payment_method_id = $2, card_brand = $3, card_last4 = $4, card_exp_month = $5, card_exp_year = $6
      WHERE id = $7 AND store_id = $8`,
    [card.stripeCustomerId, card.stripePaymentMethodId, pm?.card?.brand ?? null, pm?.card?.last4 ?? null, pm?.card?.exp_month ?? null, pm?.card?.exp_year ?? null, clientId, storeId]);
}

export async function verifyStripeIntentForBooking(params: {
  storeId: number;
  paymentPolicy: "card_on_file" | "deposit";
  stripeSetupIntentId?: string;
  stripePaymentIntentId?: string;
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;
  expectedDepositCents?: number;     // authoritative server-computed deposit; validates pi.amount
  authorizedServiceTotalCents?: number; // server-computed service+addon total; used for remainingBalance
}): Promise<{
  paymentStatus: string;
  stripePaymentIntentId: string | null;
  stripeSetupIntentId: string | null;
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
  depositCollected: number | null;
  remainingBalance: number | null;
}> {
  const stripe = getPlatformStripe();
  const connectedAccountId = await getConnectedAccountId(params.storeId);

  if (!connectedAccountId) {
    throw new Error("Store has no connected Stripe account");
  }

  if (params.paymentPolicy === "card_on_file") {
    if (!params.stripeSetupIntentId) throw new Error("Missing setup intent ID");

    const si = await stripe.setupIntents.retrieve(
      params.stripeSetupIntentId,
      {},
      { stripeAccount: connectedAccountId }
    );

    // Validate ownership
    if (si.metadata?.certxa_store_id !== String(params.storeId)) {
      throw new Error("Intent does not belong to this store");
    }
    if (si.status !== "succeeded") {
      throw new Error(`Setup intent not completed (status: ${si.status})`);
    }

    const pmId = typeof si.payment_method === "string" ? si.payment_method : (si.payment_method?.id ?? null);
    const customerId = typeof si.customer === "string" ? si.customer : (si.customer?.id ?? params.stripeCustomerId ?? null);

    // Once for each saved card: going through this again must not place another hold.
    if (si.metadata?.certxa_card_checked !== "1" && customerId && pmId) {
      await checkCardWithHold(stripe, connectedAccountId, { storeId: params.storeId, customerId, paymentMethodId: pmId });
      await stripe.setupIntents.update(si.id, { metadata: { ...si.metadata, certxa_card_checked: "1" } }, { stripeAccount: connectedAccountId });
    }

    return {
      paymentStatus: "card_saved",
      stripePaymentIntentId: null,
      stripeSetupIntentId: si.id,
      stripeCustomerId: customerId,
      stripePaymentMethodId: pmId,
      depositCollected: null,
      remainingBalance: null,
    };
  }

  // Deposit — payment intent
  if (!params.stripePaymentIntentId) throw new Error("Missing payment intent ID");

  const pi = await stripe.paymentIntents.retrieve(
    params.stripePaymentIntentId,
    {},
    { stripeAccount: connectedAccountId }
  );

  if (pi.metadata?.certxa_store_id !== String(params.storeId)) {
    throw new Error("Intent does not belong to this store");
  }
  if (pi.status !== "succeeded") {
    throw new Error(`Payment intent not completed (status: ${pi.status})`);
  }

  // If the booking endpoint supplied an authoritative expected amount, verify the
  // actual charged amount matches (within 1-cent rounding). This prevents a client
  // from submitting a low serviceTotalCents to the payment-intent endpoint in order
  // to underpay a percentage deposit.
  if (params.expectedDepositCents !== undefined) {
    if (Math.abs(pi.amount - params.expectedDepositCents) > 1) {
      throw new Error(
        `Deposit amount mismatch: charged ${pi.amount}¢ but expected ${params.expectedDepositCents}¢`
      );
    }
  }

  // Authoritative amounts: deposit from Stripe (what was actually charged),
  // remaining from server-computed service total (never from client-controlled metadata).
  const depositCents = pi.amount;
  const depositCollected = depositCents / 100;
  const authServiceTotal = params.authorizedServiceTotalCents ?? 0;
  const remainingBalance = authServiceTotal > 0 ? Math.max(0, (authServiceTotal - depositCents) / 100) : null;

  const pmId = typeof pi.payment_method === "string" ? pi.payment_method : (pi.payment_method?.id ?? null);

  return {
    paymentStatus: "deposit_paid",
    stripePaymentIntentId: pi.id,
    stripeSetupIntentId: null,
    stripeCustomerId: typeof pi.customer === "string" ? pi.customer : (pi.customer?.id ?? params.stripeCustomerId ?? null),
    stripePaymentMethodId: pmId,
    depositCollected,
    remainingBalance,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATED ROUTER — client payment methods (mounted at /api/payments)
// ═══════════════════════════════════════════════════════════════════════════════
export const clientPaymentMethodsRouter = Router();
clientPaymentMethodsRouter.use(isAuthenticated);

/**
 * GET /api/payments/clients/:id/payment-methods
 * Returns the saved card for a client (fetched live from Stripe).
 */
clientPaymentMethodsRouter.get("/clients/:id/payment-methods", async (req, res) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ error: "No store access" });

    const clientId = Number(req.params.id);
    const [cl] = await db
      .select({
        stripeCustomerId: clients.stripeCustomerId,
        stripePaymentMethodId: clients.stripePaymentMethodId,
        cardBrand: clients.cardBrand,
        cardLast4: clients.cardLast4,
        cardExpMonth: clients.cardExpMonth,
        cardExpYear: clients.cardExpYear,
        storeId: clients.storeId,
      })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.storeId, storeId)))
      .limit(1);

    if (!cl) return res.status(404).json({ error: "Client not found" });
    if (!cl.stripeCustomerId) return res.json({ paymentMethods: [] });

    const connectedAccountId = await getConnectedAccountId(storeId);
    if (!connectedAccountId) return res.json({ paymentMethods: [] });

    const stripe = getPlatformStripe();
    let liveCard: any = null;

    try {
      const pms = await stripe.customers.listPaymentMethods(
        cl.stripeCustomerId,
        { type: "card", limit: 10 },
        { stripeAccount: connectedAccountId }
      );
      liveCard = pms.data.map(pm => ({
        id: pm.id,
        brand: (pm.card as any)?.brand ?? cl.cardBrand,
        last4: (pm.card as any)?.last4 ?? cl.cardLast4,
        expMonth: (pm.card as any)?.exp_month ?? cl.cardExpMonth,
        expYear: (pm.card as any)?.exp_year ?? cl.cardExpYear,
        isDefault: pm.id === cl.stripePaymentMethodId,
      }));
    } catch {
      // Fall back to cached DB values if Stripe is unavailable
      if (cl.cardLast4) {
        liveCard = [{
          id: cl.stripePaymentMethodId,
          brand: cl.cardBrand,
          last4: cl.cardLast4,
          expMonth: cl.cardExpMonth,
          expYear: cl.cardExpYear,
          isDefault: true,
        }];
      }
    }

    return res.json({ paymentMethods: liveCard ?? [] });
  } catch (err: any) {
    console.error("[bookingPayments/list-methods]", err?.message);
    return res.status(500).json({ error: "Failed to fetch payment methods" });
  }
});

/**
 * DELETE /api/payments/clients/:id/payment-methods/:pmId
 * Detaches a payment method from the Stripe customer and clears the DB record.
 */
clientPaymentMethodsRouter.delete("/clients/:id/payment-methods/:pmId", async (req, res) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ error: "No store access" });

    const clientId = Number(req.params.id);
    const pmId = req.params.pmId;

    const [cl] = await db
      .select({ stripeCustomerId: clients.stripeCustomerId, storeId: clients.storeId })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.storeId, storeId)))
      .limit(1);

    if (!cl) return res.status(404).json({ error: "Client not found" });

    const connectedAccountId = await getConnectedAccountId(storeId);
    if (connectedAccountId && cl.stripeCustomerId) {
      try {
        await getPlatformStripe().paymentMethods.detach(pmId, {}, { stripeAccount: connectedAccountId });
      } catch (e: any) {
        console.warn("[bookingPayments/detach] Stripe detach failed (may already be removed):", e?.message);
      }
    }

    // Clear DB if this was the default card
    await db.update(clients)
      .set({ stripePaymentMethodId: null, cardBrand: null, cardLast4: null, cardExpMonth: null, cardExpYear: null })
      .where(and(eq(clients.id, clientId), eq(clients.stripePaymentMethodId, pmId)));

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[bookingPayments/detach]", err?.message);
    return res.status(500).json({ error: "Failed to remove payment method" });
  }
});

/**
 * POST /api/payments/clients/:id/payment-methods/attach
 * Called after a successful Setup Intent to permanently attach a card to the client record.
 * Body: { paymentMethodId, stripeCustomerId, setupIntentId }
 */
clientPaymentMethodsRouter.post("/clients/:id/payment-methods/attach", async (req, res) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ error: "No store access" });

    const clientId = Number(req.params.id);
    const { paymentMethodId, stripeCustomerId, setupIntentId } = req.body;

    if (!paymentMethodId || !stripeCustomerId) {
      return res.status(400).json({ error: "paymentMethodId and stripeCustomerId required" });
    }

    const [cl] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.storeId, storeId)))
      .limit(1);

    if (!cl) return res.status(404).json({ error: "Client not found" });

    const connectedAccountId = await getConnectedAccountId(storeId);
    let brand = "", last4 = "", expMonth = 0, expYear = 0;

    if (connectedAccountId) {
      try {
        const pm = await getPlatformStripe().paymentMethods.retrieve(
          paymentMethodId, {}, { stripeAccount: connectedAccountId }
        );
        brand = (pm.card as any)?.brand ?? "";
        last4 = (pm.card as any)?.last4 ?? "";
        expMonth = (pm.card as any)?.exp_month ?? 0;
        expYear = (pm.card as any)?.exp_year ?? 0;
      } catch (e: any) {
        console.warn("[bookingPayments/attach] Could not retrieve PM details:", e?.message);
      }
    }

    await db.update(clients).set({
      stripeCustomerId,
      stripePaymentMethodId: paymentMethodId,
      cardBrand: brand || null,
      cardLast4: last4 || null,
      cardExpMonth: expMonth || null,
      cardExpYear: expYear || null,
    }).where(eq(clients.id, clientId));

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[bookingPayments/attach]", err?.message);
    return res.status(500).json({ error: "Failed to attach payment method" });
  }
});
