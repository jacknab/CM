import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useStripeTerminal, type Reader } from '@stripe/stripe-terminal-react-native';
import { createPaymentIntent, fetchTerminalLocation } from '../lib/api';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Payment'>;
type Route = RouteProp<RootStackParamList, 'Payment'>;

type PaymentState =
  | 'discovering'   // finding reader (TTP only)
  | 'connecting'    // connecting to reader
  | 'creating'      // creating PaymentIntent on server
  | 'ready'         // waiting for card tap / insert
  | 'collecting'    // collectPaymentMethod in progress
  | 'processing'    // confirmPaymentIntent in progress
  | 'success'
  | 'error';

/** Concentric NFC arcs — the classic contactless payment symbol */
function ContactlessIcon({ size = 100, color = '#fff', opacity = 1 }: { size?: number; color?: string; opacity?: number }) {
  const r = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity }}>
      {[0.36, 0.62, 0.88].map((scale, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: size * scale,
            height: size * scale,
            borderRadius: (size * scale) / 2,
            borderWidth: 3.5,
            borderColor: color,
            // Only show the top-right arc (hide bottom-left via transparency)
            borderBottomColor: 'transparent',
            borderLeftColor: 'transparent',
            transform: [{ rotate: '45deg' }],
            opacity: 1 - i * 0.2,
          }}
        />
      ))}
      {/* Centre dot */}
      <View
        style={{
          width: size * 0.12,
          height: size * 0.12,
          borderRadius: size * 0.06,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function formatAmount(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function stateLabel(state: PaymentState, method: 'tapToPay' | 'bluetooth'): string {
  switch (state) {
    case 'discovering': return 'Preparing reader…';
    case 'connecting':  return 'Connecting…';
    case 'creating':    return 'Preparing payment…';
    case 'ready':       return method === 'tapToPay' ? 'Hold card here' : 'Present card to reader';
    case 'collecting':  return 'Reading card…';
    case 'processing':  return 'Processing…';
    case 'success':     return 'Payment complete';
    case 'error':       return 'Payment failed';
  }
}

export default function PaymentScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { amountCents, method } = params;

  const [payState, setPayState] = useState<PaymentState>('discovering');
  const [errorMsg, setErrorMsg] = useState('');

  // Pulse animation for the contactless icon
  const pulse = useRef(new Animated.Value(1)).current;

  // Use a ref for discoveredReaders so the async effect always sees fresh data.
  const discoveredReadersRef = useRef<Reader.Type[]>([]);

  const {
    discoverReaders,
    connectReader,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
    connectedReader,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => {
      discoveredReadersRef.current = readers;
    },
    onDidRequestReaderInput: () => {
      setPayState('ready');
    },
    onDidRequestReaderDisplayMessage: () => {
      setPayState('collecting');
    },
  });

  // Pulse the icon while in ready/collecting state
  useEffect(() => {
    let loop: Animated.CompositeAnimation;
    if (payState === 'ready' || payState === 'collecting') {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.15, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1.0,  duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
    } else {
      pulse.setValue(1);
    }
    return () => loop?.stop();
  }, [payState, pulse]);

  const handleError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setPayState('error');
  }, []);

  // Main payment flow
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // ── 1. Discover & connect reader ──────────────────────────────────
        if (!connectedReader) {
          setPayState('discovering');

          // Fetch terminal location first — required by connectReader()
          const locationId = await fetchTerminalLocation();
          if (cancelled) return;

          const { error: discoverErr } = await discoverReaders({
            discoveryMethod: method === 'tapToPay' ? 'tapToPay' : 'bluetoothScan',
            simulated: false,
          });
          if (cancelled) return;
          if (discoverErr) { handleError(discoverErr.message); return; }

          // Wait until at least one reader is discovered (poll briefly)
          let attempts = 0;
          while (discoveredReadersRef.current.length === 0 && attempts < 20) {
            await new Promise(r => setTimeout(r, 500));
            attempts++;
            if (cancelled) return;
          }
          if (discoveredReadersRef.current.length === 0) {
            handleError('No readers found. Make sure the device supports Tap to Pay.');
            return;
          }

          setPayState('connecting');
          const reader = discoveredReadersRef.current[0];
          const connectParams =
            method === 'tapToPay'
              ? {
                  reader,
                  discoveryMethod: 'tapToPay' as const,
                  locationId,
                  merchantDisplayName: 'Certxa',
                  tosAcceptancePermitted: true,
                }
              : {
                  reader,
                  discoveryMethod: 'bluetoothScan' as const,
                  locationId,
                };

          const { error: connectErr } = await connectReader(connectParams);
          if (cancelled) return;
          if (connectErr) { handleError(connectErr.message); return; }
        }

        // ── 2. Create PaymentIntent on server ─────────────────────────────
        setPayState('creating');
        const pi = await createPaymentIntent(amountCents);
        if (cancelled) return;

        // ── 3. Collect payment method (triggers NFC / card interaction) ───
        setPayState('ready');
        const { paymentIntent: collected, error: collectErr } = await collectPaymentMethod({
          paymentIntentId: pi.paymentIntentId,
        });
        if (cancelled) return;
        if (collectErr) {
          if (collectErr.code === 'Canceled') return; // user cancelled
          handleError(collectErr.message);
          return;
        }

        // ── 4. Confirm (process) ──────────────────────────────────────────
        setPayState('processing');
        const { paymentIntent: confirmed, error: confirmErr } = await confirmPaymentIntent({
          paymentIntentId: pi.paymentIntentId,
        });
        if (cancelled) return;
        if (confirmErr) { handleError(confirmErr.message); return; }

        setPayState('success');
      } catch (err: any) {
        if (!cancelled) handleError(err?.message ?? 'Unknown error');
      }
    }

    run();

    return () => {
      cancelled = true;
      cancelCollectPaymentMethod().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  const handleCancel = async () => {
    if (payState === 'success') {
      navigation.popToTop();
      return;
    }
    if (payState === 'error') {
      navigation.goBack();
      return;
    }
    // Cancel in-progress collection
    await cancelCollectPaymentMethod().catch(() => {});
    navigation.goBack();
  };

  const handleDone = () => navigation.popToTop();

  const isSuccess = payState === 'success';
  const isError   = payState === 'error';
  const isActive  = payState === 'ready' || payState === 'collecting';

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Top bar */}
      <View style={styles.topBar}>
        {!isSuccess && (
          <TouchableOpacity onPress={handleCancel} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Ionicons name="close" size={26} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* Main content */}
      <View style={styles.center}>
        {/* Icon */}
        {isSuccess ? (
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={52} color="#fff" />
          </View>
        ) : isError ? (
          <View style={styles.errorCircle}>
            <Ionicons name="close" size={52} color="#fff" />
          </View>
        ) : (
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            {method === 'tapToPay' ? (
              <ContactlessIcon size={110} color={isActive ? '#fff' : '#444'} />
            ) : (
              <View style={styles.bluetoothIcon}>
                <MaterialCommunityIcons
                  name="credit-card-wireless-outline"
                  size={64}
                  color={isActive ? '#fff' : '#444'}
                />
              </View>
            )}
          </Animated.View>
        )}

        {/* Amount */}
        <Text style={[styles.amount, isSuccess && styles.amountSuccess]}>
          {formatAmount(amountCents)}
        </Text>

        {/* Status label */}
        <Text style={[styles.statusLabel, isError && styles.statusLabelError]}>
          {isError ? errorMsg || stateLabel(payState, method) : stateLabel(payState, method)}
        </Text>

        {/* Spinner row for connecting / processing states */}
        {(payState === 'discovering' || payState === 'connecting' || payState === 'creating' || payState === 'processing') && (
          <View style={styles.spinnerRow}>
            {/* Simple animated dot indicator */}
            {[0, 1, 2].map(i => (
              <View key={i} style={styles.dot} />
            ))}
          </View>
        )}
      </View>

      {/* Bottom action */}
      <View style={styles.bottom}>
        {isSuccess ? (
          <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.8}>
            <Text style={styles.doneBtnText}>New Payment</Text>
          </TouchableOpacity>
        ) : isError ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
            <Text style={styles.cancelBtnText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            activeOpacity={0.8}
            disabled={payState === 'processing'}
          >
            <Text style={[styles.cancelBtnText, payState === 'processing' && { opacity: 0.3 }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    minHeight: 50,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 24,
  },
  successCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bluetoothIcon: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: {
    color: '#fff',
    fontSize: 56,
    fontWeight: '200',
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  amountSuccess: {
    fontWeight: '300',
  },
  statusLabel: {
    color: '#888',
    fontSize: 18,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 26,
  },
  statusLabelError: {
    color: '#EF4444',
  },
  spinnerRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#444',
  },
  bottom: {
    paddingHorizontal: 32,
    paddingBottom: 24,
  },
  doneBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#666',
    fontSize: 17,
    fontWeight: '500',
  },
});
