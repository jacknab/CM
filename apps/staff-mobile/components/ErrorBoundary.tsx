import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { reloadAppAsync } from 'expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';

function ErrorFallback() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>The app encountered an unexpected error.</Text>
      <Pressable style={styles.button} onPress={() => reloadAppAsync()}>
        <Text style={styles.buttonText}>Restart App</Text>
      </Pressable>
    </View>
  );
}

type State = { hasError: boolean };

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return <ErrorFallback />;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: colors.radius,
  },
  buttonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 15,
  },
});
