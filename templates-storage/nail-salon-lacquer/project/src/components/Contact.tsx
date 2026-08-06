import { MapPin, Phone, Clock } from 'lucide-react';
import SectionHeading from '@/components/SectionHeading';
import { useSite } from '@/context/SiteContext';
import { useReveal } from '@/hooks/useReveal';

export default function Contact() {
  const { address, city, phone, phoneHref, hours, salonName } = useSite();
  const { ref, visible } = useReveal<HTMLDivElement>();

  const mapsQuery = encodeURIComponent(`${address}, ${city}`);
  const mapSrc = `https://www.google.com/maps?q=${mapsQuery}&z=15&hl=en&output=embed`;

  return (
    <section id="contact" className="bg-taupe-50 py-12 sm:py-16 lg:py-24">
      <div className="container-prose">
        <SectionHeading
          eyebrow="Visit Us"
          title="Find the Studio"
          description={`Conveniently located in ${city}. Walk-ins welcome based on availability, but booking ahead guarantees your spot.`}
        />

        <div
          ref={ref}
          className={`reveal ${visible ? 'is-visible' : ''} mt-8 grid gap-5 sm:mt-12 sm:gap-8 lg:grid-cols-2`}
        >
          {/* Info card */}
          <div className="flex flex-col gap-5 rounded-3xl border border-taupe-200 bg-white p-5 shadow-sm sm:gap-6 sm:p-8">
            {address && (
              <div className="flex gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
                  <MapPin className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="font-serif text-lg font-semibold text-taupe-900">Address</h3>
                  <p className="mt-1 text-sm leading-relaxed text-taupe-600">
                    {address}
                    {city && <><br />{city}</>}
                  </p>
                </div>
              </div>
            )}

            {phone && (
              <div className="flex gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
                  <Phone className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="font-serif text-lg font-semibold text-taupe-900">Phone</h3>
                  <a href={phoneHref} className="mt-1 block text-sm text-taupe-600 transition-colors hover:text-rose-600">
                    {phone}
                  </a>
                </div>
              </div>
            )}

            {hours.length > 0 && (
              <div className="flex gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
                  <Clock className="h-6 w-6" />
                </span>
                <div className="flex-1">
                  <h3 className="font-serif text-lg font-semibold text-taupe-900">Opening Hours</h3>
                  <dl className="mt-2 divide-y divide-taupe-100">
                    {hours.map((row) => (
                      <div key={row.day} className="flex justify-between py-1.5 text-sm">
                        <dt className="text-taupe-600">{row.day}</dt>
                        <dd className={row.time === 'Closed' ? 'font-medium text-taupe-400' : 'font-medium text-taupe-800'}>
                          {row.time}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            )}
          </div>

          {/* Map — uses live address */}
          <div className="min-h-[280px] overflow-hidden rounded-3xl border border-taupe-200 shadow-sm sm:min-h-[400px] lg:min-h-0">
            <iframe
              title={`Map to ${salonName}`}
              src={mapSrc}
              className="h-full min-h-[280px] w-full border-0 sm:min-h-[400px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
