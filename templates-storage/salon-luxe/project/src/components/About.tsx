import { ShieldCheck, Leaf, Award, HeartHandshake } from 'lucide-react';
import { useSite } from '@/context/SiteContext';
import BookButton from '@/components/BookButton';

// The sample salon's promises: the template's preview only. A real salon's page says only what it has said itself.
const SAMPLE_FEATURES = [
  { icon: ShieldCheck, title: 'Hospital-Grade Hygiene', text: 'Every tool is sterilized between clients. Single-use files and buffers — always.' },
  { icon: Leaf, title: 'Clean, Premium Products', text: 'We use only non-toxic, high-quality polishes and cruelty-free nail care lines.' },
  { icon: Award, title: 'Master Technicians', text: 'Our artists bring years of training and a genuine passion for nail artistry.' },
  { icon: HeartHandshake, title: 'Personalized Care', text: 'Every set is tailored to your style, nail health, and lifestyle needs.' },
];

export default function About() {
  const { isSample, salonName, wording, cityLine, aboutText, aboutImages, canBookOnline, phoneHref, phone, categories } = useSite();
  const city = cityLine.split(',')[0];
  const paragraphs = aboutText.split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);
  const fallback = `${salonName} is a ${wording.place}${city ? ` in ${city}` : ''}${categories.length ? ` offering ${categories.slice(0, 4).join(', ').toLowerCase()}` : ''}.`;

  return (
    <section className="py-24 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Images */}
          <div className="relative">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-stone-300/50">
              <img
                src={aboutImages[0]}
                alt={wording.heroAlt(salonName || 'the salon')}
                className="w-full h-[520px] object-cover"
                loading="lazy"
              />
            </div>
            <div className="absolute -bottom-10 -right-6 w-56 h-56 rounded-3xl overflow-hidden shadow-2xl border-8 border-white hidden sm:block animate-float">
              <img src={aboutImages[1]} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
            {isSample && (
              <div className="absolute -top-6 -left-6 w-28 h-28 rounded-full bg-accent-500 flex flex-col items-center justify-center text-white shadow-xl hidden sm:flex">
                <span className="font-display text-3xl font-bold leading-none">8+</span>
                <span className="text-[10px] tracking-widest uppercase mt-1">Years</span>
              </div>
            )}
          </div>

          {/* Content */}
          <div>
            <span className="text-accent-500 font-semibold text-sm tracking-widest uppercase">
              About {salonName}
            </span>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold text-stone-900 leading-tight text-balance">
              {isSample ? "Rockridge's Sanctuary for Beautiful, Healthy Nails" : `${wording.label}${city ? ` in ${city}` : ''}`}
            </h2>
            {(paragraphs.length ? paragraphs : [fallback]).map((p, i) => (
              <p key={i} className={i === 0 ? 'mt-6 text-stone-600 text-lg leading-relaxed whitespace-pre-line' : 'mt-4 text-stone-500 leading-relaxed whitespace-pre-line'}>
                {p}
              </p>
            ))}

            {isSample ? (
              <div className="mt-10 grid sm:grid-cols-2 gap-6">
                {SAMPLE_FEATURES.map((f) => (
                  <div key={f.title} className="flex gap-4">
                    <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-primary-50 flex items-center justify-center">
                      <f.icon size={22} className="text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-stone-900 text-sm">{f.title}</h3>
                      <p className="mt-1 text-stone-500 text-sm leading-relaxed">{f.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (canBookOnline || phoneHref) && (
              <BookButton className="mt-10 inline-block px-8 py-4 bg-primary-600 text-white font-semibold rounded-full hover:bg-primary-700 transition-all duration-300 shadow-lg shadow-primary-200">
                {canBookOnline ? 'Book Your Appointment' : `Call ${phone}`}
              </BookButton>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
