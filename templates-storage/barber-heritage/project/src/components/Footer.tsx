import { MapPin, Phone, Clock, Instagram, Facebook, Navigation } from 'lucide-react';
import { useSite } from '@/context/SiteContext';
import BookButton from '@/components/BookButton';
import Logo from '@/components/Logo';

export default function Footer() {
  const site = useSite();
  const quickLinks = [
    { label: site.isUnclaimed ? 'Services' : 'Services & Pricing', href: '#services', show: site.services.length > 0 },
    { label: 'Our Story', href: '#difference', show: !!site.aboutText },
    { label: 'Gallery', href: '#gallery', show: site.galleryPhotos.length > 0 },
  ].filter((l) => l.show);
  const directions = site.mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${site.salonName}, ${site.mapQuery}`)}` : '';

  return (
    <footer id="contact" className="bg-[#0a0806] border-t border-white/8 scroll-mt-16">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="mb-5"><Logo /></div>
            {site.footerText && <p className="text-white/40 text-sm leading-relaxed mb-6">{site.footerText}</p>}
            {(site.instagramUrl || site.facebookUrl) && (
              <div className="flex gap-3">
                {site.instagramUrl && (
                  <a href={site.instagramUrl} target="_blank" rel="noopener noreferrer"
                    className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/40 hover:border-[#c9a96e] hover:text-[#c9a96e] transition-colors"
                    aria-label="Instagram">
                    <Instagram size={16} />
                  </a>
                )}
                {site.facebookUrl && (
                  <a href={site.facebookUrl} target="_blank" rel="noopener noreferrer"
                    className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/40 hover:border-[#c9a96e] hover:text-[#c9a96e] transition-colors"
                    aria-label="Facebook">
                    <Facebook size={16} />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div>
            <h3 className="text-white text-xs font-bold tracking-widest uppercase mb-5">Quick Links</h3>
            <ul className="space-y-3">
              {quickLinks.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-white/40 hover:text-[#c9a96e] text-sm transition-colors">{l.label}</a>
                </li>
              ))}
              <li>
                <BookButton className="text-white/40 hover:text-[#c9a96e] text-sm transition-colors">
                  {site.canBookOnline || site.isSample ? 'Book an Appointment' : 'Call to Book'}
                </BookButton>
              </li>
            </ul>
          </div>

          {/* Hours */}
          {site.hours.length > 0 && (
            <div>
              <h3 className="text-white text-xs font-bold tracking-widest uppercase mb-5">Hours</h3>
              <ul className="space-y-3 text-sm" data-testid="heritage-hours">
                {site.hours.map((h) => (
                  <li key={h.day} className="flex justify-between gap-6">
                    <span className="text-white/50">{h.day}</span>
                    <span className={h.closed ? 'text-white/30' : 'text-white/70'}>{h.time}</span>
                  </li>
                ))}
              </ul>
              {site.isSample && (
                <div className="mt-4 flex items-center gap-2 text-[#c9a96e]/70 text-xs">
                  <Clock size={12} />
                  <span>Walk-ins welcome</span>
                </div>
              )}
            </div>
          )}

          {/* Contact */}
          <div>
            <h3 className="text-white text-xs font-bold tracking-widest uppercase mb-5">Find Us</h3>
            <ul className="space-y-4">
              {site.fullAddress && (
                <li className="flex gap-3">
                  <MapPin size={16} className="text-[#c9a96e] flex-shrink-0 mt-0.5" />
                  <span className="text-white/50 text-sm leading-relaxed">
                    {site.street}{site.cityLine && <><br />{site.cityLine}</>}
                  </span>
                </li>
              )}
              {site.phone && (
                <li className="flex gap-3">
                  <Phone size={16} className="text-[#c9a96e] flex-shrink-0 mt-0.5" />
                  {site.phoneHref
                    ? <a href={site.phoneHref} className="text-white/50 hover:text-[#c9a96e] text-sm transition-colors">{site.phone}</a>
                    : <span className="text-white/50 text-sm">{site.phone}</span>}
                </li>
              )}
              {directions && (
                <li className="flex gap-3">
                  <Navigation size={16} className="text-[#c9a96e] flex-shrink-0 mt-0.5" />
                  <a href={directions} target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-[#c9a96e] text-sm transition-colors">Get directions</a>
                </li>
              )}
            </ul>
            <BookButton className="mt-8 inline-block w-full text-center px-5 py-3 bg-[#c9a96e] text-[#0f0d0b] text-sm font-bold tracking-widest uppercase rounded hover:bg-[#e0bc82] transition-colors">
              {site.canBookOnline || site.isSample ? 'Book Now' : 'Call to Book'}
            </BookButton>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-white/25 text-xs">
            &copy; {new Date().getFullYear()} {site.salonName}. All rights reserved.
          </p>
          {site.fullAddress && <p className="text-white/25 text-xs">{site.fullAddress}</p>}
        </div>
      </div>
    </footer>
  );
}
