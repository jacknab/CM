/**
 * NailHome — /nail, the simplified staff screen for nail-salon accounts.
 *
 * Sits on top of the normal Certxa engine: tickets are appointments, technician
 * choice is the TURN queue, checkout is the POS tab itself (CheckoutMode). This
 * file only owns the screen state and wires the pieces together.
 */
import { appPage } from "@/lib/appProfile";
import { localHub, relayCheckoutEvent } from "@/lib/local-hub";
import { OfflineLimitLock } from "@/components/offline/OfflineLimitLock";
import { EMPTY_ARRAY } from "@/lib/empty";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, Clock, RotateCcw, CreditCard, RefreshCw, Gift, KeyRound, Languages, LayoutGrid, Loader2, Lock, LockKeyhole, Printer, Receipt, Search, Settings, ShoppingBag, CalendarPlus, Wallet } from "lucide-react";
import { useNailText, type NailLang } from "./i18n";
import { SlipTechIdSheet, TechSlipSheet } from "./TechSlipSheet";
import { useSelectedStore } from "@/hooks/use-store";
import { useAuth } from "@/hooks/use-auth";
import { useServices } from "@/hooks/use-services";
import { usePackages } from "@/hooks/use-packages";
import { useAddons, useAddonsForService, useServiceCategories } from "@/hooks/use-addons";
import { useActiveRegisterId } from "@/hooks/use-registers";
import { useActiveDrawerId } from "@/hooks/use-cash-drawers";
import { useFeatureFlags, isNailSalonBiz } from "@/hooks/use-features";
import { useSettingsSync } from "@/hooks/use-settings-sync";
import { useThermalPrinter } from "@/hooks/use-thermal-printer";
import { useToast } from "@/hooks/use-toast";
import { OpenRegisterModal } from "@/components/cash/OpenRegisterModal";
import { DayCloseModal } from "@/components/cash/DayCloseModal";
import { dayCloseDue, type DayHours } from "@/lib/autoDayClose";
import { useStoreNetworkReport } from "@/hooks/use-store-network-report";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { hardRefresh } from "@/lib/hard-refresh";
import { installRequestDeadline } from "@/lib/request-deadline";
import { serveKioskOverHub, hubTicketNumber } from "@/lib/kiosk-hub";
import { startSalonMirror } from "@/lib/salon-mirror";
import { clearForeignTurnEvents, startTurnSharing } from "@/lib/nail-offline/turnShare";
import { getDeviceId } from "@/lib/device-id";
import { findClientId } from "./clientLookup";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { syncEngine } from "@/lib/sync-engine";
import { nailOffline, setNailOfflineStore, isLocalId, isNetworkFailure, newIdempotencyKey, type TicketRecord } from "@/lib/nail-offline";
import { archivedTicket, refreshTicketArchive } from "./ticketArchive";
import { reprintLastReceipt } from "./receiptReprint";
import { nailAdjustment } from "./ticketDraft";
import { buildCheckinTicket } from "@/lib/thermalPrinter";
import { ChooseClientPanel } from "@/components/staff-screen/ChooseClientPanel";
import { ClientLookupSheet } from "@/components/staff-screen/ClientLookupSheet";
import { ManagerPinSheet } from "@/components/staff-screen/ManagerPinSheet";
import { TimeClockSheet } from "@/components/staff-screen/TimeClockSheet";
import { TurnPageModal } from "@/components/staff-screen/TurnPage";
import { VoucherRedeemSheet } from "@/components/staff-screen/VoucherRedeemSheet";
import { useStaffList } from "@/hooks/use-staff";
import { getNowInTimezone } from "@/lib/timezone";
import {
  ApiError, boardKey, cancelTicket, checkoutRequestKey, claimKioskPrintJob, completeTicket, createTicket, fetchBoard, fetchCalendarBoardBookings, fetchClient, fetchUpcoming,
  clockInTech, clockOutTech, textClientReady, fetchNailConfig, fetchPosGrid, fetchScreenSettings, fetchTurn, reassignTicket, savePosGrid, saveScreenSettings, removeMarker, resolveMarkerClient, startTicket, updateTicket,
  type BoardMarker, type BoardTicket, type ClientSummary, type FinalizeData, type TechSignIn, type TurnEarned, type TurnTech,
 keptOnDevice, keepNailConfig, queueBooking, clientOnDevice, todaysBookingOnDevice, waitOnDevice, ownTurnEvents, splitTicketService, markTicketDone,} from "./nailApi";
import { defaultPick, draftTotals, EMPTY_PICK, type DraftCustomLine, type NailPick, type TicketLine } from "./ticketDraft";
import { useNailRealtime } from "./useNailRealtime";
import { TicketPanel } from "./TicketPanel";
import { CatalogPanel, Keypad, type CatalogGroup, type CatalogService, type CheckoutFn } from "./CatalogPanel";
import { openCashDrawerHardware, recordNoSale } from "@/lib/cashDrawer";
import { resumeOrSignIn } from "@/lib/resumeSignIn";
import { CheckInLookup } from "./CheckInLookup";
import { TechClockInSheet } from "./TechClockInSheet";
import { TechClockOutSheet } from "./TechClockOutSheet";
import { GiftCardSheet } from "./GiftCardSheet";
import { useAppointmentSSE } from "@/hooks/use-appointment-sse";
import { TechCards } from "./TechCards";
import { QueueTab, type QueueView } from "./QueueTab";
import "./nail.css";
import { AssignTechSheet } from "./AssignTechSheet";
import { TicketPopup } from "./TicketPopup";
import { ReceiptDialog } from "./ReceiptDialog";
import { LookupByNumberDialog } from "./LookupByNumberDialog";
import { TicketStatusDialog, type LookupTicketStatus } from "./TicketStatusDialog";
import { BottomNav, type NailTab } from "./BottomNav";
import { TechIdGate } from "./TechIdGate";
import { OfflineQueueSheet } from "./OfflineQueueSheet";
import { TurnEarnedPopup } from "./TurnEarnedPopup";
import { ChangeManagerPinSheet } from "./ChangeManagerPinSheet";
import { TurnRotationSheet } from "./TurnRotationSheet";
import { ServiceTimesSheet } from "./ServiceTimesSheet";
import { BookingPanel, type BookingSlot } from "./BookingPanel";
import { GridEditor } from "./GridEditor";
import { RegisterPicker } from "./RegisterPicker";
import { PairCustomerScreenDialog, StationsFullBanner } from "@/components/pos/PairCustomerScreen";
import { MoreMenu, type MoreTile } from "./MoreMenu";
import { calendarBookingsForBoard, hasNewWaitingEntityForPhone, waitingEntityKeys } from "./boardView";
import { printNativeCheckinTicket, slipServiceNames } from "@/lib/native-checkin-ticket";
import type { SalesTaxSettings } from "@shared/nailCheckout";

// The checkout screen is loaded on its own. It is fetched as soon as this screen opens, not on the first
// tap of CHECKOUT, so it is already on the tablet when the network drops.
const loadCheckoutMode = () => import("./CheckoutMode");
/** A ticket's date as the server's ticket # lookup writes it ("Tue, Oct 14, 3:05 PM"). */
const lookupDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Unknown date" : d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

// Before this screen's first request: no tap waits on a server that cannot be reached
// (lib/request-deadline.ts), one quick check says at once whether the server answers, and the tablet keeps
// checking so a dropped internet is noticed within seconds instead of on the next tap.
installRequestDeadline();
void syncEngine.checkNow();
syncEngine.watchReachability();
const CheckoutMode = lazy(() => loadCheckoutMode().then((module) => ({ default: module.CheckoutMode })));

type Assigning = { mode: "assign" | "reassign"; ticket: BoardTicket } | null;

export default function NailHome() {
  useEffect(() => { void loadCheckoutMode().catch(() => {}); }, []);
  const { selectedStore } = useSelectedStore();
  const { user } = useAuth();
  const nailSalon = isNailSalonBiz((selectedStore as any)?.category);
  // Technician (staff-portal) logins have no store of their own — this screen is for the front desk.
  if (!selectedStore && (user as any)?.staffId) return <Navigate to="/calendar" replace />;
  if (!selectedStore) {
    return <main className="dark cx-cal nail-app h-app w-full flex items-center justify-center"><h1 className="sr-only">Nail salon front desk</h1><Loader2 className="w-7 h-7 animate-spin" style={{ color: "#8b94a0" }} /></main>;
  }
  if (!nailSalon) return <Navigate to="/calendar" replace />;
  const st = selectedStore as any;
  const storeCityStateZip = [st.city, [st.state, st.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || undefined;
  return (
    <NailScreen
      storeId={selectedStore.id}
      storeName={st.name ?? ""}
      storeAddress={st.address || undefined}
      storeCityStateZip={storeCityStateZip}
      storePhone={st.phone || undefined}
      timezone={st.timezone ?? "UTC"}
      salesTax={{ rate: Number(st.salesTaxRate ?? 0) || 0, services: st.taxServicesTaxable === true, products: st.taxProductsTaxable !== false }}
      cashDiscountPct={Number((st as any).cashDiscountPercent ?? 0) || 0}
      bookingSlug={st.bookingSlug ?? ""}
    />
  );
}

const LANG_ORDER: NailLang[] = ["en", "vi", "es"];
const LANG_NAMES: Record<NailLang, string> = { en: "English", vi: "Tiếng Việt", es: "Español" };

function NailScreen({ storeId, storeName, storeAddress, storeCityStateZip, storePhone, timezone, salesTax, cashDiscountPct, bookingSlug }: {
  /** The salon's booking address, used to ask for open times when booking a future visit. */
  bookingSlug: string;
  storeId: number; storeName: string; storeAddress?: string; storeCityStateZip?: string; storePhone?: string; timezone: string; salesTax: SalesTaxSettings;
  /** Cash price: percent off a ticket paid entirely in cash. 0 = off. */
  cashDiscountPct: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Something done on this tablet offline that the server refused when it was sent (a booking whose time was
  // taken meanwhile): the front desk has to act on it, so it stays on screen until closed.
  useEffect(() => syncEngine.onConflict((_kind, detail) => {
    if (detail) toast({ title: "Needs attention", description: detail, variant: "destructive", duration: 24 * 60 * 60_000 });
  }), [toast]);
  const { user } = useAuth();
  const features = useFeatureFlags();
  const thermalPrinter = useThermalPrinter();
  const navigate = useNavigate();
  const {
    registerId, needsPicker: needsRegisterPicker, registers: registerOptions, takenRegisters, selectRegister,
    isMultiStation, currentRegisterName, resetRegister, stationsFull, isMainStation,
  } = useActiveRegisterId(storeId);
  // POS #1 runs the salon's local hub; any other POS station connects to it, so the POS tablets share one turn
  // line offline. Remembered on the tablet: after a restart with no internet it still knows which it is.
  const hubRoleKey = `certxa.hub.role.${storeId}`;
  const hubRole: "pos" | "station" = (() => {
    if (isMainStation != null) return isMainStation ? "pos" : "station";
    try { return localStorage.getItem(hubRoleKey) === "station" ? "station" : "pos"; } catch { return "pos"; }
  })();
  useEffect(() => {
    if (isMainStation == null) return;
    try { localStorage.setItem(hubRoleKey, isMainStation ? "pos" : "station"); } catch { /* storage unavailable */ }
  }, [isMainStation, hubRoleKey]);
  // The Station tile pairs this tablet's customer screen (it used to reset the station).
  const [pairScreenOpen, setPairScreenOpen] = useState(false);
  // Same duties the calendar screen has, so /kiosk and /frontdesk behave identically when this is the screen left open all day.
  useStoreNetworkReport(storeId);
  // A kiosk / front-desk check-in or an auto no-show moves the board without a socket event — the calendar's SSE feed.
  useAppointmentSSE(storeId);
  const printRef = useRef<((bytes: Uint8Array) => Promise<void>) | null>(null);
  printRef.current = thermalPrinter.isConnected ? thermalPrinter.print : null;
  const { drawerId, needsPicker: needsDrawerPicker, drawers, selectDrawer } = useActiveDrawerId(storeId);

  // ── screen state ──────────────────────────────────────────────────────────
  const [tab, setTab] = useState<NailTab>("queue");
  // Who is at the POS right now. Nobody → the Tech ID keypad. For a technician it comes back after each saved ticket or
  // checkout; for the front desk (reception / manager / owner) only after two idle minutes.
  const [tech, setTech] = useState<TechSignIn["staff"] | null>(null);
  // More → My Slip: whose slip is open, or asking for a Tech ID when no technician is signed in.
  const [slipFor, setSlipFor] = useState<{ id: number; name: string } | null>(null);
  const [slipAsk, setSlipAsk] = useState(false);
  const { lang, setLang, t: nailText } = useNailText();
  // The full Turn page, opened from the top of the lock screen's turn queue.
  const [showTurnPage, setShowTurnPage] = useState(false);
  const { data: turnStaffList } = useStaffList();
  const { data: turnAppointments } = useQuery({
    queryKey: ["/api/appointments", "nail-turn-page", storeId],
    queryFn: fetchCalendarBoardBookings,
    enabled: showTurnPage,
    refetchInterval: 30_000,
  });
  const techRef = useRef(tech);
  techRef.current = tech;
  // "Ticket #12 assigned to Mia" — shown for five seconds after a saved ticket goes to a free technician.
  const [startedNotice, setStartedNotice] = useState<Array<{ ticketNumber: number; serviceName: string; staffName: string | null; appointmentId: number; clientName?: string; started?: boolean }> | null>(null);
  const [assignedNotice, setAssignedNotice] = useState<{ clientName: string | null; ticketNumber: number | null; staffName: string } | null>(null);
  const [client, setClient] = useState<ClientSummary | null>(null);
  // Booking a future visit on the ticket screen: the services as for a ticket, then PICK TIME swaps the service
  // keys for day / time / technician keys (BookingPanel), and BOOK saves it. Null = building a walk-in ticket.
  const [booking, setBooking] = useState<{ step: "services" | "time"; slot: BookingSlot | null } | null>(null);
  const [checkinId, setCheckinId] = useState<number | null>(null);
  const [service, setService] = useState<CatalogService | null>(null);
  // Further services on the same ticket. Add-ons and nail options belong to the first service.
  const [extraServices, setExtraServices] = useState<CatalogService[]>([]);
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [pick, setPick] = useState<NailPick>(EMPTY_PICK);
  const [customs, setCustoms] = useState<DraftCustomLine[]>([]);
  const customSeq = useRef(0);
  // A Catalog package on the new ticket: its first service is `service`, the rest are in `extraServices`, its
  // add-ons in `addonIds` and its price line in `customs`. Taking any part of it off takes the package off.
  const [pkg, setPkg] = useState<{ id: number; name: string; serviceIds: number[]; addonIds: number[] } | null>(null);
  // The service line chosen for Split Ticket (its key in the ticket panel).
  const [splitKey, setSplitKey] = useState<string | null>(null);
  // The category the grid opens on for this ticket (the one the client picked at check-in).
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState("");
  const [moreAddons, setMoreAddons] = useState(false);
  const [editing, setEditing] = useState<BoardTicket | null>(null);
  // The ticket whose card is open. It opens over whatever screen it was tapped on (Techs, mostly) and closes back to that same screen.
  const [popupId, setPopupId] = useState<number | null>(null);
  const [queueView, setQueueView] = useState<QueueView | null>(null);
  // The More popup: its own tiles, or — behind the manager PIN — the Manager tab's.
  const [showMore, setShowMore] = useState<false | "more" | "manager">(false);
  const [showGift, setShowGift] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  // "PAY NOW": create the ticket, then open it for payment in this tab.
  const payAfterCreate = useRef(false);
  // A ticket someone tried to pay before it had a technician: once one is assigned, carry on to its checkout.
  const payAfterAssign = useRef<number | null>(null);
  // Techs page: a clocked-out tech's card was tapped → offer to set them In. `assumedIn` shows them In & Available at once,
  // until the server's answer (also pushed to every other station) arrives.
  const [clockInFor, setClockInFor] = useState<TurnTech | null>(null);
  const [clockOutFor, setClockOutFor] = useState<TurnTech | null>(null);
  const [assumedIn, setAssumedIn] = useState<number[]>([]);
  // The client is typing their number on /frontdesk right now (drives the overlay on the Check-In page). Self-clears if the
  // "stopped typing" message is ever lost, so a stale overlay can't stay up.
  const [clientTyping, setClientTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFrontdeskTyping = useCallback((typing: boolean) => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    setClientTyping(typing);
    if (typing) typingTimer.current = setTimeout(() => setClientTyping(false), 20_000);
  }, []);
  useEffect(() => () => { if (typingTimer.current) clearTimeout(typingTimer.current); }, []);
  // Every time the Check-In page opens or closes, start from "not typing" — never inherit a stale overlay.
  useEffect(() => { onFrontdeskTyping(false); }, [showCheckIn, onFrontdeskTyping]);
  const [sheet, setSheet] = useState<null | "voucher" | "timeclock" | "dayclose" | "clients" | "manager" | "turns" | "servicetimes">(null);
  const [assigning, setAssigning] = useState<Assigning>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignNeedsReason, setAssignNeedsReason] = useState(false);
  const [pinChange, setPinChange] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [frontdeskPhone, setFrontdeskPhone] = useState("");
  // The ticket being paid in the POS tab (null = the POS tab is the ticket builder). A new customer-screen event arrives as a new object.
  const [checkout, setCheckout] = useState<BoardTicket | null>(null);
  // The ticket being paid as the board has it right now (for changing its service from the payment screen).
  const liveCheckoutRef = useRef<BoardTicket | null>(null);
  const [checkoutEvent, setCheckoutEvent] = useState<{ type: string; [k: string]: unknown } | null>(null);
  // True once the ticket is actually completed server-side — the checkout screen then shows Print/Text/No Receipt
  // instead of the payment buttons, and stays open until one of those is picked (see finishCheckout below).
  const [ticketPaid, setTicketPaid] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<BoardTicket | null>(null);
  // What the walk-in ticket(s) just paid earned in the turn rotation: held while the receipt is being chosen,
  // then shown (turnNotice) for a few seconds before the screen locks.
  const turnsEarned = useRef<TurnEarned[]>([]);
  const [turnNotice, setTurnNotice] = useState<TurnEarned[] | null>(null);
  const [showOpenRegister, setShowOpenRegister] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4500);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  // ── data ──────────────────────────────────────────────────────────────────
  const refreshSettings = useSettingsSync(true);
  // Another station changed a salon setting: the /nail ones (lock screen, key grid) are refreshed too.
  const refreshAll = useCallback(() => {
    refreshSettings();
    queryClient.invalidateQueries({ queryKey: ["/api/nail/screen-settings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/nail/pos-grid"] });
  }, [refreshSettings, queryClient]);
  // This is the salon's main screen: inside the Android app it accepts the customer screen and kiosk over
  // the salon's own Wi-Fi, so they keep working with it when the internet is down.
  useEffect(() => { void localHub.start(storeId, hubRole); }, [storeId, hubRole]);
  // The salon's whole account, copied to this tablet and kept in sync, for working with no internet.
  useEffect(() => startSalonMirror(storeId), [storeId]);
  // A waiting client was just given a technician: every POS station says so, over whatever it is showing —
  // the Tech ID keypad included — with Start Service on it. It closes by itself; the screen is left as it was.
  const [waitingAssigned, setWaitingAssigned] = useState<null | { appointmentId: number; ticketNumber: number | null; clientName: string; serviceName: string; staffName: string; started?: boolean }>(null);
  const signInNoticeUp = useRef(false);
  const onTicketAssigned = useCallback(async (appointmentId: number) => {
    // The station where the technician just signed in already shows "Your next client" for this.
    if (signInNoticeUp.current) return;
    try {
      const fresh = await queryClient.fetchQuery({ queryKey: boardKey(storeId), queryFn: fetchBoard, staleTime: 0 });
      const t = fresh.tickets.find((x) => x.id === appointmentId);
      if (!t || !t.staff || t.status !== "confirmed") return;
      setWaitingAssigned({ appointmentId, ticketNumber: t.ticketNumber, clientName: t.client.name, serviceName: t.service.name, staffName: t.staff.name });
    } catch { /* the Queue still shows it */ }
  }, [queryClient, storeId]);
  useEffect(() => {
    if (!waitingAssigned || waitingAssigned.started) return; // once started, the effect after `lock` closes it
    const timer = setTimeout(() => setWaitingAssigned(null), 10_000);
    return () => clearTimeout(timer);
  }, [waitingAssigned]);

  const live = useNailRealtime({
    storeId, registerId, refreshAll, onFrontdeskPhone: setFrontdeskPhone, onFrontdeskTyping, onTicketAssigned,
    onCheckoutEvent: (m) => setCheckoutEvent({ ...m }),
    // A browser kiosk's check-in slip is relayed to every station. It prints here only when this station can print —
    // the Android app's own (IP/USB) printer, or a Bluetooth printer connected in this browser — and wins the claim,
    // so the slip comes out once however many stations are open.
    onPrintJob: (data) => {
      if (data.jobType !== "checkin_ticket") return;
      const nativePrinter = !!(window as any).CERTXA_NATIVE_APP && !!(window as any).CERTXA_PRINT_BRIDGE;
      if (!nativePrinter && !printRef.current) return;
      const qrValue = String(data.bookingCode ?? `BK:${data.appointmentId}`);
      void (async () => {
        if (!(await claimKioskPrintJob(`ci:${data.appointmentId ?? qrValue}`))) return;
        try {
          if (nativePrinter && data.ticketNumber != null) {
            await printNativeCheckinTicket({ clientName: data.clientName ?? "Guest", ticketNumber: Number(data.ticketNumber), qrValue, todayCount: data.todayCount, services: slipServiceNames(data.services) });
            return;
          }
          const bytes = buildCheckinTicket({
            storeName: data.storeName ?? "", clientName: data.clientName ?? "Guest", staffName: data.staffName,
            services: data.services ?? [], appointmentId: data.appointmentId, ticketNumber: data.ticketNumber,
            bookingCode: qrValue, timeStr: data.timeStr ?? "", dateStr: data.dateStr ?? "",
          });
          await printRef.current?.(bytes);
        } catch { /* a bad ticket must never break the screen */ }
      })();
    },
  });

  // ── Offline (lib/nail-offline): what this device holds is filed under the salon it is signed in to. Anything
  // saved on the device redraws the board at once, and the queue is sent as soon as the server answers again.
  setNailOfflineStore(storeId);
  // No tap waits on a server that cannot be reached (lib/request-deadline.ts), and the tablet notices a dropped
  // internet within seconds instead of on the next tap.
  const [queued, setQueued] = useState({ pending: 0, attention: 0, cash: { count: 0, amount: 0 } });
  const [recovery, setRecovery] = useState({ signIn: false, storage: false });
  useEffect(() => {
    const refresh = () => {
      void nailOffline.counts(storeId).then(setQueued).catch(() => {});
      setRecovery({ signIn: syncEngine.needsSignIn(), storage: !!nailOffline.storageProblem() });
      queryClient.invalidateQueries({ queryKey: boardKey(storeId) });
    };
    refresh();
    // Can this tablet save at all? If not, say so before anyone relies on it.
    void nailOffline.health().then(() => setRecovery({ signIn: syncEngine.needsSignIn(), storage: !!nailOffline.storageProblem() }));
    void syncEngine.runSync(storeId);
    const offQueue = syncEngine.onQueueChange(refresh);
    const offLocal = nailOffline.onChange(refresh);
    return () => { offQueue(); offLocal(); };
  }, [storeId, queryClient]);

  // While the live connection is up the server pushes every change, so asking again on a timer is only a
  // safety net. Without it the screen asks as often as before.
  const pollMs = live ? 300_000 : 30_000;
  const settingsPollMs = live ? 300_000 : 60_000;
  const { data: board, error: boardError } = useQuery({
    queryKey: boardKey(storeId),
    queryFn: fetchBoard,
    refetchInterval: pollMs,
    refetchOnWindowFocus: true,
    // Runs with no network too: the board then comes from this device (the default would just pause it).
    networkMode: "always",
  });
  // The board answering 401 means this device lost its sign-in to the salon's account. Nothing on this
  // screen can work until that is back, so sign the device back in (or go to the sign-in page) right away.
  useEffect(() => {
    if (boardError instanceof ApiError && boardError.status === 401) void resumeOrSignIn("/nail");
  }, [boardError]);
  const needsCalendarFallback = tab === "queue" && !!board && !board.dayBookings?.length &&
    (board.glance?.appointments ?? 0) > 0;
  const { data: calendarBookings, isPending: calendarFallbackPending, isError: calendarFallbackError } = useQuery({
    queryKey: ["/api/appointments", "nail-board-fallback", storeId],
    queryFn: fetchCalendarBoardBookings,
    enabled: needsCalendarFallback,
    refetchInterval: pollMs,
  });
  // The Appointments list on the Queue tab: every booked visit still to come, not only today's.
  const { data: upcoming, isPending: upcomingPending, isError: upcomingError } = useQuery({
    queryKey: ["/api/appointments", "nail-upcoming", storeId],
    queryFn: fetchUpcoming,
    enabled: tab === "queue",
    refetchInterval: pollMs,
  });
  const dayBookings = board?.dayBookings?.length ? board.dayBookings
    : needsCalendarFallback && calendarBookings
      ? calendarBookingsForBoard(calendarBookings, timezone, new Date(board?.now ?? Date.now()))
      : EMPTY_ARRAY;
  const tickets = board?.tickets ?? [];
  // Elapsed times ("waiting 12 min", "free for 25 min") are measured against the SERVER clock so two POS stations agree.
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  // Only a board fresh from the server tells the time: one shown from the device's saved copy carries the
  // moment it was saved, which would make every timer read as if no time had passed since. The last
  // measured difference is kept on the device so timers are right from the first second of an outage.
  useEffect(() => {
    if (board?.now && !board.cachedAt) {
      const offset = Date.parse(board.now) - Date.now();
      setClockOffsetMs(offset);
      nailOffline.setClockOffset(offset);
      try { localStorage.setItem("certxa.nail.clockOffsetMs", String(offset)); } catch { /* storage unavailable */ }
    }
  }, [board]);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("certxa.nail.clockOffsetMs"));
      if (Number.isFinite(saved) && saved !== 0) { setClockOffsetMs((cur) => (cur === 0 ? saved : cur)); nailOffline.setClockOffset(saved); }
    } catch { /* storage unavailable */ }
  }, []);
  const markers = board?.markers ?? [];
  const waitingCount = tickets.filter((t) => t.status === "confirmed").length + markers.length;

  // Technician status for the Techs tab — same TURN feed as the assign popup, kept live by the socket.
  const { data: techFeed, isLoading: techsLoading } = useQuery({
    queryKey: ["/api/turn/eligibility", storeId, "nail-techs"],
    queryFn: () => fetchTurn(storeId, null),
    // Also while locked: the Tech ID screen shows the turn queue.
    enabled: tab === "techs" || tab === "queue" || !tech,
    refetchInterval: pollMs,
    networkMode: "always",
  });
  const techList = techFeed?.technicians ?? EMPTY_ARRAY;
  // Once the server itself says they're in, stop assuming.
  useEffect(() => {
    setAssumedIn((cur) => { const next = cur.filter((id) => techList.find((t) => t.id === id)?.clockedIn === false); return next.length === cur.length ? cur : next; });
  }, [techList]);

  // Lock screen on / off for the whole salon (Manager tab). Off: no Tech ID keypad and no idle lock — the POS is
  // simply open, as it was before sign-in existed. The last known answer is kept on this device so a salon that
  // has it off doesn't see the keypad flash up while the page loads.
  const lockKey = `certxa.nail.lockScreen.${storeId}`;
  const screenKey = ["/api/nail/screen-settings", storeId];
  const { data: screenSettings } = useQuery({
    queryKey: screenKey, queryFn: fetchScreenSettings, refetchInterval: settingsPollMs, staleTime: 15_000,
    placeholderData: () => { try { return localStorage.getItem(lockKey) === "off" ? { lockScreen: false } : undefined; } catch { return undefined; } },
  });
  const lockEnabled = screenSettings?.lockScreen !== false;
  useEffect(() => {
    if (!screenSettings) return;
    try { localStorage.setItem(lockKey, screenSettings.lockScreen ? "on" : "off"); } catch { /* private mode */ }
  }, [screenSettings, lockKey]);
  const saveLock = useMutation({
    mutationFn: (lockScreen: boolean) => saveScreenSettings({ lockScreen }),
    onSuccess: (r) => { queryClient.setQueryData(screenKey, r); if (!r.lockScreen) setTech(null); say(r.lockScreen ? "Lock screen is on" : "Lock screen is off — no sign-in needed"); },
    onError: (err: any) => toast({ title: "Couldn't change the lock screen", description: err?.message, variant: "destructive" }),
  });

  // The key grid a manager arranged for the POS's right panel (null = filled automatically from the catalog).
  const posGridKey = ["/api/nail/pos-grid", storeId];
  const { data: posGrid } = useQuery({ queryKey: posGridKey, queryFn: fetchPosGrid, refetchInterval: settingsPollMs, staleTime: 15_000 });
  // The editor opens from the Manager tab, which is already behind the manager PIN.
  const [gridEditor, setGridEditor] = useState<null | "open">(null);
  const saveGrid = useMutation({
    mutationFn: savePosGrid,
    onSuccess: (r) => { queryClient.setQueryData(posGridKey, r); setGridEditor(null); say(r.config ? "Key grid saved" : "Key grid is automatic again"); },
    onError: (err: any) => toast({ title: "Couldn't save the key grid", description: err?.message, variant: "destructive" }),
  });

  const { data: services } = useServices();
  const { data: categories } = useServiceCategories();
  const { data: storeAddons } = useAddons();

  const groups = useMemo<CatalogGroup[]>(() => {
    const byId = new Map<number, { name: string; sortOrder: number }>();
    for (const c of (categories ?? []) as any[]) byId.set(c.id, { name: c.name, sortOrder: c.sortOrder ?? 9999 });
    const map = new Map<string, CatalogGroup & { sortOrder: number }>();
    for (const s of (services ?? []) as any[]) {
      if (s.isActive === false) continue;
      const cat = s.categoryId != null ? byId.get(s.categoryId) : undefined;
      const key = cat ? `cat:${s.categoryId}` : `legacy:${s.category}`;
      const g: CatalogGroup & { sortOrder: number } =
        map.get(key) ?? { key, name: cat?.name ?? s.category, sortOrder: cat?.sortOrder ?? 99999, services: [] };
      g.services.push({ id: s.id, name: s.name, duration: s.duration, price: s.price });
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [services, categories]);
  useEffect(() => {
    if (groups.length > 0 && !groups.some((g) => g.key === activeGroup)) setActiveGroup(groups[0].key);
  }, [groups, activeGroup]);
  // Catalog packages as one more category of the POS grid. A package key carries the package's id as a negative
  // number, so it is never taken for a service; only the grid (and its editor) see this group.
  const { data: packageList } = usePackages();
  const PACKAGES_GROUP = "packages";
  const gridGroups = useMemo<CatalogGroup[]>(() => {
    const known = new Set(groups.flatMap((g) => g.services.map((x) => x.id)));
    const keys = ((packageList ?? []) as any[])
      .filter((p) => p.isActive !== false && (p.items ?? []).some((i: any) => i.itemType === "service")
        && (p.items ?? []).every((i: any) => i.itemType !== "service" || known.has(Number(i.serviceId))))
      .map((p) => ({ id: -Number(p.id), name: String(p.name), duration: Number(p.duration) || 0, price: Number(p.price) || 0 }));
    return keys.length ? [...groups, { key: PACKAGES_GROUP, name: "Packages", services: keys }] : groups;
  }, [groups, packageList]);
  // Have every service's nail options on this tablet before they are needed, so any service can be rung
  // up with no connection — not only the ones someone happened to open while online. One at a time, and
  // only the ones this tablet does not hold yet.
  useEffect(() => {
    if (groups.length === 0) return;
    let stop = false;
    void (async () => {
      for (const svc of groups.flatMap((g) => g.services)) {
        if (stop || syncEngine.isOffline()) return;
        if (await keptOnDevice(`/api/services/${svc.id}/nail-config`)) continue;
        await keepNailConfig(svc.id).catch(() => {});
        await new Promise((r) => setTimeout(r, 250));
      }
    })();
    return () => { stop = true; };
  }, [groups]);

  const activeAddons = useMemo(() => ((storeAddons ?? []) as any[]).filter((a) => a.isActive !== false), [storeAddons]);

  // The kiosk and the customer screen, with no internet, ask this POS tablet over the salon hub
  // (lib/kiosk-hub.ts). Answered from what this tablet holds, the way it works offline itself; whatever it
  // makes is sent to the server when the connection is back.
  const hubCatalog = useRef({ services: [] as any[], addons: [] as any[], techs: [] as TurnTech[] });
  hubCatalog.current = { services: (services ?? []) as any[], addons: activeAddons, techs: techList };
  // Two or more POS tablets offline at once share one turn line over the salon hub (lib/nail-offline/turnShare.ts):
  // each sends what it did, and redraws its line when another's arrives. Online the server's line is used.
  useEffect(() => {
    const sharing = startTurnSharing({
      storeId, deviceId: getDeviceId(), ownEvents: () => ownTurnEvents(storeId), isOffline: () => syncEngine.isOffline(),
      onHeard: () => queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility"] }),
    });
    const offChange = nailOffline.onChange(() => sharing.share());
    const offStatus = syncEngine.onStatusChange((status) => {
      if (status === "offline") sharing.share();
      else if (status === "online") clearForeignTurnEvents(storeId);
    });
    return () => { sharing.stop(); offChange(); offStatus(); };
  }, [storeId, queryClient]);

  // Every past ticket kept on this tablet, so a ticket # can be looked up with no internet (ticketArchive.ts):
  // brought up to date on open, every 15 minutes, and when the connection comes back.
  useEffect(() => {
    const refresh = () => { if (!syncEngine.isOffline()) void refreshTicketArchive(storeId); };
    refresh();
    const timer = setInterval(refresh, 15 * 60_000);
    const offStatus = syncEngine.onStatusChange((status) => { if (status === "online") refresh(); });
    return () => { clearInterval(timer); offStatus(); };
  }, [storeId]);

  // Only POS #1 answers (one check-in, not one per POS tablet).
  useEffect(() => hubRole !== "pos" ? undefined : serveKioskOverHub({
    lookup: async (phone) => {
      const digits = phone.replace(/\D/g, "").slice(-10);
      if (digits.length !== 10) return { found: false };
      const id = await findClientId(storeId, digits);
      if (id == null) return { found: false };
      const c = await fetchClient(id).catch(() => clientOnDevice(id));
      if (!c) return { found: false };
      const client = { id: c.id, name: c.name };
      // Already on a ticket today (waiting or in the chair): nothing more to do, as online.
      const b = await fetchBoard().catch(() => null);
      if (b?.tickets.some((t) => t.client?.id === id && (t.status === "confirmed" || t.status === "started"))) return { found: true, client, alreadyOnTicket: true };
      // A booking today: they are here — on the waiting list now, and the server marks the booking arrived when it gets the check-in.
      const appt = await todaysBookingOnDevice(storeId, timezone, id);
      if (appt) {
        const { walkin, already } = await nailOffline.checkIn(storeId, { id, name: c.name, phone: digits });
        if (already) return { found: true, client, alreadyOnTicket: true };
        queryClient.invalidateQueries({ queryKey: boardKey(storeId) });
        return { found: true, client, todayAppointment: { ...appt, staffAvatarThumbUrl: null, ticketNumber: walkin.ticketNumber ?? null } };
      }
      return { found: true, client };
    },
    checkin: async (req) => {
      const digits = req.phone.replace(/\D/g, "").slice(-10);
      let client: { id: number; name: string; phone: string | null };
      if (req.clientId != null) {
        const c = await fetchClient(req.clientId).catch(() => clientOnDevice(req.clientId!));
        client = { id: req.clientId, name: c?.name ?? req.clientName, phone: digits || c?.phone || null };
      } else {
        const known = digits.length === 10 ? await findClientId(storeId, digits) : null;
        const made = known == null ? await nailOffline.createClient(storeId, req.clientName, digits) : null;
        client = made ? { id: made.id, name: made.name, phone: made.phone } : { id: known!, name: req.clientName, phone: digits };
      }
      const { services: svcs, addons, techs } = hubCatalog.current;
      const first = svcs.find((x) => x.id === req.serviceIds[0]);
      if (!first) {
        // No service chosen (the customer screen): on the waiting list, as a check-in at the desk.
        const { walkin } = await nailOffline.checkIn(storeId, client);
        queryClient.invalidateQueries({ queryKey: boardKey(storeId) });
        return { success: true, ticketNumber: walkin.ticketNumber ?? null, clientName: client.name, staffName: null };
      }
      // The same ticket the online kiosk makes: services, add-ons and nail options, to the technician asked for
      // (when they are in and do the service) or the next in turn.
      const extras = req.serviceIds.slice(1).map((id) => svcs.find((x) => x.id === id)).filter(Boolean) as any[];
      const chosenAddons = req.addonIds.map((id) => addons.find((x) => x.id === id)).filter(Boolean) as any[];
      const pick: NailPick = { size: req.nail.sizeId, shape: req.nail.shapeId, application: null, effect: req.nail.effectId };
      const nail = nailAdjustment(await fetchNailConfig(first.id).catch(() => null), pick);
      const price = (Number(first.price) || 0) + chosenAddons.reduce((sum, x) => sum + (Number(x.price) || 0), 0) + nail.price;
      const duration = (Number(first.duration) || 0) + chosenAddons.reduce((sum, x) => sum + (Number(x.duration) || 0), 0) + nail.duration;
      const wanted = req.staffId != null ? techs.find((t) => t.id === req.staffId) : undefined;
      const make = (staff: TurnTech | undefined) => createTicket({
        clientId: client.id, serviceId: first.id, addonIds: chosenAddons.map((x) => x.id), pick, customLines: [],
        staffId: staff?.id ?? null, autoAssign: !staff, ...(extras.length > 0 && { extraServiceIds: extras.map((x) => x.id) }),
      }, {
        storeId, client: { name: client.name, phone: client.phone },
        service: { name: first.name, price: Number(first.price) || 0, duration: Number(first.duration) || 0 },
        addons: chosenAddons.map((x) => ({ id: x.id, name: x.name, price: Number(x.price) || 0, duration: Number(x.duration) || 0 })),
        nailLines: nail.lines.map((l) => ({ label: l.label, price: l.price })), nailPriceAdjustment: nail.price,
        staff: staff ? { id: staff.id, name: staff.name, color: staff.color ?? null } : null,
        total: price, duration,
        extras: extras.map((x) => ({ id: x.id, name: x.name, price: Number(x.price) || 0, duration: Number(x.duration) || 0 })),
      });
      let made;
      try { made = await make(wanted); }
      catch (err) { if (!wanted) throw err; made = await make(undefined); } // the one asked for can't take it: the turn line decides
      queryClient.invalidateQueries({ queryKey: boardKey(storeId) });
      return { success: true, ticketNumber: made.ticketNumber ?? null, clientName: client.name, staffName: made.staffName ?? null };
    },
    wait: () => waitOnDevice(storeId),
    // The one tablet that gives out ticket numbers while the internet is down.
    ticketNumber: () => nailOffline.issueTicketNumber(storeId),
  }), [storeId, timezone, queryClient, hubRole]);
  // Another POS station takes its offline ticket numbers from the main POS, so no two tickets share one
  // (they are printed, so they can't be fixed later). The main POS gives them out itself.
  useEffect(() => {
    nailOffline.setTicketNumberSource(hubRole === "station" ? () => hubTicketNumber() : null);
    return () => nailOffline.setTicketNumberSource(null);
  }, [hubRole]);
  const { data: linkedAddons } = useAddonsForService(service?.id ?? null);
  const suggestedAddons = useMemo(() => {
    const linked = ((linkedAddons ?? []) as any[]).filter((a) => a.isActive !== false);
    return linked.length > 0 && service ? linked : activeAddons;
  }, [linkedAddons, activeAddons, service]);
  const shownAddons = moreAddons ? activeAddons : suggestedAddons.slice(0, 6);

  const { data: nailCfg = null, isLoading: nailLoading } = useQuery({
    queryKey: ["/api/services", service?.id, "nail-config"],
    queryFn: () => fetchNailConfig(service!.id),
    enabled: !!service,
    staleTime: 60_000,
  });

  // Start each newly chosen service on its default nail options (edit mode seeds its own).
  const pickSeededFor = useRef<number | null>(null);
  useEffect(() => {
    if (!service || nailLoading || pickSeededFor.current === service.id) return;
    pickSeededFor.current = service.id;
    // The default options belong to choosing the service: one undo takes both off.
    draftHistory.current.mergeNext = true;
    setPick(defaultPick(nailCfg));
  }, [service, nailCfg, nailLoading]);

  // ── Undo (the ↶ key under the keypad): each change to the ticket being built is kept, and ↶ puts the
  // ticket back the way it was before the last one. A new client or ticket starts a fresh history. ──
  type DraftSnapshot = { service: CatalogService | null; extraServices: CatalogService[]; addonIds: number[]; pick: NailPick; customs: DraftCustomLine[]; pkg: typeof pkg };
  const draftHistory = useRef<{ past: DraftSnapshot[]; current: DraftSnapshot | null; restoring: boolean; mergeNext: boolean; owner: string }>(
    { past: [], current: null, restoring: false, mergeNext: false, owner: "" });
  useEffect(() => {
    const h = draftHistory.current;
    const now: DraftSnapshot = { service, extraServices, addonIds, pick, customs, pkg };
    const owner = `${client?.id ?? ""}:${editing?.id ?? ""}`;
    if (owner !== h.owner) { h.owner = owner; h.past = []; h.current = now; h.mergeNext = false; h.restoring = false; return; }
    if (h.restoring) { h.restoring = false; h.current = now; return; }
    if (h.mergeNext) { h.mergeNext = false; h.current = now; return; }
    if (h.current) h.past = [...h.past.slice(-49), h.current];
    h.current = now;
  }, [service, extraServices, addonIds, pick, customs, pkg, client?.id, editing?.id]);
  // ── Split Ticket: a further service of a saved ticket comes off onto a ticket of its own, which waits in the Queue
  // with no technician until this ticket is done (server: nailTickets.splitServiceLine). ──
  const splittable = (line: TicketLine) => {
    if (line.kind === "service") return line.serviceId != null && line.key.startsWith("service-");
    const c = line.customId != null ? customs.find((x) => x.id === line.customId) : undefined;
    return !!c?.serviceId && !c.packageId;
  };
  /** The ticket on screen still matches the saved one (a split acts on the saved ticket). */
  const editUnchanged = (t: BoardTicket) => {
    const ids = (a: number[]) => JSON.stringify([...a].sort((x, y) => x - y));
    const lines = (l: { label: string; price: number; serviceId?: number; packageId?: number; isRetail?: boolean }[]) =>
      JSON.stringify(l.map((c) => [c.label, c.price, c.serviceId ?? null, c.packageId ?? null, !!c.isRetail]));
    return service?.id === t.service.id && ids(addonIds) === ids(t.addons.map((a) => a.id)) && lines(customs) === lines(t.customLines)
      && extraServices.length === 0
      && (pick.size ?? null) === (t.nail?.sizeId ?? null) && (pick.shape ?? null) === (t.nail?.shapeId ?? null)
      && (pick.application ?? null) === (t.nail?.applicationId ?? null) && (pick.effect ?? null) === (t.nail?.effectId ?? null);
  };
  const [splitting, setSplitting] = useState(false);
  const splitSelected = async () => {
    if (splitting) return;
    const line = splitKey ? draft.lines.find((l) => l.key === splitKey) : undefined;
    if (!line) { say("Tap the service to split off, then tap Split Ticket"); return; }
    if (!editing) { say("Save the ticket first, then open it to split it"); return; }
    const c = line.customId != null ? customs.find((x) => x.id === line.customId) : undefined;
    if (!c?.serviceId) { say("Choose one of the other services on the ticket"); return; }
    if (!editUnchanged(editing)) { say("Update the ticket first, then split it"); return; }
    const index = customs.indexOf(c);
    setSplitting(true);
    try {
      const r = await splitTicketService(editing.id, index);
      // Keep this edit in step with the saved ticket, which no longer has the service.
      setCustoms((cur) => cur.filter((x) => x.id !== c.id));
      setEditing((e) => (e ? { ...e, customLines: e.customLines.filter((_, i) => i !== index), duration: Math.max(1, e.duration - (Number(c.duration) || 0)) } : e));
      draftHistory.current.owner = "";
      setSplitKey(null);
      invalidateBoard();
      say(`Split · #${r.ticketNumber} ${r.serviceName} waits until #${editing.ticketNumber ?? editing.id} is done`);
    } catch (err: any) {
      toast({ title: "Couldn't split the ticket", description: err?.message, variant: "destructive" });
    } finally {
      setSplitting(false);
    }
  };
  const undoDraft = () => {
    const h = draftHistory.current;
    const prev = h.past[h.past.length - 1];
    if (!prev) { say("Nothing to undo"); return; }
    h.past = h.past.slice(0, -1);
    h.restoring = true;
    // The options come back as they were; they are not filled in again for the service.
    pickSeededFor.current = prev.service?.id ?? null;
    setService(prev.service); setExtraServices(prev.extraServices); setAddonIds(prev.addonIds); setPick(prev.pick);
    setCustoms(prev.customs); setPkg(prev.pkg);
    say("Undone");
  };

  const totals = useMemo(
    () => draftTotals(service, addonIds, activeAddons, nailCfg, pick, customs),
    [service, addonIds, activeAddons, nailCfg, pick, customs],
  );
  // The ticket as shown: the first service with its add-ons and options, then each further service.
  const draft = useMemo(() => {
    const several = extraServices.length > 0;
    const extraLines: TicketLine[] = extraServices.map((s) => ({
      key: `service-${s.id}`, kind: "service", label: s.name, duration: Number(s.duration) || 0, price: Number(s.price) || 0,
      serviceId: s.id, removable: true,
    }));
    const firstLines = totals.lines.map((l) => (l.kind === "service" ? { ...l, serviceId: service?.id, removable: several } : l));
    return {
      lines: [...firstLines, ...extraLines],
      price: totals.price + extraLines.reduce((sum, l) => sum + l.price, 0),
      duration: totals.duration + extraLines.reduce((sum, l) => sum + l.duration, 0),
      firstPrice: totals.price,
      firstDuration: totals.duration,
    };
  }, [totals, extraServices, service]);
  // A picked nail option (size/shape/art/effect) can vanish from the catalog mid-build if an admin
  // disables it on another register — draftTotals then silently drops its price/duration. Warn once
  // per occurrence rather than let the charge quietly come up short with no signal to staff.
  const warnedDropped = useRef<string>("");
  useEffect(() => {
    if (totals.dropped.length === 0) { warnedDropped.current = ""; return; }
    const key = totals.dropped.join(",");
    if (warnedDropped.current === key) return;
    warnedDropped.current = key;
    toast({ title: "A picked option is no longer available", description: `${totals.dropped.join(", ")} was removed from the catalog — reselect it or the price won't include it.`, variant: "destructive" });
  }, [totals.dropped, toast]);

  // ── ticket building ───────────────────────────────────────────────────────
  const resetDraft = useCallback(() => {
    setClient(null); setCheckinId(null); setService(null); setExtraServices([]); setAddonIds([]); setPick(EMPTY_PICK); setCustoms([]); setPkg(null); setOpenGroup(null); setSplitKey(null);
    setEditing(null); pickSeededFor.current = null; setMoreAddons(false); setBooking(null);
  }, []);

  // Done at the POS: a technician hands it back to the keypad; the front desk carries on.
  const lock = useCallback(() => {
    setPopupId(null); resetDraft(); setTab("queue");
    if (!techRef.current?.frontDesk) setTech(null);
  }, [resetDraft]);
  // Whoever is signed in: two minutes without a touch or a key brings the keypad back. (That is the only
  // lock the front desk gets; a technician is also locked out after each thing they do.) Nothing on screen
  // is reset, so whatever was open is still there after an ID is entered again.
  const signedIn = tech != null;
  // On the POS tab the wait is five minutes: a technician and their client talk through the ticket there,
  // and the screen must not lock in the middle of it.
  const idleLockMs = tab === "pos" ? 300_000 : 120_000;
  useEffect(() => {
    if (!signedIn) return;
    let timer = setTimeout(() => setTech(null), idleLockMs);
    const touched = () => { clearTimeout(timer); timer = setTimeout(() => setTech(null), idleLockMs); };
    window.addEventListener("pointerdown", touched, true);
    window.addEventListener("keydown", touched, true);
    return () => { clearTimeout(timer); window.removeEventListener("pointerdown", touched, true); window.removeEventListener("keydown", touched, true); };
  }, [signedIn, idleLockMs]);
  // The assigned-ticket notice closes itself after ten seconds, then the keypad comes back for the next
  // technician — whoever saved the ticket, front desk included. Once START is tapped it reads "Service
  // Started" and goes back to the lock screen after three seconds.
  useEffect(() => {
    if (!startedNotice) return;
    const timer = setTimeout(() => { setStartedNotice(null); lock(); setTech(null); }, startedNotice.some((t) => t.started) ? 3_000 : 10_000);
    return () => clearTimeout(timer);
  }, [startedNotice, lock]);
  // The same for the "assigned to you" notice: three seconds after START, back to the lock screen.
  useEffect(() => {
    if (!waitingAssigned?.started) return;
    const timer = setTimeout(() => { setWaitingAssigned(null); lock(); setTech(null); }, 3_000);
    return () => clearTimeout(timer);
  }, [waitingAssigned, lock]);
  // The "client assigned" notice after a Tech ID sign-in: five seconds over the queue, then the keypad
  // comes back for the next technician.
  // The technician's own sign-in notice takes the place of the station-wide one, whichever arrives first.
  useEffect(() => { signInNoticeUp.current = assignedNotice !== null; if (assignedNotice) setWaitingAssigned(null); }, [assignedNotice]);
  useEffect(() => {
    if (!assignedNotice) return;
    const timer = setTimeout(() => { setAssignedNotice(null); lock(); setTech(null); }, 5000);
    return () => clearTimeout(timer);
  }, [assignedNotice, lock]);

  const choosePackage = (packageId: number) => {
    if (editing) { say("A package goes on a new ticket"); return; }
    const p = ((packageList ?? []) as any[]).find((x) => Number(x.id) === packageId);
    const all = groups.flatMap((g) => g.services);
    const svcIds: number[] = (p?.items ?? []).filter((i: any) => i.itemType === "service").map((i: any) => Number(i.serviceId));
    const parts = svcIds.map((id) => all.find((x) => x.id === id));
    if (!p || parts.length === 0 || parts.some((x) => !x)) { say("That package isn't in the catalog any more"); return; }
    const pkgAddons: number[] = (p.items ?? []).filter((i: any) => i.itemType === "addon").map((i: any) => Number(i.addonId));
    // Whatever was on the ticket stays on it, after the package; a package already on it is replaced.
    const keepExtras = [...(pkg ? [] : service ? [service] : []), ...extraServices.filter((x) => !pkg?.serviceIds.includes(x.id))]
      .filter((x) => !svcIds.includes(x.id));
    setService(parts[0]!);
    setExtraServices([...parts.slice(1) as CatalogService[], ...keepExtras]);
    setAddonIds((cur) => [...new Set([...cur.filter((id) => !pkg?.addonIds.includes(id)), ...pkgAddons])]);
    setPick(EMPTY_PICK); pickSeededFor.current = null;
    const difference = Math.round((Number(p.price) - Number(p.listPrice)) * 100) / 100;
    customSeq.current += 1;
    const priceLine: DraftCustomLine[] = difference !== 0 ? [{ id: customSeq.current, label: `${p.name} package`, price: difference, packageId }] : [];
    setCustoms((cur) => [...cur.filter((c) => !c.packageId), ...priceLine]);
    setPkg({ id: packageId, name: String(p.name), serviceIds: svcIds, addonIds: pkgAddons });
  };
  // Taking off any part of the package takes the whole package off; what was added besides it stays.
  const dropPackage = () => {
    if (!pkg) return;
    const rest = extraServices.filter((x) => !pkg.serviceIds.includes(x.id));
    const [next, ...others] = rest;
    setService(next ?? null); setExtraServices(others);
    setAddonIds((cur) => cur.filter((id) => !pkg.addonIds.includes(id)));
    setCustoms((cur) => cur.filter((c) => !c.packageId));
    setPick(EMPTY_PICK); pickSeededFor.current = null;
    setPkg(null);
  };
  const chooseService = (svc: CatalogService) => {
    if (svc.id < 0) { choosePackage(-svc.id); return; }
    if (service?.id === svc.id) return;
    // A new ticket that already has a service gains another one; a saved ticket being edited holds one
    // service, so picking there still swaps it.
    if (service && editing === null) {
      setExtraServices((cur) => (cur.some((s) => s.id === svc.id) ? cur : [...cur, svc]));
      return;
    }
    setService(svc);
    pickSeededFor.current = null;
    if (editing === null) setPick(EMPTY_PICK);
  };
  const noSale = () => { void openCashDrawerHardware({ onThermalPrint: thermalPrinter.isConnected ? thermalPrinter.print : undefined }); recordNoSale({ drawerId, performedBy: tech?.name }); say("Cash drawer opened"); };
  const toggleAddon = (id: number) => setAddonIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const addCustom = (amount: number, qty: number, label?: string, isRetail?: boolean) => {
    customSeq.current += 1;
    setCustoms((cur) => [...cur, {
      id: customSeq.current,
      label: label ?? (qty > 1 ? `Custom Amount ×${qty}` : "Custom Amount"),
      price: Math.round(amount * qty * 100) / 100,
      isRetail,
    }]);
  };
  const removeLine = (line: TicketLine) => {
    if (pkg && ((line.kind === "service" && line.serviceId != null && pkg.serviceIds.includes(line.serviceId))
      || (line.addonId != null && pkg.addonIds.includes(line.addonId))
      || (line.customId != null && customs.some((c) => c.id === line.customId && c.packageId)))) { dropPackage(); return; }
    if (line.kind === "service" && line.serviceId != null) {
      if (extraServices.some((s) => s.id === line.serviceId)) { setExtraServices((cur) => cur.filter((s) => s.id !== line.serviceId)); return; }
      // Taking off the first service: the next one takes its place, with its own add-ons and nail options to choose.
      const [next, ...rest] = extraServices;
      if (!next) return;
      setService(next); setExtraServices(rest); setAddonIds([]); setPick(EMPTY_PICK); pickSeededFor.current = null;
      return;
    }
    if (line.customId != null) setCustoms((cur) => cur.filter((c) => c.id !== line.customId));
    else if (line.addonId != null) toggleAddon(line.addonId);
    else if (line.group) setPick((p) => ({ ...p, [line.group!]: null }));
  };

  const pickClient = async (clientId: number, marker?: number | null) => {
    try {
      setClient(await fetchClient(clientId));
      setCheckinId(marker ?? null);
      // The grid opens on the category the client picked at check-in, so the tech knows what they came for.
      const m = marker != null ? markers.find((x) => x.id === marker) : undefined;
      const wanted = m && (groups.find((g) => m.requestedCategoryId != null && g.key === `cat:${m.requestedCategoryId}`)
        ?? groups.find((g) => !!m.requestedCategory && g.name.trim().toLowerCase() === m.requestedCategory.trim().toLowerCase()));
      setOpenGroup(wanted?.key ?? null);
      if (wanted) setActiveGroup(wanted.key);
      setTab("pos");
    } catch (err: any) {
      toast({ title: "Couldn't load that client", description: err?.message, variant: "destructive" });
    }
  };

  const startEdit = (t: BoardTicket) => {
    const svc = groups.flatMap((g) => g.services).find((s) => s.id === t.service.id) ?? null;
    if (!svc) { toast({ title: "That service is no longer in the catalog", variant: "destructive" }); return; }
    setClient({ id: t.client.id ?? 0, name: t.client.name, phone: t.client.phone, loyaltyPoints: t.client.loyaltyPoints });
    setService(svc);
    pickSeededFor.current = svc.id;
    setAddonIds(t.addons.map((a) => a.id));
    // A service line (another service of the visit) keeps its service and time through the edit.
    setCustoms(t.customLines.map((c) => ({ id: ++customSeq.current, label: c.label, price: c.price, isRetail: c.isRetail,
      ...(c.serviceId ? { serviceId: c.serviceId, duration: c.duration } : {}), ...(c.packageId ? { packageId: c.packageId } : {}) })));
    setPick({ size: t.nail?.sizeId ?? null, shape: t.nail?.shapeId ?? null, application: t.nail?.applicationId ?? null, effect: t.nail?.effectId ?? null });
    setEditing(t);
    setSplitKey(null);
    setActiveGroup(groups.find((g) => g.services.some((s) => s.id === svc.id))?.key ?? activeGroup);
    setTab("pos");
  };

  const invalidateBoard = () => {
    queryClient.invalidateQueries({ queryKey: boardKey(storeId) });
    queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility"] });
    queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
  };

  // ── mutations ─────────────────────────────────────────────────────────────
  const customLines = useMemo(() => customs.map(({ label, price, isRetail, serviceId, duration, packageId }) => ({ label, price, isRetail,
    ...(serviceId ? { serviceId, duration } : {}), ...(packageId ? { packageId } : {}) })), [customs]);
  // Saving a ticket hands it to TURN: the next technician in line who can do the service gets it. It waits with
  // them until START is pressed. Nobody free → it waits, unassigned, and the next tech to finish a client picks it up.
  const checkinStaffId = checkinId != null ? markers.find((m) => m.id === checkinId)?.staffId ?? null : null;
  // One key per booking attempt: a request that reached the server but lost its answer, sent again, books once.
  const bookingKey = useRef(newIdempotencyKey("nail.booking"));
  const bookVisit = useMutation({
    mutationFn: async () => {
      if (!client || !service || !booking?.slot) throw new Error("Pick a time first");
      if (extraServices.length > 1) throw new Error("A booking can have up to 2 services.");
      if (pkg) throw new Error("A package can't be booked from here. Choose its services one by one.");
      const body = { clientId: client.id, serviceId: service.id, extraServiceId: extraServices[0]?.id ?? null, addonIds,
        staffId: booking.slot.staffId, extraStaffId: booking.slot.extraStaffId ?? null, date: booking.slot.time };
      // No connection (or a client made offline): kept on this tablet and sent when the connection is back.
      const onDevice = async () => {
        const extraDuration = Number(extraServices[0]?.duration ?? 0) || 0;
        await queueBooking(storeId, body, { duration: draft.duration, extraDuration }, `${client.name} · ${bookingLabel(booking.slot!)}`, bookingKey.current);
        return { offline: true };
      };
      if (syncEngine.isOffline() || isLocalId(client.id)) return onDevice();
      let res: Response;
      try {
        res = await fetch("/api/nail/bookings", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Idempotency-Key": bookingKey.current },
          body: JSON.stringify(body),
        });
      } catch (err) {
        if (isNetworkFailure(err)) return onDevice();
        throw err;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Could not save the booking");
      return data;
    },
    onSuccess: (data: any) => {
      const slot = booking?.slot;
      bookingKey.current = newIdempotencyKey("nail.booking");
      say(`Booked ${client?.name.split(" ")[0] ?? "client"} · ${slot ? bookingLabel(slot) : ""}${data?.offline ? " · sent when the connection is back" : ""}`);
      resetDraft(); invalidateBoard(); setTab("queue");
    },
    onError: (err: any) => { toast({ title: "Not booked", description: err?.message, variant: "destructive" }); setBooking((b) => (b ? { ...b, slot: null } : b)); },
  });
  /** "Sat, Oct 18 · 10:30 AM · Amy" (and the second technician, when the visit is split). */
  const bookingLabel = (slot: BookingSlot) => {
    const when = new Date(slot.time).toLocaleString("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return `${when} · ${slot.staffName}${slot.extraStaffName && slot.extraStaffName !== slot.staffName ? ` then ${slot.extraStaffName}` : ""}`;
  };

  const create = useMutation({
    // With no network the ticket is saved on this device instead (the default would hold the save back).
    networkMode: "always",
    mutationFn: () => {
      const nail = nailAdjustment(nailCfg, pick);
      const held = checkinStaffId != null ? techList.find((t) => t.id === checkinStaffId) : undefined;
      // A client the front desk check-in already handed to a technician stays with that technician;
      // everyone else goes to the next technician in turn, as before.
      // A package: the server makes its further services and its price line from the catalog; the same lines made
      // here are only for a ticket saved on this tablet. Services added besides the package travel as usual.
      const pkgExtras = pkg ? extraServices.filter((x) => pkg.serviceIds.includes(x.id)) : [];
      const otherExtras = pkg ? extraServices.filter((x) => !pkg.serviceIds.includes(x.id)) : extraServices;
      const pkgPriceLines = customLines.filter((c) => c.packageId);
      const packageLines = pkg ? [...pkgExtras.map((x) => ({ label: x.name, price: Number(x.price) || 0, serviceId: x.id, duration: Number(x.duration) || 0 })), ...pkgPriceLines] : undefined;
      return createTicket({ clientId: client!.id, serviceId: service!.id, addonIds, pick, customLines: pkg ? customLines.filter((c) => !c.packageId) : customLines,
        staffId: checkinStaffId, autoAssign: checkinStaffId == null, checkinId,
        ...(pkg && { packageId: pkg.id, packageLines }),
        ...(otherExtras.length > 0 && { extraServiceIds: otherExtras.map((s) => s.id) }) }, {
        extras: otherExtras.map((s) => ({ id: s.id, name: s.name, price: Number(s.price) || 0, duration: Number(s.duration) || 0 })),
        storeId,
        client: { name: client!.name, phone: client!.phone },
        service: { name: service!.name, price: Number(service!.price) || 0, duration: Number(service!.duration) || 0 },
        addons: addonIds.map((id) => activeAddons.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a)
          .map((a) => ({ id: a.id, name: a.name, price: Number(a.price) || 0, duration: Number(a.duration) || 0 })),
        nailLines: nail.lines.map((l) => ({ label: l.label, price: l.price })),
        nailPriceAdjustment: nail.lines.reduce((sum, l) => sum + l.price, 0),
        staff: held ? { id: held.id, name: held.name, color: held.color ?? null } : null,
        // The package's price line is in packageLines, not in this ticket's own amount.
        total: Math.round((draft.firstPrice - pkgPriceLines.reduce((n, c) => n + c.price, 0)) * 100) / 100, duration: draft.firstDuration,
      });
    },
    onSuccess: (r) => {
      invalidateBoard();
      // Saved on this device, not sent yet: it is on the board, and it is paid once the server has it.
      if (r.offline) {
        payAfterCreate.current = false;
        const savedService = service?.name ?? "Service";
        const savedClient = client?.name;
        resetDraft();
        setTab("queue");
        say("Ticket saved on this tablet · it will be sent when the connection is back");
        // The same notice as online: the ticket's number, its service and who it went to.
        setStartedNotice([{ ticketNumber: r.ticketNumber, serviceName: savedService, staffName: r.staffName, appointmentId: r.appointmentId, clientName: savedClient }]);
        return;
      }
      const shouldPay = payAfterCreate.current;
      payAfterCreate.current = false;
      if (shouldPay) void openTicketForCheckout(r.appointmentId);
      else setTab("queue");
      say(r.staffName
        ? `Ticket #${r.ticketNumber} · ${r.staffName} · ${r.waiting ? `waiting, starts about ${new Date(r.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : r.status === "started" ? "in service" : "assigned"}`
        : `Ticket #${r.ticketNumber} is waiting · no technician free yet`);
      if (shouldPay) resetDraft();
      // Show who each service went to for ten seconds before the keypad returns.
      else {
        const saved = r.tickets ?? [{ ticketNumber: r.ticketNumber, serviceName: service?.name ?? "Service", staffName: r.staffName, appointmentId: r.appointmentId }];
        const savedClient = client?.name;
        resetDraft();
        setStartedNotice(saved.map((t) => ({ ticketNumber: t.ticketNumber, serviceName: t.serviceName, staffName: t.staffName, appointmentId: t.appointmentId, clientName: savedClient })));
      }
    },
    onError: (err: any) => {
      payAfterCreate.current = false;
      const message = err instanceof ApiError ? err.message : "Couldn't create the ticket. Try again.";
      toast({ title: "Couldn't save the ticket", description: message, variant: "destructive" });
    },
  });

  const update = useMutation({
    networkMode: "always",
    mutationFn: () => {
      const nail = nailAdjustment(nailCfg, pick);
      return updateTicket(editing!.id, { serviceId: service!.id, addonIds, pick, customLines }, editing!, {
        storeId,
        service: { name: service!.name, price: Number(service!.price) || 0, duration: Number(service!.duration) || 0 },
        addons: addonIds.map((id) => activeAddons.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a)
          .map((a) => ({ id: a.id, name: a.name, price: Number(a.price) || 0, duration: Number(a.duration) || 0 })),
        nailLines: nail.lines.map((l) => ({ label: l.label, price: l.price })),
        nailPriceAdjustment: nail.lines.reduce((sum, l) => sum + l.price, 0),
        total: totals.price, duration: totals.duration,
      });
    },
    onSuccess: (r) => { invalidateBoard(); say(r.offline ? "Ticket updated on this tablet · it will be sent when the connection is back" : "Ticket updated"); resetDraft(); setTab("queue"); },
    onError: (err: any) => toast({ title: "Couldn't update the ticket", description: err?.message, variant: "destructive" }),
  });

  const reassign = useMutation({
    networkMode: "always",
    mutationFn: (v: { id: number; staffId: number; reason?: string }) => {
      const who = techList.find((t) => t.id === v.staffId);
      const whose = tickets.find((t) => t.id === v.id)?.client.name;
      return reassignTicket(v.id, v.staffId, who ? { name: who.name, color: who.color ?? null } : undefined, whose, v.reason);
    },
    onSuccess: (r, v) => {
      invalidateBoard(); setAssigning(null); setAssignError(null); setAssignNeedsReason(false); say(`Moved to ${r.staffName}`);
      if (payAfterAssign.current === v.id) { payAfterAssign.current = null; void openTicketForCheckout(v.id); }
    },
    onError: (err: any) => {
      // The salon asks for a reason when the client goes to someone other than the next technician.
      if (err instanceof ApiError && err.data?.code === "OVERRIDE_REASON_REQUIRED") setAssignNeedsReason(true);
      setAssignError(err instanceof ApiError ? err.message : "Couldn't reassign. Try again.");
    },
  });

  const act = useMutation({
    networkMode: "always",
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: invalidateBoard,
    onError: (err: any) => toast({ title: "That didn't go through", description: err?.message, variant: "destructive" }),
  });

  // ── checkout ──────────────────────────────────────────────────────────────
  const posEnabled = features.pos !== false;
  // ── Day Close opens by itself (owner, 2026-10-24): once the salon's closing time has passed, nothing is open or
  // waiting, and Day Close hasn't run since closing — it can't be dismissed until the day is closed. A ticket or a
  // check-in arriving puts it away again. (lib/autoDayClose.ts)
  const { data: storeHours } = useQuery<DayHours[]>({ queryKey: ["/api/business-hours"], staleTime: 10 * 60_000, enabled: posEnabled });
  const dayCloseStatusKey = [`/api/cash-drawer/day-close-status?drawerId=${drawerId}`];
  const { data: dayCloseStatus } = useQuery<{ lastClosedAt: string | null; lockedUntil: string | null }>({ queryKey: dayCloseStatusKey, refetchInterval: 5 * 60_000, enabled: posEnabled });
  const [clockTick, setClockTick] = useState(() => Date.now());
  useEffect(() => { const iv = setInterval(() => setClockTick(Date.now()), 30_000); return () => clearInterval(iv); }, []);

  const { data: openDrawerSession } = useQuery({
    queryKey: [`/api/cash-drawer/open?storeId=${storeId}&drawerId=${drawerId}`],
    enabled: posEnabled,
    staleTime: 60_000,
  });
  const autoDayClose = posEnabled && !!openDrawerSession && !!board && !syncEngine.isOffline() && !checkout
    && tickets.length === 0 && markers.length === 0 && !!storeHours?.length && dayCloseStatus !== undefined
    // An older server doesn't say when Day Close last ran: without that, never open it by guesswork.
    && "lastClosedAt" in dayCloseStatus
    // Day Close can't run again within 12 hours of the last one (it said so and offered only Close — a loop).
    && !(dayCloseStatus.lockedUntil && Date.parse(dayCloseStatus.lockedUntil) > clockTick)
    && dayCloseDue(storeHours, timezone, new Date(clockTick), dayCloseStatus.lastClosedAt ? new Date(dayCloseStatus.lastClosedAt) : null);

  // Paying a ticket happens right here: the POS tab switches from the ticket builder to that ticket's checkout.
  const openCheckout = useCallback((t: BoardTicket) => {
    turnsEarned.current = [];
    setCheckoutEvent(null);
    setTicketPaid(false);
    setCheckout(t);
    setTab("pos");
  }, []);

  // A ticket that was just made: fetch it fresh from the board, then pay it here.
  const openTicketForCheckout = async (id: number) => {
    try {
      const b = await queryClient.fetchQuery({ queryKey: boardKey(storeId), queryFn: fetchBoard, staleTime: 0 });
      const t = b.tickets.find((x) => x.id === id);
      if (t) requestCheckout(t);
      else toast({ title: "Ticket created", description: "Open it from the Queue to take payment.", variant: "destructive" });
    } catch { toast({ title: "Ticket created", description: "Open it from the Queue to take payment.", variant: "destructive" }); }
  };

  const requestCheckout = (t: BoardTicket) => {
    // Offline, a ticket can be closed in cash only (recorded on this tablet and sent later). Say so up front.
    if (offline || isLocalId(t.id)) say("Offline: cash only. The sale is saved on this tablet and sent when the connection is back.");
    // A ticket is never paid without its technician — that's who earns the commission and the TURN credit.
    if (!t.staff) {
      payAfterAssign.current = t.id;
      setAssignError(null);
      setAssigning({ mode: "assign", ticket: t });
      say("Assign a technician first — checkout opens right after");
      return;
    }
    if (posEnabled && !openDrawerSession && navigator.onLine && !offline && !isLocalId(t.id)) {
      setPendingCheckout(t);
      setShowOpenRegister(true);
      return;
    }
    openCheckout(t);
  };
  // Carry on to checkout once the register has been opened.
  useEffect(() => {
    if (pendingCheckout && openDrawerSession) {
      const t = pendingCheckout;
      setPendingCheckout(null);
      setShowOpenRegister(false);
      openCheckout(t);
    }
  }, [pendingCheckout, openDrawerSession, openCheckout]);

  const finalize = useMutation({
    networkMode: "always",
    mutationFn: (data: FinalizeData) => completeTicket(checkout!.id, data, { storeId, clientName: checkout!.client.name }),
    // Completed — but stay on this ticket's checkout screen (Print/Text/No Receipt takes it from here) rather than
    // jumping away immediately, so a receipt can still be sent for a sale that's already safely recorded.
    onSuccess: (r) => {
      turnsEarned.current = r?.turns ?? []; invalidateBoard(); setTicketPaid(true);
      // Not "checked out" yet as far as the server knows: say exactly what happened.
      say(r?.offline ? "Cash recorded on this tablet · the sale will be sent when the connection is back" : "Checked out");
    },
    onError: (err: any) => {
      // The server answered and refused this exact request (ticket changed, gift card short, …): nothing was saved, so
      // forget it — the next PAY / CHECKOUT rebuilds it from what's on screen. A lost response (network, 5xx) is kept and
      // retried unchanged, since the sale may already have closed.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && checkout) {
        try { localStorage.removeItem(checkoutRequestKey(storeId, checkout.id)); } catch { /* private mode */ }
      }
      toast({ title: "Checkout could not be confirmed", description: err instanceof ApiError && err.message ? `${err.message} Check this ticket before charging again.` : "The response was lost or the sale could not close. Retry this checkout; do not collect payment twice.", variant: "destructive" });
    },
  });

  // Changing the service from the payment screen: the saved ticket is updated in place (its add-ons and custom
  // lines stay; the new service starts on its own default nail options) and the checkout follows the board.
  const changeCheckoutService = async (svc: CatalogService): Promise<boolean> => {
    const t = liveCheckoutRef.current;
    if (!t) return false;
    try {
      const cfg = await fetchNailConfig(svc.id).catch(() => null);
      await updateTicket(t.id, { serviceId: svc.id, addonIds: t.addons.map((a) => a.id), pick: defaultPick(cfg), customLines: t.customLines }, t);
      await queryClient.invalidateQueries({ queryKey: boardKey(storeId) });
      return true;
    } catch (err: any) {
      toast({ title: "Couldn't change the service", description: err?.message, variant: "destructive" });
      return false;
    }
  };

  // The receipt has been handled (printed / texted / declined) for an already-paid ticket — now leave the checkout screen.
  // A walk-in ticket first shows the technician what it was worth in the turn rotation, then the screen locks.
  const finishCheckout = useCallback(() => {
    setCheckout(null); setTicketPaid(false);
    const turns = turnsEarned.current;
    turnsEarned.current = [];
    if (turns.length > 0) setTurnNotice(turns); else lock();
  }, [lock]);
  const closeTurnNotice = useCallback(() => { setTurnNotice(null); lock(); }, [lock]);

  // ── open a ticket by id (scanner, voucher) ───────────────────────────────
  const openTicketById = useCallback(async (id: number) => {
    await queryClient.invalidateQueries({ queryKey: boardKey(storeId) });
    const b = await queryClient.fetchQuery({ queryKey: boardKey(storeId), queryFn: fetchBoard });
    if (b.tickets.some((t) => t.id === id)) setPopupId(id);
    else toast({ title: "That ticket isn't on today's board", description: "It may already be paid or cancelled.", variant: "destructive" });
  }, [queryClient, toast]);

  // ── QR / barcode scanner, and its manual-entry fallback ─────────────────────
  // Every scan (or typed ticket number) re-resolves live — the same physical check-in slip means
  // something different depending on where that appointment/checkin is right now:
  //   no ticket yet   → opens the client in the POS tab to create one (same as tapping their
  //                     checked-in marker)
  //   ticket exists   → opens the ticket popup (Checkout / Reassign / Ticket), same as today
  //   paid            → opens the paid receipt, in-app, instead of erroring that the ticket
  //                     is "no longer on today's board"
  // applyLookupResult is shared by handleScan (QR/barcode) and lookupByNumber (the manual-entry
  // fallback for a slip whose QR won't scan) so the two paths can never behave differently for
  // the same underlying record.
  const [receiptToken, setReceiptToken] = useState<string | null>(null);
  // A paid ticket's receipt from this tablet's copy of the ticket archive (no internet).
  const [receiptSnapshot, setReceiptSnapshot] = useState<unknown>(null);
  // A ticket that resolved to a real appointment but isn't on today's live board — cancelled,
  // no-show, pending, or completed with no receipt token to open instead. Nothing live to open
  // for any of these; TicketStatusDialog shows the record's actual status rather than erroring
  // as if the ticket number didn't exist.
  const [lookupStatus, setLookupStatus] = useState<LookupTicketStatus | null>(null);
  const applyLookupResult = useCallback(async (data: any) => {
    // A check-in that never got a ticket and is no longer waiting: shown read-only. Opening it in the POS
    // would start a ticket for a visit that is over (and a ticket left without a service drops off the queue).
    if (data.type === "checkin_closed") {
      setLookupStatus({ appointmentId: 0, ticketNumber: data.ticketNumber ?? null, clientName: data.clientName,
        service: "Checked in — no service was started", date: data.date, status: "checkin_expired", isPaid: false });
      return;
    }
    if (data.type === "checkin") {
      await pickClient(data.clientId, data.checkinId);
      return;
    }
    if (data.isPaid && data.manageToken) { setReceiptToken(data.manageToken); return; }
    if (data.status === "confirmed" || data.status === "started") {
      await openTicketById(data.appointmentId);
      return;
    }
    setLookupStatus({
      appointmentId: data.appointmentId, ticketNumber: data.ticketNumber ?? null,
      clientName: data.clientName, service: data.service, date: data.date, status: data.status, isPaid: data.isPaid,
    });
  }, [openTicketById, pickClient]);

  // Offline: the ticket or check-in with this number on the board this tablet holds.
  const startFromMarkerRef = useRef<((m: BoardMarker) => void) | null>(null);
  const lookupByNumberRef = useRef<((n: number) => Promise<boolean>) | null>(null);
  const openNumberOnDevice = useCallback(async (ticketNumber: number): Promise<boolean> => {
    const b = await queryClient.fetchQuery({ queryKey: boardKey(storeId), queryFn: fetchBoard }).catch(() => null);
    const ticket = b?.tickets.find((t) => t.ticketNumber === ticketNumber);
    if (ticket) { setPopupId(ticket.id); return true; }
    const marker = b?.markers.find((m) => m.ticketNumber === ticketNumber);
    if (marker && startFromMarkerRef.current) { startFromMarkerRef.current(marker); return true; }
    // A ticket paid on this tablet with no internet, not sent yet.
    const records = await nailOffline.records(storeId).catch(() => []);
    const paidHere = records.find((r) => r.kind === "ticket" && r.ticketNumber === ticketNumber && r.paid) as TicketRecord | undefined;
    if (paidHere) {
      setLookupStatus({ appointmentId: paidHere.realId ?? paidHere.id, ticketNumber, clientName: paidHere.clientName, service: paidHere.service.name,
        date: lookupDate(paidHere.paid!.at), status: "completed", isPaid: true });
      return true;
    }
    // Any earlier ticket, from the archive this tablet keeps (ticketArchive.ts).
    const past = await archivedTicket(storeId, ticketNumber);
    if (!past) return false;
    if (past.isPaid && past.receipt) { setReceiptSnapshot(past.receipt); return true; }
    setLookupStatus({ appointmentId: past.id, ticketNumber, clientName: past.clientName, service: past.service,
      date: lookupDate(past.date), status: past.status, isPaid: past.isPaid });
    return true;
  }, [queryClient, storeId]);

  const handleScan = useCallback(async (raw: string) => {
    // No connection: a booking's slip (BK:<id>) opens from the board on this tablet; a check-in slip's code
    // needs the server, but its ticket number is printed on it.
    // A slip the kiosk printed through this tablet with no internet carries its ticket number.
    const numbered = /^TN:(\d+)$/.exec(raw.trim());
    if (numbered) { if (!(await lookupByNumberRef.current?.(Number(numbered[1])))) toast({ title: "That ticket isn't on the board" }); return; }
    if (syncEngine.isOffline()) {
      const booked = /^BK:(\d+)$/.exec(raw.trim());
      if (booked) { await openTicketById(Number(booked[1])); return; }
      toast({ title: "No connection", description: "Type the ticket # from the slip instead (the # button)." });
      return;
    }
    try {
      const res = await fetch("/api/qr/lookup", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qrToken: raw }),
      });
      const data = res.ok ? await res.json() : null;
      if (!data?.found) { toast({ title: "Code not recognised", description: "That ticket or voucher isn't in the system.", variant: "destructive" }); return; }
      if (data.type === "voucher") {
        // Holding the code is the confirmation — redeem, then open the now-started ticket.
        const r = await fetch("/api/qr/redeem-voucher", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qrToken: raw }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { toast({ title: "Couldn't redeem the voucher", description: d.error ?? "Try again.", variant: "destructive" }); return; }
        say(`Voucher redeemed${d.dealTitle ? ` · ${d.dealTitle}` : ""}`);
        await openTicketById(d.appointmentId);
        return;
      }
      await applyLookupResult(data);
    } catch {
      toast({ title: "No connection", description: "Type the ticket # from the slip instead (the # button)." });
    }
  }, [toast, say, openTicketById, applyLookupResult]);
  useBarcodeScanner(handleScan);

  // The "# 123" ticket-number fallback when a slip's QR won't scan — see LookupByNumberDialog.
  const [showLookupByNumber, setShowLookupByNumber] = useState(false);
  const lookupByNumber = useCallback(async (ticketNumber: number): Promise<boolean> => {
    if (syncEngine.isOffline()) {
      const found = await openNumberOnDevice(ticketNumber);
      if (found) setShowLookupByNumber(false);
      return found;
    }
    try {
      const res = await fetch("/api/nail/lookup-by-number", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketNumber }),
      });
      const data = res.ok ? await res.json() : null;
      if (!data?.found) return false;
      await applyLookupResult(data);
      setShowLookupByNumber(false);
      return true;
    } catch {
      // No answer from the server: look on this tablet.
      const found = await openNumberOnDevice(ticketNumber);
      if (found) setShowLookupByNumber(false);
      return found;
    }
  }, [applyLookupResult, openNumberOnDevice]);
  lookupByNumberRef.current = lookupByNumber;

  // ── open-register prompts: on load during the morning window, and again at 1 AM store time ──
  const dayKey = useCallback(() => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date()), [timezone]);
  const markPrompted = useCallback(() => { try { localStorage.setItem(`certxa_drawer_prompted_${storeId}_${dayKey()}`, "1"); } catch { /* private mode */ } }, [storeId, dayKey]);
  useEffect(() => {
    if (!posEnabled || openDrawerSession === undefined || openDrawerSession) return;
    try { if (localStorage.getItem(`certxa_drawer_prompted_${storeId}_${dayKey()}`)) return; } catch { /* private mode */ }
    const hour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(new Date()));
    if (hour >= 5 && hour < 12) setShowOpenRegister(true);
  }, [posEnabled, openDrawerSession, storeId, timezone, dayKey]);
  useEffect(() => {
    if (!posEnabled) return;
    let firedFor = "";
    const iv = setInterval(() => {
      const hour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(new Date()));
      const day = dayKey();
      if (hour === 1 && firedFor !== day) { firedFor = day; setShowOpenRegister(true); }
    }, 60_000);
    return () => clearInterval(iv);
  }, [posEnabled, timezone, dayKey]);

  // ── mirror the Book Appointment phone prompt to the paired /frontdesk tablet ───────
  // Kept on the tablet: started with no connection, the customer screen (tip screen, phone prompts over the
  // salon hub) must still be used — the setting used to be lost, and with it the customer screen.
  const dualScreenKey = `certxa.nail.dualScreen.${storeId}`;
  const [dualScreen, setDualScreen] = useState(() => { try { return localStorage.getItem(`certxa.nail.dualScreen.${storeId}`) === "1"; } catch { return false; } });
  useEffect(() => {
    fetch("/api/kiosk-settings", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        const on = d?.dualScreenMode === true;
        setDualScreen(on);
        try { localStorage.setItem(dualScreenKey, on ? "1" : "0"); } catch { /* storage unavailable */ }
      })
      .catch(() => { /* keep the last known setting */ });
  }, [storeId, dualScreenKey]);
  useEffect(() => {
    if (!showBook || !dualScreen) return;
    const send = (type: string) => relayCheckoutEvent({ type, registerId });
    void send("kiosk_checkout_phone_prompt");
    return () => { void send("kiosk_checkout_phone_cancel"); };
  }, [showBook, dualScreen, registerId]);

  // ── the calendar's other tools, from the More menu ────────────────────────
  const timeclockEnabled = features.timeclock !== false;
  // Offline mode runs from cached files — wiping them there would break it, so no Hard Refresh while offline.
  const offline = useNetworkStatus() === "offline";
  const [showQueued, setShowQueued] = useState(false);
  // The connection, in the footer (there is no offline badge at the top of the screen): offline, or what this
  // tablet still has to send, or a problem it needs someone for. Tapping it shows the details.
  const footerStatus = recovery.storage ? { label: nailText("storageProblem"), ok: false }
    : recovery.signIn ? { label: nailText("signInNeeded"), ok: false }
    : offline || !live ? { label: nailText("offline"), ok: false }
    : queued.attention > 0 ? { label: nailText("needsAttention"), ok: false }
    : queued.pending > 0 ? { label: nailText("sending"), ok: true }
    : { label: nailText("connected"), ok: true };
  const moreTiles: MoreTile[] = [
    { key: "book", label: "Book Appointment", icon: CalendarPlus, run: () => { setFrontdeskPhone(""); setShowBook(true); } },
    { key: "clients", label: "Client Lookup", icon: Search, run: () => setSheet("clients") },
    { key: "voucher", label: "Redeem Voucher", icon: Gift, run: () => setSheet("voucher") },
    ...(timeclockEnabled ? [{ key: "timeclock", label: "In / Out", icon: Clock, run: () => setSheet("timeclock") }] : []),
    // Inside a Certxa app with no retail screen of its own, Retail Sale is left out (shared/appProfiles.ts).
    ...(posEnabled && appPage("/pos") ? [{ key: "retail", label: "Retail Sale", icon: ShoppingBag, run: () => navigate(appPage("/pos")!) }] : []),
    // The signed-in technician's own slip; with nobody (or the front desk) signed in, it asks for a Tech ID.
    { key: "myslip", label: "My Slip", icon: Receipt, run: () => { if (tech && !tech.frontDesk) setSlipFor({ id: tech.id, name: tech.name }); else setSlipAsk(true); } },
    // This tablet's language for the staff screens; each tap goes to the next one.
    { key: "language", label: "Language", sub: LANG_NAMES[lang], icon: Languages, keepOpen: true,
      run: () => setLang(LANG_ORDER[(LANG_ORDER.indexOf(lang) + 1) % LANG_ORDER.length]) },
    // Opens the Manager tab (managerTiles below) once the manager PIN is entered.
    { key: "manager", label: "Manager", icon: KeyRound, run: () => setSheet("manager") },
    ...(isMultiStation && currentRegisterName ? [{
      key: "station", icon: CreditCard, label: "Station", sub: currentRegisterName,
      run: () => setPairScreenOpen(true),
    }] : []),
    ...(offline ? [] : [{
      key: "refresh", label: "Hard Refresh", sub: "Fix a page that won't load", icon: RefreshCw, run: () => { void hardRefresh(); },
    }]),
  ];

  // The Manager tab of the More popup — everything here is behind the manager PIN.
  const managerTiles: MoreTile[] = [
    { key: "settings", label: "Settings", icon: Settings, run: () => navigate(appPage("/settings")!) },
    ...(posEnabled ? [{ key: "register", label: "Cash Drawer", sub: openDrawerSession ? "Open" : "Closed", icon: Wallet, run: () => setShowOpenRegister(true) }] : []),
    { key: "messages", label: "Messages", icon: Bell, run: () => navigate(appPage("/sms-inbox")!) },
    { key: "keygrid", label: "Key Grid", sub: "Arrange the POS keys", icon: LayoutGrid, run: () => setGridEditor("open") },
    { key: "turnrotation", label: "Turn Rotation", sub: "How turns are counted", icon: RotateCcw, run: () => setSheet("turns") },
    { key: "servicetimes", label: "Service Times", sub: "Actual vs planned", icon: Clock, run: () => setSheet("servicetimes") },
    { key: "managerpin", label: "Manager PIN", sub: "Change the PIN for this menu", icon: KeyRound, run: () => { setShowMore(false); setPinChange(true); } },
    { key: "lockscreen", label: "Lock Screen", sub: saveLock.isPending ? "Saving…" : lockEnabled ? "On · Tech ID to use the POS" : "Off · no sign-in", icon: Lock, keepOpen: true,
      run: () => { if (!saveLock.isPending) saveLock.mutate(!lockEnabled); } },
    ...(thermalPrinter.isAvailable ? [{
      key: "printer", icon: Printer, label: "Printer",
      sub: thermalPrinter.isConnected ? `${thermalPrinter.deviceName?.split(" ")[0] ?? "Printer"} · connected` : thermalPrinter.status === "connecting" ? "Connecting…" : thermalPrinter.status === "error" ? "Error · retry" : "Tap to connect",
      run: () => { void (thermalPrinter.isConnected ? thermalPrinter.disconnect() : thermalPrinter.connect()); },
    }] : []),
    { key: "reports", label: "Reports", icon: BarChart3, run: () => navigate(appPage("/reports")!) },
  ];

  // ── Check-In sheet: put the /frontdesk tablet on its check-in screen while it's open ──
  useEffect(() => {
    if (!showCheckIn || !dualScreen) return;
    const send = (type: string) => relayCheckoutEvent({ type, registerId });
    void send("kiosk_checkout_checkin_launch");
    return () => { void send("kiosk_checkout_checkin_cancel"); };
  }, [showCheckIn, dualScreen, registerId]);
  // The paired customer tablet checked someone in. Match the new board entity to the phone that
  // tablet entered; a different station's check-in must not close this station's sheet.
  const checkinBaseline = useRef<Set<string>>(new Set());
  const openCheckIn = () => {
    checkinBaseline.current = waitingEntityKeys(tickets, markers);
    setFrontdeskPhone("");
    setShowCheckIn(true);
  };
  useEffect(() => {
    if (showCheckIn && hasNewWaitingEntityForPhone(tickets, markers, checkinBaseline.current, frontdeskPhone)) {
      setShowCheckIn(false);
      say("Client checked in");
    }
  }, [tickets, markers, frontdeskPhone, showCheckIn, say]);

  const setTechIn = async (tech: TurnTech) => {
    setClockInFor(null);
    setAssumedIn((cur) => (cur.includes(tech.id) ? cur : [...cur, tech.id]));
    try {
      await clockInTech(storeId, tech.id);
      say(`${tech.name} is in`);
    } catch (err: any) {
      setAssumedIn((cur) => cur.filter((id) => id !== tech.id));
      toast({ title: `Couldn't set ${tech.name.split(" ")[0]} in`, description: err?.message, variant: "destructive" });
    } finally {
      invalidateBoard();
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", storeId, "nail-techs"] });
    }
  };

  const setTechOut = async (tech: TurnTech) => {
    setClockOutFor(null);
    setAssumedIn((cur) => cur.filter((id) => id !== tech.id)); // a tech we just set in on this screen must not stay "in" once they are out
    try {
      await clockOutTech(storeId, tech.id);
      say(`${tech.name} is out`);
    } catch (err: any) {
      toast({ title: `Couldn't clock ${tech.name.split(" ")[0]} out`, description: err?.message, variant: "destructive" });
    } finally {
      invalidateBoard();
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", storeId, "nail-techs"] });
    }
  };

  // ── submit routing ────────────────────────────────────────────────────────
  const busy = create.isPending || update.isPending;
  const canSubmit = !!client && !!service;
  const submit = () => {
    if (!canSubmit) return;
    if (editing) update.mutate();
    else create.mutate();
  };
  // `fn`: the checkout function to open on (Group Pay / Tip Adjust / Discount, from the keypad).
  const checkoutStart = useRef<CheckoutFn | null>(null);
  const payNow = (fn: CheckoutFn | null = null) => {
    if (!canSubmit || editing) return;
    checkoutStart.current = fn;
    payAfterCreate.current = true;
    create.mutate();
  };
  // Group Pay / Tip Adjust / Discount under the keypad belong to paying: the ticket is saved and its checkout
  // opens on that function, so building and paying feel like one screen.
  const payNowWith = (fn: CheckoutFn) => {
    if (busy) return;
    if (editing) { say("Update the ticket first, then open it to pay"); return; }
    if (!canSubmit) { say("Add a service first"); return; }
    payNow(fn);
  };
  // Clearing drops the client too, and a ticket can only be built for a client — so go back to the queue.
  const clearDraft = () => {
    setTab("queue");
    resetDraft();
  };

  // A kiosk check-in with no ticket yet → start their ticket. One with no client on file is first matched to a
  // client by the phone they typed, or saved as a new client from the name and number on the check-in.
  const fullNameOf = (n: string | null | undefined) => (n ?? "").trim().replace(/\s+/g, " ") || "Walk-in";
  const startFromMarker = async (m: BoardMarker) => {
    let clientId = m.clientId;
    if (!clientId) {
      try { clientId = (await resolveMarkerClient(m.id)).clientId; invalidateBoard(); }
      catch (err: any) {
        // No server: the client is made on this tablet (sent with the ticket when the connection is back), so a
        // walk-in who checked in by name still gets their ticket.
        if (isNetworkFailure(err)) {
          try { clientId = (await nailOffline.createClient(storeId, fullNameOf(m.clientName), m.phone ?? "")).id; }
          catch { clientId = null; }
        }
        if (!clientId) {
          toast({ title: "Couldn't open this check-in", description: err instanceof ApiError ? err.message : "Try again.", variant: "destructive" });
          return;
        }
      }
    }
    setTab("pos");
    void pickClient(clientId, m.id);
  };
  startFromMarkerRef.current = (m) => void startFromMarker(m);

  const ticketActions = {
    // Defense in depth: even if another view invokes Start for an unassigned ticket,
    // assignment is required first so the ticket cannot disappear into an invalid started state.
    onStart: (t: BoardTicket) => {
      if (!t.staff) {
        setAssignError(null);
        setAssigning({ mode: "assign", ticket: t });
        return;
      }
      act.mutate(() => startTicket(t.id, t.client.name));
    },
    onCheckout: (t: BoardTicket) => { checkoutStart.current = null; requestCheckout(t); },
    onDone: (t: BoardTicket) => act.mutate(() => markTicketDone(t.id), {
      onSuccess: () => { setPopupId(null); say(`#${t.ticketNumber ?? t.id} done${t.staff ? ` · ${t.staff.name.split(" ")[0]} is free` : ""} · ready to pay`); },
    }),
    onReassign: (t: BoardTicket) => { setAssignError(null); setAssigning({ mode: t.staff ? "reassign" : "assign", ticket: t }); },
    onEdit: startEdit,
    // "Amy is ready for you" by text. Needs the server; a ticket that only exists on this tablet cannot be texted yet.
    onTextReady: (t: BoardTicket) => {
      if (isLocalId(t.id)) { say("Not sent yet — this ticket is still on this tablet"); return; }
      textClientReady(t.id).then((r) => say(r.alreadySent ? `Already texted ${t.client.name.split(" ")[0]}` : `Texted ${t.client.name.split(" ")[0]}`))
        .catch((err: any) => toast({ title: "The text was not sent", description: err?.message, variant: "destructive" }));
    },
    onCancel: (t: BoardTicket) => { if (window.confirm(`Cancel ${t.client.name}'s ticket?`)) act.mutate(() => cancelTicket(t.id, t.client.name)); },
  };
  // ── Tech ID sign-in ───────────────────────────────────────────────────────
  // A technician with a client in the chair is shown that client's ticket; everyone else lands on the queue.
  const onTechSignedIn = (who: TechSignIn) => {
    setTech(who.staff);
    // Signing in just gave them the next waiting client they can do: show the queue with a notice saying
    // who, then lock again. Their next sign-in opens that client (activeMarker / activeTicketId below).
    if (who.justAssigned) {
      setPopupId(null); setQueueView(null); setTab("queue");
      setAssignedNotice({ ...who.justAssigned, staffName: who.staff.name });
      queryClient.invalidateQueries({ queryKey: boardKey(storeId) });
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility"] });
      return;
    }
    // Their client from the front desk check-in has no ticket yet: go straight to making it.
    if (who.activeMarker?.clientId) { setTab("pos"); void pickClient(who.activeMarker.clientId, who.activeMarker.id); }
    // Their client already has a ticket in service: show that ticket over the queue (checkout, reassign, ticket, cancel).
    else if (who.activeTicketId != null) { setQueueView(null); setTab("queue"); void openTicketById(who.activeTicketId); }
  };
  // The lock screen's turn queue: clocked-in technicians in turn order — the free ones first, numbered
  // (1 is next up), then those busy or on break.
  const turnQueueForGate = useMemo(() => {
    const clockedIn = techList.filter((t) => t.clockedIn !== false);
    const statusOf = (t: TurnTech) => t.currentStatus ?? "available";
    const free = clockedIn.filter((t) => statusOf(t) === "available");
    const held = clockedIn.filter((t) => statusOf(t) !== "available");
    // Turns so far, in thousandths: the server (and the offline line) send it; an older copy only has the number of turns.
    const unitsOf = (t: TurnTech) => Number.isFinite(Number((t as any).turnUnits)) ? Number((t as any).turnUnits) : Math.round((Number(t.turnCount) || 0) * 1000);
    return [
      ...free.map((t, i) => ({ id: t.id, name: t.name, status: "available" as const, position: i + 1, turnUnits: unitsOf(t) })),
      ...held.map((t) => ({ id: t.id, name: t.name, status: statusOf(t) as "busy" | "on_break", position: null, turnUnits: unitsOf(t) })),
    ];
  }, [techList]);

  const popupTicket = popupId != null ? tickets.find((t) => t.id === popupId) ?? null : null;
  // The ticket being paid, as the board has it now (another station may have edited it). Once it's paid it leaves
  // the board, so the last copy is kept for the receipt screen.
  const lastLiveCheckout = useRef<BoardTicket | null>(null);
  const onBoard = checkout ? tickets.find((t) => t.id === checkout.id) ?? null : null;
  if (onBoard) lastLiveCheckout.current = onBoard;
  const liveCheckout = onBoard ?? (checkout && lastLiveCheckout.current?.id === checkout.id ? lastLiveCheckout.current : null);
  liveCheckoutRef.current = liveCheckout ?? checkout;
  // Gone from the board while this station was not paying it: paid or cancelled on another station.
  // Only a ticket this checkout has seen on the board counts (one just made may not be on it yet).
  const checkoutClosedElsewhere = !!checkout && !onBoard && lastLiveCheckout.current?.id === checkout.id && !ticketPaid && !finalize.isPending;

  return (
    <div className="dark cx-cal nail-app h-app w-full" data-testid="nail-home">
      <OfflineLimitLock />
      <a className="nail-skip-link" href="#nail-main">Skip to main content</a>
      <h1 className="sr-only">Nail salon front desk</h1>
      {notice && <div className="nail-notice" data-testid="nail-notice">{notice}</div>}
      {showQueued && <OfflineQueueSheet storeId={storeId} offline={offline} onClose={() => setShowQueued(false)} />}

      <main id="nail-main" className={`pos-shell ${tab === "queue" ? "checkin-page" : ""} ${tab === "techs" ? "techs-page" : ""}`}>
        {/* Checkout: the POS tab's own screen (ticket · keypad · payment / functions). It stays mounted while staff peek at another
            tab, so a half-paid ticket — or a card that has already been charged — is never lost. */}
        {checkout && (
          <div style={{ display: tab === "pos" ? "contents" : "none" }}>
            <Suspense fallback={<div className="nail-route-loading" role="status"><Loader2 className="animate-spin" /> Loading checkout…</div>}><CheckoutMode
              key={checkout.id}
              storeAddons={activeAddons}
              ticket={liveCheckout ?? checkout}
              closedElsewhere={checkoutClosedElsewhere}
              salesTax={salesTax}
              cashDiscountPct={cashDiscountPct}
              storeId={storeId}
              storeName={storeName}
              storeAddress={storeAddress}
              storeCityStateZip={storeCityStateZip}
              storePhone={storePhone}
              timezone={timezone}
              registerId={registerId}
              dualScreen={dualScreen}
              otherTickets={tickets.filter((t) => t.id !== checkout.id && (t.status === "started" || !!t.staff))}
              thermalPrint={thermalPrinter.isConnected ? thermalPrinter.print : undefined}
              finalizing={finalize.isPending}
              paid={ticketPaid}
              socketEvent={checkoutEvent}
              onFinalize={(data) => finalize.mutate(data)}
              onReceiptDone={finishCheckout}
              initialAction={checkoutStart.current}
              active={tab === "pos" && (tech != null || !lockEnabled)}
              groups={groups}
              layout={posGrid?.config ?? null}
              onChangeService={changeCheckoutService}
              onClose={() => {
                if (checkoutClosedElsewhere) say(`Ticket #${checkout.ticketNumber ?? checkout.id} was paid or closed on another station`);
                setCheckout(null); setTab("queue");
              }}
            /></Suspense>
          </div>
        )}
        {checkout && tab === "pos" ? null : tab === "pos" ? (
          <>
            <TicketPanel
              client={client}
              badge={booking ? "BOOK" : editing ? `#${editing.ticketNumber ?? editing.id}` : "NEW"}
              lines={draft.lines}
              duration={draft.duration}
              price={draft.price}
              submitLabel={booking ? (!service ? "ADD A SERVICE FIRST" : booking.step === "services" ? "PICK TIME" : booking.slot ? "BOOK" : "PICK A TIME")
                : editing ? "UPDATE TICKET" : !client ? "CHOOSE A CLIENT FIRST" : !service ? "ADD A SERVICE FIRST" : "SAVE TICKET"}
              canSubmit={booking ? canSubmit && (booking.step === "services" || !!booking.slot) : canSubmit}
              busy={booking ? bookVisit.isPending : busy}
              appointment={booking?.slot ? bookingLabel(booking.slot) : null}
              editing={!!editing}
              onRemove={(l) => { if (l.key === splitKey) setSplitKey(null); removeLine(l); }}
              selectedKey={splitKey}
              onSelect={booking ? undefined : (l) => setSplitKey((k) => (k === l.key || !splittable(l) ? null : l.key))}
              onClear={clearDraft}
              onSubmit={!booking ? submit : booking.step === "services"
                ? () => { if (extraServices.length > 1) { say("A booking can have up to 2 services"); return; } setBooking({ step: "time", slot: null }); }
                : () => bookVisit.mutate()}
            />
            <section className="work-area">
              <div className="sale-area">
                <Keypad locked={!client} onEnter={addCustom} onUndo={undoDraft} onSplit={() => void splitSelected()} onGiftCard={() => setShowGift(true)} onCheckoutFn={payNowWith} onNotice={say}
                  onNoSale={noSale} />
                {booking?.step === "time" && service ? (
                  <BookingPanel
                    storeId={storeId} slug={bookingSlug} timezone={timezone} serviceId={service.id} extraServiceId={extraServices[0]?.id ?? null}
                    duration={draft.duration}
                    slot={booking.slot} onSlot={(slot) => setBooking((b) => (b ? { ...b, slot } : b))}
                    onServices={() => setBooking({ step: "services", slot: null })}
                  />
                ) : (
                <CatalogPanel
                  layout={posGrid?.config ?? null}
                  locked={!client}
                  groups={gridGroups}
                  openGroup={openGroup}
                  activeGroup={activeGroup}
                  onGroup={setActiveGroup}
                  serviceId={pkg ? -pkg.id : service?.id ?? null}
                  onService={chooseService}
                  addons={shownAddons}
                  moreAddons={moreAddons}
                  onToggleMore={() => setMoreAddons((v) => !v)}
                  hasMoreAddons={moreAddons || activeAddons.length > Math.min(6, suggestedAddons.length)}
                  addonIds={addonIds}
                  onToggleAddon={toggleAddon}
                  allAddons={activeAddons}
                  onFn={(fn) => {
                    if (fn === "reprint") { void reprintLastReceipt().then((err) => say(err ?? "Receipt reprinted")); return; }
                    if (fn === "nosale") { noSale(); return; }
                    if (!client) { say("Open a ticket first"); return; }
                    if (fn === "discount") payNowWith("discount"); else setShowGift(true);
                  }}
                />
                )}
              </div>
            </section>
          </>
        ) : tab === "techs" ? (
          <TechCards techs={techList} tickets={tickets} markers={markers} glance={board?.glance} stats={board?.techStats ?? EMPTY_ARRAY} loading={techsLoading} clockOffsetMs={clockOffsetMs} assumedIn={assumedIn} onClockedOutTap={setClockInFor} onClockedInTap={setClockOutFor} onTicketTap={(t) => setPopupId(t.id)} onQueueView={(view) => { setQueueView(view); setTab("queue"); }} />
        ) : (
          <QueueTab techs={techList} tickets={tickets} markers={markers} dayBookings={dayBookings} glance={board?.glance} upcoming={upcoming} appointmentsLoading={upcomingPending || (needsCalendarFallback && calendarFallbackPending)} appointmentsError={(upcomingError && !upcoming) || (needsCalendarFallback && calendarFallbackError)} timezone={timezone} clockOffsetMs={clockOffsetMs} assumedIn={assumedIn} initialView={queueView} onMarker={(m) => void startFromMarker(m)} onMarkerRemove={(m) => act.mutate(() => removeMarker(m.id))} onTicket={(t) => setPopupId(t.id)} onAssignTicket={(t) => { setAssignError(null); setAssigning({ mode: "assign", ticket: t }); }} onStartTicket={ticketActions.onStart} onTicketTap={(t) => setPopupId(t.id)} onTechs={() => setTab("techs")} />
        )}

      <BottomNav tab={tab} onTab={(next) => { setQueueView(null); if (next === "queue" && tab === "queue") { setPopupId(null); setTech(null); } else setTab(next); }} onCheckIn={openCheckIn} onMore={() => setShowMore("more")} onLookupByNumber={() => setShowLookupByNumber(true)} waiting={waitingCount} status={footerStatus} onStatus={() => setShowQueued(true)} />
      </main>

      {showGift && <GiftCardSheet onClose={() => setShowGift(false)} onSay={say} />}

      {popupTicket && <TicketPopup ticket={popupTicket} busy={act.isPending} {...ticketActions}
        // DONE is for the first ticket of a visit another technician carries on: only while a linked ticket of the
        // same visit is still waiting. The visit's last ticket is checked out as normal.
        onDone={popupTicket.groupId != null && tickets.some((x) => x.id !== popupTicket.id && x.groupId === popupTicket.groupId && x.status === "confirmed")
          ? ticketActions.onDone : undefined}
        inChairOn={popupTicket.client.id != null ? tickets.find((x) => x.id !== popupTicket.id && x.client.id === popupTicket.client.id && x.status === "started" && !x.doneAt)?.ticketNumber ?? null : null} clockOffsetMs={clockOffsetMs} onClose={() => setPopupId(null)} />}
      {receiptToken && <ReceiptDialog token={receiptToken} onClose={() => setReceiptToken(null)} />}
      {receiptSnapshot != null && <ReceiptDialog token={null} snapshot={receiptSnapshot} onClose={() => setReceiptSnapshot(null)} />}
      {lookupStatus && <TicketStatusDialog ticket={lookupStatus} onClose={() => setLookupStatus(null)} />}
      {showLookupByNumber && <LookupByNumberDialog onLookup={lookupByNumber} onClose={() => setShowLookupByNumber(false)} />}

      {clockOutFor && <TechClockOutSheet tech={clockOutFor} busy={false} onClockOut={() => void setTechOut(clockOutFor)} onClose={() => setClockOutFor(null)} />}

      {clockInFor && <TechClockInSheet tech={clockInFor} busy={false} onSetIn={() => void setTechIn(clockInFor)} onClose={() => setClockInFor(null)} />}

      {showMore === "more" && <MoreMenu tiles={moreTiles} onClose={() => setShowMore(false)} />}
      {slipAsk && <SlipTechIdSheet onClose={() => setSlipAsk(false)} onSlip={(who) => { setSlipAsk(false); setSlipFor(who); }} onSignedIn={(who) => { setSlipAsk(false); onTechSignedIn(who); }} />}
      {slipFor && <TechSlipSheet staffId={slipFor.id} staffName={slipFor.name} timezone={timezone} onClose={() => setSlipFor(null)} />}
      {showMore === "manager" && <MoreMenu title="Manager" tiles={managerTiles} onClose={() => setShowMore(false)} onBack={() => setShowMore("more")} />}

      {showCheckIn && (
        <CheckInLookup
          storeId={storeId}
          frontdeskShowing={dualScreen}
          clientEnteringPhone={clientTyping}
          onClose={() => setShowCheckIn(false)}
          onDone={(line, r) => {
            setShowCheckIn(false); say(line); invalidateBoard();
            // A walk-in has no ticket yet: go straight to the POS tab to build it. A booked client's
            // appointment is already their ticket, so they are only marked as arrived.
            if (r.status !== "appointment" && !r.todayAppointment && r.client?.id) void pickClient(r.client.id, r.checkin?.id ?? null);
          }}
          onPrintTicket={thermalPrinter.isConnected ? async (result) => {
            const appointment = result.todayAppointment;
            const qrValue = appointment ? `BK:${appointment.id}` : result.checkin?.token ? `CI:${result.checkin.token}` : result.checkin?.ticketNumber ? `TN:${result.checkin.ticketNumber}` : "";
            const ticketNumber = appointment?.ticketNumber ?? result.checkin?.ticketNumber ?? undefined;
            if (!qrValue || ticketNumber == null) throw new Error("Check-in response has no printable ticket number");
            const checkedInAt = new Date();
            await thermalPrinter.print(buildCheckinTicket({
              storeName,
              clientName: result.client.name,
              staffName: appointment?.staffName ?? undefined,
              services: appointment?.serviceName ? [{ name: appointment.serviceName }] : [],
              appointmentId: appointment?.id,
              ticketNumber,
              bookingCode: qrValue,
              timeStr: checkedInAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
              dateStr: checkedInAt.toLocaleDateString(),
            }));
          } : undefined}
        />
      )}

      {showBook && (
        <ChooseClientPanel
          walkInsEnabled={false}
          phoneFromFrontdesk={frontdeskPhone}
          onClose={() => { setShowBook(false); setFrontdeskPhone(""); }}
          onSelectClient={(id) => { setShowBook(false); setFrontdeskPhone(""); resetDraft(); void pickClient(id).then(() => setBooking({ step: "services", slot: null })); }}
          onWalkIn={() => setShowBook(false)}
        />
      )}
      {sheet === "clients" && <ClientLookupSheet onClose={() => setSheet(null)} />}
      {sheet === "servicetimes" && <ServiceTimesSheet onClose={() => setSheet(null)} />}
      {sheet === "turns" && <TurnRotationSheet storeId={storeId} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); say("Turn rotation saved"); }} />}
      {sheet === "voucher" && (
        <VoucherRedeemSheet onClose={() => setSheet(null)} onRedeemed={(appointmentId) => { setSheet(null); void openTicketById(appointmentId); }} />
      )}
      {sheet === "timeclock" && <TimeClockSheet storeId={storeId} onClose={() => { setSheet(null); invalidateBoard(); }} />}
      {gridEditor === "open" && (
        <GridEditor groups={gridGroups} addons={activeAddons} config={posGrid?.config ?? null} saving={saveGrid.isPending} onSave={(config) => saveGrid.mutate(config)} onClose={() => setGridEditor(null)} />
      )}
      {pinChange && <ChangeManagerPinSheet onClose={() => setPinChange(false)} onDone={() => { setPinChange(false); say("Manager PIN changed"); }} />}
      {sheet === "manager" && <ManagerPinSheet onClose={() => setSheet(null)} onSuccess={() => { setSheet(null); setShowMore("manager"); }} />}
      {posEnabled && (
        <DayCloseModal open={sheet === "dayclose" || autoDayClose} required={autoDayClose && sheet !== "dayclose"}
          onClose={() => {
            // Closed: say so at once, so the popup doesn't open again while the status is fetched.
            if (autoDayClose) queryClient.setQueryData(dayCloseStatusKey, { lastClosedAt: new Date().toISOString(), lockedUntil: new Date(Date.now() + 12 * 3600_000).toISOString() });
            setSheet(null); void queryClient.invalidateQueries({ queryKey: dayCloseStatusKey });
          }} storeId={storeId}
          userName={(user as any)?.firstName || (user as any)?.email || "Staff"} drawerId={drawerId} />
      )}

      {startedNotice && (
        <div className="fixed inset-0 z-[290] flex items-center justify-center px-6" style={{ background: "rgba(10,12,16,.72)" }} role="status" aria-live="polite" data-testid="nail-started-notice">
          <div className="rounded-2xl px-10 py-9 text-center" style={{ background: "#232830", border: "1px solid #3b424c", boxShadow: "0 30px 70px rgba(0,0,0,.5)", maxWidth: 620 }}>
            {startedNotice.map((t, i) => (
              <p key={i} style={{ margin: "6px 0", fontSize: startedNotice.length > 1 ? 22 : 28, fontWeight: 700, lineHeight: 1.3, color: "#fff" }} data-testid="nail-saved-line">
                {t.ticketNumber > 0 ? `#${t.ticketNumber} · ` : ""}{t.serviceName}
                <br />
                <span style={{ fontWeight: 500, color: t.staffName ? "#7dd3fc" : "#cbd5e1" }}>
                  {t.staffName ? `Assigned to ${t.staffName}` : "Waiting for the next free technician"}
                </span>
                {t.staffName && (
                  <>
                    <br />
                    {/* Starting from here saves a trip to the Queue. After START the notice closes in three seconds. */}
                    <button type="button" disabled={t.started} data-testid="nail-saved-start"
                      onClick={() => {
                        act.mutate(() => startTicket(t.appointmentId, t.clientName));
                        setStartedNotice((cur) => cur && cur.map((x, j) => (j === i ? { ...x, started: true } : x)));
                      }}
                      style={{ marginTop: 12, fontSize: 18, fontWeight: 700, padding: "12px 32px", borderRadius: 12, border: "none", background: t.started ? "#353a43" : "#0d9b6e", color: "#fff" }}>
                      {t.started ? "Service Started" : "Start Service"}
                    </button>
                  </>
                )}
              </p>
            ))}
          </div>
        </div>
      )}
      {waitingAssigned && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center px-8" style={{ background: "#14171c" }} role="alertdialog" aria-modal="true" aria-live="assertive" data-testid="nail-waiting-assigned">
          <div className="text-center" style={{ maxWidth: 900 }}>
            <p style={{ margin: 0, fontSize: 30, fontWeight: 600, color: "#cbd5e1" }}>
              {waitingAssigned.ticketNumber != null && waitingAssigned.ticketNumber > 0 ? `Ticket #${waitingAssigned.ticketNumber}` : "Ticket"}
            </p>
            <p style={{ margin: "14px 0 0", fontSize: 64, fontWeight: 800, lineHeight: 1.1, color: "#fff" }}>{waitingAssigned.clientName}</p>
            <p style={{ margin: "14px 0 0", fontSize: 34, fontWeight: 600, color: "#fff" }}>{waitingAssigned.serviceName}</p>
            <p style={{ margin: "22px 0 0", fontSize: 40, fontWeight: 700, color: "#7dd3fc" }}>Assigned to {waitingAssigned.staffName}</p>
            <button type="button" disabled={waitingAssigned.started} data-testid="nail-waiting-assigned-start"
              onClick={() => {
                act.mutate(() => startTicket(waitingAssigned.appointmentId, waitingAssigned.clientName));
                setWaitingAssigned((cur) => cur && { ...cur, started: true });
              }}
              style={{ marginTop: 40, fontSize: 30, fontWeight: 800, padding: "22px 64px", borderRadius: 16, border: "none", background: waitingAssigned.started ? "#353a43" : "#0d9b6e", color: "#fff" }}>
              {waitingAssigned.started ? "Service Started" : "Start Service"}
            </button>
          </div>
        </div>
      )}
      {turnNotice && <TurnEarnedPopup turns={turnNotice} onDone={closeTurnNotice} />}
      {assignedNotice && (
        <div className="nl-assigned" role="status" aria-live="polite" data-testid="nail-assigned-notice">
          <div className="nl-assigned-card">
            <p className="nl-assigned-eyebrow">Your next client</p>
            <div className="nl-assigned-client">
              {assignedNotice.ticketNumber != null && <span className="nl-assigned-ticket">#{assignedNotice.ticketNumber}</span>}
              <strong>{assignedNotice.clientName || "Client"}</strong>
            </div>
            <p className="nl-assigned-tech">Assigned to <b>{assignedNotice.staffName}</b></p>
            <span className="nl-assigned-timer" aria-hidden />
          </div>
        </div>
      )}
      {lockEnabled && !tech && !showTurnPage && !needsRegisterPicker && !needsDrawerPicker && <TechIdGate storeName={storeName} timezone={timezone} turnQueue={turnQueueForGate} onOpenTurnPage={() => setShowTurnPage(true)} onSignedIn={onTechSignedIn} />}
      {showTurnPage && (
        <TurnPageModal
          currentDate={getNowInTimezone(timezone)}
          timezone={timezone}
          appointments={(turnAppointments as any[] | undefined) ?? []}
          staffList={(turnStaffList as any[] | undefined) ?? []}
          turnEligibility={techFeed as any}
          nextTechnician={((techFeed as any)?.eligibleTechnicians?.[0] ?? null) as any}
          excludedCount={techList.filter((t) => !t.eligible).length}
          storeId={storeId}
          onClose={() => setShowTurnPage(false)}
        />
      )}
      {needsRegisterPicker && <RegisterPicker registers={registerOptions} taken={takenRegisters} onSelect={selectRegister} />}
      <PairCustomerScreenDialog open={pairScreenOpen} stationName={currentRegisterName} onClose={() => setPairScreenOpen(false)} />
      <StationsFullBanner show={stationsFull} />

      {assigning && (
        <AssignTechSheet
          storeId={storeId}
          serviceId={assigning.ticket.service.id}
          clientName={assigning.ticket.client.name}
          mode={assigning.mode}
          excludeStaffId={assigning.mode === "reassign" ? assigning.ticket.staff?.id ?? null : null}
          busy={reassign.isPending}
          error={assignError}
          needsReason={assignNeedsReason}
          onClose={() => { setAssigning(null); setAssignError(null); setAssignNeedsReason(false); payAfterAssign.current = null; }}
          onConfirm={(staffId, reason) => {
            setAssignError(null);
            if (staffId != null) reassign.mutate({ id: assigning.ticket.id, staffId, reason });
          }}
        />
      )}

      {posEnabled && (
        <OpenRegisterModal
          open={showOpenRegister}
          onClose={() => { markPrompted(); setShowOpenRegister(false); setPendingCheckout(null); }}
          storeId={storeId}
          userName={(user as any)?.firstName || (user as any)?.email || "Staff"}
          drawerId={drawerId}
        />
      )}

      {needsDrawerPicker && (
        <div className="drawer-picker">
          <div>
            <h2>Which cash drawer is this?</h2>
            {drawers.map((d) => (
              <button key={d.id} type="button" onClick={() => selectDrawer(d.id)}>{d.name}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
