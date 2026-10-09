/**
 * OnboardingShell — the shared page chrome for every onboarding screen: light background, the
 * Certxa wordmark top-left, and a big white card (blue left accent) holding the step's own
 * content. The dark footer bar is opt-in (`footer` prop) — only the role-pick step uses it, for
 * the POS / Customer Facing Screen / Kiosk buttons; every other step renders with no footer.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const Light = {
  bg:           '#EEF2F8',
  card:         '#FFFFFF',
  cardBorder:   '#E3E8F0',
  accent:       '#2D6CDF',
  accentDark:   '#1F4FA8',
  text:         '#0F1F3D',
  textSecondary:'#5B6B85',
  textMuted:    '#8A97AC',
  footerBg:     '#0B1220',
  success:      '#16A34A',
  error:        '#DC2626',
};

interface Props {
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function OnboardingShell({ children, footer }: Props) {
  return (
    <View style={S.root}>
      <View style={S.header}>
        <View style={S.logoRow}>
          <Text style={S.logoText}>Certxa</Text>
          <Ionicons name="sparkles" size={15} color={Light.accent} style={S.spark} />
        </View>
        <Text style={S.tagline}>Salon Management System</Text>
      </View>

      <View style={S.cardWrap}>
        <View style={S.card}>
          {children}
        </View>
      </View>

      {footer && <View style={S.footer}>{footer}</View>}
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: Light.bg },
  header: { paddingTop: 44, paddingHorizontal: 32, paddingBottom: 8 },
  logoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  logoText: { color: Light.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  spark: { marginTop: 2 },
  tagline: { color: Light.textSecondary, fontSize: 14, marginTop: 2 },
  cardWrap: { flex: 1, paddingHorizontal: 32, paddingTop: 24, paddingBottom: 24 },
  card: {
    flex: 1,
    backgroundColor: Light.card,
    borderRadius: 18,
    borderLeftWidth: 5,
    borderLeftColor: Light.accent,
    borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderTopColor: Light.cardBorder, borderRightColor: Light.cardBorder, borderBottomColor: Light.cardBorder,
    shadowColor: '#1F345C', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    alignItems: 'center', justifyContent: 'center',
    padding: 40,
  },
  footer: {
    backgroundColor: Light.footerBg,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
});
