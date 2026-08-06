import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StripeTerminalProvider } from '@stripe/stripe-terminal-react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { fetchConnectionToken, setApiToken } from './src/lib/api';

/**
 * Inner component — has access to AuthContext so it can sync the API token
 * and pass the token provider into StripeTerminalProvider.
 */
function TerminalRoot() {
  const { token } = useAuth();

  // Keep the module-level API token in sync with context.
  useEffect(() => {
    setApiToken(token);
  }, [token]);

  return (
    <StripeTerminalProvider
      logLevel="verbose"
      fetchTokenProvider={fetchConnectionToken}
    >
      <AppNavigator />
    </StripeTerminalProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <TerminalRoot />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
