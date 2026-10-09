/**
 * useReaderDiscovery.ts
 *
 * Encapsulates Stripe Terminal reader discovery + connection for both
 * discovery methods this app supports:
 *   - 'bluetoothScan' — Stripe M2 Bluetooth reader
 *   - 'tapToPay'       — Tap to Pay on this Android device's NFC (no reader)
 *
 * Motivation: the permission request + scan + connect flow was duplicated
 * verbatim between the payment path and the pre-pair rescan popup. This hook
 * eliminates that duplication, mirrors the MainViewModel pattern from
 * stripe-samples/terminal-apps-on-devices, and gives each call-site
 * phase-update callbacks so the UI transitions stay crisp.
 */

import { useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { prepareCardReader } from './appRestart';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import type { Reader } from '@stripe/stripe-terminal-react-native';
import { updateProgressPrompt, UPDATE_STARTING_PROMPT } from './readerPrompts';

const { PERMISSIONS, RESULTS, requestMultiple } = PermissionsAndroid;

const DISCOVERY_TIMEOUT_MS = 20_000;
/** Tap to Pay resolves the local "reader" almost instantly — shorter wait. */
const TAP_DISCOVERY_TIMEOUT_MS = 12_000;

export type DiscoveryMethod = 'bluetoothScan' | 'tapToPay';

/** Serial number of the M2 that last connected on this tablet — preferred on the next scan. */
const LAST_READER_KEY = 'certxa_last_m2_serial';
/** After the first reader appears, wait this long for others before picking one. */
const SETTLE_MS = 2_000;

/** Terminal Android SDK 5.8.0 uses coarse location on API 31+ and fine on older devices. */
export async function ensureTerminalLocationPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const permission = (Platform.Version as number) >= 31
    ? PERMISSIONS.ACCESS_COARSE_LOCATION
    : PERMISSIONS.ACCESS_FINE_LOCATION;
  if (!(await PermissionsAndroid.check(permission))) {
    const result = await PermissionsAndroid.request(permission);
    if (result !== RESULTS.GRANTED) {
      throw new Error(
        'Location permission is required to accept card payments.\n\n' +
        'Go to Settings → Apps → Certxa → Permissions → Location and tap Allow, then try again.',
      );
    }
  }

  // The device-wide Location switch is independent of the app permission.
  if (!(await Location.hasServicesEnabledAsync())) {
    try { await Location.enableNetworkProviderAsync(); } catch {}
    if (!(await Location.hasServicesEnabledAsync())) {
      throw new Error(
        'Location Services are turned off on this device.\n\n' +
        'Go to Settings → Location and enable it, then try again.',
      );
    }
  }
}

export interface DiscoveryCallbacks {
  /** Called after permissions pass, just before scanning starts. */
  onDiscovering?: () => void;
  /** Called after the reader is found, just before connecting. */
  onConnecting?:  () => void;
  /** Text to show while connecting (e.g. a required reader software update installing). */
  onStatus?:      (msg: string) => void;
}

/**
 * Hook that owns M2 reader discovery and connection state.
 * Must be rendered inside <StripeTerminalProvider>.
 */
export function useReaderDiscovery() {
  // Resolver is stored in a ref so the onUpdateDiscoveredReaders callback
  // can resolve the Promise without stale-closure issues.
  const firstReaderResolver = useRef<((r: Reader.Type) => void) | null>(null);
  const savedSerial   = useRef<string | null>(null);
  const settleTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestReaders = useRef<Reader.Type[]>([]);
  const statusRef     = useRef<((msg: string) => void) | null>(null);

  const serialOf = (r: Reader.Type) => String((r as any).serialNumber ?? '');
  const pick = (list: Reader.Type[]): Reader.Type =>
    (savedSerial.current ? list.find((r) => serialOf(r) === savedSerial.current) : undefined) ?? list[0];

  const { discoverReaders, connectReader, cancelDiscovering, disconnectReader, connectedReader } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers: Reader.Type[]) => {
      latestReaders.current = readers;
      const resolve = firstReaderResolver.current;
      if (!resolve || readers.length === 0) return;

      const done = (r: Reader.Type) => {
        if (settleTimer.current) { clearTimeout(settleTimer.current); settleTimer.current = null; }
        firstReaderResolver.current = null;
        resolve(r);
      };
      // Our own reader is in range → use it right away.
      const preferred = savedSerial.current ? readers.find((r) => serialOf(r) === savedSerial.current) : undefined;
      if (preferred) { done(preferred); return; }
      // Otherwise give other readers a moment to show up, then take the best match.
      if (!settleTimer.current) {
        settleTimer.current = setTimeout(() => {
          settleTimer.current = null;
          if (firstReaderResolver.current && latestReaders.current.length > 0) done(pick(latestReaders.current));
        }, SETTLE_MS);
      }
    },
    // A brand-new M2 installs a required software update the first time it connects. It
    // can take minutes and cannot be used until it finishes — show progress, don't just spin.
    onDidStartInstallingUpdate: () => statusRef.current?.(UPDATE_STARTING_PROMPT),
    onDidReportReaderSoftwareUpdateProgress: (progress: string) => statusRef.current?.(updateProgressPrompt(progress)),
  } as any);

  // ── Permission helpers ────────────────────────────────────────────────────────

  /**
   * Verify the SDK's Android-version-specific location grant and the device's
   * Location Services switch, then request BLE permissions for M2 if needed.
   *
   * Required before discoverReaders() is called:
   *  - ACCESS_COARSE_LOCATION on Android 12+, ACCESS_FINE_LOCATION before that
   *  - BLUETOOTH_SCAN        — required on Android 12+ (API 31+) to scan for BLE devices
   *  - BLUETOOTH_CONNECT     — required on Android 12+ (API 31+) to connect a reader
   *
   * The Stripe SDK also throws "Location services must be enabled to use Terminal"
   * when the system-level Location toggle is off even if the permission is granted,
   * so we check (and optionally prompt) for that too.
   */
  const requestTerminalPermissions = async (method: DiscoveryMethod = 'bluetoothScan'): Promise<void> => {
    if (Platform.OS !== 'android') return;

    const version = Platform.Version as number;
    const needsBle = method === 'bluetoothScan';

    // Kiosk-managed tablets: Bluetooth, Location and the permissions are switched on silently.
    // Bluetooth takes a moment to come up if it was off.
    if (prepareCardReader() && needsBle) await new Promise((r) => setTimeout(r, 2500));

    await ensureTerminalLocationPermission();

    // BLE permissions are relevant only for the M2 reader on Android 12+.
    const perms: string[] = [];
    if (needsBle && version >= 31) {
      perms.push(PERMISSIONS.BLUETOOTH_SCAN, PERMISSIONS.BLUETOOTH_CONNECT);
    }

    if (!perms.length) return;
    const results = await requestMultiple(perms as any);
    const granted = (p: string) => (results as any)[p] === RESULTS.GRANTED;
    if (needsBle && version >= 31) {
      if (!granted(PERMISSIONS.BLUETOOTH_SCAN) || !granted(PERMISSIONS.BLUETOOTH_CONNECT)) {
        throw new Error(
          'Bluetooth permission is required to discover the M2 reader.\n\n' +
          'Go to Settings → Apps → Certxa → Permissions → Nearby Devices and tap Allow.',
        );
      }
    }
  };

  // ── Discovery helpers ─────────────────────────────────────────────────────────

  /** Returns a Promise that resolves with the first discovered reader, or rejects after timeout. */
  const discoverFirstReader = (method: DiscoveryMethod): Promise<Reader.Type> =>
    new Promise<Reader.Type>((resolve, reject) => {
      firstReaderResolver.current = resolve;
      const timer = setTimeout(() => {
        firstReaderResolver.current = null;
        reject(new Error(
          method === 'tapToPay'
            ? 'Tap to Pay is not available on this device.\n\nIt needs Android 13 or newer, NFC turned on, a Google-certified device, Developer options and USB debugging turned OFF, and the Tap to Pay capability on the salon\'s Stripe account.'
            : 'No M2 reader found.\n\nMake sure it is powered on, close to this tablet, and Bluetooth is turned on. Do NOT pair it in Android\'s Bluetooth settings — Certxa connects to it directly.',
        ));
      }, method === 'tapToPay' ? TAP_DISCOVERY_TIMEOUT_MS : DISCOVERY_TIMEOUT_MS);

      discoverReaders({ discoveryMethod: method, simulated: false } as any)
        .then(res => {
          if (res?.error && firstReaderResolver.current) {
            clearTimeout(timer);
            firstReaderResolver.current = null;
            reject(new Error(res.error.message));
          }
        })
        .catch(e => {
          if (firstReaderResolver.current) {
            clearTimeout(timer);
            firstReaderResolver.current = null;
            reject(e);
          }
        });
    });

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Full discover → connect flow for either method.
   *
   * 1. Requests the Android permissions the method needs (location always;
   *    BLE only for 'bluetoothScan').
   * 2. Fires `callbacks.onDiscovering()` then scans for the reader.
   * 3. Fires `callbacks.onConnecting()` then connects.
   *
   * If a reader of a *different* method is already connected it is disconnected
   * first (the SDK allows only one connection at a time).
   *
   * Throws on any failure so callers can catch and update UI error state.
   */
  const discoverAndConnect = async (
    locationId: string,
    method: DiscoveryMethod,
    callbacks?: DiscoveryCallbacks,
  ): Promise<void> => {
    const wantTap = method === 'tapToPay';
    const connectedIsTap = (connectedReader as any)?.deviceType === 'tapToPay';

    // Reuse an already-connected reader only if it matches the requested method.
    if (connectedReader && connectedIsTap === wantTap) {
      console.log('[Stripe] Reader already connected:', (connectedReader as any).label ?? (connectedReader as any).serialNumber ?? method);
      return;
    }
    // Wrong kind of reader connected — drop it before connecting the right one.
    if (connectedReader) {
      console.log('[Stripe] Disconnecting mismatched reader before', method);
      try { await disconnectReader(); } catch {}
    }

    await requestTerminalPermissions(method);

    statusRef.current = callbacks?.onStatus ?? null;
    savedSerial.current = method === 'bluetoothScan' ? await AsyncStorage.getItem(LAST_READER_KEY).catch(() => null) : null;
    latestReaders.current = [];

    callbacks?.onDiscovering?.();
    const reader = await discoverFirstReader(method);
    console.log('[Stripe] Reader found:', (reader as any).label ?? (reader as any).serialNumber ?? method);

    try { await cancelDiscovering(); } catch {}

    callbacks?.onConnecting?.();
    const { reader: conn, error } = await connectReader(method === 'tapToPay'
      ? {
          discoveryMethod: 'tapToPay', reader, locationId,
          // Allow Stripe to present its terms on a device's first connection.
          tosAcceptancePermitted: true,
          autoReconnectOnUnexpectedDisconnect: false,
        }
      : {
          discoveryMethod: 'bluetoothScan', reader, locationId,
          autoReconnectOnUnexpectedDisconnect: false,
        });
    statusRef.current = null;
    if (error || !conn) throw new Error(error?.message ?? 'Failed to connect to reader');
    console.log('[Stripe] Reader connected', method);
    if (method === 'bluetoothScan') {
      const serial = serialOf(conn as Reader.Type);
      if (serial) AsyncStorage.setItem(LAST_READER_KEY, serial).catch(() => {});
    }
  };

  /**
   * Aborts any in-progress discovery and clears the resolver.
   * Safe to call at any time — all errors are swallowed.
   */
  const cancelDiscovery = async (): Promise<void> => {
    firstReaderResolver.current = null;
    if (settleTimer.current) { clearTimeout(settleTimer.current); settleTimer.current = null; }
    try { await cancelDiscovering(); } catch {}
  };

  return { discoverAndConnect, cancelDiscovery };
}
