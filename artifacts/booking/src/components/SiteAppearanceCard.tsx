/**
 * The booking website's look (accent colour, photos, about text, Instagram, Facebook) on the web Online Booking
 * settings screen. The same settings and API as the Certxa Pro app's website setup (api-server routes/bookingSite.ts):
 * GET / PUT /api/booking-site and POST /api/booking-site/photo, for the salon chosen in the store switcher.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface SiteLook {
  accent?: string;
  coverImage?: string;
  logoImage?: string;
  aboutImage?: string;
  about?: string;
  instagram?: string;
  facebook?: string;
}

const FIELDS = ["accent", "coverImage", "logoImage", "aboutImage", "about", "instagram", "facebook"] as const;
type PhotoField = "coverImage" | "logoImage" | "aboutImage";

const PHOTOS: { key: PhotoField; label: string; hint: string }[] = [
  { key: "logoImage", label: "Profile photo or logo", hint: "Shown next to your business name." },
  { key: "coverImage", label: "Cover photo", hint: "Used by designs that show a cover." },
  { key: "aboutImage", label: "About photo", hint: "Shown on the About tab of the Solo design." },
];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function SiteAppearanceCard({ storeId }: { storeId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const key = [`/api/booking-site?storeId=${storeId}`];
  const { data, isLoading } = useQuery<{ site: SiteLook }>({ queryKey: key });
  const [look, setLook] = useState<SiteLook>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<PhotoField | null>(null);
  const fileInputs = useRef<Partial<Record<PhotoField, HTMLInputElement | null>>>({});

  useEffect(() => { if (data?.site) setLook(data.site); }, [data]);

  const saved = data?.site ?? {};
  const changed = FIELDS.some((f) => (look[f] ?? "") !== (saved[f] ?? ""));
  const set = (field: keyof SiteLook, value: string) => setLook((cur) => ({ ...cur, [field]: value }));

  const upload = async (field: PhotoField, file: File | undefined) => {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      toast({ title: "That photo is too large", description: "Choose a photo under 6 MB.", variant: "destructive" });
      return;
    }
    setUploading(field);
    try {
      const res = await fetch(`/api/booking-site/photo?storeId=${storeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: await readAsDataUrl(file), mimeType: file.type || "image/jpeg" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.message || "Could not save the photo.");
      set(field, body.url);
    } catch (err) {
      toast({ title: "Photo not saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      // Only what changed; an empty value removes the setting (the API's own rule).
      const site = Object.fromEntries(FIELDS.filter((f) => (look[f] ?? "") !== (saved[f] ?? "")).map((f) => [f, look[f] ?? ""]));
      const res = await fetch(`/api/booking-site?storeId=${storeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ site }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Could not save.");
      queryClient.setQueryData(key, body);
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      toast({ title: "Website look saved", description: "Your booking website shows the changes now." });
    } catch (err) {
      toast({ title: "Not saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6" data-testid="card-site-appearance">
      <h3 className="text-lg font-semibold mb-1">Website Look</h3>
      <p className="text-sm text-muted-foreground mb-5">Your colour, photos and details on your booking website.</p>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="site-accent">Accent colour</Label>
            <div className="flex items-center gap-3">
              <input
                id="site-accent-picker"
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(look.accent ?? "") ? look.accent : "#B45309"}
                onChange={(e) => set("accent", e.target.value)}
                className="h-10 w-12 cursor-pointer rounded border bg-transparent p-1"
                aria-label="Pick an accent colour"
              />
              <Input id="site-accent" value={look.accent ?? ""} onChange={(e) => set("accent", e.target.value.trim())} placeholder="#B45309" className="max-w-[140px]" data-testid="input-site-accent" />
              {look.accent ? <Button type="button" variant="ghost" size="sm" onClick={() => set("accent", "")}>Use the design's colour</Button> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PHOTOS.map(({ key: field, label, hint }) => (
              <div key={field} className="space-y-2">
                <Label>{label}</Label>
                <div className="aspect-[4/3] rounded-lg border bg-muted/30 overflow-hidden flex items-center justify-center">
                  {look[field] ? <img src={look[field]} alt={label} className="h-full w-full object-cover" /> : <span className="text-xs text-muted-foreground">No photo</span>}
                </div>
                <p className="text-xs text-muted-foreground">{hint}</p>
                <div className="flex gap-2">
                  <input ref={(el) => { fileInputs.current[field] = el; }} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden"
                    onChange={(e) => { upload(field, e.target.files?.[0]); e.target.value = ""; }} data-testid={`input-photo-${field}`} />
                  <Button type="button" variant="outline" size="sm" disabled={uploading !== null} onClick={() => fileInputs.current[field]?.click()}>
                    {uploading === field ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {look[field] ? "Change" : "Upload"}
                  </Button>
                  {look[field] ? <Button type="button" variant="ghost" size="sm" onClick={() => set(field, "")}>Remove</Button> : null}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="site-about">About</Label>
            <Textarea id="site-about" value={look.about ?? ""} maxLength={600} rows={4} onChange={(e) => set("about", e.target.value)}
              placeholder="A few words about your business." data-testid="input-site-about" />
            <p className="text-xs text-muted-foreground text-right">{(look.about ?? "").length}/600</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="site-instagram">Instagram</Label>
              <Input id="site-instagram" value={look.instagram ?? ""} onChange={(e) => set("instagram", e.target.value)} placeholder="@yourstudio" data-testid="input-site-instagram" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-facebook">Facebook</Label>
              <Input id="site-facebook" value={look.facebook ?? ""} onChange={(e) => set("facebook", e.target.value)} placeholder="yourstudio" data-testid="input-site-facebook" />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={!changed || saving || uploading !== null} data-testid="button-save-site-look">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Website Look
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
