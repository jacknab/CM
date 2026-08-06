/**
 * ReaderStatusModal.tsx
 *
 * Native modal showing the connected M2 reader's battery level, charging state,
 * serial number, firmware version, and a disconnect button.
 *
 * Opened by the floating reader badge in index.tsx whenever a reader is connected.
 * Can also be opened manually (no reader connected) — shows an empty state so
 * staff know nothing is paired.
 */

import React, { useCallback, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Platform,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { apiCaller } from '@/lib/terminalBridge';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:       '#0D1117',
  card:     '#161B22',
  border:   '#30363D',
  divider:  '#1E2530',
  text:     '#E6EDF3',
  textSub:  '#8B949E',
  textMuted:'#6E7681',
  green:    '#3FB950',
  yellow:   '#D29922',
  red:      '#F85149',
  amber:    '#E3B341',
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ReaderStatusModalProps {
  visible: boolean;
  onClose: () => void;
}

// ─── Battery bar ──────────────────────────────────────────────────────────────
function BatteryBar({ level, status, isCharging }: {
  level: number;
  status: string;
  isCharging: boolean;
}) {
  const barColor =
    status === 'critical' ? C.red :
    status === 'low'      ? C.yellow :
                            C.green;

  return (
    <View style={bat.wrap}>
      {/* Shell */}
      <View style={bat.shell}>
        {/* Fill */}
        <View style={[bat.fill, { width: `${Math.round(level * 100)}%` as any, backgroundColor: barColor }]} />
        {/* Lightning bolt overlaid when charging */}
        {isCharging && (
          <View style={bat.boltWrap}>
            <Ionicons name="flash" size={16} color="#fff" />
          </View>
        )}
      </View>
      {/* Nub */}
      <View style={bat.nub} />
    </View>
  );
}

const bat = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  shell:   {
    width: 160, height: 34, borderRadius: 7,
    borderWidth: 2, borderColor: '#3A3F4B',
    overflow: 'hidden', position: 'relative',
  },
  fill:    { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 5 },
  boltWrap:{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  nub:     { width: 5, height: 16, borderRadius: 2, backgroundColor: '#3A3F4B' },
});

// ─── Detail row ───────────────────────────────────────────────────────────────
function Row({ label, value, valueColor, mono }: {
  label: string; value: string; valueColor?: string; mono?: boolean;
}) {
  return (
    <View style={row.wrap}>
      <Text style={row.label}>{label}</Text>
      <Text style={[
        row.value,
        valueColor ? { color: valueColor } : undefined,
        mono       ? row.mono             : undefined,
      ]} numberOfLines={1} ellipsizeMode="middle">
        {value}
      </Text>
    </View>
  );
}

const row = StyleSheet.create({
  wrap:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.divider,
  },
  label: { fontSize: 13, color: C.textSub },
  value: { fontSize: 13, color: C.text, fontWeight: '500', flexShrink: 1, textAlign: 'right', maxWidth: '60%' },
  mono:  { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 0.3 },
});

// ─── Main component ───────────────────────────────────────────────────────────
export function ReaderStatusModal({ visible, onClose }: ReaderStatusModalProps) {
  const { connectedReader, disconnectReader } = useStripeTerminal();

  // ── Reader registration state ──────────────────────────────────────────────
  const [regCode,       setRegCode]       = useState('');
  const [regLabel,      setRegLabel]      = useState('');
  const [registering,   setRegistering]   = useState(false);
  const [regExpanded,   setRegExpanded]   = useState(false);

  const handleRegister = useCallback(async () => {
    const code = regCode.trim();
    if (!code) {
      Alert.alert('Code required', 'Enter the registration code printed on the reader.');
      return;
    }
    setRegistering(true);
    try {
      const res = await apiCaller.call(
        '/api/payments/terminal/reader/register',
        'POST',
        { registrationCode: code, label: regLabel.trim() || undefined }
      );
      if (res?.error) throw new Error(res.error);
      Alert.alert(
        'Reader registered',
        `${res?.label || res?.serialNumber || 'M2 Reader'} is now linked to your store. Connect it from the payment screen.`,
        [{ text: 'Done', onPress: () => { setRegCode(''); setRegLabel(''); setRegExpanded(false); } }]
      );
    } catch (err: any) {
      Alert.alert('Registration failed', err?.message ?? 'Could not register reader. Check the code and try again.');
    } finally {
      setRegistering(false);
    }
  }, [regCode, regLabel]);

  // Cast to any — beta.31 type defs don't expose all fields
  const r = connectedReader as any;

  const isConnected     = !!connectedReader;
  const batteryLevel    = typeof r?.batteryLevel === 'number' ? r.batteryLevel : 0;
  const batteryStatus   = (r?.batteryStatus as string) ?? 'unknown';
  const isCharging      = r?.isCharging === true;
  const serialNumber    = (r?.serialNumber as string) || '—';
  const label           = (r?.label as string) || (r?.deviceType as string) || 'M2 Reader';
  const firmwareVersion = (r?.softwareVersion as string) || '—';
  const rawDeviceType   = (r?.deviceType as string) || '—';
  const readerStatus    = (r?.status as string) || (isConnected ? 'online' : '—');

  const batteryPct = Math.round(batteryLevel * 100);

  const batteryColor =
    batteryStatus === 'critical' ? C.red :
    batteryStatus === 'low'      ? C.yellow :
                                   C.green;

  const batteryLabel =
    batteryStatus === 'nominal'  ? 'Good'              :
    batteryStatus === 'low'      ? 'Low — charge soon' :
    batteryStatus === 'critical' ? 'Critical — charge now' :
                                   'Level unknown';

  const deviceLabel =
    rawDeviceType === 'stripeM2'         ? 'BBPOS Chipper M2'     :
    rawDeviceType === 'stripeM2Emulator' ? 'M2 (Simulated)'       :
    rawDeviceType === 'tapToPay'         ? 'Tap to Pay'           :
    rawDeviceType;

  const handleDisconnect = useCallback(async () => {
    try { await disconnectReader(); } catch {}
    onClose();
  }, [disconnectReader, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        {/* Inner card — stop backdrop tap propagating through */}
        <TouchableOpacity activeOpacity={1} style={s.card}>

          {/* ── Header ── */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={[s.statusDot, { backgroundColor: isConnected ? C.green : C.textMuted }]} />
              <Text style={s.title}>M2 Reader</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={s.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={C.textSub} />
            </TouchableOpacity>
          </View>

          {/* ── Empty state ── */}
          {!isConnected ? (
            <View style={s.empty}>
              <Ionicons name="bluetooth-outline" size={44} color={C.textMuted} />
              <Text style={s.emptyTitle}>No Reader Connected</Text>
              <Text style={s.emptyBody}>
                Open a payment and tap{'\n'}M2 Reader to pair and connect.
              </Text>

              {/* ── Register a new reader ── */}
              <TouchableOpacity
                style={s.regToggle}
                onPress={() => setRegExpanded(e => !e)}
                activeOpacity={0.7}
              >
                <Ionicons name={regExpanded ? 'chevron-up' : 'add-circle-outline'} size={16} color={C.textSub} />
                <Text style={s.regToggleText}>Register a new reader</Text>
              </TouchableOpacity>

              {regExpanded && (
                <View style={s.regForm}>
                  <Text style={s.regHint}>
                    Enter the code printed on the M2 reader or its packaging (valid ~24 h after unboxing).
                  </Text>
                  <TextInput
                    style={s.regInput}
                    placeholder="Registration code"
                    placeholderTextColor={C.textMuted}
                    value={regCode}
                    onChangeText={setRegCode}
                    autoCapitalize="characters"
                    returnKeyType="next"
                  />
                  <TextInput
                    style={s.regInput}
                    placeholder="Label (optional, e.g. Front desk)"
                    placeholderTextColor={C.textMuted}
                    value={regLabel}
                    onChangeText={setRegLabel}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={[s.regBtn, registering && s.regBtnDisabled]}
                    onPress={handleRegister}
                    disabled={registering}
                    activeOpacity={0.8}
                  >
                    {registering
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={s.regBtnText}>Register Reader</Text>
                    }
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <>
              {/* ── Battery section ── */}
              <View style={s.battSection}>
                {/* Percentage + charging badge */}
                <View style={s.battTop}>
                  <Text style={s.battPct}>{batteryPct}%</Text>
                  {isCharging && (
                    <View style={s.chargeBadge}>
                      <Ionicons name="flash" size={12} color={C.amber} />
                      <Text style={s.chargeText}>Charging</Text>
                    </View>
                  )}
                </View>

                {/* Visual bar */}
                <BatteryBar level={batteryLevel} status={batteryStatus} isCharging={isCharging} />

                {/* Status label */}
                <Text style={[s.battLabel, { color: batteryColor }]}>{batteryLabel}</Text>
              </View>

              {/* ── Info rows ── */}
              <View style={s.infoSection}>
                <Row label="Status"   value={readerStatus === 'online' ? 'Online' : readerStatus} valueColor={C.green} />
                <Row label="Name"     value={label} />
                <Row label="Type"     value={deviceLabel} />
                <Row label="Serial"   value={serialNumber} mono />
                <Row label="Firmware" value={firmwareVersion} mono />
              </View>

              {/* ── Disconnect ── */}
              <TouchableOpacity
                style={s.disconnectBtn}
                onPress={handleDisconnect}
                activeOpacity={0.8}
              >
                <Ionicons name="bluetooth-outline" size={15} color={C.red} />
                <Text style={s.disconnectText}>Disconnect Reader</Text>
              </TouchableOpacity>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.70)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    width: 340,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot:   { width: 9, height: 9, borderRadius: 5 },
  title:       { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: 0.2 },
  closeBtn:    { padding: 4 },

  // Battery
  battSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  battTop:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  battPct:     { fontSize: 44, fontWeight: '800', color: C.text, letterSpacing: -1 },
  chargeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.amber + '22',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
  },
  chargeText:  { fontSize: 11, color: C.amber, fontWeight: '700' },
  battLabel:   { fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },

  // Info
  infoSection: { marginHorizontal: 20, marginTop: 4, marginBottom: 4 },

  // Disconnect
  disconnectBtn: {
    margin: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.red + '15',
    borderRadius: 10,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: C.red + '30',
  },
  disconnectText: { fontSize: 14, fontWeight: '600', color: C.red },

  // Empty
  empty: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 30,
    paddingBottom: 24,
    gap: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  emptyBody:  { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20 },

  // Register reader
  regToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 4,
  },
  regToggleText: { fontSize: 13, color: C.textSub, fontWeight: '500' },
  regForm: {
    alignSelf: 'stretch',
    gap: 8,
    marginTop: 4,
    paddingBottom: 8,
  },
  regHint: {
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 17,
    textAlign: 'center',
  },
  regInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: C.text,
  },
  regBtn: {
    backgroundColor: '#2D6ADF',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  regBtnDisabled: { opacity: 0.5 },
  regBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
