import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getStoredUser, logout as apiLogout, fetchCurrentUser, type PosUser, type AppMode } from '@/lib/api';
import * as Device from 'expo-device';

type AuthState = {
  user: PosUser | null;
  isLoading: boolean;
  mode: AppMode;
  setUser: (u: PosUser | null) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  mode: 'owner-phone',
  setUser: () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

function resolveMode(user: PosUser | null): AppMode {
  if (!user) return 'owner-phone';
  if (user.soloMode) return 'solo';
  const isTablet = Device.deviceType === Device.DeviceType.TABLET;
  return isTablet ? 'owner-tablet' : 'owner-phone';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<PosUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getStoredUser()
      .then(async (stored) => {
        if (stored) {
          setUserState(stored);
          fetchCurrentUser().then(setUserState).catch(() => {});
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const setUser = useCallback((u: PosUser | null) => {
    setUserState(u);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUserState(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await fetchCurrentUser();
    setUserState(u);
  }, []);

  const mode = resolveMode(user);

  return (
    <AuthContext.Provider value={{ user, isLoading, mode, setUser, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
