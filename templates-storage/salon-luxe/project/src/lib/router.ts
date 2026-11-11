import { useEffect, useState } from 'react';

export const pageIds = ['home', 'services', 'gallery', 'about', 'reviews', 'visit'] as const;

export type PageId = (typeof pageIds)[number];

export const navPages: { id: Exclude<PageId, 'home'>; label: string }[] = [
  { id: 'services', label: 'Services' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'about', label: 'About' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'visit', label: 'Visit' },
];

/** The pages a salon has: Gallery only with photos of its own, Reviews only with reviews (no empty pages). */
export function shownPages(has: { photos: boolean; reviews: boolean }) {
  return navPages.filter((p) => (p.id !== 'gallery' || has.photos) && (p.id !== 'reviews' || has.reviews));
}

export function pageHref(id: PageId): string {
  return id === 'home' ? '#/' : `#/${id}`;
}

function parsePage(): PageId {
  const id = window.location.hash.replace(/^#\/?/, '');
  return (pageIds as readonly string[]).includes(id) ? (id as PageId) : 'home';
}

export function usePageRoute(): PageId {
  const [page, setPage] = useState<PageId>(parsePage);

  useEffect(() => {
    const onChange = () => setPage(parsePage());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return page;
}
