/**
 * Balance checks from the site's footer (owner, 2026-11-09; Solo and Aspen designs). #gift-card-balance: type a gift
 * card's code, see what's left. #package-visits: give your mobile number and the business texts that number the
 * package visits left (routes/siteShop.ts), so no one can look up someone else's. Mounted once, like SiteLegal.
 */
import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { StoreData } from "./types";

type Check = "gift-card-balance" | "package-visits";
const fromHash = (): Check | null => {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.slice(1);
  return h === "gift-card-balance" || h === "package-visits" ? h : null;
};

export default function SiteBalance({ store, slug }: { store: StoreData; slug: string }) {
  const [check, setCheck] = useState<Check | null>(fromHash);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const open = () => { setCheck(fromHash()); setValue(""); setResult(null); setError(null); };
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  if (!check) return null;
  const close = () => { setCheck(null); window.history.replaceState(null, "", window.location.pathname + window.location.search); };
  const gift = check === "gift-card-balance";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch(`/api/public/store/${encodeURIComponent(slug)}/${check}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gift ? { code: value } : { phone: value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? body?.message ?? "Something went wrong. Please try again.");
      if (gift) {
        const money = `$${Number(body.balance ?? 0).toFixed(2)}`;
        setResult(body.expired ? `This gift card has expired.` : body.active === false ? "This gift card is no longer active." : `Balance: ${money}`);
      } else {
        setResult(`If this number has a package with ${store.name}, we've texted it the visits left.`);
      }
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const title = gift ? "Gift card balance" : "Package visits left";
  return (
    <div role="dialog" aria-modal="true" aria-label={title} data-testid="site-balance" className="fixed inset-0 z-[200] overflow-y-auto bg-white text-gray-900">
      <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <span className="truncate text-sm font-semibold">{store.name}</span>
        <button type="button" onClick={close} aria-label="Close" data-testid="site-balance-close" className="grid h-10 w-10 place-items-center"><X className="h-5 w-5" aria-hidden="true" /></button>
      </div>
      <form onSubmit={submit} className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-base text-gray-600">
          {gift ? "Type the code on your gift card." : "Enter your mobile number. We'll text it the visits left on your packages."}
        </p>
        <label className="mt-6 block text-sm font-medium" htmlFor="site-balance-input">{gift ? "Gift card code" : "Mobile number"}</label>
        <input id="site-balance-input" data-testid="site-balance-input" value={value} onChange={(e) => setValue(e.target.value)} required
          inputMode={gift ? "text" : "tel"} autoComplete={gift ? "off" : "tel"} autoCapitalize={gift ? "characters" : "off"}
          placeholder={gift ? "GC-XXXXXXXX" : "(555) 555-5555"}
          className="mt-2 h-12 w-full rounded-xl border border-gray-300 px-4 text-base outline-none focus:border-gray-900" />
        <button type="submit" disabled={busy || !value.trim()} data-testid="site-balance-submit"
          className="mt-4 h-12 w-full rounded-xl bg-gray-900 text-base font-semibold text-white disabled:opacity-50">
          {busy ? "Checking…" : gift ? "Check balance" : "Text me my visits"}
        </button>
        {result ? <p data-testid="site-balance-result" className="mt-5 rounded-xl bg-gray-100 px-4 py-3 text-base font-medium">{result}</p> : null}
        {error ? <p role="alert" className="mt-5 text-base text-red-700">{error}</p> : null}
      </form>
    </div>
  );
}
