import { ShieldCheck } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

/** A page Certxa prepared that its owner hasn't claimed yet (server lib/preparedSalon.ts): says so, and how to claim it. */
export default function UnclaimedBanner() {
  const { isUnclaimed, claimLine, claimUrl } = useSite();
  if (!isUnclaimed) return null;
  return (
    <aside className="border-b border-[#c9a96e]/20 bg-[#18150f] px-4 py-2.5 text-white/70" aria-label="Unclaimed business website notice" data-testid="prepared-notice">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs sm:text-sm">
        <ShieldCheck className="h-4 w-4 shrink-0 text-[#c9a96e]" aria-hidden="true" />
        <span><strong className="text-white">Prepared by Certxa.</strong> This website has not yet been claimed or approved by the business owner. {claimLine ?? 'Owners may contact Certxa to verify and claim it.'}</span>
        {claimUrl && <a className="font-semibold text-[#c9a96e] underline underline-offset-2" href={claimUrl} data-testid="prepared-claim-online">Or claim it online</a>}
      </div>
    </aside>
  );
}
