import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal,
  Linking, ActivityIndicator, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';

type Props = {
  visible: boolean;
  onClose: () => void;
  onScanned: (data: string) => void;
  title?: string;
};

export function QRScannerModal({ visible, onClose, onScanned, title = 'Scan QR Code' }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Request permission as soon as the modal opens (only shown once by OS)
  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission]);

  // Reset scan lock when modal closes
  useEffect(() => {
    if (!visible) {
      setScanned(false);
      setTorch(false);
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    }
  }, [visible]);

  const handleBarcode = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onScanned(data);
    // Auto-unlock after 2 s so user can scan another code without reopening
    cooldownRef.current = setTimeout(() => setScanned(false), 2000);
  };

  const openSettings = () => Linking.openSettings();

  const renderContent = () => {
    if (!permission) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (!permission.granted) {
      if (!permission.canAskAgain) {
        // User permanently denied — guide to Settings
        return (
          <View style={styles.center}>
            <Ionicons name="camera-outline" size={56} color={colors.textMuted} />
            <Text style={styles.permTitle}>Camera Access Needed</Text>
            <Text style={styles.permBody}>
              Camera permission was denied. Open Settings and allow camera access for Expo Go to scan QR codes.
            </Text>
            <Pressable style={styles.settingsBtn} onPress={openSettings}>
              <Ionicons name="settings-outline" size={16} color={colors.background} />
              <Text style={styles.settingsBtnText}>Open Settings</Text>
            </Pressable>
          </View>
        );
      }
      // Still requesting
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.permBody}>Requesting camera access…</Text>
        </View>
      );
    }

    // Camera ready
    return (
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcode}
      >
        {/* Dark overlay with cut-out */}
        <View style={styles.overlay}>
          <View style={styles.overlayTop} />
          <View style={styles.overlayRow}>
            <View style={styles.overlaySide} />
            <View style={styles.scanWindow}>
              {/* Corner markers */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              {scanned && (
                <View style={styles.scanSuccess}>
                  <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
                </View>
              )}
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom}>
            <Text style={styles.hint}>
              {scanned ? 'QR code detected!' : 'Point the camera at a QR code'}
            </Text>
          </View>
        </View>
      </CameraView>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
          {permission?.granted ? (
            <Pressable onPress={() => setTorch(v => !v)} style={styles.torchBtn} hitSlop={12}>
              <Ionicons
                name={torch ? 'flashlight' : 'flashlight-outline'}
                size={22}
                color={torch ? colors.primary : colors.textSecondary}
              />
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Camera / permission area */}
        <View style={styles.cameraArea}>
          {renderContent()}
        </View>
      </View>
    </Modal>
  );
}

const WINDOW_SIZE = 260;
const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    fontFamily: 'DMSans_700Bold',
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  torchBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  cameraArea: { flex: 1, position: 'relative' },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  permTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'DMSans_700Bold',
    textAlign: 'center',
    marginTop: 8,
  },
  permBody: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: 'DMSans_400Regular',
    textAlign: 'center',
    lineHeight: 21,
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: colors.radius,
    marginTop: 8,
  },
  settingsBtnText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'DMSans_700Bold',
  },
  // Overlay
  overlay: { flex: 1 },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayRow: { flexDirection: 'row', height: WINDOW_SIZE },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    paddingTop: 24,
  },
  hint: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    opacity: 0.85,
  },
  scanWindow: {
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: colors.primary,
  },
  cornerTL: {
    top: 0, left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0, right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0, left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0, right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: 4,
  },
  scanSuccess: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,212,170,0.15)',
  },
});
