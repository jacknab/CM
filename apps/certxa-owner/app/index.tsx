/**
 * index.tsx — Certxa Owner Portal
 *
 * Full-screen WebView that loads the Certxa web portal.
 * On tablet (width ≥ 768): injects a 1280px desktop viewport so the owner
 * sees the same layout as a desktop browser.
 * On phone: uses the default responsive viewport.
 *
 * WebView ↔ Native bridge:
 *  • Injected JS sets window.CERTXA_NATIVE_APP = true so Calendar.tsx
 *    posts OPEN_POS instead of showing the React sheet.
 *  • window.__certxaRPC(id, endpoint, method, body) proxies authenticated
 *    API calls back through the WebView's session cookie and posts
 *    RPC_RESPONSE to native.
 *  • window.__certxaFinalizeAppointment(id, method, amount) marks the
 *    appointment complete and dispatches a custom DOM event.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, ActivityIndicator, StyleSheet, useWindowDimensions,
  Platform, Text, TouchableOpacity, BackHandler, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as NavigationBar from 'expo-navigation-bar';
import { Colors } from '@/constants/colors';
import { apiCaller, notifySessionReady } from '@/lib/terminalBridge';
import { POSModal, type POSData } from '@/components/POSModal';
import { M2PaymentOverlay, type M2PayData } from '@/components/M2PaymentOverlay';
import { ReaderStatusModal } from '@/components/ReaderStatusModal';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';

const PORTAL_URL = process.env.EXPO_PUBLIC_PORTAL_URL ?? 'https://certxa.com/app-login';
const TABLET_WIDTH = 768;

// ── Bridge JS injected into every page load ────────────────────────────────────
const BRIDGE_JS = `
(function() {
  if (window.__certxaBridgeInstalled) return;
  window.__certxaBridgeInstalled = true;
  window.CERTXA_NATIVE_APP = true;

  // Generic RPC: native calls endpoint via WebView session cookie.
  // Always resolves with the JSON body (even for non-2xx responses) so that
  // callers can read the server-side error message (e.g. "Store has no
  // connected Stripe account") instead of getting a generic rejection.
  // Only rejects on a true network failure (fetch threw / non-JSON body).
  window.__certxaRPC = async function(requestId, endpoint, method, body) {
    try {
      const res = await fetch(endpoint, {
        method: method || 'GET',
        credentials: 'include',
        headers: body !== null ? { 'Content-Type': 'application/json' } : {},
        body: body !== null ? JSON.stringify(body) : undefined,
      });
      var data;
      try { data = await res.json(); } catch(_) { data = null; }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'RPC_RESPONSE', requestId, data: data, ok: res.ok,
        status: res.status,
      }));
    } catch(e) {
      // True network failure (no response) — reject so callers can retry.
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'RPC_RESPONSE', requestId, data: null, ok: false,
        status: 0, networkError: e.message,
      }));
    }
  };

  // Called by native after payment to mark appointment done + refresh UI.
  // For Terminal (M2 / Tap) payments the server already recorded the payment
  // during capture — this PATCH is a belt-and-suspenders update that also
  // handles CASH and manual CARD payments.
  window.__certxaFinalizeAppointment = async function(appointmentId, paymentMethod, amountPaid) {
    try {
      var res = await fetch('/api/appointments/' + appointmentId, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', paymentMethod, totalPaid: amountPaid }),
      });
      if (!res.ok) {
        console.error('[certxa] finalize PATCH failed', res.status, appointmentId, paymentMethod, amountPaid);
      }
    } catch(e) {
      console.error('[certxa] finalize network error', e, { appointmentId, paymentMethod, amountPaid });
    }
    window.dispatchEvent(new CustomEvent('certxa_native_payment_complete', {
      detail: { appointmentId, paymentMethod, amountPaid },
    }));
  };

  // ── Kiosk exit: hold anywhere on screen for 3 s ───────────────────────────
  (function() {
    var _exitTimer = null;
    function _clearExit() { clearTimeout(_exitTimer); _exitTimer = null; }
    document.addEventListener('touchstart', function() {
      _clearExit();
      _exitTimer = setTimeout(function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'KIOSK_LONG_PRESS' }));
      }, 3000);
    }, { passive: true });
    document.addEventListener('touchend',    _clearExit, { passive: true });
    document.addEventListener('touchmove',   _clearExit, { passive: true });
    document.addEventListener('touchcancel', _clearExit, { passive: true });
  })();

})();
true;
`;

// Tablet: force desktop viewport width so the full portal renders correctly
const TABLET_VIEWPORT_JS = `
(function() {
  var meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    meta.setAttribute('content', 'width=1280, initial-scale=1');
  } else {
    var m = document.createElement('meta');
    m.name = 'viewport';
    m.content = 'width=1280, initial-scale=1';
    document.head.appendChild(m);
  }
})();
true;
`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function PortalScreen() {
  const insets              = useSafeAreaInsets();
  const { width }           = useWindowDimensions();
  const isTablet            = width >= TABLET_WIDTH;
  const webViewRef          = useRef<React.ElementRef<typeof WebView>>(null);
  const rpcMap              = useRef<Map<string, { resolve: (d: any) => void; reject: (e: Error) => void }>>(new Map());
  const router              = useRouter();

  // Hidden dev trigger: tap top-left corner 7× within 3 s → Stripe Diagnostics
  const devTapCount  = useRef(0);
  const devTapTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDevTap = useCallback(() => {
    devTapCount.current += 1;
    if (devTapTimer.current) clearTimeout(devTapTimer.current);
    if (devTapCount.current >= 7) {
      devTapCount.current = 0;
      router.push('/stripe-diagnostics');
      return;
    }
    devTapTimer.current = setTimeout(() => { devTapCount.current = 0; }, 3000);
  }, [router]);

  const [loading, setLoading]             = useState(true);
  const [navError, setNavError]           = useState<string | null>(null);
  const [posVisible, setPosVisible]       = useState(false);
  const [posData, setPosData]             = useState<POSData | null>(null);
  const [readerStatusVisible, setReaderStatusVisible] = useState(false);
  const [m2PayVisible, setM2PayVisible]   = useState(false);
  const [m2PayData, setM2PayData]         = useState<M2PayData | null>(null);

  // Read connected-reader state from the Terminal SDK — used only for the
  // floating status badge; all discovery/payment logic stays in POSModal.
  const { connectedReader } = useStripeTerminal();

  // ── Kiosk mode: hide Android nav bar + status bar, re-hide on swipe ──────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const enterKiosk = async () => {
      try {
        await NavigationBar.setVisibilityAsync('hidden');
        await NavigationBar.setBehaviorAsync('overlay-swipe');
      } catch {}
    };
    enterKiosk();

    // If the user swipes the bar back, hide it again automatically
    const sub = NavigationBar.addVisibilityListener(({ visibility }) => {
      if (visibility === 'visible') {
        NavigationBar.setVisibilityAsync('hidden').catch(() => {});
      }
    });

    return () => sub?.remove?.();
  }, []);

  // ── Detect login and unblock the Stripe Terminal tokenProvider ─────────────
  //
  // StripeTerminalProvider calls tokenProvider at SDK initialization time.
  // On a cold start the user hasn't logged in yet, so without this gate the
  // connection-token fetch would fail ("No store found") and permanently leave
  // the SDK uninitialized.
  //
  // We detect auth state from the URL: any page other than the login/register
  // screens means the session cookie exists.  notifySessionReady() is
  // idempotent — safe to call on every non-auth navigation.
  const LOGIN_PATHS = ['/app-login', '/login', '/register'];
  const onNavigationStateChange = useCallback((navState: { url?: string; loading?: boolean }) => {
    if (navState.loading) return;                        // ignore mid-navigation events
    const url = navState.url ?? '';
    const isAuthPage = !url || LOGIN_PATHS.some(p => url.includes(p));
    if (!isAuthPage) {
      notifySessionReady();
    }
  }, []);

  // ── Register the apiCaller for Stripe Terminal token fetching ───────────────
  const callAPI = useCallback((endpoint: string, method: string, body?: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const requestId = `rpc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      rpcMap.current.set(requestId, { resolve, reject });
      const js = `window.__certxaRPC(${JSON.stringify(requestId)}, ${JSON.stringify(endpoint)}, ${JSON.stringify(method)}, ${JSON.stringify(body ?? null)}); true;`;
      webViewRef.current?.injectJavaScript(js);
      setTimeout(() => {
        if (rpcMap.current.has(requestId)) {
          rpcMap.current.delete(requestId);
          reject(new Error(`API timeout: ${endpoint}`));
        }
      }, 30_000);
    });
  }, []);

  useEffect(() => {
    apiCaller.call = callAPI;
  }, [callAPI]);

  // ── Handle messages from WebView ────────────────────────────────────────────
  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      switch (msg.type) {
        case 'OPEN_POS': {
          const { appointmentId, clientName, serviceName, servicePrice, addons,
                  subtotal, tax, grandTotal, storeName, storeAddress, storePhone } = msg;
          setPosData({
            appointmentId, clientName, serviceName, servicePrice,
            addons: addons ?? [], subtotal, tax, grandTotal,
            storeName, storeAddress, storePhone,
          });
          setPosVisible(true);
          break;
        }
        case 'M2_PAY': {
          // Web Calendar POS sheet requests M2 payment via device reader.
          // Show the M2PaymentOverlay which handles discovery + payment.
          const { appointmentId, amountCents, clientName } = msg;
          setM2PayData({
            appointmentId: appointmentId ?? 0,
            amountCents,
            clientName: clientName ?? 'Walk-in',
          });
          setM2PayVisible(true);
          break;
        }
        case 'RPC_RESPONSE': {
          const pending = rpcMap.current.get(msg.requestId);
          if (pending) {
            rpcMap.current.delete(msg.requestId);
            if (msg.networkError) {
              // True network failure (fetch threw — e.g. no connection).
              // Reject so tokenProvider can detect it as transient and retry.
              pending.reject(new Error(msg.networkError ?? 'Network error'));
            } else {
              // HTTP response received (even non-2xx). Always resolve so callers
              // can read the JSON body and surface the real server error message
              // (e.g. "Store has no connected Stripe account") instead of a
              // generic "API error" that loses the root cause.
              pending.resolve(msg.data);
            }
          }
          break;
        }
        case 'KIOSK_LONG_PRESS': {
          Alert.alert(
            'Exit Certxa',
            'Do you wish to exit the app?',
            [
              { text: 'Stay', style: 'cancel' },
              { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
            ],
          );
          break;
        }
        default:
          break;
      }
    } catch {}
  }, []);

  // ── After POS payment, dispatch the CustomEvent the web app listens for ────
  // Calendar.tsx listens for 'certxa_native_payment_complete' and calls
  // updateAppointment({ status:"completed", paymentMethod, totalPaid }).
  const onPaymentComplete = useCallback((appointmentId: number, method: string, amount: number) => {
    setPosVisible(false);
    setPosData(null);
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent('certxa_native_payment_complete', {
        detail: { appointmentId: ${appointmentId}, method: ${JSON.stringify(method)}, amount: ${amount} }
      })); true;`
    );
  }, []);

  // ── M2 bridge callbacks (M2PaymentOverlay → web) ──────────────────────────
  const onM2Complete = useCallback((appointmentId: number, method: string, amountDollars: number) => {
    setM2PayVisible(false);
    setM2PayData(null);
    // Dispatch payment_complete so Calendar.tsx can mark the appointment done
    // and WalkInCheckoutPanel can apply the tender (appointmentId === 0 path).
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent('certxa_native_payment_complete', {
        detail: { appointmentId: ${appointmentId}, method: ${JSON.stringify(method)}, amount: ${amountDollars} }
      })); true;`
    );
  }, []);

  const onM2Error = useCallback((message: string) => {
    setM2PayVisible(false);
    setM2PayData(null);
    // Reset the M2 button in the web POS sheet
    const safe = message.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent('certxa_native_m2_error', { detail: { message: '${safe}' } })); true;`
    );
  }, []);

  const onM2Cancel = useCallback(() => {
    setM2PayVisible(false);
    setM2PayData(null);
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent('certxa_native_m2_error', { detail: { message: 'Cancelled' } })); true;`
    );
  }, []);

  /** Navigate the WebView to the calendar page and dismiss the POS modal */
  const onNavigateToCalendar = useCallback(() => {
    setPosVisible(false);
    setPosData(null);
    webViewRef.current?.injectJavaScript(
      `window.location.href = 'https://certxa.com/calendar'; true;`
    );
  }, []);

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
      {/* Kiosk mode: hide status bar entirely */}
      <StatusBar hidden />
      {/* WebView — always mounted, even when POS modal is showing */}
      <WebView
        ref={webViewRef}
        source={{ uri: PORTAL_URL }}
        style={styles.webview}
        injectedJavaScript={BRIDGE_JS}
        injectedJavaScriptBeforeContentLoaded={BRIDGE_JS}
        onNavigationStateChange={onNavigationStateChange}
        onLoadStart={() => { setLoading(true); setNavError(null); }}
        onLoad={() => {
          setLoading(false);
          if (isTablet) {
            webViewRef.current?.injectJavaScript(TABLET_VIEWPORT_JS);
          }
        }}
        onError={(e) => {
          setLoading(false);
          setNavError(e.nativeEvent.description || 'Failed to load portal');
        }}
        onMessage={onMessage}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        allowsBackForwardNavigationGestures={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mixedContentMode="compatibility"
        cacheEnabled={false}
        overScrollMode="never"
        androidLayerType="hardware"
        userAgent={isTablet
          ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          : undefined
        }
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        )}
        startInLoadingState={true}
      />

      {/* Network error overlay */}
      {navError && (
        <View style={styles.errorOverlay}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.errorTitle}>Could not load portal</Text>
          <Text style={styles.errorMsg}>{navError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => webViewRef.current?.reload()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Native POS Modal */}
      <POSModal
        visible={posVisible}
        data={posData}
        onClose={() => { setPosVisible(false); setPosData(null); }}
        onPaymentComplete={onPaymentComplete}
        onNavigateToCalendar={onNavigateToCalendar}
      />

      {/* M2 Payment Overlay — triggered by M2_PAY from web Calendar POS sheet */}
      <M2PaymentOverlay
        visible={m2PayVisible}
        data={m2PayData}
        onComplete={onM2Complete}
        onError={onM2Error}
        onCancel={onM2Cancel}
      />

      {/* Reader Status Modal */}
      <ReaderStatusModal
        visible={readerStatusVisible}
        onClose={() => setReaderStatusVisible(false)}
      />

      {/* ── Floating M2 reader badge ──────────────────────────────────────────
          Visible whenever a reader is connected. Sits in the bottom-right
          corner, above the WebView content but below any modal overlay.
          Tapping it opens the full ReaderStatusModal.
          Uses pointerEvents="box-none" on the container so touches fall
          through to the WebView everywhere except the badge itself.       */}
      {!!connectedReader && !posVisible && (
        <View style={styles.badgeWrap} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.readerBadge}
            onPress={() => setReaderStatusVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.readerDot} />
            <Ionicons name="bluetooth" size={13} color="#fff" />
            {/* Show battery % if the SDK provides it */}
            {typeof (connectedReader as any).batteryLevel === 'number' && (
              <Text style={styles.readerBadgeTxt}>
                {Math.round((connectedReader as any).batteryLevel * 100)}%
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Hidden dev trigger — tap this corner 7× within 3 s to open Stripe Diagnostics */}
      <TouchableOpacity
        style={styles.devTrigger}
        onPress={handleDevTap}
        activeOpacity={1}
      />

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: Colors.background },
  devTrigger:     { position: 'absolute', top: 0, left: 0, width: 44, height: 44 },
  webview:        { flex: 1, backgroundColor: Colors.background },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  errorOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorTitle:     { fontSize: 20, fontWeight: '700', color: Colors.text },
  errorMsg:       { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn:       { marginTop: 8, backgroundColor: Colors.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryText:      { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Reader badge — bottom-right floating pill
  badgeWrap:    {
    position: 'absolute', bottom: 20, right: 16,
    alignItems: 'flex-end',
  },
  readerBadge:  {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#16A34A',                  // green when connected
    paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#000', shadowOpacity: 0.35,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  readerDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff', opacity: 0.85 },
  readerBadgeTxt: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
});
