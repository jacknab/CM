-- SMS Contact Routing table
-- Routes inbound SMS from shared toll-free number to the correct store.

CREATE TABLE IF NOT EXISTS sms_contact_routing (
  id                 serial PRIMARY KEY,
  store_id           integer NOT NULL REFERENCES locations(id),
  client_phone       text NOT NULL,  -- digits only, no +
  last_outbound_at   timestamptz,
  last_inbound_at    timestamptz,
  last_interaction_at timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_routing_store_phone_uq UNIQUE (store_id, client_phone)
);

CREATE INDEX IF NOT EXISTS sms_routing_phone_idx        ON sms_contact_routing (client_phone);
CREATE INDEX IF NOT EXISTS sms_routing_interaction_idx  ON sms_contact_routing (client_phone, last_interaction_at);
