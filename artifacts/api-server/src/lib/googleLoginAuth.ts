import { OAuth2Client } from "google-auth-library";

/**
 * Google OAuth for account LOGIN / REGISTRATION only.
 * Deliberately isolated from google-business-api.ts (which handles
 * Business Profile sync with the business.manage scope). Never mix
 * the two flows — different scopes, different callback URL, different
 * session side-effects.
 *
 * Reuses the same Google Cloud OAuth client (GOOGLE_CLIENT_ID / SECRET)
 * as the Business Profile integration by default — one OAuth client can
 * have several redirect URIs registered in Google Cloud Console, one per
 * flow. Override with GOOGLE_LOGIN_CLIENT_ID / GOOGLE_LOGIN_CLIENT_SECRET
 * if you'd rather use a dedicated client.
 */

const LOGIN_SCOPES = ["openid", "email", "profile"];

/**
 * Returns the redirect URI Google must send the browser back to after login consent.
 *
 * Priority:
 *   1. GOOGLE_LOGIN_CALLBACK_URL — explicitly configured (required on a VPS)
 *   2. REPLIT_DEV_DOMAIN         — auto-derived Replit dev proxy domain
 *   3. certxa.com fallback (dev convenience only — always set #1 in production)
 */
export function getGoogleLoginCallbackUrl(): string {
  if (process.env.GOOGLE_LOGIN_CALLBACK_URL) {
    return process.env.GOOGLE_LOGIN_CALLBACK_URL;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`;
  }
  return "https://certxa.com/api/auth/google/callback";
}

function getCredentials(): { clientId: string; clientSecret: string } {
  return {
    clientId:
      process.env.GOOGLE_LOGIN_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret:
      process.env.GOOGLE_LOGIN_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
  };
}

export function isGoogleLoginConfigured(): boolean {
  const { clientId, clientSecret } = getCredentials();
  return !!(clientId && clientSecret);
}

function makeClient(): OAuth2Client {
  const { clientId, clientSecret } = getCredentials();
  return new OAuth2Client(clientId, clientSecret, getGoogleLoginCallbackUrl());
}

/** Build the Google consent-screen URL for account login/registration. */
export function getGoogleLoginAuthUrl(state: string): string {
  const client = makeClient();
  return client.generateAuthUrl({
    scope: LOGIN_SCOPES,
    prompt: "select_account",       // let returning users pick an account; no forced re-consent
    include_granted_scopes: false,  // never merge with business.manage or any other grant
    state,
  });
}

export interface GoogleLoginProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

/** Exchange an authorization code for tokens and return the verified profile. */
export async function exchangeGoogleLoginCode(code: string): Promise<GoogleLoginProfile> {
  const client = makeClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.id_token) {
    throw new Error("Google did not return an id_token (openid scope missing?)");
  }

  const { clientId } = getCredentials();
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email) {
    throw new Error("Google id_token payload is missing sub/email");
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase().trim(),
    emailVerified: !!payload.email_verified,
    firstName: payload.given_name ?? null,
    lastName: payload.family_name ?? null,
    profileImageUrl: payload.picture ?? null,
  };
}
