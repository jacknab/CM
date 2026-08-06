import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadRememberMe, loadUser } from '@/lib/storage';

const IDLE_TIMEOUT_KEY = 'certxa_lock_idle_minutes';
const DEFAULT_IDLE_MINUTES = 5;

type LockState = {
  isLocked: boolean;
  idleMinutes: number;
  lock: () => void;
  unlock: () => void;
  resetIdle: () => void;
  setIdleMinutes: (m: number) => Promise<void>;
};

const LockContext = createContext<LockState>({
  isLocked: false,
  idleMinutes: DEFAULT_IDLE_MINUTES,
  lock: () => {},
  unlock: () => {},
  resetIdle: () => {},
  setIdleMinutes: async () => {},
});

export function LockProvider({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const [idleMinutes, setIdleMinutesState] = useState(DEFAULT_IDLE_MINUTES);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appState = useRef<AppStateStatus>('active');

  useEffect(() => {
    AsyncStorage.getItem(IDLE_TIMEOUT_KEY).then((v) => {
      if (v !== null) setIdleMinutesState(Number(v));
    });
    // Auto-lock on cold start when "Stay signed in" is enabled and a session exists
    if (Platform.OS !== 'web') {
      Promise.all([loadRememberMe(), loadUser()]).then(([remember, stored]) => {
        if (remember && stored) setIsLocked(true);
      });
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  const startTimer = useCallback(
    (minutes: number) => {
      clearTimer();
      if (minutes <= 0 || Platform.OS === 'web') return;
      idleTimer.current = setTimeout(() => {
        setIsLocked(true);
      }, minutes * 60 * 1000);
    },
    [clearTimer],
  );

  const resetIdle = useCallback(() => {
    if (isLocked) return;
    startTimer(idleMinutes);
  }, [isLocked, idleMinutes, startTimer]);

  useEffect(() => {
    startTimer(idleMinutes);
    return clearTimer;
  }, [idleMinutes, startTimer, clearTimer]);

  useEffect(() => {
    if (!isLocked) startTimer(idleMinutes);
    else clearTimer();
  }, [isLocked, idleMinutes, startTimer, clearTimer]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current === 'active' && next.match(/inactive|background/)) {
        setIsLocked(true);
      }
      if (next === 'active' && appState.current.match(/inactive|background/)) {
        // already locked; keep lock, don't reset timer yet
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  const lock = useCallback(() => setIsLocked(true), []);

  const unlock = useCallback(() => {
    setIsLocked(false);
    startTimer(idleMinutes);
  }, [idleMinutes, startTimer]);

  const setIdleMinutes = useCallback(
    async (m: number) => {
      setIdleMinutesState(m);
      await AsyncStorage.setItem(IDLE_TIMEOUT_KEY, String(m));
    },
    [],
  );

  return (
    <LockContext.Provider
      value={{ isLocked, idleMinutes, lock, unlock, resetIdle, setIdleMinutes }}
    >
      {children}
    </LockContext.Provider>
  );
}

export function useLock() {
  return useContext(LockContext);
}
