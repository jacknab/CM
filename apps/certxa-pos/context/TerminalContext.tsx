/**
 * TerminalContext — Stripe Terminal lifecycle & live connection state
 *
 * Single source of truth for:
 *   - terminalInitialized / terminalInitializing / terminalError
 *   - connectedReader      (null until SDK confirms connected — NEVER from AsyncStorage)
 *   - connectionStatus     ('notConnected' | 'connecting' | 'connected')
 *   - discoveredReaders    (live list from discoverReaders())
 *
 * On startup: connectedReader = null, connectionStatus = 'notConnected'
 * The SDK's onDidChangeConnectionStatus drives all connection-state updates.
 * No state is ever read from AsyncStorage, Redux, or local storage here.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchConnectionToken } from '@/lib/api';

// ---------------------------------------------------------------------------
// SDK lazy-load — only available in EAS Dev Client builds (not Expo Go / web)
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let StripeTerminal: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  StripeTerminal = require('@stripe/stripe-terminal-react-native').StripeTerminal;
} catch { /* not installed — simulated mode active */ }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionStatus = 'notConnected' | 'connecting' | 'connected';

/** Minimal reader shape used in simulated mode; mirrors SDK Reader.Type */
export interface TerminalReader {
  id: string;
  name: string;
  serialNumber: string;
  batteryLevel?: number;
  firmwareVersion?: string;
  /** SDK field; simulated readers always 'bluetooth' */
  deviceType?: string;
  [key: string]: unknown;
}

type TerminalState = {
  // ── Initialization ────────────────────────────────────────────────────────
  terminalInitialized: boolean;
  terminalInitializing: boolean;
  terminalError: string | null;

  // ── Live SDK connection state (never stale) ───────────────────────────────
  /** Null on startup and whenever the reader is not confirmed connected by the SDK */
  connectedReader: TerminalReader | null;
  /** 'notConnected' by default; updated by onDidChangeConnectionStatus */
  connectionStatus: ConnectionStatus;
  /** Live list from the most recent discoverReaders() call */
  discoveredReaders: TerminalReader[];

  // ── Guarded actions (throw if not initialized) ────────────────────────────
  discoverReaders: (options?: Record<string, unknown>) => Promise<void>;
  connectReader: (reader: TerminalReader) => Promise<void>;
  disconnectReader: () => Promise<void>;
  collectPaymentMethod: (paymentIntentId: string) => Promise<void>;
  processPayment: (paymentIntentId: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Simulated readers (non-EAS / Expo Go environments)
// ---------------------------------------------------------------------------

const SIMULATED_READERS: TerminalReader[] = [
  {
    id: 'strpe_m2_sim_001',
    name: 'Stripe Reader M2',
    serialNumber: 'STR-M2-A4E9B1',
    batteryLevel: 82,
    firmwareVersion: '2.28.1.0',
    deviceType: 'bluetooth',
  },
  {
    id: 'bbpos_cp2_sim_002',
    name: 'BBPOS Chipper 2X BT',
    serialNumber: 'CHB-7F2D-0023',
    batteryLevel: 44,
    firmwareVersion: '1.9.6',
    deviceType: 'bluetooth',
  },
];

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TerminalContext = createContext<TerminalState>({
  terminalInitialized: false,
  terminalInitializing: false,
  terminalError: null,
  connectedReader: null,
  connectionStatus: 'notConnected',
  discoveredReaders: [],
  discoverReaders: async () => {},
  connectReader: async () => {},
  disconnectReader: async () => {},
  collectPaymentMethod: async () => {},
  processPayment: async () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // ── Initialization state ──────────────────────────────────────────────────
  const [terminalInitialized, setTerminalInitialized] = useState(false);
  const [terminalInitializing, setTerminalInitializing] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const initAttempted = useRef(false);

  // ── Live SDK connection state — defaults to disconnected ──────────────────
  // These are NEVER pre-populated from AsyncStorage or any persisted source.
  // They only change when the SDK (or simulation) reports a real state change.
  const [connectedReader, setConnectedReader] = useState<TerminalReader | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('notConnected');
  const [discoveredReaders, setDiscoveredReaders] = useState<TerminalReader[]>([]);

  // ── SDK subscription cleanup ref ──────────────────────────────────────────
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);

  // ── Initialize when a user session exists ─────────────────────────────────
  useEffect(() => {
    if (!user || initAttempted.current) return;
    initAttempted.current = true;

    async function init() {
      console.log('[Stripe Terminal] Starting initialization');
      setTerminalInitializing(true);
      setTerminalError(null);

      // Always start disconnected — never assume previous state survived
      setConnectedReader(null);
      setConnectionStatus('notConnected');
      setDiscoveredReaders([]);

      try {
        if (StripeTerminal) {
          const storeId = user?.storeId ?? 0;

          await StripeTerminal.initialize({
            fetchConnectionToken: () =>
              fetchConnectionToken(storeId).then((r: { secret: string }) => r.secret),
          });

          // ── Subscribe to connection-status changes (real SDK) ─────────────
          // This fires whenever the reader connects, disconnects, or powers off.
          if (typeof StripeTerminal.addListener === 'function') {
            subscriptionRef.current = StripeTerminal.addListener(
              'onDidChangeConnectionStatus',
              (event: { status: string; reader?: unknown }) => {
                console.log('[Stripe Terminal] onDidChangeConnectionStatus →', event.status);
                const status = event.status as ConnectionStatus;
                setConnectionStatus(status === 'connected' ? 'connected'
                  : status === 'connecting' ? 'connecting'
                  : 'notConnected');
                if (status !== 'connected') {
                  setConnectedReader(null);
                }
              },
            );
          }

          // ── Query actual reader state immediately after init ───────────────
          // Do NOT assume disconnected just because we don't know — ask the SDK.
          if (typeof StripeTerminal.getConnectedReader === 'function') {
            const reader = await StripeTerminal.getConnectedReader();
            if (reader) {
              console.log('[Stripe Terminal] getConnectedReader → already connected:', reader.id);
              setConnectedReader(reader as TerminalReader);
              setConnectionStatus('connected');
            } else {
              console.log('[Stripe Terminal] getConnectedReader → not connected');
              setConnectedReader(null);
              setConnectionStatus('notConnected');
            }
          }
        } else {
          // Simulated path — short delay, then confirmed not connected
          await new Promise<void>((r) => setTimeout(r, 300));
          // connectedReader = null, connectionStatus = 'notConnected' already set above
        }

        setTerminalInitialized(true);
        console.log('[Stripe Terminal] Initialization complete');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Terminal initialization failed';
        setTerminalError(msg);
        setConnectedReader(null);
        setConnectionStatus('notConnected');
        console.warn('[Stripe Terminal] Initialization failed:', msg);
      } finally {
        setTerminalInitializing(false);
      }
    }

    init();

    return () => {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Reset on logout ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      initAttempted.current = false;
      setTerminalInitialized(false);
      setTerminalInitializing(false);
      setTerminalError(null);
      setConnectedReader(null);
      setConnectionStatus('notConnected');
      setDiscoveredReaders([]);
    }
  }, [user]);

  // ── Guard helper ──────────────────────────────────────────────────────────
  const requireInitialized = useCallback(
    (action: string) => {
      if (!terminalInitialized) {
        console.warn(`[Stripe Terminal] Blocked "${action}" — SDK not initialized yet`);
        throw new Error(
          'First initialize the Stripe Terminal SDK before performing this action',
        );
      }
    },
    [terminalInitialized],
  );

  // ── discoverReaders ───────────────────────────────────────────────────────
  const discoverReaders = useCallback(
    async (options: Record<string, unknown> = {}) => {
      requireInitialized('discoverReaders');
      console.log('[Stripe Terminal] Reader discovery started');
      setDiscoveredReaders([]);

      if (StripeTerminal) {
        // Real SDK: discovered readers arrive via onDidUpdateDiscoveredReaders event.
        // Subscribe briefly to populate our list.
        let sub: { remove: () => void } | null = null;
        if (typeof StripeTerminal.addListener === 'function') {
          sub = StripeTerminal.addListener(
            'onDidUpdateDiscoveredReaders',
            (event: { readers: unknown[] }) => {
              setDiscoveredReaders((event.readers ?? []) as TerminalReader[]);
            },
          );
        }
        try {
          await StripeTerminal.discoverReaders(options);
        } finally {
          sub?.remove();
        }
      } else {
        // Simulated discovery — trickle readers in as if Bluetooth is scanning
        await new Promise<void>((r) => setTimeout(r, 900));
        setDiscoveredReaders([SIMULATED_READERS[0]]);
        await new Promise<void>((r) => setTimeout(r, 700));
        setDiscoveredReaders(SIMULATED_READERS);
      }
    },
    [requireInitialized],
  );

  // ── connectReader ─────────────────────────────────────────────────────────
  const connectReader = useCallback(
    async (reader: TerminalReader) => {
      requireInitialized('connectReader');
      setConnectionStatus('connecting');
      setDiscoveredReaders([]);

      try {
        if (StripeTerminal) {
          // Real SDK — connection status changes come through onDidChangeConnectionStatus
          await StripeTerminal.connectReader(reader);
          // connectedReader will be set by the onDidChangeConnectionStatus handler
        } else {
          // Simulated: update state to mirror what the SDK would do
          await new Promise<void>((r) => setTimeout(r, 1600));
          setConnectedReader(reader);
          setConnectionStatus('connected');
          console.log('[Stripe Terminal] Reader connected');
        }
      } catch (err) {
        setConnectionStatus('notConnected');
        setConnectedReader(null);
        throw err;
      }
    },
    [requireInitialized],
  );

  // ── disconnectReader ──────────────────────────────────────────────────────
  const disconnectReader = useCallback(async () => {
    try {
      if (StripeTerminal && typeof StripeTerminal.disconnectReader === 'function') {
        await StripeTerminal.disconnectReader();
        // SDK will fire onDidChangeConnectionStatus → notConnected
      }
    } finally {
      // Always clear local state — even if SDK call fails
      setConnectedReader(null);
      setConnectionStatus('notConnected');
    }
  }, []);

  // ── collectPaymentMethod ──────────────────────────────────────────────────
  const collectPaymentMethod = useCallback(
    async (paymentIntentId: string) => {
      requireInitialized('collectPaymentMethod');
      console.log('[Stripe Terminal] Payment started');
      if (StripeTerminal) {
        await StripeTerminal.collectPaymentMethod(paymentIntentId);
      }
      // Simulated path: caller adds its own delay for UI feedback
    },
    [requireInitialized],
  );

  // ── processPayment ────────────────────────────────────────────────────────
  const processPayment = useCallback(
    async (paymentIntentId: string) => {
      requireInitialized('processPayment');
      if (StripeTerminal) {
        await StripeTerminal.processPayment(paymentIntentId);
      }
    },
    [requireInitialized],
  );

  return (
    <TerminalContext.Provider
      value={{
        terminalInitialized,
        terminalInitializing,
        terminalError,
        connectedReader,
        connectionStatus,
        discoveredReaders,
        discoverReaders,
        connectReader,
        disconnectReader,
        collectPaymentMethod,
        processPayment,
      }}
    >
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal() {
  return useContext(TerminalContext);
}
