import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/constants/colors';

type TimeclockStatus = {
  clockedIn: boolean;
  record: { clockIn: string; id: number } | null;
};

type DayStats = {
  appointmentCount: number;
  completedCount: number;
  estimatedEarnings: number;
};

function Greeting({ name }: { name: string | null }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <View style={styles.greetingWrap}>
      <Text style={styles.greetingText}>{greeting},</Text>
      <Text style={styles.greetingName}>{name ?? 'there'} 👋</Text>
    </View>
  );
}

function elapsed(clockIn: string): string {
  const ms = Date.now() - new Date(clockIn).getTime();
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function TimeclockCard({ staffId, storeId }: { staffId: number; storeId?: number | null }) {
  const [toggling, setToggling] = useState(false);
  const [tick, setTick] = useState(0);

  const { data, refetch, isLoading } = useQuery<TimeclockStatus>({
    queryKey: ['/api/timeclock/status', staffId, storeId],
    queryFn: () => apiGet<TimeclockStatus>(`/api/timeclock/status/${staffId}?storeId=${storeId ?? ''}`),
    refetchInterval: 30_000,
    staleTime: 0,
  });

  useEffect(() => {
    if (!data?.clockedIn) return;
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [data?.clockedIn]);

  const clockedIn = data?.clockedIn ?? false;
  const clockInTime = data?.record?.clockIn
    ? new Date(data.record.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const duration = data?.record?.clockIn ? elapsed(data.record.clockIn) : null;

  const toggle = async () => {
    setToggling(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const endpoint = clockedIn ? '/api/timeclock/clock-out' : '/api/timeclock/clock-in';
      await apiPost(endpoint, { staffId, storeId: storeId ?? undefined });
      await refetch();
    } catch { /* ignore */ }
    setToggling(false);
  };

  return (
    <View style={[styles.timeclockCard, clockedIn && styles.timeclockCardActive]}>
      <View style={styles.timeclockTop}>
        <View>
          <Text style={styles.timeclockLabel}>Time Clock</Text>
          {clockedIn && clockInTime ? (
            <Text style={styles.timeclockSub}>Clocked in at {clockInTime} · {duration}</Text>
          ) : (
            <Text style={styles.timeclockSub}>Not currently clocked in</Text>
          )}
        </View>
        <View style={[styles.statusDot, clockedIn && styles.statusDotActive]} />
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.clockBtn,
          clockedIn ? styles.clockBtnOut : styles.clockBtnIn,
          pressed && styles.clockBtnPressed,
          (toggling || isLoading) && styles.clockBtnDisabled,
        ]}
        onPress={toggle}
        disabled={toggling || isLoading}
      >
        {toggling
          ? <ActivityIndicator color={clockedIn ? colors.error : colors.background} size="small" />
          : (
            <>
              <Ionicons
                name={clockedIn ? 'exit-outline' : 'log-in-outline'}
                size={18}
                color={clockedIn ? colors.error : colors.background}
              />
              <Text style={[styles.clockBtnText, clockedIn && styles.clockBtnTextOut]}>
                {clockedIn ? 'Clock Out' : 'Clock In'}
              </Text>
            </>
          )
        }
      </Pressable>
    </View>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: string; label: string; value: string; color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon as never} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPad = insets.top + (Platform.OS === 'ios' ? 0 : 8);

  const today = new Date();
  const todayStr = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');

  const { data: todayAppts } = useQuery<Array<{ id: number; status: string; service?: { price?: string } | null }>>({
    queryKey: ['/api/appointments/today', todayStr, user?.id, user?.storeId],
    queryFn: () => {
      const p = new URLSearchParams({ date: todayStr });
      if (user?.id) p.set('staffId', String(user.id));
      if (user?.storeId) p.set('storeId', String(user.storeId));
      return apiGet(`/api/appointments?${p}`);
    },
    enabled: !!user,
  });

  const total = todayAppts?.length ?? 0;
  const completed = todayAppts?.filter(a => a.status === 'completed').length ?? 0;
  const remaining = todayAppts?.filter(a => ['pending', 'confirmed'].includes(a.status)).length ?? 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: topPad, paddingBottom: insets.bottom + 20 }]}
      showsVerticalScrollIndicator={false}
    >
      <Greeting name={user?.name ?? null} />

      {user?.id ? (
        <TimeclockCard staffId={user.id} storeId={user.storeId} />
      ) : null}

      {/* Today's Stats */}
      <Text style={styles.sectionTitle}>Today's Overview</Text>
      <View style={styles.statsRow}>
        <StatCard icon="calendar" label="Total" value={String(total)} color={colors.primary} />
        <StatCard icon="checkmark-circle" label="Done" value={String(completed)} color={colors.success} />
        <StatCard icon="time" label="Remaining" value={String(remaining)} color={colors.warning} />
      </View>

      {/* Progress bar */}
      {total > 0 && (
        <View style={styles.progressWrap}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.round((completed / total) * 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>{Math.round((completed / total) * 100)}% complete</Text>
        </View>
      )}

      {/* Quick links */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickGrid}>
        {[
          { icon: 'calendar-outline', label: 'Schedule', color: colors.primary },
          { icon: 'cash-outline', label: 'Earnings', color: colors.success },
          { icon: 'receipt-outline', label: 'Pay Summary', color: colors.warning },
          { icon: 'document-text-outline', label: '1099 Info', color: colors.info },
        ].map(item => (
          <View key={item.label} style={styles.quickCard}>
            <View style={[styles.quickIcon, { backgroundColor: `${item.color}22` }]}>
              <Ionicons name={item.icon as never} size={22} color={item.color} />
            </View>
            <Text style={styles.quickLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20 },
  greetingWrap: { marginBottom: 24 },
  greetingText: { fontSize: 15, color: colors.textSecondary, fontFamily: 'DMSans_400Regular' },
  greetingName: { fontSize: 26, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold' },
  timeclockCard: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLarge,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  timeclockCardActive: { borderColor: colors.primary + '55' },
  timeclockTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  timeclockLabel: { fontSize: 16, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold', marginBottom: 2 },
  timeclockSub: { fontSize: 13, color: colors.textSecondary, fontFamily: 'DMSans_400Regular' },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.textMuted, marginTop: 6 },
  statusDotActive: { backgroundColor: colors.success },
  clockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: colors.radius,
  },
  clockBtnIn: { backgroundColor: colors.primary },
  clockBtnOut: { backgroundColor: 'rgba(255,71,87,0.12)', borderWidth: 1, borderColor: colors.error + '55' },
  clockBtnPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  clockBtnDisabled: { opacity: 0.5 },
  clockBtnText: { fontSize: 15, fontWeight: '700', color: colors.background, fontFamily: 'DMSans_700Bold' },
  clockBtnTextOut: { color: colors.error },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, fontFamily: 'DMSans_700Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: colors.radius,
    padding: 14,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIcon: { borderRadius: 8, padding: 6, marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold' },
  statLabel: { fontSize: 11, color: colors.textMuted, fontFamily: 'DMSans_500Medium', marginTop: 2 },
  progressWrap: { marginBottom: 24 },
  progressBar: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  progressText: { fontSize: 12, color: colors.textMuted, fontFamily: 'DMSans_400Regular', textAlign: 'right' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: {
    width: '47%',
    backgroundColor: colors.card,
    borderRadius: colors.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  quickIcon: { borderRadius: 10, padding: 8, marginBottom: 10 },
  quickLabel: { fontSize: 13, fontWeight: '600', color: colors.text, fontFamily: 'DMSans_700Bold' },
});
