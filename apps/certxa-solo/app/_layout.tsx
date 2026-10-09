import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeTerminalProvider, useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { terminalApiCall } from '@/lib/apiClient';
import { bootstrapSession, subscribeToSession, isSessionReady } from '@/lib/authSession';
import { terminalDiag } from '@/lib/terminalDiag';
import { Colors } from '@/constants/colors';

const queryClient = new QueryClient();

// ── TerminalInitializer ────────────────────────────────────────────────────────
// Must be rendered inside <StripeTerminalProvider> so it can call initialize()
// from the hook. Mounted only once a session exists, so tokenProvider's very
// first call always has a valid JWT to send.
const INIT_MAX_ATTEMPTS = 4;
const INIT_RETRY_DELAY_MS = 3_000;

function TerminalInitializer() {
  const { initialize } = useStripeTerminal();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const tryInit = async (attempt: number): Promise<void> => {
      console.log(`[Stripe] Calling initialize() (attempt ${attempt}/${INIT_MAX_ATTEMPTS})…`);
      try {
        const res: any = await initialize();

        if (res?.error) {
          const tokenErr = terminalDiag.tokenReceived.error;
          const sdkMsg = res.error.message ?? String(res.error);
          const realMsg = tokenErr || sdkMsg;

          console.error(`[Stripe] initialize() failed (attempt ${attempt}):`, realMsg);

          const isTransient =
            realMsg.includes("Couldn't fetch") ||
            realMsg.includes('timeout') ||
            realMsg.includes('network') ||
            realMsg.includes('fetch connection token');

          if (isTransient && attempt < INIT_MAX_ATTEMPTS) {
            console.log(`[Stripe] Transient failure — retrying in ${INIT_RETRY_DELAY_MS}ms…`);
            await new Promise<void>((r) => setTimeout(r, INIT_RETRY_DELAY_MS));
            return tryInit(attempt + 1);
          }

          terminalDiag.markInitFailed(realMsg);
        } else {
          console.log('[Stripe] initialize() succeeded');
          terminalDiag.markSdkInitialized();
        }
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        console.error(`[Stripe] initialize() threw (attempt ${attempt}):`, msg);

        const isTransient = msg.includes('timeout') || msg.includes('network');

        if (isTransient && attempt < INIT_MAX_ATTEMPTS) {
          await new Promise<void>((r) => setTimeout(r, INIT_RETRY_DELAY_MS));
          return tryInit(attempt + 1);
        }

        terminalDiag.markInitFailed(msg);
      }
    };

    tryInit(1);
    // initialize is stable (wrapped in useCallback in the SDK) — safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// ── AuthGate ───────────────────────────────────────────────────────────────────
// Restores a stored session on boot, then redirects between /login and the
// rest of the app as the session state changes.
function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const [booted, setBooted] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    bootstrapSession().then((hasToken) => {
      setAuthed(hasToken);
      setBooted(true);
    });
    return subscribeToSession(setAuthed);
  }, []);

  useEffect(() => {
    if (!booted) return;
    const onLoginScreen = segments[0] === 'login';
    if (!authed && !onLoginScreen) router.replace('/login');
    if (authed && onLoginScreen) router.replace('/');
  }, [booted, authed, segments, router]);

  if (!booted) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  // StripeTerminalProvider stays mounted throughout; initialize() only runs
  // once a session exists, so tokenProvider never fires against a logged-out app.
  const [sessionReady, setSessionReady] = useState(isSessionReady());
  const isFirstTokenCall = useRef(true);

  useEffect(() => {
    const unsubscribe = subscribeToSession((ready) => {
      setSessionReady(ready);
      if (ready) {
        console.log('[Stripe] Session ready — calling initialize()');
        terminalDiag.markProviderMounted();
        isFirstTokenCall.current = true;
      }
    });
    return unsubscribe;
  }, []);

  // tokenProvider is called by the native SDK each time it needs a connection
  // token — once on init, then periodically.
  const tokenProvider = useCallback(async (): Promise<string> => {
    const TIMEOUT_MS = 25_000;
    const POLL_INTERVAL = 500;
    const deadline = Date.now() + TIMEOUT_MS;

    const calledForInit = isFirstTokenCall.current;
    console.log(calledForInit ? '[Stripe] tokenProvider called (SDK initializing…)' : '[Stripe] tokenProvider called (token refresh)');
    terminalDiag.markTokenRequested();

    while (true) {
      try {
        const result = await terminalApiCall('/api/payments/terminal/connection-token', 'POST');
        if (!result?.secret) {
          const reason = result?.error ?? 'Failed to get connection token';
          terminalDiag.markTokenFailed(reason);
          throw new Error(reason);
        }
        console.log('[Stripe] Connection token received');
        terminalDiag.markTokenReceived();
        if (calledForInit) isFirstTokenCall.current = false;
        return result.secret as string;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err ?? '');

        const isTransient =
          msg.includes('Request failed') ||
          msg.includes('Network request failed') ||
          msg.includes('Failed to fetch') ||
          msg.includes('net::ERR_') ||
          msg.includes('Network error');

        if (isTransient && Date.now() < deadline) {
          console.log(`[Stripe] tokenProvider transient error, retrying (${msg})…`);
          await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL));
          continue;
        }

        if (!terminalDiag.tokenReceived.error) terminalDiag.markTokenFailed(msg || 'Unknown tokenProvider error');
        console.warn('[Stripe] tokenProvider failed:', msg || err);
        throw err;
      }
    }
  }, []);

  const screenStack = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    />
  );

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="light" />
            <StripeTerminalProvider logLevel="verbose" tokenProvider={tokenProvider}>
              <>
                {sessionReady && <TerminalInitializer />}
                <AuthGate>{screenStack}</AuthGate>
              </>
            </StripeTerminalProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
});
