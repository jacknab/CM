import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';

// Clipboard — graceful no-op in Expo Go / when not installed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Clipboard: any = null;
try { Clipboard = require('expo-clipboard'); } catch {}

export default function ReceiptScreen() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const params = useLocalSearchParams<{
    subtotal: string;
    discountAmount: string;
    total: string;
    tipAmount: string;
    clientName: string;
    method: string;
    change: string;
    paymentIntentId: string;
  }>();

  const subtotal = params.subtotal ?? null;
  const discountAmount = params.discountAmount ?? '';
  const total = params.total ?? '0.00';
  const tip = params.tipAmount ?? '0.00';
  const clientName = params.clientName ?? 'Walk-In';
  const method = params.method ?? 'cash';
  const change = params.change ?? '0';

  const methodLabel =
    method === 'tap_to_pay' ? 'Tap to Pay' :
    method === 'terminal'   ? 'Card (Reader)' :
    method === 'manual'     ? 'Card (Manual)' : 'Cash';
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  async function handleEmailReceipt() {
    Alert.alert('Email Receipt', 'Enter client email to send receipt.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: () => Alert.alert('Sent', 'Receipt emailed.') },
    ]);
  }

  async function handleSmsReceipt() {
    Alert.alert('SMS Receipt', 'Enter client phone number to send receipt.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: () => Alert.alert('Sent', 'Receipt sent via SMS.') },
    ]);
  }

  async function handleCopyReceipt() {
    const lines = [
      'Certxa Receipt',
      `Client: ${clientName}`,
      subtotal ? `Subtotal: $${subtotal}` : null,
      discountAmount ? `Discount: -$${discountAmount}` : null,
      `Tip: $${tip}`,
      `Total: $${total}`,
      `Payment: ${methodLabel}`,
      method === 'cash' && parseFloat(change) > 0 ? `Change: $${change}` : null,
      `Date: ${dateStr} · ${timeStr}`,
    ].filter(Boolean).join('\n');

    if (Clipboard?.setStringAsync) {
      await Clipboard.setStringAsync(lines);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      Alert.alert('Not available', 'Clipboard is not available in this environment.');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* Success icon */}
        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={48} color="#fff" />
        </View>
        <Text style={styles.successTitle}>Payment Complete</Text>
        <Text style={styles.successSub}>{clientName}</Text>

        {/* Receipt card */}
        <View style={styles.receipt}>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Total Charged</Text>
            <Text style={styles.receiptTotal}>${total}</Text>
          </View>
          <View style={styles.receiptDivider} />
          {subtotal && (
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Subtotal</Text>
              <Text style={styles.receiptValue}>${subtotal}</Text>
            </View>
          )}
          {discountAmount ? (
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.success }]}>Discount</Text>
              <Text style={[styles.receiptValue, { color: colors.success }]}>-${discountAmount}</Text>
            </View>
          ) : null}
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Tip</Text>
            <Text style={styles.receiptValue}>${tip}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Payment</Text>
            <Text style={styles.receiptValue}>{methodLabel}</Text>
          </View>
          {method === 'cash' && parseFloat(change) > 0 && (
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Change</Text>
              <Text style={[styles.receiptValue, { color: colors.success }]}>${change}</Text>
            </View>
          )}
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Date & Time</Text>
            <Text style={styles.receiptValue}>{dateStr} · {timeStr}</Text>
          </View>
        </View>

        {/* Send receipt options */}
        <Text style={styles.sendLabel}>Send Receipt</Text>
        <View style={styles.sendRow}>
          <Pressable style={styles.sendBtn} onPress={handleEmailReceipt}>
            <Ionicons name="mail-outline" size={20} color={colors.primary} />
            <Text style={styles.sendBtnText}>Email</Text>
          </Pressable>
          <Pressable style={styles.sendBtn} onPress={handleSmsReceipt}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.primary} />
            <Text style={styles.sendBtnText}>SMS</Text>
          </Pressable>
          <Pressable style={styles.sendBtn} onPress={handleCopyReceipt}>
            <Ionicons name={copied ? 'checkmark-circle-outline' : 'copy-outline'} size={20} color={copied ? colors.success : colors.primary} />
            <Text style={[styles.sendBtnText, copied && { color: colors.success }]}>{copied ? 'Copied!' : 'Copy'}</Text>
          </Pressable>
        </View>

        {/* Done */}
        <Pressable style={styles.doneBtn} onPress={() => router.replace('/(owner)/pos/')}>
          <Text style={styles.doneBtnText}>New Ticket</Text>
        </Pressable>
        <Pressable style={styles.calBtn} onPress={() => router.replace('/(owner)/')}>
          <Text style={styles.calBtnText}>Back to Calendar</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, alignItems: 'center', padding: 28, gap: 16 },
  successCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 4 },
  successTitle: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  successSub: { fontSize: 16, color: colors.textSecondary },
  receipt: { width: '100%', backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 12 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  receiptLabel: { fontSize: 14, color: colors.textSecondary },
  receiptTotal: { fontSize: 26, fontWeight: '800', color: colors.primary },
  receiptValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  receiptDivider: { height: 1, backgroundColor: colors.border },
  sendLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', alignSelf: 'flex-start' },
  sendRow: { flexDirection: 'row', gap: 12, width: '100%' },
  sendBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  sendBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  doneBtn: { width: '100%', backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  calBtn: { width: '100%', alignItems: 'center', paddingVertical: 10 },
  calBtnText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
});
