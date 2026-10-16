// Moved out of pages/Calendar.tsx so the /nail and /barber staff screens don't load the whole calendar.
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useSelectedStore } from "@/hooks/use-store";
import { ArrowLeft, ArrowUp, X, Delete, PersonStanding, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { clientPhoneCacheDB } from "@/lib/client-phone-cache-db";
import { isValidNanpPrefix, isValidNanpNumber } from "@/lib/phone-validation";
import { useShake } from "@/hooks/use-shake";
import { useLanguage } from "@/hooks/use-language";

export function ChooseClientPanel({
  onClose,
  onSelectClient,
  onWalkIn,
  walkInsEnabled = true,
  phoneFromFrontdesk = "",
}: {
  onClose: () => void;
  onSelectClient: (clientId: number) => void;
  onWalkIn: () => void;
  walkInsEnabled?: boolean;
  /** 10 digits pushed live from the /frontdesk tablet — fills the keypad. */
  phoneFromFrontdesk?: string;
}) {
  const { pick } = useLanguage();
  const tCC = {
    chooseClient: pick({ en: "Choose A Client",      vi: "Chọn khách hàng",                         es: "Elegir un cliente",           fr: "Choisir un client" }),
    enterPhone:   pick({ en: "Enter Phone Number",   vi: "Nhập số điện thoại",                       es: "Ingresar número de teléfono", fr: "Entrer le numéro de téléphone" }),
    tapWalkIn:    pick({ en: "Tap for walk-in",      vi: "Nhấn vào biểu tượng để đặt không cần tên", es: "Toca para sin cita",          fr: "Appuyez pour sans rendez-vous" }),
    searching:    pick({ en: "Searching...",         vi: "Đang tìm...",                              es: "Buscando...",                 fr: "Recherche..." }),
    enterName:    pick({ en: "Enter Client Name",    vi: "Nhập tên khách",                           es: "Ingresar nombre del cliente", fr: "Entrer le nom du client" }),
    newClient:    pick({ en: "New client · ",        vi: "Khách mới · ",                             es: "Nuevo cliente · ",            fr: "Nouveau client · " }),
    guest:        pick({ en: "Guest",                vi: "Vãng lai",                                 es: "Invitado",                    fr: "Invité" }),
    space:        pick({ en: "space",                vi: "dấu cách",                                 es: "espacio",                     fr: "espace" }),
    returnKey:    pick({ en: "return",               vi: "xong",                                     es: "confirmar",                   fr: "valider" }),
    creating:     pick({ en: "Creating...",          vi: "Đang tạo...",                              es: "Creando...",                  fr: "Création..." }),
    done:         pick({ en: "Done",                 vi: "Xong",                                     es: "Listo",                       fr: "Terminé" }),
  };
  const [phoneDigits, setPhoneDigits] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  // `invalidNumber` is only for a complete number pushed from the /frontdesk tablet that isn't a real US number; a digit typed on this
  // keypad that can't be part of one is refused with a shake instead, and what's already typed stays.
  const [invalidNumber, setInvalidNumber] = useState(false);
  const { shakeClass, shake, onShakeEnd } = useShake();
  const [showNameEntry, setShowNameEntry] = useState(false);
  const [clientName, setClientName] = useState("");
  const [shiftActive, setShiftActive] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const { selectedStore } = useSelectedStore();

  useEffect(() => {
    (document.activeElement as HTMLElement)?.blur();
  }, [showNameEntry]);

  const formatPhone = (digits: string): string => {
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const formatPhoneFull = (digits: string): string => {
    if (digits.length !== 10) return digits;
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
      setInvalidNumber(false);
      setPhoneDigits(next);
    }
  }, [phoneDigits, shake]);

  const handleBackspace = useCallback(() => {
    setPhoneDigits(prev => prev.slice(0, -1));
    setSearchDone(false);
    setInvalidNumber(false);
  }, []);

  // The /frontdesk tablet pushed the digits the client typed — mirror them into
  // the keypad so the search / new-client flow runs exactly as if staff typed it.
  // Same NANP structural check applies here: a customer can mistype on the
  // tablet too, and an invalid number shouldn't get pushed through to a
  // new-client lookup/create.
  useEffect(() => {
    const digits = (phoneFromFrontdesk || "").replace(/\D/g, "").slice(-10);
    if (digits.length === 10) {
      if (!isValidNanpNumber(digits)) {
        setInvalidNumber(true);
        return;
      }
      setPhoneDigits(digits);
      setSearchDone(false);
      setInvalidNumber(false);
      setShowNameEntry(false);
    }
  }, [phoneFromFrontdesk]);

  useEffect(() => {
    if (phoneDigits.length !== 10 || searchDone || !selectedStore) return;
    const storeId = selectedStore.id;
    let cancelled = false;
    setIsSearching(true);

    const finish = (clientId: number | null) => {
      if (cancelled) return;
      setIsSearching(false);
      setSearchDone(true);
      if (clientId != null && Number.isFinite(clientId)) onSelectClient(clientId);
      else setShowNameEntry(true);
    };

    // Offline fallback: the phone→client cache (clientPhoneCacheDB) is populated
    // from the offline snapshot, so an existing client is still findable by
    // phone when the network is down.
    const lookupOffline = async (): Promise<number | null> => {
      const match = await clientPhoneCacheDB.findByPhone10(storeId, phoneDigits).catch(() => null);
      const id = match ? Number(match.id) : NaN;
      return Number.isFinite(id) ? id : null;
    };

    (async () => {
      if (!navigator.onLine) {
        finish(await lookupOffline());
        return;
      }
      try {
        const res = await fetch(
          `/api/customers/search?phone=${encodeURIComponent(phoneDigits)}&storeId=${storeId}`,
          { credentials: "include" },
        );
        const customer = await res.json().catch(() => null);
        finish(customer && customer.id ? Number(customer.id) : null);
      } catch {
        // Network error mid-session — fall back to the offline cache before
        // giving up to "new client".
        finish(await lookupOffline());
      }
    })();

    return () => { cancelled = true; };
  }, [phoneDigits, searchDone, selectedStore, onSelectClient]);

  const handleNameKey = useCallback((key: string) => {
    const char = shiftActive ? key.toUpperCase() : key.toLowerCase();
    setClientName(prev => prev + char);
    if (shiftActive) setShiftActive(false);
  }, [shiftActive]);

  const handleNameBackspace = useCallback(() => {
    setClientName(prev => prev.slice(0, -1));
  }, []);

  const handleNameDone = useCallback(async () => {
    if (!clientName.trim() || !selectedStore) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: clientName.trim(),
          phone: phoneDigits,
          storeId: selectedStore.id,
        }),
      });
      const newCustomer = await res.json();
      if (newCustomer && newCustomer.id) {
        onSelectClient(newCustomer.id);
      }
    } catch {
      setIsCreating(false);
    }
  }, [clientName, phoneDigits, selectedStore, onSelectClient]);

  const handleGuestDone = useCallback(() => {
    onWalkIn();
  }, [onWalkIn]);

  const numKeys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [walkInsEnabled ? "walk-in" : "blank", "0", "backspace"],
  ];

  const kbRow1 = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"];
  const kbRow2 = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
  const kbRow3 = ["Z", "X", "C", "V", "B", "N", "M"];

  if (showNameEntry) {
    return (
      <div className="dark cx-cal fixed inset-0 z-50 text-foreground" data-testid="enter-name-panel">
        <button
          type="button"
          aria-label="Close name entry"
          className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
          onClick={onClose}
        />
        <div className="absolute right-0 top-0 h-full w-full sm:w-[740px] bg-[#161618] flex flex-col shadow-[-8px_0_24px_rgba(0,0,0,0.12)] border-l">
          <div className="px-4 py-4 flex items-center justify-between gap-2 bg-white border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onPointerDown={e => e.preventDefault()} onClick={() => { setShowNameEntry(false); setClientName(""); setPhoneDigits(""); setSearchDone(false); setShiftActive(true); }} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100" data-testid="button-back-name-entry">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <span className="font-semibold text-sm text-gray-900">{tCC.enterName}</span>
            </div>
            <Button variant="ghost" size="icon" onPointerDown={e => e.preventDefault()} onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100" data-testid="button-close-name-entry">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 flex flex-col px-3 pt-6 pb-3 min-h-0">
            <div className="text-center mb-4 px-2">
              <p className="text-3xl font-bold tracking-wide min-h-[44px]" data-testid="text-client-name-display">
                {clientName || <span className="text-muted-foreground/30">Name</span>}
              </p>
              <p className="text-xs text-primary mt-1 font-medium" data-testid="text-creating-for-phone">
                {tCC.newClient}{formatPhoneFull(phoneDigits)}
              </p>
            </div>

            <div className="flex-1 flex flex-col gap-1.5 min-h-0 justify-end">
              {/* Row 1: QWERTYUIOP */}
              <div className="flex gap-1">
                {kbRow1.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => handleNameKey(k)}
                    className="flex-1 h-[52px] rounded-md bg-muted text-sm font-semibold text-foreground hover-elevate active-elevate-2 flex items-center justify-center"
                    data-testid={`kb-${k.toLowerCase()}`}
                  >
                    {shiftActive ? k : k.toLowerCase()}
                  </button>
                ))}
              </div>
              {/* Row 2: ASDFGHJKL */}
              <div className="flex gap-1 px-[4%]">
                {kbRow2.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => handleNameKey(k)}
                    className="flex-1 h-[52px] rounded-md bg-muted text-sm font-semibold text-foreground hover-elevate active-elevate-2 flex items-center justify-center"
                    data-testid={`kb-${k.toLowerCase()}`}
                  >
                    {shiftActive ? k : k.toLowerCase()}
                  </button>
                ))}
              </div>
              {/* Row 3: Shift + ZXCVBNM + Backspace */}
              <div className="flex gap-1">
                <button
                  type="button"
                  onPointerDown={e => e.preventDefault()}
                  onClick={() => setShiftActive(prev => !prev)}
                  className={cn(
                    "w-[52px] h-[52px] rounded-md text-sm font-semibold flex items-center justify-center hover-elevate active-elevate-2 flex-shrink-0",
                    shiftActive ? "bg-foreground text-background" : "bg-muted text-foreground"
                  )}
                  data-testid="kb-shift"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                {kbRow3.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => handleNameKey(k)}
                    className="flex-1 h-[52px] rounded-md bg-muted text-sm font-semibold text-foreground hover-elevate active-elevate-2 flex items-center justify-center"
                    data-testid={`kb-${k.toLowerCase()}`}
                  >
                    {shiftActive ? k : k.toLowerCase()}
                  </button>
                ))}
                <button
                  type="button"
                  onPointerDown={e => e.preventDefault()}
                  onClick={handleNameBackspace}
                  className="w-[52px] h-[52px] rounded-md bg-muted text-muted-foreground flex items-center justify-center hover-elevate active-elevate-2 flex-shrink-0"
                  data-testid="kb-backspace"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>
              {/* Row 4: Guest / @ / Space / Return */}
              <div className="flex gap-1">
                <button
                  type="button"
                  onPointerDown={e => e.preventDefault()}
                  onClick={handleGuestDone}
                  className="h-[52px] px-3 rounded-md bg-muted text-sm font-medium text-foreground hover-elevate active-elevate-2 flex-shrink-0"
                  data-testid="kb-guest"
                >
                  {tCC.guest}
                </button>
                <button
                  type="button"
                  onPointerDown={e => e.preventDefault()}
                  onClick={() => handleNameKey("@")}
                  className="h-[52px] px-3 rounded-md bg-muted text-sm font-medium text-foreground hover-elevate active-elevate-2 flex-shrink-0"
                  data-testid="kb-at"
                >
                  @
                </button>
                <button
                  type="button"
                  onPointerDown={e => e.preventDefault()}
                  onClick={() => { handleNameKey(" "); setShiftActive(true); }}
                  className="flex-1 h-[52px] rounded-md bg-muted text-sm font-medium text-foreground hover-elevate active-elevate-2"
                  data-testid="kb-space"
                >
                  {tCC.space}
                </button>
                <button
                  type="button"
                  onPointerDown={e => e.preventDefault()}
                  onClick={handleNameDone}
                  className="h-[52px] px-3 rounded-md bg-muted text-sm font-medium text-foreground hover-elevate active-elevate-2 flex-shrink-0"
                  data-testid="kb-return"
                >
                  {tCC.returnKey}
                </button>
              </div>
            </div>

            <Button
              className="mt-3 w-full bg-green-600 text-white h-[58px] text-base font-semibold rounded-xl"
              onPointerDown={e => e.preventDefault()}
              onClick={handleNameDone}
              disabled={!clientName.trim() || isCreating}
              data-testid="button-name-done"
            >
              {isCreating ? tCC.creating : tCC.done}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dark cx-cal fixed inset-0 z-50 text-foreground" data-testid="choose-client-panel">
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
            <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100" data-testid="button-back-client-lookup">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-base text-gray-900">{tCC.chooseClient}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100" data-testid="button-close-client-lookup">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content fills all remaining height — bottom padding clears the mobile nav bar (56px + safe area) */}
        <div
          className="flex-1 flex flex-col px-4 pt-5 min-h-0 bg-[#161618] md:pb-4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
        >
          {/* Phone number display */}
          <div className={`w-full rounded-2xl bg-white border border-gray-200 shadow-sm py-6 px-4 mb-5 text-center ${shakeClass}`} onAnimationEnd={onShakeEnd}>
            {phoneDigits.length > 0 ? (
              <p className="text-4xl font-bold tracking-widest text-primary" data-testid="text-phone-display">
                {formatPhone(phoneDigits)}
              </p>
            ) : (
              <>
                <p className="text-base font-semibold text-gray-900" data-testid="text-enter-phone">{tCC.enterPhone}</p>
                {walkInsEnabled && (
                  <p className="text-sm text-gray-400 mt-1 flex items-center justify-center gap-1.5">
                    <PersonStanding className="w-4 h-4 inline" /> {tCC.tapWalkIn}
                  </p>
                )}
              </>
            )}
            {isSearching && (
              <p className="text-sm text-primary mt-2 animate-pulse" data-testid="text-searching">{tCC.searching}</p>
            )}
            {invalidNumber && (
              <p className="text-sm text-red-500 mt-2 font-medium" data-testid="text-invalid-phone">Not a valid North America phone number</p>
            )}
          </div>

          {/* Numpad — flex-1 rows fill remaining height equally */}
          <div className={`flex-1 flex flex-col gap-3 min-h-0 ${shakeClass}`} onAnimationEnd={onShakeEnd}>
            {numKeys.map((row, ri) => (
              <div key={ri} className="flex gap-3 flex-1">
                {row.map((key) => {
                  if (key === "walk-in") {
                    return (
                      <button
                        key={key}
                        type="button"
                        onPointerDown={e => e.preventDefault()}
                        onClick={onWalkIn}
                        className="flex-1 rounded-2xl bg-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-300 active:scale-95 transition-all"
                        data-testid="numpad-walkin"
                      >
                        <PersonStanding className="w-7 h-7" />
                      </button>
                    );
                  }
                  if (key === "blank") {
                    return <div key={key} className="flex-1" aria-hidden="true" />;
                  }
                  if (key === "backspace") {
                    return (
                      <button
                        key={key}
                        type="button"
                        onPointerDown={e => e.preventDefault()}
                        onClick={handleBackspace}
                        className="flex-1 rounded-2xl bg-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-300 active:scale-95 transition-all"
                        data-testid="numpad-backspace"
                      >
                        <Delete className="w-7 h-7" />
                      </button>
                    );
                  }
                  return (
                    <button
                      key={key}
                      type="button"
                      onPointerDown={e => e.preventDefault()}
                      onClick={() => handleDigit(key)}
                      className="flex-1 rounded-2xl bg-white text-3xl font-bold text-gray-900 shadow-sm border border-gray-100 hover:bg-gray-50 active:scale-95 transition-all"
                      data-testid={`numpad-${key}`}
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
