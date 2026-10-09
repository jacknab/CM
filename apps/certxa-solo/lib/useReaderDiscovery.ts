/**
 * useReaderDiscovery.ts — iOS-only trim of certxa-owner's hook of the same
 * name (which also had to handle Android's PermissionsAndroid runtime BLE
 * permissions). On iOS, Bluetooth access is granted via the system prompt
 * triggered by NSBluetoothAlwaysUsageDescription in app.json — no explicit
 * runtime request call is needed, only the location permission Stripe
 * Terminal itself requires.
 *
 * Supports both discovery methods this app uses:
 *   - 'bluetoothScan' — Stripe M2 Bluetooth reader
 *   - 'tapToPay'       — Tap to Pay on iPhone (no reader)
 */

import { useRef } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import type { Reader } from '@stripe/stripe-terminal-react-native';
import { updateProgressPrompt, UPDATE_STARTING_PROMPT } from './readerPrompts';

const DISCOVERY_TIMEOUT_MS = 20_000;
/** Tap to Pay resolves the local "reader" almost instantly — shorter wait. */
const TAP_DISCOVERY_TIMEOUT_MS = 12_000;

export type DiscoveryMethod = 'bluetoothScan' | 'tapToPay';

/** Serial number of the M2 that last connected — preferred on the next scan. */
const LAST_READER_KEY = 'certxa_last_m2_serial';
/** After the first reader appears, wait this long for others before picking one. */
const SETTLE_MS = 2_000;

export interface DiscoveryCallbacks {
  onDiscovering?: () => void;
  onConnecting?: () => void;
  onStatus?: (msg: string) => void;
}

/** Hook that owns M2/Tap to Pay discovery and connection state. Must be rendered inside <StripeTerminalProvider>. */
export function useReaderDiscovery() {
  const firstReaderResolver = useRef<((r: Reader.Type) => void) | null>(null);
  const savedSerial = useRef<string | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestReaders = useRef<Reader.Type[]>([]);
  const statusRef = useRef<((msg: string) => void) | null>(null);

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
      const preferred = savedSerial.current ? readers.find((r) => serialOf(r) === savedSerial.current) : undefined;
      if (preferred) { done(preferred); return; }
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

  /** Stripe Terminal requires location services on for both discovery methods. */
  const requestTerminalPermissions = async (): Promise<void> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error(
        'Location permission is required to accept card payments.\n\n' +
        'Go to Settings → Certxa Solo → Location and allow access.',
      );
    }
    const servicesOn = await Location.hasServicesEnabledAsync();
    if (!servicesOn) {
      throw new Error(
        'Location Services are turned off on this device.\n\n' +
        'Go to Settings → Privacy & Security → Location Services and enable it, then try again.',
      );
    }
  };

  const discoverFirstReader = (method: DiscoveryMethod): Promise<Reader.Type> =>
    new Promise<Reader.Type>((resolve, reject) => {
      firstReaderResolver.current = resolve;
      const timer = setTimeout(() => {
        firstReaderResolver.current = null;
        reject(new Error(
          method === 'tapToPay'
            ? 'Tap to Pay is not available on this device.\n\nIt needs iOS 16.7+, an iPhone XS or newer, NFC turned on, and the Tap to Pay capability enabled on your Stripe account.'
            : 'No M2 reader found.\n\nMake sure it is powered on, close to this device, and Bluetooth is turned on. Do NOT pair it in iOS Bluetooth settings — Certxa connects to it directly.',
        ));
      }, method === 'tapToPay' ? TAP_DISCOVERY_TIMEOUT_MS : DISCOVERY_TIMEOUT_MS);

      discoverReaders({ discoveryMethod: method, simulated: false } as any)
        .then((res) => {
          if (res?.error && firstReaderResolver.current) {
            clearTimeout(timer);
            firstReaderResolver.current = null;
            reject(new Error(res.error.message));
          }
        })
        .catch((e) => {
          if (firstReaderResolver.current) {
            clearTimeout(timer);
            firstReaderResolver.current = null;
            reject(e);
          }
        });
    });

  /**
   * Full discover → connect flow for either method. If a reader of a
   * *different* method is already connected it is disconnected first (the
   * SDK allows only one connection at a time).
   */
  const discoverAndConnect = async (
    locationId: string,
    method: DiscoveryMethod,
    callbacks?: DiscoveryCallbacks,
  ): Promise<void> => {
    const wantTap = method === 'tapToPay';
    const connectedIsTap = (connectedReader as any)?.deviceType === 'tapToPay';

    if (connectedReader && connectedIsTap === wantTap) {
      console.log('[Stripe] Reader already connected:', (connectedReader as any).label ?? (connectedReader as any).serialNumber ?? method);
      return;
    }
    if (connectedReader) {
      console.log('[Stripe] Disconnecting mismatched reader before', method);
      try { await disconnectReader(); } catch {}
    }

    await requestTerminalPermissions();

    statusRef.current = callbacks?.onStatus ?? null;
    savedSerial.current = method === 'bluetoothScan' ? await AsyncStorage.getItem(LAST_READER_KEY).catch(() => null) : null;
    latestReaders.current = [];

    callbacks?.onDiscovering?.();
    const reader = await discoverFirstReader(method);
    console.log('[Stripe] Reader found:', (reader as any).label ?? (reader as any).serialNumber ?? method);

    try { await cancelDiscovering(); } catch {}

    callbacks?.onConnecting?.();
    const { reader: conn, error } = await connectReader({
      discoveryMethod: method,
      reader,
      locationId,
      autoReconnectOnUnexpectedDisconnect: false,
    } as any);
    statusRef.current = null;
    if (error || !conn) throw new Error(error?.message ?? 'Failed to connect to reader');
    console.log('[Stripe] Reader connected', method);
    if (method === 'bluetoothScan') {
      const serial = serialOf(conn as Reader.Type);
      if (serial) AsyncStorage.setItem(LAST_READER_KEY, serial).catch(() => {});
    }
  };

  /** Aborts any in-progress discovery and clears the resolver. Safe to call at any time. */
  const cancelDiscovery = async (): Promise<void> => {
    firstReaderResolver.current = null;
    if (settleTimer.current) { clearTimeout(settleTimer.current); settleTimer.current = null; }
    try { await cancelDiscovering(); } catch {}
  };

  return { discoverAndConnect, cancelDiscovery };
}
