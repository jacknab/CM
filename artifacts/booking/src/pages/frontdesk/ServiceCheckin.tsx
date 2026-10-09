import { useMemo, useState } from "react";

/** One active, client-visible service from the salon's own catalog (the /config payload). */
export interface CheckinService {
  id: number;
  name: string;
  price: number;
  duration: number;
  category: string | null;
  categoryId?: number | null;
  imageUrl?: string | null;
  illustrationImageUrl?: string | null;
}

/** A catalog category as the salon set it up (Catalog → Categories). */
export interface CatalogCategory { id: number; name: string; imageUrl?: string | null }

export interface CheckinCategory { key: string; label: string; /** null for a group that is not a catalog category */ categoryId: number | null; imageUrl: string | null; services: CheckinService[] }

/**
 * The cards on the first screen: one per catalog category that has at least one active, client-visible
 * service, in the catalog's own order, with the name and photo the salon gave it. Nothing here is fixed —
 * a salon with Manicures and Pedicures gets two cards, adding a Waxing category with a service adds a
 * third, hiding it (or its last service) removes it. A service not filed under a catalog category is
 * grouped by its own category text, after the catalog's.
 */
export function checkinCategories(services: CheckinService[], catalog: CatalogCategory[] = [], legacyImages: Record<string, string> = {}): CheckinCategory[] {
  const out: CheckinCategory[] = [];
  const byKey = new Map<string, CheckinCategory>();
  const add = (key: string, label: string, categoryId: number | null, imageUrl: string | null, s: CheckinService) => {
    let group = byKey.get(key);
    if (!group) { group = { key, label, categoryId, imageUrl, services: [] }; byKey.set(key, group); out.push(group); }
    group.services.push(s);
  };
  const known = new Map(catalog.map((c) => [c.id, c]));
  // catalog categories first, in catalog order
  for (const c of catalog) {
    for (const s of services) {
      if (s.categoryId === c.id) add(`cat:${c.id}`, c.name, c.id, c.imageUrl || legacyImages[c.name] || null, s);
    }
  }
  for (const s of services) {
    if (s.categoryId != null && known.has(s.categoryId)) continue;
    const label = (s.category ?? "").trim() || "Other services";
    add(`text:${label.toLowerCase()}`, label, null, legacyImages[label] || null, s);
  }
  return out;
}

const PRIMARY = "var(--fd-primary, #e84891)";
const BG      = "var(--fd-bg, #f5f3ff)";
const SURFACE = "var(--fd-surface, #ffffff)";
const BORDER  = "var(--fd-border, #e9e3f5)";
const TEXT    = "var(--fd-text, #18111a)";
const MUTED   = "var(--fd-muted, #6b6580)";
const SOFT    = "var(--fd-primary-s, #fdf2f8)";
const SHADOW  = "var(--fd-shadow-lg, 0 8px 32px rgba(80,0,120,0.10), 0 2px 8px rgba(0,0,0,0.06))";
const NO_SELECT: React.CSSProperties = { WebkitUserSelect: "none", userSelect: "none" };

/** A photo that quietly gives way to a plain tile with the name's first letter if it is missing or fails to load. */
function Photo({ src, label }: { src?: string | null; label: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: SOFT, color: PRIMARY, fontSize: 64, fontWeight: 900 }} aria-hidden>
        {label.trim()[0]?.toUpperCase() ?? ""}
      </div>
    );
  }
  return <img src={src} alt="" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />;
}

/**
 * /frontdesk, after a walk-in has checked in by phone: "What would you like to have done today?" — one
 * photo card per category. A tap is the whole answer: the server keeps the category on the client's
 * waiting entry and hands them to the next technician who performs it. No service is chosen here and
 * no ticket is made; the technician adds the actual service later.
 */
export function ServiceCheckin({ services, catalogCategories, categoryImages, busy, error, onConfirm, onActivity }: {
  services: CheckinService[];
  /** The salon's catalog categories: names, photos and order for the cards. */
  catalogCategories: CatalogCategory[];
  /** Category photos keyed by category name — the fallback for a service not filed under a catalog category. */
  categoryImages: Record<string, string>;
  /** The check-in request is in flight — every card is locked so a second tap can't send it twice. */
  busy: boolean;
  error: string;
  onConfirm: (category: CheckinCategory) => void;
  /** Any touch: keeps the screen from timing out while the client is choosing. */
  onActivity: () => void;
}) {
  const categories = useMemo(() => checkinCategories(services, catalogCategories, categoryImages), [services, catalogCategories, categoryImages]);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const cols = categories.length <= 3 ? Math.max(categories.length, 1) : categories.length === 4 ? 2 : 3;

  return (
    <div className="fixed inset-0 flex flex-col" style={{ ...NO_SELECT, background: BG }} onPointerDown={onActivity} data-testid="fd-service-categories">
      <div className="px-10 pt-8 pb-6 shrink-0 text-center">
        <h1 className="text-5xl font-black leading-tight" style={{ color: TEXT }}>What would you like to have done today?</h1>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-10 pb-4 flex flex-col justify-center">
        <div className="grid gap-6 mx-auto w-full" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: cols === 2 ? 900 : 1180 }}>
          {categories.map((c) => {
            const picked = pickedKey === c.key;
            return (
              <button
                key={c.key}
                type="button"
                disabled={busy}
                aria-pressed={picked}
                onClick={() => { if (busy) return; setPickedKey(c.key); onConfirm(c); }}
                className="rounded-3xl overflow-hidden text-left flex flex-col transition-transform active:scale-[0.97]"
                style={{ background: picked ? SOFT : SURFACE, border: `3px solid ${picked ? PRIMARY : BORDER}`, boxShadow: SHADOW, opacity: busy && !picked ? 0.45 : 1 }}
                data-testid={`fd-service-category-${c.key}`}
              >
                <div style={{ position: "relative", width: "100%", aspectRatio: categories.length <= 3 ? "4 / 3" : "16 / 9", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0 }}><Photo src={c.imageUrl} label={c.label} /></div>
                </div>
                <div className="px-6 py-5">
                  <p className="text-3xl font-black leading-tight" style={{ color: TEXT }}>{c.label}</p>
                  {picked && busy && <p className="text-lg mt-1" style={{ color: MUTED }}>Checking in…</p>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <p className="shrink-0 px-10 pb-6 text-center text-xl font-semibold" role="alert" style={{ color: "#dc2626", minHeight: 52 }} data-testid="fd-service-error">{error}</p>
    </div>
  );
}
