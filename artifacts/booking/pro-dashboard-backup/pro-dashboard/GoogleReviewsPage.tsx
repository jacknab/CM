import { useContext, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StoreContext } from "@/hooks/use-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { GoogleBusinessProfileSetup } from "@/components/GoogleBusinessProfileSetup";
import { GoogleReviewsManager } from "@/components/GoogleReviewsManager";
import { Building2, Star, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function GoogleReviewsPage() {
  const ctx = useContext(StoreContext);
  const store = ctx?.selectedStore;
  const storeId = store?.id ?? null;
  const [activeTab, setActiveTab] = useState<string>("reviews");
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: googleProfile, isLoading: profileLoading } = useQuery({
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

  const isConnected = !!googleProfile?.isConnected;

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/google-business/profile/${storeId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Failed to disconnect");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-business/profile", storeId] });
      toast({ title: "Google Business disconnected", description: "Your account has been unlinked and all synced review data removed." });
    },
    onError: (err: any) => {
      toast({ title: "Disconnect failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 max-w-5xl flex flex-col min-h-[calc(100vh-6rem)]">
      <div className="mb-6">
        <h1 className="text-xl font-extrabold text-white">Google Business Profile</h1>
        <p className="text-white/40 text-xs mt-0.5">
          Connect your Google Business Profile to manage and respond to customer reviews
        </p>
      </div>

      {!storeId ? (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-2xl p-5 text-amber-300 text-sm">
          No store found. Complete onboarding to connect your Google Business Profile.
        </div>
      ) : (
        <div className="flex flex-col flex-1">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1">
            <TabsList className="mb-6 bg-white/5 border border-white/10">
              <TabsTrigger value="setup" className="gap-2 data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
                <Building2 size={14} />
                Connection
              </TabsTrigger>
              <TabsTrigger value="reviews" className="gap-2 data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
                <Star size={14} />
                Reviews
              </TabsTrigger>
            </TabsList>

            <TabsContent value="setup">
              <GoogleBusinessProfileSetup
                storeId={storeId}
                onConnectSuccess={() => setActiveTab("reviews")}
              />
            </TabsContent>

            <TabsContent value="reviews" className="flex-1">
              <GoogleReviewsManager storeId={storeId} />
            </TabsContent>
          </Tabs>

          {/* ── Connection status footer ─────────────────────────────────────── */}
          <div className="mt-10 pt-6 border-t border-white/10">
            {profileLoading ? null : isConnected ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                  <span className="text-sm text-white/70 font-medium">
                    Connected
                    {googleProfile?.accountEmail && (
                      <span className="text-white/40 font-normal ml-1.5">— {googleProfile.accountEmail}</span>
                    )}
                  </span>
                </div>
                <div className="text-xs text-white/35 leading-relaxed max-w-lg">
                  To disconnect your Google Business account, revoke access in your{" "}
                  <a
                    href="https://myaccount.google.com/permissions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/55 underline underline-offset-2 hover:text-white/80 transition-colors"
                  >
                    Google Account permissions
                  </a>
                  , then{" "}
                  <button
                    onClick={() => setShowDisconnectDialog(true)}
                    disabled={disconnectMutation.isPending}
                    className="text-white/55 underline underline-offset-2 hover:text-white/80 transition-colors disabled:opacity-50"
                  >
                    {disconnectMutation.isPending ? "Disconnecting…" : "disconnect here"}
                  </button>
                  . Disconnecting removes all synced review data from Certxa.
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white/20" />
                </span>
                <span className="text-sm text-white/35">Not connected</span>
              </div>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Google Business?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unlink your Google Business account and remove all synced review data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setShowDisconnectDialog(false); disconnectMutation.mutate(); }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
