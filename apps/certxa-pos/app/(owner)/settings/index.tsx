import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/constants/colors';

type RowProps = { icon: string; label: string; sub?: string; onPress: () => void; danger?: boolean; badge?: string };

function SettingsRow({ icon, label, sub, onPress, danger, badge }: RowProps) {
  return (
    <Pressable style={s.row} onPress={onPress}>
      <View style={[s.rowIcon, danger && s.rowIconDanger]}>
        <Ionicons name={icon as never} size={18} color={danger ? colors.danger : colors.primary} />
      </View>
      <View style={s.rowText}>
        <Text style={[s.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
        {sub && <Text style={s.rowSub}>{sub}</Text>}
      </View>
      {badge && (
        <View style={[s.badge, badge === 'Connected' && s.badgeGreen]}>
          <Text style={[s.badgeText, badge === 'Connected' && { color: colors.success }]}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export default function OwnerSettingsScreen() {
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
        <View style={s.profile}>
          <View style={s.profileAvatar}>
            <Text style={s.profileInitials}>{user?.firstName?.charAt(0) ?? '?'}{user?.lastName?.charAt(0) ?? ''}</Text>
          </View>
          <View>
            <Text style={s.profileName}>{user?.firstName} {user?.lastName}</Text>
            <Text style={s.profileStore}>{user?.storeName}</Text>
            <Text style={s.profileEmail}>{user?.email}</Text>
          </View>
        </View>

        <Text style={s.section}>Payments</Text>
        <View style={s.group}>
          <SettingsRow
            icon="flash-outline"
            label="Stripe Connect"
            sub={user?.stripeConnected ? 'Account linked · payouts active' : 'Not connected'}
            badge={user?.stripeConnected ? 'Connected' : undefined}
            onPress={() => router.push('/(owner)/settings/stripe-connect')}
          />
          <SettingsRow
            icon="hardware-chip-outline"
            label="M2 Card Reader"
            sub="Pair and manage Bluetooth reader"
            onPress={() => router.push('/(owner)/settings/reader')}
          />
          <SettingsRow
            icon="phone-portrait-outline"
            label="Tap to Pay"
            sub="Accept contactless payments on this device"
            onPress={() => router.push('/(owner)/settings/tap-to-pay')}
          />
        </View>

        <Text style={s.section}>Data & Sync</Text>
        <View style={s.group}>
          <SettingsRow
            icon="cloud-upload-outline"
            label="Offline Payment Queue"
            sub="View and retry payments taken offline"
            onPress={() => router.push('/(owner)/settings/offline-queue')}
          />
        </View>

        <Text style={s.section}>Account</Text>
        <View style={s.group}>
          <SettingsRow icon="business-outline" label="Business Info" sub="Name, address, timezone" onPress={() => Alert.alert('Coming soon')} />
          <SettingsRow icon="lock-closed-outline" label="Change Password" onPress={() => Alert.alert('Coming soon')} />
          <SettingsRow icon="notifications-outline" label="Notifications" onPress={() => Alert.alert('Coming soon')} />
          <SettingsRow icon="receipt-outline" label="Receipt Settings" onPress={() => Alert.alert('Coming soon')} />
        </View>

        <View style={s.group}>
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Lock & Security"
            sub="Auto-lock timeout · lock now"
            onPress={() => router.push('/(owner)/settings/lock-settings')}
          />
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
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 8 },
  profileAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  profileInitials: { fontSize: 20, fontWeight: '800', color: colors.primary },
  profileName: { fontSize: 16, fontWeight: '700', color: colors.text },
  profileStore: { fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: 1 },
  profileEmail: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  section: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 12, marginBottom: 4 },
  group: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  rowIconDanger: { backgroundColor: colors.dangerMuted },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.cardAlt },
  badgeGreen: { backgroundColor: colors.successMuted },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  version: { textAlign: 'center', fontSize: 12, color: colors.textMuted, marginTop: 20 },
});
