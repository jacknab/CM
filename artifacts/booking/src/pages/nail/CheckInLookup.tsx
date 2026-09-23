import { useCallback, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Delete, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isValidNanpPrefix } from "@/lib/phone-validation";
import { useShake } from "@/hooks/use-shake";
import { createClient } from "./NameEntry";
import { findClientId } from "./clientLookup";
import { QuickAreaCodes } from "./QuickAreaCodes";
import { useQuickAreaCodes } from "./useQuickAreaCodes";

/**
 * Front-desk Check-In — the Customers page (`/client-lookup`, full-screen phone pad → "Add Client Name" on-screen keyboard)
 * with check-in logic instead of "open the client". While this is open the paired /frontdesk tablet shows its own check-in
 * phone screen (the parent sends that), so the client can check themselves in — or staff key the number here. Either way it's the
 * same check-in the kiosk does: today's appointment is checked in and handed to the next tech, or a walk-in lands on the waiting list.
 */
type Step = "phone" | "finding" | "name" | "done" | "error";

interface CheckInResult {
  status: "appointment" | "walkin" | "already";
  client: { id: number; name: string; loyaltyPoints: number };
  todayAppointment?: { serviceName?: string; staffName?: string | null } | null;
}

const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];
const NUM_ROWS = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]];

// Touch targets scale with the screen height so nothing is cut off on a 10" tablet.
const NUM_KEY = "w-[clamp(84px,9vw,124px)] h-[clamp(52px,9.5vh,84px)] rounded-lg border bg-card text-[clamp(24px,4vh,36px)] font-semibold hover-elevate active-elevate-2";
const KB_KEY = "flex-1 min-w-0 h-[clamp(52px,10.5vh,88px)] rounded-lg border bg-card text-[clamp(20px,3.6vh,32px)] font-medium hover-elevate active-elevate-2";
const KB_WIDE = "flex-[1.5] min-w-0 h-[clamp(52px,10.5vh,88px)] rounded-lg border text-[clamp(20px,3.6vh,32px)] font-medium flex items-center justify-center";

const formatPhone = (d: string): string => {
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

export function CheckInLookup({ storeId, clientEnteringPhone = false, onClose, onDone }: {
  storeId: number;
  /** The /frontdesk tablet is on its check-in screen right now. */
  frontdeskShowing: boolean;
  /** The client is typing their number on the customer-facing screen right now. */
  clientEnteringPhone?: boolean;
  onClose: () => void;
  /** Checked in: the message for the notice bar. */
  onDone: (message: string) => void;
}) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [shift, setShift] = useState(true);
  // A digit that can't start a real US number is refused with a shake — the digits already typed stay put.
  const { shakeClass, shake: rejectDigit, onShakeEnd } = useShake();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const ran = useRef("");
  const quickCodes = useQuickAreaCodes(storeId);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

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
    if (!isValidNanpPrefix(next)) { rejectDigit(); return; }
    setPhone(next);
    if (next.length === 10) void run(next);
  };

  // Same as pressing each digit in turn (same checks, same 10-digit limit, lookup starts only when the number is complete).
  const appendDigits = (digits: string) => {
    if (step !== "phone") return;
    let next = phone;
    for (const d of digits) {
      if (next.length >= 10) break;
      const cand = next + d;
      if (!isValidNanpPrefix(cand)) { if (next !== phone) setPhone(next); rejectDigit(); return; } // keep the digits before the bad one
      next = cand;
    }
    setPhone(next);
    if (next.length === 10 && next !== phone) void run(next);
  };

  const saveNew = useCallback(async () => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, phone, busy, storeId]);

  const key = (k: string) => {
    if (k === "SHIFT") { setShift((v) => !v); return; }
    if (k === "BACKSPACE") { setName((v) => v.slice(0, -1)); return; }
    if (k === "SPACE") { setName((v) => v + " "); setShift(true); return; }
    if (k === "RETURN") { void saveNew(); return; }
    setName((v) => v + (shift ? k.toUpperCase() : k.toLowerCase()));
    if (shift) setShift(false);
  };

  const back = () => {
    if (step === "phone") { onClose(); return; }
    ran.current = ""; setStep("phone"); setMessage(""); setName(""); setShift(true);
  };

  return (
    <div className="dark cx-cal fixed inset-0 z-[320] flex flex-col bg-background text-foreground" data-testid="nail-checkin-sheet">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-12 w-12" onClick={back} data-testid="nail-checkin-back" aria-label="Back">
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <span className="text-lg font-semibold">{step === "name" ? "Enter Client Name" : "Check-In"}</span>
        </div>
        {step === "name" && <span className="text-xl font-bold" data-testid="nail-name-display">{name}</span>}
        {offline && step !== "name" && (
          <span className="text-xs text-amber-500 font-medium px-2 py-0.5 rounded-full border border-amber-500/40">Offline — check-in needs a connection</span>
        )}
        <Button variant="ghost" size="icon" className="h-12 w-12" onClick={onClose} data-testid="nail-checkin-close" aria-label="Close">
          <X className="w-6 h-6" />
        </Button>
      </div>

      <div className={cn("flex-1 min-h-0 flex flex-col items-center justify-center px-4", shakeClass)} onAnimationEnd={onShakeEnd} data-testid="nail-checkin-shake">
        {step === "phone" && (
          <>
            <div className="text-[clamp(30px,6vh,48px)] font-mono tracking-wider mb-[2.5vh] min-h-[48px] flex items-center" data-testid="nail-checkin-phone">
              {phone.length > 0 ? formatPhone(phone) : <span className="text-muted-foreground/40">(___) ___-____</span>}
            </div>

            <div className="relative">
              {/* Frosted-glass card over the keypad while the client is typing on the customer-facing screen. It only signals —
                  it never takes taps — so staff can still key the number themselves. */}
              <div
                className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
                role="status" aria-live="polite" aria-hidden={!clientEnteringPhone}
                data-testid="nail-client-entering-phone" data-active={clientEnteringPhone ? "true" : "false"}
                style={{ opacity: clientEnteringPhone ? 1 : 0, transition: "opacity 220ms ease" }}
              >
                <div
                  className="flex items-center justify-center text-center"
                  style={{
                    width: "clamp(150px, 24vh, 230px)", aspectRatio: "1 / 1", borderRadius: 26, padding: 18,
                    background: "linear-gradient(145deg, rgba(56, 189, 208, 0.20), rgba(20, 30, 44, 0.66))",
                    WebkitBackdropFilter: "blur(16px) saturate(150%)", backdropFilter: "blur(16px) saturate(150%)",
                    border: "1px solid rgba(255, 255, 255, 0.16)",
                    boxShadow: "0 18px 48px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.10)",
                    transform: clientEnteringPhone ? "scale(1)" : "scale(0.96)", transition: "transform 220ms ease",
                  }}
                >
                  <span className="font-semibold uppercase" style={{ fontSize: "clamp(13px, 2.1vh, 17px)", letterSpacing: "0.2em", lineHeight: 1.5, color: "rgba(244, 248, 252, 0.94)" }}>
                    CLIENT ENTERING PHONE
                  </span>
                </div>
              </div>
              <div className="space-y-[1.2vh]">
              {NUM_ROWS.map((row, ri) => (
                <div key={ri} className="flex justify-center gap-2">
                  {row.map((d) => (
                    <button key={d} onClick={() => digit(d)} className={NUM_KEY} data-testid={`nail-checkin-key-${d}`}>{d}</button>
                  ))}
                </div>
              ))}
              <div className="flex justify-center gap-2">
                <button onClick={() => setPhone("")} className={cn(NUM_KEY, "text-[clamp(16px,2.6vh,22px)] text-destructive")} data-testid="nail-checkin-clear">Clear</button>
                <button onClick={() => digit("0")} className={NUM_KEY} data-testid="nail-checkin-key-0">0</button>
                <button onClick={() => setPhone((p) => p.slice(0, -1))} className={cn(NUM_KEY, "flex items-center justify-center")} aria-label="Delete last digit" data-testid="nail-checkin-backspace">
                  <Delete className="w-7 h-7" />
                </button>
              </div>
              </div>
              <QuickAreaCodes codes={quickCodes} onPick={appendDigits} variant="page" />
            </div>
          </>
        )}

        {step === "finding" && <p className="text-2xl text-muted-foreground animate-pulse">Checking in…</p>}

        {step === "name" && (
          <>
            <h1 className="text-[clamp(26px,4.5vh,38px)] font-bold mb-1" data-testid="nail-name-entry">Add Client Name</h1>
            <p className="text-sm text-muted-foreground mb-[2.5vh]">Creating new client for {formatPhone(phone)}</p>
            <div className="w-full max-w-[1100px] space-y-[1.2vh]">
              {KEY_ROWS.map((row, ri) => (
                <div key={ri} className="flex justify-center gap-[0.6vw]" style={ri === 1 ? { padding: "0 5%" } : undefined}>
                  {ri === 2 && (
                    <button onClick={() => key("SHIFT")} className={cn(KB_WIDE, shift ? "bg-primary text-primary-foreground" : "bg-card hover-elevate active-elevate-2")} data-testid="kb-shift" aria-label="Shift">&#8593;</button>
                  )}
                  {row.map((k) => (
                    <button key={k} onClick={() => key(k)} className={KB_KEY} data-testid={`kb-${k.toLowerCase()}`}>{shift ? k : k.toLowerCase()}</button>
                  ))}
                  {ri === 2 && (
                    <button onClick={() => key("BACKSPACE")} className={cn(KB_WIDE, "bg-card hover-elevate active-elevate-2")} data-testid="kb-backspace" aria-label="Backspace"><Delete className="w-7 h-7" /></button>
                  )}
                </div>
              ))}
              <div className="flex justify-center gap-[0.6vw]">
                <button onClick={() => key("@")} className={cn(KB_KEY, "flex-[1.2]")} data-testid="kb-at">@</button>
                <button onClick={() => key("SPACE")} className={cn(KB_KEY, "flex-[6] text-[clamp(16px,2.6vh,24px)]")} data-testid="kb-space">Spacebar</button>
                <button onClick={() => key("RETURN")} className={cn(KB_KEY, "flex-[2] text-[clamp(16px,2.6vh,24px)]", name.trim() ? "bg-green-500 text-white hover:bg-green-600" : "")} data-testid="kb-return">Return &#8629;</button>
              </div>
            </div>
            <Button className="mt-[2vh] px-16 h-[clamp(52px,9vh,76px)] text-xl bg-green-500 text-white" size="lg" onClick={() => void saveNew()}
              disabled={!name.trim() || busy} data-testid="nail-checkin-save">
              {busy ? "Saving..." : "Done"}
            </Button>
          </>
        )}

        {step === "done" && result && (
          <div className="flex flex-col items-center gap-3 text-center" data-testid="nail-checkin-done">
            <CheckCircle2 className="w-16 h-16 text-green-500" />
            <h1 className="text-3xl font-bold">{result.status === "already" ? "Already checked in" : "Checked in"}</h1>
            <p className="text-lg text-muted-foreground">
              {result.client.name}
              {result.status === "appointment" && result.todayAppointment ? ` · ${result.todayAppointment.serviceName ?? "Appointment"}${result.todayAppointment.staffName ? ` with ${result.todayAppointment.staffName}` : ""}` : ""}
              {result.status === "walkin" ? " · waiting for a technician" : ""}
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <X className="w-12 h-12 text-red-500" />
            <p className="text-xl font-semibold">{message}</p>
            <Button size="lg" onClick={back} className="h-14 px-10 text-lg">Try again</Button>
          </div>
        )}
      </div>
    </div>
  );
}
