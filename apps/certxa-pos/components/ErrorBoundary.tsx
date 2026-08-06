import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';

type State = { hasError: boolean; message: string };

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.message}</Text>
          <Pressable style={styles.btn} onPress={this.reset}>
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  message: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 32 },
  btn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
