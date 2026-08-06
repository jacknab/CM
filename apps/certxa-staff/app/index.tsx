/**
 * index.tsx — Certxa Staff Portal
 *
 * Full-screen WebView that loads the Certxa staff portal at /staff-auth.
 * On tablet (width ≥ 768): injects a 1280px desktop viewport.
 * On phone: uses the default responsive viewport.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, ActivityIndicator, StyleSheet, useWindowDimensions,
  Platform, Text, TouchableOpacity,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { QRScannerModal } from '@/components/QRScannerModal';

const PORTAL_URL = process.env.EXPO_PUBLIC_PORTAL_URL ?? 'https://certxa.com/staff-auth';
const TABLET_WIDTH = 768;

// ── Bridge JS: flag the WebView as running inside the native app ───────────────
const BRIDGE_JS = `
(function() {
  if (window.__certxaBridgeInstalled) return;
  window.__certxaBridgeInstalled = true;
  window.CERTXA_NATIVE_APP = true;
  window.CERTXA_STAFF_APP = true;
})();
true;
`;

// Tablet: force desktop viewport so the full portal renders correctly
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

export default function StaffPortalScreen() {
  const insets    = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet  = width >= TABLET_WIDTH;
  const webViewRef = useRef<WebView>(null);

  const [loading,     setLoading]     = useState(true);
  const [navError,    setNavError]    = useState<string | null>(null);
  const [qrScanning,  setQrScanning]  = useState(false);

  // ── Handle messages from WebView ────────────────────────────────────────────
  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'SCAN_QR') {
        setQrScanning(true);
      } else if (msg.type === 'SCAN_QR_CANCEL') {
        setQrScanning(false);
      }
    } catch {}
  }, []);

  const injectedJS = isTablet ? BRIDGE_JS + '\n' + TABLET_VIEWPORT_JS : BRIDGE_JS;

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
      <WebView
        ref={webViewRef}
        source={{ uri: PORTAL_URL }}
        style={styles.webview}
        injectedJavaScript={injectedJS}
        injectedJavaScriptBeforeContentLoaded={BRIDGE_JS}
        onLoadStart={() => { setLoading(true); setNavError(null); }}
        onLoad={() => {
          setLoading(false);
          if (isTablet) {
            webViewRef.current?.injectJavaScript(TABLET_VIEWPORT_JS);
          }
        }}
        onError={e => {
          setLoading(false);
          setNavError(e.nativeEvent.description || 'Failed to load staff portal');
        }}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        allowsBackForwardNavigationGestures={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mixedContentMode="compatibility"
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
        onMessage={onMessage}
      />

      {/* Native QR Scanner */}
      <QRScannerModal
        visible={qrScanning}
        webViewRef={webViewRef}
        onClose={() => setQrScanning(false)}
      />

      {/* Network error overlay */}
      {navError && (
        <View style={styles.errorOverlay}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.errorTitle}>Could not load staff portal</Text>
          <Text style={styles.errorMsg}>{navError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => webViewRef.current?.reload()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: Colors.background },
  webview:        { flex: 1, backgroundColor: Colors.background },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  errorOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorTitle:     { fontSize: 20, fontWeight: '700', color: Colors.text },
  errorMsg:       { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn:       { marginTop: 8, backgroundColor: Colors.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryText:      { color: '#fff', fontSize: 15, fontWeight: '600' },
});
