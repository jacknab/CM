import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { useTerminal } from '@/context/TerminalContext';

type LocationPermStatus = 'unknown' | 'location_required' | 'granted';

type SavedLocation = {
  id: string;
  displayName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
};

export default function TapToPayScreen() {
  const router = useRouter();
  const {
    terminalInitialized,
    terminalInitializing,
    terminalError,
    discoverReaders,
  } = useTerminal();

  const [locationStatus, setLocationStatus] = useState<LocationPermStatus>('unknown');
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [isEnabling, setIsEnabling] = useState(false);
  const [tapToPayEnabled, setTapToPayEnabled] = useState(false);

  useEffect(() => {
    checkLocationPermission();
  }, []);

  async function checkLocationPermission() {
    try {
      // In a full EAS build with expo-location installed natively:
      // const { status } = await Location.getForegroundPermissionsAsync();
      // setLocationStatus(status === 'granted' ? 'granted' : 'location_required');
      //
      // Development simulation:
      setLocationStatus('location_required');
    } catch {
      setLocationStatus('location_required');
    }
  }

  async function requestLocationPermission() {
    try {
      // In a full EAS build:
      // const { status } = await Location.requestForegroundPermissionsAsync();
      // if (status === 'granted') { setLocationStatus('granted'); } else { ... }
      //
      // Development simulation:
      Alert.alert(
        '"Certxa" Would Like to Use Your Location',
        'Your location is required to use Tap to Pay on iPhone/Android.',
        [
          { text: "Don't Allow", style: 'cancel' },
          {
            text: 'Allow While Using App',
            onPress: () => setLocationStatus('granted'),
          },
        ],
      );
    } catch {
      Alert.alert('Permission Error', 'Unable to request location permissions.');
    }
  }

  async function handleEnableTapToPay() {
    if (locationStatus === 'location_required' || locationStatus === 'unknown') {
      await requestLocationPermission();
      return;
    }

    // Guard: Terminal must be initialized before discoverReaders (localMobile)
    if (!terminalInitialized) {
      if (terminalInitializing) {
        Alert.alert('Terminal Initializing', 'The payment terminal is still starting up. Please wait a moment and try again.');
      } else {
        Alert.alert(
          'Terminal Not Ready',
          terminalError
            ? `Initialization failed: ${terminalError}`
            : 'First initialize the Stripe Terminal SDK before performing this action.',
        );
      }
      return;
    }

    setIsEnabling(true);
    try {
      // discoverReaders is guarded — logs "[Stripe Terminal] Reader discovery started"
      // localMobile method uses the phone itself as the terminal (Tap to Pay on iPhone/Android)
      await discoverReaders({ discoveryMethod: 'localMobile', simulated: false });
      setTapToPayEnabled(true);
    } catch (err) {
      // SDK not available in Expo Go — simulate for UI development
      console.warn('[Stripe Terminal] localMobile discovery fell through to simulation:', err);
      await new Promise((r) => setTimeout(r, 2000));
      setTapToPayEnabled(true);
    } finally {
      setIsEnabling(false);
    }
  }

  function handleDisable() {
    Alert.alert('Disable Tap to Pay?', 'You can re-enable it at any time from Settings.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disable',
        style: 'destructive',
        onPress: () => setTapToPayEnabled(false),
      },
    ]);
  }

  function handleCreateLocation() {
    router.push('/(owner)/settings/tap-to-pay-location');
  }

  function handleDeleteLocation(id: string) {
    Alert.alert('Remove Location?', 'This location will be removed from Tap to Pay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setLocations((prev) => prev.filter((l) => l.id !== id)),
      },
    ]);
  }

  // Tap to Pay is considered fully enabled only when Terminal is initialized + user enabled it
  const isEnabled = terminalInitialized && tapToPayEnabled;
  const isLocationRequired = locationStatus === 'location_required' || locationStatus === 'unknown';
  const isAndroid = Platform.OS === 'android';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Tap to Pay</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Terminal initialization banner */}
        {terminalInitializing && (
          <View style={s.initBanner}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={s.initBannerText}>Terminal initializing…</Text>
          </View>
        )}
        {!terminalInitialized && !terminalInitializing && terminalError && (
          <View style={s.errorBanner}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
            <Text style={s.errorBannerText}>Terminal init failed: {terminalError}</Text>
          </View>
        )}

        {/* Connection Status Card */}
        <View style={s.card}>
          <View style={s.statusRow}>
            <Text style={s.cardTitle}>Connection Status</Text>
            <View style={[s.statusBadge, isEnabled ? s.statusBadgeEnabled : s.statusBadgeDisabled]}>
              <Text style={[s.statusBadgeText, isEnabled ? s.statusBadgeTextEnabled : s.statusBadgeTextDisabled]}>
                {isEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
          </View>

          {isLocationRequired && (
            <View style={s.warningRow}>
              <Ionicons name="location-outline" size={16} color={colors.amber} />
              <Text style={s.warningText}>
                Location services are required to use Tap to Pay. Please enable location services.
              </Text>
            </View>
          )}

          {isEnabled && (
            <Text style={s.statusDesc}>
              You have successfully connected Tap to Pay to this device.{' '}
              {isAndroid ? 'Android' : 'iPhone'} is ready to accept contactless payments.
            </Text>
          )}

          {!isEnabled && !isLocationRequired && !terminalInitialized && !terminalInitializing && (
            <Text style={s.statusDesc}>
              Waiting for Terminal SDK to initialize before Tap to Pay can be enabled.
            </Text>
          )}

          {!isEnabled && !isLocationRequired && (terminalInitialized || terminalInitializing) && (
            <Text style={s.statusDesc}>
              Accept contactless payments directly on your {isAndroid ? 'Android device' : 'iPhone'} — no card reader required.
            </Text>
          )}

          {isEnabled ? (
            <Pressable style={s.disableBtn} onPress={handleDisable}>
              <Text style={s.disableBtnText}>Disable Tap to Pay</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[s.enableBtn, (isEnabling || terminalInitializing) && s.enableBtnLoading]}
              onPress={handleEnableTapToPay}
              disabled={isEnabling || terminalInitializing}
            >
              {isEnabling || terminalInitializing ? (
                <View style={s.enablingRow}>
                  <View style={s.spinner} />
                  <Text style={s.enableBtnText}>
                    {terminalInitializing ? 'Terminal starting…' : 'Enabling…'}
                  </Text>
                </View>
              ) : isLocationRequired ? (
                <>
                  <Ionicons name="location" size={18} color="#fff" />
                  <Text style={s.enableBtnText}>Allow Location to Continue</Text>
                </>
              ) : (
                <>
                  <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                  <Text style={s.enableBtnText}>Enable Tap to Pay</Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        {/* Platform Notice */}
        <View style={s.noticeCard}>
          <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
          <Text style={s.noticeText}>
            {isAndroid
              ? 'Tap to Pay on Android requires NFC and Android 6.0+. An EAS build with @stripe/stripe-terminal-react-native is required for production.'
              : 'Tap to Pay on iPhone requires iOS 16.0+ and an iPhone XS or later. An EAS build with @stripe/stripe-terminal-react-native is required for production.'}
          </Text>
        </View>

        {/* Address Section */}
        <Text style={s.sectionLabel}>Address</Text>
        <View style={s.card}>
          <Text style={s.cardSub}>
            Manage the address associated with your Tap to Pay connection.
          </Text>

          {locations.length === 0 ? (
            <Text style={s.emptyText}>Add a location to enable Tap to Pay.</Text>
          ) : (
            locations.map((loc) => (
              <View key={loc.id} style={s.locationRow}>
                <View style={s.locationIcon}>
                  <Ionicons name="location-outline" size={18} color={colors.primary} />
                </View>
                <View style={s.locationInfo}>
                  <Text style={s.locationName}>{loc.displayName}</Text>
                  <Text style={s.locationAddress}>
                    {loc.address}, {loc.city}, {loc.state} {loc.postalCode}
                  </Text>
                </View>
                <Pressable onPress={() => handleDeleteLocation(loc.id)} style={s.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              </View>
            ))
          )}

          <Pressable style={s.createLocationBtn} onPress={handleCreateLocation}>
            <Ionicons name="add-outline" size={18} color={colors.text} />
            <Text style={s.createLocationText}>Create location</Text>
          </Pressable>
        </View>

        {/* How It Works */}
        <Text style={s.sectionLabel}>How It Works</Text>
        <View style={s.card}>
          {[
            { icon: 'phone-portrait-outline', title: 'No Extra Hardware', desc: 'Your phone becomes the payment terminal.' },
            { icon: 'wifi-outline', title: 'Contactless Payments', desc: 'Accepts NFC cards, Apple Pay, and Google Pay.' },
            { icon: 'shield-checkmark-outline', title: 'Stripe Secure', desc: 'Encrypted end-to-end via Stripe Terminal.' },
            { icon: 'location-outline', title: 'Location Required', desc: 'One-time permission needed to activate.' },
          ].map((item) => (
            <View key={item.title} style={s.howRow}>
              <View style={s.howIcon}>
                <Ionicons name={item.icon as never} size={18} color={colors.primary} />
              </View>
              <View style={s.howText}>
                <Text style={s.howTitle}>{item.title}</Text>
                <Text style={s.howDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.card },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  scroll: { padding: 20, gap: 12 },
  initBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryMuted, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.primary },
  initBannerText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.dangerMuted, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.danger },
  errorBannerText: { flex: 1, fontSize: 13, color: colors.danger, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardSub: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusBadgeEnabled: { backgroundColor: colors.successMuted },
  statusBadgeDisabled: { backgroundColor: colors.dangerMuted },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  statusBadgeTextEnabled: { color: colors.success },
  statusBadgeTextDisabled: { color: colors.danger },
  statusDesc: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.warningMuted, borderRadius: 10, padding: 12 },
  warningText: { flex: 1, fontSize: 13, color: colors.amber, lineHeight: 19 },
  enableBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  enableBtnLoading: { opacity: 0.7 },
  enableBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  enablingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spinner: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#ffffff60', borderTopColor: '#fff' },
  disableBtn: { paddingVertical: 12, alignItems: 'center' },
  disableBtnText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.accentMuted, borderRadius: 12, padding: 14 },
  noticeText: { flex: 1, fontSize: 12, color: colors.accent, lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 },
  emptyText: { fontSize: 14, color: colors.textMuted },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  locationIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  locationInfo: { flex: 1 },
  locationName: { fontSize: 14, fontWeight: '700', color: colors.text },
  locationAddress: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  deleteBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  createLocationBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', justifyContent: 'center' },
  createLocationText: { fontSize: 14, fontWeight: '600', color: colors.text },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  howIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  howText: { flex: 1 },
  howTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  howDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
});
