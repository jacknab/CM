/**
 * BarberHome — /barber, the simplified staff screen for barbershop accounts.
 *
 * Sits on top of the normal Certxa engine: walk-in tickets share its checkout,
 * choice is the TURN queue, checkout is the POS tab itself (CheckoutMode). This
 * file only owns the screen state and wires the pieces together.
 */
import { OfflineLimitLock } from "@/components/offline/OfflineLimitLock";
import { EMPTY_ARRAY } from "@/lib/empty";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, Clock, CreditCard, RefreshCw, Gift, KeyRound, Loader2, LockKeyhole, Printer, Search, Settings, ShoppingBag, Wallet } from "lucide-react";
import { useSelectedStore } from "@/hooks/use-store";
import { useAuth } from "@/hooks/use-auth";
import { useServices } from "@/hooks/use-services";
import { useAddons, useAddonsForService, useServiceCategories } from "@/hooks/use-addons";
import { useActiveRegisterId } from "@/hooks/use-registers";
import { useActiveDrawerId } from "@/hooks/use-cash-drawers";
import { useFeatureFlags } from "@/hooks/use-features";
import { useSettingsSync } from "@/hooks/use-settings-sync";
import { useThermalPrinter } from "@/hooks/use-thermal-printer";
import { useToast } from "@/hooks/use-toast";
import { OpenRegisterModal } from "@/components/cash/OpenRegisterModal";
import { DayCloseModal } from "@/components/cash/DayCloseModal";
import { useStoreNetworkReport } from "@/hooks/use-store-network-report";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { hardRefresh } from "@/lib/hard-refresh";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { buildCheckinTicket } from "@/lib/thermalPrinter";
import { ClientLookupSheet } from "@/components/staff-screen/ClientLookupSheet";
import { ManagerPinSheet } from "@/components/staff-screen/ManagerPinSheet";
import { TimeClockSheet } from "@/components/staff-screen/TimeClockSheet";
import { VoucherRedeemSheet } from "@/components/staff-screen/VoucherRedeemSheet";
import {
  ApiError, assignMarker, barberUrl, boardKey, cancelTicket, checkoutRequestKey, claimKioskPrintJob, completeTicket, createTicket, fetchBoard, fetchClient,
  clockInTech, clockOutTech, fetchNailConfig, fetchTurn, reassignTicket, removeMarker, setBarberStoreId, startTicket, updateTicket,
  type BarberSignIn, type BoardMarker, type BoardTicket, type ClientSummary, type FinalizeData, type TurnTech,
} from "./barberApi";
import { defaultPick, draftTotals, EMPTY_PICK, type DraftCustomLine, type NailPick, type TicketLine } from "./barberTicketDraft";
import { useBarberRealtime } from "./useBarberRealtime";
import { TicketPanel } from "./TicketPanel";
import { CatalogPanel, Keypad, type CatalogGroup, type CatalogService } from "./CatalogPanel";
import { CheckInLookup } from "./CheckInLookup";
import { TechClockInSheet } from "./TechClockInSheet";
import { TechClockOutSheet } from "./TechClockOutSheet";
import { GiftCardSheet } from "./GiftCardSheet";
import { useAppointmentSSE } from "@/hooks/use-appointment-sse";
import { TechCards } from "./TechCards";
import { QueueTab, type QueueView } from "./QueueTab";
import "./barber.css";
import { AssignTechSheet } from "./AssignTechSheet";
import { CheckInBoard } from "./CheckInBoard";
import { TicketPopup } from "./TicketPopup";
import { ReceiptDialog } from "./ReceiptDialog";
import { LookupByNumberDialog } from "./LookupByNumberDialog";
import { TicketStatusDialog, type LookupTicketStatus } from "./TicketStatusDialog";
import { BottomNav, type NailTab } from "./BottomNav";
import { BarberIdGate } from "./BarberIdGate";
import { MarkerPopup } from "./MarkerPopup";
import { RegisterPicker } from "./RegisterPicker";
import { PairCustomerScreenDialog, StationsFullBanner } from "@/components/pos/PairCustomerScreen";
import { MoreMenu, type MoreTile } from "./MoreMenu";
import { hasNewWaitingEntityForPhone, waitingEntityKeys } from "./boardView";
import { printNativeCheckinTicket, slipServiceNames } from "@/lib/native-checkin-ticket";
import type { SalesTaxSettings } from "@shared/nailCheckout";

// The checkout screen is loaded on its own. It is fetched as soon as this screen opens, not on the first
// tap of CHECKOUT, so it is already on the tablet when the network drops.
const loadCheckoutMode = () => import("./CheckoutMode");
const CheckoutMode = lazy(() => loadCheckoutMode().then((module) => ({ default: module.CheckoutMode })));

type Assigning = { mode: "assign" | "reassign"; ticket: BoardTicket } | null;

export default function BarberHome() {
  useEffect(() => { void loadCheckoutMode().catch(() => {}); }, []);
  const { selectedStore } = useSelectedStore();
  const { user } = useAuth();
  const barberShop = /barber/i.test((selectedStore as any)?.category ?? "");
  // Technician (staff-portal) logins have no store of their own — this screen is for the front desk.
  if (!selectedStore && (user as any)?.staffId) return <Navigate to="/calendar" replace />;
  if (!selectedStore) {
    return <main className="dark cx-cal barber-app h-app w-full flex items-center justify-center"><h1 className="sr-only">Barbershop front desk</h1><Loader2 className="w-7 h-7 animate-spin" style={{ color: "#8b94a0" }} /></main>;
  }
  if (!barberShop) return <Navigate to="/calendar" replace />;
  const st = selectedStore as any;
  setBarberStoreId(selectedStore.id);
  const storeCityStateZip = [st.city, [st.state, st.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || undefined;
  return (
    <BarberScreen
      storeId={selectedStore.id}
      storeName={st.name ?? ""}
      storeAddress={st.address || undefined}
      storeCityStateZip={storeCityStateZip}
      storePhone={st.phone || undefined}
      timezone={st.timezone ?? "UTC"}
      salesTax={{ rate: Number(st.salesTaxRate ?? 0) || 0, services: st.taxServicesTaxable === true, products: st.taxProductsTaxable !== false }}
    />
  );
}

function BarberScreen({ storeId, storeName, storeAddress, storeCityStateZip, storePhone, timezone, salesTax }: {
  storeId: number; storeName: string; storeAddress?: string; storeCityStateZip?: string; storePhone?: string; timezone: string; salesTax: SalesTaxSettings;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const features = useFeatureFlags();
  const thermalPrinter = useThermalPrinter();
  const navigate = useNavigate();
  const {
    registerId, needsPicker: needsRegisterPicker, registers: registerOptions, takenRegisters, selectRegister,
    isMultiStation, currentRegisterName, resetRegister, stationsFull,
  } = useActiveRegisterId(storeId);
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
  // Who is at the POS right now. Nobody → the Barber ID keypad; it comes back after each assign or checkout.
  const [barber, setBarber] = useState<BarberSignIn["staff"] | null>(null);
  // The waiting client whose card is open (no ticket yet): Assign / Cancel.
  const [markerPopup, setMarkerPopup] = useState<BoardMarker | null>(null);
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [checkinId, setCheckinId] = useState<number | null>(null);
  const [service, setService] = useState<CatalogService | null>(null);
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [pick, setPick] = useState<NailPick>(EMPTY_PICK);
  const [customs, setCustoms] = useState<DraftCustomLine[]>([]);
  const customSeq = useRef(0);
  const [activeGroup, setActiveGroup] = useState("");
  const [moreAddons, setMoreAddons] = useState(false);
  const [editing, setEditing] = useState<BoardTicket | null>(null);
  // The ticket whose card is open. It opens over whatever screen it was tapped on (Techs, mostly) and closes back to that same screen.
  const [popupId, setPopupId] = useState<number | null>(null);
  const [queueView, setQueueView] = useState<QueueView | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [showGift, setShowGift] = useState(false);
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
  const [sheet, setSheet] = useState<null | "voucher" | "timeclock" | "dayclose" | "clients" | "manager">(null);
  const [assigning, setAssigning] = useState<Assigning>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [frontdeskPhone, setFrontdeskPhone] = useState("");
  // The ticket being paid in the POS tab (null = the POS tab is the ticket builder). A new customer-screen event arrives as a new object.
  const [checkout, setCheckout] = useState<BoardTicket | null>(null);
  const [checkoutEvent, setCheckoutEvent] = useState<{ type: string; [k: string]: unknown } | null>(null);
  // True once the ticket is actually completed server-side — the checkout screen then shows Print/Text/No Receipt
  // instead of the payment buttons, and stays open until one of those is picked (see finishCheckout below).
  const [ticketPaid, setTicketPaid] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<BoardTicket | null>(null);
  const [showOpenRegister, setShowOpenRegister] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4500);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  // ── data ──────────────────────────────────────────────────────────────────
  const refreshAll = useSettingsSync(true);
  const live = useBarberRealtime({
    storeId, registerId, refreshAll, onFrontdeskPhone: setFrontdeskPhone, onFrontdeskTyping,
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

  const { data: board } = useQuery({
    queryKey: boardKey(storeId),
    queryFn: fetchBoard,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  // Barbershops use only walk-ins; no calendar fallback or advance-booking tab.
  const dayBookings = board?.dayBookings?.filter((visit) => visit.isWalkIn) ?? EMPTY_ARRAY;
  const tickets = board?.tickets ?? [];
  // Elapsed times ("waiting 12 min", "free for 25 min") are measured against the SERVER clock so two POS stations agree.
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  useEffect(() => { if (board?.now) setClockOffsetMs(Date.parse(board.now) - Date.now()); }, [board]);
  const markers = board?.markers ?? [];
  const waitingCount = tickets.filter((t) => t.status === "confirmed").length + markers.length;

  // Technician status for the Techs tab — same TURN feed as the assign popup, kept live by the socket.
  const { data: techFeed, isLoading: techsLoading } = useQuery({
    queryKey: ["/api/turn/eligibility", storeId, "barber-techs"],
    queryFn: () => fetchTurn(storeId, null),
    enabled: tab === "techs" || tab === "queue",
    refetchInterval: 30_000,
  });
  const techList = techFeed?.technicians ?? EMPTY_ARRAY;
  // Once the server itself says they're in, stop assuming.
  useEffect(() => {
    setAssumedIn((cur) => { const next = cur.filter((id) => techList.find((t) => t.id === id)?.clockedIn === false); return next.length === cur.length ? cur : next; });
  }, [techList]);

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

  const activeAddons = useMemo(() => ((storeAddons ?? []) as any[]).filter((a) => a.isActive !== false), [storeAddons]);
  const { data: linkedAddons } = useAddonsForService(service?.id ?? null);
  const suggestedAddons = useMemo(() => {
    const linked = ((linkedAddons ?? []) as any[]).filter((a) => a.isActive !== false);
    return linked.length > 0 && service ? linked : activeAddons;
  }, [linkedAddons, activeAddons, service]);
  const shownAddons = moreAddons ? activeAddons : suggestedAddons.slice(0, 6);

  const { data: nailCfg = null, isLoading: nailLoading } = useQuery({
    queryKey: ["/api/services", service?.id, "barber-config"],
    queryFn: () => fetchNailConfig(service!.id),
    enabled: !!service,
    staleTime: 60_000,
  });

  // Start each newly chosen service on its default nail options (edit mode seeds its own).
  const pickSeededFor = useRef<number | null>(null);
  useEffect(() => {
    if (!service || nailLoading || pickSeededFor.current === service.id) return;
    pickSeededFor.current = service.id;
    setPick(defaultPick(nailCfg));
  }, [service, nailCfg, nailLoading]);

  const totals = useMemo(
    () => draftTotals(service, addonIds, activeAddons, nailCfg, pick, customs),
    [service, addonIds, activeAddons, nailCfg, pick, customs],
  );
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
    setClient(null); setCheckinId(null); setService(null); setAddonIds([]); setPick(EMPTY_PICK); setCustoms([]);
    setEditing(null); pickSeededFor.current = null; setMoreAddons(false);
  }, []);

  // Done at the POS: hand it back to the keypad for the next barber.
  const lock = useCallback(() => {
    setBarber(null); setMarkerPopup(null); setPopupId(null); resetDraft(); setTab("queue");
  }, [resetDraft]);

  const chooseService = (svc: CatalogService) => {
    if (service?.id === svc.id) return;
    setService(svc);
    pickSeededFor.current = null;
    if (editing === null) setPick(EMPTY_PICK);
  };
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
    if (line.customId != null) setCustoms((cur) => cur.filter((c) => c.id !== line.customId));
    else if (line.addonId != null) toggleAddon(line.addonId);
    else if (line.group) setPick((p) => ({ ...p, [line.group!]: null }));
  };

  const pickClient = async (clientId: number, marker?: number | null) => {
    try {
      setClient(await fetchClient(clientId));
      setCheckinId(marker ?? null);
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
    setCustoms(t.customLines.map((c) => ({ id: ++customSeq.current, label: c.label, price: c.price, isRetail: c.isRetail })));
    setPick({ size: t.nail?.sizeId ?? null, shape: t.nail?.shapeId ?? null, application: t.nail?.applicationId ?? null, effect: t.nail?.effectId ?? null });
    setEditing(t);
    setActiveGroup(groups.find((g) => g.services.some((s) => s.id === svc.id))?.key ?? activeGroup);
    setTab("pos");
  };

  const invalidateBoard = () => {
    queryClient.invalidateQueries({ queryKey: boardKey(storeId) });
    queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility"] });
    queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
  };

  // ── mutations ─────────────────────────────────────────────────────────────
  const customLines = useMemo(() => customs.map(({ label, price, isRetail }) => ({ label, price, isRetail })), [customs]);
  // Saving a ticket hands it to TURN: the next technician in line who can do the service gets it and it starts
  // right away. Nobody free → it waits, unassigned, and the next tech to finish a client picks it up.
  const create = useMutation({
    mutationFn: () =>
      // The ticket belongs to the barber who is ringing it up; nothing is handed out by TURN here.
      createTicket({ clientId: client!.id, serviceId: service!.id, addonIds, pick, customLines, staffId: barber?.id ?? null, autoAssign: !barber, checkinId }),
    onSuccess: (r) => {
      invalidateBoard();
      const shouldPay = payAfterCreate.current;
      payAfterCreate.current = false;
      if (shouldPay) void openTicketForCheckout(r.appointmentId);
      else setTab("queue");
      const stay = shouldPay;
      say(r.staffName
        ? `Ticket #${r.ticketNumber} · ${r.staffName} · ${r.waiting ? `waiting, starts about ${new Date(r.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "in service"}`
        : `Ticket #${r.ticketNumber} is waiting · no barber free yet`);
      if (stay) resetDraft(); else lock();
    },
    onError: (err: any) => {
      payAfterCreate.current = false;
      const message = err instanceof ApiError ? err.message : "Couldn't create the ticket. Try again.";
      toast({ title: "Couldn't save the ticket", description: message, variant: "destructive" });
    },
  });

  const update = useMutation({
    mutationFn: () => updateTicket(editing!.id, { serviceId: service!.id, addonIds, pick, customLines }, editing!),
    onSuccess: () => { invalidateBoard(); say("Ticket updated"); resetDraft(); setTab("queue"); },
    onError: (err: any) => toast({ title: "Couldn't update the ticket", description: err?.message, variant: "destructive" }),
  });

  const reassign = useMutation({
    mutationFn: (v: { id: number; staffId: number }) => reassignTicket(v.id, v.staffId),
    onSuccess: (r, v) => {
      invalidateBoard(); setAssigning(null); setAssignError(null); say(`Moved to ${r.staffName}`);
      if (payAfterAssign.current === v.id) { payAfterAssign.current = null; void openTicketForCheckout(v.id); }
    },
    onError: (err: any) => setAssignError(err instanceof ApiError ? err.message : "Couldn't reassign. Try again."),
  });

  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: invalidateBoard,
    onError: (err: any) => toast({ title: "That didn't go through", description: err?.message, variant: "destructive" }),
  });

  // ── checkout ──────────────────────────────────────────────────────────────
  const posEnabled = features.pos !== false;
  const { data: openDrawerSession } = useQuery({
    queryKey: [`/api/cash-drawer/open?storeId=${storeId}&drawerId=${drawerId}`],
    enabled: posEnabled,
    staleTime: 60_000,
  });

  // Paying a ticket happens right here: the POS tab switches from the ticket builder to that ticket's checkout.
  const openCheckout = useCallback((t: BoardTicket) => {
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
      else toast({ title: "Ticket created", description: "Open it from Checked In to take payment.", variant: "destructive" });
    } catch { toast({ title: "Ticket created", description: "Open it from Checked In to take payment.", variant: "destructive" }); }
  };

  const requestCheckout = (t: BoardTicket) => {
    // A ticket is never paid without its technician — that's who earns the commission and the TURN credit.
    if (!t.staff) {
      payAfterAssign.current = t.id;
      setAssignError(null);
      setAssigning({ mode: "assign", ticket: t });
      say("Assign a barber first — checkout opens right after");
      return;
    }
    if (posEnabled && !openDrawerSession && navigator.onLine) {
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
    mutationFn: (data: FinalizeData) => completeTicket(checkout!.id, data),
    // Completed — but stay on this ticket's checkout screen (Print/Text/No Receipt takes it from here) rather than
    // jumping away immediately, so a receipt can still be sent for a sale that's already safely recorded.
    onSuccess: () => { invalidateBoard(); setTicketPaid(true); say("Checked out"); },
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

  // The receipt has been handled (printed / texted / declined) for an already-paid ticket — now leave the checkout screen.
  const finishCheckout = useCallback(() => { setCheckout(null); setTicketPaid(false); lock(); }, [lock]);

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
  // A ticket that resolved to a real appointment but isn't on today's live board — cancelled,
  // no-show, pending, or completed with no receipt token to open instead. Nothing live to open
  // for any of these; TicketStatusDialog shows the record's actual status rather than erroring
  // as if the ticket number didn't exist.
  const [lookupStatus, setLookupStatus] = useState<LookupTicketStatus | null>(null);
  const applyLookupResult = useCallback(async (data: any) => {
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

  const handleScan = useCallback(async (raw: string) => {
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
      toast({ title: "Scan failed", description: "Couldn't reach the server. Try again.", variant: "destructive" });
    }
  }, [toast, say, openTicketById, applyLookupResult]);
  useBarcodeScanner(handleScan);

  // The "# 123" ticket-number fallback when a slip's QR won't scan — see LookupByNumberDialog.
  const [showLookupByNumber, setShowLookupByNumber] = useState(false);
  const lookupByNumber = useCallback(async (ticketNumber: number): Promise<boolean> => {
    try {
      const res = await fetch(barberUrl("/api/barber/lookup-by-number"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketNumber }),
      });
      const data = res.ok ? await res.json() : null;
      if (!data?.found) return false;
      await applyLookupResult(data);
      setShowLookupByNumber(false);
      return true;
    } catch {
      return false;
    }
  }, [applyLookupResult]);

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

  // ── paired /frontdesk tablet ───────────────────────────────────────────────
  const [dualScreen, setDualScreen] = useState(false);
  useEffect(() => {
    fetch("/api/kiosk-settings", { credentials: "include" })
      .then((r) => r.json()).then((d) => setDualScreen(d?.dualScreenMode === true)).catch(() => {});
  }, [storeId]);

  // ── the calendar's other tools, from the More menu ────────────────────────
  const timeclockEnabled = features.timeclock !== false;
  // Offline mode runs from cached files — wiping them there would break it, so no Hard Refresh while offline.
  const offline = useNetworkStatus() === "offline";
  const moreTiles: MoreTile[] = [
    { key: "clients", label: "Client Lookup", icon: Search, run: () => setSheet("clients") },
    { key: "voucher", label: "Redeem Voucher", icon: Gift, run: () => setSheet("voucher") },
    ...(timeclockEnabled ? [{ key: "timeclock", label: "In / Out", icon: Clock, run: () => setSheet("timeclock") }] : []),
    ...(posEnabled ? [
      { key: "register", label: "Cash Drawer", sub: openDrawerSession ? "Open" : "Closed", icon: Wallet, run: () => setShowOpenRegister(true) },
      { key: "retail", label: "Retail Sale", icon: ShoppingBag, run: () => navigate("/pos") },
      { key: "dayclose", label: "Day Close", icon: LockKeyhole, run: () => setSheet("dayclose") },
    ] : []),
    { key: "manager", label: "Manager", icon: KeyRound, run: () => setSheet("manager") },
    { key: "reports", label: "Reports", icon: BarChart3, run: () => navigate("/reports") },
    { key: "messages", label: "Messages", icon: Bell, run: () => navigate("/sms-inbox") },
    ...(thermalPrinter.isAvailable ? [{
      key: "printer", icon: Printer, label: "Printer",
      sub: thermalPrinter.isConnected ? `${thermalPrinter.deviceName?.split(" ")[0] ?? "Printer"} · connected` : thermalPrinter.status === "connecting" ? "Connecting…" : thermalPrinter.status === "error" ? "Error · retry" : "Tap to connect",
      run: () => { void (thermalPrinter.isConnected ? thermalPrinter.disconnect() : thermalPrinter.connect()); },
    }] : []),
    ...(isMultiStation && currentRegisterName ? [{
      key: "station", icon: CreditCard, label: "Station", sub: currentRegisterName,
      run: () => setPairScreenOpen(true),
    }] : []),
    { key: "settings", label: "Settings", icon: Settings, run: () => navigate("/settings") },
    ...(offline ? [] : [{
      key: "refresh", label: "Hard Refresh", sub: "Fix a page that won't load", icon: RefreshCw, run: () => { void hardRefresh(); },
      confirm: {
        title: "Hard refresh?",
        body: "This reloads the whole app from the server, like pressing Ctrl + Shift + R. Any ticket you're in the middle of building will be cleared. Your login and this tablet's station setup are kept.",
        action: "REFRESH NOW",
      },
    }]),
  ];

  // ── Check-In sheet: put the /frontdesk tablet on its check-in screen while it's open ──
  useEffect(() => {
    if (!showCheckIn || !dualScreen) return;
    const send = (type: string) => fetch("/api/kiosk/checkout-event", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, registerId }),
    }).catch(() => {});
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
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", storeId, "barber-techs"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", storeId, "barber-techs"] });
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
  const payNow = () => {
    if (!canSubmit || editing) return;
    payAfterCreate.current = true;
    create.mutate();
  };
  const clearDraft = () => {
    if (editing) setTab("queue");
    resetDraft();
  };

  // A kiosk check-in with no ticket yet → start their ticket. (One with no client on file used to open the walk-in sheet to find or
  // create them by phone; that sheet is gone, so this can only tell staff to use Check-In manually instead of silently doing nothing.)
  const startFromMarker = (m: BoardMarker) => {
    if (!m.clientId) {
      toast({ title: "No client on file for this check-in", description: "Use Check-In to look them up or add them, then start their ticket from there." });
      return;
    }
    setTab("pos");
    void pickClient(m.clientId, m.id);
  };

  // ── Barber ID sign-in, and taking a waiting client ────────────────────────
  // A barber who already has a client goes straight to ringing them up; everyone else lands on the queue.
  const onBarberSignedIn = (who: BarberSignIn) => {
    setBarber(who.staff);
    if (who.activeMarker) startFromMarker({ ...who.activeMarker, ticketNumber: null, phone: null, createdAt: "" });
    else if (who.activeTicketId != null) void openTicketForCheckout(who.activeTicketId);
  };
  const openMarker = (m: BoardMarker) => {
    if (m.staffId == null) { setMarkerPopup(m); return; }
    if (m.staffId === barber?.id) startFromMarker(m);
    else say(`${m.clientName ?? "This client"} is with ${m.staffName ?? "another barber"}`);
  };
  const takeMarker = useMutation({
    mutationFn: (m: BoardMarker) => assignMarker(m.id, barber!.id),
    onSuccess: (r, m) => { invalidateBoard(); say(`${m.clientName ?? "Client"} is with ${r.staffName}`); lock(); },
    onError: (err: any) => {
      invalidateBoard(); setMarkerPopup(null);
      toast({ title: "Couldn't assign this client", description: err instanceof ApiError ? err.message : "Try again.", variant: "destructive" });
    },
  });

  const ticketActions = {
    // Defense in depth: even if another view invokes Start for an unassigned ticket,
    // assignment is required first so the ticket cannot disappear into an invalid started state.
    onStart: (t: BoardTicket) => {
      if (!t.staff) {
        setAssignError(null);
        setAssigning({ mode: "assign", ticket: t });
        return;
      }
      act.mutate(() => startTicket(t.id));
    },
    onCheckout: requestCheckout,
    onReassign: (t: BoardTicket) => { setAssignError(null); setAssigning({ mode: t.staff ? "reassign" : "assign", ticket: t }); },
    onEdit: startEdit,
    onCancel: (t: BoardTicket) => { if (window.confirm(`Cancel ${t.client.name}'s ticket?`)) act.mutate(() => cancelTicket(t.id)); },
  };
  // The lock screen's short list: clients no barber has taken yet, in the same order as the queue.
  const waitingForGate = useMemo(() => [
    ...markers.filter((m) => m.staffId == null).map((m) => ({ key: `m${m.id}`, ticketNumber: m.ticketNumber, name: m.clientName?.trim() || "Guest", at: +new Date(m.createdAt) })),
    ...tickets.filter((t) => t.status === "confirmed").map((t) => ({ key: `t${t.id}`, ticketNumber: t.ticketNumber ?? null, name: t.client.name?.trim() || "Guest", at: +new Date(t.checkedInAt ?? t.date) })),
  ].sort((a, b) => {
    if (a.ticketNumber != null && b.ticketNumber != null) return a.ticketNumber - b.ticketNumber;
    if (a.ticketNumber != null) return -1;
    if (b.ticketNumber != null) return 1;
    return a.at - b.at;
  }), [markers, tickets]);

  const popupTicket = popupId != null ? tickets.find((t) => t.id === popupId) ?? null : null;
  // The ticket being paid, as the board has it now (another station may have edited it). Once it's paid it leaves
  // the board, so the last copy is kept for the receipt screen.
  const lastLiveCheckout = useRef<BoardTicket | null>(null);
  const onBoard = checkout ? tickets.find((t) => t.id === checkout.id) ?? null : null;
  if (onBoard) lastLiveCheckout.current = onBoard;
  const liveCheckout = onBoard ?? (checkout && lastLiveCheckout.current?.id === checkout.id ? lastLiveCheckout.current : null);

  return (
    <div className="dark cx-cal barber-app h-app w-full" data-testid="barber-home">
      <OfflineLimitLock />
      <a className="barber-skip-link" href="#barber-main">Skip to main content</a>
      <h1 className="sr-only">Barbershop front desk</h1>
      {notice && <div className="barber-notice" data-testid="barber-notice">{notice}</div>}

      <main id="barber-main" className={`pos-shell ${tab === "board" || tab === "queue" ? "checkin-page" : ""} ${tab === "techs" ? "techs-page" : ""}`}>
        {/* Checkout: the POS tab's own screen (ticket · keypad · payment / functions). It stays mounted while staff peek at another
            tab, so a half-paid ticket — or a card that has already been charged — is never lost. */}
        {checkout && (
          <div style={{ display: tab === "pos" ? "contents" : "none" }}>
            <Suspense fallback={<div className="barber-route-loading" role="status"><Loader2 className="animate-spin" /> Loading checkout…</div>}><CheckoutMode
              key={checkout.id}
              ticket={liveCheckout ?? checkout}
              salesTax={salesTax}
              storeId={storeId}
              storeName={storeName}
              storeAddress={storeAddress}
              storeCityStateZip={storeCityStateZip}
              storePhone={storePhone}
              timezone={timezone}
              registerId={registerId}
              dualScreen={dualScreen}
              otherTickets={tickets.filter((t) => t.id !== checkout.id && t.status === "started")}
              thermalPrint={thermalPrinter.isConnected ? thermalPrinter.print : undefined}
              finalizing={finalize.isPending}
              paid={ticketPaid}
              socketEvent={checkoutEvent}
              onFinalize={(data) => finalize.mutate(data)}
              onReceiptDone={finishCheckout}
              onClose={() => { setCheckout(null); setTab("queue"); }}
            /></Suspense>
          </div>
        )}
        {checkout && tab === "pos" ? null : tab === "pos" ? (
          <>
            <TicketPanel
              client={client}
              badge={editing ? `#${editing.ticketNumber ?? editing.id}` : "NEW"}
              lines={totals.lines}
              duration={totals.duration}
              price={totals.price}
               submitLabel={editing ? "UPDATE TICKET" : !client ? "START A WALK-IN FIRST" : !service ? "ADD A SERVICE FIRST" : "SAVE TICKET"}
              canSubmit={canSubmit}
              busy={busy}
              editing={!!editing}
              onRemove={removeLine}
              onClear={clearDraft}
              onSubmit={submit}
              onPayNow={editing ? undefined : payNow}
            />
            <section className="work-area">
              <div className="sale-area">
                <Keypad locked={!client} onEnter={addCustom} onGiftCard={() => setShowGift(true)} />
                <CatalogPanel
                  locked={!client}
                  groups={groups}
                  activeGroup={activeGroup}
                  onGroup={setActiveGroup}
                  serviceId={service?.id ?? null}
                  onService={chooseService}
                  addons={shownAddons}
                  moreAddons={moreAddons}
                  onToggleMore={() => setMoreAddons((v) => !v)}
                  hasMoreAddons={moreAddons || activeAddons.length > Math.min(6, suggestedAddons.length)}
                  addonIds={addonIds}
                  onToggleAddon={toggleAddon}
                />
              </div>
            </section>
          </>
        ) : tab === "techs" ? (
          <TechCards techs={techList} tickets={tickets} markers={markers} glance={board?.glance} stats={board?.techStats ?? EMPTY_ARRAY} loading={techsLoading} clockOffsetMs={clockOffsetMs} assumedIn={assumedIn} onClockedOutTap={setClockInFor} onClockedInTap={setClockOutFor} onQueueView={(view) => { setQueueView(view); setTab("queue"); }} />
        ) : tab === "queue" ? (
          <QueueTab techs={techList} tickets={tickets} markers={markers} dayBookings={dayBookings} glance={board?.glance} clockOffsetMs={clockOffsetMs} assumedIn={assumedIn} initialView={queueView} onMarker={openMarker} onMarkerRemove={(m) => act.mutate(() => removeMarker(m.id))} onTicket={(t) => setPopupId(t.id)} onAssignTicket={(t) => { setAssignError(null); setAssigning({ mode: "assign", ticket: t }); }} onTicketTap={(t) => setPopupId(t.id)} onTechs={() => setTab("techs")} />
        ) : (
          <CheckInBoard tickets={tickets} busy={act.isPending} {...ticketActions} clockOffsetMs={clockOffsetMs} />
        )}

      <BottomNav tab={tab} onTab={(next) => { setQueueView(null); setTab(next); }} onCheckIn={openCheckIn} onMore={() => setShowMore(true)} onLookupByNumber={() => setShowLookupByNumber(true)} waiting={waitingCount} live={live} />
      </main>

      {showGift && <GiftCardSheet onClose={() => setShowGift(false)} onSay={say} />}

      {popupTicket && <TicketPopup ticket={popupTicket} busy={act.isPending} {...ticketActions} clockOffsetMs={clockOffsetMs} onClose={() => setPopupId(null)} />}
      {receiptToken && <ReceiptDialog token={receiptToken} onClose={() => setReceiptToken(null)} />}
      {lookupStatus && <TicketStatusDialog ticket={lookupStatus} onClose={() => setLookupStatus(null)} />}
      {showLookupByNumber && <LookupByNumberDialog onLookup={lookupByNumber} onClose={() => setShowLookupByNumber(false)} />}

      {clockOutFor && <TechClockOutSheet tech={clockOutFor} busy={false} onClockOut={() => void setTechOut(clockOutFor)} onClose={() => setClockOutFor(null)} />}

      {clockInFor && <TechClockInSheet tech={clockInFor} busy={false} onSetIn={() => void setTechIn(clockInFor)} onClose={() => setClockInFor(null)} />}

      {showMore && <MoreMenu tiles={moreTiles} onClose={() => setShowMore(false)} />}

      {showCheckIn && (
        <CheckInLookup
          storeId={storeId}
          frontdeskShowing={dualScreen}
          clientEnteringPhone={clientTyping}
          onClose={() => setShowCheckIn(false)}
          onDone={(line) => { setShowCheckIn(false); say(line); invalidateBoard(); }}
          onPrintTicket={thermalPrinter.isConnected ? async (result) => {
            const appointment = result.todayAppointment;
            const qrValue = appointment ? `BK:${appointment.id}` : result.checkin ? `CI:${result.checkin.token}` : "";
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

      {sheet === "clients" && <ClientLookupSheet onClose={() => setSheet(null)} />}
      {sheet === "voucher" && (
        <VoucherRedeemSheet onClose={() => setSheet(null)} onRedeemed={(appointmentId) => { setSheet(null); void openTicketById(appointmentId); }} />
      )}
      {sheet === "timeclock" && <TimeClockSheet storeId={storeId} onClose={() => { setSheet(null); invalidateBoard(); }} />}
      {sheet === "manager" && <ManagerPinSheet onClose={() => setSheet(null)} onSuccess={() => { setSheet(null); navigate("/salon-dashboard"); }} />}
      {posEnabled && (
        <DayCloseModal open={sheet === "dayclose"} onClose={() => setSheet(null)} storeId={storeId}
          userName={(user as any)?.firstName || (user as any)?.email || "Staff"} drawerId={drawerId} />
      )}

      {markerPopup && barber && <MarkerPopup marker={markerPopup} busy={takeMarker.isPending} onAssign={(m) => takeMarker.mutate(m)} onClose={() => setMarkerPopup(null)} />}
      {!barber && !needsRegisterPicker && !needsDrawerPicker && <BarberIdGate storeName={storeName} timezone={timezone} waiting={waitingForGate} onSignedIn={onBarberSignedIn} />}
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
          onClose={() => { setAssigning(null); setAssignError(null); payAfterAssign.current = null; }}
          onConfirm={(staffId) => {
            setAssignError(null);
            if (staffId != null) reassign.mutate({ id: assigning.ticket.id, staffId });
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
