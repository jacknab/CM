import { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { fetchAppointments, fetchStaff } from '@/lib/api';
import { colors } from '@/constants/colors';

function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}

function fmtCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  no_show: 'No Show',
  cancelled: 'Cancelled',
  confirmed: 'Confirmed',
  scheduled: 'Scheduled',
  checked_in: 'Checked In',
};

export default function DayCloseScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const storeId = user?.storeId ?? 0;
  const today = fmt(new Date());
  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const { data: appts = [], isLoading: apptLoading } = useQuery({
    queryKey: ['appointments', storeId, today],
    queryFn: () => fetchAppointments(storeId, today),
    enabled: !!storeId,
  });

  const { data: staff = [], isLoading: staffLoading } = useQuery({
    queryKey: ['staff', storeId],
    queryFn: () => fetchStaff(storeId),
    enabled: !!storeId,
  });

  const isLoading = apptLoading || staffLoading;

  const completed = useMemo(() => appts.filter((a) => a.status === 'completed'), [appts]);
  const noShows = useMemo(() => appts.filter((a) => a.status === 'no_show'), [appts]);
  const cancelled = useMemo(() => appts.filter((a) => a.status === 'cancelled'), [appts]);

  const totalRevenue = useMemo(() => completed.reduce((s, a) => s + (a.price ?? 0), 0), [completed]);
  const avgTicket = completed.length > 0 ? totalRevenue / completed.length : 0;

  const byStaff = useMemo(() =>
    staff.map((st) => {
      const mine = completed.filter((a) => a.staffId === st.id);
      return {
        ...st,
        ticketCount: mine.length,
        revenue: mine.reduce((s, a) => s + (a.price ?? 0), 0),
      };
    })
    .filter((st) => st.ticketCount > 0)
    .sort((a, b) => b.revenue - a.revenue),
    [staff, completed],
  );

  const unassignedAppts = completed.filter((a) => !a.staffId);
  const unassignedRevenue = unassignedAppts.reduce((s, a) => s + (a.price ?? 0), 0);

  const byService = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    for (const a of completed) {
      if (!map[a.serviceName]) map[a.serviceName] = { count: 0, revenue: 0 };
      map[a.serviceName].count++;
      map[a.serviceName].revenue += a.price ?? 0;
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [completed]);

  const [closing, setClosing] = useState(false);

  async function handleExport() {
    const lines = [
      `Day Close Report — ${dateLabel}`,
      `Store: ${user?.storeName ?? ''}`,
      '',
      '── SUMMARY ──────────────────',
      `Total Revenue:   ${fmtCurrency(totalRevenue)}`,
      `Tickets:         ${completed.length}`,
      `Avg Ticket:      ${fmtCurrency(avgTicket)}`,
      `No Shows:        ${noShows.length}`,
      `Cancelled:       ${cancelled.length}`,
      '',
      '── BY STAFF ─────────────────',
      ...byStaff.map((st) => `${st.name.padEnd(20)} ${st.ticketCount} tickets  ${fmtCurrency(st.revenue)}`),
      ...(unassignedRevenue > 0
        ? [`Unassigned           ${unassignedAppts.length} tickets  ${fmtCurrency(unassignedRevenue)}`]
        : []),
      '',
      '── BY SERVICE ───────────────',
      ...byService.map((sv) => `${sv.name.padEnd(20)} ×${sv.count}  ${fmtCurrency(sv.revenue)}`),
    ];
    try {
      await Share.share({ message: lines.join('\n'), title: `Day Close ${today}` });
    } catch {
      Alert.alert('Export failed', 'Could not open share sheet.');
    }
  }

  function handleClose() {
    Alert.alert(
      'Close the Day?',
      `You're about to close ${dateLabel}.\n\nRevenue: ${fmtCurrency(totalRevenue)} · ${completed.length} tickets\n\nThis is for your records only — no data is deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Day',
          style: 'default',
          onPress: () => {
            setClosing(true);
            setTimeout(() => {
              setClosing(false);
              Alert.alert(
                '✓ Day Closed',
                `Great work today!\n\n${fmtCurrency(totalRevenue)} across ${completed.length} services.`,
                [{ text: 'Done', onPress: () => router.back() }],
              );
            }, 800);
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
        <View style={s.headerCenter}>
          <Text style={s.title}>Day Close</Text>
          <Text style={s.subtitle}>{dateLabel}</Text>
        </View>
        <Pressable onPress={handleExport} style={s.exportBtn}>
          <Ionicons name="share-outline" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.loaderText}>Loading today's data…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          {/* Revenue banner */}
          <View style={s.revCard}>
            <Text style={s.revLabel}>Total Revenue</Text>
            <Text style={s.revAmount}>{fmtCurrency(totalRevenue)}</Text>
            <Text style={s.revSub}>
              {completed.length} {completed.length === 1 ? 'ticket' : 'tickets'} · {fmtCurrency(avgTicket)} avg
            </Text>
          </View>

          {/* KPI row */}
          <View style={s.kpiRow}>
            <View style={[s.kpiCard, { borderColor: colors.success }]}>
              <Text style={[s.kpiVal, { color: colors.success }]}>{completed.length}</Text>
              <Text style={s.kpiLabel}>Completed</Text>
            </View>
            <View style={[s.kpiCard, { borderColor: colors.danger }]}>
              <Text style={[s.kpiVal, { color: colors.danger }]}>{noShows.length}</Text>
              <Text style={s.kpiLabel}>No Shows</Text>
            </View>
            <View style={[s.kpiCard, { borderColor: colors.warning }]}>
              <Text style={[s.kpiVal, { color: colors.warning }]}>{cancelled.length}</Text>
              <Text style={s.kpiLabel}>Cancelled</Text>
            </View>
            <View style={[s.kpiCard, { borderColor: colors.border }]}>
              <Text style={[s.kpiVal, { color: colors.text }]}>{appts.length}</Text>
              <Text style={s.kpiLabel}>Total Appts</Text>
            </View>
          </View>

          {/* Per-staff breakdown */}
          {byStaff.length > 0 && (
            <>
              <Text style={s.sectionLabel}>By Staff Member</Text>
              <View style={s.card}>
                {byStaff.map((st, i) => (
                  <View key={st.id} style={[s.staffRow, i < byStaff.length - 1 && s.staffRowBorder]}>
                    <View style={[s.staffDot, { backgroundColor: st.color ?? colors.primary }]} />
                    <Text style={s.staffName} numberOfLines={1}>{st.name}</Text>
                    <Text style={s.staffCount}>{st.ticketCount} {st.ticketCount === 1 ? 'ticket' : 'tickets'}</Text>
                    <Text style={s.staffRevenue}>{fmtCurrency(st.revenue)}</Text>
                  </View>
                ))}
                {unassignedRevenue > 0 && (
                  <View style={s.staffRow}>
                    <View style={[s.staffDot, { backgroundColor: colors.textMuted }]} />
                    <Text style={s.staffName}>Unassigned</Text>
                    <Text style={s.staffCount}>{unassignedAppts.length} {unassignedAppts.length === 1 ? 'ticket' : 'tickets'}</Text>
                    <Text style={s.staffRevenue}>{fmtCurrency(unassignedRevenue)}</Text>
                  </View>
                )}
              </View>
            </>
          )}

          {/* By service */}
          {byService.length > 0 && (
            <>
              <Text style={s.sectionLabel}>By Service</Text>
              <View style={s.card}>
                {byService.map((sv, i) => {
                  const pct = totalRevenue > 0 ? sv.revenue / totalRevenue : 0;
                  return (
                    <View key={sv.name} style={[s.serviceRow, i < byService.length - 1 && s.staffRowBorder]}>
                      <View style={s.serviceInfo}>
                        <Text style={s.serviceName} numberOfLines={1}>{sv.name}</Text>
                        <View style={s.barTrack}>
                          <View style={[s.barFill, { width: `${Math.round(pct * 100)}%` }]} />
                        </View>
                      </View>
                      <Text style={s.serviceCount}>×{sv.count}</Text>
                      <Text style={s.serviceRevenue}>{fmtCurrency(sv.revenue)}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Appointment list */}
          {appts.length > 0 && (
            <>
              <Text style={s.sectionLabel}>All Appointments</Text>
              <View style={s.card}>
                {appts
                  .slice()
                  .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                  .map((appt, i) => {
                    const statusColor =
                      appt.status === 'completed' ? colors.success
                        : appt.status === 'no_show' ? colors.danger
                        : appt.status === 'cancelled' ? colors.warning
                        : colors.textMuted;
                    const time = new Date(appt.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    return (
                      <View key={appt.id} style={[s.apptRow, i < appts.length - 1 && s.staffRowBorder]}>
                        <Text style={s.apptTime}>{time}</Text>
                        <View style={s.apptInfo}>
                          <Text style={s.apptClient} numberOfLines={1}>{appt.clientName}</Text>
                          <Text style={s.apptService} numberOfLines={1}>{appt.serviceName}</Text>
                        </View>
                        <View style={[s.statusBadge, { backgroundColor: `${statusColor}20` }]}>
                          <Text style={[s.statusText, { color: statusColor }]}>
                            {STATUS_LABELS[appt.status] ?? appt.status}
                          </Text>
                        </View>
                        <Text style={s.apptPrice}>{fmtCurrency(appt.price ?? 0)}</Text>
                      </View>
                    );
                  })}
              </View>
            </>
          )}

          {appts.length === 0 && !isLoading && (
            <View style={s.emptyState}>
              <Ionicons name="calendar-outline" size={44} color={colors.textMuted} />
              <Text style={s.emptyText}>No appointments today</Text>
            </View>
          )}

          {/* Close day button */}
          <Pressable
            style={[s.closeBtn, closing && { opacity: 0.6 }]}
            onPress={handleClose}
            disabled={closing}
          >
            {closing
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="moon-outline" size={20} color="#fff" />
                  <Text style={s.closeBtnText}>Close Day</Text>
                </>}
          </Pressable>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
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
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  exportBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loaderText: { color: colors.textSecondary, fontSize: 14 },
  scroll: { padding: 16, gap: 12 },
  revCard: {
    backgroundColor: colors.primaryMuted,
    borderRadius: 16, padding: 20, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: colors.primary,
  },
  revLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  revAmount: { fontSize: 44, fontWeight: '800', color: colors.text },
  revSub: { fontSize: 13, color: colors.textSecondary },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 12,
    alignItems: 'center', gap: 4, borderWidth: 1.5,
  },
  kpiVal: { fontSize: 22, fontWeight: '800' },
  kpiLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
  },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  staffRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
  },
  staffRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  staffDot: { width: 10, height: 10, borderRadius: 5 },
  staffName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  staffCount: { fontSize: 12, color: colors.textSecondary, minWidth: 64, textAlign: 'right' },
  staffRevenue: { fontSize: 15, fontWeight: '700', color: colors.text, minWidth: 72, textAlign: 'right' },
  serviceRow: { padding: 14, gap: 6 },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  barTrack: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
  serviceCount: { fontSize: 12, color: colors.textSecondary, minWidth: 32, textAlign: 'right' },
  serviceRevenue: { fontSize: 14, fontWeight: '700', color: colors.text, minWidth: 72, textAlign: 'right' },
  apptRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  apptTime: { fontSize: 12, fontWeight: '600', color: colors.textMuted, minWidth: 52 },
  apptInfo: { flex: 1 },
  apptClient: { fontSize: 13, fontWeight: '700', color: colors.text },
  apptService: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  apptPrice: { fontSize: 13, fontWeight: '700', color: colors.text, minWidth: 56, textAlign: 'right' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 16, color: colors.textSecondary, fontWeight: '600' },
  closeBtn: {
    backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 8,
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
