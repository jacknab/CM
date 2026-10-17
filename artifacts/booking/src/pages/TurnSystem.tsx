import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListOrdered, Save } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { confirm } from "@/lib/confirm";
import { formatInTz } from "@/lib/timezone";
import {
  DEFAULT_BRACKETS, SKIP_REASON_LABEL, TURN_MODES, TURN_PRESETS, TURN_UNIT, formatTurns, isDollarMode, normalizeTurnRules, turnUnits,
  type SkipReason, type TurnBracket, type TurnMode,
} from "@shared/turnRules";

type TurnSettings = {
  turnEnabled: boolean;
  autoAdvanceOnCheckout: boolean;
  turnValueThreshold: number;
  appointmentExclusionWindowMinutes: number;
  /** Which turn method the salon runs (shared/turnRules.ts). */
  turnMode: TurnMode;
  /** Dollar-Based Turns: what a ticket under the dollars-per-turn amount earns. */
  partialTurnValue: number;
  turnBrackets: TurnBracket[];
  turnBoundary: "at_or_over" | "over";
  turnAmountBasis: "service" | "service_after_discount";
  turnTieBreak: "longest_waiting" | "clock_in_order";
  turnSkipLosesTurn: SkipReason[];
  turnResetPeriod: "business_day" | "day_close" | "continuous";
  turnLateJoin: "zero" | "level";
  turnRefundPolicy: "keep" | "remove";
  turnCategoryRotation: boolean;
  turnOverrideUsesTurn: boolean;
  turnOverrideReasonRequired: boolean;
};

/** Longer explanations than the one-line labels in shared/turnRules.ts, for the owner choosing a method. */
const METHOD_HELP: Record<TurnMode, string> = {
  round_robin: "Technicians take walk-ins one after another, always in the same order. A $15 ticket and a $90 ticket both use one turn.",
  client_count: "Every finished, paid ticket counts as one client, whatever it cost. The technician who has served the fewest clients is next.",
  classic: "Each ticket at or over the turn value is one turn. A smaller ticket earns nothing and keeps the technician at the front of the line.",
  dollar: "Each ticket earns turns by its service amount. The technician with the lowest total is next — nobody gets the next client just for finishing first.",
  brackets: "You list the amounts and what each one earns, for example under $30 is half a turn, $30 is one turn, $60 is two. The technician with the lowest total is next.",
  proportional: "Every dollar earns its share of a turn. At $30 a turn, a $45 ticket earns 1½ turns. The technician with the lowest total is next.",
};

/** Reasons a technician can be passed over while still in the line. */
const PASSED_REASONS: SkipReason[] = ["paused", "appointment_within_exclusion_window", "service_not_supported"];
/** The ticket amounts shown in the preview: the awkward ones around a $30 and a $60 line. */
const PREVIEW_AMOUNTS = [15, 29.99, 30, 30.01, 45, 60, 60.01, 100];

const DEFAULT_SETTINGS: TurnSettings = {
  turnEnabled: true,
  autoAdvanceOnCheckout: true,
  turnValueThreshold: 25,
  appointmentExclusionWindowMinutes: 20,
  turnMode: "classic",
  partialTurnValue: 0.5,
  turnBrackets: DEFAULT_BRACKETS,
  turnBoundary: "at_or_over",
  turnAmountBasis: "service",
  turnTieBreak: "longest_waiting",
  turnSkipLosesTurn: [],
  turnResetPeriod: "business_day",
  turnLateJoin: "zero",
  turnRefundPolicy: "keep",
  turnCategoryRotation: false,
  turnOverrideUsesTurn: false,
  turnOverrideReasonRequired: false,
};

/** Saved settings as the page's state: every rule read through the same normaliser the server uses. */
function fromServer(data: Partial<TurnSettings> & Record<string, unknown>): TurnSettings {
  const rules = normalizeTurnRules(data);
  return {
    ...DEFAULT_SETTINGS,
    turnEnabled: data.turnEnabled !== false,
    autoAdvanceOnCheckout: data.autoAdvanceOnCheckout !== false,
    turnValueThreshold: Number(data.turnValueThreshold ?? 25),
    appointmentExclusionWindowMinutes: Number(data.appointmentExclusionWindowMinutes ?? 20),
    turnMode: rules.mode,
    partialTurnValue: rules.partialTurnValue,
    turnBrackets: rules.brackets ?? DEFAULT_BRACKETS,
    turnBoundary: rules.boundary ?? "at_or_over",
    turnAmountBasis: rules.amountBasis ?? "service",
    turnTieBreak: rules.tieBreak ?? "longest_waiting",
    turnSkipLosesTurn: rules.skipLosesTurn ?? [],
    turnResetPeriod: rules.resetPeriod ?? "business_day",
    turnLateJoin: rules.lateJoin ?? "zero",
    turnRefundPolicy: rules.refundPolicy ?? "keep",
    turnCategoryRotation: rules.categoryRotation === true,
    turnOverrideUsesTurn: data.turnOverrideUsesTurn === true,
    turnOverrideReasonRequired: data.turnOverrideReasonRequired === true,
  };
}

type TurnEvent = {
  id: number; at: string; kind: "assigned" | "passed" | "credited" | "adjusted" | "config_changed";
  staffName: string | null; ticketNumber: number | null; category: string | null;
  amountCents: number | null; turnUnits: number | null; method: string | null; automatic: boolean;
  reason: string | null; explanation: string | null;
};

/** One history row in a sentence. */
function eventText(e: TurnEvent): string {
  const ticket = e.ticketNumber ? ` (ticket #${e.ticketNumber})` : "";
  if (e.kind === "assigned") return `${e.explanation ?? `${e.staffName ?? "A technician"} was given the client.`}${ticket}`;
  if (e.kind === "passed") return e.explanation ?? `${e.staffName ?? "A technician"} was passed over.`;
  if (e.kind === "config_changed") return e.explanation ?? "The turn rules were changed.";
  if (e.kind === "credited") {
    const who = e.staffName ?? "A technician";
    const amount = e.amountCents != null ? ` Service $${(e.amountCents / 100).toFixed(2)}.` : "";
    if (e.reason) return `${who}${ticket}: ${e.reason}`;
    if (e.method === "round_robin") return `${who} finished${ticket}.${amount}`;
    const earned = e.turnUnits ?? 0;
    const what = e.method === "client_count" ? (earned > 0 ? "1 client counted" : "no client counted") : `${formatTurns(earned)} ${earned === TURN_UNIT ? "turn" : "turns"} earned`;
    return `${who} finished${ticket}.${amount} ${what[0].toUpperCase()}${what.slice(1)}.`;
  }
  return e.explanation ?? "";
}

export default function TurnSystem() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<TurnSettings>(DEFAULT_SETTINGS);

  const settingsQuery = useQuery<TurnSettings>({
    queryKey: ["/api/turn/settings", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/turn/settings?storeId=${selectedStore?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load turn settings");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  useEffect(() => {
    if (settingsQuery.data) setSettings(fromServer(settingsQuery.data as any));
  }, [settingsQuery.data]);

  // The rules exactly as the server will read them, for the preview.
  const rules = normalizeTurnRules(settings as unknown as Record<string, unknown>);
  const dollarMethod = isDollarMode(settings.turnMode);
  const savedMode = settingsQuery.data ? normalizeTurnRules(settingsQuery.data as any).mode : settings.turnMode;
  const savedPerCategory = settingsQuery.data ? normalizeTurnRules(settingsQuery.data as any).categoryRotation === true : settings.turnCategoryRotation;
  const timezone = selectedStore?.timezone || "UTC";

  const [historyDay, setHistoryDay] = useState("");
  const historyQuery = useQuery<{ date: string; events: TurnEvent[] }>({
    queryKey: ["/api/turn/history", selectedStore?.id, historyDay],
    queryFn: async () => {
      const res = await fetch(`/api/turn/history?storeId=${selectedStore?.id}${historyDay ? `&date=${historyDay}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load the turn history");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const setBracket = (index: number, change: Partial<TurnBracket>) =>
    update("turnBrackets", settings.turnBrackets.map((b, i) => (i === index ? { ...b, ...change } : b)));
  const toggleSkipReason = (reason: SkipReason) =>
    update("turnSkipLosesTurn", settings.turnSkipLosesTurn.includes(reason) ? settings.turnSkipLosesTurn.filter((r) => r !== reason) : [...settings.turnSkipLosesTurn, reason]);

  // A different method starts the line again; say so before it is saved.
  const save = async () => {
    if (settings.turnMode !== savedMode || settings.turnCategoryRotation !== savedPerCategory) {
      const ok = await confirm("Changing the turn method starts the line again from now. Everyone counts from zero. Turns earned so far today stay in the history but no longer decide who is next. Change it?");
      if (!ok) return;
    }
    saveMutation.mutate();
  };
  const restartMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/turn/restart?storeId=${selectedStore?.id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", selectedStore?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/turn/history", selectedStore?.id] });
      toast({ title: "The line was started again" });
    },
    onError: () => toast({ title: "Unable to start the line again", variant: "destructive" }),
  });
  const restart = async () => {
    if (await confirm("Start the line again? Everyone counts from zero from now. Turns earned so far stay in the history.")) restartMutation.mutate();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/turn/settings?storeId=${selectedStore?.id}`, settings);
      return res.json();
    },
    onSuccess: (data: TurnSettings) => {
      setSettings(fromServer(data as any));
      queryClient.invalidateQueries({ queryKey: ["/api/turn/settings", selectedStore?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", selectedStore?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/turn/history", selectedStore?.id] });
      toast({ title: "Turn settings saved" });
    },
    onError: () => {
      toast({ title: "Unable to save turn settings", variant: "destructive" });
    },
  });

  const update = <K extends keyof TurnSettings>(key: K, value: TurnSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-5xl px-0 py-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <ListOrdered className="mt-1 h-5 w-5 text-teal-500" />
              <div>
                <h1 className="text-lg font-bold text-slate-800">Technician Turn System</h1>
                <p className="mt-1 max-w-xl text-sm leading-5 text-slate-500">
                  Manages walk-in distribution between technicians based on clock-in order and
                  POS revenue. Walk-ins only - scheduled appointments are unaffected.
                </p>
              </div>
            </div>
            <Button
              onClick={() => void save()}
              disabled={saveMutation.isPending || !selectedStore?.id}
              className="gap-2 rounded-xl bg-teal-500 px-4 hover:bg-teal-600"
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>

          <div className="space-y-0">
            <TurnToggleRow
              title="Enable Technician Turn System"
              description="When ON, walk-ins are assigned by queue position + revenue threshold. When OFF, everything works exactly as before - no changes to booking or POS."
              checked={settings.turnEnabled}
              onCheckedChange={(value) => update("turnEnabled", value)}
            />
            <TurnToggleRow
              title="Hand Waiting Clients to Free Technicians"
              description="When a technician becomes free (a checkout, a clock-in, a break ending), automatically give them the longest-waiting client they are qualified for."
              checked={settings.autoAdvanceOnCheckout}
              onCheckedChange={(value) => update("autoAdvanceOnCheckout", value)}
              hideDivider
            />
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-slate-700">Turn method</p>
            <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Turn method">
              {TURN_MODES.map((mode) => {
                const selected = settings.turnMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => update("turnMode", mode)}
                    data-testid={`turn-system-${mode}`}
                    className={`rounded-xl border p-4 text-left transition-colors ${selected ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{TURN_PRESETS[mode].label}</span>
                    <span className="mt-1 block text-sm text-slate-600">{METHOD_HELP[mode]}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Whichever method you choose, a client only ever goes to a technician who is clocked in, free, not on break and performs the service.
            </p>
          </div>

          {/* ── What a ticket earns ── */}
          {dollarMethod && (
            <div className="mt-6 border-t border-slate-200 pt-5">
              <h2 className="text-base font-bold text-slate-800">What a ticket earns</h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {settings.turnMode !== "brackets" && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      {settings.turnMode === "classic"
                        ? <>Turn value ($) <span className="text-slate-500">- the smallest service amount that counts as a turn</span></>
                        : <>Dollars per turn ($) <span className="text-slate-500">- this much service is one turn</span></>}
                    </label>
                    <Input type="number" min="0" step="0.01" value={settings.turnValueThreshold}
                      onChange={(event) => update("turnValueThreshold", Number(event.target.value))}
                      className="h-10 rounded-xl border-slate-200 bg-slate-50" data-testid="turn-value" />
                  </div>
                )}
                {settings.turnMode === "dollar" && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Partial turn <span className="text-slate-500">- what a service up to that amount earns, and what any amount over a full turn adds</span>
                    </label>
                    <select value={String(settings.partialTurnValue)} onChange={(event) => update("partialTurnValue", Number(event.target.value))}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" data-testid="turn-partial-value">
                      <option value="0.25">¼ turn</option>
                      <option value="0.5">½ turn</option>
                      <option value="0.75">¾ turn</option>
                      <option value="1">1 turn</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Amount that earns turns</label>
                  <select value={settings.turnAmountBasis} onChange={(event) => update("turnAmountBasis", event.target.value as TurnSettings["turnAmountBasis"])}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" data-testid="turn-amount-basis">
                    <option value="service">Services at full price (a discount does not reduce the turn)</option>
                    <option value="service_after_discount">Services after the ticket's discount</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Tips, retail products and sales tax never earn turns.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">A ticket refunded in full</label>
                  <select value={settings.turnRefundPolicy} onChange={(event) => update("turnRefundPolicy", event.target.value as TurnSettings["turnRefundPolicy"])}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" data-testid="turn-refund-policy">
                    <option value="keep">Keeps the turns it earned</option>
                    <option value="remove">Loses the turns it earned</option>
                  </select>
                </div>
              </div>

              {settings.turnMode === "brackets" && (
                <div className="mt-4" data-testid="turn-brackets">
                  <p className="mb-2 text-sm font-medium text-slate-700">Brackets</p>
                  <div className="space-y-2">
                    {settings.turnBrackets.map((bracket, index) => (
                      <div key={index} className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                        <span>From $</span>
                        <Input type="number" min="0" step="0.01" disabled={index === 0} value={bracket.fromCents / 100}
                          onChange={(event) => setBracket(index, { fromCents: Math.max(0, Math.round(Number(event.target.value) * 100)) })}
                          className="h-9 w-28 rounded-xl border-slate-200 bg-slate-50" aria-label="Bracket starts at" />
                        <span>a ticket earns</span>
                        <Input type="number" min="0" step="0.25" value={bracket.units / TURN_UNIT}
                          onChange={(event) => setBracket(index, { units: Math.max(0, Math.round(Number(event.target.value) * TURN_UNIT)) })}
                          className="h-9 w-24 rounded-xl border-slate-200 bg-slate-50" aria-label="Turns earned" />
                        <span>turns</span>
                        {index > 0 && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => update("turnBrackets", settings.turnBrackets.filter((_, i) => i !== index))}>Remove</Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button type="button" variant="outline" size="sm" disabled={settings.turnBrackets.length >= 12}
                      onClick={() => { const last = settings.turnBrackets[settings.turnBrackets.length - 1]; update("turnBrackets", [...settings.turnBrackets, { fromCents: (last?.fromCents ?? 0) + 3000, units: (last?.units ?? 0) + TURN_UNIT }]); }}>
                      Add a bracket
                    </Button>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      A ticket of exactly a bracket's amount
                      <select value={settings.turnBoundary} onChange={(event) => update("turnBoundary", event.target.value as TurnSettings["turnBoundary"])}
                        className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" data-testid="turn-boundary">
                        <option value="at_or_over">earns that bracket (exactly $30 counts as $30)</option>
                        <option value="over">earns the bracket below (only over $30 counts)</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}

              <div className="mt-4" data-testid="turn-preview">
                <p className="mb-2 text-sm font-medium text-slate-700">With these rules</p>
                <div className="overflow-x-auto">
                  <table className="text-sm text-slate-700">
                    <tbody>
                      <tr>
                        <th scope="row" className="pr-4 text-left font-medium text-slate-500">Service amount</th>
                        {PREVIEW_AMOUNTS.map((amount) => <td key={amount} className="px-3 py-1 text-right tabular-nums">${amount.toFixed(2)}</td>)}
                      </tr>
                      <tr>
                        <th scope="row" className="pr-4 text-left font-medium text-slate-500">Turns earned</th>
                        {PREVIEW_AMOUNTS.map((amount) => <td key={amount} className="px-3 py-1 text-right font-semibold tabular-nums">{formatTurns(turnUnits(rules, amount))}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── The line ── */}
          <div className="mt-6 border-t border-slate-200 pt-5">
            <h2 className="text-base font-bold text-slate-800">The line</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">The line starts again</label>
                <select value={settings.turnResetPeriod} onChange={(event) => update("turnResetPeriod", event.target.value as TurnSettings["turnResetPeriod"])}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" data-testid="turn-reset-period">
                  <option value="business_day">Every day at 4 AM, salon time</option>
                  <option value="day_close">At each Day Close</option>
                  <option value="continuous">Never by itself (it carries over from day to day)</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">Starting again never deletes anything. Earlier days stay in the history.</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Technicians who are level</label>
                <select value={settings.turnTieBreak} onChange={(event) => update("turnTieBreak", event.target.value as TurnSettings["turnTieBreak"])}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" data-testid="turn-tie-break">
                  <option value="longest_waiting">Whoever has waited longest goes first</option>
                  <option value="clock_in_order">Always in the order they clocked in</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">A technician who clocks in part-way through</label>
                <select value={settings.turnLateJoin} onChange={(event) => update("turnLateJoin", event.target.value as TurnSettings["turnLateJoin"])}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" data-testid="turn-late-join">
                  <option value="zero">Starts at zero, so they are first until they catch up</option>
                  <option value="level">Starts level with the lowest technician in the line</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Appointment window (minutes) <span className="text-slate-500">- no walk-in this close to a technician's appointment</span>
                </label>
                <Input type="number" min="1" step="1" value={settings.appointmentExclusionWindowMinutes}
                  onChange={(event) => update("appointmentExclusionWindowMinutes", Number(event.target.value))}
                  className="h-10 rounded-xl border-slate-200 bg-slate-50" />
              </div>
            </div>
            <div className="mt-2">
              <TurnToggleRow
                title="Separate rotation for each service category"
                description="Pedicures, manicures, acrylics and your other categories each keep their own line. A pedicure client goes to whoever is next for pedicures."
                checked={settings.turnCategoryRotation}
                onCheckedChange={(value) => update("turnCategoryRotation", value)}
                hideDivider
              />
            </div>

            {settings.turnMode === "round_robin" && (
              <div className="mt-2" data-testid="turn-skip-policy">
                <p className="text-sm font-medium text-slate-700">When the next technician cannot take the client</p>
                <p className="mt-1 text-sm text-slate-500">They keep their place and are next again, unless you tick a reason here. A ticked reason sends them to the back of the order.</p>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                  {PASSED_REASONS.map((reason) => (
                    <label key={reason} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={settings.turnSkipLosesTurn.includes(reason)} onChange={() => toggleSkipReason(reason)} />
                      Goes to the back when {SKIP_REASON_LABEL[reason]}
                    </label>
                  ))}
                </div>
                <TurnToggleRow
                  title="A hand-picked technician uses their turn"
                  description="When staff give a walk-in to a technician of their choosing, that technician goes to the back of the order. When OFF they keep their place. A technician the client asked for always keeps their place."
                  checked={settings.turnOverrideUsesTurn}
                  onCheckedChange={(value) => update("turnOverrideUsesTurn", value)}
                  hideDivider
                />
              </div>
            )}

            <TurnToggleRow
              title="Ask why when staff choose a different technician"
              description="When a walk-in is given to someone other than the next technician in line, staff must type a reason. It is kept in the turn history."
              checked={settings.turnOverrideReasonRequired}
              onCheckedChange={(value) => update("turnOverrideReasonRequired", value)}
              hideDivider
            />

            <div className="mt-3">
              <Button type="button" variant="outline" onClick={() => void restart()} disabled={restartMutation.isPending || !selectedStore?.id} data-testid="turn-restart">
                Start the line again now
              </Button>
            </div>
          </div>

          {/* ── History ── */}
          <div className="mt-6 border-t border-slate-200 pt-5" data-testid="turn-history">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">Turn history</h2>
                <p className="mt-1 text-sm text-slate-500">Who got each client and why, who was passed over, what each ticket earned, and every change to these rules.</p>
              </div>
              <Input type="date" value={historyDay || historyQuery.data?.date || ""} onChange={(event) => setHistoryDay(event.target.value)}
                className="h-10 w-44 rounded-xl border-slate-200 bg-slate-50" aria-label="History day" />
            </div>
            <div className="mt-3">
              {historyQuery.isLoading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : historyQuery.isError ? (
                <p className="text-sm text-red-600">Could not load the turn history.</p>
              ) : (historyQuery.data?.events.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500">Nothing was recorded on this day.</p>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {historyQuery.data!.events.map((event) => (
                    <li key={event.id} className="flex gap-4 py-2 text-sm">
                      <span className="w-20 shrink-0 tabular-nums text-slate-500">{formatInTz(new Date(event.at), timezone, "h:mm a")}</span>
                      <span className="text-slate-700">{eventText(event)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function TurnToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  hideDivider = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hideDivider?: boolean;
}) {
  return (
    <div className={hideDivider ? "py-4" : "border-b border-slate-200 py-4"}>
      <div className="flex items-start justify-between gap-5">
        <div className="max-w-xl">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
        </div>
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="mt-0.5 data-[state=checked]:bg-teal-500"
        />
      </div>
    </div>
  );
}
