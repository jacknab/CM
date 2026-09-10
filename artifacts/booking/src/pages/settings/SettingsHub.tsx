import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface HubTab {
  /** ?tab= value + stable key */
  slug: string;
  label: string;
  /** rendered in the pane when this tab is active */
  component: React.ComponentType;
}

/**
 * A settings "hub": one rail entry that groups several existing settings pages
 * behind a lightweight tab strip. Each page component is mounted only while its
 * tab is active (they each do their own data fetching), and the active tab is
 * reflected in the URL as ?tab=<slug> so it deep-links and survives refresh.
 */
export function SettingsHub({ tabs }: { tabs: HubTab[] }) {
  const [params, setParams] = useSearchParams();

  const active = useMemo(() => {
    const want = params.get("tab");
    return tabs.find((t) => t.slug === want) ?? tabs[0];
  }, [params, tabs]);

  if (!tabs.length) return null;

  const ActiveComponent = active.component;

  return (
    <div>
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:px-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.slug}
              onClick={() =>
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    next.set("tab", t.slug);
                    return next;
                  },
                  { replace: true },
                )
              }
              data-testid={`settings-hub-tab-${t.slug}`}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                t.slug === active.slug
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <ActiveComponent />
    </div>
  );
}
