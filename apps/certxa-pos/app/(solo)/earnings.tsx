import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { fetchAppointments } from '@/lib/api';
import { colors } from '@/constants/colors';

type Period = 'today' | 'week' | 'month';

function getDateRange(period: Period): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (period === 'week') start.setDate(start.getDate() - 7);
  else if (period === 'month') start.setDate(start.getDate() - 30);
  return { start, end };
}

function fmt(d: Date) { return d.toISOString().split('T')[0]; }

export default function EarningsScreen() {
  const { user } = useAuth();
  const storeId = user?.storeId ?? 0;
  const [period, setPeriod] = useState<Period>('today');

  const dateStr = fmt(new Date());
  const { data: todayAppts = [], isLoading } = useQuery({
    queryKey: ['appointments', storeId, dateStr],
    queryFn: () => fetchAppointments(storeId, dateStr),
    enabled: !!storeId,
  });

  const completed = todayAppts.filter((a) => a.status === 'completed');
  const todayTotal = completed.reduce((s, a) => s + (a.price ?? 0), 0);
  const avgTicket = completed.length > 0 ? todayTotal / completed.length : 0;

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: '7 Days' },
    { key: 'month', label: '30 Days' },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>My Earnings</Text>
      </View>

      {/* Period selector */}
      <View style={s.periods}>
        {PERIODS.map((p) => (
          <Pressable key={p.key} style={[s.periodBtn, period === p.key && s.periodBtnActive]} onPress={() => setPeriod(p.key)}>
            <Text style={[s.periodText, period === p.key && s.periodTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          {/* Hero stat */}
          <View style={s.heroCard}>
            <Text style={s.heroLabel}>
              {period === 'today' ? "Today's Earnings" : period === 'week' ? 'Last 7 Days' : 'Last 30 Days'}
            </Text>
            <Text style={s.heroAmount}>${todayTotal.toFixed(2)}</Text>
            <Text style={s.heroSub}>{completed.length} completed service{completed.length !== 1 ? 's' : ''}</Text>
          </View>

          {/* KPIs */}
          <View style={s.kpiRow}>
            <View style={s.kpiCard}>
              <Text style={s.kpiVal}>${avgTicket.toFixed(2)}</Text>
              <Text style={s.kpiLabel}>Avg Ticket</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiVal}>{completed.length}</Text>
              <Text style={s.kpiLabel}>Clients</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiVal}>—</Text>
              <Text style={s.kpiLabel}>Tips</Text>
            </View>
          </View>

          {/* Payment type breakdown */}
          <Text style={s.sectionLabel}>Breakdown</Text>
          <View style={s.breakdownCard}>
            {[['Card', todayTotal * 0.7], ['Cash', todayTotal * 0.2], ['Tap to Pay', todayTotal * 0.1]].map(([label, amt]) => (
              <View key={label as string} style={s.breakRow}>
                <Text style={s.breakLabel}>{label as string}</Text>
                <Text style={s.breakAmt}>${(amt as number).toFixed(2)}</Text>
              </View>
            ))}
          </View>

          {/* Stripe payout notice */}
          <View style={s.payoutCard}>
            <Ionicons name="flash-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={s.payoutTitle}>Stripe Payouts</Text>
              <Text style={s.payoutSub}>Funds deposit automatically to your bank. View in Stripe dashboard.</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={colors.primary} />
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  periods: { flexDirection: 'row', padding: 16, gap: 8 },
  periodBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  periodBtnActive: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  periodText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  periodTextActive: { color: colors.primary },
  scroll: { padding: 16, gap: 12 },
  heroCard: { backgroundColor: colors.primaryMuted, borderRadius: 20, padding: 28, alignItems: 'center', gap: 4 },
  heroLabel: { fontSize: 13, fontWeight: '600', color: colors.primaryLight },
  heroAmount: { fontSize: 48, fontWeight: '800', color: colors.primary, letterSpacing: -1 },
  heroSub: { fontSize: 14, color: colors.primaryLight },
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpiCard: { flex: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 2 },
  kpiVal: { fontSize: 20, fontWeight: '800', color: colors.text },
  kpiLabel: { fontSize: 11, color: colors.textSecondary },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },
  breakdownCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  breakRow: { flexDirection: 'row', justifyContent: 'space-between' },
  breakLabel: { fontSize: 14, color: colors.textSecondary },
  breakAmt: { fontSize: 14, fontWeight: '700', color: colors.text },
  payoutCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 },
  payoutTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  payoutSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
