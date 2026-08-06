import { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { fetchAppointments, fetchAppointmentsByRange, fetchStaff } from '@/lib/api';
import { colors } from '@/constants/colors';

type Period = 'today' | 'week' | 'month';

function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getRange(period: Period): { start: string; end: string; label: string } {
  const now = new Date();
  if (period === 'today') {
    const d = fmt(now);
    return { start: d, end: d, label: now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) };
  }
  if (period === 'week') {
    const dayOfWeek = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);
    return { start: fmt(start), end: fmt(now), label: `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: fmt(start), end: fmt(now), label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
}

export default function ReportsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const storeId = user?.storeId ?? 0;
  const [period, setPeriod] = useState<Period>('today');

  const { start, end, label } = getRange(period);

  const { data: appts = [], isLoading: apptLoading } = useQuery({
    queryKey: ['appointments-range', storeId, start, end],
    queryFn: () =>
      period === 'today'
        ? fetchAppointments(storeId, start)
        : fetchAppointmentsByRange(storeId, start, end),
    enabled: !!storeId,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', storeId],
    queryFn: () => fetchStaff(storeId),
    enabled: !!storeId,
  });

  const completed = useMemo(() => appts.filter((a) => a.status === 'completed'), [appts]);
  const revenue = useMemo(() => completed.reduce((s, a) => s + (a.price ?? 0), 0), [completed]);
  const avgTicket = completed.length > 0 ? revenue / completed.length : 0;

  const topServices = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    for (const a of completed) {
      if (!map[a.serviceName]) map[a.serviceName] = { count: 0, revenue: 0 };
      map[a.serviceName].count++;
      map[a.serviceName].revenue += a.price ?? 0;
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [completed]);

  const byStaff = useMemo(() =>
    staff.map((st) => {
      const mine = completed.filter((a) => a.staffId === st.id);
      return { ...st, count: mine.length, revenue: mine.reduce((s, a) => s + (a.price ?? 0), 0) };
    }).sort((a, b) => b.revenue - a.revenue),
    [staff, completed],
  );

  const isLoading = apptLoading;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Reports</Text>
        <View style={s.headerRight}>
          {period === 'today' && (
            <Pressable style={s.dayCloseBtn} onPress={() => router.push('/(owner)/day-close')}>
              <Ionicons name="moon-outline" size={15} color={colors.primary} />
              <Text style={s.dayCloseBtnText}>Day Close</Text>
            </Pressable>
          )}
          <Text style={s.dateLabel}>{label}</Text>
        </View>
      </View>

      {/* Period selector */}
      <View style={s.periodRow}>
        {(['today', 'week', 'month'] as Period[]).map((p) => (
          <Pressable
            key={p}
            style={[s.periodBtn, period === p && s.periodBtnActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[s.periodBtnText, period === p && s.periodBtnTextActive]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          {/* Revenue banner */}
          <View style={s.revCard}>
            <Text style={s.revLabel}>Total Revenue</Text>
            <Text style={s.revAmount}>${revenue.toFixed(2)}</Text>
            <Text style={s.revSub}>{completed.length} services · ${avgTicket.toFixed(2)} avg</Text>
          </View>

          {/* KPIs */}
          <View style={s.kpiRow}>
            {[
              { label: 'Total Appts', val: appts.length, color: colors.text },
              { label: 'Completed', val: completed.length, color: colors.success },
              { label: 'No Shows', val: appts.filter((a) => a.status === 'no_show').length, color: colors.danger },
              { label: 'Cancelled', val: appts.filter((a) => a.status === 'cancelled').length, color: colors.amber },
            ].map((k) => (
              <View key={k.label} style={s.kpiCard}>
                <Text style={[s.kpiVal, { color: k.color }]}>{k.val}</Text>
                <Text style={s.kpiLabel}>{k.label}</Text>
              </View>
            ))}
          </View>

          {/* Top Services */}
          {topServices.length > 0 && (
            <>
              <Text style={s.sectionLabel}>Top Services</Text>
              {topServices.map((svc, idx) => (
                <View key={svc.name} style={s.svcRow}>
                  <View style={s.svcRank}>
                    <Text style={s.svcRankText}>#{idx + 1}</Text>
                  </View>
                  <View style={s.svcInfo}>
                    <Text style={s.svcName}>{svc.name}</Text>
                    <Text style={s.svcCount}>{svc.count} booking{svc.count !== 1 ? 's' : ''}</Text>
                  </View>
                  <Text style={s.svcRev}>${svc.revenue.toFixed(2)}</Text>
                </View>
              ))}
            </>
          )}

          {/* Staff Earnings */}
          <Text style={s.sectionLabel}>Staff Earnings</Text>
          {byStaff.filter((st) => st.count > 0).map((st) => (
            <View key={st.id} style={s.staffRow}>
              <View style={s.staffAvatar}>
                <Text style={s.staffInitials}>{st.name.charAt(0)}</Text>
              </View>
              <View style={s.staffInfo}>
                <Text style={s.staffName}>{st.name}</Text>
                <Text style={s.staffCount}>{st.count} service{st.count !== 1 ? 's' : ''}</Text>
              </View>
              <Text style={s.staffRev}>${st.revenue.toFixed(2)}</Text>
            </View>
          ))}

          {completed.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="bar-chart-outline" size={36} color={colors.textMuted} />
              <Text style={s.emptyText}>No completed services for this period</Text>
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  dateLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  dayCloseBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryMuted, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  dayCloseBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  periodRow: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  periodBtnActive: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  periodBtnText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  periodBtnTextActive: { color: colors.primary },
  scroll: { padding: 16, gap: 12 },
  revCard: { backgroundColor: colors.primaryMuted, borderRadius: 20, padding: 24, alignItems: 'center', gap: 4 },
  revLabel: { fontSize: 13, fontWeight: '600', color: colors.primaryLight },
  revAmount: { fontSize: 44, fontWeight: '800', color: colors.primary, letterSpacing: -1 },
  revSub: { fontSize: 14, color: colors.primaryLight },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiCard: { flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, alignItems: 'center', gap: 2 },
  kpiVal: { fontSize: 22, fontWeight: '800' },
  kpiLabel: { fontSize: 10, color: colors.textSecondary, textAlign: 'center' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 },
  svcRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 12 },
  svcRank: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  svcRankText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  svcInfo: { flex: 1 },
  svcName: { fontSize: 14, fontWeight: '700', color: colors.text },
  svcCount: { fontSize: 12, color: colors.textSecondary },
  svcRev: { fontSize: 16, fontWeight: '800', color: colors.text },
  staffRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12 },
  staffAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  staffInitials: { fontSize: 16, fontWeight: '700', color: colors.primary },
  staffInfo: { flex: 1 },
  staffName: { fontSize: 15, fontWeight: '700', color: colors.text },
  staffCount: { fontSize: 12, color: colors.textSecondary },
  staffRev: { fontSize: 18, fontWeight: '800', color: colors.text },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 14, color: colors.textSecondary },
});
