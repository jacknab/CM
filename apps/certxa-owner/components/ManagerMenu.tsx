/**
 * ManagerMenu — what a manager can do on the tablet after entering the manager PIN (the 3-second hold):
 * change the Wi-Fi, set up this tablet's receipt printer, install the latest version of the app, hard-reset a
 * customer screen (clear its saved web files and restart the app), or leave the app for Android's Settings. Each opens the app's own native screen (WifiSetupScreen, PrinterSetupModal);
 * the app update downloads and installs in place (lib/appRestart.ts installLatestApk).
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';
import { Colors } from '@/constants/colors';
import { apkUpdateLastResult, canInstallApk, installLatestApk } from '@/lib/appRestart';

interface Props {
  visible: boolean;
  /** Where the latest APK of this app is downloaded from. */
  apkUrl: string;
  /** "Exit to Android Settings" on a kiosk-locked tablet, "Exit app" otherwise. */
  exitLabel: string;
  onWifi: () => void;
  onPrinter: () => void;
  /** Customer screen: start the screen and the app afresh. */
  onHardReset?: () => void;
  onExit: () => void;
  onClose: () => void;
}

type UpdateState = { busy: boolean; text: string; tone: 'info' | 'error' };

export function ManagerMenu({ visible, apkUrl, exitLabel, onWifi, onPrinter, onHardReset, onExit, onClose }: Props) {
  const [update, setUpdate] = useState<UpdateState>({ busy: false, text: '', tone: 'info' });

  // Opening the menu after an update that failed says why.
  useEffect(() => {
    if (!visible) return;
    const last = apkUpdateLastResult();
    setUpdate(last?.state === 'failed' ? { busy: false, text: last.message, tone: 'error' } : { busy: false, text: '', tone: 'info' });
  }, [visible]);

  const installUpdate = async () => {
    if (update.busy) return;
    setUpdate({ busy: true, text: 'Downloading the latest app… this can take a few minutes.', tone: 'info' });
    try {
      const result = await installLatestApk(apkUrl);
      setUpdate(result === 'up_to_date'
        ? { busy: false, text: 'This tablet already has the latest app.', tone: 'info' }
        : { busy: true, text: 'Installing. The app closes and opens again on the new version.', tone: 'info' });
    } catch (e: any) {
      setUpdate({ busy: false, text: e?.message || 'The update could not be installed. Try again.', tone: 'error' });
    }
  };

  const row = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity style={[S.row, disabled && S.rowDisabled]} onPress={onPress} disabled={disabled} activeOpacity={0.7}>
      <Text style={S.rowText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={update.busy ? undefined : onClose}>
      <View style={S.backdrop}>
        <View style={S.card}>
          <Text style={S.title}>Manager menu</Text>
          <Text style={S.sub}>App version {Constants.expoConfig?.version ?? ''}</Text>
          <View style={S.list}>
            {row('Wi-Fi', onWifi, update.busy)}
            {row('Receipt printer', onPrinter, update.busy)}
            {canInstallApk() && row('Install the latest app', () => void installUpdate(), update.busy)}
            {onHardReset && row('Hard reset', onHardReset, update.busy)}
            {row(exitLabel, onExit, update.busy)}
          </View>
          {update.text ? (
            <View style={S.status}>
              {update.busy && <ActivityIndicator color="#FFFFFF" />}
              <Text style={[S.statusText, update.tone === 'error' && S.error]}>{update.text}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={S.close} onPress={onClose} disabled={update.busy} activeOpacity={0.7}>
            <Text style={S.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 360, borderRadius: 20, padding: 24, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  sub: { marginTop: 6, fontSize: 14, color: '#94A3B8' },
  list: { alignSelf: 'stretch', gap: 10, marginTop: 20 },
  row: { height: 56, borderRadius: 14, backgroundColor: Colors.cardElevated, alignItems: 'center', justifyContent: 'center' },
  rowDisabled: { opacity: 0.5 },
  rowText: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, alignSelf: 'stretch' },
  statusText: { flex: 1, fontSize: 14, color: '#CBD5E1' },
  error: { color: Colors.error },
  close: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 24 },
  closeText: { fontSize: 15, color: '#94A3B8' },
});
