/**
 * NailHome — /nail, the simplified staff screen for nail-salon accounts.
 *
 * Sits on top of the normal Certxa engine: tickets are appointments, technician
 * choice is the TURN queue, checkout is the calendar's own checkout sheet. This
 * file only owns the screen state and wires the pieces together.
 */
import { EMPTY_ARRAY } from "@/lib/empty";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, Clock, CreditCard, RefreshCw, Gift, KeyRound, Loader2, LockKeyhole, Printer, Search, Settings, ShoppingBag, CalendarPlus, Wallet } from "lucide-react";
import { useSelectedStore } from "@/hooks/use-store";
import { useAuth } from "@/hooks/use-auth";
import { useServices } from "@/hooks/use-services";
import { useAddons, useAddonsForService, useServiceCategories } from "@/hooks/use-addons";
import { useActiveRegisterId } from "@/hooks/use-registers";
import { useActiveDrawerId } from "@/hooks/use-cash-drawers";
import { useFeatureFlags, isNailSalonBiz } from "@/hooks/use-features";
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
import { CheckoutPOSPanel, ChooseClientPanel, ClientLookupSheet, ManagerPinSheet, TimeClockSheet, VoucherRedeemSheet } from "@/pages/Calendar";
import type { AppointmentWithDetails } from "@shared/schema";
import {
  ApiError, BOARD_KEY, cancelTicket, completeTicket, createTicket, fetchAppointment, fetchBoard, fetchClient,
  clockInTech, fetchNailConfig, fetchTurn, reassignTicket, removeMarker, startTicket, updateTicket,
  type BoardMarker, type BoardTicket, type ClientSummary, type FinalizeData, type TurnTech,
} from "./nailApi";
import { defaultPick, draftTotals, EMPTY_PICK, missingRequired, togglePick, type DraftCustomLine, type NailPick, type TicketLine } from "./ticketDraft";
import { useNailRealtime } from "./useNailRealtime";
import { TicketPanel } from "./TicketPanel";
import { CatalogPanel, Keypad, type CatalogGroup, type CatalogService } from "./CatalogPanel";
import { WalkInSheet } from "./WalkInSheet";
import { CheckInLookup } from "./CheckInLookup";
import { TechClockInSheet } from "./TechClockInSheet";
import { useAppointmentSSE } from "@/hooks/use-appointment-sse";
import { TechCards } from "./TechCards";
import { CheckInPanel } from "./CheckInPanel";
import "./nail.css";
import { AssignTechSheet } from "./AssignTechSheet";
import { CheckInBoard } from "./CheckInBoard";
import { BottomNav, type NailTab } from "./BottomNav";
import { RegisterPicker } from "./RegisterPicker";
import { MoreMenu, type MoreTile } from "./MoreMenu";

type Assigning = { mode: "create" } | { mode: "reassign"; ticket: BoardTicket } | null;

export default function NailHome() {
  const { selectedStore } = useSelectedStore();
  const { user } = useAuth();
  const nailSalon = isNailSalonBiz((selectedStore as any)?.category);
  // Technician (staff-portal) logins have no store of their own — this screen is for the front desk.
  if (!selectedStore && (user as any)?.staffId) return <Navigate to="/calendar" replace />;
  if (!selectedStore) {
    return <div className="dark cx-cal nail-app h-app w-full flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin" style={{ color: "#8b94a0" }} /></div>;
  }
  if (!nailSalon) return <Navigate to="/calendar" replace />;
  return <NailScreen storeId={selectedStore.id} timezone={(selectedStore as any).timezone ?? "UTC"} />;
}

function NailScreen({ storeId, timezone }: { storeId: number; timezone: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const features = useFeatureFlags();
  const thermalPrinter = useThermalPrinter();
  const navigate = useNavigate();
  const {
    registerId, needsPicker: needsRegisterPicker, registers: registerOptions, takenRegisters, selectRegister,
    isMultiStation, currentRegisterName, resetRegister,
  } = useActiveRegisterId(storeId);
  // Same duties the calendar screen has, so /kiosk and /frontdesk behave identically when this is the screen left open all day.
  useStoreNetworkReport(storeId);
  // A kiosk / front-desk check-in or an auto no-show moves the board without a socket event — the calendar's SSE feed.
  useAppointmentSSE(storeId);
  const printRef = useRef<((bytes: Uint8Array) => Promise<void>) | null>(null);
  printRef.current = thermalPrinter.isConnected ? thermalPrinter.print : null;
  const { drawerId, needsPicker: needsDrawerPicker, drawers, selectDrawer } = useActiveDrawerId(storeId);

  // ── screen state ──────────────────────────────────────────────────────────
  const [tab, setTab] = useState<NailTab>("pos");
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [checkinId, setCheckinId] = useState<number | null>(null);
  const [service, setService] = useState<CatalogService | null>(null);
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [pick, setPick] = useState<NailPick>(EMPTY_PICK);
  const [customs, setCustoms] = useState<DraftCustomLine[]>([]);
  const customSeq = useRef(0);
  const [preferredStaff, setPreferredStaff] = useState<number | null>(null);
  const [activeGroup, setActiveGroup] = useState("");
  const [moreAddons, setMoreAddons] = useState(false);
  const [editing, setEditing] = useState<BoardTicket | null>(null);
  const [showWalkIn, setShowWalkIn] = useState(false);
  // A kiosk check-in we already have a number for — the walk-in sheet skips the phone step for these.
  const [walkInKnown, setWalkInKnown] = useState<{ phone: string; name: string | null } | null>(null);
  const [focusTicket, setFocusTicket] = useState<{ id: number } | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  // "PAY NOW": create the ticket, then open it for payment in this tab.
  const payAfterCreate = useRef(false);
  // Techs page: a clocked-out tech's card was tapped → offer to set them In. `assumedIn` shows them In & Available at once,
  // until the server's answer (also pushed to every other station) arrives.
  const [clockInFor, setClockInFor] = useState<TurnTech | null>(null);
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
  const [checkout, setCheckout] = useState<{ ticket: BoardTicket; appointment: AppointmentWithDetails } | null>(null);
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
  const live = useNailRealtime({
    storeId, registerId, refreshAll, onFrontdeskPhone: setFrontdeskPhone, onFrontdeskTyping,
    // The kiosk's check-in ticket prints on the front-desk thermal printer, like on the calendar.
    onPrintJob: (data) => {
      if (data.jobType !== "checkin_ticket") return;
      try {
        const bytes = buildCheckinTicket({
          storeName: data.storeName ?? "", clientName: data.clientName ?? "Guest", staffName: data.staffName,
          services: data.services ?? [], appointmentId: data.appointmentId, ticketNumber: data.ticketNumber,
          bookingCode: data.bookingCode ?? `BK:${data.appointmentId}`, timeStr: data.timeStr ?? "", dateStr: data.dateStr ?? "",
        });
        printRef.current?.(bytes).catch(() => {});
      } catch { /* a bad ticket must never break the screen */ }
    },
  });

  const { data: board } = useQuery({
    queryKey: BOARD_KEY,
    queryFn: fetchBoard,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const tickets = board?.tickets ?? [];
  // Elapsed times ("waiting 12 min", "free for 25 min") are measured against the SERVER clock so two POS stations agree.
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  useEffect(() => { if (board?.now) setClockOffsetMs(Date.parse(board.now) - Date.now()); }, [board]);
  const markers = board?.markers ?? [];
  const waitingCount = tickets.filter((t) => t.status === "confirmed").length + markers.length;
  const inServiceCount = tickets.filter((t) => t.status === "started").length;

  // Technician status for the Techs tab — same TURN feed as the assign popup, kept live by the socket.
  const { data: techFeed, isLoading: techsLoading } = useQuery({
    queryKey: ["/api/turn/eligibility", storeId, "nail-techs"],
    queryFn: () => fetchTurn(storeId, null),
    enabled: tab === "techs",
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
    setPick(defaultPick(nailCfg));
  }, [service, nailCfg, nailLoading]);

  const totals = useMemo(
    () => draftTotals(service, addonIds, activeAddons, nailCfg, pick, customs),
    [service, addonIds, activeAddons, nailCfg, pick, customs],
  );
  const missing = missingRequired(nailCfg, pick);

  // ── ticket building ───────────────────────────────────────────────────────
  const resetDraft = useCallback(() => {
    setClient(null); setCheckinId(null); setService(null); setAddonIds([]); setPick(EMPTY_PICK); setCustoms([]); setPreferredStaff(null);
    setEditing(null); pickSeededFor.current = null; setMoreAddons(false);
  }, []);

  const chooseService = (svc: CatalogService) => {
    if (service?.id === svc.id) return;
    setService(svc);
    pickSeededFor.current = null;
    if (editing === null) setPick(EMPTY_PICK);
  };
  const toggleAddon = (id: number) => setAddonIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const addCustom = (amount: number, qty: number) => {
    customSeq.current += 1;
    setCustoms((cur) => [...cur, {
      id: customSeq.current,
      label: qty > 1 ? `Custom Amount ×${qty}` : "Custom Amount",
      price: Math.round(amount * qty * 100) / 100,
    }]);
  };
  const removeLine = (line: TicketLine) => {
    if (line.customId != null) setCustoms((cur) => cur.filter((c) => c.id !== line.customId));
    else if (line.addonId != null) toggleAddon(line.addonId);
    else if (line.group) setPick((p) => ({ ...p, [line.group!]: null }));
  };

  const pickClient = async (clientId: number, marker?: number | null, staffId?: number | null) => {
    setShowWalkIn(false);
    try {
      setClient(await fetchClient(clientId));
      setCheckinId(marker ?? null);
      setPreferredStaff(staffId ?? null);
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
    setCustoms(t.customLines.map((c) => ({ id: ++customSeq.current, label: c.label, price: c.price })));
    setPick({ size: t.nail?.sizeId ?? null, shape: t.nail?.shapeId ?? null, application: t.nail?.applicationId ?? null, effect: t.nail?.effectId ?? null });
    setEditing(t);
    setActiveGroup(groups.find((g) => g.services.some((s) => s.id === svc.id))?.key ?? activeGroup);
    setTab("pos");
  };

  const invalidateBoard = () => {
    queryClient.invalidateQueries({ queryKey: BOARD_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility"] });
    queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
  };

  // ── mutations ─────────────────────────────────────────────────────────────
  const customLines = useMemo(() => customs.map(({ label, price }) => ({ label, price })), [customs]);
  const create = useMutation({
    mutationFn: (staffId: number | null) =>
      createTicket({ clientId: client!.id, serviceId: service!.id, addonIds, pick, customLines, staffId, checkinId }),
    onSuccess: (r) => {
      invalidateBoard();
      setAssigning(null);
      setAssignError(null);
      if (payAfterCreate.current) { payAfterCreate.current = false; void openTicketForCheckout(r.appointmentId); }
      say(`Ticket #${r.ticketNumber} · ${r.staffName} · ${r.waiting ? `waiting, starts about ${new Date(r.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "in service"}`);
      resetDraft();
    },
    onError: (err: any) => setAssignError(err instanceof ApiError ? err.message : "Couldn't create the ticket. Try again."),
  });

  const update = useMutation({
    mutationFn: () => updateTicket(editing!.id, { serviceId: service!.id, addonIds, pick, customLines }),
    onSuccess: () => { invalidateBoard(); say("Ticket updated"); resetDraft(); setTab("board"); },
    onError: (err: any) => toast({ title: "Couldn't update the ticket", description: err?.message, variant: "destructive" }),
  });

  const reassign = useMutation({
    mutationFn: (v: { id: number; staffId: number }) => reassignTicket(v.id, v.staffId),
    onSuccess: (r) => { invalidateBoard(); setAssigning(null); setAssignError(null); say(`Moved to ${r.staffName}`); },
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

  const openCheckout = useCallback(async (t: BoardTicket) => {
    try {
      const appointment = (await fetchAppointment(t.id)) as AppointmentWithDetails;
      setCheckout({ ticket: t, appointment });
      setTab("pos");
    } catch (err: any) {
      toast({ title: "Couldn't open checkout", description: err?.message, variant: "destructive" });
    }
  }, [toast]);

  // A ticket that was just made: fetch it fresh from the board, then pay it here.
  const openTicketForCheckout = async (id: number) => {
    try {
      const b = await queryClient.fetchQuery({ queryKey: BOARD_KEY, queryFn: fetchBoard, staleTime: 0 });
      const t = b.tickets.find((x) => x.id === id);
      if (t) requestCheckout(t);
      else toast({ title: "Ticket created", description: "Open it from Checked In to take payment.", variant: "destructive" });
    } catch { toast({ title: "Ticket created", description: "Open it from Checked In to take payment.", variant: "destructive" }); }
  };

  const requestCheckout = (t: BoardTicket) => {
    if (posEnabled && !openDrawerSession && navigator.onLine) {
      setPendingCheckout(t);
      setShowOpenRegister(true);
      return;
    }
    void openCheckout(t);
  };
  // Carry on to checkout once the register has been opened.
  useEffect(() => {
    if (pendingCheckout && openDrawerSession) {
      const t = pendingCheckout;
      setPendingCheckout(null);
      setShowOpenRegister(false);
      void openCheckout(t);
    }
  }, [pendingCheckout, openDrawerSession, openCheckout]);

  const { data: siblings = EMPTY_ARRAY } = useQuery<AppointmentWithDetails[]>({
    queryKey: ["/api/appointments", storeId, "nail-checkout-siblings"],
    queryFn: async () => {
      const res = await fetch(`/api/appointments?storeId=${storeId}`, { credentials: "include" });
      const raw = res.ok ? await res.json() : [];
      return Array.isArray(raw) ? raw : [];
    },
    enabled: !!checkout,
  });

  const finalize = useMutation({
    mutationFn: (data: FinalizeData) => completeTicket(checkout!.ticket.id, data),
    onSuccess: () => { invalidateBoard(); setCheckout(null); setTab("board"); say("Checked out"); },
    onError: () => toast({ title: "Payment wasn't saved", description: "The sale didn't close. Check the ticket on the board.", variant: "destructive" }),
  });

  // ── open a ticket by id (scanner, voucher) ───────────────────────────────
  const openTicketById = useCallback(async (id: number) => {
    await queryClient.invalidateQueries({ queryKey: BOARD_KEY });
    const b = await queryClient.fetchQuery({ queryKey: BOARD_KEY, queryFn: fetchBoard });
    if (b.tickets.some((t) => t.id === id)) { setFocusTicket({ id }); setTab("board"); }
    else toast({ title: "That ticket isn't on today's board", description: "It may already be paid or cancelled.", variant: "destructive" });
  }, [queryClient, toast]);

  // ── QR / barcode scanner: a kiosk ticket or a deal voucher opens its ticket ──
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
      await openTicketById(data.appointmentId);
    } catch {
      toast({ title: "Scan failed", description: "Couldn't reach the server. Try again.", variant: "destructive" });
    }
  }, [toast, say, openTicketById]);
  useBarcodeScanner(handleScan);

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

  // ── mirror the walk-in phone prompt to the paired /frontdesk tablet ───────
  const [dualScreen, setDualScreen] = useState(false);
  useEffect(() => {
    fetch("/api/kiosk-settings", { credentials: "include" })
      .then((r) => r.json()).then((d) => setDualScreen(d?.dualScreenMode === true)).catch(() => {});
  }, [storeId]);
  useEffect(() => {
    if (!(showWalkIn || showBook) || !dualScreen || walkInKnown) return;
    const send = (type: string) => fetch("/api/kiosk/checkout-event", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, registerId }),
    }).catch(() => {});
    void send("kiosk_checkout_phone_prompt");
    return () => { void send("kiosk_checkout_phone_cancel"); };
  }, [showWalkIn, showBook, dualScreen, registerId, walkInKnown]);

  // ── the calendar's other tools, from the More menu ────────────────────────
  const timeclockEnabled = features.timeclock !== false;
  // Offline mode runs from cached files — wiping them there would break it, so no Hard Refresh while offline.
  const offline = useNetworkStatus() === "offline";
  const moreTiles: MoreTile[] = [
    { key: "book", label: "Book Appointment", icon: CalendarPlus, run: () => { setFrontdeskPhone(""); setShowBook(true); } },
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
      run: () => { if (window.confirm(`This tablet is paired as ${currentRegisterName}. Reset if it's being moved to a different station — you'll be asked to pick again.`)) resetRegister(); },
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
  // The customer checked themselves in on /frontdesk → the board gains a waiting entry: close the sheet.
  const waitingNow = waitingCount;
  const waitingWhenOpened = useRef(0);
  useEffect(() => { if (showCheckIn) waitingWhenOpened.current = waitingNow; }, [showCheckIn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (showCheckIn && waitingNow > waitingWhenOpened.current) { setShowCheckIn(false); say("Client checked in"); }
  }, [waitingNow, showCheckIn, say]);

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
    }
  };

  // ── submit routing ────────────────────────────────────────────────────────
  const busy = create.isPending || update.isPending;
  const canSubmit = !!client && !!service && missing.length === 0;
  const submit = () => {
    if (!canSubmit) return;
    if (editing) update.mutate();
    else { setAssignError(null); setAssigning({ mode: "create" }); }
  };
  const payNow = () => { if (!canSubmit || editing) return; payAfterCreate.current = true; setAssignError(null); setAssigning({ mode: "create" }); };
  const clearDraft = () => {
    if (editing) setTab("board");
    resetDraft();
  };

  const startWalkIn = () => { setFrontdeskPhone(""); setWalkInKnown(null); setEditing(null); setShowWalkIn(true); };

  // A kiosk check-in with no ticket yet → the walk-in process without asking for their phone again.
  const startFromMarker = (m: BoardMarker) => {
    setTab("pos");
    if (m.clientId) { void pickClient(m.clientId, m.id); return; }
    setCheckinId(m.id);
    setFrontdeskPhone("");
    setWalkInKnown({ phone: m.phone ?? "", name: m.clientName });
    setShowWalkIn(true);
  };
  useEffect(() => { if (tab === "board") setFocusTicket(null); }, [tab]);

  return (
    <div className="dark cx-cal nail-app h-app w-full" data-testid="nail-home">
      {notice && <div className="nail-notice" data-testid="nail-notice">{notice}</div>}

      <main className={`pos-shell ${tab === "board" ? "checkin-page" : ""} ${tab === "techs" ? "techs-page" : ""}`}>
        {/* Checkout happens IN the POS tab: the same checkout screen the calendar uses (keypad, function grid, tip, discount,
            group pay, loyalty, cash / card / M2 / Tap to Pay, receipts, customer screen). It stays mounted while staff peek at
            another tab, so a half-paid ticket isn't lost. */}
        {checkout && (
          <section className={`checkout-embed ${tab === "pos" ? "" : "checkout-embed-hidden"}`} data-testid="nail-checkout-embed">
            <CheckoutPOSPanel
              embedded
              appointment={checkout.appointment}
              timezone={timezone}
              siblingAppointments={siblings}
              isUpdating={finalize.isPending}
              onClose={() => { setCheckout(null); setTab("board"); }}
              onFinalize={(data) => finalize.mutate(data)}
              onThermalPrint={thermalPrinter.isConnected ? thermalPrinter.print : undefined}
              initialExtraItems={[...(checkout.ticket.nail?.lines ?? []), ...checkout.ticket.customLines].map((l) => ({ name: l.label, price: l.price }))}
            />
          </section>
        )}
        {checkout && tab === "pos" ? null : tab === "pos" ? (
          <>
            <TicketPanel
              client={client}
              badge={editing ? `#${editing.ticketNumber ?? editing.id}` : "NEW"}
              lines={totals.lines}
              duration={totals.duration}
              price={totals.price}
              submitLabel={editing ? "UPDATE TICKET" : !client ? "START A WALK-IN FIRST" : !service ? "ADD A SERVICE FIRST" : "CREATE TICKET"}
              canSubmit={canSubmit}
              busy={busy}
              missing={missing}
              editing={!!editing}
              onRemove={removeLine}
              onClear={clearDraft}
              onSubmit={submit}
              onPayNow={editing ? undefined : payNow}
            />
            <section className="work-area">
              <div className="sale-area">
                <Keypad locked={!client} onEnter={addCustom} />
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
                  nail={service ? nailCfg : null}
                  pick={pick}
                  onPick={(group, id) => setPick((p) => togglePick(p, group, id))}
                />
              </div>
            </section>
          </>
        ) : tab === "techs" ? (
          <>
            <CheckInPanel clockOffsetMs={clockOffsetMs} tickets={tickets} markers={markers} onMarker={startFromMarker} onMarkerRemove={(m) => act.mutate(() => removeMarker(m.id))} onTicket={(t) => { setFocusTicket({ id: t.id }); setTab("board"); }} />
            <TechCards techs={techList} tickets={tickets} markers={markers} stats={board?.techStats ?? EMPTY_ARRAY} glance={board?.glance} waiting={waitingCount} loading={techsLoading} clockOffsetMs={clockOffsetMs} assumedIn={assumedIn} onClockedOutTap={setClockInFor} />
          </>
        ) : (
          <CheckInBoard
            tickets={tickets}
            busy={act.isPending}
            onStart={(t) => act.mutate(() => startTicket(t.id))}
            onCheckout={requestCheckout}
            onReassign={(t) => { setAssignError(null); setAssigning({ mode: "reassign", ticket: t }); }}
            onEdit={startEdit}
            onCancel={(t) => { if (window.confirm(`Cancel ${t.client.name}'s ticket?`)) act.mutate(() => cancelTicket(t.id)); }}
            focus={focusTicket}
            clockOffsetMs={clockOffsetMs}
          />
        )}

      <BottomNav tab={tab} onTab={setTab} onWalkIn={startWalkIn} onCheckIn={() => setShowCheckIn(true)} onMore={() => setShowMore(true)} waiting={waitingCount} inService={inServiceCount} live={live} />
      </main>

      {showWalkIn && (
        <WalkInSheet
          storeId={storeId}
          frontdeskPhone={frontdeskPhone}
          known={walkInKnown}
          onClose={() => { setShowWalkIn(false); setFrontdeskPhone(""); setWalkInKnown(null); }}
          onClient={(id, staffId) => { setFrontdeskPhone(""); setWalkInKnown(null); void pickClient(id, checkinId, staffId); }}
        />
      )}

      {clockInFor && <TechClockInSheet tech={clockInFor} busy={false} onSetIn={() => void setTechIn(clockInFor)} onClose={() => setClockInFor(null)} />}

      {showMore && <MoreMenu tiles={moreTiles} onClose={() => setShowMore(false)} />}

      {showCheckIn && (
        <CheckInLookup
          storeId={storeId}
          frontdeskShowing={dualScreen}
          clientEnteringPhone={clientTyping}
          onClose={() => setShowCheckIn(false)}
          onDone={(line) => { setShowCheckIn(false); say(line); invalidateBoard(); }}
        />
      )}

      {showBook && (
        <ChooseClientPanel
          walkInsEnabled={false}
          phoneFromFrontdesk={frontdeskPhone}
          onClose={() => { setShowBook(false); setFrontdeskPhone(""); }}
          onSelectClient={(id) => { setShowBook(false); setFrontdeskPhone(""); navigate(`/booking/new?clientId=${id}`); }}
          onWalkIn={() => setShowBook(false)}
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

      {needsRegisterPicker && <RegisterPicker registers={registerOptions} taken={takenRegisters} onSelect={selectRegister} />}

      {assigning && (
        <AssignTechSheet
          storeId={storeId}
          serviceId={assigning.mode === "create" ? service?.id ?? null : assigning.ticket.service.id}
          clientName={assigning.mode === "create" ? client?.name ?? "" : assigning.ticket.client.name}
          mode={assigning.mode}
          excludeStaffId={assigning.mode === "reassign" ? assigning.ticket.staff?.id ?? null : null}
          initialStaffId={assigning.mode === "create" ? preferredStaff : null}
          busy={create.isPending || reassign.isPending}
          error={assignError}
          onClose={() => { setAssigning(null); setAssignError(null); payAfterCreate.current = false; }}
          onConfirm={(staffId) => {
            setAssignError(null);
            if (assigning.mode === "create") create.mutate(staffId);
            else if (staffId != null) reassign.mutate({ id: assigning.ticket.id, staffId });
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
