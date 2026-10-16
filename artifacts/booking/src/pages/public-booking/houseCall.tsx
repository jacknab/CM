/**
 * House calls on the online booking page (Solo plan, plans/solo-work-places-and-approval.md).
 *
 * When the business does house calls, the client says where the visit is and, for a house call, gives
 * their address. The address is checked against the professional's travel radius before any times are
 * shown; the open times then leave travel time free (`visitAt=client`), the flat travel fee is added to
 * the price, and the booking sends the address. Shared by every booking theme.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

type HouseCallStore = { houseCalls?: boolean | null; ownPlace?: string | null; houseCallFee?: string | number | null };
type OfferedAtService = { offeredAt?: string | null };
export type HouseCallAddress = { line1: string; city: string; state: string; postcode: string };

const EMPTY: HouseCallAddress = { line1: "", city: "", state: "", postcode: "" };

export function useHouseCall(store: unknown, slug: string, services: OfferedAtService[]) {
  const s = (store ?? {}) as HouseCallStore;
  const offered = !!s.houseCalls;
  // A business with no place of its own only does house calls; a service done only in one place decides it.
  const fixed: "place" | "client" | null = !offered ? "place"
    : s.ownPlace === "none" ? "client"
    : services.some((x) => x.offeredAt === "client") ? "client"
    : services.some((x) => x.offeredAt === "place") ? "place" : null;
  const [choice, setChoice] = useState<"place" | "client">("place");
  const visitAt = fixed ?? choice;
  const [address, setAddress] = useState<HouseCallAddress>(EMPTY);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState<{ address: HouseCallAddress; travelFee: number } | null>(null);

  // Changing the address means checking it again.
  useEffect(() => { setConfirmed(null); setMessage(""); }, [address.line1, address.city, address.state, address.postcode]);

  const check = async () => {
    setChecking(true);
    setMessage("");
    try {
      const res = await fetch(`/api/public/store/${slug}/house-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) setConfirmed({ address: data.address, travelFee: Number(data.travelFee) || 0 });
      else setMessage(data.message || "We couldn't check that address. Please try again.");
    } catch {
      setMessage("We couldn't check that address. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  const houseCall = visitAt === "client";
  return useMemo(() => ({
    offered,
    ownPlace: s.ownPlace ?? "salon",
    showChoice: offered && fixed === null,
    visitAt,
    setChoice,
    address,
    setAddress,
    check,
    checking,
    message,
    /** Times can be shown: a visit at the professional's place, or a house call whose address is in range. */
    ready: !houseCall || !!confirmed,
    travelFee: houseCall && confirmed ? confirmed.travelFee : 0,
    /** Changes whenever the open times have to be fetched again. */
    timesKey: houseCall ? `client:${confirmed ? JSON.stringify(confirmed.address) : ""}` : "place",
    applyParams(params: URLSearchParams) { if (houseCall) params.set("visitAt", "client"); },
    bookFields: houseCall && confirmed ? { visitAt: "client" as const, clientAddress: confirmed.address }
      : offered ? { visitAt: "place" as const } : {},
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [offered, s.ownPlace, fixed, visitAt, address, checking, message, confirmed, houseCall]);
}

export type HouseCall = ReturnType<typeof useHouseCall>;

/** Where the visit is, and the client's address for a house call. Renders nothing for other businesses. */
export function HouseCallFields({ hc, className = "" }: { hc: HouseCall; className?: string }) {
  if (!hc.offered) return null;
  const input = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10";
  const set = (field: keyof HouseCallAddress) => (e: React.ChangeEvent<HTMLInputElement>) => hc.setAddress({ ...hc.address, [field]: e.target.value });
  return (
    <div className={`space-y-3 ${className}`} data-testid="house-call-fields">
      {hc.showChoice && (
        <div className="grid grid-cols-2 gap-2">
          {([["place", hc.ownPlace === "home" ? "At the studio" : "At the salon"], ["client", "At my home"]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => hc.setChoice(value)}
              data-testid={`visit-at-${value}`}
              className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${hc.visitAt === value ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-900 hover:border-gray-400"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {hc.visitAt === "client" && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900">Where should we come?</p>
          <input className={input} placeholder="Street address" autoComplete="address-line1" value={hc.address.line1} onChange={set("line1")} data-testid="house-call-line1" />
          <input className={input} placeholder="City" autoComplete="address-level2" value={hc.address.city} onChange={set("city")} data-testid="house-call-city" />
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder="State (e.g. NY)" maxLength={2} autoComplete="address-level1" value={hc.address.state} onChange={set("state")} data-testid="house-call-state" />
            <input className={input} placeholder="ZIP code" inputMode="numeric" maxLength={10} autoComplete="postal-code" value={hc.address.postcode} onChange={set("postcode")} data-testid="house-call-zip" />
          </div>
          {hc.ready ? (
            <p className="text-sm text-gray-600">
              {hc.travelFee > 0 ? `We come to you. A $${hc.travelFee.toFixed(2)} travel fee is added.` : "We come to you."}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void hc.check()}
              disabled={hc.checking}
              data-testid="house-call-check"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {hc.checking && <Loader2 className="h-4 w-4 animate-spin" />}
              {hc.checking ? "Checking…" : "Show open times"}
            </button>
          )}
          {hc.message && <p className="text-sm text-red-600">{hc.message}</p>}
        </div>
      )}
    </div>
  );
}
