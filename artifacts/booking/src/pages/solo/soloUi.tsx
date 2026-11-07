/** Small building blocks the Solo dashboard's pages share: a dialog, buttons and fields in its own colours. */
import { useEffect, useState, type ReactNode } from "react";
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

export function Toggle({ title, hint, value, onChange, testId }: { title: string; hint?: string; value: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span>
        <span className="block text-sm font-semibold" style={{ color: SOLO_COLORS.text }}>{title}</span>
        {hint && <span className="block text-xs" style={{ color: SOLO_COLORS.muted }}>{hint}</span>}
      </span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#7C3AED]" data-testid={testId} />
    </label>
  );
}

/** A list of things to tick (the services an add-on goes with, what a package holds, …). */
export function Checklist({ items, picked, onToggle, empty, testId, disabled = false }: {
  items: { id: number; title: string; hint?: string }[]; picked: number[]; onToggle: (id: number) => void; empty: string; testId: string; disabled?: boolean;
}) {
  if (items.length === 0) return <p className="text-sm" style={{ color: SOLO_COLORS.muted }}>{empty}</p>;
  return (
    <ul className="max-h-56 divide-y overflow-y-auto rounded-xl border" style={{ borderColor: SOLO_COLORS.border }}>
      {items.map((it) => (
        <li key={it.id}>
          <label className={`flex items-center gap-3 px-3 py-2 text-sm ${disabled ? "" : "cursor-pointer hover:bg-gray-50"}`}>
            <input type="checkbox" checked={picked.includes(it.id)} disabled={disabled} onChange={() => onToggle(it.id)} className="h-4 w-4 accent-[#7C3AED]" data-testid={`${testId}-${it.id}`} />
            <span className="min-w-0 flex-1 truncate">{it.title}</span>
            {it.hint && <span className="shrink-0 text-xs" style={{ color: SOLO_COLORS.muted }}>{it.hint}</span>}
          </label>
        </li>
      ))}
    </ul>
  );
}

/** Reads a picked photo as a data URL (what the app sends), refusing anything that isn't a JPEG or PNG or is too big. */
export function readPhoto(file: File, maxBytes = 6_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!["image/jpeg", "image/png"].includes(file.type)) return reject(new Error("Choose a JPEG or PNG photo."));
    if (file.size > maxBytes) return reject(new Error("That photo is too big. Choose one under 6 MB."));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That photo could not be read. Try another one."));
    reader.readAsDataURL(file);
  });
}

export function PhotoField({ label, uri, onPick, onRemove, testId }: { label: string; uri: string | null; onPick: (dataUrl: string) => void; onRemove: () => void; testId: string }) {
  const [error, setError] = useState("");
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold" style={{ color: SOLO_COLORS.muted }}>{label}</span>
      <div className="flex items-center gap-3">
        {uri ? <img src={uri} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <div className="h-16 w-16 rounded-xl bg-[#F2F1F7]" />}
        <label className="cursor-pointer text-sm font-semibold" style={{ color: SOLO_COLORS.primary }}>
          {uri ? "Change photo" : "Choose photo"}
          <input type="file" accept="image/jpeg,image/png" className="hidden" data-testid={testId}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readPhoto(f).then((d) => { setError(""); onPick(d); }).catch((err) => setError(err.message)); }} />
        </label>
        {uri && <button type="button" onClick={onRemove} className="text-sm font-medium" style={{ color: SOLO_COLORS.muted }}>Remove</button>}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

export const minutesLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
export const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
