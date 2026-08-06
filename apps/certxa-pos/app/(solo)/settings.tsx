import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/constants/colors';

type RowProps = { icon: string; label: string; sub?: string; onPress: () => void; danger?: boolean };

function SettingsRow({ icon, label, sub, onPress, danger }: RowProps) {
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

export default function SoloSettingsScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  function confirmLogout() {
    Alert.alert('Sign out', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Profile */}
        <View style={s.profile}>
          <View style={s.profileAvatar}>
            <Text style={s.profileInitials}>
              {user?.firstName?.charAt(0) ?? '?'}{user?.lastName?.charAt(0) ?? ''}
            </Text>
          </View>
          <View>
            <Text style={s.profileName}>{user?.firstName} {user?.lastName}</Text>
            <Text style={s.profileEmail}>{user?.email}</Text>
            <View style={s.soloBadge}>
              <Ionicons name="flash" size={11} color={colors.primary} />
              <Text style={s.soloBadgeText}>Solo Professional</Text>
            </View>
          </View>
        </View>

        <Text style={s.section}>Business</Text>
        <View style={s.group}>
          <SettingsRow icon="cut-outline" label="My Services & Prices" sub="Edit your service catalogue and rates" onPress={() => Alert.alert('Coming soon')} />
          <SettingsRow icon="link-outline" label="My Booking Link" sub="Share with clients to book online" onPress={() => Alert.alert('Coming soon')} />
          <SettingsRow icon="image-outline" label="Receipt Logo & Name" sub="Customise your receipt header" onPress={() => Alert.alert('Coming soon')} />
        </View>

        <Text style={s.section}>Payments</Text>
        <View style={s.group}>
          <SettingsRow
            icon="flash-outline"
            label="Stripe Connect"
            sub={user?.stripeConnected ? 'Connected · payouts active' : 'Not connected — link your account'}
            onPress={() => Alert.alert('Stripe Connect', 'Opens Stripe onboarding in your browser.')}
          />
          <SettingsRow icon="wifi-outline" label="Tap to Pay" sub="Enable NFC payments on this device" onPress={() => Alert.alert('Tap to Pay', 'Requires EAS Dev Client build with Stripe Terminal SDK.')} />
        </View>

        <Text style={s.section}>Account</Text>
        <View style={s.group}>
          <SettingsRow icon="lock-closed-outline" label="Change Password" onPress={() => Alert.alert('Coming soon')} />
          <SettingsRow icon="notifications-outline" label="Notifications" onPress={() => Alert.alert('Coming soon')} />
          <SettingsRow icon="people-outline" label="Switch to Owner Mode" sub="If you manage a team" onPress={() => Alert.alert('Coming soon')} />
        </View>

        <View style={s.group}>
          <SettingsRow icon="log-out-outline" label="Sign Out" onPress={confirmLogout} danger />
        </View>

        <Text style={s.version}>Certxa · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, gap: 4 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 8 },
  profileAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  profileInitials: { fontSize: 20, fontWeight: '800', color: colors.primary },
  profileName: { fontSize: 17, fontWeight: '700', color: colors.text },
  profileEmail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  soloBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, backgroundColor: colors.primaryMuted, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  soloBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
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
