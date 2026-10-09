/**
 * Device pairing ("activation") codes — lets whoever sets up a POS, /frontdesk, or self-serve
 * kiosk tablet type one 12-digit number instead of ever seeing this store's real slug or
 * register id. The same code resolves to the same {slug, registerId} regardless of which of
 * those three roles the device is being set up as — the role comes from which app screen the
 * code is entered into, not from the code itself.
 *
 * Codes are generated lazily (get-or-create) the first time they're read, not at store/register
 * creation — so every existing store gets one the first time its owner opens
 * Settings → POS Stations, with no migration backfill needed.
 */
import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { locations, registers } from "@shared/schema";

function randomCode(): string {
  // First digit 1-9 (never a leading zero, so the code always displays as a full 12 digits).
  // From the system's secure random source: this code is what lets a tablet act as a salon's kiosk.
  let s = String(randomInt(1, 10));
  for (let i = 0; i < 11; i++) s += String(randomInt(0, 10));
  return s;
}

async function isCodeFree(code: string): Promise<boolean> {
  const [loc] = await db.select({ id: locations.id }).from(locations).where(eq(locations.activationCode, code));
  if (loc) return false;
  const [reg] = await db.select({ id: registers.id }).from(registers).where(eq(registers.activationCode, code));
  return !reg;
}

async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = randomCode();
    if (await isCodeFree(code)) return code;
  }
  // 12 digits is a 9×10^11 code space — this is unreachable in practice, but fail loudly
  // rather than silently handing back a colliding code.
  throw new Error("Could not generate a unique activation code");
}

/** Get-or-create the default station's (registerId 0) activation code for a store. */
export async function ensureLocationActivationCode(storeId: number): Promise<string> {
  const [loc] = await db.select({ activationCode: locations.activationCode }).from(locations).where(eq(locations.id, storeId));
  if (loc?.activationCode) return loc.activationCode;
  const code = await generateUniqueCode();
  await db.update(locations).set({ activationCode: code }).where(eq(locations.id, storeId));
  return code;
}

/** Get-or-create an explicitly-added station's (POS #2, #3, …) activation code. */
export async function ensureRegisterActivationCode(registerId: number): Promise<string> {
  const [reg] = await db.select({ activationCode: registers.activationCode }).from(registers).where(eq(registers.id, registerId));
  if (reg?.activationCode) return reg.activationCode;
  const code = await generateUniqueCode();
  await db.update(registers).set({ activationCode: code }).where(eq(registers.id, registerId));
  return code;
}

export interface ActivationResolution {
  slug: string;
  /** 0 = the implicit default station. */
  registerId: number;
  storeName: string;
}

/** Resolves a device-pairing code to the store slug + register id it identifies. Checks the
 *  default-station code (on locations) first, then explicit stations (on registers). */
export async function resolveActivationCode(rawCode: string): Promise<ActivationResolution | null> {
  const code = rawCode.trim();
  if (!code) return null;

  const [loc] = await db.select({ slug: locations.bookingSlug, name: locations.name })
    .from(locations).where(eq(locations.activationCode, code));
  if (loc) {
    if (!loc.slug) return null;
    return { slug: loc.slug, registerId: 0, storeName: loc.name };
  }

  const [reg] = await db.select({ id: registers.id, storeId: registers.storeId })
    .from(registers).where(eq(registers.activationCode, code));
  if (!reg) return null;
  const [store] = await db.select({ slug: locations.bookingSlug, name: locations.name }).from(locations).where(eq(locations.id, reg.storeId));
  if (!store?.slug) return null;
  return { slug: store.slug, registerId: reg.id, storeName: store.name };
}
