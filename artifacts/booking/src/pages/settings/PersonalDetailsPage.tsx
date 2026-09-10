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
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setPhone(user.phone ?? "");
    setPhoto(user.profileImageUrl ?? null);
  }, [user]);

  const dirty =
    !!user &&
    (firstName !== (user.firstName ?? "") ||
      lastName !== (user.lastName ?? "") ||
      phone !== (user.phone ?? "") ||
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
            save.mutate({ firstName, lastName, phone, profileImageUrl: photo });
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

            <div className="space-y-1.5">
              <label className="text-[15px] font-medium">Phone</label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                className="text-[15px]"
                data-testid="input-owner-phone"
              />
              <p className="text-[13px] text-muted-foreground">Your personal number — separate from the business phone.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[15px] font-medium">Account email</label>
              <Input value={user.email} disabled className="text-[15px]" />
              <p className="text-[13px] text-muted-foreground">
                You sign in with this address, and billing and subscription notices are sent here.
                Contact support to change it.
              </p>
            </div>
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
