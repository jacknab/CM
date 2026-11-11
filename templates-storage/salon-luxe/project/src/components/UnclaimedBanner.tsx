import { ShieldCheck } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

/** A page Certxa prepared that its owner hasn't claimed yet (server lib/preparedSalon.ts): says so, and how to claim it. */
export default function UnclaimedBanner() {
  const { isUnclaimed, claimLine, claimUrl } = useSite();
  if (!isUnclaimed) return null;
  return (
    <aside className="relative z-[60] border-b border-stone-200 bg-stone-100 px-4 py-3 text-stone-700" aria-label="Unclaimed salon website notice" data-testid="prepared-notice">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs sm:text-sm">
        <ShieldCheck className="h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
        <span><strong>Prepared by Certxa.</strong> This website has not yet been claimed or approved by the salon owner. {claimLine ?? 'Owners may contact Certxa to verify and claim it.'}</span>
        {claimUrl && <a className="font-semibold underline underline-offset-2" href={claimUrl} data-testid="prepared-claim-online">Or claim it online</a>}
      </div>
    </aside>
  );
}
