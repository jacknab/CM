# Kiosk Check-In — Bug Report

> Documented from screenshots captured during a live check-in flow.  
> Session: Toby @ Fabulous Nails · Service: Hard Gel Manicure · Booking #148

---

## Bug 1 — Duplicate `#` symbol on Booking Number

**Screen:** Confirmation ("You're all checked in!")  
**Severity:** Medium — looks unprofessional on the receipt-style card  

**What it shows:**  
The label reads `BOOKING #` and the value renders as `#148`, so the combined display reads:

```
BOOKING #  #148
```

**Root cause (likely):**  
The booking number value is being stored/returned with a `#` prefix (e.g. `"#148"`) AND the label itself already contains a `#` character. One of the two should be removed — the label should either read `BOOKING` (letting the value carry the `#`) or the value should be stored as a plain integer `148` and the label keeps its `#`.

---

## Bug 2 — "With Linda Member" — loyalty tier bleeding into staff name

**Screen:** Confirmation ("You're all checked in!")  
**Severity:** Medium — misleading; client thinks their stylist's last name is "Member"  

**What it shows:**  
Under the client name "Toby", the assigned stylist line reads:

```
With Linda Member
```

**Root cause (likely):**  
The display string is concatenating the staff name ("Linda") with a loyalty/membership tier label ("Member") without any separator or conditional rendering. The tier label is probably a separate field (e.g. `staff.loyaltyTier` or the *client's* own membership status) that is being accidentally appended to the staff name string.

**Expected:**  
Either just `With Linda`, or the membership label rendered separately (e.g. below or in a badge).

---

## Bug 3 — Add-on cards missing service artwork

**Screen:** Add-ons ("Would you like to add anything?")  
**Severity:** Low–Medium — visual inconsistency, degrades kiosk polish  

**What it shows:**  
Every add-on card displays the same generic sparkle emoji (✨) as its image placeholder. The main service selection screen (screen 1) renders proper nail illustration artwork for each service. Add-ons get no real image — just the fallback sparkle icon.

**Root cause (likely):**  
Add-on services are a separate entity type that doesn't have `serviceIllustration` data populated, or the kiosk image rendering component only checks the illustration field for top-level services and falls back to the sparkle placeholder for add-ons without a meaningful error or empty state.

**Expected:**  
Either real artwork for each add-on, or a more intentional "no image" placeholder rather than the generic sparkle icon.

---

## Bug 4 — Selected add-ons not reflected on confirmation screen

**Screen:** Confirmation ("You're all checked in!") — comparing against add-ons screen  
**Severity:** High — the receipt shown to the client is wrong; stylist won't know what was booked  

**What it shows:**  
On the add-ons screen (screen 2), the client selected:
- Gel Removal · +$10
- Hand Massage Extension · +$10
- **Subtotal: +$20 · 2 add-ons selected**

On the confirmation screen (screen 3), the services block shows:
```
Hard Gel Manicure    $100
120 min est.         $100.00
```

The two selected add-ons are **completely absent** — neither listed as line items nor factored into the total. The client's receipt and the QR code booking both show $100 rather than $120.

**Root cause (likely):**  
The add-on selections are stored in local/component state during the flow but are not being passed correctly to the check-in submission payload. The booking creation API call likely only includes the primary service ID and misses the add-on IDs/amounts.

**Expected:**  
```
Hard Gel Manicure          $100
  + Gel Removal             $10
  + Hand Massage Extension  $10
────────────────────────────────
140 min est.              $120.00
```

---

## Summary

| # | Screen | Bug | Severity |
|---|--------|-----|----------|
| 1 | Confirmation | `BOOKING # #148` — duplicate hash symbol | Medium |
| 2 | Confirmation | `With Linda Member` — tier label concatenated into staff name | Medium |
| 3 | Add-ons | All add-on cards show generic sparkle placeholder, no artwork | Low–Med |
| 4 | Confirmation | Selected add-ons missing from receipt and booking total | **High** |
