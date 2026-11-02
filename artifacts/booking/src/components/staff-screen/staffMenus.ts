/**
 * The More and Manager menus of every staff-screen wrapper (/nail, /barber, and any wrapper made later) — one list,
 * so every wrapper offers the same tiles in the same order and support learns them once (owner, 2026-11-02).
 *
 * A wrapper never adds, drops or reorders a tile here. It passes its own wording (Tech ID / Barber ID), what the
 * salon has switched on, and what each tile does. A tile is left out only by the same rule on every wrapper:
 * Book Appointment with the Booking System on, Turn Rotation with the Turn System on, the station tiles in a salon
 * with stations, Retail Sale where there is a retail screen, Hard Refresh while online. The one tile that depends on the
 * wrapper is Language: only a translated wrapper has it (/nail; /barber is English only, owner 2026-11-02).
 */
import {
  BarChart3, Bell, CalendarPlus, ClipboardList, Clock, CreditCard, Gift, KeyRound, Languages, LayoutGrid, Lock, Printer,
  Receipt, RefreshCw, RotateCcw, Search, Settings, ShoppingBag, Wallet,
} from "lucide-react";

export interface StaffMenuTile {
  key: string;
  label: string;
  sub?: string;
  icon: React.ComponentType<{ size?: number }>;
  run: () => void;
  keepOpen?: boolean;
  confirm?: { title: string; body: string; action: string };
}

export interface StaffMenuContext {
  /** The staff ID's name on this wrapper: "Tech ID" (/nail), "Barber ID" (/barber). */
  idName: string;
  /** What the salon has switched on (Advanced Features / Settings). */
  bookingSystem: boolean;
  timeclock: boolean;
  pos: boolean;
  turnSystem: boolean;
  /** Retail Sale's page, or null where the app has no retail screen. */
  retailPage: string | null;
  /** The tablet's language, as its name ("English"); null on a wrapper that is not translated (no Language tile). */
  languageName: string | null;
  /** The salon has POS stations; this tablet's station (null: none). */
  multiStation: boolean;
  stationName: string | null;
  registerId: number;
  stationDrawerName: string | null;
  offline: boolean;
  drawerOpen: boolean;
  lockScreen: { on: boolean; saving: boolean };
  printer: { available: boolean; connected: boolean; deviceName: string | null; status: string };
  run: {
    book: () => void; clients: () => void; voucher: () => void; timeclock: () => void; retail: () => void; mySlip: () => void;
    language: () => void; manager: () => void; station: () => void; refresh: () => void;
    settings: () => void; posSetup: () => void; cashDrawer: () => void; messages: () => void; keyGrid: () => void;
    turnRotation: () => void; serviceTimes: () => void; managerPin: () => void; lockScreen: () => void; printer: () => void;
    changeStation: () => void; stationDrawer: () => void; idPrint: () => void; reports: () => void;
  };
}

export function staffMenus(c: StaffMenuContext): { more: StaffMenuTile[]; manager: StaffMenuTile[] } {
  const r = c.run;
  const more: StaffMenuTile[] = [
    ...(c.bookingSystem ? [{ key: "book", label: "Book Appointment", icon: CalendarPlus, run: r.book }] : []),
    { key: "clients", label: "Client Lookup", icon: Search, run: r.clients },
    { key: "voucher", label: "Redeem Voucher", icon: Gift, run: r.voucher },
    ...(c.timeclock ? [{ key: "timeclock", label: "In / Out", icon: Clock, run: r.timeclock }] : []),
    ...(c.pos && c.retailPage ? [{ key: "retail", label: "Retail Sale", icon: ShoppingBag, run: r.retail }] : []),
    { key: "myslip", label: "My Slip", icon: Receipt, run: r.mySlip },
    ...(c.languageName != null ? [{ key: "language", label: "Language", sub: c.languageName, icon: Languages, keepOpen: true, run: r.language }] : []),
    { key: "manager", label: "Manager", icon: KeyRound, run: r.manager },
    ...(c.offline ? [] : [{ key: "refresh", label: "Hard Refresh", sub: "Fix a page that won't load", icon: RefreshCw, run: r.refresh }]),
  ];
  const manager: StaffMenuTile[] = [
    { key: "settings", label: "Settings", icon: Settings, run: r.settings },
    { key: "possetup", label: "Front Desk Setup", sub: "Tax, card, drawer, tips", icon: ClipboardList, run: r.posSetup },
    ...(c.pos ? [{ key: "register", label: "Cash Drawer", sub: c.drawerOpen ? "Open" : "Closed", icon: Wallet, run: r.cashDrawer }] : []),
    { key: "messages", label: "Messages", icon: Bell, run: r.messages },
    { key: "keygrid", label: "Key Grid", sub: "Arrange the front desk keys", icon: LayoutGrid, run: r.keyGrid },
    ...(c.turnSystem ? [{ key: "turnrotation", label: "Turn Rotation", sub: "How turns are counted", icon: RotateCcw, run: r.turnRotation }] : []),
    { key: "servicetimes", label: "Service Times", sub: "Actual vs planned", icon: Clock, run: r.serviceTimes },
    { key: "managerpin", label: "Manager PIN", sub: "Change the PIN for this menu", icon: KeyRound, run: r.managerPin },
    { key: "lockscreen", label: "Lock Screen", icon: Lock, keepOpen: true, run: r.lockScreen,
      sub: c.lockScreen.saving ? "Saving…" : c.lockScreen.on ? `On · ${c.idName} to use the front desk` : "Off · no sign-in" },
    ...(c.printer.available ? [{
      key: "printer", icon: Printer, label: "Printer", run: r.printer,
      sub: c.printer.connected ? `${c.printer.deviceName?.split(" ")[0] ?? "Printer"} · connected` : c.printer.status === "connecting" ? "Connecting…" : c.printer.status === "error" ? "Error · retry" : "Tap to connect",
    }] : []),
    // Pairing this station's customer screen (owner, 2026-11-02: in the Manager menu, not More).
    ...(c.multiStation ? [{ key: "station", icon: CreditCard, label: "Station", sub: c.stationName ?? "None", run: r.station }] : []),
    ...(c.multiStation ? [{ key: "mystation", label: "Change Station", sub: c.stationName ?? "None", icon: CreditCard, run: r.changeStation }] : []),
    ...(c.pos && c.multiStation && c.registerId > 0 ? [{ key: "stationdrawer", label: "Station Drawer", sub: c.stationDrawerName ?? "None", icon: Wallet, run: r.stationDrawer }] : []),
    { key: "techidprint", label: `${c.idName} Print`, icon: Printer, run: r.idPrint },
    { key: "reports", label: "Reports", icon: BarChart3, run: r.reports },
  ];
  return { more, manager };
}
