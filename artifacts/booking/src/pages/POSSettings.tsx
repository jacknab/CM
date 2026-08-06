import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import { api } from "@shared/routes";
import { ShoppingCart, Percent, Package, Lock, Monitor } from "lucide-react";

// ── Tax category toggle ───────────────────────────────────────────────────────

function TaxToggle({
  taxable,
  onChange,
  disabled,
}: {
  taxable: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`inline-flex rounded-lg border overflow-hidden text-xs font-semibold ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-3 py-1.5 transition-colors ${
          taxable
            ? "bg-teal-600 text-white"
            : "bg-white text-gray-500 hover:bg-gray-50 border-r border-gray-200"
        }`}
      >
        Taxable
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-3 py-1.5 transition-colors ${
          !taxable
            ? "bg-gray-100 text-gray-700"
            : "bg-white text-gray-500 hover:bg-gray-50 border-l border-gray-200"
        }`}
      >
        Exempt
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface TaxRules {
  services: boolean;
  addons: boolean;
  products: boolean;
  giftCards: boolean;
}

export default function POSSettings() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [taxRate, setTaxRate] = useState("");
  const [taxRules, setTaxRules] = useState<TaxRules>({
    services: false,
    addons: false,
    products: true,
    giftCards: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dualScreen, setDualScreen] = useState(false);
  const [dualScreenLoading, setDualScreenLoading] = useState(true);
  const [dualScreenSaving, setDualScreenSaving] = useState(false);
  const [kioskSettingsRaw, setKioskSettingsRaw] = useState<Record<string, unknown>>({});

  useEffect(() => {
    fetch("/api/kiosk-settings", { credentials: "include" })
      .then(r => r.json())
      .then(d => { setKioskSettingsRaw(d); setDualScreen(d.dualScreenMode === true); })
      .catch(() => {})
      .finally(() => setDualScreenLoading(false));
  }, []);

  async function handleSaveDualScreen(val: boolean) {
    setDualScreenSaving(true);
    try {
      await fetch("/api/kiosk-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...kioskSettingsRaw, dualScreenMode: val }),
      });
      setDualScreen(val);
      setKioskSettingsRaw(prev => ({ ...prev, dualScreenMode: val }));
      toast({ title: val ? "Dual Screen POS enabled" : "Dual Screen POS disabled" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setDualScreenSaving(false);
    }
  }

  useEffect(() => {
    if (!selectedStore?.id) return;
    setLoading(true);
    fetch(`/api/pos-settings/${selectedStore.id}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        const rate = parseFloat(d.salesTaxRate ?? "0") * 100;
        // Show the actual saved value, including "0" — previously this blanked
        // the field for a 0% rate, which made a successful save of 0 look like
        // it hadn't persisted at all.
        setTaxRate(rate === 0 ? "0" : rate.toFixed(3).replace(/\.?0+$/, ""));
        setTaxRules({
          services:  d.taxServicesTaxable  ?? false,
          addons:    d.taxAddonsTaxable    ?? false,
          products:  d.taxProductsTaxable  ?? true,
          giftCards: d.taxGiftCardsTaxable ?? false,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedStore?.id]);

  function setRule(key: keyof TaxRules, val: boolean) {
    setTaxRules(prev => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    if (!selectedStore?.id) return;
    const rateDecimal = (parseFloat(taxRate || "0") / 100).toFixed(4);
    setSaving(true);
    try {
      const r = await fetch(`/api/pos-settings/${selectedStore.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesTaxRate:       rateDecimal,
          taxServicesTaxable:  taxRules.services,
          taxAddonsTaxable:    taxRules.addons,
          taxProductsTaxable:  taxRules.products,
          taxGiftCardsTaxable: taxRules.giftCards,
        }),
      });
      if (!r.ok) throw new Error("Failed to save");
      // The checkout screen (POSInterface) reads salesTaxRate off the cached
      // `selectedStore` object from the /api/stores query, not this
      // /api/pos-settings endpoint. Without invalidating that cache, a saved
      // change here (including changing the rate to 0) never reaches
      // checkout until something else happens to refetch stores (e.g. a
      // full page reload) — which looked like "the setting doesn't work".
      await queryClient.invalidateQueries({ queryKey: [api.stores.list.path] });
      toast({ title: "POS settings saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const TAX_ROWS: {
    key: keyof TaxRules;
    label: string;
    description: string;
    locked?: boolean;
  }[] = [
    {
      key: "services",
      label: "Services",
      description: "Haircuts, color, treatments & other bookable services",
    },
    {
      key: "addons",
      label: "Add-ons & upgrades",
      description: "Optional upgrades selected at checkout",
    },
    {
      key: "products",
      label: "Retail products",
      description: "Physical items sold in-store",
    },
    {
      key: "giftCards",
      label: "Gift cards",
      description: "Digital and physical gift cards",
    },
  ];

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <ShoppingCart className="w-7 h-7 text-teal-600" />
            POS Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure your point-of-sale behavior and tax rules.
          </p>
        </div>

        {/* Sales Tax Rate ───────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Percent className="w-4 h-4 text-teal-600" />
              Sales Tax Rate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="taxRate">State / Local Sales Tax Rate (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="taxRate"
                  type="number"
                  step="0.001"
                  min="0"
                  max="30"
                  value={taxRate}
                  onChange={e => setTaxRate(e.target.value)}
                  placeholder="e.g. 8.25"
                  disabled={loading}
                  className="max-w-[180px]"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the combined state + local tax rate for your area. Leave at 0 if you don't charge sales tax.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tax Rules ────────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="w-4 h-4 text-teal-600" />
              Tax Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground mb-4">
              Set whether each sale category is taxable or exempt. Defaults reflect standard industry practice — adjust to match your local tax code.
            </p>

            <div className="divide-y rounded-xl border overflow-hidden">
              {TAX_ROWS.map(row => (
                <div key={row.key} className="flex items-center justify-between gap-4 px-4 py-3.5 bg-white">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{row.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
                  </div>
                  <TaxToggle
                    taxable={taxRules[row.key]}
                    onChange={val => setRule(row.key, val)}
                    disabled={loading}
                  />
                </div>
              ))}

              {/* Tips — always locked exempt */}
              <div className="flex items-center justify-between gap-4 px-4 py-3.5 bg-gray-50/60">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    Tips
                    <Lock className="w-3 h-3 text-gray-400" />
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Gratuity — never subject to sales tax</p>
                </div>
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg border text-xs font-semibold bg-gray-100 text-gray-500 border-gray-200">
                  Always exempt
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleSave}
          disabled={saving || loading}
          className="bg-teal-600 hover:bg-teal-700 text-white"
        >
          {saving ? "Saving…" : "Save Settings"}
        </Button>

        {/* Dual Screen POS ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="w-4 h-4 text-teal-600" />
              Dual Screen POS Mode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Enable when the check-in kiosk is displayed on the customer-facing screen of a dual-display POS system.
              The kiosk will automatically show the customer their cart, a tip selection screen, and a thank-you screen
              — all triggered from the Walk-In Checkout panel.
            </p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Enable Dual Screen Mode</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Also configurable under Check-In Settings → Dual Screen POS.
                </p>
              </div>
              <Switch
                checked={dualScreen}
                disabled={dualScreenLoading || dualScreenSaving}
                onCheckedChange={handleSaveDualScreen}
              />
            </div>
            {dualScreen && (
              <div className="rounded-lg bg-teal-50 border border-teal-100 px-4 py-3 text-sm text-teal-700">
                💡 Open your kiosk URL on the client-facing screen. When you open Walk-In Checkout, the checkout
                flow will appear on the client screen automatically.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
