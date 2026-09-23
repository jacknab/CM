import { useState } from "react";
import { Gift, X } from "lucide-react";
import { lookupGiftCard, type GiftCardInfo } from "./nailApi";

type Step = "menu" | "balance" | "redeem";

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * The Gift Card button on the ticket screen — the checkout's Functions → Gift Card menu, moved here.
 * Sell Gift Card is still "coming soon" (as in checkout). Check Balance looks a card up. Redeem looks it up too, but taking a gift card
 * as payment only exists at checkout (there is no payment on a ticket that is still being built), so it says where to do that.
 */
export function GiftCardSheet({ onClose, onSay }: { onClose: () => void; onSay: (text: string) => void }) {
  const [step, setStep] = useState<Step>("menu");
  const [code, setCode] = useState("");
  const [card, setCard] = useState<GiftCardInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const open = (s: Step) => { setCode(""); setCard(null); setError(""); setStep(s); };
  const find = async () => {
    if (!code.trim() || busy) return;
    setBusy(true); setError(""); setCard(null);
    try { setCard(await lookupGiftCard(code)); }
    catch (err: any) { setError(err?.message || "Could not check the gift card"); }
    finally { setBusy(false); }
  };

  const title = step === "menu" ? "Gift card" : step === "balance" ? "Gift card balance" : "Redeem gift card";
  const sub = step === "menu" ? "Choose an option" : "Type or scan the card code";
  const items: { label: string; hint: string; run: () => void }[] = [
    { label: "Sell Gift Card", hint: "Coming soon", run: () => { onSay("SELL GIFT CARD — COMING SOON"); onClose(); } },
    { label: "Redeem", hint: "Look up a card to pay with", run: () => open("redeem") },
    { label: "Check Balance", hint: "See what is left on a card", run: () => open("balance") },
  ];

  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="assign-create-modal" data-testid="nail-gift-sheet">
        <div className="assign-create-header">
          <div><h2>{title}</h2><p>{sub}</p></div>
          <button type="button" className="assign-create-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="assign-create-list">
          {step === "menu" ? items.map((it) => (
            <button key={it.label} type="button" className="assign-create-item" onClick={it.run} data-testid={`nail-gift-${it.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <Gift size={18} /><span className="assign-create-name">{it.label}</span><span className="assign-create-status">{it.hint}</span>
            </button>
          )) : (
            <div className="gift-entry">
              <input className="gift-input" value={code} autoFocus autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="GC-XXXXXXXX" data-testid="nail-gift-code"
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setCard(null); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") void find(); }} />
              <button type="button" className="assign-create-btn assign-create-btn-ready" disabled={!code.trim() || busy} onClick={() => void find()} data-testid="nail-gift-check">{busy ? "CHECKING…" : "CHECK CARD"}</button>
              {error && <div className="gift-error" data-testid="nail-gift-error">{error}</div>}
              {card && (
                <div className="gift-result" data-testid="nail-gift-result">
                  <span>{card.code}{card.issuedTo ? ` · ${card.issuedTo}` : ""}</span>
                  <strong>{money(card.balance)} available</strong>
                </div>
              )}
              {card && step === "redeem" && <div className="assign-create-hint">To pay with this card, press PAY / CHECKOUT and use GIFT CARD on the payment screen.</div>}
            </div>
          )}
        </div>
        <div className="assign-create-footer">
          {step === "menu"
            ? <button type="button" className="assign-create-btn assign-create-btn-ready" onClick={onClose}>DONE</button>
            : <button type="button" className="assign-create-btn assign-create-btn-ready" onClick={() => open("menu")}>BACK</button>}
        </div>
      </div>
    </>
  );
}
