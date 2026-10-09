/**
 * wifi.ts — Wi-Fi setup from inside the app (native side: modules/certxa-app-restart WifiSetup.kt).
 *
 * Used by the first step of the setup wizard and by the "Wi-Fi" button on the "Could not load
 * portal" screen. On a tablet where Certxa is device owner (or Android 9 and older) the app can
 * join a network itself; elsewhere `canManage` is false and the screen points to Android's own
 * Wi-Fi settings.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export type WifiSecurity = 'open' | 'wep' | 'wpa' | 'sae' | 'enterprise';

export interface WifiNetwork {
  ssid: string;
  /** Signal strength, 0 (weak) to 4 (strong). */
  bars: number;
  security: WifiSecurity;
}

export interface WifiStatus {
  /** Can the app join a network by itself on this tablet? */
  canManage: boolean;
  /** Will Android give the app the list of nearby networks? */
  canScan: boolean;
  wifiEnabled: boolean;
  /** Network the tablet is on now; '' when none or when Android will not say. */
  connectedSsid: string;
  /** Android reports a usable connection of any kind (Wi-Fi, Ethernet, mobile). */
  hasNetwork: boolean;
}

interface NativeWifi {
  wifiPrepare(): void;
  wifiStatus(): WifiStatus;
  wifiStartScan(): boolean;
  wifiScanResults(): WifiNetwork[];
  wifiConnect(ssid: string, password: string, security: string, hidden: boolean): string;
  openWifiSettings(): void;
}

// The Wi-Fi functions live in the same native module as the kiosk helpers. A build made before
// they were added has the module but not the functions, hence the extra check.
const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeWifi>('CertxaAppRestart') : null;

/** Is in-app Wi-Fi setup present in this build at all? (Android builds from this version on.) */
export const wifiSetupSupported = (): boolean => !!native && typeof native.wifiStatus === 'function';

const EMPTY_STATUS: WifiStatus = { canManage: false, canScan: false, wifiEnabled: false, connectedSsid: '', hasNetwork: false };

export function wifiPrepare(): void {
  try { native?.wifiPrepare(); } catch { /* the screen falls back to manual entry / Android settings */ }
}

export function wifiStatus(): WifiStatus {
  try { return native?.wifiStatus() ?? EMPTY_STATUS; } catch { return EMPTY_STATUS; }
}

export function wifiStartScan(): boolean {
  try { return !!native?.wifiStartScan(); } catch { return false; }
}

export function wifiScanResults(): WifiNetwork[] {
  try { return native?.wifiScanResults() ?? []; } catch { return []; }
}

/** '' when Android accepted the request; otherwise a reason code (see connectProblem). */
export function wifiConnect(ssid: string, password: string, security: WifiSecurity, hidden: boolean): string {
  try { return native?.wifiConnect(ssid, password, security, hidden) ?? 'NOT_ALLOWED'; } catch { return 'ADD_FAILED'; }
}

export function openWifiSettings(): void {
  try { native?.openWifiSettings(); } catch { /* no settings app to open */ }
}

/** What to tell the installer for a reason code from wifiConnect. */
export function connectProblem(code: string): string {
  switch (code) {
    case 'SHORT_PASSWORD': return 'Wi-Fi passwords are at least 8 characters.';
    case 'NO_NAME':        return 'Enter the network name.';
    case 'UNSUPPORTED':    return "This kind of network can't be set up here. Choose a network that only needs a password.";
    case 'NOT_ALLOWED':    return "This tablet doesn't let Certxa change Wi-Fi. Use Android's Wi-Fi settings instead.";
    default:               return "The tablet couldn't save that network. Try again.";
  }
}

const PORTAL_URL = process.env.EXPO_PUBLIC_PORTAL_URL ?? 'https://certxa.com/app-login';
const PORTAL_ORIGIN = (() => { try { return new URL(PORTAL_URL).origin; } catch { return 'https://certxa.com'; } })();

/**
 * Can this tablet actually reach Certxa right now? A real request to the Certxa server — being
 * joined to a Wi-Fi network is not the same as that network having working internet.
 */
export async function canReachCertxa(timeoutMs = 8000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PORTAL_ORIGIN}/favicon.ico?wifi-check=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
