import { Sparkles, Clock, Award } from 'lucide-react';
import { useSite } from '../context/SiteContext';
import { useBookingPanel } from '../context/BookingPanelContext';
import type { HoursEntry } from '../hooks/useSiteData';

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${m.toString().padStart(2, '0')}${period}`;
}

function summariseHours(hours: HoursEntry[]): string {
  if (hours.length === 0) return 'Mon – Sat: 9:30am – 7:30pm  |  Sun: 10am – 6pm';
  const open = hours.filter(h => !h.is_closed);
  if (open.length === 0) return 'Temporarily Closed — please call for details';
  const first = open[0];
  const last = open[open.length - 1];
  const sameTime = open.every(
    h => h.open_time === first.open_time && h.close_time === first.close_time
  );
  if (sameTime && open.length === hours.length) {
    return `${DAY_ABBR[first.day_of_week]}–${DAY_ABBR[last.day_of_week]}: ${formatTime(first.open_time)} – ${formatTime(first.close_time)}`;
  }
  return `${DAY_ABBR[first.day_of_week]}–${DAY_ABBR[last.day_of_week]}: ${formatTime(first.open_time)} – ${formatTime(first.close_time)}`;
}

export default function Intro() {
  const site = useSite();
  const business = site?.business;
  const hours = site?.hours ?? [];
  const reviews = site?.reviews ?? [];
  const { open: openBooking } = useBookingPanel();

  const businessName = business?.name ?? 'Lumière';
  const city = business?.city ?? 'Denver';

  // Prefer authoritative aggregate from the full google_reviews table over the sampled subset
  const reviewCount = site?.googleReviewCount ?? reviews.length;
  const avgRating =
    reviewCount > 0
      ? (site?.googleAvgRating != null
          ? Number(site.googleAvgRating).toFixed(1)
          : (reviews.reduce((s, r) => s + (r.rating ?? 5), 0) / reviews.length).toFixed(1))
      : '4.9';

  const highlights = [
    {
      icon: Sparkles,
      title: 'Premium Products',
      desc: 'We use only the finest OPI, CND, and Aprés professional-grade products.',
    },
    {
      icon: Clock,
      title: 'Open 7 Days',
      desc: summariseHours(hours),
    },
    {
      icon: Award,
      title: reviewCount > 0 ? `${avgRating}-Star Rated` : '4.9-Star Rated',
      desc:
        reviewCount > 0
          ? `Rated ${avgRating} stars from ${reviewCount} verified reviews — ${city}'s top nail destination.`
          : `Consistently rated ${city}'s top nail salon with over 2,000 Google reviews.`,
    },
  ];

  return (
    <section className="bg-cream-100 py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p className="font-sans text-[10px] font-semibold tracking-[0.5em] uppercase text-gold-500 mb-4">
              Our Story
            </p>
            <h2 className="font-serif text-4xl md:text-5xl font-light text-charcoal-800 leading-tight mb-6">
              A Sanctuary of<br /><em>Elegance & Craft</em>
            </h2>
            <p className="font-sans text-sm text-charcoal-600 leading-relaxed mb-5">
              {businessName} was founded on a simple belief: every client deserves a transformative
              experience, not just a service. Nestled in the heart of {city}, our studio
              blends a tranquil, spa-like atmosphere with the precision of world-class nail
              artistry.
            </p>
            <p className="font-sans text-sm text-charcoal-600 leading-relaxed mb-8">
              Our master nail technicians bring years of experience and an unwavering
              commitment to hygiene, detail, and artistry — ensuring every visit leaves
              you feeling polished, refreshed, and radiant.
            </p>
            {business?.phone ? (
              <a
                href={`tel:${business.phone.replace(/\D/g, '')}`}
                className="inline-flex items-center gap-2 font-sans text-xs font-bold tracking-[0.25em] uppercase text-gold-500 border-b-2 border-gold-400 pb-1 hover:text-gold-600 hover:border-gold-600 transition-colors"
              >
                Call Us: {business.phone}
              </a>
            ) : (
              <button
                onClick={openBooking}
                className="inline-flex items-center gap-2 font-sans text-xs font-bold tracking-[0.25em] uppercase text-gold-500 border-b-2 border-gold-400 pb-1 hover:text-gold-600 hover:border-gold-600 transition-colors"
              >
                Schedule a Visit
              </button>
            )}
          </div>

          <div className="flex flex-col gap-6">
            {highlights.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex items-start gap-5 bg-white p-6 shadow-sm border border-cream-200 hover:shadow-md transition-shadow duration-300"
              >
                <div className="flex-shrink-0 w-10 h-10 bg-gold-400/15 flex items-center justify-center">
                  <Icon size={18} className="text-gold-500" />
                </div>
                <div>
                  <h3 className="font-sans text-xs font-bold tracking-[0.15em] uppercase text-charcoal-800 mb-1">
                    {title}
                  </h3>
                  <p className="font-sans text-sm text-charcoal-600 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
