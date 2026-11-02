/**
 * offlineCard.ts — M2 card payments while the internet is down (owner, 2026-11-02).
 *
 * Stripe's offline mode (switched on for the salon's reader location by the server): with no internet the app
 * creates the payment itself, the M2 reads the card, and the Stripe SDK keeps the payment on the tablet. When the
 * internet is back the SDK sends it to Stripe (onDidForwardPaymentIntent) and the app tells the server, which charges
 * it and joins it to the /nail sale by its `offline_ref`.
 *
 * The salon carries the risk of a card the bank refuses later, so: at most $300 a payment and $1,500 waiting to be
 * sent (owner's limits). Chip and tap only — Stripe doesn't allow swiping offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const OFFLINE_MAX_CENTS = 30_000;
export const OFFLINE_TOTAL_CENTS = 150_000;

const LOCATION_KEY = 'certxa.terminal.location';
const REPORTS_KEY = 'certxa.offlineCard.reports';

/** What the server said about the reader location, kept for when it can't be asked. */
export interface SavedLocation { locationId: string; storeId: number | null; applicationFeeCents: number }

export async function saveLocation(l: SavedLocation): Promise<void> {
  try { await AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(l)); } catch { /* asked again next time */ }
}
export async function savedLocation(): Promise<SavedLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_KEY);
    const l = raw ? JSON.parse(raw) : null;
    return l && typeof l.locationId === 'string' ? l : null;
  } catch {
    return null;
  }
}

/** A reference for a payment taken offline, also written on the /nail sale. */
export function newOfflineRef(): string {
  return `off_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** The connection failed (as opposed to the server refusing). */
export function isNetworkFailure(e: unknown): boolean {
  const m = String((e as any)?.message ?? e ?? '');
  return /network|timeout|timed out|failed to fetch|internet|offline|unreachable|could not connect/i.test(m);
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Why this payment can't be taken offline, or null. `storedCents`: payments already waiting on this tablet. */
export function offlineLimitProblem(amountCents: number, storedCents: number): string | null {
  if (amountCents > OFFLINE_MAX_CENTS) {
    return `No internet: card payments over ${money(OFFLINE_MAX_CENTS)} need the internet. Take cash, or wait until it is back.`;
  }
  if (storedCents + amountCents > OFFLINE_TOTAL_CENTS) {
    return `No internet: this tablet already holds ${money(storedCents)} of card payments waiting to be sent (limit ${money(OFFLINE_TOTAL_CENTS)}). Take cash until the internet is back.`;
  }
  return null;
}

/** A payment the SDK sent to Stripe, to be reported to the server (kept until the server has it). */
export interface ForwardReport { offlineRef: string; paymentIntentId: string | null; error: string | null }

async function readReports(): Promise<ForwardReport[]> {
  try { const raw = await AsyncStorage.getItem(REPORTS_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
async function writeReports(list: ForwardReport[]): Promise<void> {
  try { await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(list.slice(-200))); } catch { /* kept in memory until next try */ }
}

export async function queueReport(r: ForwardReport): Promise<void> {
  const list = await readReports();
  if (!list.some((x) => x.offlineRef === r.offlineRef && x.paymentIntentId === r.paymentIntentId)) list.push(r);
  await writeReports(list);
}

let flushing = false;
/** Sends every waiting report to the server; those it can't send stay for the next try. */
export async function flushReports(call: (endpoint: string, method: string, body?: any) => Promise<any>): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const list = await readReports();
    const left: ForwardReport[] = [];
    for (const r of list) {
      try {
        const res = await call('/api/payments/terminal/offline-forwarded', 'POST', r);
        if (!res?.ok) left.push(r);
      } catch {
        left.push(r);
      }
    }
    await writeReports(left);
  } finally {
    flushing = false;
  }
}
