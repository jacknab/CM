import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchStaff } from '@/lib/api';
import { colors } from '@/constants/colors';

export default function StaffDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const storeId = user?.storeId ?? 0;

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', storeId],
    queryFn: () => fetchStaff(storeId),
    enabled: !!storeId,
  });

  const member = staff.find((s) => String(s.id) === id);

  if (!member) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
        </View>
        <View style={s.center}>
          <ActivityIndicatorLocal />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Staff Member</Text>
        <Pressable onPress={() => Alert.alert('Edit', 'Edit staff on the web dashboard.')}>
          <Ionicons name="create-outline" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Profile */}
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{member.name.charAt(0)}</Text>
          </View>
          <Text style={s.name}>{member.name}</Text>
          <Text style={s.role}>{member.role}</Text>
        </View>

        {/* Contact */}
        <Text style={s.section}>Contact</Text>
        <View style={s.infoCard}>
          <View style={s.infoRow}>
            <Ionicons name="mail-outline" size={16} color={colors.textSecondary} />
            <Text style={s.infoText}>{member.email}</Text>
          </View>
          {member.phone && (
            <View style={s.infoRow}>
              <Ionicons name="call-outline" size={16} color={colors.textSecondary} />
              <Text style={s.infoText}>{member.phone}</Text>
            </View>
          )}
        </View>

        {/* Quick actions */}
        <Text style={s.section}>Quick Actions</Text>
        <View style={s.actionsGrid}>
          {[
            { icon: 'calendar-outline', label: 'View Schedule', onPress: () => Alert.alert('Coming soon') },
            { icon: 'cash-outline', label: 'This Period Earnings', onPress: () => Alert.alert('Coming soon') },
            { icon: 'time-outline', label: 'Clocked Hours', onPress: () => Alert.alert('Coming soon') },
            { icon: 'key-outline', label: 'Reset Password', onPress: () => Alert.alert('Coming soon') },
          ].map((a) => (
            <Pressable key={a.label} style={s.actionCard} onPress={a.onPress}>
              <Ionicons name={a.icon as never} size={22} color={colors.primary} />
              <Text style={s.actionLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ActivityIndicatorLocal() {
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Text style={{ color: colors.textSecondary }}>Loading…</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.card },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, gap: 8 },
  profileCard: { alignItems: 'center', backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 24, gap: 8, marginBottom: 4 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: '800', color: colors.primary },
  name: { fontSize: 22, fontWeight: '800', color: colors.text },
  role: { fontSize: 14, fontWeight: '600', color: colors.primary },
  section: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 8 },
  infoCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 14, color: colors.text },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: { width: '47%', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, alignItems: 'center', gap: 8 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' },
});
