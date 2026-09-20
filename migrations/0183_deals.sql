-- 0183_deals.sql
--
-- Marketplace "Deals" — a mini Groupon built on top of Catalog Packages. A
-- deal wraps an existing package with marketing copy, a sale price, a
-- limited quantity, and a window, and lists it on the certxa.com
-- marketplace. Buying a deal issues a voucher; the voucher is only
-- redeemed when the linked appointment's status becomes 'started' (see
-- storage.updateAppointment), not at purchase or booking time.

CREATE TABLE IF NOT EXISTS deals (
    id                     SERIAL PRIMARY KEY,
    store_id               INTEGER NOT NULL REFERENCES locations(id),
    package_id             INTEGER NOT NULL REFERENCES packages(id),
    title                  TEXT NOT NULL,
    marketing_description  TEXT,
    hero_image             TEXT,
    deal_price             NUMERIC(10,2) NOT NULL,
    list_price             NUMERIC(10,2) NOT NULL,
    capacity               INTEGER NOT NULL,
    purchased_count        INTEGER NOT NULL DEFAULT 0,
    starts_at              TIMESTAMPTZ NOT NULL,
    ends_at                TIMESTAMPTZ NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'paused' | 'archived'
    created_at             TIMESTAMPTZ DEFAULT now(),
    updated_at             TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deal_vouchers (
    id                        SERIAL PRIMARY KEY,
    deal_id                   INTEGER NOT NULL REFERENCES deals(id),
    code                      TEXT NOT NULL UNIQUE,
    qr_token                  TEXT NOT NULL UNIQUE,
    customer_email            TEXT NOT NULL,
    customer_name             TEXT,
    stripe_payment_intent_id  TEXT,
    appointment_id            INTEGER REFERENCES appointments(id),
    status                    TEXT NOT NULL DEFAULT 'pending_booking', -- 'pending_booking' | 'booked' | 'redeemed' | 'expired' | 'refunded'
    purchased_at              TIMESTAMPTZ DEFAULT now(),
    redeemed_at               TIMESTAMPTZ,
    expires_at                TIMESTAMPTZ NOT NULL
);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS voucher_id INTEGER REFERENCES deal_vouchers(id);

CREATE INDEX IF NOT EXISTS deals_store_id_idx           ON deals(store_id);
CREATE INDEX IF NOT EXISTS deals_status_idx              ON deals(status);
CREATE INDEX IF NOT EXISTS deal_vouchers_deal_id_idx      ON deal_vouchers(deal_id);
CREATE INDEX IF NOT EXISTS deal_vouchers_status_idx       ON deal_vouchers(status);
CREATE INDEX IF NOT EXISTS deal_vouchers_appointment_idx  ON deal_vouchers(appointment_id);
