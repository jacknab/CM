import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'certxa_mobile_token';
const STORE_ID_KEY = 'certxa_store_id';

interface AuthState {
  token: string | null;
  storeId: number | null;
  isLoading: boolean;
  setAuth: (token: string, storeId: number) => Promise<void>;
  clearAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const t = await SecureStore.getItemAsync(TOKEN_KEY);
        const s = await SecureStore.getItemAsync(STORE_ID_KEY);
        if (t && s) {
          setToken(t);
          setStoreId(Number(s));
        }
      } catch {
        // SecureStore unavailable (simulator without keychain) — start unauthenticated
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setAuth = async (newToken: string, newStoreId: number) => {
    await SecureStore.setItemAsync(TOKEN_KEY, newToken);
    await SecureStore.setItemAsync(STORE_ID_KEY, String(newStoreId));
    setToken(newToken);
    setStoreId(newStoreId);
  };

  const clearAuth = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(STORE_ID_KEY).catch(() => {});
    setToken(null);
    setStoreId(null);
  };

  return (
    <AuthContext.Provider value={{ token, storeId, isLoading, setAuth, clearAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
