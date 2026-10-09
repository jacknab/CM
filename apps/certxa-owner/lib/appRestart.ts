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

interface NativeAppRestart {
  isDefaultHome(): boolean;
  restart(): void;
  openDeviceSettings(): void;
  isKioskManaged(): boolean;
  exitKioskToSettings(minutes: number): void;
  followSensorOrientation?(): void;
  prepareCardReader?(): boolean;
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
