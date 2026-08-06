/**
 * Web-safe SecureStore wrapper.
 * On native (iOS/Android) → expo-secure-store (encrypted keychain).
 * On web → localStorage (development only — not secure, but functional for preview).
 */
import { Platform } from 'react-native';

let NativeStore: typeof import('expo-secure-store') | null = null;
if (Platform.OS !== 'web') {
  NativeStore = require('expo-secure-store');
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (NativeStore) return NativeStore.getItemAsync(key);
  try { return localStorage.getItem(key); } catch { return null; }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (NativeStore) return NativeStore.setItemAsync(key, value);
  try { localStorage.setItem(key, value); } catch {}
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (NativeStore) return NativeStore.deleteItemAsync(key);
  try { localStorage.removeItem(key); } catch {}
}
