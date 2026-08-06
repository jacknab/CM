import crypto from "crypto";
import type { Request, Response } from "express";
import { pool } from "../db";

const TOKEN_LENGTH = 32;
const SECRET_LENGTH = 12;
const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export type WebsiteBuilderCredentials = {
  storeid: string;
  token: string;
  secret: string;
};

let credentialColumnsReady: Promise<void> | null = null;

function randomAlphanumeric(length: number): string {
  const bytes = crypto.randomBytes(length);
  let value = "";
  for (const byte of bytes) {
    value += ALPHANUMERIC[byte % ALPHANUMERIC.length];
  }
  return value;
}

export function ensureWebsiteBuilderCredentialColumns(): Promise<void> {
  credentialColumnsReady ??= pool
    .query(`
      ALTER TABLE locations
        ADD COLUMN IF NOT EXISTS website_builder_token TEXT,
        ADD COLUMN IF NOT EXISTS website_builder_secret TEXT;

      CREATE UNIQUE INDEX IF NOT EXISTS locations_website_builder_token_idx
        ON locations (website_builder_token)
        WHERE website_builder_token IS NOT NULL;
    `)
    .then(() => undefined);

  return credentialColumnsReady;
}

export async function getOrCreateWebsiteBuilderCredentials(storeId: number): Promise<WebsiteBuilderCredentials | null> {
  await ensureWebsiteBuilderCredentialColumns();

  const existing = await pool.query<{
    id: number;
    website_builder_token: string | null;
    website_builder_secret: string | null;
  }>(
    `
      SELECT id, website_builder_token, website_builder_secret
      FROM locations
      WHERE id = $1
      LIMIT 1
    `,
    [storeId],
  );

  const row = existing.rows[0];
  if (!row) return null;

  if (row.website_builder_token && row.website_builder_secret) {
    return {
      storeid: String(row.id),
      token: row.website_builder_token,
      secret: row.website_builder_secret,
    };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = randomAlphanumeric(TOKEN_LENGTH);
    const secret = randomAlphanumeric(SECRET_LENGTH);

    try {
      const updated = await pool.query<{
        id: number;
        website_builder_token: string;
        website_builder_secret: string;
      }>(
        `
          UPDATE locations
          SET website_builder_token = $2,
              website_builder_secret = $3
          WHERE id = $1
          RETURNING id, website_builder_token, website_builder_secret
        `,
        [storeId, token, secret],
      );

      const updatedRow = updated.rows[0];
      if (!updatedRow) return null;
      return {
        storeid: String(updatedRow.id),
        token: updatedRow.website_builder_token,
        secret: updatedRow.website_builder_secret,
      };
    } catch (error: any) {
      if (error?.code !== "23505") throw error;
    }
  }

  throw new Error("Unable to generate unique website builder credentials");
}

export async function resolveWebsiteBuilderCredentials(
  token: string | null | undefined,
  secret: string | null | undefined,
): Promise<WebsiteBuilderCredentials | null> {
  if (!token || !secret) return null;

  await ensureWebsiteBuilderCredentialColumns();

  const result = await pool.query<{
    id: number;
    website_builder_token: string;
    website_builder_secret: string;
  }>(
    `
      SELECT id, website_builder_token, website_builder_secret
      FROM locations
      WHERE website_builder_token = $1
        AND website_builder_secret = $2
      LIMIT 1
    `,
    [token, secret],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    storeid: String(row.id),
    token: row.website_builder_token,
    secret: row.website_builder_secret,
  };
}

export async function backfillWebsiteBuilderCredentials(): Promise<number> {
  await ensureWebsiteBuilderCredentialColumns();

  const result = await pool.query<{ id: number }>(`
    SELECT id
    FROM locations
    WHERE website_builder_token IS NULL
       OR website_builder_secret IS NULL
  `);

  for (const row of result.rows) {
    await getOrCreateWebsiteBuilderCredentials(row.id);
  }

  return result.rowCount ?? result.rows.length;
}

export function getBuilderCredentialInput(req: Request): { token?: string; secret?: string } {
  const token =
    req.get("x-website-builder-token") ??
    (req.query.builderToken as string | undefined) ??
    (req.body as Record<string, unknown> | undefined)?.builderToken;
  const secret =
    req.get("x-website-builder-secret") ??
    (req.query.builderSecret as string | undefined) ??
    (req.body as Record<string, unknown> | undefined)?.builderSecret;

  return {
    token: typeof token === "string" ? token : undefined,
    secret: typeof secret === "string" ? secret : undefined,
  };
}

export async function requireWebsiteBuilderStoreAccess(
  req: Request,
  res: Response,
  storeid: string | null | undefined,
): Promise<boolean> {
  if (!storeid) {
    res.status(400).json({ error: "storeid is required" });
    return false;
  }

  const { token, secret } = getBuilderCredentialInput(req);
  const credentials = await resolveWebsiteBuilderCredentials(token, secret);

  if (!credentials || credentials.storeid !== String(storeid)) {
    res.status(401).json({ error: "Invalid website builder credentials" });
    return false;
  }

  return true;
}
