/**
 * checkout.tsx — Certxa Solo's built-in POS.
 *
 * Visual language ported from certxa-owner's POSModal.tsx (cart/line-item
 * card, totals strip, icon-box payment-method buttons, animated checkmark
 * success screen) but rebuilt for a single-pro phone app in portrait:
 * no cash tendering, no numpad cart-building, no receipt printing, no
 * landscape lock — just Tap to Pay and the M2 reader, per the app's scope.
 */

import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useReaderDiscovery, type DiscoveryMethod } from '@/lib/useReaderDiscovery';
import { useTerminalPayment } from '@/lib/useTerminalPayment';
import { Colors } from '@/constants/colors';

type Phase = 'idle' | 'connecting' | 'collecting' | 'processing' | 'success' | 'error';
type Method = 'tapToPay' | 'bluetoothScan';

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    appointmentId?: string; clientName?: string; serviceName?: string; amountCents?: string;
  }>();

  const appointmentId = params.appointmentId ? Number(params.appointmentId) : undefined;
  const isQuickSale = appointmentId === undefined;

  const [clientName, setClientName] = useState(params.clientName ?? '');
  const [dollars, setDollars] = useState(
    params.amountCents ? (Number(params.amountCents) / 100).toFixed(2) : '',
  );
  const [method, setMethod] = useState<Method | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [approvedLabel, setApprovedLabel] = useState('');
  const successScale = useRef(new Animated.Value(0)).current;

  const { discoverAndConnect, cancelDiscovery } = useReaderDiscovery();
  const { run, cancel, getLocationId, ensureInitialized } = useTerminalPayment();

  const amountCents = Math.round(Number(dollars || '0') * 100);
  const isBusy = phase === 'connecting' || phase === 'collecting' || phase === 'processing';
  const canPay = amountCents > 0 && !isBusy;

  const pay = async (m: Method) => {
    if (!canPay) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setMethod(m);
    setError(null);
    setPhase('connecting');
    try {
      setStatus(m === 'tapToPay' ? 'Preparing Tap to Pay…' : 'Looking for your M2 reader…');
      await ensureInitialized();
      const locationId = await getLocationId();
      await discoverAndConnect(locationId, m, {
        onDiscovering: () => setStatus(m === 'tapToPay' ? 'Preparing Tap to Pay…' : 'Looking for your M2 reader…'),
        onConnecting: () => setStatus('Connecting…'),
        onStatus: setStatus,
      });

      const result = await run(
        amountCents,
        appointmentId,
        clientName.trim() || 'Walk-in',
        m === 'tapToPay' ? 'tap_to_pay' : 'm2',
        {
          onPhase: (p) => setPhase(p === 'connected' ? 'connecting' : p),
          onStatus: setStatus,
        },
      );
      setApprovedLabel(result.cardDetails ? `${result.cardDetails.brand.toUpperCase()} ····${result.cardDetails.last4}` : 'Approved');
      setPhase('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Animated.spring(successScale, { toValue: 1, useNativeDriver: true }).start();
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Payment failed.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const cancelPayment = async () => {
    try { await cancel(); } catch {}
    try { await cancelDiscovery(); } catch {}
    setPhase('idle');
    setError(null);
    setStatus('');
  };

  const tryAgain = () => {
    setPhase('idle');
    setError(null);
    setMethod(null);
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (phase === 'success') {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
        <Animated.View style={[styles.successCheck, { transform: [{ scale: successScale }] }]}>
          <Ionicons name="checkmark" size={44} color="#fff" />
        </Animated.View>
        <Text style={styles.successTitle}>Payment Confirmed</Text>
        <Text style={styles.successAmount}>${dollars}</Text>
        <Text style={styles.successSubtitle}>{approvedLabel}</Text>
        <TouchableOpacity style={styles.doneButton} onPress={() => router.replace('/')}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, flex: 1 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => (isBusy ? cancelPayment() : router.back())}>
            <Text style={styles.back}>{isBusy ? 'Cancel' : '‹ Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{isQuickSale ? 'Quick Sale' : 'Check Out'}</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* ── Cart / line-item card ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardHeaderTitle} numberOfLines={1}>{clientName.trim() || 'Walk-in'}</Text>
            <View style={styles.itemBadge}>
              <Text style={styles.itemBadgeText}>1 item</Text>
            </View>
          </View>

          {isQuickSale ? (
            <TextInput
              style={styles.clientInput}
              placeholder="Client name (optional)"
              placeholderTextColor={Colors.textMuted}
              value={clientName}
              onChangeText={setClientName}
              editable={!isBusy}
            />
          ) : (
            <View style={styles.itemRow}>
              <View style={styles.itemQtyBox}><Text style={styles.itemQtyText}>1</Text></View>
              <Text style={styles.itemName} numberOfLines={1}>{params.serviceName ?? 'Service'}</Text>
              <Text style={styles.itemPrice}>${dollars || '0.00'}</Text>
            </View>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            {isQuickSale && !isBusy ? (
              <View style={styles.totalInputRow}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  style={styles.totalInput}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                  value={dollars}
                  onChangeText={setDollars}
                />
              </View>
            ) : (
              <Text style={styles.totalValue}>${dollars || '0.00'}</Text>
            )}
          </View>
        </View>

        {/* ── Status area ──────────────────────────────────────────────────── */}
        {isBusy && (
          <View style={styles.statusBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.statusText}>{status}</Text>
            {phase === 'collecting' && (
              <TouchableOpacity style={styles.cancelChip} onPress={cancelPayment}>
                <Text style={styles.cancelChipText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {phase === 'error' && !isBusy && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={tryAgain}><Text style={styles.tryAgain}>Try again</Text></TouchableOpacity>
          </View>
        )}

        {/* ── Payment methods ──────────────────────────────────────────────── */}
        {!isBusy && phase !== 'error' && (
          <View style={styles.methodRow}>
            <TouchableOpacity
              style={[styles.methodButton, !canPay && styles.methodButtonDisabled]}
              disabled={!canPay}
              onPress={() => pay('tapToPay')}
              activeOpacity={0.85}
            >
              <View style={[styles.methodIconBox, { backgroundColor: Colors.tap }]}>
                <Ionicons name="phone-portrait-outline" size={26} color="#fff" />
              </View>
              <Text style={styles.methodLabel}>Tap to Pay</Text>
              <Text style={styles.methodHint}>Tap card or phone here</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodButton, !canPay && styles.methodButtonDisabled]}
              disabled={!canPay}
              onPress={() => pay('bluetoothScan')}
              activeOpacity={0.85}
            >
              <View style={[styles.methodIconBox, { backgroundColor: Colors.m2 }]}>
                <Ionicons name="bluetooth-outline" size={26} color="#fff" />
              </View>
              <Text style={styles.methodLabel}>M2 Reader</Text>
              <Text style={styles.methodHint}>Tap, insert, or swipe</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  back: { color: Colors.primary, fontSize: 16 },
  title: { color: Colors.text, fontSize: 18, fontWeight: '700' },

  card: { backgroundColor: Colors.card, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 18 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardHeaderTitle: { color: Colors.text, fontSize: 17, fontWeight: '700', flex: 1, marginRight: 8 },
  itemBadge: { backgroundColor: Colors.cardElevated, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  itemBadgeText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  clientInput: {
    backgroundColor: Colors.cardElevated, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    color: Colors.text, fontSize: 15, marginBottom: 14,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  itemQtyBox: {
    width: 24, height: 24, borderRadius: 6, backgroundColor: Colors.cardElevated,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  itemQtyText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  itemName: { flex: 1, color: Colors.text, fontSize: 15 },
  itemPrice: { color: Colors.text, fontSize: 15, fontWeight: '600' },

  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 14,
  },
  totalLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  totalValue: { color: Colors.text, fontSize: 28, fontWeight: '800' },
  totalInputRow: { flexDirection: 'row', alignItems: 'baseline' },
  dollarSign: { color: Colors.textSecondary, fontSize: 22, fontWeight: '600', marginRight: 2 },
  totalInput: { color: Colors.text, fontSize: 28, fontWeight: '800', minWidth: 80, textAlign: 'right' },

  statusBox: {
    marginTop: 28, alignItems: 'center', gap: 14, backgroundColor: Colors.card,
    borderRadius: 18, borderWidth: 1, borderColor: Colors.border, paddingVertical: 32, paddingHorizontal: 20,
  },
  statusText: { color: Colors.textSecondary, fontSize: 15, textAlign: 'center' },
  cancelChip: { backgroundColor: Colors.cardElevated, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  cancelChipText: { color: Colors.text, fontWeight: '600' },

  errorBox: {
    marginTop: 28, backgroundColor: Colors.errorMuted, borderRadius: 14, padding: 16,
    alignItems: 'center', gap: 8,
  },
  errorText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  tryAgain: { color: '#fff', fontWeight: '700', marginTop: 4, textDecorationLine: 'underline' },

  methodRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  methodButton: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 18, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 22, paddingHorizontal: 12, alignItems: 'center', gap: 10,
  },
  methodButtonDisabled: { opacity: 0.4 },
  methodIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  methodLabel: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  methodHint: { color: Colors.textMuted, fontSize: 12, textAlign: 'center' },

  successCheck: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.success,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  successTitle: { color: Colors.text, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  successAmount: { color: Colors.text, fontSize: 40, fontWeight: '800', marginBottom: 4 },
  successSubtitle: { color: Colors.textSecondary, fontSize: 15, marginBottom: 40 },
  doneButton: { backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 48, paddingVertical: 16 },
  doneButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
