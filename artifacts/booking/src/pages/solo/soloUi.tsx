/** Small building blocks the Solo dashboard's pages share: a dialog, buttons and fields in its own colours. */
import { useEffect, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { SOLO_COLORS } from "./SoloLayout";

export function SoloModal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(17,21,46,0.42)] sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl ${wide ? "sm:max-w-lg" : "sm:max-w-md"}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold" style={{ color: SOLO_COLORS.text }}>{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="-m-1 rounded-lg p-1 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

type ButtonProps = { children: ReactNode; onClick?: () => void; disabled?: boolean; busy?: boolean; type?: "button" | "submit"; testId?: string };

export function PrimaryButton({ children, onClick, disabled, busy, type = "button", testId }: ButtonProps) {
  return (
    <button type={type} data-testid={testId} onClick={onClick} disabled={disabled || busy}
      className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      style={{ background: SOLO_COLORS.primary }}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, disabled, busy, type = "button", testId, danger = false }: ButtonProps & { danger?: boolean }) {
  return (
    <button type={type} data-testid={testId} onClick={onClick} disabled={disabled || busy}
      className={`flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60 ${danger ? "text-red-600" : ""}`}
      style={{ borderColor: SOLO_COLORS.border, color: danger ? undefined : SOLO_COLORS.text }}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold" style={{ color: SOLO_COLORS.muted }}>{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED]";
export const inputStyle = { borderColor: SOLO_COLORS.border, color: SOLO_COLORS.text };

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="text-sm text-red-600" role="alert">{children}</p> : null;
}
