import React, { useCallback, useRef } from 'react';
import { SafeAreaView, StyleSheet, StatusBar, Alert } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { StripeTerminalProvider } from '@stripe/stripe-terminal-react-native';

import { useTapToPayBridge } from './src/useTapToPayBridge';
import { fetchConnectionToken } from './src/connectionToken';

const SITE_URL = 'https://certxa.com/auth';

function AuthWebView() {
  const webviewRef = useRef<WebView>(null);

  // Sends a message back into the page's JS context.
  const sendToWeb = useCallback((payload: object) => {
    const js = `
      (function() {
        window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(
          JSON.stringify(payload)
        )} }));
      })();
      true;
    `;
    webviewRef.current?.injectJavaScript(js);
  }, []);

  const { handleWebMessage } = useTapToPayBridge(sendToWeb);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        handleWebMessage(data);
      } catch (err) {
        console.warn('Malformed message from WebView', err);
      }
    },
    [handleWebMessage]
  );

  return (
    <WebView
      ref={webviewRef}
      source={{ uri: SITE_URL }}
      onMessage={onMessage}
      originWhitelist={['https://certxa.com']}
      startInLoadingState
      sharedCookiesEnabled // exposes cookies set in the WebView to the native CookieManager
      thirdPartyCookiesEnabled
      onError={(e) =>
        Alert.alert('Failed to load', e.nativeEvent.description ?? 'Unknown error')
      }
    />
  );
}

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <StripeTerminalProvider
        tokenProvider={fetchConnectionToken}
        logLevel="verbose"
      >
        <AuthWebView />
      </StripeTerminalProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
});
