import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { login } from '@/lib/api';
import {
  getBiometricType,
  isBiometricEnabled,
  getBiometricCredentials,
  saveBiometricCredentials,
  authenticateWithBiometrics,
} from '@/lib/biometric';
import { saveRememberMe, loadRememberMe } from '@/lib/storage';
import { colors } from '@/constants/colors';

export default function LoginScreen() {
  const { setUser, mode, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [biometricType, setBiometricType] = useState<'face' | 'fingerprint' | 'none'>('none');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    if (user) {
      redirect();
      return;
    }
    checkBiometrics();
    loadRememberMe().then(setRememberMe);
  }, [user]);

  function redirect() {
    if (mode === 'solo') router.replace('/(solo)/');
    else if (mode === 'owner-tablet') router.replace('/(owner)/');
    else router.replace('/(owner-phone)/');
  }

  async function checkBiometrics() {
    const type = await getBiometricType();
    const enabled = await isBiometricEnabled();
    setBiometricType(type);
    setBiometricAvailable(enabled && type !== 'none');
  }

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setIsLoading(true);
    try {
      await saveRememberMe(rememberMe);
      const u = await login(email.trim().toLowerCase(), password, rememberMe);
      const type = await getBiometricType();
      if (rememberMe && type !== 'none') {
        const enabled = await isBiometricEnabled();
        if (!enabled) {
          Alert.alert(
            `Enable ${type === 'face' ? 'Face ID' : 'Fingerprint'}?`,
            'Sign in faster next time with biometrics.',
            [
              { text: 'Not now', style: 'cancel', onPress: () => finishLogin(u) },
              {
                text: 'Enable',
                onPress: async () => {
                  await saveBiometricCredentials(email.trim().toLowerCase(), password);
                  finishLogin(u);
                },
              },
            ],
          );
          return;
        }
      }
      finishLogin(u);
    } catch (err) {
      Alert.alert('Sign in failed', err instanceof Error ? err.message : 'Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleRememberMe(value: boolean) {
    setRememberMe(value);
    await saveRememberMe(value);
  }

  function finishLogin(u: Parameters<typeof setUser>[0]) {
    setUser(u);
    redirect();
  }

  async function handleBiometricLogin() {
    const creds = await getBiometricCredentials();
    if (!creds) return;
    const ok = await authenticateWithBiometrics();
    if (!ok) return;
    setIsLoading(true);
    try {
      const u = await login(creds.email, creds.password);
      finishLogin(u);
    } catch (err) {
      Alert.alert('Sign in failed', err instanceof Error ? err.message : 'Please try your password instead.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoRow}>
          <View style={styles.logoMark}>
            <Ionicons name="flash" size={28} color="#fff" />
          </View>
          <Text style={styles.logoText}>Certxa</Text>
        </View>

        <Text style={styles.heading}>Welcome back</Text>
        <Text style={styles.sub}>Sign in to your Certxa account</Text>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, { flex: 1, borderWidth: 0, padding: 0 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.rememberRow}>
            <View style={styles.rememberLeft}>
              <Ionicons name="shield-checkmark-outline" size={17} color={colors.textSecondary} />
              <View>
                <Text style={styles.rememberLabel}>Stay signed in</Text>
                <Text style={styles.rememberSub}>
                  {rememberMe
                    ? 'Unlock with biometrics or PIN on next open'
                    : 'You\'ll enter your password each time'}
                </Text>
              </View>
            </View>
            <Switch
              value={rememberMe}
              onValueChange={toggleRememberMe}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={rememberMe ? colors.primary : colors.textMuted}
            />
          </View>

          <Pressable
            style={[styles.btn, isLoading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Sign in</Text>
            )}
          </Pressable>

          {biometricAvailable && (
            <Pressable style={styles.bioBtn} onPress={handleBiometricLogin}>
              <Ionicons
                name={biometricType === 'face' ? 'scan-outline' : 'finger-print-outline'}
                size={22}
                color={colors.primary}
              />
              <Text style={styles.bioBtnText}>
                {biometricType === 'face' ? 'Sign in with Face ID' : 'Sign in with Fingerprint'}
              </Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.footer}>
          This app is for Certxa business accounts only.{'\n'}
          Manage your account at certxa.com
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 28, paddingTop: 80 },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 48, gap: 10 },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  heading: { fontSize: 30, fontWeight: '700', color: colors.text, marginBottom: 6, letterSpacing: -0.5 },
  sub: { fontSize: 16, color: colors.textSecondary, marginBottom: 36 },
  form: { gap: 16 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.2 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  bioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  bioBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  rememberLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  rememberLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  rememberSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  footer: {
    marginTop: 'auto',
    paddingTop: 48,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
