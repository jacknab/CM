import { useRef, useState } from "react";
import { Gift, X } from "lucide-react";
import { lookupGiftCard, sellGiftCard, type GiftCardInfo } from "./nailApi";
import { newIdempotencyKey } from "@/lib/nail-offline";
import { openCashDrawerHardware } from "@/lib/cashDrawer";

type Step = "menu" | "balance" | "redeem" | "sell";
const PRESETS = [25, 50, 75, 100];

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * The Gift Card button on the ticket screen — the checkout's Functions → Gift Card menu, moved here.
 * Sell Gift Card sells one here (cash, or a card on the salon's own terminal). Check Balance looks a card up. Redeem looks it up too, but taking a gift card
 * as payment only exists at checkout (there is no payment on a ticket that is still being built), so it says where to do that.
 */
export function GiftCardSheet({ onClose, onSay }: { onClose: () => void; onSay: (text: string) => void }) {
  const [step, setStep] = useState<Step>("menu");
  const [code, setCode] = useState("");
  const [card, setCard] = useState<GiftCardInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const open = (s: Step) => { setCode(""); setCard(null); setError(""); setSold(null); setAmount(""); setRecipient(""); setStep(s); };
  // ── Selling ──
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [sold, setSold] = useState<{ code: string; amount: number; method: "cash" | "card"; drawer: boolean } | null>(null);
  const saleKey = useRef(newIdempotencyKey("giftcard.sell"));
  const sell = async (method: "cash" | "card") => {
    const value = Math.round((Number(amount) || 0) * 100) / 100;
    if (busy) return;
    if (value < 5 || value > 1000) { setError("Enter an amount from $5 to $1,000."); return; }
    setBusy(true); setError("");
    try {
      const r = await sellGiftCard({ amount: value, method, code: code.trim() || null, recipientName: recipient.trim() || null }, saleKey.current);
      saleKey.current = newIdempotencyKey("giftcard.sell");
      setSold(r);
      if (method === "cash") void openCashDrawerHardware();
      onSay(`GIFT CARD SOLD · ${money(r.amount)} · ${r.code}`);
    } catch (err: any) { setError(err?.message || "Could not sell the gift card"); }
    finally { setBusy(false); }
  };
  const printSold = () => {
    if (!sold || !(window as any).CERTXA_PRINT_TEXT) return;
    const text = ["[C]<b>GIFT CARD</b>", `[C]<b>${money(sold.amount)}</b>`, "[L]--------------------------------", `[L]Code: ${sold.code}`,
      ...(recipient.trim() ? [`[L]For: ${recipient.trim()}`] : []), `[L]Sold: ${new Date().toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}`,
      `[L]Paid: ${sold.method === "cash" ? "Cash" : "Card"}`, "[L]Keep this code. It is needed to pay.", "[L]"].join("\n");
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: "PRINT_TEXT", requestId: `gift_${Date.now()}`, text }));
  };
  const find = async () => {
    if (!code.trim() || busy) return;
    setBusy(true); setError(""); setCard(null);
    try { setCard(await lookupGiftCard(code)); }
    catch (err: any) { setError(err?.message || "Could not check the gift card"); }
    finally { setBusy(false); }
  };

  const title = step === "menu" ? "Gift card" : step === "balance" ? "Gift card balance" : step === "sell" ? "Sell gift card" : "Redeem gift card";
  const sub = step === "menu" ? "Choose an option" : step === "sell" ? "Not a service: no commission, tip or turn" : "Type or scan the card code";
  const items: { label: string; hint: string; run: () => void }[] = [
    { label: "Sell Gift Card", hint: "Cash, or a card on your own terminal", run: () => open("sell") },
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
          )) : step === "sell" ? (
            <div className="gift-entry" data-testid="nail-gift-sell">
              {sold ? (
                <>
                  <div className="gift-result" data-testid="nail-gift-sold"><span>{sold.code}</span><strong>{money(sold.amount)} sold</strong></div>
                  <div className="assign-create-hint">
                    {sold.method === "cash" ? (sold.drawer ? "The cash is counted in the drawer for Day Close." : "No drawer is open: count this cash in by hand.") : "Recorded as paid on your own card terminal."}
                  </div>
                  {(window as any).CERTXA_PRINT_TEXT && <button type="button" className="assign-create-btn assign-create-btn-ready" onClick={printSold} data-testid="nail-gift-print">PRINT CODE</button>}
                </>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {PRESETS.map((v) => (
                      <button key={v} type="button" className={`assign-create-item ${Number(amount) === v ? "assign-create-item-sel" : ""}`} style={{ justifyContent: "center" }}
                        onClick={() => { setAmount(String(v)); setError(""); }} data-testid={`nail-gift-amount-${v}`}>{money(v)}</button>
                    ))}
                  </div>
                  <input className="gift-input" inputMode="decimal" value={amount} placeholder="Other amount" data-testid="nail-gift-amount"
                    onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, "")); setError(""); }} style={{ textTransform: "none", letterSpacing: 0 }} />
                  <input className="gift-input" value={code} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="Card code (optional — scan a printed card)" data-testid="nail-gift-sell-code"
                    onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }} style={{ fontSize: 16 }} />
                  <input className="gift-input" value={recipient} autoComplete="off" placeholder="Who it is for (optional)" data-testid="nail-gift-recipient"
                    onChange={(e) => setRecipient(e.target.value)} style={{ fontSize: 16, textTransform: "none", letterSpacing: 0 }} />
                  {error && <div className="gift-error" data-testid="nail-gift-error">{error}</div>}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <button type="button" className="assign-create-btn assign-create-btn-ready" disabled={busy || !amount} onClick={() => void sell("cash")} data-testid="nail-gift-sell-cash">{busy ? "SAVING…" : "PAID CASH"}</button>
                    <button type="button" className="assign-create-btn assign-create-btn-ready" disabled={busy || !amount} onClick={() => void sell("card")} data-testid="nail-gift-sell-card">{busy ? "SAVING…" : "PAID BY CARD"}</button>
                  </div>
                  <div className="assign-create-hint">PAID BY CARD records a card taken on your own terminal. The M2 reader cannot sell gift cards yet.</div>
                </>
              )}
            </div>
          ) : (
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
