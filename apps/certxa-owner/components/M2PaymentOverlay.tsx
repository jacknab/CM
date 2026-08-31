/**
 * M2PaymentOverlay.tsx
 *
 * Standalone native overlay that handles the full card-present payment flow —
 * discovery → connect → collect → process → capture — for either method:
 *   mode="m2"  → Stripe M2 Bluetooth reader   (triggered by `M2_PAY`)
 *   mode="tap" → Tap to Pay on this device NFC (triggered by `TAP_TO_PAY`)
 *
 * Triggered by a postMessage from the web Calendar / FrontDesk POS.
 * On success calls `onComplete(appointmentId, method, amount)` where method is
 * "m2" or "tap_to_pay".
 * On error  calls `onError(message)` so the web can show the failure.
 * On cancel calls `onCancel()`.
 *
 * Reuses the same hooks (useReaderDiscovery, useTerminalPayment) and the same
 * dark-card visual style as the full POSModal M2 overlay.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, ActivityIndicator, Modal, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useReaderDiscovery } from '@/lib/useReaderDiscovery';
import { useTerminalPayment } from '@/lib/useTerminalPayment';

// ── Visual constants (matches POSModal) ────────────────────────────────────────
const DOT_COLORS = ['#E8705A', '#E0923A', '#D44040', '#E8A040', '#6AB84A'];
const STAGGER   = 140;
const UP_DUR    = 280;
const DOWN_DUR  = 320;
const PAUSE     = 300;

type Phase = 'discovering' | 'connecting' | 'collecting' | 'processing' | 'error';

export interface M2PayData {
  appointmentId: number;
  amountCents:   number;
  clientName:    string;
  /** "m2" (Bluetooth reader) or "tap" (this device's NFC). Defaults to "m2". */
  mode?:         'm2' | 'tap';
}

interface Props {
  visible:    boolean;
  data:       M2PayData | null;
  onComplete: (appointmentId: number, method: string, amountDollars: number) => void;
  onError:    (message: string) => void;
  onCancel:   () => void;
}

export function M2PaymentOverlay({ visible, data, onComplete, onError, onCancel }: Props) {
  const { width }  = useWindowDimensions();
  const isPhone    = width < 768;
  const discovery  = useReaderDiscovery();
  const payment    = useTerminalPayment();

  const isTap        = data?.mode === 'tap';
  const readerLabel  = isTap ? 'Tap to Pay' : 'M2 reader';
  const scanningMsg  = isTap ? 'Starting Tap to Pay…' : 'Scanning for M2 reader…';

  const [phase,     setPhase]     = useState<Phase>('discovering');
  const [statusMsg, setStatusMsg] = useState(scanningMsg);
  const [errorMsg,  setErrorMsg]  = useState('');

  const busyRef    = useRef(false);
  const cancelRef  = useRef(false);

  // ── Bouncing dot animations ───────────────────────────────────────────────────
  const dotAnims = useRef(DOT_COLORS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const active = phase !== 'processing' && phase !== 'error';
    if (!active || !visible) {
      dotAnims.forEach(a => { a.stopAnimation(); a.setValue(0); });
      return;
    }
    const totalCycle = STAGGER * (dotAnims.length - 1) + UP_DUR + DOWN_DUR + PAUSE;
    const loops = dotAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * STAGGER),
          Animated.timing(anim, { toValue: -22, duration: UP_DUR,   useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0,   duration: DOWN_DUR, useNativeDriver: true }),
          Animated.delay(Math.max(0, totalCycle - i * STAGGER - UP_DUR - DOWN_DUR)),
        ])
      )
    );
    const composite = Animated.parallel(loops);
    composite.start();
    return () => { composite.stop(); dotAnims.forEach(a => a.setValue(0)); };
  }, [phase, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Run payment on mount (whenever visible + data appear) ───────────────────
  const runPayment = useCallback(async () => {
    if (!data || busyRef.current) return;
    busyRef.current = true;
    cancelRef.current = false;
    setErrorMsg('');

    try {
      const locationId = await payment.getLocationId();
      if (cancelRef.current) return;

      await discovery.discoverAndConnect(
        locationId,
        isTap ? 'tapToPay' : 'bluetoothScan',
        {
          onDiscovering: () => { setPhase('discovering'); setStatusMsg(isTap ? 'Starting Tap to Pay…' : 'Scanning for M2 reader…'); },
          onConnecting:  () => { setPhase('connecting');  setStatusMsg(isTap ? 'Preparing Tap to Pay…' : 'Connecting to reader…'); },
        },
      );
      if (cancelRef.current) return;

      const payMethod = isTap ? 'tap_to_pay' : 'm2';
      const { cardDetails } = await payment.run(
        data.amountCents,
        data.appointmentId,
        data.clientName,
        payMethod,
        {
          onPhase:  (p) => { setPhase(p as Phase); },
          onStatus: (s) => setStatusMsg(s),
        },
      );

      if (cancelRef.current) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete(data.appointmentId, payMethod, data.amountCents / 100);
    } catch (err: any) {
      if (cancelRef.current) return;
      await discovery.cancelDiscovery();
      await payment.cancel();
      const msg = err?.message ?? 'Payment failed';
      setPhase('error');
      setErrorMsg(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      onError(msg);
    } finally {
      busyRef.current = false;
    }
  }, [data, discovery, payment, onComplete, onError]);

  useEffect(() => {
    if (visible && data) {
      setPhase('discovering');
      setStatusMsg(scanningMsg);
      setErrorMsg('');
      runPayment();
    }
  }, [visible, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cancel handler ────────────────────────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    cancelRef.current = true;
    busyRef.current   = false;
    await discovery.cancelDiscovery();
    await payment.cancel();
    onCancel();
  }, [discovery, payment, onCancel]);

  // ── Try again ────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    setPhase('discovering');
    setStatusMsg(scanningMsg);
    setErrorMsg('');
    runPayment();
  }, [runPayment]);

  const amountDollars = data ? data.amountCents / 100 : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={S.overlay}>
        <View style={[S.card, isPhone && S.cardPhone]}>
          {phase === 'error' ? (
            // ── Error state ──────────────────────────────────────────────────
            <>
              <View style={S.declinedIconWrap}>
                <Ionicons name="close-circle" size={48} color="#FF4444" />
              </View>
              <Text style={S.declinedTitle}>DECLINED</Text>
              <Text style={S.declinedMsg}>{errorMsg}</Text>

              <TouchableOpacity style={S.tryAgainBtn} onPress={handleRetry} activeOpacity={0.85}>
                <Text style={S.tryAgainTxt}>TRY AGAIN</Text>
              </TouchableOpacity>

              <TouchableOpacity style={S.stopBtn} onPress={handleCancel} activeOpacity={0.8}>
                <Ionicons name="arrow-back-outline" size={16} color="rgba(255,255,255,0.6)" />
                <Text style={S.stopTxt}>Back to Payment Methods</Text>
              </TouchableOpacity>
            </>
          ) : (
            // ── Active state ─────────────────────────────────────────────────
            <>
              <Text style={S.amtLabel}>AMOUNT DUE</Text>
              <Text style={S.amt}>${amountDollars.toFixed(2)}</Text>

              {phase === 'processing' ? (
                <ActivityIndicator size="large" color="#FFFFFF" style={{ marginVertical: 28 }} />
              ) : (
                <View style={S.dotsRow}>
                  {dotAnims.map((anim, i) => (
                    <Animated.View
                      key={i}
                      style={[S.dot, { backgroundColor: DOT_COLORS[i], transform: [{ translateY: anim }] }]}
                    />
                  ))}
                </View>
              )}

              <Text style={S.statusMsg}>{statusMsg}</Text>

              <View style={S.phasePill}>
                <Text style={S.phasePillTxt}>
                  {phase === 'discovering' ? (isTap ? 'STARTING TAP TO PAY' : 'SCANNING FOR READER')
                    : phase === 'connecting'  ? (isTap ? 'PREPARING' : 'CONNECTING TO READER')
                    : phase === 'collecting'  ? (isTap ? 'TAP CARD / PHONE NOW' : 'WAITING FOR CARD')
                    :                          'PROCESSING'}
                </Text>
              </View>

              {phase !== 'processing' ? (
                <TouchableOpacity style={S.stopBtn} onPress={handleCancel} activeOpacity={0.8}>
                  <Ionicons name="close-outline" size={18} color="rgba(255,255,255,0.7)" />
                  <Text style={S.stopTxt}>Stop &amp; Return to POS</Text>
                </TouchableOpacity>
              ) : (
                <Text style={S.processingNote}>
                  Do not close this screen — completing payment…
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 14, 35, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '55%',
    maxWidth: 480,
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 44,
    paddingBottom: 36,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  // Phone: fill the entire screen — no card chrome, no cramped padding
  cardPhone: {
    width: '100%',
    maxWidth: undefined,
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 0,
    borderWidth: 0,
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 60,
    backgroundColor: 'transparent',
    justifyContent: 'center',
  },
  amtLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 2.0,
    marginBottom: 6,
  },
  amt: {
    fontSize: 52,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 14,
    height: 60,
    marginBottom: 20,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  statusMsg: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.80)',
    textAlign: 'center',
    marginBottom: 14,
  },
  phasePill: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 28,
  },
  phasePillTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 1.6,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  stopTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.70)',
  },
  processingNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.40)',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
  // Error state
  declinedIconWrap: {
    marginBottom: 14,
    backgroundColor: 'rgba(255,68,68,0.12)',
    borderRadius: 60,
    padding: 14,
  },
  declinedTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FF4444',
    letterSpacing: 2,
    marginBottom: 10,
  },
  declinedMsg: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    maxWidth: 320,
  },
  tryAgainBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginBottom: 12,
    shadowColor: '#3B82F6',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  tryAgainTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
});
