import { Instagram, Facebook, MapPin, Phone } from 'lucide-react';
import { pageHref, shownPages } from '@/lib/router';
import { useSite } from '@/context/SiteContext';

export default function Footer() {
  const site = useSite();
  const { nameFirst, nameRest, salonName, wording, street, cityLine, phone, phoneHref, instagramUrl, facebookUrl, canBookOnline, categories } = site;
  const city = cityLine.split(',')[0];
  const pages = shownPages({ photos: site.galleryPhotos.length > 0, reviews: site.reviews.length > 0 });
  return (
    <footer className="bg-stone-950 text-stone-400">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-3xl font-display font-bold text-white">{nameFirst}</span>
              {nameRest && <span className="text-3xl font-display font-light text-gradient-gold">{nameRest}</span>}
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed">
              {wording.label}{city ? ` in ${city}` : ''}.{canBookOnline ? ' Book your appointment online.' : ''}
            </p>
            {(instagramUrl || facebookUrl) && (
              <div className="mt-6 flex gap-3">
                {instagramUrl && (
                  <a href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center hover:bg-primary-600 transition-colors">
                    <Instagram size={18} className="text-white" />
                  </a>
                )}
                {facebookUrl && (
                  <a href={facebookUrl} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center hover:bg-primary-600 transition-colors">
                    <Facebook size={18} className="text-white" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div>
            <h4 className="text-white font-semibold text-sm tracking-widest uppercase mb-4">Explore</h4>
            <ul className="space-y-2.5 text-sm">
              {pages.map((p) => (
                <li key={p.id}>
                  <a href={pageHref(p.id)} className="hover:text-primary-400 transition-colors">
                    {p.id === 'visit' && canBookOnline ? 'Visit & Book' : p.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-semibold text-sm tracking-widest uppercase mb-4">Contact</h4>
            <ul className="space-y-3 text-sm">
              {(street || cityLine) && (
                <li className="flex items-start gap-2.5">
                  <MapPin size={16} className="text-primary-400 mt-0.5 flex-shrink-0" />
                  <span>{street}{street && <br />}{cityLine}</span>
                </li>
              )}
              {phone && (
                <li className="flex items-center gap-2.5">
                  <Phone size={16} className="text-primary-400 flex-shrink-0" />
                  <a href={phoneHref} className="hover:text-primary-400 transition-colors">{phone}</a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-stone-800 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
          <p>&copy; {new Date().getFullYear()} {salonName}. All rights reserved.</p>
          <p className="text-stone-500">
            {[`${wording.label}${city ? ` in ${city}` : ''}`, ...categories.slice(0, 3)].join(' · ')}
          </p>
        </div>
      </div>
    </footer>
  );
}
