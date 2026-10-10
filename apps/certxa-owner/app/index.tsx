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
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Colors } from '@/constants/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCaller, notifySessionReady, isSessionReady } from '@/lib/terminalBridge';
import { deviceQualifiesForSetup, getStoredDeviceRole, setStoredDeviceRole, type DeviceRole } from '@/lib/deviceRole';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { WifiSetupScreen } from '@/components/onboarding/WifiSetupScreen';
import { wifiSetupSupported } from '@/lib/wifi';
import { useIdleSleep } from '@/lib/idleSleep';
import { useNightlyRestart, isDefaultHomeApp, openDeviceSettings, isKioskManaged, exitKioskToSettings, followSensorOrientation, prepareCardReader } from '@/lib/appRestart';
import { KioskExitPinModal } from '@/components/KioskExitPinModal';
import { POSModal, type POSData } from '@/components/POSModal';
import { viewportLockJs } from '@/lib/viewportLock';
import { getSavedPrinter, printReceipt, printReceiptCopies, openCashDrawer, printCheckinTicket, printZReport, type ReceiptData, type CheckinTicketData, type ZReportPrintData } from '@/lib/printer';
import { QrCapture } from '@/components/QrCapture';
import { NumberBarCapture } from '@/components/NumberBarCapture';
import { PrinterSetupModal } from '@/components/PrinterSetupModal';
import { M2PaymentOverlay, type M2PayData, type M2CompleteExtra } from '@/components/M2PaymentOverlay';
import { ReaderStatusModal } from '@/components/ReaderStatusModal';
import { TapToPaySetupModal } from '@/components/TapToPaySetupModal';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';

const PORTAL_URL = process.env.EXPO_PUBLIC_PORTAL_URL ?? 'https://certxa.com/app-login';
const PORTAL_ORIGIN = (() => { try { return new URL(PORTAL_URL).origin; } catch { return 'https://certxa.com'; } })();
/** Customer NFC payments require an authenticated Stripe Terminal session. The
 * frontdesk role signs in once, then redirects to its device-local frontdesk setup. */
const ROLE_URL: Record<DeviceRole, string> = {
  pos: PORTAL_URL,
  frontdesk: `${PORTAL_ORIGIN}/app-login?redirect=%2Ffrontdesk`,
  kiosk: `${PORTAL_ORIGIN}/kiosk`,
};
const TABLET_WIDTH = 768;

// ── POS / Kiosk by orientation ────────────────────────────────────────────────
// A tablet set up as "POS / Kiosk" shows the POS in landscape and the self check-in kiosk in
// portrait — but the kiosk only if the account is permitted (locations.kiosk_permitted, set by a
// platform admin). That permission is NEVER stored on the tablet: it is asked for at every launch,
// every time the tablet is turned to portrait, and once a day while the kiosk is showing. When the
// server cannot be reached the tablet stays exactly as it is.
// What IS remembered is only which salon this tablet belongs to (its slug — an identifier, not a
// permission), so a kiosk tablet nobody is signed in on can still ask about the right account.
type Surface = 'pos' | 'kiosk';
const KIOSK_SLUG_KEY = 'certxa_kiosk_slug';
const KIOSK_RECHECK_MS = 24 * 60 * 60 * 1000;
const KIOSK_PATH_RE = /\/kiosk\/([a-z0-9-]+)/i;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

// ── Bridge JS injected into every page load ────────────────────────────────────
const BRIDGE_JS = `
(function() {
  if (window.__certxaBridgeInstalled) return;
  window.__certxaBridgeInstalled = true;
  window.CERTXA_NATIVE_APP = true;
  // This build can print receipts on the thermal printer (PRINT_RECEIPT) — the web checkout checks this flag.
  window.CERTXA_PRINT_BRIDGE = true;
  // ...and can pop the cash drawer through the printer (OPEN_DRAWER).
  window.CERTXA_DRAWER_BRIDGE = true;

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

  // ── Idle-sleep activity ping ──────────────────────────────────────────────
  // A native View's onTouchStart does not reliably fire for touches that begin inside this
  // WebView (Android's WebView consumes them for its own scroll/zoom handling), so activity
  // inside the page has to be reported explicitly. Throttled — the native side only needs to
  // know "still active", not every tap.
  (function() {
    var _lastPing = 0;
    function _ping() {
      var now = Date.now();
      if (now - _lastPing < 5000) return;
      _lastPing = now;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CERTXA_ACTIVITY' }));
    }
    document.addEventListener('touchstart', _ping, { capture: true, passive: true });
    document.addEventListener('pointerdown', _ping, { capture: true, passive: true });
  })();

})();
true;
`;

// Tablet: force desktop viewport width so the full portal renders correctly

// ─── Component ────────────────────────────────────────────────────────────────

export default function PortalScreen() {
  const insets              = useSafeAreaInsets();
  const { width, height }   = useWindowDimensions();
  const isTablet            = width >= TABLET_WIDTH;

  // ── Device role (POS / Customer Facing Screen / Kiosk) ──────────────────────
  // Asked once on first launch of every fresh install (deviceQualifiesForSetup always says yes).
  // Once picked, it's remembered forever (see lib/deviceRole.ts);
  // `deviceRole` staying `null` after `roleResolved` flips true is what triggers the picker below.
  const [deviceRole, setDeviceRole] = useState<DeviceRole | null>(null);
  const [roleResolved, setRoleResolved] = useState(false);

  // POS / Kiosk tablets: which of the two is showing. Always starts as the POS; the kiosk is only
  // ever entered after the server has said, just now, that the account is permitted.
  const [surface, setSurface] = useState<Surface>('pos');
  const [kioskSlug, setKioskSlug] = useState<string | null>(null);
  const kioskSlugRef = useRef<string | null>(null);
  const lastKioskCheckRef = useRef(0);
  // Bumped when the signed-in session becomes usable, so a portrait tablet asks again then.
  const [sessionTick, setSessionTick] = useState(0);
  const followsOrientation = deviceRole === 'pos' || deviceRole === 'kiosk';
  const isPortrait = height > width;
  // A tablet set up as "Kiosk" before orientation decided this has its salon stored only inside
  // the web page. Show the kiosk page once so the slug can be read from its address; the page
  // itself refuses to run for an account that is not permitted.
  const [legacyKioskBootstrap, setLegacyKioskBootstrap] = useState(false);
  useEffect(() => {
    (async () => {
      const stored = await getStoredDeviceRole();
      if (stored) { setDeviceRole(stored); setRoleResolved(true); return; }
      if (!deviceQualifiesForSetup(width, height)) setDeviceRole('pos'); // silently default — no picker for phones/small tablets
      setRoleResolved(true);
    })();
    // Deliberately once-only: re-running this on a `width`/`height` change (e.g. a rotation) must
    // not re-trigger the picker for a device that already resolved a role this session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the completed setup before replacing the wizard. This avoids a race where the app is
  // backgrounded or terminated during the AsyncStorage write and then unexpectedly shows setup
  // again on the next launch.
  const completeDeviceSetup = useCallback(async (role: DeviceRole) => {
    await setStoredDeviceRole(role);
    setDeviceRole(role);
  }, []);

  const rememberKioskSlug = useCallback((slug: string) => {
    const s = slug.toLowerCase();
    if (kioskSlugRef.current === s) return;
    kioskSlugRef.current = s;
    void AsyncStorage.setItem(KIOSK_SLUG_KEY, s).catch(() => {});
  }, []);
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
  // A failed load (no network at launch — e.g. the 3 AM restart during an outage) used to sit on the error
  // screen until someone tapped Retry. Try again by itself every 20 seconds, so the tablet is back on the POS
  // by opening time without anyone touching it.
  useEffect(() => {
    if (!navError) return;
    const timer = setInterval(() => { webViewRef.current?.reload(); }, 20_000);
    return () => clearInterval(timer);
  }, [navError]);
  // Wi-Fi screen opened from the "Could not load portal" overlay (router or password changed).
  const [wifiVisible, setWifiVisible]     = useState(false);
  const [posVisible, setPosVisible]       = useState(false);
  const [posData, setPosData]             = useState<POSData | null>(null);
  const [readerStatusVisible, setReaderStatusVisible] = useState(false);
  const [tapSetupVisible, setTapSetupVisible] = useState(false);
  const [m2PayVisible, setM2PayVisible]   = useState(false);
  const terminalBusyRef = useRef(false);
  const [printerSetupVisible, setPrinterSetupVisible] = useState(false);
  // Manager PIN step before a kiosk-locked tablet lets staff out.
  const [kioskPinVisible, setKioskPinVisible] = useState(false);
  const [printerStoreName, setPrinterStoreName]       = useState('Receipt');
  const completedSetupHereRef = useRef(false);
  // Existing customer-facing installations skipped the one-time printer wizard.
  // Prompt for a local printer on their next launch; a saved printer never prompts again.
  useEffect(() => {
    if ((deviceRole !== 'frontdesk' && deviceRole !== 'kiosk') || completedSetupHereRef.current) return;
    let active = true;
    getSavedPrinter().then((printer) => {
      if (active && !printer) setPrinterSetupVisible(true);
    });
    return () => { active = false; };
  }, [deviceRole]);
  // Card details from the reader, by PaymentIntent id, so a receipt printed later can show the card block.
  const cardDetailsByPi = useRef<Map<string, unknown>>(new Map());
  const [m2PayData, setM2PayData]         = useState<M2PayData | null>(null);

  // QR-code and number-bar-to-base64 capture, for check-in ticket printing (this printer library
  // has no native QR command or inverted/white-on-black text — see lib/printer.ts) — QrCapture /
  // NumberBarCapture render off-screen just long enough to export whatever's queued here, then
  // resolve the promise below and clear themselves.
  const [pendingQr, setPendingQr] = useState<{ value: string; resolve: (b64: string) => void; reject: (e: unknown) => void } | null>(null);
  const captureQrBase64 = useCallback(
    (value: string): Promise<string> => new Promise((resolve, reject) => setPendingQr({ value, resolve, reject })),
    [],
  );
  const [pendingNumberBar, setPendingNumberBar] = useState<{ value: number; resolve: (b64: string) => void; reject: (e: unknown) => void } | null>(null);
  const captureNumberBarBase64 = useCallback(
    (value: number): Promise<string> => new Promise((resolve, reject) => setPendingNumberBar({ value, resolve, reject })),
    [],
  );

  // Read connected-reader state from the Terminal SDK — used only for the
  // floating status badge; all discovery/payment logic stays in POSModal.
  const { connectedReader } = useStripeTerminal();

  // ── Battery-saving idle sleep ──────────────────────────────────────────────
  // These POS tablets are deliberately kept from ever really sleeping (below) — most tablets
  // have no reliable hardware tap-to-wake, and a real OS sleep would risk a PIN-lock screen
  // mid-shift. Instead the app dims itself after IDLE_SLEEP_MS idle; see lib/idleSleep.ts.
  const { asleep, recordActivity: recordIdleActivity, wake } = useIdleSleep();
  // When the screen was last touched — the nightly restart waits for a quiet screen.
  const lastActivityRef = useRef(Date.now());
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    recordIdleActivity();
  }, [recordIdleActivity]);
  const savedBrightness = useRef<number | null>(null);
  useEffect(() => {
    activateKeepAwakeAsync().catch(() => {});
    return () => { deactivateKeepAwake(); };
  }, []);
  // Waking used to put back a brightness NUMBER read just before dimming. On Android that number is the
  // tablet's brightness slider, which on a tablet using automatic brightness is often far lower than what
  // the screen was really showing — so after the first sleep the app stayed dim for good, while anything
  // in its own window (the exit PIN, a dialog) was bright, because the dimming applies to this window only.
  // Waking now hands the window back to the tablet's own brightness instead of pinning it to a number.
  const asleepNow = useRef(false);
  const restoreBrightness = useCallback(async () => {
    try {
      if (Platform.OS === 'android') await Brightness.restoreSystemBrightnessAsync();
      else if (savedBrightness.current !== null) await Brightness.setBrightnessAsync(savedBrightness.current);
    } catch {}
    savedBrightness.current = null;
  }, []);
  useEffect(() => {
    asleepNow.current = asleep;
    if (!asleep) { void restoreBrightness(); return; }
    (async () => {
      try {
        // Read the current level BEFORE dimming (not concurrently) so a slow read can never
        // race the write and capture 0 as the "original" brightness to restore later.
        const current = await Brightness.getBrightnessAsync();
        // Woken by a tap while that read was in flight: don't dim a screen someone is using.
        if (!asleepNow.current) return;
        savedBrightness.current = current;
        await Brightness.setBrightnessAsync(0);
        // ...or woken while the dim was being applied: undo it.
        if (!asleepNow.current) await restoreBrightness();
      } catch {}
    })();
  }, [asleep, restoreBrightness]);

  // Card reader: at every launch, have Bluetooth + Location on (kiosk-managed tablets only).
  useEffect(() => { prepareCardReader(); }, []);

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
  // /frontdesk is public: only its verified /api/auth/user response may mark
  // the Stripe session ready, never the URL alone.
  const LOGIN_PATHS = ['/app-login', '/login', '/register'];
  const onNavigationStateChange = useCallback((navState: { url?: string; loading?: boolean }) => {
    if (navState.loading) return;                        // ignore mid-navigation events
    const url = navState.url ?? '';
    const isAuthPage = !url || LOGIN_PATHS.some(p => url.includes(p));
    // The kiosk page's address names the salon — remember which salon this tablet belongs to.
    const kioskMatch = KIOSK_PATH_RE.exec(url);
    if (kioskMatch) {
      const hadSlug = !!kioskSlugRef.current;
      rememberKioskSlug(kioskMatch[1]);
      if (!hadSlug) setSessionTick((t) => t + 1);   // now the permission can be asked about
    }
    if (deviceRole !== 'frontdesk' && !isAuthPage) {
      const wasReady = isSessionReady();
      notifySessionReady();
      if (!wasReady) setSessionTick((t) => t + 1);   // signed in: a portrait tablet can now ask
    }
  }, [deviceRole, rememberKioskSlug]);

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

  /**
   * Ask the server, now, whether this tablet's account may use the kiosk. Returns null when that
   * cannot be established (no internet, no answer, nobody signed in and no salon known) — and the
   * caller then changes nothing.
   */
  const verifyKiosk = useCallback(async (): Promise<{ permitted: boolean; slug: string } | null> => {
    // 1. The account signed in on this tablet (through the page's own session).
    try {
      const r: any = await withTimeout(callAPI('/api/kiosk-permission', 'GET'), 6000);
      if (r && typeof r.permitted === 'boolean' && typeof r.slug === 'string' && r.slug) {
        rememberKioskSlug(r.slug);
        return { permitted: r.permitted, slug: r.slug.toLowerCase() };
      }
    } catch { /* not signed in, page not loaded yet, or offline — try the salon this tablet is known to belong to */ }

    // 2. Nobody signed in: ask about the salon this tablet belongs to.
    let slug = kioskSlugRef.current;
    if (!slug) {
      try { slug = await AsyncStorage.getItem(KIOSK_SLUG_KEY); } catch { slug = null; }
      if (slug) kioskSlugRef.current = slug;
    }
    if (!slug) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${PORTAL_ORIGIN}/api/public/kiosk/${slug}/config`, { cache: 'no-store', signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const d: any = await res.json();
      if (typeof d?.kioskPermitted !== 'boolean') return null;
      return { permitted: d.kioskPermitted, slug };
    } catch { return null; }
  }, [callAPI, rememberKioskSlug]);

  // Orientation decides. Landscape → POS straight away. Portrait → kiosk, but only after the server
  // has confirmed the permission; if it cannot be confirmed, nothing changes.
  useEffect(() => {
    if (!followsOrientation) return;
    followSensorOrientation();
    if (!isPortrait) { setLegacyKioskBootstrap(false); setSurface('pos'); return; }
    let cancelled = false;
    (async () => {
      const verdict = await verifyKiosk();
      if (cancelled) return;
      if (!verdict) {
        // Unknown. A tablet from before this change that was set up as "Kiosk" and whose salon is
        // not known to the app yet: let the kiosk page load once so its address reveals the slug.
        if (deviceRole === 'kiosk' && !kioskSlugRef.current) setLegacyKioskBootstrap(true);
        return;
      }
      lastKioskCheckRef.current = Date.now();
      setLegacyKioskBootstrap(false);
      if (verdict.permitted) { setKioskSlug(verdict.slug); setSurface('kiosk'); }
      else setSurface('pos');
    })();
    return () => { cancelled = true; };
  }, [followsOrientation, isPortrait, sessionTick, deviceRole, verifyKiosk]);

  // While the kiosk is showing, ask again once a day. Not permitted any more → back to the POS.
  // No answer → stay as is and ask again at the next tick.
  useEffect(() => {
    if (!followsOrientation || surface !== 'kiosk') return;
    const timer = setInterval(async () => {
      if (Date.now() - lastKioskCheckRef.current < KIOSK_RECHECK_MS) return;
      const verdict = await verifyKiosk();
      if (!verdict) return;
      lastKioskCheckRef.current = Date.now();
      if (!verdict.permitted) setSurface('pos');
    }, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [followsOrientation, surface, verifyKiosk]);

  // ── Nightly self-restart (3 AM, only when nothing is in progress — see lib/appRestart.ts) ──
  const busyRef = useRef<() => boolean>(() => false);
  busyRef.current = () => terminalBusyRef.current || m2PayVisible || posVisible || printerSetupVisible
    || tapSetupVisible || !!pendingQr || !!pendingNumberBar;
  const isBusyNow = useCallback(() => busyRef.current(), []);
  const lastActivityAt = useCallback(() => lastActivityRef.current, []);
  useNightlyRestart(isBusyNow, lastActivityAt);

  // ── Handle messages from WebView ────────────────────────────────────────────
  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      switch (msg.type) {
        case 'CERTXA_ACTIVITY':
          recordActivity();
          break;
        case 'FRONTDESK_SESSION_READY':
          // SPA navigation from /app-login to /frontdesk doesn't trigger the
          // WebView URL callback. The page sends this only after /api/auth/user
          // confirmed the session cookie used by the native Stripe API proxy.
          notifySessionReady();
          break;
        case 'OPEN_POS': {
          const { appointmentId, clientName, serviceName, servicePrice, addons,
                  subtotal, tax, grandTotal, storeName, storeAddress, storeCityStateZip, storePhone } = msg;
          setPosData({
            appointmentId, clientName, serviceName, servicePrice,
            addons: addons ?? [], subtotal, tax, grandTotal,
            storeName, storeAddress, storeCityStateZip, storePhone,
          });
          setPosVisible(true);
          break;
        }
        case 'M2_PAY': {
          // Web Calendar POS sheet requests M2 payment via device reader.
          // Show the M2PaymentOverlay which handles discovery + payment.
          const { appointmentId, amountCents, clientName, tipCents, discountCents, priorTenderedCents, nailCheckout } = msg;
          setM2PayData({
            appointmentId: appointmentId ?? 0,
            amountCents,
            clientName: clientName ?? 'Walk-in',
            mode: 'm2',
            ctx: { tipCents, discountCents, priorTenderedCents, nailCheckout },
          });
          setM2PayVisible(true);
          break;
        }
        case 'TAP_TO_PAY': {
          // /frontdesk posts this only after the customer confirms the tip-inclusive
          // amount. Stripe Terminal's tapToPay reader runs on THIS Android device.
          const { appointmentId, amountCents, clientName, tipCents, discountCents, priorTenderedCents, nailCheckout } = msg;
          if (Platform.OS !== 'android' || !Number.isSafeInteger(amountCents) || amountCents < 50 || terminalBusyRef.current) {
            const detail = { message: Platform.OS !== 'android' ? 'Tap to Pay requires a supported Android device' : terminalBusyRef.current ? 'A card payment is already in progress' : 'Invalid card payment amount' };
            webViewRef.current?.injectJavaScript(
              `window.dispatchEvent(new CustomEvent('certxa_native_m2_error', { detail: ${JSON.stringify(detail)} })); true;`
            );
            break;
          }
          terminalBusyRef.current = true;
          setM2PayData({
            appointmentId: appointmentId ?? 0,
            amountCents,
            clientName: clientName ?? 'Walk-in',
            mode: 'tap',
            ctx: { tipCents, discountCents, priorTenderedCents, nailCheckout },
          });
          setM2PayVisible(true);
          break;
        }
        case 'PRINT_RECEIPT': {
          // Web checkout asks for a receipt on the USB / Bluetooth thermal printer. Always answer
          // with certxa_native_print_result so the sheet knows whether it really printed.
          // `copy` picks which physical copy this request means — 'salon' (auto-printed right
          // after a card charge, for the signature), 'customer' (the Print Receipt button, once
          // the salon copy already went out), or 'both' (cash: no signature needed, nothing to
          // hold back). Defaults to 'both' for any caller that doesn't specify it.
          const { requestId, receipt, paymentIntentId, copy } = msg;
          const reply = (ok: boolean, error?: string) => {
            const detail = { requestId: requestId ?? null, ok, error: error ?? null };
            webViewRef.current?.injectJavaScript(
              `window.dispatchEvent(new CustomEvent('certxa_native_print_result', { detail: ${JSON.stringify(detail)} })); true;`
            );
          };
          void (async () => {
            try {
              if (!receipt || !Array.isArray(receipt.items)) throw new Error('Nothing to print');
              const card = paymentIntentId ? cardDetailsByPi.current.get(String(paymentIntentId)) : undefined;
              const data: ReceiptData = { ...(receipt as ReceiptData), cardDetails: (card as any) ?? (receipt as any).cardDetails };
              if (copy === 'salon') await printReceipt(data, 'salon');
              else if (copy === 'customer') await printReceipt(data, 'customer');
              else await printReceiptCopies(data);
              reply(true);
            } catch (e: any) {
              reply(false, e?.message ?? 'Could not print the receipt');
            }
          })();
          break;
        }
        case 'PRINT_ZREPORT': {
          // Web Day Close screen asks for the full Z Report on the USB / Bluetooth / IP thermal
          // printer. The web side already fetched and computed every number from the backend
          // (computeZReport) — this just lays it out for the printer and sends it. Same
          // requestId/certxa_native_print_result reply contract as PRINT_RECEIPT above.
          const { requestId, report } = msg;
          const reply = (ok: boolean, error?: string) => {
            const detail = { requestId: requestId ?? null, ok, error: error ?? null };
            webViewRef.current?.injectJavaScript(
              `window.dispatchEvent(new CustomEvent('certxa_native_print_result', { detail: ${JSON.stringify(detail)} })); true;`
            );
          };
          void (async () => {
            try {
              if (!report) throw new Error('Nothing to print');
              await printZReport(report as ZReportPrintData);
              reply(true);
            } catch (e: any) {
              reply(false, e?.message ?? 'Could not print the Z Report');
            }
          })();
          break;
        }
        case 'PRINT_CHECKIN_TICKET': {
          // Web check-in flow (kiosk or staff) asks for the check-in ticket: the black
          // number-bar image (today's check-in count), then a QR image (rendered client-side,
          // see QrCapture/NumberBarCapture), then the name/ticket-number and date/time text.
          // `qrValue` is the raw code the QR encodes: "CI:{checkinToken}" for a walk-in with no
          // ticket yet, or "BK:{appointmentId}" when check-in matched an existing booking.
          const { requestId, ticket, qrValue, todayCount } = msg;
          const reply = (ok: boolean, error?: string) => {
            const detail = { requestId: requestId ?? null, ok, error: error ?? null };
            webViewRef.current?.injectJavaScript(
              `window.dispatchEvent(new CustomEvent('certxa_native_print_result', { detail: ${JSON.stringify(detail)} })); true;`
            );
          };
          void (async () => {
            try {
              if (!ticket || !qrValue) throw new Error('Nothing to print');
              console.log('[Printer] Check-in ticket requested', { requestId, ticketNumber: ticket.ticketNumber, todayCount });
              const numberBarBase64 = await captureNumberBarBase64(Number(todayCount) || 0);
              const qrBase64 = await captureQrBase64(String(qrValue));
              await printCheckinTicket(ticket as CheckinTicketData, numberBarBase64, qrBase64);
              console.log('[Printer] Check-in ticket sent successfully', { requestId });
              reply(true);
            } catch (e: any) {
              console.error('[Printer] Check-in ticket failed', e?.message ?? e);
              reply(false, e?.message ?? 'Could not print the check-in ticket');
            }
          })();
          break;
        }
        case 'OPEN_DRAWER': {
          // Web checkout / cash drawer screen asks to pop the drawer. Always answer with the real result.
          const { requestId } = msg;
          const reply = (ok: boolean, error?: string) => {
            const detail = { requestId: requestId ?? null, ok, error: error ?? null };
            webViewRef.current?.injectJavaScript(
              `window.dispatchEvent(new CustomEvent('certxa_native_drawer_result', { detail: ${JSON.stringify(detail)} })); true;`
            );
          };
          void openCashDrawer().then(() => reply(true)).catch((e: any) => reply(false, e?.message ?? 'Could not open the cash drawer'));
          break;
        }
        case 'SETUP_PRINTER': {
          setPrinterStoreName(String(msg.storeName || 'Receipt'));
          setPrinterSetupVisible(true);
          break;
        }
        case 'SETUP_TAP_TO_PAY': {
          // Web POS "Set up Tap to Pay" — one-time enrollment (location + ToS +
          // device provisioning). Result relayed back via the modal callbacks.
          setTapSetupVisible(true);
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
          // Kiosk-locked tablet (Certxa is device owner): the manager PIN first — see KioskExitPinModal.
          if (isKioskManaged()) { setKioskPinVisible(true); break; }
          // When Certxa is this tablet's Home app, closing it just reopens it — Exit opens Android's
          // Settings instead, so staff can still get out (e.g. to change the Home app).
          const isHome = isDefaultHomeApp();
          Alert.alert(
            'Exit Certxa',
            'Do you wish to exit the app?',
            [
              { text: 'Stay', style: 'cancel' },
              { text: 'Exit', style: 'destructive', onPress: () => (isHome ? openDeviceSettings() : BackHandler.exitApp()) },
            ],
          );
          break;
        }
        default:
          break;
      }
    } catch {}
  }, [recordActivity]);

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
  const onM2Complete = useCallback((appointmentId: number, method: string, amountDollars: number, extra?: M2CompleteExtra) => {
    terminalBusyRef.current = false;
    setM2PayVisible(false);
    setM2PayData(null);
    // Dispatch payment_complete: the Checkout sheet adds it as a tender (and dedupes on
    // paymentIntentId), WalkInCheckoutPanel applies the tender (appointmentId === 0 path).
    if (extra?.paymentIntentId && extra.cardDetails) {
      const m = cardDetailsByPi.current;
      m.set(extra.paymentIntentId, extra.cardDetails);
      if (m.size > 20) m.delete(m.keys().next().value as string);
    }
    const detail = {
      appointmentId,
      method,
      amount: amountDollars,
      paymentIntentId: extra?.paymentIntentId ?? null,
      last4: extra?.last4 ?? null,
      // Full card details (brand, entry method, approval code) — previously only cached locally
      // for this device's own receipt printing; now also handed to the web app so it can save
      // them server-side and show the same "purchase details" from any device later.
      cardDetails: extra?.cardDetails ?? null,
    };
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent('certxa_native_payment_complete', { detail: ${JSON.stringify(detail)} })); true;`
    );
  }, []);

  const onM2Error = useCallback((message: string) => {
    terminalBusyRef.current = false;
    setM2PayVisible(false);
    setM2PayData(null);
    // Reset the M2 button in the web POS sheet
    const safe = message.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent('certxa_native_m2_error', { detail: { message: '${safe}' } })); true;`
    );
  }, []);

  const onM2Cancel = useCallback(() => {
    terminalBusyRef.current = false;
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

  // Still reading the stored role from AsyncStorage — a blank frame for one tick rather than a
  // flash of the wrong screen (picker, then immediately the webview, or vice versa).
  if (!roleResolved) {
    return <View style={[styles.root, { backgroundColor: Colors.background }]} />;
  }
  // No stored role — walk through setup once, then never again. OnboardingFlow owns the role pick
  // and the optional printer setup (offered for every role).
  if (deviceRole === null) {
    return (
      <OnboardingFlow
        onComplete={(role) => { completedSetupHereRef.current = true; void completeDeviceSetup(role); }}
      />
    );
  }

  return (
    <View
      style={[styles.root, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}
      onTouchStart={recordActivity}
      onTouchMove={recordActivity}
    >
      {/* Kiosk mode: hide status bar entirely */}
      <StatusBar hidden />
      {/* WebView — always mounted, even when POS modal is showing */}
      <WebView
        ref={webViewRef}
        source={{ uri: deviceRole === 'frontdesk' ? ROLE_URL.frontdesk
          : surface === 'kiosk' && kioskSlug ? `${PORTAL_ORIGIN}/kiosk/${kioskSlug}`
          : legacyKioskBootstrap ? ROLE_URL.kiosk
          : ROLE_URL.pos }}
        style={styles.webview}
        injectedJavaScript={BRIDGE_JS}
        injectedJavaScriptBeforeContentLoaded={BRIDGE_JS + viewportLockJs(width)}
        onNavigationStateChange={onNavigationStateChange}
        onLoadStart={() => { setLoading(true); setNavError(null); }}
        onLoad={() => {
          setLoading(false);
          // Re-assert the zoom/drift lock after every page load (all screen sizes).
          webViewRef.current?.injectJavaScript(viewportLockJs(width));
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
        bounces={false}
        scalesPageToFit={false}
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        textZoom={100}
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
          {wifiSetupSupported() && (
            <TouchableOpacity style={styles.wifiBtn} onPress={() => setWifiVisible(true)} testID="portal-error-wifi">
              <Ionicons name="wifi-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.wifiBtnText}>Wi-Fi</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Change Wi-Fi without leaving the app (opened from the overlay above); reloads the portal on close. */}
      {wifiVisible && (
        <View style={StyleSheet.absoluteFill}>
          <WifiSetupScreen
            mode="change"
            onDone={() => { setWifiVisible(false); setNavError(null); webViewRef.current?.reload(); }}
          />
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

      {/* Off-screen QR / number-bar renderers for check-in ticket printing — see
          captureQrBase64 / captureNumberBarBase64 above */}
      {pendingQr && (
        <QrCapture
          value={pendingQr.value}
          onCapture={(b64) => { pendingQr.resolve(b64); setPendingQr(null); }}
          onError={(e) => { pendingQr.reject(e); setPendingQr(null); }}
        />
      )}
      {pendingNumberBar && (
        <NumberBarCapture
          value={pendingNumberBar.value}
          onCapture={(b64) => { pendingNumberBar.resolve(b64); setPendingNumberBar(null); }}
          onError={(e) => { pendingNumberBar.reject(e); setPendingNumberBar(null); }}
        />
      )}

      {/* Manager PIN → leave the kiosk lock for 10 minutes and open Android Settings */}
      <KioskExitPinModal
        visible={kioskPinVisible}
        onCancel={() => setKioskPinVisible(false)}
        onUnlock={() => { setKioskPinVisible(false); exitKioskToSettings(10); }}
      />

      {/* Receipt printer setup — opened by SETUP_PRINTER from the web checkout */}
      <PrinterSetupModal
        visible={printerSetupVisible}
        storeName={printerStoreName}
        onClose={() => setPrinterSetupVisible(false)}
      />

      {/* Reader Status Modal */}
      <ReaderStatusModal
        visible={readerStatusVisible}
        onClose={() => setReaderStatusVisible(false)}
      />

      {/* Tap to Pay one-time setup — triggered by SETUP_TAP_TO_PAY from web POS */}
      <TapToPaySetupModal
        visible={tapSetupVisible}
        onComplete={() => {
          webViewRef.current?.injectJavaScript(
            `window.dispatchEvent(new CustomEvent('certxa_native_taptopay_ready')); true;`
          );
        }}
        onError={(message) => {
          const safe = message.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
          webViewRef.current?.injectJavaScript(
            `window.dispatchEvent(new CustomEvent('certxa_native_taptopay_error', { detail: { message: '${safe}' } })); true;`
          );
        }}
        onClose={() => setTapSetupVisible(false)}
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

      {/* Idle-sleep overlay — battery saving. Topmost so it covers every other overlay too;
          any touch wakes it (see useIdleSleep). Opaque regardless of the brightness dim, so a
          wake tap never also lands on whatever button happened to be underneath. */}
      {asleep && (
        <View style={styles.sleepOverlay} onTouchStart={wake} />
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: Colors.background },
  devTrigger:     { position: 'absolute', top: 0, left: 0, width: 44, height: 44 },
  sleepOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 999, elevation: 999 },
  webview:        { flex: 1, backgroundColor: Colors.background },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  errorOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorTitle:     { fontSize: 20, fontWeight: '700', color: Colors.text },
  errorMsg:       { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn:       { marginTop: 8, backgroundColor: Colors.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryText:      { color: '#fff', fontSize: 15, fontWeight: '600' },
  wifiBtn:        { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10 },
  wifiBtnText:    { color: Colors.textSecondary, fontSize: 15, fontWeight: '600' },

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
