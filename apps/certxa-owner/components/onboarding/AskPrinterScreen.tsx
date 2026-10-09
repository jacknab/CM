/**
 * AskPrinterScreen — "would you like to set up your receipt printer now?" Shown once, right after
 * the role pick (POS, Customer Screen or Kiosk), before handing off to the walkthrough + IP entry.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingShell, Light } from '@/components/onboarding/OnboardingShell';

interface Props {
  onYes: () => void;
  onNo: () => void;
}

export function AskPrinterScreen({ onYes, onNo }: Props) {
  return (
    <OnboardingShell>
      <View style={S.iconWrap}>
        <Ionicons name="print-outline" size={56} color={Light.accent} />
      </View>
      <Text style={S.title}>Set up your receipt printer?</Text>
      <Text style={S.subtitle}>
        If you have an Ethernet-connected receipt printer ready to go, we can set it up now — it only takes a minute.
      </Text>
      <TouchableOpacity style={S.primaryBtn} onPress={onYes} testID="printer-setup-yes">
        <Text style={S.primaryBtnTxt}>Yes, set it up now</Text>
      </TouchableOpacity>
      <TouchableOpacity style={S.secondaryBtn} onPress={onNo} testID="printer-setup-no">
        <Text style={S.secondaryBtnTxt}>Not right now</Text>
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
  subtitle: { color: Light.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 380, marginBottom: 32 },
  primaryBtn: { backgroundColor: Light.accent, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 32, width: '100%', maxWidth: 380, alignItems: 'center' },
  primaryBtnTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { marginTop: 14, paddingVertical: 10 },
  secondaryBtnTxt: { color: Light.textSecondary, fontSize: 14, fontWeight: '600' },
});
