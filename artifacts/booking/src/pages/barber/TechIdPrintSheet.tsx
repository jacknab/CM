import { staffApi } from "@/lib/staffScreenApi";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { KEYPAD_CODE, scanKeypadCode } from "@/lib/keypadCode";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Printer, QrCode, X, AlertCircle, CheckCircle } from "lucide-react";
import { buildTechIdSlip, buildQrConfirmationSlip } from "@/lib/thermalPrinter";
import { nativeAppWithoutBadgePrint, printNativeTechId } from "@/lib/native-tech-id";

const NEEDS_APP_UPDATE = "This tablet's Certxa app needs its latest update to print this. Close the app and open it again twice, then try again.";

interface PrintableTech {
  id: number;
  name: string;
  barberNumber: number | null;
  status?: string | null;
}

interface QrConfirmationState {
  token: string;
  expiresAt: number;
  printing: boolean;
  message: string;
}

export function TechIdPrintSheet({
  techs,
  keypadVisible,
  savingKeypad,
  onKeypadVisibleChange,
  thermalPrint,
  managerPin,
  onClose,
}: {
  techs: PrintableTech[];
  keypadVisible: boolean;
  savingKeypad: boolean;
  onKeypadVisibleChange: (visible: boolean) => void;
  thermalPrint?: (bytes: Uint8Array) => Promise<void>;
  /** The manager PIN (or manager badge) that opened the Manager menu: approves printing a manager badge. */
  managerPin?: string | null;
  onClose: () => void;
}) {
  const list = useMemo(
    () => techs.filter((tech) => !["deactivated", "removed"].includes(tech.status ?? "active") && tech.barberNumber != null).sort((a, b) => (a.barberNumber ?? 999) - (b.barberNumber ?? 999)),
    [techs],
  );
  const [selectedId, setSelectedId] = useState<number | null>(() => list[0]?.id ?? null);
  const [printing, setPrinting] = useState(false);
  const [message, setMessage] = useState("");
  const [qrConfirmation, setQrConfirmation] = useState<QrConfirmationState | null>(null);
  const selected = list.find((tech) => tech.id === selectedId) ?? list[0] ?? null;
  const techId = selected?.barberNumber ?? null;
  const qrValue = techId == null ? "" : `TECH:${techId}`;
  // The owner and Managers can also have a manager badge (lib/managerPin.ts).
  const [badgeHolders, setBadgeHolders] = useState<number[]>([]);
  useEffect(() => {
    let live = true;
    fetch(staffApi("/manager-badges"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && Array.isArray(d?.holders)) setBadgeHolders(d.holders.map((h: any) => Number(h.staffId))); })
      .catch(() => { /* offline: no manager badges to print */ });
    return () => { live = false; };
  }, []);
  const canHaveBadge = selected != null && badgeHolders.includes(selected.id);

  /** Prints on the owner app's printer, else on a receipt printer connected to this page. */
  const printCode = async (caption: string, code: string, slip: () => Uint8Array) => {
    const native = await printNativeTechId({ id: techId ?? 0, name: caption }, code);
    if (native) { if (!native.ok) throw new Error(native.error); return; }
    if (nativeAppWithoutBadgePrint()) throw new Error(NEEDS_APP_UPDATE);
    if (!thermalPrint) throw new Error("Connect the receipt printer from the Manager menu, then try again.");
    await thermalPrint(slip());
  };

  /** The manager badge just printed, shown on screen (its code is made when it is printed). */
  const [printed, setPrinted] = useState<{ staffId: number; code: string } | null>(null);
  const printManagerBadge = async () => {
    if (!selected || printing) return;
    setPrinting(true);
    setMessage("");
    try {
      const res = await fetch(staffApi(`/manager-badges/${selected.id}`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(managerPin ? { "X-Manager-Pin": managerPin } : {}) },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not make the manager badge.");
      const caption = `${selected.name} - MANAGER`;
      await printCode(caption, data.code, () => buildTechIdSlip({ id: data.techId, name: caption }, data.code));
      setPrinted({ staffId: selected.id, code: data.code });
      setMessage(`Printed ${selected.name}'s Barber ID. It signs in at the lock screen and works as the manager PIN. Older badges for ${selected.name} no longer work as the manager PIN.`);
    } catch (error: any) {
      setMessage(error?.message || "Could not print the manager badge.");
    } finally {
      setPrinting(false);
    }
  };

  // One badge (owner, 2026-11-02): the owner's and a Manager's Tech ID is their manager badge — the same QR signs
  // them in at the lock screen and stands in for the manager PIN. Everyone else gets the plain Tech ID.
  const printTechId = async () => {
    if (canHaveBadge) { await printManagerBadge(); return; }
    if (!selected || techId == null || printing) return;
    setPrinting(true);
    setMessage("");
    try {
      await printCode(selected.name, qrValue, () => buildTechIdSlip({ id: techId, name: selected.name }));
      setMessage(`Printed ${selected.name}'s Barber ID.`);
    } catch (error: any) {
      setMessage(error?.message || "Could not print this Barber ID.");
    } finally {
      setPrinting(false);
    }
  };

  const generateQrConfirmation = useCallback(async () => {
    try {
      setMessage("Generating QR code…");
      const res = await fetch(staffApi("/qr-code/generate"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setting: "keypadHide" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not generate QR code");
      setQrConfirmation({ token: data.token, expiresAt: data.expiresAt, printing: true, message: "Printing QR code…" });
      // The owner app's printer first (the page's own printer is only for a browser): until 2026-11-02 this asked only
      // the page's, so on the tablets it never printed.
      // The salon's KEYPAD QR: scanned it hides the keypad (the confirmation) and later shows it again.
      const native = await printNativeTechId({ id: 0, name: "KEYPAD" }, data.token);
      if (native && !native.ok) throw new Error(native.error);
      if (!native) {
        if (nativeAppWithoutBadgePrint()) throw new Error(NEEDS_APP_UPDATE);
        if (!thermalPrint) throw new Error("Connect the receipt printer from the Manager menu, then try again.");
        await thermalPrint(buildQrConfirmationSlip({ storeName: "Salon", token: data.token, setting: "Keypad" }));
      }
      setQrConfirmation((prev) => prev ? { ...prev, printing: false, message: "QR code printed. Scan it to confirm." } : null);
    } catch (error: any) {
      setQrConfirmation(null);
      setMessage(error?.message || "Could not generate QR code.");
    }
  }, [thermalPrint]);

  // The KEYPAD QR scanned while this screen waits for it: the keypad is hidden (the scan proves the scanner works).
  const queryClient = useQueryClient();
  useBarcodeScanner((raw) => {
    if (!qrConfirmation || !KEYPAD_CODE.test(raw.trim())) return;
    void scanKeypadCode(raw, queryClient).then((r) => {
      if (!r.ok) { setMessage(r.error); return; }
      if (r.keypadVisible) { setMessage("Keypad shown."); return; }
      setQrConfirmation(null);
      setMessage("Keypad hidden. Scan the same KEYPAD QR at the lock screen to show it again.");
    });
  }, !!qrConfirmation);

  const cancelQrConfirmation = useCallback(() => {
    setQrConfirmation(null);
    setMessage("");
  }, []);

  const handleKeypadToggle = useCallback(async (newVisible: boolean) => {
    if (newVisible) {
      // Enabling keypad (showing it) - no confirmation needed
      onKeypadVisibleChange(true);
    } else {
      // Disabling keypad (hiding it) - require QR confirmation
      await generateQrConfirmation();
    }
  }, [onKeypadVisibleChange, generateQrConfirmation]);

  return (
    <>
      <div className="fixed inset-0 z-[520] bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />
      <section className="fixed inset-4 z-[521] mx-auto flex max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-white shadow-2xl sm:inset-8" role="dialog" aria-modal="true" aria-labelledby="tech-id-print-title" data-testid="tech-id-print-sheet">
        <header className="flex items-center justify-between gap-4 border-b border-slate-700 px-5 py-4">
          <div>
            <h2 id="tech-id-print-title" className="text-xl font-bold">Print Barber ID</h2>
            <p className="mt-1 text-sm text-slate-400">Print a scanner badge for the selected barber.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800" aria-label="Close"><X /></button>
        </header>

        {qrConfirmation ? (
          // QR Confirmation Flow
          <div className="flex flex-col flex-1 p-5">
            <div className="mb-4 text-center">
              <AlertCircle className="h-12 w-12 text-amber-400 mx-auto" />
              <h3 className="mt-3 text-xl font-bold">Confirm Keypad Hide</h3>
              <p className="mt-2 text-slate-300">A KEYPAD QR code has been printed. Scan it now to hide the keypad.</p>
              <p className="mt-1 text-xs text-slate-500">Keep it: scanning the same QR at the lock screen shows the keypad again.</p>
            </div>
            <div className="flex flex-col items-center justify-center flex-1 bg-white p-6 text-slate-950 rounded-xl">
              <div className="rounded-xl border-4 border-slate-950 bg-white p-3"><QRCodeSVG value={qrConfirmation.token} size={190} level="M" marginSize={0} /></div>
              <p className="mt-4 text-center text-sm font-semibold text-slate-500">Token: {qrConfirmation.token}</p>
              {qrConfirmation.printing && <p className="mt-2 text-center text-sm text-slate-500 animate-pulse">Printing…</p>}
              {!qrConfirmation.printing && <p className="mt-2 text-center text-sm text-emerald-600 font-semibold">QR code printed. Scan to confirm.</p>}
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={cancelQrConfirmation}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 py-3.5 font-bold text-white hover:bg-slate-700"
              >
                <X className="h-5 w-5" />
                Cancel
              </button>
            </div>
            {message && <p className="mt-3 text-center text-sm font-semibold" role="status">{message}</p>}
          </div>
        ) : (
          // Normal Tech ID Print Sheet
          <>
            <div className="border-b border-slate-700 bg-slate-950/50 px-5 py-4">
              <div className="flex items-center justify-between gap-5 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                <div>
                  <p className="font-semibold">Keypad on lock screen</p>
                  <p className="mt-0.5 text-xs text-slate-400">When hidden, barbers must scan their printed ID.</p>
                </div>
                {/* One button: it says what a tap will do, and stays pressed in while the keypad is hidden. */}
                <button
                  type="button"
                  aria-pressed={!keypadVisible}
                  disabled={savingKeypad}
                  onClick={() => handleKeypadToggle(!keypadVisible)}
                  className={`min-w-[150px] shrink-0 rounded-xl border px-5 py-3 font-bold transition disabled:opacity-60 ${keypadVisible ? "border-slate-600 bg-slate-800 text-white hover:bg-slate-700" : "border-white bg-white text-slate-950 hover:bg-slate-200"}`}
                  data-testid="tech-id-keypad-toggle"
                >
                  {savingKeypad ? "Saving…" : keypadVisible ? "Hide Keypad" : "Show Keypad"}
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-h-0 overflow-y-auto border-b border-slate-700 p-5 md:border-b-0 md:border-r">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Choose barber</p>
                {list.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">No active barbers have a Barber ID.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {list.map((tech) => (
                      <button
                        key={tech.id}
                        type="button"
                        onClick={() => { setSelectedId(tech.id); setMessage(""); }}
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${selected?.id === tech.id ? "border-cyan-400 bg-cyan-400/10" : "border-slate-700 bg-slate-800 hover:border-slate-500"}`}
                      >
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-950 text-lg font-black text-cyan-300">{tech.barberNumber}</span>
                        <span className="min-w-0 truncate font-semibold">{tech.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center justify-center bg-white p-6 text-slate-950">
                {selected && techId != null ? (
                  <>
                    {(!canHaveBadge || printed?.staffId === selected.id) && (
                      <div className="rounded-xl border-4 border-slate-950 bg-white p-3"><QRCodeSVG value={canHaveBadge ? printed!.code : qrValue} size={190} level="M" marginSize={0} /></div>
                    )}
                    <p className="mt-4 text-center text-2xl font-black">{selected.name}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-500"><QrCode className="h-3.5 w-3.5" /> {canHaveBadge ? `Barber ID ${techId} · Manager` : `Barber ID ${techId}`}</p>
                    <button type="button" disabled={printing} onClick={() => void printTechId()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 font-bold text-white hover:bg-slate-800 disabled:opacity-60" data-testid="print-tech-id">
                      {printing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
                      {printing ? "Printing…" : "Print Barber ID"}
                    </button>
                    {message && <p className="mt-3 text-center text-sm font-semibold" role="status">{message}</p>}
                  </>
                ) : <p className="text-center text-sm text-slate-500">Choose a barber with a Barber ID.</p>}
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
