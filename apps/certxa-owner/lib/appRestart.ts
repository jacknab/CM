/**
 * appRestart.ts — nightly self-restart and the Home-app helpers (native side:
 * modules/certxa-app-restart, manifest: plugins/withKioskMode.js).
 *
 * Once a night (3:00–3:59 AM device time, i.e. the salon's local time) the app closes itself
 * completely and starts fresh — clearing whatever built up over the day (leaked memory, a stuck
 * WebView, a stale printer or reader connection). It only does this when:
 *   • Certxa is this tablet's default Home app — that's what guarantees Android reopens it; on a
 *     tablet that isn't set up that way a restart could leave the screen on the Android launcher
 *     until morning, so it's skipped there;
 *   • nothing is in progress (a card payment, a print, an open modal) and nobody has touched the
 *     screen for the last few minutes — otherwise it checks again next minute, until 4 AM.
 * Crashes are handled natively: the app schedules its own relaunch and, as the Home app, Android
 * reopens it anyway.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';

interface NativeAppRestart {
  isDefaultHome(): boolean;
  restart(): void;
  openDeviceSettings(): void;
  isKioskManaged(): boolean;
  exitKioskToSettings(minutes: number): void;
  followSensorOrientation?(): void;
  prepareCardReader?(): boolean;
  /** 1.0.4+: the manager menu's "Install the latest app" (native ApkUpdate.kt). */
  installLatestApk?(url: string): Promise<'installing' | 'up_to_date'>;
  apkUpdateLastResult?(): { state: '' | 'installing' | 'failed'; message: string; at: number };
}

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeAppRestart>('CertxaAppRestart') : null;

const RESTART_HOUR = 3;
const LAST_RESTART_KEY = 'certxa.nightlyRestart.lastDate';
/** A restart is pointless if the app only just started (and this also stops any restart loop). */
const MIN_UPTIME_MS = 60 * 60 * 1000;
const QUIET_MS = 5 * 60 * 1000;

/** Is Certxa this tablet's default Home app? False on builds without the native module. */
export function isDefaultHomeApp(): boolean {
  try { return !!native?.isDefaultHome(); } catch { return false; }
}

/** Is this tablet provisioned for the full kiosk lock (Certxa is its device owner)? */
export function isKioskManaged(): boolean {
  try { return !!native?.isKioskManaged(); } catch { return false; }
}

/** After the manager PIN: leave the kiosk lock for `minutes` and open Android Settings; it re-locks by itself afterwards. */
export function exitKioskToSettings(minutes: number): void {
  try { native?.exitKioskToSettings(minutes); } catch { /* stays locked */ }
}

/**
 * Let the screen turn with the tablet even when Android's auto-rotate is off. Called on POS / Kiosk
 * tablets, where orientation decides which of the two is shown (see app/index.tsx).
 */
export function followSensorOrientation(): void {
  try { native?.followSensorOrientation?.(); } catch { /* orientation then follows Android's own setting */ }
}

/**
 * Get the tablet ready for the Stripe M2 reader: on a kiosk-managed tablet this switches on
 * Bluetooth and Location Services and grants the app's location + Bluetooth permissions, with no
 * Android prompt (staff cannot reach Android's settings inside the kiosk lock). Does nothing on a
 * tablet that is not kiosk-managed. Returns true when Bluetooth was off and is now starting up.
 */
export function prepareCardReader(): boolean {
  try { return !!native?.prepareCardReader?.(); } catch { return false; }
}

/** Open Android's Settings app — the way out when Certxa is the Home app (closing it reopens it). */
export function openDeviceSettings(): void {
  try { native?.openDeviceSettings(); } catch { /* no settings app to open */ }
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms))]);

/**
 * Download a waiting over-the-air update before the nightly restart, so the restart starts it. On its own the
 * app only downloads an update as it launches and runs it from the launch after — two nights for every update
 * (the pay-slip printing published 2026-10-13 had not reached the tablets the next morning). No connection,
 * or nothing new: nothing happens, and the restart goes ahead as before.
 */
async function fetchWaitingUpdate(): Promise<void> {
  if (!Updates.isEnabled) return;
  try {
    const check = await withTimeout(Updates.checkForUpdateAsync(), 20_000);
    if (check.isAvailable) {
      await withTimeout(Updates.fetchUpdateAsync(), 90_000);
      console.log('[nightly-restart] downloaded the new update; the restart starts it');
    }
  } catch (e: any) {
    console.warn('[nightly-restart] update check skipped:', e?.message ?? e);
  }
}

const localDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Run the nightly restart. `isBusy` says whether something is in progress right now; `lastActivityAt`
 * is when the screen was last touched (ms since epoch).
 */
export function useNightlyRestart(isBusy: () => boolean, lastActivityAt: () => number): void {
  useEffect(() => {
    if (!native) return;
    const startedAt = Date.now();
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const now = new Date();
        if (now.getHours() !== RESTART_HOUR) return;
        if (Date.now() - startedAt < MIN_UPTIME_MS) return;
        if (Date.now() - lastActivityAt() < QUIET_MS || isBusy()) return;
        if (!isDefaultHomeApp()) return;
        const today = localDateKey(now);
        if ((await AsyncStorage.getItem(LAST_RESTART_KEY)) === today) return;
        await AsyncStorage.setItem(LAST_RESTART_KEY, today);
        await fetchWaitingUpdate();
        // Something may have started while the update was downloading: then wait for the next minute's check.
        if (isBusy()) { await AsyncStorage.removeItem(LAST_RESTART_KEY); return; }
        console.log('[nightly-restart] restarting the app');
        native.restart();
      } catch (e: any) {
        console.warn('[nightly-restart] skipped:', e?.message ?? e);
      } finally {
        running = false;
      }
    };
    const iv = setInterval(() => { void tick(); }, 60_000);
    return () => clearInterval(iv);
  }, [isBusy, lastActivityAt]);
}

/** Close the app completely and start it again fresh (the manager menu's Hard reset). False without the native module. */
export function restartApp(): boolean {
  try { if (!native) return false; native.restart(); return true; } catch { return false; }
}

/** Can this build download and install its own update (Android app 1.0.4 and later)? */
export function canInstallApk(): boolean {
  return typeof native?.installLatestApk === 'function';
}

/** Download the latest APK from `url` and install it over this app. Rejects with a message staff can read. */
export async function installLatestApk(url: string): Promise<'installing' | 'up_to_date'> {
  if (!native?.installLatestApk) throw new Error('This version of the app cannot update itself. Install the new app from certxa.com/app.');
  return native.installLatestApk(url);
}

/** What the last update attempt came to (a failure is shown the next time the manager menu opens). */
export function apkUpdateLastResult(): { state: string; message: string } | null {
  try { return native?.apkUpdateLastResult?.() ?? null; } catch { return null; }
}
