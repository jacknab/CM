import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors } from '@/constants/colors';

// Clipboard — graceful no-op in Expo Go / when not installed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Clipboard: any = null;
try { Clipboard = require('expo-clipboard'); } catch {}

export default function SoloReceiptScreen() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const params = useLocalSearchParams<{ total: string; tipAmount: string; clientName: string; method: string; change: string }>();

  const total = params.total ?? '0.00';
  const tip = params.tipAmount ?? '0.00';
  const clientName = params.clientName ?? 'Walk-In';
  const method = params.method ?? 'tap';
  const change = params.change ?? '0';

  const methodLabel = method === 'tap' ? 'Tap to Pay' : method === 'manual' ? 'Card (Manual)' : 'Cash';
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  async function handleCopyReceipt() {
    const text = [
      `Certxa Receipt`,
      `Client: ${clientName}`,
      `Total: $${total}`,
      parseFloat(tip) > 0 ? `Tip: $${tip}` : null,
      method === 'cash' && parseFloat(change) > 0 ? `Change: $${change}` : null,
      `Payment: ${methodLabel}`,
      `Date: ${dateStr} · ${timeStr}`,
    ].filter(Boolean).join('\n');

    if (Clipboard?.setStringAsync) {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      Alert.alert('Not available', 'Clipboard is not available in this environment.');
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.container}>
        <View style={s.successCircle}>
          <Ionicons name="checkmark" size={52} color="#fff" />
        </View>
        <Text style={s.amount}>${total}</Text>
        <Text style={s.clientText}>{clientName}</Text>
        <Text style={s.methodText}>{methodLabel}</Text>

        <View style={s.receiptCard}>
          {parseFloat(tip) > 0 && (
            <View style={s.row}><Text style={s.rowLabel}>Tip included</Text><Text style={s.rowVal}>${tip}</Text></View>
          )}
          {method === 'cash' && parseFloat(change) > 0 && (
            <View style={s.row}><Text style={s.rowLabel}>Change given</Text><Text style={[s.rowVal, { color: colors.success }]}>${change}</Text></View>
          )}
          <View style={s.row}><Text style={s.rowLabel}>Date</Text><Text style={s.rowVal}>{dateStr} · {timeStr}</Text></View>
        </View>

        <Text style={s.sendLabel}>Send Receipt</Text>
        <View style={s.sendRow}>
          <Pressable style={s.sendBtn} onPress={() => Alert.alert('Email Receipt', 'Enter email to send.')}>
            <Ionicons name="mail-outline" size={20} color={colors.primary} />
            <Text style={s.sendBtnText}>Email</Text>
          </Pressable>
          <Pressable style={s.sendBtn} onPress={() => Alert.alert('SMS Receipt', 'Enter phone to send.')}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.primary} />
            <Text style={s.sendBtnText}>SMS</Text>
          </Pressable>
          <Pressable style={s.sendBtn} onPress={handleCopyReceipt}>
            <Ionicons name={copied ? 'checkmark-circle-outline' : 'copy-outline'} size={20} color={copied ? colors.success : colors.primary} />
            <Text style={[s.sendBtnText, copied && { color: colors.success }]}>{copied ? 'Copied!' : 'Copy'}</Text>
          </Pressable>
        </View>

        <Pressable style={s.doneBtn} onPress={() => router.replace('/(solo)/')}>
          <Text style={s.doneBtnText}>Done</Text>
        </Pressable>
        <Pressable onPress={() => router.replace('/(solo)/ticket')}>
          <Text style={s.anotherText}>Charge another client</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, alignItems: 'center', padding: 28, gap: 14 },
  successCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  amount: { fontSize: 48, fontWeight: '800', color: colors.text, letterSpacing: -1 },
  clientText: { fontSize: 18, color: colors.textSecondary, fontWeight: '600' },
  methodText: { fontSize: 14, color: colors.textMuted },
  receiptCard: { width: '100%', backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: 14, color: colors.textSecondary },
  rowVal: { fontSize: 14, fontWeight: '600', color: colors.text },
  sendLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', alignSelf: 'flex-start' },
  sendRow: { flexDirection: 'row', gap: 12, width: '100%' },
  sendBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  sendBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  doneBtn: { width: '100%', backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 4 },
  doneBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  anotherText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600', marginTop: 4 },
});
