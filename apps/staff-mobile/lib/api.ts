import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'certxa_staff_session';
const USER_KEY = 'certxa_staff_user';

/**
 * The canonical shape stored locally and used throughout the app.
 * - id: the numeric staff DB row id (used for schedule/timeclock API params)
 * - name: full display name (firstName + lastName from OTP response)
 * - avatarUrl: resolved from profileImageUrl in the OTP response
 */
export type StaffUser = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  storeId?: number | null;
  color?: string | null;
  avatarUrl?: string | null;
};

/**
 * Normalize the raw OTP / session-check response to StaffUser.
 * The server returns { id: "staff-5", staffId: 5, firstName, lastName, profileImageUrl, … }
 * which doesn't match StaffUser directly.
 *
 * Throws if a valid numeric staff id cannot be extracted — callers should treat
 * this as a failed login rather than storing a broken user object.
 */
export function normalizeStaffUser(raw: Record<string, unknown>): StaffUser {
  // staffId is the real DB integer id; id is a string like "staff-5"
  let numericId: number | null = null;

  if (typeof raw.staffId === 'number' && raw.staffId > 0) {
    numericId = raw.staffId;
  } else if (typeof raw.id === 'number' && (raw.id as number) > 0) {
    numericId = raw.id as number;
  } else if (typeof raw.id === 'string') {
    const parsed = parseInt((raw.id as string).replace('staff-', ''), 10);
    if (!isNaN(parsed) && parsed > 0) numericId = parsed;
  }

  if (!numericId) {
    throw new Error('normalizeStaffUser: could not extract a valid staff id from response');
  }

  const firstName = typeof raw.firstName === 'string' ? raw.firstName : '';
  const lastName = typeof raw.lastName === 'string' ? raw.lastName : '';
  const nameFromParts = [firstName, lastName].filter(Boolean).join(' ') || null;

  return {
    id: numericId,
    name: typeof raw.name === 'string' ? raw.name : nameFromParts,
    email: typeof raw.email === 'string' ? raw.email : null,
    role: typeof raw.role === 'string' ? raw.role : 'staff',
    storeId: typeof raw.storeId === 'number' ? raw.storeId : null,
    color: typeof raw.color === 'string' ? raw.color : null,
    avatarUrl: typeof raw.profileImageUrl === 'string' ? raw.profileImageUrl
      : typeof raw.avatarUrl === 'string' ? raw.avatarUrl
      : null,
  };
}

function getBase(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
}

/** Public helper — returns the API base URL for use in custom fetch calls */
export function getApiBaseUrl(): string {
  return getBase();
}

/** Returns auth headers without Content-Type — use for multipart/FormData uploads */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const cookie = await getSession();
  return cookie ? { Cookie: cookie } : {};
}

export async function getSession(): Promise<string | null> {
  return AsyncStorage.getItem(SESSION_KEY);
}

export async function getStoredUser(): Promise<StaffUser | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as StaffUser; } catch { return null; }
}

export async function saveUser(user: StaffUser): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function saveSession(cookie: string, user: StaffUser): Promise<void> {
  await AsyncStorage.multiSet([
    [SESSION_KEY, cookie],
    [USER_KEY, JSON.stringify(user)],
  ]);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([SESSION_KEY, USER_KEY]);
}

async function headers(): Promise<Record<string, string>> {
  const cookie = await getSession();
  return {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${getBase()}${path}`, {
    headers: await headers(),
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${getBase()}${path}`, {
    method: 'POST',
    headers: await headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${getBase()}${path}`, {
    method: 'PATCH',
    headers: await headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${getBase()}${path}`, {
    method: 'PUT',
    headers: await headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function staffLogout(): Promise<void> {
  try {
    await apiPost('/api/auth/logout');
  } catch { /* ignore */ }
  await clearSession();
}
