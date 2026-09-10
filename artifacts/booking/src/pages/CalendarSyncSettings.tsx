import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Loader2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

type SyncDirection = "both" | "outbound" | "inbound";

interface CalendarConnection {
  id: number;
  provider: string;
  provider_account_email: string | null;
  staff_id: number | null;
  staff_name: string | null;
  target_calendar_id: string;
  sync_direction: SyncDirection;
  show_client_names: boolean;
  status: "active" | "reauth_required" | "disabled" | "error";
  last_synced_at: string | null;
  last_error: string | null;
  channel_expires_at: string | null;
  created_at: string;
}

interface StaffLite {
  id: number;
  name: string;
}

const DIRECTION_LABELS: Record<SyncDirection, { en: string; vi: string; es: string; fr: string }> = {
  both: { en: "Two-way", vi: "Hai chiều", es: "Bidireccional", fr: "Bidirectionnel" },
  outbound: { en: "Push only (Certxa → calendar)", vi: "Chỉ đẩy đi", es: "Solo enviar", fr: "Envoi seul" },
  inbound: { en: "Pull only (calendar → Certxa)", vi: "Chỉ kéo về", es: "Solo recibir", fr: "Réception seule" },
};

export default function CalendarSyncSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { pick } = useLanguage();

  const [connectStaffId, setConnectStaffId] = useState<string>("store");
  const [connectDirection, setConnectDirection] = useState<SyncDirection>("both");
  const [connecting, setConnecting] = useState(false);

  // ── OAuth round-trip feedback (?connected=google / ?error=...) ──────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) {
      toast({ title: pick({ en: "Calendar connected", vi: "Đã kết nối lịch", es: "Calendario conectado", fr: "Agenda connecté" }) });
    } else if (error) {
      toast({
        variant: "destructive",
        title: pick({ en: "Couldn't connect the calendar", vi: "Không thể kết nối lịch", es: "No se pudo conectar el calendario", fr: "Connexion à l'agenda impossible" }),
        description: error.replace(/_/g, " "),
      });
    }
    if (connected || error) {
      window.history.replaceState({}, "", window.location.pathname);
      qc.invalidateQueries({ queryKey: ["/api/calendar-sync/connections"] });
    }
  }, [toast, pick, qc]);

  const { data, isLoading } = useQuery<{ connections: CalendarConnection[] }>({
    queryKey: ["/api/calendar-sync/connections"],
  });
  const connections = data?.connections ?? [];

  const { data: staffList = [] } = useQuery<StaffLite[]>({ queryKey: ["/api/staff"] });

  const takenStaffIds = useMemo(
    () => new Set(connections.filter((c) => c.staff_id != null).map((c) => c.staff_id)),
    [connections],
  );
  const hasStoreConnection = connections.some((c) => c.staff_id == null);

  async function startConnect() {
    setConnecting(true);
    try {
      const qs = new URLSearchParams({ direction: connectDirection });
      if (connectStaffId !== "store") qs.set("staffId", connectStaffId);
      const res = await apiRequest("GET", `/api/calendar-sync/google/start?${qs.toString()}`);
      const { url } = await res.json();
      if (!url) throw new Error("no url");
      window.location.href = url; // hand off to Google's consent screen
    } catch {
      setConnecting(false);
      toast({
        variant: "destructive",
        title: pick({ en: "Couldn't start Google sign-in", vi: "Không thể bắt đầu đăng nhập Google", es: "No se pudo iniciar el acceso con Google", fr: "Impossible de démarrer la connexion Google" }),
      });
    }
  }

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/calendar-sync/connections/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/calendar-sync/connections"] }),
    onError: () =>
      toast({ variant: "destructive", title: pick({ en: "Update failed", vi: "Cập nhật thất bại", es: "Error al actualizar", fr: "Échec de la mise à jour" }) }),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/calendar-sync/connections/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/calendar-sync/connections"] });
      toast({ title: pick({ en: "Calendar disconnected", vi: "Đã ngắt kết nối lịch", es: "Calendario desconectado", fr: "Agenda déconnecté" }) });
    },
    onError: () =>
      toast({ variant: "destructive", title: pick({ en: "Disconnect failed", vi: "Ngắt kết nối thất bại", es: "Error al desconectar", fr: "Échec de la déconnexion" }) }),
  });

  const dirLabel = (d: SyncDirection) => pick(DIRECTION_LABELS[d]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-100 text-violet-600">
              <CalendarDays className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-semibold">
              {pick({ en: "Calendar Sync", vi: "Đồng bộ lịch", es: "Sincronización de calendario", fr: "Synchronisation d'agenda" })}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {pick({
              en: "Mirror bookings to a technician's Google Calendar and block Certxa slots when they have a personal event. Changes sync both ways within a minute or two.",
              vi: "Đồng bộ lịch hẹn sang Google Calendar của thợ và chặn khung giờ Certxa khi họ có lịch cá nhân. Thay đổi đồng bộ hai chiều trong vài phút.",
              es: "Refleja las reservas en el Google Calendar del técnico y bloquea horarios en Certxa cuando tienen un evento personal. Los cambios se sincronizan en ambos sentidos en uno o dos minutos.",
              fr: "Reflète les réservations dans le Google Agenda d'un technicien et bloque les créneaux Certxa lors d'un événement personnel. Synchronisation bidirectionnelle en une à deux minutes.",
            })}
          </p>
        </header>

        {/* ── Connect a new calendar ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {pick({ en: "Connect a calendar", vi: "Kết nối lịch", es: "Conectar un calendario", fr: "Connecter un agenda" })}
            </CardTitle>
            <CardDescription>
              {pick({
                en: "Sign in with the Google account whose calendar you want to sync.",
                vi: "Đăng nhập bằng tài khoản Google có lịch bạn muốn đồng bộ.",
                es: "Inicia sesión con la cuenta de Google cuyo calendario quieres sincronizar.",
                fr: "Connectez-vous avec le compte Google dont vous voulez synchroniser l'agenda.",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {pick({ en: "Calendar owner", vi: "Chủ lịch", es: "Propietario", fr: "Propriétaire" })}
                </label>
                <Select value={connectStaffId} onValueChange={setConnectStaffId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store" disabled={hasStoreConnection}>
                      {pick({ en: "Store-wide", vi: "Toàn cửa hàng", es: "Toda la tienda", fr: "Tout l'établissement" })}
                    </SelectItem>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)} disabled={takenStaffIds.has(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {pick({ en: "Direction", vi: "Chiều", es: "Dirección", fr: "Sens" })}
                </label>
                <Select value={connectDirection} onValueChange={(v) => setConnectDirection(v as SyncDirection)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">{dirLabel("both")}</SelectItem>
                    <SelectItem value="outbound">{dirLabel("outbound")}</SelectItem>
                    <SelectItem value="inbound">{dirLabel("inbound")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={startConnect} disabled={connecting}>
              {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}
              {pick({ en: "Connect Google Calendar", vi: "Kết nối Google Calendar", es: "Conectar Google Calendar", fr: "Connecter Google Agenda" })}
            </Button>
          </CardContent>
        </Card>

        {/* ── Existing connections ───────────────────────────────────────────── */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : connections.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {pick({ en: "No calendars connected yet.", vi: "Chưa có lịch nào được kết nối.", es: "Aún no hay calendarios conectados.", fr: "Aucun agenda connecté pour l'instant." })}
          </p>
        ) : (
          <div className="space-y-3">
            {connections.map((c) => (
              <Card key={c.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-medium">
                        {c.staff_name ??
                          pick({ en: "Store-wide", vi: "Toàn cửa hàng", es: "Toda la tienda", fr: "Tout l'établissement" })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.provider_account_email ?? "Google Calendar"}
                      </div>
                    </div>
                    {c.status === "reauth_required" ? (
                      <Badge variant="destructive" className="gap-1">
                        <TriangleAlert className="h-3 w-3" />
                        {pick({ en: "Reconnect needed", vi: "Cần kết nối lại", es: "Reconexión necesaria", fr: "Reconnexion requise" })}
                      </Badge>
                    ) : c.status === "active" ? (
                      <Badge variant="secondary">
                        {pick({ en: "Active", vi: "Đang hoạt động", es: "Activo", fr: "Actif" })}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{c.status}</Badge>
                    )}
                  </div>

                  {c.status === "reauth_required" && (
                    <div className="flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <span>
                        {pick({
                          en: "Google revoked access. Reconnect to resume syncing.",
                          vi: "Google đã thu hồi quyền. Kết nối lại để tiếp tục đồng bộ.",
                          es: "Google revocó el acceso. Reconecta para reanudar la sincronización.",
                          fr: "Google a révoqué l'accès. Reconnectez-vous pour reprendre la synchronisation.",
                        })}
                      </span>
                      <Button size="sm" variant="outline" onClick={startConnect}>
                        <RefreshCw className="mr-1.5 h-3 w-3" />
                        {pick({ en: "Reconnect", vi: "Kết nối lại", es: "Reconectar", fr: "Reconnecter" })}
                      </Button>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {pick({ en: "Direction", vi: "Chiều", es: "Dirección", fr: "Sens" })}
                      </label>
                      <Select
                        value={c.sync_direction}
                        onValueChange={(v) => patchMutation.mutate({ id: c.id, body: { syncDirection: v } })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="both">{dirLabel("both")}</SelectItem>
                          <SelectItem value="outbound">{dirLabel("outbound")}</SelectItem>
                          <SelectItem value="inbound">{dirLabel("inbound")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end justify-between gap-2 rounded-md border px-3 py-2">
                      <div className="text-xs">
                        <div className="font-medium">
                          {pick({ en: "Show client names", vi: "Hiện tên khách", es: "Mostrar nombres", fr: "Afficher les noms" })}
                        </div>
                        <div className="text-muted-foreground">
                          {pick({ en: "Off = events show as \"Busy\"", vi: "Tắt = hiển thị \"Bận\"", es: "Off = aparece como \"Ocupado\"", fr: "Off = affiché \"Occupé\"" })}
                        </div>
                      </div>
                      <Switch
                        checked={c.show_client_names}
                        onCheckedChange={(v) => patchMutation.mutate({ id: c.id, body: { showClientNames: v } })}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">
                      {c.last_synced_at
                        ? pick({ en: "Last synced ", vi: "Đồng bộ lần cuối ", es: "Última sinc. ", fr: "Dernière synchro " }) +
                          new Date(c.last_synced_at).toLocaleString()
                        : pick({ en: "Not synced yet", vi: "Chưa đồng bộ", es: "Sin sincronizar", fr: "Pas encore synchronisé" })}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={disconnectMutation.isPending}
                      onClick={() => disconnectMutation.mutate(c.id)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {pick({ en: "Disconnect", vi: "Ngắt kết nối", es: "Desconectar", fr: "Déconnecter" })}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
