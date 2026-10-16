-- Solo plan: whether the business address is shown to clients (plans/solo-work-places-and-approval.md).
-- Private: clients see the city only until they have booked. Default off: today's behaviour. A business
-- with no place of its own (own_place 'none', house calls only) is always treated as private.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS address_private BOOLEAN NOT NULL DEFAULT false;
