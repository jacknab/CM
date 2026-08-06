import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';

export default function TapToPayLocationScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!displayName.trim() || !address.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all fields before saving.');
      return;
    }
    setIsSaving(true);
    try {
      // In a full EAS build this would call the Stripe Terminal API to register the location:
      // await StripeTerminal.createLocation({ displayName, address: { line1: address, city, state, postalCode, country: 'US' } });
      await new Promise((r) => setTimeout(r, 1000));
      Alert.alert('Location Saved', `"${displayName}" has been added to your Tap to Pay locations.`, [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Save Failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Create Location</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.info}>
            Add a business address to associate with your Tap to Pay connection. This is required by Stripe.
          </Text>

          <View style={s.form}>
            <Field label="Location Name" value={displayName} onChangeText={setDisplayName} placeholder="e.g. Main Studio" />
            <Field label="Street Address" value={address} onChangeText={setAddress} placeholder="123 Main St" />
            <Field label="City" value={city} onChangeText={setCity} placeholder="Los Angeles" />
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Field label="State" value={state} onChangeText={setState} placeholder="CA" maxLength={2} autoCapitalize="characters" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Zip Code" value={postalCode} onChangeText={setPostalCode} placeholder="90210" keyboardType="number-pad" maxLength={5} />
              </View>
            </View>
          </View>

          <Pressable
            style={[s.saveBtn, isSaving && s.saveBtnLoading]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Ionicons name={isSaving ? 'hourglass-outline' : 'checkmark-circle-outline'} size={18} color="#fff" />
            <Text style={s.saveBtnText}>{isSaving ? 'Saving…' : 'Save Location'}</Text>
          </Pressable>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  keyboardType?: 'default' | 'number-pad';
  autoCapitalize?: 'none' | 'characters' | 'words' | 'sentences';
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        maxLength={maxLength}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'words'}
      />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.card },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  scroll: { padding: 20, gap: 16 },
  info: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
  form: { gap: 14 },
  row: { flexDirection: 'row', gap: 12 },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: colors.text },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  saveBtnLoading: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
