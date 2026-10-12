/**
 * Certxa wordmark, drawn as text in the style of the site's logo artwork
 * (thin spaced letters with a heavy violet X). The exported logo image spells
 * the name differently, so the wordmark stands in for it until a Certxa logo
 * file is supplied.
 */
export default function BrandWordmark({ dark = false, className = '' }: { dark?: boolean; className?: string }) {
  return (
    <span
      aria-label="Certxa"
      className={`inline-flex items-baseline text-[1.9rem] leading-none font-extralight tracking-[0.18em] lowercase ${
        dark ? 'text-white' : 'text-[#1a1a2e]'
      } ${className}`}
    >
      <span aria-hidden="true">cert</span>
      <span aria-hidden="true" className="font-bold text-[#7c3aed] tracking-normal mx-[0.04em] uppercase">
        X
      </span>
      <span aria-hidden="true">a</span>
    </span>
  );
}
