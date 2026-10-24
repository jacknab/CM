/** Public endpoints for the hardware shop on certxa.com/products. */
import express, { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { confirmShopPayment, quoteShopOrder, shopCatalogNow, shopClosedReason, ShopError, startShopCheckout } from "../lib/shop";

export const shopRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const json = express.json({ limit: "20kb" });

function fail(res: Response, err: unknown) {
  if (err instanceof ShopError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error("[shop]", err);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}

shopRouter.get("/api/shop/status", async (_req: Request, res: Response) => {
  try {
    const closed = shopClosedReason();
    const catalog = await shopCatalogNow();
    res.set("Cache-Control", "no-store").json({
      open: closed === null,
      // Stripe's card fields on the cart page need the platform's publishable key.
      publishableKey: closed === null ? process.env.STRIPE_PUBLISHABLE_KEY ?? null : null,
      products: catalog.map((p) => ({ sku: p.sku, name: p.name, priceCents: p.priceCents })),
    });
  } catch (err) {
    fail(res, err);
  }
});

shopRouter.post("/api/shop/quote", limiter, json, async (req: Request, res: Response) => {
  try {
    const q = await quoteShopOrder(req.body?.items, req.body?.address);
    res.json({ items: q.items, subtotalCents: q.subtotalCents, shippingCents: q.shippingCents, shippingService: q.shippingService, totalCents: q.totalCents });
  } catch (err) {
    fail(res, err);
  }
});

shopRouter.post("/api/shop/checkout", limiter, json, async (req: Request, res: Response) => {
  try {
    const out = await startShopCheckout(req.body?.items, req.body?.address, { email: req.body?.email, phone: req.body?.phone });
    res.json(out);
  } catch (err) {
    fail(res, err);
  }
});

// After the card is taken on the cart page: Stripe is asked, and the order is marked paid.
shopRouter.post("/api/shop/confirm", limiter, json, async (req: Request, res: Response) => {
  try {
    res.json(await confirmShopPayment(req.body?.orderNumber));
  } catch (err) {
    fail(res, err);
  }
});
