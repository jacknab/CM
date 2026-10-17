// What a customer-facing tablet (check-in kiosk, customer screen) shows while the salon's Certxa
// account is suspended. Clients see it, so it is discreet (owner's wish, 2026-10-17): no mention of the
// account, billing or a warning — only that check-in is unavailable and to ask at the front desk.
export default function KioskSuspendedScreen({ storeName }: { storeName?: string | null }) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-8 text-center select-none"
      style={{ background: "radial-gradient(ellipse at center, #1c1c1c 0%, #0a0a0a 100%)", WebkitUserSelect: "none" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {storeName && <p className="text-xl font-semibold text-zinc-400 mb-3">{storeName}</p>}
      <h1 className="text-5xl font-black text-white mb-5">Check-in unavailable</h1>
      <p className="text-2xl text-zinc-300 max-w-2xl leading-relaxed">
        Please see a team member at the front desk.
      </p>
    </div>
  );
}
