import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { LockProvider } from '@/context/LockContext';
import { TerminalProvider } from '@/context/TerminalContext';
import { LockScreen } from '@/components/LockScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { colors } from '@/constants/colors';
import { defineBackgroundSyncTask, registerBackgroundSync } from '@/lib/backgroundSync';

// Sentry — activate by setting EXPO_PUBLIC_SENTRY_DSN env var; gracefully disabled otherwise
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null;
try {
  Sentry = require('@sentry/react-native');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dsn = (globalThis as any).process?.env?.EXPO_PUBLIC_SENTRY_DSN as string | undefined;
  if (dsn) {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      environment: (globalThis as any).__DEV__ ? 'development' : 'production',
    });
  }
} catch { /* not installed or in Expo Go */ }

// Must be called at module scope — registers the task definition before the app mounts
defineBackgroundSyncTask();

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
    const timer = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 4000);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    registerBackgroundSync();
  }, []);

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <TerminalProvider>
              <LockProvider>
                <StatusBar style="light" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                    animation: 'fade',
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="login" />
                  <Stack.Screen name="(owner)" />
                  <Stack.Screen name="(owner-phone)" />
                  <Stack.Screen name="(solo)" />
                </Stack>
                <LockScreen />
              </LockProvider>
              </TerminalProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
