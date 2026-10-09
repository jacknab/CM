import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_TIP_PRESETS, MAX_TIP_PRESETS, sanitizeTipPresets } from "@shared/tipPresets";

/** POS Settings → the tip percentages offered at checkout (customer tip screen, staff tip popup, calendar checkout). */
export function TipPresetsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<{ presets: number[] }>({ queryKey: ["/api/tip-presets"] });
  const [values, setValues] = useState<string[]>(DEFAULT_TIP_PRESETS.map(String));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const p = sanitizeTipPresets(data.presets).map(String);
    setValues([...p, ...Array(MAX_TIP_PRESETS - p.length).fill("")]);
  }, [data]);

  const entered = values.map((v) => v.trim()).filter(Boolean);
  const invalid = entered.some((v) => !/^\d{1,3}$/.test(v) || Number(v) < 1 || Number(v) > 100);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/tip-presets", {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ presets: entered.map(Number) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not save");
      await queryClient.invalidateQueries({ queryKey: ["/api/tip-presets"] });
      toast({ title: "Tip presets saved" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Tip presets not saved", description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="tip-presets-card">
      <CardHeader>
        <CardTitle className="text-base">Tip presets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          The tip percentages offered at checkout: on the customer's tip screen, the staff tip popup and the
          calendar checkout. Enter up to {MAX_TIP_PRESETS}; leave a box empty to offer fewer. "No tip" and a custom
          amount are always available.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          {values.map((v, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input inputMode="numeric" value={v} className="w-20 text-center" aria-label={`Tip preset ${i + 1}`} data-testid={`tip-preset-${i}`}
                onChange={(e) => setValues((cur) => cur.map((x, j) => (j === i ? e.target.value.replace(/[^\d]/g, "").slice(0, 3) : x)))} />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          ))}
        </div>
        {invalid && <p className="text-xs text-red-600">Each preset must be a whole number from 1 to 100.</p>}
        <Button onClick={save} disabled={saving || invalid || entered.length === 0} data-testid="tip-presets-save">
          {saving ? "Saving…" : "Save tip presets"}
        </Button>
      </CardContent>
    </Card>
  );
}
