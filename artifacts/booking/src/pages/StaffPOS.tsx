import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { useAuth } from "@/hooks/use-auth";
import { useServices } from "@/hooks/use-services";
import { useServiceCategories, useAddonsForService } from "@/hooks/use-addons";
import { useToast } from "@/hooks/use-toast";
import { useUpdateAppointment } from "@/hooks/use-appointments";
import { ReceiptContent, useReceiptPrinter, type ReceiptData } from "@/components/Receipt";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle2,
  ShoppingCart,
  Loader2,
  Printer,
  X,
  CreditCard,
  Banknote,
  Heart,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Service, Addon } from "@shared/schema";

type TicketItem = { service: Service; addons: Addon[]; staffId: number | null };

function TipScreen({
  amountDue,
  onAddTip,
  onCancel,
}: {
  amountDue: number;
  onAddTip: (amount: number) => void;
  onCancel: () => void;
}) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");

  const presets = [
    { label: "10%", pct: 0.1 },
    { label: "15%", pct: 0.15 },
    { label: "20%", pct: 0.2 },
  ];

  const getTipAmount = () => {
    if (customAmount) {
      const val = parseFloat(customAmount);
      return isNaN(val) ? 0 : val;
    }
    if (selectedPreset !== null) return amountDue * presets[selectedPreset].pct;
    return 0;
  };

  const tipAmount = getTipAmount();

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background">
        <button
          onClick={onCancel}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted active:scale-95 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-bold text-lg">Add Tip</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="text-center">
          <p className="text-4xl font-bold">${amountDue.toFixed(2)}</p>
          <p className="text-sm text-muted-foreground mt-1">Amount Due</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {presets.map((preset, i) => (
            <button
              key={i}
              onClick={() => {
                setSelectedPreset(i);
                setCustomAmount("");
              }}
              className={cn(
                "p-4 rounded-2xl border-2 text-center font-bold transition-all active:scale-[0.97]",
                selectedPreset === i
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background"
              )}
            >
              <div className="text-xl">{preset.label}</div>
              <div className="text-sm mt-1 font-normal">
                ${(amountDue * preset.pct).toFixed(2)}
              </div>
            </button>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-muted-foreground">
            Custom amount ($)
          </label>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={customAmount}
            onChange={(e) => {
              setCustomAmount(e.target.value);
              setSelectedPreset(null);
            }}
            className="w-full px-4 py-3 rounded-2xl border text-lg font-semibold bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="p-4 border-t bg-background flex flex-col gap-3">
        <button
          onClick={() => onAddTip(tipAmount)}
          className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-[15px] active:scale-[0.98] transition-transform"
        >
          Confirm Tip · ${tipAmount.toFixed(2)}
        </button>
        <button
          onClick={() => onAddTip(0)}
          className="w-full py-4 rounded-2xl border-2 border-border text-foreground font-semibold text-[15px] active:scale-[0.98] transition-transform"
        >
          No Tip
        </button>
      </div>
    </div>
  );
}

export default function StaffPOS() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedStore } = useSelectedStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const updateAppointment = useUpdateAppointment();
  const queryClient = useQueryClient();
  const { printReceipt } = useReceiptPrinter();

  const params = new URLSearchParams(location.search);
  const appointmentIdParam = params.get("appointmentId");

  const [mobileView, setMobileView] = useState<"services" | "cart">("services");
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showTipScreen, setShowTipScreen] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [ticketInitialised, setTicketInitialised] = useState(false);

  // ── Stripe Terminal (M2 reader) ────────────────────────────────────────────
  const [hasStripeConnect, setHasStripeConnect] = useState<boolean | null>(null);
  const [terminalStatus, setTerminalStatus] = useState<"idle"|"loading"|"discovering"|"connecting"|"ready"|"collecting"|"processing"|"error">("idle");
  const [terminalReader, setTerminalReader] = useState<any>(null);
  const [terminalInstance, setTerminalInstance] = useState<any>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);

  const staffNumericId = (user as any)?.staffId as number | undefined;

  const { data: appointment, isLoading: apptLoading } = useQuery<any>({
    queryKey: ["/api/appointments/single", appointmentIdParam],
    queryFn: async () => {
      if (!appointmentIdParam) return null;
      const res = await fetch(
        `/api/appointments/${appointmentIdParam}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load appointment");
      return res.json();
    },
    enabled: !!appointmentIdParam,
    retry: 2,
  });

  const { data: staffServiceIds } = useQuery<number[]>({
    queryKey: ["/api/staff", staffNumericId, "services"],
    queryFn: async () => {
      if (!staffNumericId) return [];
      const res = await fetch(`/api/staff/${staffNumericId}/services`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.serviceIds ?? [];
    },
    enabled: !!staffNumericId,
  });

  const { data: allServices, isLoading: servicesLoading } = useServices();
  const { data: categories } = useServiceCategories();

  const services = useMemo(() => {
    if (!allServices) return [];
    const svcArr = allServices as Service[];
    if (!staffServiceIds || staffServiceIds.length === 0) return svcArr;
    return svcArr.filter((s) => staffServiceIds.includes(s.id));
  }, [allServices, staffServiceIds]);

  const categoryNames = useMemo(() => {
    if (categories && categories.length > 0) {
      return Array.from(new Set(categories.map((c: any) => c.name))).sort() as string[];
    }
    const catSet = new Set<string>();
    services.forEach((s) => catSet.add(s.category));
    return Array.from(catSet).sort();
  }, [services, categories]);

  const activeCategory = selectedCategory || (categoryNames.length > 0 ? categoryNames[0] : null);

  const filteredServices = useMemo(() => {
    if (!activeCategory) return services;
    return services.filter((s) => s.category === activeCategory);
  }, [services, activeCategory]);

  const activeServiceId =
    activeItemIndex !== null && ticketItems[activeItemIndex]
      ? ticketItems[activeItemIndex].service.id
      : null;
  const { data: availableAddons } = useAddonsForService(activeServiceId);

  useEffect(() => {
    if (!appointment || ticketInitialised) return;
    if (appointment.service) {
      setTicketItems([
        {
          service: appointment.service as Service,
          addons: (appointment.addons as Addon[]) ?? [],
          staffId: appointment.staffId ?? null,
        },
      ]);
      setTicketInitialised(true);
    }
  }, [appointment, ticketInitialised]);

  const ticketTotal = ticketItems.reduce(
    (sum, item) =>
      sum +
      Number(item.service.price) +
      item.addons.reduce((s, a) => s + Number(a.price), 0),
    0
  );
  const grandTotal = Math.max(0, ticketTotal + tipAmount);

  const handleAddService = (service: Service) => {
    const newIndex = ticketItems.length;
    setTicketItems((prev) => [
      ...prev,
      { service, addons: [], staffId: staffNumericId ?? null },
    ]);
    setActiveItemIndex(newIndex);
    setMobileView("cart");
  };

  const handleRemoveItem = (index: number) => {
    setTicketItems((prev) => prev.filter((_, i) => i !== index));
    if (activeItemIndex === index) setActiveItemIndex(null);
    else if (activeItemIndex !== null && activeItemIndex > index)
      setActiveItemIndex(activeItemIndex - 1);
  };

  const handleToggleAddon = (addon: Addon) => {
    if (activeItemIndex === null) return;
    setTicketItems((prev) =>
      prev.map((item, i) => {
        if (i !== activeItemIndex) return item;
        const exists = item.addons.find((a) => a.id === addon.id);
        return {
          ...item,
          addons: exists
            ? item.addons.filter((a) => a.id !== addon.id)
            : [...item.addons, addon],
        };
      })
    );
  };

  const handleCheckout = async (paymentMethod: string) => {
    if (!appointmentIdParam || !selectedStore) return;
    setCheckingOut(true);
    try {
      const txnId = Math.random().toString(36).substring(2, 10).toUpperCase();
      await updateAppointment.mutateAsync({
        id: Number(appointmentIdParam),
        status: "completed",
        totalPaid: grandTotal.toFixed(2),
        tipAmount: tipAmount.toFixed(2),
        paymentMethod,
      } as any);

      const now = new Date();
      const data: ReceiptData = {
        store: selectedStore,
        client: appointment?.customer ?? null,
        staff: appointment?.staff ?? null,
        items: ticketItems,
        subtotal: ticketTotal,
        tipAmount,
        grandTotal,
        paymentMethod,
        transactionId: txnId,
        dateStr: now.toLocaleDateString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
        }),
        timeStr: now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
      };
      setReceiptData(data);
      setCheckoutComplete(true);
      printReceipt(data);
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    } catch (err: any) {
      toast({
        title: "Checkout failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setCheckingOut(false);
    }
  };

  const handleFinalize = async () => {
    if (!appointmentIdParam || !selectedStore) return;
    setCheckingOut(true);
    try {
      const res = await fetch(`/api/appointments/${appointmentIdParam}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "finished" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to finalize");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({
        title: "Service finalized",
        description: "Marked as awaiting checkout. Front desk will complete payment.",
      });
      navigate("/staff-calendar");
    } catch (err: any) {
      toast({ title: "Failed to finalize", description: err.message, variant: "destructive" });
    } finally {
      setCheckingOut(false);
    }
  };

  // ── Stripe Connect status check ────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/payments/stripe/status", { credentials: "include" })
      .then(r => r.json())
      .then(d => setHasStripeConnect(!!(d?.connected && d?.chargesEnabled)))
      .catch(() => setHasStripeConnect(false));
  }, []);

  const loadStripeTerminalSDK = (): Promise<any> => {
    if ((window as any).StripeTerminal) return Promise.resolve((window as any).StripeTerminal);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/terminal/v1/";
      script.onload = () => resolve((window as any).StripeTerminal);
      script.onerror = () => reject(new Error("Failed to load Stripe Terminal SDK"));
      document.head.appendChild(script);
    });
  };

  const handleConnectTerminalReader = async () => {
    if (!selectedStore) return;
    setTerminalError(null);
    try {
      setTerminalStatus("loading");
      const StripeTerminal = await loadStripeTerminalSDK();
      const terminal = StripeTerminal.create({
        onFetchConnectionToken: async () => {
          const r = await fetch("/api/payments/terminal/connection-token", { method: "POST", credentials: "include" });
          if (!r.ok) throw new Error("Failed to get connection token");
          const d = await r.json();
          return d.secret;
        },
        onUnexpectedReaderDisconnect: () => {
          setTerminalStatus("idle");
          setTerminalReader(null);
          toast({ title: "Reader disconnected", variant: "destructive" });
        },
      });
      setTerminalInstance(terminal);
      setTerminalStatus("discovering");
      const discoverResult = await terminal.discoverReaders({ simulated: false });
      if (discoverResult.error) throw new Error(discoverResult.error.message);
      if (!discoverResult.discoveredReaders?.length) throw new Error("No M2 readers found nearby. Make sure the reader is powered on.");
      setTerminalStatus("connecting");
      const connectResult = await terminal.connectReader(discoverResult.discoveredReaders[0]);
      if (connectResult.error) throw new Error(connectResult.error.message);
      setTerminalReader(connectResult.reader);
      setTerminalStatus("ready");
    } catch (err: any) {
      setTerminalError(err.message);
      setTerminalStatus("error");
    }
  };

  const handleDisconnectTerminalReader = async () => {
    if (terminalInstance) {
      try { await terminalInstance.disconnectReader(); } catch {}
    }
    setTerminalStatus("idle");
    setTerminalReader(null);
    setTerminalError(null);
  };

  const handleTerminalPayment = async () => {
    if (!terminalInstance || !selectedStore || ticketItems.length === 0) return;
    setTerminalError(null);
    try {
      setTerminalStatus("collecting");
      const amountCents = Math.round(grandTotal * 100);
      const piRes = await fetch("/api/payments/terminal/create-payment-intent", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, currency: "usd", appointmentId: appointmentIdParam }),
      });
      if (!piRes.ok) throw new Error((await piRes.json()).error ?? "Failed to create payment intent");
      const { clientSecret, paymentIntentId } = await piRes.json();
      const collectResult = await terminalInstance.collectPaymentMethod(clientSecret);
      if (collectResult.error) throw new Error(collectResult.error.message);
      setTerminalStatus("processing");
      const processResult = await terminalInstance.processPayment(collectResult.paymentIntent);
      if (processResult.error) throw new Error(processResult.error.message);
      await fetch("/api/payments/terminal/capture-payment-intent", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId }),
      });
      const last4 = processResult.paymentIntent?.payment_method_details?.card_present?.last4 ?? "????";
      const brand = processResult.paymentIntent?.payment_method_details?.card_present?.brand ?? "Card";
      handleCheckout(`${brand} ····${last4} (Stripe M2)`);
      setTerminalStatus("ready");
    } catch (err: any) {
      setTerminalError(err.message);
      setTerminalStatus("ready");
      toast({ title: "Card payment failed", description: err.message, variant: "destructive" });
    }
  };

  if (checkoutComplete && receiptData) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center overflow-y-auto">
        <div className="w-full max-w-md mx-auto py-8 px-4 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Payment Complete</h1>
            <p className="text-muted-foreground">Transaction #{receiptData.transactionId}</p>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-center bg-muted/30 py-4">
              <ReceiptContent data={receiptData} />
            </div>
          </Card>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => printReceipt(receiptData)}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Printer className="w-4 h-4" />
              Print Receipt
            </button>
            <button
              onClick={() => navigate("/staff-calendar")}
              className="w-full py-4 rounded-2xl border-2 border-border font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Calendar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (apptLoading || (!appointment && !!appointmentIdParam)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg font-semibold">Appointment not found</p>
        <button
          onClick={() => navigate("/staff-calendar")}
          className="py-3 px-6 rounded-2xl border-2 border-border font-semibold active:scale-[0.98] transition-transform"
        >
          Back to Calendar
        </button>
      </div>
    );
  }

  return (
    <>
      {showTipScreen && (
        <TipScreen
          amountDue={ticketTotal}
          onAddTip={(amt) => {
            setTipAmount(amt);
            setShowTipScreen(false);
          }}
          onCancel={() => setShowTipScreen(false)}
        />
      )}

      <div className="flex flex-col h-screen bg-background overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-background flex-shrink-0">
          <button
            onClick={() => navigate("/staff-calendar")}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted active:scale-95 transition flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base truncate">
              {(appointment?.customer as any)?.fullName ?? appointment?.customer?.name ?? "Walk-in"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {appointment?.service?.name ?? "Appointment"} · #{appointmentIdParam}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-primary text-lg">${grandTotal.toFixed(2)}</p>
            {ticketItems.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {ticketItems.length} item{ticketItems.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b flex-shrink-0">
          <button
            onClick={() => setMobileView("services")}
            className={cn(
              "flex-1 py-3 text-sm font-semibold border-b-2 transition-colors",
              mobileView === "services"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            )}
          >
            Services
          </button>
          <button
            onClick={() => setMobileView("cart")}
            className={cn(
              "flex-1 py-3 text-sm font-semibold border-b-2 transition-colors",
              mobileView === "cart"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            )}
          >
            Cart
            {ticketItems.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold align-middle">
                {ticketItems.length}
              </span>
            )}
          </button>
        </div>

        {/* ── Services tab ── */}
        {mobileView === "services" && (
          <>
            <div className="flex overflow-x-auto border-b flex-shrink-0 px-3 py-2 gap-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {categoryNames.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-colors",
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {servicesLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredServices.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">
                  No services available
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredServices.map((service) => (
                    <button
                      key={service.id}
                      onClick={() => handleAddService(service)}
                      className="p-4 rounded-2xl border-2 border-border bg-background text-left hover:border-primary hover:bg-primary/5 active:scale-95 transition-all"
                    >
                      <p className="font-semibold text-sm text-foreground leading-tight">
                        {service.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {service.duration} min
                      </p>
                      {Number(service.price) > 0 && (
                        <p className="text-sm font-bold text-primary mt-1.5">
                          ${Number(service.price).toFixed(2)}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Cart tab ── */}
        {mobileView === "cart" && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {ticketItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ShoppingCart className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="font-medium text-muted-foreground">Cart is empty</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tap Services to add items
                  </p>
                </div>
              ) : (
                ticketItems.map((item, i) => (
                  <div key={i}>
                    <div
                      className={cn(
                        "rounded-2xl border-2 p-4 transition-all",
                        activeItemIndex === i
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm leading-snug">
                            {item.service.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.service.duration} min
                          </p>
                          {item.addons.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {item.addons.map((a) => (
                                <p key={a.id} className="text-xs text-muted-foreground">
                                  + {a.name}{" "}
                                  <span className="text-primary font-medium">
                                    ${Number(a.price).toFixed(2)}
                                  </span>
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <p className="font-bold text-sm">
                            $
                            {(
                              Number(item.service.price) +
                              item.addons.reduce((s, a) => s + Number(a.price), 0)
                            ).toFixed(2)}
                          </p>
                          {i > 0 && (
                            <button
                              onClick={() => handleRemoveItem(i)}
                              className="w-7 h-7 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40 text-red-500 active:bg-red-200 transition"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          setActiveItemIndex(activeItemIndex === i ? null : i)
                        }
                        className="mt-2 text-xs font-semibold text-primary"
                      >
                        {activeItemIndex === i ? "Hide add-ons ↑" : "+ Add-ons"}
                      </button>
                    </div>

                    {activeItemIndex === i &&
                      availableAddons &&
                      availableAddons.length > 0 && (
                        <div className="mt-2 grid grid-cols-2 gap-2 pl-2">
                          {(availableAddons as Addon[]).map((addon) => {
                            const sel = item.addons.some((a) => a.id === addon.id);
                            return (
                              <button
                                key={addon.id}
                                onClick={() => handleToggleAddon(addon)}
                                className={cn(
                                  "p-3 rounded-xl border-2 text-left transition-all active:scale-95",
                                  sel
                                    ? "border-primary bg-primary/10"
                                    : "border-border bg-background"
                                )}
                              >
                                <p className="text-xs font-semibold leading-snug">
                                  {addon.name}
                                </p>
                                <p className="text-xs font-bold text-primary mt-0.5">
                                  ${Number(addon.price).toFixed(2)}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                  </div>
                ))
              )}
            </div>

            <div className="border-t px-4 pt-4 pb-6 flex-shrink-0 bg-background space-y-3">
              {/* Totals */}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">${ticketTotal.toFixed(2)}</span>
              </div>
              {tipAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tip</span>
                  <span className="font-medium">${tipAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-3">
                <span>Total</span>
                <span>${grandTotal.toFixed(2)}</span>
              </div>

              {/* Tip button */}
              <button
                onClick={() => setShowTipScreen(true)}
                disabled={ticketItems.length === 0}
                className="w-full py-3 rounded-2xl border-2 border-border font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40"
              >
                <Heart className="w-4 h-4" />
                {tipAmount > 0 ? `Tip: $${tipAmount.toFixed(2)} — Edit` : "Add Tip"}
              </button>

              {/* Payment method buttons: Cash | Card | Stripe */}
              <div className="grid grid-cols-3 gap-2">
                {/* Cash */}
                <button
                  onClick={() => handleCheckout("Cash")}
                  disabled={checkingOut || ticketItems.length === 0}
                  className="flex flex-col items-center gap-1 py-3 rounded-2xl border-2 border-border bg-background font-semibold text-sm active:scale-95 transition-all disabled:opacity-40"
                >
                  <Banknote className="w-5 h-5" />
                  <span className="text-xs font-semibold">Cash</span>
                </button>

                {/* Card (generic / swipe) */}
                <button
                  onClick={() => handleCheckout("Card")}
                  disabled={checkingOut || ticketItems.length === 0}
                  className="flex flex-col items-center gap-1 py-3 rounded-2xl border-2 border-border bg-background font-semibold text-sm active:scale-95 transition-all disabled:opacity-40"
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="text-xs font-semibold">Card</span>
                </button>

                {/* Stripe M2 terminal */}
                <button
                  onClick={() => {
                    if (terminalStatus === "ready") handleTerminalPayment();
                    else handleConnectTerminalReader();
                  }}
                  disabled={
                    checkingOut ||
                    ticketItems.length === 0 ||
                    hasStripeConnect === false ||
                    hasStripeConnect === null ||
                    terminalStatus === "loading" ||
                    terminalStatus === "discovering" ||
                    terminalStatus === "connecting" ||
                    terminalStatus === "collecting" ||
                    terminalStatus === "processing"
                  }
                  title={hasStripeConnect === false ? "Connect a Stripe account in Payment Settings first" : undefined}
                  className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-indigo-600 text-white font-semibold text-sm active:scale-95 transition-all disabled:opacity-40"
                >
                  {terminalStatus === "loading" || terminalStatus === "discovering" || terminalStatus === "connecting" || terminalStatus === "collecting" || terminalStatus === "processing"
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <CreditCard className="w-5 h-5" />
                  }
                  <span className="text-xs font-semibold">
                    {terminalStatus === "collecting" ? "Waiting…"
                      : terminalStatus === "processing" ? "Processing…"
                      : terminalStatus === "loading" || terminalStatus === "discovering" || terminalStatus === "connecting" ? "Connecting…"
                      : terminalStatus === "ready" ? "Stripe M2"
                      : "Stripe"}
                  </span>
                </button>
              </div>

              {/* Terminal reader status */}
              {hasStripeConnect && terminalStatus === "ready" && terminalReader && (
                <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    {terminalReader.label ?? terminalReader.id ?? "M2 Reader"} connected
                  </span>
                  <button className="underline" onClick={handleDisconnectTerminalReader}>Disconnect</button>
                </div>
              )}
              {hasStripeConnect && (terminalStatus === "loading" || terminalStatus === "discovering" || terminalStatus === "connecting") && (
                <div className="flex items-center gap-1.5 text-xs text-indigo-600 px-0.5">
                  <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                  {terminalStatus === "loading" && "Loading Stripe Terminal SDK…"}
                  {terminalStatus === "discovering" && "Searching for M2 reader…"}
                  {terminalStatus === "connecting" && "Connecting to reader…"}
                </div>
              )}
              {terminalError && (
                <p className="text-xs text-red-500 px-0.5">{terminalError}</p>
              )}

              {/* Finalize without payment (send to front desk) */}
              <button
                onClick={handleFinalize}
                disabled={checkingOut || ticketItems.length === 0}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-border text-muted-foreground text-xs font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Send to front desk for payment
              </button>

              {ticketItems.length === 0 && (
                <p className="text-center text-xs text-muted-foreground">Add a service to checkout</p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
