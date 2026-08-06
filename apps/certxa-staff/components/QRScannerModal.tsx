/**
 * QRScannerModal.tsx — Native QR scanner for the Certxa Staff Portal.
 *
 * Opened by the WebView bridge when the web page posts { type: 'SCAN_QR' }.
 * On successful scan the decoded text is injected back into the WebView via
 * window.__certxaQRResult(token).
 * On cancel, window.__certxaQRCancel() is called so the web page can tidy up.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import type WebView from 'react-native-webview';

interface Props {
  visible: boolean;
  onClose: () => void;
  webViewRef: React.RefObject<WebView>;
}

export function QRScannerModal({ visible, onClose, webViewRef }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const scannedRef = useRef(false);

  // Reset scanned state each time the modal opens
  useEffect(() => {
    if (visible) {
      setScanned(false);
      scannedRef.current = false;
    }
  }, [visible]);

  const handleBarcodeScan = ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanned(true);

    // Inject the decoded token back into the WebView
    webViewRef.current?.injectJavaScript(
      `if (typeof window.__certxaQRResult === 'function') { window.__certxaQRResult(${JSON.stringify(data)}); } true;`
    );
    onClose();
  };

  const handleCancel = () => {
    webViewRef.current?.injectJavaScript(
      `if (typeof window.__certxaQRCancel === 'function') { window.__certxaQRCancel(); } true;`
    );
    onClose();
  };

  // Request camera permission as soon as the modal becomes visible
  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <View style={[styles.container, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>

        {/* ── No permission ── */}
        {permission && !permission.granted && (
          <View style={styles.centred}>
            <Ionicons name="camera-outline" size={56} color={Colors.textMuted} />
            <Text style={styles.permTitle}>Camera access needed</Text>
            <Text style={styles.permMsg}>
              Allow camera access so you can scan QR codes.
            </Text>
            {permission.canAskAgain ? (
              <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                <Text style={styles.permBtnText}>Grant Permission</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.permMsg}>
                Open your device Settings and enable Camera for Certxa Staff Portal.
              </Text>
            )}
            <TouchableOpacity style={styles.cancelTextBtn} onPress={handleCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Live camera ── */}
        {permission?.granted && (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              onBarcodeScanned={scanned ? undefined : handleBarcodeScan}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            />

            {/* Dark vignette overlay */}
            <View style={styles.vignette} pointerEvents="none" />

            {/* Scan frame */}
            <View style={styles.frameWrap} pointerEvents="none">
              <View style={styles.frame}>
                <View style={[styles.corner, styles.tl]} />
                <View style={[styles.corner, styles.tr]} />
                <View style={[styles.corner, styles.bl]} />
                <View style={[styles.corner, styles.br]} />
                {/* Scanning line */}
                <View style={styles.scanLine} />
              </View>
            </View>

            {/* Label */}
            <View style={styles.labelWrap} pointerEvents="none">
              <Text style={styles.label}>Point camera at QR code</Text>
            </View>
          </>
        )}

        {/* ── Close button ── */}
        <TouchableOpacity
          style={[styles.closeBtn, { top: (Platform.OS === 'android' ? insets.top : 0) + 16 }]}
          onPress={handleCancel}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const FRAME = 240;
const CORNER = 36;
const BORDER = 4;
const GREEN = '#19c37d';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  permTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  permMsg: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
  },
  permBtn: {
    marginTop: 8,
    backgroundColor: GREEN,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 15,
  },
  cancelTextBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  cancelText: {
    color: '#64748b',
    fontSize: 14,
  },

  // Camera overlays
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    shadowColor: '#000',
  },
  frameWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: FRAME,
    height: FRAME,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: GREEN,
  },
  tl: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER, borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER, borderBottomRightRadius: 8 },
  scanLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: GREEN,
    opacity: 0.8,
  },
  labelWrap: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  label: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  closeBtn: {
    position: 'absolute',
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
