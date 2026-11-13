import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, User as UserIcon, Upload } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useInSettingsShell } from "@/lib/settings-shell-context";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface OwnerProfile {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string;
  profileImageUrl: string | null;
}

export default function PersonalDetailsPage() {
  const { toast } = useToast();
  const inShell = useInSettingsShell();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<{ user: OwnerProfile }>({
    queryKey: ["/api/manage/overview"],
    queryFn: async () => {
      const res = await fetch("/api/manage/overview", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });
  const user = data?.user;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setPhoto(user.profileImageUrl ?? null);
  }, [user]);

  const dirty =
    !!user &&
    (firstName !== (user.firstName ?? "") ||
      lastName !== (user.lastName ?? "") ||
      photo !== (user.profileImageUrl ?? null));

  const save = useMutation({
    mutationFn: (body: Record<string, string | null>) => apiRequest("PATCH", "/api/manage/profile", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manage/overview"] });
      toast({ title: "Personal details saved" });
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/uploads/image", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error("upload failed");
      const { url } = await res.json();
      setPhoto(url);
    } catch {
      toast({ title: "Image upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  if (isLoading || !user) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
        {!inShell && (
          <header className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Personal Details</h1>
            <p className="mt-1 text-sm text-muted-foreground">Your name, photo and contact info as the account owner.</p>
          </header>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ firstName, lastName, profileImageUrl: photo });
          }}
          className="space-y-8"
        >
          <div className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-6">
            {/* Photo */}
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted">
                {photo ? (
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserIcon className="h-9 w-9 text-muted-foreground" />
                )}
              </div>
              <div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {photo ? "Replace image" : "Upload image"}
                </Button>
                {photo && (
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    className="ml-3 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[15px] font-medium">First name</label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="text-[15px]" data-testid="input-first-name" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[15px] font-medium">Last name</label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="text-[15px]" data-testid="input-last-name" />
              </div>
            </div>

            <MobileNumberField current={user.phone} />

            <div className="space-y-1.5">
              <label className="text-[15px] font-medium">Account email</label>
              <Input value={user.email} disabled className="text-[15px]" />
              <p className="text-[13px] text-muted-foreground">
                You sign in with this address, and billing and subscription notices are sent here.
                The account email can't be changed.
              </p>
            </div>

            <ExtraEmailsField />
          </div>

          <div className="flex items-center justify-end gap-3">
            {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
            <Button type="submit" disabled={!dirty || save.isPending} data-testid="save-personal-details">
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}

const fmtPhone = (digits: string | null) => {
  const d = (digits ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d || "None";
};

/**
 * The account's mobile number (owner, 2026-11-13): read-only here. Changing it needs the new mobile number and the
 * 6-digit code texted to it (POST /api/account/phone/send-code + verify); a number another Certxa account has ever
 * had is refused. Stops free-trial abuse.
 */
function MobileNumberField({ current }: { current: string | null }) {
  const { toast } = useToast();
  const [step, setStep] = useState<"view" | "number" | "code">("view");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const digits = number.replace(/\D/g, "");

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Something went wrong. Please try again.");
    return data;
  };
  const sendCode = async () => {
    setBusy(true); setError("");
    try { await post("/api/account/phone/send-code", { phone: digits }); setStep("code"); setCode(""); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setError("");
    try {
      await post("/api/account/phone/verify", { phone: digits, code: code.trim() });
      await queryClient.invalidateQueries({ queryKey: ["/api/manage/overview"] });
      toast({ title: "Mobile number changed" });
      setStep("view"); setNumber(""); setCode("");
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const cancel = () => { setStep("view"); setNumber(""); setCode(""); setError(""); };

  return (
    <div className="space-y-1.5" data-testid="owner-mobile">
      <label className="text-[15px] font-medium">Mobile number</label>
      {step === "view" ? (
        <div className="flex items-center gap-3">
          <Input value={fmtPhone(current)} disabled className="text-[15px]" data-testid="input-owner-phone" />
          <Button type="button" variant="outline" onClick={() => setStep("number")} data-testid="button-change-phone">Change number</Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-border p-3">
          {step === "number" ? (
            <>
              <p className="text-[13px] text-muted-foreground">Enter your new mobile number. We'll text it a 6-digit code.</p>
              <Input type="tel" inputMode="tel" autoFocus value={number} onChange={(e) => setNumber(e.target.value)} placeholder="(555) 555-5555" className="text-[15px]" data-testid="input-new-phone" />
              <div className="flex gap-2">
                <Button type="button" disabled={busy || digits.length !== 10} onClick={() => void sendCode()} data-testid="button-send-phone-code">{busy ? "Sending…" : "Text me a code"}</Button>
                <Button type="button" variant="ghost" onClick={cancel}>Cancel</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[13px] text-muted-foreground">Enter the 6-digit code we texted to {fmtPhone(digits)}.</p>
              <Input inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" className="text-[15px]" data-testid="input-phone-code" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy || code.length !== 6} onClick={() => void verify()} data-testid="button-verify-phone-code">{busy ? "Checking…" : "Confirm"}</Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => void sendCode()}>Send a new code</Button>
                <Button type="button" variant="ghost" onClick={cancel}>Cancel</Button>
              </div>
            </>
          )}
          {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
        </div>
      )}
      <p className="text-[13px] text-muted-foreground">The number you verified with a text code. A new number must receive a code too. Separate from the business phone.</p>
    </div>
  );
}

type ExtraEmail = { id: number; email: string; confirmed: boolean };

/**
 * Extra account e-mails (owner, 2026-11-13): the login e-mail never changes, but the owner can add other addresses.
 * Each one confirms by a link e-mailed to it; after that, every e-mail Certxa sends to the account also goes there.
 * Server: /api/manage/emails (lib/accountEmails.ts).
 */
function ExtraEmailsField() {
  const { toast } = useToast();
  const { data } = useQuery<{ login: string | null; extras: ExtraEmail[] }>({
    queryKey: ["/api/manage/emails"],
    queryFn: async () => {
      const res = await fetch("/api/manage/emails", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load e-mails");
      return res.json();
    },
  });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const extras = data?.extras ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/manage/emails"] });

  const add = async (address: string, key: string) => {
    setBusy(key); setError("");
    try {
      const res = await fetch("/api/manage/emails", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: address }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Couldn't add that e-mail.");
      toast({ title: "Confirmation e-mail sent", description: `Open the link sent to ${address} to start receiving account e-mails there.` });
      if (key === "add") setEmail("");
      await refresh();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };
  const remove = async (x: ExtraEmail) => {
    setBusy(`rm-${x.id}`); setError("");
    try {
      const res = await fetch(`/api/manage/emails/${x.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Couldn't remove that e-mail.");
      await refresh();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-2" data-testid="extra-emails">
      <label className="text-[15px] font-medium">Also send account e-mails to</label>
      {extras.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {extras.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-testid="extra-email-row">
              <span className="min-w-0 flex-1 truncate text-[15px]">{x.email}</span>
              <span className="text-[13px] text-muted-foreground">{x.confirmed ? "Confirmed" : "Waiting for confirmation"}</span>
              {!x.confirmed && (
                <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void add(x.email, `re-${x.id}`)}>
                  {busy === `re-${x.id}` ? "Sending…" : "Resend link"}
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void remove(x)} data-testid="button-remove-extra-email">
                {busy === `rm-${x.id}` ? "Removing…" : "Remove"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="another@email.com" className="text-[15px]" data-testid="input-extra-email" />
        <Button type="button" variant="outline" disabled={busy !== null || !email.includes("@")} onClick={() => void add(email.trim(), "add")} data-testid="button-add-extra-email">
          {busy === "add" ? "Adding…" : "Add"}
        </Button>
      </div>
      {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
      <p className="text-[13px] text-muted-foreground">
        Every e-mail Certxa sends to your account also goes to these addresses once each one is confirmed. Your sign-in e-mail stays the same.
      </p>
    </div>
  );
}
