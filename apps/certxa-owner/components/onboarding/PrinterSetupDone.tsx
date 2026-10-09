/**
 * PrinterSetupDone — confirms the printer was saved, with an optional test print before
 * finishing onboarding. Onboarding happens before login, so there's no real store name yet —
 * "Certxa" is just a placeholder for this one test slip; every receipt printed from the POS
 * afterward uses the actual store name.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingShell, Light } from '@/components/onboarding/OnboardingShell';
import { printTestPage, savePrinter, type PrinterDevice } from '@/lib/printer';

interface Props {
  ip: string;
  onContinue: () => void;
}

export function PrinterSetupDone({ ip, onContinue }: Props) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [finishing, setFinishing] = useState(false);

  // Not saved anywhere yet — see PrinterIpEntry's submit(). This exists only so the test print
  // below can reach the printer before the user has confirmed setup by tapping Continue.
  const device: PrinterDevice = { type: 'net', address: ip, port: 9100, name: `Network Printer (${ip})` };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await printTestPage('Certxa', device);
      setTestResult('ok');
    } catch {
      setTestResult('fail');
    } finally {
      setTesting(false);
    }
  };

  // The one place this whole printer flow actually persists anything — reached only by tapping
  // Continue, so backing out or killing the app any time before this leaves nothing saved.
  const finish = async () => {
    setFinishing(true);
    try {
      await savePrinter(device);
    } catch {
      // Saving failed (e.g. storage error) — still let them continue rather than trap them on
      // this screen; the printer just won't be remembered and Settings → Printer will show none set.
    } finally {
      setFinishing(false);
      onContinue();
    }
  };

  return (
    <OnboardingShell>
      <View style={S.iconWrap}>
        <Ionicons name="checkmark-circle" size={56} color={Light.success} />
      </View>
      <Text style={S.title}>Printer at {ip}</Text>
      <Text style={S.subtitle}>Test it below, then tap Continue to finish setup and save it.</Text>

      <TouchableOpacity style={S.testBtn} onPress={runTest} disabled={testing} testID="printer-setup-test">
        {testing ? <ActivityIndicator size="small" color={Light.accent} /> : <Ionicons name="print-outline" size={18} color={Light.accent} />}
        <Text style={S.testBtnTxt}>{testing ? 'Printing…' : 'Print a test page'}</Text>
      </TouchableOpacity>
      {testResult === 'ok' && <Text style={S.testOk}>Test page sent — check the printer.</Text>}
      {testResult === 'fail' && <Text style={S.testFail}>Couldn't reach the printer — check the cables and try again from Settings later.</Text>}

      <TouchableOpacity style={S.primaryBtn} onPress={finish} disabled={finishing} testID="printer-setup-continue">
        <Text style={S.primaryBtnTxt}>{finishing ? 'Saving…' : 'Continue'}</Text>
      </TouchableOpacity>
    </OnboardingShell>
  );
}

const S = StyleSheet.create({
  iconWrap: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: '#F0F4FB',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  title: { color: Light.text, fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  subtitle: { color: Light.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 380, marginBottom: 8 },
  testBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: Light.cardBorder },
  testBtnTxt: { color: Light.accent, fontSize: 14, fontWeight: '700' },
  testOk: { color: Light.success, fontSize: 13, marginTop: 10 },
  testFail: { color: Light.error, fontSize: 13, marginTop: 10, textAlign: 'center', maxWidth: 320 },
  primaryBtn: { backgroundColor: Light.accent, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 32, width: '100%', maxWidth: 380, alignItems: 'center', marginTop: 32 },
  primaryBtnTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
