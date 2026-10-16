// Moved out of pages/Calendar.tsx so the /nail and /barber staff screens don't load the whole calendar.
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, X, Delete } from "lucide-react";

// Manual-entry alternative to the barcode-scanner voucher redemption
// (handleQRScan's "voucher" branch) — for stores with no physical scanner.
// Staff type only the last 7 digits of the voucher code (the random secret
// portion — see generateVoucherCode in stripeWebhook.ts); the lookup itself
// is scoped server-side to the staff's own store, so a code typed here can
// never resolve to a different store's voucher.
export function VoucherRedeemSheet({ onClose, onRedeemed }: { onClose: () => void; onRedeemed: (appointmentId: number) => void }) {
  const [digits, setDigits] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDigit = useCallback((digit: string) => {
    if (digits.length < 7) {
      setSubmitted(false);
      setErrorMsg(null);
      setDigits((prev) => prev + digit);
    }
  }, [digits]);

  const handleBackspace = useCallback(() => {
    setDigits((prev) => prev.slice(0, -1));
    setSubmitted(false);
    setErrorMsg(null);
  }, []);

  useEffect(() => {
    if (digits.length !== 7 || submitted) return;
    setSubmitted(true);
    setIsSubmitting(true);
    setErrorMsg(null);
    fetch("/api/qr/redeem-voucher", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manualCode: digits }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        setIsSubmitting(false);
        if (!res.ok) {
          setErrorMsg(data.error ?? "Could not redeem this voucher.");
          return;
        }
        onRedeemed(data.appointmentId);
      })
      .catch(() => {
        setIsSubmitting(false);
        setErrorMsg("Connection error. Please try again.");
      });
  }, [digits, submitted, onRedeemed]);

  const numKeys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["blank", "0", "backspace"],
  ];

  return (
    <div className="dark cx-cal fixed inset-0 z-50 text-foreground" data-testid="voucher-redeem-sheet">
      <button
        type="button"
        aria-label="Close voucher redeem"
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
            <span className="font-semibold text-base text-gray-900">Redeem Voucher</span>
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
              <p className="text-4xl font-bold tracking-widest text-primary">{digits}</p>
            ) : (
              <p className="text-2xl font-medium text-muted-foreground/40">Last 7 digits</p>
            )}
            {isSubmitting && (
              <p className="text-sm text-muted-foreground mt-2 animate-pulse">Checking...</p>
            )}
            {errorMsg && !isSubmitting && (
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
