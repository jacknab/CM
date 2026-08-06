import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore } from "@/hooks/use-store";
import { useOfflineQueue } from "@/hooks/use-offline-queue";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useSnapshot } from "@/hooks/use-snapshot";
import { syncEngine } from "@/lib/sync-engine";
import { actionQueueDB } from "@/lib/action-queue-db";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import type { QueueRecord } from "@/lib/offline-db";
import type { SnapshotCustomer, SnapshotService, SnapshotStaff } from "@/lib/snapshot-db";
import {
  Users, Clock, CheckCircle, Plus, Trash2,
  Settings, RefreshCw, ExternalLink, Loader2, Phone,
  ChevronRight, UserCheck, Wifi, WifiOff, RefreshCcw,
  CalendarPlus, Search, X, User, ChevronLeft,
} from "lucide-react";
import { format } from "date-fns";
import { safeDistanceToNow, formatPhoneInput } from "@/lib/utils";

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

function phonesMatch(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  return normalizePhone(a) === normalizePhone(b) && normalizePhone(b).length >= 7;
}

function formatPrice(price: string | number | null | undefined): string {
  if (price == null || price === "") return "";
  const n = typeof price === "string" ? parseFloat(price) : price;
  if (isNaN(n)) return "";
  return `$${n.toFixed(2)}`;
}

function generateTimes(): string[] {
  const times: string[] = [];
  for (let h = 8; h <= 20; h++) {
    times.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 20) times.push(`${String(h).padStart(2, "0")}:30`);
  }
  return times;
}

const TIME_SLOTS = generateTimes();

// ─── Offline Booking Modal ───────────────────────────────────────────────────

type BookStep = "phone" | "details" | "confirm";

type BookingForm = {
  phone: string;
  customerId: number | null;
  customerName: string;
  isNewClient: boolean;
  serviceId: number | null;
  serviceName: string;
  serviceDuration: number;
  staffId: number | null;
  staffName: string;
  date: string;
  time: string;
};

function OfflineBookingModal({
  storeId,
  onClose,
  onBooked,
}: {
  storeId: number;
  onClose: () => void;
  onBooked: () => void;
}) {
  const { snapshot } = useSnapshot();
  const [step, setStep] = useState<BookStep>("phone");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const [form, setForm] = useState<BookingForm>({
    phone: "",
    customerId: null,
    customerName: "",
    isNewClient: false,
    serviceId: null,
    serviceName: "",
    serviceDuration: 30,
    staffId: null,
    staffName: "",
    date: todayStr,
    time: "09:00",
  });

  const [matchedClient, setMatchedClient] = useState<SnapshotCustomer | null>(null);
  const [phoneSearched, setPhoneSearched] = useState(false);

  const services: SnapshotService[] = snapshot?.services ?? [];
  const staffList: SnapshotStaff[] = snapshot?.staff ?? [];

  const handlePhoneLookup = useCallback(() => {
    const normalized = normalizePhone(form.phone);
    if (normalized.length < 7) return;
    const customers = snapshot?.customers ?? [];
    const found = customers.find((c) => phonesMatch(c.phone, normalized)) ?? null;
    setMatchedClient(found);
    setPhoneSearched(true);
    if (found) {
      setForm((f) => ({ ...f, customerId: found.id, customerName: found.name, isNewClient: false }));
    } else {
      setForm((f) => ({ ...f, customerId: null, customerName: "", isNewClient: true }));
    }
  }, [form.phone, snapshot]);

  const handleConfirmBook = async () => {
    if (!form.serviceId || !form.customerName.trim() || !form.date || !form.time) return;
    setIsSubmitting(true);
    try {
      const [hours, minutes] = form.time.split(":").map(Number);
      const dateObj = new Date(form.date + "T00:00:00");
      dateObj.setHours(hours, minutes, 0, 0);

      const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const fingerprint = `${storeId}:${form.customerId ?? form.customerName}:${form.serviceId}:${dateObj.toISOString()}`;

      await actionQueueDB.add({
        type: "CREATE_BOOKING",
        entity_temp_id: tempId,
        payload: {
          date: dateObj.toISOString(),
          duration: form.serviceDuration,
          serviceId: form.serviceId,
          staffId: form.staffId ?? null,
          customerId: form.customerId ?? null,
          customerName: form.customerName.trim(),
          customerPhone: normalizePhone(form.phone) || null,
          storeId,
          status: "pending",
          notes: form.isNewClient ? `New client — booked offline` : `Booked offline`,
        },
        timestamp: Date.now(),
        idempotency_key: `book_${tempId}`,
        entity_fingerprint: fingerprint,
      });

      onBooked();
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedService = services.find((s) => s.id === form.serviceId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            {step !== "phone" && (
              <button
                onClick={() => setStep(step === "confirm" ? "details" : "phone")}
                className="p-1 rounded hover:bg-muted transition-colors mr-1"
              >
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <CalendarPlus className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">
              {step === "phone" && "Look Up Client"}
              {step === "details" && "Booking Details"}
              {step === "confirm" && "Confirm Booking"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Step 1: Phone lookup */}
          {step === "phone" && (
            <>
              <p className="text-sm text-muted-foreground">
                Enter the client's phone number to look them up in the local database.
              </p>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Phone Number
                </label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, phone: formatPhoneInput(e.target.value) }));
                      setPhoneSearched(false);
                      setMatchedClient(null);
                    }}
                    placeholder="(555) 123-4567"
                    className="flex-1 px-3 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    onKeyDown={(e) => e.key === "Enter" && handlePhoneLookup()}
                    autoFocus
                  />
                  <button
                    onClick={handlePhoneLookup}
                    disabled={normalizePhone(form.phone).length < 7}
                    className="px-3 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Search
                  </button>
                </div>
              </div>

              {/* Lookup result */}
              {phoneSearched && (
                <div className={`rounded-xl border p-3.5 flex items-start gap-3 ${
                  matchedClient
                    ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800/40"
                    : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/40"
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    matchedClient ? "bg-green-100 dark:bg-green-900/40" : "bg-amber-100 dark:bg-amber-900/40"
                  }`}>
                    <User className={`w-4 h-4 ${matchedClient ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {matchedClient ? (
                      <>
                        <p className="text-sm font-semibold text-green-800 dark:text-green-200">{matchedClient.name}</p>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                          Existing client{matchedClient.loyaltyPoints ? ` · ${matchedClient.loyaltyPoints} loyalty pts` : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">New client</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                          No match found — enter name below
                        </p>
                        <input
                          type="text"
                          value={form.customerName}
                          onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                          placeholder="Client name *"
                          className="mt-2 w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          autoFocus
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={() => setStep("details")}
                disabled={!phoneSearched || !form.customerName.trim()}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                Continue
              </button>
            </>
          )}

          {/* Step 2: Booking details */}
          {step === "details" && (
            <>
              {/* Client summary */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-muted/50 border">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{form.customerName}</p>
                  <p className="text-xs text-muted-foreground">{form.phone}</p>
                </div>
              </div>

              {/* Service */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Service *
                </label>
                {services.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic px-1">No services in offline snapshot</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                    {services.map((svc) => (
                      <button
                        key={svc.id}
                        onClick={() => setForm((f) => ({
                          ...f,
                          serviceId: svc.id,
                          serviceName: svc.name,
                          serviceDuration: svc.duration,
                        }))}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                          form.serviceId === svc.id
                            ? "border-primary bg-primary/5 font-semibold"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{svc.name}</span>
                          <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                            {svc.duration}m{svc.price ? ` · ${formatPrice(svc.price)}` : ""}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Staff */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Staff (optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setForm((f) => ({ ...f, staffId: null, staffName: "" }))}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                      form.staffId === null ? "border-primary bg-primary/5 font-semibold" : "hover:bg-muted/50"
                    }`}
                  >
                    Any
                  </button>
                  {staffList.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setForm((f) => ({ ...f, staffId: s.id, staffName: s.name }))}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                        form.staffId === s.id ? "border-primary bg-primary/5 font-semibold" : "hover:bg-muted/50"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    min={todayStr}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    Time *
                  </label>
                  <select
                    value={form.time}
                    onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={() => setStep("confirm")}
                disabled={!form.serviceId || !form.date || !form.time}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                Review Booking
              </button>
            </>
          )}

          {/* Step 3: Confirm */}
          {step === "confirm" && (
            <>
              <p className="text-sm text-muted-foreground">
                This booking will be saved locally and synced to the server when you're back online.
              </p>

              <div className="rounded-xl border bg-muted/30 divide-y">
                <ConfirmRow label="Client" value={form.customerName} />
                <ConfirmRow label="Phone" value={form.phone || "—"} />
                <ConfirmRow label="Service" value={`${form.serviceName} (${form.serviceDuration}min)`} />
                <ConfirmRow label="Staff" value={form.staffName || "Any available"} />
                <ConfirmRow
                  label="Date & Time"
                  value={`${format(new Date(form.date + "T00:00:00"), "EEEE, MMM d")} at ${form.time}`}
                />
                {form.isNewClient && (
                  <div className="px-4 py-2.5 flex items-center gap-2">
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full">
                      New client — will be created on sync
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={handleConfirmBook}
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CalendarPlus className="w-4 h-4" />
                    Confirm Booking
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function QueueDashboard() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const storeId = selectedStore?.id;
  const slug = (selectedStore as any)?.bookingSlug;

  const {
    serving, waiting, served,
    isLoading, reload, addWalkIn, removeEntry, advanceQueue,
  } = useOfflineQueue(storeId);

  const networkStatus = useNetworkStatus();

  const [showAddForm, setShowAddForm] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [newEntry, setNewEntry] = useState({ customerName: "", customerPhone: "" });
  const [isAdding, setIsAdding] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const hasNext = waiting.length > 0 || serving.length > 0;

  useEffect(() => {
    if (!storeId) return;

    // Run once for the current store, then only when browser connectivity is restored.
    if (navigator.onLine) {
      syncEngine.runSync(storeId);
    }

    const handleBrowserOnline = () => {
      syncEngine.runSync(storeId);
    };

    window.addEventListener("online", handleBrowserOnline);
    return () => window.removeEventListener("online", handleBrowserOnline);
  }, [storeId]);

  const handleAddWalkIn = async () => {
    const name = newEntry.customerName.trim();
    if (!name) return;
    setIsAdding(true);
    try {
      await addWalkIn({
        customerName: name,
        customerPhone: newEntry.customerPhone.trim() || undefined,
        partySize: 1,
      });
      setShowAddForm(false);
      setNewEntry({ customerName: "", customerPhone: "" });
      toast({ title: "Walk-in added to queue" });
    } finally {
      setIsAdding(false);
    }
  };

  const handleNext = async () => {
    setIsAdvancing(true);
    try {
      await advanceQueue();
      const nextName = waiting[0]?.customerName;
      if (nextName) {
        toast({ title: `Now serving ${nextName}` });
      } else {
        toast({ title: "Queue is now empty" });
      }
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleRemove = async (record: QueueRecord) => {
    await removeEntry(record);
  };

  const handleRefresh = async () => {
    if (storeId) {
      await syncEngine.fetchAndMergeServerState(storeId);
    }
    await reload();
  };

  const handleBooked = () => {
    setShowBookModal(false);
    toast({
      title: "Booking saved offline",
      description: networkStatus === "online"
        ? "Syncing to server now…"
        : "Will sync automatically when reconnected.",
    });
    if (networkStatus === "online" && storeId) {
      syncEngine.runSync(storeId);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">

        {/* Network status banner */}
        <NetworkStatusBanner status={networkStatus} />

        {/* Page header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Queue</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Today's walk-ins and check-ins
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {slug && (
              <a
                href={`/q/${slug}/display`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Display Board
              </a>
            )}
            <Link to="/dashboard/queue/settings">
              <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                <Settings className="w-4 h-4" />
              </button>
            </Link>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-semibold hover:bg-muted transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Walk-In
            </button>
            {storeId && (
              <button
                onClick={() => setShowBookModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors"
              >
                <CalendarPlus className="w-4 h-4" />
                Book
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={isAdvancing || !hasNext}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-40 transition-colors shadow-sm"
            >
              {isAdvancing
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><ChevronRight className="w-4 h-4" /> Next</>
              }
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard
            icon={<UserCheck className="w-5 h-5 text-teal-500" />}
            label="Now Serving"
            value={serving.length}
            highlight={serving.length > 0}
            color="teal"
          />
          <StatCard
            icon={<Users className="w-5 h-5 text-amber-500" />}
            label="Waiting"
            value={waiting.length}
            highlight={waiting.length > 0}
            color="amber"
          />
          <StatCard
            icon={<CheckCircle className="w-5 h-5 text-green-500" />}
            label="Served Today"
            value={served.length}
          />
        </div>

        {/* Add walk-in form */}
        {showAddForm && (
          <div className="bg-card border rounded-xl p-4 mb-6 shadow-sm">
            <h3 className="font-semibold text-sm mb-3">Add Walk-In</h3>
            <div className="flex gap-3 flex-wrap">
              <input
                type="text"
                value={newEntry.customerName}
                onChange={e => setNewEntry(n => ({ ...n, customerName: e.target.value }))}
                placeholder="Client name *"
                className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                onKeyDown={e => e.key === "Enter" && handleAddWalkIn()}
                autoFocus
              />
              <input
                type="tel"
                value={newEntry.customerPhone}
                onChange={e => setNewEntry(n => ({ ...n, customerPhone: formatPhoneInput(e.target.value) }))}
                placeholder="(555) 000-0000"
                className="w-44 px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={handleAddWalkIn}
                disabled={isAdding || !newEntry.customerName.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewEntry({ customerName: "", customerPhone: "" }); }}
                className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Queue list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : serving.length === 0 && waiting.length === 0 ? (
          <div className="text-center py-20 border rounded-xl bg-card">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">Queue is empty</h3>
            <p className="text-muted-foreground text-sm mb-4">
              No clients in line right now.
            </p>
            {slug && (
              <a
                href={`/q/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View public check-in page
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {serving.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">
                  Now Serving
                </p>
                {serving.map(entry => (
                  <QueueEntryRow
                    key={entry.id}
                    entry={entry}
                    position={null}
                    isServing
                    onRemove={() => handleRemove(entry)}
                  />
                ))}
              </div>
            )}
            {waiting.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">
                  Waiting
                </p>
                {waiting.map((entry, idx) => (
                  <QueueEntryRow
                    key={entry.id}
                    entry={entry}
                    position={idx + 1}
                    isServing={false}
                    onRemove={() => handleRemove(entry)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recently served */}
        {served.length > 0 && (
          <div className="mt-8 border-t pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
              Served Today ({served.length})
            </p>
            <div className="space-y-1.5">
              {served.slice(0, 5).map(entry => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30"
                >
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground flex-1">
                    {entry.customerName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {safeDistanceToNow(entry.createdAt, { addSuffix: true })}
                  </span>
                </div>
              ))}
              {served.length > 5 && (
                <p className="text-xs text-muted-foreground text-center py-1">
                  +{served.length - 5} more
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Offline booking modal */}
      {showBookModal && storeId && (
        <OfflineBookingModal
          storeId={storeId}
          onClose={() => setShowBookModal(false)}
          onBooked={handleBooked}
        />
      )}
    </AppLayout>
  );
}

function NetworkStatusBanner({ status }: { status: "online" | "offline" | "syncing" }) {
  if (status === "online") return null;

  const configs = {
    offline: {
      bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/40",
      icon: <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />,
      text: "Offline mode — changes are saved locally and will sync when reconnected.",
      textColor: "text-amber-800 dark:text-amber-200",
    },
    syncing: {
      bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800/40",
      icon: <RefreshCcw className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 animate-spin" />,
      text: "Syncing changes with server…",
      textColor: "text-blue-800 dark:text-blue-200",
    },
  } as const;

  const c = configs[status as keyof typeof configs];
  if (!c) return null;

  return (
    <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border mb-5 text-sm ${c.bg}`}>
      {c.icon}
      <span className={`font-medium ${c.textColor}`}>{c.text}</span>
      {status === "offline" && (
        <span className="ml-auto">
          <Wifi className="w-4 h-4 text-amber-400 opacity-40" />
        </span>
      )}
    </div>
  );
}

function StatCard({
  icon, label, value, highlight, color = "amber",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
  color?: "amber" | "teal";
}) {
  const colorMap = {
    amber: { border: "border-amber-200 dark:border-amber-800/50", text: "text-amber-600 dark:text-amber-400" },
    teal:  { border: "border-teal-200  dark:border-teal-800/50",  text: "text-teal-600  dark:text-teal-400"  },
  };
  const c = colorMap[color];
  return (
    <div className={`rounded-xl border p-4 bg-card ${highlight && value > 0 ? c.border : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${highlight && value > 0 ? c.text : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function QueueEntryRow({
  entry, position, isServing, onRemove,
}: {
  entry: QueueRecord;
  position: number | null;
  isServing: boolean;
  onRemove: () => void;
}) {
  const isPending = !entry.synced;

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 mb-2 transition-all ${
      isServing
        ? "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800/40"
        : "bg-card"
    }`}>
      {position !== null ? (
        <span className="text-lg font-black text-muted-foreground w-8 text-center flex-shrink-0">
          #{position}
        </span>
      ) : (
        <div className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground truncate">{entry.customerName}</span>
          {isServing && (
            <span className="text-xs font-semibold text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/40 px-2 py-0.5 rounded-full">
              Serving
            </span>
          )}
          {isPending && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full flex items-center gap-1">
              <RefreshCcw className="w-2.5 h-2.5" />
              Pending sync
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {entry.customerPhone && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" />{entry.customerPhone}
            </span>
          )}
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {safeDistanceToNow(entry.createdAt, { addSuffix: true })}
          </span>
        </div>
      </div>

      <button
        onClick={onRemove}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        title="Remove from queue"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
