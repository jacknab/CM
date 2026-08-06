import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Globe, Copy, Check, ExternalLink, Link2, QrCode, Loader2, Smartphone, LayoutList, Layout, Users, User, Pencil } from "lucide-react";
import { QRCodeImage } from "@/components/ui/qr-code";
import { BookingInstructionsCard } from "@/components/BookingInstructionsCard";
import html2canvas from "html2canvas";
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStaffList } from "@/hooks/use-staff";

/** Convert a salon name to a Yelp-style slug: lowercase, hyphens, alphanumeric only */
function toYelpSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")                     // decompose accented chars
    .replace(/[\u0300-\u036f]/g, "")      // strip accent marks
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")        // keep letters, digits, spaces, hyphens
    .trim()
    .replace(/[\s]+/g, "-")              // spaces → hyphens
    .replace(/-{2,}/g, "-")             // collapse multiple hyphens
    .replace(/^-|-$/g, "");             // trim leading/trailing hyphens
}

export default function OnlineBooking() {
    const qrRef = useRef<HTMLDivElement>(null);
    const [showInstructions, setShowInstructions] = useState<"Google" | "Instagram" | "Facebook" | null>(null);
  const { isLoading: authLoading } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: staffList } = useStaffList();
  const [copiedStaffId, setCopiedStaffId] = useState<number | null>(null);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [slug, setSlug] = useState("");
  const [theme, setTheme] = useState("simple");
  const [copied, setCopied] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  useEffect(() => {
    if (selectedStore?.bookingSlug) {
      setSlug(selectedStore.bookingSlug);
    } else if (selectedStore?.name) {
      setSlug(toYelpSlug(selectedStore.name));
    }
    if (selectedStore?.bookingTheme) {
      setTheme(selectedStore.bookingTheme);
    }
  }, [selectedStore?.id]);

  const baseUrl = window.location.origin;

  // savedSlug = what is persisted in the DB (drives live URL, QR, embed, copy actions)
  // slug = draft input state (what the owner is currently typing)
  const savedSlug = selectedStore?.bookingSlug ?? "";
  const savedSubdomainUrl = savedSlug ? `https://www.certxa.com/book/${savedSlug}` : "";
  const savedDisplayDomain = savedSlug ? `certxa.com/book/${savedSlug}` : "";

  const embedSnippet = useMemo(() => {
    if (!staffList || !savedSlug) return "";
    const active = staffList.filter(
      (m) => (m as any).status !== "deactivated" && (m as any).status !== "removed"
    ).slice(0, 4);
    if (!active.length) return "";
    const cards = active.map((member) => {
      const staffUrl = `${baseUrl}/book/${savedSlug}?staff=${member.id}`;
      const bio = ((member as any).bio || "Book an appointment with me today.").replace(/"/g, "&quot;");
      const photoHtml = (member as any).avatarUrl
        ? `<img src="${(member as any).avatarUrl}" alt="${member.name}" style="width:100%;height:180px;object-fit:cover;display:block;" />`
        : `<div style="width:100%;height:180px;background:linear-gradient(135deg,#f3f4f6,#e5e7eb);display:flex;align-items:center;justify-content:center;font-size:2.5rem;">&#128100;</div>`;
      return `  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);text-align:center;">
    ${photoHtml}
    <div style="padding:20px 16px;">
      <h3 style="margin:0 0 6px;font-size:1rem;font-weight:700;color:#111;">${member.name}</h3>
      <p style="margin:0 0 16px;font-size:0.8rem;color:#6b7280;line-height:1.5;">${bio}</p>
      <a href="${staffUrl}" target="_blank" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:0.8rem;font-weight:600;">Book with me</a>
    </div>
  </div>`;
    }).join("\n");
    return `<!-- Certxa Team Booking Cards — paste anywhere on your website -->
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px;max-width:960px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${cards}
</div>`;
  }, [staffList, savedSlug, baseUrl]);

  const saveSlug = useMutation({
    mutationFn: async (newSlug: string) => {
      const res = await fetch(`/api/stores/${selectedStore!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingSlug: newSlug }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      toast({ title: "Booking link saved", description: `Your booking page is live at ${savedSubdomainUrl}` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const saveThemeMutation = useMutation({
    mutationFn: async (newTheme: string) => {
      const res = await fetch(`/api/stores/${selectedStore!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingTheme: newTheme }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        const msg = data.details ? `${data.message}: ${data.details}` : (data.message || "Failed to save theme");
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      toast({ title: "Theme saved", description: "Your booking page appearance has been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save theme", description: err.message, variant: "destructive" });
    },
  });

  const checkSlugAvailability = async (value: string) => {
    if (!value || value === selectedStore?.bookingSlug) {
      setSlugAvailable(null);
      return;
    }
    setCheckingSlug(true);
    try {
      const res = await fetch(`/api/public/check-slug/${value}`);
      const data = await res.json();
      setSlugAvailable(data.available);
    } catch {
      setSlugAvailable(null);
    }
    setCheckingSlug(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (slug && slug !== selectedStore?.bookingSlug) {
        checkSlugAvailability(slug);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [slug]);

  const handleSlugChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(sanitized);
    setSlugAvailable(null);
  };

  const handleSave = () => {
    if (!slug.trim()) return;
    saveSlug.mutate(slug);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(savedSubdomainUrl);
    setCopied(true);
    toast({ title: "Link copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  if (authLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isSaved = selectedStore?.bookingSlug === slug;

  return (
    <AppLayout>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Online Booking</h1>
        <p className="text-muted-foreground mt-1 mb-6">Set up your online booking page for clients.</p>
      </div>
      <div className="max-w-7xl space-y-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-1" data-testid="text-booking-link-title">Booking Link</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Your unique booking page address. Share it on social media, Google, or add a "Book Now" button to your website.
          </p>

          {/* Always-editable slug field — Yelp-style */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Your booking URL handle</label>
            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-md bg-background overflow-hidden flex-1 max-w-md focus-within:ring-2 focus-within:ring-ring focus-within:border-ring">
                <span className="text-sm text-muted-foreground pl-3 pr-1 whitespace-nowrap select-none">certxa.com/book/</span>
                <Input
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  className="border-0 focus-visible:ring-0 shadow-none flex-1 min-w-0 px-1"
                  placeholder="joes-nail-salon"
                  data-testid="input-booking-slug"
                />
              </div>
              <Button
                onClick={handleSave}
                disabled={!slug.trim() || isSaved || saveSlug.isPending || (slugAvailable === false)}
                data-testid="button-save-slug"
              >
                {saveSlug.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : isSaved ? "Saved" : "Save"}
              </Button>
            </div>

            {/* Availability feedback — only shown when slug differs from saved */}
            {slug && !isSaved && (
              <div>
                {checkingSlug && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking availability…
                  </p>
                )}
                {!checkingSlug && slugAvailable === true && (
                  <p className="text-xs text-green-600 flex items-center gap-1" data-testid="text-slug-available">
                    <Check className="w-3 h-3" /> This handle is available
                  </p>
                )}
                {!checkingSlug && slugAvailable === false && (
                  <p className="text-xs text-red-500" data-testid="text-slug-taken">This handle is already taken — try another</p>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Only lowercase letters, numbers, and hyphens. You can change this anytime.
            </p>
          </div>

          {/* Live URL display + QR — shown once slug is saved */}
          {selectedStore?.bookingSlug && (
            <div className="mt-5 pt-5 border-t space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Your booking page</p>
                  <div className="flex items-center gap-2">
                    <a
                      href={savedSubdomainUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm font-medium break-all"
                      data-testid="link-subdomain-url"
                    >
                      {savedSubdomainUrl}
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={handleCopy}
                      data-testid="button-copy-subdomain-link"
                      title="Copy booking URL"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                    <a href={savedSubdomainUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" title="Open booking page">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                  </div>
                  <Badge variant="secondary" className="no-default-active-elevate text-green-600 mt-2">
                    <Check className="w-3 h-3 mr-1" /> Active
                  </Badge>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div ref={qrRef}>
                    <QRCodeImage value={savedSubdomainUrl} size={100} />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={async () => {
                      if (!qrRef.current) return;
                      const canvas = qrRef.current.querySelector("canvas");
                      if (!canvas) return;
                      const url = canvas.toDataURL("image/png");
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `booking-qr-${savedSlug}.png`;
                      link.click();
                    }}
                  >
                    Download QR
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>

        {selectedStore?.bookingSlug && staffList && staffList.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Team Booking Links</h3>
                <p className="text-sm text-muted-foreground">Give each team member their own direct booking link</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4 mt-2">
              Clients can use these links to book directly with a specific team member — perfect for placing on your website next to each stylist's profile.
            </p>
            <div className="space-y-3">
              {staffList.map((member) => {
                const staffUrl = `${baseUrl}/book/${savedSlug}?staff=${member.id}`;
                const isCopied = copiedStaffId === member.id;
                return (
                  <div key={member.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        {(member as any).avatarUrl ? (
                          <img src={(member as any).avatarUrl} alt={member.name} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <User className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{member.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{staffUrl}</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(staffUrl);
                        setCopiedStaffId(member.id);
                        toast({ title: `Link copied for ${member.name}` });
                        setTimeout(() => setCopiedStaffId(null), 2000);
                      }}
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span className="ml-1.5">{isCopied ? "Copied" : "Copy"}</span>
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700 font-medium">How to use</p>
              <p className="text-xs text-blue-600 mt-0.5">Add a "Book with me" button on your website next to each team member's photo and paste their individual link as the button URL.</p>
            </div>
          </Card>
        )}

        {selectedStore?.bookingSlug && embedSnippet && (
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-violet-50 flex items-center justify-center">
                <Link2 className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Embed Staff Cards on Your Website</h3>
                <p className="text-sm text-muted-foreground">A ready-to-paste HTML block for your own website</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2 mb-4">
              Copy this snippet and paste it into your website's HTML editor. It shows each team member's photo, name, bio, and a direct "Book with me" button — no coding needed.
            </p>
            <div className="relative rounded-lg overflow-hidden border bg-muted/40">
              <pre className="text-xs font-mono p-4 overflow-x-auto max-h-52 text-muted-foreground whitespace-pre leading-relaxed">
                {embedSnippet}
              </pre>
              <div className="absolute top-2 right-2">
                <Button
                  size="sm"
                  variant={copiedEmbed ? "default" : "outline"}
                  className={copiedEmbed ? "bg-green-600 hover:bg-green-600 text-white" : "bg-background"}
                  onClick={() => {
                    navigator.clipboard.writeText(embedSnippet);
                    setCopiedEmbed(true);
                    toast({ title: "HTML snippet copied", description: "Paste it into your website's code editor." });
                    setTimeout(() => setCopiedEmbed(false), 2500);
                  }}
                >
                  {copiedEmbed ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                  {copiedEmbed ? "Copied!" : "Copy HTML"}
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {["WordPress", "Squarespace", "Wix"].map((platform) => (
                <div key={platform} className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/20 text-xs text-muted-foreground">
                  <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  Works with {platform}
                </div>
              ))}
            </div>
          </Card>
        )}

        {selectedStore?.bookingSlug && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-3">Booking Page Appearance</h3>
            <p className="text-sm text-muted-foreground mb-4">Choose a layout for your public booking page.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div 
                className={`border rounded-lg p-4 cursor-pointer hover:border-primary transition-colors flex items-start gap-3 ${theme === 'simple' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card'}`}
                onClick={() => setTheme('simple')}
              >
                <div className={`p-2 rounded-full ${theme === 'simple' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <LayoutList className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold">Simple Theme</div>
                  <div className="text-sm text-muted-foreground mt-1">Clean, list-based layout focused on simplicity.</div>
                </div>
              </div>
              <div 
                className={`border rounded-lg p-4 cursor-pointer hover:border-primary transition-colors flex items-start gap-3 ${theme === 'mobile' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card'}`}
                onClick={() => setTheme('mobile')}
              >
                <div className={`p-2 rounded-full ${theme === 'mobile' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold">Mobile App UI</div>
                  <div className="text-sm text-muted-foreground mt-1">Modern, app-like experience with grid navigation.</div>
                </div>
              </div>
              <div 
                className={`border rounded-lg p-4 cursor-pointer hover:border-primary transition-colors flex items-start gap-3 ${theme === 'classic' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card'}`}
                onClick={() => setTheme('classic')}
              >
                <div className={`p-2 rounded-full ${theme === 'classic' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <Layout className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold">Classic Theme</div>
                  <div className="text-sm text-muted-foreground mt-1">Traditional stepped booking experience with focus on clarity.</div>
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button 
                onClick={() => saveThemeMutation.mutate(theme)} 
                disabled={theme === selectedStore?.bookingTheme || saveThemeMutation.isPending}
              >
                {saveThemeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Appearance
              </Button>
            </div>
          </Card>
        )}

        {selectedStore?.bookingSlug && (
          <>
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-3">Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <BookingInstructionsCard platform="Google" onOpen={() => setShowInstructions("Google")} />
                <BookingInstructionsCard platform="Instagram" onOpen={() => setShowInstructions("Instagram")} />
                <BookingInstructionsCard platform="Facebook" onOpen={() => setShowInstructions("Facebook")} />
              </div>
            </Card>
            {showInstructions && (
              <Card className="p-6 mt-4">
                <h3 className="text-lg font-semibold mb-3">How to add your booking link to {showInstructions}</h3>
                <ol className="list-decimal pl-6 space-y-2 text-sm">
                  {showInstructions === "Google" && (
                    <>
                      <li>Open your Google My Business profile.</li>
                      <li>Go to the Info section.</li>
                      <li>Find the "Website" or "Booking" field.</li>
                      <li>Paste your booking link: <span className="font-mono bg-muted px-1 rounded">{savedDisplayDomain}</span></li>
                      <li>Save changes.</li>
                    </>
                  )}
                  {showInstructions === "Instagram" && (
                    <>
                      <li>Open your Instagram profile.</li>
                      <li>Tap "Edit Profile".</li>
                      <li>Find the "Website" field.</li>
                      <li>Paste your booking link: <span className="font-mono bg-muted px-1 rounded">{savedDisplayDomain}</span></li>
                      <li>Save changes.</li>
                    </>
                  )}
                  {showInstructions === "Facebook" && (
                    <>
                      <li>Open your Facebook business page.</li>
                      <li>Click "Edit Page Info".</li>
                      <li>Find the "Website" or "Book Now" button settings.</li>
                      <li>Paste your booking link: <span className="font-mono bg-muted px-1 rounded">{savedDisplayDomain}</span></li>
                      <li>Save changes.</li>
                    </>
                  )}
                </ol>
                <Button variant="outline" className="mt-4" onClick={() => setShowInstructions(null)}>Close</Button>
              </Card>
            )}
          </>
        )}

        {!selectedStore && (
          <Card className="p-6 text-center">
            <Globe className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Select a store to configure online booking.</p>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
