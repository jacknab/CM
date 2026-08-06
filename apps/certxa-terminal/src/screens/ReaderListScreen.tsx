import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useStripeTerminal, type Reader } from '@stripe/stripe-terminal-react-native';
import { fetchTerminalLocation } from '../lib/api';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ReaderList'>;
type Route = RouteProp<RootStackParamList, 'ReaderList'>;

export default function ReaderListScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { amountCents } = params;

  const [connecting, setConnecting] = useState<string | null>(null); // reader serial number

  const {
    discoverReaders,
    cancelDiscovering,
    connectReader,
    discoveredReaders,
    connectionStatus,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (_readers) => {
      // discoveredReaders state updates automatically
    },
  });

  useEffect(() => {
    discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: false });
    return () => {
      cancelDiscovering().catch(() => {});
    };
  }, [discoverReaders, cancelDiscovering]);

  const handleSelectReader = useCallback(
    async (reader: Reader.Type) => {
      setConnecting(reader.serialNumber ?? 'unknown');
      try {
        const locationId = await fetchTerminalLocation();
        const { error } = await connectReader({
          reader,
          discoveryMethod: 'bluetoothScan',
          locationId,
        });
        if (error) {
          // Stay on screen so user can retry
          return;
        }
        navigation.replace('Payment', { amountCents, method: 'bluetooth' });
      } catch {
        // Network / server error fetching location — stay on screen for retry
      } finally {
        setConnecting(null);
      }
    },
    [connectReader, navigation, amountCents]
  );

  const renderReader = ({ item }: { item: Reader.Type }) => {
    const isConnecting = connecting === item.serialNumber;
    const signalBars = item.batteryLevel
      ? Math.round(item.batteryLevel * 3)
      : 0;

    return (
      <TouchableOpacity
        style={styles.readerRow}
        onPress={() => handleSelectReader(item)}
        disabled={connecting !== null}
        activeOpacity={0.7}
      >
        <View style={styles.readerIcon}>
          <Ionicons name="card-outline" size={24} color="#fff" />
        </View>
        <View style={styles.readerInfo}>
          <Text style={styles.readerName}>
            {item.label ?? item.serialNumber ?? 'Unknown reader'}
          </Text>
          <Text style={styles.readerSerial}>
            {item.serialNumber ?? ''}
            {item.batteryLevel != null
              ? `  ·  Battery ${Math.round(item.batteryLevel * 100)}%`
              : ''}
          </Text>
        </View>
        {isConnecting ? (
          <ActivityIndicator size="small" color="#7C3AED" />
        ) : (
          <Ionicons name="chevron-forward" size={18} color="#444" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Ionicons name="chevron-down" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Reader</Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Scanning indicator — hidden while connecting so it doesn't conflict */}
      {!connecting && (
        <View style={styles.scanRow}>
          <ActivityIndicator size="small" color="#7C3AED" />
          <Text style={styles.scanText}>Scanning for M2 readers…</Text>
        </View>
      )}

      {discoveredReaders.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bluetooth" size={48} color="#333" />
          <Text style={styles.emptyTitle}>No readers found</Text>
          <Text style={styles.emptySubtitle}>
            Make sure your M2 reader is powered on and within range.
            Bluetooth and Location must be enabled.
          </Text>
        </View>
      ) : (
        <FlatList
          data={discoveredReaders}
          keyExtractor={(item, index) => item.serialNumber ?? item.label ?? String(index)}
          renderItem={renderReader}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  scanText: { color: '#888', fontSize: 14 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#666',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  readerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 14,
  },
  readerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readerInfo: { flex: 1 },
  readerName: { color: '#fff', fontSize: 16, fontWeight: '500' },
  readerSerial: { color: '#666', fontSize: 13, marginTop: 2 },
  separator: { height: 1, backgroundColor: '#1A1A1A' },
});
