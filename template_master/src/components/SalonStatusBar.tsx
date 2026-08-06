import { useState, useEffect } from 'react';

declare global {
  interface Window {
    __CERTXA_SLUG__?: string;
    __CERTXA_API_BASE__?: string;
  }
}

interface SalonStatus {
  isOpen: boolean;
  staffWorking: number;
  staffAvailable: number;
  staffBusy: number;
  upcomingCount: number;
  status: 'accepting_walkins' | 'appointment_recommended' | 'closed';
}

const STATUS_CONFIG = {
  accepting_walkins: {
    dot: 'bg-emerald-400',
    pill: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    label: 'Accepting Walk-ins',
  },
  appointment_recommended: {
    dot: 'bg-amber-400',
    pill: 'bg-amber-50 text-amber-800 border-amber-200',
    label: 'Book an Appointment',
  },
  closed: {
    dot: 'bg-zinc-400',
    pill: 'bg-zinc-100 text-zinc-500 border-zinc-200',
    label: 'Currently Closed',
  },
} as const;

export default function SalonStatusBar() {
  const [status, setStatus] = useState<SalonStatus | null>(null);

  useEffect(() => {
    const slug = window.__CERTXA_SLUG__;
    if (!slug) return;
    const base = window.__CERTXA_API_BASE__ ?? '';

    function fetchStatus() {
      fetch(`${base}/api/tenant/${slug}/status`)
        .then(r => (r.ok ? r.json() : null))
        .then((d: SalonStatus | null) => { if (d) setStatus(d); })
        .catch(() => {});
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!status) return null;

  const cfg = STATUS_CONFIG[status.status];

  return (
    <div className="bg-cream-50 border-y border-cream-200 py-3 px-6">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-2.5 justify-center md:justify-start">

        {/* Main status pill */}
        <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[11px] font-semibold tracking-wide ${cfg.pill}`}>
          <span className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${cfg.dot}`} />
          {cfg.label}
        </span>

        {/* Staff working today */}
        {status.isOpen && status.staffWorking > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-cream-200 text-[11px] text-charcoal-500">
            {/* people icon */}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-charcoal-400">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>
              <strong className="text-charcoal-700 font-semibold">{status.staffWorking}</strong> staff working today
            </span>
          </span>
        )}

        {/* Available / busy split */}
        {status.isOpen && status.staffWorking > 0 && (
          status.staffAvailable > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              {status.staffAvailable} available now
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] text-amber-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
              All staff currently busy
            </span>
          )
        )}

        {/* Upcoming bookings */}
        {status.isOpen && status.upcomingCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-cream-200 text-[11px] text-charcoal-500">
            {/* calendar icon */}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-charcoal-400">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>
              <strong className="text-charcoal-700 font-semibold">{status.upcomingCount}</strong>{' '}
              upcoming booking{status.upcomingCount !== 1 ? 's' : ''} in next 2 hrs
            </span>
          </span>
        )}

      </div>
    </div>
  );
}
