import { useState } from "react";
import { AlertTriangle, ArrowLeft, Delete, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManagerPinSheet } from "@/components/staff-screen/ManagerPinSheet";
import { syncEngine } from "@/lib/sync-engine";
import { cn } from "@/lib/utils";
import type { BoardTicket } from "./nailApi";
import { techLabel } from "./techName";
import { KEY_ROWS, LIGHT, KB_KEY, KB_WIDE, LIGHT_PAGE_BG } from "./touchKeys";
import { servicedCancelReasonProblem } from "@shared/servicedCancel";

/**
 * Cancelling a ticket a technician already worked on (owner, 2026-10-29): allowed, but only with the reason written
 * down (at least 3 words) and the manager PIN. The server checks both and keeps the record for the owner (Reports ›
 * Cancelled after service). A full page with its own keyboard — /nail runs on touch screens with no keyboard — in the
 * same light look as the client-name page. Needs a connection: the PIN and the record are checked on the server.
 */
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export function ServicedCancelSheet({ ticket, onClose, onConfirm }: {
  ticket: BoardTicket;
  onClose: () => void;
  /** Called with the reason and the manager PIN; resolves when the server has cancelled it. */
  onConfirm: (reason: string, pin: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [shift, setShift] = useState(true);
  const [askPin, setAskPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offline = syncEngine.isOffline();
  const who = ticket.staff ? techLabel(ticket.staff.name, ticket.staff.id) : "A technician";
  const notice = ticket.doneAt
    ? `${who} already marked this service DONE. Cancelling it needs the reason and the manager PIN. The owner sees both.`
    : `${who} already started this service. Cancelling it needs the reason and the manager PIN. The owner sees both.`;
  const problem = servicedCancelReasonProblem(reason);
  const ready = !problem && !busy && !offline;

  const key = (k: string) => {
    setError(null);
    if (k === "SHIFT") { setShift((v) => !v); return; }
    if (k === "BACKSPACE") { setReason((v) => v.slice(0, -1)); return; }
    if (k === "SPACE") { setReason((v) => (v.endsWith(" ") || !v ? v : v + " ")); return; }
    if (k === "NEXT") { if (ready) setAskPin(true); else if (problem) setError(problem); return; }
    // A sentence starts with a capital; Shift gives one capital letter.
    setReason((v) => (v.length >= 300 ? v : v + ((v.length === 0 || shift) ? k.toUpperCase() : k.toLowerCase())));
    if (shift) setShift(false);
  };

  const submit = async (pin: string) => {
    setAskPin(false);
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim(), pin);
    } catch (err) {
      setError((err as Error)?.message || "Could not cancel the ticket");
      setBusy(false);
    }
  };

  // The PIN pad is a page of its own; this one steps aside while the PIN is asked (the reason is kept).
  if (askPin) return <ManagerPinSheet title="Cancel serviced ticket · Manager PIN" onClose={() => setAskPin(false)} onSuccess={(pin) => void submit(pin)} />;

  return (
    <div className="cx-cal fixed inset-0 z-[320] flex flex-col text-[#0f1f3d]" style={{ background: LIGHT_PAGE_BG }} data-testid="nail-serviced-cancel">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-12 w-12" onClick={onClose} disabled={busy} aria-label="Back" data-testid="nail-serviced-cancel-back">
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <span className="text-lg font-semibold">Cancel a serviced ticket</span>
        </div>
        <Button variant="ghost" size="icon" className="h-12 w-12" onClick={onClose} disabled={busy} aria-label="Close">
          <X className="w-6 h-6" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4">
        <h1 className="text-[clamp(26px,4.5vh,38px)] font-bold mb-1">{ticket.ticketNumber != null ? `#${ticket.ticketNumber} · ` : ""}{ticket.client.name}</h1>
        <p className="w-full max-w-[760px] mb-[1.4vh] flex items-start justify-center gap-2 text-center text-[15px] text-[#7a4b00]">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{notice}</span>
        </p>
        <div
          className={cn(
            "w-full max-w-[760px] min-h-[clamp(54px,8vh,72px)] mb-[1.6vh] px-5 py-2 border rounded-xl bg-[#ffffff] flex items-center justify-center text-center text-[clamp(18px,3vh,26px)] font-semibold break-words",
            reason ? "text-[#0f1f3d] border-[#1f6fe0]" : "text-[#9aa8bb] border-[#d5deea]",
          )}
          role="textbox" aria-label="Reason for cancelling" aria-readonly="true" aria-live="polite" data-testid="nail-serviced-cancel-reason"
        >
          {reason || "Why is this ticket being cancelled? (at least 3 words)"}
        </div>
        {(error || offline) && (
          <p className="-mt-[0.8vh] mb-[1.2vh] text-[15px] font-semibold text-destructive" role="alert" data-testid="nail-serviced-cancel-error">
            {offline ? "No connection. A serviced ticket can only be cancelled online." : error}
          </p>
        )}
        <div className="w-full max-w-[1100px] space-y-[1.2vh]">
          <div className="flex justify-center gap-[0.6vw]">
            {DIGITS.map((d) => <button key={d} type="button" onClick={() => key(d)} className={KB_KEY} data-testid={`kb-${d}`}>{d}</button>)}
          </div>
          {KEY_ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-[0.6vw]" style={ri === 1 ? { padding: "0 5%" } : undefined}>
              {ri === 2 && (
                <button type="button" onClick={() => key("SHIFT")} className={cn(KB_WIDE, shift ? "bg-[#1f6fe0] text-white border-[#1f6fe0]" : LIGHT)} data-testid="kb-shift" aria-label="Shift">&#8593;</button>
              )}
              {row.map((k) => (
                <button key={k} type="button" onClick={() => key(k)} className={KB_KEY} data-testid={`kb-${k.toLowerCase()}`}>{shift ? k : k.toLowerCase()}</button>
              ))}
              {ri === 2 && (
                <button type="button" onClick={() => key("BACKSPACE")} className={cn(KB_WIDE, LIGHT)} data-testid="kb-backspace" aria-label="Backspace"><Delete className="w-7 h-7" /></button>
              )}
            </div>
          ))}
          <div className="flex justify-center gap-[0.6vw]">
            <button type="button" onClick={() => key(",")} className={cn(KB_KEY, "flex-[1.2]")} data-testid="kb-comma">,</button>
            <button type="button" onClick={() => key("SPACE")} className={cn(KB_KEY, "flex-[6] text-[clamp(16px,2.6vh,24px)]")} data-testid="kb-space">Spacebar</button>
            <button type="button" onClick={() => key(".")} className={cn(KB_KEY, "flex-[1.2]")} data-testid="kb-period">.</button>
            <button type="button" onClick={() => key("NEXT")} disabled={busy}
              className={cn(KB_KEY, "flex-[3] text-[clamp(14px,2.2vh,20px)] font-bold", ready ? "bg-green-500 text-white border-green-500 hover:bg-green-600" : "")}
              data-testid="nail-serviced-cancel-continue">
              {busy ? "CANCELLING…" : "MANAGER PIN · CANCEL TICKET"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
