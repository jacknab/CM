import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable, StyleSheet,
  Alert, ActivityIndicator, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { fetchClients, fetchServices, fetchStaff, createAppointment } from '@/lib/api';
import { colors } from '@/constants/colors';

function generateDays(count: number): Date[] {
  const days: Date[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

function generateSlots(): string[] {
  const slots: string[] = [];
  for (let h = 8; h < 20; h++) {
    slots.push(`${h.toString().padStart(2, '0')}:00`);
    slots.push(`${h.toString().padStart(2, '0')}:30`);
  }
  return slots;
}

function fmtSlot(slot: string): string {
  const [h, m] = slot.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${m === 0 ? '00' : '30'}${ampm}`;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}
function dateNum(d: Date): string {
  return d.getDate().toString();
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short' });
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DAYS = generateDays(21);
const SLOTS = generateSlots();

export default function NewAppointmentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const storeId = user?.storeId ?? 0;
  const qc = useQueryClient();

  const [step, setStep] = useState<'details' | 'datetime'>('details');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<{ id: number; name: string } | null>(null);
  const [selectedService, setSelectedService] = useState<{ id: number; name: string; duration: number; price: number } | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<{ id: number; name: string } | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date>(DAYS[0]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', storeId, clientSearch],
    queryFn: () => fetchClients(storeId, clientSearch || undefined),
    enabled: !!storeId,
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services', storeId],
    queryFn: () => fetchServices(storeId),
    enabled: !!storeId,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', storeId],
    queryFn: () => fetchStaff(storeId),
    enabled: !!storeId,
  });

  const filteredClients = useMemo(() =>
    clients.slice(0, 6),
    [clients],
  );

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedService || !selectedSlot) throw new Error('Missing required fields');
      const [h, m] = selectedSlot.split(':').map(Number);
      const start = new Date(selectedDay);
      start.setHours(h, m, 0, 0);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + selectedService.duration);
      return createAppointment({
        storeId,
        clientId: selectedClient?.id ?? null,
        staffId: selectedStaff?.id ?? null,
        serviceId: selectedService.id,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      Alert.alert('Booked!', 'Appointment created successfully.', [
        { text: 'OK', onPress: () => router.replace('/(owner)/') },
      ]);
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message ?? 'Could not book appointment.');
    },
  });

  function handleBook() {
    if (!selectedService) { Alert.alert('Required', 'Please select a service.'); return; }
    if (!selectedSlot) { Alert.alert('Required', 'Please select a time slot.'); return; }
    mutation.mutate();
  }

  const canProceed = !!selectedService;

  if (step === 'datetime') {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <Pressable onPress={() => setStep('details')} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={s.headerTitle}>Pick Date & Time</Text>
          <Pressable
            style={[s.bookBtn, (!selectedSlot || mutation.isPending) && { opacity: 0.4 }]}
            onPress={handleBook}
            disabled={!selectedSlot || mutation.isPending}
          >
            {mutation.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.bookBtnText}>Book</Text>}
          </Pressable>
        </View>

        {/* Summary bar */}
        <View style={s.summaryBar}>
          <View style={s.summaryItem}>
            <Ionicons name="cut-outline" size={14} color={colors.primary} />
            <Text style={s.summaryText} numberOfLines={1}>{selectedService?.name ?? '—'}</Text>
          </View>
          {selectedClient && (
            <View style={s.summaryItem}>
              <Ionicons name="person-outline" size={14} color={colors.primary} />
              <Text style={s.summaryText} numberOfLines={1}>{selectedClient.name}</Text>
            </View>
          )}
          {selectedStaff && (
            <View style={s.summaryItem}>
              <Ionicons name="people-outline" size={14} color={colors.primary} />
              <Text style={s.summaryText} numberOfLines={1}>{selectedStaff.name}</Text>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={s.scroll}>
          {/* Date strip */}
          <Text style={s.sectionLabel}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dateStrip} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {DAYS.map((d, i) => {
              const active = isSameDay(d, selectedDay);
              return (
                <Pressable key={i} style={[s.dayChip, active && s.dayChipActive]} onPress={() => setSelectedDay(d)}>
                  <Text style={[s.dayOfWeek, active && s.dayChipActiveText]}>{dayLabel(d)}</Text>
                  <Text style={[s.dayNum, active && s.dayChipActiveText]}>{dateNum(d)}</Text>
                  <Text style={[s.dayMonth, active && s.dayChipActiveText]}>{monthLabel(d)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Time slots */}
          <Text style={s.sectionLabel}>Time</Text>
          <View style={s.slotsGrid}>
            {SLOTS.map((slot) => {
              const active = selectedSlot === slot;
              return (
                <Pressable key={slot} style={[s.slotBtn, active && s.slotBtnActive]} onPress={() => setSelectedSlot(slot)}>
                  <Text style={[s.slotText, active && s.slotTextActive]}>{fmtSlot(slot)}</Text>
                </Pressable>
              );
            })}
          </View>

          {selectedSlot && selectedService && (
            <View style={s.confirmCard}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={s.confirmText}>
                {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at {fmtSlot(selectedSlot)} · {selectedService.duration} min
              </Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>New Appointment</Text>
        <Pressable
          style={[s.bookBtn, !canProceed && { opacity: 0.4 }]}
          onPress={() => canProceed && setStep('datetime')}
          disabled={!canProceed}
        >
          <Text style={s.bookBtnText}>Next</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Client */}
        <Text style={s.sectionLabel}>Client (optional)</Text>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={15} color={colors.textMuted} />
          <TextInput
            style={s.searchInput}
            value={selectedClient ? selectedClient.name : clientSearch}
            onChangeText={(t) => { setClientSearch(t); setSelectedClient(null); }}
            placeholder="Search by name, email, or phone…"
            placeholderTextColor={colors.textMuted}
          />
          {selectedClient && (
            <Pressable onPress={() => { setSelectedClient(null); setClientSearch(''); }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        {!selectedClient && clientSearch.length > 0 && (
          <View style={s.clientDropdown}>
            {filteredClients.map((c) => (
              <Pressable
                key={c.id}
                style={s.clientOption}
                onPress={() => { setSelectedClient({ id: c.id, name: `${c.firstName} ${c.lastName}` }); setClientSearch(''); }}
              >
                <View style={s.clientAvatar}>
                  <Text style={s.clientAvatarText}>{c.firstName.charAt(0)}</Text>
                </View>
                <View>
                  <Text style={s.clientOptionName}>{c.firstName} {c.lastName}</Text>
                  {c.phone ? <Text style={s.clientOptionSub}>{c.phone}</Text> : null}
                </View>
              </Pressable>
            ))}
            {filteredClients.length === 0 && (
              <Text style={s.noResults}>No clients found</Text>
            )}
          </View>
        )}
        {selectedClient && (
          <View style={s.selectedClientBadge}>
            <Ionicons name="person-circle" size={18} color={colors.primary} />
            <Text style={s.selectedClientText}>{selectedClient.name}</Text>
            <Pressable onPress={() => setSelectedClient(null)}>
              <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Service */}
        <Text style={s.sectionLabel}>Service *</Text>
        {services.length === 0 ? (
          <Text style={s.noResults}>No services configured</Text>
        ) : (
          services.map((svc) => {
            const active = selectedService?.id === svc.id;
            return (
              <Pressable
                key={svc.id}
                style={[s.serviceRow, active && s.serviceRowActive]}
                onPress={() => setSelectedService({ id: svc.id, name: svc.name, duration: svc.duration, price: svc.price })}
              >
                <View style={s.serviceInfo}>
                  <Text style={[s.serviceName, active && { color: colors.primary }]}>{svc.name}</Text>
                  <Text style={s.serviceMeta}>{svc.duration} min</Text>
                </View>
                <Text style={[s.servicePrice, active && { color: colors.primary }]}>${svc.price.toFixed(2)}</Text>
                {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
              </Pressable>
            );
          })
        )}

        {/* Staff */}
        <Text style={s.sectionLabel}>Staff (optional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          <Pressable
            style={[s.staffChip, !selectedStaff && s.staffChipActive]}
            onPress={() => setSelectedStaff(null)}
          >
            <Text style={[s.staffChipText, !selectedStaff && s.staffChipTextActive]}>Any</Text>
          </Pressable>
          {staff.map((st) => {
            const active = selectedStaff?.id === st.id;
            return (
              <Pressable
                key={st.id}
                style={[s.staffChip, active && s.staffChipActive]}
                onPress={() => setSelectedStaff({ id: st.id, name: st.name })}
              >
                <Text style={[s.staffChipText, active && s.staffChipTextActive]}>{st.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Notes */}
        <Text style={s.sectionLabel}>Notes (optional)</Text>
        <TextInput
          style={[s.searchBox, s.textarea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Special requests, preferences…"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <Pressable
          style={[s.nextBtn, !canProceed && { opacity: 0.4 }]}
          onPress={() => canProceed && setStep('datetime')}
          disabled={!canProceed}
        >
          <Text style={s.nextBtnText}>Next: Pick Date & Time</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  bookBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, minWidth: 60, alignItems: 'center' },
  bookBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  summaryBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.primaryMuted, borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  scroll: { padding: 16, gap: 12 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  textarea: { alignItems: 'flex-start', minHeight: 80, paddingTop: 12 },
  clientDropdown: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  clientOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  clientAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  clientAvatarText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  clientOptionName: { fontSize: 14, fontWeight: '600', color: colors.text },
  clientOptionSub: { fontSize: 12, color: colors.textSecondary },
  noResults: { fontSize: 14, color: colors.textMuted, paddingVertical: 8 },
  selectedClientBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryMuted, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  selectedClientText: { fontSize: 14, fontWeight: '600', color: colors.primary, flex: 1 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, padding: 14, gap: 10 },
  serviceRowActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: 15, fontWeight: '700', color: colors.text },
  serviceMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  servicePrice: { fontSize: 15, fontWeight: '800', color: colors.text },
  staffChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  staffChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  staffChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  staffChipTextActive: { color: colors.primary },
  nextBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dateStrip: { marginHorizontal: -16 },
  dayChip: { width: 58, alignItems: 'center', paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, gap: 2 },
  dayChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  dayChipActiveText: { color: '#fff' },
  dayOfWeek: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  dayNum: { fontSize: 20, fontWeight: '800', color: colors.text },
  dayMonth: { fontSize: 10, color: colors.textMuted },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, minWidth: 74, alignItems: 'center' },
  slotBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  slotText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  slotTextActive: { color: '#fff' },
  confirmCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryMuted, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.primary },
  confirmText: { fontSize: 14, fontWeight: '600', color: colors.primary, flex: 1 },
});
