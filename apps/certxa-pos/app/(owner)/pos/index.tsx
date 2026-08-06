import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
  Alert,
} from 'react-native';

// Keep screen awake while Ticket Builder is open — graceful no-op in Expo Go
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let KeepAwake: any = null;
try { KeepAwake = require('expo-keep-awake'); } catch {}
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { fetchServices, fetchStaff, fetchClients, type Service, type StaffMember, type Client } from '@/lib/api';
import { colors } from '@/constants/colors';

export type TicketItem = {
  service: Service;
  staffId: number | null;
  quantity: number;
};

export default function TicketBuilderScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 700;
  const storeId = user?.storeId ?? 0;

  // Prevent screen sleep while the POS ticket builder is active
  useEffect(() => {
    KeepAwake?.activateKeepAwakeAsync?.('pos-ticket');
    return () => { KeepAwake?.deactivateKeepAwake?.('pos-ticket'); };
  }, []);

  const [cart, setCart] = useState<TicketItem[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showClientSearch, setShowClientSearch] = useState(false);

  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['services', storeId],
    queryFn: () => fetchServices(storeId),
    enabled: !!storeId,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', storeId],
    queryFn: () => fetchStaff(storeId),
    enabled: !!storeId,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', storeId, clientSearch],
    queryFn: () => fetchClients(storeId, clientSearch),
    enabled: !!storeId && clientSearch.length >= 2,
  });

  const categories = ['All', ...Array.from(new Set(services.map((s) => s.category ?? 'Other').filter(Boolean)))];
  const filtered = selectedCategory && selectedCategory !== 'All'
    ? services.filter((s) => (s.category ?? 'Other') === selectedCategory)
    : services;

  function addToCart(service: Service) {
    setCart((prev) => {
      const existing = prev.findIndex((i) => i.service.id === service.id);
      if (existing >= 0) {
        return prev.map((item, idx) =>
          idx === existing ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...prev, { service, staffId: null, quantity: 1 }];
    });
  }

  function removeFromCart(serviceId: number) {
    setCart((prev) => prev.filter((i) => i.service.id !== serviceId));
  }

  function setStaffForItem(serviceId: number, staffId: number | null) {
    setCart((prev) =>
      prev.map((item) =>
        item.service.id === serviceId ? { ...item, staffId } : item,
      ),
    );
  }

  const subtotal = cart.reduce((s, i) => s + i.service.price * i.quantity, 0);

  function handleCheckout() {
    if (cart.length === 0) {
      Alert.alert('Empty ticket', 'Add at least one service to continue.');
      return;
    }
    router.push({
      pathname: '/(owner)/pos/payment',
      params: {
        cartJson: JSON.stringify(cart),
        subtotal: subtotal.toFixed(2),
        clientId: selectedClient?.id?.toString() ?? '',
        clientName: selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName}` : 'Walk-In',
      },
    });
  }

  const CartPanel = (
    <View style={[styles.cartPanel, isWide && styles.cartPanelWide]}>
      {/* Client selector */}
      <View style={styles.clientBar}>
        {selectedClient ? (
          <Pressable style={styles.clientSelected} onPress={() => setSelectedClient(null)}>
            <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.clientName}>
              {selectedClient.firstName} {selectedClient.lastName}
            </Text>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        ) : (
          <Pressable
            style={styles.clientSelectBtn}
            onPress={() => setShowClientSearch((v) => !v)}
          >
            <Ionicons name="person-add-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.clientSelectText}>Add Client (optional)</Text>
          </Pressable>
        )}
      </View>

      {showClientSearch && !selectedClient && (
        <View style={styles.clientSearchBox}>
          <TextInput
            style={styles.clientInput}
            value={clientSearch}
            onChangeText={setClientSearch}
            placeholder="Search by name or phone…"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          {clients.slice(0, 5).map((c) => (
            <Pressable
              key={c.id}
              style={styles.clientRow}
              onPress={() => { setSelectedClient(c); setShowClientSearch(false); setClientSearch(''); }}
            >
              <Text style={styles.clientRowName}>{c.firstName} {c.lastName}</Text>
              {c.phone && <Text style={styles.clientRowSub}>{c.phone}</Text>}
            </Pressable>
          ))}
          <Pressable onPress={() => { setSelectedClient({ id: 0, firstName: 'Walk-In', lastName: '', email: null, phone: null, loyaltyPoints: 0, notes: null }); setShowClientSearch(false); }}>
            <Text style={styles.walkInText}>→ Continue as Walk-In</Text>
          </Pressable>
        </View>
      )}

      {/* Cart items */}
      <ScrollView style={styles.cartScroll} contentContainerStyle={{ gap: 8 }}>
        {cart.length === 0 ? (
          <View style={styles.cartEmpty}>
            <Ionicons name="cart-outline" size={36} color={colors.textMuted} />
            <Text style={styles.cartEmptyText}>Tap a service to add it</Text>
          </View>
        ) : (
          cart.map((item) => (
            <View key={item.service.id} style={styles.cartItem}>
              <View style={styles.cartItemTop}>
                <Text style={styles.cartItemName} numberOfLines={1}>{item.service.name}</Text>
                <Text style={styles.cartItemPrice}>${(item.service.price * item.quantity).toFixed(2)}</Text>
              </View>
              <View style={styles.cartItemBottom}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable
                      style={[styles.staffChip, item.staffId === null && styles.staffChipActive]}
                      onPress={() => setStaffForItem(item.service.id, null)}
                    >
                      <Text style={[styles.staffChipText, item.staffId === null && { color: colors.primary }]}>Any</Text>
                    </Pressable>
                    {staff.map((s) => (
                      <Pressable
                        key={s.id}
                        style={[styles.staffChip, item.staffId === s.id && styles.staffChipActive]}
                        onPress={() => setStaffForItem(item.service.id, s.id)}
                      >
                        <Text style={[styles.staffChipText, item.staffId === s.id && { color: colors.primary }]}>
                          {s.name.split(' ')[0]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <Pressable onPress={() => removeFromCart(item.service.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Totals + checkout */}
      <View style={styles.cartFooter}>
        <View style={styles.subtotalRow}>
          <Text style={styles.subtotalLabel}>Subtotal</Text>
          <Text style={styles.subtotalValue}>${subtotal.toFixed(2)}</Text>
        </View>
        <Pressable style={[styles.checkoutBtn, cart.length === 0 && styles.checkoutDisabled]} onPress={handleCheckout} disabled={cart.length === 0}>
          <Ionicons name="card-outline" size={18} color="#fff" />
          <Text style={styles.checkoutText}>Proceed to Checkout</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/(owner)/pos/cash-drawer')} style={styles.drawerBtn}>
          <Ionicons name="archive-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.drawerBtnText}>Cash</Text>
        </Pressable>
        <Text style={styles.title}>Ticket Builder</Text>
        {cart.length > 0 ? (
          <Pressable onPress={() => setCart([])} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <View style={[styles.body, isWide && styles.bodyWide]}>
        {/* Services panel */}
        <View style={styles.servicesPanel}>
          {/* Categories */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catScrollContent}>
            {categories.map((cat) => (
              <Pressable
                key={cat}
                style={[styles.catChip, (selectedCategory ?? 'All') === cat && styles.catChipActive]}
                onPress={() => setSelectedCategory(cat === 'All' ? null : cat)}
              >
                <Text style={[styles.catChipText, (selectedCategory ?? 'All') === cat && { color: colors.primary }]}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Services grid */}
          {servicesLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <ScrollView contentContainerStyle={styles.servicesGrid}>
              {filtered.map((svc) => (
                <Pressable key={svc.id} style={styles.serviceCard} onPress={() => addToCart(svc)}>
                  <Text style={styles.serviceName} numberOfLines={2}>{svc.name}</Text>
                  <Text style={styles.servicePrice}>${svc.price.toFixed(2)}</Text>
                  {svc.duration > 0 && (
                    <Text style={styles.serviceDuration}>{svc.duration} min</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Cart panel — inline on wide, hidden until checkout on narrow */}
        {isWide && CartPanel}
      </View>

      {/* On narrow screens, show a sticky bottom cart summary + checkout */}
      {!isWide && (
        <View style={styles.narrowCart}>
          <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>{cart.length} item{cart.length !== 1 ? 's' : ''}</Text>
            <Text style={styles.subtotalValue}>${subtotal.toFixed(2)}</Text>
          </View>
          <Pressable style={[styles.checkoutBtn, cart.length === 0 && styles.checkoutDisabled]} onPress={handleCheckout} disabled={cart.length === 0}>
            <Text style={styles.checkoutText}>Checkout →</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.danger },
  clearText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  drawerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  drawerBtnText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  body: { flex: 1 },
  bodyWide: { flexDirection: 'row' },
  servicesPanel: { flex: 1 },
  catScroll: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
  catScrollContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  catChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  servicesGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  serviceCard: { width: '47%', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 },
  serviceName: { fontSize: 14, fontWeight: '700', color: colors.text },
  servicePrice: { fontSize: 18, fontWeight: '800', color: colors.primary },
  serviceDuration: { fontSize: 12, color: colors.textMuted },
  cartPanel: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: 16, gap: 12 },
  cartPanelWide: { width: 320, borderTopWidth: 0, borderLeftWidth: 1, borderLeftColor: colors.border },
  clientBar: { marginBottom: 4 },
  clientSelected: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primaryMuted, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  clientName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.primary },
  clientSelectBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  clientSelectText: { fontSize: 14, color: colors.textSecondary },
  clientSearchBox: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 8 },
  clientInput: { padding: 12, fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border },
  clientRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  clientRowName: { fontSize: 14, fontWeight: '600', color: colors.text },
  clientRowSub: { fontSize: 12, color: colors.textSecondary },
  walkInText: { padding: 12, fontSize: 14, color: colors.primary, fontWeight: '600' },
  cartScroll: { maxHeight: 260 },
  cartEmpty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  cartEmptyText: { fontSize: 14, color: colors.textMuted },
  cartItem: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  cartItemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cartItemName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text, marginRight: 8 },
  cartItemPrice: { fontSize: 14, fontWeight: '700', color: colors.text },
  cartItemBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  staffChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  staffChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  staffChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  cartFooter: { gap: 10 },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subtotalLabel: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  subtotalValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  checkoutBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  checkoutDisabled: { opacity: 0.4 },
  checkoutText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  narrowCart: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, gap: 10, backgroundColor: colors.surface },
});
