import type { LiveService } from '@/context/SiteContext';
import type { ServiceReviewEntry } from '@/hooks/useSiteData';

// ── Category placeholder images (Pexels, nail-focused) ────────────────────────

const PLACEHOLDERS: Record<string, string> = {
  manicure:  'https://images.pexels.com/photos/3997389/pexels-photo-3997389.jpeg?auto=compress&cs=tinysrgb&w=800',
  pedicure:  'https://images.pexels.com/photos/3997388/pexels-photo-3997388.jpeg?auto=compress&cs=tinysrgb&w=800',
  extension: 'https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=800',
  art:       'https://images.pexels.com/photos/3997387/pexels-photo-3997387.jpeg?auto=compress&cs=tinysrgb&w=800',
  addon:     'https://images.pexels.com/photos/3997392/pexels-photo-3997392.jpeg?auto=compress&cs=tinysrgb&w=800',
};

/**
 * Resolve a placeholder bucket from the combined service name + category string.
 * Uses both fields so e.g. "Full Set" under "Extensions" wins over a generic match.
 */
function categoryKey(categoryName: string, serviceName = ''): string {
  const lc = `${serviceName} ${categoryName}`.toLowerCase();

  // Pedicure variants — check before generic "ped" to avoid false matches
  if (lc.includes('pedicure') || lc.includes(' pedi') || lc.includes('foot service') || lc.includes('toenail'))
    return 'pedicure';

  // Extensions / full sets — acrylic, dip, hard gel, gel-x, builder gel, press-on
  if (
    lc.includes('acrylic') || lc.includes('full set') || lc.includes('new set') ||
    lc.includes('extension') || lc.includes('gel-x') || lc.includes('gelx') ||
    lc.includes('hard gel') || lc.includes('builder gel') || lc.includes('gel set') ||
    lc.includes('dip powder') || lc.includes(' dip') || lc.includes('sns') ||
    lc.includes('nexgen') || lc.includes('press-on') || lc.includes('nail overlay')
  ) return 'extension';

  // Nail art & specialty finishes
  if (
    lc.includes('nail art') || lc.includes('nail design') || lc.includes('chrome') ||
    lc.includes('ombre') || lc.includes('glitter') || lc.includes('3d nail') ||
    lc.includes('rhinestone') || lc.includes('encapsulated') || lc.includes('foil nail')
  ) return 'art';

  // Add-ons & treatments
  if (
    lc.includes('add-on') || lc.includes('addon') || lc.includes('add on') ||
    lc.includes('extra') || lc.includes('paraffin') || lc.includes('hot stone') ||
    lc.includes('callus') || lc.includes('cuticle') || lc.includes('nail repair')
  ) return 'addon';

  // Everything else (gel mani, shellac, French, classic mani, etc.) → manicure
  return 'manicure';
}

/**
 * Returns the best hero image URL for a service card.
 *
 * Priority:
 *   1. Google review media photo (actual customer photo from Google review)
 *   2. Customer-uploaded service photo
 *   3. Service's own image_url
 *   4. Category placeholder image
 */
export function getBestServiceImage(
  service: LiveService,
  review?: ServiceReviewEntry | null,
): string {
  // 1. Google review media items
  const reviewMedia = review?.reviewMediaItems?.find(
    (item) => typeof item?.thumbnailUrl === 'string' && Boolean(item.thumbnailUrl),
  );
  if (reviewMedia) {
    const url = typeof reviewMedia.thumbnailUrl === 'string' ? reviewMedia.thumbnailUrl : null;
    if (url) return url;
  }

  // 2. Customer-uploaded service photo, exposed as photoUrl by the API.
  if (review?.photoUrl) return review.photoUrl;

  // 3. Service's own image
  if (service.imageUrl) return service.imageUrl;

  // 4. Category placeholder — use both name + category for best bucket match
  return PLACEHOLDERS[categoryKey(service.category, service.name)] ?? PLACEHOLDERS.manicure;
}

/**
 * Returns true if the image for this card came from a real customer result.
 * Used to decide whether to show the "✨ Verified Client Result" badge.
 */
export function isCustomerImage(review?: ServiceReviewEntry | null): boolean {
  if (review?.reviewMediaItems?.some(
    (item) => typeof item?.thumbnailUrl === 'string' && Boolean(item.thumbnailUrl),
  )) return true;
  return Boolean(review?.photoUrl);
}

/**
 * Trim review text to ~2-3 lines for preview.
 */
export function trimReviewText(text: string, max = 110): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

/**
 * Format a date as "X days/weeks/months ago".
 */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

/**
 * Format "Jessica Martinez" → "Jessica M."
 */
export function formatDisplayName(fullName: string | null | undefined): string {
  if (!fullName?.trim()) return 'Verified client';
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts.slice(1).map((w) => w[0] + '.').join(' ');
}

/**
 * Normalise a raw phone string to (555) 555-5555.
 */
export function toPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

/**
 * Build a Google Maps embed URL from an address string.
 */
export function buildMapSrc(address: string, city: string): string {
  const q = encodeURIComponent(`${address}, ${city}`);
  return `https://www.google.com/maps?q=${q}&z=15&hl=en&output=embed`;
}

/**
 * Build a Google Maps directions URL.
 */
export function buildDirectionsUrl(address: string, city: string): string {
  const q = encodeURIComponent(`${address}, ${city}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}
