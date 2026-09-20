-- 0185_deal_voucher_payouts.sql
--
-- Bookkeeping ledger for salon payouts on redeemed deal vouchers. Certxa
-- collects the full purchase amount into its own platform Stripe account at
-- checkout; when a voucher is actually redeemed (its linked appointment's
-- status becomes 'started'), Certxa keeps a 10% commission and transfers the
-- remaining 90% to the salon's Stripe Connect account. A row is recorded
-- here regardless of outcome (pending | succeeded | failed | skipped) for a
-- full audit trail — mirrors contractor_instant_transfers' gross/rate/net
-- shape.

CREATE TABLE IF NOT EXISTS deal_voucher_payouts (
    id                       SERIAL PRIMARY KEY,
    voucher_id               INTEGER NOT NULL REFERENCES deal_vouchers(id),
    deal_id                  INTEGER NOT NULL REFERENCES deals(id),
    store_id                 INTEGER NOT NULL REFERENCES locations(id),
    stripe_transfer_id       TEXT,
    stripe_charge_id         TEXT,
    gross_amount_cents       INTEGER NOT NULL,
    commission_rate          NUMERIC(5,4) NOT NULL,
    commission_amount_cents  INTEGER NOT NULL,
    amount_cents             INTEGER NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'succeeded' | 'failed' | 'skipped'
    failure_reason           TEXT,
    created_at               TIMESTAMPTZ DEFAULT now(),
    updated_at               TIMESTAMPTZ DEFAULT now()
);

-- One payout attempt per voucher — also the idempotency guard: a redemption
-- retried (duplicate status write, etc.) can check for an existing row
-- before ever calling Stripe again.
CREATE UNIQUE INDEX IF NOT EXISTS deal_voucher_payouts_voucher_id_udx ON deal_voucher_payouts(voucher_id);
CREATE INDEX IF NOT EXISTS deal_voucher_payouts_store_id_idx ON deal_voucher_payouts(store_id);
CREATE INDEX IF NOT EXISTS deal_voucher_payouts_status_idx ON deal_voucher_payouts(status);
