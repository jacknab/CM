import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'POS'>;

type Method = 'tapToPay' | 'bluetooth';

const MAX_DIGITS = 8; // max $999,999.99

export default function POSScreen() {
  const navigation = useNavigation<Nav>();
  const { clearAuth } = useAuth();

  // Digits represent cents: "500" → $5.00
  const [digits, setDigits] = useState('');
  const [method, setMethod] = useState<Method>('tapToPay');

  const amountCents = parseInt(digits || '0', 10);
  const dollars = Math.floor(amountCents / 100);
  const cents = amountCents % 100;
  const displayAmount = `$${dollars.toLocaleString()}.${String(cents).padStart(2, '0')}`;

  const pressDigit = (d: string) => {
    setDigits(prev => {
      const next = prev + d;
      if (next.length > MAX_DIGITS) return prev;
      return next;
    });
  };

  const pressDoubleZero = () => {
    setDigits(prev => {
      if (prev === '') return prev;
      const next = prev + '00';
      if (next.length > MAX_DIGITS) return prev;
      return next;
    });
  };

  const pressBackspace = () => {
    setDigits(prev => prev.slice(0, -1));
  };

  const handleCharge = () => {
    if (amountCents < 50) {
      Alert.alert('Amount too low', 'Minimum charge is $0.50.');
      return;
    }

    if (method === 'tapToPay') {
      navigation.navigate('Payment', { amountCents, method: 'tapToPay' });
    } else {
      // Bluetooth: first discover readers, then navigate to payment
      navigation.navigate('ReaderList', { amountCents });
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Sign out of Certxa Terminal?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: clearAuth,
      },
    ]);
  };

  const Key = ({
    label,
    onPress,
    children,
  }: {
    label?: string;
    onPress: () => void;
    children?: React.ReactNode;
  }) => (
    <TouchableOpacity style={styles.key} onPress={onPress} activeOpacity={0.6}>
      {children ?? <Text style={styles.keyLabel}>{label}</Text>}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Certxa Terminal</Text>
        <TouchableOpacity onPress={handleSignOut} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
          <Ionicons name="log-out-outline" size={22} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Amount display */}
      <View style={styles.amountContainer}>
        <Text style={styles.amountText} numberOfLines={1} adjustsFontSizeToFit>
          {displayAmount}
        </Text>
        {digits.length === 0 && (
          <Text style={styles.amountHint}>Enter amount</Text>
        )}
      </View>

      {/* Method selector */}
      <View style={styles.methodRow}>
        <TouchableOpacity
          style={[styles.methodBtn, method === 'tapToPay' && styles.methodBtnActive]}
          onPress={() => setMethod('tapToPay')}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="contactless-payment"
            size={20}
            color={method === 'tapToPay' ? '#fff' : '#666'}
          />
          <Text style={[styles.methodLabel, method === 'tapToPay' && styles.methodLabelActive]}>
            Tap to Pay
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.methodBtn, method === 'bluetooth' && styles.methodBtnActive]}
          onPress={() => setMethod('bluetooth')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="bluetooth"
            size={20}
            color={method === 'bluetooth' ? '#fff' : '#666'}
          />
          <Text style={[styles.methodLabel, method === 'bluetooth' && styles.methodLabelActive]}>
            M2 Reader
          </Text>
        </TouchableOpacity>
      </View>

      {/* Numpad */}
      <View style={styles.numpad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <Key key={d} label={d} onPress={() => pressDigit(d)} />
        ))}
        <Key label="00" onPress={pressDoubleZero} />
        <Key label="0" onPress={() => pressDigit('0')} />
        <Key onPress={pressBackspace}>
          <Ionicons name="backspace-outline" size={26} color="#fff" />
        </Key>
      </View>

      {/* Charge button */}
      <TouchableOpacity
        style={[styles.chargeBtn, amountCents < 50 && styles.chargeBtnDisabled]}
        onPress={handleCharge}
        activeOpacity={0.8}
      >
        <Text style={styles.chargeBtnText}>
          Charge {amountCents >= 50 ? displayAmount : ''}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const PURPLE = '#7C3AED';
const BG = '#0A0A0A';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  amountContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  amountText: {
    color: '#fff',
    fontSize: 64,
    fontWeight: '300',
    letterSpacing: -2,
  },
  amountHint: {
    color: '#444',
    fontSize: 16,
    marginTop: 4,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  methodBtnActive: {
    backgroundColor: '#2D1B69',
    borderColor: PURPLE,
  },
  methodLabel: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  methodLabelActive: {
    color: '#fff',
  },
  numpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  key: {
    width: '30%',
    aspectRatio: 1.6,
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    // Make the three keys fill the row by using calculated flex
    flexGrow: 1,
  },
  keyLabel: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '400',
  },
  chargeBtn: {
    backgroundColor: PURPLE,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 4,
  },
  chargeBtnDisabled: {
    backgroundColor: '#2A2A2A',
  },
  chargeBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
