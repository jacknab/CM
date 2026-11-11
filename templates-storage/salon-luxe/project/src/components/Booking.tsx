import { Clock, Phone, Sparkles, ArrowRight, Calendar } from 'lucide-react';
import { useSite } from '@/context/SiteContext';
import BookButton from '@/components/BookButton';

const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

/**
 * Booking (owner, 2026-11-11): Certxa's real booking, not a form here. A few of the salon's services open booking with
 * that service chosen; "See every service" goes to the menu. A salon that doesn't book online shows its phone.
 */
export default function Booking() {
  const { services, phone, phoneHref, hoursLine, canBookOnline, isSample } = useSite();
  const quick = services.slice(0, 6);

  return (
    <section className="py-24 md:py-32 bg-gradient-to-b from-stone-50 to-primary-50/40">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-5 gap-0 rounded-3xl overflow-hidden shadow-2xl shadow-stone-300/40 bg-white">
          {/* Left panel — info */}
          <div className="lg:col-span-2 relative p-10 md:p-12 text-white overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-700 to-primary-900" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent-500/10 rounded-full blur-3xl" />

            <div className="relative">
              <span className="inline-flex items-center gap-2 text-accent-300 text-sm font-semibold tracking-widest uppercase">
                <Sparkles size={16} />
                Booking
              </span>
              <h2 className="mt-4 font-display text-4xl font-bold leading-tight text-balance">
                Reserve Your Moment of Calm
              </h2>
              <p className="mt-4 text-primary-100 leading-relaxed">
                {canBookOnline
                  ? 'Choose your service, pick a time, and we will have everything ready when you arrive. Booking takes less than a minute.'
                  : 'Give us a call and we will find a time that suits you.'}
              </p>

              <div className="mt-10 space-y-5">
                {phone && (
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                      <Phone size={18} />
                    </div>
                    <div>
                      <p className="text-xs text-primary-200">{canBookOnline ? 'Prefer to call?' : 'Call to book'}</p>
                      <a href={phoneHref} className="font-semibold hover:text-accent-300 transition-colors">{phone}</a>
                    </div>
                  </div>
                )}
                {hoursLine && (
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                      <Clock size={18} />
                    </div>
                    <div>
                      <p className="text-xs text-primary-200">Hours</p>
                      <p className="text-sm">{hoursLine}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right panel — the services, each straight into booking */}
          <div className="lg:col-span-3 p-10 md:p-12">
            <h3 className="font-display text-3xl font-bold text-stone-900">Book an Appointment</h3>
            {canBookOnline || isSample ? (
              <>
                <p className="mt-2 text-stone-500">Pick a service to see open times.</p>
                <ul className="mt-6 divide-y divide-stone-100 border-y border-stone-100">
                  {quick.map((s) => (
                    <li key={s.id}>
                      <BookButton serviceId={s.id} className="group flex items-center justify-between gap-4 py-4">
                        <span className="min-w-0">
                          <span className="block font-semibold text-stone-900 group-hover:text-primary-600 transition-colors">{s.name}</span>
                          <span className="block text-sm text-stone-400">{[s.duration, s.price != null ? money(s.price) : ''].filter(Boolean).join(' · ')}</span>
                        </span>
                        <ArrowRight size={18} className="shrink-0 text-primary-500 transition-transform group-hover:translate-x-1" />
                      </BookButton>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <BookButton className="flex-1 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all duration-300 shadow-lg shadow-primary-200 flex items-center justify-center gap-2">
                    <Calendar size={18} />
                    Book Online
                  </BookButton>
                  <a href="#/services" className="flex-1 py-4 text-center text-primary-600 font-semibold border-2 border-primary-200 rounded-xl hover:bg-primary-50 transition-colors">
                    See every service
                  </a>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-stone-500">We take bookings by phone.</p>
                {phoneHref && (
                  <a href={phoneHref} className="mt-8 w-full py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all duration-300 shadow-lg shadow-primary-200 flex items-center justify-center gap-2">
                    <Phone size={18} />
                    Call {phone}
                  </a>
                )}
                <a href="#/services" className="mt-3 block w-full py-4 text-center text-primary-600 font-semibold border-2 border-primary-200 rounded-xl hover:bg-primary-50 transition-colors">
                  See every service
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
