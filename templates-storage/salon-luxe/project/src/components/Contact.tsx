import { MapPin, Phone, Clock } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

export default function Contact() {
  const { salonName, street, cityLine, fullAddress, mapQuery, phone, phoneHref, hours, faqs, isSample } = useSite();
  const city = cityLine.split(',')[0];
  return (
    <section className="py-24 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-accent-500 font-semibold text-sm tracking-widest uppercase">
            Visit Us
          </span>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold text-stone-900 text-balance">
            {isSample ? 'Find Us in Rockridge' : city ? `Find Us in ${city}` : `Find ${salonName}`}
          </h2>
          {fullAddress && <p className="mt-4 text-stone-500 text-lg">{fullAddress}</p>}
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Map + info */}
          <div className="space-y-6">
            {mapQuery && (
              <div className="rounded-3xl overflow-hidden shadow-xl shadow-stone-200 border border-stone-100">
                <iframe
                  title={`${salonName} location map`}
                  src={`https://www.google.com/maps?q=${encodeURIComponent(`${salonName} ${mapQuery}`)}&output=embed`}
                  width="100%"
                  height="380"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              {(street || cityLine) && (
                <div className="bg-stone-50 rounded-2xl p-6">
                  <MapPin size={22} className="text-primary-600 mb-3" />
                  <h3 className="font-semibold text-stone-900">Address</h3>
                  <p className="mt-1 text-stone-500 text-sm leading-relaxed">
                    {street}{street && <br />}{cityLine}
                  </p>
                  {mapQuery && (
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${salonName} ${mapQuery}`)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-primary-600 hover:text-primary-700">
                      Get directions
                    </a>
                  )}
                </div>
              )}
              {phone && (
                <div className="bg-stone-50 rounded-2xl p-6">
                  <Phone size={22} className="text-primary-600 mb-3" />
                  <h3 className="font-semibold text-stone-900">Phone</h3>
                  <a href={phoneHref} className="mt-1 block text-stone-500 text-sm hover:text-primary-600 transition-colors">{phone}</a>
                </div>
              )}
              {hours.length > 0 && (
                <div className="bg-stone-50 rounded-2xl p-6 sm:col-span-2">
                  <Clock size={22} className="text-primary-600 mb-3" />
                  <h3 className="font-semibold text-stone-900">Hours</h3>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                    {hours.map((h) => (
                      <div key={h.day} className="contents">
                        <dt className={h.closed ? 'text-stone-400' : 'text-stone-600'}>{h.day}</dt>
                        <dd className={h.closed ? 'text-stone-400' : 'text-stone-500'}>{h.time}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          </div>

          {/* FAQ: answered from the salon's own facts */}
          {faqs.length > 0 && (
            <div>
              <h3 className="font-display text-2xl font-bold text-stone-900 mb-6">
                Frequently Asked Questions
              </h3>
              <div className="space-y-3">
                {faqs.map((faq, i) => (
                  <details key={i} className="group bg-stone-50 rounded-xl border border-stone-100 overflow-hidden">
                    <summary className="flex items-center justify-between cursor-pointer p-5 font-medium text-stone-800 list-none">
                      {faq.question}
                      <span className="text-primary-500 text-2xl font-light transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p className="px-5 pb-5 text-stone-500 text-sm leading-relaxed">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
