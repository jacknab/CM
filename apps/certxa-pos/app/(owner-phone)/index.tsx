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
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { fetchAppointments, fetchStaff } from '@/lib/api';
import { colors } from '@/constants/colors';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

function formatDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')}${ampm}`;
}

export default function OwnerDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const dateStr = formatDate(new Date());
  const storeId = user?.storeId ?? 0;

  const { data: appts = [], isLoading: apptLoading, refetch, isFetching } = useQuery({
    queryKey: ['appointments', storeId, dateStr],
    queryFn: () => fetchAppointments(storeId, dateStr),
    enabled: !!storeId,
    refetchInterval: 120_000,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', storeId],
    queryFn: () => fetchStaff(storeId),
    enabled: !!storeId,
  });

  const totalRevenue = appts
    .filter((a) => a.status === 'completed')
    .reduce((s, a) => s + (a.price ?? 0), 0);
  const completedCount = appts.filter((a) => a.status === 'completed').length;
  const upcomingCount = appts.filter(
    (a) => a.status === 'scheduled' || a.status === 'confirmed' || a.status === 'checked_in',
  ).length;

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const nextAppts = [...appts]
    .filter((a) => a.status === 'scheduled' || a.status === 'confirmed' || a.status === 'checked_in')
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 5);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isFetching && !apptLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
      >
        {/* Greeting */}
        <View style={styles.topRow}>
          <View>
            <Text style={styles.dateText}>{dateLabel}</Text>
            <Text style={styles.greeting}>
              {user?.storeName ?? 'Your Business'}
            </Text>
          </View>
          <View style={styles.logoMark}>
            <Ionicons name="flash" size={18} color="#fff" />
          </View>
        </View>

        {/* KPI cards */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { backgroundColor: colors.primaryMuted }]}>
            <Text style={[styles.kpiValue, { color: colors.primary }]}>${totalRevenue.toFixed(0)}</Text>
            <Text style={styles.kpiLabel}>Today's Revenue</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: colors.successMuted }]}>
            <Text style={[styles.kpiValue, { color: colors.success }]}>{completedCount}</Text>
            <Text style={styles.kpiLabel}>Completed</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: colors.accentMuted }]}>
            <Text style={[styles.kpiValue, { color: colors.accent }]}>{upcomingCount}</Text>
            <Text style={styles.kpiLabel}>Upcoming</Text>
          </View>
        </View>

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          {[
            { icon: 'people-outline', label: 'Staff', route: '/(owner-phone)/staff/' },
            { icon: 'cash-outline', label: 'Payroll', route: '/(owner-phone)/payroll' },
            { icon: 'settings-outline', label: 'Settings', route: '/(owner-phone)/settings' },
          ].map((action) => (
            <Pressable
              key={action.label}
              style={styles.actionCard}
              onPress={() => router.push(action.route as never)}
            >
              <Ionicons name={action.icon as never} size={24} color={colors.primary} />
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Upcoming appointments */}
        <Text style={styles.sectionTitle}>Up Next</Text>
        {apptLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : nextAppts.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>No upcoming appointments today.</Text>
          </Card>
        ) : (
          nextAppts.map((a) => (
            <Card key={a.id} style={styles.apptCard} padded={false}>
              <View style={styles.apptInner}>
                <View style={styles.apptLeft}>
                  <Text style={styles.apptTime}>{formatTime(a.startTime)}</Text>
                </View>
                <View style={styles.apptMid}>
                  <Text style={styles.apptClient}>{a.clientName}</Text>
                  <Text style={styles.apptService}>{a.serviceName}</Text>
                  {a.staffName && (
                    <Text style={styles.apptStaff}>with {a.staffName}</Text>
                  )}
                </View>
                <Badge
                  label={a.status === 'checked_in' ? 'Here' : a.status}
                  variant={a.status === 'checked_in' ? 'success' : 'info'}
                />
              </View>
            </Card>
          ))
        )}

        {/* Staff count */}
        <Text style={styles.sectionTitle}>Staff on Today</Text>
        <Card>
          <Text style={styles.staffCountText}>
            {staff.length} active staff member{staff.length !== 1 ? 's' : ''}
          </Text>
          <Pressable style={styles.viewAllLink} onPress={() => router.push('/(owner-phone)/staff/')}>
            <Text style={styles.viewAllText}>View all staff →</Text>
          </Pressable>
        </Card>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, gap: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  dateText: { fontSize: 13, color: colors.textSecondary, marginBottom: 2 },
  greeting: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  logoMark: { width: 40, height: 40, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  kpiCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
  kpiValue: { fontSize: 22, fontWeight: '800' },
  kpiLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  actionCard: { flex: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, alignItems: 'center', gap: 6 },
  actionLabel: { fontSize: 12, fontWeight: '600', color: colors.text },
  apptCard: { marginBottom: 8 },
  apptInner: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  apptLeft: { width: 48, alignItems: 'center' },
  apptTime: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  apptMid: { flex: 1 },
  apptClient: { fontSize: 15, fontWeight: '700', color: colors.text },
  apptService: { fontSize: 13, color: colors.textSecondary },
  apptStaff: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  staffCountText: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
  viewAllLink: {},
  viewAllText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
});
