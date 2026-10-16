// Moved out of pages/Calendar.tsx so the /nail and /barber staff screens don't load the whole calendar.
import { useState, useEffect, useRef, useCallback } from "react";
import { checkManagerPin } from "@/lib/managerPin";
import { Button } from "@/components/ui/button";
import { ArrowLeft, X, Delete } from "lucide-react";

/**
 * Asks for the salon's manager PIN, which the server checks (lib/managerPin.ts). `onSuccess` gets the PIN,
 * for actions the server approves with it again (a turn adjustment).
 */
export function ManagerPinSheet({ onClose, onSuccess, title = "Manager Access" }: { onClose: () => void; onSuccess: (pin: string) => void; title?: string }) {
  const [digits, setDigits] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDigit = useCallback((digit: string) => {
    if (digits.length < 4) {
      setErrorMsg(null);
      setDigits((prev) => prev + digit);
    }
  }, [digits]);

  const handleBackspace = useCallback(() => {
    setDigits((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  }, []);

  // The latest onSuccess, so a parent re-rendering mid-check does not send the PIN to the server again.
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  useEffect(() => {
    if (digits.length !== 4) return;
    let cancelled = false;
    void checkManagerPin(digits)
      .then((result) => {
        if (cancelled) return;
        if (result === "ok") { onSuccessRef.current(digits); return; }
        setErrorMsg(result === "locked" ? "Too many wrong PINs. Wait a few minutes." : "Incorrect PIN.");
        setDigits("");
      })
      .catch(() => { if (!cancelled) { setErrorMsg("Couldn't check the PIN. Try again."); setDigits(""); } });
    return () => { cancelled = true; };
  }, [digits]);

  const numKeys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["blank", "0", "backspace"],
  ];

  return (
    <div className="dark cx-cal fixed inset-0 z-50 text-foreground" data-testid="manager-pin-sheet">
      <button
        type="button"
        aria-label="Close manager PIN"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[380px] bg-[#161618] flex flex-col shadow-[-8px_0_24px_rgba(0,0,0,0.12)] border-l">
        {/* Header */}
        <div className="px-4 py-4 flex items-center justify-between gap-2 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-base text-gray-900">{title}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div
          className="flex-1 flex flex-col px-4 pt-5 min-h-0 bg-[#161618] md:pb-4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
        >
          <div className="w-full rounded-2xl bg-white border border-gray-200 shadow-sm py-6 px-4 mb-5 text-center">
            {digits.length > 0 ? (
              <p className="text-4xl font-bold tracking-widest text-primary">{"•".repeat(digits.length)}</p>
            ) : (
              <p className="text-2xl font-medium text-muted-foreground/40">Enter manager PIN</p>
            )}
            {errorMsg && (
              <p className="text-sm text-red-500 mt-2 font-medium">{errorMsg}</p>
            )}
          </div>

          {/* Numpad */}
          <div className="flex-1 flex flex-col gap-2 justify-end">
            {numKeys.map((row, ri) => (
              <div key={ri} className="grid grid-cols-3 gap-2">
                {row.map((key) => {
                  if (key === "blank") {
                    return <div key="blank" />;
                  }
                  if (key === "backspace") {
                    return (
                      <button
                        key="backspace"
                        type="button"
                        onPointerDown={e => e.preventDefault()}
                        onClick={handleBackspace}
                        className="h-[68px] rounded-2xl bg-white border border-gray-200 shadow-sm text-muted-foreground flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform"
                      >
                        <Delete className="w-5 h-5" />
                      </button>
                    );
                  }
                  return (
                    <button
                      key={key}
                      type="button"
                      onPointerDown={e => e.preventDefault()}
                      onClick={() => handleDigit(key)}
                      className="h-[68px] rounded-2xl bg-white border border-gray-200 shadow-sm text-2xl font-semibold text-foreground flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform"
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
