import { Sparkles } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

/** A moving line of the salon's own service categories (and its city). */
export default function Marquee() {
  const { categories, services, cityLine } = useSite();
  const names = categories.length > 1 ? categories : services.slice(0, 8).map((s) => s.name);
  const items = [...names, ...(cityLine ? [cityLine.split(',')[0]] : [])];
  if (items.length === 0) return null;
  return (
    <div className="bg-stone-900 py-4 overflow-hidden" aria-hidden="true">
      <div className="flex animate-marquee whitespace-nowrap">
        {[...items, ...items, ...items, ...items].map((item, i) => (
          <span
            key={i}
            className="mx-8 flex items-center gap-3 text-stone-300 font-display text-xl tracking-wide"
          >
            <Sparkles size={16} className="text-accent-400" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
