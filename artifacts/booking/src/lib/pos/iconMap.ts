/**
 * Maps the string `icon` names used in POS layout configs to Lucide components.
 * Keeping icons as strings (not component refs) lets layouts be stored as plain
 * data — in a config file now, in the DB / an admin UI later.
 */
import {
  Sparkles, ShoppingBag, Gift, Crown, BadgePercent, Award, Coins,
  SplitSquareHorizontal, Calculator, Undo2, Ban, DoorOpen, Printer, Search,
  Users, Star, Percent, CreditCard, ListOrdered, Layers, Tag, Wallet,
  ScanSearch, Ticket, ReceiptText, HandCoins, Repeat2, ChevronRight, ChevronLeft,
  type LucideIcon,
} from "lucide-react";

export const POS_ICONS: Record<string, LucideIcon> = {
  Sparkles, ShoppingBag, Gift, Crown, BadgePercent, Award, Coins,
  SplitSquareHorizontal, Calculator, Undo2, Ban, DoorOpen, Printer, Search,
  Users, Star, Percent, CreditCard, ListOrdered, Layers, Tag, Wallet,
  ScanSearch, Ticket, ReceiptText, HandCoins, Repeat2, ChevronRight, ChevronLeft,
};

/** Resolve an icon name; returns undefined for unknown names (renderer draws a fallback). */
export function resolvePosIcon(name: string): LucideIcon | undefined {
  return POS_ICONS[name];
}
