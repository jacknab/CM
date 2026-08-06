import { Gem, Leaf, ShieldCheck, Sparkles } from 'lucide-react';
import { useSite } from '@/context/SiteContext';
import { useBooking } from '@/context/BookingContext';
import { useReveal } from '@/hooks/useReveal';

const VALUE_PROPS = [
  {
    Icon: Sparkles,
    title: 'Premium Products',
    description:
      'We use only high-quality, non-toxic, vegan, and cruelty-free nail products for lasting, beautiful results.',
  },
  {
    Icon: ShieldCheck,
    title: 'Hospital-Grade Hygiene',
    description:
      'Every tool is sterilised in a medical-grade autoclave between clients. Your safety is our top priority.',
  },
  {
    Icon: Gem,
    title: 'Master Nail Artists',
    description:
      'Our award-winning technicians bring years of training and artistry to every set they create.',
  },
  {
    Icon: Leaf,
    title: 'Relaxing Atmosphere',
    description:
      'Unwind in our serene, light-filled studio designed to feel like a retreat from the moment you arrive.',
  },
];

export default function About() {
  const { salonName } = useSite();
  const { openBooking } = useBooking();
  const { ref, visible } = useReveal<HTMLDivElement>();

  return (
    <section
      id="about"
      aria-labelledby="about-heading"
      className="bg-cream-100 py-14 sm:py-20 lg:py-28"
    >
      <div className="container-prose">
        <div
          ref={ref}
          className={`reveal ${visible ? 'is-visible' : ''} grid gap-10 lg:grid-cols-2 lg:gap-20 lg:items-center`}
        >
          {/* Left: text */}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-gold-700">
              About Us
            </p>
            <h2
              id="about-heading"
              className="font-serif text-3xl font-semibold text-ink-900 sm:text-4xl"
            >
              The Studio Behind
              <br />
              Every Stunning Set
            </h2>
            <p className="mt-5 text-base leading-relaxed text-ink-600">
              {salonName} was built on a simple belief: every client deserves a luxury nail
              experience that is both beautiful and safe. From the moment you walk in, our master
              technicians focus entirely on you — your style, your nails, your vision.
            </p>
            <p className="mt-4 text-base leading-relaxed text-ink-600">
              We never use stock photography to sell our work. Every result you see on this website
              is a real client photo from our studio. That is the standard we hold ourselves to
              with every appointment.
            </p>
            <button
              type="button"
              onClick={() => openBooking()}
              className="mt-7 inline-flex items-center justify-center rounded-full bg-gold-700 px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-gold-700/20 transition-all hover:bg-gold-800 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-gold-600 focus:ring-offset-2"
            >
              Book Your Appointment
            </button>
          </div>

          {/* Right: value props grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {VALUE_PROPS.map(({ Icon, title, description }) => (
              <div
                key={title}
                className="flex flex-col gap-3 rounded-2xl border border-cream-200 bg-white p-5 shadow-sm"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold-50 text-gold-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="font-serif text-lg font-semibold text-ink-900">{title}</h3>
                <p className="text-sm leading-relaxed text-ink-600">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
