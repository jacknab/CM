/**
 * BookingPanel — slide-in booking flow for the Bloom template.
 *
 * Opens when a visitor clicks "Book" on any service card (or the generic
 * "Book Appointment" buttons). Fetches availability from the public API using
 * the slug injected by the server, then walks the visitor through:
 *   service → date → time → details → success
 *
 * No external dependencies beyond React and lucide-react.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, ArrowLeft, Loader2, CheckCircle2, Clock, Calendar } from 'lucide-react';
import { useBooking } from '@/context/BookingContext';
import { useSite } from '@/context/SiteContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceEntry {
  id: number;
  name: string;
  price: string | number;
  duration?: number;
  category?: string;
  description?: string;
}

interface TimeSlot {
  time: string;
  staffId: number;
  staffName: string;
}

type Step = 'service' | 'date' | 'time' | 'details' | 'success';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns an array of day numbers (1–N) with leading null padding so col 0 = Sunday */
function getCalendarCells(year: number, month: number): (number | null)[] {
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatSlotTime(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return isoStr;
  }
}

function formatPrice(price: string | number): string {
  const n = typeof price === 'string' ? parseFloat(price) : price;
  return isNaN(n) || n === 0 ? 'POA' : `$${n}`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BookingPanel() {
  const { isOpen, selectedServiceId, selectedServiceName, closeBooking } = useBooking();
  const { bookingSlug } = useSite();

  // IMPORTANT: public booking APIs are keyed by the LOCATION booking slug,
  // which can differ from the website/subdomain slug.
  const slug: string = bookingSlug ?? (window as any).__CERTXA_SLUG__ ?? '';
  const apiBase: string = (window as any).__CERTXA_API_BASE__ ?? '';

  // ── Core state ───────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('service');
  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceEntry | null>(null);

  // Calendar month state (1-indexed month)
  const _now = new Date();
  const [calYear, setCalYear] = useState(_now.getFullYear());
  const [calMonth, setCalMonth] = useState(_now.getMonth() + 1);
  const [availableDaysLoading, setAvailableDaysLoading] = useState(false);
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  // ── Fetch services ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !slug) return;
    setServicesLoading(true);
    fetch(`${apiBase}/api/public/store/${slug}/services`)
      .then(r => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.services) setServices(d.services);
      })
      .catch(() => {})
      .finally(() => setServicesLoading(false));
  }, [isOpen, slug, apiBase]);

  // ── Pre-select service when panel opens ───────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    // Reset flow each time panel opens
    setStep('service');
    setSelectedDate(null);
    setSlots([]);
    setSelectedSlot(null);
    const now = new Date();
    setCalYear(now.getFullYear());
    setCalMonth(now.getMonth() + 1);
    setUnavailableDates(new Set());
    setName('');
    setPhone('');
    setEmail('');
    setSubmitError(null);
    setSlotsError(null);
  }, [isOpen]);

  // Once services load, apply pre-selection and jump to date step
  const preselectionApplied = useRef<number | string | null>(null);
  useEffect(() => {
    if ((!selectedServiceId && !selectedServiceName) || services.length === 0) return;
    const preselectKey = selectedServiceId ?? selectedServiceName ?? null;
    if (preselectionApplied.current === preselectKey) return;

    const normalizedRequestedName = (selectedServiceName ?? '').trim().toLowerCase();
    const match = services.find((s) => {
      if (selectedServiceId != null && String(s.id) === String(selectedServiceId)) return true;
      if (!normalizedRequestedName) return false;
      return s.name.trim().toLowerCase() === normalizedRequestedName;
    });

    preselectionApplied.current = preselectKey;
    if (match) {
      setSelectedService(match);
      setStep('date');
    }
  }, [selectedServiceId, selectedServiceName, services]);

  // Reset applied flag when panel closes
  useEffect(() => {
    if (!isOpen) {
      preselectionApplied.current = null;
      setSelectedService(null);
    }
  }, [isOpen]);

  // ── Fetch available days for the displayed calendar month ────────────────────
  useEffect(() => {
    if (step !== 'date' || !selectedService || !slug) return;
    setAvailableDaysLoading(true);
    const params = new URLSearchParams({
      serviceId: String(selectedService.id),
      year: String(calYear),
      month: String(calMonth),
      duration: String(selectedService.duration ?? 60),
    });
    fetch(`${apiBase}/api/public/store/${slug}/available-days?${params}`)
      .then(r => r.ok ? r.json() : { unavailableDates: [] })
      .then((d: { unavailableDates?: string[] }) => {
        setUnavailableDates(new Set(Array.isArray(d.unavailableDates) ? d.unavailableDates : []));
      })
      .catch(() => {})
      .finally(() => setAvailableDaysLoading(false));
  }, [step, selectedService, calYear, calMonth, slug, apiBase]);

  // ── Fetch slots when date changes ─────────────────────────────────────────────
  useEffect(() => {
    if (!selectedDate || !selectedService || !slug) return;
    setSlotsLoading(true);
    setSlotsError(null);
    setSlots([]);
    setSelectedSlot(null);

    const params = new URLSearchParams({
      serviceId: String(selectedService.id),
      date: toDateKey(selectedDate),
      duration: String(selectedService.duration ?? 60),
    });

    fetch(`${apiBase}/api/public/store/${slug}/availability?${params}`)
      .then(r => r.ok ? r.json() : Promise.reject('error'))
      .then(d => {
        setSlots(Array.isArray(d) ? d : []);
        setStep('time');
      })
      .catch(() => setSlotsError('Could not load availability. Please try another date.'))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, selectedService, slug, apiBase]);

  // ── Keyboard close ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeBooking(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeBooking]);

  // ── Book submission ───────────────────────────────────────────────────────────
  const handleBook = useCallback(async () => {
    if (!selectedService || !selectedSlot || !name.trim() || !phone.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${apiBase}/api/public/store/${slug}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          serviceId: selectedService.id,
          staffId: selectedSlot.staffId,
          date: selectedSlot.time,
          duration: selectedService.duration ?? 60,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerEmail: email.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? 'Booking failed. Please try again.');
      }
      setStep('success');
    } catch (err: any) {
      setSubmitError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedService, selectedSlot, name, phone, email, slug, apiBase]);

  // ── Calendar derivations ──────────────────────────────────────────────────────
  const calendarCells = getCalendarCells(calYear, calMonth);
  const _t = new Date();
  const todayStr = toDateKey(_t);
  const todayYear = _t.getFullYear();
  const todayMonth = _t.getMonth() + 1;

  const navigateMonth = (dir: 'prev' | 'next') => {
    if (dir === 'prev') {
      if (calYear === todayYear && calMonth === todayMonth) return;
      let ny = calYear, nm = calMonth - 1;
      if (nm < 1) { nm = 12; ny--; }
      setCalYear(ny); setCalMonth(nm);
    } else {
      let ny = calYear, nm = calMonth + 1;
      if (nm > 12) { nm = 1; ny++; }
      setCalYear(ny); setCalMonth(nm);
    }
    setSelectedDate(null);
    setSelectedSlot(null);
    setSlots([]);
  };

  // ── Slot groups ───────────────────────────────────────────────────────────────
  const slotGroups = {
    Morning: slots.filter(s => new Date(s.time).getHours() < 12),
    Afternoon: slots.filter(s => { const h = new Date(s.time).getHours(); return h >= 12 && h < 17; }),
    Evening: slots.filter(s => new Date(s.time).getHours() >= 17),
  };

  if (!isOpen) return null;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[100] flex"
      role="dialog"
      aria-modal="true"
      aria-label="Book an appointment"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm"
        onClick={closeBooking}
        aria-hidden="true"
      />

      {/* Panel — slides in from the right */}
      <div
        ref={panelRef}
        className="relative ml-auto flex h-full w-full max-w-md flex-col bg-cream-50 shadow-2xl overflow-hidden"
        style={{ animation: 'slideInRight 0.3s ease-out' }}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-cream-200 bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            {(step === 'time' || step === 'details') && (
              <button
                type="button"
                onClick={() => {
                  if (step === 'details') setStep('time');
                  else if (step === 'time') { setSelectedDate(null); setStep('date'); }
                }}
                className="grid h-8 w-8 place-items-center rounded-full text-ink-600 hover:bg-cream-100"
                aria-label="Go back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h2 className="font-serif text-lg font-semibold text-ink-900 leading-tight">
                {step === 'success' ? 'You\'re booked!' : 'Book an Appointment'}
              </h2>
              {selectedService && step !== 'success' && (
                <p className="text-xs text-ink-500 mt-0.5 truncate max-w-[200px]">
                  {selectedService.name} · {formatPrice(selectedService.price)}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={closeBooking}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-cream-100 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Step progress bar ───────────────────────────────────────────────── */}
        {step !== 'success' && (
          <div className="flex gap-1 px-5 pt-3">
            {(['service', 'date', 'time', 'details'] as Step[]).map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  (['service', 'date', 'time', 'details'] as Step[]).indexOf(step) >= i
                    ? 'bg-gold-700'
                    : 'bg-cream-200'
                }`}
              />
            ))}
          </div>
        )}

        {/* ── Body ───────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── STEP: service ──────────────────────────────────────────────────── */}
          {step === 'service' && (
            <div className="px-5 py-5">
              <h3 className="font-serif text-base font-semibold text-ink-900 mb-3">Choose a Service</h3>
              {servicesLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gold-700" />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {services.map(svc => (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => { setSelectedService(svc); setStep('date'); }}
                      className="flex items-center justify-between rounded-2xl border border-cream-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:border-gold-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-gold-600 focus:ring-offset-1"
                    >
                      <div>
                        <p className="font-semibold text-ink-900 text-sm">{svc.name}</p>
                        {svc.description && (
                          <p className="text-xs text-ink-500 mt-0.5 line-clamp-1">{svc.description}</p>
                        )}
                        {svc.duration && (
                          <p className="text-xs text-ink-400 mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {svc.duration} min
                          </p>
                        )}
                      </div>
                      <span className="ml-4 shrink-0 font-serif text-base font-semibold text-gold-700">
                        {formatPrice(svc.price)}
                      </span>
                    </button>
                  ))}
                  {!servicesLoading && services.length === 0 && (
                    <p className="py-8 text-center text-sm text-ink-500">No services available at the moment.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP: date ─────────────────────────────────────────────────────── */}
          {step === 'date' && (
            <div className="px-5 py-5">
              <h3 className="font-serif text-base font-semibold text-ink-900 mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gold-700" />
                Pick a Date
              </h3>

              {/* Month navigator */}
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => navigateMonth('prev')}
                  disabled={calYear === todayYear && calMonth === todayMonth}
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-cream-200 disabled:opacity-30 transition-colors"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold text-ink-800">
                  {new Date(calYear, calMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  onClick={() => navigateMonth('next')}
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-cream-200 transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                  <div key={d} className="text-center text-[10px] font-semibold text-ink-400 uppercase py-1">{d}</div>
                ))}
              </div>

              {/* Calendar day cells */}
              {availableDaysLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gold-700" />
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((day, i) => {
                    if (day === null) return <div key={`e-${i}`} />;
                    const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const unavailable = unavailableDates.has(dateStr);
                    const isToday = dateStr === todayStr;
                    const selected = selectedDate && toDateKey(selectedDate) === dateStr;
                    return (
                      <button
                        key={day}
                        type="button"
                        disabled={unavailable}
                        onClick={() => setSelectedDate(new Date(calYear, calMonth - 1, day))}
                        className={`rounded-xl py-2.5 text-center text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-gold-600 focus:ring-offset-1 ${
                          selected
                            ? 'bg-gold-700 text-white shadow-md'
                            : unavailable
                            ? 'text-ink-300 cursor-not-allowed'
                            : isToday
                            ? 'border-2 border-gold-700 text-gold-700 hover:bg-gold-50'
                            : 'hover:bg-cream-200 text-ink-700'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              )}

              {slotsLoading && (
                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-ink-500">
                  <Loader2 className="h-4 w-4 animate-spin text-gold-700" />
                  Loading availability…
                </div>
              )}
              {slotsError && (
                <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{slotsError}</p>
              )}
            </div>
          )}

          {/* ── STEP: time ─────────────────────────────────────────────────────── */}
          {step === 'time' && (
            <div className="px-5 py-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-serif text-base font-semibold text-ink-900">
                  {selectedDate
                    ? `${DAY_SHORT[selectedDate.getDay()]}, ${MONTH_SHORT[selectedDate.getMonth()]} ${selectedDate.getDate()}`
                    : 'Pick a Time'}
                </h3>
                <button
                  type="button"
                  onClick={() => { setSelectedDate(null); setStep('date'); }}
                  className="text-xs font-semibold text-gold-700 hover:text-gold-800 underline-offset-2 hover:underline"
                >
                  Change date
                </button>
              </div>

              {slotsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gold-700" />
                </div>
              ) : slots.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm font-semibold text-ink-700">No availability on this day</p>
                  <p className="mt-1 text-xs text-ink-400">Try a different date</p>
                  <button
                    type="button"
                    onClick={() => { setSelectedDate(null); setStep('date'); }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gold-700 px-5 py-2 text-sm font-semibold text-white hover:bg-gold-800"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Pick another date
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {(Object.entries(slotGroups) as [string, TimeSlot[]][]).map(([group, groupSlots]) => {
                    if (groupSlots.length === 0) return null;
                    return (
                      <div key={group}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-400">{group}</p>
                        <div className="grid grid-cols-3 gap-2">
                          {groupSlots.map(slot => {
                            const isSelected = selectedSlot?.time === slot.time && selectedSlot?.staffId === slot.staffId;
                            return (
                              <button
                                key={`${slot.time}-${slot.staffId}`}
                                type="button"
                                onClick={() => { setSelectedSlot(slot); setStep('details'); }}
                                className={`rounded-xl border py-2.5 text-center text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-gold-600 focus:ring-offset-1 ${
                                  isSelected
                                    ? 'border-gold-700 bg-gold-700 text-white shadow-md'
                                    : 'border-cream-200 bg-white text-ink-800 hover:border-gold-400 hover:text-gold-700'
                                }`}
                              >
                                {formatSlotTime(slot.time)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── STEP: details ──────────────────────────────────────────────────── */}
          {step === 'details' && (
            <div className="px-5 py-5">
              {/* Booking summary */}
              {selectedService && selectedSlot && selectedDate && (
                <div className="mb-5 rounded-2xl border border-cream-200 bg-white p-4 shadow-sm">
                  <p className="font-semibold text-ink-900 text-sm">{selectedService.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {DAY_SHORT[selectedDate.getDay()]}, {MONTH_SHORT[selectedDate.getMonth()]} {selectedDate.getDate()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatSlotTime(selectedSlot.time)}
                    </span>
                    {selectedSlot.staffName && (
                      <span>with {selectedSlot.staffName}</span>
                    )}
                  </div>
                </div>
              )}

              <h3 className="font-serif text-base font-semibold text-ink-900 mb-4">Your Details</h3>

              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor="bp-name" className="mb-1 block text-xs font-semibold text-ink-700">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="bp-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full rounded-xl border border-cream-300 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-300"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label htmlFor="bp-phone" className="mb-1 block text-xs font-semibold text-ink-700">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="bp-phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    className="w-full rounded-xl border border-cream-300 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-300"
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <label htmlFor="bp-email" className="mb-1 block text-xs font-semibold text-ink-700">
                    Email <span className="text-ink-400 font-normal">(optional)</span>
                  </label>
                  <input
                    id="bp-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full rounded-xl border border-cream-300 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-300"
                    autoComplete="email"
                  />
                </div>
              </div>

              {submitError && (
                <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              <button
                type="button"
                onClick={handleBook}
                disabled={submitting || !name.trim() || !phone.trim()}
                className="mt-5 w-full rounded-full bg-gold-700 px-6 py-4 text-base font-semibold text-white shadow-md shadow-gold-700/20 transition-all hover:bg-gold-800 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-gold-600 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Confirming…
                  </span>
                ) : (
                  'Confirm Booking'
                )}
              </button>
              <p className="mt-2.5 text-center text-xs text-ink-400">No account needed · Free to book</p>
            </div>
          )}

          {/* ── STEP: success ──────────────────────────────────────────────────── */}
          {step === 'success' && (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <div className="mb-5 grid h-20 w-20 place-items-center rounded-full bg-green-50">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="font-serif text-2xl font-semibold text-ink-900">You're all set!</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-600 max-w-xs">
                Your appointment has been confirmed.
                {email.trim() && ' A confirmation has been sent to your email.'}
              </p>

              {selectedService && selectedSlot && selectedDate && (
                <div className="mt-6 w-full rounded-2xl border border-cream-200 bg-white p-5 text-left shadow-sm">
                  <p className="font-semibold text-ink-900">{selectedService.name}</p>
                  <div className="mt-2 flex flex-col gap-1.5 text-sm text-ink-600">
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gold-700 shrink-0" />
                      {DAY_SHORT[selectedDate.getDay()]}, {MONTH_SHORT[selectedDate.getMonth()]} {selectedDate.getDate()}
                    </span>
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gold-700 shrink-0" />
                      {formatSlotTime(selectedSlot.time)}
                      {selectedSlot.staffName && ` · with ${selectedSlot.staffName}`}
                    </span>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={closeBooking}
                className="mt-7 rounded-full border border-cream-300 bg-white px-8 py-3 text-sm font-semibold text-ink-800 shadow-sm hover:border-gold-400 hover:text-gold-700 transition-all"
              >
                Back to website
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Slide-in animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
