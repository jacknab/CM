import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, X } from "lucide-react";
import { isValidNanpNumber, isValidNanpPrefix } from "@/lib/phone-validation";
import { fetchTurn, type TurnTech } from "./nailApi";
import { NameEntry, createClient } from "./NameEntry";
import { findClientId } from "./clientLookup";
import { QuickAreaCodes } from "./QuickAreaCodes";
import { useQuickAreaCodes } from "./useQuickAreaCodes";

interface Props {
  storeId: number;
  /** Digits the customer typed on the paired /frontdesk tablet. */
  frontdeskPhone: string;
  /** A kiosk check-in that already gave us their number (and maybe name): skip the phone step entirely. */
  known?: { phone: string; name: string | null } | null;
  onClose: () => void;
  /** Client found or created; `staffId` = technician picked on the left, if any. */
  onClient: (clientId: number, staffId: number | null) => void;
}

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
type Step = "phone" | "finding" | "name" | "error";

const fmtPhone = (p: string) => p.replace(/(\d{3})(\d{3})(\d{0,4})/, (_, a, b, c) => `${a}-${b}${c ? `-${c}` : ""}`);

const statusOf = (t: TurnTech) =>
  t.eligible ? "Available"
    : t.currentStatus === "busy" ? "With a client"
    : t.currentStatus === "on_break" ? "On break"
    : t.clockedIn === false ? "Not clocked in"
    : "Unavailable";

export function WalkInSheet({ storeId, frontdeskPhone, known, onClose, onClient }: Props) {
  const knownDigits = (known?.phone ?? "").replace(/\D/g, "").slice(-10);
  const skipPhone = knownDigits.length === 10;
  const [phone, setPhone] = useState(skipPhone ? knownDigits : "");
  const [name, setName] = useState(skipPhone ? (known?.name ?? "").trim() : "");
  const [step, setStep] = useState<Step>(skipPhone ? "finding" : "phone");
  const [message, setMessage] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [noStaffAlert, setNoStaffAlert] = useState(false);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const quickCodes = useQuickAreaCodes(storeId);
  const lookedUp = useRef<string>("");

  const { data: turn } = useQuery({
    queryKey: ["/api/turn/eligibility", storeId, "nail-walkin"],
    queryFn: () => fetchTurn(storeId, null),
    staleTime: 0,
  });
  const techs = turn?.technicians ?? [];
  const hasAvailable = techs.some((t) => t.eligible);

  const lookup = async (digits: string) => {
    if (lookedUp.current === digits) return;
    lookedUp.current = digits;
    setBusy(true);
    const id = await findClientId(storeId, digits);
    setBusy(false);
    if (id != null) onClient(id, staffId);
    else setStep("name");
  };

  // Checked in at the kiosk with a number on file: find them silently — no phone entry, no "nobody free" prompt.
  useEffect(() => {
    if (skipPhone) void lookup(knownDigits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = (digits: string) => {
    if (!hasAvailable && techs.length > 0) { setNoStaffAlert(true); return; }
    void lookup(digits);
  };

  const digit = (d: string) => {
    if (phone.length >= 10 || busy) return;
    const next = phone + d;
    if (!isValidNanpPrefix(next)) { setPhone(""); setInvalid(true); return; }
    setInvalid(false);
    setPhone(next);
    if (next.length === 10) ready(next);
  };

  // Same as pressing each digit in turn (same checks, same 10-digit limit; the lookup starts only when the number is complete).
  const appendDigits = (digits: string) => {
    if (busy) return;
    let next = phone;
    for (const d of digits) {
      if (next.length >= 10) break;
      const cand = next + d;
      if (!isValidNanpPrefix(cand)) { setPhone(""); setInvalid(true); return; }
      next = cand;
    }
    setInvalid(false);
    setPhone(next);
    if (next.length === 10 && next !== phone) ready(next);
  };

  // The /frontdesk tablet pushed the digits the client typed.
  useEffect(() => {
    const d = (frontdeskPhone || "").replace(/\D/g, "").slice(-10);
    if (d.length !== 10) return;
    if (!isValidNanpNumber(d)) { setInvalid(true); return; }
    setPhone(d); setInvalid(false); setStep("phone");
    lookedUp.current = "";
    if (!hasAvailable && techs.length > 0) setNoStaffAlert(true);
    else void lookup(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontdeskPhone]);

  const saveNew = async () => {
    const trimmed = name.trim();
    if (!trimmed || phone.length !== 10 || busy) return;
    setBusy(true);
    try {
      onClient(await createClient(storeId, trimmed, phone), staffId);
    } catch {
      setMessage("We could not save this client. Please try again.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (step === "phone") { onClose(); return; }
    setStep("phone"); setMessage(""); setNoStaffAlert(false); lookedUp.current = "";
  };

  return (
    <>
      <div className="walkin-overlay" onClick={onClose} />
      <aside className={`walkin-sheet ${step === "name" ? "name-full" : ""}`} aria-label="Walk-in client lookup" data-testid="nail-walkin">
        <div className="walkin-sheet-header">
          <div className="walkin-title-row">
            <button type="button" className="walkin-back" onClick={back} aria-label="Go back">←</button>
            <h2>{step === "name" ? "New Client" : "New Walk-In Ticket"}</h2>
          </div>
          <button type="button" className="walkin-close" onClick={onClose} aria-label="Close walk-in sheet"><X size={18} /></button>
        </div>

        <div className={`walkin-body ${step === "name" ? "name-mode" : ""}`}>
          <div className="walkin-staff-panel">
            <div className="walkin-staff-label">SELECT TECHNICIAN</div>
            <div className="walkin-staff-list">
              {techs.map((t) => {
                const sel = staffId === t.id;
                const off = !t.eligible;
                return (
                  <button key={t.id} type="button" disabled={off} onClick={() => setStaffId(sel ? null : t.id)} data-testid={`nail-walkin-tech-${t.id}`}
                    className={`walkin-staff-card ${sel ? "walkin-staff-selected" : ""} ${off ? "walkin-staff-busy" : ""}`}>
                    <span className="walkin-staff-dot" style={{ background: off ? "#454c56" : t.color || "#0d9bd1" }} />
                    <span className="walkin-staff-info">
                      <strong>{t.name}</strong>
                      <span>{statusOf(t)}</span>
                    </span>
                    {sel && <Check size={15} className="walkin-staff-check" />}
                  </button>
                );
              })}
              {techs.length === 0 && <div className="walkin-staff-hint">Loading technicians…</div>}
            </div>
            <div className="walkin-staff-hint">Optional — leave it blank and the next technician up is offered after you build the ticket.</div>
          </div>

          <div className="walkin-phone-panel">
            {noStaffAlert && (
              <div className="walkin-no-staff-alert">
                <AlertTriangle size={18} />
                <span>No technicians are currently available. You can still create this ticket — it will line up behind their current client.</span>
                <div className="walkin-no-staff-actions">
                  <button type="button" className="walkin-alert-cancel" onClick={() => { setNoStaffAlert(false); setPhone(""); }}>Cancel</button>
                  <button type="button" className="walkin-alert-proceed" onClick={() => { setNoStaffAlert(false); void lookup(phone); }}>Continue Anyway</button>
                </div>
              </div>
            )}

            {step === "phone" && !noStaffAlert && (
              <>
                <div className="walkin-phone-display">
                  <span>Enter Phone Number</span>
                  <strong data-testid="nail-walkin-phone">{phone ? fmtPhone(phone) : " "}</strong>
                </div>
                {invalid && <p className="walkin-invalid">That number isn't valid — check the area code and try again.</p>}
                <div className="walkin-keypad">
                  {DIGITS.map((d) => <button key={d} type="button" onClick={() => digit(d)} data-testid={`nail-walkin-key-${d}`}>{d}</button>)}
                  <button type="button" style={{ visibility: "hidden" }} aria-hidden="true" tabIndex={-1} />
                  <button type="button" onClick={() => digit("0")} data-testid="nail-walkin-key-0">0</button>
                  <button type="button" className="walkin-backspace" onClick={() => { setPhone((p) => p.slice(0, -1)); setInvalid(false); }} aria-label="Delete last digit">⌫</button>
                </div>
                <QuickAreaCodes codes={quickCodes} onPick={appendDigits} variant="sheet" />
              </>
            )}

            {step === "finding" && (
              <div className="walkin-result" data-testid="nail-walkin-finding">
                <strong>Finding {known?.name?.trim() || "client"}…</strong>
              </div>
            )}

            {step === "name" && <NameEntry phone={phone} name={name} onName={setName} busy={busy} onDone={saveNew} />}

            {step === "error" && (
              <div className="walkin-result walkin-result-error">
                <X size={28} />
                <strong>{message}</strong>
                <button type="button" className="walkin-continue ready" onClick={() => setStep("name")}>TRY AGAIN</button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
