/**
 * BookingFlow.tsx
 *
 * Full booking engine ported from artifacts/booking/src/pages/public-booking/MobileTheme.tsx
 * and integrated into the Website Builder template.
 *
 * All booking LOGIC and API calls are identical to the production booking engine.
 * Only the visual layer is adapted to match the template's design language.
 *
 * DO NOT duplicate booking logic here. If the core booking engine changes,
 * this component must be kept in sync.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { formatInTz, getNowInTimezone } from '../lib/timezone';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';
import type { Stripe } from '@stripe/stripe-js';

// ── Types (mirrors artifacts/booking/src/pages/public-booking/types.ts) ────────

interface ServiceOptionData {
  id: number;
  serviceId: number;
  name: string;
  description?: string | null;
  durationMinutes: number;
  price: string;
  isDefault: boolean;
  displayOrder: number;
  isActive: boolean;
}

interface ServiceData {
  id: number;
  name: string;
  description?: string;
  duration: number;
  price: string;
  category: string;
  categoryId?: number;
  depositRequired?: boolean;
  depositAmount?: string | null;
  options: ServiceOptionData[];
}

interface AddonData {
  id: number;
  name: string;
  description?: string;
  price: string;
  duration: number;
  storeId: number;
}

interface ServiceAddonData {
  id: number;
  serviceId: number;
  addonId: number;
}

interface TimeSlot {
  id: string;
  time: string;
  staffId: number;
  staffName: string;
}

interface StoreData {
  id: number;
  name: string;
  address?: string;
  phone?: string;
  timezone: string;
  bookingSlug?: string;
  businessHours?: {
    id: number;
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type ViewState = 'home' | 'category' | 'time' | 'confirm' | 'payment';

function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// Template colour constants (charcoal-900, gold-400)
const C_PRIMARY = '#18181B';
const C_GOLD = '#B7922A';

// ── Stripe payment form ───────────────────────────────────────────────────────

function PaymentForm({
  intentType,
  depositAmountCents,
  onSuccess,
  onBack,
}: {
  intentType: 'setup' | 'payment' | null;
  depositAmountCents: number;
  onSuccess: (info: Record<string, unknown>) => void;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (intentType === 'setup') {
        const result = await stripe.confirmSetup({
          elements,
          confirmParams: { return_url: window.location.href },
          redirect: 'if_required',
        });
        if (result.error) throw new Error(result.error.message);
        const si = result.setupIntent;
        onSuccess({
          paymentPolicy: 'card_on_file',
          paymentStatus: 'card_saved',
          stripeSetupIntentId: si?.id,
          stripePaymentMethodId: typeof si?.payment_method === 'string' ? si.payment_method : undefined,
        });
      } else {
        const result = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: window.location.href },
          redirect: 'if_required',
        });
        if (result.error) throw new Error(result.error.message);
        const pi = result.paymentIntent;
        onSuccess({
          paymentPolicy: 'deposit',
          paymentStatus: 'deposit_paid',
          stripePaymentIntentId: pi?.id,
          stripePaymentMethodId: typeof pi?.payment_method === 'string' ? pi.payment_method : undefined,
          depositCollected: depositAmountCents / 100,
        });
      }
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Payment failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c' }}>
          {error}
        </div>
      )}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting || !stripe}
        style={{
          width: '100%', height: 52, background: C_PRIMARY, color: '#fff',
          border: 'none', borderRadius: 8, fontFamily: 'sans-serif',
          fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: (isSubmitting || !stripe) ? 0.6 : 1,
        }}
      >
        {isSubmitting ? '⏳ Processing…' : (
          intentType === 'setup' ? '🔒 Save Card & Confirm Booking' : `🔒 Pay $${(depositAmountCents / 100).toFixed(2)} & Confirm`
        )}
      </button>
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#6b7280', padding: '6px 0' }}
      >
        ← Change booking details
      </button>
    </div>
  );
}

// ── Main booking flow component ───────────────────────────────────────────────

interface BookingFlowProps {
  slug: string;
  preSelectedServiceId?: number | null;
  onClose: () => void;
}

export default function BookingFlow({ slug, preSelectedServiceId, onClose }: BookingFlowProps) {
  // ── Store data (needed for timezone) ────────────────────────────────────────
  const { data: store } = useQuery<StoreData>({
    queryKey: [`/api/public/store/${slug}`],
    queryFn: async () => {
      const res = await fetch(`/api/public/store/${slug}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch store');
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  const timezone = store?.timezone ?? 'UTC';

  // ── View state machine ───────────────────────────────────────────────────────
  const [view, setView] = useState<ViewState>('home');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<ServiceData[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<Record<number, number[]>>({});
  const [viewingAddonsForService, setViewingAddonsForService] = useState<ServiceData | null>(null);
  const [optionPickerService, setOptionPickerService] = useState<ServiceData | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarYear, setCalendarYear] = useState<number | null>(null);
  const [calendarMonthNum, setCalendarMonthNum] = useState<number | null>(null); // 1-12
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // ── Customer details ─────────────────────────────────────────────────────────
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);

  // ── Payment / Stripe ─────────────────────────────────────────────────────────
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [intentType, setIntentType] = useState<'setup' | 'payment' | null>(null);
  const [pendingStripeCustomerId, setPendingStripeCustomerId] = useState<string | null>(null);
  const [depositAmountCents, setDepositAmountCents] = useState<number>(0);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // ── Services data ────────────────────────────────────────────────────────────
  const { data: servicesData, isLoading: servicesLoading } = useQuery<{
    services: ServiceData[];
    categories: { id: number; name: string; storeId: number }[];
    addons: AddonData[];
    serviceAddons: ServiceAddonData[];
  }>({
    queryKey: [`/api/public/store/${slug}/services`],
    queryFn: async () => {
      const res = await fetch(`/api/public/store/${slug}/services`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch services');
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  const { data: publicStoreData } = useQuery<{ showPrices?: boolean }>({
    queryKey: [`/api/public/store/${slug}/meta`],
    queryFn: async () => {
      const res = await fetch(`/api/public/store/${slug}`, { credentials: 'include' });
      if (!res.ok) return { showPrices: true };
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  // ── Payment policy ───────────────────────────────────────────────────────────
  const { data: paymentPolicyData } = useQuery<{
    policy: 'none' | 'card_on_file' | 'deposit';
    depositType: 'percentage' | 'fixed' | null;
    depositValue: number | null;
    stripePublishableKey: string | null;
    stripeConnectedAccountId: string | null;
  }>({
    queryKey: [`/api/public/booking-payment-policy/${slug}`],
    queryFn: async () => {
      const res = await fetch(`/api/public/booking-payment-policy/${slug}`);
      if (!res.ok) return { policy: 'none', depositType: null, depositValue: null, stripePublishableKey: null, stripeConnectedAccountId: null };
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  // ── Load Stripe ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!paymentPolicyData?.stripePublishableKey || stripeInstance) return;
    const opts: { stripeAccount?: string } = {};
    if (paymentPolicyData.stripeConnectedAccountId) {
      opts.stripeAccount = paymentPolicyData.stripeConnectedAccountId;
    }
    loadStripe(paymentPolicyData.stripePublishableKey, opts).then(s => {
      if (s) setStripeInstance(s);
    });
  }, [paymentPolicyData?.stripePublishableKey, paymentPolicyData?.stripeConnectedAccountId, stripeInstance]);

  const services = servicesData?.services ?? [];
  const addons = servicesData?.addons ?? [];
  const serviceAddons = servicesData?.serviceAddons ?? [];
  const showPrices = publicStoreData?.showPrices ?? true;

  // ── Derived totals ────────────────────────────────────────────────────────────
  const totalPrice = selectedServices.reduce((sum, s) => {
    let price = Number(s.price);
    (selectedAddons[s.id] ?? []).forEach(addonId => {
      const addon = addons.find(a => a.id === addonId);
      if (addon) price += Number(addon.price);
    });
    return sum + price;
  }, 0);

  const totalDuration = selectedServices.reduce((sum, s) => {
    let duration = s.duration;
    (selectedAddons[s.id] ?? []).forEach(addonId => {
      const addon = addons.find(a => a.id === addonId);
      if (addon) duration += addon.duration;
    });
    return sum + duration;
  }, 0);

  const getAddonsForService = (serviceId: number) => {
    const ids = new Set(serviceAddons.filter(sa => sa.serviceId === serviceId).map(sa => sa.addonId));
    return addons.filter(a => ids.has(a.id));
  };

  const primaryService = selectedServices[0];

  // Use UTC accessors — selectedDate is created with local-time-as-UTC (same as getNowInTimezone)
  const dateString = selectedDate
    ? `${selectedDate.getUTCFullYear()}-${String(selectedDate.getUTCMonth() + 1).padStart(2, '0')}-${String(selectedDate.getUTCDate()).padStart(2, '0')}`
    : null;

  // ── Available days for the displayed calendar month ───────────────────────────
  // Returns { unavailableDates: string[] } — dates with no slots (closed, past, fully booked)
  const { data: availableDaysData, isLoading: availableDaysLoading } = useQuery<{ unavailableDates: string[] }>({
    queryKey: ['/api/public/store', slug, 'available-days', primaryService?.id, calendarYear, calendarMonthNum, totalDuration],
    queryFn: async () => {
      const params = new URLSearchParams({
        serviceId: String(primaryService!.id),
        year: String(calendarYear),
        month: String(calendarMonthNum),
        duration: String(totalDuration),
      });
      const res = await fetch(`/api/public/store/${slug}/available-days?${params}`, { credentials: 'include' });
      if (!res.ok) return { unavailableDates: [] };
      return res.json();
    },
    enabled: !!slug && !!primaryService && totalDuration > 0 && !!calendarYear && !!calendarMonthNum,
    staleTime: 60_000,
  });

  const unavailableDatesSet = useMemo(
    () => new Set(availableDaysData?.unavailableDates ?? []),
    [availableDaysData]
  );

  // ── Time slots ───────────────────────────────────────────────────────────────
  const { data: slots, isLoading: slotsLoading } = useQuery<TimeSlot[]>({
    queryKey: ['/api/public/store', slug, 'availability', primaryService?.id, dateString, totalDuration],
    queryFn: async () => {
      const params = new URLSearchParams({
        serviceId: String(primaryService!.id),
        date: dateString!,
        duration: String(totalDuration),
      });
      const res = await fetch(`/api/public/store/${slug}/availability?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch availability');
      return res.json();
    },
    enabled: !!slug && !!primaryService && !!dateString && totalDuration > 0,
  });

  // ── Pre-fill phone ────────────────────────────────────────────────────────────
  useMemo(() => {
    const stored = localStorage.getItem(`booking_user_phone_${slug}`);
    if (stored) setCustomerPhone(stored);
  }, [slug]);

  // ── Initialize calendar to today's month when store loads ────────────────────
  useEffect(() => {
    if (store && calendarYear === null) {
      const today = getNowInTimezone(timezone);
      setSelectedDate(today);
      setCalendarYear(today.getUTCFullYear());
      setCalendarMonthNum(today.getUTCMonth() + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, timezone]);

  // ── Auto-select service when opened from a service card ───────────────────────
  useEffect(() => {
    const requestedServiceId = Number(preSelectedServiceId);
    if (!Number.isFinite(requestedServiceId) || requestedServiceId <= 0 || services.length === 0) return;
    const found = services.find(s => Number(s.id) === requestedServiceId);
    if (!found) return;
    // Behave exactly as if the customer clicked the service in the booking flow
    if (found.options && found.options.length > 1) {
      setOptionPickerService(found);
      return;
    }
    const serviceAddonsList = getAddonsForService(found.id);
    if (serviceAddonsList.length > 0) {
      setViewingAddonsForService(found);
    } else {
      setSelectedServices([found]);
      setView('time');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedServiceId, services]);

  // ── Monthly calendar navigation ───────────────────────────────────────────────
  // calendarCells: null = empty padding cell, number = day of month
  const calendarCells = useMemo((): (number | null)[] => {
    if (!calendarYear || !calendarMonthNum) return [];
    const firstDayOfWeek = new Date(calendarYear, calendarMonthNum - 1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(calendarYear, calendarMonthNum, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null); // pad to complete last row
    return cells;
  }, [calendarYear, calendarMonthNum]);

  const navigateMonth = (dir: 'prev' | 'next') => {
    if (!calendarYear || !calendarMonthNum) return;
    const today = getNowInTimezone(timezone);
    const todayYear = today.getUTCFullYear();
    const todayMonth = today.getUTCMonth() + 1;
    let newYear = calendarYear;
    let newMonth = calendarMonthNum;
    if (dir === 'prev') {
      if (calendarYear === todayYear && calendarMonthNum === todayMonth) return;
      newMonth--;
      if (newMonth < 1) { newMonth = 12; newYear--; }
    } else {
      newMonth++;
      if (newMonth > 12) { newMonth = 1; newYear++; }
    }
    setCalendarYear(newYear);
    setCalendarMonthNum(newMonth);
    setSelectedDate(null);
    setSelectedSlot(null);
  };

  // Today's date string in store timezone — used to highlight today in the calendar
  const todayDateStr = useMemo(() => {
    if (!store) return null;
    return formatInTz(new Date(), timezone, 'yyyy-MM-dd');
  }, [store, timezone]);

  // ── Grouped services ─────────────────────────────────────────────────────────
  const groupedServices = useMemo(() => {
    const groups: Record<string, ServiceData[]> = {};
    for (const s of services) {
      const cat = s.category || 'General';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    }
    return groups;
  }, [services]);

  const categoriesList = Object.keys(groupedServices);

  // ── Grouped time slots ───────────────────────────────────────────────────────
  const groupedSlots = useMemo(() => {
    if (!slots) return { morning: [], afternoon: [], evening: [] };
    const morning: TimeSlot[] = [], afternoon: TimeSlot[] = [], evening: TimeSlot[] = [];
    for (const slot of slots) {
      const hour = parseInt(formatInTz(slot.time, timezone, 'H'));
      if (hour < 12) morning.push(slot);
      else if (hour < 17) afternoon.push(slot);
      else evening.push(slot);
    }
    return { morning, afternoon, evening };
  }, [slots, timezone]);

  // ── Toggle addon ─────────────────────────────────────────────────────────────
  const toggleAddon = (serviceId: number, addonId: number) => {
    setSelectedAddons(prev => {
      const current = prev[serviceId] ?? [];
      return {
        ...prev,
        [serviceId]: current.includes(addonId) ? current.filter(id => id !== addonId) : [...current, addonId],
      };
    });
  };

  // ── Service selection handlers ────────────────────────────────────────────────
  const handleServiceSelect = (service: ServiceData) => {
    if (service.options && service.options.length > 1) {
      setOptionPickerService(service);
      return;
    }
    const serviceAddonsList = getAddonsForService(service.id);
    if (serviceAddonsList.length > 0) {
      setViewingAddonsForService(service);
    } else {
      setSelectedServices([service]);
      setView('time');
    }
  };

  const handlePickOption = (service: ServiceData, option: ServiceOptionData) => {
    const withOption: ServiceData = {
      ...service,
      duration: option.durationMinutes,
      price: option.price,
      name: `${service.name} – ${option.name}`,
      options: [],
    };
    const serviceAddonsList = getAddonsForService(service.id);
    if (serviceAddonsList.length > 0) {
      setViewingAddonsForService(withOption);
    } else {
      setSelectedServices([withOption]);
      setView('time');
    }
    setOptionPickerService(null);
  };

  const confirmServiceWithAddons = () => {
    if (viewingAddonsForService) {
      setSelectedServices([viewingAddonsForService]);
      setViewingAddonsForService(null);
      setView('time');
    }
  };

  const handleSelectSlot = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    setView('confirm');
  };

  // ── Booking submission ────────────────────────────────────────────────────────
  const bookMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/public/store/${slug}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Booking failed');
      }
      return res.json();
    },
    onSuccess: () => {
      setBookingSuccess(true);
      if (customerPhone) localStorage.setItem(`booking_user_phone_${slug}`, customerPhone);
    },
  });

  const submitBooking = useCallback((paymentInfo: Record<string, unknown>) => {
    if (!primaryService || !selectedSlot) return;
    const allAddonIds = Object.values(selectedAddons).flat();
    bookMutation.mutate({
      serviceId: primaryService.id,
      staffId: selectedSlot.staffId,
      date: selectedSlot.time,
      duration: totalDuration,
      customerName: customerName.trim() || 'Guest',
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: customerPhone.trim(),
      addonIds: allAddonIds,
      smsOptIn,
      ...paymentInfo,
    });
  }, [primaryService, selectedSlot, selectedAddons, totalDuration, customerName, customerEmail, customerPhone, smsOptIn, bookMutation]);

  const handleConfirmBooking = async () => {
    if (!primaryService || !selectedSlot) return;
    if (!customerName.trim()) return;
    const phoneDigits = customerPhone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      setPhoneError('Enter a valid 10-digit phone number.');
      return;
    }

    const policy = paymentPolicyData?.policy ?? 'none';

    if (policy === 'none') {
      submitBooking({});
      return;
    }

    setIsCreatingIntent(true);
    setPaymentError(null);
    try {
      if (policy === 'card_on_file') {
        const res = await fetch('/api/public/booking-setup-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, customerName: customerName.trim() || 'Guest', customerEmail: customerEmail.trim() || undefined, customerPhone: customerPhone.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to initialize payment');
        setPaymentClientSecret(data.clientSecret);
        setIntentType('setup');
        setPendingStripeCustomerId(data.stripeCustomerId);
      } else {
        const serviceTotalCents = Math.round(totalPrice * 100);
        const res = await fetch('/api/public/booking-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, customerName: customerName.trim() || 'Guest', customerEmail: customerEmail.trim() || undefined, customerPhone: customerPhone.trim(), serviceTotalCents }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to initialize payment');
        setPaymentClientSecret(data.clientSecret);
        setIntentType('payment');
        setPendingStripeCustomerId(data.stripeCustomerId);
        setDepositAmountCents(data.depositCents ?? serviceTotalCents);
      }
      setView('payment');
    } catch (err: unknown) {
      setPaymentError((err as Error).message ?? 'Failed to initialize payment');
    } finally {
      setIsCreatingIntent(false);
    }
  };

  const isPhoneValid = customerPhone.replace(/\D/g, '').length === 10;

  // ── Reset for "Book Another" ──────────────────────────────────────────────────
  const resetFlow = () => {
    setBookingSuccess(false);
    setView('home');
    setSelectedServices([]);
    setSelectedAddons({});
    setSelectedSlot(null);
    setCustomerName('');
    setCustomerEmail('');
    setPhoneError('');
    setSmsOptIn(false);
    setPaymentClientSecret(null);
    setIntentType(null);
    setStripeInstance(null);
    setPaymentError(null);
    // Reset calendar back to today's month
    const today = getNowInTimezone(timezone);
    setSelectedDate(today);
    setCalendarYear(today.getUTCFullYear());
    setCalendarMonthNum(today.getUTCMonth() + 1);
  };

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const btn = {
    primary: {
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      width: '100%', height: 50, background: C_PRIMARY, color: '#fff',
      border: 'none', borderRadius: 10, fontFamily: 'sans-serif',
      fontSize: 14, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.02em',
    } as React.CSSProperties,
    ghost: {
      background: 'none', border: 'none', cursor: 'pointer',
      fontSize: 13, color: '#6b7280', padding: '6px 4px',
      display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'sans-serif',
    } as React.CSSProperties,
    outline: {
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      width: '100%', height: 50, background: '#fff', color: C_PRIMARY,
      border: `1.5px solid ${C_PRIMARY}`, borderRadius: 10, fontFamily: 'sans-serif',
      fontSize: 14, fontWeight: 600, cursor: 'pointer',
    } as React.CSSProperties,
  };

  const input = {
    width: '100%', padding: '12px 14px', borderRadius: 8,
    border: '1.5px solid #e5e7eb', fontFamily: 'sans-serif',
    fontSize: 14, color: '#111827', background: '#f9fafb',
    outline: 'none', boxSizing: 'border-box',
  } as React.CSSProperties;

  // ── Success screen ────────────────────────────────────────────────────────────
  if (bookingSuccess) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', height: '100%', gap: 16, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>
          ✓
        </div>
        <div>
          <h2 style={{ fontFamily: 'serif', fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Booking Confirmed!</h2>
          <p style={{ fontFamily: 'sans-serif', fontSize: 14, color: '#6b7280', marginTop: 6 }}>
            {store?.name ? `Your appointment at ${store.name} has been booked.` : 'Your appointment has been booked.'}
          </p>
        </div>

        {selectedSlot && (
          <div style={{ width: '100%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', textAlign: 'left' }}>
            <p style={{ fontFamily: 'sans-serif', fontWeight: 700, fontSize: 15, color: '#111827', margin: 0 }}>{primaryService?.name}</p>
            <p style={{ fontFamily: 'sans-serif', fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
              {formatInTz(selectedSlot.time, timezone, 'EEEE, d MMMM yyyy')}
            </p>
            <p style={{ fontFamily: 'sans-serif', fontSize: 13, color: C_GOLD, fontWeight: 600, margin: '2px 0 0' }}>
              {formatInTz(selectedSlot.time, timezone, 'h:mm a')} · with {selectedSlot.staffName}
            </p>
          </div>
        )}

        {intentType === 'setup' && (
          <div style={{ width: '100%', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', textAlign: 'left' }}>
            <p style={{ fontFamily: 'sans-serif', fontSize: 13, color: '#1d4ed8', fontWeight: 600, margin: 0 }}>🔒 Card securely stored</p>
            <p style={{ fontFamily: 'sans-serif', fontSize: 12, color: '#3b82f6', margin: '4px 0 0' }}>No payment was taken today.</p>
          </div>
        )}
        {intentType === 'payment' && depositAmountCents > 0 && (
          <div style={{ width: '100%', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', textAlign: 'left' }}>
            <p style={{ fontFamily: 'sans-serif', fontSize: 13, color: '#166534', fontWeight: 600, margin: 0 }}>Deposit paid: ${(depositAmountCents / 100).toFixed(2)}</p>
          </div>
        )}

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={resetFlow} style={btn.outline}>Book Another Appointment</button>
          <button onClick={onClose} style={btn.ghost}>Close</button>
        </div>
      </div>
    );
  }

  // ── Main panel ────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f9fafb' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 100px' }}>

        {/* ── Home / Category views ── */}
        {(view === 'home' || view === 'category') && (
          <div>
            {/* Store card */}
            {store && (
              <div style={{ background: C_PRIMARY, borderRadius: 16, padding: '20px 20px', color: '#fff', marginBottom: 20 }}>
                <h2 style={{ fontFamily: 'serif', fontSize: 20, fontWeight: 700, margin: 0 }}>{store.name}</h2>
                {store.address && (
                  <p style={{ fontFamily: 'sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>📍 {store.address}</p>
                )}
              </div>
            )}

            {/* Services loading */}
            {servicesLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${C_GOLD}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
              </div>
            )}

            {/* Category list (home view) */}
            {!servicesLoading && view === 'home' && (
              <div>
                <p style={{ fontFamily: 'sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: C_GOLD, marginBottom: 12 }}>
                  Services
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {categoriesList.map(cat => (
                    <button
                      key={cat}
                      onClick={() => { setActiveCategory(cat); setView('category'); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 16px', background: '#fff', borderRadius: 12,
                        border: '1px solid #e5e7eb', cursor: 'pointer', fontFamily: 'sans-serif',
                        textAlign: 'left', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      }}
                    >
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>{cat}</p>
                        <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>
                          {groupedServices[cat].length} service{groupedServices[cat].length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <span style={{ color: '#9ca3af', fontSize: 18 }}>›</span>
                    </button>
                  ))}
                </div>

                {/* Quick-book pill if service already selected */}
                {primaryService && (
                  <button
                    onClick={() => setView('time')}
                    style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: C_GOLD, color: '#fff', border: 'none', borderRadius: 30, cursor: 'pointer', fontFamily: 'sans-serif', fontSize: 13, fontWeight: 600 }}
                  >
                    📅 Choose Time for {primaryService.name}
                  </button>
                )}
              </div>
            )}

            {/* Services within a category */}
            {!servicesLoading && view === 'category' && (
              <div>
                <button onClick={() => setView('home')} style={btn.ghost}>← Back</button>
                <p style={{ fontFamily: 'sans-serif', fontWeight: 700, fontSize: 15, color: '#111827', margin: '12px 0 10px' }}>{activeCategory}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(groupedServices[activeCategory!] ?? []).map(service => {
                    const isSelected = selectedServices.some(s => s.id === service.id);
                    return (
                      <button
                        key={service.id}
                        onClick={() => handleServiceSelect(service)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '14px 16px', background: isSelected ? '#fafafa' : '#fff', borderRadius: 12,
                          border: `2px solid ${isSelected ? C_PRIMARY : '#e5e7eb'}`, cursor: 'pointer',
                          fontFamily: 'sans-serif', textAlign: 'left', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        }}
                      >
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>{service.name}</p>
                          <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>{service.duration} min</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {showPrices && <span style={{ fontWeight: 700, color: C_PRIMARY, fontSize: 14 }}>${Number(service.price).toFixed(2)}</span>}
                          {isSelected ? <span style={{ color: 'green', fontSize: 18 }}>✓</span> : <span style={{ color: '#d1d5db', fontSize: 18 }}>+</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedServices.length > 0 && (
                  <button onClick={() => setView('time')} style={{ ...btn.primary, marginTop: 16 }}>
                    Choose Date & Time →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Time picker view ── */}
        {view === 'time' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <button onClick={() => setView('home')} style={btn.ghost}>← Back</button>
              <h2 style={{ fontFamily: 'serif', fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Choose Time</h2>
            </div>

            {!primaryService ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280', fontFamily: 'sans-serif' }}>
                <p>Please select a service first.</p>
                <button onClick={() => setView('home')} style={{ ...btn.ghost, margin: '8px auto' }}>Back to Services</button>
              </div>
            ) : (
              <>
                {/* Monthly calendar */}
                <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: '16px', marginBottom: 16 }}>
                  {/* Month header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <button
                      onClick={() => navigateMonth('prev')}
                      style={{ ...btn.ghost, padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 18, lineHeight: 1 }}
                    >‹</button>
                    <span style={{ fontFamily: 'sans-serif', fontSize: 14, fontWeight: 700, color: '#111827' }}>
                      {calendarYear && calendarMonthNum
                        ? new Date(calendarYear, calendarMonthNum - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                        : ''}
                    </span>
                    <button
                      onClick={() => navigateMonth('next')}
                      style={{ ...btn.ghost, padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 18, lineHeight: 1 }}
                    >›</button>
                  </div>

                  {/* Day-of-week headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                      <div key={d} style={{ textAlign: 'center', fontFamily: 'sans-serif', fontSize: 11, fontWeight: 600, color: '#9ca3af', padding: '2px 0' }}>{d}</div>
                    ))}
                  </div>

                  {/* Calendar day cells */}
                  {availableDaysLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', border: `3px solid ${C_GOLD}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                      {calendarCells.map((day, i) => {
                        if (day === null) {
                          return <div key={`e-${i}`} />;
                        }
                        const dateStr = `${calendarYear}-${String(calendarMonthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const isUnavailable = unavailableDatesSet.has(dateStr);
                        const isToday = dateStr === todayDateStr;
                        const isSelected = selectedDate
                          ? selectedDate.getUTCFullYear() === calendarYear &&
                            selectedDate.getUTCMonth() + 1 === calendarMonthNum &&
                            selectedDate.getUTCDate() === day
                          : false;

                        return (
                          <button
                            key={day}
                            disabled={isUnavailable}
                            onClick={() => {
                              // Create date with local-time-as-UTC (matches getNowInTimezone pattern)
                              const d = new Date(`${dateStr}T12:00:00Z`);
                              setSelectedDate(d);
                              setSelectedSlot(null);
                            }}
                            style={{
                              padding: '9px 2px',
                              borderRadius: 8,
                              border: isToday && !isSelected ? `2px solid ${C_GOLD}` : '2px solid transparent',
                              cursor: isUnavailable ? 'default' : 'pointer',
                              background: isSelected ? C_PRIMARY : 'transparent',
                              color: isUnavailable ? '#d1d5db' : isSelected ? '#fff' : isToday ? C_GOLD : '#374151',
                              fontFamily: 'sans-serif',
                              fontSize: 13,
                              fontWeight: isSelected || isToday ? 700 : 400,
                              textAlign: 'center',
                            }}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Time slots */}
                {slotsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', border: `3px solid ${C_GOLD}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                ) : !slots || slots.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#6b7280', fontFamily: 'sans-serif', fontSize: 14, background: '#fff', borderRadius: 12, border: '1px dashed #d1d5db' }}>
                    No availability for this day
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {([{ label: 'Morning', items: groupedSlots.morning }, { label: 'Afternoon', items: groupedSlots.afternoon }, { label: 'Evening', items: groupedSlots.evening }] as const).filter(g => g.items.length > 0).map(group => (
                      <div key={group.label}>
                        <p style={{ fontFamily: 'sans-serif', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 8 }}>{group.label}</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                          {group.items.map((slot, i) => (
                            <button
                              key={i}
                              onClick={() => handleSelectSlot(slot)}
                              style={{
                                padding: '10px 4px', background: '#fff', border: '1.5px solid #e5e7eb',
                                borderRadius: 10, cursor: 'pointer', fontFamily: 'sans-serif',
                                fontSize: 13, fontWeight: 600, color: '#374151',
                              }}
                            >
                              {formatInTz(slot.time, timezone, 'h:mm a')}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Confirm view ── */}
        {view === 'confirm' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <button onClick={() => setView('time')} style={btn.ghost}>← Back</button>
              <h2 style={{ fontFamily: 'serif', fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Confirm Booking</h2>
            </div>

            {/* Booking summary */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 14, paddingBottom: 14, borderBottom: '1px solid #f3f4f6', marginBottom: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>✂️</div>
                <div>
                  <p style={{ fontFamily: 'sans-serif', fontWeight: 700, fontSize: 15, color: '#111827', margin: 0 }}>{primaryService?.name}</p>
                  <p style={{ fontFamily: 'sans-serif', fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>⏱ {primaryService?.duration} min · 👤 {selectedSlot?.staffName}</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'sans-serif', fontSize: 13 }}>
                  <span style={{ color: '#6b7280' }}>Date</span>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{selectedSlot && formatInTz(selectedSlot.time, timezone, 'd MMM yyyy')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'sans-serif', fontSize: 13 }}>
                  <span style={{ color: '#6b7280' }}>Time</span>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{selectedSlot && formatInTz(selectedSlot.time, timezone, 'h:mm a')}</span>
                </div>
                {showPrices && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'sans-serif', fontSize: 13 }}>
                    <span style={{ color: '#6b7280' }}>Total</span>
                    <span style={{ fontWeight: 700, color: C_PRIMARY }}>${totalPrice.toFixed(2)}</span>
                  </div>
                )}
              </div>
              {paymentPolicyData?.policy === 'card_on_file' && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6', display: 'flex', gap: 8 }}>
                  <span>🔒</span>
                  <p style={{ fontFamily: 'sans-serif', fontSize: 13, color: '#1d4ed8', margin: 0 }}>
                    A card is required to secure your booking. <strong>No charge will be made today.</strong>
                  </p>
                </div>
              )}
              {paymentPolicyData?.policy === 'deposit' && (() => {
                const depositDollars = paymentPolicyData.depositType === 'percentage'
                  ? totalPrice * ((paymentPolicyData.depositValue ?? 0) / 100)
                  : (paymentPolicyData.depositValue ?? 0);
                return (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'sans-serif', fontSize: 13 }}>
                      <span style={{ color: '#92400e', fontWeight: 600 }}>Deposit due today</span>
                      <span style={{ color: '#92400e', fontWeight: 700 }}>${depositDollars.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'sans-serif', fontSize: 12 }}>
                      <span style={{ color: '#6b7280' }}>Remaining at checkout</span>
                      <span style={{ color: '#6b7280' }}>${Math.max(0, totalPrice - depositDollars).toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Customer details */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
              <p style={{ fontFamily: 'sans-serif', fontWeight: 700, fontSize: 14, color: '#111827', margin: '0 0 14px' }}>Your Details</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input style={input} placeholder="Full Name" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                <input
                  style={input}
                  placeholder="Phone (555) 555-5555"
                  value={customerPhone}
                  onChange={e => {
                    let v = e.target.value.replace(/\D/g, '');
                    if (v.length > 10) v = v.slice(0, 10);
                    if (v.length >= 6) v = `(${v.slice(0, 3)}) ${v.slice(3, 6)}-${v.slice(6)}`;
                    else if (v.length >= 3) v = `(${v.slice(0, 3)}) ${v.slice(3)}`;
                    setCustomerPhone(v);
                    if (phoneError) setPhoneError('');
                  }}
                />
                {phoneError && <p style={{ fontFamily: 'sans-serif', fontSize: 12, color: '#dc2626', margin: 0 }}>{phoneError}</p>}
                <input style={input} type="email" placeholder="Email (optional)" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />

                {/* SMS consent */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={smsOptIn}
                      onChange={e => setSmsOptIn(e.target.checked)}
                      style={{ marginTop: 2, accentColor: C_PRIMARY, flexShrink: 0 }}
                    />
                    <span style={{ fontFamily: 'sans-serif', fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
                      Get appointment updates via text
                    </span>
                  </label>
                  <p style={{ fontFamily: 'sans-serif', fontSize: 11, color: '#9ca3af', margin: '8px 0 0', lineHeight: 1.5 }}>
                    By checking, you consent to receive automated texts from Certxa LLC. Msg &amp; data rates may apply. Reply STOP to opt out.
                  </p>
                </div>
              </div>
            </div>

            {paymentError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 12, fontFamily: 'sans-serif' }}>
                {paymentError}
              </div>
            )}

            <button
              onClick={handleConfirmBooking}
              disabled={bookMutation.isPending || isCreatingIntent || !customerName.trim() || !isPhoneValid}
              style={{
                ...btn.primary,
                opacity: (bookMutation.isPending || isCreatingIntent || !customerName.trim() || !isPhoneValid) ? 0.5 : 1,
              }}
            >
              {(bookMutation.isPending || isCreatingIntent) ? '⏳ Please wait…' : (
                paymentPolicyData?.policy === 'card_on_file' ? '🔒 Continue to Save Card'
                  : paymentPolicyData?.policy === 'deposit' ? '🔒 Continue to Pay Deposit'
                  : 'Confirm Booking'
              )}
            </button>
          </div>
        )}

        {/* ── Payment view ── */}
        {view === 'payment' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <button onClick={() => setView('confirm')} style={btn.ghost}>← Back</button>
              <h2 style={{ fontFamily: 'serif', fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>
                {intentType === 'setup' ? 'Save Payment Method' : 'Pay Deposit'}
              </h2>
            </div>

            {/* Recap */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
              <p style={{ fontFamily: 'sans-serif', fontWeight: 700, fontSize: 14, color: '#111827', margin: 0 }}>{primaryService?.name}</p>
              <p style={{ fontFamily: 'sans-serif', fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
                {selectedSlot && formatInTz(selectedSlot.time, timezone, "EEEE, d MMMM yyyy 'at' h:mm a")}
              </p>
              {intentType === 'payment' && depositAmountCents > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
                  {showPrices && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'sans-serif', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ color: '#6b7280' }}>Service total</span>
                      <span>${totalPrice.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'sans-serif', fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                    <span>Deposit due now</span>
                    <span>${(depositAmountCents / 100).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'sans-serif', fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    <span>Remaining at checkout</span>
                    <span>${Math.max(0, totalPrice - depositAmountCents / 100).toFixed(2)}</span>
                  </div>
                </div>
              )}
              {intentType === 'setup' && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f3f4f6', display: 'flex', gap: 8 }}>
                  <span>🔒</span>
                  <p style={{ fontFamily: 'sans-serif', fontSize: 13, color: '#1d4ed8', margin: 0 }}>
                    Your card will be securely stored. <strong>No charge today.</strong>
                  </p>
                </div>
              )}
            </div>

            {stripeInstance && paymentClientSecret ? (
              <Elements
                stripe={stripeInstance}
                options={{ clientSecret: paymentClientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: C_PRIMARY } } }}
              >
                <PaymentForm
                  intentType={intentType}
                  depositAmountCents={depositAmountCents}
                  onSuccess={info => submitBooking({ ...info, stripeCustomerId: pendingStripeCustomerId })}
                  onBack={() => setView('confirm')}
                />
              </Elements>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${C_GOLD}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                <p style={{ fontFamily: 'sans-serif', fontSize: 13, color: '#6b7280' }}>Preparing payment…</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Addon overlay */}
      {viewingAddonsForService && (
        <div style={{ position: 'absolute', inset: 0, background: '#fff', zIndex: 60, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <h2 style={{ fontFamily: 'sans-serif', fontWeight: 700, fontSize: 16, margin: 0 }}>Enhance your service</h2>
              <p style={{ fontFamily: 'sans-serif', fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>Add-ons for {viewingAddonsForService.name}</p>
            </div>
            <button onClick={() => setViewingAddonsForService(null)} style={{ ...btn.ghost, fontSize: 22 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 100px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {getAddonsForService(viewingAddonsForService.id).map(addon => {
              const isSelected = (selectedAddons[viewingAddonsForService.id] ?? []).includes(addon.id);
              return (
                <div
                  key={addon.id}
                  onClick={() => toggleAddon(viewingAddonsForService.id, addon.id)}
                  style={{
                    border: `2px solid ${isSelected ? C_PRIMARY : '#e5e7eb'}`, borderRadius: 10, padding: '14px 16px',
                    cursor: 'pointer', background: isSelected ? '#f9fafb' : '#fff',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <p style={{ fontFamily: 'sans-serif', fontWeight: 600, fontSize: 14, margin: 0 }}>{addon.name}</p>
                    {addon.description && <p style={{ fontFamily: 'sans-serif', fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>{addon.description}</p>}
                    <p style={{ fontFamily: 'sans-serif', fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>+{addon.duration} min</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {showPrices && <p style={{ fontFamily: 'sans-serif', fontWeight: 700, fontSize: 14, color: C_PRIMARY, margin: 0 }}>+${Number(addon.price).toFixed(2)}</p>}
                    {isSelected && <span style={{ color: 'green', fontSize: 18 }}>✓</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e5e7eb', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {showPrices && <span style={{ fontFamily: 'sans-serif', fontSize: 14, color: '#6b7280' }}>${totalPrice.toFixed(2)}</span>}
            </div>
            <button onClick={confirmServiceWithAddons} style={{ ...btn.primary, width: 'auto', padding: '12px 24px' }}>
              Choose Date & Time
            </button>
          </div>
        </div>
      )}

      {/* Option picker modal */}
      {optionPickerService && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid #f3f4f6' }}>
              <h3 style={{ fontFamily: 'sans-serif', fontWeight: 700, fontSize: 15, margin: 0 }}>{optionPickerService.name}</h3>
              <p style={{ fontFamily: 'sans-serif', fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>Choose an option to continue</p>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
              {optionPickerService.options.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handlePickOption(optionPickerService, opt)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 10,
                    border: '2px solid #e5e7eb', cursor: 'pointer', background: '#fff',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontFamily: 'sans-serif',
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>{opt.name}</p>
                    {opt.description && <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>{opt.description}</p>}
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>{opt.durationMinutes} min</p>
                  </div>
                  {showPrices && <span style={{ fontWeight: 700, fontSize: 14, color: C_PRIMARY, flexShrink: 0, marginLeft: 12 }}>${Number(opt.price).toFixed(2)}</span>}
                </button>
              ))}
            </div>
            <div style={{ padding: '10px 16px 16px' }}>
              <button onClick={() => setOptionPickerService(null)} style={{ ...btn.ghost, width: '100%', justifyContent: 'center' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
