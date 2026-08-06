import { useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { fetchClients } from '@/lib/api';
import { colors } from '@/constants/colors';

export default function SoloClientsScreen() {
  const { user } = useAuth();
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
        <Text style={s.title}>My Clients</Text>
      </View>
      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or phone…"
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
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="people-outline" size={40} color={colors.textMuted} />
              <Text style={s.emptyText}>{search ? 'No results' : 'No clients yet'}</Text>
            </View>
          }
          renderItem={({ item: c }) => (
            <View style={s.card}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{c.firstName.charAt(0)}{c.lastName?.charAt(0) ?? ''}</Text>
              </View>
              <View style={s.info}>
                <Text style={s.name}>{c.firstName} {c.lastName}</Text>
                {c.phone && <Text style={s.sub}>{c.phone}</Text>}
                {c.email && <Text style={s.sub}>{c.email}</Text>}
              </View>
              <View style={s.right}>
                <Text style={s.points}>{c.loyaltyPoints}</Text>
                <Text style={s.pointsLabel}>pts</Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 32 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: colors.textSecondary },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  right: { alignItems: 'center' },
  points: { fontSize: 18, fontWeight: '800', color: colors.amber },
  pointsLabel: { fontSize: 10, color: colors.textMuted },
});
