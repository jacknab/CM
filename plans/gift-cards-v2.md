# Gift cards v2 (2026-09-22)

Decisions (from the owner): keep the 5 old `GC-XXXXXXXX` cards working as "Legacy" (no PIN, no store digits) · random per-store 4-digit store code · PIN required everywhere · build phases 1+2 now.

## Card number
`AAAA SSSS BBBB` — 12 digits, numeric only. A and B are cryptographically random (`crypto.randomInt`), S is the **store code** (`locations.gift_card_store_code`, random, unique, assigned lazily on first use). No counters, nothing sequential. Stored as 12 digits without spaces (unique). Every lookup checks digits 5–8 against the salon's own store code before touching the card, so another salon's card is refused outright.

## PIN
3 random digits, generated with the card, shown ONCE at creation. Stored only as HMAC-SHA256(pepper, number:pin) — never plain. 5 wrong PINs lock the card for 15 minutes (per card, in the DB, so it holds across both API workers). "Reset PIN" issues a new one.

## Card types
- `value` — fixed dollars (balance).
- `service` — linked to `services.id`; `package` — linked to `packages.id`. Pays for ONE matching item on a ticket at that item's **current** catalog price at redemption time (not the price when the card was made). **Single use**: `used_at` is set, the card can never be used again (DB trigger forbids un-using).
- A service card matches a ticket line with that `service_id` and no package; a package card matches `package_id`. Add-ons/other lines are not covered. The server matches against the ticket in the DB — the POS never tells it what is in the cart.

## Phases
1. Migration 0200 · `lib/giftCardNumbers.ts` (pure) · `lib/giftCards.ts` (DB) · owner API · Gift Cards page.
2. Nail POS: lookup (number + PIN) and redeem at checkout, incl. service/package matching.
3. (later) Calendar checkout + online booking apply-a-card step.
