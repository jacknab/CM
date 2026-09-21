import { useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { isValidNanpPrefix } from "@/lib/phone-validation";
import { NameEntry, createClient } from "./NameEntry";
import { findClientId } from "./clientLookup";

type Step = "phone" | "finding" | "name" | "done" | "error";

interface CheckInResult {
  status: "appointment" | "walkin" | "already";
  client: { id: number; name: string; loyaltyPoints: number };
  todayAppointment?: { serviceName?: string; staffName?: string | null } | null;
}

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const fmtPhone = (p: string) => p.replace(/(\d{3})(\d{3})(\d{0,4})/, (_, a, b, c) => `${a}-${b}${c ? `-${c}` : ""}`);

/**
 * Front-desk client check-in. While this is open the paired /frontdesk tablet shows its own check-in
 * phone screen (the parent sends that), so the client can check themselves in — or the tech types the
 * number here. Either way it's the same check-in the kiosk does: today's appointment is checked in and
 * handed to the next tech, or a walk-in lands on the waiting list.
 */
export function CheckInSheet({ storeId, frontdeskShowing, onClose, onDone }: {
  storeId: number;
  /** The /frontdesk tablet is on its check-in screen right now. */
  frontdeskShowing: boolean;
  onClose: () => void;
  /** Checked in: the message for the notice bar. */
  onDone: (message: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<Step>("phone");
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const ran = useRef("");

  const checkIn = async (clientId: number) => {
    const res = await fetch("/api/nail/checkin", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.status) throw new Error(data?.message || "Could not check the client in");
    const r = data as CheckInResult;
    setResult(r);
    setStep("done");
    const first = (r.client.name || "Client").trim().split(/\s+/)[0];
    const line = r.status === "already" ? `${first} is already checked in`
      : r.status === "appointment" ? `${first} checked in${r.todayAppointment?.staffName ? ` · ${r.todayAppointment.staffName}` : ""}`
      : `${first} checked in · waiting for a technician`;
    setTimeout(() => onDone(line), 1400);
  };

  const run = async (digits: string) => {
    if (ran.current === digits) return;
    ran.current = digits;
    setStep("finding");
    try {
      const id = await findClientId(storeId, digits);
      if (id == null) { setStep("name"); return; }
      await checkIn(id);
    } catch (e: any) {
      setMessage(e?.message || "Could not check the client in");
      setStep("error");
    }
  };

  const digit = (d: string) => {
    if (phone.length >= 10 || step !== "phone") return;
    const next = phone + d;
    if (!isValidNanpPrefix(next)) { setPhone(""); setInvalid(true); return; }
    setInvalid(false);
    setPhone(next);
    if (next.length === 10) void run(next);
  };

  const saveNew = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await checkIn(await createClient(storeId, name, phone));
    } catch (e: any) {
      setMessage(e?.message === "save failed" ? "We could not save this client. Please try again." : (e?.message || "Could not check the client in"));
      setStep("error");
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (step === "phone") { onClose(); return; }
    ran.current = ""; setStep("phone"); setMessage("");
  };

  return (
    <>
      <div className="walkin-overlay" onClick={onClose} />
      <aside className="walkin-sheet checkin-sheet" aria-label="Client check-in" data-testid="nail-checkin-sheet">
        <div className="walkin-sheet-header">
          <div className="walkin-title-row">
            <button type="button" className="walkin-back" onClick={back} aria-label="Go back">←</button>
            <h2>{step === "name" ? "New Client" : "Check In"}</h2>
          </div>
          <button type="button" className="walkin-close" onClick={onClose} aria-label="Close check-in"><X size={18} /></button>
        </div>

        <div className="walkin-body name-mode">
          <div className="walkin-phone-panel">
            {step === "phone" && (
              <>
                {frontdeskShowing && (
                  <p className="checkin-sheet-hint" data-testid="nail-checkin-hint">
                    The check-in screen is showing on the customer's tablet — <b>they can type their own number there</b>, or enter it here for them.
                  </p>
                )}
                <div className="walkin-phone-display">
                  <span>Enter Phone Number</span>
                  <strong data-testid="nail-checkin-phone">{phone ? fmtPhone(phone) : " "}</strong>
                </div>
                {invalid && <p className="walkin-invalid">That number isn't valid — check the area code and try again.</p>}
                <div className="walkin-keypad">
                  {DIGITS.map((d) => <button key={d} type="button" onClick={() => digit(d)} data-testid={`nail-checkin-key-${d}`}>{d}</button>)}
                  <button type="button" style={{ visibility: "hidden" }} aria-hidden="true" tabIndex={-1} />
                  <button type="button" onClick={() => digit("0")} data-testid="nail-checkin-key-0">0</button>
                  <button type="button" className="walkin-backspace" onClick={() => { setPhone((p) => p.slice(0, -1)); setInvalid(false); }} aria-label="Delete last digit">⌫</button>
                </div>
              </>
            )}

            {step === "finding" && <div className="walkin-result"><strong>Checking in…</strong></div>}

            {step === "name" && <NameEntry phone={phone} name={name} onName={setName} busy={busy} onDone={saveNew} />}

            {step === "done" && result && (
              <div className="checkin-done" data-testid="nail-checkin-done">
                <CheckCircle2 size={44} />
                <strong>{result.status === "already" ? "Already checked in" : "Checked in"}</strong>
                <span>
                  {result.client.name}
                  {result.status === "appointment" && result.todayAppointment ? ` · ${result.todayAppointment.serviceName ?? "Appointment"}${result.todayAppointment.staffName ? ` with ${result.todayAppointment.staffName}` : ""}` : ""}
                  {result.status === "walkin" ? " · waiting for a technician" : ""}
                </span>
              </div>
            )}

            {step === "error" && (
              <div className="walkin-result walkin-result-error">
                <X size={28} />
                <strong>{message}</strong>
                <button type="button" className="walkin-continue ready" onClick={back}>TRY AGAIN</button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
