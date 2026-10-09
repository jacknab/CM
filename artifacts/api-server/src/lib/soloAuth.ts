/**
 * Stateless JWT auth for the certxa-solo native app (solo professionals).
 *
 * Unlike lib/mobileTokens.ts (24h, in-memory, only mintable after a WebView
 * session login), this is a self-contained bearer token: no server-side
 * storage, so it works correctly across the api's pm2 cluster workers and
 * survives restarts. Modeled on routes/crew-mobile.ts's signCrewToken pattern.
 */

import jwt from "jsonwebtoken";

function soloJwtSecret(): string {
  // SESSION_SECRET is already required by the API. A dedicated secret can be
  // supplied to rotate native sessions independently, but never use a public
  // fallback: that would let anyone forge an owner bearer token.
  const secret = process.env.SOLO_JWT_SECRET ?? process.env.SESSION_SECRET;
  if (!secret) throw new Error("SOLO_JWT_SECRET or SESSION_SECRET must be configured");
  return secret;
}

export interface SoloTokenPayload {
  userId: string;
  staffId?: number;
  type: "solo";
}

export function signSoloToken(payload: Omit<SoloTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "solo" } satisfies SoloTokenPayload, soloJwtSecret(), {
    expiresIn: "30d",
  });
}

export function verifySoloToken(token: string): SoloTokenPayload | null {
  try {
    const payload = jwt.verify(token, soloJwtSecret()) as SoloTokenPayload;
    if (payload.type !== "solo") return null;
    return payload;
  } catch {
    return null;
  }
}
