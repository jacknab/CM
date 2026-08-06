import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/constants/colors';

function InitialsAvatar({ name, color }: { name: string | null; color: string | null }) {
  const initials = (name ?? 'S')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
  const bg = color ?? colors.primary;

  return (
    <View style={[styles.avatar, { backgroundColor: bg + '33', borderColor: bg }]}>
      <Text style={[styles.avatarText, { color: bg }]}>{initials}</Text>
    </View>
  );
}

function Row({ icon, label, value, onPress, danger }: {
  icon: string; label: string; value?: string; onPress?: () => void; danger?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress && styles.rowPressed]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon as never} size={18} color={danger ? colors.error : colors.textSecondary} />
      </View>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 'auto' }} /> : null}
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const topPad = insets.top + (Platform.OS === 'ios' ? 0 : 8);

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await logout();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case 'staff': return 'Staff Member';
      case 'admin': return 'Admin';
      case 'manager': return 'Manager';
      default: return role.charAt(0).toUpperCase() + role.slice(1);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: topPad, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile header */}
      <View style={styles.profileHeader}>
        <InitialsAvatar name={user?.name ?? null} color={user?.color ?? null} />
        <Text style={styles.profileName}>{user?.name ?? 'Staff Member'}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{roleLabel(user?.role ?? 'staff')}</Text>
        </View>
      </View>

      <Section title="Account">
        {user?.email ? (
          <Row icon="mail-outline" label="Email" value={user.email} />
        ) : null}
        <Row icon="shield-checkmark-outline" label="Role" value={roleLabel(user?.role ?? 'staff')} />
        {user?.storeId ? (
          <Row icon="storefront-outline" label="Store ID" value={`#${user.storeId}`} />
        ) : null}
      </Section>

      <Section title="App">
        <Row icon="information-circle-outline" label="Version" value="1.0.0" />
        <Row icon="server-outline" label="API" value={process.env.EXPO_PUBLIC_API_URL ? 'Connected' : 'Not configured'} />
      </Section>

      <Section title="Session">
        <Row
          icon="log-out-outline"
          label="Sign Out"
          onPress={handleLogout}
          danger
        />
      </Section>

      <Text style={styles.footer}>Certxa Staff · {new Date().getFullYear()}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20 },
  profileHeader: { alignItems: 'center', marginBottom: 32, paddingTop: 8 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: { fontSize: 32, fontWeight: '700', fontFamily: 'DMSans_700Bold' },
  profileName: { fontSize: 22, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold', marginBottom: 8 },
  roleBadge: {
    backgroundColor: colors.primaryMuted,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.primary + '55',
  },
  roleText: { fontSize: 12, color: colors.primary, fontFamily: 'DMSans_700Bold', letterSpacing: 0.5 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surface },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: { backgroundColor: 'rgba(255,71,87,0.12)' },
  rowLabel: { fontSize: 15, color: colors.text, fontFamily: 'DMSans_400Regular', flex: 1 },
  rowLabelDanger: { color: colors.error },
  rowValue: { fontSize: 14, color: colors.textSecondary, fontFamily: 'DMSans_400Regular' },
  footer: { textAlign: 'center', fontSize: 12, color: colors.textMuted, fontFamily: 'DMSans_400Regular', marginTop: 8 },
});
