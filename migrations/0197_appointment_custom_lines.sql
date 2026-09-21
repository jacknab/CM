-- 0197_appointment_custom_lines.sql
--
-- The nail POS keypad can ring up a custom dollar amount ("Custom Amount") on an open ticket. Those
-- lines live on the ticket until checkout, where they become extra lines on the sale.
-- Shape: [{"label": "Custom Amount", "price": 12.5}, ...]. NULL / empty = none.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS custom_lines JSONB;
