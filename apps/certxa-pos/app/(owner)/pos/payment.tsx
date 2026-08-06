import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';

// Keep screen awake during payment collection — critical: don't let tap-to-pay time out
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let KeepAwake: any = null;
try { KeepAwake = require('expo-keep-awake'); } catch {}
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useTerminal } from '@/context/TerminalContext';
import { createPaymentIntent, capturePaymentIntent } from '@/lib/api';

type PaymentMethod = 'tap_to_pay' | 'terminal' | 'manual' | 'cash';

const TIP_PRESETS = [
  { label: 'No Tip', pct: 0 },
  { label: '10%', pct: 10 },
  { label: '15%', pct: 15 },
  { label: '18%', pct: 18 },
  { label: '20%', pct: 20 },
];

export default function PaymentScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { terminalInitialized, terminalInitializing, collectPaymentMethod } = useTerminal();
  const params = useLocalSearchParams<{
    subtotal: string;
    clientId: string;
    clientName: string;
    cartJson: string;
    appointmentId: string;
  }>();

  const subtotal = parseFloat(params.subtotal ?? '0');
  const clientName = params.clientName ?? 'Walk-In';

  // Prevent screen sleep during payment — tap-to-pay will fail if the screen locks mid-collection
  useEffect(() => {
    KeepAwake?.activateKeepAwakeAsync?.('pos-payment');
    return () => { KeepAwake?.deactivateKeepAwake?.('pos-payment'); };
  }, []);

  const [tipPct, setTipPct] = useState(18);
  const [customTip, setCustomTip] = useState('');
  const [isCustomTip, setIsCustomTip] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cashTendered, setCashTendered] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [presentingMethod, setPresentingMethod] = useState<PaymentMethod | null>(null);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState('');

  const discountAmount = (() => {
    const v = parseFloat(discountValue || '0');
    if (!showDiscount || v <= 0) return 0;
    if (discountType === 'percent') return Math.min(subtotal, (subtotal * v) / 100);
    return Math.min(subtotal, v);
  })();
  const discountedSubtotal = subtotal - discountAmount;
  const tipAmount = isCustomTip
    ? parseFloat(customTip || '0')
    : (discountedSubtotal * tipPct) / 100;
  const total = discountedSubtotal + tipAmount;
  const cashChange = method === 'cash' ? parseFloat(cashTendered || '0') - total : 0;

  // Terminal methods require SDK initialization; cash and manual do not
  const isTerminalMethod = method === 'tap_to_pay' || method === 'terminal';

  async function handlePay() {
    if (!method) {
      Alert.alert('Select payment method', 'Choose how the client will pay.');
      return;
    }
    if (method === 'cash' && parseFloat(cashTendered || '0') < total) {
      Alert.alert('Insufficient amount', 'Cash tendered must cover the total.');
      return;
    }

    // Guard: prevent Terminal actions before SDK is initialized
    if (isTerminalMethod && !terminalInitialized) {
      if (terminalInitializing) {
        Alert.alert(
          'Terminal Initializing',
          'The payment terminal is still starting up. Please wait a moment and try again.',
        );
      } else {
        Alert.alert(
          'Terminal Not Ready',
          'First initialize the Stripe Terminal SDK before performing this action.',
        );
      }
      return;
    }

    setIsProcessing(true);
    let paymentIntentId: string | null = null;

    try {
      if (method === 'cash') {
        await new Promise((r) => setTimeout(r, 400));
      } else {
        const storeId = user?.storeId ?? 0;
        const result = await createPaymentIntent({
          storeId,
          amount: Math.round(total * 100),
          tipAmount: Math.round(tipAmount * 100),
          clientId: params.clientId ? parseInt(params.clientId) : null,
          appointmentId: params.appointmentId ? parseInt(params.appointmentId) : null,
        });
        paymentIntentId = result.paymentIntentId;

        if (method === 'tap_to_pay' || method === 'terminal') {
          setPresentingMethod(method);
          // collectPaymentMethod is guarded — throws if not initialized
          await collectPaymentMethod(paymentIntentId);
          // Simulated delay for UI in non-EAS builds (real SDK call blocks until card read)
          await new Promise((r) => setTimeout(r, 2800));
          setPresentingMethod(null);
        } else {
          await new Promise((r) => setTimeout(r, 1500));
        }

        await capturePaymentIntent(paymentIntentId);
      }

      router.replace({
        pathname: '/(owner)/pos/receipt',
        params: {
          subtotal: subtotal.toFixed(2),
          discountAmount: discountAmount > 0 ? discountAmount.toFixed(2) : '',
          total: total.toFixed(2),
          tipAmount: tipAmount.toFixed(2),
          clientName,
          method,
          change: cashChange > 0 ? cashChange.toFixed(2) : '0',
          paymentIntentId: paymentIntentId ?? '',
        },
      });
    } catch (err) {
      setPresentingMethod(null);
      Alert.alert('Payment failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Checkout</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Client */}
        <View style={styles.clientRow}>
          <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.clientName}>{clientName}</Text>
        </View>

        {/* Terminal initializing banner */}
        {terminalInitializing && (
          <View style={styles.initBanner}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.initBannerText}>Terminal initializing…</Text>
          </View>
        )}

        {/* Discount */}
        <View style={styles.discountHeader}>
          <Text style={styles.sectionLabel}>Discount</Text>
          {!showDiscount && (
            <Pressable style={styles.addDiscountBtn} onPress={() => setShowDiscount(true)}>
              <Ionicons name="pricetag-outline" size={14} color={colors.primary} />
              <Text style={styles.addDiscountText}>Add</Text>
            </Pressable>
          )}
        </View>
        {showDiscount && (
          <View style={styles.discountBox}>
            <View style={styles.discountTypeToggle}>
              <Pressable
                style={[styles.discountTypeBtn, discountType === 'percent' && styles.discountTypeBtnActive]}
                onPress={() => setDiscountType('percent')}
              >
                <Text style={[styles.discountTypeBtnText, discountType === 'percent' && { color: colors.primary }]}>%</Text>
              </Pressable>
              <Pressable
                style={[styles.discountTypeBtn, discountType === 'flat' && styles.discountTypeBtnActive]}
                onPress={() => setDiscountType('flat')}
              >
                <Text style={[styles.discountTypeBtnText, discountType === 'flat' && { color: colors.primary }]}>$</Text>
              </Pressable>
            </View>
            <View style={styles.discountInputWrap}>
              {discountType === 'flat' && <Text style={styles.currSymbol}>$</Text>}
              <TextInput
                style={styles.discountInput}
                value={discountValue}
                onChangeText={setDiscountValue}
                keyboardType="decimal-pad"
                placeholder={discountType === 'percent' ? '10' : '5.00'}
                placeholderTextColor={colors.textMuted}
              />
              {discountType === 'percent' && <Text style={styles.currSymbol}>%</Text>}
            </View>
            <Pressable onPress={() => { setShowDiscount(false); setDiscountValue(''); }} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Tip selection */}
        <Text style={styles.sectionLabel}>Add a Tip</Text>
        <View style={styles.tipRow}>
          {TIP_PRESETS.map((t) => (
            <Pressable
              key={t.pct}
              style={[styles.tipBtn, !isCustomTip && tipPct === t.pct && styles.tipBtnActive]}
              onPress={() => { setTipPct(t.pct); setIsCustomTip(false); }}
            >
              <Text style={[styles.tipBtnText, !isCustomTip && tipPct === t.pct && { color: colors.primary }]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.tipBtn, isCustomTip && styles.tipBtnActive]}
            onPress={() => setIsCustomTip(true)}
          >
            <Text style={[styles.tipBtnText, isCustomTip && { color: colors.primary }]}>Custom</Text>
          </Pressable>
        </View>
        {isCustomTip && (
          <View style={styles.customTipRow}>
            <Text style={styles.currSymbol}>$</Text>
            <TextInput
              style={styles.customTipInput}
              value={customTip}
              onChangeText={setCustomTip}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
          </View>
        )}

        {/* Totals */}
        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>${subtotal.toFixed(2)}</Text>
          </View>
          {discountAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.success }]}>
                Discount ({discountType === 'percent' ? `${discountValue}%` : 'flat'})
              </Text>
              <Text style={[styles.totalValue, { color: colors.success }]}>-${discountAmount.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tip ({isCustomTip ? 'custom' : `${tipPct}%`})</Text>
            <Text style={styles.totalValue}>${tipAmount.toFixed(2)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandRow]}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>${total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Payment method */}
        <Text style={styles.sectionLabel}>Payment Method</Text>

        <Pressable
          style={[styles.methodCard, method === 'tap_to_pay' && styles.methodCardActive]}
          onPress={() => setMethod('tap_to_pay')}
        >
          <View style={styles.methodIcon}>
            <Ionicons name="phone-portrait-outline" size={22} color={method === 'tap_to_pay' ? colors.primary : colors.textSecondary} />
          </View>
          <View style={styles.methodInfo}>
            <Text style={[styles.methodTitle, method === 'tap_to_pay' && { color: colors.primary }]}>
              Tap to Pay
            </Text>
            <Text style={styles.methodSub}>Contactless · no reader needed</Text>
            {!terminalInitialized && !terminalInitializing && (
              <Text style={styles.methodNotReady}>Terminal not initialized</Text>
            )}
          </View>
          <View style={styles.recommendedBadge}>
            <Text style={styles.recommendedText}>Recommended</Text>
          </View>
          {method === 'tap_to_pay' && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
        </Pressable>

        <Pressable
          style={[styles.methodCard, method === 'terminal' && styles.methodCardActive]}
          onPress={() => setMethod('terminal')}
        >
          <View style={styles.methodIcon}>
            <Ionicons name="hardware-chip-outline" size={22} color={method === 'terminal' ? colors.primary : colors.textSecondary} />
          </View>
          <View style={styles.methodInfo}>
            <Text style={[styles.methodTitle, method === 'terminal' && { color: colors.primary }]}>
              M2 Card Reader
            </Text>
            <Text style={styles.methodSub}>Bluetooth swipe, chip, or tap</Text>
            {!terminalInitialized && !terminalInitializing && (
              <Text style={styles.methodNotReady}>Terminal not initialized</Text>
            )}
          </View>
          {method === 'terminal' && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
        </Pressable>

        <Pressable
          style={[styles.methodCard, method === 'manual' && styles.methodCardActive]}
          onPress={() => setMethod('manual')}
        >
          <View style={styles.methodIcon}>
            <Ionicons name="card-outline" size={22} color={method === 'manual' ? colors.primary : colors.textSecondary} />
          </View>
          <View style={styles.methodInfo}>
            <Text style={[styles.methodTitle, method === 'manual' && { color: colors.primary }]}>
              Manual Card Entry
            </Text>
            <Text style={styles.methodSub}>Type card number manually</Text>
          </View>
          {method === 'manual' && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
        </Pressable>

        <Pressable
          style={[styles.methodCard, method === 'cash' && styles.methodCardActive]}
          onPress={() => setMethod('cash')}
        >
          <View style={styles.methodIcon}>
            <Ionicons name="cash-outline" size={22} color={method === 'cash' ? colors.primary : colors.textSecondary} />
          </View>
          <View style={styles.methodInfo}>
            <Text style={[styles.methodTitle, method === 'cash' && { color: colors.primary }]}>Cash</Text>
            <Text style={styles.methodSub}>Record cash payment</Text>
          </View>
          {method === 'cash' && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
        </Pressable>

        {method === 'cash' && (
          <View style={styles.cashRow}>
            <Text style={styles.cashLabel}>Cash tendered</Text>
            <View style={styles.cashInput}>
              <Text style={styles.currSymbol}>$</Text>
              <TextInput
                style={styles.cashTextInput}
                value={cashTendered}
                onChangeText={setCashTendered}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
            </View>
            {cashChange > 0 && (
              <Text style={styles.changeText}>Change: ${cashChange.toFixed(2)}</Text>
            )}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Charge button */}
      <View style={styles.footer}>
        <Pressable
          style={[
            styles.chargeBtn,
            (isProcessing || !method || (isTerminalMethod && terminalInitializing)) && styles.chargeBtnDisabled,
          ]}
          onPress={handlePay}
          disabled={isProcessing || !method || (isTerminalMethod && terminalInitializing)}
        >
          {isProcessing && !presentingMethod ? (
            <ActivityIndicator color="#fff" />
          ) : terminalInitializing && isTerminalMethod ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.chargeBtnText}>Terminal starting…</Text>
            </>
          ) : (
            <>
              <Ionicons name="flash" size={20} color="#fff" />
              <Text style={styles.chargeBtnText}>Charge ${total.toFixed(2)}</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Presenting overlay for tap/terminal */}
      <Modal visible={!!presentingMethod} transparent animationType="fade">
        <View style={styles.presentOverlay}>
          <View style={styles.presentCard}>
            <View style={styles.presentIconRing}>
              <Ionicons
                name={presentingMethod === 'tap_to_pay' ? 'phone-portrait-outline' : 'hardware-chip-outline'}
                size={44}
                color={colors.primary}
              />
            </View>
            <Text style={styles.presentTitle}>
              {presentingMethod === 'tap_to_pay' ? 'Hold Near Card or Device' : 'Present or Insert Card'}
            </Text>
            <Text style={styles.presentSub}>
              {presentingMethod === 'tap_to_pay'
                ? 'Ask the client to tap their card or phone on the back of this device.'
                : 'Ask the client to tap, insert, or swipe their card on the reader.'}
            </Text>
            <Text style={styles.presentAmount}>${total.toFixed(2)}</Text>
            <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.card },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  scroll: { padding: 20, gap: 12 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  clientName: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  initBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryMuted, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.primary },
  initBannerText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 8 },
  tipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  tipBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  tipBtnText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  customTipRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 16, paddingVertical: 12 },
  currSymbol: { fontSize: 18, color: colors.textSecondary, marginRight: 4 },
  customTipInput: { flex: 1, fontSize: 20, fontWeight: '700', color: colors.text },
  totalsCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 14, color: colors.textSecondary },
  totalValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  grandRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 2 },
  grandLabel: { fontSize: 18, fontWeight: '800', color: colors.text },
  grandValue: { fontSize: 22, fontWeight: '800', color: colors.primary },
  methodCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, padding: 16 },
  methodCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  methodIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  methodInfo: { flex: 1 },
  methodTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  methodSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  methodNotReady: { fontSize: 11, color: colors.warning, marginTop: 3, fontWeight: '600' },
  recommendedBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.primaryMuted, marginRight: 4 },
  recommendedText: { fontSize: 10, fontWeight: '700', color: colors.primary },
  discountHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  addDiscountBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.primaryMuted },
  addDiscountText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  discountBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  discountTypeToggle: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  discountTypeBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.card },
  discountTypeBtnActive: { backgroundColor: colors.primaryMuted },
  discountTypeBtnText: { fontSize: 16, fontWeight: '800', color: colors.textSecondary },
  discountInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  discountInput: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.text },
  cashRow: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  cashLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  cashInput: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cashTextInput: { flex: 1, fontSize: 24, fontWeight: '800', color: colors.text },
  changeText: { fontSize: 15, fontWeight: '700', color: colors.success },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: colors.border },
  chargeBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  chargeBtnDisabled: { opacity: 0.45 },
  chargeBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  presentOverlay: { flex: 1, backgroundColor: '#00000090', alignItems: 'center', justifyContent: 'center', padding: 32 },
  presentCard: { width: '100%', backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 32, alignItems: 'center', gap: 14 },
  presentIconRing: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  presentTitle: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  presentSub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  presentAmount: { fontSize: 32, fontWeight: '800', color: colors.primary, marginTop: 4 },
});
