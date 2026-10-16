/**
 * KioskExitPinModal — the manager PIN step before a kiosk-locked tablet lets staff out.
 * Opened by the existing 3-second hold (KIOSK_LONG_PRESS) on tablets where Certxa is device owner.
 * Uses the same manager PIN as the Nail POS manager sheet (booking Calendar.tsx DEFAULT_MANAGER_PIN).
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

const MANAGER_PIN = '2026';
const KEYS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', 'back']];

interface Props {
  visible: boolean;
  onCancel: () => void;
  onUnlock: () => void;
}

export function KioskExitPinModal({ visible, onCancel, onUnlock }: Props) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => { if (visible) { setDigits(''); setError(false); } }, [visible]);

  useEffect(() => {
    if (digits.length !== 4) return;
    if (digits === MANAGER_PIN) { setDigits(''); onUnlock(); return; }
    setError(true);
    setDigits('');
  }, [digits, onUnlock]);

  const press = (k: string) => {
    if (k === 'back') { setDigits((d) => d.slice(0, -1)); return; }
    if (!k) return;
    setError(false);
    setDigits((d) => (d.length < 4 ? d + k : d));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={S.backdrop}>
        <View style={S.card}>
          <Text style={S.title}>Manager PIN</Text>
          <Text style={[S.sub, error && S.error]}>{error ? 'Incorrect PIN' : 'Enter the manager PIN'}</Text>
          <View style={S.dots}>
            {[0, 1, 2, 3].map((i) => <View key={i} style={[S.dot, i < digits.length && S.dotOn]} />)}
          </View>
          {KEYS.map((row, r) => (
            <View key={r} style={S.row}>
              {row.map((k, c) => (
                <TouchableOpacity key={c} style={[S.key, !k && S.keyBlank]} disabled={!k} onPress={() => press(k)} activeOpacity={0.7}>
                  {k === 'back'
                    ? <Ionicons name="backspace-outline" size={26} color={Colors.text} />
                    : <Text style={S.keyText}>{k}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <TouchableOpacity style={S.cancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={S.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 320, borderRadius: 20, padding: 24, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  sub: { marginTop: 6, fontSize: 14, color: '#94A3B8' },
  error: { color: Colors.error },
  dots: { flexDirection: 'row', gap: 12, marginVertical: 20 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: Colors.borderLight },
  dotOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  key: { width: 72, height: 60, borderRadius: 14, backgroundColor: Colors.cardElevated, alignItems: 'center', justifyContent: 'center' },
  keyBlank: { backgroundColor: 'transparent' },
  keyText: { fontSize: 24, fontWeight: '600', color: '#FFFFFF' },
  cancel: { marginTop: 4, paddingVertical: 10, paddingHorizontal: 24 },
  cancelText: { fontSize: 15, color: '#94A3B8' },
});
