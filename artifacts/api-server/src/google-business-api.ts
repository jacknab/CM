import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { db } from "./db";
import { recordQuota429, isQuotaCoolingDown } from "./google-quota-guard";
import { encryptToken, decryptToken } from "./lib/googleTokenCrypto";
import {
  googleBusinessProfiles,
  googleBusinessAccounts,
  googleBusinessLocations,
  googleBusinessSyncLogs,
  googleReviews,
  googleReviewResponses,
  googleServiceSyncSettings,
  locations,
  businessHours,
  services,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * Returns the correct Google Business OAuth redirect URI for the current environment.
 *
 * Priority:
 *  1. GOOGLE_BUSINESS_CALLBACK_URL — explicitly configured (all environments)
 *  2. REPLIT_DEV_DOMAIN             — auto-derived from Replit's dev proxy domain
 *  3. Production certxa.com fallback
 */
export function getGoogleBusinessCallbackUrl(): string {
  if (process.env.GOOGLE_BUSINESS_CALLBACK_URL) {
    return process.env.GOOGLE_BUSINESS_CALLBACK_URL;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}/api/google-business/callback`;
  }
  return "https://certxa.com/api/google-business/callback";
}

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleReviewData {
  name: string;
  reviewer: {
    displayName: string;
    profilePhotoUrl?: string;
  };
  starRating?: string; // "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE"
  rating?: number;
  comment?: string;
  reviewText?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: {
    comment: string;
    updateTime: string;
  };
  publisherResponse?: {
    comment: string;
    updateTime: string;
  };
  reviewMediaItems?: Array<Record<string, unknown>>;
  reviewReplyUrl?: string;
}

/** Convert "FIVE" / 5 to numeric 5 */
function normalizeStarRating(rating: string | number | undefined): number {
  if (typeof rating === "number") return Math.min(5, Math.max(1, rating));
  const map: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return map[rating ?? ""] ?? 0;
}

export class GoogleBusinessAPIManager {
  private oauth2Client: OAuth2Client;

  constructor(config: GoogleAuthConfig) {
    this.oauth2Client = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      config.redirectUri,
    );
  }

  /**
   * Generate the Google OAuth consent URL.
   * Scope: business.manage ONLY — never mixes login scopes.
   * include_granted_scopes is intentionally false to prevent scope bleed
   * from any other OAuth session the user may have.
   */
  getAuthUrl(
    scopes: string[] = ["https://www.googleapis.com/auth/business.manage"],
    state?: string,
  ): string {
    console.log("[Google Business OAuth] getAuthUrl — scopes:", scopes.join(", "));
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent",             // always show consent to get a fresh refresh_token
      include_granted_scopes: false, // do NOT merge with previously granted scopes
      state,
    });
  }

  /** Exchange an authorization code for access + refresh tokens. */
  async getTokensFromCode(code: string) {
    console.log("[Google Business OAuth] getTokensFromCode — exchanging authorization code…");
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    console.log("[Google Business OAuth] getTokensFromCode — access_token:", tokens.access_token ? "(obtained)" : "(MISSING)");
    console.log("[Google Business OAuth] getTokensFromCode — refresh_token:", tokens.refresh_token ? "(obtained)" : "(none — may need prompt=consent)");
    console.log("[Google Business OAuth] getTokensFromCode — scope:", tokens.scope ?? "(none)");
    console.log("[Google Business OAuth] getTokensFromCode — expiry:", tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : "(none)");
    return tokens;
  }

  /** Set stored credentials — used when rehydrating from the database. */
  setCredentials(tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  }) {
    this.oauth2Client.setCredentials(tokens);
  }

  /**
   * Register a callback that fires whenever the OAuth2Client auto-refreshes
   * the access token. Use this to persist the new token back to the database.
   */
  onTokenRefresh(
    callback: (tokens: { access_token?: string | null; expiry_date?: number | null }) => Promise<void>,
  ): void {
    this.oauth2Client.on("tokens", (tokens) => {
      console.log("[Google Business OAuth] Token auto-refreshed by OAuth2Client");
      console.log("[Google Business OAuth]   new access_token:", tokens.access_token ? "(present)" : "(missing)");
      console.log("[Google Business OAuth]   new expiry:", tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : "(none)");
      callback(tokens).catch((err) =>
        console.error("[Google Business OAuth] Failed to persist refreshed token to DB:", err),
      );
    });
  }

  /**
   * Attempt to fetch the Google account email from the userinfo endpoint.
   * This requires openid/email scope. With business.manage-only tokens it will
   * fail — that is expected and handled gracefully (returns null).
   */
  async getGoogleUserInfo(): Promise<{ email: string; name: string } | null> {
    try {
      const oauth2 = google.oauth2({ version: "v2", auth: this.oauth2Client });
      const { data } = await oauth2.userinfo.get();
      console.log("[Google Business OAuth] getGoogleUserInfo — email:", data.email ?? "(none)");
      return { email: data.email ?? "", name: data.name ?? "" };
    } catch (error: any) {
      const status = error?.code ?? error?.response?.status ?? error?.status;
      // 403 is expected when the token only has business.manage scope (no openid/email scope)
      console.warn(
        `[Google Business OAuth] getGoogleUserInfo — skipped (status ${status ?? "unknown"}). ` +
        "This is expected with business.manage-only tokens. googleAccountEmail will be stored as null.",
      );
      return null;
    }
  }

  /**
   * List Google Business accounts for the authenticated user.
   * API: mybusinessaccountmanagement v1 — accounts.list
   *
   * Retries on 429 with exponential backoff: 5 s → 10 s → 20 s (3 attempts total).
   */
  async getBusinessAccounts(maxAttempts = 3): Promise<any> {
    // Respect global quota cooldown — don't even attempt if we're cooling down
    const cooldown = isQuotaCoolingDown();
    if (cooldown.coolingDown) {
      const secs = Math.ceil(cooldown.retryAfterMs / 1000);
      console.warn(`[Google Business OAuth] getBusinessAccounts — skipped: quota cooldown active, ${secs}s remaining`);
      const err: any = new Error(`Google API quota cooldown active. Please wait ${secs} seconds before retrying.`);
      err.code = 429;
      err.quotaCooldown = true;
      err.retryAfterMs = cooldown.retryAfterMs;
      throw err;
    }

    console.log("[Google Business OAuth] getBusinessAccounts — calling mybusinessaccountmanagement v1 accounts.list");
    const service = google.mybusinessaccountmanagement({ version: "v1", auth: this.oauth2Client });

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await service.accounts.list({});
        const data = response.data;
        const accounts: any[] = data.accounts ?? [];
        console.log(`[Google Business OAuth] getBusinessAccounts — accounts found: ${accounts.length}`);
        accounts.forEach((a: any, i: number) => {
          console.log(
            `[Google Business OAuth]   [${i}] name="${a.name}"` +
            `  accountName="${a.accountName ?? "(none)"}` +
            `  type="${a.type ?? "(none)"}"`,
          );
        });
        if (accounts.length === 0) {
          console.warn(
            "[Google Business OAuth] getBusinessAccounts — ZERO accounts returned. " +
            "The user needs to create a Business Profile at business.google.com.",
          );
        }
        return data;
      } catch (error: any) {
        // Re-throw cooldown errors immediately without retrying
        if (error?.quotaCooldown) throw error;

        const status = error?.code ?? error?.response?.status ?? error?.status;
        const msg = error?.message ?? String(error);
        const body = error?.response?.data ? JSON.stringify(error.response.data).slice(0, 400) : "(no body)";
        console.error(`[Google Business OAuth] getBusinessAccounts FAILED — attempt ${attempt + 1}/${maxAttempts} — status: ${status}  message: ${msg}`);
        console.error(`[Google Business OAuth] getBusinessAccounts FAILED — response body: ${body}`);

        if (status === 429) {
          // Record in the quota guard — classifies & persists cooldown to disk
          recordQuota429(error);
          if (attempt < maxAttempts - 1) {
            // One short wait then let the guard block further attempts
            console.warn(`[Google Business OAuth] getBusinessAccounts — 429 quota exceeded, waiting 3s before attempt ${attempt + 2}/${maxAttempts}`);
            await new Promise<void>((r) => setTimeout(r, 3_000));
            continue;
          }
        }
        if (status === 403) {
          console.error(
            "[Google Business OAuth] 403: Ensure 'My Business Account Management API' is enabled " +
            "in Google Cloud Console and the business.manage scope is on the OAuth consent screen.",
          );
        }
        throw error;
      }
    }
    return { accounts: [] };
  }

  /**
   * List locations for a given business account.
   * API: mybusinessbusinessinformation v1 — accounts.locations.list
   *
   * Retries on 429 with exponential backoff: 5 s → 10 s → 20 s (3 attempts total).
   */
  async getLocations(accountName: string, maxAttempts = 3): Promise<any> {
    console.log(`[Google Business OAuth] getLocations — account: ${accountName}`);
    const service = google.mybusinessbusinessinformation({ version: "v1", auth: this.oauth2Client });
    const rateLimitDelays = [5_000, 10_000, 20_000];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await service.accounts.locations.list({
          parent: accountName,
          readMask: "name,title,storeCode,storefrontAddress,phoneNumbers,websiteUri",
        } as any);
        const data = response.data;
        const locs: any[] = data.locations ?? [];
        console.log(`[Google Business OAuth] getLocations — raw response (first 500 chars): ${JSON.stringify(data).slice(0, 500)}`);
        console.log(`[Google Business OAuth] getLocations — locations found: ${locs.length}`);
        locs.forEach((l: any, i: number) => {
          console.log(
            `[Google Business OAuth]   [${i}] name="${l.name}"` +
            `  title="${l.title ?? "(none)"}"` +
            `  storeCode="${l.storeCode ?? "(none)"}"`,
          );
          if (l.storefrontAddress) {
            console.log(`[Google Business OAuth]       address: ${JSON.stringify(l.storefrontAddress)}`);
          }
        });
        if (locs.length === 0) {
          console.warn(
            `[Google Business OAuth] getLocations — ZERO locations returned for account ${accountName}. ` +
            "The account may have no verified locations in Google Business Profile.",
          );
        }
        return data;
      } catch (error: any) {
        const status = error?.code ?? error?.response?.status ?? error?.status;
        const msg = error?.message ?? String(error);
        console.error(`[Google Business OAuth] getLocations FAILED — attempt ${attempt + 1}/${maxAttempts} — status: ${status}  message: ${msg}`);

        if (status === 429 && attempt < maxAttempts - 1) {
          const delay = rateLimitDelays[attempt] ?? 20_000;
          console.warn(`[Google Business OAuth] getLocations — 429 quota exceeded, waiting ${delay}ms before retry ${attempt + 2}/${maxAttempts}`);
          await new Promise<void>((r) => setTimeout(r, delay));
          continue;
        }
        if (status === 403) {
          console.error("[Google Business OAuth] 403: Ensure 'Business Profile API' is enabled in Google Cloud Console and the business.manage scope is approved.");
        }
        if (status === 404) {
          console.error(`[Google Business OAuth] 404: Account "${accountName}" not found or this token does not have access to it.`);
        }
        throw error;
      }
    }
    return { locations: [] };
  }

  /**
   * Get reviews for a specific location.
   *
   * Uses mybusinessreviews.googleapis.com/v1/ — the current Business Profile API.
   * The deprecated mybusiness.googleapis.com/v4/ ("Google My Business API") is no
   * longer used — all review calls now go to mybusinessreviews.googleapis.com/v1/.
   *
   * Uses direct fetch() to bypass the googleapis library's /code/ service-path
   * prefix that corrupts URL-based oauth2Client.request() calls.
   */
  async getReviews(locationName: string): Promise<GoogleReviewData[]> {
    // Use the full location resource when available:
    //   accounts/{accountId}/locations/{locationId}
    // Falling back to the provided value keeps compatibility with legacy rows.
    const normalizedLocationName = String(locationName || "").trim();
    const leafLocationName = normalizedLocationName.match(/locations\/[^/]+$/)?.[0] ?? normalizedLocationName;
    const candidateUrls = Array.from(new Set([
      `https://mybusinessreviews.googleapis.com/v1/${normalizedLocationName}/reviews?pageSize=50`,
      `https://mybusinessreviews.googleapis.com/v1/${leafLocationName}/reviews?pageSize=50`,
      `https://mybusiness.googleapis.com/v4/${normalizedLocationName}/reviews?pageSize=50`,
    ]));

    console.log(`[Google Business OAuth] getReviews — location: ${normalizedLocationName}`);
    console.log(`[Google Business OAuth] getReviews — candidate URLs: ${candidateUrls.join(" | ")}`);
    try {
      const tokenResp = await this.oauth2Client.getAccessToken();
      const accessToken = tokenResp.token;
      if (!accessToken) throw new Error("Could not obtain Google access token");

      let responseText = "";
      let successfulUrl = "";
      let lastErr: any = null;

      for (const url of candidateUrls) {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        responseText = await res.text();

        if (!res.ok) {
          const err: any = new Error(`HTTP ${res.status}: ${responseText.slice(0, 300)}`);
          err.status = res.status;
          err.responseBody = responseText;
          err.requestUrl = url;
          lastErr = err;
          if (res.status === 403 || res.status === 404) continue;
          throw err;
        }

        successfulUrl = url;
        lastErr = null;
        break;
      }

      if (lastErr) throw lastErr;

      let data: { reviews?: GoogleReviewData[]; totalReviewCount?: number; averageRating?: number };
      try { data = JSON.parse(responseText); } catch { data = {}; }

      const reviews = data.reviews ?? [];
      if (successfulUrl) {
        console.log(`[Google Business OAuth] getReviews — succeeded with URL: ${successfulUrl}`);
      }
      console.log(`[Google Business OAuth] getReviews — totalReviewCount: ${data.totalReviewCount ?? "(not returned)"}`);
      console.log(`[Google Business OAuth] getReviews — averageRating: ${data.averageRating ?? "(not returned)"}`);
      console.log(`[Google Business OAuth] getReviews — reviews in this page: ${reviews.length}`);
      if (reviews.length === 0) {
        console.warn(
          `[Google Business OAuth] getReviews — ZERO reviews for location "${normalizedLocationName}". ` +
          "The location may have no reviews, or the API scope does not include review access.",
        );
        console.warn(`[Google Business OAuth] getReviews — raw response: ${responseText.slice(0, 300)}`);
      } else {
        reviews.slice(0, 3).forEach((r: any, i: number) => {
          console.log(
            `[Google Business OAuth]   [${i}] reviewId="${r.name}"` +
            `  rating="${r.starRating ?? r.rating}"` +
            `  reviewer="${r.reviewer?.displayName ?? "(none)"}"`,
          );
        });
      }
      return reviews;
    } catch (error: any) {
      const status = error?.status ?? error?.code ?? error?.response?.status;
      const msg = error?.message ?? String(error);
      const body = error?.responseBody ?? (error?.response?.data ? JSON.stringify(error.response.data).slice(0, 400) : "(no body)");
      const requestUrl = error?.requestUrl ?? "(unknown)";
      console.error(`[Google Business OAuth] getReviews FAILED — location: ${normalizedLocationName}`);
      console.error(`[Google Business OAuth] getReviews FAILED — status: ${status}  message: ${msg}`);
      console.error(`[Google Business OAuth] getReviews FAILED — requestUrl: ${requestUrl}`);
      console.error(`[Google Business OAuth] getReviews FAILED — response body: ${body}`);
      if (status === 403) {
        console.error("[Google Business OAuth] 403: Ensure 'Business Profile API' (mybusinessreviews) is enabled and business.manage scope is approved.");
      }
      if (status === 404) {
        console.error(
            `[Google Business OAuth] 404: Location "${normalizedLocationName}" not found on mybusinessreviews v1. ` +
            "Resource name may be stale or inaccessible to this account.",
        );
      }
      throw error;
    }
  }

  /**
   * Post or update a reply to a review.
   * PUT https://mybusinessreviews.googleapis.com/v1/{name}/reply
   *
   * The review name is normalised to "locations/{id}/reviews/{id}" — strips any
   * leading "accounts/{id}/" prefix that may be stored from the legacy v4 sync.
   */
  async replyToReview(reviewName: string, comment: string): Promise<any> {
    // mybusinessreviews.googleapis.com/v1 requires the FULL resource name:
    //   accounts/{accountId}/locations/{locationId}/reviews/{reviewId}
    // Do NOT strip the "accounts/{id}/" prefix — without it Google returns an HTML 404
    // page (not a JSON API error) because the URL matches no valid API route.
    const normalizedReviewName = String(reviewName || "").trim();
    const url = `https://mybusinessreviews.googleapis.com/v1/${normalizedReviewName}/reply`;
    console.log(`[Google Business OAuth] replyToReview — reviewName: ${normalizedReviewName}`);
    try {
      const tokenResp = await this.oauth2Client.getAccessToken();
      const accessToken = tokenResp.token;
      if (!accessToken) throw new Error("Could not obtain Google access token");

      const res = await fetch(url, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      const responseText = await res.text();
      if (!res.ok) {
        const err: any = new Error(`HTTP ${res.status}: ${responseText.slice(0, 300)}`);
        err.status = res.status;
        throw err;
      }
      console.log(`[Google Business OAuth] replyToReview — success`);
      try { return JSON.parse(responseText); } catch { return responseText; }
    } catch (error) {
      console.error("[Google Business OAuth] replyToReview FAILED:", error);
      throw error;
    }
  }

  /**
   * Delete an existing reply from a review.
   * DELETE https://mybusinessreviews.googleapis.com/v1/{name}/reply
   */
  async deleteReviewReply(reviewName: string): Promise<any> {
    const normalizedReviewName = String(reviewName || "").trim();
    const url = `https://mybusinessreviews.googleapis.com/v1/${normalizedReviewName}/reply`;
    console.log(`[Google Business OAuth] deleteReviewReply — reviewName: ${normalizedReviewName}`);
    try {
      const tokenResp = await this.oauth2Client.getAccessToken();
      const accessToken = tokenResp.token;
      if (!accessToken) throw new Error("Could not obtain Google access token");

      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.text();
        const err: any = new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
        err.status = res.status;
        throw err;
      }
      return {};
    } catch (error) {
      console.error("[Google Business OAuth] deleteReviewReply FAILED:", error);
      throw error;
    }
  }

  /**
   * Fetch full listing details for a specific location.
   * Uses the mybusinessbusinessinformation v1 GET endpoint with an extended
   * readMask so we can see what Google already has (hours, services, description,
   * booking URL, categories) before deciding what to fill in.
   *
   * locationResourceName: either "accounts/{id}/locations/{id}" or "locations/{id}"
   */
  async getLocationDetails(locationResourceName: string): Promise<any> {
    let leafName = locationResourceName;
    const fullMatch = locationResourceName.match(/^accounts\/[^/]+\/(locations\/[^/]+)$/);
    if (fullMatch) leafName = fullMatch[1];

    const readMask = [
      "name",
      "title",
      "websiteUri",
      "regularHours",
      "serviceItems",
      "profile",
      "categories",
    ].join(",");

    const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${leafName}?readMask=${encodeURIComponent(readMask)}`;
    console.log(`[GBP Audit] GET ${url}`);

    const tokenResp = await this.oauth2Client.getAccessToken();
    const accessToken = tokenResp.token;
    if (!accessToken) throw new Error("getLocationDetails: could not obtain access token");

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const responseText = await res.text();
    if (!res.ok) {
      const err: any = new Error(`getLocationDetails failed (${res.status}): ${responseText.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }

    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  }

  /**
   * Revoke the stored OAuth access token at Google.
   * Called on disconnect — errors are swallowed so local cleanup still proceeds.
   */
  async revokeTokens(): Promise<void> {
    try {
      const accessToken = this.oauth2Client.credentials.access_token;
      if (accessToken) {
        await this.oauth2Client.revokeToken(accessToken);
        console.log("[Google Business OAuth] Token revoked at Google");
      }
    } catch (error) {
      console.warn("[Google Business OAuth] Could not revoke token (may already be expired):", error);
    }
  }
}

/**
 * Build an authenticated GoogleBusinessAPIManager from a stored profile row.
 *
 * Credentials: GOOGLE_BUSINESS_* env vars ONLY (falls back to legacy GOOGLE_CLIENT_* if not set).
 * Token refresh: hooks up an event listener that persists refreshed tokens to the DB automatically,
 * so the stored token stays valid across server restarts without re-authenticating.
 */
export function createApiManagerFromProfile(profile: {
  id: number;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}): GoogleBusinessAPIManager {
  const manager = new GoogleBusinessAPIManager({
    clientId:     process.env.GOOGLE_BUSINESS_CLIENT_ID     ?? process.env.GOOGLE_CLIENT_ID     ?? "",
    clientSecret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri:  process.env.GOOGLE_BUSINESS_CALLBACK_URL ?? "https://certxa.com/api/google-business/callback",
  });

  manager.setCredentials({
    access_token:  decryptToken(profile.accessToken),
    refresh_token: decryptToken(profile.refreshToken),
    expiry_date:   profile.tokenExpiresAt?.getTime() ?? null,
  });

  // Persist auto-refreshed tokens back to the DB so they survive server restarts
  manager.onTokenRefresh(async (newTokens) => {
    console.log(`[Google Business OAuth] Persisting refreshed token for profile id=${profile.id}`);
    await db
      .update(googleBusinessProfiles)
      .set({
        accessToken:    encryptToken(newTokens.access_token) ?? undefined,
        tokenExpiresAt: newTokens.expiry_date ? new Date(newTokens.expiry_date) : undefined,
        updatedAt:      new Date(),
      })
      .where(eq(googleBusinessProfiles.id, profile.id));
  });

  return manager;
}

/**
 * Sync reviews from Google for a store and upsert into the local database.
 * Only syncs reviews for the selected location (locationResourceName).
 */
export async function syncGoogleReviews(
  storeId: number,
): Promise<{ synced: number; locationResourceName: string; businessName: string | null }> {
  console.log(`[Google Business OAuth] ── syncGoogleReviews START — storeId=${storeId} ──`);

  const profiles = await db
    .select()
    .from(googleBusinessProfiles)
    .where(eq(googleBusinessProfiles.storeId, storeId))
    .limit(1);

  if (!profiles.length) {
    console.error(`[Google Business OAuth] syncGoogleReviews — no profile row for storeId=${storeId}`);
    throw new Error("Google Business Profile not connected for this store");
  }

  const googleProfile = profiles[0];
  console.log(
    `[Google Business OAuth] syncGoogleReviews — profile id=${googleProfile.id}` +
    `  isConnected=${googleProfile.isConnected}` +
    `  businessName="${googleProfile.businessName ?? "(none)"}"` +
    `  locationResourceName="${googleProfile.locationResourceName ?? "(none)"}"`,
  );
  console.log(
    `[Google Business OAuth] syncGoogleReviews —` +
    `  accessToken: ${googleProfile.accessToken ? "present" : "MISSING"}` +
    `  refreshToken: ${googleProfile.refreshToken ? "present" : "MISSING"}` +
    `  tokenExpiresAt: ${googleProfile.tokenExpiresAt?.toISOString() ?? "(none)"}`,
  );

  if (!googleProfile.locationResourceName) {
    console.error(`[Google Business OAuth] syncGoogleReviews — locationResourceName is NULL for storeId=${storeId}. User must select a location first.`);
    throw new Error("No location connected. Please reconnect your Google Business Profile and select a location.");
  }

  if (!googleProfile.accessToken && !googleProfile.refreshToken) {
    console.error(`[Google Business OAuth] syncGoogleReviews — no tokens for storeId=${storeId}. Re-authentication required.`);
    throw new Error("Google access token missing. Please reconnect your Google Business Profile.");
  }

  const apiManager = createApiManagerFromProfile(googleProfile);

  // ── Resolve the proper googleBusinessLocations row (for FK tagging + sync log) ──────────
  // This row exists if the user connected via the new flow. Null is safe for legacy profiles.
  let gbLocationRow: { id: number; locationId: string } | null = null;
  try {
    const locRows = await db
      .select({ id: googleBusinessLocations.id, locationId: googleBusinessLocations.locationId })
      .from(googleBusinessLocations)
      .where(eq(googleBusinessLocations.locationResourceName, googleProfile.locationResourceName!))
      .limit(1);
    if (locRows.length) {
      gbLocationRow = locRows[0];
      console.log(`[Google Business OAuth] syncGoogleReviews — matched googleBusinessLocations id=${gbLocationRow.id}`);
    } else {
      console.log(`[Google Business OAuth] syncGoogleReviews — no googleBusinessLocations row yet for "${googleProfile.locationResourceName}" (legacy profile — will sync without FK tag)`);
    }
  } catch (e) {
    console.warn("[Google Business OAuth] syncGoogleReviews — could not resolve googleBusinessLocations:", e);
  }

  console.log(`[Google Business OAuth] syncGoogleReviews — calling getReviews for: ${googleProfile.locationResourceName}`);
  let reviews: Awaited<ReturnType<typeof apiManager.getReviews>> = [];
  let syncError: string | null = null;

  try {
    reviews = await apiManager.getReviews(googleProfile.locationResourceName!);
    console.log(`[Google Business OAuth] syncGoogleReviews — getReviews returned ${reviews.length} review(s)`);
  } catch (err: any) {
    syncError = err?.message ?? String(err);
    // Write failure sync log before re-throwing
    await db.insert(googleBusinessSyncLogs).values({
      storeId,
      locationId: gbLocationRow?.id ?? null,
      syncType:   "reviews",
      status:     "failed",
      errorMessage: syncError,
    }).catch(() => {});
    throw err;
  }

  let insertedCount = 0;
  let updatedCount = 0;

  for (const review of reviews) {
    const googleReviewId = review.name.split("/").pop() ?? review.name;
    const rating = normalizeStarRating((review as any).starRating ?? (review as any).rating);
    const reviewText = review.comment ?? (review as any).reviewText;
    const hasReply = !!(review.reviewReply ?? review.publisherResponse);
    const reviewMediaItems = Array.isArray(review.reviewMediaItems) ? review.reviewMediaItems : [];
    const reviewImageUrls = reviewMediaItems
      .map((item) => typeof item.thumbnailUrl === "string" ? item.thumbnailUrl : null)
      .filter((url): url is string => Boolean(url));
    const ownerReply = review.reviewReply ?? review.publisherResponse ?? null;

    console.log(
      `[Google Business OAuth] syncGoogleReviews —` +
      `  review="${googleReviewId}"  rating=${rating}` +
      `  reviewer="${review.reviewer?.displayName ?? "Anonymous"}"` +
      `  hasReply=${hasReply}`,
    );

    const existing = await db
      .select()
      .from(googleReviews)
      .where(eq(googleReviews.googleReviewId, googleReviewId))
      .limit(1);

    if (!existing.length) {
      await db.insert(googleReviews).values({
        storeId,
        googleReviewId,
        googleLocationId:     googleProfile.locationId,
        gbLocationId:         gbLocationRow?.id ?? null,  // proper FK to googleBusinessLocations
        customerName:         review.reviewer?.displayName ?? "Anonymous",
        rating,
        reviewText,
        reviewImageUrls:      JSON.stringify(reviewImageUrls),
        reviewerPhotoUrl:     review.reviewer?.profilePhotoUrl ?? null,
        googleReviewResourceName: review.name,
        reviewMediaItems,
        ownerReply,
        reviewReplyUrl:       review.reviewReplyUrl ?? null,
        reviewCreateTime:     review.createTime ? new Date(review.createTime) : null,
        reviewUpdateTime:     review.updateTime ? new Date(review.updateTime) : null,
        reviewerLanguageCode: "en",
        responseStatus:       hasReply ? "responded" : "not_responded",
      });
      insertedCount++;
    } else {
      // Update existing review — also set gbLocationId if it wasn't set before
      await db
        .update(googleReviews)
        .set({
          reviewText,
          customerName:       review.reviewer?.displayName ?? "Anonymous",
          reviewImageUrls:    JSON.stringify(reviewImageUrls),
          reviewerPhotoUrl:   review.reviewer?.profilePhotoUrl ?? null,
          googleReviewResourceName: review.name,
          reviewMediaItems,
          ownerReply,
          reviewReplyUrl:     review.reviewReplyUrl ?? null,
          responseStatus:   hasReply ? "responded" : "not_responded",
          reviewUpdateTime: review.updateTime ? new Date(review.updateTime) : null,
          gbLocationId:     existing[0].gbLocationId ?? gbLocationRow?.id ?? null,
          updatedAt:        new Date(),
        })
        .where(eq(googleReviews.googleReviewId, googleReviewId));
      updatedCount++;
    }
  }

  // ── Mark last synced in profile ──────────────────────────────────────────────
  await db
    .update(googleBusinessProfiles)
    .set({ lastSyncedAt: new Date() })
    .where(eq(googleBusinessProfiles.id, googleProfile.id));

  // ── Write success sync log ───────────────────────────────────────────────────
  await db.insert(googleBusinessSyncLogs).values({
    storeId,
    locationId:    gbLocationRow?.id ?? null,
    syncType:      "reviews",
    status:        "success",
    reviewsSynced: reviews.length,
  }).catch((e) => console.warn("[Google Business OAuth] syncGoogleReviews — could not write sync log:", e));

  console.log(
    `[Google Business OAuth] ── syncGoogleReviews DONE — storeId=${storeId}:` +
    ` ${reviews.length} total (${insertedCount} new, ${updatedCount} updated) ──`,
  );

  return {
    synced:               reviews.length,
    locationResourceName: googleProfile.locationResourceName!,
    businessName:         googleProfile.businessName,
  };
}

/**
 * Update listing fields on a Google Business Profile location.
 *
 * Uses direct fetch to mybusinessbusinessinformation.googleapis.com v1.
 * The googleapis oauth2Client.request() routes through an internal /code/ service
 * path that causes 404s — direct fetch bypasses this entirely.
 *
 * Supported fields:
 *   websiteUri   — the website / booking URL field on the listing
 *   regularHours — structured open/close periods per day
 *
 * NOTE: The v1 Business Information PATCH endpoint requires just "locations/{id}"
 * as the resource name — the "accounts/{id}/" prefix must be stripped.
 */
// ─────────────────────────────────────────────────────────────────────────────
// AUTH FAILURE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HTTP status codes and error message patterns that indicate a revoked /
 * expired OAuth grant — not a transient server error.
 * These should trigger a reconnect notification, not a retry.
 */
const AUTH_ERROR_PATTERNS = [
  /invalid_grant/i,
  /token has been expired or revoked/i,
  /invalid_client/i,
  /unauthorized_client/i,
  /access_denied/i,
  /token expired/i,
  /revoked/i,
  /could not obtain access token/i,
];

/**
 * Returns true when the error represents a permanent OAuth failure
 * (revoked grant, expired refresh token, etc.) rather than a transient one.
 */
export function isGBPAuthError(err: any): boolean {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  const description = String(err?.response?.data?.error_description ?? "").toLowerCase();
  const errorCode   = String(err?.response?.data?.error ?? err?.code ?? "").toLowerCase();
  const combined    = `${msg} ${description} ${errorCode}`;
  return AUTH_ERROR_PATTERNS.some((p) => p.test(combined));
}

/**
 * Marks a store's GBP connection as requiring reconnect in the database.
 * Idempotent — safe to call multiple times; only writes on the first failure.
 */
export async function markGBPAuthFailed(storeId: number, reason: string): Promise<void> {
  try {
    await db
      .update(googleBusinessProfiles)
      .set({
        reconnectRequired: true,
        authFailureAt:     new Date(),
        authFailureReason: reason.slice(0, 500),
        isConnected:       false,
        updatedAt:         new Date(),
      })
      .where(
        and(
          eq(googleBusinessProfiles.storeId, storeId),
          // Only write if not already flagged — avoids redundant writes on repeated failures
          eq(googleBusinessProfiles.reconnectRequired, false),
        ),
      );
    console.warn(`[GBP Auth] storeId=${storeId} marked reconnect_required — reason: ${reason}`);
  } catch (err: any) {
    console.error(`[GBP Auth] Failed to mark storeId=${storeId} as auth-failed:`, err?.message);
  }
}

/**
 * Clears the reconnect_required flag after a successful OAuth re-authorisation.
 * Called by the OAuth callback route after a new token is stored.
 */
export async function clearGBPAuthFailure(storeId: number): Promise<void> {
  try {
    await db
      .update(googleBusinessProfiles)
      .set({
        reconnectRequired: false,
        authFailureAt:     null,
        authFailureReason: null,
        isConnected:       true,
        updatedAt:         new Date(),
      })
      .where(eq(googleBusinessProfiles.storeId, storeId));
    console.log(`[GBP Auth] storeId=${storeId} auth failure cleared — reconnected`);
  } catch (err: any) {
    console.error(`[GBP Auth] Failed to clear auth failure for storeId=${storeId}:`, err?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RETRY HELPERS FOR PATCH OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** HTTP status codes that indicate a transient server-side problem — safe to retry. */
const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * Delays (in ms) between consecutive attempts.
 * attempt 1 → immediate
 * attempt 2 → wait 5 s
 * attempt 3 → wait 30 s
 * attempt 4 → wait 2 min
 */
const RETRY_DELAY_MS = [5_000, 30_000, 120_000];

/** Logging context passed by the worker so each retry log is fully attributable. */
export interface GBPPatchContext {
  storeId?: number;
  locationId?: string;   // leaf location resource name
  operation?: string;    // e.g. "sync_hours", "sync_description"
}

/**
 * PATCH one or more fields on a Google Business Profile location.
 *
 * Retry strategy (transient errors only — 429, 500, 502, 503, 504):
 *   Attempt 1 — immediate
 *   Attempt 2 — after 5 s
 *   Attempt 3 — after 30 s
 *   Attempt 4 — after 2 min
 *
 * Non-retryable errors (400, 401, 403, 404, …) are thrown immediately.
 * Auth errors (invalid_grant, revoked token) are re-thrown with an
 * `isAuthError: true` property so the caller can trigger reconnect flow.
 */
export async function updateListingFields(
  locationResourceName: string,
  payload: {
    websiteUri?: string;
    regularHours?: {
      periods: Array<{
        openDay: string;
        openTime: { hours: number; minutes: number };
        closeDay: string;
        closeTime: { hours: number; minutes: number };
      }>;
    };
    /** Business description — pushed under profile.description */
    profile?: { description: string };
    /** Service items (free-form or structured — passed as-is to Google) */
    serviceItems?: any[];
  },
  oauth2Client: OAuth2Client,
  context?: GBPPatchContext,
): Promise<any> {
  // Only include fields that are actually defined — avoids mask/body mismatches.
  const updateMask = (Object.keys(payload) as Array<keyof typeof payload>)
    .filter((k) => payload[k] !== undefined)
    .join(",");
  if (!updateMask) throw new Error("updateListingFields: no fields to update");

  // The mybusinessbusinessinformation v1 PATCH endpoint only accepts
  // "locations/{locationId}" — strip any leading "accounts/{id}/" prefix.
  let leafName: string;
  const fullMatch = locationResourceName.match(/^accounts\/[^/]+\/(locations\/[^/]+)$/);
  const leafMatch = locationResourceName.match(/^(locations\/[^/]+)$/);
  if (fullMatch) {
    leafName = fullMatch[1];
  } else if (leafMatch) {
    leafName = leafMatch[1];
  } else {
    throw new Error(
      `updateListingFields: invalid locationResourceName "${locationResourceName}". ` +
      `Expected "accounts/{id}/locations/{id}" or "locations/{id}".`,
    );
  }

  const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${leafName}?updateMask=${encodeURIComponent(updateMask)}`;
  const ctxLabel = `storeId=${context?.storeId ?? "?"} op=${context?.operation ?? updateMask} loc=${leafName}`;

  const MAX_ATTEMPTS = 4;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Obtain a fresh access token each attempt — handles mid-retry refresh.
    // Throws immediately if the refresh token itself is invalid (auth failure).
    let accessToken: string | null | undefined;
    try {
      const tokenResponse = await oauth2Client.getAccessToken();
      accessToken = tokenResponse.token;
    } catch (tokenErr: any) {
      // Tag and re-throw so the worker can trigger the reconnect flow
      tokenErr.isAuthError = true;
      throw tokenErr;
    }
    if (!accessToken) {
      const err: any = new Error("updateListingFields: could not obtain access token");
      err.isAuthError = true;
      throw err;
    }

    if (attempt === 1) {
      console.log(`[GBP Listing Sync] PATCH ${url}  [${ctxLabel}]`);
      if (payload.websiteUri)    console.log(`[GBP Listing Sync]   websiteUri: ${payload.websiteUri}`);
      if (payload.regularHours)  console.log(`[GBP Listing Sync]   regularHours: ${payload.regularHours.periods.length} period(s)`);
    }

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    // ── Success ────────────────────────────────────────────────────────────
    if (res.ok) {
      if (attempt > 1) {
        console.log(`[GBP Listing Sync] PATCH succeeded on attempt ${attempt}  [${ctxLabel}]`);
      } else {
        console.log(`[GBP Listing Sync] PATCH success — status ${res.status}  [${ctxLabel}]`);
      }
      const responseText = await res.text();
      try { return JSON.parse(responseText); } catch { return responseText; }
    }

    // ── Error ─────────────────────────────────────────────────────────────
    const status       = res.status;
    const responseText = await res.text().catch(() => "");

    // Non-retryable: validation errors, auth failures, permission denied, etc.
    if (!RETRYABLE_HTTP_STATUS.has(status)) {
      console.error(
        `[GBP Listing Sync] PATCH failed (non-retryable) — ` +
        `status: ${status}  [${ctxLabel}]  body: ${responseText.slice(0, 500)}`,
      );
      const err: any = new Error(`Google Business Profile PATCH failed (${status}): ${responseText.slice(0, 300)}`);
      err.status = status;
      // Tag 401/403 as auth errors so the caller can trigger reconnect flow
      if (status === 401 || status === 403) err.isAuthError = true;
      throw err;
    }

    // Record 429 in the quota guard
    if (status === 429) {
      recordQuota429({ status, message: `PATCH ${url} returned 429` });
    }

    // Out of retries — throw with full context
    if (attempt === MAX_ATTEMPTS) {
      console.error(
        `[GBP Listing Sync] PATCH failed after ${MAX_ATTEMPTS} attempts — ` +
        `status: ${status}  [${ctxLabel}]  body: ${responseText.slice(0, 500)}`,
      );
      const err: any = new Error(
        `Google Business Profile PATCH failed after ${MAX_ATTEMPTS} attempts (${status}): ${responseText.slice(0, 300)}`,
      );
      err.status = status;
      throw err;
    }

    // Schedule next retry
    const delayMs    = RETRY_DELAY_MS[attempt - 1];
    const retryNum   = attempt;        // "this was attempt N, retrying as attempt N+1"
    const totalRetries = MAX_ATTEMPTS - 1;
    console.warn(
      `[GBP Listing Sync] PATCH transient error — ` +
      `status: ${status}  retry ${retryNum}/${totalRetries} in ${delayMs / 1000}s  [${ctxLabel}]`,
    );
    await new Promise<void>((r) => setTimeout(r, delayMs));
  }

  // Should never reach here
  throw new Error("updateListingFields: retry loop exhausted unexpectedly");
}

// DB stores dayOfWeek using JS getDay() convention: 0=Sunday, 1=Monday … 6=Saturday
const GBP_DAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

/**
 * Sync the Certxa booking URL and business hours to the connected Google
 * Business Profile listing for a given store.
 *
 * What is synced:
 *  - websiteUri  → https://certxa.com/book/{bookingSlug}
 *  - regularHours → converted from the store's businessHours rows
 *
 * What is NOT synced:
 *  - Appointments, bookings, or any Google Reserve / booking-partner features
 *  - Services (future roadmap)
 */
export async function syncListingToGoogle(storeId: number): Promise<{
  bookingUrl: string;
  hoursSynced: number;
  locationResourceName: string;
}> {
  console.log(`[GBP Listing Sync] ── syncListingToGoogle START — storeId=${storeId} ──`);

  // ── 1. Load GBP profile ──────────────────────────────────────────────────
  const profiles = await db
    .select()
    .from(googleBusinessProfiles)
    .where(eq(googleBusinessProfiles.storeId, storeId))
    .limit(1);

  if (!profiles.length) throw new Error("Google Business Profile not connected for this store");
  const googleProfile = profiles[0];

  if (!googleProfile.locationResourceName) {
    throw new Error("No location connected. Please reconnect your Google Business Profile and select a location.");
  }
  if (!googleProfile.accessToken && !googleProfile.refreshToken) {
    throw new Error("Google access token missing. Please reconnect your Google Business Profile.");
  }

  // ── 2. Load store (booking slug) ─────────────────────────────────────────
  const storeRows = await db
    .select({ bookingSlug: locations.bookingSlug, name: locations.name })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);

  if (!storeRows.length) throw new Error("Store not found");
  const store = storeRows[0];

  if (!store.bookingSlug) {
    throw new Error("No booking slug set for this store. Add a booking slug in Settings before syncing.");
  }

  const bookingUrl = `https://certxa.com/book/${store.bookingSlug}`;
  console.log(`[GBP Listing Sync] bookingUrl: ${bookingUrl}`);

  // ── 3. Load business hours ───────────────────────────────────────────────
  const hoursRows = await db
    .select()
    .from(businessHours)
    .where(eq(businessHours.storeId, storeId));

  const openPeriods = hoursRows
    .filter(h => !h.isClosed)
    .map(h => {
      const [openHr, openMin] = h.openTime.split(":").map(Number);
      const [closeHr, closeMin] = h.closeTime.split(":").map(Number);
      const dayName = GBP_DAY_NAMES[h.dayOfWeek] ?? "MONDAY";
      return {
        openDay:   dayName,
        openTime:  { hours: openHr,   minutes: openMin  },
        closeDay:  dayName,
        closeTime: { hours: closeHr,  minutes: closeMin },
      };
    });

  console.log(`[GBP Listing Sync] hours: ${openPeriods.length} open period(s)`);

  // ── 4. Build patch payload ────────────────────────────────────────────────
  const patchPayload: Parameters<typeof updateListingFields>[1] = {
    websiteUri: bookingUrl,
    ...(openPeriods.length > 0 ? { regularHours: { periods: openPeriods } } : {}),
  };

  // ── 5. Auth and patch ────────────────────────────────────────────────────
  const apiManager = createApiManagerFromProfile(googleProfile);

  // Expose the internal oauth2Client so we can call updateListingFields
  // (we use the same token refresh hooks as the review sync path)
  const oauth2Client = (apiManager as any).oauth2Client as OAuth2Client;

  await updateListingFields(googleProfile.locationResourceName, patchPayload, oauth2Client);

  // ── 6. Persist sync metadata ─────────────────────────────────────────────
  await db
    .update(googleBusinessProfiles)
    .set({
      listingSyncedAt:   new Date(),
      listingBookingUrl: bookingUrl,
      updatedAt:         new Date(),
    })
    .where(eq(googleBusinessProfiles.id, googleProfile.id));

  // ── 7. Audit log ──────────────────────────────────────────────────────────
  await db.insert(googleBusinessSyncLogs).values({
    storeId,
    syncType: "listing",
    status:   "success",
    errorMessage: null,
  }).catch((e) => console.warn("[GBP Listing Sync] could not write sync log:", e));

  // ── 7. Also refresh the review link while we have active tokens ─────────────
  // Non-blocking — a failure here must not break the listing sync response.
  fetchAndStoreReviewLink(storeId).catch((e) =>
    console.warn("[GBP Listing Sync] review link refresh failed (non-fatal):", e?.message ?? e),
  );

  console.log(`[GBP Listing Sync] ── syncListingToGoogle DONE — storeId=${storeId} ──`);

  return {
    bookingUrl,
    hoursSynced:          openPeriods.length,
    locationResourceName: googleProfile.locationResourceName,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW LINK — fetch metadata.newReviewUri and persist to google_business_profiles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the direct "Write a review" URL from Google Business Profile metadata
 * and stores it in google_business_profiles.google_review_link.
 *
 * Google returns this as `metadata.newReviewUri` on the location object.
 * The link looks like: https://search.google.com/local/writereview?placeid=<ID>
 *
 * Safe to call fire-and-forget — never throws, only warns on failure.
 */
export async function fetchAndStoreReviewLink(storeId: number): Promise<string | null> {
  try {
    const profiles = await db
      .select()
      .from(googleBusinessProfiles)
      .where(eq(googleBusinessProfiles.storeId, storeId))
      .limit(1);

    if (!profiles.length) return null;
    const profile = profiles[0];
    if (!profile.locationResourceName) return null;
    if (!profile.accessToken && !profile.refreshToken) return null;

    const apiManager = createApiManagerFromProfile(profile);
    const oauth2Client = (apiManager as any).oauth2Client as OAuth2Client;

    // Strip account prefix: we need just "locations/{id}" for this API
    let leafName = profile.locationResourceName;
    const fullMatch = leafName.match(/^accounts\/[^/]+\/(locations\/[^/]+)$/);
    if (fullMatch) leafName = fullMatch[1];

    const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${leafName}?readMask=metadata`;
    console.log(`[GBP Review Link] GET ${url}`);

    const tokenResp = await oauth2Client.getAccessToken();
    const accessToken = tokenResp.token;
    if (!accessToken) {
      console.warn(`[GBP Review Link] could not obtain access token for storeId=${storeId}`);
      return null;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[GBP Review Link] API error ${res.status} for storeId=${storeId}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = await res.json() as any;
    const reviewLink: string | null = data?.metadata?.newReviewUri ?? null;

    if (reviewLink) {
      await db
        .update(googleBusinessProfiles)
        .set({ googleReviewLink: reviewLink, updatedAt: new Date() })
        .where(eq(googleBusinessProfiles.storeId, storeId));
      console.log(`[GBP Review Link] stored for storeId=${storeId}: ${reviewLink}`);
    } else {
      console.log(`[GBP Review Link] metadata.newReviewUri not present in response for storeId=${storeId}`);
    }

    return reviewLink;
  } catch (e: any) {
    console.warn(`[GBP Review Link] fetchAndStoreReviewLink failed for storeId=${storeId}:`, e?.message ?? e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE SYNC — push Certxa services → Google Business Profile serviceItems
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the current serviceItems from a Google Business Profile location.
 *
 * Throws on any API or token error — callers MUST treat a thrown error as an
 * unreadable remote state and abort the sync rather than defaulting to empty.
 * Only returns [] when the API call succeeds but the location genuinely has no
 * service items (200 response with missing/empty serviceItems field).
 */
export async function getGBPServiceItems(
  locationResourceName: string,
  oauth2Client: OAuth2Client,
): Promise<Array<{ displayName: string; description?: string; rawItem: any }>> {
  // Strip accounts/…/ prefix — v1 only accepts "locations/{id}"
  const leafMatch = locationResourceName.match(/(?:accounts\/[^/]+\/)?(locations\/[^/]+)$/);
  if (!leafMatch) {
    throw new Error(`getGBPServiceItems: invalid locationResourceName "${locationResourceName}"`);
  }
  const leafName = leafMatch[1];

  const tokenResponse = await oauth2Client.getAccessToken();
  const accessToken = tokenResponse.token;
  if (!accessToken) {
    throw new Error("getGBPServiceItems: could not obtain access token — reconnect Google Business Profile");
  }

  const res = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${leafName}?readMask=serviceItems`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `getGBPServiceItems: Google API returned HTTP ${res.status} — ${body.slice(0, 200)}`,
    );
  }

  const body = await res.json() as Record<string, unknown>;
  const items: any[] = (body.serviceItems as any[]) ?? [];
  return items
    .map((item: any) => ({
      displayName:
        item.freeFormServiceItem?.label?.displayName ??
        item.structuredServiceItem?.displayName ??
        "",
      description:
        item.freeFormServiceItem?.label?.description ??
        item.structuredServiceItem?.description,
      // Preserve the full raw Google API object so we can round-trip it
      // unchanged for items we don't own (avoids re-wrapping structuredServiceItem
      // objects as freeFormServiceItem, which Google rejects with INVALID_ARGUMENT).
      rawItem: item,
    }))
    .filter((i) => i.displayName);
}

/**
 * Sync active Certxa services to the connected Google Business Profile for a store.
 *
 * Algorithm:
 *  1. Load sync settings. If not found or disabled from the call-site, still proceed
 *     (call-site is responsible for the enabled-check in auto mode).
 *  2. Load active Certxa services.
 *  3. Fetch current GBP serviceItems.
 *  4. Build merged serviceItems list based on per-field sync flags.
 *  5. PATCH the location.
 *  6. Persist last-sync metadata.
 */
export async function syncServicesToGoogle(
  storeId: number,
  opts?: {
    syncName?: boolean;
    syncDescription?: boolean;
    syncPrice?: boolean;
    syncAddNew?: boolean;
    syncRemoveDeleted?: boolean;
  },
): Promise<{ syncedCount: number; locationResourceName: string }> {
  console.log(`[GBP Service Sync] ── syncServicesToGoogle START — storeId=${storeId} ──`);

  // ── 1. Load GBP profile ──────────────────────────────────────────────────
  const profiles = await db
    .select()
    .from(googleBusinessProfiles)
    .where(eq(googleBusinessProfiles.storeId, storeId))
    .limit(1);

  if (!profiles.length) throw new Error("Google Business Profile not connected for this store");
  const googleProfile = profiles[0];

  if (!googleProfile.locationResourceName) {
    throw new Error("No location connected. Please reconnect your Google Business Profile and select a location.");
  }
  if (!googleProfile.accessToken && !googleProfile.refreshToken) {
    throw new Error("Google access token missing. Please reconnect your Google Business Profile.");
  }

  // ── 2. Load sync settings ────────────────────────────────────────────────
  const settingsRows = await db
    .select()
    .from(googleServiceSyncSettings)
    .where(eq(googleServiceSyncSettings.storeId, storeId))
    .limit(1);

  const dbSettings = settingsRows[0];
  const syncName        = opts?.syncName        ?? dbSettings?.syncName        ?? true;
  const syncDescription = opts?.syncDescription ?? dbSettings?.syncDescription ?? true;
  const syncPrice       = opts?.syncPrice       ?? dbSettings?.syncPrice       ?? true;
  const syncAddNew      = opts?.syncAddNew      ?? dbSettings?.syncAddNew      ?? true;
  const syncRemoveDeleted = opts?.syncRemoveDeleted ?? dbSettings?.syncRemoveDeleted ?? false;

  // ── 3. Load active Certxa services ───────────────────────────────────────
  const allCertxaServices = await db
    .select()
    .from(services)
    .where(and(eq(services.storeId, storeId), eq(services.isActive, true)));

  // Dedup by name (case-insensitive) before building the merge list.
  // Two active services sharing the same name would otherwise produce a duplicate
  // freeFormServiceItem, causing Google to reject the PATCH with 400 INVALID_ARGUMENT.
  // Keep the first occurrence (lowest id), log and skip any later duplicates.
  const seenCertxaServiceNames = new Set<string>();
  const certxaServices = allCertxaServices.filter((svc) => {
    const key = svc.name.toLowerCase().trim();
    if (seenCertxaServiceNames.has(key)) {
      console.warn(`[GBP Service Sync] skipping duplicate Certxa service "${svc.name}" (id=${svc.id}) — another active service with the same name already exists`);
      return false;
    }
    seenCertxaServiceNames.add(key);
    return true;
  });

  console.log(`[GBP Service Sync] ${allCertxaServices.length} active service(s) in Certxa${allCertxaServices.length !== certxaServices.length ? `, ${allCertxaServices.length - certxaServices.length} duplicate name(s) skipped` : ""}`);

  // ── 4. Fetch current GBP serviceItems ────────────────────────────────────
  const apiManager = createApiManagerFromProfile(googleProfile);
  const oauth2Client = (apiManager as any).oauth2Client as OAuth2Client;

  const existingGBPItems = await getGBPServiceItems(googleProfile.locationResourceName, oauth2Client);
  console.log(`[GBP Service Sync] ${existingGBPItems.length} existing item(s) on Google`);

  // ── 4b. Fetch location primary category GCid ─────────────────────────────
  // Google's freeFormServiceItem.category is REQUIRED and must be one of the
  // location's registered GCid categories (e.g. "gcid:nail_salon").
  // Sending an empty string causes 400 INVALID_ARGUMENT on every item.
  // Strategy: try the live location details first; fall back to extracting the
  // category from any existing freeFormServiceItem already on Google.
  let locationCategoryGcid = "";
  try {
    const locationDetails = await apiManager.getLocationDetails(googleProfile.locationResourceName);
    const primaryCategoryName: string = locationDetails?.categories?.primaryCategory?.name ?? "";
    if (primaryCategoryName) {
      locationCategoryGcid = primaryCategoryName;
      console.log(`[GBP Service Sync] location primary category: ${locationCategoryGcid}`);
    } else {
      console.warn("[GBP Service Sync] getLocationDetails returned no primaryCategory name — will try existing items");
    }
  } catch (e: any) {
    console.warn(`[GBP Service Sync] could not fetch location category from API: ${e?.message}`);
  }
  // Fallback: extract category from any existing freeFormServiceItem on Google
  if (!locationCategoryGcid) {
    for (const item of existingGBPItems) {
      const cat: string = item.rawItem?.freeFormServiceItem?.category ?? "";
      if (cat) {
        locationCategoryGcid = cat;
        console.log(`[GBP Service Sync] category derived from existing GBP item: ${locationCategoryGcid}`);
        break;
      }
    }
  }
  if (!locationCategoryGcid) {
    console.warn("[GBP Service Sync] WARNING: could not determine location category — freeFormServiceItem.category will be empty and Google may reject the PATCH");
  }

  // Build a lookup map: name (lower) → existing GBP item
  const existingByName = new Map<string, { displayName: string; description?: string; rawItem: any }>();
  for (const item of existingGBPItems) {
    existingByName.set(item.displayName.toLowerCase().trim(), item);
  }

  // ── 5. Build merged serviceItems ─────────────────────────────────────────
  // Each element is either a freeFormServiceItem (Certxa-owned) or the raw
  // Google API object for Google-only items (which may be structuredServiceItem).
  // Using `any[]` so we can round-trip Google-native structured items unchanged
  // instead of incorrectly re-wrapping them as freeFormServiceItem.
  const mergedItems: any[] = [];

  // Build a set of Certxa service names for the remove-deleted check
  const certxaNames = new Set(certxaServices.map((s) => s.name.toLowerCase().trim()));

  // Google's character limits for freeFormServiceItem fields
  const GBP_MAX_NAME_LEN = 120;
  const GBP_MAX_DESC_LEN = 300;

  /**
   * Sanitize a string for use in a GBP freeFormServiceItem label.
   *
   * Google rejects service items that contain:
   *  - HTML tags or entities
   *  - Newline / carriage-return / tab characters in displayName
   *  - Control characters (U+0000–U+001F except space)
   *  - Leading / trailing whitespace
   *
   * For displayName we also collapse runs of whitespace to a single space.
   * For description we preserve intentional line-breaks by converting them
   * to a single space (Google's plain-text field doesn't render markup).
   */
  function sanitizeGBPText(raw: string | null | undefined, maxLen: number): string {
    if (!raw) return "";
    return raw
      // Step 1 — decode HTML entities FIRST so encoded tags become real tags
      // before we strip them in step 2.
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      // Numeric decimal entities (e.g. &#60; → <)
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      // Numeric hex entities (e.g. &#x3C; → <)
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      // Step 2 — strip HTML tags (catches both literal and previously-encoded tags)
      .replace(/<[^>]*>/g, " ")
      // Step 3 — clean up whitespace and control characters
      .replace(/[\r\n\t]/g, " ")
      .replace(/[\x00-\x1F\x7F]/g, "")
      .replace(/ {2,}/g, " ")
      .trim()
      .slice(0, maxLen);
  }

  // Process each Certxa service
  for (const svc of certxaServices) {
    const key = svc.name.toLowerCase().trim();
    const existingItem = existingByName.get(key);
    const isNew = !existingItem;

    if (isNew && !syncAddNew) {
      console.log(`[GBP Service Sync] skip new service "${svc.name}" (syncAddNew=false)`);
      continue;
    }

    // If the matching GBP item is a structuredServiceItem we cannot convert it to a
    // freeFormServiceItem — Google rejects the conversion with 400 INVALID_ARGUMENT on
    // service_items[N].free_form_service_item. Round-trip the raw object unchanged.
    if (existingItem?.rawItem?.structuredServiceItem) {
      console.log(`[GBP Service Sync] preserving structured item "${existingItem.displayName}" — cannot convert to free-form`);
      mergedItems.push(existingItem.rawItem);
      continue;
    }

    // Build label — sanitize before any length check
    const rawDisplayName = syncName ? svc.name : (existingItem?.displayName ?? svc.name);
    const displayName = sanitizeGBPText(rawDisplayName, GBP_MAX_NAME_LEN);

    // Google rejects empty displayName — skip with a clear log
    if (!displayName) {
      console.warn(`[GBP Service Sync] skipping service id=${svc.id} name="${svc.name}" — empty display name after sanitization`);
      continue;
    }

    let description: string | undefined;
    if (syncDescription && svc.description) {
      description = svc.description;
      // Append price if syncPrice is on
      if (syncPrice && svc.price) {
        const priceStr = `${Number(svc.price).toFixed(2)}`;
        description = description ? `${description} — ${priceStr}` : priceStr;
      }
    } else if (syncPrice && svc.price) {
      // Price-only descriptions must be non-trivial; prefix with label to avoid bare numbers
      description = `Price: ${Number(svc.price).toFixed(2)}`;
    } else {
      description = existingItem?.description;
    }

    // Sanitize and truncate description
    const safeDescription = sanitizeGBPText(description, GBP_MAX_DESC_LEN) || undefined;

    console.log(
      `[GBP Service Sync] item: "${displayName}"` +
      (safeDescription ? ` desc="${safeDescription.slice(0, 60)}${safeDescription.length > 60 ? "…" : ""}"` : ""),
    );

    mergedItems.push({
      freeFormServiceItem: {
        category: locationCategoryGcid,
        label: {
          displayName,
          ...(safeDescription ? { description: safeDescription } : {}),
          languageCode: "en",
        },
      },
    });
  }

  // Keep non-Certxa Google items (services that exist on Google but not in Certxa).
  // Round-trip the original raw API object — do NOT re-wrap as freeFormServiceItem.
  // Google rejects any structuredServiceItem that has been converted to freeFormServiceItem,
  // producing a 400 INVALID_ARGUMENT on that service_items[N].free_form_service_item field.
  if (!syncRemoveDeleted) {
    for (const item of existingGBPItems) {
      const key = item.displayName.toLowerCase().trim();
      if (!certxaNames.has(key)) {
        if (!item.displayName?.trim()) continue;
        console.log(`[GBP Service Sync] preserving Google-only item "${item.displayName}"`);
        // Push the raw object exactly as Google returned it so its type
        // (structuredServiceItem vs freeFormServiceItem) is preserved.
        mergedItems.push(item.rawItem);
      }
    }
  }

  // ── 5b. Deduplicate by display name ─────────────────────────────────────
  // Google rejects the PATCH with 400 INVALID_ARGUMENT if two freeFormServiceItems
  // share the same displayName within a category.  This can happen when:
  //   • Two Certxa services have identical names after sanitization/truncation
  //   • A Certxa item and a preserved Google-only freeFormServiceItem share a name
  // Strategy: keep the FIRST occurrence of each lower-cased display name.
  // Certxa items are pushed first, so they win over Google-only items when names clash.
  const seenDisplayNames = new Set<string>();
  const dedupedItems: any[] = [];
  for (const item of mergedItems) {
    // Extract the display name from whichever item type this is
    const rawName: string =
      item.freeFormServiceItem?.label?.displayName ??
      item.structuredServiceItem?.displayName ??
      "";
    const nameKey = rawName.toLowerCase().trim();
    if (!nameKey) {
      // No display name — keep but don't track (Google will reject it anyway)
      dedupedItems.push(item);
      continue;
    }
    if (seenDisplayNames.has(nameKey)) {
      console.warn(`[GBP Service Sync] dedup: dropping duplicate item "${rawName}"`);
      continue;
    }
    seenDisplayNames.add(nameKey);
    dedupedItems.push(item);
  }
  if (dedupedItems.length !== mergedItems.length) {
    console.warn(
      `[GBP Service Sync] dedup removed ${mergedItems.length - dedupedItems.length} duplicate item(s)`,
    );
  }

  console.log(`[GBP Service Sync] pushing ${dedupedItems.length} serviceItem(s) to Google`);

  // ── 6. PATCH the location ────────────────────────────────────────────────
  // Always PATCH when syncRemoveDeleted is on — even an empty array clears Google services.
  // Otherwise skip the PATCH when there's nothing to push (avoids unnecessary API calls).
  const shouldPatch = dedupedItems.length > 0 || syncRemoveDeleted;
  if (shouldPatch) {
    await updateListingFields(
      googleProfile.locationResourceName,
      { serviceItems: dedupedItems },
      oauth2Client,
    );
  } else {
    console.log("[GBP Service Sync] no items to push and syncRemoveDeleted=false — skipping PATCH");
  }

  // ── 7. Persist sync metadata ─────────────────────────────────────────────
  const now = new Date();
  await db
    .insert(googleServiceSyncSettings)
    .values({
      storeId,
      syncEnabled:        dbSettings?.syncEnabled        ?? false,
      syncName:           dbSettings?.syncName           ?? true,
      syncDescription:    dbSettings?.syncDescription    ?? true,
      syncPrice:          dbSettings?.syncPrice          ?? true,
      syncAddNew:         dbSettings?.syncAddNew         ?? true,
      syncRemoveDeleted:  dbSettings?.syncRemoveDeleted  ?? false,
      syncMode:           dbSettings?.syncMode           ?? "auto",
      lastSyncedAt:       now,
      lastSyncStatus:     "success",
      lastSyncError:      null,
      lastSyncCount:      dedupedItems.length,
      updatedAt:          now,
    })
    .onConflictDoUpdate({
      target: googleServiceSyncSettings.storeId,
      set: {
        lastSyncedAt:   now,
        lastSyncStatus: "success",
        lastSyncError:  null,
        lastSyncCount:  dedupedItems.length,
        updatedAt:      now,
      },
    });

  // Audit log
  await db.insert(googleBusinessSyncLogs).values({
    storeId,
    syncType:     "services",
    status:       "success",
    reviewsSynced: dedupedItems.length,
  }).catch((e) => console.warn("[GBP Service Sync] could not write sync log:", e));

  console.log(`[GBP Service Sync] ── syncServicesToGoogle DONE — ${dedupedItems.length} item(s) ──`);
  return { syncedCount: dedupedItems.length, locationResourceName: googleProfile.locationResourceName };
}

/**
 * Publish an approved review response from the database to Google.
 */
export async function publishReviewResponse(responseId: number): Promise<void> {
  const responses = await db
    .select()
    .from(googleReviewResponses)
    .where(eq(googleReviewResponses.id, responseId))
    .limit(1);

  if (!responses.length) throw new Error("Review response not found");
  const reviewResponse = responses[0];

  const reviewRecords = await db
    .select()
    .from(googleReviews)
    .where(eq(googleReviews.id, reviewResponse.googleReviewId))
    .limit(1);

  if (!reviewRecords.length) throw new Error("Review not found");
  const review = reviewRecords[0];

  const profileData = await db
    .select()
    .from(googleBusinessProfiles)
    .where(eq(googleBusinessProfiles.storeId, review.storeId))
    .limit(1);

  if (!profileData.length) throw new Error("Google Business Profile not found");
  const googleProfile = profileData[0];

  const apiManager = createApiManagerFromProfile(googleProfile);

  const reviewResourceName = `${googleProfile.locationResourceName}/reviews/${review.googleReviewId}`;
  console.log(`[Google Business OAuth] publishReviewResponse — posting reply to: ${reviewResourceName}`);
  await apiManager.replyToReview(reviewResourceName, reviewResponse.responseText);

  await db
    .update(googleReviewResponses)
    .set({ responseStatus: "approved", updatedAt: new Date() })
    .where(eq(googleReviewResponses.id, responseId));

  await db
    .update(googleReviews)
    .set({ responseStatus: "responded" })
    .where(eq(googleReviews.id, review.id));

  console.log(`[Google Business OAuth] publishReviewResponse — published for review ${review.googleReviewId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GBP LOCAL POSTS — Phase 3.1 Post Automation Engine
// ─────────────────────────────────────────────────────────────────────────────

export type GBPPostTopicType = "WHATS_NEW" | "OFFER" | "EVENT" | "ALERT";
export type GBPCTAType = "BOOK" | "CALL" | "LEARN_MORE" | "ORDER" | "SHOP" | "SIGN_UP";

export interface CreateGBPPostOptions {
  /** Full location resource name: accounts/{accountId}/locations/{locationId} */
  locationResourceName: string;
  topicType: GBPPostTopicType;
  /** Post body — shown on Google Maps/Search. Max 1500 chars; 100–250 is optimal. */
  summary: string;
  callToAction?: {
    actionType: GBPCTAType;
    url: string;
  };
  /** ISO 8601 start/end strings for EVENT posts */
  event?: {
    title: string;
    schedule: { startTime: string; endTime: string };
  };
}

/**
 * Create a Local Post on a Google Business Profile location.
 *
 * API: POST https://mybusiness.googleapis.com/v4/{parent}/localPosts
 *
 * The My Business v4 API is the current supported surface for Local Posts — the
 * newer split APIs (mybusinessbusinessinformation, mybusinessreviews, etc.) do
 * not yet expose a posts endpoint.
 *
 * Scope required: business.manage (already in use for all other GBP calls).
 *
 * Returns the created post resource name (e.g. "accounts/.../locations/.../localPosts/...").
 */
export async function createGBPLocalPost(
  opts: CreateGBPPostOptions,
  oauth2Client: OAuth2Client,
): Promise<{ postResourceName: string; rawResponse: any }> {
  const { locationResourceName, topicType, summary, callToAction, event } = opts;

  // The v4 API expects the FULL resource name: accounts/{id}/locations/{id}
  // Strip any leading slash just in case
  const parent = locationResourceName.replace(/^\//, "");

  const url = `https://mybusiness.googleapis.com/v4/${parent}/localPosts`;

  const body: Record<string, any> = {
    languageCode: "en-US",
    summary,
    topicType,
  };

  if (callToAction) {
    body.callToAction = {
      actionType: callToAction.actionType,
      url: callToAction.url,
    };
  }

  if (topicType === "EVENT" && event) {
    body.event = {
      title: event.title,
      schedule: {
        startTime: event.schedule.startTime,
        endTime: event.schedule.endTime,
      },
    };
  }

  let accessToken: string | null | undefined;
  try {
    const tokenResp = await oauth2Client.getAccessToken();
    accessToken = tokenResp.token;
  } catch (tokenErr: any) {
    tokenErr.isAuthError = true;
    throw tokenErr;
  }
  if (!accessToken) {
    const err: any = new Error("createGBPLocalPost: could not obtain access token");
    err.isAuthError = true;
    throw err;
  }

  console.log(`[GBP Posts] POST ${url}  topicType=${topicType}  summary(${summary.length})`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();

  if (!res.ok) {
    const err: any = new Error(`createGBPLocalPost: HTTP ${res.status}: ${responseText.slice(0, 300)}`);
    err.status = res.status;
    if (res.status === 401 || res.status === 403) err.isAuthError = true;
    console.error(`[GBP Posts] POST failed — status=${res.status}  body=${responseText.slice(0, 400)}`);
    throw err;
  }

  let rawResponse: any;
  try { rawResponse = JSON.parse(responseText); } catch { rawResponse = responseText; }

  const postResourceName: string = rawResponse?.name ?? "";
  console.log(`[GBP Posts] ✓ Created post — resourceName=${postResourceName}`);
  return { postResourceName, rawResponse };
}

/**
 * Delete a Local Post from a Google Business Profile.
 * Used to clean up failed or cancelled posts that were partially published.
 */
export async function deleteGBPLocalPost(
  postResourceName: string,
  oauth2Client: OAuth2Client,
): Promise<void> {
  const url = `https://mybusiness.googleapis.com/v4/${postResourceName.replace(/^\//, "")}`;

  const tokenResp = await oauth2Client.getAccessToken();
  const accessToken = tokenResp.token;
  if (!accessToken) throw new Error("deleteGBPLocalPost: could not obtain access token");

  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[GBP Posts] DELETE ${postResourceName} failed — status=${res.status}  body=${body.slice(0, 200)}`);
    // Non-fatal — if a post is already gone from Google's side, treat as success
    if (res.status !== 404) {
      throw new Error(`deleteGBPLocalPost: HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
  } else {
    console.log(`[GBP Posts] ✓ Deleted post — ${postResourceName}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GBP Photo Automation Engine (Phase 3.2)
// API: POST https://mybusinessmedia.googleapis.com/upload/v1/{parent}/media
// Docs: https://developers.google.com/my-business/reference/media/rest/v1/accounts.locations.media/create
// ─────────────────────────────────────────────────────────────────────────────

export type GBPMediaCategory =
  | "ADDITIONAL"
  | "COVER"
  | "PROFILE"
  | "INTERIOR"
  | "EXTERIOR"
  | "PRODUCT"
  | "AT_WORK"
  | "FOOD_AND_DRINK"
  | "MENU"
  | "COMMON_AREA"
  | "ROOMS"
  | "TEAMS"
  | "LOGO";

export interface CreateGBPMediaItemParams {
  /** Full location resource name: "accounts/{id}/locations/{id}" */
  locationResourceName: string;
  /** R2 key — used to fetch binary directly (preferred, works with private buckets) */
  r2Key?: string;
  /** Fallback source URL if R2 key not available (must be publicly accessible) */
  sourceUrl?: string;
  /** Photo category on GBP — defaults to ADDITIONAL */
  mediaCategory?: GBPMediaCategory;
  /** Optional short caption attached to the media item */
  description?: string;
}

export interface CreateGBPMediaItemResult {
  /** Google media resource name (e.g. "accounts/.../locations/.../media/...") */
  mediaResourceName: string;
  /** Raw API response for logging */
  rawResponse: any;
}

/**
 * Upload a photo to Google Business Profile using the mybusinessmedia v1 API.
 *
 * Strategy:
 *  1. If r2Key is provided → fetch binary from R2 → multipart upload (no public URL needed)
 *  2. Fallback → POST sourceUrl (Google fetches from that URL — must be public)
 *
 * Returns the created media resource name.
 * Throws on auth errors, HTTP 4xx/5xx (caller handles retry logic).
 */
export async function createGBPMediaItem(
  params: CreateGBPMediaItemParams,
  client: OAuth2Client,
): Promise<CreateGBPMediaItemResult> {
  const { locationResourceName, r2Key, sourceUrl, mediaCategory = "ADDITIONAL", description } = params;

  if (!r2Key && !sourceUrl) {
    throw new Error("createGBPMediaItem: either r2Key or sourceUrl must be provided");
  }

  const tokenResp = await client.getAccessToken();
  const accessToken = tokenResp.token;
  if (!accessToken) {
    const err: any = new Error("createGBPMediaItem: could not obtain access token");
    err.isAuthError = true;
    throw err;
  }

  const mediaMetadata: Record<string, any> = {
    mediaFormat: "PHOTO",
    locationAssociation: { category: mediaCategory },
  };
  if (description?.trim()) {
    mediaMetadata.description = description.trim().slice(0, 2000);
  }

  // ── Strategy 1: Binary multipart upload from R2 ───────────────────────────
  if (r2Key) {
    let imageBuffer: Buffer;
    try {
      const { getObjectFromR2 } = await import("./lib/r2.js");
      const r2Obj = await getObjectFromR2(r2Key);
      if (!r2Obj?.Body) throw new Error("R2 returned empty body");
      // Collect stream into buffer
      const chunks: Uint8Array[] = [];
      const stream = r2Obj.Body as any;
      if (typeof stream[Symbol.asyncIterator] === "function") {
        for await (const chunk of stream) chunks.push(chunk);
      } else if (typeof stream.transformToByteArray === "function") {
        chunks.push(await stream.transformToByteArray());
      } else {
        throw new Error("Cannot read R2 stream");
      }
      imageBuffer = Buffer.concat(chunks);
    } catch (r2Err: any) {
      // If R2 fetch fails and we have a sourceUrl fallback, use it
      if (sourceUrl) {
        console.warn(`[GBP Photos] R2 fetch failed (${r2Err?.message}), falling back to sourceUrl`);
        return createGBPMediaItemViaSourceUrl(locationResourceName, sourceUrl, mediaMetadata, accessToken);
      }
      throw new Error(`createGBPMediaItem: R2 fetch failed — ${r2Err?.message}`);
    }

    // Multipart upload
    const boundary  = `certxa-gbp-${Date.now()}`;
    const metaPart  = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(mediaMetadata) + `\r\n`,
    );
    const mediaPart = Buffer.from(
      `--${boundary}\r\nContent-Type: image/webp\r\n\r\n`,
    );
    const closing   = Buffer.from(`\r\n--${boundary}--`);
    const body      = Buffer.concat([metaPart, mediaPart, imageBuffer, closing]);

    const uploadUrl = `https://mybusinessmedia.googleapis.com/upload/v1/${locationResourceName}/media?uploadType=multipart`;
    const uploadRes = await fetch(uploadUrl, {
      method:  "POST",
      headers: {
        "Authorization":  `Bearer ${accessToken}`,
        "Content-Type":   `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    });

    const responseText = await uploadRes.text().catch(() => "");
    if (!uploadRes.ok) {
      const err: any = new Error(`createGBPMediaItem: HTTP ${uploadRes.status}: ${responseText.slice(0, 300)}`);
      err.status = uploadRes.status;
      if (uploadRes.status === 401 || uploadRes.status === 403) err.isAuthError = true;
      throw err;
    }

    let rawResponse: any;
    try { rawResponse = JSON.parse(responseText); } catch { rawResponse = { raw: responseText }; }

    const mediaResourceName = rawResponse?.name ?? rawResponse?.mediaKey ?? `${locationResourceName}/media/unknown`;
    console.log(`[GBP Photos] ✓ Multipart upload — mediaResourceName=${mediaResourceName}`);
    return { mediaResourceName, rawResponse };
  }

  // ── Strategy 2: sourceUrl (Google fetches from public URL) ────────────────
  return createGBPMediaItemViaSourceUrl(locationResourceName, sourceUrl!, mediaMetadata, accessToken);
}

async function createGBPMediaItemViaSourceUrl(
  locationResourceName: string,
  sourceUrl: string,
  mediaMetadata: Record<string, any>,
  accessToken: string,
): Promise<CreateGBPMediaItemResult> {
  const url = `https://mybusinessmedia.googleapis.com/v1/${locationResourceName}/media`;
  const body = { ...mediaMetadata, sourceUrl };

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text().catch(() => "");
  if (!res.ok) {
    const err: any = new Error(`createGBPMediaItem (sourceUrl): HTTP ${res.status}: ${responseText.slice(0, 300)}`);
    err.status = res.status;
    if (res.status === 401 || res.status === 403) err.isAuthError = true;
    throw err;
  }

  let rawResponse: any;
  try { rawResponse = JSON.parse(responseText); } catch { rawResponse = { raw: responseText }; }

  const mediaResourceName = rawResponse?.name ?? rawResponse?.mediaKey ?? `${locationResourceName}/media/unknown`;
  console.log(`[GBP Photos] ✓ sourceUrl upload — mediaResourceName=${mediaResourceName}`);
  return { mediaResourceName, rawResponse };
}
