-- 0266_addon_service_line.sql
-- Add-ons belong to a service on the ticket (owner, 2026-10-29): staff tap a service in the cart and the add-ons they
-- add go under it. NULL = the ticket's own (first) service; n = the service line at index n of the ticket's
-- custom_lines. An add-on for a service another technician does is on that technician's ticket (line_no NULL).
ALTER TABLE appointment_addons ADD COLUMN IF NOT EXISTS line_no INTEGER;
