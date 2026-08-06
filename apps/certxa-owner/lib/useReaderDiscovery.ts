/**
 * useReaderDiscovery.ts
 *
 * Encapsulates M2 Bluetooth reader discovery and connection.
 *
 * Motivation: the BLE permission request + scan + connect flow was duplicated
 * verbatim between `runM2Payment` (payment path) and `runDiscoverAndConnect`
 * (pre-pair rescan popup). This hook eliminates that duplication, mirrors the
 * MainViewModel pattern from stripe-samples/terminal-apps-on-devices, and
 * gives each call-site phase-update callbacks so the UI transitions stay crisp.
 */

import { useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import * as Location from 'expo-location';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import type { Reader } from '@stripe/stripe-terminal-react-native';

const { PERMISSIONS, RESULTS, requestMultiple } = PermissionsAndroid;

const DISCOVERY_TIMEOUT_MS = 20_000;

export interface DiscoveryCallbacks {
  /** Called after permissions pass, just before scanning starts. */
  onDiscovering?: () => void;
  /** Called after the reader is found, just before connecting. */
  onConnecting?:  () => void;
}

/**
 * Hook that owns M2 reader discovery and connection state.
 * Must be rendered inside <StripeTerminalProvider>.
 */
export function useReaderDiscovery() {
  // Resolver is stored in a ref so the onUpdateDiscoveredReaders callback
  // can resolve the Promise without stale-closure issues.
  const firstReaderResolver = useRef<((r: Reader.Type) => void) | null>(null);

  const { discoverReaders, connectReader, cancelDiscovering, connectedReader } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers: Reader.Type[]) => {
      if (readers.length > 0 && firstReaderResolver.current) {
        firstReaderResolver.current(readers[0]);
        firstReaderResolver.current = null;
      }
    },
  });

  // ── Permission helpers ────────────────────────────────────────────────────────

  /**
   * Request ACCESS_FINE_LOCATION, BLUETOOTH_SCAN, and BLUETOOTH_CONNECT in a
   * single PermissionsAndroid.requestMultiple() call, then verify the device's
   * global Location Services switch is on.
   *
   * All three must be granted before discoverReaders() is called:
   *  - ACCESS_FINE_LOCATION  — required by Stripe Terminal on all Android versions
   *  - BLUETOOTH_SCAN        — required on Android 12+ (API 31+) to scan for BLE devices
   *  - BLUETOOTH_CONNECT     — required on Android 12+ (API 31+) to connect a reader
   *
   * The Stripe SDK also throws "Location services must be enabled to use Terminal"
   * when the system-level Location toggle is off even if the permission is granted,
   * so we check (and optionally prompt) for that too.
   */
  const requestTerminalPermissions = async (): Promise<void> => {
    if (Platform.OS !== 'android') return;

    const version = Platform.Version as number;

    // Build the list of permissions to request — location is always needed,
    // BLE runtime permissions only exist on Android 12+ (API 31+).
    const perms: string[] = [PERMISSIONS.ACCESS_FINE_LOCATION];
    if (version >= 31) {
      perms.push(PERMISSIONS.BLUETOOTH_SCAN, PERMISSIONS.BLUETOOTH_CONNECT);
    }

    const results = await requestMultiple(perms as any);
    const granted = (p: string) => (results as any)[p] === RESULTS.GRANTED;

    if (!granted(PERMISSIONS.ACCESS_FINE_LOCATION)) {
      throw new Error(
        'Location permission is required to discover the M2 reader.\n\n' +
        'Go to Settings → Apps → Certxa → Permissions → Location and tap Allow.',
      );
    }
    if (version >= 31) {
      if (!granted(PERMISSIONS.BLUETOOTH_SCAN) || !granted(PERMISSIONS.BLUETOOTH_CONNECT)) {
        throw new Error(
          'Bluetooth permission is required to discover the M2 reader.\n\n' +
          'Go to Settings → Apps → Certxa → Permissions → Nearby Devices and tap Allow.',
        );
      }
    }

    // System-level Location Services switch — separate from the per-app permission.
    // Attempt the OS "Enable Location?" prompt, then re-check.
    const servicesOn = await Location.hasServicesEnabledAsync();
    if (!servicesOn) {
      try { await Location.enableNetworkProviderAsync(); } catch {}
      const nowOn = await Location.hasServicesEnabledAsync();
      if (!nowOn) {
        throw new Error(
          'Location Services are turned off on this device.\n\n' +
          'Go to Settings → Location and enable it, then try again.',
        );
      }
    }
  };

  // ── Discovery helpers ─────────────────────────────────────────────────────────

  /** Returns a Promise that resolves with the first discovered BLE reader, or rejects after timeout. */
  const discoverFirstReader = (): Promise<Reader.Type> =>
    new Promise<Reader.Type>((resolve, reject) => {
      firstReaderResolver.current = resolve;
      const timer = setTimeout(() => {
        firstReaderResolver.current = null;
        reject(new Error('No M2 reader found. Make sure it is powered on and in range.'));
      }, DISCOVERY_TIMEOUT_MS);

      discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: false })
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
   * Full M2 discover → connect flow.
   *
   * 1. Requests Android BLE + location permissions.
   * 2. Fires `callbacks.onDiscovering()` then scans for the nearest reader (20 s timeout).
   * 3. Fires `callbacks.onConnecting()` then connects to the found reader.
   *
   * Throws on any failure so callers can catch and update UI error state.
   */
  const discoverAndConnect = async (
    locationId: string,
    callbacks?: DiscoveryCallbacks,
  ): Promise<void> => {
    // If a reader is already connected, skip discovery entirely.
    if (connectedReader) {
      console.log('[Stripe] Reader already connected:', (connectedReader as any).label ?? (connectedReader as any).serialNumber ?? 'unknown');
      return;
    }

    await requestTerminalPermissions();

    callbacks?.onDiscovering?.();
    const reader = await discoverFirstReader();
    console.log('[Stripe] Reader found:', (reader as any).label ?? (reader as any).serialNumber ?? 'unknown');

    try { await cancelDiscovering(); } catch {}

    callbacks?.onConnecting?.();
    const { reader: conn, error } = await connectReader({
      discoveryMethod: 'bluetoothScan',
      reader,
      locationId,
      autoReconnectOnUnexpectedDisconnect: false,
    });
    if (error || !conn) throw new Error(error?.message ?? 'Failed to connect to reader');
    console.log('[Stripe] Reader connected');
  };

  /**
   * Aborts any in-progress discovery and clears the resolver.
   * Safe to call at any time — all errors are swallowed.
   */
  const cancelDiscovery = async (): Promise<void> => {
    firstReaderResolver.current = null;
    try { await cancelDiscovering(); } catch {}
  };

  return { discoverAndConnect, cancelDiscovery };
}
