// Moved out of pages/Calendar.tsx so the /nail and /barber staff screens don't load the whole calendar.
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useSelectedStore } from "@/hooks/use-store";
import { formatInTz } from "@/lib/timezone";
import { ArrowLeft, X, Loader2, Check, Delete, PersonStanding } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { techLabel } from "@/pages/nail/techName";

export function TimeClockSheet({ storeId, onClose }: { storeId: number; onClose: () => void }) {
  const { pick } = useLanguage();
  const queryClient = useQueryClient();
  const { selectedStore: _tcStore } = useSelectedStore();
  const timezone = _tcStore?.timezone || "UTC";
  const tTC = {
    inOut:      pick({ en: "In/Out",                   vi: "Vào/Ra",                    es: "Entrada/Salida",           fr: "Entrée/Sortie" }),
    enterPin:   pick({ en: "Enter PIN",                vi: "Nhập mã PIN",               es: "Ingresar PIN",             fr: "Entrer le PIN" }),
    pinHint:    pick({ en: "3–4 digit numeric PIN",    vi: "Mã PIN 3–4 chữ số",         es: "PIN numérico de 3–4 dígitos", fr: "PIN numérique de 3–4 chiffres" }),
    done:       pick({ en: "DONE",                     vi: "XONG",                      es: "LISTO",                    fr: "TERMINÉ" }),
    closingIn:  (s: number) => pick({ en: `Closing in ${s}s…`, vi: `Đóng sau ${s}s…`, es: `Cerrando en ${s}s…`, fr: `Fermeture dans ${s}s…` }),
    diffPin:    pick({ en: "Use a different PIN",      vi: "Dùng mã PIN khác",          es: "Usar un PIN diferente",    fr: "Utiliser un autre PIN" }),
  };
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [staff, setStaff] = useState<{ id: number; name: string; color?: string | null; avatarUrl?: string | null } | null>(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockTime, setClockTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [autoCloseCountdown, setAutoCloseCountdown] = useState<number | null>(null);

  const MAX_PIN_LENGTH = 4;

  // Start a 20-second auto-close countdown whenever a clock action completes
  useEffect(() => {
    if (!staff || !successMsg) return;
    setAutoCloseCountdown(20);
    const interval = setInterval(() => {
      setAutoCloseCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          onClose();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [staff, clockedIn]);

  const handleDigit = useCallback((digit: string) => {
    if (staff) return; // lock input after verified
    setPin((prev) => (prev.length < MAX_PIN_LENGTH ? prev + digit : prev));
    setPinError("");
  }, [staff]);

  const handleBackspace = useCallback(() => {
    if (staff) return;
    setPin((prev) => prev.slice(0, -1));
    setPinError("");
  }, [staff]);

  const handleSubmitPin = useCallback(async () => {
    if (pin.length < 3) {
      setPinError("PIN must be 3 or 4 digits");
      return;
    }
    if (loading) return;
    setLoading(true);
    setPinError("");
    try {
      const res = await fetch("/api/timeclock/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, pin }),
      });
      if (!res.ok) {
        const err = await res.json();
        setPinError(err.error || "Invalid PIN");
        setPin("");
        return;
      }
      const data = await res.json();
      setStaff(data.staff);

      // Check current clock status then auto-toggle
      let isClockedIn = false;
      const statusRes = await fetch(`/api/timeclock/status/${data.staff.id}?storeId=${storeId}`, {
        credentials: "include",
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        isClockedIn = statusData.clockedIn;
        setClockedIn(isClockedIn);
      }

      // Auto-toggle: clock in if not clocked in, clock out if already clocked in
      if (!isClockedIn) {
        await performClockIn(data.staff.id);
      } else {
        await performClockOut(data.staff.id);
      }
    } catch {
      setPinError("Network error. Please try again.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }, [pin, storeId, loading]);

  const performClockIn = useCallback(async (staffId: number) => {
    setLoading(true);
    try {
      const res = await fetch("/api/timeclock/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, staffId }),
      });
      if (!res.ok) {
        const err = await res.json();
        if (err.error === "Already clocked in") {
          setClockedIn(true);
          return;
        }
        setPinError(err.error || "Failed to clock in");
        return;
      }
      const data = await res.json();
      setClockedIn(true);
      const time = new Date(data.record.clockIn);
      setClockTime(formatInTz(time, timezone, "h:mm a"));
      setSuccessMsg("Clocked In");
      // Immediately refresh the Turn queue so the newly clocked-in tech appears
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", storeId] });
      window.dispatchEvent(new CustomEvent("turn-eligibility-changed"));
    } catch {
      setPinError("Failed to clock in");
    } finally {
      setLoading(false);
    }
  }, [storeId, queryClient]);

  const performClockOut = useCallback(async (staffId: number) => {
    setLoading(true);
    try {
      const res = await fetch("/api/timeclock/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, staffId }),
      });
      if (!res.ok) {
        const err = await res.json();
        setPinError(err.error || "Failed to clock out");
        return;
      }
      const data = await res.json();
      setClockedIn(false);
      const time = new Date(data.record.clockOut);
      setClockTime(formatInTz(time, timezone, "h:mm a"));
      setSuccessMsg("Clocked Out");
      // Immediately remove the clocked-out tech from the Turn queue
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", storeId] });
      window.dispatchEvent(new CustomEvent("turn-eligibility-changed"));
    } catch {
      setPinError("Failed to clock out");
    } finally {
      setLoading(false);
    }
  }, [storeId, queryClient]);

  const handleClockToggle = useCallback(() => {
    if (!staff) return;
    if (clockedIn) {
      performClockOut(staff.id);
    } else {
      performClockIn(staff.id);
    }
  }, [staff, clockedIn, performClockIn, performClockOut]);

  const handleReset = useCallback(() => {
    setStaff(null);
    setPin("");
    setPinError("");
    setClockedIn(false);
    setClockTime("");
    setSuccessMsg("");
  }, []);

  const numKeys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["enter", "0", "backspace"],
  ];

  return (
    <div className="dark cx-cal fixed inset-0 z-[100] text-foreground">
      <button
        type="button"
        aria-label="Close time clock"
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
            <span className="font-semibold text-base text-gray-900">{tTC.inOut}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col px-4 pt-5 min-h-0 bg-[#161618] pb-[calc(env(safe-area-inset-bottom,0px)+72px)]">
          {/* Staff info + PIN display */}
          <div className="w-full rounded-2xl bg-white border border-gray-200 shadow-sm py-6 px-4 mb-5 text-center">
            {staff ? (
              <>
                <p className="text-lg font-bold text-gray-900">{techLabel(staff.name, staff.id)}</p>
                {successMsg ? (
                  <p className="text-3xl font-bold mt-2" style={{ color: clockedIn ? "#22c55e" : "#ef4444" }}>
                    {successMsg}
                    {clockTime && <span className="block text-base font-normal text-gray-500 mt-1">{clockTime}</span>}
                  </p>
                ) : (
                  <div className="mt-2">
                    {loading ? (
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                    ) : (
                      <>
                        <Button
                          onClick={onClose}
                          className="mt-4 w-full rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-base font-bold py-3 h-auto"
                        >
                          {tTC.done}
                        </Button>
                        {autoCloseCountdown !== null && (
                          <p className="mt-2 text-xs text-gray-400">
                            {tTC.closingIn(autoCloseCountdown)}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={handleReset}
                          className="block mt-3 mx-auto text-xs text-gray-400 underline hover:text-gray-600"
                        >
                          {tTC.diffPin}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-gray-900">
                  {pin.length > 0 ? "●".repeat(pin.length) : tTC.enterPin}
                </p>
                <p className="text-sm text-gray-400 mt-1 flex items-center justify-center gap-1.5">
                  {tTC.pinHint}
                </p>
                {pinError && (
                  <p className="text-sm text-red-500 mt-2 font-medium">{pinError}</p>
                )}
              </>
            )}
          </div>

          {/* Numpad */}
          {!staff && (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              {numKeys.map((row, ri) => (
                <div key={ri} className="flex gap-3 flex-1">
                  {row.map((key) => {
                    if (key === "enter") {
                      return (
                        <button
                          key={key}
                          type="button"
                          onPointerDown={e => e.preventDefault()}
                          onClick={handleSubmitPin}
                          disabled={pin.length < 3 || loading}
                          className="flex-1 rounded-2xl bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {loading ? (
                            <Loader2 className="w-7 h-7 animate-spin" />
                          ) : (
                            <PersonStanding className="w-7 h-7" />
                          )}
                        </button>
                      );
                    }
                    if (key === "backspace") {
                      return (
                        <button
                          key={key}
                          type="button"
                          onPointerDown={e => e.preventDefault()}
                          onClick={handleBackspace}
                          className="flex-1 rounded-2xl bg-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-300 active:scale-95 transition-all"
                        >
                          <Delete className="w-7 h-7" />
                        </button>
                      );
                    }
                    return (
                      <button
                        key={key}
                        type="button"
                        onPointerDown={e => e.preventDefault()}
                        onClick={() => handleDigit(key)}
                        className="flex-1 rounded-2xl bg-white text-3xl font-bold text-gray-900 shadow-sm border border-gray-100 hover:bg-gray-50 active:scale-95 transition-all"
                      >
                        {key}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
