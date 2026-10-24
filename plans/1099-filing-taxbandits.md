# 1099-NEC filing for salons' contractors (TaxBandits)

Started 2026-10-24. Salons buy a 1099 filing package from Certxa at tax time; Certxa files each contractor's
Form 1099-NEC through the TaxBandits API on the salon's behalf (federal + state, contractor copies).

## Decided
- Provider: **TaxBandits** (REST API for platforms, per-form pricing, state filing, TIN matching, recipient copies).
- Credentials: sandbox keys in `/etc/certxa-taxbandits.env` (root-only). Auth verified: HS256 JWS in the
  `Authentication` header → `https://testoauth.expressauth.net/v2/tbsauth` → 1-hour access token.
- Scope: **1099-NEC for contractors only.** No W-2s (Certxa does not withhold taxes; that needs real payroll).
- 2026 threshold: **$2,000** paid in the year (was $600). Deadline for TY2026: **February 1, 2027**.

## Open — owner to decide
1. Price to the salon (per form, or a flat package).
2. Contractor copies: mailed, online access, or the salon chooses.
3. What counts as "paid" (proposed: commission + tips paid through payroll — checks plus cash portion — before booth
   rent and other deductions).

## Data
- Contractor (recipient): `staff_employment` — worker_type `1099`, legal name, W-9 tax classification, SSN/EIN
  (encrypted, `lib/staffTaxCrypto.ts`), `staff.mailing_*` address. Decrypted only server-side when sent to TaxBandits.
- Salon (payer): **new** — legal business name, EIN (encrypted like the contractor TIN), business address, contact.
- Amounts: approved `payroll_runs` / `payroll_run_items` in the calendar year, per staff member.
- New tables: `tax_filing_orders` (salon, tax year, forms, price, Stripe payment, status) and `tax_filing_forms`
  (one per contractor: amount, TaxBandits submission/record ids, status, IRS/state status, errors, correction of).

## Progress (2026-10-24)
Built, sandbox-tested, deployed (needs `pm2 reload certxa-api`): migration 0258 (salon_tax_payer, tax_filing_orders,
tax_filing_forms), `lib/taxbandits.ts` (auth, validate, create, transmit, status — each checked against the sandbox),
`lib/tax1099.ts` (yearly totals, readiness, fileOrder, refreshOrderStatus), `routes/taxFiling.ts` (/api/tax-filing),
Stripe webhook hook (`markTaxFilingPaid`), page `/payroll/1099` (TeamTax1099.tsx) + "1099s" button on Payroll.
Defaults: $8/form (TAX_1099_PRICE_CENTS), +$3 mailed copy (TAX_1099_MAIL_CENTS); online copy always included.
Buying is blocked unless Stripe and TaxBandits are both live or both test (Stripe is live; TaxBandits sandbox).

Added the same day: **rejected forms** — the form shows the IRS/TaxBandits errors and a "Send again" button (no new
charge) after the owner fixes the details; `refileForm()` updates the return in place (PUT form1099nec/update) and
retransmits, or files it as a new return when TaxBandits won't change it (migration 0259: per-form submission_id,
recipient_id, refile_count). **Automatic status updates** — `startTaxFilingStatusSync()` on the scheduler instance
checks every form not yet accepted/rejected, hourly, for 120 days.

Not yet: state filing for states that need it (federal only; Arizona doesn't without withholding), TaxBandits
webhooks (hourly polling covers it), live keys.

## Phases
1. **Salon payer details** — legal name + EIN + address in Settings (or Payroll), EIN encrypted.
2. **"1099s for <year>" screen** in Payroll — contractors with their yearly total, over/under $2,000, and what is
   missing (tax ID, address, legal name, W-9 classification) with a link to fix it on the staff Payroll & Tax tab.
3. **TaxBandits client** (`lib/taxbandits.ts`) — token cache, create business (payer), create 1099-NEC returns,
   validate, transmit, status, recipient copies, PDFs. Sandbox end-to-end test with made-up data.
4. **Purchase** — Stripe checkout for the package; forms are filed only after payment.
5. **Filing + status** — transmit, then show each form's status (submitted / accepted / rejected) via webhook or
   polling; corrections (1099-NEC corrected) for a rejected or changed form.
6. **Go live** — live TaxBandits keys (owner), live host `oauth.expressauth.net`, pricing confirmed.

## Security
- Raw TINs never leave the server except in the request to TaxBandits (consider their TIN tokenization, API v2.0,
  RSA public key id in the env file).
- TaxBandits PDF credentials (AWS keys) stay server-side; contractor PDFs are streamed, never stored by Certxa.
