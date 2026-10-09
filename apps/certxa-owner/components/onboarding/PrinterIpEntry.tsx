/**
 * PrinterIpEntry — on-screen numeric keypad for typing a 4-octet IPv4 address, no OS keyboard.
 *
 * Four boxes (one per octet) with a "." between them. The bottom-right keypad key is a right
 * arrow that moves to the next box — it turns into "OK" once the 4th (last) box is active, since
 * there's nothing left to tab to.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingShell, Light } from '@/components/onboarding/OnboardingShell';
import { isValidIPv4 } from '@/lib/printer';

interface Props {
  /** Pre-fill if the printer already handed back an IP on its status printout. */
  initialIp?: string;
  onDone: (ip: string) => void;
  onBack: () => void;
  onSkip: () => void;
}

const KEYPAD_ROWS: (string | 'back' | 'next')[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['back', '0', 'next'],
];

export function PrinterIpEntry({ initialIp, onDone, onBack, onSkip }: Props) {
  const initial = (initialIp ?? '').split('.');
  const [octets, setOctets] = useState<[string, string, string, string]>([
    initial[0] ?? '', initial[1] ?? '', initial[2] ?? '', initial[3] ?? '',
  ]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const setOctet = (i: number, v: string) => {
    setOctets((cur) => { const next = [...cur] as typeof cur; next[i] = v; return next; });
  };

  const pressDigit = (d: string) => {
    setError(null);
    const current = octets[active];
    if (current.length >= 3) return;
    const candidate = current + d;
    if (Number(candidate) > 255) return; // would overflow a byte — ignore, don't let it be typed
    setOctet(active, candidate);
    if (candidate.length === 3 && active < 3) setActive(active + 1);
  };

  const pressBack = () => {
    setError(null);
    if (octets[active].length > 0) { setOctet(active, octets[active].slice(0, -1)); return; }
    if (active > 0) setActive(active - 1);
  };

  // Deliberately does NOT call savePrinter() here — nothing about this wizard should persist
  // until the user reaches PrinterSetupDone and taps Continue. The IP is only handed up through
  // onDone(); PrinterSetupDone test-prints against it directly (unsaved) and is the one place
  // that actually calls savePrinter(), exactly once, right when setup is confirmed.
  const submit = () => {
    const ip = octets.join('.');
    if (octets.some((o) => o === '') || !isValidIPv4(ip)) { setError('That doesn\'t look like a complete IP address — check all 4 boxes.'); return; }
    setError(null);
    onDone(ip);
  };

  const pressNext = () => {
    if (active < 3) { setActive(active + 1); return; }
    submit();
  };

  const isLastBox = active === 3;

  return (
    <OnboardingShell>
      <Text style={S.title}>Enter the printer's IP address</Text>
      <Text style={S.subtitle}>This is the number that printed on the slip from your printer.</Text>

      <View style={S.octetRow}>
        {octets.map((o, i) => (
          <React.Fragment key={i}>
            <TouchableOpacity
              style={[S.octetBox, active === i && S.octetBoxActive]}
              onPress={() => { setActive(i); setError(null); }}
              testID={`ip-octet-${i}`}
            >
              <Text style={S.octetText}>{o}</Text>
            </TouchableOpacity>
            {i < 3 && <Text style={S.dot}>.</Text>}
          </React.Fragment>
        ))}
      </View>

      {error && <Text style={S.error}>{error}</Text>}

      <View style={S.keypad}>
        {KEYPAD_ROWS.map((row, ri) => (
          <View key={ri} style={S.keypadRow}>
            {row.map((key) => {
              if (key === 'back') {
                return (
                  <TouchableOpacity key="back" style={S.key} onPress={pressBack} testID="ip-key-back">
                    <Ionicons name="backspace-outline" size={24} color={Light.text} />
                  </TouchableOpacity>
                );
              }
              if (key === 'next') {
                return (
                  <TouchableOpacity
                    key="next"
                    style={[S.key, S.keyNext, isLastBox && S.keyOk]}
                    onPress={pressNext}
                    testID="ip-key-next"
                  >
                    {isLastBox ? (
                      <Text style={S.keyOkTxt}>OK</Text>
                    ) : (
                      <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity key={key} style={S.key} onPress={() => pressDigit(key)} testID={`ip-key-${key}`}>
                  <Text style={S.keyTxt}>{key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <View style={S.bottomLinks}>
        <TouchableOpacity onPress={onBack}>
          <Text style={S.backTxt}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSkip}>
          <Text style={S.skipTxt}>Skip printer setup for now</Text>
        </TouchableOpacity>
      </View>
    </OnboardingShell>
  );
}

const KEY_SIZE = 64;

const S = StyleSheet.create({
  title: { color: Light.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: Light.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 24 },
  octetRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  octetBox: {
    width: 64, height: 52, borderRadius: 10, borderWidth: 2, borderColor: Light.cardBorder,
    backgroundColor: Light.bg, alignItems: 'center', justifyContent: 'center',
  },
  octetBoxActive: { borderColor: Light.accent },
  octetText: { color: Light.text, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dot: { color: Light.textSecondary, fontSize: 22, fontWeight: '700', marginHorizontal: 2 },
  error: { color: Light.error, fontSize: 13, marginTop: 12, textAlign: 'center' },
  keypad: { marginTop: 24, gap: 10 },
  keypadRow: { flexDirection: 'row', gap: 10 },
  key: {
    width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, backgroundColor: Light.bg,
    borderWidth: 1, borderColor: Light.cardBorder, alignItems: 'center', justifyContent: 'center',
  },
  keyTxt: { color: Light.text, fontSize: 24, fontWeight: '600' },
  keyNext: { backgroundColor: Light.accent, borderColor: Light.accent },
  keyOk: { backgroundColor: Light.success, borderColor: Light.success },
  keyOkTxt: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  bottomLinks: { flexDirection: 'row', gap: 28, marginTop: 22 },
  backTxt: { color: Light.textSecondary, fontSize: 13, fontWeight: '600' },
  skipTxt: { color: Light.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
});
