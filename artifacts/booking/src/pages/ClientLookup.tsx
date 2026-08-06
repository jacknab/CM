import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useSelectedStore } from "@/hooks/use-store";
import { useCreateCustomer } from "@/hooks/use-customers";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, X, Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { localClientsDB } from "@/lib/local-clients-db";
import { useSnapshot } from "@/hooks/use-snapshot";
import type { Customer } from "@shared/schema";

type LookupStep = "phone" | "name";

export default function ClientLookup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedStore } = useSelectedStore();
  const createCustomer = useCreateCustomer();
  const { toast } = useToast();
  const { snapshot } = useSnapshot();

  const searchParams = new URLSearchParams(location.search);
  const bookingStaffId = searchParams.get("staffId");
  const bookingDate = searchParams.get("date");
  const bookingTime = searchParams.get("time");
  const isBookingContext = !!(bookingStaffId && bookingDate && bookingTime);

  const bookingSlotSuffix = isBookingContext
    ? `&staffId=${bookingStaffId}&date=${bookingDate}&time=${bookingTime}`
    : "";

  const [step, setStep] = useState<LookupStep>("phone");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [clientName, setClientName] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [shiftActive, setShiftActive] = useState(true);

  const formatPhone = (digits: string): string => {
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleNumPad = useCallback((digit: string) => {
    if (phoneDigits.length < 10) {
      setPhoneDigits(prev => prev + digit);
      setSearchDone(false);
    }
  }, [phoneDigits.length]);

  const handleNumBackspace = useCallback(() => {
    setPhoneDigits(prev => prev.slice(0, -1));
    setSearchDone(false);
  }, []);

  const handleNumClear = useCallback(() => {
    setPhoneDigits("");
    setSearchDone(false);
  }, []);

  useEffect(() => {
    if (phoneDigits.length !== 10 || searchDone || !selectedStore) return;

    setIsSearching(true);
    const rawPhone = phoneDigits;

    // Offline: search local DB + snapshot instead of hitting server
    if (!navigator.onLine) {
      const searchOffline = async () => {
        // Check locally-created clients first
        const localClients = await localClientsDB.search(selectedStore.id, rawPhone).catch(() => []);
        if (localClients.length > 0) {
          setIsSearching(false);
          setSearchDone(true);
          navigate(isBookingContext
            ? `/booking/new?clientId=${localClients[0]._id}${bookingSlotSuffix}`
            : `/pos?clientId=${localClients[0]._id}`);
          return;
        }
        // Check snapshot (last known server state)
        const snapshotMatch = (snapshot?.customers ?? [] as Customer[]).find(
          (c: Customer) => (c.phone ?? "").replace(/\D/g, "") === rawPhone
        );
        if (snapshotMatch) {
          setIsSearching(false);
          setSearchDone(true);
          navigate(isBookingContext
            ? `/booking/new?clientId=${snapshotMatch.id}${bookingSlotSuffix}`
            : `/pos?clientId=${snapshotMatch.id}`);
          return;
        }
        // Not found locally — go to name entry
        setIsSearching(false);
        setSearchDone(true);
        setStep("name");
      };
      searchOffline();
      return;
    }

    // Online: try server, fall back to offline search if server is unreachable
    fetch(`/api/customers/search?phone=${encodeURIComponent(rawPhone)}&storeId=${selectedStore.id}`, {
      credentials: "include",
    })
      .then(res => {
        if (!res.ok) throw new Error("server_error");
        return res.json();
      })
      .then((customer: Customer | null) => {
        setIsSearching(false);
        setSearchDone(true);
        if (customer) {
          navigate(isBookingContext
            ? `/booking/new?clientId=${customer.id}${bookingSlotSuffix}`
            : `/pos?clientId=${customer.id}`);
        } else {
          setStep("name");
        }
      })
      .catch(async () => {
        // Server unreachable — fall back to local search
        const localClients = await localClientsDB.search(selectedStore.id, rawPhone).catch(() => []);
        if (localClients.length > 0) {
          setIsSearching(false);
          setSearchDone(true);
          navigate(isBookingContext
            ? `/booking/new?clientId=${localClients[0]._id}${bookingSlotSuffix}`
            : `/pos?clientId=${localClients[0]._id}`);
          return;
        }
        const snapshotMatch = (snapshot?.customers ?? [] as Customer[]).find(
          (c: Customer) => (c.phone ?? "").replace(/\D/g, "") === rawPhone
        );
        if (snapshotMatch) {
          setIsSearching(false);
          setSearchDone(true);
          navigate(isBookingContext
            ? `/booking/new?clientId=${snapshotMatch.id}${bookingSlotSuffix}`
            : `/pos?clientId=${snapshotMatch.id}`);
          return;
        }
        setIsSearching(false);
        setSearchDone(true);
        setStep("name");
      });
  }, [phoneDigits, searchDone, selectedStore, navigate, snapshot, isBookingContext, bookingSlotSuffix]);

  const handleDone = useCallback(() => {
    if (!clientName.trim() || !selectedStore || createCustomer.isPending) return;
    createCustomer.mutate(
      { name: clientName.trim(), phone: phoneDigits, storeId: selectedStore.id },
      {
        onSuccess: (newCustomer: Customer) => {
          navigate(isBookingContext
            ? `/booking/new?clientId=${newCustomer.id}${bookingSlotSuffix}`
            : `/pos?clientId=${newCustomer.id}`);
        },
        onError: () => {
          toast({
            title: "Saved locally",
            description: "Client saved on this device. Will sync when server reconnects.",
          });
          navigate(isBookingContext
            ? `/booking/new${bookingSlotSuffix.replace("&", "?")}`
            : "/pos");
        },
      }
    );
  }, [clientName, phoneDigits, selectedStore, createCustomer, navigate, toast, isBookingContext, bookingSlotSuffix]);

  const handleKeyPress = useCallback((key: string) => {
    if (key === "SHIFT") {
      setShiftActive(prev => !prev);
      return;
    }
    if (key === "BACKSPACE") {
      setClientName(prev => prev.slice(0, -1));
      return;
    }
    if (key === "SPACE") {
      setClientName(prev => prev + " ");
      return;
    }
    if (key === "RETURN") {
      handleDone();
      return;
    }
    const char = shiftActive ? key.toUpperCase() : key.toLowerCase();
    setClientName(prev => prev + char);
    if (shiftActive) setShiftActive(false);
  }, [shiftActive, handleDone]);

  const handleGuest = useCallback(() => {
    navigate(isBookingContext
      ? `/booking/new${bookingSlotSuffix.replace("&", "?")}`
      : "/pos");
  }, [navigate, isBookingContext, bookingSlotSuffix]);

  const numKeys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", ""],
  ];

  const keyboardRows = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"],
  ];

  if (step === "name") {
    return (
      <div className="h-screen w-screen flex flex-col bg-background">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setStep("phone")} data-testid="button-back-phone">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold">Enter Client Name</span>
          </div>
          <span className="text-lg font-bold text-foreground" data-testid="text-name-preview-header">
            {clientName || ""}
          </span>
          <Button variant="ghost" size="icon" onClick={() => navigate("/calendar")} data-testid="button-close-name">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-add-client-heading">
            Add Client Name
          </h1>
          <p className="text-sm text-muted-foreground mb-8" data-testid="text-creating-for-phone">
            Creating new client for {formatPhone(phoneDigits)}
          </p>

          <div className="w-full max-w-[640px] space-y-2">
            <div className="flex justify-center gap-1">
              {keyboardRows[0].map((key) => (
                <button
                  key={key}
                  onClick={() => handleKeyPress(key)}
                  className="min-w-[52px] h-[48px] rounded-md border bg-card text-sm font-medium hover-elevate active-elevate-2"
                  data-testid={`key-${key.toLowerCase()}`}
                >
                  {shiftActive ? key : key.toLowerCase()}
                </button>
              ))}
            </div>
            <div className="flex justify-center gap-1">
              {keyboardRows[1].map((key) => (
                <button
                  key={key}
                  onClick={() => handleKeyPress(key)}
                  className="min-w-[52px] h-[48px] rounded-md border bg-card text-sm font-medium hover-elevate active-elevate-2"
                  data-testid={`key-${key.toLowerCase()}`}
                >
                  {shiftActive ? key : key.toLowerCase()}
                </button>
              ))}
            </div>
            <div className="flex justify-center gap-1">
              <button
                onClick={() => handleKeyPress("SHIFT")}
                className={cn(
                  "min-w-[68px] h-[48px] rounded-md border text-sm font-medium",
                  shiftActive ? "bg-primary text-primary-foreground" : "bg-card hover-elevate active-elevate-2"
                )}
                data-testid="key-shift"
              >
                &#8593;
              </button>
              {keyboardRows[2].map((key) => (
                <button
                  key={key}
                  onClick={() => handleKeyPress(key)}
                  className="min-w-[52px] h-[48px] rounded-md border bg-card text-sm font-medium hover-elevate active-elevate-2"
                  data-testid={`key-${key.toLowerCase()}`}
                >
                  {shiftActive ? key : key.toLowerCase()}
                </button>
              ))}
              <button
                onClick={() => handleKeyPress("BACKSPACE")}
                className="min-w-[68px] h-[48px] rounded-md border bg-card text-sm font-medium hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="key-backspace"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-center gap-1">
              <button
                onClick={handleGuest}
                className="min-w-[68px] h-[48px] rounded-md border bg-card text-sm font-medium hover-elevate active-elevate-2"
                data-testid="key-guest"
              >
                Guest
              </button>
              <button
                onClick={() => handleKeyPress("@")}
                className="min-w-[52px] h-[48px] rounded-md border bg-card text-sm font-medium hover-elevate active-elevate-2"
                data-testid="key-at"
              >
                @
              </button>
              <button
                onClick={() => handleKeyPress("SPACE")}
                className="flex-1 max-w-[280px] h-[48px] rounded-md border bg-card text-sm font-medium hover-elevate active-elevate-2"
                data-testid="key-space"
              >
                Spacebar
              </button>
              <button
                onClick={() => handleKeyPress("RETURN")}
                className={cn(
                  "min-w-[80px] h-[48px] rounded-md border text-sm font-medium transition-colors",
                  clientName.trim()
                    ? "bg-green-500 text-white hover:bg-green-600"
                    : "bg-card hover-elevate active-elevate-2"
                )}
                data-testid="key-return"
              >
                Return &#8629;
              </button>
            </div>
          </div>

          <Button
            className="mt-6 px-12 bg-green-500 text-white"
            size="lg"
            onClick={handleDone}
            disabled={!clientName.trim() || createCustomer.isPending}
            data-testid="button-done-name"
          >
            {createCustomer.isPending ? "Saving..." : "Done"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/calendar")} data-testid="button-back-calendar-lookup">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="font-semibold">Client Lookup</span>
        </div>
        {!navigator.onLine && (
          <span className="text-xs text-amber-600 font-medium px-2 py-0.5 bg-amber-50 rounded-full border border-amber-200">
            Offline — using local data
          </span>
        )}
        <Button variant="ghost" size="icon" onClick={() => navigate("/calendar")} data-testid="button-close-lookup">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-client-lookup-heading">
          {isBookingContext ? "New Booking" : "Client Lookup"}
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          {isBookingContext ? "Enter client's phone to look them up" : "Enter client phone number"}
        </p>

        <div
          className="text-4xl font-mono tracking-wider mb-8 min-h-[48px] flex items-center"
          data-testid="text-phone-display"
        >
          {phoneDigits.length > 0 ? formatPhone(phoneDigits) : (
            <span className="text-muted-foreground/40">(___) ___-____</span>
          )}
        </div>

        {isSearching && (
          <p className="text-sm text-muted-foreground mb-4 animate-pulse" data-testid="text-searching">
            Searching...
          </p>
        )}

        <div className="w-full max-w-[320px] space-y-2">
          {numKeys.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-2">
              {row.map((digit, di) =>
                digit ? (
                  <button
                    key={digit}
                    onClick={() => handleNumPad(digit)}
                    className="w-[88px] h-[64px] rounded-md border bg-card text-2xl font-semibold hover-elevate active-elevate-2"
                    data-testid={`numpad-${digit}`}
                  >
                    {digit}
                  </button>
                ) : (
                  <div key={`empty-${di}`} className="w-[88px] h-[64px]" />
                )
              )}
            </div>
          ))}
          <div className="flex justify-center gap-2">
            <button
              onClick={handleNumClear}
              className="w-[88px] h-[64px] rounded-md border bg-card text-sm font-medium text-destructive hover-elevate active-elevate-2"
              data-testid="numpad-clear"
            >
              Clear
            </button>
            <div className="w-[88px] h-[64px]" />
            <button
              onClick={handleNumBackspace}
              className="w-[88px] h-[64px] rounded-md border bg-card hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="numpad-backspace"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            onClick={handleGuest}
            data-testid="button-guest"
          >
            {isBookingContext ? "Skip — no client" : "Continue as Guest"}
          </Button>
        </div>
      </div>
    </div>
  );
}
