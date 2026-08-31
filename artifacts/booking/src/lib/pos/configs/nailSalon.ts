/**
 * Nail salon POS function-button layout.
 *
 * 15 top-level buttons (3 columns × 5 rows). Buttons that open a submenu carry a
 * nested `submenu` array; leaf buttons carry a typed `action` that the checkout
 * sheet's `handlePosAction` will dispatch on. Action handlers are wired in a
 * follow-up — for now leaf actions are declared with their real `type` so the
 * dispatch switch just needs its cases filled in.
 */
import type { PosLayout, PosButton } from "../types";

// Add-Ons now open a live, paginated view of the store's add-on catalogue
// (`action: { type: "addon-browser" }`), built by the checkout sheet from the
// `/api/addons` data — see `addonPages` in CheckoutPOSPanel.

// Removal services. `price: 0` → the tech keys the amount on the numpad before
// tapping (removal is often comped with a new set). The `addonName` is the full
// name used for the cart line; `label` is the shorter grid caption.
const removalSubmenu: PosButton[] = [
  { id: "nail.rm.polish",   label: "Polish\nRemoval",       icon: "Undo2", action: { type: "add-addon", payload: { addonName: "Polish Removal", price: 0 } } },
  { id: "nail.rm.gelpolish",label: "Gel Polish\nRemoval",   icon: "Undo2", action: { type: "add-addon", payload: { addonName: "Gel Polish Removal", price: 0 } } },
  { id: "nail.rm.acrylic",  label: "Acrylic\nRemoval",      icon: "Undo2", action: { type: "add-addon", payload: { addonName: "Acrylic Removal", price: 0 } } },
  { id: "nail.rm.dip",      label: "Dip Powder\nRemoval",   icon: "Undo2", action: { type: "add-addon", payload: { addonName: "Dip Powder Removal", price: 0 } } },
  { id: "nail.rm.gelx",     label: "Gel-X\nRemoval",        icon: "Undo2", action: { type: "add-addon", payload: { addonName: "Gel-X Removal", price: 0 } } },
  { id: "nail.rm.builder",  label: "Builder Gel\nRemoval",  icon: "Undo2", action: { type: "add-addon", payload: { addonName: "Builder Gel Removal", price: 0 } } },
  { id: "nail.rm.hardgel",  label: "Hard Gel\nRemoval",     icon: "Undo2", action: { type: "add-addon", payload: { addonName: "Hard Gel Removal", price: 0 } } },
  { id: "nail.rm.softgel",  label: "Soft Gel\nRemoval",     icon: "Undo2", action: { type: "add-addon", payload: { addonName: "Soft Gel Removal", price: 0 } } },
  { id: "nail.rm.polygel",  label: "Polygel\nRemoval",      icon: "Undo2", action: { type: "add-addon", payload: { addonName: "Polygel Removal", price: 0 } } },
  { id: "nail.rm.othergel", label: "Other Gel\nEnh. Removal", icon: "Undo2", action: { type: "add-addon", payload: { addonName: "Other Gel Enhancement Removal", price: 0 } } },
  { id: "nail.rm.ext",      label: "Nail Ext.\nRemoval",    icon: "Undo2", action: { type: "add-addon", payload: { addonName: "Nail Extension Removal", price: 0 } } },
  { id: "nail.rm.artificial",label: "Artificial\nNail Removal", icon: "Undo2", action: { type: "add-addon", payload: { addonName: "Artificial Nail Removal", price: 0 } } },
];

const discountSubmenu: PosButton[] = [
  { id: "nail.disc.10",     label: "10% Off",     icon: "Percent",     action: { type: "discount-preset", payload: { percent: 10 } } },
  { id: "nail.disc.15",     label: "15% Off",     icon: "Percent",     action: { type: "discount-preset", payload: { percent: 15 } } },
  { id: "nail.disc.20",     label: "20% Off",     icon: "Percent",     action: { type: "discount-preset", payload: { percent: 20 } } },
  { id: "nail.disc.employee", label: "Employee",  icon: "BadgePercent", action: { type: "discount-preset", payload: { percent: 25, reason: "Employee" } } },
  { id: "nail.disc.custom", label: "Custom",      icon: "Calculator",  action: { type: "discount-custom" } },
  { id: "nail.disc.comp",   label: "Comp\n(100%)", icon: "Award",      action: { type: "comp-item" } },
];

const giftCardSubmenu: PosButton[] = [
  { id: "nail.gc.sell",    label: "Sell\nGift Card",   icon: "Gift",       action: { type: "gift-card", payload: { mode: "sell" } } },
  { id: "nail.gc.redeem",  label: "Redeem",            icon: "Gift",       action: { type: "gift-card", payload: { mode: "redeem" } } },
  { id: "nail.gc.balance", label: "Check\nBalance",    icon: "Search",     action: { type: "gift-card", payload: { mode: "balance" } } },
];

const reprintSubmenu: PosButton[] = [
  { id: "nail.reprint.last",   label: "Last\nReceipt",   icon: "Printer",     action: { type: "reprint-receipt", payload: { which: "last" } } },
  { id: "nail.reprint.select", label: "Select…",         icon: "ListOrdered", action: { type: "reprint-receipt", payload: { which: "select" } } },
  { id: "nail.reprint.gift",   label: "Gift\nReceipt",   icon: "Gift",        action: { type: "reprint-receipt", payload: { which: "gift" } } },
];

export const nailSalonPosLayout: PosLayout = {
  businessType: "Nail Salon",
  columns: 3,
  taxRate: 0, // nail-salon services aren't sales-taxed — hide the tax line
  // 3 × 5 grid. Dropped buttons are left as `null` so the surviving buttons
  // keep their original positions (empty cells are reserved for later use).
  buttons: [
    // Row 1 — build the ticket
    { id: "nail.addon",   label: "Add-Ons",  icon: "Sparkles",    mobile: true, action: { type: "addon-browser" } },
    { id: "nail.retail",  label: "Retail",   icon: "ShoppingBag", mobile: true, action: { type: "add-product" } },
    { id: "nail.removal", label: "Removal",  icon: "Undo2",       mobile: true, action: { type: "submenu", submenu: removalSubmenu } },

    // Row 2
    {
      id: "nail.quickticket",
      label: "Quick\nTicket",
      icon: "Zap",
      band: "#f4d000",
      mobile: true,
      action: {
        type: "guided-ticket",
        payload: {
          steps: [
            { prompt: "Removal Amount",     label: "Removal" },
            { prompt: "Nail Length Amount", label: "Nail Length" },
            { prompt: "Nail Shape Amount",  label: "Nail Shape" },
            { prompt: "Nail Art Amount",    label: "Nail Art" },
            { prompt: "Design Amount",      label: "Design" },
            { prompt: "Extra Amount",       label: "Extra" },
          ],
        },
      },
    },
    null, // Discount — moved to the keypad row
    { id: "nail.loyalty",    label: "Loyalty",    icon: "Star",         action: { type: "loyalty-redeem" } },

    // Row 3
    null, // Tip Adjust — moved to the keypad row
    null, // Split Pay — dropped
    null,

    // Row 4 — corrections — moved to the keypad row (see `keypadButtons` below)
    null,
    null,
    null,

    // Row 5
    { id: "nail.custom",  label: "Custom\nCharge", icon: "Calculator", mobile: true, action: { type: "add-custom-item" } },
    { id: "nail.grouppay", label: "Group\nPay",    icon: "Users",      action: { type: "link-tickets" } },
    { id: "nail.giftcard", label: "Gift\nCard",    icon: "Gift",       action: { type: "submenu", submenu: giftCardSubmenu } },
  ],
  // Beneath the numpad, replacing the quick-cash buttons.
  keypadButtons: [
    { id: "nail.tip",      label: "Tip\nAdjust", icon: "HandCoins",    band: "#e879b0", mobile: true, action: { type: "tip-adjust" } },
    { id: "nail.discount", label: "Discount",    icon: "BadgePercent", band: "#e879b0", mobile: true, action: { type: "submenu", submenu: discountSubmenu } },
    { id: "nail.nosale",   label: "No\nSale",    icon: "DoorOpen",     band: "#6b7280", action: { type: "no-sale" } },
    { id: "nail.reprint",  label: "Reprint",     icon: "Printer",      band: "#00c8ff", mobile: true, action: { type: "submenu", submenu: reprintSubmenu } },
  ],
};
