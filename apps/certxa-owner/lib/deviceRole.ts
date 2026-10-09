/**
 * Device role — which of POS / Customer Facing Screen / Kiosk this physical device is set up as.
 * Chosen once on first launch (see components/DeviceRoleSetup.tsx) and remembered from then on.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DeviceRole = 'pos' | 'frontdesk' | 'kiosk';

const STORAGE_KEY = 'certxa_device_role';

/**
 * Physical screen diagonal in inches, from React Native's density-independent pixel (dp) window
 * dimensions alone — no native module or extra dependency needed. Android defines 1dp as 1/160in
 * at the reference density, and RN's `useWindowDimensions()` is already in dp, so this division
 * holds regardless of the device's actual pixel density.
 *
 * Android-only: iOS "points" have no such fixed physical-size definition (Apple deliberately uses
 * a higher points-per-inch on smaller devices like iPad mini so UI elements read as the same
 * apparent size across the lineup) — the exact same division would silently give wrong answers on
 * iOS. See `isQualifyingIPad` below for how iPad is instead identified.
 */
export function diagonalInches(widthDp: number, heightDp: number): number {
  return Math.sqrt((widthDp / 160) ** 2 + (heightDp / 160) ** 2);
}

/**
 * Every current iPad's *shorter* window dimension in points, at any rotation, is 810pt or more —
 * except iPad mini, which is 744–768pt despite its point-diagonal landing close to the 10.2" iPad's
 * (which is why a diagonal-based check can't separate them; the short side can).
 */
const IPAD_MIN_SHORT_SIDE_PT = 800;

function isQualifyingIPad(widthDp: number, heightDp: number): boolean {
  return Platform.OS === 'ios' && !!Platform.isPad && Math.min(widthDp, heightDp) >= IPAD_MIN_SHORT_SIDE_PT;
}

/** Does this device qualify for the one-time device-role setup screen at all? */
export function deviceQualifiesForSetup(widthDp: number, heightDp: number): boolean {
  // Every fresh install must start with device setup. Screen dimensions,
  // platform, orientation, and OEM display scaling must never bypass the
  // wizard. The arguments remain for compatibility with the existing caller.
  return true;
}

export async function getStoredDeviceRole(): Promise<DeviceRole | null> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    return v === 'pos' || v === 'frontdesk' || v === 'kiosk' ? v : null;
  } catch {
    return null;
  }
}

export async function setStoredDeviceRole(role: DeviceRole): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, role);
  } catch {}
}
