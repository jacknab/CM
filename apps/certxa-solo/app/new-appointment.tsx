import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '@/lib/apiClient';
import { Colors } from '@/constants/colors';

interface Service {
  id: number;
  name: string;
  price: string | number;
  duration: number;
}

interface Customer {
  id: number;
  name?: string;
  fullName?: string;
  phone?: string;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Half-hour slots from 8:00 to 19:30 on the given day. */
function slotsFor(day: Date): Date[] {
  const slots: Date[] = [];
  for (let h = 8; h < 20; h++) {
    for (const m of [0, 30]) {
      const s = new Date(day);
      s.setHours(h, m, 0, 0);
      slots.push(s);
    }
  }
  return slots;
}

export default function NewAppointmentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Client
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Service
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [loadingServices, setLoadingServices] = useState(true);

  // Time
  const [day, setDay] = useState(() => new Date());
  const [slot, setSlot] = useState<Date | null>(null);

  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/services')
      .then((result) => setServices(Array.isArray(result) ? result : []))
      .catch(() => setError('Could not load your services.'))
      .finally(() => setLoadingServices(false));
  }, []);

  const slots = useMemo(() => slotsFor(day), [day]);
  const selectedService = services.find((s) => s.id === serviceId) ?? null;
  const canBook = !!customer && !!serviceId && !!slot && !booking;

  const lookupClient = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) {
      setLookupError('Enter a valid phone number.');
      return;
    }
    setLookingUp(true);
    setLookupError(null);
    setCustomer(null);
    try {
      const result = await api.get(`/api/customers/search?phone=${encodeURIComponent(digits)}`);
      if (result) setCustomer(result as Customer);
      else setLookupError('No client found — enter a name below to create one.');
    } catch (err) {
      setLookupError(err instanceof ApiError ? err.message : 'Lookup failed.');
    } finally {
      setLookingUp(false);
    }
  };

  const createClient = async () => {
    if (!newClientName.trim()) {
      setLookupError('Enter the client’s name.');
      return;
    }
    setLookingUp(true);
    setLookupError(null);
    try {
      const result = await api.post('/api/customers', { name: newClientName.trim(), phone: phone.replace(/\D/g, '') || undefined });
      setCustomer(result as Customer);
    } catch (err) {
      setLookupError(err instanceof ApiError ? err.message : 'Could not create client.');
    } finally {
      setLookingUp(false);
    }
  };

  const bookAppointment = async () => {
    if (!canBook || !selectedService || !slot) return;
    setBooking(true);
    setError(null);
    try {
      await api.post('/api/appointments', {
        customerId: customer!.id,
        serviceId: selectedService.id,
        duration: selectedService.duration,
        date: slot.toISOString(),
      });
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not book the appointment.');
    } finally {
      setBooking(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.title}>New Appointment</Text>
        <View style={{ width: 50 }} />
      </View>

      <Text style={styles.sectionLabel}>Client</Text>
      {customer ? (
        <View style={styles.selectedClient}>
          <Text style={styles.selectedClientText}>{customer.fullName || customer.name}</Text>
          <TouchableOpacity onPress={() => { setCustomer(null); setPhone(''); setNewClientName(''); }}>
            <Text style={styles.change}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Client phone number"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <TouchableOpacity style={styles.lookupButton} onPress={lookupClient} disabled={lookingUp}>
              {lookingUp ? <ActivityIndicator color="#fff" /> : <Text style={styles.lookupButtonText}>Find</Text>}
            </TouchableOpacity>
          </View>
          {lookupError && <Text style={styles.hint}>{lookupError}</Text>}
          {lookupError && (
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="New client's name"
                placeholderTextColor={Colors.textMuted}
                value={newClientName}
                onChangeText={setNewClientName}
              />
              <TouchableOpacity style={styles.lookupButton} onPress={createClient} disabled={lookingUp}>
                <Text style={styles.lookupButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <Text style={styles.sectionLabel}>Service</Text>
      {loadingServices ? (
        <ActivityIndicator color={Colors.primary} />
      ) : (
        <View style={styles.chipWrap}>
          {services.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.chip, serviceId === s.id && styles.chipSelected]}
              onPress={() => setServiceId(s.id)}
            >
              <Text style={[styles.chipText, serviceId === s.id && styles.chipTextSelected]}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.sectionLabel}>Day</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.dayButton} onPress={() => { setDay((d) => addDays(d, -1)); setSlot(null); }}>
          <Text style={styles.dayButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.dayLabel}>{day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
        <TouchableOpacity style={styles.dayButton} onPress={() => { setDay((d) => addDays(d, 1)); setSlot(null); }}>
          <Text style={styles.dayButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Time</Text>
      <View style={styles.chipWrap}>
        {slots.map((s) => {
          const selected = slot?.getTime() === s.getTime();
          return (
            <TouchableOpacity key={s.toISOString()} style={[styles.chip, selected && styles.chipSelected]} onPress={() => setSlot(s)}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.bookButton, !canBook && styles.bookButtonDisabled]}
        disabled={!canBook}
        onPress={bookAppointment}
      >
        {booking ? <ActivityIndicator color="#fff" /> : <Text style={styles.bookButtonText}>Book Appointment</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  back: { color: Colors.primary, fontSize: 16 },
  title: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  sectionLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.text,
  },
  lookupButton: { backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  lookupButtonText: { color: '#fff', fontWeight: '600' },
  hint: { color: Colors.textSecondary, fontSize: 13, marginTop: 8, marginBottom: 4 },
  selectedClient: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border,
  },
  selectedClientText: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  change: { color: Colors.primary, fontSize: 14 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.text, fontSize: 14 },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  dayButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center' },
  dayButtonText: { color: Colors.text, fontSize: 18, fontWeight: '600' },
  dayLabel: { flex: 1, textAlign: 'center', color: Colors.text, fontSize: 16, fontWeight: '600' },
  error: { color: Colors.error, marginTop: 16, textAlign: 'center' },
  bookButton: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  bookButtonDisabled: { opacity: 0.4 },
  bookButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
