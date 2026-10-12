import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { CardProvider } from "@/hooks/use-card-provider";

const OPTIONS: { value: CardProvider; label: string; detail: string }[] = [
  { value: "stripe", label: "Stripe", detail: "The CARD button charges the card on the Certxa card reader." },
  { value: "own", label: "Own Provider", detail: "You take the card on your own terminal. The CARD button only records the payment as card: nothing is charged by Certxa and nothing is shown on the customer screen." },
];

/** POS Settings → what the CARD button at checkout does. */
export function CardProviderCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<{ provider: CardProvider }>({ queryKey: ["/api/card-provider"] });
  const [saving, setSaving] = useState(false);
  const current = data?.provider ?? "stripe";

  const choose = async (provider: CardProvider) => {
    if (provider === current || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/card-provider", {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not save");
      await queryClient.invalidateQueries({ queryKey: ["/api/card-provider"] });
      toast({ title: "Card button saved" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Card button not saved", description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="card-provider-card">
      <CardHeader>
        <CardTitle className="text-base">CARD button</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {OPTIONS.map((o) => (
          <label key={o.value} className="flex items-start gap-3 cursor-pointer">
            <input type="radio" name="card-provider" className="mt-1" checked={current === o.value} disabled={saving}
              onChange={() => choose(o.value)} data-testid={`card-provider-${o.value}`} />
            <span>
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.detail}</span>
            </span>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
