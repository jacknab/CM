import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration, type NailConfigView, type NailGroup, type NailOption, type NailPick } from "./ticketDraft";

export interface CatalogService { id: number; name: string; duration: number; price: number | string }
export interface CatalogAddon { id: number; name: string; price: number | string; duration: number | null }
export interface CatalogGroup { key: string; name: string; services: CatalogService[] }

interface Props {
  locked: boolean;
  groups: CatalogGroup[];
  activeGroup: string;
  onGroup: (key: string) => void;
  serviceId: number | null;
  onService: (svc: CatalogService) => void;
  addons: CatalogAddon[];
  moreAddons: boolean;
  onToggleMore: () => void;
  hasMoreAddons: boolean;
  addonIds: number[];
  onToggleAddon: (id: number) => void;
  nail: NailConfigView | null;
  pick: NailPick;
  onPick: (group: NailGroup, id: number) => void;
}

const money = (v: number | string) => `$${Number(v).toFixed(2)}`;

function Tile({ selected, onClick, children, testId }: { selected?: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className={cn(
        "min-h-[64px] rounded-lg border px-3 py-2 text-left transition-colors flex flex-col justify-between gap-1",
        selected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-secondary",
      )}>
      {children}
    </button>
  );
}

function NailGroupRow({ label, options, selected, group, onPick }: { label: string; options: NailOption[]; selected: number | null; group: NailGroup; onPick: Props["onPick"] }) {
  if (options.length === 0) return null;
  return (
    <div>
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground mb-2">{label}</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
        {options.map((o) => (
          <Tile key={o.id} selected={selected === o.id} onClick={() => onPick(group, o.id)} testId={`nail-opt-${group}-${o.id}`}>
            <span className="text-[13px] font-semibold leading-tight">{o.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {o.isQuote ? "Custom quote" : o.priceAdjustment > 0 ? `+${money(o.priceAdjustment)}` : "Included"}
            </span>
          </Tile>
        ))}
      </div>
    </div>
  );
}

export function CatalogPanel(p: Props) {
  const services = p.groups.find((g) => g.key === p.activeGroup)?.services ?? [];
  return (
    <section className="relative flex-1 min-w-0 flex flex-col min-h-0" data-testid="nail-catalog">
      <div className="flex gap-1 overflow-x-auto border-b border-border px-3 shrink-0">
        {p.groups.map((g) => (
          <button key={g.key} type="button" onClick={() => p.onGroup(g.key)} data-testid={`nail-cat-${g.key}`}
            className={cn(
              "px-4 h-12 shrink-0 text-[12px] font-bold tracking-wider border-b-2 transition-colors",
              g.key === p.activeGroup ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}>
            {g.name.toUpperCase()}
          </button>
        ))}
      </div>

      <div className={cn("flex-1 overflow-y-auto p-4 space-y-6", p.locked && "opacity-30 pointer-events-none select-none")}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
          {services.map((s) => (
            <Tile key={s.id} selected={p.serviceId === s.id} onClick={() => p.onService(s)} testId={`nail-service-${s.id}`}>
              <span className="text-[14px] font-semibold leading-tight">{s.name}</span>
              <span className="flex justify-between text-[11px] text-muted-foreground">
                <span>{formatDuration(s.duration)}</span>
                <span className="font-semibold text-foreground">{money(s.price)}</span>
              </span>
            </Tile>
          ))}
          {services.length === 0 && <p className="text-[13px] text-muted-foreground col-span-full">No services in this category.</p>}
        </div>

        {p.nail && (
          <div className="space-y-4" data-testid="nail-options">
            <NailGroupRow label="NAIL LENGTH" options={p.nail.sizes} selected={p.pick.size} group="size" onPick={p.onPick} />
            <NailGroupRow label="NAIL SHAPE" options={p.nail.shapes} selected={p.pick.shape} group="shape" onPick={p.onPick} />
            <NailGroupRow label="NAIL ART" options={p.nail.applications} selected={p.pick.application} group="application" onPick={p.onPick} />
            <NailGroupRow label="ART EFFECT" options={p.nail.effects} selected={p.pick.effect} group="effect" onPick={p.onPick} />
          </div>
        )}

        {p.addons.length > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground mb-2">
              {p.moreAddons ? "ALL ADD-ONS" : "POPULAR ADD-ONS"}
            </h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
              {p.addons.map((a) => (
                <Tile key={a.id} selected={p.addonIds.includes(a.id)} onClick={() => p.onToggleAddon(a.id)} testId={`nail-addon-${a.id}`}>
                  <span className="text-[13px] font-semibold leading-tight">{a.name}</span>
                  <span className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{Number(a.price) > 0 ? `+${money(a.price)}` : "Free"}</span>
                    <Plus className="w-3.5 h-3.5" />
                  </span>
                </Tile>
              ))}
              {p.hasMoreAddons && (
                <button type="button" onClick={p.onToggleMore} data-testid="nail-addon-more"
                  className="min-h-[64px] rounded-lg border border-dashed border-border text-[13px] font-semibold text-muted-foreground hover:bg-secondary">
                  {p.moreAddons ? "Less" : "More"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {p.locked && (
        <div className="absolute inset-x-0 top-12 bottom-0 flex flex-col items-center justify-center gap-2 text-center text-muted-foreground pointer-events-none">
          <p className="text-[14px] font-semibold text-foreground">Start a walk-in to begin a ticket</p>
          <p className="text-[12px]">Tap Walk-in below and enter the client's phone number.</p>
        </div>
      )}
    </section>
  );
}
