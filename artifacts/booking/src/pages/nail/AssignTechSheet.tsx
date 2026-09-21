import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { fetchTurn, type TurnTech } from "./nailApi";

interface Props {
  storeId: number;
  serviceId: number | null;
  clientName: string;
  mode: "create" | "reassign";
  /** Technician to leave out (the ticket's current one, when reassigning). */
  excludeStaffId?: number | null;
  /** Technician picked on the walk-in sheet — starts selected. */
  initialStaffId?: number | null;
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

export function AssignTechSheet({ storeId, serviceId, clientName, mode, excludeStaffId, initialStaffId, busy, error, onConfirm, onClose }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/turn/eligibility", storeId, "nail-assign", serviceId],
    queryFn: () => fetchTurn(storeId, serviceId),
    staleTime: 0,
  });
  const [selected, setSelected] = useState<number | null>(initialStaffId ?? null);

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
      ? queueing ? `LINE UP BEHIND ${chosen.name.toUpperCase()}` : mode === "create" ? `ASSIGN ${chosen.name.toUpperCase()} & CHECK IN` : `MOVE TO ${chosen.name.toUpperCase()}`
      : nextUp && mode === "create" ? `ASSIGN NEXT UP · ${nextUp.name.toUpperCase()}` : "CHOOSE A TECHNICIAN";
  const canConfirm = !busy && (!!chosen || (mode === "create" && !!nextUp));

  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="assign-create-modal" data-testid="nail-assign-sheet">
        <div className="assign-create-header">
          <div>
            <h2>{mode === "create" ? "Assign Technician" : "Reassign Technician"}</h2>
            <p>{clientName}</p>
          </div>
          <button type="button" className="assign-create-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {!isLoading && !isError && !nextUp && (
          <div className="assign-create-notice">
            <AlertTriangle size={14} />
            <span>Nobody is free right now. Pick a technician to line this client up behind their current one.</span>
          </div>
        )}
        <div className="assign-create-list">
          {isLoading && <div className="assign-picker-empty"><Loader2 size={18} className="animate-spin" style={{ margin: "0 auto" }} /></div>}
          {isError && <div className="assign-picker-empty" style={{ color: "#ef5a5f" }}>Couldn't load technicians. Try again.</div>}
          {techs.map((t) => {
            const isSel = selected === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setSelected(isSel ? null : t.id)} data-testid={`nail-tech-${t.id}`}
                className={`assign-create-item ${isSel ? "assign-create-item-sel" : ""}`}>
                <span className="assign-create-dot" style={{ background: t.color || "#454c56" }} />
                <span className="assign-create-name">{t.name}</span>
                {mode === "create" && nextUp?.id === t.id && <span className="assign-create-next">NEXT UP</span>}
                <span className="assign-create-status">{statusOf(t)}</span>
                {isSel && <Check size={15} style={{ color: "#0d9bd1" }} />}
              </button>
            );
          })}
        </div>
        {error && <p className="assign-create-error" data-testid="nail-assign-error">{error}</p>}
        <div className="assign-create-footer">
          <button type="button" className="assign-create-skip" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!canConfirm} onClick={() => onConfirm(chosen ? chosen.id : null)} data-testid="nail-assign-confirm"
            className={`assign-create-btn ${canConfirm ? "assign-create-btn-ready" : ""}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
