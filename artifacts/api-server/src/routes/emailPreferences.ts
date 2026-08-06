import { Router } from "express";
import { db } from "../db";
import { userEmailPreferences } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

const prefsSchema = z.object({
  billingReceipts:  z.boolean().optional(),
  lowBalanceAlerts: z.boolean().optional(),
  dataOperations:   z.boolean().optional(),
  trialReminders:   z.boolean().optional(),
});

const DEFAULT_PREFS = {
  billingReceipts:  true,
  lowBalanceAlerts: true,
  dataOperations:   true,
  trialReminders:   true,
};

// GET /api/settings/email-preferences
router.get("/", async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const [row] = await db
      .select()
      .from(userEmailPreferences)
      .where(eq(userEmailPreferences.userId, userId))
      .limit(1);

    return res.json(row ?? { userId, ...DEFAULT_PREFS });
  } catch (err: any) {
    console.error("[emailPrefs] GET error:", err?.message);
    return res.status(500).json({ error: "Failed to load preferences" });
  }
});

// PATCH /api/settings/email-preferences
router.patch("/", async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const parsed = prefsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

  const data = parsed.data;

  try {
    const [existing] = await db
      .select({ id: userEmailPreferences.id })
      .from(userEmailPreferences)
      .where(eq(userEmailPreferences.userId, userId))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(userEmailPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userEmailPreferences.userId, userId))
        .returning();
      return res.json(updated);
    } else {
      const [created] = await db
        .insert(userEmailPreferences)
        .values({ userId, ...DEFAULT_PREFS, ...data })
        .returning();
      return res.json(created);
    }
  } catch (err: any) {
    console.error("[emailPrefs] PATCH error:", err?.message);
    return res.status(500).json({ error: "Failed to save preferences" });
  }
});

export default router;
