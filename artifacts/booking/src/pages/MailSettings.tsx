import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore } from "@/hooks/use-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CreditCard,
  TrendingDown,
  FileInput,
  Timer,
  ShieldAlert,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface MailSettingsData {
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
}

interface EmailPrefs {
  billingReceipts:  boolean;
  lowBalanceAlerts: boolean;
  dataOperations:   boolean;
  trialReminders:   boolean;
}

const DEFAULT_EMAIL_PREFS: EmailPrefs = {
  billingReceipts:  true,
  lowBalanceAlerts: true,
  dataOperations:   true,
  trialReminders:   true,
};

export default function MailSettings() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();

  const [form, setForm] = useState<Partial<MailSettingsData>>({
    bookingConfirmationEnabled: false,
    reminderEnabled: false,
    reminderHoursBefore: 24,
    reviewRequestEnabled: false,
    googleReviewUrl: "",
    confirmationTemplate: `<p>Hi {customerName},</p>
<p>Your appointment at {storeName} is confirmed for {appointmentDate} at {appointmentTime}.</p>
<p>See you then!</p>`,
    reminderTemplate: `<p>Hi {customerName},</p>
<p>This is a reminder of your appointment at {storeName} on {appointmentDate} at {appointmentTime}.</p>
<p>Reply to this email to confirm or cancel.</p>`,
    reviewTemplate: `<p>Hi {customerName},</p>
<p>Thank you for visiting {storeName}! We'd love your feedback.</p>
<p><a href="{reviewUrl}">Leave us a review</a></p>`,
  });

  const { data: settings, isLoading } = useQuery<MailSettingsData | null>({
    queryKey: ["/api/mail-settings", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return null;
      const res = await fetch(`/api/mail-settings/${selectedStore.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch mail settings");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const [emailPrefs, setEmailPrefs] = useState<EmailPrefs>(DEFAULT_EMAIL_PREFS);

  const { data: emailPrefsData } = useQuery<EmailPrefs>({
    queryKey: ["/api/settings/email-preferences"],
    queryFn: async () => {
      const res = await fetch("/api/settings/email-preferences", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load email preferences");
      return res.json();
    },
  });

  useEffect(() => {
    if (emailPrefsData) setEmailPrefs(emailPrefsData);
  }, [emailPrefsData]);

  const emailPrefsMutation = useMutation({
    mutationFn: async (data: Partial<EmailPrefs>) => {
      const res = await fetch("/api/settings/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save email preferences");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/email-preferences"] });
      toast({ title: "Email preferences saved" });
    },
    onError: () => toast({ title: "Failed to save preferences", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<MailSettingsData>) => {
      if (!selectedStore?.id) throw new Error("No store selected");
      const res = await fetch(`/api/mail-settings/${selectedStore.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update mail settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mail-settings"] });
      toast({ title: "Mail settings updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update mail settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!selectedStore) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Please select a store</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Email Notifications</h1>
        <p className="text-muted-foreground">
          Configure email templates and notification settings for client emails.
          Emails are sent via the platform Mailgun account.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Booking Confirmation Emails */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Booking Confirmation
                </span>
                <Switch
                  checked={form.bookingConfirmationEnabled || false}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, bookingConfirmationEnabled: checked })
                  }
                />
              </CardTitle>
              <CardDescription>
                Send an email when a booking is confirmed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Email Template (HTML)</label>
                <Textarea
                  value={form.confirmationTemplate || ""}
                  onChange={(e) =>
                    setForm({ ...form, confirmationTemplate: e.target.value })
                  }
                  className="font-mono text-xs"
                  rows={8}
                  placeholder="<p>Hi {customerName}, your appointment is confirmed...</p>"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Available variables: {'{customerName}'}, {'{storeName}'}, {'{appointmentDate}'}, {'{appointmentTime}'}, {'{serviceName}'}
                </p>
              </div>

              <Button
                onClick={() => updateMutation.mutate(form)}
                disabled={updateMutation.isPending}
                variant="outline"
                className="w-full"
              >
                {updateMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Save Confirmation Template
              </Button>
            </CardContent>
          </Card>

          {/* Appointment Reminders */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Appointment Reminders
                </span>
                <Switch
                  checked={form.reminderEnabled || false}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, reminderEnabled: checked })
                  }
                />
              </CardTitle>
              <CardDescription>
                Send reminder emails before appointments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Send reminder this many hours before appointment
                </label>
                <Input
                  type="number"
                  min="1"
                  max="72"
                  value={form.reminderHoursBefore || 24}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      reminderHoursBefore: parseInt(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email Template (HTML)</label>
                <Textarea
                  value={form.reminderTemplate || ""}
                  onChange={(e) =>
                    setForm({ ...form, reminderTemplate: e.target.value })
                  }
                  className="font-mono text-xs"
                  rows={8}
                  placeholder="<p>Hi {customerName}, this is a reminder...</p>"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Available variables: {'{customerName}'}, {'{storeName}'}, {'{appointmentDate}'}, {'{appointmentTime}'}, {'{serviceName}'}
                </p>
              </div>

              <Button
                onClick={() => updateMutation.mutate(form)}
                disabled={updateMutation.isPending}
                variant="outline"
                className="w-full"
              >
                {updateMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Save Reminder Template
              </Button>
            </CardContent>
          </Card>

          {/* Review Requests */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Review Requests
                </span>
                <Switch
                  checked={form.reviewRequestEnabled || false}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, reviewRequestEnabled: checked })
                  }
                />
              </CardTitle>
              <CardDescription>
                Request reviews from clients after appointments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Google Review URL</label>
                <Input
                  placeholder="https://google.com/maps/business/..."
                  value={form.googleReviewUrl || ""}
                  onChange={(e) =>
                    setForm({ ...form, googleReviewUrl: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email Template (HTML)</label>
                <Textarea
                  value={form.reviewTemplate || ""}
                  onChange={(e) =>
                    setForm({ ...form, reviewTemplate: e.target.value })
                  }
                  className="font-mono text-xs"
                  rows={8}
                  placeholder="<p>Please leave us a review...</p>"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Available variables: {'{customerName}'}, {'{storeName}'}, {'{reviewUrl}'}
                </p>
              </div>

              <Button
                onClick={() => updateMutation.mutate(form)}
                disabled={updateMutation.isPending}
                variant="outline"
                className="w-full"
              >
                {updateMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Save Review Template
              </Button>
            </CardContent>
          </Card>

          {/* ── Email Preference Centre ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Your Email Preferences
              </CardTitle>
              <CardDescription>
                Choose which system emails Certxa sends to you. Critical alerts
                (payment failures, account suspension) are always delivered.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Billing Receipts */}
              <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
                <div className="flex items-start gap-3">
                  <CreditCard className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Billing Receipts</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Subscription renewal confirmations and credit top-up receipts.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={emailPrefs.billingReceipts}
                  onCheckedChange={(v) => setEmailPrefs((p) => ({ ...p, billingReceipts: v }))}
                />
              </div>

              {/* Low Balance Alerts */}
              <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
                <div className="flex items-start gap-3">
                  <TrendingDown className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Low Balance Alerts</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Warnings when your platform or SMS credit balance is running low.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={emailPrefs.lowBalanceAlerts}
                  onCheckedChange={(v) => setEmailPrefs((p) => ({ ...p, lowBalanceAlerts: v }))}
                />
              </div>

              {/* Data Operations */}
              <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
                <div className="flex items-start gap-3">
                  <FileInput className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Data Operations</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Notifications when a data import completes or is rejected.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={emailPrefs.dataOperations}
                  onCheckedChange={(v) => setEmailPrefs((p) => ({ ...p, dataOperations: v }))}
                />
              </div>

              {/* Trial Reminders */}
              <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
                <div className="flex items-start gap-3">
                  <Timer className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Trial Reminders</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Emails when your free trial is expiring or has ended.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={emailPrefs.trialReminders}
                  onCheckedChange={(v) => setEmailPrefs((p) => ({ ...p, trialReminders: v }))}
                />
              </div>

              {/* Always-on note */}
              <div className="flex items-start gap-2.5 bg-gray-50 rounded-lg px-4 py-3">
                <ShieldAlert className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500 leading-relaxed">
                  <span className="font-semibold text-gray-600">Always delivered:</span>{" "}
                  Payment failure notices, account suspension and lock warnings, and account restoration confirmations cannot be turned off.
                </p>
              </div>

              <Button
                onClick={() => emailPrefsMutation.mutate(emailPrefs)}
                disabled={emailPrefsMutation.isPending}
                className="w-full"
              >
                {emailPrefsMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Save Email Preferences
              </Button>
            </CardContent>
          </Card>

        </div>
      )}
    </AppLayout>
  );
}
