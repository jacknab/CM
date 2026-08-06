import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  useListWebsites, useDeleteWebsite, usePublishWebsite, useUnpublishWebsite,
  useListTemplates, useListPurchasedSubdomains, usePurchaseSubdomain,
  useVerifySubdomainPurchase, useAssignDomain,
  getListWebsitesQueryKey, getListPurchasedSubdomainsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Globe, Settings, ExternalLink, Trash2, LayoutTemplate,
  ArrowRightLeft, Radio, Database, Palette, Zap, Clock, Scissors,
  Phone, CalendarCheck, Store, ChevronDown, ShoppingCart, Check,
  X, Loader2,
} from "lucide-react";
import { format } from "date-fns";

const MAX_WEBSITES = 5;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$|^[a-z0-9]{2,63}$/;

// ── Buy Subdomain Dialog ──────────────────────────────────────────────────────
function BuySubdomainDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<{ available: boolean; reason?: string | null } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const purchaseMutation = usePurchaseSubdomain();
  const { toast } = useToast();

  const subdomain = value.toLowerCase().replace(/[^a-z0-9-]/g, "");

  useEffect(() => {
    if (!subdomain || subdomain.length < 2) {
      setAvailability(null);
      return;
    }
    if (!SLUG_PATTERN.test(subdomain)) {
      setAvailability({ available: false, reason: "Only lowercase letters, numbers, and hyphens" });
      return;
    }
    setChecking(true);
    setAvailability(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/subdomains/check?subdomain=${encodeURIComponent(subdomain)}`);
        const data = await res.json() as { available: boolean; reason?: string | null };
        setAvailability(data);
      } catch {
        setAvailability(null);
      } finally {
        setChecking(false);
      }
    }, 500);
  }, [subdomain]);

  const handlePurchase = () => {
    if (!availability?.available) return;
    purchaseMutation.mutate(
      { data: { subdomain } },
      {
        onSuccess: (result) => {
          if (result.checkoutUrl) {
            window.location.href = result.checkoutUrl;
          } else {
            toast({ title: "Something went wrong", description: "No checkout URL returned" });
          }
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Error",
            description: (err?.data as { error?: string })?.error || err?.message || "Failed to start purchase",
          });
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-bold text-[#3B0764]">Buy a Subdomain</h2>
            <p className="text-sm text-gray-500 mt-1">Add another .certxa.com address to your account</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Price badge */}
        <div className="flex items-center gap-3 bg-[#3B0764]/5 border border-[#3B0764]/10 rounded-xl px-4 py-3">
          <ShoppingCart className="w-5 h-5 text-[#3B0764] shrink-0" />
          <div>
            <p className="text-sm font-bold text-[#3B0764]">$10 / year</p>
            <p className="text-xs text-gray-500">Billed annually. Assign to any of your websites.</p>
          </div>
        </div>

        {/* Input */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-700">Choose your subdomain</label>
          <div className="flex items-center gap-0">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. glamour-nails"
              className="rounded-r-none border-r-0 font-mono lowercase"
              autoFocus
            />
            <div className="flex items-center h-10 px-3 bg-gray-50 border border-l-0 border-gray-200 rounded-r-lg text-sm text-gray-500 font-mono whitespace-nowrap">
              .certxa.com
            </div>
          </div>
          {/* Availability feedback */}
          <div className="h-5 flex items-center gap-1.5">
            {checking && <><Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" /><span className="text-xs text-gray-400">Checking availability…</span></>}
            {!checking && availability?.available && (
              <><Check className="w-3.5 h-3.5 text-green-500" /><span className="text-xs text-green-600 font-medium">{subdomain}.certxa.com is available!</span></>
            )}
            {!checking && availability && !availability.available && (
              <><X className="w-3.5 h-3.5 text-red-400" /><span className="text-xs text-red-500">{availability.reason ?? "Not available"}</span></>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">
            Cancel
          </Button>
          <Button
            className="flex-1 rounded-xl bg-[#1A0333] hover:bg-[#2b0554] text-white"
            onClick={handlePurchase}
            disabled={!availability?.available || purchaseMutation.isPending}
          >
            {purchaseMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Redirecting…</>
            ) : (
              <><ShoppingCart className="w-4 h-4 mr-2" />Pay & Activate — $10/yr</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Domain Selector ───────────────────────────────────────────────────────────
function DomainSelector({
  website,
  activeSubdomains,
  onBuyClick,
}: {
  website: {
    id: number;
    slug: string;
    assignedSubdomain?: string | null;
    customDomain?: string | null;
    customDomainStatus?: string | null;
  };
  activeSubdomains: { id: number; subdomain: string }[];
  onBuyClick: () => void;
}) {
  const assignDomain = useAssignDomain();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const customDomainActive = website.customDomainStatus === "active" && website.customDomain;

  // Current value: "__custom__" | subdomain string | "" (default slug)
  const currentValue = customDomainActive
    ? "__custom__"
    : (website.assignedSubdomain ?? "");

  const handleChange = (val: string) => {
    if (val === "__custom__" || val === currentValue) return;
    const newSubdomain = val === "" ? null : val;
    assignDomain.mutate(
      { id: website.id, data: { assignedSubdomain: newSubdomain } },
      {
        onSuccess: () => {
          toast({
            title: "Domain updated",
            description: newSubdomain
              ? `${newSubdomain}.certxa.com is now assigned to this website.`
              : `Reverted to ${website.slug}.certxa.com.`,
          });
          queryClient.invalidateQueries({ queryKey: getListWebsitesQueryKey() });
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Error",
            description: (err?.data as { error?: string })?.error || err?.message || "Failed to assign domain",
          });
        },
      }
    );
  };

  const effectiveDisplay = customDomainActive
    ? website.customDomain!
    : `${website.assignedSubdomain ?? website.slug}.certxa.com`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Domain</span>
        {assignDomain.isPending && <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />}
      </div>
      <div className="relative">
        <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#3B0764] pointer-events-none" />
        <select
          value={currentValue}
          onChange={(e) => handleChange(e.target.value)}
          disabled={assignDomain.isPending}
          className="w-full pl-7 pr-8 py-1.5 text-xs font-mono text-[#3B0764] bg-[#3B0764]/5 border border-[#3B0764]/15 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3B0764]/30 disabled:opacity-60"
        >
          {/* Default: own slug */}
          <option value="">{website.slug}.certxa.com (default)</option>

          {/* Purchased subdomains */}
          {activeSubdomains.map((sd) => (
            <option key={sd.id} value={sd.subdomain}>
              {sd.subdomain}.certxa.com (purchased)
            </option>
          ))}

          {/* Custom BYOD domain */}
          {customDomainActive && (
            <option value="__custom__">{website.customDomain} (custom domain)</option>
          )}

          {/* Buy new */}
          <option value="__buy__" disabled style={{ color: "#C97B2B", fontWeight: 600 }}>
            ──────────────────
          </option>
          <option value="__buy__" disabled style={{ color: "#C97B2B", fontWeight: 600 }}>
            + Buy new subdomain — $10/yr
          </option>
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#3B0764] pointer-events-none" />
      </div>

      {/* Buy link below the select */}
      <button
        onClick={onBuyClick}
        className="text-[10px] text-[#C97B2B] font-semibold hover:underline text-left"
      >
        + Buy another subdomain — $10/yr
      </button>

      {/* Live URL indicator */}
      <a
        href={`http://${effectiveDisplay}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-[#3B0764] group truncate"
      >
        <ExternalLink className="w-2.5 h-2.5 shrink-0 group-hover:text-[#3B0764]" />
        <span className="truncate">{effectiveDisplay}</span>
      </a>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Websites() {
  const [, navigate] = useLocation();
  const [showBuyDialog, setShowBuyDialog] = useState(false);
  const { data: rawWebsites, isLoading } = useListWebsites();
  const { data: templates } = useListTemplates();
  // Server already filters websites to the session user's store — no client-side filtering needed
  const websites = rawWebsites;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Purchased subdomains for the session store (storeid resolved server-side)
  const { data: purchasedSubdomains, refetch: refetchSubdomains } = useListPurchasedSubdomains(
    {},
    { query: { queryKey: getListPurchasedSubdomainsQueryKey({}), enabled: true } }
  );
  const activeSubdomains = purchasedSubdomains?.filter((s) => s.status === "active") ?? [];

  const verifyMutation = useVerifySubdomainPurchase();

  // ── Handle Stripe redirect-back ─────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("subdomain_session_id");
    if (!sessionId) return;

    // Clean URL immediately
    window.history.replaceState({}, document.title, window.location.pathname);

    verifyMutation.mutate(
      { data: { sessionId } },
      {
        onSuccess: (result) => {
          toast({
            title: "Subdomain activated!",
            description: `${result.subdomain}.certxa.com is now yours. Assign it to any website below.`,
          });
          void refetchSubdomains();
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Verification failed",
            description: "Could not activate your subdomain. Contact support if payment was taken.",
          });
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteWebsite = useDeleteWebsite();
  const publishWebsite = usePublishWebsite();
  const unpublishWebsite = useUnpublishWebsite();

  const count = websites?.length ?? 0;
  const atLimit = count >= MAX_WEBSITES;
  const liveWebsite = websites?.find(w => w.published);

  const thumbMap = new Map<number, string | null>();
  templates?.forEach(t => thumbMap.set(t.id, t.thumbnail ?? null));

  const handleSwitch = (id: number, name: string) => {
    publishWebsite.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Template switched", description: `${name} is now your live site.` });
        queryClient.invalidateQueries({ queryKey: getListWebsitesQueryKey() });
      },
      onError: (err) => toast({
        variant: "destructive",
        title: "Error",
        description: (err?.data as { error?: string })?.error || err?.message || "Failed to publish",
      }),
    });
  };

  const handleTakeOffline = (id: number, name: string) => {
    unpublishWebsite.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Taken offline", description: `${name} is no longer live.` });
        queryClient.invalidateQueries({ queryKey: getListWebsitesQueryKey() });
      },
      onError: (err) => toast({
        variant: "destructive",
        title: "Error",
        description: (err?.data as { error?: string })?.error || err?.message || "Failed to unpublish",
      }),
    });
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    deleteWebsite.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Website deleted" });
        queryClient.invalidateQueries({ queryKey: getListWebsitesQueryKey() });
      },
      onError: (err) => toast({
        variant: "destructive",
        title: "Error",
        description: (err?.data as { error?: string })?.error || err?.message || "Failed to delete",
      }),
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12 flex flex-col gap-10">

      {/* Buy Subdomain Dialog */}
      {showBuyDialog && (
        <BuySubdomainDialog
          onClose={() => setShowBuyDialog(false)}
          onSuccess={() => {
            setShowBuyDialog(false);
            void refetchSubdomains();
          }}
        />
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="font-serif text-4xl lg:text-5xl font-bold text-[#3B0764] mb-3">My Websites</h1>
          <p className="text-gray-600 text-lg">
            One live site at a time — swap between templates instantly.
          </p>
        </div>

        <div className="flex flex-col items-end gap-3">
          {!isLoading && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Templates used</span>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {Array.from({ length: MAX_WEBSITES }).map((_, i) => (
                    <div key={i} className={`w-5 h-2 rounded-full transition-colors ${i < count ? 'bg-[#3B0764]' : 'bg-gray-200'}`} />
                  ))}
                </div>
                <span className={`text-sm font-bold ${atLimit ? 'text-red-500' : 'text-gray-700'}`}>{count} / {MAX_WEBSITES}</span>
              </div>
              {atLimit && <span className="text-xs text-red-500 font-medium">Limit reached</span>}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="rounded-full border-[#C97B2B]/40 text-[#C97B2B] hover:bg-[#C97B2B]/5 hover:border-[#C97B2B] h-11 px-5 text-sm font-semibold"
              onClick={() => setShowBuyDialog(true)}
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Buy Subdomain
            </Button>
            <Link href="/websites/new">
              <Button
                className="rounded-full bg-[#1A0333] hover:bg-[#2b0554] text-white shadow-[0px_8px_32px_0px_rgba(201,123,43,0.25)] h-11 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={atLimit}
                title={atLimit ? "Upgrade your plan to create more websites" : undefined}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Website
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Purchased subdomains banner (if any owned) */}
      {activeSubdomains.length > 0 && (
        <div className="rounded-xl border border-[#C97B2B]/20 bg-[#C97B2B]/5 px-5 py-3 flex items-center gap-3">
          <Globe className="w-4 h-4 text-[#C97B2B] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#C97B2B]">
              You own {activeSubdomains.length} additional subdomain{activeSubdomains.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {activeSubdomains.map(s => `${s.subdomain}.certxa.com`).join(" · ")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-[#C97B2B] hover:bg-[#C97B2B]/10 text-xs shrink-0"
            onClick={() => setShowBuyDialog(true)}
          >
            + Add more
          </Button>
        </div>
      )}

      {/* How it works — auto-data explainer */}
      {!isLoading && (
        <div className="rounded-2xl border border-[#3B0764]/10 bg-gradient-to-br from-[#3B0764]/5 to-[#C97B2B]/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-[#C97B2B]" />
            <p className="text-sm font-bold text-[#3B0764] uppercase tracking-wider">How your website is built for you</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[#3B0764] text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-[#3B0764]" /> SalonOS syncs your data</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { icon: Store, label: "Name & address" },
                    { icon: Phone, label: "Phone & email" },
                    { icon: Clock, label: "Business hours" },
                    { icon: Scissors, label: "Services & prices" },
                    { icon: CalendarCheck, label: "Booking link" },
                  ].map(({ icon: Icon, label }) => (
                    <span key={label} className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-[#3B0764]/15 text-[#3B0764] px-2 py-0.5 rounded-full">
                      <Icon className="w-2.5 h-2.5" />{label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[#3B0764] text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-1.5"><Palette className="w-3.5 h-3.5 text-[#3B0764]" /> You pick a template</p>
                <p className="text-xs text-gray-500 leading-relaxed">Choose a design that fits your brand. Your real data automatically fills in — no manual entry needed.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[#C97B2B] text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-[#C97B2B]" /> Your website goes live</p>
                <p className="text-xs text-gray-500 leading-relaxed">Publish in one click. Switch templates any time — your data re-fills the new design instantly.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-96 rounded-2xl" />)}
        </div>
      ) : !websites || websites.length === 0 ? (
        <div className="rounded-3xl border-dashed border-2 border-gray-200 bg-gray-50 flex flex-col items-center justify-center py-24 text-center">
          <Globe className="w-16 h-16 text-gray-300 mb-6" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">No websites yet</h3>
          <p className="text-gray-500 mb-8 max-w-md">
            Create your first website to get started. Build up to {MAX_WEBSITES} different designs and switch your live site between them instantly — all on your one subdomain.
          </p>
          <Link href="/websites/new">
            <Button className="rounded-full bg-[#1A0333] hover:bg-[#2b0554] text-white h-12 px-8">
              Create First Website
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {websites.map((website) => {
            const isLive = website.published;
            const thumb = website.templateId != null ? thumbMap.get(website.templateId) ?? null : null;
            const hasOtherLive = liveWebsite && liveWebsite.id !== website.id;

            return (
              <div
                key={website.id}
                className={`rounded-2xl overflow-hidden flex flex-col bg-white transition-shadow hover:shadow-lg ${
                  isLive
                    ? 'border-2 border-green-400 shadow-[0_0_0_4px_rgba(74,222,128,0.12)]'
                    : 'border border-gray-100 shadow-sm'
                }`}
              >
                {/* Thumbnail */}
                <div className="relative aspect-[16/9] bg-gray-100 overflow-hidden shrink-0">
                  {thumb ? (
                    <img src={thumb} alt={website.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <LayoutTemplate className="w-10 h-10 text-gray-300" />
                    </div>
                  )}
                  {isLive && (
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                      </span>
                      LIVE
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-5 flex-1 flex flex-col gap-4">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 leading-tight truncate">{website.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Created {format(new Date(website.createdAt), 'MMM d, yyyy')}</p>
                  </div>

                  {/* Domain selector */}
                  <DomainSelector
                    website={website}
                    activeSubdomains={activeSubdomains}
                    onBuyClick={() => setShowBuyDialog(true)}
                  />

                  {/* Switch / Live button */}
                  {isLive ? (
                    <div className="mt-auto flex flex-col gap-2">
                      <div className="flex items-center justify-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm font-semibold">
                        <Radio className="w-4 h-4" />
                        Currently Live
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/websites/${website.id}/edit`} className="flex-1">
                          <Button variant="outline" className="w-full rounded-xl border-gray-200 text-gray-700 hover:text-[#3B0764] text-xs h-9">
                            <Settings className="w-3.5 h-3.5 mr-1.5" />
                            Edit
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-xl text-amber-600 hover:text-amber-700 hover:bg-amber-50 text-xs h-9 px-3"
                          onClick={() => handleTakeOffline(website.id, website.name)}
                          disabled={unpublishWebsite.isPending}
                        >
                          Take Offline
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-xl text-gray-300 hover:text-red-400 hover:bg-red-50 h-9 w-9"
                          onClick={() => handleDelete(website.id, website.name)}
                          disabled={deleteWebsite.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-auto flex flex-col gap-2">
                      <Button
                        className="w-full rounded-xl h-10 text-sm font-semibold gap-2 bg-[#1A0333] hover:bg-[#2b0554] text-white shadow-[0px_4px_16px_0px_rgba(201,123,43,0.20)]"
                        onClick={() => handleSwitch(website.id, website.name)}
                        disabled={publishWebsite.isPending}
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                        {hasOtherLive ? "Switch to This Template" : "Set as Live Site"}
                      </Button>
                      <div className="flex gap-2">
                        <Link href={`/websites/${website.id}/edit`} className="flex-1">
                          <Button variant="outline" className="w-full rounded-xl border-gray-200 text-gray-700 hover:text-[#3B0764] text-xs h-9">
                            <Settings className="w-3.5 h-3.5 mr-1.5" />
                            Edit
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-xl text-gray-300 hover:text-red-400 hover:bg-red-50 h-9 w-9"
                          onClick={() => handleDelete(website.id, website.name)}
                          disabled={deleteWebsite.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && websites && websites.length > 0 && (
        <p className="text-center text-sm text-gray-400">
          You can create up to <strong>{MAX_WEBSITES} website templates</strong> and have{' '}
          <strong>1 live at a time</strong>. Switch your live site instantly — no rebuild needed.
        </p>
      )}
    </div>
  );
}
