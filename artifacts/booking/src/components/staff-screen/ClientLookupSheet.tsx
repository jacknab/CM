// Moved out of pages/Calendar.tsx so the /nail and /barber staff screens don't load the whole calendar.
import { EMPTY_ARRAY } from "@/lib/empty";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSelectedStore } from "@/hooks/use-store";
import { format } from "date-fns";
import { ChevronRight, ArrowLeft, X, CreditCard, Delete, MoreVertical, Calendar as CalendarIcon, Phone, AlertTriangle, Sparkles, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { isValidNanpPrefix } from "@/lib/phone-validation";
import { useShake } from "@/hooks/use-shake";
import { useFeatureFlags } from "@/hooks/use-features";
import { syncEngine } from "@/lib/sync-engine";
import { findClientId } from "@/pages/nail/clientLookup";
import { clientOnDevice } from "@/pages/nail/nailApi";
import { snapshotDB } from "@/lib/snapshot-db";
import { archivedVisitsOfClient } from "@/pages/nail/ticketArchive";

/** A client as the tablet holds them (the salon's copy in its database), shaped like the online lookup. */
async function clientProfileOnDevice(storeId: number, id: number): Promise<any | null> {
  const snap = await snapshotDB.load(storeId).catch(() => null);
  const c = snap?.customers?.find((x) => Number(x.id) === id);
  if (c) return { id, name: c.name, phone: c.phone ?? null, email: c.email ?? null, loyaltyPoints: c.loyaltyPoints ?? null,
    allergies: c.allergies ?? null, birthday: c.birthday ?? null, offline: true };
  const kept = await clientOnDevice(id).catch(() => null);
  return kept ? { ...kept, loyaltyPoints: null, offline: true } : null;
}

/** A client's visits from the tablet's ticket archive, shaped like /api/appointments rows. */
async function visitsOnDevice(storeId: number, clientId: number): Promise<any[]> {
  const visits = await archivedVisitsOfClient(storeId, clientId).catch(() => []);
  return visits.map((t) => ({ id: t.id, date: t.date, status: t.status, ticketNumber: t.ticketNumber,
    service: { name: t.service, price: t.price ?? 0 }, staff: t.staffName ? { name: t.staffName } : null }));
}

// ── Deposits tab rendered inside the client lookup sheet ────────────────────
export function ClientDepositsTab({ clientId, appointments }: { clientId: number; appointments: any[] }) {
  const { data, isLoading } = useQuery<{ paymentMethods: any[] }>({
    queryKey: [`/api/payments/clients/${clientId}/payment-methods`],
    queryFn: async () => {
      const res = await fetch(`/api/payments/clients/${clientId}/payment-methods`, { credentials: "include" });
      if (!res.ok) return { paymentMethods: [] };
      return res.json();
    },
    enabled: !!clientId,
  });

  const savedCards = data?.paymentMethods ?? [];

  // Appointments that have a deposit collected (new columns) or old depositPaid flag
  const depositAppts = appointments.filter(
    (a: any) => a.depositPaid || Number(a.depositCollected ?? 0) > 0
  ).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const CARD_BRAND_ICONS: Record<string, string> = {
    visa: "💳",
    mastercard: "💳",
    amex: "💳",
    discover: "💳",
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Deposits & Payment</h2>

      {/* Saved card section */}
      <div>
        <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide mb-3">Saved Card</h3>
        {isLoading ? (
          <p className="text-base text-muted-foreground">Loading…</p>
        ) : savedCards.length === 0 ? (
          <Card className="p-4 flex items-center gap-3 text-base text-muted-foreground border-dashed">
            <CreditCard className="w-5 h-5 shrink-0" />
            No card on file
          </Card>
        ) : (
          <div className="space-y-2">
            {savedCards.map((pm: any) => (
              <Card key={pm.id} className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-6 bg-gray-100 rounded flex items-center justify-center text-lg">
                    {CARD_BRAND_ICONS[pm.brand?.toLowerCase()] ?? "💳"}
                  </div>
                  <div>
                    <p className="text-base font-medium capitalize">
                      {pm.brand} •••• {pm.last4}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Expires {pm.expMonth}/{pm.expYear}
                    </p>
                  </div>
                </div>
                {pm.isDefault && (
                  <span className="text-sm bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">
                    Default
                  </span>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Deposit history */}
      <div>
        <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide mb-3">Deposit History</h3>
        {depositAppts.length === 0 ? (
          <p className="text-base text-muted-foreground">No deposits on record.</p>
        ) : (
          <div className="space-y-2">
            {depositAppts.map((apt: any) => {
              const amount = Number(apt.depositCollected ?? apt.depositAmount ?? 0);
              const status = apt.paymentStatus ?? (apt.depositPaid ? "deposit_paid" : "none");
              const statusLabel: Record<string, { label: string; cls: string }> = {
                deposit_paid:  { label: "Deposit Paid",  cls: "bg-green-100 text-green-700" },
                card_saved:    { label: "Card Saved",    cls: "bg-blue-100 text-blue-700" },
                fully_paid:    { label: "Fully Paid",    cls: "bg-emerald-100 text-emerald-700" },
                failed:        { label: "Failed",        cls: "bg-red-100 text-red-700" },
                none:          { label: "No Payment",    cls: "bg-gray-100 text-gray-600" },
              };
              const badge = statusLabel[status] ?? statusLabel.none;
              return (
                <Card key={apt.id} className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-medium">{apt.service?.name ?? "Service"}</span>
                    <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span>{format(new Date(apt.date), "MMM d, yyyy")}</span>
                    {amount > 0 && (
                      <span className="font-semibold text-foreground">${amount.toFixed(2)}</span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ClientLookupSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  const featureFlags = useFeatureFlags();
  const [phoneDigits, setPhoneDigits] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // `invalidNumber` is only for a complete number pushed from the /frontdesk tablet that isn't a real US number; a digit typed on this
  // keypad that can't be part of one is refused with a shake instead, and what's already typed stays.
  const [invalidNumber, setInvalidNumber] = useState(false);
  const { shakeClass, shake, onShakeEnd } = useShake();
  const [foundClient, setFoundClient] = useState<any>(null);
  const [activeSection, setActiveSection] = useState("overview");
  const [viewAppointment, setViewAppointment] = useState<any>(null);

  const clientId = foundClient?.id;
  const storeId = selectedStore?.id;

  const foundOffline = !!foundClient?.offline;
  const { data: allAppointments = EMPTY_ARRAY } = useQuery<any[]>({
    queryKey: [`/api/appointments`, clientId, storeId, "client-profile-sheet", foundOffline],
    queryFn: async () => {
      // No internet: the visits kept on this tablet (its ticket archive).
      if (foundOffline || syncEngine.isOffline()) return visitsOnDevice(storeId!, clientId);
      try {
        const res = await fetch(`/api/appointments?customerId=${clientId}&storeId=${storeId}`, { credentials: "include" });
        if (!res.ok) return [];
        return res.json();
      } catch {
        return visitsOnDevice(storeId!, clientId);
      }
    },
    enabled: !!clientId && !!storeId,
  });

  const { data: profileNoteData } = useQuery<{ note: { noteContent: string } | null }>({
    queryKey: [`/api/clients`, clientId, "profile-note"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/profile-note`, { credentials: "include" });
      if (!res.ok) return { note: null };
      return res.json();
    },
    enabled: !!clientId,
  });

  const [isRegeneratingProfileNote, setIsRegeneratingProfileNote] = useState(false);
  const regenerateProfileNote = useCallback(async () => {
    if (!clientId) return;
    setIsRegeneratingProfileNote(true);
    try {
      await fetch(`/api/clients/${clientId}/profile-note/regenerate`, { method: "POST", credentials: "include" });
      await queryClient.invalidateQueries({ queryKey: [`/api/clients`, clientId, "profile-note"] });
    } finally {
      setIsRegeneratingProfileNote(false);
    }
  }, [clientId, queryClient]);

  const now = new Date();
  const nextAppointments = useMemo(() =>
    allAppointments
      .filter((a: any) => new Date(a.date) >= now && a.status !== "cancelled")
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [allAppointments]
  );
  const pastAppointments = useMemo(() =>
    allAppointments
      .filter((a: any) => new Date(a.date) < now)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [allAppointments]
  );
  const totalSpend = useMemo(() =>
    allAppointments
      .filter((a: any) => ["completed", "pending", "confirmed"].includes(a.status))
      .reduce((sum: number, a: any) => sum + (a.service ? Number(a.service.price) : 0), 0),
    [allAppointments]
  );
  const noShows = useMemo(() => allAppointments.filter((a: any) => a.status === "no_show" || a.status === "no-show").length, [allAppointments]);
  const cancellations = useMemo(() => allAppointments.filter((a: any) => a.status === "cancelled").length, [allAppointments]);

  const formatPhone = (digits: string): string => {
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleDigit = useCallback((digit: string) => {
    if (phoneDigits.length < 10) {
      const next = phoneDigits + digit;
      if (!isValidNanpPrefix(next)) {
        // The number would become structurally impossible (an area or exchange code starting with 0/1, or a reserved
        // N11 pattern): shake and refuse just this digit — what's already typed stays.
        shake();
        return;
      }
      setSearchDone(false);
      setNotFound(false);
      setInvalidNumber(false);
      setPhoneDigits(next);
    }
  }, [phoneDigits, shake]);

  const handleBackspace = useCallback(() => {
    setPhoneDigits(prev => prev.slice(0, -1));
    setSearchDone(false);
    setNotFound(false);
    setInvalidNumber(false);
  }, []);

  useEffect(() => {
    if (phoneDigits.length === 10 && !searchDone && selectedStore) {
      setIsSearching(true);
      setNotFound(false);
      const storeId = selectedStore.id;
      const show = (customer: any) => {
        setIsSearching(false);
        setSearchDone(true);
        if (customer && customer.id) {
          setFoundClient(customer);
          setActiveSection("overview");
        } else {
          setNotFound(true);
        }
      };
      // No internet: the client from the salon's copy on this tablet (the same search the rest of the POS uses
      // offline), with their points and allergies as of the last copy, and their visits from the ticket archive.
      const onDevice = async () => {
        const id = await findClientId(storeId, phoneDigits).catch(() => null);
        show(id != null ? await clientProfileOnDevice(storeId, id).catch(() => null) : null);
      };
      if (syncEngine.isOffline()) { void onDevice(); return; }
      fetch(`/api/customers/search?phone=${encodeURIComponent(phoneDigits)}&storeId=${storeId}`, {
        credentials: "include",
      })
        .then(res => res.json())
        .then(show)
        .catch(() => {
          syncEngine.noteUnreachable();
          void onDevice();
        });
    }
  }, [phoneDigits, searchDone, selectedStore]);

  const numKeys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["blank", "0", "backspace"],
  ];

  const profileSections = [
    { id: "overview",  label: "Overview" },
    { id: "next",      label: "Next Appointments",  count: nextAppointments.length },
    { id: "past",      label: "Past Appointments",  count: pastAppointments.length },
    { id: "deposits",  label: "Deposits" },
    { id: "memberships", label: "Memberships",      count: 0 },
    { id: "notes",     label: "Notes",              count: foundClient?.notes ? 1 : 0 },
  ];

  const renderProfileContent = () => {
    switch (activeSection) {
      case "overview":
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Overview</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-base text-muted-foreground">Total Spend:</span>
                <span className="text-lg font-semibold">$ {totalSpend.toFixed(2)}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-base text-muted-foreground">Deposit:</span>
                <span className="text-lg font-semibold">$ 0.00</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-base text-muted-foreground">No-Shows:</span>
                <span className="text-lg font-semibold">{noShows}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-base text-muted-foreground">Cancellations:</span>
                <span className="text-lg font-semibold">{cancellations}</span>
              </div>
            </div>
            {allAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CalendarIcon className="w-14 h-14 text-gray-300 mb-4" />
                <p className="font-semibold text-lg text-gray-700">No Appointments</p>
                <p className="text-base text-gray-400 mt-1">The client has no appointments</p>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Recent Appointments</h3>
                {allAppointments
                  .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 5)
                  .map((apt: any) => (
                    <Card
                      key={apt.id}
                      className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setViewAppointment(apt)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-medium">{apt.service?.name || "Service"}</span>
                        <span className="text-sm text-muted-foreground capitalize">{apt.status}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {apt.staff?.name} · {format(new Date(apt.date), "MMM d, yyyy")}
                      </p>
                    </Card>
                  ))}
              </div>
            )}
          </div>
        );
      case "next":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Next Appointments</h2>
            {nextAppointments.length === 0 ? (
              <p className="text-base text-muted-foreground">No upcoming appointments</p>
            ) : (
              <div className="space-y-3">
                {nextAppointments.map((apt: any) => (
                  <Card
                    key={apt.id}
                    className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setViewAppointment(apt)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-medium">{apt.service?.name || "Service"}</span>
                      <span className="text-sm text-muted-foreground capitalize">{apt.status}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {apt.staff?.name} · {format(new Date(apt.date), "MMM d, yyyy h:mm a")}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      case "past":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Past Appointments</h2>
            {pastAppointments.length === 0 ? (
              <p className="text-base text-muted-foreground">No past appointments</p>
            ) : (
              <div className="space-y-3">
                {pastAppointments.map((apt: any) => (
                  <Card
                    key={apt.id}
                    className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setViewAppointment(apt)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-medium">{apt.service?.name || "Service"}</span>
                      <span className="text-sm text-muted-foreground capitalize">{apt.status}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {apt.staff?.name} · {format(new Date(apt.date), "MMM d, yyyy h:mm a")}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      case "deposits":
        return <ClientDepositsTab clientId={foundClient.id} appointments={allAppointments} />;
      case "notes":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Notes</h2>
            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-1.5 text-base font-semibold text-primary">
                  <Sparkles className="w-4 h-4" />
                  Client Insights
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground -mt-1 -mr-1"
                  disabled={isRegeneratingProfileNote}
                  onClick={regenerateProfileNote}
                  data-testid="button-regenerate-client-insights"
                >
                  <RefreshCw className={cn("w-4 h-4", isRegeneratingProfileNote && "animate-spin")} />
                </Button>
              </div>
              <p className="text-base text-gray-700 mt-2 leading-relaxed">
                {profileNoteData?.note?.noteContent || "Insights appear after the client's first completed visit."}
              </p>
            </Card>
            {foundClient?.notes ? (
              <Card className="p-4 text-base">{foundClient.notes}</Card>
            ) : (
              <p className="text-base text-muted-foreground">No notes</p>
            )}
          </div>
        );
      default:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold capitalize">{activeSection.replace("-", " ")}</h2>
            <p className="text-base text-muted-foreground">No records found</p>
          </div>
        );
    }
  };

  if (foundClient) {
    const initials = foundClient.name
      ? foundClient.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
      : "?";

    return (
      <div className="dark cx-cal fixed inset-0 z-50 text-foreground" data-testid="client-lookup-sheet">
        <button
          type="button"
          aria-label="Close"
          className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
          onClick={onClose}
        />
        <div className="absolute right-0 top-0 h-full w-full sm:w-[680px] bg-white flex flex-col shadow-[-8px_0_24px_rgba(0,0,0,0.12)] border-l">
          {/* Header */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-2 bg-white border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost" size="icon"
                className="text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                onClick={() => { setFoundClient(null); setPhoneDigits(""); setSearchDone(false); setNotFound(false); }}
                data-testid="button-back-client-lookup"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <span className="font-semibold text-lg text-gray-900">Clients</span>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100" data-testid="button-close-client-lookup">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Split body */}
          <div className="flex flex-1 min-h-0">
            {/* Left sidebar */}
            <div className="w-[220px] flex-shrink-0 border-r bg-white flex flex-col">
              {/* Client info */}
              <div className="px-5 py-5 flex flex-col items-center text-center border-b border-gray-100">
                <h3 className="font-bold text-xl text-gray-900 leading-tight">{foundClient.name}</h3>
                {foundClient.phone && (
                  <p className="text-sm text-muted-foreground mt-1.5 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />{foundClient.phone}
                  </p>
                )}
                {featureFlags.rewardPoints && foundClient.loyaltyPoints != null && (
                  <p className="text-sm font-medium text-amber-600 mt-1.5">
                    ⭐ {foundClient.loyaltyPoints ?? 0} pts
                  </p>
                )}
                {foundClient.allergies && (
                  <div className="mt-2 w-full flex items-start gap-1.5 rounded-md border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-sm font-medium text-orange-700 text-left">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span className="leading-tight">{foundClient.allergies}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <Button variant="outline" size="icon" className="h-10 w-10">
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                  <Button
                    className="h-10 px-5 text-base"
                    onClick={() => { onClose(); navigate(`/booking/new?clientId=${foundClient.id}`); }}
                  >
                    Book Now
                  </Button>
                </div>
              </div>

              {/* Nav */}
              <nav className="flex-1 overflow-y-auto py-1">
                {profileSections.map(sec => (
                  <button
                    key={sec.id}
                    onClick={() => setActiveSection(sec.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3.5 text-base font-medium transition-colors text-left",
                      activeSection === sec.id
                        ? "text-primary bg-primary/5"
                        : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <span>{sec.label}</span>
                    <div className="flex items-center gap-1.5">
                      {sec.count !== undefined && (
                        <span className="text-sm bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 min-w-[22px] text-center leading-tight">
                          {sec.count}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </nav>
            </div>

            {/* Right content */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
              {renderProfileContent()}
            </div>
          </div>
        </div>

        <Dialog open={!!viewAppointment} onOpenChange={(open) => { if (!open) setViewAppointment(null); }}>
          <DialogContent className="sm:max-w-lg">
            {viewAppointment && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between gap-2 pr-6 text-xl">
                    <span>{viewAppointment.service?.name || "Appointment"}</span>
                    <Badge variant="secondary" className="capitalize text-sm">{viewAppointment.status?.replace("_", " ")}</Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-base">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Date &amp; Time</span>
                    <span className="font-medium">{format(new Date(viewAppointment.date), "EEE, MMM d, yyyy · h:mm a")}</span>
                  </div>
                  {!!viewAppointment.duration && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-medium">{viewAppointment.duration} min</span>
                    </div>
                  )}
                  {viewAppointment.staff?.name && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Staff</span>
                      <span className="font-medium">{viewAppointment.staff.name}</span>
                    </div>
                  )}
                  {viewAppointment.service?.price != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Price</span>
                      <span className="font-medium">${Number(viewAppointment.service.price).toFixed(2)}</span>
                    </div>
                  )}
                  {Array.isArray(viewAppointment.appointmentAddons) && viewAppointment.appointmentAddons.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Add-ons</span>
                      <ul className="mt-1 space-y-1">
                        {viewAppointment.appointmentAddons.map((a: any) => (
                          <li key={a.id} className="flex items-center justify-between">
                            <span>{a.addon?.name || "Add-on"}</span>
                            {a.addon?.price != null && <span className="font-medium">${Number(a.addon.price).toFixed(2)}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {viewAppointment.paymentMethod && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Payment Method</span>
                      <span className="font-medium capitalize">{viewAppointment.paymentMethod}</span>
                    </div>
                  )}
                  {viewAppointment.totalPaid != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total Paid</span>
                      <span className="font-medium">${Number(viewAppointment.totalPaid).toFixed(2)}</span>
                    </div>
                  )}
                  {viewAppointment.status === "cancelled" && viewAppointment.cancellationReason && (
                    <div>
                      <span className="text-muted-foreground">Cancellation Reason</span>
                      <p className="mt-1">{viewAppointment.cancellationReason}</p>
                    </div>
                  )}
                  {viewAppointment.notes && (
                    <div>
                      <span className="text-muted-foreground">Notes</span>
                      <p className="mt-1">{viewAppointment.notes}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="dark cx-cal fixed inset-0 z-50 text-foreground" data-testid="client-lookup-sheet">
      <button
        type="button"
        aria-label="Close client lookup"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[380px] bg-[#161618] flex flex-col shadow-[-8px_0_24px_rgba(0,0,0,0.12)] border-l">
        {/* Header */}
        <div className="px-4 py-4 flex items-center justify-between gap-2 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-base text-gray-900">Client Lookup</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div
          className="flex-1 flex flex-col px-4 pt-5 min-h-0 bg-[#161618] md:pb-4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
        >
          {/* Phone number display */}
          <div className={`w-full rounded-2xl bg-white border border-gray-200 shadow-sm py-6 px-4 mb-5 text-center ${shakeClass}`} onAnimationEnd={onShakeEnd}>
            {phoneDigits.length > 0 ? (
              <p className="text-4xl font-bold tracking-widest text-primary">
                {formatPhone(phoneDigits)}
              </p>
            ) : (
              <p className="text-2xl font-medium text-muted-foreground/40">Enter Phone Number</p>
            )}
            {isSearching && (
              <p className="text-sm text-muted-foreground mt-2 animate-pulse">Searching...</p>
            )}
            {notFound && !isSearching && (
              <p className="text-sm text-red-500 mt-2 font-medium">No client found with this number</p>
            )}
            {invalidNumber && (
              <p className="text-sm text-red-500 mt-2 font-medium">Not a valid North America phone number</p>
            )}
          </div>

          {/* Numpad */}
          <div className={`flex-1 flex flex-col gap-2 justify-end ${shakeClass}`} onAnimationEnd={onShakeEnd}>
            {numKeys.map((row, ri) => (
              <div key={ri} className="grid grid-cols-3 gap-2">
                {row.map((key) => {
                  if (key === "blank") {
                    return <div key="blank" />;
                  }
                  if (key === "backspace") {
                    return (
                      <button
                        key="backspace"
                        type="button"
                        onPointerDown={e => e.preventDefault()}
                        onClick={handleBackspace}
                        className="h-[68px] rounded-2xl bg-white border border-gray-200 shadow-sm text-muted-foreground flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform"
                      >
                        <Delete className="w-5 h-5" />
                      </button>
                    );
                  }
                  return (
                    <button
                      key={key}
                      type="button"
                      onPointerDown={e => e.preventDefault()}
                      onClick={() => handleDigit(key)}
                      className="h-[68px] rounded-2xl bg-white border border-gray-200 shadow-sm text-2xl font-semibold text-foreground flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform"
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
