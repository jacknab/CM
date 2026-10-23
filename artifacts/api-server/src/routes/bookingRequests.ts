/**
 * Booking requests (lib/bookingRequests.ts).
 *
 * The professional (owner session or Certxa Pro app; mounted at /api/booking-requests behind isAuthenticated):
 *   GET  /                   open requests, newest first (?all=1 for answered ones too)
 *   GET  /:id                one request
 *   POST /:id/approve        book the time asked for (409 when it was taken meanwhile)
 *   POST /:id/decline        tell the client
 *   POST /:id/offer          { times: [iso, ...] }  text the client a link with these times
 *
 * The client (public, mounted at /api/public/booking-offer):
 *   GET  /:token             the offered times still free
 *   POST /:token/book        { time }  book one of them
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { approveRequest, declineRequest, getRequest, listRequests, offerTimes, pickOffer, readOffer, RequestError } from "../lib/bookingRequests";

export const ownerRouter = Router();
export const publicRouter = Router();

async function ownerStore(req: Request, res: Response): Promise<number | null> {
  if ((req.session as { staffId?: number } | undefined)?.staffId) { res.status(403).json({ message: "Only the owner can answer booking requests." }); return null; }
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(403).json({ message: "No store context" }); return null; }
  return storeId;
}
function fail(res: Response, error: unknown, fallback: string) {
  if (error instanceof RequestError) return res.status(error.status).json({ message: error.message });
  console.error("[booking-requests]", error instanceof Error ? error.message : error);
  return res.status(500).json({ message: fallback });
}
const idParam = z.coerce.number().int().positive();

ownerRouter.get("/", async (req, res) => {
  try {
    const storeId = await ownerStore(req, res); if (!storeId) return;
    return res.json(await listRequests(storeId, req.query.all === "1" ? "all" : "open"));
  } catch (error) { return fail(res, error, "Could not load booking requests."); }
});

ownerRouter.get("/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: "Invalid request" });
  try {
    const storeId = await ownerStore(req, res); if (!storeId) return;
    const request = await getRequest(storeId, id.data);
    return request ? res.json(request) : res.status(404).json({ message: "Request not found" });
  } catch (error) { return fail(res, error, "Could not load the request."); }
});

ownerRouter.post("/:id/approve", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: "Invalid request" });
  try {
    const storeId = await ownerStore(req, res); if (!storeId) return;
    return res.json(await approveRequest(storeId, id.data));
  } catch (error) { return fail(res, error, "Could not approve the request."); }
});

ownerRouter.post("/:id/decline", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: "Invalid request" });
  try {
    const storeId = await ownerStore(req, res); if (!storeId) return;
    return res.json(await declineRequest(storeId, id.data));
  } catch (error) { return fail(res, error, "Could not decline the request."); }
});

ownerRouter.post("/:id/offer", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const body = z.object({ times: z.array(z.string().max(40)).min(1).max(8) }).safeParse(req.body);
  if (!id.success) return res.status(400).json({ message: "Invalid request" });
  if (!body.success) return res.status(400).json({ message: "Choose from 1 to 8 times." });
  try {
    const storeId = await ownerStore(req, res); if (!storeId) return;
    return res.json(await offerTimes(storeId, id.data, body.data.times));
  } catch (error) { return fail(res, error, "Could not send the times."); }
});

// The client's link: guessing tokens is pointless (18 random bytes), but keep it from being hammered.
const offerLimiter = rateLimit({ windowMs: 10 * 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const tokenParam = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

publicRouter.get("/:token", offerLimiter, async (req, res) => {
  const token = tokenParam.safeParse(req.params.token);
  if (!token.success) return res.status(404).json({ message: "This link isn't valid." });
  try {
    const offer = await readOffer(token.data);
    return offer ? res.json(offer) : res.status(404).json({ message: "This link isn't valid." });
  } catch (error) { return fail(res, error, "Could not load the times."); }
});

publicRouter.post("/:token/book", offerLimiter, async (req, res) => {
  const token = tokenParam.safeParse(req.params.token);
  const body = z.object({ time: z.string().max(40) }).safeParse(req.body);
  if (!token.success || !body.success) return res.status(400).json({ message: "Choose one of the times." });
  try {
    return res.status(201).json(await pickOffer(token.data, body.data.time));
  } catch (error) { return fail(res, error, "Could not book that time."); }
});
