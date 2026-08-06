import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';

type State = { hasError: boolean; error: Error | null };

function ErrorFallback({ error }: { error: Error | null }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{error?.message ?? 'An unexpected error occurred.'}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { DevSettings } = require('react-native');
            DevSettings.reload();
          } catch {}
        }}
      >
        <Text style={styles.buttonText}>Restart App</Text>
      </TouchableOpacity>
    </View>
  );
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  state: State = { hasError: false, error: null };
  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
  }
  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  icon:        { fontSize: 48, marginBottom: 16 },
  title:       { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  message:     { fontSize: 14, color: Colors.textSecondary, marginBottom: 32, textAlign: 'center', lineHeight: 20 },
  button:      { backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  buttonText:  { color: '#fff', fontSize: 16, fontWeight: '600' },
});
