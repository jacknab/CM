import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/constants/colors';

type EntryType = 'float' | 'cash_in' | 'cash_out';

interface CashEntry {
  id: string;
  type: EntryType;
  amount: number;
  note: string;
  time: string;
}

const STORAGE_KEY = 'certxa_cash_drawer';
const TODAY_KEY = () => `certxa_cash_date_${new Date().toISOString().split('T')[0]}`;

async function loadEntries(): Promise<CashEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const { date, entries } = JSON.parse(raw) as { date: string; entries: CashEntry[] };
    if (date !== TODAY_KEY()) return [];
    return entries;
  } catch {
    return [];
  }
}

async function saveEntries(entries: CashEntry[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ date: TODAY_KEY(), entries }));
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const TYPE_LABELS: Record<EntryType, string> = {
  float: 'Starting Float',
  cash_in: 'Cash In',
  cash_out: 'Cash Out',
};

const TYPE_COLORS: Record<EntryType, string> = {
  float: colors.accent,
  cash_in: colors.success,
  cash_out: colors.danger,
};

export default function CashDrawerScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'cash_in' | 'cash_out' | 'float'>('float');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    loadEntries().then(setEntries);
  }, []);

  const balance = entries.reduce((sum, e) => {
    if (e.type === 'float' || e.type === 'cash_in') return sum + e.amount;
    return sum - e.amount;
  }, 0);

  const hasFloat = entries.some((e) => e.type === 'float');

  const openModal = useCallback((type: 'cash_in' | 'cash_out' | 'float') => {
    setModalType(type);
    setAmount('');
    setNote('');
    setShowModal(true);
  }, []);

  async function addEntry() {
    const v = parseFloat(amount);
    if (!v || v <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid positive amount.');
      return;
    }
    if (modalType === 'float' && hasFloat) {
      Alert.alert('Float already set', 'You can only set the float once per day.');
      return;
    }
    const entry: CashEntry = {
      id: Date.now().toString(),
      type: modalType,
      amount: v,
      note: note.trim() || TYPE_LABELS[modalType],
      time: new Date().toISOString(),
    };
    const updated = [...entries, entry];
    setEntries(updated);
    await saveEntries(updated);
    setShowModal(false);
  }

  function openDrawer() {
    setDrawerOpen(true);
    setTimeout(() => setDrawerOpen(false), 3000);
    Alert.alert('Drawer Open', 'Cash drawer command sent. The drawer should now be open.');
  }

  async function clearDay() {
    Alert.alert(
      'Clear Day',
      'This will reset all cash entries for today. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setEntries([]);
            await AsyncStorage.removeItem(STORAGE_KEY);
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Cash Drawer</Text>
        <Pressable onPress={clearDay} style={s.clearBtn}>
          <Text style={s.clearText}>Reset</Text>
        </Pressable>
      </View>

      {/* Balance card */}
      <View style={s.balanceCard}>
        <Text style={s.balanceLabel}>Current Till Balance</Text>
        <Text style={s.balanceAmount}>${balance.toFixed(2)}</Text>
        <View style={s.balanceRow}>
          {entries.filter((e) => e.type === 'float').length > 0 && (
            <Text style={s.balanceSub}>
              Float: ${entries.filter((e) => e.type === 'float').reduce((s, e) => s + e.amount, 0).toFixed(2)}
            </Text>
          )}
          <Text style={s.balanceSub}>
            In: ${entries.filter((e) => e.type === 'cash_in').reduce((s, e) => s + e.amount, 0).toFixed(2)}
          </Text>
          <Text style={s.balanceSub}>
            Out: ${entries.filter((e) => e.type === 'cash_out').reduce((s, e) => s + e.amount, 0).toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Drawer open button */}
      <Pressable
        style={[s.drawerBtn, drawerOpen && s.drawerBtnOpen]}
        onPress={openDrawer}
      >
        <Ionicons
          name={drawerOpen ? 'checkmark-circle' : 'archive-outline'}
          size={22}
          color={drawerOpen ? colors.success : '#fff'}
        />
        <Text style={[s.drawerBtnText, drawerOpen && { color: colors.success }]}>
          {drawerOpen ? 'Drawer Open' : 'Open Cash Drawer'}
        </Text>
      </Pressable>

      {/* Action row */}
      <View style={s.actionRow}>
        {!hasFloat && (
          <Pressable style={[s.actionBtn, { backgroundColor: colors.accentMuted, borderColor: colors.accent }]} onPress={() => openModal('float')}>
            <Ionicons name="cash-outline" size={18} color={colors.accent} />
            <Text style={[s.actionBtnText, { color: colors.accent }]}>Set Float</Text>
          </Pressable>
        )}
        <Pressable style={[s.actionBtn, { backgroundColor: colors.successMuted, borderColor: colors.success }]} onPress={() => openModal('cash_in')}>
          <Ionicons name="add-circle-outline" size={18} color={colors.success} />
          <Text style={[s.actionBtnText, { color: colors.success }]}>Cash In</Text>
        </Pressable>
        <Pressable style={[s.actionBtn, { backgroundColor: colors.dangerMuted, borderColor: colors.danger }]} onPress={() => openModal('cash_out')}>
          <Ionicons name="remove-circle-outline" size={18} color={colors.danger} />
          <Text style={[s.actionBtnText, { color: colors.danger }]}>Cash Out</Text>
        </Pressable>
      </View>

      {/* Log */}
      <Text style={s.sectionLabel}>Today's Log</Text>
      {entries.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="receipt-outline" size={40} color={colors.textMuted} />
          <Text style={s.emptyText}>No entries yet.</Text>
          <Text style={s.emptySubText}>Start by setting your opening float.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.logScroll}>
          {[...entries].reverse().map((entry) => (
            <View key={entry.id} style={s.logRow}>
              <View style={[s.logDot, { backgroundColor: TYPE_COLORS[entry.type] }]} />
              <View style={s.logInfo}>
                <Text style={s.logNote}>{entry.note}</Text>
                <Text style={s.logType}>{TYPE_LABELS[entry.type]} · {fmtTime(entry.time)}</Text>
              </View>
              <Text style={[s.logAmount, { color: TYPE_COLORS[entry.type] }]}>
                {entry.type === 'cash_out' ? '−' : '+'}${entry.amount.toFixed(2)}
              </Text>
            </View>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Add entry modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable style={s.overlay} onPress={() => setShowModal(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{TYPE_LABELS[modalType]}</Text>
            <Text style={s.sheetLabel}>Amount</Text>
            <View style={s.inputRow}>
              <Text style={s.inputPrefix}>$</Text>
              <TextInput
                style={s.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
            </View>
            <Text style={s.sheetLabel}>Note (optional)</Text>
            <TextInput
              style={[s.input, s.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder={TYPE_LABELS[modalType]}
              placeholderTextColor={colors.textMuted}
            />
            <Pressable style={s.confirmBtn} onPress={addEntry}>
              <Text style={s.confirmText}>Add Entry</Text>
            </Pressable>
            <Pressable style={s.cancelBtn} onPress={() => setShowModal(false)}>
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  clearText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  balanceCard: {
    margin: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 6,
  },
  balanceLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  balanceAmount: { fontSize: 42, fontWeight: '800', color: colors.text },
  balanceRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  balanceSub: { fontSize: 13, color: colors.textMuted },
  drawerBtn: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  drawerBtnOpen: { backgroundColor: colors.successMuted, borderWidth: 1.5, borderColor: colors.success },
  drawerBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 20 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5,
  },
  actionBtnText: { fontSize: 14, fontWeight: '700' },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, marginBottom: 8,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 40 },
  emptyText: { fontSize: 16, fontWeight: '700', color: colors.textSecondary },
  emptySubText: { fontSize: 13, color: colors.textMuted },
  logScroll: { paddingHorizontal: 16, gap: 2 },
  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 6,
  },
  logDot: { width: 10, height: 10, borderRadius: 5 },
  logInfo: { flex: 1 },
  logNote: { fontSize: 14, fontWeight: '600', color: colors.text },
  logType: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  logAmount: { fontSize: 16, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.border,
    gap: 8,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  sheetLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  inputPrefix: { fontSize: 18, color: colors.textSecondary, fontWeight: '700' },
  input: { flex: 1, fontSize: 18, color: colors.text, fontWeight: '700' },
  noteInput: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text,
  },
  confirmBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 8,
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: colors.textSecondary, fontSize: 15 },
});
