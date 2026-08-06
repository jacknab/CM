/**
 * stripe-diagnostics.tsx
 *
 * Hidden developer screen — shows the live Stripe Terminal SDK state at every
 * step of the initialization → discovery → connection → payment lifecycle.
 *
 * Access: tap the invisible 44×44 target in the top-left corner of the main
 * screen 7 times within 3 seconds.
 *
 * Reads the real SDK flags (isInitialized from StripeTerminalContext, not a
 * heuristic) plus the lifecycle events written to terminalDiag by _layout.tsx.
 */

import React, { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useStripeTerminal, Reader, PaymentIntent } from '@stripe/stripe-terminal-react-native';
import { Ionicons } from '@expo/vector-icons';
import { terminalDiag } from '@/lib/terminalDiag';
import { apiCaller } from '@/lib/terminalBridge';
import { Colors } from '@/constants/colors';

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skip';

interface TestStep {
  id: string;
  label: string;
  status: StepStatus;
  detail: string;
}

const INITIAL_STEPS: TestStep[] = [
  { id: 'bridge',    label: 'Bridge ready',              status: 'pending', detail: '' },
  { id: 'token',     label: 'Connection token obtainable', status: 'pending', detail: '' },
  { id: 'sdk',       label: 'SDK initialized',            status: 'pending', detail: '' },
  { id: 'discover',  label: 'Reader discovery',           status: 'pending', detail: '' },
  { id: 'connect',   label: 'Reader connected',           status: 'pending', detail: '' },
  { id: 'intent',    label: 'PaymentIntent created',      status: 'pending', detail: '' },
  { id: 'collect',   label: 'collectPaymentMethod()',     status: 'pending', detail: '' },
  { id: 'process',   label: 'processPayment()',           status: 'pending', detail: '' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(ts: number | null): string {
  if (ts === null) return '—';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s ago`;
}

function fmtBattery(val: number | null | undefined): string {
  if (val == null) return '—';
  return `${Math.round(val * 100)}%`;
}

// ─── useDiag — subscribes to the module-level diagnostic store ────────────────

function useDiag() {
  return useSyncExternalStore(
    cb => terminalDiag.subscribe(cb),
    () => ({ ...terminalDiag }),
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StripeDiagnosticsScreen() {
  const router = useRouter();
  const diag   = useDiag();

  // ── SDK state from the real context (not inferred) ──────────────────────────
  const [connectionStatus, setConnectionStatus] = useState<string>('not_connected');
  const [discoveredReaders, setDiscoveredReaders] = useState<Reader.Type[]>([]);
  const [lastSdkError,   setLastSdkError]   = useState('');
  const [lastReaderErr,  setLastReaderErr]  = useState('');

  // ── Self-test state ─────────────────────────────────────────────────────────
  const [steps,      setSteps]      = useState<TestStep[]>(INITIAL_STEPS);
  const [testRunning, setTestRunning] = useState(false);
  const testAbort    = useRef(false);

  // Full PI object kept for cleanup — cancelPaymentIntent requires the object, not just an id
  const pendingPI    = useRef<PaymentIntent.Type | null>(null);

  const {
    isInitialized,
    connectedReader,
    discoverReaders,
    cancelDiscovering,
    connectReader,
    disconnectReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
    cancelPaymentIntent,
    getIsInitialized,
  } = useStripeTerminal({
    onDidChangeConnectionStatus: (status: string) => {
      console.log('[Stripe] onDidChangeConnectionStatus →', status);
      setConnectionStatus(status);
      if (status === 'not_connected') {
        console.warn('[Stripe] Reader disconnected');
      } else if (status === 'connecting') {
        console.log('[Stripe] Reader reconnecting…');
      }
    },
    onUpdateDiscoveredReaders: (readers: Reader.Type[]) => {
      setDiscoveredReaders(readers);
    },
    onDidReportReaderSoftwareUpdateProgress: () => {},
  });

  // ── Sync connection status on mount from connected reader ───────────────────
  useEffect(() => {
    if (connectedReader) setConnectionStatus('connected');
  }, [connectedReader]);

  // ── Step updater helpers ────────────────────────────────────────────────────
  const setStep = useCallback((id: string, status: StepStatus, detail = '') => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, detail } : s));
  }, []);

  // ── Self-test runner ────────────────────────────────────────────────────────
  const runSelfTest = useCallback(async () => {
    if (testRunning) return;
    testAbort.current = false;
    setSteps(INITIAL_STEPS);
    setTestRunning(true);
    setLastSdkError('');
    setLastReaderErr('');

    const abort = () => testAbort.current;

    // 1. Bridge
    setStep('bridge', 'running');
    try {
      // Try a cheap probe — getIsInitialized() is synchronous and safe to call
      // even before init, so we use the bridge flag instead.
      if (terminalDiag.providerMounted.occurred) {
        setStep('bridge', 'pass', 'StripeTerminalProvider mounted');
      } else {
        setStep('bridge', 'fail', 'Provider has not mounted yet');
      }
    } catch (e: any) {
      setStep('bridge', 'fail', e?.message ?? String(e));
    }
    if (abort()) { setTestRunning(false); return; }

    // 2. Connection token
    setStep('token', 'running');
    let tokenOk = false;
    try {
      const res = await apiCaller.call('/api/payments/terminal/connection-token', 'POST');
      if (!res?.secret) throw new Error(res?.error ?? 'No secret returned');
      tokenOk = true;
      setStep('token', 'pass', 'Secret received from server');
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setLastSdkError(msg);
      setStep('token', 'fail', msg);
    }
    if (abort() || !tokenOk) { setTestRunning(false); return; }

    // 3. SDK initialized
    setStep('sdk', 'running');
    // Poll for up to 15 s — the SDK initializes asynchronously after tokenProvider resolves
    const sdkDeadline = Date.now() + 15_000;
    let initialized = false;
    while (Date.now() < sdkDeadline) {
      if (getIsInitialized()) { initialized = true; break; }
      await new Promise<void>(r => setTimeout(r, 300));
      if (abort()) { setTestRunning(false); return; }
    }
    if (initialized) {
      setStep('sdk', 'pass', 'isInitialized = true (from StripeTerminalContext)');
    } else {
      setStep('sdk', 'fail', 'SDK not initialized after 15 s — tokenProvider may have failed');
      setLastSdkError('SDK did not initialize within 15 s');
      setTestRunning(false);
      return;
    }

    // 4. Reader discovery (real M2, 20 s scan)
    setStep('discover', 'running', 'Scanning for M2 (Bluetooth)…');
    let foundReader: Reader.Type | null = null;
    try {
      const found = await new Promise<Reader.Type | null>((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => { if (!resolved) { resolved = true; resolve(null); } }, 20_000);

        discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: false })
          .catch(() => { if (!resolved) { resolved = true; clearTimeout(timeout); resolve(null); } });

        // Poll discoveredReaders — onUpdateDiscoveredReaders updates local state
        // but we need to subscribe in-closure; use a polling interval instead.
        const poll = setInterval(async () => {
          // Access fresh discovered readers via a ref-like approach
          if (testAbort.current) { clearInterval(poll); clearTimeout(timeout); resolved = true; resolve(null); return; }
        }, 500);

        // Listen via the state setter — we resolve the first time we get readers
        setDiscoveredReaders(prev => {
          if (prev.length > 0 && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            clearInterval(poll);
            resolve(prev[0]);
          }
          return prev;
        });

        // Re-check every 500ms using closure on the setter
        const recheckInterval = setInterval(() => {
          setDiscoveredReaders(prev => {
            if (prev.length > 0 && !resolved) {
              resolved = true;
              clearTimeout(timeout);
              clearInterval(recheckInterval);
              resolve(prev[0]);
            }
            return prev;
          });
        }, 500);

        // Ensure we clean up the interval when timeout fires
        setTimeout(() => clearInterval(recheckInterval), 20_500);
      });

      foundReader = found;
    } catch (e: any) {
      foundReader = null;
    }

    try { await cancelDiscovering(); } catch {}

    if (!foundReader) {
      setStep('discover', 'fail', 'No M2 reader found within 20 s — ensure it is powered on and in range');
      setLastReaderErr('No reader found during scan');
      setTestRunning(false);
      return;
    }
    const readerLabel = (foundReader as any).label ?? (foundReader as any).serialNumber ?? 'Reader';
    setStep('discover', 'pass', `Found: ${readerLabel}`);

    if (abort()) { setTestRunning(false); return; }

    // 5. Connect reader
    setStep('connect', 'running', `Connecting to ${readerLabel}…`);
    let connectedOk = false;
    try {
      const locRes = await apiCaller.call('/api/payments/terminal/location', 'GET');
      if (!locRes?.locationId) throw new Error('Could not get terminal location from server');
      const { reader: conn, error: connErr } = await connectReader({
        discoveryMethod: 'bluetoothScan',
        reader: foundReader,
        locationId: locRes.locationId,
        autoReconnectOnUnexpectedDisconnect: false,
      });
      if (connErr || !conn) throw new Error(connErr?.message ?? 'connectReader returned no reader');
      connectedOk = true;
      setStep('connect', 'pass', `Connected: ${(conn as any).label ?? (conn as any).serialNumber}`);
      setConnectionStatus('connected');
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setLastReaderErr(msg);
      setStep('connect', 'fail', msg);
      setTestRunning(false);
      return;
    }

    if (abort() || !connectedOk) { setTestRunning(false); return; }

    // 6. Create PaymentIntent (1 cent, USD)
    setStep('intent', 'running');
    let clientSecret = '';
    let piId = '';
    try {
      const r = await apiCaller.call('/api/payments/terminal/create-payment-intent', 'POST', {
        amountCents: 1, currency: 'usd', appointmentId: null, clientName: 'Stripe Diagnostics Self-Test',
      });
      if (!r?.clientSecret) throw new Error(r?.error ?? 'No clientSecret returned');
      clientSecret = r.clientSecret;
      piId = r.paymentIntentId ?? '';
      setStep('intent', 'pass', 'PI created (1¢)');
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setLastSdkError(msg);
      setStep('intent', 'fail', msg);
      setTestRunning(false);
      return;
    }

    // 7. Retrieve + collect payment method
    // Retrieve first so we have a PaymentIntent.Type for cancellation if needed.
    setStep('collect', 'running', 'Retrieving PI…');
    let retrievedPI: PaymentIntent.Type | null = null;
    let collectedPI: PaymentIntent.Type | null = null;
    try {
      const { paymentIntent, error: retErr } = await retrievePaymentIntent(clientSecret);
      if (retErr || !paymentIntent) throw new Error(retErr?.message ?? 'retrievePaymentIntent failed');
      retrievedPI = paymentIntent;
      pendingPI.current = retrievedPI;

      if (abort()) {
        try { await cancelPaymentIntent({ paymentIntent: retrievedPI }); } catch {}
        pendingPI.current = null;
        setTestRunning(false); return;
      }

      setStep('collect', 'running', 'Present card / tap on the M2 reader…');
      const { paymentIntent: collected, error: collectErr } = await collectPaymentMethod({ paymentIntent });
      if (collectErr || !collected) throw new Error(collectErr?.message ?? 'collectPaymentMethod failed or cancelled');
      collectedPI = collected;
      setStep('collect', 'pass', 'Card data collected');
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setLastSdkError(msg);
      setStep('collect', 'fail', msg);
      if (retrievedPI) { try { await cancelPaymentIntent({ paymentIntent: retrievedPI }); } catch {} }
      pendingPI.current = null;
      setTestRunning(false);
      return;
    }

    if (abort()) {
      try { await cancelCollectPaymentMethod(); } catch {}
      if (retrievedPI) { try { await cancelPaymentIntent({ paymentIntent: retrievedPI }); } catch {} }
      pendingPI.current = null;
      setTestRunning(false); return;
    }

    // 8. Confirm (process) payment
    setStep('process', 'running');
    try {
      const { paymentIntent: confirmed, error: confirmErr } = await confirmPaymentIntent({ paymentIntent: collectedPI! });
      if (confirmErr || !confirmed) throw new Error(confirmErr?.message ?? 'confirmPaymentIntent failed');
      pendingPI.current = null;
      // Capture on server
      if (piId) {
        try { await apiCaller.call('/api/payments/terminal/capture-payment-intent', 'POST', { paymentIntentId: piId }); } catch {}
      }
      setStep('process', 'pass', 'Payment processed & captured ✓');
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setLastSdkError(msg);
      setStep('process', 'fail', msg);
    }

    setTestRunning(false);
  }, [testRunning, discoverReaders, cancelDiscovering, connectReader,
      retrievePaymentIntent, collectPaymentMethod, confirmPaymentIntent,
      cancelCollectPaymentMethod, cancelPaymentIntent, getIsInitialized, setStep]);

  // Clean up if the user leaves mid-test
  useEffect(() => {
    return () => {
      testAbort.current = true;
      cancelDiscovering().catch(() => {});
      cancelCollectPaymentMethod().catch(() => {});
      if (pendingPI.current) {
        cancelPaymentIntent({ paymentIntent: pendingPI.current }).catch(() => {});
        pendingPI.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reader info helpers ─────────────────────────────────────────────────────
  const r = connectedReader as any;
  const readerName    = r?.label ?? r?.deviceType ?? '—';
  const readerSerial  = r?.serialNumber ?? '—';
  const readerBattery = fmtBattery(r?.batteryLevel);
  const readerFirmware = r?.softwareVersion ?? '—';

  const sdkVersion = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('@stripe/stripe-terminal-react-native/package.json').version as string;
    } catch { return '—'; }
  })();

  // ── Render helpers ──────────────────────────────────────────────────────────
  const statusColor = (status: StepStatus) => {
    if (status === 'pass')    return Colors.success;
    if (status === 'fail')    return Colors.error;
    if (status === 'running') return Colors.primary;
    if (status === 'skip')    return Colors.textMuted;
    return Colors.textSecondary;
  };

  const statusIcon = (status: StepStatus) => {
    if (status === 'pass')    return 'checkmark-circle';
    if (status === 'fail')    return 'close-circle';
    if (status === 'running') return 'ellipsis-horizontal-circle';
    if (status === 'skip')    return 'remove-circle-outline';
    return 'radio-button-off-outline';
  };

  const connColor = () => {
    if (connectionStatus === 'connected')    return Colors.success;
    if (connectionStatus === 'connecting')   return Colors.warning;
    if (connectionStatus === 'not_connected') return Colors.error;
    return Colors.textSecondary;
  };

  const BoolRow = ({ label, ok, sub }: { label: string; ok: boolean | null; sub?: string }) => (
    <View style={S.row}>
      <Text style={S.rowLabel}>{label}</Text>
      <View style={S.rowRight}>
        {ok === null
          ? <ActivityIndicator size="small" color={Colors.primary} />
          : <Text style={[S.rowValue, { color: ok ? Colors.success : Colors.error }]}>
              {ok ? 'YES' : 'NO'}
            </Text>
        }
        {!!sub && <Text style={S.rowSub}>{sub}</Text>}
      </View>
    </View>
  );

  const TextRow = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <View style={S.row}>
      <Text style={S.rowLabel}>{label}</Text>
      <Text style={[S.rowValue, color ? { color } : {}]}>{value || '—'}</Text>
    </View>
  );

  const Section = ({ title }: { title: string }) => (
    <Text style={S.sectionTitle}>{title}</Text>
  );

  return (
    <SafeAreaView style={S.safe}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => router.back()} style={S.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Stripe Terminal Diagnostics</Text>
        <Text style={S.sdkVersion}>SDK {sdkVersion}</Text>
      </View>

      <ScrollView style={S.scroll} contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>

        {/* ── SDK Lifecycle ── */}
        <Section title="SDK LIFECYCLE" />
        <View style={S.card}>
          <BoolRow
            label="Provider Mounted"
            ok={diag.providerMounted.occurred}
            sub={diag.providerMounted.at ? elapsed(diag.providerMounted.at) : undefined}
          />
          <BoolRow
            label="Bridge Ready"
            ok={diag.providerMounted.occurred /* bridge becomes ready when provider mounts */}
          />
          <BoolRow
            label="Token Requested"
            ok={diag.tokenRequested.occurred}
            sub={diag.tokenRequested.at ? elapsed(diag.tokenRequested.at) : undefined}
          />
          <BoolRow
            label="Token Received"
            ok={diag.tokenReceived.occurred ? true : diag.tokenReceived.error ? false : null}
            sub={diag.tokenReceived.error ?? (diag.tokenReceived.at ? elapsed(diag.tokenReceived.at) : undefined)}
          />
          <BoolRow
            label="SDK Initialized"
            ok={isInitialized /* ← real flag from StripeTerminalContext, not a heuristic */}
            sub={isInitialized ? (diag.sdkInitialized.at ? elapsed(diag.sdkInitialized.at) : 'isInitialized = true') : (diag.sdkInitialized.error ?? 'isInitialized = false')}
          />
        </View>

        {/* ── Reader State ── */}
        <Section title="READER STATE" />
        <View style={S.card}>
          <TextRow
            label="Connection Status"
            value={connectionStatus.replace('_', ' ').toUpperCase()}
            color={connColor()}
          />
          <TextRow label="Reader Name"     value={readerName} />
          <TextRow label="Serial Number"   value={readerSerial} />
          <TextRow label="Battery"         value={readerBattery} />
          <TextRow label="Firmware"        value={readerFirmware} />
          <TextRow label="Discovery Method" value={connectedReader ? 'Bluetooth (M2)' : '—'} />
          {discoveredReaders.length > 0 && (
            <View style={S.discoveredBox}>
              <Text style={S.discoveredTitle}>Discovered ({discoveredReaders.length})</Text>
              {discoveredReaders.map((rd, i) => (
                <Text key={i} style={S.discoveredItem}>
                  • {(rd as any).label ?? (rd as any).serialNumber ?? `Reader ${i + 1}`}
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* ── Errors ── */}
        <Section title="LAST ERRORS" />
        <View style={S.card}>
          <TextRow
            label="SDK Error"
            value={lastSdkError || diag.sdkInitialized.error || '—'}
            color={lastSdkError ? Colors.error : undefined}
          />
          <TextRow
            label="Reader Error"
            value={lastReaderErr || '—'}
            color={lastReaderErr ? Colors.error : undefined}
          />
          <TextRow
            label="Init Error"
            value={diag.sdkInitialized.error || '—'}
            color={diag.sdkInitialized.error ? Colors.error : undefined}
          />
          <TextRow
            label="Token Error"
            value={diag.tokenReceived.error || '—'}
            color={diag.tokenReceived.error ? Colors.error : undefined}
          />
        </View>

        {/* ── Self Test ── */}
        <Section title="SELF TEST" />
        <TouchableOpacity
          style={[S.testBtn, testRunning && S.testBtnDisabled]}
          onPress={runSelfTest}
          disabled={testRunning}
          activeOpacity={0.8}
        >
          {testRunning
            ? <><ActivityIndicator color="#fff" size="small" /><Text style={S.testBtnTxt}>  Running…</Text></>
            : <Text style={S.testBtnTxt}>▶  Run Stripe Self Test</Text>
          }
        </TouchableOpacity>

        {testRunning && (
          <TouchableOpacity style={S.abortBtn} onPress={() => { testAbort.current = true; }}>
            <Text style={S.abortBtnTxt}>Abort Test</Text>
          </TouchableOpacity>
        )}

        <View style={S.card}>
          {steps.map(step => (
            <View key={step.id} style={S.stepRow}>
              {step.status === 'running'
                ? <ActivityIndicator size="small" color={Colors.primary} style={S.stepIcon} />
                : <Ionicons
                    name={statusIcon(step.status) as any}
                    size={18}
                    color={statusColor(step.status)}
                    style={S.stepIcon}
                  />
              }
              <View style={S.stepText}>
                <Text style={[S.stepLabel, { color: statusColor(step.status) }]}>{step.label}</Text>
                {!!step.detail && <Text style={S.stepDetail}>{step.detail}</Text>}
              </View>
            </View>
          ))}
        </View>

        {/* Spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.border },
  backBtn: { marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.text },
  sdkVersion:  { fontSize: 11, color: Colors.textMuted },

  scroll:   { flex: 1 },
  content:  { padding: 16, gap: 8 },

  sectionTitle: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.4, marginTop: 12, marginBottom: 4 },

  card: { backgroundColor: Colors.card, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },

  row:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  rowLabel: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  rowRight: { alignItems: 'flex-end' },
  rowValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
  rowSub:   { fontSize: 10, color: Colors.textMuted, marginTop: 1 },

  discoveredBox:   { paddingHorizontal: 14, paddingVertical: 10 },
  discoveredTitle: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  discoveredItem:  { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  testBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, marginBottom: 8,
  },
  testBtnDisabled: { opacity: 0.6 },
  testBtnTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  abortBtn: { alignItems: 'center', marginBottom: 8 },
  abortBtnTxt: { fontSize: 13, color: Colors.error },

  stepRow:    { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  stepIcon:   { marginTop: 1, marginRight: 10, width: 18 },
  stepText:   { flex: 1 },
  stepLabel:  { fontSize: 13, fontWeight: '600' },
  stepDetail: { fontSize: 11, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },
});
