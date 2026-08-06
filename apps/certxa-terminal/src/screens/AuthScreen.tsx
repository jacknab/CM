import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Text,
  TouchableOpacity,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL, APP_SETTINGS, ENDPOINTS } from '../config/env';

/**
 * Injected into the WebView on every page load.
 * Exposes _certxaFetchToken() so we can call it once we detect a successful login.
 */
const INJECTED_JS = `
(function() {
  window._certxaFetchToken = function() {
    fetch('${API_BASE_URL}${ENDPOINTS.mobileToken}', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.token && d.storeId) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'AUTH_OK', token: d.token, storeId: d.storeId })
        );
      } else {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'AUTH_ERR', error: d.error || 'No token returned' })
        );
      }
    })
    .catch(function(e) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'AUTH_ERR', error: e.message || 'Network error' })
      );
    });
  };
  true;
})();
`;

export default function AuthScreen() {
  const { setAuth } = useAuth();
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingToken, setFetchingToken] = useState(false);

  const handleNavigationStateChange = (nav: WebViewNavigation) => {
    const url = nav.url ?? '';
    // Detect successful login: user navigated away from the /auth path
    const isAuthPage =
      url.includes('/auth') ||
      url.includes('/login') ||
      url.includes('/register') ||
      url.includes('/forgot') ||
      url.endsWith('/') && !nav.loading;

    if (
      !isAuthPage &&
      nav.loading === false &&
      url.startsWith('http') &&
      !fetchingToken
    ) {
      setFetchingToken(true);
      webviewRef.current?.injectJavaScript('window._certxaFetchToken(); true;');
    }
  };

  const handleMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'AUTH_OK') {
        await setAuth(data.token, Number(data.storeId));
        // Navigation happens automatically via AppNavigator (token now set in context)
      } else if (data.type === 'AUTH_ERR') {
        setFetchingToken(false);
        Alert.alert(
          'Sign-in error',
          data.error ?? 'Could not retrieve auth token. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } catch {
      setFetchingToken(false);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ uri: APP_SETTINGS.authUrl }}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={handleMessage}
        injectedJavaScript={INJECTED_JS}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        style={styles.webview}
      />

      {/* Spinner overlay while page loads */}
      {loading && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      )}

      {/* Spinner overlay while fetching token after login */}
      {fetchingToken && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={styles.loaderText}>Signing in…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loaderText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
