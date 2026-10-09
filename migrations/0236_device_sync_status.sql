-- What each POS tablet last said about its own offline queue: how many changes it still has to send, and how
-- much cash it took offline that the server has not received yet. Day Close reads this so it cannot report a
-- reconciled total while another tablet is still holding unsent cash.
CREATE TABLE IF NOT EXISTS device_sync_status (
  store_id     integer     NOT NULL,
  device_id    text        NOT NULL,
  pending      integer     NOT NULL DEFAULT 0,
  attention    integer     NOT NULL DEFAULT 0,
  cash_count   integer     NOT NULL DEFAULT 0,
  cash_amount  numeric(10,2) NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, device_id)
);
