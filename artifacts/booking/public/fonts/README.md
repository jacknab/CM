# fonts/

This directory holds static font files served by the Vite booking app.

## micr-e13b.otf

**Required for check printing.**  This is the GnuMICR E-13B font
(GPL-2.0-or-later, Steve Sandeen) used to render the MICR line on payroll
and business checks.

The file is **not committed** to the repository.  Install it by running:

```bash
bash scripts/setup-micr-font.sh
```

See `../MICR_FONT.md` for full documentation.
