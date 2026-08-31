/**
 * Generic fallback POS layout for business types without a dedicated config.
 * Deliberately minimal — the universal actions every checkout needs.
 */
import type { PosLayout } from "../types";

export const defaultPosLayout: PosLayout = {
  businessType: "Default",
  columns: 3,
  // Dropped buttons are left as `null` so the rest keep their grid positions.
  buttons: [
    { id: "def.discount", label: "Discount",     icon: "BadgePercent", mobile: true, action: { type: "discount-custom" } },
    { id: "def.retail",   label: "Retail",       icon: "ShoppingBag",  mobile: true, action: { type: "add-product" } },
    { id: "def.giftcard", label: "Gift\nCard",   icon: "Gift",         action: { type: "gift-card", payload: { mode: "sell" } } },

    { id: "def.tip",      label: "Tip\nAdjust",  icon: "HandCoins",    mobile: true, action: { type: "tip-adjust" } },
    null, // Split Pay — dropped
    { id: "def.custom",   label: "Custom\nCharge", icon: "Calculator", mobile: true, action: { type: "add-custom-item" } },

    null, // Refund — dropped (handled from the Payments dashboard, not the ticket POS)
    null, // Void — dropped
    { id: "def.nosale",   label: "No Sale",  icon: "DoorOpen",  action: { type: "no-sale" } },

    { id: "def.reprint",  label: "Reprint",    icon: "Printer",        mobile: true, action: { type: "reprint-receipt", payload: { which: "last" } } },
    null, // Price Check — dropped
    null,
  ],
};
