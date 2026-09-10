import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CalendarSync, ChevronRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { useInSettingsShell } from "@/lib/settings-shell-context";
import { queryClient, apiRequest } from "@/lib/queryClient";

// ── one toggle row ────────────────────────────────────────────────────────
function Row({
  title, hint, checked, onChange, testId,
}: {
  title: string; hint: string; checked: boolean; onChange: (v: boolean) => void; testId?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[15px] font-medium">{title}</div>
        <div className="text-[13px] text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}

type EmailPrefs = {
  billingReceipts: boolean;
  lowBalanceAlerts: boolean;
  dataOperations: boolean;
  trialReminders: boolean;
};

export default function MyPreferencesPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const inShell = useInSettingsShell();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  // ── per-user account emails ─────────────────────────────────────────────
  const EMAIL_KEY = ["/api/settings/email-preferences"];
  const { data: emailPrefs } = useQuery<EmailPrefs>({
    queryKey: EMAIL_KEY,
    queryFn: async () => {
      const res = await fetch("/api/settings/email-preferences", { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const setEmailPref = useMutation({
    mutationFn: (patch: Partial<EmailPrefs>) => apiRequest("PATCH", "/api/settings/email-preferences", patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: EMAIL_KEY });
      const prev = queryClient.getQueryData<EmailPrefs>(EMAIL_KEY);
      if (prev) queryClient.setQueryData<EmailPrefs>(EMAIL_KEY, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(EMAIL_KEY, ctx.prev);
      toast({ title: "Couldn't save", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: EMAIL_KEY }),
  });

  // ── store-level weekly digest ──────────────────────────────────────────
  const DIGEST_KEY = ["/api/intelligence/digest-preferences", storeId];
  const { data: digest } = useQuery<{ optOut: boolean }>({
    queryKey: DIGEST_KEY,
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/digest-preferences?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: !!storeId,
  });

  const setDigest = useMutation({
    mutationFn: (optOut: boolean) =>
      apiRequest("POST", `/api/intelligence/digest-preferences?storeId=${storeId}`, { optOut }),
    onMutate: async (optOut) => {
      await queryClient.cancelQueries({ queryKey: DIGEST_KEY });
      const prev = queryClient.getQueryData(DIGEST_KEY);
      queryClient.setQueryData(DIGEST_KEY, { optOut });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(DIGEST_KEY, ctx?.prev);
      toast({ title: "Couldn't save", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: DIGEST_KEY }),
  });

  const p = emailPrefs ?? { billingReceipts: true, lowBalanceAlerts: true, dataOperations: true, trialReminders: true };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 space-y-8">
        {!inShell && (
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">My Preferences</h1>
            <p className="mt-1 text-sm text-muted-foreground">Personal defaults for your account.</p>
          </header>
        )}

        {/* Email notifications */}
        <div className="rounded-xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-lg font-semibold tracking-tight">Email notifications</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Which account emails land in your inbox.</p>
          <div className="mt-2 divide-y divide-border">
            <Row
              title="Weekly summary"
              hint="A Monday recap of bookings, revenue and no-shows."
              checked={!(digest?.optOut ?? false)}
              onChange={(on) => setDigest.mutate(!on)}
              testId="toggle-weekly-summary"
            />
            <Row
              title="Payment receipts"
              hint="Receipts for subscription and wallet charges."
              checked={p.billingReceipts}
              onChange={(v) => setEmailPref.mutate({ billingReceipts: v })}
              testId="toggle-billing-receipts"
            />
            <Row
              title="Low balance alerts"
              hint="When your text-message balance runs low."
              checked={p.lowBalanceAlerts}
              onChange={(v) => setEmailPref.mutate({ lowBalanceAlerts: v })}
              testId="toggle-low-balance"
            />
            <Row
              title="Import & export updates"
              hint="When a data import or export finishes."
              checked={p.dataOperations}
              onChange={(v) => setEmailPref.mutate({ dataOperations: v })}
              testId="toggle-data-operations"
            />
            <Row
              title="Trial reminders"
              hint="Heads-up before your free trial ends."
              checked={p.trialReminders}
              onChange={(v) => setEmailPref.mutate({ trialReminders: v })}
              testId="toggle-trial-reminders"
            />
          </div>
        </div>

        {/* Calendar sync */}
        <div className="rounded-xl border border-border bg-card p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                <CalendarSync className="h-[18px] w-[18px]" />
              </span>
              <div>
                <div className="text-[15px] font-medium">Calendar sync</div>
                <div className="text-[13px] text-muted-foreground">
                  Subscribe to your bookings from Apple, Google or Outlook Calendar.
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/settings/calendar-sync")}>
              Manage <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
