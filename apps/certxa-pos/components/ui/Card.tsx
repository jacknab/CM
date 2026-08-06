import { View, StyleSheet, type ViewProps } from 'react-native';
import { colors } from '@/constants/colors';

type Props = ViewProps & { padded?: boolean };

export function Card({ style, padded = true, ...rest }: Props) {
  return (
    <View
      style={[styles.card, padded && styles.padded, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  padded: { padding: 16 },
});
