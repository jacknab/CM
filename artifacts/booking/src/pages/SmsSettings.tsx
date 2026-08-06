import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore } from "@/hooks/use-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Bell,
  Star,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Phone,
  Copy,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface SmsSettingsData {
  id?: number;
  storeId: number;
  bookingConfirmationEnabled: boolean;
  reminderEnabled: boolean;
  reminderHoursBefore: number;
  reviewRequestEnabled: boolean;
  googleReviewUrl: string | null;
  confirmationTemplate: string | null;
  reminderTemplate: string | null;
  reviewTemplate: string | null;
  smsCancellationEnabled: boolean;
}

interface SmsLogEntry {
  id: number;
  storeId: number;
  appointmentId: number | null;
  customerId: number | null;
  phone: string;
  messageType: string;
  messageBody: string;
  status: string;
  twilioSid: string | null;
  errorMessage: string | null;
  sentAt: string;
}

export default function SmsSettings() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const [testPhone, setTestPhone] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const [form, setForm] = useState<Partial<SmsSettingsData>>({
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
  });

  const { data: gbpReviewLink } = useQuery<{ reviewLink: string | null }>({
    queryKey: ["/api/google-business/review-link", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return { reviewLink: null };
      const res = await fetch(`/api/google-business/review-link?storeId=${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) return { reviewLink: null };
      return res.json();
    },
    enabled: !!selectedStore?.id,
    staleTime: 1000 * 60 * 10, // 10 min
  });

  const { data: settings, isLoading } = useQuery<SmsSettingsData | null>({
    queryKey: ["/api/sms-settings", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return null;
      const res = await fetch(`/api/sms-settings/${selectedStore.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch SMS settings");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const { data: logs } = useQuery<SmsLogEntry[]>({
    queryKey: ["/api/sms-log", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return [];
      const res = await fetch(`/api/sms-log/${selectedStore.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch SMS logs");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        bookingConfirmationEnabled: settings.bookingConfirmationEnabled,
        reminderEnabled: settings.reminderEnabled,
        reminderHoursBefore: settings.reminderHoursBefore,
        reviewRequestEnabled: settings.reviewRequestEnabled,
        googleReviewUrl: settings.googleReviewUrl || "",
        confirmationTemplate: settings.confirmationTemplate || "",
        reminderTemplate: settings.reminderTemplate || "",
        reviewTemplate: settings.reviewTemplate || "",
        smsCancellationEnabled: settings.smsCancellationEnabled ?? true,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<SmsSettingsData>) => {
      const res = await apiRequest(
        "PUT",
        `/api/sms-settings/${selectedStore!.id}`,
        data
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/sms-settings", selectedStore?.id],
      });
      toast({ title: "SMS settings saved" });
    },
    onError: () => {
      toast({
        title: "Failed to save",
        description: "Please check your settings and try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  const handleTestSms = async () => {
    if (!testPhone.trim() || !selectedStore?.id) return;
    setSendingTest(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/sms-settings/${selectedStore.id}/test`,
        { phone: testPhone.trim() }
      );
      const result = await res.json();
      if (result.success) {
        toast({ title: "Test SMS sent successfully" });
        queryClient.invalidateQueries({
          queryKey: ["/api/sms-log", selectedStore.id],
        });
      }
    } catch (err: any) {
      toast({
        title: "Test SMS failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSendingTest(false);
    }
  };

  if (!selectedStore) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">
            Please select a store first.
          </p>
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            SMS Notifications
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure SMS for booking confirmations, reminders, and
            review requests.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          data-testid="button-save-sms-settings"
        >
          {saveMutation.isPending && (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          )}
          Save Settings
        </Button>
      </div>

      <div className="max-w-3xl space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Booking Confirmations</h3>
              <p className="text-sm text-muted-foreground">
                Send an SMS when a new booking is made
              </p>
            </div>
            <Switch
              checked={form.bookingConfirmationEnabled || false}
              onCheckedChange={(checked) =>
                setForm((f) => ({
                  ...f,
                  bookingConfirmationEnabled: checked,
                }))
              }
              data-testid="switch-confirmation"
            />
          </div>
          {form.bookingConfirmationEnabled && (
            <div>
              <label className="text-sm font-medium mb-1 block">
                Message Template
              </label>
              <Textarea
                value={form.confirmationTemplate || ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    confirmationTemplate: e.target.value.slice(0, 160),
                  }))
                }
                className="text-sm"
                rows={2}
                maxLength={160}
                data-testid="textarea-confirmation-template"
              />
              <div className="flex justify-between items-center mt-1">
                <p className="text-xs text-muted-foreground">
                  Variables: {"{customerName}"}, {"{storeName}"},{" "}
                  {"{appointmentDate}"}, {"{appointmentTime}"},{" "}
                  {"{serviceName}"}
                </p>
                <span className={`text-xs tabular-nums ${(form.confirmationTemplate || "").length >= 160 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {(form.confirmationTemplate || "").length}/160
                </span>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Appointment Reminders</h3>
              <p className="text-sm text-muted-foreground">
                Send a reminder before the appointment
              </p>
            </div>
            <Switch
              checked={form.reminderEnabled || false}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, reminderEnabled: checked }))
              }
              data-testid="switch-reminder"
            />
          </div>
          {form.reminderEnabled && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Hours Before Appointment
                </label>
                <Input
                  type="number"
                  min={1}
                  max={72}
                  value={form.reminderHoursBefore || 24}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      reminderHoursBefore: parseInt(e.target.value) || 24,
                    }))
                  }
                  className="w-32"
                  data-testid="input-reminder-hours"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Message Template
                </label>
                <Textarea
                  value={form.reminderTemplate || ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      reminderTemplate: e.target.value.slice(0, 160),
                    }))
                  }
                  className="text-sm"
                  rows={2}
                  maxLength={160}
                  data-testid="textarea-reminder-template"
                />
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs text-muted-foreground">
                    Variables: {"{customerName}"}, {"{storeName}"},{" "}
                    {"{appointmentDate}"}, {"{appointmentTime}"},{" "}
                    {"{serviceName}"}
                  </p>
                  <span className={`text-xs tabular-nums ${(form.reminderTemplate || "").length >= 160 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {(form.reminderTemplate || "").length}/160
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Star className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Google Review Requests</h3>
              <p className="text-sm text-muted-foreground">
                Send a review request after appointment completion
              </p>
            </div>
            <Switch
              checked={form.reviewRequestEnabled || false}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, reviewRequestEnabled: checked }))
              }
              data-testid="switch-review"
            />
          </div>
          {form.reviewRequestEnabled && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Google Review URL
                </label>
                <Input
                  value={form.googleReviewUrl || ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      googleReviewUrl: e.target.value,
                    }))
                  }
                  placeholder="https://g.page/r/your-business/review"
                  data-testid="input-google-review-url"
                />
                {/* GBP auto-fetched link hint */}
                {gbpReviewLink?.reviewLink && (
                  <div className="mt-2 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
                    <Star className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-blue-700 mb-0.5">Fetched from Google Business Profile</p>
                      <p className="text-xs text-blue-600 truncate">{gbpReviewLink.reviewLink}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {form.googleReviewUrl !== gbpReviewLink.reviewLink && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] px-2 border-blue-300 text-blue-700 hover:bg-blue-100"
                          onClick={() => setForm((f) => ({ ...f, googleReviewUrl: gbpReviewLink.reviewLink! }))}
                        >
                          Use this
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-blue-500 hover:bg-blue-100"
                        title="Copy link"
                        onClick={() => {
                          navigator.clipboard.writeText(gbpReviewLink.reviewLink!);
                          toast({ title: "Copied!", description: "Review link copied to clipboard." });
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <a
                        href={gbpReviewLink.reviewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-blue-500 hover:bg-blue-100"
                        title="Open in Google"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Message Template
                </label>
                <Textarea
                  value={form.reviewTemplate || ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      reviewTemplate: e.target.value.slice(0, 160),
                    }))
                  }
                  className="text-sm"
                  rows={2}
                  maxLength={160}
                  data-testid="textarea-review-template"
                />
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs text-muted-foreground">
                    Variables: {"{customerName}"}, {"{storeName}"},{" "}
                    {"{reviewUrl}"}
                  </p>
                  <span className={`text-xs tabular-nums ${(form.reviewTemplate || "").length >= 160 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {(form.reviewTemplate || "").length}/160
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">SMS Appointment Cancellation</h3>
              <p className="text-sm text-muted-foreground">
                Clients can reply <span className="font-mono font-bold">CANCEL</span> to a reminder to automatically cancel their next upcoming appointment
              </p>
            </div>
            <Switch
              checked={form.smsCancellationEnabled ?? true}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, smsCancellationEnabled: checked }))
              }
              data-testid="switch-sms-cancellation"
            />
          </div>
          {(form.smsCancellationEnabled ?? true) && (
            <p className="text-xs text-muted-foreground mt-3 pl-13 ml-13">
              When a client replies <span className="font-mono">CANCEL</span>, the system will automatically locate and cancel their nearest upcoming appointment and send a confirmation SMS.
            </p>
          )}
        </Card>


        {logs && logs.length > 0 && (
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Recent SMS Log</h3>
            <div className="space-y-3">
              {logs.slice(0, 20).map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 text-sm border-b pb-3 last:border-0 last:pb-0"
                  data-testid={`sms-log-${log.id}`}
                >
                  <div className="mt-0.5">
                    {log.status === "sent" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {log.messageType.replace("_", " ")}
                      </Badge>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {log.phone}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(log.sentAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 truncate">
                      {log.messageBody}
                    </p>
                    {log.errorMessage && (
                      <p className="text-red-500 text-xs mt-1">
                        {log.errorMessage}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
