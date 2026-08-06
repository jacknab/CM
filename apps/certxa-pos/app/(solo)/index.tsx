import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { fetchAppointments, updateAppointmentStatus, type Appointment } from '@/lib/api';
import { colors } from '@/constants/colors';
import { Badge } from '@/components/ui/Badge';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')}${ampm}`;
}

function statusVariant(status: Appointment['status']): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'confirmed': return 'info';
    case 'checked_in': return 'success';
    case 'completed': return 'success';
    case 'no_show': return 'danger';
    case 'cancelled': return 'danger';
    default: return 'default';
  }
}

function statusLabel(status: Appointment['status']): string {
  return status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MyDayScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const dateStr = formatDate(new Date());
  const storeId = user?.storeId ?? 0;

  const { data: appointments = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['appointments', storeId, dateStr],
    queryFn: () => fetchAppointments(storeId, dateStr),
    enabled: !!storeId,
    refetchInterval: 60_000,
  });

  const totalEarnings = appointments
    .filter((a) => a.status === 'completed')
    .reduce((sum, a) => sum + (a.price ?? 0), 0);

  const upcomingCount = appointments.filter(
    (a) => a.status === 'scheduled' || a.status === 'confirmed' || a.status === 'checked_in',
  ).length;

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  async function handleCheckIn(id: number) {
    await updateAppointmentStatus(id, 'checked_in');
    qc.invalidateQueries({ queryKey: ['appointments', storeId, dateStr] });
  }

  async function handleComplete(id: number) {
    await updateAppointmentStatus(id, 'completed');
    qc.invalidateQueries({ queryKey: ['appointments', storeId, dateStr] });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.dateLabel}>{dateLabel}</Text>
          <Text style={styles.greeting}>My Day</Text>
        </View>
        <View style={styles.earningsPill}>
          <Text style={styles.earningsAmount}>${totalEarnings.toFixed(2)}</Text>
          <Text style={styles.earningsSub}>earned today</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{appointments.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: colors.primary }]}>{upcomingCount}</Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: colors.success }]}>
            {appointments.filter((a) => a.status === 'completed').length}
          </Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
      </View>

      {/* Appointments list */}
      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
        >
          {appointments.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No appointments today</Text>
              <Text style={styles.emptySub}>Walk-ins or quick charges below</Text>
            </View>
          ) : (
            appointments
              .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
              .map((appt) => (
                <View key={appt.id} style={styles.apptCard}>
                  <View style={styles.apptTimeCol}>
                    <Text style={styles.apptTime}>{formatTime(appt.startTime)}</Text>
                    <View style={styles.apptTimeLine} />
                  </View>
                  <View style={styles.apptBody}>
                    <View style={styles.apptTopRow}>
                      <Text style={styles.apptClient}>{appt.clientName}</Text>
                      <Badge label={statusLabel(appt.status)} variant={statusVariant(appt.status)} />
                    </View>
                    <Text style={styles.apptService}>{appt.serviceName}</Text>
                    <Text style={styles.apptPrice}>${(appt.price ?? 0).toFixed(2)}</Text>

                    {(appt.status === 'scheduled' || appt.status === 'confirmed') && (
                      <Pressable
                        style={styles.checkInBtn}
                        onPress={() => handleCheckIn(appt.id)}
                      >
                        <Text style={styles.checkInText}>Check In</Text>
                      </Pressable>
                    )}
                    {appt.status === 'checked_in' && (
                      <Pressable
                        style={[styles.checkInBtn, { backgroundColor: colors.primaryMuted }]}
                        onPress={() => handleComplete(appt.id)}
                      >
                        <Text style={[styles.checkInText, { color: colors.primary }]}>
                          Mark Complete &amp; Collect Payment
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* FAB — Quick Charge */}
      <Pressable
        style={styles.fab}
        onPress={() => router.push('/(solo)/ticket')}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Walk-In / Quick Charge</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 2 },
  greeting: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  earningsPill: {
    backgroundColor: colors.successMuted,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'flex-end',
  },
  earningsAmount: { fontSize: 20, fontWeight: '800', color: colors.success },
  earningsSub: { fontSize: 11, color: colors.success, opacity: 0.8 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statNum: { fontSize: 22, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 14, color: colors.textSecondary },
  apptCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  apptTimeCol: { width: 60, alignItems: 'center', paddingTop: 16, paddingBottom: 8 },
  apptTime: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  apptTimeLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 6, borderRadius: 1 },
  apptBody: { flex: 1, padding: 14, gap: 4 },
  apptTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  apptClient: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 },
  apptService: { fontSize: 13, color: colors.textSecondary },
  apptPrice: { fontSize: 14, fontWeight: '700', color: colors.text },
  checkInBtn: {
    marginTop: 8,
    backgroundColor: colors.successMuted,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  checkInText: { fontSize: 13, fontWeight: '700', color: colors.success },
  fab: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
