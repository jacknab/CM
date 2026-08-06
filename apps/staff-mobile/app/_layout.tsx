import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { colors } from '@/constants/colors';

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
    // Safety net: force-hide splash after 4 s so app never hangs
    const timer = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 4000);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <StatusBar style="light" />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="(tabs)" />
              </Stack>
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </View>
  );
}
