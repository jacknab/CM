import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useTerminal } from '@/context/TerminalContext';

type PaymentMethod = 'tap' | 'manual' | 'cash';

const TIP_PRESETS = [
  { label: 'No Tip', pct: 0 },
  { label: '10%', pct: 10 },
  { label: '15%', pct: 15 },
  { label: '20%', pct: 20 },
];

export default function SoloPaymentScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { terminalInitialized, terminalInitializing, collectPaymentMethod } = useTerminal();
  const params = useLocalSearchParams<{ subtotal: string; clientId: string; clientName: string; cartJson: string }>();

  const subtotal = parseFloat(params.subtotal ?? '0');
  const clientName = params.clientName ?? 'Walk-In';

  const [tipPct, setTipPct] = useState(18);
  const [customTip, setCustomTip] = useState('');
  const [isCustomTip, setIsCustomTip] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cashTendered, setCashTendered] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [tapState, setTapState] = useState<'idle' | 'ready' | 'waiting' | 'success'>('idle');

  const tipAmount = isCustomTip ? parseFloat(customTip || '0') : (subtotal * tipPct) / 100;
  const total = subtotal + tipAmount;
  const cashChange = method === 'cash' ? parseFloat(cashTendered || '0') - total : 0;

  async function startTapToPay() {
    // Guard: tap-to-pay requires Terminal to be initialized
    if (!terminalInitialized) {
      if (terminalInitializing) {
        Alert.alert('Terminal Initializing', 'The payment terminal is still starting up. Please wait a moment and try again.');
      } else {
        Alert.alert('Terminal Not Ready', 'First initialize the Stripe Terminal SDK before performing this action.');
      }
      return;
    }
    setMethod('tap');
    setTapState('ready');
  }

  async function processTap() {
    // Guard: collectPaymentMethod() will throw if SDK not initialized
    if (!terminalInitialized) {
      Alert.alert('Terminal Not Ready', 'First initialize the Stripe Terminal SDK before performing this action.');
      return;
    }

    setTapState('waiting');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      // collectPaymentMethod is guarded — logs "[Stripe Terminal] Payment started"
      // paymentIntentId would be created via createPaymentIntent before this in a full implementation
      await collectPaymentMethod('pending_intent_id');
    } catch (err) {
      // SDK not available in Expo Go — simulate for UI development
      console.warn('[Stripe Terminal] collectPaymentMethod fell through to simulation:', err);
    }

    // Simulate card read for non-EAS environments
    await new Promise((r) => setTimeout(r, 2500));
    setTapState('success');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await new Promise((r) => setTimeout(r, 600));
    router.replace({
      pathname: '/(solo)/receipt',
      params: { total: total.toFixed(2), tipAmount: tipAmount.toFixed(2), clientName, method: 'tap', change: '0' },
    });
  }

  async function handlePay() {
    if (!method) { Alert.alert('Choose payment', 'Select how the client will pay.'); return; }
    if (method === 'cash' && parseFloat(cashTendered || '0') < total) {
      Alert.alert('Insufficient', 'Cash tendered must cover the total.'); return;
    }
    setIsProcessing(true);
    try {
      await new Promise((r) => setTimeout(r, method === 'cash' ? 400 : 1800));
      router.replace({
        pathname: '/(solo)/receipt',
        params: { total: total.toFixed(2), tipAmount: tipAmount.toFixed(2), clientName, method, change: cashChange > 0 ? cashChange.toFixed(2) : '0' },
      });
    } catch (err) {
      Alert.alert('Payment failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Collect Payment</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.clientRow}>
          <Ionicons name="person-outline" size={15} color={colors.textSecondary} />
          <Text style={s.clientName}>{clientName}</Text>
        </View>

        {/* Terminal initializing banner */}
        {terminalInitializing && (
          <View style={s.initBanner}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={s.initBannerText}>Terminal initializing — tap to pay will be available shortly</Text>
          </View>
        )}

        {/* Tip */}
        <Text style={s.sectionLabel}>Tip</Text>
        <View style={s.tipRow}>
          {TIP_PRESETS.map((t) => (
            <Pressable key={t.pct} style={[s.tipBtn, !isCustomTip && tipPct === t.pct && s.tipBtnActive]}
              onPress={() => { setTipPct(t.pct); setIsCustomTip(false); }}>
              <Text style={[s.tipBtnText, !isCustomTip && tipPct === t.pct && { color: colors.primary }]}>{t.label}</Text>
            </Pressable>
          ))}
          <Pressable style={[s.tipBtn, isCustomTip && s.tipBtnActive]} onPress={() => setIsCustomTip(true)}>
            <Text style={[s.tipBtnText, isCustomTip && { color: colors.primary }]}>Custom</Text>
          </Pressable>
        </View>
        {isCustomTip && (
          <View style={s.customTipRow}>
            <Text style={s.curr}>$</Text>
            <TextInput style={s.customTipInput} value={customTip} onChangeText={setCustomTip} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} autoFocus />
          </View>
        )}

        {/* Totals */}
        <View style={s.totals}>
          <View style={s.totalRow}><Text style={s.totalLabel}>Subtotal</Text><Text style={s.totalVal}>${subtotal.toFixed(2)}</Text></View>
          <View style={s.totalRow}><Text style={s.totalLabel}>Tip</Text><Text style={s.totalVal}>${tipAmount.toFixed(2)}</Text></View>
          <View style={[s.totalRow, s.grandRow]}><Text style={s.grandLabel}>Total</Text><Text style={s.grandVal}>${total.toFixed(2)}</Text></View>
        </View>

        {/* ── TAP TO PAY — PRIMARY CTA ── */}
        <Text style={s.sectionLabel}>Payment Method</Text>

        {tapState === 'idle' || tapState === 'ready' ? (
          <Pressable
            style={[
              s.tapBtn,
              method === 'tap' && tapState === 'ready' && s.tapBtnReady,
              !terminalInitialized && s.tapBtnDisabled,
            ]}
            onPress={tapState === 'ready' ? processTap : startTapToPay}
            disabled={terminalInitializing}
          >
            {terminalInitializing ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={s.tapLabel}>Terminal starting…</Text>
              </>
            ) : (
              <>
                <View style={s.tapIcon}>
                  <Ionicons name="wifi-outline" size={36} color={tapState === 'ready' ? colors.primary : '#fff'} style={{ transform: [{ rotate: '90deg' }] }} />
                </View>
                <Text style={[s.tapLabel, tapState === 'ready' && { color: colors.primary }]}>
                  {tapState === 'ready' ? 'Tap Device to Card Reader' : 'Tap to Pay'}
                </Text>
                <Text style={[s.tapSub, tapState === 'ready' && { color: colors.primaryLight }]}>
                  {!terminalInitialized
                    ? 'Terminal not ready — initialize first'
                    : tapState === 'ready'
                      ? `Hold phone near client's card`
                      : 'Use your phone as the card reader'}
                </Text>
              </>
            )}
          </Pressable>
        ) : tapState === 'waiting' ? (
          <View style={s.tapWaiting}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.tapWaitingText}>Reading card…</Text>
          </View>
        ) : null}

        {/* Divider */}
        <View style={s.orRow}><View style={s.orLine} /><Text style={s.orText}>or</Text><View style={s.orLine} /></View>

        {/* Manual + Cash */}
        <Pressable style={[s.altMethod, method === 'manual' && s.altMethodActive]} onPress={() => { setMethod('manual'); setTapState('idle'); }}>
          <Ionicons name="card-outline" size={20} color={method === 'manual' ? colors.primary : colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={[s.altMethodTitle, method === 'manual' && { color: colors.primary }]}>Manual Card Entry</Text>
            <Text style={s.altMethodSub}>Type card number</Text>
          </View>
          {method === 'manual' && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
        </Pressable>

        <Pressable style={[s.altMethod, method === 'cash' && s.altMethodActive]} onPress={() => { setMethod('cash'); setTapState('idle'); }}>
          <Ionicons name="cash-outline" size={20} color={method === 'cash' ? colors.primary : colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={[s.altMethodTitle, method === 'cash' && { color: colors.primary }]}>Cash</Text>
            <Text style={s.altMethodSub}>Record cash payment</Text>
          </View>
          {method === 'cash' && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
        </Pressable>

        {method === 'cash' && (
          <View style={s.cashBox}>
            <Text style={s.cashLabel}>Cash tendered</Text>
            <View style={s.cashRow}>
              <Text style={s.curr}>$</Text>
              <TextInput style={s.cashInput} value={cashTendered} onChangeText={setCashTendered} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} autoFocus />
            </View>
            {cashChange > 0 && <Text style={s.changeText}>Change: ${cashChange.toFixed(2)}</Text>}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {method && method !== 'tap' && (
        <View style={s.footer}>
          <Pressable style={[s.chargeBtn, isProcessing && s.chargeBtnDis]} onPress={handlePay} disabled={isProcessing}>
            {isProcessing ? <ActivityIndicator color="#fff" /> : (
              <><Ionicons name="flash" size={20} color="#fff" /><Text style={s.chargeBtnText}>Charge ${total.toFixed(2)}</Text></>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.card },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  scroll: { padding: 20, gap: 14 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clientName: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  initBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryMuted, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.primary },
  initBannerText: { flex: 1, fontSize: 13, color: colors.primary, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },
  tipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  tipBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  tipBtnText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  customTipRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10 },
  curr: { fontSize: 20, color: colors.textSecondary, marginRight: 4 },
  customTipInput: { flex: 1, fontSize: 22, fontWeight: '700', color: colors.text },
  totals: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 14, color: colors.textSecondary },
  totalVal: { fontSize: 14, fontWeight: '600', color: colors.text },
  grandRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  grandLabel: { fontSize: 18, fontWeight: '800', color: colors.text },
  grandVal: { fontSize: 24, fontWeight: '800', color: colors.primary },
  tapBtn: { backgroundColor: colors.primary, borderRadius: 20, padding: 28, alignItems: 'center', gap: 10 },
  tapBtnReady: { backgroundColor: colors.primaryMuted, borderWidth: 2, borderColor: colors.primary },
  tapBtnDisabled: { opacity: 0.55 },
  tapIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  tapLabel: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  tapSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  tapWaiting: { alignItems: 'center', paddingVertical: 40, gap: 16 },
  tapWaitingText: { fontSize: 16, color: colors.textSecondary, fontWeight: '600' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  altMethod: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, padding: 16 },
  altMethodActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  altMethodTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  altMethodSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  cashBox: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  cashLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  cashRow: { flexDirection: 'row', alignItems: 'center' },
  cashInput: { flex: 1, fontSize: 28, fontWeight: '800', color: colors.text },
  changeText: { fontSize: 15, fontWeight: '700', color: colors.success },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: colors.border },
  chargeBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  chargeBtnDis: { opacity: 0.45 },
  chargeBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
