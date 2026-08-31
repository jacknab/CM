/**
 * POSModal.tsx — Native POS checkout sheet (tablet landscape layout)
 *
 * Layout mirrors the reference retail-POS design:
 *   LEFT   (~26%) — cart / order summary
 *   CENTER (~52%) — amount display + numpad + quick-cash row
 *   RIGHT  (~22%) — payment-method action buttons with coloured accent strips
 *   BOTTOM         — dark navigation bar
 *
 * Portrait guard: full-screen overlay prompting the user to rotate.
 *
 * Uses @stripe/stripe-terminal-react-native@0.0.1-beta.31 API:
 *  - M2 Bluetooth: discoverReaders (bluetoothScan) + connectReader
 *  - Tap to Pay:   easyConnect (tapToPay) — single call, no discover step
 *
 * All authenticated API calls proxy through the WebView bridge via apiCaller.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Animated, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { Colors } from '@/constants/colors';
import { apiCaller } from '@/lib/terminalBridge';
import { terminalDiag } from '@/lib/terminalDiag';
import { useReaderDiscovery } from '@/lib/useReaderDiscovery';
import { useTerminalPayment }  from '@/lib/useTerminalPayment';
import { printReceipt, type ReceiptData, type CardDetails } from '@/lib/printer';
import { PrinterSetupModal } from '@/components/PrinterSetupModal';

// ─── Light-theme palette (matches reference design) ───────────────────────────

const P = {
  bgRoot:      '#EBEDF2',
  bgLeft:      '#E5E7EF',
  bgCenter:    '#EBEDF2',
  bgRight:     '#EBEDF2',
  bgKey:       '#FFFFFF',
  bgKeyAlt:    '#F3F4F8',   // utility keys (⌫, C)
  bgEnter:     '#00897B',   // teal — exactly as in reference
  bgEnterDim:  '#80CBC4',
  bgBottomBar: '#1A1B2E',
  border:      '#DDE0E8',
  borderDark:  '#C8CBD6',
  text:        '#1C2333',
  textSub:     '#6B7480',
  textMuted:   '#A0A8B8',
  white:       '#FFFFFF',
  // Payment method accent colours
  accentCash:  '#16A34A',
  accentCard:  '#2563EB',
  accentM2:    '#D97706',
  accentTap:   '#7C3AED',
  // Status
  success:     '#16A34A',
  error:       '#DC2626',
  errorBg:     '#FEE2E2',
  warning:     '#D97706',
};

/** Colors for the 5 bouncing dots in the M2 reader waiting overlay */
const M2_DOT_COLORS = ['#E8705A', '#E0923A', '#D44040', '#E8A040', '#6AB84A'];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface POSData {
  appointmentId: number;
  clientName:    string;
  serviceName:   string;
  servicePrice:  number;
  addons:        Array<{ name: string; price: number }>;
  subtotal:      number;
  tax:           number;
  grandTotal:    number;
  storeName?:    string;
  storeAddress?: string;
  storePhone?:   string;
}

export interface CategoryBtn {
  id:           string;
  label?:       string;
  accentColor?: string;
  price?:       number;   // set when linked to a service; tapping adds item to cart
}

export interface POSStoreInfo {
  storeNumber?:   string;
  posId?:         string;
  associateName?: string;
  shiftNumber?:   string;
}

interface Props {
  visible:                boolean;
  data:                   POSData | null;
  onClose:                () => void;
  onPaymentComplete:      (appointmentId: number, method: string, amount: number) => void;
  /** Navigate the WebView back to the calendar page and close the POS */
  onNavigateToCalendar?:  () => void;
  storeInfo?:             POSStoreInfo;
  categoryButtons?:       CategoryBtn[];
  onCategoryButtonPress?: (id: string) => void;
}

type PayMethod   = 'cash' | 'card' | 'm2' | 'tap';
type ReaderPhase =
  | 'idle' | 'discovering' | 'connecting' | 'connected'
  | 'collecting' | 'processing' | 'success' | 'error';

// ─── Component ────────────────────────────────────────────────────────────────

export function POSModal({
  visible, data, onClose, onPaymentComplete, onNavigateToCalendar,
  storeInfo, categoryButtons, onCategoryButtonPress,
}: Props) {
  const insets                = useSafeAreaInsets();
  const { width, height }     = useWindowDimensions();
  const isLandscape           = width > height;

  // Live clock for status bar — updates every second
  const [clockStr, setClockStr] = useState(() =>
    new Date().toLocaleString('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  );
  useEffect(() => {
    const id = setInterval(() => {
      setClockStr(new Date().toLocaleString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const [checkoutPhase, setCheckoutPhase] = useState<'building' | 'paying'>('building');
  const [method, setMethod]             = useState<PayMethod | null>(null);
  const [numInput, setNumInput]         = useState('');
  const [manualItems, setManualItems]   = useState<Array<{ id: number; amount: number; name?: string }>>([]);
  const [phase, setPhase]               = useState<ReaderPhase>('idle');
  const [readerError, setReaderError]   = useState('');
  // Mirror of `phase` kept in a ref so the onDidChangeConnectionStatus closure
  // always sees the current value without causing it to be re-created on every render.
  const phaseRef = useRef<ReaderPhase>('idle');
  const [statusMsg, setStatusMsg]       = useState('');
  const [printStatus, setPrintStatus]     = useState<'idle'|'printing'|'done'|'error'>('idle');
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const successScale                    = useRef(new Animated.Value(0)).current;

  /** Five staggered animated values that drive the bouncing dot overlay */
  const dotAnims = useRef(
    [0, 1, 2, 3, 4].map(() => new Animated.Value(0))
  ).current;

  /** Running total of cash already tendered for partial-payment support */
  const [cashTendered, setCashTendered] = useState(0);

  /** Snapshot captured at the moment of full payment — drives the completion screen */
  const [completionSnap, setCompletionSnap] = useState<{
    apptId:        number;
    method:        string;
    amount:        number;
    cashTendered:  number;
    changeDue:     number;
    subSnap:       number;
    taxSnap:       number;
    totalSnap:     number;
    itemsSnap:     Array<{ name: string; price: number }>;
    cardDetails?:  CardDetails;
  } | null>(null);

  /** null = loading | true = connected | false = no account */
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);

  /**
   * Converts the Stripe SDK's generic "First initialize the Terminal SDK"
   * error into the actual failure reason captured by terminalDiag, so the
   * user (and us) can see what the tokenProvider really threw — e.g.
   * a network error or server-side failure.
   */
  const resolveTerminalError = useCallback((err: any): string => {
    const msg: string = err?.message ?? String(err ?? 'Unknown error');
    if (msg.includes('First initialize') || msg.includes('initialize the')) {
      const diagError = terminalDiag.sdkInitialized.error;
      if (diagError) {
        return `Terminal SDK not initialized.\n\nReason: ${diagError}\n\nTry closing and reopening the app.`;
      }
      return 'Terminal SDK not initialized. Try closing and reopening the app.';
    }
    return msg;
  }, []);
  /** true = this device has NFC and can run Stripe Tap to Pay */
  const [tapToPaySupported, setTapToPaySupported] = useState(false);

  /** Controls the rescan / reader-status popup in the bottom bar */
  const [rescanVisible,  setRescanVisible]  = useState(false);
  const [rescanPhase,    setRescanPhase]    = useState<'idle' | 'scanning' | 'connecting' | 'connected' | 'error'>('idle');
  const [rescanError,    setRescanError]    = useState('');

  /** Controls the printer setup modal */
  const [printerSetupVisible, setPrinterSetupVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStripeConnected(null);
    setTapToPaySupported(false);
    apiCaller.call('/api/payments/stripe/status', 'GET')
      .then((res: any) => setStripeConnected(res?.connected === true))
      .catch(() => setStripeConnected(false));
  }, [visible]);

  // ── Live POS grid fetch ───────────────────────────────────────────────────────
  // Pulled from the web app's "Grid Layouts" editor — replaces the external
  // categoryButtons prop as the source of truth for the 6×4 button grid.
  const [gridSlots, setGridSlots] = useState<Array<CategoryBtn | undefined>>(new Array(24).fill(undefined));
  useEffect(() => {
    if (!visible) { setGridSlots(new Array(24).fill(undefined)); return; }
    apiCaller.call('/api/pos/grid/live', 'GET')
      .then((res: any) => {
        if (!res?.slots) return;
        const next: Array<CategoryBtn | undefined> = new Array(24).fill(undefined);
        for (const s of res.slots as any[]) {
          const idx = typeof s.slotIndex === 'number' ? s.slotIndex : undefined;
          if (idx === undefined || idx < 0 || idx > 23) continue;
          const lbl = (s.serviceName as string | null) || (s.label as string | null) || undefined;
          if (!lbl && !s.bandColor) continue;
          next[idx] = {
            id:          String(s.serviceId ?? `slot-${idx}`),
            label:       lbl,
            accentColor: (s.bandColor as string | null) ?? undefined,
            price:       s.servicePrice != null ? parseFloat(String(s.servicePrice)) : undefined,
          };
        }
        setGridSlots(next);
      })
      .catch(() => {});
  }, [visible]);

  // ── Tap to Pay capability probe ───────────────────────────────────────────────
  // Once Stripe Connect is confirmed we probe for NFC / Tap-to-Pay support.
  //
  // IMPORTANT: StripeTerminalProvider initialises asynchronously.  If we call
  // discoverReaders before the SDK is ready it throws "First initialize the
  // Stripe Terminal SDK before performing this action."  We therefore defer the
  // probe by 2 s (enough for the SDK to complete its async init), and on any
  // initialisation error we simply mark tapToPay as unsupported — we never
  // surface the error to the user here.
  useEffect(() => {
    if (stripeConnected !== true) return;
    let abandoned = false;

    const probe = async () => {
      // Give the SDK time to finish initialising before we call a method on it.
      await new Promise<void>(r => setTimeout(r, 2_000));
      if (abandoned) return;

      try {
        const res = await discoverReaders({ discoveryMethod: 'tapToPay', simulated: false });
        if (!abandoned) setTapToPaySupported(!res?.error);
      } catch (err: unknown) {
        // SDK not yet initialized, NFC unavailable, or device doesn't support it.
        // Any of these mean tap-to-pay should not be offered — fail silently.
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('First initialize')) {
          // Log unexpected errors (but not the expected init-race) to aid debugging.
          console.warn('[POSModal] tapToPay probe error:', err);
        }
        if (!abandoned) setTapToPaySupported(false);
      } finally {
        cancelDiscovering().catch(() => {});
      }
    };

    probe();
    return () => { abandoned = true; cancelDiscovering().catch(() => {}); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripeConnected]);

  // ── Bouncing dot animation — active whenever M2 reader is busy ───────────────
  useEffect(() => {
    const isM2Active = method === 'm2' && (
      phase === 'discovering' || phase === 'connecting' ||
      phase === 'collecting'  || phase === 'processing'
    );
    if (!isM2Active) {
      dotAnims.forEach(a => { a.stopAnimation(); a.setValue(0); });
      return;
    }

    // Each dot bounces up then back; offset by 140 ms per dot for a wave effect.
    const STAGGER     = 140;   // ms between each dot start
    const UP_DUR      = 280;   // ms going up
    const DOWN_DUR    = 320;   // ms coming down
    const PAUSE       = 300;   // ms pause before loop restarts
    const totalCycle  = STAGGER * (dotAnims.length - 1) + UP_DUR + DOWN_DUR + PAUSE;

    const loops = dotAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * STAGGER),
          Animated.timing(anim, { toValue: -22, duration: UP_DUR,   useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0,   duration: DOWN_DUR, useNativeDriver: true }),
          Animated.delay(Math.max(0, totalCycle - i * STAGGER - UP_DUR - DOWN_DUR)),
        ])
      )
    );
    const composite = Animated.parallel(loops);
    composite.start();
    return () => { composite.stop(); dotAnims.forEach(a => a.setValue(0)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, phase]);

  // ── Effective totals (appointment + manual items) — computed early so ────────
  // ── all callbacks (runM2Payment, handleCashComplete, etc.) can reference ─────
  const effectiveTotals = useMemo(() => {
    if (!data) return {
      manualSubtotal: 0, effectiveSubtotal: 0,
      effectiveTax: 0, effectiveTotal: 0,
      taxRate: 0, totalItemCount: 1,
    };
    const manualSubtotal    = manualItems.reduce((s, i) => s + i.amount, 0);
    const taxRate           = data.subtotal > 0 ? data.tax / data.subtotal : 0;
    const effectiveSubtotal = data.subtotal + manualSubtotal;
    const effectiveTax      = effectiveSubtotal * taxRate;
    const effectiveTotal    = effectiveSubtotal + effectiveTax;
    const totalItemCount    = 1 + data.addons.length + manualItems.length;
    return { manualSubtotal, effectiveSubtotal, effectiveTax, effectiveTotal, taxRate, totalItemCount };
  }, [data, manualItems]);

  // Prevents concurrent payment attempts (e.g. double-tap of Charge button).
  // A ref rather than state so the guard is always current inside async closures.
  const busyRef = useRef(false);

  // Hooks that own M2 discovery/connection and the payment intent lifecycle.
  // Mirrors the MainViewModel / CheckoutViewModel split in the Stripe sample.
  const discovery = useReaderDiscovery();
  const payment   = useTerminalPayment();

  const {
    discoverReaders,    // tapToPay capability probe only
    cancelDiscovering,  // tapToPay probe cleanup
    easyConnect,
    cancelEasyConnect,
    connectedReader,
  } = useStripeTerminal({
    onDidChangeConnectionStatus: (status: string) => {
      if (status === 'not_connected') {
        console.warn('[Stripe] Reader disconnected');
        const activePaymentPhases: ReaderPhase[] = ['connecting', 'connected', 'collecting', 'processing'];
        if (activePaymentPhases.includes(phaseRef.current)) {
          setPhase('error');
          setReaderError('Reader disconnected during payment. Please try again.');
        } else {
          setPhase('idle');
          setReaderError('');
        }
      } else if (status === 'connecting') {
        console.log('[Stripe] Reader reconnecting…');
      } else {
        console.log('[Stripe] onDidChangeConnectionStatus →', status);
      }
    },

    // ── Reader firmware update callbacks ─────────────────────────────────────
    // connectReader() holds CONNECTING until updates finish — these keep the
    // user informed so the screen doesn't look frozen during a long update.
    onDidStartInstallingUpdate: (update: any) => {
      console.log('[Stripe] Reader update started:', update?.version ?? 'unknown version');
      setStatusMsg('Installing reader update… please keep the reader nearby.');
    },
    onDidReportReaderSoftwareUpdateProgress: (progress: string) => {
      const pct = Math.round((parseFloat(progress) || 0) * 100);
      setStatusMsg(`Installing reader update… ${pct}%`);
    },
    onDidFinishInstallingUpdate: ({ error }: { error?: { message: string } }) => {
      if (error) {
        console.warn('[Stripe] Reader update failed:', error.message);
        setStatusMsg('Update failed — retrying connection…');
      } else {
        console.log('[Stripe] Reader update complete');
        setStatusMsg('Update complete. Connecting…');
      }
    },
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // Keep phaseRef in sync so connection-status callbacks see fresh value.
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Safety reset: whenever the modal is hidden, clear all transient state so the
  // next open always starts from a known-good initial state.
  useEffect(() => {
    if (!visible) {
      setCheckoutPhase('building');
      setMethod(null); setNumInput(''); setManualItems([]); setPhase('idle');
      phaseRef.current = 'idle';
      setReaderError(''); setStatusMsg(''); setPrintStatus('idle');
      setCashTendered(0); setCompletionSnap(null);
      successScale.setValue(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const reset = useCallback(() => {
    setCheckoutPhase('building');
    setMethod(null); setNumInput(''); setManualItems([]); setPhase('idle');
    phaseRef.current = 'idle';
    setReaderError(''); setStatusMsg(''); setPrintStatus('idle');
    setCashTendered(0); setCompletionSnap(null);
    successScale.setValue(0);
  }, [successScale]);

  const handleClose = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  /**
   * Called once the ticket is fully paid (any method).
   * Sets phase → 'success', snapshots the receipt data, and waits for the
   * user to pick NO RECEIPT / PRINT RECEIPT / PREVIEW RECEIPT.
   */
  const showSuccess = useCallback((
    apptId: number, meth: string, amount: number,
    overrideCashTendered?: number,
    cardDetails?: CardDetails,
  ) => {
    if (!data) return;
    setPhase('success');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.spring(successScale, { toValue: 1, useNativeDriver: true }).start();

    const snap      = effectiveTotals;
    const snapItems = manualItems.slice();
    const totalPaid = overrideCashTendered ?? (meth === 'cash' ? cashTendered + (parseFloat(numInput) || 0) : amount);
    const change    = meth === 'cash' ? Math.max(0, totalPaid - snap.effectiveTotal) : 0;
    const isCash    = meth === 'cash' || meth.startsWith('cash +');

    const lineItems = [
      { name: data.serviceName, price: data.servicePrice },
      ...data.addons,
      ...snapItems.map(i => ({ name: i.name || `Item ${i.amount.toFixed(2)}`, price: i.amount })),
    ];

    const snap_ = {
      apptId, method: meth, amount,
      cashTendered: totalPaid, changeDue: change,
      subSnap:   snap.effectiveSubtotal,
      taxSnap:   snap.effectiveTax,
      totalSnap: snap.effectiveTotal,
      itemsSnap: lineItems,
      cardDetails,
    };
    setCompletionSnap(snap_);

    // Auto-print silently to the saved printer — no dialog.
    setPrintStatus('printing');
    const receiptData: ReceiptData = {
      storeName:     data.storeName ?? 'Certxa',
      storeAddress:  data.storeAddress,
      storePhone:    data.storePhone,
      receiptNumber: apptId,
      date:          new Date().toISOString(),
      clientName:    data.clientName,
      items:         lineItems,
      subtotal:      snap.effectiveSubtotal,
      tax:           snap.effectiveTax,
      grandTotal:    snap.effectiveTotal,
      paymentMethod: meth.toUpperCase(),
      amountPaid:    isCash ? totalPaid : snap.effectiveTotal,
      changeDue:     isCash ? change    : 0,
      cardDetails,
    };
    printReceipt(receiptData)
      .then(() => setPrintStatus('done'))
      .catch(() => setPrintStatus('error'));
  }, [data, manualItems, effectiveTotals, cashTendered, numInput, successScale]);

  /**
   * Called from the success screen.
   * - 'none'    → close POS and navigate back to /calendar (no reprint)
   * - 'print'   → receipt already auto-printed; close POS and navigate to /calendar
   * - 'preview' → open the in-app receipt preview modal (stays on success screen)
   */
  const handleReceiptDismiss = useCallback((action: 'none' | 'print' | 'preview') => {
    if (!completionSnap) { reset(); onClose(); return; }

    if (action === 'preview') {
      setShowReceiptPreview(true);
      return;
    }

    // Both 'none' and 'print' finalize the transaction and go to calendar.
    // Auto-print already fired in showSuccess; 'print' just acknowledges it.
    onPaymentComplete(completionSnap.apptId, completionSnap.method, completionSnap.amount);
    reset();
    onNavigateToCalendar?.();
  }, [completionSnap, onPaymentComplete, onNavigateToCalendar, reset, onClose]);

  /**
   * Cash tender handler — supports partial payments.
   * If the running total hasn't reached the ticket amount, keeps the ticket
   * open and shows the remaining balance.  Once fully covered, fires showSuccess.
   */
  const handleCashTender = useCallback(() => {
    if (!data) return;
    const thisPayment = parseFloat(numInput) || 0;
    if (thisPayment <= 0) return;
    const runningTotal = cashTendered + thisPayment;
    if (runningTotal < effectiveTotals.effectiveTotal) {
      // Partial — keep ticket open
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCashTendered(runningTotal);
      setNumInput('');
    } else {
      // Fully paid
      showSuccess(data.appointmentId, 'cash', effectiveTotals.effectiveTotal, runningTotal);
    }
  }, [data, numInput, cashTendered, effectiveTotals, showSuccess]);

  /**
   * Cancels an in-progress M2 reader payment at any stage.
   * Safe to call from any phase — all cancel calls are wrapped in try/catch.
   */
  const handleCancelM2 = useCallback(async () => {
    await payment.cancel();
    await discovery.cancelDiscovery();
    setPhase('idle');
    setReaderError('');
    setStatusMsg('');
  }, [payment, discovery]);

  // ── Numpad input (shared for "add item" mode and cash tendering) ──────────────

  const handleKey = (key: string) => {
    Haptics.selectionAsync();
    setNumInput(prev => {
      if (key === 'C')   return '';
      if (key === '⌫')   return prev.length <= 1 ? '' : prev.slice(0, -1);
      if (key === '.')   return prev.includes('.') ? prev : (prev || '0') + '.';
      if (key === '00') {
        if (!prev || prev === '0') return prev;
        const p = prev.split('.');
        if (p[1] && p[1].length >= 1) return prev;
        return prev + '00';
      }
      if ((prev === '' || prev === '0') && key !== '.') return key;
      const p = prev.split('.');
      if (p[1] && p[1].length >= 2) return prev;
      return prev + key;
    });
  };

  const handleQuickCash = (amount: number) => {
    Haptics.selectionAsync();
    setNumInput(String(amount));
  };

  const handleAddItem = () => {
    const amount = parseFloat(numInput) || 0;
    if (amount <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setManualItems(prev => [...prev, { id: Date.now(), amount }]);
    setNumInput('');
  };

  const handleRemoveItem = (id: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setManualItems(prev => prev.filter(i => i.id !== id));
  };

  // ── M2 flow ───────────────────────────────────────────────────────────────────

  const runM2Payment = useCallback(async () => {
    if (!data || busyRef.current) return;
    busyRef.current = true;
    try {
      const locationId = await payment.getLocationId();
      await discovery.discoverAndConnect(locationId, 'bluetoothScan', {
        onDiscovering: () => { setPhase('discovering'); setStatusMsg('Scanning for M2 reader…'); },
        onConnecting:  () => { setPhase('connecting');  setStatusMsg('Connecting to reader…');   },
      });
      // Charge only what remains after any prior cash payments
      const remainingAmt = Math.max(0, effectiveTotals.effectiveTotal - cashTendered);
      const { cardDetails } = await payment.run(
        Math.round(remainingAmt * 100),
        data.appointmentId, data.clientName, 'm2',
        { onPhase: setPhase, onStatus: setStatusMsg },
      );
      // Label the method as split when cash was already collected
      const method = cashTendered > 0 ? 'cash + m2' : 'm2';
      showSuccess(data.appointmentId, method, effectiveTotals.effectiveTotal, undefined, cardDetails);
    } catch (err: any) {
      await discovery.cancelDiscovery();
      await payment.cancel();
      console.error('[Stripe] M2 payment failed:', err?.message ?? err);
      setPhase('error'); setReaderError(resolveTerminalError(err));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      busyRef.current = false;
    }
  }, [data, cashTendered, effectiveTotals, discovery, payment, showSuccess, resolveTerminalError]);

  // ── Tap to Pay flow ───────────────────────────────────────────────────────────

  const runTapToPayPayment = useCallback(async () => {
    if (!data || busyRef.current) return;
    busyRef.current = true;
    try {
      setPhase('connecting'); setStatusMsg('Initialising Tap to Pay…');
      console.log('[Stripe] easyConnect() — tapToPay');
      const locationId = await payment.getLocationId();
      const { reader: conn, error: connErr } = await easyConnect({ discoveryMethod: 'tapToPay', locationId, simulated: false, tosAcceptancePermitted: true });
      if (connErr || !conn) throw new Error(connErr?.message ?? 'Tap to Pay not available on this device');
      console.log('[Stripe] Reader connected (Tap to Pay)');
      // Charge only what remains after any prior cash payments
      const remainingAmt = Math.max(0, effectiveTotals.effectiveTotal - cashTendered);
      const { cardDetails } = await payment.run(
        Math.round(remainingAmt * 100),
        data.appointmentId, data.clientName, 'tap',
        { onPhase: setPhase, onStatus: setStatusMsg },
      );
      // Label the method as split when cash was already collected
      const method = cashTendered > 0 ? 'cash + tap' : 'tap';
      showSuccess(data.appointmentId, method, effectiveTotals.effectiveTotal, undefined, cardDetails);
    } catch (err: any) {
      await payment.cancel();
      try { await cancelEasyConnect(); } catch {}
      console.error('[Stripe] Tap to Pay failed:', err?.message ?? err);
      setPhase('error'); setReaderError(resolveTerminalError(err));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      busyRef.current = false;
    }
  }, [data, cashTendered, effectiveTotals, easyConnect, cancelEasyConnect, payment, showSuccess, resolveTerminalError]);

  // ── Rescan: discover + connect only, no payment ───────────────────────────────
  // Used by the bottom-bar reader status popup so staff can pre-pair the M2
  // reader before a customer is at the counter.

  // Pre-pair the M2 reader before a customer is at the counter.
  // The discovery hook handles BLE permissions, scan, and connect.
  const runDiscoverAndConnect = useCallback(async () => {
    setRescanPhase('scanning');
    setRescanError('');
    try {
      const locationId = await payment.getLocationId();
      await discovery.discoverAndConnect(locationId, 'bluetoothScan', {
        onDiscovering: () => setRescanPhase('scanning'),
        onConnecting:  () => setRescanPhase('connecting'),
      });
      setRescanPhase('connected');
    } catch (err: any) {
      await discovery.cancelDiscovery();
      setRescanPhase('error');
      setRescanError(resolveTerminalError(err));
    }
  }, [discovery, payment, resolveTerminalError]);

  const handleCardComplete = () => {
    if (!data) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showSuccess(data.appointmentId, 'card', effectiveTotals.effectiveTotal);
  };

  const handleEnter = () => {
    if (isBusy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (checkoutPhase === 'building') {
      handleAddItem();
      return;
    }

    if (!method) return;
    switch (method) {
      case 'cash': handleCashTender(); break;
      case 'card': handleCardComplete(); break;
      case 'm2':   if (phase === 'idle' || phase === 'error') runM2Payment(); break;
      case 'tap':  if (phase === 'idle' || phase === 'error') runTapToPayPayment(); break;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!data) return null;

  // ── Destructure from useMemo (computed early in the component) ─────────────
  const {
    effectiveSubtotal, effectiveTax, effectiveTotal, totalItemCount,
  } = effectiveTotals;

  const cashNum         = parseFloat(numInput) || 0;
  const remainingBalance = Math.max(0, effectiveTotal - cashTendered);
  const cashEnough      = cashTendered + cashNum >= remainingBalance && cashNum > 0;
  const changeDue       = Math.max(0, cashTendered + cashNum - effectiveTotal);
  const isBusy          = ['discovering','connecting','collecting','processing'].includes(phase);

  // methodConfig drives the hint text in the center display box
  // (button rendering is explicit below, not looped)

  // ENTER / PAY enabled logic differs by phase
  // Cash: PAY is enabled whenever there is any amount typed (partial payments allowed)
  const enterEnabled = checkoutPhase === 'building'
    ? cashNum > 0
    : (!!method && !isBusy && (method !== 'cash' || cashNum > 0));

  // Numpad rows — 4th column icons differ by phase
  // building: ⌫  C  .  (standard)
  // paying:   ⌫  ↺  X/Qty
  type NumKey = { k: string; alt?: boolean; icon?: string; iconColor?: string; subLabel?: string; cream?: boolean };
  const NUMPAD_ROWS: NumKey[][] = checkoutPhase === 'building'
    ? [
        [{ k:'7' }, { k:'8' }, { k:'9' }, { k:'⌫', alt: true }],
        [{ k:'4' }, { k:'5' }, { k:'6' }, { k:'C',  alt: true }],
        [{ k:'1' }, { k:'2' }, { k:'3' }, { k:'.',  alt: false }],
      ]
    : [
        [{ k:'7' }, { k:'8' }, { k:'9' }, { k:'⌫', alt: true }],
        [{ k:'4' }, { k:'5' }, { k:'6' }, { k:'↺',  cream: true }],
        [{ k:'1' }, { k:'2' }, { k:'3' }, { k:'✕',  iconColor: P.bgEnter, subLabel: 'Qty' }],
      ];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={!isBusy ? handleClose : undefined}
      statusBarTranslucent
    >
      {/* ── Portrait lock ────────────────────────────────────────────────── */}
      {!isLandscape && (
        <View style={S.portraitOverlay}>
          <View style={S.portraitCard}>
            <Ionicons name="phone-landscape-outline" size={60} color={P.bgEnter} />
            <Text style={S.portraitTitle}>Rotate Your Tablet</Text>
            <Text style={S.portraitSub}>
              The checkout screen works in landscape orientation only.
              Please rotate your tablet to continue.
            </Text>
          </View>
        </View>
      )}

      {/* ── Outer shell: panels + bottom bar stacked vertically ─────────── */}
      <View style={[S.shell, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>

        {/* ─ STATUS BAR ─ */}
        <View style={S.statusBar}>
          <Text style={S.statusBarTxt} numberOfLines={1}>
            {[
              storeInfo?.storeNumber   ? `Store # ${storeInfo.storeNumber}`           : null,
              storeInfo?.posId         ? `POS: ${storeInfo.posId}`                    : null,
              storeInfo?.associateName ? `Store Associate: ${storeInfo.associateName}` : null,
              storeInfo?.shiftNumber   ? `Shift: ${storeInfo.shiftNumber}`             : null,
              clockStr,
            ].filter(Boolean).join(' | ')}
          </Text>
        </View>

        {/* ─ PANELS ROW ─ */}
        <View style={S.panelsRow}>

          {/* ══ LEFT PANEL ══ */}
          <View style={S.leftPanel}>
            {checkoutPhase === 'paying' ? (
              /* White card background when items are in the cart */
              <View style={{ flex: 1, backgroundColor: P.white }}>
                {/* Transaction header */}
                <View style={S.txnHeader}>
                  <Text style={S.txnTitle} numberOfLines={1}>
                    Transaction {data?.appointmentId}-A
                  </Text>
                  <View style={S.itemCountBadge}>
                    <Text style={S.itemCountTxt}>
                      {totalItemCount}{' '}
                      {totalItemCount === 1 ? 'item' : 'items'}
                    </Text>
                  </View>
                </View>

                {/* Item list */}
                <ScrollView
                  style={{ flex: 1 }}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={S.itemsContent}
                >
                  {/* Main service */}
                  {data && (
                    <View style={S.itemRow}>
                      <View style={S.itemQtyBox}><Text style={S.itemQty}>1</Text></View>
                      <Text style={S.itemName} numberOfLines={2}>{data.serviceName}</Text>
                      <Text style={S.itemPrice}>{data.servicePrice.toFixed(2)}</Text>
                    </View>
                  )}
                  {/* Add-ons */}
                  {data?.addons.map((addon, i) => (
                    <View key={`addon-${i}`} style={S.itemRow}>
                      <View style={S.itemQtyBox}><Text style={S.itemQty}>1</Text></View>
                      <Text style={S.itemName} numberOfLines={2}>{addon.name}</Text>
                      <Text style={S.itemPrice}>{addon.price.toFixed(2)}</Text>
                    </View>
                  ))}
                  {/* Manual items */}
                  {manualItems.map((item) => (
                    <View key={item.id} style={S.itemRow}>
                      <View style={S.itemQtyBox}><Text style={S.itemQty}>1</Text></View>
                      <Text style={S.itemName} numberOfLines={2}>{item.name ?? 'Item'}</Text>
                      <Text style={S.itemPrice}>{item.amount.toFixed(2)}</Text>
                    </View>
                  ))}
                </ScrollView>

                {/* Totals strip — SUBTOTAL / TAX / TOTAL / CASH / BALANCE DUE */}
                <View style={S.totalsStrip}>
                  <View style={S.totRow}>
                    <Text style={S.totLabel}>SUBTOTAL:</Text>
                    <Text style={S.totValue}>{effectiveSubtotal.toFixed(2)}</Text>
                  </View>
                  <View style={S.totRow}>
                    <Text style={S.totLabel}>TAX:</Text>
                    <Text style={S.totValue}>{effectiveTax.toFixed(2)}</Text>
                  </View>
                  <View style={[S.totRow, S.totRowTotal]}>
                    <Text style={S.totTotalLabel}>TOTAL:</Text>
                    <Text style={S.totTotalValue}>{effectiveTotal.toFixed(2)}</Text>
                  </View>
                  {cashTendered > 0 && (
                    <>
                      <View style={S.totRow}>
                        <Text style={S.totLabel}>CASH:</Text>
                        <Text style={[S.totValue, { color: '#F97316' }]}>{cashTendered.toFixed(2)}</Text>
                      </View>
                      <View style={S.balanceDueRow}>
                        <Text style={S.balanceDueLabel}>BALANCE DUE:</Text>
                        <Text style={S.balanceDueValue}>{remainingBalance.toFixed(2)}</Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            ) : (
              /* Building phase — show appointment items + any manually-added items.
                 The "Add an Item" empty state is never shown when real data exists
                 (and data is always set when the modal is opened from checkout). */
              <View style={{ flex: 1, backgroundColor: P.white }}>
                {/* Transaction header */}
                <View style={S.txnHeader}>
                  <Text style={S.txnTitle} numberOfLines={1}>
                    Transaction {data?.appointmentId}-A
                  </Text>
                  <View style={S.itemCountBadge}>
                    <Text style={S.itemCountTxt}>
                      {totalItemCount}{' '}
                      {totalItemCount === 1 ? 'item' : 'items'}
                    </Text>
                  </View>
                </View>

                {/* Item list */}
                <ScrollView
                  style={{ flex: 1 }}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={S.itemsContent}
                >
                  {/* Main service from booking */}
                  {data && (
                    <View style={S.itemRow}>
                      <View style={S.itemQtyBox}><Text style={S.itemQty}>1</Text></View>
                      <Text style={S.itemName} numberOfLines={2}>{data.serviceName}</Text>
                      <Text style={S.itemPrice}>{data.servicePrice.toFixed(2)}</Text>
                      <View style={S.itemDeletePlaceholder} />
                    </View>
                  )}
                  {/* Add-ons from booking */}
                  {data?.addons.map((addon, i) => (
                    <View key={`addon-${i}`} style={S.itemRow}>
                      <View style={S.itemQtyBox}><Text style={S.itemQty}>1</Text></View>
                      <Text style={S.itemName} numberOfLines={2}>{addon.name}</Text>
                      <Text style={S.itemPrice}>{addon.price.toFixed(2)}</Text>
                      <View style={S.itemDeletePlaceholder} />
                    </View>
                  ))}
                  {/* Manual items added via numpad */}
                  {manualItems.map((item) => (
                    <View key={item.id} style={S.itemRow}>
                      <View style={S.itemQtyBox}><Text style={S.itemQty}>1</Text></View>
                      <Text style={S.itemName} numberOfLines={2}>{item.name ?? 'Item'}</Text>
                      <Text style={S.itemPrice}>{item.amount.toFixed(2)}</Text>
                      <TouchableOpacity style={S.itemDeleteBtn} onPress={() => handleRemoveItem(item.id)}>
                        <Ionicons name="close" size={14} color={P.textSub} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>

                {/* Totals strip */}
                <View style={S.totalsStrip}>
                  <View style={S.totRow}>
                    <Text style={S.totLabel}>SUBTOTAL:</Text>
                    <Text style={S.totValue}>{effectiveSubtotal.toFixed(2)}</Text>
                  </View>
                  <View style={S.totRow}>
                    <Text style={S.totLabel}>TAX:</Text>
                    <Text style={S.totValue}>{effectiveTax.toFixed(2)}</Text>
                  </View>
                  <View style={[S.totRow, S.totRowTotal]}>
                    <Text style={S.totTotalLabel}>TOTAL:</Text>
                    <Text style={S.totTotalValue}>{effectiveTotal.toFixed(2)}</Text>
                  </View>
                </View>

                {/* Proceed to payment — transitions to paying phase */}
                <TouchableOpacity
                  style={S.proceedBtn}
                  onPress={() => setCheckoutPhase('paying')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="card-outline" size={16} color={P.white} />
                  <Text style={S.proceedBtnTxt}>PROCEED TO PAYMENT</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>


          {/* ══ RIGHT AREA — wide display + numpad + category ══ */}
          <View style={S.rightArea}>

            {/* ── Wide display box — full width across right area ── */}
            <View style={S.wideDisplay}>
              {checkoutPhase === 'paying' && (
                isBusy ? (
                  <View style={S.wideDisplayRow}>
                    <ActivityIndicator color={P.bgEnter} size="small" />
                    <Text style={S.wideDisplayStatus}>{statusMsg}</Text>
                  </View>
                ) : phase === 'error' ? (
                  <View style={S.wideDisplayRow}>
                    <Ionicons name="alert-circle-outline" size={14} color={P.error} />
                    <Text style={S.wideDisplayError}>{readerError}</Text>
                  </View>
                ) : method === 'cash' && cashEnough ? (
                  <View style={S.wideDisplayRow}>
                    <Text style={S.wideDisplayLbl}>CHANGE DUE</Text>
                    <Text style={[S.wideDisplayVal, { color: P.accentCash }]}>${changeDue.toFixed(2)}</Text>
                  </View>
                ) : (
                  <View style={S.wideDisplayRow}>
                    <Text style={S.wideDisplayLbl}>AMOUNT DUE</Text>
                    <Text style={S.wideDisplayVal}>${effectiveTotal.toFixed(2)}</Text>
                  </View>
                )
              )}
            </View>

            {/* ── Buttons row: numpadCol + categoryCol side-by-side ── */}
            <View style={S.buttonsRow}>

              {/* ─────── NUMPAD COLUMN ─────── */}
              <View style={S.numpadCol}>

                {/* Display box — paying phase only */}
                {checkoutPhase === 'paying' && (
                  <View style={S.displayBox}>
                    {method === 'cash' ? (
                      <>
                        {cashTendered > 0 ? (
                          <>
                            <Text style={S.displayLabel}>REMAINING</Text>
                            <Text style={S.displayAmount}>${remainingBalance.toFixed(2)}</Text>
                            <Text style={S.displayShort}>
                              ${cashTendered.toFixed(2)} paid · enter next amount
                            </Text>
                          </>
                        ) : (
                          <>
                            <Text style={S.displayLabel}>TENDERED</Text>
                            <Text style={S.displayAmount}>{numInput ? `${numInput}` : ''}</Text>
                            {cashEnough
                              ? <Text style={S.displayChange}>Change  ${changeDue.toFixed(2)}</Text>
                              : cashNum > 0
                                ? <Text style={S.displayShort}>Need  ${(remainingBalance - cashNum).toFixed(2)} more</Text>
                                : <Text style={S.displayHint}>Enter cash amount</Text>
                            }
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <Text style={S.displayHint}>
                          {!method ? 'Select a payment method →'
                            : method === 'card' ? 'Press PAY to record card'
                            : method === 'm2'   ? 'Press PAY to connect M2 reader'
                            :                    'Press PAY for Tap to Pay'}
                        </Text>
                      </>
                    )}
                  </View>
                )}

                {/* Building-phase display */}
                {checkoutPhase === 'building' && (
                  <View style={S.buildingDisplay}>
                    <Text
                      style={S.buildingDisplayAmt}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.4}
                    >
                      {numInput}
                    </Text>
                  </View>
                )}

                {/* Numpad rows — direct children of numpadCol so they align 1:1 with categoryCol rows */}
                {NUMPAD_ROWS.map((row, ri) => (
                  <View key={ri} style={S.numRow}>
                    {row.map(({ k, alt, cream, iconColor, subLabel }) => (
                      <TouchableOpacity
                        key={k}
                        style={[
                          S.numKey,
                          alt   && S.numKeyAlt,
                          cream && S.numKeyCream,
                        ]}
                        onPress={() => handleKey(k === '↺' ? 'C' : k === '✕' ? 'C' : k)}
                        activeOpacity={0.7}
                      >
                        {k === '⌫' ? (
                          <Ionicons name="backspace-outline" size={22} color={P.textSub} />
                        ) : k === '↺' ? (
                          <Ionicons name="refresh-outline" size={22} color={P.textSub} />
                        ) : k === '✕' ? (
                          <View style={{ alignItems: 'center', gap: 2 }}>
                            <Text style={[S.numKeyTxt, { color: iconColor ?? P.text, fontSize: 20, fontWeight: '700' }]}>✕</Text>
                            {subLabel && <Text style={{ fontSize: 10, color: iconColor ?? P.textSub, fontWeight: '600' }}>{subLabel}</Text>}
                          </View>
                        ) : (
                          <Text style={[S.numKeyTxt, alt && S.numKeyAltTxt]}>{k}</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}

                {/* Bottom action row: 00 | 0 | ENTER / PAY */}
                <View style={S.numRow}>
                  <TouchableOpacity style={S.numKey} onPress={() => handleKey('00')} activeOpacity={0.7}>
                    <Text style={S.numKeyTxt}>00</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.numKey} onPress={() => handleKey('0')} activeOpacity={0.7}>
                    <Text style={S.numKeyTxt}>0</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.enterKey, !enterEnabled && S.enterKeyDim]}
                    onPress={handleEnter}
                    disabled={!enterEnabled}
                    activeOpacity={0.8}
                  >
                    <Text style={[S.enterKeyTxt, !enterEnabled && { opacity: 0.5 }]}>
                      {checkoutPhase === 'paying' ? 'PAY' : 'ENTER'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Quick-cash row */}
                <View style={S.numRow}>
                  {([1, 5, 10, 20] as const).map(v => (
                    <TouchableOpacity
                      key={v}
                      style={[S.quickKey, (checkoutPhase !== 'paying' || method !== 'cash') && S.quickKeyDim]}
                      onPress={() => checkoutPhase === 'paying' && method === 'cash' && handleQuickCash(v)}
                      disabled={checkoutPhase !== 'paying' || method !== 'cash'}
                      activeOpacity={0.7}
                    >
                      <Text style={S.quickKeyTxt}>${v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>{/* end numpadCol */}

              {/* ═══ CATEGORY COLUMN — 6×4 grid, populated from web app ═══ */}
              <View style={S.categoryCol}>
                {checkoutPhase === 'building' ? (
                  Array.from({ length: 6 }).map((_, ri) => (
                    <View key={ri} style={S.catRow}>
                      {Array.from({ length: 4 }).map((_, ci) => {
                        const slot   = gridSlots[ri * 4 + ci] ?? categoryButtons?.[ri * 4 + ci];
                        const isExit = ri === 4 && ci === 0;
                        return (
                          <TouchableOpacity
                            key={ci}
                            style={[S.catBtn, isExit && S.catBtnExit]}
                            onPress={() => {
                              if (isExit) { handleClose(); return; }
                              if (slot?.price != null && slot.label) {
                                // Service button — add directly to the cart
                                setManualItems(prev => [...prev, { id: Date.now(), amount: slot.price!, name: slot.label }]);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                              } else if (slot) {
                                onCategoryButtonPress?.(slot.id);
                              }
                            }}
                            activeOpacity={0.75}
                          >
                            {isExit ? (
                              <>
                                <Text style={S.catBtnExitX}>✕</Text>
                                <Text style={S.catBtnExitTxt}>EXIT</Text>
                                <View style={[S.catBtnAccent, { backgroundColor: '#D97706' }]} />
                              </>
                            ) : slot?.label ? (
                              <>
                                <Text style={S.catBtnLabel} numberOfLines={2}>{slot.label}</Text>
                                {!!slot.accentColor && <View style={[S.catBtnAccent, { backgroundColor: slot.accentColor }]} />}
                              </>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))
                ) : (
                  /* Paying phase: payment method selection */
                  <View style={S.payingCategoryWrap}>
                    <Text style={S.rightPanelTitle}>Payment Mode</Text>

                    {/* CASH */}
                    <TouchableOpacity
                      style={[S.pmBtn, method === 'cash' && S.pmBtnActive]}
                      onPress={() => { if (!isBusy) { setMethod('cash'); setPhase('idle'); setReaderError(''); setNumInput(''); } }}
                      disabled={isBusy}
                      activeOpacity={0.8}
                    >
                      <View style={[S.pmIconBox, { backgroundColor: P.accentCash + '18' }]}>
                        <Ionicons name="cash-outline" size={22} color={method === 'cash' ? P.white : P.accentCash} style={method === 'cash' ? { opacity: 0 } : {}} />
                        {method === 'cash' && (
                          <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center', backgroundColor: P.accentCash, borderRadius: 8 }]}>
                            <Ionicons name="cash-outline" size={22} color={P.white} />
                          </View>
                        )}
                      </View>
                      <Text style={[S.pmLabel, method === 'cash' && { color: P.accentCash, fontWeight: '800' }]}>CASH</Text>
                    </TouchableOpacity>

                    {/* CARD */}
                    <TouchableOpacity
                      style={[S.pmBtn, method === 'card' && S.pmBtnActiveCard]}
                      onPress={() => { if (!isBusy) { setMethod('card'); setPhase('idle'); setReaderError(''); } }}
                      disabled={isBusy}
                      activeOpacity={0.8}
                    >
                      <View style={[S.pmIconBox, { backgroundColor: P.accentCard + '18' }]}>
                        <Ionicons name="card-outline" size={22} color={method === 'card' ? P.white : P.accentCard} style={method === 'card' ? { opacity: 0 } : {}} />
                        {method === 'card' && (
                          <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center', backgroundColor: P.accentCard, borderRadius: 8 }]}>
                            <Ionicons name="card-outline" size={22} color={P.white} />
                          </View>
                        )}
                      </View>
                      <Text style={[S.pmLabel, method === 'card' && { color: P.accentCard, fontWeight: '800' }]}>CARD</Text>
                    </TouchableOpacity>

                    {/* M2 READER */}
                    {stripeConnected === true && (
                      <TouchableOpacity
                        style={[S.pmBtn, method === 'm2' && S.pmBtnActiveCard]}
                        onPress={() => {
                          if (isBusy) return;
                          setMethod('m2');
                          setPhase('idle');
                          setReaderError('');
                          runM2Payment();
                        }}
                        disabled={isBusy}
                        activeOpacity={0.8}
                      >
                        <View style={[S.pmIconBox, { backgroundColor: P.accentM2 + '18' }]}>
                          <Ionicons name="bluetooth-outline" size={22} color={method === 'm2' ? P.white : P.accentM2} style={method === 'm2' ? { opacity: 0 } : {}} />
                          {method === 'm2' && (
                            <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center', backgroundColor: P.accentM2, borderRadius: 8 }]}>
                              <Ionicons name="bluetooth-outline" size={22} color={P.white} />
                            </View>
                          )}
                        </View>
                        <Text style={[S.pmLabel, method === 'm2' && { color: P.accentM2, fontWeight: '800' }]}>M2 READER</Text>
                      </TouchableOpacity>
                    )}

                    {/* TAP TO PAY */}
                    {tapToPaySupported && (
                      <TouchableOpacity
                        style={[S.pmBtn, method === 'tap' && S.pmBtnActiveCard]}
                        onPress={() => { if (!isBusy) { setMethod('tap'); setPhase('idle'); setReaderError(''); } }}
                        disabled={isBusy}
                        activeOpacity={0.8}
                      >
                        <View style={[S.pmIconBox, { backgroundColor: P.accentTap + '18' }]}>
                          <Ionicons name="phone-portrait-outline" size={22} color={method === 'tap' ? P.white : P.accentTap} style={method === 'tap' ? { opacity: 0 } : {}} />
                          {method === 'tap' && (
                            <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center', backgroundColor: P.accentTap, borderRadius: 8 }]}>
                              <Ionicons name="phone-portrait-outline" size={22} color={P.white} />
                            </View>
                          )}
                        </View>
                        <Text style={[S.pmLabel, method === 'tap' && { color: P.accentTap, fontWeight: '800' }]}>TAP TO PAY</Text>
                      </TouchableOpacity>
                    )}

                    {/* Status area */}
                    <View style={[S.pmStatusArea, !method && { backgroundColor: '#FFF0F0' }]}>
                      {isBusy && (
                        <View style={S.busyBox}>
                          <ActivityIndicator color={P.bgEnter} size="large" />
                          <Text style={S.busyText}>{statusMsg}</Text>
                          {phase === 'collecting' && (
                            <TouchableOpacity style={S.cancelBtn} onPress={async () => {
                              await payment.cancel();
                              setPhase('idle'); setStatusMsg('');
                            }}>
                              <Text style={S.cancelBtnTxt}>Cancel</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                      {phase === 'error' && !isBusy && (
                        <View style={S.errorBox}>
                          <Ionicons name="alert-circle" size={15} color={P.error} />
                          <Text style={S.errorText}>{readerError}</Text>
                        </View>
                      )}
                      {!!connectedReader && !isBusy && (method === 'm2' || method === 'tap') && (
                        <View style={S.readerRow}>
                          <View style={S.readerDot} />
                          <Text style={S.readerText}>
                            {(connectedReader as any).label ?? (connectedReader as any).serialNumber ?? 'Reader'} connected
                          </Text>
                        </View>
                      )}
                      {method === 'cash' && cashEnough && !isBusy && (
                        <View style={{ alignItems: 'center', gap: 2 }}>
                          <Text style={{ fontSize: 10, color: P.textMuted, letterSpacing: 1.2 }}>CHANGE DUE</Text>
                          <Text style={{ fontSize: 24, fontWeight: '800', color: P.accentCash }}>${changeDue.toFixed(2)}</Text>
                        </View>
                      )}
                      {!method && !isBusy && (
                        <Text style={{ fontSize: 11, color: P.textMuted, textAlign: 'center', lineHeight: 17 }}>
                          Select a{'\n'}payment method
                        </Text>
                      )}
                    </View>

                    {/* Back to building */}
                    <TouchableOpacity
                      style={S.cancelPayBtn}
                      onPress={() => { setCheckoutPhase('building'); setMethod(null); setNumInput(''); setPhase('idle'); setReaderError(''); }}
                      disabled={isBusy}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={P.white} />
                      <Text style={S.cancelPayBtnTxt}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>{/* end categoryCol */}

            </View>{/* end buttonsRow */}
          </View>{/* end rightArea */}

        </View>{/* end panelsRow */}

        {/* ─ BOTTOM NAV BAR ─ */}
        <View style={[S.bottomBar, { paddingBottom: insets.bottom }]}>
          {/* Home / hamburger menu */}
          <TouchableOpacity style={S.bottomNavBtn} onPress={handleClose} disabled={isBusy}>
            <Ionicons name="menu" size={22} color={isBusy ? '#555' : '#fff'} />
            <Text style={S.bottomNavLabel}>Home</Text>
          </TouchableOpacity>

          {/* Trans Hold */}
          <TouchableOpacity
            style={S.bottomNavBtn}
            onPress={() => { onNavigateToCalendar ? onNavigateToCalendar() : handleClose(); }}
            disabled={isBusy}
          >
            <Ionicons name="document-text-outline" size={20} color="#fff" />
            <Text style={S.bottomNavLabel}>Trans Hold</Text>
          </TouchableOpacity>

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* SYS OK — far right */}
          <TouchableOpacity style={S.sysOkBtn} activeOpacity={0.8}>
            <Text style={S.sysOkTxt}>SYS OK</Text>
          </TouchableOpacity>
        </View>

      </View>{/* end shell */}

      {/* ── COMPLETION SCREEN — shown after full payment ──────────────────── */}
      {phase === 'success' && completionSnap && (
        <View style={S.completionOverlay}>
          {/* LEFT column — receipt summary */}
          <View style={S.completionLeft}>
            {/* Transaction header (same as normal) */}
            <View style={S.txnHeader}>
              <Text style={S.txnTitle} numberOfLines={1}>
                Transaction {completionSnap.apptId}-A
              </Text>
              <View style={S.itemCountBadge}>
                <Text style={S.itemCountTxt}>
                  {completionSnap.itemsSnap.length}{' '}
                  {completionSnap.itemsSnap.length === 1 ? 'item' : 'items'}
                </Text>
              </View>
            </View>

            {/* Line items */}
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={S.itemsContent}
            >
              {completionSnap.itemsSnap.map((item, i) => (
                <View key={i} style={S.itemRow}>
                  <View style={S.itemQtyBox}><Text style={S.itemQty}>1</Text></View>
                  <Text style={S.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={S.itemPrice}>{item.price.toFixed(2)}</Text>
                </View>
              ))}

              {/* TRANSACTION COMPLETE banner */}
              <View style={S.txnCompleteBanner}>
                <Text style={S.txnCompleteBannerTxt}>
                  {'✦ ✦ ✦  TRANSACTION COMPLETE  ✦ ✦ ✦'}
                </Text>
              </View>
            </ScrollView>

            {/* Receipt totals — SUBTOTAL / TAX / TOTAL / CASH / CHANGE */}
            <View style={S.totalsStrip}>
              <View style={S.totRow}>
                <Text style={S.totLabel}>SUBTOTAL:</Text>
                <Text style={S.totValue}>{completionSnap.subSnap.toFixed(2)}</Text>
              </View>
              <View style={S.totRow}>
                <Text style={S.totLabel}>TAX:</Text>
                <Text style={S.totValue}>{completionSnap.taxSnap.toFixed(2)}</Text>
              </View>
              <View style={[S.totRow, S.totRowTotal]}>
                <Text style={S.totTotalLabel}>TOTAL:</Text>
                <Text style={S.totTotalValue}>{completionSnap.totalSnap.toFixed(2)}</Text>
              </View>
              {completionSnap.method === 'cash' && (
                <>
                  <View style={S.totRow}>
                    <Text style={S.totLabel}>CASH:</Text>
                    <Text style={S.totValue}>{completionSnap.cashTendered.toFixed(2)}</Text>
                  </View>
                  <View style={[S.totRow, S.changeRow]}>
                    <Text style={S.changeLabel}>CHANGE:</Text>
                    <Text style={S.changeValue}>{completionSnap.changeDue.toFixed(2)}</Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* RIGHT column — Payment Confirmed + action buttons */}
          <View style={S.completionRight}>
            {/* Animated green checkmark */}
            <Animated.View style={[S.completionCheck, { transform: [{ scale: successScale }] }]}>
              <Ionicons name="checkmark" size={38} color={P.white} />
            </Animated.View>

            <Text style={S.completionTitle}>Payment Confirmed!</Text>

            {/* Auto-print status — small info line, not a button */}
            {printStatus !== 'idle' && (
              <View style={[
                S.printStatusBadge,
                printStatus === 'done'  && S.printStatusBadgeDone,
                printStatus === 'error' && S.printStatusBadgeError,
              ]}>
                {printStatus === 'printing' && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />}
                {printStatus === 'done'     && <Ionicons name="checkmark-circle"    size={14} color="#fff" style={{ marginRight: 5 }} />}
                {printStatus === 'error'    && <Ionicons name="alert-circle-outline" size={14} color="#fff" style={{ marginRight: 5 }} />}
                <Text style={S.printStatusTxt}>
                  {printStatus === 'printing' ? 'Sending to printer…'
                    : printStatus === 'done'  ? 'Receipt sent to printer'
                    : 'Printer not reachable'}
                </Text>
              </View>
            )}

            {/* NO RECEIPT — green filled */}
            <TouchableOpacity
              style={S.receiptBtnPrimary}
              onPress={() => handleReceiptDismiss('none')}
              activeOpacity={0.85}
            >
              <Text style={S.receiptBtnPrimaryTxt}>NO RECEIPT</Text>
            </TouchableOpacity>

            {/* PRINT RECEIPT — white outlined */}
            <TouchableOpacity
              style={S.receiptBtnOutline}
              onPress={() => handleReceiptDismiss('print')}
              activeOpacity={0.85}
            >
              <Text style={S.receiptBtnOutlineTxt}>PRINT RECEIPT</Text>
            </TouchableOpacity>

            {/* PREVIEW RECEIPT — light grey */}
            <TouchableOpacity
              style={S.receiptBtnGhost}
              onPress={() => handleReceiptDismiss('preview')}
              activeOpacity={0.85}
            >
              <Text style={S.receiptBtnGhostTxt}>PREVIEW RECEIPT</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── RECEIPT PREVIEW MODAL ──────────────────────────────────────────────── */}
      <Modal
        visible={showReceiptPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReceiptPreview(false)}
      >
        <View style={S.previewOverlay}>
          <View style={S.previewCard}>
            {/* Header */}
            <View style={S.previewHeader}>
              <Text style={S.previewHeaderTitle}>Receipt Preview</Text>
              <TouchableOpacity onPress={() => setShowReceiptPreview(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={P.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={S.previewScroll}
              contentContainerStyle={S.previewContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Store info */}
              <Text style={S.previewStoreName}>{completionSnap ? (data?.storeName ?? 'Certxa') : ''}</Text>
              {!!data?.storeAddress && <Text style={S.previewStoreSub}>{data.storeAddress}</Text>}
              {!!data?.storePhone   && <Text style={S.previewStoreSub}>{data.storePhone}</Text>}

              <View style={S.previewDivider} />

              {/* Receipt number + date */}
              <View style={S.previewMetaRow}>
                <Text style={S.previewMetaLabel}>Receipt #</Text>
                <Text style={S.previewMetaValue}>{completionSnap?.apptId}-A</Text>
              </View>
              <View style={S.previewMetaRow}>
                <Text style={S.previewMetaLabel}>Date</Text>
                <Text style={S.previewMetaValue}>{new Date().toLocaleString()}</Text>
              </View>
              {!!data?.clientName && (
                <View style={S.previewMetaRow}>
                  <Text style={S.previewMetaLabel}>Client</Text>
                  <Text style={S.previewMetaValue}>{data.clientName}</Text>
                </View>
              )}

              <View style={S.previewDivider} />

              {/* Line items */}
              {completionSnap?.itemsSnap.map((item, i) => (
                <View key={i} style={S.previewItemRow}>
                  <Text style={S.previewItemName} numberOfLines={2}>{item.name}</Text>
                  <Text style={S.previewItemPrice}>${item.price.toFixed(2)}</Text>
                </View>
              ))}

              <View style={S.previewDivider} />

              {/* Totals */}
              <View style={S.previewTotRow}>
                <Text style={S.previewTotLabel}>Subtotal</Text>
                <Text style={S.previewTotValue}>${completionSnap?.subSnap.toFixed(2)}</Text>
              </View>
              <View style={S.previewTotRow}>
                <Text style={S.previewTotLabel}>Tax</Text>
                <Text style={S.previewTotValue}>${completionSnap?.taxSnap.toFixed(2)}</Text>
              </View>
              <View style={[S.previewTotRow, S.previewTotRowBold]}>
                <Text style={S.previewTotBoldLabel}>TOTAL</Text>
                <Text style={S.previewTotBoldValue}>${completionSnap?.totalSnap.toFixed(2)}</Text>
              </View>
              {completionSnap?.method === 'cash' && (
                <>
                  <View style={S.previewTotRow}>
                    <Text style={S.previewTotLabel}>Cash</Text>
                    <Text style={S.previewTotValue}>${completionSnap.cashTendered.toFixed(2)}</Text>
                  </View>
                  <View style={S.previewTotRow}>
                    <Text style={[S.previewTotBoldLabel, { color: P.accentCash }]}>CHANGE</Text>
                    <Text style={[S.previewTotBoldValue, { color: P.accentCash }]}>${completionSnap.changeDue.toFixed(2)}</Text>
                  </View>
                </>
              )}

              <View style={S.previewDivider} />
              <Text style={S.previewPayMethod}>
                Paid via {completionSnap?.method?.toUpperCase()}
              </Text>
              <Text style={S.previewThankYou}>Thank you!</Text>
            </ScrollView>

            {/* Footer actions */}
            <View style={S.previewFooter}>
              <TouchableOpacity
                style={S.previewPrintBtn}
                onPress={() => {
                  setShowReceiptPreview(false);
                  // Receipt already auto-printed on payment confirmation.
                  // This button re-prints from the preview for a duplicate copy.
                  if (completionSnap && data) {
                    const isCash = completionSnap.method === 'cash' || completionSnap.method.startsWith('cash +');
                    setPrintStatus('printing');
                    printReceipt({
                      storeName:     data.storeName ?? 'Certxa',
                      storeAddress:  data.storeAddress,
                      storePhone:    data.storePhone,
                      receiptNumber: completionSnap.apptId,
                      date:          new Date().toISOString(),
                      clientName:    data.clientName,
                      items:         completionSnap.itemsSnap,
                      subtotal:      completionSnap.subSnap,
                      tax:           completionSnap.taxSnap,
                      grandTotal:    completionSnap.totalSnap,
                      paymentMethod: completionSnap.method.toUpperCase(),
                      amountPaid:    isCash ? completionSnap.cashTendered : completionSnap.totalSnap,
                      changeDue:     isCash ? completionSnap.changeDue    : 0,
                      cardDetails:   completionSnap.cardDetails,
                    })
                      .then(() => setPrintStatus('done'))
                      .catch(() => setPrintStatus('error'));
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="print-outline" size={18} color={P.white} style={{ marginRight: 6 }} />
                <Text style={S.previewPrintBtnTxt}>REPRINT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={S.previewCloseBtn}
                onPress={() => {
                  setShowReceiptPreview(false);
                  if (completionSnap) {
                    onPaymentComplete(completionSnap.apptId, completionSnap.method, completionSnap.amount);
                  }
                  reset(); onClose();
                }}
                activeOpacity={0.75}
              >
                <Text style={S.previewCloseBtnTxt}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── M2 READER OVERLAY ─────────────────────────────────────────────────
           Appears as a full-screen overlay whenever the M2 reader is in any
           active phase (discovering → connecting → collecting → processing)
           or when a payment was declined.  The underlying POS panels remain
           mounted so a cancel always returns to exactly where the staff left.
      ──────────────────────────────────────────────────────────────────────── */}
      {method === 'm2' && (isBusy || phase === 'error') && (
        <View style={S.m2Overlay}>
          <View style={S.m2Card}>

            {phase === 'error' ? (
              /* ── DECLINED / ERROR state ── */
              <>
                <View style={S.m2DeclinedIconWrap}>
                  <Ionicons name="close-circle" size={64} color="#FF4444" />
                </View>
                <Text style={S.m2DeclinedTitle}>
                  {readerError.toLowerCase().includes('declin') ? 'DECLINED' : 'PAYMENT FAILED'}
                </Text>
                <Text style={S.m2DeclinedMsg}>{readerError}</Text>

                {/* TRY AGAIN */}
                <TouchableOpacity
                  style={S.m2TryAgainBtn}
                  onPress={() => { setPhase('idle'); setReaderError(''); runM2Payment(); }}
                  activeOpacity={0.85}
                >
                  <Text style={S.m2TryAgainTxt}>TRY AGAIN</Text>
                </TouchableOpacity>

                {/* Cancel — back to payment method selection */}
                <TouchableOpacity
                  style={S.m2StopBtn}
                  onPress={() => { setMethod(null); setPhase('idle'); setReaderError(''); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-back-outline" size={16} color="rgba(255,255,255,0.7)" />
                  <Text style={S.m2StopTxt}>Back to Payment Methods</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* ── WAITING / PROCESSING state ── */
              <>
                {/* Amount */}
                <Text style={S.m2OverlayAmtLabel}>AMOUNT DUE</Text>
                <Text style={S.m2OverlayAmt}>${effectiveTotal.toFixed(2)}</Text>

                {/* Animated dots — wave bounce — hidden during final processing */}
                {phase !== 'processing' ? (
                  <View style={S.m2DotsRow}>
                    {dotAnims.map((anim, i) => (
                      <Animated.View
                        key={i}
                        style={[
                          S.m2Dot,
                          { backgroundColor: M2_DOT_COLORS[i], transform: [{ translateY: anim }] },
                        ]}
                      />
                    ))}
                  </View>
                ) : (
                  <ActivityIndicator size="large" color="#FFFFFF" style={{ marginVertical: 28 }} />
                )}

                {/* Status message — changes as phases progress */}
                <Text style={S.m2StatusMsg}>{statusMsg}</Text>

                {/* Phase label pill */}
                <View style={S.m2PhasePill}>
                  <Text style={S.m2PhasePillTxt}>
                    {phase === 'discovering' ? 'SCANNING FOR READER'
                      : phase === 'connecting'  ? 'CONNECTING TO READER'
                      : phase === 'collecting'  ? 'WAITING FOR CARD'
                      :                          'PROCESSING'}
                  </Text>
                </View>

                {/* Stop / cancel — only available before processing starts */}
                {phase !== 'processing' ? (
                  <TouchableOpacity
                    style={S.m2StopBtn}
                    onPress={handleCancelM2}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="close-outline" size={18} color="rgba(255,255,255,0.7)" />
                    <Text style={S.m2StopTxt}>Stop &amp; Return to POS</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={S.m2ProcessingNote}>
                    Do not close this screen — completing payment…
                  </Text>
                )}
              </>
            )}
          </View>
        </View>
      )}

      {/* ── Rescan / reader-status popup ────────────────────────────────── */}
      {rescanVisible && (
        <View style={S.rescanOverlay}>
          {/* Dim backdrop — tap outside to close */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => { setRescanVisible(false); setRescanPhase('idle'); }}
          />

          <View style={S.rescanCard}>
            {/* Header */}
            <View style={S.rescanHeader}>
              <Ionicons name="bluetooth" size={17} color={connectedReader ? P.success : '#888'} />
              <Text style={S.rescanTitle}>M2 Reader</Text>
              <TouchableOpacity
                onPress={() => { setRescanVisible(false); setRescanPhase('idle'); }}
                style={S.rescanCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color={P.textSub} />
              </TouchableOpacity>
            </View>

            {/* Current connection status */}
            <View style={S.rescanStatusRow}>
              <View style={[S.rescanDot, { backgroundColor: connectedReader ? P.success : '#555' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[S.rescanStatusTxt, { color: connectedReader ? P.success : P.textSub }]}>
                  {connectedReader ? 'Reader Connected' : 'No Reader Connected'}
                </Text>
                {!!connectedReader && (
                  <Text style={S.rescanDetailTxt}>
                    {(connectedReader as any).label
                      ?? (connectedReader as any).serialNumber
                      ?? 'M2 Reader'}
                  </Text>
                )}
              </View>
            </View>

            {/* In-progress / result feedback */}
            {(rescanPhase === 'scanning' || rescanPhase === 'connecting') && (
              <View style={S.rescanFeedback}>
                <ActivityIndicator color={P.bgEnter} size="small" />
                <Text style={S.rescanFeedbackTxt}>
                  {rescanPhase === 'scanning' ? 'Scanning for M2 reader…' : 'Connecting…'}
                </Text>
              </View>
            )}
            {rescanPhase === 'connected' && (
              <View style={[S.rescanFeedback, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="checkmark-circle" size={16} color={P.success} />
                <Text style={[S.rescanFeedbackTxt, { color: P.success }]}>Reader connected!</Text>
              </View>
            )}
            {rescanPhase === 'error' && (
              <View style={[S.rescanFeedback, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="alert-circle-outline" size={16} color={P.error} />
                <Text style={[S.rescanFeedbackTxt, { color: P.error }]}>{rescanError}</Text>
              </View>
            )}

            {/* Action button */}
            <TouchableOpacity
              style={[
                S.rescanScanBtn,
                (rescanPhase === 'scanning' || rescanPhase === 'connecting') && S.rescanScanBtnDim,
              ]}
              onPress={runDiscoverAndConnect}
              disabled={rescanPhase === 'scanning' || rescanPhase === 'connecting'}
              activeOpacity={0.85}
            >
              <Ionicons name="search-outline" size={15} color={P.white} />
              <Text style={S.rescanScanBtnTxt}>
                {connectedReader ? 'Re-scan for Reader' : 'Scan for M2 Reader'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Printer setup modal ──────────────────────────────────────────── */}
      <PrinterSetupModal
        visible={printerSetupVisible}
        storeName={data?.storeName ?? 'Certxa'}
        onClose={() => setPrinterSetupVisible(false)}
      />

    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({

  // ── Shell ─────────────────────────────────────────────────────────────────
  shell: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: P.bgRoot,
  },
  panelsRow: {
    flex: 1,
    flexDirection: 'row',
  },

  // ── Portrait overlay ──────────────────────────────────────────────────────
  portraitOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: P.bgRoot,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  portraitCard: {
    alignItems: 'center',
    backgroundColor: P.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: P.border,
    padding: 44,
    maxWidth: 380,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  portraitTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: P.text,
    textAlign: 'center',
  },
  portraitSub: {
    fontSize: 14,
    color: P.textSub,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },

  // ── LEFT PANEL ────────────────────────────────────────────────────────────

  // Transaction header — "Transaction 9226-A"  ·  "1 item" badge
  txnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: P.white,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
    gap: 8,
  },
  txnTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: P.text,
    flex: 1,
  },
  itemCountBadge: {
    backgroundColor: P.text,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
    flexShrink: 0,
  },
  itemCountTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: P.white,
    letterSpacing: 0.3,
  },

  leftPanel: {
    width: '26%',
    backgroundColor: P.bgLeft,
    borderRightWidth: 1,
    borderRightColor: P.borderDark,
    flexDirection: 'column',
  },
  leftTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: P.white,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  clientBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: P.bgEnter + '20',
    borderWidth: 1.5,
    borderColor: P.bgEnter + '60',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  clientInitial: { fontSize: 17, fontWeight: '800', color: P.bgEnter },
  clientName:    { fontSize: 15, fontWeight: '700', color: P.text },
  saleLabel:     { fontSize: 10, fontWeight: '600', color: P.textMuted, letterSpacing: 1.4, marginTop: 1 },
  itemsContent:  { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 10 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: P.border,
    gap: 8,
  },
  itemQtyBox: {
    width: 24, height: 24,
    borderRadius: 5,
    backgroundColor: P.bgKeyAlt,
    borderWidth: 1,
    borderColor: P.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemQty:   { fontSize: 11, fontWeight: '700', color: P.textSub },
  itemName:  { flex: 1, fontSize: 13, color: P.text, lineHeight: 18 },
  itemPrice: { fontSize: 13, fontWeight: '700', color: P.text, flexShrink: 0 },

  /** Circular grey delete button — matches reference style */
  itemDeleteBtn: {
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: P.bgKeyAlt,
    borderWidth: 1,
    borderColor: P.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  /** Same width as itemDeleteBtn — keeps non-deletable rows aligned */
  itemDeletePlaceholder: {
    width: 28,
    flexShrink: 0,
  },
  /** "NO TAX" grey pill badge */
  noTaxBadge: {
    backgroundColor: P.bgKeyAlt,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: P.border,
    flexShrink: 0,
  },
  noTaxBadgeTxt: {
    fontSize: 9,
    fontWeight: '700',
    color: P.textMuted,
    letterSpacing: 0.4,
  },

  totalsStrip: {
    backgroundColor: P.white,
    borderTopWidth: 1,
    borderTopColor: P.borderDark,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 0,   // inner sections provide their own bottom padding
    gap: 5,
  },
  totRow:         { flexDirection: 'row', justifyContent: 'space-between' },
  totLabel:       { fontSize: 11, color: P.textSub, letterSpacing: 0.3 },
  totValue:       { fontSize: 11, color: P.textSub, fontWeight: '500' },
  totRowTotal:    { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: P.border },
  totTotalLabel:  { fontSize: 13, fontWeight: '700', color: P.text, letterSpacing: 0.3 },
  totTotalValue:  { fontSize: 13, fontWeight: '700', color: P.text },

  // ── BALANCE DUE (paying phase) ────────────────────────────────────────────
  balanceDueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 8,
    paddingBottom: 14,
    borderTopWidth: 2,
    borderTopColor: '#F97316',
  },
  balanceDueLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F97316',
    letterSpacing: 0.4,
  },
  balanceDueValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F97316',
  },

  // ── FINALIZE & PAY area (building phase) ─────────────────────────────────
  finalizeArea: {
    paddingVertical: 12,
    paddingHorizontal: 0,
    gap: 6,
  },
  finalizeBtn: {
    backgroundColor: P.accentCash,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: P.accentCash,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  finalizeBtnDim: { opacity: 0.4 },
  finalizeBtnTxt: {
    fontSize: 14,
    fontWeight: '800',
    color: P.white,
    letterSpacing: 1.2,
  },
  abortBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  abortBtnTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: P.textMuted,
    letterSpacing: 0.8,
    textDecorationLine: 'underline',
  },

  // ── BUILDING DISPLAY (top of center panel in building phase) ─────────────
  buildingDisplay: {
    flex: 1,
    backgroundColor: P.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: P.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'flex-end',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  buildingDisplayAmt: {
    fontSize: 42,
    fontWeight: '700',
    color: P.text,
    letterSpacing: -1,
    textAlign: 'right',
  },

  // ── CENTER PANEL ──────────────────────────────────────────────────────────
  centerPanel: {
    flex: 1,
    backgroundColor: P.bgCenter,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'column',
    gap: 10,
  },

  // Amount display — white box at top of numpad (matches reference)
  displayBox: {
    flex: 1,
    backgroundColor: P.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: P.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'flex-end',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  displayLabel:  { fontSize: 10, fontWeight: '700', color: P.textMuted, letterSpacing: 1.6, marginBottom: 3 },
  displayAmount: { fontSize: 32, fontWeight: '800', color: P.text, letterSpacing: -0.5, textAlign: 'right' },
  displayChange: { fontSize: 13, color: P.success,  fontWeight: '600', marginTop: 3, textAlign: 'right' },
  displayShort:  { fontSize: 13, color: P.warning,  fontWeight: '600', marginTop: 3,  textAlign: 'right' },
  displayHint:   { fontSize: 12, color: P.textMuted, marginTop: 3,                    textAlign: 'right' },

  // Numpad
  numpad: { flex: 1, gap: 6 },
  numRow:  { flexDirection: 'row', gap: 6, flex: 1 },

  // Standard digit key — white rounded square, matches reference exactly
  numKey: {
    flex: 1,
    paddingVertical: 22,
    backgroundColor: P.bgKey,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: P.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  numKeyAlt:    { backgroundColor: P.bgKeyAlt },
  numKeyTxt:    { fontSize: 22, fontWeight: '500', color: P.text },
  numKeyAltTxt: { fontSize: 18, color: P.textSub },

  // ENTER — teal, spans 2 flex columns
  enterKey: {
    flex: 2,
    paddingVertical: 18,
    backgroundColor: P.bgEnter,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: P.bgEnter,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  enterKeyDim: { backgroundColor: P.bgKeyAlt, shadowOpacity: 0 },
  enterKeyTxt: { fontSize: 18, fontWeight: '800', color: P.white, letterSpacing: 1.5 },

  // Cream-tinted utility key (↺ reset)
  numKeyCream: {
    backgroundColor: '#FFF8E1',
    borderColor: '#F0E0A0',
  },

  // Quick cash
  quickKey: {
    flex: 1,
    paddingVertical: 13,
    backgroundColor: P.bgKey,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: P.border,
  },
  quickKeyDim: { opacity: 0.4 },
  quickKeyTxt: { fontSize: 14, fontWeight: '700', color: P.bgEnter },

  // ── RIGHT PANEL — PAYING PHASE: Payment Mode buttons ────────────────────

  // Building-phase right panel hint
  buildingRightHint: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  buildingRightHintTxt: {
    fontSize: 12,
    color: P.borderDark,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },

  // Large payment mode buttons (CASH, CARD, M2)
  pmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: P.white,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: P.border,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pmBtnActive: {
    borderColor: P.accentCash,
    borderWidth: 2,
    backgroundColor: '#F0FDF4',
  },
  pmBtnActiveCard: {
    borderColor: P.accentCard,
    borderWidth: 2,
    backgroundColor: '#EFF6FF',
  },
  pmIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  pmLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: P.text,
    flex: 1,
  },

  // Status/change area in paying panel
  pmStatusArea: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: P.bgKeyAlt,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    minHeight: 60,
    overflow: 'hidden',
  },

  // Cancel button — returns to building phase
  cancelPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: P.error,
    borderRadius: 8,
    paddingVertical: 13,
    shadowColor: P.error,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cancelPayBtnTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: P.white,
    letterSpacing: 0.5,
  },

  // ── RIGHT PANEL ───────────────────────────────────────────────────────────
  rightPanel: {
    width: '22%',
    backgroundColor: P.bgRight,
    borderLeftWidth: 1,
    borderLeftColor: P.borderDark,
    paddingHorizontal: 10,
    paddingVertical: 12,
    flexDirection: 'column',
    gap: 10,
  },
  rightPanelTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: P.textMuted,
    letterSpacing: 1.8,
    marginBottom: 2,
    paddingHorizontal: 2,
  },

  // 2-column method grid — each button is a white card with coloured bottom strip
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodBtn: {
    width: '47%',
    backgroundColor: P.bgKey,
    borderRadius: 10,
    paddingTop: 16,
    paddingBottom: 18,       // extra room for the 4px accent strip at bottom
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: P.border,
    overflow: 'hidden',      // clip the accent strip
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  methodLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: P.textSub,
    textAlign: 'center',
  },
  // Coloured bottom accent strip — the defining visual from the reference
  methodAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  dimmed: { opacity: 0.4 },

  nudge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    backgroundColor: P.bgKeyAlt,
    borderRadius: 8,
    padding: 9,
    borderWidth: 1,
    borderColor: P.border,
  },
  nudgeText: { flex: 1, fontSize: 11, color: P.textMuted, lineHeight: 15 },

  statusArea: { flex: 1, justifyContent: 'center' },
  busyBox:    { alignItems: 'center', gap: 10, paddingVertical: 12 },
  busyText:   { fontSize: 12, color: P.textSub, textAlign: 'center' },
  cancelBtn:  { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: P.errorBg },
  cancelBtnTxt: { fontSize: 12, fontWeight: '600', color: P.error },
  errorBox:   { flexDirection: 'row', gap: 7, backgroundColor: P.errorBg, borderRadius: 8, padding: 10, alignItems: 'flex-start' },
  errorText:  { flex: 1, fontSize: 11, color: P.error, lineHeight: 16 },
  readerRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readerDot:  { width: 7, height: 7, borderRadius: 3.5, backgroundColor: P.success },
  readerText: { fontSize: 11, color: P.success, flex: 1 },

  // ── BOTTOM NAV BAR ────────────────────────────────────────────────────────
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: P.bgBottomBar,
    minHeight: 60,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#0a0b14',
  },
  bottomLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bottomNavBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    gap: 3,
    minWidth: 64,
  },
  bottomNavLabel: { fontSize: 11, color: '#aaa', fontWeight: '500' },
  // M2 reader status pill (replaces the old DUE total badge)
  bottomReaderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 16,
    gap: 7,
  },
  bottomReaderDot: {
    width: 7, height: 7, borderRadius: 3.5,
  },
  bottomReaderStatus: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.3,
  },
  bottomReaderSub: {
    fontSize: 10, color: '#666', maxWidth: 120,
  },

  // ── RESCAN POPUP ──────────────────────────────────────────────────────────
  rescanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  rescanCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: 320,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  rescanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  rescanTitle:    { fontSize: 15, fontWeight: '700', color: P.text, flex: 1 },
  rescanCloseBtn: { padding: 4 },
  rescanStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  rescanDot:       { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  rescanStatusTxt: { fontSize: 14, fontWeight: '600' },
  rescanDetailTxt: { fontSize: 12, color: P.textSub, marginTop: 2 },
  rescanFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 18,
    marginBottom: 10,
    padding: 10,
    backgroundColor: P.bgKeyAlt,
    borderRadius: 8,
  },
  rescanFeedbackTxt: { fontSize: 13, color: P.textSub, flex: 1 },
  rescanScanBtn: {
    margin: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: P.bgEnter,
    borderRadius: 10,
    paddingVertical: 13,
    shadowColor: P.bgEnter,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  rescanScanBtnDim: { opacity: 0.5, shadowOpacity: 0 },
  rescanScanBtnTxt: { fontSize: 14, fontWeight: '700', color: P.white, letterSpacing: 0.4 },

  // ── COMPLETION SCREEN ─────────────────────────────────────────────────────

  /** Full-screen overlay — same background as the POS shell */
  completionOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    backgroundColor: P.bgRoot,
    zIndex: 100,
  },

  /** Left ~30% — receipt summary column */
  completionLeft: {
    width: '30%',
    backgroundColor: P.bgLeft,
    borderRightWidth: 1,
    borderRightColor: P.borderDark,
    flexDirection: 'column',
  },

  /** TRANSACTION COMPLETE green banner inside the line-item scroll */
  txnCompleteBanner: {
    marginTop: 16,
    marginHorizontal: 4,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: P.accentCash,
    borderRadius: 6,
    alignItems: 'center',
  },
  txnCompleteBannerTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: P.accentCash,
    letterSpacing: 0.8,
    textAlign: 'center',
  },

  /** CHANGE row — green text */
  changeRow: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: P.accentCash + '44',
  },
  changeLabel: { fontSize: 13, fontWeight: '800', color: P.accentCash },
  changeValue: { fontSize: 13, fontWeight: '800', color: P.accentCash },

  /** Right ~70% — Payment Confirmed card */
  completionRight: {
    flex: 1,
    backgroundColor: P.bgRoot,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: '12%',
  },

  /** Animated green check circle */
  completionCheck: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: P.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: P.success,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  completionTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: P.text,
    marginBottom: 8,
  },

  /** NO RECEIPT — green filled (primary action) */
  receiptBtnPrimary: {
    width: '100%',
    backgroundColor: P.accentCash,
    borderRadius: 6,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: P.accentCash,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  receiptBtnPrimaryTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: P.white,
    letterSpacing: 1.4,
  },

  /** PRINT RECEIPT — white with border */
  receiptBtnOutline: {
    width: '100%',
    backgroundColor: P.white,
    borderRadius: 6,
    paddingVertical: 17,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: P.border,
  },
  receiptBtnOutlineTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: P.text,
    letterSpacing: 1.2,
  },

  /** PREVIEW RECEIPT — light grey */
  receiptBtnGhost: {
    width: '100%',
    backgroundColor: P.bgKeyAlt,
    borderRadius: 6,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: P.border,
  },
  receiptBtnGhostTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: P.textSub,
    letterSpacing: 1.2,
  },

  // Legacy — kept for printRow / printTxt refs in old code paths
  printRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  printTxt: { fontSize: 13, color: '#aaa' },

  // Auto-print status badge shown on the success screen
  printStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  printStatusBadgeDone:  { backgroundColor: 'rgba(22,163,74,0.25)' },
  printStatusBadgeError: { backgroundColor: 'rgba(220,38,38,0.25)' },
  printStatusTxt: { fontSize: 13, fontWeight: '600', color: P.white },

  /** EXIT — small white outlined button below the three receipt buttons */
  receiptBtnExit: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: P.border,
    backgroundColor: P.white,
    alignItems: 'center',
  },
  receiptBtnExitTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: P.textSub,
    letterSpacing: 1.4,
  },

  // ── RECEIPT PREVIEW MODAL ──────────────────────────────────────────────────

  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  previewCard: {
    width: '60%',
    maxHeight: '88%',
    backgroundColor: P.white,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  previewHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: P.text,
  },
  previewScroll: { flex: 1 },
  previewContent: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: 'center',
  },
  previewStoreName: {
    fontSize: 18,
    fontWeight: '800',
    color: P.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  previewStoreSub: {
    fontSize: 12,
    color: P.textSub,
    textAlign: 'center',
    lineHeight: 18,
  },
  previewDivider: {
    width: '100%',
    height: 1,
    backgroundColor: P.border,
    marginVertical: 14,
  },
  previewMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 5,
  },
  previewMetaLabel: { fontSize: 12, color: P.textSub },
  previewMetaValue: { fontSize: 12, color: P.text, fontWeight: '600' },
  previewItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  previewItemName:  { fontSize: 13, color: P.text, flex: 1, marginRight: 12 },
  previewItemPrice: { fontSize: 13, color: P.text, fontWeight: '600' },
  previewTotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 5,
  },
  previewTotLabel:    { fontSize: 13, color: P.textSub },
  previewTotValue:    { fontSize: 13, color: P.text },
  previewTotRowBold:  { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: P.border },
  previewTotBoldLabel: { fontSize: 14, fontWeight: '800', color: P.text },
  previewTotBoldValue: { fontSize: 14, fontWeight: '800', color: P.text },
  previewPayMethod: {
    fontSize: 12,
    color: P.textSub,
    marginTop: 4,
    textAlign: 'center',
  },
  previewThankYou: {
    fontSize: 14,
    fontWeight: '700',
    color: P.accentCash,
    marginTop: 12,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  previewFooter: {
    borderTopWidth: 1,
    borderTopColor: P.border,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  previewPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: P.accentCash,
    borderRadius: 8,
    paddingVertical: 13,
  },
  previewPrintBtnTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: P.white,
    letterSpacing: 1.2,
  },
  previewCloseBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: P.border,
  },
  previewCloseBtnTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: P.textSub,
    letterSpacing: 1.2,
  },

  // ── M2 READER OVERLAY ─────────────────────────────────────────────────────

  /** Full-screen dark overlay — sits above the POS panels */
  m2Overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 14, 35, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },

  /** Centered card inside the overlay */
  m2Card: {
    width: '55%',
    maxWidth: 480,
    alignItems: 'center',
    gap: 0,
    paddingHorizontal: 40,
    paddingTop: 44,
    paddingBottom: 36,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  m2OverlayAmtLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 2.0,
    marginBottom: 6,
  },
  m2OverlayAmt: {
    fontSize: 52,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 20,
  },

  /** Row of 5 animated bouncing dots */
  m2DotsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 14,
    height: 60,
    marginBottom: 20,
  },
  m2Dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  m2StatusMsg: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.80)',
    textAlign: 'center',
    marginBottom: 14,
  },

  /** Phase label pill — e.g. "WAITING FOR CARD" */
  m2PhasePill: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 28,
  },
  m2PhasePillTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 1.6,
  },

  /** Stop / cancel button */
  m2StopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  m2StopTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.70)',
  },

  m2ProcessingNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.40)',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },

  // ── DECLINED / ERROR state ────────────────────────────────────────────────

  m2DeclinedIconWrap: {
    marginBottom: 14,
    backgroundColor: 'rgba(255,68,68,0.12)',
    borderRadius: 60,
    padding: 14,
  },
  m2DeclinedTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FF4444',
    letterSpacing: 2,
    marginBottom: 10,
  },
  m2DeclinedMsg: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    maxWidth: 320,
  },
  m2TryAgainBtn: {
    backgroundColor: P.bgEnter,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginBottom: 12,
    shadowColor: P.bgEnter,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  m2TryAgainTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: P.white,
    letterSpacing: 1.2,
  },

  // ── STATUS BAR ────────────────────────────────────────────────────────────
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.bgRoot,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  statusBarTxt: {
    fontSize: 12,
    color: P.text,
    fontWeight: '500',
    letterSpacing: 0.2,
    flex: 1,
  },

  // ── LEFT PANEL — "Add an Item" empty state ────────────────────────────────
  addItemCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  addItemCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    borderColor: P.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  addItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: P.textSub,
    textAlign: 'center',
  },
  addItemSub: {
    fontSize: 12,
    color: P.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 210,
  },

  // "Proceed to Payment" button — bottom of left panel, shown once items exist
  proceedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: P.bgEnter,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginHorizontal: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  proceedBtnTxt: {
    fontSize: 14,
    fontWeight: '800',
    color: P.white,
    letterSpacing: 0.4,
  },

  // ── RIGHT AREA ────────────────────────────────────────────────────────────
  rightArea: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: P.bgCenter,
  },

  // Wide display box — full width, shown at top of rightArea
  wideDisplay: {
    backgroundColor: P.white,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  wideDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wideDisplayStatus: {
    fontSize: 13,
    color: P.textSub,
    flex: 1,
  },
  wideDisplayError: {
    fontSize: 13,
    color: P.error,
    flex: 1,
    lineHeight: 18,
  },
  wideDisplayLbl: {
    fontSize: 11,
    fontWeight: '700',
    color: P.textMuted,
    letterSpacing: 1.6,
  },
  wideDisplayVal: {
    fontSize: 28,
    fontWeight: '800',
    color: P.text,
    marginLeft: 10,
    letterSpacing: -0.5,
  },

  // Buttons row — numpadCol and categoryCol side by side
  buttonsRow: {
    flex: 1,
    flexDirection: 'row',
  },

  // Numpad column — gap matches categoryCol so rows align 1:1
  numpadCol: {
    flex: 1,
    backgroundColor: P.bgCenter,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'column',
    gap: 6,
    borderRightWidth: 1,
    borderRightColor: P.border,
  },

  // ── CATEGORY COLUMN ───────────────────────────────────────────────────────
  categoryCol: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: P.bgCenter,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
  },
  catRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  catBtn: {
    flex: 1,
    backgroundColor: P.bgKey,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: P.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  catBtnExit: {
    borderColor: P.border,
  },
  catBtnExitX: {
    fontSize: 18,
    fontWeight: '700',
    color: P.textSub,
    marginBottom: 2,
  },
  catBtnExitTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: P.textSub,
    letterSpacing: 1.2,
  },
  catBtnLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: P.text,
    textAlign: 'center',
    letterSpacing: 0.3,
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  catBtnAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },

  // Paying phase — wraps payment method buttons inside categoryCol
  payingCategoryWrap: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },

  // ── SYS OK button (bottom bar, far right) ─────────────────────────────────
  sysOkBtn: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 10,
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  sysOkTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1.0,
  },
});
