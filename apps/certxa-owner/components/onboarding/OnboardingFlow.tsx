/**
 * OnboardingFlow — the one-time device setup wizard. Owns every step so app/index.tsx just renders
 * this while unresolved and gets a single `onComplete(role)` callback at the end.
 *
 * Steps:
 *   1. Wi-Fi — WifiSetupScreen.tsx. Skipped by itself when the tablet can already reach Certxa;
 *      otherwise setup does not move on until it can.
 *   2. Role pick (POS / Customer Facing Screen / Kiosk) — DeviceRoleSetup.tsx
 *   3. On each device: "set up your receipt printer now?"
 *   4. If yes: plain-language cable-connection walkthrough, then on-screen-keypad IP entry,
 *      then a save confirmation with an optional test print.
 * Customer-facing devices can print their own check-in slips, so they need their
 * own locally saved printer just like a POS tablet.
 */
import React, { useState } from 'react';
import { DeviceRoleSetup } from '@/components/DeviceRoleSetup';
import { WifiSetupScreen } from '@/components/onboarding/WifiSetupScreen';
import { AskPrinterScreen } from '@/components/onboarding/AskPrinterScreen';
import { PrinterInstructions } from '@/components/onboarding/PrinterInstructions';
import { PrinterIpEntry } from '@/components/onboarding/PrinterIpEntry';
import { PrinterSetupDone } from '@/components/onboarding/PrinterSetupDone';
import type { DeviceRole } from '@/lib/deviceRole';

type Step = 'wifi' | 'role' | 'ask-printer' | 'printer-instructions' | 'printer-ip' | 'printer-done';

export function OnboardingFlow({ onComplete }: { onComplete: (role: DeviceRole) => void }) {
  const [step, setStep] = useState<Step>('wifi');
  const [savedIp, setSavedIp] = useState<string | null>(null);
  const [setupRole, setSetupRole] = useState<DeviceRole>('pos');

  const handleRolePick = (role: DeviceRole) => {
    setSetupRole(role);
    setStep('ask-printer');
  };

  switch (step) {
    case 'wifi':
      return (
        <WifiSetupScreen mode="setup" onDone={() => setStep('role')} />
      );
    case 'role':
      return (
        <DeviceRoleSetup onPick={handleRolePick} />
      );
    case 'ask-printer':
      return (
        <AskPrinterScreen
          onYes={() => setStep('printer-instructions')}
          onNo={() => onComplete(setupRole)}
        />
      );
    case 'printer-instructions':
      return (
        <PrinterInstructions
          onNext={() => setStep('printer-ip')}
          onSkip={() => onComplete(setupRole)}
        />
      );
    case 'printer-ip':
      return (
        <PrinterIpEntry
          onDone={(ip) => { setSavedIp(ip); setStep('printer-done'); }}
          onBack={() => setStep('printer-instructions')}
          onSkip={() => onComplete(setupRole)}
        />
      );
    case 'printer-done':
      return (
        <PrinterSetupDone ip={savedIp ?? ''} onContinue={() => onComplete(setupRole)} />
      );
  }
}
