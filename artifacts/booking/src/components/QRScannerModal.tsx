import { useEffect, useRef, useState } from "react";
import { isMobileDevice } from "@/lib/device";
import { X, Keyboard, RefreshCw } from "lucide-react";

// Detect if we're running inside the Certxa Staff native app WebView
const isNativeApp = (): boolean =>
  typeof window !== "undefined" &&
  (window as any).CERTXA_STAFF_APP === true &&
  typeof (window as any).ReactNativeWebView !== "undefined";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAppointmentFound?: (appointmentId: number) => void;
}

export function QRScannerModal({ isOpen, onClose, onAppointmentFound }: Props) {
  const [isMobile] = useState(() => isMobileDevice());
  const [isNative] = useState(() => isNativeApp());
  const [manualCode, setManualCode] = useState("");
  const [isLooking, setIsLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [scanKey, setScanKey] = useState(0);
  const scannerRef = useRef<any>(null);
  const hasScanned = useRef(false);
  const scannerStopped = useRef(false);

  const stopScanner = () => {
    if (scannerRef.current && !scannerStopped.current) {
      scannerStopped.current = true;
      try {
        scannerRef.current.stop();
      } catch {
        // already stopped or not started
      }
    }
    scannerRef.current = null;
  };

  // ── Native app bridge ────────────────────────────────────────────────────────
  // When running inside the Certxa Staff native WebView, delegate scanning to
  // the native QR scanner. We post SCAN_QR, register a one-shot result callback,
  // and wait. The native layer injects the decoded token via __certxaQRResult().
  useEffect(() => {
    if (!isOpen || !isNative) return;

    const rn = (window as any).ReactNativeWebView;
    rn.postMessage(JSON.stringify({ type: 'SCAN_QR' }));

    (window as any).__certxaQRResult = (token: string) => {
      delete (window as any).__certxaQRResult;
      delete (window as any).__certxaQRCancel;
      lookupToken(token);
    };

    (window as any).__certxaQRCancel = () => {
      delete (window as any).__certxaQRResult;
      delete (window as any).__certxaQRCancel;
      handleClose();
    };

    return () => {
      // If the modal unmounts before a result, cancel the native scanner
      if ((window as any).__certxaQRResult) {
        rn.postMessage(JSON.stringify({ type: 'SCAN_QR_CANCEL' }));
        delete (window as any).__certxaQRResult;
        delete (window as any).__certxaQRCancel;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isNative]);

  const lookupToken = async (token: string) => {
    if (hasScanned.current) return;
    hasScanned.current = true;
    setIsLooking(true);
    setError(null);
    setLookupFailed(false);
    try {
      const res = await fetch("/api/qr/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrToken: token.trim() }),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Booking not found");
      }
      const data = await res.json();
      // Immediately open booking detail sheet and close scanner
      if (onAppointmentFound && data.appointmentId) {
        onAppointmentFound(data.appointmentId);
      }
      handleClose();
    } catch (err: any) {
      setError(err.message ?? "Could not find booking");
      setLookupFailed(true);
      hasScanned.current = false;
    } finally {
      setIsLooking(false);
    }
  };

  const handleScanAgain = () => {
    setError(null);
    setLookupFailed(false);
    hasScanned.current = false;
    setScanKey(k => k + 1);
  };

  useEffect(() => {
    if (!isOpen || !isMobile) return;

    let html5QrCode: any = null;
    hasScanned.current = false;
    scannerStopped.current = false;
    setScannerReady(false);
    setError(null);
    setLookupFailed(false);

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        html5QrCode = new Html5Qrcode("qr-reader-viewport");
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            stopScanner();
            lookupToken(decodedText);
          },
          () => {}
        );
        setScannerReady(true);
      } catch {
        setError("Camera access denied. Please allow camera permission and try again.");
      }
    })();

    return () => {
      stopScanner();
      if (html5QrCode) {
        try { html5QrCode.clear(); } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isMobile, scanKey]);

  const handleClose = () => {
    stopScanner();
    hasScanned.current = false;
    setError(null);
    setLookupFailed(false);
    setManualCode("");
    setIsLooking(false);
    setScanKey(0);
    onClose();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) lookupToken(manualCode.trim());
  };

  if (!isOpen) return null;

  // ── Native app: show a thin loading veil while native scanner opens ──────────
  if (isNative) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black">
        {isLooking ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-[#19c37d] border-t-transparent rounded-full animate-spin" />
            <p className="text-white text-sm font-medium">Opening booking…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 px-6">
            <p className="text-white text-sm text-center">{error}</p>
            {lookupFailed && (
              <button
                onClick={() => {
                  setError(null);
                  setLookupFailed(false);
                  hasScanned.current = false;
                  const rn = (window as any).ReactNativeWebView;
                  rn?.postMessage(JSON.stringify({ type: 'SCAN_QR' }));
                }}
                className="flex items-center gap-2 h-10 px-5 rounded-lg bg-white/20 text-white font-semibold text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Scan Again
              </button>
            )}
            <button onClick={handleClose} className="text-white/50 text-sm mt-1">Cancel</button>
          </div>
        ) : (
          /* Transparent — the native modal sits on top */
          <div />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {isMobile ? (
        <>
          {/* Camera viewport */}
          <div className="relative flex-1 bg-black">
            <div id="qr-reader-viewport" className="w-full h-full" />

            {/* Loading camera */}
            {!scannerReady && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
                  <p className="text-white text-sm">Starting camera…</p>
                </div>
              </div>
            )}

            {/* Scan frame corners */}
            {scannerReady && !isLooking && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-60 h-60">
                  <span className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-[#19c37d] rounded-tl-lg" />
                  <span className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-[#19c37d] rounded-tr-lg" />
                  <span className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-[#19c37d] rounded-bl-lg" />
                  <span className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-[#19c37d] rounded-br-lg" />
                  <span className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-0.5 bg-[#19c37d] opacity-80 animate-pulse" />
                </div>
              </div>
            )}

            {/* Looking up spinner */}
            {isLooking && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-[#19c37d] border-t-transparent rounded-full animate-spin" />
                  <p className="text-white text-sm font-medium">Opening booking…</p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="absolute bottom-32 left-4 right-4">
                <div className="bg-red-500/90 backdrop-blur rounded-xl p-4 text-white text-sm text-center">
                  {error}
                  {lookupFailed && (
                    <button
                      onClick={handleScanAgain}
                      className="mt-3 mx-auto flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-white/20 hover:bg-white/30 active:bg-white/40 font-semibold text-sm transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Scan Again
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div
            className="flex-shrink-0 bg-black flex items-center justify-between px-6"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)", paddingTop: 16 }}
          >
            <p className="text-white/60 text-sm">Point camera at QR code</p>
            <button
              onClick={handleClose}
              className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </>
      ) : (
        /* Desktop: manual code entry */
        <div className="flex-1 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl relative">
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-slate-600" />
            </button>

            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-[#19c37d]/10 flex items-center justify-center mb-4">
                <Keyboard className="w-8 h-8 text-[#19c37d]" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 text-center">QR Scanner</h2>
              <p className="text-sm text-slate-500 text-center mt-1">
                QR scanning requires a mobile device. Enter the booking code manually:
              </p>
            </div>

            <form onSubmit={handleManualSubmit} className="flex flex-col gap-3">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="e.g. BK829384 or appointment ID"
                className="w-full h-12 px-4 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#19c37d]/40 focus:border-[#19c37d]"
                autoFocus
              />
              {error && <p className="text-red-500 text-xs text-center">{error}</p>}
              <button
                type="submit"
                disabled={!manualCode.trim() || isLooking}
                className="h-12 rounded-xl bg-[#19c37d] text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLooking ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Opening booking…
                  </>
                ) : (
                  "Look Up Booking"
                )}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="h-10 rounded-xl bg-slate-100 text-slate-600 font-semibold text-sm"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
