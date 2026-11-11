import { Scissors } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

/** The shop's own logo when it uploaded one, else the design's scissors badge with the name in two lines. */
export default function Logo() {
  const { logoImage, nameFirst, nameRest, salonName } = useSite();
  if (logoImage) return <img src={logoImage} alt={salonName} className="h-10 w-auto max-w-[180px] object-contain" />;
  return (
    <span className="flex items-center gap-3">
      <span className="w-9 h-9 shrink-0 rounded-full bg-[#c9a96e] flex items-center justify-center group-hover:bg-[#e0bc82] transition-colors">
        <Scissors size={18} className="text-[#0f0d0b]" />
      </span>
      <span>
        <span className="block text-white font-bold tracking-widest uppercase text-sm leading-none">{nameFirst}</span>
        {nameRest && <span className="block text-[#c9a96e] text-[10px] tracking-[0.2em] uppercase leading-none mt-0.5">{nameRest}</span>}
      </span>
    </span>
  );
}
