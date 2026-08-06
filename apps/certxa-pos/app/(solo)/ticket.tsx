import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { fetchServices, fetchClients, type Service, type Client } from '@/lib/api';
import { colors } from '@/constants/colors';

type TicketItem = { service: Service; quantity: number };

export default function SoloTicketScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const storeId = user?.storeId ?? 0;

  const [cart, setCart] = useState<TicketItem[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['services', storeId],
    queryFn: () => fetchServices(storeId),
    enabled: !!storeId,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', storeId, clientSearch],
    queryFn: () => fetchClients(storeId, clientSearch),
    enabled: !!storeId && clientSearch.length >= 2,
  });

  function addService(svc: Service) {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.service.id === svc.id);
      if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { service: svc, quantity: 1 }];
    });
  }

  function removeItem(id: number) {
    setCart((prev) => prev.filter((i) => i.service.id !== id));
  }

  function addCustom() {
    const amt = parseFloat(customAmount);
    if (isNaN(amt) || amt <= 0) { Alert.alert('Invalid amount', 'Enter a valid amount.'); return; }
    const fake: Service = { id: -Date.now(), name: 'Custom Charge', duration: 0, price: amt, category: null, description: null };
    setCart((prev) => [...prev, { service: fake, quantity: 1 }]);
    setCustomAmount('');
    setShowCustom(false);
  }

  const subtotal = cart.reduce((s, i) => s + i.service.price * i.quantity, 0);

  function handleCheckout() {
    if (cart.length === 0) { Alert.alert('Empty', 'Add at least one item.'); return; }
    router.push({
      pathname: '/(solo)/payment',
      params: {
        subtotal: subtotal.toFixed(2),
        clientId: selectedClient?.id?.toString() ?? '',
        clientName: selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName}` : 'Walk-In',
        cartJson: JSON.stringify(cart),
      },
    });
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Quick Charge</Text>
        {cart.length > 0 && (
          <Pressable onPress={() => setCart([])}>
            <Text style={s.clearText}>Clear</Text>
          </Pressable>
        )}
      </View>

      {/* Client picker */}
      <View style={s.clientBar}>
        {selectedClient ? (
          <Pressable style={s.clientPill} onPress={() => setSelectedClient(null)}>
            <Ionicons name="person-circle-outline" size={16} color={colors.primary} />
            <Text style={s.clientPillText}>{selectedClient.firstName} {selectedClient.lastName}</Text>
            <Ionicons name="close-circle" size={14} color={colors.textMuted} />
          </Pressable>
        ) : (
          <Pressable style={s.clientAddBtn} onPress={() => setShowSearch((v) => !v)}>
            <Ionicons name="person-add-outline" size={15} color={colors.textSecondary} />
            <Text style={s.clientAddText}>Add Client (optional)</Text>
          </Pressable>
        )}
      </View>

      {showSearch && !selectedClient && (
        <View style={s.searchBox}>
          <TextInput
            style={s.searchInput}
            value={clientSearch}
            onChangeText={setClientSearch}
            placeholder="Search name or phone…"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          {clients.slice(0, 4).map((c) => (
            <Pressable key={c.id} style={s.clientRow} onPress={() => { setSelectedClient(c); setShowSearch(false); setClientSearch(''); }}>
              <Text style={s.clientRowName}>{c.firstName} {c.lastName}</Text>
              {c.phone && <Text style={s.clientRowSub}>{c.phone}</Text>}
            </Pressable>
          ))}
          <Pressable onPress={() => setShowSearch(false)}>
            <Text style={s.skipText}>Continue as Walk-In →</Text>
          </Pressable>
        </View>
      )}

      <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
        {/* Custom amount */}
        {showCustom ? (
          <View style={s.customBox}>
            <Text style={s.customLabel}>Custom Amount</Text>
            <View style={s.customRow}>
              <Text style={s.currSign}>$</Text>
              <TextInput
                style={s.customInput}
                value={customAmount}
                onChangeText={setCustomAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
            </View>
            <View style={s.customActions}>
              <Pressable style={s.customCancel} onPress={() => setShowCustom(false)}>
                <Text style={s.customCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={s.customAdd} onPress={addCustom}>
                <Text style={s.customAddText}>Add to Ticket</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={s.customBtn} onPress={() => setShowCustom(true)}>
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={s.customBtnText}>Custom Amount</Text>
          </Pressable>
        )}

        {/* Services */}
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <View style={s.grid}>
            {services.map((svc) => (
              <Pressable key={svc.id} style={s.svcCard} onPress={() => addService(svc)}>
                <Text style={s.svcName} numberOfLines={2}>{svc.name}</Text>
                <Text style={s.svcPrice}>${svc.price.toFixed(2)}</Text>
                {svc.duration > 0 && <Text style={s.svcDur}>{svc.duration} min</Text>}
              </Pressable>
            ))}
          </View>
        )}

        {/* Cart */}
        {cart.length > 0 && (
          <View style={s.cart}>
            <Text style={s.cartTitle}>Ticket</Text>
            {cart.map((item) => (
              <View key={item.service.id} style={s.cartItem}>
                <Text style={s.cartItemName} numberOfLines={1}>{item.service.name}</Text>
                <Text style={s.cartItemPrice}>${(item.service.price * item.quantity).toFixed(2)}</Text>
                <Pressable onPress={() => removeItem(item.service.id)} hitSlop={10}>
                  <Ionicons name="close-circle" size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))}
            <View style={s.cartTotal}>
              <Text style={s.cartTotalLabel}>Subtotal</Text>
              <Text style={s.cartTotalValue}>${subtotal.toFixed(2)}</Text>
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB checkout */}
      <Pressable
        style={[s.checkoutFab, cart.length === 0 && s.checkoutFabDisabled]}
        onPress={handleCheckout}
        disabled={cart.length === 0}
      >
        <Ionicons name="flash" size={20} color="#fff" />
        <Text style={s.checkoutFabText}>
          Collect Payment · ${subtotal.toFixed(2)}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.card },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  clearText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  clientBar: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  clientPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.primaryMuted, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  clientPillText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  clientAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clientAddText: { fontSize: 14, color: colors.textSecondary },
  searchBox: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput: { padding: 12, fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border },
  clientRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  clientRowName: { fontSize: 14, fontWeight: '600', color: colors.text },
  clientRowSub: { fontSize: 12, color: colors.textSecondary },
  skipText: { padding: 12, fontSize: 14, color: colors.primary, fontWeight: '600' },
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },
  customBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryMuted, borderRadius: 12, padding: 14 },
  customBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  customBox: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.primary, padding: 16, gap: 12 },
  customLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  customRow: { flexDirection: 'row', alignItems: 'center' },
  currSign: { fontSize: 28, color: colors.textSecondary, marginRight: 4 },
  customInput: { flex: 1, fontSize: 32, fontWeight: '800', color: colors.text },
  customActions: { flexDirection: 'row', gap: 10 },
  customCancel: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  customCancelText: { color: colors.textSecondary, fontWeight: '600' },
  customAdd: { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary },
  customAddText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  svcCard: { width: '47%', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 },
  svcName: { fontSize: 14, fontWeight: '700', color: colors.text },
  svcPrice: { fontSize: 20, fontWeight: '800', color: colors.primary },
  svcDur: { fontSize: 11, color: colors.textMuted },
  cart: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  cartTitle: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  cartItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartItemName: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600' },
  cartItemPrice: { fontSize: 14, fontWeight: '700', color: colors.text },
  cartTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  cartTotalLabel: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  cartTotalValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  checkoutFab: { position: 'absolute', bottom: 24, left: 20, right: 20, backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  checkoutFabDisabled: { opacity: 0.4 },
  checkoutFabText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
