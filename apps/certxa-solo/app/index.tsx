import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '@/lib/apiClient';
import { clearToken } from '@/lib/authSession';
import { Colors } from '@/constants/colors';

interface Appointment {
  id: number;
  date: string;
  duration: number;
  status: string;
  customer?: { fullName?: string; name?: string; firstName?: string; lastName?: string } | null;
  service?: { name?: string; price?: string | number } | null;
}

function clientName(apt: Appointment): string {
  const c = apt.customer;
  if (!c) return 'Walk-in';
  return c.fullName || c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Client';
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', confirmed: 'Checked in', started: 'In progress',
  completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show',
};

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [day, setDay] = useState(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (forDay: Date) => {
    setLoading(true);
    setError(null);
    try {
      const from = startOfDay(forDay).toISOString();
      const to = endOfDay(forDay).toISOString();
      const result = await api.get(`/api/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setAppointments(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your calendar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(day);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [day]),
  );

  const isToday = startOfDay(day).getTime() === startOfDay(new Date()).getTime();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{isToday ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
          <TouchableOpacity onPress={() => { clearToken().then(() => router.replace('/login')); }}>
            <Text style={styles.logout}>Sign out</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.dayNav}>
          <TouchableOpacity style={styles.navButton} onPress={() => setDay((d) => addDays(d, -1))}>
            <Text style={styles.navButtonText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setDay(new Date())}>
            <Text style={styles.navButtonText}>•</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setDay((d) => addDays(d, 1))}>
            <Text style={styles.navButtonText}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={appointments}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(day)} tintColor={Colors.primary} />}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No appointments this day.</Text> : null}
        renderItem={({ item }) => {
          const time = new Date(item.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
          const payable = item.status !== 'cancelled' && item.status !== 'completed';
          return (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.time}>{time}</Text>
                <Text style={styles.status}>{STATUS_LABEL[item.status] ?? item.status}</Text>
              </View>
              <Text style={styles.client}>{clientName(item)}</Text>
              <Text style={styles.service}>{item.service?.name ?? 'Service'}</Text>
              {payable && (
                <TouchableOpacity
                  style={styles.checkoutButton}
                  onPress={() => router.push({
                    pathname: '/checkout',
                    params: {
                      appointmentId: String(item.id),
                      clientName: clientName(item),
                      serviceName: item.service?.name ?? 'Service',
                      amountCents: String(Math.round(Number(item.service?.price ?? 0) * 100)),
                    },
                  })}
                >
                  <Text style={styles.checkoutButtonText}>Check Out</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/checkout')}>
          <Text style={styles.secondaryButtonText}>Quick Sale</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/new-appointment')}>
          <Text style={styles.primaryButtonText}>+ New Appointment</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, marginBottom: 8,
  },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text },
  logout: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  dayNav: { flexDirection: 'row', gap: 8 },
  navButton: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.card,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  navButtonText: { color: Colors.text, fontSize: 18, fontWeight: '600' },
  error: { color: Colors.error, paddingHorizontal: 20, marginBottom: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  empty: { color: Colors.textMuted, textAlign: 'center', marginTop: 48 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  time: { color: Colors.primary, fontWeight: '700', fontSize: 15 },
  status: { color: Colors.textSecondary, fontSize: 13 },
  client: { color: Colors.text, fontSize: 17, fontWeight: '600' },
  service: { color: Colors.textSecondary, fontSize: 14, marginTop: 2, marginBottom: 12 },
  checkoutButton: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  checkoutButtonText: { color: '#fff', fontWeight: '600' },
  footer: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  secondaryButton: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  secondaryButtonText: { color: Colors.text, fontWeight: '600', fontSize: 15 },
  primaryButton: { flex: 1.4, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
