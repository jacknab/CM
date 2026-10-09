/**
 * NumberBarCapture — renders the check-in slip's black bar / white bold number off-screen and
 * exports it as a base64 PNG, the same way QrCapture does for the QR code. The printer's text
 * tags only support bold and alignment, not inverted (white-on-black) fills, so this element has
 * to be a rendered image like the QR is, not plain printBill text.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { captureRef } from 'react-native-view-shot';

interface Props {
  value: number;
  width?: number;
  onCapture: (base64: string) => void;
  onError: (err: unknown) => void;
}

export function NumberBarCapture({ value, width = 300, onCapture, onError }: Props) {
  const ref = useRef<View>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        if (!ref.current) throw new Error('Nothing to capture');
        const base64 = await captureRef(ref.current, { format: 'png', quality: 1, result: 'base64' });
        onCapture(base64);
      } catch (e) {
        onError(e);
      }
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <View style={{ position: 'absolute', top: -9999, left: -9999 }} pointerEvents="none">
      <View ref={ref} style={[styles.bar, { width }]} collapsable={false}>
        <Text style={styles.num}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#000000', paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  num: { color: '#FFFFFF', fontSize: 64, fontWeight: '800' },
});
