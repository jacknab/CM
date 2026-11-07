import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

export default function UnclaimedBanner() {
  const { isUnclaimedAutoCreated, googleMapsUrl } = useSite();
  if (!isUnclaimedAutoCreated) return null;
  return (
    <aside className="relative z-[60] mt-14 border-b border-[#d8d2c7] bg-[#f4f1ea] px-4 py-3 text-[#39362f] sm:mt-16" aria-label="Unclaimed salon website notice">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs sm:text-sm">
        <ShieldCheck className="h-4 w-4 shrink-0 text-[#806a3e]" aria-hidden="true" />
        <span><strong>Prepared by Certxa.</strong> This website has not yet been claimed or approved by the salon owner. Owners may contact Certxa to verify and claim it.</span>
        {googleMapsUrl && (
          <a className="inline-flex items-center gap-1 font-semibold underline underline-offset-2" href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
            Matched business details · Google Maps <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
      </div>
    </aside>
  );
}
