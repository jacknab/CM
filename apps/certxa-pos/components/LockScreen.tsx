import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { useLock } from '@/context/LockContext';
import { useAuth } from '@/context/AuthContext';

let LocalAuthentication: typeof import('expo-local-authentication') | null = null;
try {
  LocalAuthentication = require('expo-local-authentication');
} catch { /* web or Expo Go without native module */ }

export function LockScreen() {
  const { isLocked, unlock } = useLock();
  const { user } = useAuth();
  const [status, setStatus] = useState<'idle' | 'authenticating' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const hasPrompted = useRef(false);

  const authenticate = useCallback(async () => {
    if (Platform.OS === 'web') {
      unlock();
      return;
    }
    if (!LocalAuthentication) {
      unlock();
      return;
    }

    setStatus('authenticating');
    setErrorMsg('');
    try {
      const enrolled = await LocalAuthentication.getEnrolledLevelAsync();
      const hasHardware = await LocalAuthentication.hasHardwareAsync();

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm it\'s you to continue',
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
        requireConfirmation: false,
      });

      if (result.success) {
        setStatus('idle');
        unlock();
      } else {
        const reason = (result as { error?: string }).error;
        if (reason === 'user_cancel' || reason === 'system_cancel') {
          setStatus('idle');
        } else {
          setStatus('error');
          setErrorMsg(
            enrolled === 0 || !hasHardware
              ? 'Authentication failed. Try again.'
              : 'Biometric check failed. Try again or use passcode.',
          );
        }
      }
    } catch {
      setStatus('error');
      setErrorMsg('Authentication unavailable. Try again.');
    }
  }, [unlock]);

  useEffect(() => {
    if (isLocked && !hasPrompted.current) {
      hasPrompted.current = true;
      authenticate();
    }
    if (!isLocked) {
      hasPrompted.current = false;
      setStatus('idle');
      setErrorMsg('');
    }
  }, [isLocked, authenticate]);

  if (!isLocked) return null;

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

  return (
    <View style={s.overlay}>
      <View style={s.card}>
        <View style={s.avatar}>
          <Text style={s.initials}>{initials}</Text>
        </View>

        <Text style={s.name}>{user?.name ?? 'Owner'}</Text>
        <Text style={s.subtitle}>
          {Platform.OS === 'web'
            ? 'Tap to unlock'
            : 'Use Face ID, fingerprint, or device PIN'}
        </Text>

        {status === 'error' && errorMsg ? (
          <View style={s.errorBox}>
            <Ionicons name="warning-outline" size={15} color={colors.warning} />
            <Text style={s.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [s.btn, pressed && s.btnPressed]}
          onPress={authenticate}
          disabled={status === 'authenticating'}
        >
          {status === 'authenticating' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons
                name={Platform.OS === 'web' ? 'lock-open-outline' : 'finger-print-outline'}
                size={20}
                color="#fff"
              />
              <Text style={s.btnText}>
                {Platform.OS === 'web' ? 'Unlock' : 'Unlock with Biometrics / PIN'}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      <Text style={s.appLabel}>Certxa POS</Text>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    gap: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 340,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  initials: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warningMuted ?? '#F59E0B22',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 13,
    color: colors.warning,
    flex: 1,
    flexWrap: 'wrap',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 4,
    minWidth: 220,
    justifyContent: 'center',
  },
  btnPressed: { opacity: 0.8 },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  appLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
