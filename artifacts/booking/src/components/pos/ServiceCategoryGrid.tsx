/**
 * ServiceCategoryGrid — the desktop checkout's default "cart phase" view:
 * category tabs + a real, tappable service-tile grid, a "Popular Add-Ons"
 * row, and a bottom action-tile strip for the handful of function buttons
 * (Removal, Quick Ticket, Loyalty, Custom Charge, Group Pay, Gift Card,
 * Retail) that still need to stay one tap away. Replaces the old
 * always-narrow 3×5 function-button grid as CheckoutPOSPanel's default
 * right-panel content — it only appears when no submenu is open
 * (`posMenuStack.length === 0`); opening a submenu (Removal, Discount, Gift
 * Card, Reprint) still swaps back to the original narrow tile grid, unchanged.
 *
 * Services/categories come from the same real, store-scoped hooks used
 * elsewhere in the app (`useServices`, `useServiceCategories`) — this is the
 * first real implementation of the `"add-service"` PosActionType, which was
 * declared in `lib/pos/types.ts` but never wired to anything until now.
 */
import { useMemo, useState } from "react";
import { resolvePosIcon, type PosButton } from "@/lib/pos";
import { useServices } from "@/hooks/use-services";
import { useServiceCategories } from "@/hooks/use-addons";
import type { Service } from "@shared/schema";
import { Search } from "lucide-react";

interface ServiceGroup {
  key: string;
  name: string;
  sortOrder: number;
  services: Service[];
}

export function ServiceCategoryGrid({
  addonItems,
  desktopTileActions,
  onAction,
  posT,
}: {
  /** Flat, unpaginated add-on tiles (CheckoutPOSPanel's existing `addonItems`). */
  addonItems: PosButton[];
  /** The nail-salon layout's `desktopTile`-flagged function buttons. */
  desktopTileActions: PosButton[];
  onAction: (b: PosButton) => void;
  posT: (id: string | undefined, raw: string) => string;
}) {
  const { data: services } = useServices();
  const { data: categories } = useServiceCategories();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Real category rows, id → row. `services.categoryId` is the primary link;
  // `services.category` (legacy free-text, NOT NULL) is the fallback for rows
  // that predate the categories table — every service groups into *something*.
  const categoryById = useMemo(() => {
    const m = new Map<number, { id: number; name: string; sortOrder: number | null }>();
    for (const c of (categories ?? []) as any[]) m.set(c.id, c);
    return m;
  }, [categories]);

  const groups = useMemo<ServiceGroup[]>(() => {
    const byKey = new Map<string, ServiceGroup>();
    for (const svc of (services ?? []) as Service[]) {
      if ((svc as any).isActive === false) continue;
      const cat = svc.categoryId != null ? categoryById.get(svc.categoryId) : undefined;
      const key = cat ? `cat:${cat.id}` : `legacy:${svc.category}`;
      const name = cat?.name ?? svc.category;
      const sortOrder = cat?.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const existing = byKey.get(key);
      if (existing) existing.services.push(svc);
      else byKey.set(key, { key, name, sortOrder, services: [svc] });
    }
    return Array.from(byKey.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [services, categoryById]);

  const activeGroup = groups.find((g) => g.key === activeKey) ?? groups[0] ?? null;

  const filteredServices = useMemo(() => {
    const list = activeGroup?.services ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => s.name.toLowerCase().includes(q));
  }, [activeGroup, search]);

  const tileStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center",
    gap: 2, textAlign: "left", boxSizing: "border-box",
    border: "1px solid #3a3a3c", borderRadius: 6, backgroundColor: "#2a2a2c",
    color: "#e5e5e7", cursor: "pointer", userSelect: "none",
    padding: "10px 12px", minHeight: 72,
  };

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }} data-testid="pos-service-grid">
      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 10px", borderRadius: 6, border: "1px solid #3a3a3c", backgroundColor: "#242426", flexShrink: 0 }}>
        <Search style={{ width: 14, height: 14, color: "#8e8e93" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services"
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "#f5f5f7", fontSize: 13 }}
          data-testid="pos-service-search"
        />
      </div>

      {/* Category tabs */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", flexShrink: 0 }} data-testid="pos-category-tabs">
        {groups.map((g) => {
          const active = g.key === activeGroup?.key;
          return (
            <button
              key={g.key}
              onClick={() => setActiveKey(g.key)}
              style={{
                flexShrink: 0, height: 30, padding: "0 12px", borderRadius: 15,
                border: `1px solid ${active ? "#34d399" : "#3a3a3c"}`,
                backgroundColor: active ? "#1f3a2f" : "#242426",
                color: active ? "#34d399" : "#a1a1a6",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              }}
              data-testid={`pos-category-tab-${g.key}`}
            >
              {g.name}
            </button>
          );
        })}
      </div>

      {/* Service tiles */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 8, overflowY: "auto", flex: 1, minHeight: 88, alignContent: "start" }}
        data-testid="pos-service-tiles"
      >
        {groups.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", padding: "16px 4px", fontSize: 12, color: "#8e8e93" }}>
            No services in the catalogue yet.
          </div>
        ) : filteredServices.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", padding: "16px 4px", fontSize: 12, color: "#8e8e93" }}>
            No services match &ldquo;{search}&rdquo;.
          </div>
        ) : (
          filteredServices.map((svc) => (
            <button
              key={svc.id}
              style={tileStyle}
              onClick={() =>
                onAction({
                  id: `dyn.service.${svc.id}`,
                  label: svc.name,
                  icon: "Sparkles",
                  action: {
                    type: "add-service",
                    payload: {
                      serviceId: svc.id,
                      serviceName: svc.name,
                      price: Number(svc.price) || 0,
                      categoryId: svc.categoryId ?? null,
                    },
                  },
                })
              }
              data-testid={`pos-service-tile-${svc.id}`}
            >
              <span style={{ fontSize: 10, color: "#8e8e93" }}>{svc.duration} min</span>
              <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{svc.name}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#34d399" }}>${(Number(svc.price) || 0).toFixed(2)}</span>
            </button>
          ))
        )}
      </div>

      {/* Popular Add-Ons — the store's real, live add-on catalogue, unpaginated */}
      {addonItems.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#8e8e93", margin: "0 0 6px" }}>
            Popular Add-Ons
          </p>
          <div style={{ display: "flex", gap: 6, overflowX: "auto" }} data-testid="pos-addon-row">
            {addonItems.map((b) => (
              <button
                key={b.id}
                onClick={() => onAction(b)}
                style={{ ...tileStyle, flexShrink: 0, minWidth: 96, minHeight: 52, alignItems: "flex-start" }}
                data-testid={`pos-addon-tile-${b.id}`}
              >
                <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "pre-line" }}>{posT(b.id, b.label)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom action-tile strip — the function buttons that stay reachable
          regardless of which category tab is active. */}
      {desktopTileActions.length > 0 && (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 6, flexShrink: 0 }}
          data-testid="pos-action-strip"
        >
          {desktopTileActions.map((b) => {
            const Icon = resolvePosIcon(b.icon);
            return (
              <button
                key={b.id}
                onClick={() => b.enabled !== false && onAction(b)}
                disabled={b.enabled === false}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 3, boxSizing: "border-box", border: "1px solid #3a3a3c", borderRadius: 6,
                  backgroundColor: "#2a2a2c", color: "#e5e5e7", cursor: "pointer", userSelect: "none",
                  padding: "8px 4px", minHeight: 60, fontSize: 11, fontWeight: 700, textAlign: "center",
                  boxShadow: `inset 0 -3px 0 ${b.band ?? "#6b7280"}`,
                  opacity: b.enabled === false ? 0.4 : 1,
                }}
                data-testid={`pos-action-tile-${b.id}`}
              >
                {Icon
                  ? <Icon style={{ width: 18, height: 18, strokeWidth: 1.5 }} />
                  : <span style={{ width: 18, height: 18, display: "inline-block" }}>•</span>}
                <span style={{ whiteSpace: "pre-line" }}>{posT(b.id, b.label)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
