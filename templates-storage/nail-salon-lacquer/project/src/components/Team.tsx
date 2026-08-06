import { Sparkles } from 'lucide-react';
import SectionHeading from '@/components/SectionHeading';
import { useSite } from '@/context/SiteContext';
import { useReveal } from '@/hooks/useReveal';

export default function Team() {
  const { team, salonName } = useSite();
  const { ref, visible } = useReveal<HTMLDivElement>();

  if (team.length === 0) return null;

  return (
    <section id="team" className="bg-white py-12 sm:py-16 lg:py-24">
      <div className="container-prose">
        <SectionHeading
          eyebrow="Our Team"
          title="Meet the Artists Behind Your Nails"
          description="Every member of our team is fully licensed, continually trained, and passionate about delivering nails you will love to show off."
        />

        <div
          ref={ref}
          className={`reveal ${visible ? 'is-visible' : ''} mt-8 grid gap-4 sm:mt-14 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4`}
        >
          {team.map((member) => (
            <article
              key={`${member.name}-${member.id ?? ''}`}
              className="group overflow-hidden rounded-3xl border border-taupe-200 bg-taupe-50 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="relative aspect-[3/4] overflow-hidden">
                <img
                  src={member.image}
                  alt={`${member.name}, ${member.role} at ${salonName}`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  width={600}
                  height={800}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-taupe-900/70 via-transparent to-transparent" />
                <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-rose-600 backdrop-blur-sm">
                  <Sparkles className="h-3 w-3" />
                  {member.role.split(' ')[0]}
                </span>
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <h3 className="font-serif text-xl font-semibold leading-tight">{member.name}</h3>
                </div>
              </div>

              <div className="p-5">
                <p className="text-sm font-semibold text-taupe-900">{member.role}</p>
                {member.specialty && (
                  <p className="mt-1.5 text-sm leading-relaxed text-taupe-600">{member.specialty}</p>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
