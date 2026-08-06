import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Star,
  Trash2,
  Eye,
  EyeOff,
  StarIcon,
  Search,
  Copy,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Review } from "@shared/schema";
import { GoogleConnectGate } from "@/components/GoogleConnectGate";
import { GoogleBusinessProfileSetup } from "@/components/GoogleBusinessProfileSetup";
import { GoogleReviewsManager } from "@/components/GoogleReviewsManager";
import { YelpConnectGate } from "@/components/YelpConnectGate";
import { YelpAliasForm } from "@/components/YelpAliasForm";
import { FacebookConnectGate } from "@/components/FacebookConnectGate";
import { FacebookPageForm } from "@/components/FacebookPageForm";

type ReviewStats = {
  total: number;
  avg: number;
  distribution: Record<number, number>;
};

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  access_denied:   "Google access was denied. Please try again and accept the permissions.",
  csrf_mismatch:   "Security token mismatch. Please start the connection flow again.",
  missing_store:   "Could not identify which store to connect. Please try again.",
  quota_exceeded:  "Google Business Profile API quota exceeded. Contact Google to request a quota increase.",
  no_access_token: "Google did not return an access token. Please try again.",
  server_error:    "An unexpected server error occurred during Google sign-in. Please try again.",
  missing_params:  "Google redirect was missing required parameters. Please try again.",
  invalid_state:   "Invalid OAuth state token. Please start the connection flow again.",
};

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const sz = size === "lg" ? "h-6 w-6" : "h-4 w-4";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(sz, s <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30")}
        />
      ))}
    </div>
  );
}

export default function Reviews() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [gateStep, setGateStep] = useState<"google" | "google-setup" | "yelp" | "yelp-form" | "facebook" | "facebook-form" | "done">("google");
  const [googleConnecting, setGoogleConnecting] = useState(false);

  // Detect OAuth redirect params on mount (?google_connected=1 or ?google_error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleConnected = params.get("google_connected");
    const googleError     = params.get("google_error");

    if (googleConnected || googleError) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (googleConnected === "1") {
      setGateStep("google-setup");
      return;
    }

    if (googleError) {
      const message = GOOGLE_ERROR_MESSAGES[googleError] ?? `Google authorization error: ${googleError}`;
      toast({ title: "Google connection failed", description: message, variant: "destructive" });
    }
  }, []);

  const { data: googleProfile, isLoading: googleLoading } = useQuery({
    queryKey: ["/api/google-business/profile", storeId],
    queryFn: async () => {
      if (!storeId) return null;
      const res = await fetch(`/api/google-business/profile/${storeId}`, { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      return data.profile ?? null;
    },
    enabled: !!storeId,
  });

  const isGoogleConnected = !!googleProfile?.isConnected;
  const tokenExpiredByClock = googleProfile?.tokenExpiresAt
    ? new Date(googleProfile.tokenExpiresAt) < new Date()
    : false;
  const canAutoRefresh = googleProfile?.canAutoRefresh !== false;
  const isTokenExpired = tokenExpiredByClock && !canAutoRefresh;

  // If Google is already fully connected, skip the google gate
  const effectiveStep = !googleLoading && isGoogleConnected && gateStep === "google"
    ? "done"
    : gateStep;

  // When GoogleBusinessProfileSetup finishes (location connected), advance the gate
  useEffect(() => {
    if (isGoogleConnected && gateStep === "google-setup") {
      setGateStep("yelp");
    }
  }, [isGoogleConnected, gateStep]);

  async function handleGoogleConnect() {
    if (!storeId) return;
    setGoogleConnecting(true);
    try {
      const res = await fetch(`/api/google-business/auth-url?storeId=${storeId}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Could not start Google sign-in", description: data.message, variant: "destructive" });
        setGoogleConnecting(false);
        return;
      }
      window.location.href = data.authUrl;
    } catch {
      toast({ title: "Could not start Google sign-in", description: "Please try again.", variant: "destructive" });
      setGoogleConnecting(false);
    }
  }

  const { data: reviewsData = [] } = useQuery<Review[]>({
    queryKey: ["/api/reviews", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch reviews");
      return res.json();
    },
    enabled: !!storeId,
  });

  const { data: stats } = useQuery<ReviewStats>({
    queryKey: ["/api/reviews/stats", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/stats?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!storeId,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: number; field: "isPublic" | "isFeatured"; value: boolean }) => {
      const res = await apiRequest("PUT", `/api/reviews/${id}`, { [field]: value });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reviews", storeId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/reviews/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reviews", storeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/stats", storeId] });
      toast({ title: "Review deleted" });
    },
  });

  const copyLink = (appointmentId: number | null) => {
    if (!appointmentId) return;
    navigator.clipboard.writeText(`${window.location.origin}/review/${appointmentId}`);
    toast({ title: "Review link copied!" });
  };

  const shareReviewAsImage = (review: Review) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
    grad.addColorStop(0, "#1e1b4b");
    grad.addColorStop(1, "#312e81");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1080);

    // White card
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath();
    ctx.roundRect(80, 80, 920, 920, 32);
    ctx.fill();

    // Stars
    const starY = 220;
    const starSize = 52;
    const starGap = 12;
    const totalStarW = review.rating * starSize + (review.rating - 1) * starGap;
    let sx = (1080 - totalStarW) / 2;
    ctx.fillStyle = "#facc15";
    for (let i = 0; i < review.rating; i++) {
      ctx.font = `${starSize}px serif`;
      ctx.textAlign = "left";
      ctx.fillText("★", sx, starY);
      sx += starSize + starGap;
    }

    // Review text
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 52px sans-serif";
    ctx.textAlign = "center";
    const comment = review.comment ? `"${review.comment}"` : "";
    const maxW = 820;
    const words = comment.split(" ");
    const lines: string[] = [];
    let currentLine = "";
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxW && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    const lineH = 68;
    const textStartY = 320;
    lines.slice(0, 6).forEach((line, i) => {
      ctx.fillText(line, 540, textStartY + i * lineH);
    });

    // Client name
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "36px sans-serif";
    ctx.fillText(`— ${review.customerName || "Anonymous"}`, 540, textStartY + Math.min(lines.length, 6) * lineH + 60);

    // Store name at bottom
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "28px sans-serif";
    ctx.fillText("Powered by Certxa", 540, 950);

    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `review-${review.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Review graphic downloaded!", description: "Ready to share on Instagram or Facebook." });
    }, "image/png");
  };

  const filtered = reviewsData.filter((r) => {
    if (filterRating && r.rating !== filterRating) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.customerName?.toLowerCase().includes(q) ||
        r.comment?.toLowerCase().includes(q) ||
        r.serviceName?.toLowerCase().includes(q) ||
        r.staffName?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const ratingPercent = (star: number) => {
    if (!stats || stats.total === 0) return 0;
    return Math.round(((stats.distribution[star] || 0) / stats.total) * 100);
  };

  // ── Gate screens ─────────────────────────────────────────────────────────────

  if (effectiveStep === "google") {
    return (
      <AppLayout>
        <GoogleConnectGate
          onConnect={handleGoogleConnect}
          onSkip={() => setGateStep("yelp")}
          loading={googleConnecting}
        />
      </AppLayout>
    );
  }

  if (effectiveStep === "google-setup") {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto py-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold">Finish connecting Google</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Select the business account and location to link with your store.
            </p>
          </div>
          <GoogleBusinessProfileSetup storeId={storeId} />
        </div>
      </AppLayout>
    );
  }

  if (effectiveStep === "yelp") {
    return (
      <AppLayout>
        <YelpConnectGate
          onConnect={() => setGateStep("yelp-form")}
          onSkip={() => setGateStep("facebook")}
        />
      </AppLayout>
    );
  }

  if (effectiveStep === "yelp-form") {
    return (
      <AppLayout>
        <YelpAliasForm
          storeId={storeId}
          onSave={() => setGateStep("facebook")}
          onSkip={() => setGateStep("facebook")}
        />
      </AppLayout>
    );
  }

  if (effectiveStep === "facebook") {
    return (
      <AppLayout>
        <FacebookConnectGate
          onConnect={() => setGateStep("facebook-form")}
          onSkip={() => setGateStep("done")}
        />
      </AppLayout>
    );
  }

  if (effectiveStep === "facebook-form") {
    return (
      <AppLayout>
        <FacebookPageForm
          storeId={storeId}
          onSave={() => setGateStep("done")}
          onSkip={() => setGateStep("done")}
        />
      </AppLayout>
    );
  }

  // ── Main reviews view ─────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-10">

        {/* ── Google Reviews section (only when connected) ────────────────────── */}
        {isGoogleConnected && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <GoogleColorIcon />
                  Google Reviews
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Synced from your Google Business Profile — auto-updates every 6 hours
                </p>
              </div>

              {/* Reconnect button when token is expired */}
              {isTokenExpired && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGoogleConnect}
                  disabled={googleConnecting}
                  className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  {googleConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Reconnect Google
                </Button>
              )}
            </div>

            {/* Expired token warning */}
            {isTokenExpired && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">Google connection needs renewal.</span>{" "}
                  Your access token has expired — review syncing is paused.{" "}
                  <button className="underline font-medium" onClick={handleGoogleConnect} disabled={googleConnecting}>
                    Reconnect Google
                  </button>{" "}
                  to resume.
                </div>
              </div>
            )}

            <GoogleReviewsManager storeId={storeId} />
          </section>
        )}

        {/* ── Divider between sections (only when Google is connected) ─────────── */}
        {isGoogleConnected && (
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-muted" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-4 text-xs text-muted-foreground uppercase tracking-widest">
                Client reviews collected via Certxa
              </span>
            </div>
          </div>
        )}

        {/* ── Client reviews section ────────────────────────────────────────────── */}
        <section className="space-y-6">
          {!isGoogleConnected && (
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold">Client Reviews</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Collect and manage feedback from your clients
                </p>
              </div>
            </div>
          )}

          {/* Stats cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 flex flex-col items-center gap-1">
              <p className="text-4xl font-bold text-primary">{stats?.avg?.toFixed(1) ?? "—"}</p>
              <StarRating rating={Math.round(stats?.avg ?? 0)} size="lg" />
              <p className="text-sm text-muted-foreground mt-1">Average Rating</p>
            </Card>
            <Card className="p-5 flex flex-col items-center justify-center gap-1">
              <p className="text-4xl font-bold">{stats?.total ?? 0}</p>
              <p className="text-sm text-muted-foreground">Total Reviews</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-medium mb-3">Rating Distribution</p>
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-2 text-right text-muted-foreground">{star}</span>
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                    <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 rounded-full transition-all"
                        style={{ width: `${ratingPercent(star)}%` }}
                      />
                    </div>
                    <span className="w-6 text-muted-foreground">{stats?.distribution[star] ?? 0}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* How to collect reviews */}
          <Card className="p-4 bg-muted/40 border-dashed">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">How to collect reviews</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  After completing an appointment, copy its review link and send it to your client via SMS or email.
                  The link takes them to a simple star-rating form — no account needed.
                </p>
              </div>
            </div>
          </Card>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by client, service, or comment..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1.5">
              {[null, 5, 4, 3, 2, 1].map((star) => (
                <Button
                  key={star ?? "all"}
                  size="sm"
                  variant={filterRating === star ? "default" : "outline"}
                  onClick={() => setFilterRating(star)}
                  className="gap-1"
                >
                  {star ? (
                    <>{star}<Star className="h-3 w-3 fill-current" /></>
                  ) : (
                    "All"
                  )}
                </Button>
              ))}
            </div>
          </div>

          {/* Reviews list */}
          {filtered.length === 0 ? (
            <Card className="p-12 text-center">
              <StarIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-medium text-muted-foreground">
                {reviewsData.length === 0 ? "No reviews yet" : "No reviews match your filters"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {reviewsData.length === 0
                  ? "Send review links to clients after their appointments"
                  : "Try adjusting your search or rating filter"}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((review) => (
                <Card key={review.id} className={cn("p-4", !review.isPublic && "opacity-60")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StarRating rating={review.rating} />
                        {review.isFeatured && (
                          <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                            Featured
                          </Badge>
                        )}
                        {!review.isPublic && (
                          <Badge variant="secondary" className="text-xs">Hidden</Badge>
                        )}
                      </div>
                      {review.comment && (
                        <p className="text-sm text-foreground leading-relaxed">&ldquo;{review.comment}&rdquo;</p>
                      )}
                      {review.photoUrl && (
                        <a href={review.photoUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-1">
                          <img
                            src={review.photoUrl}
                            alt="Review photo"
                            className="h-16 w-16 object-cover rounded-md border hover:opacity-90 transition-opacity"
                          />
                        </a>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span className="font-medium text-foreground">{review.customerName || "Anonymous"}</span>
                        {review.serviceName && <span>· {review.serviceName}</span>}
                        {review.staffName && <span>· with {review.staffName}</span>}
                        <span>· {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : ""}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {review.comment && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Download shareable graphic for Instagram/Facebook"
                          onClick={() => shareReviewAsImage(review)}
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                      )}
                      {review.appointmentId && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Copy review link"
                          onClick={() => copyLink(review.appointmentId)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title={review.isFeatured ? "Unfeature" : "Feature"}
                        onClick={() => toggleMutation.mutate({ id: review.id, field: "isFeatured", value: !review.isFeatured })}
                      >
                        <Star className={cn("h-4 w-4", review.isFeatured ? "fill-yellow-400 text-yellow-400" : "")} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title={review.isPublic ? "Hide review" : "Show review"}
                        onClick={() => toggleMutation.mutate({ id: review.id, field: "isPublic", value: !review.isPublic })}
                      >
                        {review.isPublic ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(review.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

function GoogleColorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}
