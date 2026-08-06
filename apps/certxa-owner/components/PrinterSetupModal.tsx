/**
 * PrinterSetupModal.tsx — Bluetooth / USB thermal printer setup
 *
 * Lets the user scan for nearby printers, connect to one, test-print,
 * and save the preference so the POS can print receipts automatically.
 *
 * Tab layout:
 *   BLUETOOTH  — paired & nearby BLE printers
 *   USB        — USB-connected printers (OTG cable)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  scanForPrinters, getSavedPrinter, savePrinter, clearSavedPrinter,
  printTestPage, type PrinterDevice,
} from '@/lib/printer';

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:       '#F4F6FA',
  card:     '#FFFFFF',
  border:   '#DDE0E8',
  text:     '#1C2333',
  textSub:  '#6B7480',
  textMute: '#A0A8B8',
  green:    '#16A34A',
  blue:     '#2563EB',
  orange:   '#D97706',
  red:      '#DC2626',
  dark:     '#1A1B2E',
  white:    '#FFFFFF',
};

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab     = 'bluetooth' | 'usb';
type ScanPhase = 'idle' | 'scanning' | 'connecting' | 'testing' | 'done' | 'error';

interface Props {
  visible:   boolean;
  storeName: string;
  onClose:   () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PrinterSetupModal({ visible, storeName, onClose }: Props) {
  const [tab, setTab]               = useState<Tab>('bluetooth');
  const [phase, setPhase]           = useState<ScanPhase>('idle');
  const [errorMsg, setErrorMsg]     = useState('');
  const [bleDevices, setBleDevices] = useState<PrinterDevice[]>([]);
  const [usbDevices, setUsbDevices] = useState<PrinterDevice[]>([]);
  const [saved, setSaved]           = useState<PrinterDevice | null>(null);

  // Load saved printer on open
  useEffect(() => {
    if (!visible) return;
    getSavedPrinter().then(setSaved).catch(() => {});
  }, [visible]);

  const currentDevices = tab === 'bluetooth' ? bleDevices : usbDevices;

  // ── Scan ─────────────────────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    setPhase('scanning');
    setErrorMsg('');
    try {
      const { paired, found } = await scanForPrinters();
      setBleDevices(paired);
      setUsbDevices(found);
      setPhase('idle');
    } catch (e: any) {
      setPhase('error');
      setErrorMsg(e?.message ?? 'Scan failed');
    }
  }, []);

  // ── Connect & save ───────────────────────────────────────────────────────────
  const handleConnect = useCallback(async (device: PrinterDevice) => {
    setPhase('connecting');
    setErrorMsg('');
    try {
      await savePrinter(device);
      setSaved(device);
      setPhase('done');
    } catch (e: any) {
      setPhase('error');
      setErrorMsg(e?.message ?? 'Failed to save printer');
    }
  }, []);

  // ── Test print ───────────────────────────────────────────────────────────────
  const handleTestPrint = useCallback(async () => {
    setPhase('testing');
    setErrorMsg('');
    try {
      await printTestPage(storeName);
      setPhase('done');
    } catch (e: any) {
      setPhase('error');
      setErrorMsg(e?.message ?? 'Test print failed');
    }
  }, [storeName]);

  // ── Forget printer ───────────────────────────────────────────────────────────
  const handleForget = useCallback(() => {
    Alert.alert('Remove Printer', 'Remove the saved printer?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await clearSavedPrinter();
          setSaved(null);
          setPhase('idle');
        },
      },
    ]);
  }, []);

  const isBusy = phase === 'scanning' || phase === 'connecting' || phase === 'testing';

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={!isBusy ? onClose : undefined}
    >
      <View style={S.backdrop}>
        <View style={S.sheet}>

          {/* Header */}
          <View style={S.header}>
            <Ionicons name="print-outline" size={20} color={C.text} />
            <Text style={S.headerTitle}>Printer Setup</Text>
            <TouchableOpacity onPress={onClose} disabled={isBusy} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={C.textSub} />
            </TouchableOpacity>
          </View>

          {/* Saved printer banner */}
          {saved && (
            <View style={S.savedBanner}>
              <View style={S.savedLeft}>
                <Ionicons
                  name={saved.type === 'bluetooth' ? 'bluetooth' : 'hardware-chip-outline'}
                  size={16} color={C.green}
                />
                <View>
                  <Text style={S.savedLabel}>Active Printer</Text>
                  <Text style={S.savedName}>{saved.name}</Text>
                </View>
              </View>
              <View style={S.savedActions}>
                <TouchableOpacity
                  style={S.testBtn}
                  onPress={handleTestPrint}
                  disabled={isBusy}
                >
                  {phase === 'testing'
                    ? <ActivityIndicator size="small" color={C.blue} />
                    : <Text style={S.testBtnTxt}>Test</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity onPress={handleForget} disabled={isBusy}>
                  <Ionicons name="trash-outline" size={18} color={C.red} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Tab bar */}
          <View style={S.tabs}>
            {(['bluetooth', 'usb'] as Tab[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[S.tab, tab === t && S.tabActive]}
                onPress={() => setTab(t)}
                disabled={isBusy}
              >
                <Ionicons
                  name={t === 'bluetooth' ? 'bluetooth-outline' : 'hardware-chip-outline'}
                  size={15}
                  color={tab === t ? C.blue : C.textSub}
                />
                <Text style={[S.tabTxt, tab === t && S.tabTxtActive]}>
                  {t === 'bluetooth' ? 'BLUETOOTH' : 'USB'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Scan button */}
          <TouchableOpacity
            style={[S.scanBtn, isBusy && S.scanBtnDim]}
            onPress={handleScan}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            {phase === 'scanning' ? (
              <>
                <ActivityIndicator size="small" color={C.white} />
                <Text style={S.scanBtnTxt}>Scanning…</Text>
              </>
            ) : (
              <>
                <Ionicons name="search-outline" size={16} color={C.white} />
                <Text style={S.scanBtnTxt}>
                  {tab === 'bluetooth' ? 'Scan for Bluetooth Printers' : 'Find USB Printers'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Status / error */}
          {phase === 'error' && (
            <View style={S.errorBox}>
              <Ionicons name="alert-circle-outline" size={15} color={C.red} />
              <Text style={S.errorTxt}>{errorMsg}</Text>
            </View>
          )}
          {phase === 'done' && (
            <View style={S.successBox}>
              <Ionicons name="checkmark-circle" size={15} color={C.green} />
              <Text style={S.successTxt}>Done!</Text>
            </View>
          )}
          {phase === 'connecting' && (
            <View style={S.infoBox}>
              <ActivityIndicator size="small" color={C.blue} />
              <Text style={S.infoTxt}>Saving printer…</Text>
            </View>
          )}

          {/* Device list */}
          {currentDevices.length === 0 && phase === 'idle' ? (
            <View style={S.emptyState}>
              <Ionicons
                name={tab === 'bluetooth' ? 'bluetooth-outline' : 'hardware-chip-outline'}
                size={40} color={C.textMute}
              />
              <Text style={S.emptyTitle}>No printers found</Text>
              <Text style={S.emptySub}>
                {tab === 'bluetooth'
                  ? 'Make sure the printer is powered on and in pairing mode, then tap Scan.'
                  : 'Connect the printer via USB OTG cable, then tap Find USB Printers.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={currentDevices}
              keyExtractor={(d) => d.address}
              style={S.list}
              contentContainerStyle={{ paddingBottom: 12 }}
              renderItem={({ item }) => {
                const isActive = saved?.address === item.address;
                return (
                  <View style={[S.deviceRow, isActive && S.deviceRowActive]}>
                    <View style={S.deviceLeft}>
                      <Ionicons
                        name={item.type === 'bluetooth' ? 'bluetooth' : 'hardware-chip-outline'}
                        size={18}
                        color={isActive ? C.green : C.textSub}
                      />
                      <View>
                        <Text style={S.deviceName}>{item.name}</Text>
                        <Text style={S.deviceAddr}>{item.address}</Text>
                      </View>
                    </View>
                    {isActive ? (
                      <View style={S.connectedBadge}>
                        <Text style={S.connectedBadgeTxt}>Active</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[S.connectBtn, isBusy && S.connectBtnDim]}
                        onPress={() => handleConnect(item)}
                        disabled={isBusy}
                        activeOpacity={0.85}
                      >
                        <Text style={S.connectBtnTxt}>Use</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />
          )}

          {/* Tip */}
          <Text style={S.tip}>
            {tab === 'bluetooth'
              ? '💡 Pair the printer in Android Bluetooth settings first, then scan here.'
              : '💡 Use a USB OTG adapter to connect USB thermal printers.'}
          </Text>

        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%', paddingBottom: 24,
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: C.text },

  // Saved printer banner
  savedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1, borderBottomColor: '#BBF7D0',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  savedLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  savedLabel:   { fontSize: 10, fontWeight: '700', color: C.green, letterSpacing: 0.5 },
  savedName:    { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 1 },
  savedActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  testBtn: {
    backgroundColor: C.blue + '15',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1, borderColor: C.blue + '30',
    minWidth: 56, alignItems: 'center',
  },
  testBtnTxt: { fontSize: 12, fontWeight: '700', color: C.blue },

  // Tabs
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:    { borderBottomColor: C.blue },
  tabTxt:       { fontSize: 12, fontWeight: '700', color: C.textSub, letterSpacing: 0.8 },
  tabTxtActive: { color: C.blue },

  // Scan button
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.dark,
    marginHorizontal: 20, marginTop: 16,
    paddingVertical: 13, borderRadius: 10,
  },
  scanBtnDim: { opacity: 0.5 },
  scanBtnTxt: { fontSize: 14, fontWeight: '700', color: C.white, letterSpacing: 0.5 },

  // Status boxes
  errorBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 10, backgroundColor: '#FEE2E2', padding: 10, borderRadius: 8 },
  errorTxt:   { fontSize: 13, color: C.red, flex: 1 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 10, backgroundColor: '#F0FDF4', padding: 10, borderRadius: 8 },
  successTxt: { fontSize: 13, color: C.green, fontWeight: '600' },
  infoBox:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 10, backgroundColor: '#EFF6FF', padding: 10, borderRadius: 8 },
  infoTxt:    { fontSize: 13, color: C.blue },

  // Device list
  list: { maxHeight: 280, marginTop: 10, paddingHorizontal: 20 },
  deviceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card, borderRadius: 10, padding: 14,
    marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
  },
  deviceRowActive: { borderColor: C.green + '60', backgroundColor: '#F0FDF4' },
  deviceLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  deviceName:   { fontSize: 14, fontWeight: '600', color: C.text },
  deviceAddr:   { fontSize: 11, color: C.textSub, marginTop: 2 },
  connectedBadge: {
    backgroundColor: C.green, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  connectedBadgeTxt: { fontSize: 11, fontWeight: '700', color: C.white },
  connectBtn: {
    backgroundColor: C.dark, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
  },
  connectBtnDim: { opacity: 0.4 },
  connectBtnTxt: { fontSize: 12, fontWeight: '700', color: C.white },

  // Empty state
  emptyState: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 28, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.textSub },
  emptySub:   { fontSize: 12, color: C.textMute, textAlign: 'center', lineHeight: 18 },

  // Tip
  tip: {
    fontSize: 11, color: C.textMute, textAlign: 'center',
    paddingHorizontal: 20, paddingTop: 10, lineHeight: 16,
  },
});
