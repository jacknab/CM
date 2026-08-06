import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/constants/colors';

export default function EntryGuard() {
  const { user, isLoading, mode } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (mode === 'solo') return <Redirect href="/(solo)/" />;
  if (mode === 'owner-tablet') return <Redirect href="/(owner)/" />;
  return <Redirect href="/(owner-phone)/" />;
}
