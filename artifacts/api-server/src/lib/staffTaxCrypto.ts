/**
 * Encryption for staff tax identifiers (Social Security / EIN numbers, I-9 document numbers) — AES-256-GCM.
 *
 * Key: STAFF_TAX_ENCRYPTION_KEY in /etc/certxa.env, 64 hex characters (32 bytes). Losing the key means the stored
 * numbers can no longer be read, so it must be backed up with the env file.
 *
 * Fails closed: with no valid key, encrypt() throws and nothing is saved — a tax number is never stored in plain text.
 * Stored form: "v1:" + base64(iv[12] | tag[16] | ciphertext).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env.STAFF_TAX_ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("Tax ID storage is not set up on this server (STAFF_TAX_ENCRYPTION_KEY).");
  }
  return Buffer.from(raw, "hex");
}

export function encryptTaxValue(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptTaxValue(stored: string): string {
  if (!stored.startsWith("v1:")) throw new Error("Unknown tax value format");
  const buf = Buffer.from(stored.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export const taxStorageReady = (): boolean => /^[0-9a-fA-F]{64}$/.test(process.env.STAFF_TAX_ENCRYPTION_KEY ?? "");
