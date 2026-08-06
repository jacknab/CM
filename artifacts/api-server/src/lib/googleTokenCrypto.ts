/**
 * AES-256-GCM application-level encryption for stored Google OAuth tokens.
 *
 * Key requirements:
 *  - GOOGLE_TOKEN_ENCRYPTION_KEY env var: 64 hex chars (= 32 bytes)
 *  - Never committed to source control, never logged
 *
 * Backwards compatibility:
 *  - Encrypted values are prefixed with "enc:" so legacy plaintext tokens
 *    are detected and returned as-is; they will be encrypted on next write.
 *  - If GOOGLE_TOKEN_ENCRYPTION_KEY is absent, values pass through unchanged
 *    so the system degrades gracefully rather than breaking.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO       = "aes-256-gcm";
const ENC_PREFIX = "enc:";

function getKey(): Buffer | null {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    // Warn once per process start is handled at startup; silent here to avoid log spam.
    return null;
  }
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    console.warn(
      "[GoogleTokenCrypto] GOOGLE_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). " +
      "Token encryption is disabled until the key is corrected.",
    );
    return null;
  }
  return buf;
}

/**
 * Encrypt a Google OAuth token value with AES-256-GCM.
 *
 * Returns null if the input is null/undefined.
 * Returns the plaintext unchanged if GOOGLE_TOKEN_ENCRYPTION_KEY is not configured
 * (so the system degrades gracefully instead of failing).
 *
 * Output format: enc:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptToken(value: string | null | undefined): string | null {
  if (value == null) return null;
  const key = getKey();
  if (!key) return value; // no key — store as plaintext (degraded mode)
  try {
    const iv         = randomBytes(12); // 96-bit IV — recommended for GCM
    const cipher     = createCipheriv(ALGO, key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const authTag    = cipher.getAuthTag();
    return `${ENC_PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
  } catch {
    // Never log the plaintext value
    console.error("[GoogleTokenCrypto] Encryption failed — falling back to plaintext storage");
    return value;
  }
}

/**
 * Decrypt a Google OAuth token value.
 *
 * - Values prefixed with "enc:" are decrypted with AES-256-GCM.
 * - All other values are treated as legacy plaintext and returned as-is.
 *   They will be encrypted automatically on the next write (lazy migration).
 *
 * Returns null on decryption failure (fail-safe) and logs a generic error.
 * Never logs the token value, ciphertext, or key.
 */
export function decryptToken(value: string | null | undefined): string | null {
  if (value == null) return null;

  // Legacy plaintext — return unchanged; encrypted on next write.
  if (!value.startsWith(ENC_PREFIX)) return value;

  const key = getKey();
  if (!key) {
    console.error(
      "[GoogleTokenCrypto] Encountered an encrypted token but GOOGLE_TOKEN_ENCRYPTION_KEY is not set. " +
      "Cannot decrypt — returning null. Re-authenticate to restore access.",
    );
    return null;
  }

  try {
    const rest  = value.slice(ENC_PREFIX.length);
    const parts = rest.split(":");
    if (parts.length !== 3) throw new Error("Unexpected ciphertext format");
    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv         = Buffer.from(ivHex,         "hex");
    const authTag    = Buffer.from(authTagHex,    "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");
    const decipher   = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Never log the ciphertext or key
    console.error("[GoogleTokenCrypto] Decryption failed for an encrypted token — returning null (fail-safe)");
    return null;
  }
}

/**
 * Returns true if the value has already been encrypted by this utility.
 */
export function isEncryptedToken(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}
