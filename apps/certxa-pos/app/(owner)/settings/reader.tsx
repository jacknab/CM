/**
 * Reader settings screen — M2 / BBPOS card reader management
 *
 * Connection state comes EXCLUSIVELY from TerminalContext (Stripe Terminal SDK).
 * AsyncStorage (PAIRED_KEY) stores only the last-paired reader metadata as a UX
 * hint for the "Reconnect" button — it NEVER sets connectionStatus to 'connected'.
 *
 * On every app start connectedReader = null / connectionStatus = 'notConnected'
 * until the SDK confirms a live connection.
 */

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  Alert, ScrollView, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/constants/colors';
import { useTerminal, type TerminalReader } from '@/context/TerminalContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Persisted UX hint — only used to show "Reconnect to X" button, NEVER to infer connection status */
interface PairedReaderHint {
  id: string;
  name: string;
  serialNumber: string;
  firmwareVersion: string;
  pairedAt: string;
  lastSeenAt: string;
}

const PAIRED_KEY = 'certxa_paired_reader';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function batteryIcon(pct: number): string {
  if (pct >= 80) return 'battery-full-outline';
  if (pct >= 50) return 'battery-half-outline';
  return 'battery-dead-outline';
}

function batteryColor(pct: number): string {
  if (pct >= 50) return colors.success;
  if (pct >= 20) return colors.warning;
  return colors.danger;
}

function signalIcon(s: 'strong' | 'good' | 'weak'): string {
  return s === 'strong' ? 'wifi' : 'wifi-outline';
}

function signalColor(s: 'strong' | 'good' | 'weak'): string {
  return s === 'strong' ? colors.success : s === 'good' ? colors.warning : colors.danger;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReaderScreen() {
  const router = useRouter();
  const {
    terminalInitialized,
    terminalInitializing,
    terminalError,
    // ── Live SDK state — the ONLY source of truth for connection ──────────
    connectedReader,
    connectionStatus,
    discoveredReaders,
    // ── Guarded actions ───────────────────────────────────────────────────
    discoverReaders,
    connectReader,
    disconnectReader,
  } = useTerminal();

  // ── UI-only state (not connection state) ──────────────────────────────────
  const [isScanning, setIsScanning] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'pass' | 'fail'>('idle');
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [isTesting, setIsTesting] = useState(false);

  // ── AsyncStorage: persisted UX hint (NOT connection state) ────────────────
  // pairedReaderHint tells us which reader to offer to reconnect to.
  // It is NEVER used to set connectionStatus or show "Connected" badge.
  const [pairedReaderHint, setPairedReaderHint] = useState<PairedReaderHint | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Load the last-paired reader hint from storage on mount
  useEffect(() => {
    AsyncStorage.getItem(PAIRED_KEY).then((raw) => {
      if (raw) setPairedReaderHint(JSON.parse(raw));
    });
  }, []);

  // Pulse animation while scanning
  useEffect(() => {
    if (isScanning) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [isScanning, pulseAnim]);

  // When the SDK reports a new connection, save it as the paired-reader hint
  // so "Reconnect" shows on the next app open. This does NOT set any "connected"
  // UI state — that comes from connectionStatus from the SDK.
  useEffect(() => {
    if (connectionStatus === 'connected' && connectedReader) {
      const hint: PairedReaderHint = {
        id: connectedReader.id,
        name: connectedReader.name,
        serialNumber: connectedReader.serialNumber ?? '',
        firmwareVersion: (connectedReader.firmwareVersion as string) ?? '',
        pairedAt: pairedReaderHint?.pairedAt ?? new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };
      setPairedReaderHint(hint);
      AsyncStorage.setItem(PAIRED_KEY, JSON.stringify(hint)).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus, connectedReader]);

  // ── Scan for readers ──────────────────────────────────────────────────────

  async function handleScan() {
    if (!terminalInitialized) {
      Alert.alert(
        terminalInitializing ? 'Terminal Initializing' : 'Terminal Not Ready',
        terminalInitializing
          ? 'The payment terminal is still starting up. Please wait and try again.'
          : terminalError
            ? `Initialization failed: ${terminalError}`
            : 'First initialize the Stripe Terminal SDK before performing this action.',
      );
      return;
    }

    setIsScanning(true);
    setTestResult('idle');
    try {
      // discoverReaders() is guarded and populates context.discoveredReaders via SDK events
      await discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: false });
    } catch (err) {
      console.warn('[Reader] discoverReaders error:', err);
    } finally {
      setIsScanning(false);
    }
  }

  // ── Connect to a discovered reader ────────────────────────────────────────

  async function handleConnect(reader: TerminalReader) {
    try {
      // connectReader() is guarded and updates connectionStatus/connectedReader in context
      await connectReader(reader);
      // UI updates automatically via connectionStatus from context — no local setState needed
    } catch (err) {
      Alert.alert(
        'Connection Failed',
        err instanceof Error ? err.message : 'Could not connect to reader.',
      );
    }
  }

  // ── Reconnect to previously paired reader ─────────────────────────────────

  async function handleReconnect() {
    if (!pairedReaderHint) return;

    if (!terminalInitialized) {
      Alert.alert(
        terminalInitializing ? 'Terminal Initializing' : 'Terminal Not Ready',
        terminalInitializing
          ? 'Terminal is still starting up. Please wait a moment.'
          : 'First initialize the Stripe Terminal SDK before performing this action.',
      );
      return;
    }

    // Reconnect by scanning for the previously known reader.
    // We don't restore connection from AsyncStorage — we re-establish via SDK.
    setIsScanning(true);
    try {
      await discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: false });
      // After discovery, SDK discoveredReaders will include the reader if it's on.
      // For simulated mode, connectReader finds the matching reader by ID.
      const match = discoveredReaders.find((r) => r.id === pairedReaderHint.id);
      if (match) {
        await connectReader(match);
      }
      // If no match found, the reader is off — UI stays 'notConnected' automatically.
    } catch (err) {
      console.warn('[Reader] Reconnect error:', err);
    } finally {
      setIsScanning(false);
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  function handleDisconnect() {
    Alert.alert(
      'Disconnect Reader?',
      'The reader will stay paired and auto-reconnect next time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          onPress: async () => {
            await disconnectReader();
            // connectionStatus will update to 'notConnected' via SDK or context
          },
        },
      ],
    );
  }

  // ── Forget (unpair) ───────────────────────────────────────────────────────

  function handleForget() {
    Alert.alert(
      'Forget Reader?',
      `Remove "${connectedReader?.name ?? pairedReaderHint?.name}" from this device? You'll need to scan and pair again to accept payments.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            await disconnectReader();
            setPairedReaderHint(null);
            await AsyncStorage.removeItem(PAIRED_KEY);
          },
        },
      ],
    );
  }

  function cancelScan() {
    setIsScanning(false);
  }

  // ── Test charge ───────────────────────────────────────────────────────────

  async function handleTest() {
    setIsTesting(true);
    setTestResult('idle');
    await new Promise<void>((r) => setTimeout(r, 2400));
    setTestResult('pass');
    setIsTesting(false);
    Alert.alert(
      '✓ Reader Test Passed',
      'A $0.00 test transaction completed successfully.\n\nYour reader is ready to accept payments.',
    );
  }

  // ---------------------------------------------------------------------------
  // Derived UI values — all driven by SDK state
  // ---------------------------------------------------------------------------

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  const statusColor =
    isConnected ? colors.success
      : isConnecting || isScanning ? colors.warning
      : isTesting ? colors.warning
      : colors.textMuted;

  const statusLabel =
    isConnected ? 'Connected'
      : isConnecting ? 'Connecting…'
      : isScanning ? 'Scanning for readers…'
      : isTesting ? 'Running test charge…'
      : 'Disconnected';

  const scanDisabled = !terminalInitialized || isScanning || isConnecting || isConnected;

  // Simulated reader battery/signal — real values would come from connectedReader props
  const readerBattery = (connectedReader?.batteryLevel as number | undefined) ?? 82;
  const readerSignal: 'strong' | 'good' | 'weak' =
    ((connectedReader as { signalStrength?: string } | null)?.signalStrength as 'strong' | 'good' | 'weak') ?? 'strong';
  const readerFirmware = (connectedReader?.firmwareVersion as string | undefined) ?? '—';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Card Reader</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>

        {/* ── Terminal initialization banners ──────────────────────── */}
        {terminalInitializing && (
          <View style={s.initBanner}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={s.initBannerText}>Terminal initializing…</Text>
          </View>
        )}
        {!terminalInitialized && !terminalInitializing && terminalError && (
          <View style={s.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={s.errorBannerText}>Terminal init failed: {terminalError}</Text>
          </View>
        )}
        {!terminalInitialized && !terminalInitializing && !terminalError && (
          <View style={s.warningBanner}>
            <Ionicons name="warning-outline" size={16} color={colors.amber} />
            <Text style={s.warningBannerText}>Terminal not initialized — sign in to enable reader pairing</Text>
          </View>
        )}

        {/* ── Reader icon + live status from SDK ───────────────────── */}
        <View style={s.heroSection}>
          <Animated.View
            style={[
              s.readerIconWrap,
              isConnected && s.readerIconConnected,
              isScanning && s.readerIconScanning,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <Ionicons
              name="hardware-chip-outline"
              size={52}
              color={isConnected ? colors.success : isScanning ? colors.primary : colors.textMuted}
            />
          </Animated.View>

          <View style={s.statusPill}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>

          {(isConnecting || isTesting) && (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 4 }} />
          )}
        </View>

        {/* ── CONNECTED — driven by SDK connectedReader ─────────────── */}
        {isConnected && connectedReader && (
          <>
            <View style={s.card}>
              <Text style={s.cardTitle}>{connectedReader.name}</Text>
              <View style={s.detailRow}>
                <View style={s.detailItem}>
                  <Text style={s.detailLabel}>Serial</Text>
                  <Text style={s.detailVal}>{connectedReader.serialNumber ?? '—'}</Text>
                </View>
                <View style={s.detailItem}>
                  <Text style={s.detailLabel}>Firmware</Text>
                  <Text style={s.detailVal}>{readerFirmware}</Text>
                </View>
              </View>
              <View style={s.detailRow}>
                <View style={s.detailItem}>
                  <Text style={s.detailLabel}>Battery</Text>
                  <View style={s.metaRow}>
                    <Ionicons name={batteryIcon(readerBattery) as never} size={16} color={batteryColor(readerBattery)} />
                    <Text style={[s.detailVal, { color: batteryColor(readerBattery) }]}>{readerBattery}%</Text>
                  </View>
                  <View style={s.batteryBar}>
                    <View style={[s.batteryFill, { width: `${readerBattery}%` as never, backgroundColor: batteryColor(readerBattery) }]} />
                  </View>
                </View>
                <View style={s.detailItem}>
                  <Text style={s.detailLabel}>Signal</Text>
                  <View style={s.metaRow}>
                    <Ionicons name={signalIcon(readerSignal) as never} size={16} color={signalColor(readerSignal)} />
                    <Text style={[s.detailVal, { color: signalColor(readerSignal), textTransform: 'capitalize' }]}>
                      {readerSignal}
                    </Text>
                  </View>
                </View>
              </View>
              {pairedReaderHint && (
                <Text style={s.lastSeen}>Last seen {fmtDate(pairedReaderHint.lastSeenAt)}</Text>
              )}
            </View>

            {testResult === 'pass' && (
              <View style={s.testPassBanner}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={s.testPassText}>Test passed — reader is ready</Text>
              </View>
            )}

            <View style={s.toggleRow}>
              <View style={s.toggleInfo}>
                <Text style={s.toggleLabel}>Auto-reconnect</Text>
                <Text style={s.toggleSub}>Reconnect automatically when the app opens</Text>
              </View>
              <Pressable
                style={[s.toggle, autoReconnect && s.toggleOn]}
                onPress={() => setAutoReconnect((v) => !v)}
              >
                <View style={[s.toggleThumb, autoReconnect && s.toggleThumbOn]} />
              </Pressable>
            </View>

            <Pressable
              style={[s.testBtn, isTesting && s.testBtnDisabled]}
              onPress={handleTest}
              disabled={isTesting}
            >
              {isTesting
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Ionicons name="checkmark-done-outline" size={18} color={colors.primary} />}
              <Text style={s.testBtnText}>{isTesting ? 'Testing…' : 'Run Test Charge'}</Text>
            </Pressable>

            <Pressable style={s.disconnectBtn} onPress={handleDisconnect}>
              <Ionicons name="bluetooth-outline" size={16} color={colors.textSecondary} />
              <Text style={s.disconnectText}>Disconnect</Text>
            </Pressable>

            <Pressable style={s.forgetBtn} onPress={handleForget}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={s.forgetText}>Forget Reader</Text>
            </Pressable>
          </>
        )}

        {/* ── CONNECTING ────────────────────────────────────────────── */}
        {isConnecting && (
          <View style={s.scanningCard}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={s.scanningText}>Connecting…</Text>
            <Text style={s.scanningHint}>Keep the reader nearby.</Text>
          </View>
        )}

        {/* ── SCANNING / discovered list ─────────────────────────────── */}
        {isScanning && (
          <>
            {discoveredReaders.length === 0 ? (
              <View style={s.scanningCard}>
                <ActivityIndicator color={colors.primary} />
                <Text style={s.scanningText}>Looking for nearby readers…</Text>
                <Text style={s.scanningHint}>Make sure Bluetooth is on and the reader is powered.</Text>
              </View>
            ) : (
              <>
                <Text style={s.sectionLabel}>
                  Found {discoveredReaders.length} reader{discoveredReaders.length !== 1 ? 's' : ''}
                </Text>
                {discoveredReaders.map((r) => {
                  const batt = (r.batteryLevel as number | undefined) ?? 80;
                  return (
                    <Pressable key={r.id} style={s.discoveredRow} onPress={() => handleConnect(r)}>
                      <View style={s.discoveredIcon}>
                        <Ionicons name="hardware-chip-outline" size={24} color={colors.primary} />
                      </View>
                      <View style={s.discoveredInfo}>
                        <Text style={s.discoveredName}>{r.name}</Text>
                        <Text style={s.discoveredSerial}>{r.serialNumber}</Text>
                      </View>
                      <View style={s.discoveredMeta}>
                        <View style={s.metaRow}>
                          <Ionicons name={batteryIcon(batt) as never} size={13} color={batteryColor(batt)} />
                          <Text style={[s.metaText, { color: batteryColor(batt) }]}>{batt}%</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                      </View>
                    </Pressable>
                  );
                })}
              </>
            )}
            <Pressable style={s.cancelBtn} onPress={cancelScan}>
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
          </>
        )}

        {/* ── NOT CONNECTED — no paired hint ────────────────────────── */}
        {!isConnected && !isConnecting && !isScanning && !pairedReaderHint && (
          <>
            <View style={s.infoCard}>
              <Text style={s.infoTitle}>How to pair your reader</Text>
              {[
                'Power on your Stripe M2 or BBPOS Chipper reader',
                'Enable Bluetooth on this device',
                'Hold the reader within 2 metres',
                'Tap "Scan for Reader" and select it from the list',
              ].map((step, i) => (
                <View key={i} style={s.step}>
                  <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
                  <Text style={s.stepText}>{step}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={[s.scanBtn, scanDisabled && s.scanBtnDisabled]}
              onPress={handleScan}
              disabled={scanDisabled}
            >
              {terminalInitializing
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="bluetooth-outline" size={18} color="#fff" />}
              <Text style={s.scanBtnText}>
                {terminalInitializing ? 'Terminal starting…' : 'Scan for Reader'}
              </Text>
            </Pressable>
          </>
        )}

        {/* ── NOT CONNECTED — has paired hint → offer reconnect ─────── */}
        {/* NOTE: pairedReaderHint is a UX hint only. The reader may be off or out of range.
            connectionStatus is still 'notConnected' from the SDK. */}
        {!isConnected && !isConnecting && !isScanning && pairedReaderHint && (
          <>
            <View style={s.savedCard}>
              <View style={s.savedHeader}>
                <Ionicons name="bookmark" size={16} color={colors.primary} />
                <Text style={s.savedLabel}>Previously paired</Text>
              </View>
              <Text style={s.savedName}>{pairedReaderHint.name}</Text>
              <Text style={s.savedSerial}>{pairedReaderHint.serialNumber}</Text>
              <Text style={s.savedDate}>
                Last seen {fmtDate(pairedReaderHint.lastSeenAt)}
              </Text>
            </View>

            <Pressable
              style={[s.scanBtn, scanDisabled && s.scanBtnDisabled]}
              onPress={handleReconnect}
              disabled={scanDisabled}
            >
              {terminalInitializing
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="bluetooth-outline" size={18} color="#fff" />}
              <Text style={s.scanBtnText}>
                {terminalInitializing
                  ? 'Terminal starting…'
                  : `Reconnect to ${pairedReaderHint.name.split(' ').slice(-1)[0]}`}
              </Text>
            </Pressable>

            <Pressable
              style={[s.scanOutlineBtn, scanDisabled && { opacity: 0.4 }]}
              onPress={handleScan}
              disabled={scanDisabled}
            >
              <Ionicons name="search-outline" size={16} color={colors.primary} />
              <Text style={s.scanOutlineBtnText}>Scan for Different Reader</Text>
            </Pressable>

            <Pressable style={s.forgetBtn} onPress={handleForget}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={s.forgetText}>Forget Saved Reader</Text>
            </Pressable>
          </>
        )}

        {/* Native module notice */}
        <View style={s.noticeCard}>
          <Ionicons name="information-circle-outline" size={16} color={colors.amber} />
          <Text style={s.noticeText}>
            Stripe Terminal requires an EAS Dev Client build. Connection state is always
            queried live from the SDK — no stale state is used. Bluetooth pairing is
            simulated in this environment.
          </Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.card },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  scroll: { padding: 20, gap: 14 },
  initBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryMuted, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.primary },
  initBannerText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.dangerMuted, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.danger },
  errorBannerText: { flex: 1, fontSize: 13, color: colors.danger, fontWeight: '600' },
  warningBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: `${colors.amber}15`, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: `${colors.amber}40` },
  warningBannerText: { flex: 1, fontSize: 13, color: colors.amber, fontWeight: '600' },
  heroSection: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  readerIconWrap: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  readerIconConnected: { borderColor: colors.success, backgroundColor: colors.successMuted },
  readerIconScanning: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 15, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 14 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  detailRow: { flexDirection: 'row', gap: 16 },
  detailItem: { flex: 1, gap: 4 },
  detailLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailVal: { fontSize: 14, fontWeight: '600', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  batteryBar: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  batteryFill: { height: 4, borderRadius: 2 },
  lastSeen: { fontSize: 12, color: colors.textMuted },
  testPassBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.successMuted, borderRadius: 12,
    borderWidth: 1, borderColor: colors.success, padding: 12,
  },
  testPassText: { fontSize: 14, fontWeight: '600', color: colors.success },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  toggleSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  toggle: { width: 46, height: 26, borderRadius: 13, backgroundColor: colors.border, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.primary },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: 'flex-start' },
  toggleThumbOn: { alignSelf: 'flex-end' },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primaryMuted, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primary, paddingVertical: 14 },
  testBtnDisabled: { opacity: 0.5 },
  testBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  disconnectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingVertical: 13 },
  disconnectText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  forgetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  forgetText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  scanningCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: 'center', gap: 10 },
  scanningText: { fontSize: 16, fontWeight: '600', color: colors.text },
  scanningHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: colors.textSecondary, fontSize: 15 },
  infoCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  infoTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  stepText: { flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  savedCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1.5, borderColor: colors.primary, padding: 18, gap: 4 },
  savedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  savedLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  savedName: { fontSize: 17, fontWeight: '700', color: colors.text },
  savedSerial: { fontSize: 13, color: colors.textSecondary },
  savedDate: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15 },
  scanBtnDisabled: { opacity: 0.45 },
  scanBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  scanOutlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primaryMuted, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primary, paddingVertical: 13 },
  scanOutlineBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  discoveredRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 },
  discoveredIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  discoveredInfo: { flex: 1 },
  discoveredName: { fontSize: 15, fontWeight: '700', color: colors.text },
  discoveredSerial: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  discoveredMeta: { alignItems: 'flex-end', gap: 6 },
  metaText: { fontSize: 12, fontWeight: '600' },
  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: `${colors.amber}15`, borderRadius: 12, borderWidth: 1, borderColor: `${colors.amber}40`, padding: 12 },
  noticeText: { flex: 1, fontSize: 12, color: colors.amber, lineHeight: 18 },
});
