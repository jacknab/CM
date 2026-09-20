/**
 * NailHome — /nail, the simplified staff screen for nail-salon accounts.
 *
 * Sits on top of the normal Certxa engine: tickets are appointments, technician
 * choice is the TURN queue, checkout is the calendar's own checkout sheet. This
 * file only owns the screen state and wires the pieces together.
 */
import { EMPTY_ARRAY } from "@/lib/empty";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { ChooseClientPanel, CheckoutPOSPanel } from "@/pages/Calendar";
import type { AppointmentWithDetails } from "@shared/schema";
import {
  ApiError, BOARD_KEY, cancelTicket, completeTicket, createTicket, fetchAppointment, fetchBoard, fetchClient,
  fetchNailConfig, reassignTicket, removeMarker, startTicket, updateTicket,
  type BoardMarker, type BoardTicket, type ClientSummary, type FinalizeData,
} from "./nailApi";
import { defaultPick, draftTotals, EMPTY_PICK, missingRequired, togglePick, type NailPick, type TicketLine } from "./ticketDraft";
import { useNailRealtime } from "./useNailRealtime";
import { TicketPanel } from "./TicketPanel";
import { CatalogPanel, type CatalogGroup, type CatalogService } from "./CatalogPanel";
import { AssignTechSheet } from "./AssignTechSheet";
import { CheckInBoard } from "./CheckInBoard";
import { BottomNav, type NailTab } from "./BottomNav";

type Assigning = { mode: "create" } | { mode: "reassign"; ticket: BoardTicket } | null;

export default function NailHome() {
  const { selectedStore } = useSelectedStore();
  const { user } = useAuth();
  const nailSalon = isNailSalonBiz((selectedStore as any)?.category);
  // Technician (staff-portal) logins have no store of their own — this screen is for the front desk.
  if (!selectedStore && (user as any)?.staffId) return <Navigate to="/calendar" replace />;
  if (!selectedStore) {
    return <div className="dark cx-cal h-app w-full flex items-center justify-center bg-background"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
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
  const { registerId } = useActiveRegisterId(storeId);
  const { drawerId, needsPicker: needsDrawerPicker, drawers, selectDrawer } = useActiveDrawerId(storeId);

  // ── screen state ──────────────────────────────────────────────────────────
  const [tab, setTab] = useState<NailTab>("pos");
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [checkinId, setCheckinId] = useState<number | null>(null);
  const [service, setService] = useState<CatalogService | null>(null);
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [pick, setPick] = useState<NailPick>(EMPTY_PICK);
  const [activeGroup, setActiveGroup] = useState("");
  const [moreAddons, setMoreAddons] = useState(false);
  const [editing, setEditing] = useState<BoardTicket | null>(null);
  const [showChooseClient, setShowChooseClient] = useState(false);
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
  const live = useNailRealtime({ storeId, registerId, refreshAll, onFrontdeskPhone: setFrontdeskPhone });

  const { data: board } = useQuery({
    queryKey: BOARD_KEY,
    queryFn: fetchBoard,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const tickets = board?.tickets ?? [];
  const markers = board?.markers ?? [];
  const waitingCount = tickets.filter((t) => t.status === "confirmed").length + markers.length;
  const inServiceCount = tickets.filter((t) => t.status === "started").length;

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
    () => draftTotals(service, addonIds, activeAddons, nailCfg, pick),
    [service, addonIds, activeAddons, nailCfg, pick],
  );
  const missing = missingRequired(nailCfg, pick);

  // ── ticket building ───────────────────────────────────────────────────────
  const resetDraft = useCallback(() => {
    setClient(null); setCheckinId(null); setService(null); setAddonIds([]); setPick(EMPTY_PICK);
    setEditing(null); pickSeededFor.current = null; setMoreAddons(false);
  }, []);

  const chooseService = (svc: CatalogService) => {
    if (service?.id === svc.id) return;
    setService(svc);
    pickSeededFor.current = null;
    if (editing === null) setPick(EMPTY_PICK);
  };
  const toggleAddon = (id: number) => setAddonIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const removeLine = (line: TicketLine) => {
    if (line.addonId != null) toggleAddon(line.addonId);
    else if (line.group) setPick((p) => ({ ...p, [line.group!]: null }));
  };

  const pickClient = async (clientId: number, marker?: number | null) => {
    setShowChooseClient(false);
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
  const create = useMutation({
    mutationFn: (staffId: number | null) =>
      createTicket({ clientId: client!.id, serviceId: service!.id, addonIds, pick, staffId, checkinId }),
    onSuccess: (r) => {
      invalidateBoard();
      setAssigning(null);
      setAssignError(null);
      say(`Ticket #${r.ticketNumber} · ${r.staffName} · ${r.waiting ? `waiting, starts about ${new Date(r.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "in service"}`);
      resetDraft();
    },
    onError: (err: any) => setAssignError(err instanceof ApiError ? err.message : "Couldn't create the ticket. Try again."),
  });

  const update = useMutation({
    mutationFn: () => updateTicket(editing!.id, { serviceId: service!.id, addonIds, pick }),
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
    } catch (err: any) {
      toast({ title: "Couldn't open checkout", description: err?.message, variant: "destructive" });
    }
  }, [toast]);

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
    onSuccess: () => { invalidateBoard(); setCheckout(null); say("Checked out"); },
    onError: () => toast({ title: "Payment wasn't saved", description: "The sale didn't close. Check the ticket on the board.", variant: "destructive" }),
  });

  // ── mirror the walk-in phone prompt to the paired /frontdesk tablet ───────
  const [dualScreen, setDualScreen] = useState(false);
  useEffect(() => {
    fetch("/api/kiosk-settings", { credentials: "include" })
      .then((r) => r.json()).then((d) => setDualScreen(d?.dualScreenMode === true)).catch(() => {});
  }, [storeId]);
  useEffect(() => {
    if (!showChooseClient || !dualScreen) return;
    const send = (type: string) => fetch("/api/kiosk/checkout-event", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, registerId }),
    }).catch(() => {});
    void send("kiosk_checkout_phone_prompt");
    return () => { void send("kiosk_checkout_phone_cancel"); };
  }, [showChooseClient, dualScreen, registerId]);

  // ── submit routing ────────────────────────────────────────────────────────
  const busy = create.isPending || update.isPending;
  const canSubmit = !!client && !!service && missing.length === 0;
  const submit = () => {
    if (!canSubmit) return;
    if (editing) update.mutate();
    else { setAssignError(null); setAssigning({ mode: "create" }); }
  };
  const clearDraft = () => {
    if (editing) setTab("board");
    resetDraft();
  };

  const startWalkIn = () => { setFrontdeskPhone(""); setEditing(null); setShowChooseClient(true); };

  return (
    <div className="dark cx-cal h-app w-full flex flex-col bg-background text-foreground overflow-hidden" data-testid="nail-home">
      {notice && (
        <div className="absolute z-[130] left-1/2 -translate-x-1/2 top-4 rounded-full border border-border bg-card px-5 py-2 text-[13px] font-semibold shadow-lg" data-testid="nail-notice">
          {notice}
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {tab === "pos" ? (
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
            />
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
          </>
        ) : (
          <CheckInBoard
            tickets={tickets}
            markers={markers}
            busy={act.isPending}
            onStart={(t) => act.mutate(() => startTicket(t.id))}
            onCheckout={requestCheckout}
            onReassign={(t) => { setAssignError(null); setAssigning({ mode: "reassign", ticket: t }); }}
            onEdit={startEdit}
            onCancel={(t) => { if (window.confirm(`Cancel ${t.client.name}'s ticket?`)) act.mutate(() => cancelTicket(t.id)); }}
            onMarkerTicket={(m: BoardMarker) => {
              if (m.clientId) void pickClient(m.clientId, m.id);
              else {
                setCheckinId(m.id);
                setFrontdeskPhone((m.phone ?? "").replace(/\D/g, "").slice(-10));
                setShowChooseClient(true);
              }
            }}
            onMarkerRemove={(m) => act.mutate(() => removeMarker(m.id))}
          />
        )}
      </div>

      <BottomNav tab={tab} onTab={setTab} onWalkIn={startWalkIn} waiting={waitingCount} inService={inServiceCount} live={live} />

      {showChooseClient && (
        <ChooseClientPanel
          walkInsEnabled={false}
          phoneFromFrontdesk={frontdeskPhone}
          onClose={() => { setShowChooseClient(false); setFrontdeskPhone(""); }}
          onSelectClient={(id) => { setFrontdeskPhone(""); void pickClient(id, checkinId); }}
          onWalkIn={() => setShowChooseClient(false)}
        />
      )}

      {assigning && (
        <AssignTechSheet
          storeId={storeId}
          serviceId={assigning.mode === "create" ? service?.id ?? null : assigning.ticket.service.id}
          clientName={assigning.mode === "create" ? client?.name ?? "" : assigning.ticket.client.name}
          mode={assigning.mode}
          excludeStaffId={assigning.mode === "reassign" ? assigning.ticket.staff?.id ?? null : null}
          busy={create.isPending || reassign.isPending}
          error={assignError}
          onClose={() => { setAssigning(null); setAssignError(null); }}
          onConfirm={(staffId) => {
            setAssignError(null);
            if (assigning.mode === "create") create.mutate(staffId);
            else if (staffId != null) reassign.mutate({ id: assigning.ticket.id, staffId });
          }}
        />
      )}

      {checkout && (
        <CheckoutPOSPanel
          appointment={checkout.appointment}
          timezone={timezone}
          siblingAppointments={siblings}
          isUpdating={finalize.isPending}
          onClose={() => setCheckout(null)}
          onFinalize={(data) => finalize.mutate(data)}
          onThermalPrint={thermalPrinter.isConnected ? thermalPrinter.print : undefined}
          initialExtraItems={checkout.ticket.nail?.lines.map((l) => ({ name: l.label, price: l.price }))}
        />
      )}

      {posEnabled && (
        <OpenRegisterModal
          open={showOpenRegister}
          onClose={() => { setShowOpenRegister(false); setPendingCheckout(null); }}
          storeId={storeId}
          userName={(user as any)?.firstName || (user as any)?.email || "Staff"}
          drawerId={drawerId}
        />
      )}

      {needsDrawerPicker && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-3">
            <h2 className="text-[17px] font-semibold">Which cash drawer is this?</h2>
            {drawers.map((d) => (
              <button key={d.id} type="button" onClick={() => selectDrawer(d.id)}
                className="w-full text-left rounded-xl border border-border px-4 py-3 font-medium hover:bg-secondary">{d.name}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
