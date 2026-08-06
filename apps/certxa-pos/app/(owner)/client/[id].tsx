import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { fetchClient, fetchClientAppointments } from '@/lib/api';
import { colors } from '@/constants/colors';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
}

const STATUS_COLOR: Record<string, string> = {
  completed: colors.success,
  confirmed: colors.primary,
  checked_in: colors.success,
  cancelled: colors.danger,
  no_show: colors.danger,
  scheduled: colors.textSecondary,
};

export default function ClientDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const storeId = user?.storeId ?? 0;
  const clientId = parseInt(id ?? '0', 10);

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ['client', clientId, storeId],
    queryFn: () => fetchClient(storeId, clientId),
    enabled: !!clientId,
  });

  const { data: appointments = [], isLoading: apptLoading } = useQuery({
    queryKey: ['clientAppointments', clientId, storeId],
    queryFn: () => fetchClientAppointments(storeId, clientId),
    enabled: !!clientId,
  });

  const completed = appointments.filter((a) => a.status === 'completed');
  const totalSpent = completed.reduce((s, a) => s + (a.price ?? 0), 0);

  if (clientLoading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!client) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.errorState}>
          <Text style={s.errorText}>Client not found</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={s.errorBack}>← Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>Client Profile</Text>
        <Pressable
          style={s.editBtn}
          onPress={() => router.push({ pathname: '/(owner)/client/new', params: { editId: String(clientId) } })}
        >
          <Text style={s.editBtnText}>Edit</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Profile card */}
        <View style={s.profileCard}>
          <View style={s.avatarWrap}>
            <Text style={s.avatarText}>
              {client.firstName.charAt(0)}{client.lastName?.charAt(0) ?? ''}
            </Text>
          </View>
          <Text style={s.clientName}>{client.firstName} {client.lastName}</Text>
          {client.email ? <Text style={s.clientSub}>{client.email}</Text> : null}
          {client.phone ? <Text style={s.clientSub}>{client.phone}</Text> : null}
        </View>

        {/* Stats row */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Ionicons name="star" size={18} color={colors.amber} />
            <Text style={s.statVal}>{client.loyaltyPoints}</Text>
            <Text style={s.statLabel}>Loyalty Pts</Text>
          </View>
          <View style={s.statCard}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={s.statVal}>{completed.length}</Text>
            <Text style={s.statLabel}>Visits</Text>
          </View>
          <View style={s.statCard}>
            <Ionicons name="cash" size={18} color={colors.primary} />
            <Text style={s.statVal}>${totalSpent.toFixed(0)}</Text>
            <Text style={s.statLabel}>Total Spent</Text>
          </View>
        </View>

        {/* Notes */}
        {client.notes ? (
          <View style={s.notesCard}>
            <View style={s.notesHeader}>
              <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
              <Text style={s.notesLabel}>Notes</Text>
            </View>
            <Text style={s.notesText}>{client.notes}</Text>
          </View>
        ) : null}

        {/* Quick charge */}
        <Pressable
          style={s.chargeBtn}
          onPress={() => router.push('/(owner)/pos/')}
        >
          <Ionicons name="flash-outline" size={18} color="#fff" />
          <Text style={s.chargeBtnText}>New Ticket for {client.firstName}</Text>
        </Pressable>

        {/* Appointment history */}
        <Text style={s.sectionLabel}>Appointment History</Text>
        {apptLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
        ) : appointments.length === 0 ? (
          <View style={s.emptyHistory}>
            <Ionicons name="calendar-outline" size={32} color={colors.textMuted} />
            <Text style={s.emptyHistoryText}>No appointments yet</Text>
          </View>
        ) : (
          appointments.map((a) => (
            <View key={a.id} style={s.apptRow}>
              <View style={s.apptLeft}>
                <Text style={s.apptService}>{a.serviceName}</Text>
                <Text style={s.apptDate}>{fmtDate(a.startTime)} · {fmtTime(a.startTime)}</Text>
                {a.staffName ? <Text style={s.apptStaff}>with {a.staffName}</Text> : null}
              </View>
              <View style={s.apptRight}>
                <Text style={s.apptPrice}>${a.price.toFixed(2)}</Text>
                <View style={[s.statusDot, { backgroundColor: STATUS_COLOR[a.status] ?? colors.textMuted }]} />
              </View>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  editBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  editBtnText: { fontSize: 13, fontWeight: '600', color: colors.text },
  scroll: { padding: 16, gap: 14 },
  profileCard: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: 'center', gap: 6 },
  avatarWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarText: { fontSize: 26, fontWeight: '800', color: colors.primary },
  clientName: { fontSize: 22, fontWeight: '800', color: colors.text },
  clientSub: { fontSize: 14, color: colors.textSecondary },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 4 },
  statVal: { fontSize: 22, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
  notesCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 },
  notesHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notesLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  notesText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  chargeBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  chargeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 },
  apptRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12 },
  apptLeft: { flex: 1, gap: 3 },
  apptRight: { alignItems: 'flex-end', gap: 6 },
  apptService: { fontSize: 14, fontWeight: '700', color: colors.text },
  apptDate: { fontSize: 12, color: colors.textSecondary },
  apptStaff: { fontSize: 12, color: colors.textMuted },
  apptPrice: { fontSize: 15, fontWeight: '800', color: colors.text },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  emptyHistory: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyHistoryText: { fontSize: 14, color: colors.textSecondary },
  errorState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  errorText: { fontSize: 16, color: colors.text },
  errorBack: { fontSize: 15, color: colors.primary, fontWeight: '600' },
});
