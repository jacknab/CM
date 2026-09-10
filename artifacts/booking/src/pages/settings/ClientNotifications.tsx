import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2,
  Bell,
  CalendarCheck,
  Star,
  MessageSquareReply,
  Mail,
  Send,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useInSettingsShell } from "@/lib/settings-shell-context";
import { useSelectedStore } from "@/hooks/use-store";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// ── shapes ────────────────────────────────────────────────────────────────────
interface ChannelSettings {
  bookingConfirmationEnabled: boolean;
  reminderEnabled: boolean;
  reminderHoursBefore: number;
  reviewRequestEnabled: boolean;
  googleReviewUrl: string;
  confirmationTemplate: string;
  reminderTemplate: string;
  reviewTemplate: string;
}

interface SmsSettings extends ChannelSettings {
  smsCancellationEnabled: boolean;
}

interface SmsLogEntry {
  id: number;
  phone: string;
  messageType: string;
  messageBody: string;
  status: string;
  errorMessage: string | null;
  sentAt: string;
}

const SMS_DEFAULTS: SmsSettings = {
  bookingConfirmationEnabled: true,
  reminderEnabled: true,
  reminderHoursBefore: 24,
  reviewRequestEnabled: true,
  googleReviewUrl: "",
  confirmationTemplate:
    "Hi {customerName}, your appointment at {storeName} is confirmed for {appointmentDate} at {appointmentTime}. See you then!",
  reminderTemplate:
    "Hi {customerName}, reminder: your appt at {storeName} is on {appointmentDate} at {appointmentTime}. Reply CANCEL to cancel.",
  reviewTemplate:
    "Hi {customerName}, thank you for visiting {storeName}! We'd love your feedback. Leave us a review: {reviewUrl}",
  smsCancellationEnabled: true,
};

const MAIL_DEFAULTS: ChannelSettings = {
  bookingConfirmationEnabled: false,
  reminderEnabled: false,
  reminderHoursBefore: 24,
  reviewRequestEnabled: false,
  googleReviewUrl: "",
  confirmationTemplate:
    "<p>Hi {customerName},</p>\n<p>Your appointment at {storeName} is confirmed for {appointmentDate} at {appointmentTime}.</p>\n<p>See you then!</p>",
  reminderTemplate:
    "<p>Hi {customerName},</p>\n<p>This is a reminder of your appointment at {storeName} on {appointmentDate} at {appointmentTime}.</p>\n<p>Reply to this email to confirm or cancel.</p>",
  reviewTemplate:
    "<p>Hi {customerName},</p>\n<p>Thank you for visiting {storeName}! We'd love your feedback.</p>\n<p><a href=\"{reviewUrl}\">Leave us a review</a></p>",
};

const HOURS_OPTIONS = [1, 2, 3, 4, 6, 12, 24, 48, 72];

function hoursLabel(h: number) {
  if (h === 1) return "1 hour before";
  if (h < 24) return `${h} hours before`;
  if (h === 24) return "24 hours (1 day) before";
  if (h === 48) return "48 hours (2 days) before";
  if (h === 72) return "72 hours (3 days) before";
  return `${h} hours before`;
}

function pickChannel<T extends ChannelSettings>(src: Partial<T> | null | undefined, base: T): T {
  if (!src) return { ...base };
  return {
    ...base,
    ...src,
    googleReviewUrl: src.googleReviewUrl ?? base.googleReviewUrl ?? "",
    confirmationTemplate: src.confirmationTemplate ?? base.confirmationTemplate,
    reminderTemplate: src.reminderTemplate ?? base.reminderTemplate,
    reviewTemplate: src.reviewTemplate ?? base.reviewTemplate,
    reminderHoursBefore: src.reminderHoursBefore ?? base.reminderHoursBefore,
  };
}

// ── small building blocks ────────────────────────────────────────────────────
function ChannelToggle({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[14px]">
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 md:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

const SMS_VARS = "{customerName}, {storeName}, {appointmentDate}, {appointmentTime}, {serviceName}";
const REVIEW_VARS = "{customerName}, {storeName}, {reviewUrl}";

function Customize({
  open,
  onToggle,
  showText,
  showEmail,
  textValue,
  emailValue,
  onText,
  onEmail,
  vars,
  textLimit = 160,
}: {
  open: boolean;
  onToggle: () => void;
  showText: boolean;
  showEmail: boolean;
  textValue: string;
  emailValue: string;
  onText: (v: string) => void;
  onEmail: (v: string) => void;
  vars: string;
  textLimit?: number;
}) {
  if (!showText && !showEmail) return null;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="text-[13px] font-medium text-primary hover:underline"
      >
        {open ? "Hide message templates" : "Customize messages"}
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {showText && (
            <div>
              <label className="mb-1 block text-[13px] font-medium">Text message</label>
              <Textarea
                rows={2}
                value={textValue}
                maxLength={textLimit}
                onChange={(e) => onText(e.target.value.slice(0, textLimit))}
                className="text-[13px]"
              />
              <div className="mt-1 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">Variables: {vars}</p>
                <span
                  className={cn(
                    "tabular-nums text-[11px]",
                    textValue.length >= textLimit ? "font-medium text-destructive" : "text-muted-foreground",
                  )}
                >
                  {textValue.length}/{textLimit}
                </span>
              </div>
            </div>
          )}
          {showEmail && (
            <div>
              <label className="mb-1 block text-[13px] font-medium">Email message (HTML)</label>
              <Textarea
                rows={6}
                value={emailValue}
                onChange={(e) => onEmail(e.target.value)}
                className="font-mono text-[12px]"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Variables: {vars}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function ClientNotifications() {
  const { toast } = useToast();
  const inShell = useInSettingsShell();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;

  const smsQ = useQuery<Partial<SmsSettings> | null>({
    queryKey: ["/api/sms-settings", storeId],
    queryFn: async () => {
      if (!storeId) return null;
      const res = await fetch(`/api/sms-settings/${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load text settings");
      return res.json();
    },
    enabled: !!storeId,
  });

  const mailQ = useQuery<Partial<ChannelSettings> | null>({
    queryKey: ["/api/mail-settings", storeId],
    queryFn: async () => {
      if (!storeId) return null;
      const res = await fetch(`/api/mail-settings/${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load email settings");
      return res.json();
    },
    enabled: !!storeId,
  });

  const { data: gbpReviewLink } = useQuery<{ reviewLink: string | null }>({
    queryKey: ["/api/google-business/review-link", storeId],
    queryFn: async () => {
      if (!storeId) return { reviewLink: null };
      const res = await fetch(`/api/google-business/review-link?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return { reviewLink: null };
      return res.json();
    },
    enabled: !!storeId,
    staleTime: 1000 * 60 * 10,
  });

  const { data: logs } = useQuery<SmsLogEntry[]>({
    queryKey: ["/api/sms-log", storeId],
    queryFn: async () => {
      if (!storeId) return [];
      const res = await fetch(`/api/sms-log/${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load text activity");
      return res.json();
    },
    enabled: !!storeId,
  });

  const [sms, setSms] = useState<SmsSettings>(SMS_DEFAULTS);
  const [mail, setMail] = useState<ChannelSettings>(MAIL_DEFAULTS);

  const [baseline, setBaseline] = useState("");
  useEffect(() => {
    if (smsQ.data === undefined || mailQ.data === undefined) return;
    const s = pickChannel<SmsSettings>(smsQ.data as Partial<SmsSettings>, SMS_DEFAULTS);
    if (smsQ.data && "smsCancellationEnabled" in smsQ.data) {
      s.smsCancellationEnabled = (smsQ.data as SmsSettings).smsCancellationEnabled ?? true;
    }
    const m = pickChannel<ChannelSettings>(mailQ.data as Partial<ChannelSettings>, MAIL_DEFAULTS);
    setSms(s);
    setMail(m);
    setBaseline(JSON.stringify({ s, m }));
  }, [smsQ.data, mailQ.data]);

  const dirty = useMemo(
    () => baseline !== "" && baseline !== JSON.stringify({ s: sms, m: mail }),
    [baseline, sms, mail],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error("No store selected");
      const { smsCancellationEnabled, ...smsChannel } = sms;
      await Promise.all([
        apiRequest("PUT", `/api/sms-settings/${storeId}`, { ...smsChannel, smsCancellationEnabled }),
        apiRequest("PUT", `/api/mail-settings/${storeId}`, mail),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-settings", storeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/mail-settings", storeId] });
      setBaseline(JSON.stringify({ s: sms, m: mail }));
      toast({ title: "Client notifications saved" });
    },
    onError: () => toast({ title: "Couldn't save notifications", variant: "destructive" }),
  });

  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const sendTest = async () => {
    if (!testPhone.trim() || !storeId) return;
    setTesting(true);
    try {
      const res = await apiRequest("POST", `/api/sms-settings/${storeId}/test`, { phone: testPhone.trim() });
      const result = await res.json();
      if (result.success) {
        toast({ title: "Test text sent" });
        queryClient.invalidateQueries({ queryKey: ["/api/sms-log", storeId] });
      } else {
        toast({ title: "Test text failed", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Test text failed", description: err?.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  // per-section "customize" expander state
  const [openCust, setOpenCust] = useState<Record<string, boolean>>({});
  const toggleCust = (k: string) => setOpenCust((o) => ({ ...o, [k]: !o[k] }));

  const setHours = (h: number) => {
    setSms((s) => ({ ...s, reminderHoursBefore: h }));
    setMail((m) => ({ ...m, reminderHoursBefore: h }));
  };
  const setReviewUrl = (v: string) => {
    setSms((s) => ({ ...s, googleReviewUrl: v }));
    setMail((m) => ({ ...m, googleReviewUrl: v }));
  };

  if (!selectedStore) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
          <p className="text-muted-foreground">Select a store to configure notifications.</p>
        </div>
      </AppLayout>
    );
  }

  const loading = smsQ.isLoading || mailQ.isLoading;

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
        {!inShell && (
          <header className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Client Notifications</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Confirmations, reminders and review requests — by text, email or both.
            </p>
          </header>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Reminder */}
            <Section
              icon={<Bell className="h-[18px] w-[18px]" />}
              title="Appointment reminder"
              description="Send clients a reminder before their appointment."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <ChannelToggle
                  icon={<MessageSquareReply className="h-4 w-4" />}
                  label="Text"
                  checked={sms.reminderEnabled}
                  onChange={(v) => setSms((s) => ({ ...s, reminderEnabled: v }))}
                />
                <ChannelToggle
                  icon={<Mail className="h-4 w-4" />}
                  label="Email"
                  checked={mail.reminderEnabled}
                  onChange={(v) => setMail((m) => ({ ...m, reminderEnabled: v }))}
                />
              </div>
              {(sms.reminderEnabled || mail.reminderEnabled) && (
                <div className="flex flex-wrap items-center gap-2 text-[14px]">
                  <span className="text-muted-foreground">Send</span>
                  <Select
                    value={String(sms.reminderHoursBefore)}
                    onValueChange={(v) => setHours(Number(v))}
                  >
                    <SelectTrigger className="w-[220px] text-[14px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS_OPTIONS.map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {hoursLabel(h)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Customize
                open={!!openCust.reminder}
                onToggle={() => toggleCust("reminder")}
                showText={sms.reminderEnabled}
                showEmail={mail.reminderEnabled}
                textValue={sms.reminderTemplate}
                emailValue={mail.reminderTemplate}
                onText={(v) => setSms((s) => ({ ...s, reminderTemplate: v }))}
                onEmail={(v) => setMail((m) => ({ ...m, reminderTemplate: v }))}
                vars={SMS_VARS}
              />
            </Section>

            {/* Booking confirmation */}
            <Section
              icon={<CalendarCheck className="h-[18px] w-[18px]" />}
              title="Booking confirmation"
              description="Confirm the appointment as soon as it's booked."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <ChannelToggle
                  icon={<MessageSquareReply className="h-4 w-4" />}
                  label="Text"
                  checked={sms.bookingConfirmationEnabled}
                  onChange={(v) => setSms((s) => ({ ...s, bookingConfirmationEnabled: v }))}
                />
                <ChannelToggle
                  icon={<Mail className="h-4 w-4" />}
                  label="Email"
                  checked={mail.bookingConfirmationEnabled}
                  onChange={(v) => setMail((m) => ({ ...m, bookingConfirmationEnabled: v }))}
                />
              </div>
              <Customize
                open={!!openCust.confirmation}
                onToggle={() => toggleCust("confirmation")}
                showText={sms.bookingConfirmationEnabled}
                showEmail={mail.bookingConfirmationEnabled}
                textValue={sms.confirmationTemplate}
                emailValue={mail.confirmationTemplate}
                onText={(v) => setSms((s) => ({ ...s, confirmationTemplate: v }))}
                onEmail={(v) => setMail((m) => ({ ...m, confirmationTemplate: v }))}
                vars={SMS_VARS}
              />
            </Section>

            {/* Review request */}
            <Section
              icon={<Star className="h-[18px] w-[18px]" />}
              title="Review request"
              description="Ask clients for a Google review after their visit."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <ChannelToggle
                  icon={<MessageSquareReply className="h-4 w-4" />}
                  label="Text"
                  checked={sms.reviewRequestEnabled}
                  onChange={(v) => setSms((s) => ({ ...s, reviewRequestEnabled: v }))}
                />
                <ChannelToggle
                  icon={<Mail className="h-4 w-4" />}
                  label="Email"
                  checked={mail.reviewRequestEnabled}
                  onChange={(v) => setMail((m) => ({ ...m, reviewRequestEnabled: v }))}
                />
              </div>
              {(sms.reviewRequestEnabled || mail.reviewRequestEnabled) && (
                <div>
                  <label className="mb-1 block text-[13px] font-medium">Google review link</label>
                  <Input
                    value={sms.googleReviewUrl}
                    onChange={(e) => setReviewUrl(e.target.value)}
                    placeholder="https://g.page/r/your-business/review"
                    className="text-[14px]"
                  />
                  {gbpReviewLink?.reviewLink && gbpReviewLink.reviewLink !== sms.googleReviewUrl && (
                    <button
                      type="button"
                      onClick={() => setReviewUrl(gbpReviewLink.reviewLink!)}
                      className="mt-1.5 text-[12px] font-medium text-primary hover:underline"
                    >
                      Use the link from your Google Business Profile
                    </button>
                  )}
                </div>
              )}
              <Customize
                open={!!openCust.review}
                onToggle={() => toggleCust("review")}
                showText={sms.reviewRequestEnabled}
                showEmail={mail.reviewRequestEnabled}
                textValue={sms.reviewTemplate}
                emailValue={mail.reviewTemplate}
                onText={(v) => setSms((s) => ({ ...s, reviewTemplate: v }))}
                onEmail={(v) => setMail((m) => ({ ...m, reviewTemplate: v }))}
                vars={REVIEW_VARS}
              />
            </Section>

            {/* Cancellation replies — text only */}
            <Section
              icon={<XCircle className="h-[18px] w-[18px]" />}
              title="Cancellation replies"
              description="Let clients reply CANCEL to a text reminder to cancel their next appointment."
            >
              <ChannelToggle
                icon={<MessageSquareReply className="h-4 w-4" />}
                label="Text"
                checked={sms.smsCancellationEnabled}
                onChange={(v) => setSms((s) => ({ ...s, smsCancellationEnabled: v }))}
              />
              {sms.smsCancellationEnabled && (
                <p className="text-[12px] text-muted-foreground">
                  When a client replies <span className="font-mono">CANCEL</span>, the system finds and
                  cancels their nearest upcoming appointment, then sends a confirmation text.
                </p>
              )}
            </Section>

            {/* Test + activity */}
            <details className="rounded-xl border border-border bg-card p-5 md:p-6">
              <summary className="cursor-pointer text-[15px] font-semibold tracking-tight">
                Test &amp; recent activity
              </summary>
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-[13px] font-medium">Send a test text to</label>
                    <Input
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="+1 555 123 4567"
                      className="text-[14px]"
                    />
                  </div>
                  <Button variant="outline" onClick={sendTest} disabled={testing || !testPhone.trim()}>
                    {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Send test
                  </Button>
                </div>

                {logs && logs.length > 0 && (
                  <div className="space-y-2.5">
                    {logs.slice(0, 15).map((log) => (
                      <div key={log.id} className="flex items-start gap-2.5 border-b border-border pb-2.5 text-[13px] last:border-0 last:pb-0">
                        {log.status === "sent" ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {log.messageType.replace(/_/g, " ")}
                            </span>
                            <span>{log.phone}</span>
                            <span>{new Date(log.sentAt).toLocaleString()}</span>
                          </div>
                          <p className="mt-0.5 truncate text-muted-foreground">{log.messageBody}</p>
                          {log.errorMessage && (
                            <p className="mt-0.5 text-[12px] text-destructive">{log.errorMessage}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>

            {/* save */}
            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
              {dirty && <span className="text-[13px] text-muted-foreground">Unsaved changes</span>}
              <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
