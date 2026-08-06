# Tax Documents Feature — Planning Document

**Status:** Draft for review
**Author:** Replit Agent (planning session)
**Last updated:** July 9, 2026

## 1. Goal

Add automated tax-document generation to Certxa for two distinct audiences:

1. **Salon owner (store account) tax documents** — an annual package each salon owner can download from their dashboard summarizing their business's income/revenue for the year, to hand to their accountant or use for self-filing.
2. **Contractor 1099 assistance** — help salon owners meet their IRS obligation to issue **Form 1099-NEC** to any contractor they paid $600+ in a calendar year, including collecting W-9 info, generating the forms, delivering copies to contractors, and (optionally) e-filing with the IRS.

These are two separate compliance surfaces with different legal weight — (2) is a real regulated filing with IRS deadlines and penalties; (1) is a convenience report, not an official tax form, unless we explicitly decide to also issue 1099-K style forms (see §6.4).

---

## 2. What already exists (audit findings)

| Area | Current state | Location |
|---|---|---|
| Store revenue | `cash_sales`, `card_sales` on `locations`; `total_revenue`/`service_revenue` on `appointments`; revenue also rolled up in `payout_run_items` | `shared/schema.ts` |
| Sales tax config | `sales_tax_rate`, `tax_services_taxable`, `tax_products_taxable` on `locations` | `shared/schema.ts` |
| Billing/subscriptions | `store_subscriptions`, `subscription_plans`, `store_invoices`, Stripe customer/subscription/invoice IDs | `shared/schema.ts`, `shared/schema/subscriptions.ts` |
| Stripe Connect | `store_payment_accounts` (provider, payouts_enabled) | `shared/schema.ts` |
| Contractor payouts | `contractors` (stripe_account_id, tax_classification, tax_id_last4), `payout_runs`, `payout_run_items` (gross/net, stripe_transfer_id), `payout_checks` | `shared/schema/payouts.ts` |
| W-9 data | `payout_w9_records` table already exists: legal_name, business_name, tax_classification, **tax_id_last4** (not full TIN), address | `shared/schema/payouts.ts` |
| Business entity type | **Missing** — no `business_type`/EIN field on `locations` or the owner's `users` record | — |

**Key gap:** the system stores only the **last 4 digits** of a contractor's TIN/SSN/EIN today. A real 1099-NEC filing requires the **full TIN**. This is the single biggest structural gap to close, and it has real security implications (see §7).

---

## 3. Two build tracks

### Track A — Salon Owner Annual Tax Summary (lower risk, ship first)
A downloadable PDF/CSV package per store, per calendar year, containing:
- Gross revenue (services + products), broken out by month
- Card sales vs. cash sales (from `locations.cash_sales`/`card_sales` and appointment-level data)
- Sales tax collected (using `sales_tax_rate` and taxable flags)
- Subscription/software costs paid to Certxa (deductible business expense) — pulled from `store_invoices`
- Contractor payouts made (total 1099-eligible payments, for their own records)
- Processing fees (Stripe fees, if we can obtain fee data from Stripe Connect)
- Net platform-recorded income (informational — clearly labeled "not tax advice, does not include cash not logged in Certxa")

This is **not** an official IRS form — it's a financial summary report, similar to what QuickBooks/Square generate. It carries much lower liability than issuing 1099s, since it's just organizing the salon's own recorded transaction data.

### Track B — Contractor 1099-NEC Generation & Delivery (higher risk, real compliance)
For each store, for each contractor paid ≥ $600 in the tax year via that store:
1. Collect a complete, IRS-valid **W-9** (legal name, business name, address, full TIN, tax classification, signature) if not already on file.
2. Calculate total **non-employee compensation** paid in the calendar year (cash payouts, direct deposits, checks — NOT reimbursements or product sales through the contractor).
3. Generate a **Form 1099-NEC** per contractor per store (PDF, IRS-compliant layout — Copy B for contractor, Copy A for IRS/state, Copy C for payer's records).
4. Deliver Copy B to the contractor (download from their staff portal + optional email).
5. File Copy A with the IRS — either:
   - Self-file via IRS FIRE system (complex, requires transmitter control code) — **not recommended to build in-house**, or
   - **Integrate a 1099 e-filing API** (Track1099, Tax1099.com, Avalara 1099, or Zenwork) — recommended (see §6.3).
6. Track state filing requirements where applicable (many states also require a copy; combined federal/state filing programs exist through the same providers).

---

## 4. Data model changes required

### 4.1 `locations` (salon/store) table
Add:
- `business_legal_name` (text) — may differ from DBA `business_name`
- `business_type` (enum: sole_proprietor, single_member_llc, multi_member_llc, s_corp, c_corp, partnership)
- `federal_ein` (encrypted text, nullable) — for the salon's own business tax ID, needed as the "Payer TIN" on any 1099s the salon issues
- `payer_address_*` fields (street/city/state/zip) — required as the Payer info block on 1099-NEC forms

### 4.2 `payout_w9_records`
Add:
- `tax_id_encrypted` (text) — full TIN, encrypted at rest (see §7), replacing reliance on `tax_id_last4` alone
- `signature_data` / `signed_at` / `signed_ip` — for an e-signature audit trail (IRS accepts electronic W-9s with reasonable authentication)
- `w9_pdf_url` — store the actual signed W-9 PDF (R2), since the IRS expects payers to retain the original for 4 years

### 4.3 New table: `tax_documents_1099` (per contractor, per store, per tax year)
- `id`, `contractor_id`, `store_id`, `tax_year`
- `total_compensation` (numeric)
- `status` (enum: pending_w9, ready, generated, filed, corrected, voided)
- `form_pdf_url` (R2 path to generated PDF)
- `irs_filing_id` / `irs_filing_status` (from e-file provider)
- `state_filing_status` (jsonb, per applicable state)
- `generated_at`, `filed_at`, `corrected_at`
- `correction_of` (self-FK, for amended 1099s)

### 4.4 New table: `tax_documents_annual_summary` (per store, per tax year)
- `id`, `store_id`, `tax_year`
- `summary_pdf_url`, `csv_export_url`
- `generated_at`, `data_snapshot` (jsonb — the computed figures, so re-downloads are consistent even if underlying data changes later)

### 4.5 Migration note
Per this codebase's established pattern (see `missing-db-columns` convention already in use), every new column/table needs a numbered migration file in `artifacts/api-server/migrations/`, applied via the existing migration runner — not just a schema-only Drizzle change.

---

## 5. New backend services

| Service | Responsibility |
|---|---|
| `services/tax/w9-collection.ts` | Owner-facing flow to invite a contractor to fill out a W-9; contractor-facing form + e-sign; validates TIN format (SSN: 9 digits, EIN: XX-XXXXXXX) |
| `services/tax/annual-summary-generator.ts` | Aggregates a store's yearly revenue/tax/payout data into the Track A summary; runs on-demand and via a scheduled year-end job |
| `services/tax/1099-generator.ts` | Aggregates a contractor's yearly compensation per store, checks the $600 threshold, renders the IRS-format PDF |
| `services/tax/efile-provider.ts` | Thin adapter around the chosen e-filing API (Track1099/Tax1099/Avalara) — submit filings, poll status, handle corrections |
| `services/tax/tax-document-scheduler.ts` | Cron-style job: mid-December reminder to owners with unfiled W-9s; early January threshold check; generates draft 1099s automatically for review; enforces the **January 31** IRS deadline for both contractor delivery and IRS filing |

---

## 6. Key decisions to make before building (recommend discussing with you)

### 6.1 Build our own PDF/IRS-format renderer, or use a 1099 e-file provider's hosted PDF+filing?
**Recommendation:** use a provider (Track1099, Tax1099.com, or Avalara 1099) via API. Building a compliant 1099-NEC PDF *and* IRS FIRE e-file integration in-house is a multi-month effort with real penalty risk if done wrong (the IRS PDF has exact scannable-format requirements for Copy A). These providers charge per-form (~$2-5/form) and handle both the IRS filing and combined state filing, plus TIN-matching verification against the IRS database — something we cannot replicate cheaply in-house.

### 6.2 Who is the legal "filer of record" — Certxa or each individual salon?
Each **salon** is legally the payer/employer of its contractors, not Certxa. Certxa is providing tooling, similar to how Gusto or QuickBooks Self-Employed do this for their customers. This matters for:
- Whose EIN goes on the form (the salon's, never Certxa's)
- Liability — Certxa should present this as "assistance," with clear disclaimers, and should not be positioned as guaranteeing tax compliance
- Terms of Service — likely needs an update/addendum before shipping this feature

### 6.3 Do we want in-house W-9 collection + storage, or delegate that to the e-file provider too?
Most 1099 e-file APIs also offer hosted W-9 collection (with TIN masking/verification built in), which would reduce our liability around storing raw SSNs. **Recommendation:** delegate TIN storage to the provider where possible; store only `tax_id_last4` + a reference ID in our DB, similar to how Stripe Connect is already used for payout account numbers in this codebase.

### 6.4 Does Track A need to include a 1099-K equivalent?
If salons process card payments through Certxa's own Stripe Connect (not a separate merchant of record), Stripe itself is likely the entity required to issue 1099-K to the salon for card processing volume — that's Stripe's obligation, not something Certxa needs to duplicate. Worth confirming based on how `store_payment_accounts` is configured (direct charges vs. destination charges) — flagging as a follow-up investigation, not blocking Track A.

### 6.5 Timing
IRS deadline: 1099-NEC copies to contractors **and** to the IRS are both due **January 31** of the following year. That means the scheduler needs to nudge owners starting in December, and ideally auto-generate drafts by the first week of January so there's buffer time for corrections.

---

## 7. Security & compliance requirements

- **Full TINs (SSN/EIN) are highly sensitive PII.** Any full TIN we do store (vs. delegating to a provider) must be encrypted at rest using the same pattern as the existing `googleTokenCrypto.ts` (AES-256-GCM with a dedicated encryption key secret), never logged, and masked (`•••-••-1234`) everywhere in the UI except a one-time reveal for the owner during filing.
- Access to any tax-document generation/download endpoints must be gated to the store owner only (reuse the existing `resolveSessionStoreId` + ownership-check pattern already used elsewhere) — a staff member should not be able to pull the owner's tax summary or a contractor's SSN.
- Contractors should only ever see their **own** W-9 status and their **own** 1099 copy — never other contractors' data.
- Audit log every generation, download, correction, and filing action (who, when, what) — tax documents are the kind of artifact that gets subpoenaed or disputed later.
- Retain generated 1099s and W-9s for at least 4 years per IRS recordkeeping rules (aligns with the existing "never delete payroll/earnings data before Feb 1 of the following year" retention policy already in place — extend that policy to explicitly cover tax documents).

---

## 8. UI/UX additions

**Salon owner side:**
- New "Tax Documents" section (e.g. under Settings or a new "Finances" area)
  - Annual Summary tab: year selector, "Download PDF" / "Download CSV" buttons, prior years list
  - 1099s tab: table of contractors, W-9 status (missing/pending/complete), total YTD compensation, threshold indicator, "Send W-9 Request" action, "Generate 1099s" bulk action (only enabled once all required W-9s are in and it's past year-end), per-contractor download/void/correct actions, filing status badges

**Contractor side (staff portal):**
- "Tax Info" tab: W-9 form (if missing), submitted W-9 status, list of 1099s received per store per year with download links

**Admin/support side:**
- Visibility into which stores have outstanding W-9s or unfiled 1099s as the January 31 deadline approaches (for proactive support outreach)

---

## 9. Phased rollout plan

| Phase | Scope | Rough effort |
|---|---|---|
| **Phase 1** | Data model changes (§4), encryption infra reuse, `business_type`/EIN fields on `locations` | Small |
| **Phase 2** | Track A: Annual Summary generator + owner-facing download UI | Medium |
| **Phase 3** | W-9 collection flow (owner invites contractor → contractor fills & e-signs → stored) | Medium |
| **Phase 4** | Evaluate & integrate a 1099 e-file provider (API contract, sandbox testing) | Medium — depends on provider chosen |
| **Phase 5** | 1099-NEC generation, review UI, contractor delivery | Medium-Large |
| **Phase 6** | IRS/state e-filing integration, deadline scheduler, corrections/voids workflow | Large |
| **Phase 7** | Legal review — ToS addendum, disclaimers, support runbook for tax season | Ops, not eng |

Recommend shipping Phases 1-3 first (lower risk, no third-party filing dependency), then deciding on the e-file provider before committing to Phases 4-6.

---

## 10. Decisions (confirmed)

1. **E-filing provider:** Approved — integrate a third-party 1099 e-file API (Track1099, Tax1099.com, or Avalara 1099) rather than building IRS FIRE integration in-house. Final vendor pick happens in Phase 4 (needs a quick comparison of API quality, per-state filing coverage, and pricing tiers at our expected volume — no need to lock this in now).
2. **Cost model:** E-filing cost is **passed through to the salon owner** as a metered add-on, billed per form generated/filed in a given tax year. See §11 below for the billing design.
3. **TIN storage:** **Delegate full TIN storage to the e-file provider.** Recommendation adopted — our DB keeps only `tax_id_last4` plus the provider's contractor/payee reference ID (mirrors the existing pattern where Stripe Connect already holds sensitive payout account details and we just keep `stripe_account_id`). This meaningfully shrinks our compliance surface: no AES-encrypted full-TIN column needed in `payout_w9_records`, no key-rotation burden for that data, and if the provider offers hosted TIN-matching against the IRS database (most do), we get free upfront validation instead of finding out about a bad TIN after a rejected filing. The W-9 PDF itself (which does contain the full TIN visually) will still need to be retained somewhere for the 4-year record requirement — plan is to store that as an encrypted file in R2 (reusing the existing R2 pipeline) rather than storing the raw TIN as DB *data*, so it's "at rest, access-controlled, and encrypted" without being a queryable/indexed sensitive field.
4. **Target date:** **Tax season 2028** (i.e., ready in time to file 2027-tax-year forms by Jan 31, 2028). This gives roughly 18 months of runway — comfortable room to do the phases sequentially, pick and integrate a vendor properly, and get a legal/ToS review done without rushing, rather than the tight 2027 deadline originally assumed.

## 11. Add-on billing design (per-form e-filing fee)

Since the cost is passed to the salon owner and scales with the number of 1099 forms generated, this needs its own metered-billing surface rather than a flat plan-tier bump:

- **New table `tax_filing_charges`:** `id`, `store_id`, `tax_year`, `contractor_id` (nullable — null for a batch-level summary row), `form_count`, `unit_price_cents` (snapshot at time of charge, since vendor pricing can change year to year), `total_cents`, `stripe_invoice_item_id`, `status` (pending, invoiced, paid, refunded/voided).
- **Trigger point:** a charge is created when a 1099 is actually **generated and submitted for filing** (not merely drafted/previewed), so an owner can freely review draft 1099s before committing to a billable filing. Voided/corrected forms should not double-charge — a correction should either be free or a small reduced fee, mirroring most providers' own correction pricing.
- **Delivery mechanism:** reuse the existing Stripe Billing integration (`store_subscriptions`/`store_invoices` infra already in place) — add these as one-off invoice items on the store's existing Stripe customer rather than inventing a parallel payment path. This also means it shows up cleanly on the owner's existing billing history/invoices UI.
- **Owner-facing transparency:** before the bulk "Generate 1099s" action fires, show a cost preview ("12 contractors × $X = $Y will be added to your account") and require explicit confirmation — this is a real charge, not a background job side-effect.
- **Failure handling:** if the owner's card/Stripe billing is in a failed/past-due state, block new 1099 generation until billing is resolved, but never block **already-filed** forms from being downloadable — the owner still needs those for compliance regardless of billing status.

## 12. Updated phase order given the 2028 target

With more runway, recommend a slightly less compressed cadence than originally sketched, but same phase content as §9:

| Phase | Target window |
|---|---|
| Phase 1 — Data model changes | Anytime, low risk, can start immediately |
| Phase 2 — Track A annual summaries | Ship independently, no dependency on vendor pick |
| Phase 3 — W-9 collection flow (owner-invite + contractor e-sign) | Can start once Phase 1 lands |
| Phase 4 — Vendor evaluation & sandbox integration | Aim to complete by mid-2027, leaving a full filing season buffer before the real Jan 31, 2028 deadline |
| Phase 5 — 1099-NEC generation + billing add-on (§11) | After vendor is selected |
| Phase 6 — E-filing + deadline scheduler + corrections | Q4 2027, so it's live and tested well before January 2028 |
| Phase 7 — Legal/ToS review | Should run in parallel with Phase 4-5, not bolted on at the end |

Ready to move forward — let me know if you'd like this broken into formal project tasks (switch to Planning mode) or if you'd like me to start directly on Phase 1 (data model + migrations) now.
