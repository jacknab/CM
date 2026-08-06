import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/constants/colors';

type RowProps = { icon: string; label: string; sub?: string; onPress: () => void; danger?: boolean };

function Row({ icon, label, sub, onPress, danger }: RowProps) {
  return (
    <Pressable style={s.row} onPress={onPress}>
      <View style={[s.rowIcon, danger && s.rowIconDanger]}>
        <Ionicons name={icon as never} size={18} color={danger ? colors.danger : colors.primary} />
      </View>
      <View style={s.rowText}>
        <Text style={[s.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
        {sub && <Text style={s.rowSub}>{sub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export default function OwnerPhoneSettingsScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.profile}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{user?.firstName?.charAt(0) ?? '?'}{user?.lastName?.charAt(0) ?? ''}</Text>
          </View>
          <View>
            <Text style={s.name}>{user?.firstName} {user?.lastName}</Text>
            <Text style={s.store}>{user?.storeName}</Text>
            <Text style={s.email}>{user?.email}</Text>
          </View>
        </View>

        <Text style={s.section}>Business</Text>
        <View style={s.group}>
          <Row icon="business-outline" label="Business Info" sub="Name, address, timezone" onPress={() => Alert.alert('Manage on certxa.com')} />
          <Row icon="people-outline" label="Staff Management" sub="Full staff controls on web" onPress={() => Alert.alert('Manage on certxa.com')} />
          <Row icon="flash-outline" label="Stripe Connect" sub={user?.stripeConnected ? 'Connected' : 'Not connected'} onPress={() => Alert.alert('Open on certxa.com')} />
        </View>

        <Text style={s.section}>Account</Text>
        <View style={s.group}>
          <Row icon="lock-closed-outline" label="Change Password" onPress={() => Alert.alert('Coming soon')} />
          <Row icon="notifications-outline" label="Notifications" onPress={() => Alert.alert('Coming soon')} />
        </View>

        <View style={s.group}>
          <Row icon="log-out-outline" label="Sign Out" onPress={() => Alert.alert('Sign out', 'You will need to sign in again.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: logout }])} danger />
        </View>

        <Text style={s.version}>Certxa · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, gap: 4 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 8 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.primary },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  store: { fontSize: 13, color: colors.primary, fontWeight: '600', marginTop: 1 },
  email: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  section: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 12, marginBottom: 4 },
  group: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  rowIconDanger: { backgroundColor: colors.dangerMuted },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  version: { textAlign: 'center', fontSize: 12, color: colors.textMuted, marginTop: 20 },
});
