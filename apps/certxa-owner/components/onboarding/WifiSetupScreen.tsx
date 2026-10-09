/**
 * WifiSetupScreen — connect this tablet to Wi-Fi from inside Certxa.
 *
 * Two uses:
 *   • mode="setup"  — the FIRST step of the setup wizard. If the tablet can already reach Certxa
 *     (Wi-Fi set earlier, Ethernet, …) the step is skipped without showing anything. Otherwise the
 *     installer picks a network, types its password, and setup only moves on once a real request to
 *     Certxa has succeeded.
 *   • mode="change" — opened from the "Could not load portal" screen, to switch networks or fix a
 *     changed password later. Always shows the list, with a Close button.
 *
 * The app can only join a network by itself where Android allows it (Certxa is device owner, or
 * Android 9 and older — see lib/wifi.ts). Anywhere else this shows a short explanation and a
 * button to Android's own Wi-Fi settings.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingShell, Light } from '@/components/onboarding/OnboardingShell';
import {
  wifiSetupSupported, wifiPrepare, wifiStatus, wifiStartScan, wifiScanResults, wifiConnect,
  openWifiSettings, canReachCertxa, connectProblem, type WifiNetwork, type WifiSecurity,
} from '@/lib/wifi';

type Phase = 'checking' | 'list' | 'password' | 'connecting' | 'done' | 'unmanaged';

interface Props {
  mode?: 'setup' | 'change';
  /** Setup: called once Certxa is reachable. Change: called when the screen is closed. */
  onDone: () => void;
}

/** How long to wait for the tablet to join the network and reach Certxa before calling it a failure. */
const CONNECT_TIMEOUT_MS = 45_000;

export function WifiSetupScreen({ mode = 'setup', onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [canScan, setCanScan] = useState(true);
  const [current, setCurrent] = useState('');
  const [scanning, setScanning] = useState(false);

  // The network being joined.
  const [ssid, setSsid] = useState('');
  const [security, setSecurity] = useState<WifiSecurity>('wpa');
  const [manual, setManual] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const refreshList = useCallback((freshScan: boolean) => {
    if (freshScan) { setScanning(true); wifiStartScan(); }
    // Android takes a couple of seconds to finish a scan; read the results after that.
    setTimeout(() => {
      if (!alive.current) return;
      const status = wifiStatus();
      setCanScan(status.canScan);
      setCurrent(status.connectedSsid);
      setNetworks(wifiScanResults());
      setScanning(false);
    }, freshScan ? 3000 : 0);
  }, []);

  // First look: is there anything to do at all?
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // No in-app Wi-Fi in this build (iOS, or an older Android build): nothing this step can do.
      if (!wifiSetupSupported()) { onDone(); return; }
      if (mode === 'setup' && await canReachCertxa()) { if (!cancelled) onDone(); return; }
      if (cancelled) return;
      wifiPrepare();
      if (!wifiStatus().canManage) { setPhase('unmanaged'); return; }
      setPhase('list');
      refreshList(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While the list is showing, keep it current (a full rescan only every 30s — Android limits scans).
  useEffect(() => {
    if (phase !== 'list') return;
    let ticks = 0;
    const timer = setInterval(() => { ticks += 1; refreshList(ticks % 3 === 0); }, 10_000);
    return () => clearInterval(timer);
  }, [phase, refreshList]);

  const startConnect = useCallback(async (name: string, pass: string, sec: WifiSecurity, hidden: boolean) => {
    setError(null);
    const refused = wifiConnect(name, pass, sec, hidden);
    if (refused) { setError(connectProblem(refused)); setPhase(sec === 'open' && !hidden ? 'list' : 'password'); return; }

    setPhase('connecting');
    const deadline = Date.now() + CONNECT_TIMEOUT_MS;
    let joined = false;
    while (alive.current && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const status = wifiStatus();
      // Some tablets never report the network's name; "Android has a connection" is then the signal.
      joined = status.connectedSsid === name || (status.connectedSsid === '' && status.hasNetwork);
      if (joined && await canReachCertxa(6000)) {
        if (!alive.current) return;
        setCurrent(name);
        setPhase('done');
        return;
      }
    }
    if (!alive.current) return;
    setError(joined
      ? `Connected to "${name}", but it has no working internet. Check the router, or choose another network.`
      : sec === 'open'
        ? `Couldn't join "${name}". Move closer to the router and try again.`
        : `Couldn't join "${name}". Check the password and try again.`);
    setPhase(sec === 'open' && !hidden ? 'list' : 'password');
  }, []);

  const pick = (n: WifiNetwork) => {
    setError(null);
    if (n.security === 'enterprise') {
      setError(`"${n.ssid}" needs a username as well as a password, which can't be set up here. Choose a network that only needs a password.`);
      return;
    }
    setSsid(n.ssid); setSecurity(n.security); setManual(false); setPassword(''); setShowPassword(false);
    if (n.security === 'open') { void startConnect(n.ssid, '', 'open', false); return; }
    setPhase('password');
  };

  const enterManually = () => {
    setError(null); setSsid(''); setSecurity('wpa'); setManual(true); setPassword(''); setShowPassword(false);
    setPhase('password');
  };

  // In setup, move on by itself a moment after the success message.
  useEffect(() => {
    if (phase !== 'done' || mode !== 'setup') return;
    const timer = setTimeout(onDone, 1800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode]);

  const recheck = async () => {
    setError(null);
    setPhase('checking');
    if (await canReachCertxa()) { onDone(); return; }
    if (!alive.current) return;
    setError("Still no connection to Certxa. Join a Wi-Fi network in Android's settings, then check again.");
    setPhase('unmanaged');
  };

  // ── Screens ────────────────────────────────────────────────────────────────

  if (phase === 'checking') {
    return (
      <OnboardingShell>
        <ActivityIndicator size="large" color={Light.accent} />
        <Text style={[S.subtitle, { marginTop: 18, marginBottom: 0 }]}>Checking the internet connection…</Text>
      </OnboardingShell>
    );
  }

  if (phase === 'unmanaged') {
    return (
      <OnboardingShell>
        <View style={S.iconWrap}><Ionicons name="wifi-outline" size={52} color={Light.accent} /></View>
        <Text style={S.title}>Connect to Wi-Fi</Text>
        <Text style={S.subtitle}>
          This tablet needs an internet connection, and it only lets Wi-Fi be changed in Android's own settings.
          Join your network there, then come back and check again.
        </Text>
        {error && <Text style={S.error}>{error}</Text>}
        <TouchableOpacity style={S.primaryBtn} onPress={openWifiSettings} testID="wifi-open-settings">
          <Text style={S.primaryBtnTxt}>Open Wi-Fi settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.secondaryBtn} onPress={recheck} testID="wifi-recheck">
          <Text style={S.secondaryBtnTxt}>Check again</Text>
        </TouchableOpacity>
        {mode === 'change' && (
          <TouchableOpacity style={S.secondaryBtn} onPress={onDone}><Text style={S.secondaryBtnTxt}>Close</Text></TouchableOpacity>
        )}
      </OnboardingShell>
    );
  }

  if (phase === 'connecting') {
    return (
      <OnboardingShell>
        <ActivityIndicator size="large" color={Light.accent} />
        <Text style={[S.title, { marginTop: 20 }]}>Connecting to {ssid}</Text>
        <Text style={[S.subtitle, { marginBottom: 0 }]}>Joining the network and checking the internet. This can take up to a minute.</Text>
      </OnboardingShell>
    );
  }

  if (phase === 'done') {
    return (
      <OnboardingShell>
        <View style={[S.iconWrap, { backgroundColor: '#E8F7EE' }]}><Ionicons name="checkmark-circle" size={60} color={Light.success} /></View>
        <Text style={S.title}>Connected</Text>
        <Text style={S.subtitle}>This tablet is on "{current}" and the internet is working.</Text>
        <TouchableOpacity style={S.primaryBtn} onPress={onDone} testID="wifi-continue">
          <Text style={S.primaryBtnTxt}>{mode === 'setup' ? 'Continue' : 'Done'}</Text>
        </TouchableOpacity>
      </OnboardingShell>
    );
  }

  if (phase === 'password') {
    const needsPassword = !manual || password.length > 0;
    const ready = (manual ? ssid.trim().length > 0 : true) && (manual ? (password.length === 0 || password.length >= 8) : password.length >= (security === 'wep' ? 5 : 8));
    return (
      <OnboardingShell>
        <ScrollView style={S.fill} contentContainerStyle={S.formContent} keyboardShouldPersistTaps="handled">
          <Text style={S.title}>{manual ? 'Join another network' : ssid}</Text>
          {manual && (
            <>
              <Text style={S.label}>Network name</Text>
              <TextInput
                style={S.input} value={ssid} onChangeText={setSsid} autoCapitalize="none" autoCorrect={false}
                placeholder="Exactly as it appears on the router" placeholderTextColor={Light.textMuted} testID="wifi-ssid"
              />
            </>
          )}
          <Text style={S.label}>{manual ? 'Password (leave empty if the network has none)' : 'Password'}</Text>
          <View style={S.passwordRow}>
            <TextInput
              style={[S.input, S.passwordInput]} value={password} onChangeText={setPassword}
              secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoFocus={!manual}
              placeholder="Wi-Fi password" placeholderTextColor={Light.textMuted} testID="wifi-password"
            />
            <TouchableOpacity style={S.eye} onPress={() => setShowPassword((v) => !v)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={Light.textSecondary} />
            </TouchableOpacity>
          </View>
          {error && <Text style={S.error}>{error}</Text>}
          <TouchableOpacity
            style={[S.primaryBtn, !ready && S.disabled]} disabled={!ready} testID="wifi-connect"
            onPress={() => {
              const name = ssid.trim();
              const sec: WifiSecurity = manual ? (needsPassword ? 'wpa' : 'open') : security;
              setSsid(name);
              void startConnect(name, password, sec, manual);
            }}
          >
            <Text style={S.primaryBtnTxt}>Connect</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.secondaryBtn} onPress={() => { setError(null); setPhase('list'); }}>
            <Text style={S.secondaryBtnTxt}>Back to the list</Text>
          </TouchableOpacity>
        </ScrollView>
      </OnboardingShell>
    );
  }

  // phase === 'list'
  return (
    <OnboardingShell>
      <View style={S.fill}>
        <Text style={S.title}>Connect to Wi-Fi</Text>
        <Text style={[S.subtitle, { marginBottom: 14 }]}>
          {mode === 'change' && current
            ? `This tablet is on "${current}". Choose a network to switch.`
            : 'Choose your salon’s Wi-Fi network. Certxa needs the internet to finish setting up.'}
        </Text>
        {error && <Text style={S.error}>{error}</Text>}

        <ScrollView style={S.list} contentContainerStyle={{ paddingVertical: 4 }}>
          {networks.map((n) => (
            <TouchableOpacity key={n.ssid} style={S.row} onPress={() => pick(n)} testID={`wifi-network-${n.ssid}`}>
              <Ionicons name="wifi" size={22} color={n.bars >= 3 ? Light.accent : n.bars >= 1 ? Light.textSecondary : Light.textMuted} />
              <Text style={S.rowName} numberOfLines={1}>{n.ssid}</Text>
              {n.ssid === current && <Text style={S.rowTag}>Connected</Text>}
              {n.security !== 'open' && <Ionicons name="lock-closed" size={16} color={Light.textMuted} />}
            </TouchableOpacity>
          ))}
          {networks.length === 0 && (
            <Text style={S.empty}>
              {scanning ? 'Looking for networks…'
                : canScan ? 'No networks found yet. Tap Refresh, or enter the network name yourself.'
                : "This tablet won't show the list of nearby networks. Enter your network's name yourself."}
            </Text>
          )}
        </ScrollView>

        <View style={S.listActions}>
          <TouchableOpacity style={S.outlineBtn} onPress={() => refreshList(true)} disabled={scanning} testID="wifi-refresh">
            {scanning ? <ActivityIndicator size="small" color={Light.accent} /> : <Ionicons name="refresh" size={18} color={Light.accent} />}
            <Text style={S.outlineBtnTxt}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.outlineBtn} onPress={enterManually} testID="wifi-manual">
            <Ionicons name="create-outline" size={18} color={Light.accent} />
            <Text style={S.outlineBtnTxt}>Other network…</Text>
          </TouchableOpacity>
          {mode === 'change' && (
            <TouchableOpacity style={S.outlineBtn} onPress={onDone} testID="wifi-close">
              <Text style={S.outlineBtnTxt}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </OnboardingShell>
  );
}

const S = StyleSheet.create({
  fill: { alignSelf: 'stretch', flex: 1 },
  formContent: { alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  iconWrap: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: '#F0F4FB',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  title: { color: Light.text, fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  subtitle: { color: Light.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 460, alignSelf: 'center', marginBottom: 28 },
  error: { color: Light.error, fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 460, alignSelf: 'center', marginBottom: 14 },
  list: { flex: 1, alignSelf: 'stretch', borderWidth: 1, borderColor: Light.cardBorder, borderRadius: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Light.cardBorder,
  },
  rowName: { flex: 1, color: Light.text, fontSize: 17, fontWeight: '600' },
  rowTag: { color: Light.success, fontSize: 13, fontWeight: '700' },
  empty: { color: Light.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, padding: 28 },
  listActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 16 },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Light.cardBorder,
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, backgroundColor: '#FFFFFF',
  },
  outlineBtnTxt: { color: Light.accent, fontSize: 15, fontWeight: '700' },
  label: { alignSelf: 'stretch', maxWidth: 420, width: '100%', color: Light.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: {
    width: '100%', maxWidth: 420, borderWidth: 1, borderColor: Light.cardBorder, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 18, color: Light.text, backgroundColor: '#FFFFFF',
  },
  passwordRow: { width: '100%', maxWidth: 420, justifyContent: 'center', marginBottom: 18 },
  passwordInput: { paddingRight: 52 },
  eye: { position: 'absolute', right: 8, padding: 10 },
  primaryBtn: { backgroundColor: Light.accent, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 32, width: '100%', maxWidth: 420, alignItems: 'center' },
  primaryBtnTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  secondaryBtn: { marginTop: 14, paddingVertical: 10 },
  secondaryBtnTxt: { color: Light.textSecondary, fontSize: 14, fontWeight: '600' },
});
