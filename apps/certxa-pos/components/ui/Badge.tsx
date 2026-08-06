import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info';

const variantStyles: Record<Variant, { bg: string; text: string }> = {
  default: { bg: colors.cardAlt, text: colors.textSecondary },
  success: { bg: colors.successMuted, text: colors.success },
  warning: { bg: colors.warningMuted, text: colors.warning },
  danger: { bg: colors.dangerMuted, text: colors.danger },
  info: { bg: colors.accentMuted, text: colors.accent },
};

type Props = {
  label: string;
  variant?: Variant;
  size?: 'sm' | 'md';
};

export function Badge({ label, variant = 'default', size = 'sm' }: Props) {
  const v = variantStyles[variant];
  return (
    <View style={[styles.badge, { backgroundColor: v.bg }, size === 'md' && styles.md]}>
      <Text style={[styles.text, { color: v.text }, size === 'md' && styles.textMd]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  md: { paddingHorizontal: 10, paddingVertical: 5 },
  text: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  textMd: { fontSize: 13 },
});
