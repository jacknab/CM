/**
 * One booking on the Solo dashboard's calendar (owner, 2026-11-06): the Certxa Pro app's booking screen, without card
 * payments. Payment on the website is "Mark as paid" only — recorded as paid in cash, like the app's button, so it
 * reaches reports and loyalty. Checkout by card, refunds, fees, payment links and packages stay in the app.
 * A paid booking is locked (the server refuses changes to it too).
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { soloApi } from "@/lib/soloApi";
import { SOLO_COLORS } from "./SoloLayout";
import { at, clock, dayLabel, fromTimeValue, timeValue, type Day } from "./soloTime";
import { isOpen, isPrepaid, money, refreshSolo, type Booking } from "./soloBookings";
import { ErrorText, Field, inputClass, inputStyle, PrimaryButton, SecondaryButton, SoloModal } from "./soloUi";

const STATUS_TEXT: Record<string, string> = { paid: "Paid", started: "In progress", pending: "Booked", confirmed: "Booked", cancelled: "Cancelled", no_show: "No-show" };

type Step = null | "move" | "cancel" | "no-show" | "delete";

export default function SoloBookingPanel({ booking, tz, onClose, onBookAgain }: {
  booking: Booking; tz: string; onClose: () => void; onBookAgain: (b: Booking) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [day, setDay] = useState<Day>(booking.day);
  const [time, setTime] = useState(timeValue(booking.start));
  const [notify, setNotify] = useState(true);

  const open = isOpen(booking);
  const prepaid = isPrepaid(booking);

  const run = async (work: () => Promise<unknown>, after?: () => void) => {
    setBusy(true); setError("");
    try { await work(); await refreshSolo(qc); after?.(); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };

  // Mark as paid = paid in cash (or another way outside the app) for the visit's total; prepaid = done (the app's rule).
  const markPaid = () => run(() => soloApi(`/api/appointments/${booking.id}`, {
    method: "PATCH",
    body: {
      status: "completed", paymentMethod: prepaid ? "card" : "cash", totalPaid: (Math.max(0, booking.amountCents) / 100).toFixed(2),
      serviceRevenue: (Math.max(0, booking.amountCents - booking.travelFeeCents) / 100).toFixed(2), productRevenue: "0.00",
    },
  }));
  const move = () => run(() => soloApi(`/api/appointments/${booking.id}`, {
    method: "PATCH", body: { date: at(day, fromTimeValue(time), tz).toISOString(), duration: booking.duration, checkConflicts: true, ...(notify ? { notifyClient: true } : {}) },
  }), () => setStep(null));
  const cancel = (text: boolean) => run(async () => {
    const r = await soloApi<{ notification?: { status?: string } }>(`/api/appointments/${booking.id}/cancel`, { method: "POST", body: { notifyClient: text } });
    if (text && r?.notification?.status === "not_sent") setNotice("The booking is cancelled, but the text to the client could not be sent.");
  }, () => setStep(null));
  const noShow = () => run(() => soloApi(`/api/appointments/${booking.id}/no-show`, { method: "POST", body: {} }), () => setStep(null));
  const remove = () => run(() => soloApi(`/api/appointments/${booking.id}`, { method: "DELETE" }), onClose);

  const muted = { color: SOLO_COLORS.muted };
  const end = booking.start + booking.duration;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[rgba(17,21,46,0.25)]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl" data-testid="solo-booking-panel" aria-label="Booking">
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: SOLO_COLORS.border }}>
          <span className="rounded-full bg-[#F2F1F7] px-2.5 py-0.5 text-[11px] font-semibold text-[#6B6F86]" data-testid="solo-booking-status">
            {booking.depositDue && open ? "Deposit due" : STATUS_TEXT[booking.status] ?? "Booked"}
          </span>
          <button type="button" onClick={onClose} className="text-sm font-medium" style={muted}>Close</button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div>
            <h2 className="text-xl font-semibold" style={{ color: SOLO_COLORS.text }}>{booking.name}</h2>
            <p className="mt-0.5 text-sm" style={muted}>{booking.service}</p>
            {(booking.phone || booking.email) && (
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {booking.phone && <a href={`tel:${booking.phone}`} style={{ color: SOLO_COLORS.primary }}>{booking.phone}</a>}
                {booking.email && <a href={`mailto:${booking.email}`} style={{ color: SOLO_COLORS.primary }}>{booking.email}</a>}
              </p>
            )}
          </div>

          <dl className="space-y-2 rounded-xl bg-[#F7F5FD] p-4 text-sm">
            <div className="flex justify-between gap-3"><dt style={muted}>When</dt><dd className="text-right font-medium">{dayLabel(booking.day, { weekday: "short", month: "short", day: "numeric" })}, {clock(booking.start)} – {clock(end % 1440)}</dd></div>
            <div className="flex justify-between gap-3"><dt style={muted}>Length</dt><dd className="font-medium">{booking.duration} min</dd></div>
            {booking.address && <div className="flex justify-between gap-3"><dt style={muted}>Where</dt><dd className="text-right font-medium">{booking.address}</dd></div>}
            {booking.lines.map((l, i) => <div key={i} className="flex justify-between gap-3"><dt style={muted}>{l.label}</dt><dd>{money(l.cents)}</dd></div>)}
            <div className="flex justify-between gap-3 border-t pt-2" style={{ borderColor: SOLO_COLORS.border }}>
              <dt className="font-semibold">{booking.status === "paid" ? "Paid" : "Total"}</dt>
              <dd className="font-semibold" data-testid="solo-booking-total">{money(booking.status === "paid" && booking.paidCents != null ? booking.paidCents : booking.amountCents)}</dd>
            </div>
            {booking.depositPaidCents > 0 && booking.status !== "paid" && <div className="flex justify-between gap-3"><dt style={muted}>Deposit paid</dt><dd>{money(booking.depositPaidCents)}</dd></div>}
          </dl>

          {booking.notes && (
            <div>
              <p className="mb-1 text-xs font-semibold" style={muted}>Notes</p>
              <p className="whitespace-pre-wrap text-sm">{booking.notes}</p>
            </div>
          )}

          <ErrorText>{error}</ErrorText>
          {notice && <p className="text-sm" style={muted}>{notice}</p>}

          {open ? (
            <div className="space-y-2.5">
              <PrimaryButton onClick={markPaid} busy={busy && step === null} disabled={busy} testId="solo-mark-paid">
                {prepaid ? "Mark as done" : `Mark as paid · ${money(booking.amountCents)}`}
              </PrimaryButton>
              <SecondaryButton onClick={() => { setDay(booking.day); setTime(timeValue(booking.start)); setNotify(true); setError(""); setStep("move"); }} disabled={busy} testId="solo-change-time">Change time</SecondaryButton>
              <div className="grid grid-cols-2 gap-2.5">
                <SecondaryButton onClick={() => { setError(""); setStep("no-show"); }} disabled={busy} testId="solo-no-show">No-show</SecondaryButton>
                <SecondaryButton onClick={() => { setError(""); setStep("cancel"); }} disabled={busy} danger testId="solo-cancel">Cancel booking</SecondaryButton>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {booking.status === "paid" && <p className="text-sm" style={muted}>This booking is paid, so it is locked. Refunds are in the Certxa Pro app.</p>}
              {booking.customerId && <PrimaryButton onClick={() => onBookAgain(booking)} testId="solo-book-again">Book again</PrimaryButton>}
              {(booking.status === "no_show" || booking.status === "cancelled") && (
                <SecondaryButton onClick={() => { setError(""); setStep("delete"); }} disabled={busy} danger testId="solo-delete">Delete booking</SecondaryButton>
              )}
            </div>
          )}
        </div>
      </aside>

      {step === "move" && (
        <SoloModal title="Change time" onClose={() => !busy && setStep(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Day"><input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className={inputClass} style={inputStyle} data-testid="solo-move-day" /></Field>
              <Field label="Time"><input type="time" step={300} value={time} onChange={(e) => e.target.value && setTime(e.target.value)} className={inputClass} style={inputStyle} data-testid="solo-move-time" /></Field>
            </div>
            <NotifyToggle value={notify} onChange={setNotify} />
            <ErrorText>{error}</ErrorText>
            <PrimaryButton onClick={move} busy={busy} testId="solo-move-save">Move booking</PrimaryButton>
            <button type="button" onClick={() => setStep(null)} className="w-full py-1 text-sm font-medium text-gray-500">Keep the time</button>
          </div>
        </SoloModal>
      )}
      {step === "cancel" && (
        <SoloModal title="Cancel this booking?" onClose={() => !busy && setStep(null)}>
          <p className="mb-4 text-sm" style={muted}>{booking.name} · {booking.service}</p>
          <div className="space-y-2.5">
            <ErrorText>{error}</ErrorText>
            <SecondaryButton onClick={() => cancel(true)} disabled={busy} danger testId="solo-cancel-text">Cancel and text the client</SecondaryButton>
            <SecondaryButton onClick={() => cancel(false)} disabled={busy} danger testId="solo-cancel-quiet">Cancel without a text</SecondaryButton>
            <button type="button" onClick={() => setStep(null)} className="w-full py-1 text-sm font-medium text-gray-500">Keep the booking</button>
          </div>
        </SoloModal>
      )}
      {step === "no-show" && (
        <SoloModal title="Mark as no-show?" onClose={() => !busy && setStep(null)}>
          <p className="mb-4 text-sm" style={muted}>{booking.name} didn't come to their {booking.service.toLowerCase()}.</p>
          <div className="space-y-2.5">
            <ErrorText>{error}</ErrorText>
            <PrimaryButton onClick={noShow} busy={busy} testId="solo-no-show-confirm">Mark as no-show</PrimaryButton>
            <button type="button" onClick={() => setStep(null)} className="w-full py-1 text-sm font-medium text-gray-500">Not now</button>
          </div>
        </SoloModal>
      )}
      {step === "delete" && (
        <SoloModal title="Delete this booking?" onClose={() => !busy && setStep(null)}>
          <p className="mb-4 text-sm" style={muted}>{booking.name}'s {booking.service.toLowerCase()} is removed for good.</p>
          <div className="space-y-2.5">
            <ErrorText>{error}</ErrorText>
            <SecondaryButton onClick={remove} busy={busy} danger testId="solo-delete-confirm">Delete booking</SecondaryButton>
            <button type="button" onClick={() => setStep(null)} className="w-full py-1 text-sm font-medium text-gray-500">Keep it</button>
          </div>
        </SoloModal>
      )}
    </div>
  );
}

export function NotifyToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span>
        <span className="block text-sm font-semibold">Notify client</span>
        <span className="block text-xs" style={{ color: SOLO_COLORS.muted }}>Text the client the new day and time.</span>
      </span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-[#7C3AED]" data-testid="solo-notify" />
    </label>
  );
}
