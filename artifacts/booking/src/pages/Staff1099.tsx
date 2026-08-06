import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StaffPortalNav } from "@/components/StaffPortalNav";
import {
  ArrowLeft,
  MapPin,
  Home,
  Building2,
  Globe,
  FileText,
  Check,
  Loader2,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type TaxInfo = {
  mailingAddress1: string;
  mailingAddress2: string;
  mailingCity:     string;
  mailingState:    string;
  mailingZip:      string;
  mailingCountry:  string;
};

// ── Shared styled input row ────────────────────────────────────────────────────

function FieldRow({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Icon className="w-[17px] h-[17px] text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-slate-400 leading-none mb-0.5 uppercase tracking-wide">
          {label}
        </p>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? label}
          autoCorrect="off"
          spellCheck={false}
          className="w-full text-[15px] font-medium text-slate-800 bg-transparent outline-none placeholder:text-slate-300"
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Staff1099() {
  const navigate   = useNavigate();
  const queryClient = useQueryClient();
  const { toast }  = useToast();

  const { data: remote, isLoading } = useQuery<TaxInfo>({
    queryKey: ["/api/staff/me/tax-info"],
    queryFn: async () => {
      const res = await fetch("/api/staff/me/tax-info", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const [addr1,    setAddr1]    = useState("");
  const [addr2,    setAddr2]    = useState("");
  const [city,     setCity]     = useState("");
  const [state,    setState]    = useState("");
  const [zip,      setZip]      = useState("");
  const [country,  setCountry]  = useState("US");

  useEffect(() => {
    if (remote) {
      setAddr1(remote.mailingAddress1 ?? "");
      setAddr2(remote.mailingAddress2 ?? "");
      setCity(remote.mailingCity      ?? "");
      setState(remote.mailingState    ?? "");
      setZip(remote.mailingZip        ?? "");
      setCountry(remote.mailingCountry ?? "US");
    }
  }, [remote]);

  const isDirty =
    remote !== undefined &&
    (addr1   !== (remote.mailingAddress1 ?? "") ||
     addr2   !== (remote.mailingAddress2 ?? "") ||
     city    !== (remote.mailingCity     ?? "") ||
     state   !== (remote.mailingState    ?? "") ||
     zip     !== (remote.mailingZip      ?? "") ||
     country !== (remote.mailingCountry  ?? "US"));

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staff/me/tax-info", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailingAddress1: addr1,
          mailingAddress2: addr2,
          mailingCity:     city,
          mailingState:    state,
          mailingZip:      zip,
          mailingCountry:  country,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any).message ?? "Failed to save");
      }
      return res.json() as Promise<TaxInfo>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/staff/me/tax-info"], updated);
      toast({ title: "Mailing address saved" });
    },
    onError: (err: any) =>
      toast({ title: err.message ?? "Save failed", variant: "destructive" }),
  });

  return (
    <div className="flex flex-col bg-slate-50" style={{ height: "100dvh" }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b">
        <button
          className="w-9 h-9 flex items-center justify-center rounded-full active:bg-slate-100 transition-colors"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-[17px] text-slate-800 leading-tight">1099 Info</h1>
          <p className="text-[11px] text-slate-400 leading-none">Mailing address for tax forms</p>
        </div>
        <FileText className="w-5 h-5 text-slate-300" />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-4">

        {/* Info banner */}
        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-5">
          <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-700 leading-snug">
            This address will be used on your 1099 tax form at the end of the year. Keep it up-to-date to ensure your form is mailed to the right place.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Address fields */}
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 px-1 mb-1.5">
              Mailing Address
            </p>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100 mb-4">
              <FieldRow
                icon={Home}
                label="Street Address"
                value={addr1}
                onChange={setAddr1}
                placeholder="123 Main St"
              />
              <FieldRow
                icon={Building2}
                label="Apt / Suite / Unit"
                value={addr2}
                onChange={setAddr2}
                placeholder="Apt 4B (optional)"
              />
              <FieldRow
                icon={MapPin}
                label="City"
                value={city}
                onChange={setCity}
                placeholder="New York"
              />

              {/* State + ZIP side by side */}
              <div className="flex">
                <div className="flex-1 flex items-center gap-3 px-4 py-3.5 border-r border-slate-100">
                  <MapPin className="w-[17px] h-[17px] text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-slate-400 leading-none mb-0.5 uppercase tracking-wide">State</p>
                    <input
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="NY"
                      maxLength={2}
                      autoCapitalize="characters"
                      className="w-full text-[15px] font-medium text-slate-800 bg-transparent outline-none placeholder:text-slate-300 uppercase"
                    />
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-3 px-4 py-3.5">
                  <MapPin className="w-[17px] h-[17px] text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-slate-400 leading-none mb-0.5 uppercase tracking-wide">ZIP Code</p>
                    <input
                      value={zip}
                      onChange={(e) => setZip(e.target.value)}
                      placeholder="10001"
                      inputMode="numeric"
                      maxLength={10}
                      className="w-full text-[15px] font-medium text-slate-800 bg-transparent outline-none placeholder:text-slate-300"
                    />
                  </div>
                </div>
              </div>

              <FieldRow
                icon={Globe}
                label="Country"
                value={country}
                onChange={setCountry}
                placeholder="US"
              />
            </div>

            {/* Address preview (show when filled) */}
            {(addr1 || city || state || zip) && (
              <div className="bg-white rounded-2xl px-4 py-3.5 mb-4 shadow-sm border border-slate-100">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Preview</p>
                <p className="text-[14px] font-medium text-slate-700 leading-relaxed">
                  {[addr1, addr2].filter(Boolean).join(", ")}
                  {(addr1 || addr2) && <br />}
                  {[city, state, zip].filter(Boolean).join(", ")}
                  {(city || state || zip) && <br />}
                  {country || "US"}
                </p>
              </div>
            )}

            {/* Save button */}
            <button
              disabled={!isDirty || save.isPending}
              onClick={() => save.mutate()}
              className={cn(
                "w-full py-3.5 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all",
                isDirty
                  ? "bg-teal-500 text-white active:bg-teal-600"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed",
              )}
            >
              {save.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Check className="w-4 h-4" />}
              {save.isPending ? "Saving…" : "Save Address"}
            </button>

            {/* Disclaimer */}
            <p className="text-center text-[11px] text-slate-400 mt-4 px-4 leading-relaxed">
              Only your mailing address is collected here. Your salon owner manages other tax details separately.
            </p>
          </>
        )}

      </div>

      <StaffPortalNav />
    </div>
  );
}
