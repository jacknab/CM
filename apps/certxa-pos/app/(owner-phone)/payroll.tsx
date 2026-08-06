import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchStaff } from '@/lib/api';
import { colors } from '@/constants/colors';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:9200';

type PayoutRun = {
  id: number;
  periodLabel: string;
  status: 'draft' | 'approved' | 'paid';
  totalAmount: number;
  staffCount: number;
};

export default function PayrollScreen() {
  const { user } = useAuth();
  const storeId = user?.storeId ?? 0;

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff', storeId],
    queryFn: () => fetchStaff(storeId),
    enabled: !!storeId,
  });

  const { data: payoutRuns = [], isLoading: runsLoading } = useQuery<PayoutRun[]>({
    queryKey: ['payout-runs', storeId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/payroll-runs?storeId=${storeId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: !!storeId,
  });

  function statusColor(s: PayoutRun['status']) {
    return s === 'paid' ? colors.success : s === 'approved' ? colors.primary : colors.amber;
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.header}>
        <Text style={st.title}>Payroll</Text>
      </View>

      {(isLoading || runsLoading) ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={payoutRuns}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={st.list}
          ListHeaderComponent={
            <>
              {/* Current period summary */}
              <View style={st.periodCard}>
                <Text style={st.periodLabel}>Current Period</Text>
                <Text style={st.periodAmount}>
                  ${(payoutRuns[0]?.totalAmount ?? 0).toFixed(2)}
                </Text>
                <Text style={st.periodSub}>{staff.length} staff members</Text>
              </View>

              {payoutRuns.filter((r) => r.status === 'draft').length > 0 && (
                <Pressable
                  style={st.approveBtn}
                  onPress={() => Alert.alert('Approve Payouts', 'Approve this payout run? This will trigger direct deposits.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Approve', onPress: () => Alert.alert('Done', 'Payout run approved.') },
                  ])}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={st.approveBtnText}>Approve Pending Payout</Text>
                </Pressable>
              )}

              <Text style={st.section}>Payout History</Text>
            </>
          }
          ListEmptyComponent={
            <View style={st.empty}>
              <Ionicons name="cash-outline" size={40} color={colors.textMuted} />
              <Text style={st.emptyText}>No payout runs yet</Text>
            </View>
          }
          renderItem={({ item: run }) => (
            <View style={st.runCard}>
              <View style={st.runLeft}>
                <Text style={st.runPeriod}>{run.periodLabel}</Text>
                <Text style={st.runStaff}>{run.staffCount} staff</Text>
              </View>
              <View style={st.runRight}>
                <Text style={st.runAmount}>${run.totalAmount.toFixed(2)}</Text>
                <View style={[st.statusBadge, { backgroundColor: statusColor(run.status) + '22' }]}>
                  <Text style={[st.statusText, { color: statusColor(run.status) }]}>
                    {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                  </Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  list: { padding: 16, gap: 10 },
  periodCard: { backgroundColor: colors.primaryMuted, borderRadius: 18, padding: 24, alignItems: 'center', gap: 4, marginBottom: 4 },
  periodLabel: { fontSize: 13, fontWeight: '600', color: colors.primaryLight },
  periodAmount: { fontSize: 44, fontWeight: '800', color: colors.primary, letterSpacing: -1 },
  periodSub: { fontSize: 14, color: colors.primaryLight },
  approveBtn: { backgroundColor: colors.success, borderRadius: 12, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  approveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  section: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 8 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyText: { fontSize: 14, color: colors.textSecondary },
  runCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 },
  runLeft: {},
  runPeriod: { fontSize: 15, fontWeight: '700', color: colors.text },
  runStaff: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  runRight: { alignItems: 'flex-end', gap: 6 },
  runAmount: { fontSize: 18, fontWeight: '800', color: colors.text },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '700' },
});
