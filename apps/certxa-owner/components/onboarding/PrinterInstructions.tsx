/**
 * PrinterInstructions — plain-language, one-idea-per-screen walkthrough for physically setting up
 * a network (Ethernet) receipt printer. Written for someone who isn't technical: no jargon, one
 * cable at a time.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingShell, Light } from '@/components/onboarding/OnboardingShell';

interface Props {
  onNext: () => void;
  onSkip: () => void;
}

const STEPS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'flash-outline',
    title: 'Power on the printer',
    body: 'Connect the power cable to the back of the printer, then plug the power cord into an outlet.',
  },
  {
    icon: 'git-network-outline',
    title: 'Connect to your internet router',
    body: 'Take an Ethernet cable and plug one end into your internet router.',
  },
  {
    icon: 'print-outline',
    title: 'Connect the printer',
    body: 'Plug the other end of that same Ethernet cable into the back of the printer.',
  },
  {
    icon: 'receipt-outline',
    title: 'Wait for the printout',
    body: 'After a few moments, the printer will print a small slip showing its IP address. Keep it handy — you\'ll enter it on the next screen.',
  },
];

export function PrinterInstructions({ onNext, onSkip }: Props) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;

  const next = () => { if (isLast) onNext(); else setI(i + 1); };
  const back = () => { if (i > 0) setI(i - 1); };

  return (
    <OnboardingShell>
      <View style={S.dots}>
        {STEPS.map((_, k) => (
          <View key={k} style={[S.dot, k === i && S.dotActive]} />
        ))}
      </View>

      <View style={S.iconWrap}>
        <Ionicons name={step.icon} size={56} color={Light.accent} />
      </View>
      <Text style={S.stepNum}>STEP {i + 1} OF {STEPS.length}</Text>
      <Text style={S.title}>{step.title}</Text>
      <Text style={S.body}>{step.body}</Text>

      <View style={S.actions}>
        <TouchableOpacity
          style={[S.navBtn, S.navBtnGhost, i === 0 && S.navBtnHidden]}
          onPress={back}
          disabled={i === 0}
        >
          <Text style={S.navBtnGhostTxt}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[S.navBtn, S.navBtnPrimary]} onPress={next} testID="printer-instructions-next">
          <Text style={S.navBtnPrimaryTxt}>{isLast ? 'I have the IP address' : 'Next'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={onSkip} style={S.skip}>
        <Text style={S.skipTxt}>Skip printer setup for now</Text>
      </TouchableOpacity>
    </OnboardingShell>
  );
}

const S = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 8, position: 'absolute', top: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Light.cardBorder },
  dotActive: { backgroundColor: Light.accent, width: 22 },
  iconWrap: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: '#F0F4FB',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  stepNum: { color: Light.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  title: { color: Light.text, fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  body: { color: Light.textSecondary, fontSize: 16, textAlign: 'center', lineHeight: 24, maxWidth: 380 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 36, width: '100%', maxWidth: 380 },
  navBtn: { flex: 1, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  navBtnHidden: { opacity: 0 },
  navBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Light.cardBorder },
  navBtnGhostTxt: { color: Light.textSecondary, fontSize: 15, fontWeight: '700' },
  navBtnPrimary: { backgroundColor: Light.accent },
  navBtnPrimaryTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  skip: { marginTop: 24 },
  skipTxt: { color: Light.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
});
