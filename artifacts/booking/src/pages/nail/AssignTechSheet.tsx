import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchTurn, type TurnTech } from "./nailApi";

interface Props {
  storeId: number;
  serviceId: number | null;
  clientName: string;
  mode: "create" | "reassign";
  /** Technician to leave out (the ticket's current one, when reassigning). */
  excludeStaffId?: number | null;
  busy: boolean;
  error: string | null;
  /** `staffId` null = whoever TURN says is next. */
  onConfirm: (staffId: number | null) => void;
  onClose: () => void;
}

function statusOf(t: TurnTech): string {
  if (t.eligible) return "Available";
  if (t.currentStatus === "busy") return "With a client";
  if (t.currentStatus === "on_break") return "On break";
  if (t.clockedIn === false) return "Not clocked in";
  return t.exclusionReasons?.[0] ?? "Unavailable";
}

export function AssignTechSheet({ storeId, serviceId, clientName, mode, excludeStaffId, busy, error, onConfirm, onClose }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/turn/eligibility", storeId, "nail-assign", serviceId],
    queryFn: () => fetchTurn(storeId, serviceId),
    staleTime: 0,
  });
  const [selected, setSelected] = useState<number | null>(null);

  const techs = useMemo(() => {
    const all = (data?.technicians ?? []).filter((t) => t.id !== excludeStaffId);
    return [...all].sort((a, b) => Number(b.eligible) - Number(a.eligible) || (a.turnPosition ?? 99) - (b.turnPosition ?? 99) || a.name.localeCompare(b.name));
  }, [data, excludeStaffId]);
  const nextUp = techs.find((t) => t.eligible) ?? null;
  const chosen = techs.find((t) => t.id === selected) ?? null;
  const queueing = !!chosen && !chosen.eligible;

  const confirmLabel = busy
    ? "WORKING…"
    : chosen
      ? queueing ? `LINE UP BEHIND ${chosen.name.toUpperCase()}` : mode === "create" ? `ASSIGN ${chosen.name.toUpperCase()}` : `MOVE TO ${chosen.name.toUpperCase()}`
      : nextUp && mode === "create" ? `ASSIGN NEXT UP · ${nextUp.name.toUpperCase()}` : "CHOOSE A TECHNICIAN";
  const canConfirm = !busy && (!!chosen || (mode === "create" && !!nextUp));

  return (
    <>
      <div className="fixed inset-0 z-[140] bg-black/60" onClick={onClose} />
      <div className="fixed z-[150] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(94vw,460px)] max-h-[86vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl" data-testid="nail-assign-sheet">
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-border">
          <div>
            <h2 className="text-[17px] font-bold">{mode === "create" ? "Assign technician" : "Reassign technician"}</h2>
            <p className="text-[12px] text-muted-foreground">{clientName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[120px]">
          {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
          {isError && <p className="text-[13px] text-destructive px-2 py-4">Couldn't load technicians. Try again.</p>}
          {!isLoading && !isError && !nextUp && (
            <p className="text-[12px] text-muted-foreground px-2 pb-1">
              Nobody is free right now. Pick a technician to line this client up behind their current one.
            </p>
          )}
          {techs.map((t) => (
            <button key={t.id} type="button" onClick={() => setSelected(selected === t.id ? null : t.id)} data-testid={`nail-tech-${t.id}`}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                selected === t.id ? "border-primary bg-primary/10" : "border-border hover:bg-secondary",
              )}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color || "hsl(var(--cx-surface-4))" }} />
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold truncate">{t.name}</span>
                <span className="block text-[11px] text-muted-foreground">{statusOf(t)}</span>
              </span>
              {mode === "create" && nextUp?.id === t.id && (
                <span className="text-[10px] font-bold tracking-wider text-primary">NEXT UP</span>
              )}
            </button>
          ))}
        </div>

        {error && <div className="mx-4 mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive" data-testid="nail-assign-error">{error}</div>}
        <div className="p-4 pt-2 border-t border-border">
          <button type="button" disabled={!canConfirm} onClick={() => onConfirm(chosen ? chosen.id : null)} data-testid="nail-assign-confirm"
            className="h-12 w-full rounded-md bg-primary text-primary-foreground text-[13px] font-bold tracking-wide disabled:opacity-40">
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
