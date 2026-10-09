/**
 * DeviceRoleSetup — the one-time "what is this device set up as?" screen.
 * Shown once on every fresh install (see app/index.tsx). Two choices: "POS / Kiosk" — one setup for
 * both, because which of the two a tablet shows follows how it is turned (landscape = POS,
 * portrait = Kiosk, see app/index.tsx) — and "Customer Screen".
 *
 * The role buttons live in the footer bar (only this first onboarding step has one) — everything
 * else in the wizard reuses OnboardingShell with no footer.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingShell, Light } from '@/components/onboarding/OnboardingShell';
import type { DeviceRole } from '@/lib/deviceRole';

interface Props {
  onPick: (role: DeviceRole) => void;
}

const OPTIONS: { role: DeviceRole; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { role: 'pos', label: 'POS / Kiosk', icon: 'bag-handle-outline' },
  { role: 'frontdesk', label: 'Customer Screen', icon: 'tablet-landscape-outline' },
];

export function DeviceRoleSetup({ onPick }: Props) {
  return (
    <OnboardingShell
      footer={
        <>
          {OPTIONS.map((o) => (
            <TouchableOpacity key={o.role} style={S.footerBtn} onPress={() => onPick(o.role)} activeOpacity={0.75} testID={`device-role-${o.role}`}>
              <Ionicons name={o.icon} size={26} color="#FFFFFF" />
              <Text style={S.footerBtnLabel}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </>
      }
    >
      <View style={S.iconWrap}>
        <Ionicons name="tablet-landscape-outline" size={56} color={Light.accent} />
      </View>
      <Text style={S.title}>Set up this device</Text>
      <Text style={S.subtitle}>
        Choose what this screen will be used for using the buttons below. A POS / Kiosk tablet shows the POS
        when it is turned sideways and the check-in kiosk when it is turned upright.
      </Text>
    </OnboardingShell>
  );
}

const S = StyleSheet.create({
  iconWrap: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: '#F0F4FB',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  title: { color: Light.text, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: Light.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, marginTop: 8, maxWidth: 440 },
  footerBtn: { alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 18, minWidth: 100 },
  footerBtnLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
