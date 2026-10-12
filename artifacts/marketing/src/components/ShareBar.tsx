/**
 * ShareBar — reusable social sharing strip.
 * Renders LinkedIn, Facebook, and X (Twitter) share buttons plus a copy-link button.
 *
 * Props:
 *   url      — canonical URL to share (absolute)
 *   title    — pre-filled share text / tweet copy
 *   label    — optional eyebrow label above the buttons (default: "Share this")
 *   compact  — when true, renders icon-only buttons (no text labels)
 */

import { useState } from 'react';
import { Link2, Check } from 'lucide-react';

interface ShareBarProps {
  url: string;
  title: string;
  label?: string;
  compact?: boolean;
}

// X (Twitter) SVG wordmark — never use lucide Twitter/X icons
function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function FacebookIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

interface SocialLink {
  id: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  hoverStyle: React.CSSProperties;
}

export default function ShareBar({ url, title, label = 'Share this', compact = false }: ShareBarProps) {
  const [copied, setCopied] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const encoded = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const links: SocialLink[] = [
    {
      id: 'linkedin',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`,
      label: 'LinkedIn',
      icon: <LinkedInIcon size={15} />,
      hoverStyle: { background: 'hsl(var(--share-linkedin))', color: 'hsl(var(--background))', borderColor: 'hsl(var(--share-linkedin))' },
    },
    {
      id: 'facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
      label: 'Facebook',
      icon: <FacebookIcon size={15} />,
      hoverStyle: { background: 'hsl(var(--share-facebook))', color: 'hsl(var(--background))', borderColor: 'hsl(var(--share-facebook))' },
    },
    {
      id: 'x',
      href: `https://x.com/intent/tweet?url=${encoded}&text=${encodedTitle}`,
      label: 'X',
      icon: <XIcon size={14} />,
      hoverStyle: { background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', borderColor: 'hsl(var(--foreground))' },
    },
  ];

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {label && (
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {links.map((l) => (
          <a
            key={l.id}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Share on ${l.label}`}
            style={hoveredId === l.id ? l.hoverStyle : undefined}
            onMouseEnter={() => setHoveredId(l.id)}
            onMouseLeave={() => setHoveredId(null)}
            onFocus={() => setHoveredId(l.id)}
            onBlur={() => setHoveredId(null)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-xs font-semibold transition-all duration-200"
          >
            {l.icon}
            {!compact && <span>{l.label}</span>}
          </a>
        ))}

        {/* Copy link */}
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Link copied' : 'Copy link'}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-xs font-semibold transition-all duration-200 hover:bg-muted"
        >
          {copied ? (
            <>
              <Check size={14} className="text-primary" />
              {!compact && <span className="text-primary">Copied</span>}
            </>
          ) : (
            <>
              <Link2 size={14} />
              {!compact && <span>Copy link</span>}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
