import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_KEY = 'certxa_pos_user';
const TOKEN_KEY = 'certxa_pos_token';
const REMEMBER_ME_KEY = 'certxa_pos_remember_me';

export async function saveUser(user: object): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function loadUser<T>(): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function clearUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

export async function saveRememberMe(value: boolean): Promise<void> {
  await AsyncStorage.setItem(REMEMBER_ME_KEY, value ? 'true' : 'false');
}

export async function loadRememberMe(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(REMEMBER_ME_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}
