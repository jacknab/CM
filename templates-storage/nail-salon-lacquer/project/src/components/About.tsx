import SectionHeading from '@/components/SectionHeading';
import { useSite } from '@/context/SiteContext';
import { useReveal } from '@/hooks/useReveal';

/** About Us (owner, 2026-11-07): replaces Our Team; the salon's own about text from the database. */
export default function About() {
  const { aboutText, salonName } = useSite();
  const { ref, visible } = useReveal<HTMLDivElement>();
  const paragraphs = aboutText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <section id="about" className="bg-white py-12 sm:py-16 lg:py-24">
      <div className="container-prose">
        <SectionHeading eyebrow="About Us" title={`Welcome to ${salonName}`} />
        <div
          ref={ref}
          className={`reveal ${visible ? 'is-visible' : ''} mx-auto mt-6 max-w-3xl space-y-4 text-center sm:mt-8`}
        >
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line text-base leading-relaxed text-taupe-600 sm:text-lg">{p}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
