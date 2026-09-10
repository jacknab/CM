import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useInSettingsShell } from "@/lib/settings-shell-context";
import { apiRequest } from "@/lib/queryClient";

export default function SecurityPage() {
  const { toast } = useToast();
  const inShell = useInSettingsShell();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 8;
  const canSubmit = current.length > 0 && next.length >= 8 && next === confirm;

  const change = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/manage/change-password", { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast({ title: "Password updated" });
      setCurrent(""); setNext(""); setConfirm("");
    },
    onError: (err: any) => {
      const raw = String(err?.message || "").replace(/^\d+:\s*/, "");
      let msg = raw;
      try { msg = JSON.parse(raw)?.error || raw; } catch { /* not json */ }
      toast({
        title: "Couldn't update password",
        description: msg || undefined,
        variant: "destructive",
      });
    },
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
        {!inShell && (
          <header className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage the password you sign in with.</p>
          </header>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); if (canSubmit) change.mutate(); }}
          className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-6"
        >
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Change password</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">Use at least 8 characters.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[15px] font-medium">Current password</label>
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="text-[15px]"
              data-testid="input-current-password"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[15px] font-medium">New password</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="text-[15px]"
              data-testid="input-new-password"
            />
            {tooShort && <p className="text-xs text-destructive">Must be at least 8 characters.</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-[15px] font-medium">Confirm new password</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="text-[15px]"
              data-testid="input-confirm-password"
            />
            {mismatch && <p className="text-xs text-destructive">Passwords don't match.</p>}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit || change.isPending} data-testid="save-password">
              {change.isPending ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
