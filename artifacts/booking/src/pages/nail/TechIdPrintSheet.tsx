import { useCallback, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Printer, QrCode, X, AlertCircle, CheckCircle } from "lucide-react";
import { buildTechIdSlip, buildQrConfirmationSlip } from "@/lib/thermalPrinter";
import { printNativeTechId } from "@/lib/native-tech-id";

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
  onClose,
}: {
  techs: PrintableTech[];
  keypadVisible: boolean;
  savingKeypad: boolean;
  onKeypadVisibleChange: (visible: boolean) => void;
  thermalPrint?: (bytes: Uint8Array) => Promise<void>;
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

  const printTechId = async () => {
    if (!selected || techId == null || printing) return;
    setPrinting(true);
    setMessage("");
    try {
      const printedNatively = await printNativeTechId({ id: techId, name: selected.name });
      if (!printedNatively) {
        if (!thermalPrint) throw new Error("Connect the receipt printer from the Manager menu, then try again.");
        await thermalPrint(buildTechIdSlip({ id: techId, name: selected.name }));
      }
      setMessage(`Printed ${selected.name}'s Tech ID.`);
    } catch (error: any) {
      setMessage(error?.message || "Could not print this Tech ID.");
    } finally {
      setPrinting(false);
    }
  };

  const generateQrConfirmation = useCallback(async () => {
    if (!thermalPrint) {
      setMessage("Connect the receipt printer from the Manager menu, then try again.");
      return;
    }
    try {
      setMessage("Generating QR code…");
      const res = await fetch("/api/nail/qr-code/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setting: "keypadHide" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not generate QR code");
      setQrConfirmation({ token: data.token, expiresAt: data.expiresAt, printing: true, message: "Printing QR code…" });
      await thermalPrint(buildQrConfirmationSlip({ storeName: "Salon", token: data.token, setting: "Hide Keypad" }));
      setQrConfirmation((prev) => prev ? { ...prev, printing: false, message: "QR code printed. Scan it to confirm." } : null);
    } catch (error: any) {
      setQrConfirmation(null);
      setMessage(error?.message || "Could not generate QR code.");
    }
  }, [thermalPrint]);

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
            <h2 id="tech-id-print-title" className="text-xl font-bold">Print Tech ID</h2>
            <p className="mt-1 text-sm text-slate-400">Print a scanner badge for the selected technician.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800" aria-label="Close"><X /></button>
        </header>

        {qrConfirmation ? (
          // QR Confirmation Flow
          <div className="flex flex-col flex-1 p-5">
            <div className="mb-4 text-center">
              <AlertCircle className="h-12 w-12 text-amber-400 mx-auto" />
              <h3 className="mt-3 text-xl font-bold">Confirm Keypad Hide</h3>
              <p className="mt-2 text-slate-300">A QR code has been printed. Scan it with the lock screen scanner to confirm hiding the keypad.</p>
              <p className="mt-1 text-xs text-slate-500">The QR code expires in 5 minutes.</p>
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
                  <p className="font-semibold">Show keypad on lock screen</p>
                  <p className="mt-0.5 text-xs text-slate-400">When hidden, technicians must scan their printed ID.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={keypadVisible}
                  disabled={savingKeypad}
                  onClick={() => handleKeypadToggle(!keypadVisible)}
                  className={`relative h-8 w-14 shrink-0 rounded-full transition ${keypadVisible ? "bg-emerald-500" : "bg-slate-600"} disabled:opacity-60`}
                  data-testid="tech-id-keypad-toggle"
                >
                  <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${keypadVisible ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-h-0 overflow-y-auto border-b border-slate-700 p-5 md:border-b-0 md:border-r">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Choose technician</p>
                {list.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">No active technicians have a Tech ID.</p>
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
                    <div className="rounded-xl border-4 border-slate-950 bg-white p-3"><QRCodeSVG value={qrValue} size={190} level="M" marginSize={0} /></div>
                    <p className="mt-4 text-center text-2xl font-black">{selected.name}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-500"><QrCode className="h-3.5 w-3.5" /> Tech ID {techId}</p>
                    <button type="button" disabled={printing} onClick={() => void printTechId()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 font-bold text-white hover:bg-slate-800 disabled:opacity-60" data-testid="print-tech-id">
                      {printing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
                      {printing ? "Printing…" : "Print Tech ID"}
                    </button>
                    {message && <p className="mt-3 text-center text-sm font-semibold" role="status">{message}</p>}
                  </>
                ) : <p className="text-center text-sm text-slate-500">Choose a technician with a Tech ID.</p>}
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
