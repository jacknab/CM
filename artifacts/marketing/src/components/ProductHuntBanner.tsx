import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { X, ArrowRight } from 'lucide-react';

/**
 * Appears only when the visitor arrives via ?utm_source=producthunt.
 * Persists for the session (dismissed state stored in sessionStorage).
 * Renders nothing on the server (SSR) — mounts client-side only.
 */
export default function ProductHuntBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromPH = params.get('utm_source') === 'producthunt';
    const dismissed = sessionStorage.getItem('ph-banner-dismissed') === '1';
    if (fromPH && !dismissed) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    sessionStorage.setItem('ph-banner-dismissed', '1');
    setVisible(false);
  };

  return (
    <div
      role="banner"
      aria-label="Product Hunt launch announcement"
      className="fixed top-16 left-0 right-0 z-40 flex items-center justify-between gap-3 px-4 py-2.5"
      style={{ background: 'hsl(var(--primary))' }}
    >
      {/* PH cat icon (inline SVG — orange cat, PH brand mark) */}
      <div className="flex items-center gap-3 min-w-0">
        <svg
          viewBox="0 0 40 40"
          width="22"
          height="22"
          aria-hidden="true"
          className="shrink-0"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="20" cy="20" r="20" fill="white" fillOpacity="0.15" />
          <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fontSize="18" fill="white">
            🐱
          </text>
        </svg>
        <p className="text-sm font-semibold text-primary-foreground truncate">
          We're live on Product Hunt today!
          <span className="hidden sm:inline font-normal opacity-90">
            {' '}— Your upvote means everything to a small team.
          </span>
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <a
          href="https://www.producthunt.com/posts/certxa?utm_source=certxa_site&utm_medium=banner"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-foreground bg-white/20 hover:bg-white/30 transition-colors px-3 py-1.5 rounded-md"
        >
          Upvote
          <ArrowRight size={12} />
        </a>
        <Link
          to="/auth?mode=register&ref=producthunt"
          className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-primary-foreground/80 hover:text-primary-foreground transition-colors"
        >
          Start free trial
        </Link>
        <button
          onClick={dismiss}
          aria-label="Dismiss Product Hunt banner"
          className="p-1 text-primary-foreground/70 hover:text-primary-foreground transition-colors"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
