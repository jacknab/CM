import { useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { fetchClients } from '@/lib/api';
import { colors } from '@/constants/colors';

export default function OwnerClientsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const storeId = user?.storeId ?? 0;
  const [search, setSearch] = useState('');

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients', storeId, search],
    queryFn: () => fetchClients(storeId, search || undefined),
    enabled: !!storeId,
  });

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Clients</Text>
        <Pressable style={s.addBtn} onPress={() => router.push('/(owner)/client/new')}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={s.addBtnText}>New</Text>
        </Pressable>
      </View>

      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, email or phone…"
          placeholderTextColor={colors.textMuted}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={clients}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={s.list}
          numColumns={2}
          columnWrapperStyle={{ gap: 10 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="people-outline" size={44} color={colors.textMuted} />
              <Text style={s.emptyText}>{search ? 'No results' : 'No clients yet'}</Text>
            </View>
          }
          renderItem={({ item: c }) => (
            <Pressable style={s.card} onPress={() => router.push({ pathname: '/(owner)/client/[id]', params: { id: String(c.id) } })}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{c.firstName.charAt(0)}{c.lastName?.charAt(0) ?? ''}</Text>
              </View>
              <Text style={s.name} numberOfLines={1}>{c.firstName} {c.lastName ?? ''}</Text>
              {c.phone && <Text style={s.sub} numberOfLines={1}>{c.phone}</Text>}
              <View style={s.pointsBadge}>
                <Ionicons name="star" size={11} color={colors.amber} />
                <Text style={s.pointsText}>{c.loyaltyPoints} pts</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ position: 'absolute', top: 12, right: 10 }} />
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
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: colors.textSecondary },
  card: { flex: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 6 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: colors.primary },
  name: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'center' },
  sub: { fontSize: 12, color: colors.textSecondary },
  pointsBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pointsText: { fontSize: 11, fontWeight: '600', color: colors.amber },
});
