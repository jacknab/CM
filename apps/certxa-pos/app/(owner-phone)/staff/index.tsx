import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { fetchStaff } from '@/lib/api';
import { colors } from '@/constants/colors';

export default function StaffListScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const storeId = user?.storeId ?? 0;

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff', storeId],
    queryFn: () => fetchStaff(storeId),
    enabled: !!storeId,
  });

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Staff</Text>
        <Pressable style={s.addBtn}>
          <Ionicons name="person-add-outline" size={18} color={colors.primary} />
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={staff}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="people-outline" size={40} color={colors.textMuted} />
              <Text style={s.emptyText}>No staff members yet</Text>
            </View>
          }
          renderItem={({ item: m }) => (
            <Pressable style={s.card} onPress={() => router.push(`/(owner-phone)/staff/${m.id}`)}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{m.name.charAt(0)}</Text>
              </View>
              <View style={s.info}>
                <Text style={s.name}>{m.name}</Text>
                <Text style={s.role}>{m.role}</Text>
                {m.email && <Text style={s.email}>{m.email}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: colors.textSecondary },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: colors.primary },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  role: { fontSize: 13, color: colors.primary, fontWeight: '600', marginTop: 1 },
  email: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
