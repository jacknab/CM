import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Linking,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiGet, apiPost, normalizeStaffUser } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/constants/colors';
import {
  getBiometricType,
  isBiometricEnabled,
  authenticateWithBiometrics,
  getBiometricCredentials,
  saveBiometricCredentials,
  clearBiometricCredentials,
  type BiometricType,
} from '@/lib/biometric';
import * as SecureStore from '@/lib/secureStore';

const PHONE_KEY = 'certxa_staff_phone';

type Screen = 'code' | 'phone';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { setUser } = useAuth();

  // Which mini-screen is visible
  const [screen, setScreen] = useState<Screen>('code');

  // Code entry
  const [code, setCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState('');

  // Phone entry (request new code)
  const [phone, setPhone] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneSent, setPhoneSent] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  // Biometric state (for returning users)
  const [bioType, setBioType] = useState<BiometricType>('none');
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);

  const codeRef = useRef<TextInput>(null);

  // Check biometrics on mount
  useEffect(() => {
    (async () => {
      const [type, enabled, savedPhone] = await Promise.all([
        getBiometricType(),
        isBiometricEnabled(),
        SecureStore.getItemAsync(PHONE_KEY),
      ]);
      setBioType(type);
      setBioEnabled(enabled);
      if (savedPhone) setPhone(savedPhone);
    })();
  }, []);

  const biometricIcon: React.ComponentProps<typeof Ionicons>['name'] =
    bioType === 'face' ? 'scan-outline' : 'finger-print-outline';
  const biometricLabel = bioType === 'face' ? 'Face ID' : 'Touch ID';

  // ── OTP login ──────────────────────────────────────────────────────────────
  const handleCodeLogin = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed || !/^\d{8}$/.test(trimmed)) {
      setCodeError('Please enter the 8-digit code from your SMS.');
      return;
    }
    setCodeLoading(true);
    setCodeError('');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await apiPost<Record<string, unknown>>(
        '/api/auth/staff-otp-login',
        { code: trimmed }
      );

      if (result && (result.staffId || result.id)) {
        // Normalize the OTP response into the canonical StaffUser shape.
        // The server returns { id: "staff-5", staffId: 5, firstName, lastName, profileImageUrl, … }
        // but StaffUser expects { id: number, name, avatarUrl, … }.
        const staffUser = normalizeStaffUser(result);
        setUser(staffUser);

        // Save phone for future "request new code" convenience
        if (phone) await SecureStore.setItemAsync(PHONE_KEY, phone);

        // Offer biometrics setup
        if (bioType !== 'none' && !bioEnabled) {
          // We don't have a password to save — store the phone as the "credential"
          // so biometrics + phone → request new OTP if needed
          Alert.alert(
            `Enable ${biometricLabel}?`,
            `Sign in faster next time using ${biometricLabel}. You'll still receive a code only when your session expires.`,
            [
              { text: 'Not now', style: 'cancel' },
              {
                text: `Enable ${biometricLabel}`,
                onPress: async () => {
                  // Store sentinel so we know biometrics are set up
                  await saveBiometricCredentials('__otp__', phone || '');
                  setBioEnabled(true);
                },
              },
            ]
          );
        }

        router.replace('/(tabs)/schedule');
      } else {
        setCodeError('Invalid or expired code. Request a new one below.');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (e: any) {
      // Map server errors to user-friendly messages.
      // Never surface internal codes (OTP_IP_LOCKED) or normalization failures.
      const raw: string = e?.message ?? '';
      const msg = raw.includes('Too many') || raw.includes('minute')
        ? raw  // human-readable rate-limit copy from server
        : 'Invalid or expired code. Request a new one below.';
      setCodeError(msg);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setCodeLoading(false);
    }
  }, [code, phone, bioType, bioEnabled, setUser]);

  // ── Request new OTP ────────────────────────────────────────────────────────
  const handleRequestCode = useCallback(async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setPhoneError('Please enter a valid 10-digit phone number.');
      return;
    }
    setPhoneLoading(true);
    setPhoneError('');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await apiPost('/api/auth/staff-request-otp', { phone });
      setPhoneSent(true);
      await SecureStore.setItemAsync(PHONE_KEY, phone);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Go back to code entry after a moment
      setTimeout(() => {
        setScreen('code');
        codeRef.current?.focus();
      }, 1500);
    } catch (e: any) {
      // Expose the rate-limit message from the server (already user-friendly);
      // map all other errors to a safe generic string.
      const raw: string = e?.message ?? '';
      const phoneMsg = raw.includes('Too many') || raw.includes('minute')
        ? raw
        : 'Could not send code. Please try again.';
      setPhoneError(phoneMsg);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPhoneLoading(false);
    }
  }, [phone]);

  // ── Biometric login (returning users) ─────────────────────────────────────
  const handleBiometricLogin = useCallback(async () => {
    setBioLoading(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const authed = await authenticateWithBiometrics();
    if (!authed) { setBioLoading(false); return; }

    // Biometrics confirmed — but OTP sessions expire. Guide to re-enter code if session gone.
    // Check if we have a live session first by calling a protected endpoint.
    try {
      const creds = await getBiometricCredentials();
      if (!creds) throw new Error('no_creds');

      // Try to resume session via GET /api/auth/user (checks staffId in session cookie).
      // Returns null (HTTP 200) when no active session, or the staff object when valid.
      const me = await apiGet<Record<string, unknown>>('/api/auth/user').catch(() => null);

      // Only proceed if the response has a recognisable numeric staffId
      const hasValidId = me && (
        (typeof me.staffId === 'number' && me.staffId > 0) ||
        (typeof me.id === 'string' && /^staff-\d+$/.test(me.id as string))
      );

      if (hasValidId) {
        try {
          setUser(normalizeStaffUser(me as Record<string, unknown>));
          router.replace('/(tabs)/schedule');
        } catch {
          // Normalization failed (malformed payload) — treat as expired session
          await clearBiometricCredentials();
          setBioEnabled(false);
          Alert.alert(
            'Session Expired',
            'Your session has expired. Please enter a new access code.',
            [{ text: 'OK' }]
          );
        }
      } else {
        // No valid session — guide to re-enter code
        await clearBiometricCredentials();
        setBioEnabled(false);
        Alert.alert(
          'Session Expired',
          'Your session has expired. Please enter a new access code.',
          [{ text: 'OK' }]
        );
      }
    } catch {
      // Network error or missing biometric credentials — fall through to code screen
      setScreen('code');
    } finally {
      setBioLoading(false);
    }
  }, [setUser]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Glow */}
        <View style={styles.glow} pointerEvents="none" />

        {/* Logo */}
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>C</Text>
          </View>
          <Text style={styles.brandName}>Certxa</Text>
          <Text style={styles.portalLabel}>Staff Portal</Text>
        </View>

        {/* Biometric fast-login (returning users) */}
        {bioType !== 'none' && bioEnabled && screen === 'code' && (
          <Pressable
            style={({ pressed }) => [styles.bioBtn, pressed && styles.bioBtnPressed, bioLoading && styles.disabled]}
            onPress={handleBiometricLogin}
            disabled={bioLoading}
          >
            {bioLoading
              ? <ActivityIndicator color={colors.primary} size="small" />
              : (
                <>
                  <Ionicons name={biometricIcon} size={22} color={colors.primary} />
                  <Text style={styles.bioBtnText}>Sign in with {biometricLabel}</Text>
                </>
              )
            }
          </Pressable>
        )}

        {/* ── Code entry screen ── */}
        {screen === 'code' && (
          <View style={styles.card}>
            <View style={styles.cardIconRow}>
              <View style={styles.cardIconWrap}>
                <Ionicons name="keypad-outline" size={22} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.cardTitle}>Enter your access code</Text>
                <Text style={styles.cardSub}>Check your SMS for the code your manager sent</Text>
              </View>
            </View>

            {codeError ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={15} color={colors.error} />
                <Text style={styles.errorText}>{codeError}</Text>
              </View>
            ) : null}

            <TextInput
              ref={codeRef}
              style={styles.codeInput}
              value={code}
              onChangeText={v => { setCode(v.replace(/\D/g, '').slice(0, 8)); setCodeError(''); }}
              placeholder="12345678"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={8}
              returnKeyType="done"
              onSubmitEditing={handleCodeLogin}
              autoFocus={bioType === 'none' || !bioEnabled}
            />

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed, codeLoading && styles.disabled]}
              onPress={handleCodeLogin}
              disabled={codeLoading || !code.trim()}
            >
              {codeLoading
                ? <ActivityIndicator color={colors.background} size="small" />
                : (
                  <>
                    <Text style={styles.primaryBtnText}>Sign In</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.background} />
                  </>
                )
              }
            </Pressable>

            <Pressable style={styles.switchLink} onPress={() => { setScreen('phone'); setCodeError(''); }}>
              <Ionicons name="chatbubble-outline" size={14} color={colors.primary} />
              <Text style={styles.switchLinkText}>Didn't get a code? Request one</Text>
            </Pressable>
          </View>
        )}

        {/* ── Phone / request new code screen ── */}
        {screen === 'phone' && (
          <View style={styles.card}>
            <View style={styles.cardIconRow}>
              <View style={styles.cardIconWrap}>
                <Ionicons name="phone-portrait-outline" size={22} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.cardTitle}>Request a new code</Text>
                <Text style={styles.cardSub}>We'll send a new access code to your phone</Text>
              </View>
            </View>

            {phoneSent ? (
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                <Text style={styles.successText}>Code sent! Check your messages.</Text>
              </View>
            ) : phoneError ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={15} color={colors.error} />
                <Text style={styles.errorText}>{phoneError}</Text>
              </View>
            ) : null}

            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={v => { setPhone(v); setPhoneError(''); setPhoneSent(false); }}
                placeholder="(555) 000-0000"
                placeholderTextColor={colors.textMuted}
                // iOS + Hermes can intermittently throw a runtime error with
                // phone-pad/send combination on some RN builds. Use number-pad
                // for stable OTP phone entry behavior.
                keyboardType="number-pad"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleRequestCode}
              />
            </View>

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed, (phoneLoading || phoneSent) && styles.disabled]}
              onPress={handleRequestCode}
              disabled={phoneLoading || phoneSent}
            >
              {phoneLoading
                ? <ActivityIndicator color={colors.background} size="small" />
                : (
                  <>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.background} />
                    <Text style={styles.primaryBtnText}>Send My Code</Text>
                  </>
                )
              }
            </Pressable>

            <Pressable style={styles.switchLink} onPress={() => { setScreen('code'); setPhoneSent(false); setPhoneError(''); }}>
              <Ionicons name="arrow-back" size={14} color={colors.textSecondary} />
              <Text style={[styles.switchLinkText, { color: colors.textSecondary }]}>Back to code entry</Text>
            </Pressable>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>Contact your manager if you need help signing in.</Text>
        <View style={styles.legalRow}>
          <Pressable onPress={() => Linking.openURL('https://certxa.com/privacy')} hitSlop={8}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={() => Linking.openURL('https://certxa.com/terms')} hitSlop={8}>
            <Text style={styles.legalLink}>Terms of Service</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, paddingHorizontal: 24, backgroundColor: colors.background },
  glow: {
    position: 'absolute',
    top: -80, left: '50%',
    width: 360, height: 280,
    marginLeft: -180,
    backgroundColor: colors.primary,
    borderRadius: 180,
    opacity: 0.07,
  },
  logoArea: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 64, height: 64,
    borderRadius: 20,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  logoText: { fontSize: 28, fontWeight: '700', color: colors.primary, fontFamily: 'DMSans_700Bold' },
  brandName: { fontSize: 24, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold' },
  portalLabel: {
    fontSize: 12, color: colors.primary,
    fontFamily: 'DMSans_500Medium',
    letterSpacing: 2, textTransform: 'uppercase', marginTop: 2,
  },
  bioBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    height: 52, borderRadius: colors.radius,
    marginBottom: 16, borderWidth: 1,
    borderColor: colors.primary, backgroundColor: colors.primaryMuted,
  },
  bioBtnPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  bioBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600', fontFamily: 'DMSans_700Bold' },
  card: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusLarge,
    padding: 22,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 20,
    gap: 14,
  },
  cardIconRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold' },
  cardSub: { fontSize: 12, color: colors.textMuted, fontFamily: 'DMSans_400Regular', marginTop: 2, maxWidth: 220 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,71,87,0.10)',
    borderRadius: colors.radiusSmall,
    padding: 11,
    borderWidth: 1, borderColor: 'rgba(255,71,87,0.25)',
  },
  errorText: { color: colors.error, fontSize: 13, fontFamily: 'DMSans_400Regular', flex: 1 },
  successBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,212,170,0.10)',
    borderRadius: colors.radiusSmall,
    padding: 11,
    borderWidth: 1, borderColor: 'rgba(0,212,170,0.25)',
  },
  successText: { color: colors.success, fontSize: 13, fontFamily: 'DMSans_400Regular', flex: 1 },
  codeInput: {
    height: 60,
    backgroundColor: colors.surface,
    borderRadius: colors.radius,
    borderWidth: 1, borderColor: colors.border,
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'DMSans_700Bold',
    textAlign: 'center',
    letterSpacing: 6,
  },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: colors.radius,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: colors.text, fontSize: 15, fontFamily: 'DMSans_400Regular' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary,
    borderRadius: colors.radius, height: 52,
  },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.6 },
  primaryBtnText: { color: colors.background, fontSize: 16, fontWeight: '700', fontFamily: 'DMSans_700Bold' },
  switchLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 4,
  },
  switchLinkText: { fontSize: 13, color: colors.primary, fontFamily: 'DMSans_500Medium' },
  footer: { textAlign: 'center', fontSize: 12, color: colors.textMuted, fontFamily: 'DMSans_400Regular', lineHeight: 18, marginBottom: 10 },
  legalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  legalLink: { fontSize: 12, color: colors.textMuted, fontFamily: 'DMSans_400Regular', textDecorationLine: 'underline' },
  legalDot: { fontSize: 12, color: colors.textMuted },
});
