import type { ReactNode } from 'react';
import { useSite } from '@/context/SiteContext';

/**
 * Every Book button (owner, 2026-11-11): Certxa's real booking for this shop (certxa.com/book/<slug>), with the
 * service chosen when there is one. When the shop doesn't take bookings online (a page Certxa prepared, or "Who can
 * book online: Nobody"), it calls the shop instead; with no phone either, it goes to the contact section.
 */
export default function BookButton({ serviceId, className, children, onClick }: {
  serviceId?: string | number; className?: string; children: ReactNode; onClick?: () => void;
}) {
  const { canBookOnline, bookingUrl, phoneHref, isSample } = useSite();
  const href = isSample ? '#services' : canBookOnline ? bookingUrl(serviceId) : phoneHref || '#contact';
  return (
    <a href={href} onClick={onClick} className={className} data-testid="heritage-book">
      {children}
    </a>
  );
}
