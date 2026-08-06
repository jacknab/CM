---
name: Check Printer — Pre-printed Blue Security Paper
description: Dimensions, zone heights, and rendering rules for the business check-on-top blue security paper (8.26"×10.76").
---

## Paper: Business Check on Top — Blue Security (8.26" × 10.76")

### Measured dimensions (PDF analysis)
- Page: **8.26" × 10.76"** (594.72pt × 774.72pt) — slightly narrower/shorter than US Letter
- Blue security marble background: 0" → **~2.93"** from top
- Security banner (dark blue, text): topmost ~0.14"
- White writing zone (MICR area): 2.93" → **3.44"**
- **Perforation 1**: ~3.44" from top (check/stub1 boundary)
- Stub 1: 3.44" → 6.88"
- **Perforation 2**: ~6.88" from top
- Stub 2: 6.88" → 10.76" (3.88")

### Code changes made
- `artifacts/booking/src/lib/checkLayout.ts`: `BIZ_CHECK_ZONES` constant (checkIn=3.44, stub1In=3.44, stub2In=3.88, pageW=8.26, pageH=10.76, secBgEndIn=2.93)
- `artifacts/booking/src/pages/PrintChecks.tsx`:
  - `paperType: "standard" | "preprinted"` added to `PrintSettings` (default "standard")
  - `buildPrintCss(cal, paperType)` — preprinted uses `@page { size: 8.26in 10.76in }` and zone heights from BIZ_CHECK_ZONES
  - `CheckFace`: `suppressBg = isPreprinted && isPrint` — when true: no security bands, transparent bg, no border; when false + preprinted on screen: shows simulated blue marble preview
  - `PrintSheet` overlay: perforation guide lines are dynamic (3.44"/6.88" for preprinted, 3.5"/7.0" for standard)
  - All screen `CheckFace` calls pass `paperType`

### Print behavior for preprinted
- Security bands: suppressed (paper already has them)
- Check body background: transparent (paper's marble shows through)  
- Outer border: none (paper has its own blue border)
- Check zone padding top: 0.15in (clears 0.14" security banner)
- Side padding: 0.28in (narrower than standard's 0.35in to fit 8.26" page)
- Content boxes (payee, amount, bank, signature): retain white backgrounds for readability

**Why:** Pre-printed security paper has its own blue watermark, VOID pattern, and border baked in. Printing over them with our renderer's colored backgrounds would obscure the security features and look unprofessional.

**How to apply:** User selects "Pre-printed blue security paper" in Settings → Print Options. All CSS, zone heights, and CheckFace rendering adapt automatically. Calibration tab still works for fine vertical alignment.
