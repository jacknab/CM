/**
 * TapToPaySetupModal.tsx
 *
 * One-time Tap to Pay enrollment for this Android device.
 *
 * Triggered by a `SETUP_TAP_TO_PAY` postMessage from the web POS settings
 * ("Set up Tap to Pay"). Runs the enrollment once so the first real charge is
 * instant:
 *   1. ACCESS_FINE_LOCATION permission + Location Services on
 *   2. Terminal location from the server
 *   3. discoverReaders({ discoveryMethod: 'tapToPay' }) + connectReader(...)
 *      — this is what triggers Stripe's Tap to Pay Terms-of-Service screen and
 *      the Google Play Integrity / device-provisioning step.
 *
 * On success the tapToPay "reader" stays connected (the floating badge shows
 * "Tap to Pay"), so subsequent TAP_TO_PAY payments skip discovery entirely.
 *
 * Calls onComplete() / onError(message) so index.tsx can relay the result to
 * the web (certxa_native_taptopay_ready / certxa_native_taptopay_error).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useReaderDiscovery } from '@/lib/useReaderDiscovery';
import { useTerminalPayment } from '@/lib/useTerminalPayment';

type Phase = 'starting' | 'permission' | 'connecting' | 'done' | 'error';

interface Props {
  visible:    boolean;
  onComplete: () => void;
  onError:    (message: string) => void;
  onClose:    () => void;
}

export function TapToPaySetupModal({ visible, onComplete, onError, onClose }: Props) {
  const discovery = useReaderDiscovery();
  const payment   = useTerminalPayment();

  const [phase,    setPhase]    = useState<Phase>('starting');
  const [statusMsg, setStatusMsg] = useState('Preparing…');
  const [errorMsg, setErrorMsg] = useState('');
  const busyRef = useRef(false);

  const run = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase('starting');
    setStatusMsg('Preparing…');
    setErrorMsg('');

    try {
      setPhase('permission');
      setStatusMsg('Getting your salon’s payment location…');
      const locationId = await payment.getLocationId();

      setPhase('connecting');
      setStatusMsg('Follow the prompts to accept Stripe’s Tap to Pay terms…');
      await discovery.discoverAndConnect(locationId, 'tapToPay', {
        onDiscovering: () => setStatusMsg('Starting Tap to Pay…'),
        onConnecting:  () => setStatusMsg('Accept the terms to finish setup…'),
      });

      setPhase('done');
      setStatusMsg('Tap to Pay is ready on this device.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete();
    } catch (err: any) {
      await discovery.cancelDiscovery();
      const msg = err?.message ?? 'Setup failed. Please try again.';
      setPhase('error');
      setErrorMsg(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      onError(msg);
    } finally {
      busyRef.current = false;
    }
  }, [discovery, payment, onComplete, onError]);

  useEffect(() => {
    if (visible) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={S.overlay}>
        <View style={S.card}>
          {phase === 'error' ? (
            <>
              <Ionicons name="alert-circle" size={44} color="#F85149" />
              <Text style={S.title}>Couldn’t set up Tap to Pay</Text>
              <Text style={S.body}>{errorMsg}</Text>
              <TouchableOpacity style={S.primaryBtn} onPress={run} activeOpacity={0.85}>
                <Text style={S.primaryTxt}>TRY AGAIN</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.secondaryBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={S.secondaryTxt}>Close</Text>
              </TouchableOpacity>
            </>
          ) : phase === 'done' ? (
            <>
              <Ionicons name="checkmark-circle" size={48} color="#3FB950" />
              <Text style={S.title}>Tap to Pay is ready</Text>
              <Text style={S.body}>
                This device can now accept contactless cards, phones, and watches.
              </Text>
              <TouchableOpacity style={S.primaryBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={S.primaryTxt}>DONE</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color="#FFFFFF" style={{ marginBottom: 22 }} />
              <Text style={S.title}>Setting up Tap to Pay</Text>
              <Text style={S.body}>{statusMsg}</Text>
              <TouchableOpacity style={S.secondaryBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={S.secondaryTxt}>Cancel</Text>
              </TouchableOpacity>
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
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 40,
    paddingBottom: 30,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 320,
  },
  primaryBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 44,
    marginBottom: 10,
  },
  primaryTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.1,
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  secondaryTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
});
