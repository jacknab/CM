import { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { createClient } from '@/lib/api';
import { colors } from '@/constants/colors';

export default function NewClientScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();
  const storeId = user?.storeId ?? 0;

  const params = useLocalSearchParams<{ editId?: string }>();
  const isEdit = !!params.editId;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createClient({
        storeId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: (newClient) => {
      qc.invalidateQueries({ queryKey: ['clients', storeId] });
      router.replace({ pathname: '/(owner)/client/[id]', params: { id: String(newClient.id) } });
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message ?? 'Could not save client.');
    },
  });

  function handleSave() {
    if (!firstName.trim()) {
      Alert.alert('Required', 'First name is required.');
      return;
    }
    mutation.mutate();
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.closeBtn}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.title}>{isEdit ? 'Edit Client' : 'New Client'}</Text>
        <Pressable style={[s.saveBtn, mutation.isPending && { opacity: 0.6 }]} onPress={handleSave} disabled={mutation.isPending}>
          {mutation.isPending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.saveBtnText}>Save</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
        {/* Avatar preview */}
        <View style={s.avatarPreview}>
          <Text style={s.avatarText}>
            {firstName.charAt(0).toUpperCase() || '?'}{lastName.charAt(0).toUpperCase() || ''}
          </Text>
        </View>

        {/* Name row */}
        <View style={s.nameRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>First Name *</Text>
            <TextInput
              style={s.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Jane"
              placeholderTextColor={colors.textMuted}
              autoFocus
              autoCapitalize="words"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Last Name</Text>
            <TextInput
              style={s.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Smith"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />
          </View>
        </View>

        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          placeholder="jane@example.com"
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={s.label}>Phone</Text>
        <TextInput
          style={s.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+1 (555) 000-0000"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
        />

        <Text style={s.label}>Notes</Text>
        <TextInput
          style={[s.input, s.textarea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Allergies, preferences, referral source…"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <Pressable style={[s.submitBtn, mutation.isPending && { opacity: 0.6 }]} onPress={handleSave} disabled={mutation.isPending}>
          {mutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.submitBtnText}>{isEdit ? 'Save Changes' : 'Create Client'}</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  saveBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, minWidth: 64, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  form: { padding: 20, gap: 14 },
  avatarPreview: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 8 },
  avatarText: { fontSize: 26, fontWeight: '800', color: colors.primary },
  nameRow: { flexDirection: 'row', gap: 12 },
  label: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  textarea: { minHeight: 96, paddingTop: 12 },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
