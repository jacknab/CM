-- Migration 0076: Drop kiosk_turn table
-- The kiosk turn queue is now unified with the booking app's Turn System.
-- Staff ordering and pause state are managed via the Turn System's dynamic
-- algorithm (turn counts from appointments + pausedStaffIds in store preferences).
-- The kiosk's GET /api/kiosk/turn and POST /api/kiosk/turn/toggle endpoints
-- now delegate entirely to getTurnEligibility() and saveTurnPreferences().

DROP TABLE IF EXISTS kiosk_turn;
