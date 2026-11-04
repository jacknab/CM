-- "Solo" website design for Certxa Pro app accounts (owner, 2026-11-04): a copy of Bloom made for one independent pro
-- (booking public-booking/SoloTheme.tsx). Every app account on Bloom moves to it; full-platform salons keep Bloom.
UPDATE locations l SET booking_theme = 'solo'
  FROM users u
 WHERE u.id = l.user_id AND u.account_type = 'certxa_pro' AND l.booking_theme = 'bloom';
