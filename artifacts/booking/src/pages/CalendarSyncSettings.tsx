import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarSync, Check, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInSettingsShell } from "@/lib/settings-shell-context";

interface FeedInfo {
  storeUrl: string;
  staff: { id: number; name: string; url: string }[];
}

function CopyRow({ url, testId }: { url: string; testId?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Couldn't copy — select and copy the text manually", variant: "destructive" });
    }
  }

  return (
    <div className="flex items-stretch gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        data-testid={testId}
        className="min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground outline-none"
      />
      <Button variant="outline" size="sm" onClick={copy} className="shrink-0">
        {copied ? <Check className="mr-1.5 h-4 w-4 text-emerald-600" /> : <Copy className="mr-1.5 h-4 w-4" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export default function CalendarSyncSettings() {
  const inShell = useInSettingsShell();
  const { data, isLoading } = useQuery<FeedInfo>({ queryKey: ["/api/calendar-sync/feed-url"] });

  const [staffId, setStaffId] = useState<string>("store");
  const selectedUrl = useMemo(() => {
    if (!data) return "";
    if (staffId === "store") return data.storeUrl;
    return data.staff.find((s) => String(s.id) === staffId)?.url ?? data.storeUrl;
  }, [data, staffId]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8">
        {!inShell && (
          <header className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground">
              <CalendarSync className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Calendar Sync</h1>
          </header>
        )}

        <div className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Subscribe to your calendar</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Add this link to Apple&nbsp;Calendar, Google&nbsp;Calendar or Outlook and your bookings
              show up automatically. It's read-only and refreshes about every 30&nbsp;minutes.
            </p>
          </div>

          {isLoading || !data ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-[15px] font-medium">Calendar</label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger className="text-[15px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">Whole business — all bookings</SelectItem>
                    {data.staff.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name} — their bookings only</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[15px] font-medium">Feed link</label>
                <CopyRow url={selectedUrl} testId="calendar-feed-url" />
                <p className="text-[13px] text-muted-foreground">
                  Anyone with this link can see these bookings — share it carefully.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-lg font-semibold tracking-tight">How to add it</h2>
          <ul className="mt-3 space-y-2 text-[14px] text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Google Calendar:</span>{" "}
              Other calendars → <span className="text-foreground">From URL</span> → paste the link.
            </li>
            <li>
              <span className="font-medium text-foreground">Apple Calendar:</span>{" "}
              File → <span className="text-foreground">New Calendar Subscription…</span> → paste the link.
            </li>
            <li>
              <span className="font-medium text-foreground">Outlook:</span>{" "}
              Add calendar → <span className="text-foreground">Subscribe from web</span> → paste the link.
            </li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
