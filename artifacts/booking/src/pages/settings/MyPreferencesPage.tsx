import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

interface FeedInfo {
  storeUrl: string;
  staff: { id: number; name: string; url: string }[];
}

export default function MyPreferencesPage() {
  const { toast } = useToast();
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

  // ── calendar sync feed ────────────────────────────────────────────────
  const { data: feed, isLoading: feedLoading } = useQuery<FeedInfo>({
    queryKey: ["/api/calendar-sync/feed-url"],
  });
  const [feedStaffId, setFeedStaffId] = useState<string>("store");
  const [copied, setCopied] = useState(false);
  const feedUrl = useMemo(() => {
    if (!feed) return "";
    if (feedStaffId === "store") return feed.storeUrl;
    return feed.staff.find((s) => String(s.id) === feedStaffId)?.url ?? feed.storeUrl;
  }, [feed, feedStaffId]);

  async function copyFeed() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Couldn't copy the link — try again", variant: "destructive" });
    }
  }

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
        <div className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Calendar sync</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Add this link to Apple, Google or Outlook Calendar and your bookings show up
              automatically. It's read-only and refreshes about every 30&nbsp;minutes.
            </p>
          </div>

          {feedLoading || !feed ? (
            <Skeleton className="h-9 w-full sm:w-[380px]" />
          ) : (
            <div className="space-y-1.5">
              <label className="text-[15px] font-medium">Calendar</label>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={feedStaffId} onValueChange={setFeedStaffId}>
                  <SelectTrigger className="w-full text-[15px] sm:w-[280px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">Whole business — all bookings</SelectItem>
                    {feed.staff.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name} — their bookings only</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={copyFeed} className="shrink-0">
                  {copied ? <Check className="mr-1.5 h-4 w-4 text-emerald-600" /> : <Copy className="mr-1.5 h-4 w-4" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
              <p className="text-[13px] text-muted-foreground">
                Anyone with this link can see these bookings — share it carefully.
              </p>
            </div>
          )}

          <ul className="border-t border-border pt-4 space-y-1.5 text-[13px] text-muted-foreground">
            <li><span className="font-medium text-foreground">Google Calendar:</span> Other calendars → From URL → paste the copied link.</li>
            <li><span className="font-medium text-foreground">Apple Calendar:</span> File → New Calendar Subscription… → paste the copied link.</li>
            <li><span className="font-medium text-foreground">Outlook:</span> Add calendar → Subscribe from web → paste the copied link.</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
