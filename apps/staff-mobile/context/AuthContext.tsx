import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { clearSession, getStoredUser, saveUser, staffLogout, type StaffUser } from '@/lib/api';

type AuthState = {
  user: StaffUser | null;
  isLoading: boolean;
  setUser: (u: StaffUser | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  setUser: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<StaffUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getStoredUser()
      .then(setUserState)
      .finally(() => setIsLoading(false));
  }, []);

  const setUser = useCallback((u: StaffUser | null) => {
    setUserState(u);
    // Persist to AsyncStorage so the session survives app restarts
    if (u) {
      saveUser(u).catch(() => {});
    } else {
      clearSession().catch(() => {});
    }
  }, []);

  const logout = useCallback(async () => {
    await staffLogout();
    setUserState(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
