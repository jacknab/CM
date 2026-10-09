// What a customer-facing tablet (check-in kiosk, customer screen) shows while the salon's Certxa
// account is suspended. It used to be a blank dark screen, which looked broken. Customers see that
// check-in is unavailable and to ask at the front desk; the line underneath is for the owner.
export default function KioskSuspendedScreen({ storeName }: { storeName?: string | null }) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-8 text-center select-none"
      style={{ background: "radial-gradient(ellipse at center, #1c1c1c 0%, #0a0a0a 100%)", WebkitUserSelect: "none" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-500" />
      <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl mb-8"
        style={{ background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
        ⚠️
      </div>
      {storeName && <p className="text-xl font-semibold text-zinc-400 mb-3">{storeName}</p>}
      <h1 className="text-5xl font-black text-white mb-5">Account Suspended</h1>
      <p className="text-2xl text-zinc-300 max-w-2xl leading-relaxed">
        Check-in is unavailable right now. Please see a team member at the front desk.
      </p>
      <p className="text-base text-zinc-500 mt-10 max-w-xl">
        Salon owner: sign in to Certxa to restore service. This screen returns to normal on its own once the account is active.
      </p>
    </div>
  );
}
