import { useReveal } from '@/hooks/useReveal';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description?: string;
  center?: boolean;
}

export default function SectionHeading({
  eyebrow,
  title,
  description,
  center = true,
}: SectionHeadingProps) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'is-visible' : ''} ${center ? 'mx-auto text-center' : 'text-left'} max-w-2xl`}
    >
      <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-rose-600">
        <span className="h-px w-6 bg-rose-400" />
        {eyebrow}
        <span className="h-px w-6 bg-rose-400" />
      </span>
      <h2 className="mt-3 text-3xl font-medium leading-tight text-taupe-900 sm:mt-4 sm:text-5xl text-balance">
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-base leading-relaxed text-taupe-600 sm:mt-5 sm:text-lg">{description}</p>
      )}
    </div>
  );
}
