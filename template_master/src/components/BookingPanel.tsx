import { useEffect } from 'react';
import { X, Calendar } from 'lucide-react';
import { useBookingPanel } from '../context/BookingPanelContext';
import { useSite } from '../context/SiteContext';
import BookingFlow from './BookingFlow';

export default function BookingPanel() {
  const { isOpen, close, preSelectedServiceId } = useBookingPanel();
  const site = useSite();

  const bookingSlug = site?.business?.booking_slug;

  // Lock body scroll when panel is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[998] bg-charcoal-900/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={close}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Book Appointment"
        className={`fixed top-0 right-0 bottom-0 z-[999] w-full sm:w-[480px] lg:w-[520px] bg-white flex flex-col shadow-2xl transition-transform duration-400 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 bg-charcoal-900 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Calendar size={18} className="text-gold-400" />
            <div>
              <p className="font-sans text-xs font-bold tracking-[0.25em] uppercase text-white">
                Book Appointment
              </p>
              {site?.business?.name && (
                <p className="font-sans text-[11px] text-white/50 mt-0.5">
                  {site.business.name}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={close}
            className="w-9 h-9 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded-sm"
            aria-label="Close booking panel"
          >
            <X size={20} />
          </button>
        </div>

        {/* Booking flow — rendered natively, no iframe */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          {bookingSlug ? (
            isOpen && (
              <BookingFlow
                key={`${bookingSlug}-${preSelectedServiceId ?? 'open'}`}
                slug={bookingSlug}
                preSelectedServiceId={preSelectedServiceId}
                onClose={close}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
              <Calendar size={40} className="text-gold-400/50" />
              <p className="font-sans text-sm text-charcoal-500 leading-relaxed">
                Online booking is not configured yet. Please call us to schedule your appointment.
              </p>
              {site?.business?.phone && (
                <a
                  href={`tel:${site.business.phone.replace(/\D/g, '')}`}
                  className="inline-flex items-center gap-2 bg-gold-400 hover:bg-gold-500 text-charcoal-900 font-sans text-xs font-bold tracking-[0.25em] uppercase px-6 py-3 transition-colors"
                >
                  {site.business.phone}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
