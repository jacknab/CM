import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeTerminalProvider, useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { apiCaller, subscribeToSessionReady } from '@/lib/terminalBridge';
import { terminalDiag } from '@/lib/terminalDiag';
import { Colors } from '@/constants/colors';

// Keep native splash (plain black) visible until React is ready
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// ── TerminalInitializer ────────────────────────────────────────────────────────
//
// Must be rendered inside <StripeTerminalProvider> so it can call initialize()
// from the hook.  We mount this component only after the WebView session is
// confirmed ready, which guarantees tokenProvider is called with a live
// authenticated session on the very first call — no waiting, no timeout risk.
//
// Root cause this fixes: the SDK's StripeTerminalProvider registers a
// FETCH_TOKEN_PROVIDER listener but does NOT auto-call initialize().  Every
// reader action (discoverReaders, connectReader, etc.) throws
// "First initialize the Stripe Terminal SDK before performing any action"
// until initialize() has been explicitly called and resolved.
//
// Retry logic: when sessionReady flips, the Provider swap unmounts and
// remounts the portal screen, so its WebView reloads.  initialize() fires
// while the WebView is still loading, tokenProvider times out, and the SDK
// reports "Couldn't fetch connection token."  We retry up to MAX_ATTEMPTS
// times on transient failures (timeout / bridge not ready) with a short delay
// so the WebView has time to finish loading.
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
          // Prefer the root-cause error captured directly from tokenProvider
          // (stored by the tokenProvider below) over the SDK's generic wrapper
          // "Couldn't fetch connection token. Please check your tokenProvider method."
          const tokenErr  = terminalDiag.tokenReceived.error;
          const sdkMsg    = res.error.message ?? String(res.error);
          const realMsg   = tokenErr || sdkMsg;

          console.error(`[Stripe] initialize() failed (attempt ${attempt}):`, realMsg);

          // Retry if the error looks transient (WebView still loading / bridge not ready)
          const isTransient =
            realMsg.includes('Couldn\'t fetch') ||
            realMsg.includes('bridge not ready') ||
            realMsg.includes('timeout') ||
            realMsg.includes('network') ||
            realMsg.includes('fetch connection token');

          if (isTransient && attempt < INIT_MAX_ATTEMPTS) {
            console.log(`[Stripe] Transient failure — retrying in ${INIT_RETRY_DELAY_MS}ms…`);
            await new Promise<void>(r => setTimeout(r, INIT_RETRY_DELAY_MS));
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

        const isTransient =
          msg.includes('bridge not ready') ||
          msg.includes('timeout') ||
          msg.includes('network');

        if (isTransient && attempt < INIT_MAX_ATTEMPTS) {
          await new Promise<void>(r => setTimeout(r, INIT_RETRY_DELAY_MS));
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

export default function RootLayout() {
  const [splashVisible, setSplashVisible] = useState(true);

  // We delay mounting StripeTerminalProvider (and therefore calling
  // initialize()) until the WebView session is confirmed ready.
  //
  // Why: initialize() causes the native SDK to immediately request a
  // connection token via tokenProvider.  If initialize() is called before
  // the user has logged in, tokenProvider hits the API with no session and
  // the connection-token endpoint returns an error, permanently leaving the
  // native SDK uninitialized for the lifetime of the process.
  //
  // Once sessionReady flips true it never resets — the provider stays
  // mounted and refreshes tokens automatically via the FETCH_TOKEN_PROVIDER
  // listener registered by StripeTerminalProvider.
  const [sessionReady, setSessionReady] = useState(false);

  const isFirstTokenCall = useRef(true);

  useEffect(() => {
    SplashScreen.hideAsync();
    const timer = setTimeout(() => setSplashVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Subscribe to the session-ready signal fired by index.tsx once the WebView
  // navigates past the login page.
  useEffect(() => {
    const unsubscribe = subscribeToSessionReady(() => {
      console.log('[Stripe] Session ready — mounting StripeTerminalProvider and calling initialize()');
      terminalDiag.markProviderMounted();
      isFirstTokenCall.current = true;
      setSessionReady(true);
    });
    return unsubscribe;
  }, []);

  // tokenProvider is called by the native SDK (via FETCH_TOKEN_PROVIDER) each
  // time it needs a connection token — once on init, then periodically.
  // By the time this is first called, sessionReady is guaranteed true, so
  // there is no need to await waitForSessionReady().
  const tokenProvider = useCallback(async (): Promise<string> => {
    // Total time to keep retrying transient failures (bridge not ready / WebView
    // still loading its page after the Provider-swap remount).
    const TIMEOUT_MS    = 25_000;
    const POLL_INTERVAL = 500;
    const deadline      = Date.now() + TIMEOUT_MS;

    const calledForInit = isFirstTokenCall.current;
    console.log(
      calledForInit
        ? '[Stripe] tokenProvider called (SDK initializing…)'
        : '[Stripe] tokenProvider called (token refresh)',
    );
    terminalDiag.markTokenRequested();

    while (true) {
      try {
        const result = await apiCaller.call('/api/payments/terminal/connection-token', 'POST');
        if (!result?.secret) {
          // The API returned an application-level error (e.g. "Store has no
          // connected Stripe account").  Store the real reason so
          // TerminalInitializer can surface it instead of Stripe's generic
          // "Couldn't fetch connection token" wrapper.
          const reason = result?.error ?? 'Failed to get connection token';
          terminalDiag.markTokenFailed(reason);
          throw new Error(reason);
        }
        console.log('[Stripe] Connection token received');
        terminalDiag.markTokenReceived();
        if (calledForInit) {
          isFirstTokenCall.current = false;
        }
        return result.secret as string;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err ?? '');

        // Retry on transient failures:
        //  • "Terminal bridge not ready" — apiCaller stub hasn't been replaced yet
        //  • "API timeout"              — WebView is still loading after the
        //                                 Provider-swap remount (index.tsx
        //                                 unmounts/remounts, WebView reloads)
        //  • network errors             — brief connectivity blip; bridge now
        //                                 rejects with the fetch error string
        const isTransient =
          msg.includes('Terminal bridge not ready') ||
          msg.includes('API timeout') ||
          msg.includes('Network request failed') ||
          msg.includes('Failed to fetch') ||
          msg.includes('net::ERR_') ||
          msg.includes('Network error');

        if (isTransient && Date.now() < deadline) {
          console.log(`[Stripe] tokenProvider transient error, retrying (${msg})…`);
          await new Promise<void>(r => setTimeout(r, POLL_INTERVAL));
          continue;
        }

        // Non-transient error — already stored in terminalDiag above if it's
        // an API-level failure; store here for unexpected throws.
        if (!terminalDiag.tokenReceived.error) {
          terminalDiag.markTokenFailed(msg || 'Unknown tokenProvider error');
        }
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
            <StatusBar hidden />
            {sessionReady ? (
              <StripeTerminalProvider logLevel="verbose" tokenProvider={tokenProvider}>
                {/* Calls initialize() once on mount — required for the native SDK */}
                <TerminalInitializer />
                {screenStack}
              </StripeTerminalProvider>
            ) : (
              screenStack
            )}
          </QueryClientProvider>
        </SafeAreaProvider>

        {/* Full-screen custom splash overlay */}
        {splashVisible && (
          <View style={styles.splash}>
            <Image
              source={require('../assets/splash-logo.png')}
              style={styles.splashImage}
              resizeMode="contain"
            />
          </View>
        )}
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashImage: {
    width: '85%',
    height: '85%',
  },
});
