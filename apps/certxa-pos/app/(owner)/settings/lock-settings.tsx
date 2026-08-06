import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { useLock } from '@/context/LockContext';

const TIMEOUT_OPTIONS = [
  { label: '1 minute', minutes: 1 },
  { label: '5 minutes', minutes: 5 },
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: 'Never', minutes: 0 },
];

export default function LockSettingsScreen() {
  const router = useRouter();
  const { idleMinutes, setIdleMinutes, lock } = useLock();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.back} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Lock & Security</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.infoBox}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <Text style={s.infoText}>
            When locked, the app requires your Face ID, fingerprint, or device PIN to re-open.
          </Text>
        </View>

        <Text style={s.section}>Auto-lock after idle</Text>
        <View style={s.group}>
          {TIMEOUT_OPTIONS.map((opt, i) => {
            const selected = idleMinutes === opt.minutes;
            const isLast = i === TIMEOUT_OPTIONS.length - 1;
            return (
              <Pressable
                key={opt.minutes}
                style={[s.row, isLast && s.rowLast]}
                onPress={() => setIdleMinutes(opt.minutes)}
              >
                <Text style={[s.rowLabel, selected && s.rowLabelSelected]}>
                  {opt.label}
                </Text>
                {selected && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </Pressable>
            );
          })}
        </View>

        <Text style={s.hint}>
          The screen also locks automatically whenever the app is sent to the background.
        </Text>

        <Text style={s.section}>Manual</Text>
        <View style={s.group}>
          <Pressable style={s.lockBtn} onPress={lock}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
            <Text style={s.lockBtnText}>Lock Now</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { width: 40, alignItems: 'flex-start' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  scroll: { padding: 20, gap: 4 },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: colors.primaryMuted,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  section: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4,
  },
  group: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: colors.text },
  rowLabelSelected: { color: colors.primary, fontWeight: '700' },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    paddingHorizontal: 4,
    marginTop: 6,
    marginBottom: 4,
  },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  lockBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary },
});
