/** Public endpoints for the hardware shop on certxa.com/products. */
import express, { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { SHOP_CATALOG } from "@shared/shopCatalog";
import { quoteShopOrder, shopClosedReason, ShopError, startShopCheckout } from "../lib/shop";

export const shopRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const json = express.json({ limit: "20kb" });

function fail(res: Response, err: unknown) {
  if (err instanceof ShopError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error("[shop]", err);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}

shopRouter.get("/api/shop/status", (_req: Request, res: Response) => {
  const closed = shopClosedReason();
  res.set("Cache-Control", "no-store").json({
    open: closed === null,
    products: SHOP_CATALOG.map((p) => ({ sku: p.sku, name: p.name, priceCents: p.priceCents })),
  });
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
    const out = await startShopCheckout(req.body?.items, req.body?.address, { email: req.body?.email, phone: req.body?.phone }, "https://certxa.com");
    res.json(out);
  } catch (err) {
    fail(res, err);
  }
});
