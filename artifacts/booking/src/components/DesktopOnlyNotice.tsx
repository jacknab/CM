import { Monitor } from "lucide-react";

/**
 * DesktopOnlyNotice — shown on mobile for pages that require a large screen.
 * Renders only on screens smaller than md (768px). On desktop the children
 * are rendered as normal.
 *
 * Usage:
 *   DesktopOnlyNotice title="Check Layout Editor"
 *     full page content — only shown on md+
 */
export function DesktopOnlyNotice({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      {/* Mobile notice — hidden on md and above */}
      <div className="md:hidden flex flex-col items-center justify-center min-h-screen px-8 text-center bg-background">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
          <Monitor className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
          {description ??
            "This tool is designed for a larger screen. Open it on a desktop or laptop for the best experience."}
        </p>
        <a
          href={window.location.href}
          className="mt-6 text-xs text-primary underline underline-offset-2"
          onClick={(e) => {
            e.preventDefault();
            if (navigator.clipboard) {
              navigator.clipboard.writeText(window.location.href);
            }
          }}
        >
          Copy link to open on desktop
        </a>
      </div>

      {/* Desktop content — hidden on mobile, shown on md and above */}
      <div className="hidden md:block">{children}</div>
    </>
  );
}
