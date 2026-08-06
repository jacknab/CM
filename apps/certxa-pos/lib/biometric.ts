import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const CREDS_KEY = 'certxa_pos_biometric_creds';
const BIOMETRIC_ENABLED_KEY = 'certxa_pos_biometric_enabled';

export type BiometricType = 'face' | 'fingerprint' | 'none';

export async function getBiometricType(): Promise<BiometricType> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return 'none';
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) return 'none';
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
  return 'none';
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function saveBiometricCredentials(email: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(CREDS_KEY, JSON.stringify({ email, password }));
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
}

export async function getBiometricCredentials(): Promise<{ email: string; password: string } | null> {
  try {
    const raw = await SecureStore.getItemAsync(CREDS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { email: string; password: string };
  } catch {
    return null;
  }
}

export async function clearBiometricCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(CREDS_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY).catch(() => {});
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Sign in to Certxa',
      fallbackLabel: 'Use password',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
