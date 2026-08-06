import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { apiKeys } from "@shared/schema/api-keys";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing API key. Provide Authorization: Bearer <key>" });
  }

  const key = authHeader.slice(7).trim();
  if (!key) return res.status(401).json({ message: "Empty API key" });

  const keyHash = crypto.createHash("sha256").update(key).digest("hex");

  const [found] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!found || !found.isActive) {
    return res.status(401).json({ message: "Invalid or inactive API key" });
  }

  if (found.expiresAt && found.expiresAt < new Date()) {
    return res.status(401).json({ message: "API key expired" });
  }

  // Update lastUsedAt async (don't await)
  db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, found.id)).catch(() => {});

  (req as any).apiKeyStoreId = found.storeId;
  (req as any).apiKeyScopes = found.scopes || "read";
  return next();
}
