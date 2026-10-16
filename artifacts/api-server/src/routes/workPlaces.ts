/**
 * Solo plan: where the professional sees clients (plans/solo-work-places-and-approval.md).
 *
 *   GET /api/work-places  — the business's settings, and whether it can have them (Solo plan only)
 *   PUT /api/work-places  — change them
 *
 * Own place: a salon/suite/booth (public address), a home studio (private address) or none, and house
 * calls on or off, with a radius from the business address, a flat travel fee and travel time. At least
 * one of the two is required. Whether the address is shown to clients (addressPrivate) — the owner's choice;
 * lib/publicStore.ts applies it everywhere public. Booking approval (auto / manual) is saved here too.
 * Kept out of PATCH /api/stores/:id, which accepts any store field without these checks.
 */
import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { locations } from "@shared/schema";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { resolveStorePlan } from "../lib/featureAccess";

const router = Router();

/** Whether a business can use these settings: the Solo plan only. */
export async function storeHasWorkPlaces(storeId: number): Promise<boolean> {
  const plan = await resolveStorePlan(storeId).catch(() => null);
  return plan?.planCode === "solo";
}

export const WORK_PLACE_FIELDS = {
  ownPlace: locations.ownPlace,
  addressPrivate: locations.addressPrivate,
  houseCalls: locations.houseCalls,
  houseCallRadiusMiles: locations.houseCallRadiusMiles,
  houseCallFee: locations.houseCallFee,
  houseCallTravelMinutes: locations.houseCallTravelMinutes,
  bookingApproval: locations.bookingApproval,
  bookingRequestExpiryHours: locations.bookingRequestExpiryHours,
} as const;

const input = z.object({
  ownPlace: z.enum(["salon", "home", "none"]),
  // Clients see the city only until they've booked. Always so with no place of their own (ownPlace "none").
  addressPrivate: z.boolean(),
  houseCalls: z.boolean(),
  houseCallRadiusMiles: z.number().int().min(1).max(100),
  houseCallFee: z.number().min(0).max(500),
  houseCallTravelMinutes: z.number().int().min(0).max(120),
  bookingApproval: z.enum(["auto", "manual"]),
  bookingRequestExpiryHours: z.number().int().min(1).max(168),
}).partial();

async function read(storeId: number) {
  const [row] = await db.select({ ...WORK_PLACE_FIELDS, address: locations.address, city: locations.city })
    .from(locations).where(eq(locations.id, storeId)).limit(1);
  return row ? { ...row, houseCallFee: Number(row.houseCallFee) } : null;
}

router.get("/", async (req, res) => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) return res.status(400).json({ message: "No store found" });
  const settings = await read(storeId);
  if (!settings) return res.status(404).json({ message: "Store not found" });
  return res.json({ eligible: await storeHasWorkPlaces(storeId), ...settings });
});

router.put("/", async (req, res) => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) return res.status(400).json({ message: "No store found" });
  if (!(await storeHasWorkPlaces(storeId))) {
    return res.status(403).json({ message: "Where you see clients is part of the Solo plan." });
  }
  const parsed = input.safeParse(req.body);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    const message = field === "houseCallRadiusMiles" ? "Choose a distance from 1 to 100 miles."
      : field === "houseCallFee" ? "Enter a travel fee from $0 to $500."
      : field === "houseCallTravelMinutes" ? "Choose travel time from 0 to 120 minutes."
      : "Please check your choices.";
    return res.status(400).json({ message });
  }
  const current = await read(storeId);
  if (!current) return res.status(404).json({ message: "Store not found" });
  const next = { ...current, ...parsed.data };
  // Clients have to be seen somewhere.
  if (next.ownPlace === "none" && !next.houseCalls) {
    return res.status(400).json({ message: "Choose where you see clients: your own place, house calls, or both." });
  }
  const { houseCallFee, ...rest } = parsed.data;
  await db.update(locations)
    .set({ ...rest, ...(houseCallFee !== undefined ? { houseCallFee: houseCallFee.toFixed(2) } : {}) })
    .where(eq(locations.id, storeId));
  return res.json({ eligible: true, ...(await read(storeId)) });
});

export default router;
