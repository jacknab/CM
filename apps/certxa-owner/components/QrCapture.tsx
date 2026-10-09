/**
 * QrCapture — renders a QR code off-screen just long enough to export it as a base64 PNG, then
 * hands that back. There's no way to generate a QR bitmap without actually rendering one (the SVG
 * view itself does the rasterizing), so this mounts invisibly rather than showing on screen.
 */
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

interface Props {
  value: string;
  size?: number;
  onCapture: (base64: string) => void;
  onError: (err: unknown) => void;
}

export function QrCapture({ value, size = 300, onCapture, onError }: Props) {
  const ref = useRef<{ toDataURL: (cb: (data: string) => void) => void } | null>(null);

  useEffect(() => {
    // One frame so the SVG has actually painted before asking it to export — calling
    // toDataURL before that returns garbage on some Android devices.
    const t = setTimeout(() => {
      try {
        ref.current?.toDataURL((data) => onCapture(data));
      } catch (e) {
        onError(e);
      }
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <View style={{ position: 'absolute', top: -9999, left: -9999 }} pointerEvents="none">
      <QRCode value={value} size={size} backgroundColor="white" color="black" getRef={(c) => { ref.current = c; }} />
    </View>
  );
}
