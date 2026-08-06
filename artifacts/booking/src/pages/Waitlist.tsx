import { useState } from "react";
import { formatPhoneInput } from "@/lib/utils";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Clock, Plus, Bell, CheckCircle, XCircle, Users, Trash2 } from "lucide-react";
import { format } from "date-fns";

type WaitlistEntry = {
  id: number;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  status: string;
  notes?: string;
  preferredDate?: string;
  preferredTimeStart?: string;
  preferredTimeEnd?: string;
  createdAt: string;
  notifiedAt?: string;
  service?: { name: string } | null;
  staff?: { name: string } | null;
};

const statusColors: Record<string, string> = {
  waiting: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  notified: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  booked: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function Waitlist() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    preferredDate: "",
    preferredTimeStart: "",
    preferredTimeEnd: "",
    notes: "",
  });

  const { data: entries = [], isLoading } = useQuery<WaitlistEntry[]>({
    queryKey: ["/api/waitlist"],
    enabled: !!selectedStore,
  });

  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["/api/services"],
    enabled: !!selectedStore,
  });

  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ["/api/staff"],
    enabled: !!selectedStore,
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/waitlist", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/waitlist"] });
      setShowAdd(false);
      setForm({ customerName: "", customerPhone: "", customerEmail: "", preferredDate: "", preferredTimeStart: "", preferredTimeEnd: "", notes: "" });
      toast({ title: "Added to waitlist" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PUT", `/api/waitlist/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/waitlist"] });
      toast({ title: "Waitlist entry updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/waitlist/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/waitlist"] });
      toast({ title: "Entry removed" });
    },
  });

  const handleSubmit = (): void => {
    if (!form.customerName.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    addMutation.mutate({ ...form, storeId: selectedStore?.id });
  };

  const { pick } = useLanguage();
  const t = {
    title:    pick({ en: "Waitlist",    vi: "Danh sách chờ",  es: "Lista de espera",   fr: "Liste d'attente" }),
    subtitle: pick({ en: "Manage clients waiting for availability", vi: "Quản lý khách hàng đang chờ lịch trống", es: "Gestiona clientes esperando disponibilidad", fr: "Gérez les clients en attente de disponibilité" }),
    addBtn:   pick({ en: "Add to Waitlist",    vi: "Thêm vào danh sách",  es: "Agregar a lista",    fr: "Ajouter à la liste" }),
    waiting:   pick({ en: "Waiting",   vi: "Đang chờ",    es: "Esperando",  fr: "En attente" }),
    notified:  pick({ en: "Notified",  vi: "Đã thông báo", es: "Notificado", fr: "Notifié" }),
    booked:    pick({ en: "Booked",    vi: "Đã đặt lịch",  es: "Reservado",  fr: "Réservé" }),
    cancelled: pick({ en: "Cancelled", vi: "Đã hủy",        es: "Cancelado",  fr: "Annulé" }),
    all:       pick({ en: "All",       vi: "Tất cả",        es: "Todos",      fr: "Tous" }),
    loading:   pick({ en: "Loading...", vi: "Đang tải...",  es: "Cargando...", fr: "Chargement..." }),
    empty:     pick({ en: "No waitlist entries yet",                vi: "Chưa có mục nào trong danh sách chờ", es: "Sin entradas en lista de espera aún",    fr: "Aucune entrée dans la liste d'attente" }),
    addFirst:  pick({ en: "Add First Entry",   vi: "Thêm mục đầu tiên",  es: "Agregar primera entrada",  fr: "Ajouter la première entrée" }),
    notify:    pick({ en: "Notify",    vi: "Thông báo",  es: "Notificar",  fr: "Notifier" }),
    bookedBtn: pick({ en: "Booked",    vi: "Đã đặt",     es: "Reservado",  fr: "Réservé" }),
    cancelBtn: pick({ en: "Cancel",    vi: "Hủy",        es: "Cancelar",   fr: "Annuler" }),
    fullName:  pick({ en: "Full Name *",       vi: "Họ và tên *",       es: "Nombre completo *",  fr: "Nom complet *" }),
    phone:     pick({ en: "Phone",     vi: "Số điện thoại", es: "Teléfono",  fr: "Téléphone" }),
    email:     "Email",
    prefDate:  pick({ en: "Preferred Date",    vi: "Ngày ưu tiên",      es: "Fecha preferida",    fr: "Date préférée" }),
    prefTime:  pick({ en: "Preferred Time",    vi: "Giờ ưu tiên",       es: "Hora preferida",     fr: "Heure préférée" }),
    notes:     pick({ en: "Notes",     vi: "Ghi chú",    es: "Notas",      fr: "Notes" }),
    cancel:    pick({ en: "Cancel",    vi: "Hủy",        es: "Cancelar",   fr: "Annuler" }),
    adding:    pick({ en: "Adding...", vi: "Đang thêm...", es: "Agregando...", fr: "Ajout..." }),
    preferred: pick({ en: "Preferred:", vi: "Ưu tiên:",  es: "Preferido:", fr: "Préféré :" }),
    added:     pick({ en: "Added",     vi: "Đã thêm",    es: "Agregado",   fr: "Ajouté" }),
  };
  const filterLabels: Record<string, string> = {
    all: t.all, waiting: t.waiting, notified: t.notified, booked: t.booked, cancelled: t.cancelled,
  };

  const filtered = entries.filter(e => filterStatus === "all" || e.status === filterStatus);

  const statusCounts = entries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t.title}</h1>
            <p className="text-muted-foreground">{t.subtitle}</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t.addBtn}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: t.waiting,   count: statusCounts.waiting || 0, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950" },
            { label: t.notified,  count: statusCounts.notified || 0, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950" },
            { label: t.booked,    count: statusCounts.booked || 0, color: "text-green-500", bg: "bg-green-50 dark:bg-green-950" },
            { label: t.cancelled, count: statusCounts.cancelled || 0, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter */}
        <div className="flex gap-2 flex-wrap">
          {["all", "waiting", "notified", "booked", "cancelled"].map(s => (
            <Button
              key={s}
              variant={filterStatus === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(s)}
            >
              {filterLabels[s] ?? s}
            </Button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">{t.loading}</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{t.empty}</p>
              <Button className="mt-4" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t.addFirst}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(entry => (
              <Card key={entry.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{entry.customerName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[entry.status] || ""}`}>
                          {entry.status}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        {entry.customerPhone && <div>📞 {entry.customerPhone}</div>}
                        {entry.customerEmail && <div>✉ {entry.customerEmail}</div>}
                        {entry.service && <div>💇 {entry.service.name}</div>}
                        {entry.staff && <div>👤 {entry.staff.name}</div>}
                        {entry.preferredDate && (
                          <div>📅 {t.preferred} {format(new Date(entry.preferredDate), "MMM d, yyyy")}
                            {entry.preferredTimeStart && ` ${entry.preferredTimeStart}`}
                            {entry.preferredTimeEnd && ` – ${entry.preferredTimeEnd}`}
                          </div>
                        )}
                        {entry.notes && <div className="italic">"{entry.notes}"</div>}
                        <div className="text-xs">{t.added} {format(new Date(entry.createdAt), "MMM d, yyyy")}</div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                      {entry.status === "waiting" && (
                        <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: entry.id, status: "notified", notifiedAt: new Date().toISOString() })}>
                          <Bell className="h-3 w-3 mr-1" />
                          {t.notify}
                        </Button>
                      )}
                      {(entry.status === "waiting" || entry.status === "notified") && (
                        <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: entry.id, status: "booked" })}>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {t.bookedBtn}
                        </Button>
                      )}
                      {entry.status !== "cancelled" && entry.status !== "booked" && (
                        <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: entry.id, status: "cancelled" })}>
                          <XCircle className="h-3 w-3 mr-1" />
                          {t.cancelBtn}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(entry.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.addBtn}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>{t.fullName}</Label>
                <Input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Client name" />
              </div>
              <div>
                <Label>{t.phone}</Label>
                <Input value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: formatPhoneInput(e.target.value) }))} placeholder="(555) 000-0000" />
              </div>
              <div>
                <Label>{t.email}</Label>
                <Input value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} placeholder="email@example.com" />
              </div>
              <div>
                <Label>{t.prefDate}</Label>
                <Input type="date" value={form.preferredDate} onChange={e => setForm(f => ({ ...f, preferredDate: e.target.value }))} />
              </div>
              <div>
                <Label>{t.prefTime}</Label>
                <div className="flex gap-1">
                  <Input type="time" value={form.preferredTimeStart} onChange={e => setForm(f => ({ ...f, preferredTimeStart: e.target.value }))} />
                  <Input type="time" value={form.preferredTimeEnd} onChange={e => setForm(f => ({ ...f, preferredTimeEnd: e.target.value }))} />
                </div>
              </div>
              <div className="col-span-2">
                <Label>{t.notes}</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any special requests..." rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>{t.cancel}</Button>
            <Button onClick={handleSubmit} disabled={addMutation.isPending}>
              {addMutation.isPending ? t.adding : t.addBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
