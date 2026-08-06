import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { useAuth } from '../context/AuthContext';
import AuthScreen from '../screens/AuthScreen';
import POSScreen from '../screens/POSScreen';
import PaymentScreen from '../screens/PaymentScreen';
import ReaderListScreen from '../screens/ReaderListScreen';

export type RootStackParamList = {
  Auth: undefined;
  POS: undefined;
  Payment: {
    amountCents: number;
    method: 'tapToPay' | 'bluetooth';
  };
  ReaderList: {
    amountCents: number;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { token, isLoading } = useAuth();
  const { initialize } = useStripeTerminal();

  // SDK must be initialized from inside StripeTerminalProvider.
  // Do this once on mount regardless of auth state so it's ready when needed.
  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!token ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="POS" component={POSScreen} />
            <Stack.Screen
              name="Payment"
              component={PaymentScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="ReaderList"
              component={ReaderListScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
