# MICR E-13B Font — Installation, Licensing & Architecture

## What This Is

Every payroll / business check printed by Certxa must include a MICR
(Magnetic Ink Character Recognition) line at the bottom.  That line is read
by bank scanners using both optical and magnetic sensors.  The character
shapes must conform to **ANSI X9.27 / ABA E-13B** — Courier New or any other
general-purpose font is NOT bank-scanner compatible.

---

## Font Selection: GnuMICR

**Font:** GnuMICR  
**Author:** Steve Sandeen  
**License:** GPL-2.0-or-later (free for any use including commercial, when
the font file itself is not sold separately)  
**Source:** https://www.sandeen.net/gnumicr/ (also on CTAN)  

GnuMICR is a complete E-13B implementation designed to produce
bank-scanner-compatible output on PostScript / PDF printers.  It is the most
widely-used free E-13B font and is included in major Linux distributions via
the `texlive-fonts-extra` package.

---

## Where the Font Lives

```
artifacts/booking/public/fonts/micr-e13b.otf
```

This file is served as a static asset by the Vite / booking app.  It is:

- **Fetched by the browser** at PDF-generation time and embedded in every
  PDF via `@react-pdf/renderer`'s `Font.register()`.
- **Loaded via @font-face** in the check layout editor and print-preview
  pages for WYSIWYG display.

The font file is **not** committed to the repository (it is GPL software
distributed separately).  Run the setup script to install it.

---

## Installation (run once on the VPS / CI server)

```bash
bash scripts/setup-micr-font.sh
```

The script tries several CTAN mirrors and the GnuMICR project website in
order.  It validates that the downloaded file is a real OTF before accepting
it.  If all automated sources fail, it prints manual installation
instructions.

### Manual installation alternative

```bash
# Debian / Ubuntu
sudo apt-get install texlive-fonts-extra
find /usr/share/texmf -name "GnuMICR.otf" -exec cp {} \
  artifacts/booking/public/fonts/micr-e13b.otf \;

# macOS (Homebrew)
brew install --cask mactex
find /usr/local/texlive -name "GnuMICR.otf" -exec cp {} \
  artifacts/booking/public/fonts/micr-e13b.otf \;
```

---

## Using a Different Font

Point the system at any other E-13B-compliant font by setting the env var
**before** starting the app:

```bash
# .env.local (or Replit Secrets / server env)
VITE_MICR_FONT_URL=https://cdn.example.com/my-micr.otf
```

The font family name ("MICR E-13B") is fixed in code; only the source URL
changes.

---

## Architecture

### Shared constants — `src/lib/micrFont.ts`

- `MICR_FONT_FAMILY` — the CSS / PDF font-family name (`"MICR E-13B"`)
- `getMicrFontUrl()` — resolves the font URL (env var or default)
- `MICR_CHAR` — Unicode E-13B symbol constants (⑆ ⑇ ⑈ ⑉)
- `buildMicrLine(routing, account, checkNum)` — produces the MICR string

### PDF font service — `src/lib/micrFontPdf.ts`

Imported by `CheckDocumentPDF.tsx`.  Calls `Font.register()` once at module
load time.  If the font URL returns 404 or an invalid file, `@react-pdf/renderer`
**throws a descriptive error** during PDF rendering — it never silently falls
back to Courier.

### Browser hook — `src/hooks/use-micr-font.ts`

Used by `CheckLayoutEditor` and `PrintChecks`.  Injects an `@font-face` rule
and uses the `FontFace` API to detect whether the font loaded.  Returns:

| Property | Description |
|---|---|
| `fontFamily` | CSS value — MICR font (if loaded) or Courier New |
| `isLoaded` | `true` when the real E-13B font is available |
| `isFallback` | `true` when Courier New is the active substitute |
| `isChecking` | `true` while the FontFace load promise is pending |

When `isFallback` is `true`, the editor displays a yellow warning badge:
**"Preview only — Courier New (not bank-accurate)"**.

### PDF embedding — `CheckDocumentPDF.tsx`

The `micrText` style uses `fontFamily: MICR_FONT_FAMILY`.  When the PDF is
rendered in the browser, `@react-pdf/renderer` fetches the font file and
**embeds it** inside the PDF.  Every copy printed from that PDF uses the
embedded E-13B glyphs, regardless of what fonts are installed on the
printer's host OS.

---

## Character Encoding

GnuMICR maps the following Unicode code points to E-13B glyphs:

| Symbol | Code Point | Name | Meaning |
|--------|-----------|------|---------|
| ⑆ | U+2446 | MICR TRANSIT NUMBER SIGN | Routing number delimiter |
| ⑇ | U+2447 | MICR AMOUNT SYMBOL | Amount / on-us field terminator |
| ⑈ | U+2448 | MICR ON-US SYMBOL | Account number delimiter |
| ⑉ | U+2449 | MICR DASH SYMBOL | Hyphen within account numbers |
| 0–9 | U+0030–U+0039 | Digits | MICR-shaped digit glyphs |

Digits 0–9 look similar to OCR-A digits but have specific proportions
defined by ANSI X9.27.  Do not substitute them from another font.

### MICR line format (ANSI X9.27 personal/payroll check)

```
⑆ routing(9) ⑆  ⑆ account(10) ⑆⑇  checkNum(4) ⑆
```

Example:
```
⑆122000496⑆  ⑆4964040110⑆⑇  0001⑆
```

---

## Replacing the Font in the Future

1. Obtain a licensed E-13B font in OTF or TTF format.
2. Verify it maps the Unicode code points above to the correct glyphs.
3. Place it at `artifacts/booking/public/fonts/micr-e13b.otf`
   (or update `VITE_MICR_FONT_URL`).
4. Rebuild the app — no code changes required.

---

## Compliance Notes

- The font must conform to **ANSI X9.27** character dimensions.
- Print with magnetic (MICR) toner for scanner compatibility.
- The PDF embeds the font; the printer applies the toner.
- GnuMICR's character dimensions are calibrated for laser printers
  at 600 dpi or higher.
