/**
 * Solo plan: where the professional sees clients — their own place (a salon/suite/booth with a public
 * address, a home studio whose address stays private, or none) and house calls (how far, a flat travel
 * fee, travel time). Same settings as the Certxa Pro app's; saved through /api/work-places
 * (plans/solo-work-places-and-approval.md).
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { apiRequest, queryClient } from "@/lib/queryClient";

type OwnPlace = "salon" | "home" | "none";
type WorkPlaces = {
  eligible: boolean;
  ownPlace: OwnPlace;
  houseCalls: boolean;
  houseCallRadiusMiles: number;
  houseCallFee: number;
  houseCallTravelMinutes: number;
};

const PLACES: { value: OwnPlace; label: string; help: string }[] = [
  { value: "salon", label: "Salon, suite or booth", help: "Clients see your address on your booking website." },
  { value: "home", label: "Home studio", help: "Your address stays private. Clients see your city only, and get the full address once they have booked." },
  { value: "none", label: "None", help: "You only see clients at their place." },
];

function Choice<T extends string | number>({ value, options, onChange, testId }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn("rounded-lg border px-3 py-2 text-sm font-medium", value === o.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}
          data-testid={`${testId}-${o.value}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const withCurrent = (values: number[], current: number) => (values.includes(current) ? values : [...values, current].sort((a, b) => a - b));

export default function WorkPlacesSettings() {
  const { toast } = useToast();
  const { selectedStore } = useSelectedStore();
  const key = ["/api/work-places", selectedStore?.id];
  const { data, isLoading } = useQuery<WorkPlaces>({
    queryKey: key,
    // Its own fetch: the default one joins the whole key into the address (/api/work-places/<store id>).
    queryFn: async () => (await apiRequest("GET", "/api/work-places")).json(),
    enabled: !!selectedStore?.id,
  });
  const [draft, setDraft] = useState<WorkPlaces | null>(null);
  const [fee, setFee] = useState("0");
  useEffect(() => { if (data) { setDraft(data); setFee(String(data.houseCallFee ?? 0)); } }, [data]);

  const save = useMutation({
    mutationFn: async (next: WorkPlaces) => (await apiRequest("PUT", "/api/work-places", {
      ownPlace: next.ownPlace, houseCalls: next.houseCalls, houseCallRadiusMiles: next.houseCallRadiusMiles,
      houseCallFee: Number(fee.replace(/[^0-9.]/g, "") || 0), houseCallTravelMinutes: next.houseCallTravelMinutes,
    })).json(),
    onSuccess: (saved) => { queryClient.setQueryData(key, saved); toast({ title: "Saved" }); },
    onError: (err: any) => toast({ title: err?.message?.replace(/^\d+:\s*/, "") || "Couldn't save", variant: "destructive" }),
  });

  if (isLoading || !draft) {
    return <AppLayout><div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" /></div></AppLayout>;
  }
  if (!draft.eligible) {
    return <AppLayout><p className="text-sm text-muted-foreground">Where you see clients is part of the Solo plan.</p></AppLayout>;
  }
  const set = (patch: Partial<WorkPlaces>) => setDraft({ ...draft, ...patch });
  const place = PLACES.find((p) => p.value === draft.ownPlace) ?? PLACES[0];
  const invalid = draft.ownPlace === "none" && !draft.houseCalls;

  return (
    <AppLayout>
      <div className="max-w-2xl space-y-6">
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold">Your place</h2>
          <Choice value={draft.ownPlace} options={PLACES} onChange={(ownPlace) => set({ ownPlace })} testId="work-place" />
          <p className="text-sm text-muted-foreground">{place.help}</p>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[15px] font-medium">House calls</p>
              <p className="text-sm text-muted-foreground">You go to your clients.</p>
            </div>
            <Switch checked={draft.houseCalls} onCheckedChange={(houseCalls) => set({ houseCalls })} data-testid="switch-house-calls" />
          </div>
          {draft.houseCalls && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">How far you travel</p>
                <Choice value={draft.houseCallRadiusMiles} options={withCurrent([5, 10, 15, 25, 40], draft.houseCallRadiusMiles).map((m) => ({ value: m, label: `${m} miles` }))} onChange={(houseCallRadiusMiles) => set({ houseCallRadiusMiles })} testId="house-call-radius" />
                <p className="text-sm text-muted-foreground">Measured from your business address. Clients further away can't book a house call online.</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Travel fee</p>
                <div className="flex items-center gap-2"><span className="text-sm">$</span><Input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className="w-28" data-testid="input-house-call-fee" /></div>
                <p className="text-sm text-muted-foreground">Added to every house call. Leave it at 0 for no fee.</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Travel time</p>
                <Choice value={draft.houseCallTravelMinutes} options={withCurrent([0, 10, 15, 30, 45], draft.houseCallTravelMinutes).map((m) => ({ value: m, label: m ? `${m} min` : "None" }))} onChange={(houseCallTravelMinutes) => set({ houseCallTravelMinutes })} testId="house-call-travel" />
                <p className="text-sm text-muted-foreground">Kept free on your calendar before and after each house call.</p>
              </div>
            </div>
          )}
        </section>

        {invalid && <p className="text-sm text-destructive">Choose where you see clients: your own place, house calls, or both.</p>}
        <Button disabled={invalid || save.isPending} onClick={() => save.mutate(draft)} data-testid="button-save-work-places">
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </AppLayout>
  );
}
